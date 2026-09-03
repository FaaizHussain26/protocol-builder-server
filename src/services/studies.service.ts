import { StudyDoc } from '../models/Study.model';
import { isMongoConnected, dbUnavailableMessage } from '../config/db';
import { HttpError } from '../middleware/errorHandler';
import { embed, studyEmbeddingText, EMBED_MODEL } from './embeddings.service';
import { recordFieldEdits } from './editMemory.service';
import { logAudit, type AuditActor } from './auditLog.service';
import type { StudyModel } from '../types/study';

// ---- Phase 4: audit the study-DEFINITION (build) changes an update makes ----
// Flatten every field across every visit/form into a lookup by field id, since
// that's the granularity the audit trail tracks (not whole-visit/form diffs).
interface FlatField { label?: string; type?: string; required?: boolean; options?: string[]; formName?: string }
function flattenFields(visits: any[] | undefined): Map<string, FlatField> {
  const map = new Map<string, FlatField>();
  for (const v of visits ?? []) {
    for (const f of v.forms ?? []) {
      for (const fl of f.fields ?? []) {
        map.set(fl.id, { label: fl.label, type: fl.type, required: fl.required, options: fl.options, formName: f.name });
      }
    }
  }
  return map;
}

const TRACKED_KEYS: (keyof FlatField)[] = ['label', 'type', 'required', 'options'];
function fieldChanged(a: FlatField, b: FlatField): boolean {
  return TRACKED_KEYS.some((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k]));
}

// Fire-and-forget: diff old vs. new field definitions and log one audit entry
// per field that was added, removed, or changed.
function auditStudyFieldDiff(studyId: string, before: any[] | undefined, after: any[] | undefined, actor?: AuditActor): void {
  const beforeMap = flattenFields(before);
  const afterMap = flattenFields(after);
  for (const [fieldId, next] of afterMap) {
    const prev = beforeMap.get(fieldId);
    if (!prev) {
      void logAudit({ studyId, entityType: 'field', entityId: fieldId, action: 'added', after: next, actor, summary: `Added field "${next.label}" to ${next.formName}` });
    } else if (fieldChanged(prev, next)) {
      void logAudit({ studyId, entityType: 'field', entityId: fieldId, action: 'updated', before: prev, after: next, actor, summary: `Updated field "${next.label ?? prev.label}" in ${next.formName ?? prev.formName}` });
    }
  }
  for (const [fieldId, prev] of beforeMap) {
    if (!afterMap.has(fieldId)) {
      void logAudit({ studyId, entityType: 'field', entityId: fieldId, action: 'removed', before: prev, actor, summary: `Removed field "${prev.label}" from ${prev.formName}` });
    }
  }
}

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
  createdAt: string;
  updatedAt: string;
  visitCount: number;
  formCount: number;
  fieldCount: number;
  approvedFieldCount: number;
  /** Fields still pending review with low AI confidence — surfaced as "flagged". */
  flaggedFieldCount: number;
  /** Unresolved blocker-severity intelligence findings. */
  openBlockerCount: number;
  deletedAt?: string;
}

function countVisitsFields(visits: any[], findings: any[]): {
  visitCount: number; formCount: number; fieldCount: number; approvedFieldCount: number;
  flaggedFieldCount: number; openBlockerCount: number;
} {
  let formCount = 0, fieldCount = 0, approvedFieldCount = 0, flaggedFieldCount = 0;
  for (const v of visits ?? []) {
    for (const f of v.forms ?? []) {
      formCount += 1;
      fieldCount += (f.fields ?? []).length;
      for (const x of f.fields ?? []) {
        if (x?.reviewStatus === 'accepted') approvedFieldCount += 1;
        if (x?.reviewStatus === 'pending' && x?.confidence === 'low') flaggedFieldCount += 1;
      }
    }
  }
  const openBlockerCount = (findings ?? []).filter((x: any) => x?.severity === 'blocker' && !x?.resolved).length;
  return { visitCount: (visits ?? []).length, formCount, fieldCount, approvedFieldCount, flaggedFieldCount, openBlockerCount };
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
  const docs = await StudyDoc.find({ deletedAt: null }, { studyTitle: 1, protocolNumber: 1, phase: 1, status: 1, visitCount: 1, formCount: 1, fieldCount: 1, approvedFieldCount: 1, flaggedFieldCount: 1, openBlockerCount: 1, updatedAt: 1, createdAt: 1 })
    .sort({ updatedAt: -1 })
    .lean();
  return docs.map(toSummary);
}

