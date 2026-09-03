import { randomUUID } from 'crypto';
import { StudyDoc } from '../models/Study.model';
import { SubjectDoc } from '../models/Subject.model';
import { VisitInstanceDoc } from '../models/VisitInstance.model';
import { FormSubmissionDoc } from '../models/FormSubmission.model';
import { isMongoConnected, dbUnavailableMessage } from '../config/db';
import { HttpError } from '../middleware/errorHandler';

function ensureDb(): void {
  if (!isMongoConnected()) throw new HttpError(503, `Persistence unavailable: ${dbUnavailableMessage()}`);
}

export interface Actor { id: string; name: string }

// ---- Subjects ----

export async function listSubjects(studyId: string) {
  ensureDb();
  const docs = await SubjectDoc.find({ studyId }).sort({ subjectCode: 1 });
  return docs.map((d) => d.toJSON());
}

export async function createSubject(studyId: string, subjectCode: string, actor?: Actor) {
  ensureDb();
  if (!(await StudyDoc.exists({ _id: studyId }))) throw new HttpError(404, 'Study not found.');
  const existing = await SubjectDoc.findOne({ studyId, subjectCode: subjectCode.trim() });
  if (existing) throw new HttpError(409, `Subject "${subjectCode}" already exists in this study.`);
  const doc = await SubjectDoc.create({ studyId, subjectCode: subjectCode.trim(), createdBy: actor });
  return doc.toJSON();
}

export async function getSubject(id: string) {
  ensureDb();
  const doc = await SubjectDoc.findById(id);
  if (!doc) throw new HttpError(404, 'Subject not found.');
  const visits = await VisitInstanceDoc.find({ subjectId: id }).sort({ createdAt: 1 });
  return { ...doc.toJSON(), visits: visits.map((v) => v.toJSON()) };
}

export async function updateSubject(id: string, patch: { status?: string }) {
  ensureDb();
  const doc = await SubjectDoc.findByIdAndUpdate(id, patch, { new: true });
  if (!doc) throw new HttpError(404, 'Subject not found.');
  return doc.toJSON();
}

// ---- Visit instances ----

// Find one visit definition by id inside a study's embedded (Mixed) visits tree.
async function findStudyVisit(studyId: string, visitId: string): Promise<{ name: string; arm?: string; forms: any[] }> {
  const study = await StudyDoc.findById(studyId, { visits: 1 });
  if (!study) throw new HttpError(404, 'Study not found.');
  const visit = (study.get('visits') as any[]).find((v) => v.id === visitId);
  if (!visit) throw new HttpError(404, 'Visit not found in this study.');
  return visit;
}

export async function createVisitInstance(subjectId: string, visitId: string, actor?: Actor) {
  ensureDb();
  const subject = await SubjectDoc.findById(subjectId);
  if (!subject) throw new HttpError(404, 'Subject not found.');
  const visit = await findStudyVisit(String(subject.get('studyId')), visitId);
  const doc = await VisitInstanceDoc.create({
    studyId: subject.get('studyId'), subjectId, visitId,
    visitName: visit.name, arm: visit.arm, createdBy: actor,
  });
  return doc.toJSON();
}

export async function listVisitInstances(subjectId: string) {
  ensureDb();
  const docs = await VisitInstanceDoc.find({ subjectId }).sort({ createdAt: 1 });
  return docs.map((d) => d.toJSON());
}

export async function updateVisitInstance(id: string, patch: { status?: string; scheduledDate?: string; completedDate?: string }) {
  ensureDb();
  const doc = await VisitInstanceDoc.findByIdAndUpdate(id, patch, { new: true });
  if (!doc) throw new HttpError(404, 'Visit instance not found.');
  return doc.toJSON();
}

// ---- Form submissions ----

// Find one form definition by id inside a study's embedded (Mixed) visits tree
// (a form can appear on multiple visits once replicated across arms, but the
// definition — name/repeatable — is the same wherever it's found).
async function findStudyForm(studyId: string, formId: string): Promise<{ name: string; repeatable?: boolean }> {
  const study = await StudyDoc.findById(studyId, { visits: 1 });
  if (!study) throw new HttpError(404, 'Study not found.');
  for (const v of study.get('visits') as any[]) {
    const form = (v.forms ?? []).find((f: any) => f.id === formId);
    if (form) return { name: form.name, repeatable: !!form.repeatable };
  }
  throw new HttpError(404, 'Form not found in this study.');
}

