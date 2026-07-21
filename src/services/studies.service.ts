import { StudyDoc } from '../models/Study.model';
import { isMongoConnected, dbUnavailableMessage } from '../config/db';
import { HttpError } from '../middleware/errorHandler';
import { embed, studyEmbeddingText, EMBED_MODEL } from './embeddings.service';
import { recordFieldEdits } from './editMemory.service';
import type { StudyModel } from '../types/study';

function ensureDb(): void {
  if (!isMongoConnected()) {
    throw new HttpError(503, `Persistence unavailable: ${dbUnavailableMessage()}`);
  }
}

interface StudySummary {
  id: string;
  studyTitle: string;
  protocolNumber?: string;
  phase?: string;
  status: string;
  updatedAt: string;
  visitCount: number;
  fieldCount: number;
  approvedFieldCount: number;
  deletedAt?: string;
}

function countVisitsFields(visits: any[]): { visitCount: number; fieldCount: number; approvedFieldCount: number } {
  let fieldCount = 0, approvedFieldCount = 0;
  for (const v of visits ?? []) {
    for (const f of v.forms ?? []) {
      fieldCount += (f.fields ?? []).length;
      approvedFieldCount += (f.fields ?? []).filter((x: any) => x?.reviewStatus === 'accepted').length;
    }
  }
  return { visitCount: (visits ?? []).length, fieldCount, approvedFieldCount };
}

// Strip persistence-only keys so we save just the domain study payload.
function studyPayload(study: Partial<StudyModel> & Record<string, unknown>) {
  const { id: _id, ...rest } = study;
  void _id;
  return rest;
}

// Attach a freshly computed embedding (best-effort — null when embeddings are
// unavailable, in which case the study still saves without a vector).
async function withEmbedding(payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const text = studyEmbeddingText(payload as Partial<StudyModel>);
  const vec = await embed(text);
  if (vec) {
    return { ...payload, embedding: vec, embeddingModel: EMBED_MODEL, embeddingText: text, embeddingUpdatedAt: new Date() };
  }
  return payload;
}

export async function listStudies(): Promise<StudySummary[]> {
  ensureDb();
  // Project summary fields only — never the (potentially huge) visits tree.
  // Active studies only ({deletedAt: null} also matches docs with no such field).
  const docs = await StudyDoc.find({ deletedAt: null }, { studyTitle: 1, protocolNumber: 1, phase: 1, status: 1, visitCount: 1, fieldCount: 1, approvedFieldCount: 1, updatedAt: 1 })
    .sort({ updatedAt: -1 })
    .lean();
  return docs.map(toSummary);
}

// Trashed (soft-deleted) studies, most-recently-deleted first.
export async function listTrash(): Promise<StudySummary[]> {
  ensureDb();
  const docs = await StudyDoc.find({ deletedAt: { $ne: null } }, { studyTitle: 1, protocolNumber: 1, phase: 1, status: 1, visitCount: 1, fieldCount: 1, approvedFieldCount: 1, updatedAt: 1, deletedAt: 1 })
    .sort({ deletedAt: -1 })
    .lean();
  return docs.map(toSummary);
}

function toSummary(d: any): StudySummary {
  return {
    id: String(d._id),
    studyTitle: d.studyTitle,
    protocolNumber: d.protocolNumber,
    phase: d.phase,
    status: d.status ?? 'draft',
    updatedAt: (d.updatedAt instanceof Date ? d.updatedAt : new Date(d.updatedAt)).toISOString(),
    visitCount: d.visitCount ?? 0,
    fieldCount: d.fieldCount ?? 0,
    approvedFieldCount: d.approvedFieldCount ?? 0,
    deletedAt: d.deletedAt ? (d.deletedAt instanceof Date ? d.deletedAt : new Date(d.deletedAt)).toISOString() : undefined,
  };
}

export async function getStudy(id: string): Promise<StudyModel> {
  ensureDb();
  const doc = await StudyDoc.findById(id);
  if (!doc) throw new HttpError(404, 'Study not found.');
  return doc.toJSON() as unknown as StudyModel;
}

export async function createStudy(study: Partial<StudyModel> & Record<string, unknown>): Promise<StudyModel> {
  ensureDb();
  const base = studyPayload(study);
  const doc = await StudyDoc.create(await withEmbedding({ ...base, ...countVisitsFields(base.visits as any[]) }));
  // Learn from user-edited fields (fire-and-forget; failures only log).
  void recordFieldEdits(base as Partial<StudyModel>, String(doc._id));
  return doc.toJSON() as unknown as StudyModel;
}

export async function updateStudy(id: string, study: Partial<StudyModel> & Record<string, unknown>): Promise<StudyModel> {
  ensureDb();
  const base = studyPayload(study);
  const doc = await StudyDoc.findByIdAndUpdate(id, await withEmbedding({ ...base, ...countVisitsFields(base.visits as any[]) }), { new: true, overwrite: true });
  if (!doc) throw new HttpError(404, 'Study not found.');
  void recordFieldEdits(base as Partial<StudyModel>, id);
  return doc.toJSON() as unknown as StudyModel;
}

// Soft delete: move the study to Trash (recoverable). The list endpoint hides
// trashed studies; permanentlyDeleteStudy removes them for good.
export async function deleteStudy(id: string): Promise<void> {
  ensureDb();
  const doc = await StudyDoc.findByIdAndUpdate(id, { deletedAt: new Date() });
  if (!doc) throw new HttpError(404, 'Study not found.');
}

// Restore a trashed study back to the active list.
export async function restoreStudy(id: string): Promise<void> {
  ensureDb();
  const doc = await StudyDoc.findByIdAndUpdate(id, { deletedAt: null });
  if (!doc) throw new HttpError(404, 'Study not found.');
}

// Permanently remove a study (used from Trash).
export async function permanentlyDeleteStudy(id: string): Promise<void> {
  ensureDb();
  const doc = await StudyDoc.findByIdAndDelete(id);
  if (!doc) throw new HttpError(404, 'Study not found.');
}