// Trashed (soft-deleted) studies, most-recently-deleted first.
export async function listTrash(): Promise<StudySummary[]> {
  ensureDb();
  const docs = await StudyDoc.find({ deletedAt: { $ne: null } }, { studyTitle: 1, protocolNumber: 1, phase: 1, status: 1, visitCount: 1, formCount: 1, fieldCount: 1, approvedFieldCount: 1, flaggedFieldCount: 1, openBlockerCount: 1, updatedAt: 1, createdAt: 1, deletedAt: 1 })
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
    createdAt: (d.createdAt ? (d.createdAt instanceof Date ? d.createdAt : new Date(d.createdAt)) : (d.updatedAt instanceof Date ? d.updatedAt : new Date(d.updatedAt))).toISOString(),
    visitCount: d.visitCount ?? 0,
    formCount: d.formCount ?? 0,
    fieldCount: d.fieldCount ?? 0,
    approvedFieldCount: d.approvedFieldCount ?? 0,
    flaggedFieldCount: d.flaggedFieldCount ?? 0,
    openBlockerCount: d.openBlockerCount ?? 0,
    deletedAt: d.deletedAt ? (d.deletedAt instanceof Date ? d.deletedAt : new Date(d.deletedAt)).toISOString() : undefined,
  };
}

export async function getStudy(id: string): Promise<StudyModel> {
  ensureDb();
  const doc = await StudyDoc.findById(id);
  if (!doc) throw new HttpError(404, 'Study not found.');
  return doc.toJSON() as unknown as StudyModel;
}

// The authenticated actor behind a create/update — stamped onto the document
// so a study always shows who created/last touched it, and so Phase 4's audit
// trail has a "who" to read.
export interface Actor { id: string; name: string }

export async function createStudy(study: Partial<StudyModel> & Record<string, unknown>, actor?: Actor): Promise<StudyModel> {
  ensureDb();
  const base = studyPayload(study);
  const doc = await StudyDoc.create(await withEmbedding({
    ...base, ...countVisitsFields(base.visits as any[], base.findings as any[]),
    createdBy: actor, updatedBy: actor,
  }));
  // Learn from user-edited fields (fire-and-forget; failures only log).
  void recordFieldEdits(base as Partial<StudyModel>, String(doc._id));
  return doc.toJSON() as unknown as StudyModel;
}

export async function updateStudy(id: string, study: Partial<StudyModel> & Record<string, unknown>, actor?: Actor): Promise<StudyModel> {
  ensureDb();
  const base = studyPayload(study);
  // overwrite:true replaces the WHOLE document, so createdBy must be carried
  // forward explicitly or it would be wiped on every save. Fetch visits too —
  // diffed against the incoming payload for the audit trail before it's gone.
  const existing = await StudyDoc.findById(id, { createdBy: 1, visits: 1 });
  if (!existing) throw new HttpError(404, 'Study not found.');
  const doc = await StudyDoc.findByIdAndUpdate(id, await withEmbedding({
    ...base, ...countVisitsFields(base.visits as any[], base.findings as any[]),
    createdBy: existing.get('createdBy') ?? actor, updatedBy: actor,
  }), { new: true, overwrite: true });
  if (!doc) throw new HttpError(404, 'Study not found.');
  void recordFieldEdits(base as Partial<StudyModel>, id);
  auditStudyFieldDiff(id, existing.get('visits') as any[], base.visits as any[], actor);
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
