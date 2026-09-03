import type { Request, Response } from 'express';
import * as dc from '../services/dataCapture.service';
import { getUserById } from '../services/auth.service';
import { logAudit } from '../services/auditLog.service';

// req.user only carries { id, role } — fetch the current name for attribution.
// Best-effort: a lookup failure should never block the action.
async function actorFrom(req: Request): Promise<dc.Actor | undefined> {
  if (!req.user) return undefined;
  try {
    const u = await getUserById(req.user.id);
    return { id: u.id, name: u.name };
  } catch {
    return undefined;
  }
}

// ---- Subjects ----

export async function listSubjects(req: Request, res: Response): Promise<void> {
  res.json({ items: await dc.listSubjects(String(req.params.studyId)) });
}

export async function createSubject(req: Request, res: Response): Promise<void> {
  const subject = await dc.createSubject(String(req.params.studyId), req.body.subjectCode, await actorFrom(req));
  res.status(201).json({ subject });
}

export async function getSubject(req: Request, res: Response): Promise<void> {
  res.json({ subject: await dc.getSubject(String(req.params.id)) });
}

export async function updateSubject(req: Request, res: Response): Promise<void> {
  res.json({ subject: await dc.updateSubject(String(req.params.id), req.body) });
}

// ---- Visit instances ----

export async function listVisitInstances(req: Request, res: Response): Promise<void> {
  res.json({ items: await dc.listVisitInstances(String(req.params.id)) });
}

export async function createVisitInstance(req: Request, res: Response): Promise<void> {
  const visit = await dc.createVisitInstance(String(req.params.id), req.body.visitId, await actorFrom(req));
  res.status(201).json({ visit });
}

export async function updateVisitInstance(req: Request, res: Response): Promise<void> {
  res.json({ visit: await dc.updateVisitInstance(String(req.params.visitInstanceId), req.body) });
}

// ---- Form submissions ----

export async function getFormSubmission(req: Request, res: Response): Promise<void> {
  const submission = await dc.getOrCreateFormSubmission(String(req.params.visitInstanceId), String(req.params.formId), await actorFrom(req));
  res.json({ submission });
}

export async function addRecord(req: Request, res: Response): Promise<void> {
  const actor = await actorFrom(req);
  const submission = await dc.addRecord(String(req.params.submissionId));
  const newest = submission.records[submission.records.length - 1];
  void logAudit({ studyId: String(submission.studyId), entityType: 'form-submission-record', entityId: newest.id, action: 'created', actor, summary: `Added a record to ${submission.formName}` });
  res.status(201).json({ submission });
}

export async function deleteRecord(req: Request, res: Response): Promise<void> {
  const actor = await actorFrom(req);
  const recordId = String(req.params.recordId);
  const submission = await dc.deleteRecord(String(req.params.submissionId), recordId);
  void logAudit({ studyId: String(submission.studyId), entityType: 'form-submission-record', entityId: recordId, action: 'removed', actor, summary: `Removed a record from ${submission.formName}` });
  res.json({ submission });
}

export async function updateRecordValues(req: Request, res: Response): Promise<void> {
  const actor = await actorFrom(req);
  const recordId = String(req.params.recordId);
  const { submission, before, after } = await dc.updateRecordValues(String(req.params.submissionId), recordId, req.body.values ?? {});
  void logAudit({ studyId: String(submission.studyId), entityType: 'form-submission-record', entityId: recordId, action: 'updated', before, after, actor, summary: `Updated values on ${submission.formName}` });
  res.json({ submission });
}

export async function submitRecord(req: Request, res: Response): Promise<void> {
  const actor = await actorFrom(req);
  if (!actor) { res.status(401).json({ error: 'Not authenticated.' }); return; }
  const submission = await dc.submitRecord(String(req.params.submissionId), String(req.params.recordId), actor);
  void logAudit({ studyId: String(submission.studyId), entityType: 'form-submission-record', entityId: String(req.params.recordId), action: 'submitted', actor, summary: `Submitted a record on ${submission.formName}` });
  res.json({ submission });
}

export async function signRecord(req: Request, res: Response): Promise<void> {
  const actor = await actorFrom(req);
  if (!actor) { res.status(401).json({ error: 'Not authenticated.' }); return; }
  const submission = await dc.signRecord(String(req.params.submissionId), String(req.params.recordId), actor);
  void logAudit({ studyId: String(submission.studyId), entityType: 'form-submission-record', entityId: String(req.params.recordId), action: 'signed', actor, summary: `Signed a record on ${submission.formName}` });
  res.json({ submission });
}