// Fetch a visit's submission for a form, creating it (with one blank record for
// a non-repeatable form) on first access.
export async function getOrCreateFormSubmission(visitInstanceId: string, formId: string, actor?: Actor) {
  ensureDb();
  const existing = await FormSubmissionDoc.findOne({ visitInstanceId, formId });
  if (existing) return existing.toJSON();

  const visitInstance = await VisitInstanceDoc.findById(visitInstanceId);
  if (!visitInstance) throw new HttpError(404, 'Visit instance not found.');
  const form = await findStudyForm(String(visitInstance.get('studyId')), formId);

  const doc = await FormSubmissionDoc.create({
    studyId: visitInstance.get('studyId'),
    subjectId: visitInstance.get('subjectId'),
    visitInstanceId,
    formId,
    formName: form.name,
    repeatable: form.repeatable,
    records: form.repeatable ? [] : [{ id: randomUUID(), values: {} }],
  });
  void actor; // creation itself isn't an audited action — the first record edit is
  return doc.toJSON();
}

function findRecord(doc: InstanceType<typeof FormSubmissionDoc>, recordId: string) {
  const records = doc.get('records') as any[];
  const record = records.find((r) => r.id === recordId);
  if (!record) throw new HttpError(404, 'Record not found.');
  return record;
}

export async function addRecord(submissionId: string) {
  ensureDb();
  const doc = await FormSubmissionDoc.findById(submissionId);
  if (!doc) throw new HttpError(404, 'Form submission not found.');
  if (!doc.get('repeatable')) throw new HttpError(400, 'This form is not repeatable — it can only hold one record.');
  const records = doc.get('records') as any[];
  records.push({ id: randomUUID(), values: {} });
  await doc.save();
  return doc.toJSON();
}

export async function deleteRecord(submissionId: string, recordId: string) {
  ensureDb();
  const doc = await FormSubmissionDoc.findById(submissionId);
  if (!doc) throw new HttpError(404, 'Form submission not found.');
  const record = findRecord(doc, recordId);
  if (record.status !== 'in-progress') throw new HttpError(400, 'Only an in-progress record can be deleted.');
  doc.set('records', (doc.get('records') as any[]).filter((r) => r.id !== recordId));
  await doc.save();
  return doc.toJSON();
}

// Autosave: merge new values into a record. Returns the PREVIOUS values too, so
// the caller (controller) can hand both to the Phase 4 audit writer.
export async function updateRecordValues(submissionId: string, recordId: string, values: Record<string, unknown>) {
  ensureDb();
  const doc = await FormSubmissionDoc.findById(submissionId);
  if (!doc) throw new HttpError(404, 'Form submission not found.');
  const record = findRecord(doc, recordId);
  if (record.status === 'signed') throw new HttpError(400, 'This record is signed and locked — it can no longer be edited.');
  const before = { ...record.values };
  record.values = { ...record.values, ...values };
  await doc.save();
  return { submission: doc.toJSON(), before, after: { ...record.values } };
}

export async function submitRecord(submissionId: string, recordId: string, actor: Actor) {
  ensureDb();
  const doc = await FormSubmissionDoc.findById(submissionId);
  if (!doc) throw new HttpError(404, 'Form submission not found.');
  const record = findRecord(doc, recordId);
  if (record.status === 'signed') throw new HttpError(400, 'This record is already signed.');
  record.status = 'submitted';
  record.submittedBy = actor;
  record.submittedAt = new Date();
  await doc.save();
  return doc.toJSON();
}

export async function signRecord(submissionId: string, recordId: string, actor: Actor) {
  ensureDb();
  const doc = await FormSubmissionDoc.findById(submissionId);
  if (!doc) throw new HttpError(404, 'Form submission not found.');
  const record = findRecord(doc, recordId);
  if (record.status !== 'submitted') throw new HttpError(400, 'Only a submitted record can be signed.');
  record.status = 'signed';
  record.signedBy = actor;
  record.signedAt = new Date();
  await doc.save();
  return doc.toJSON();
}
