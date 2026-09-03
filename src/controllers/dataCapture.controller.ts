import type { Request, Response } from 'express';
import * as dc from '../services/dataCapture.service';
import { getUserById } from '../services/auth.service';

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
  res.status(201).json({ submission: await dc.addRecord(String(req.params.submissionId)) });
}

export async function deleteRecord(req: Request, res: Response): Promise<void> {
  res.json({ submission: await dc.deleteRecord(String(req.params.submissionId), String(req.params.recordId)) });
}

export async function updateRecordValues(req: Request, res: Response): Promise<void> {
  const { submission } = await dc.updateRecordValues(String(req.params.submissionId), String(req.params.recordId), req.body.values ?? {});
  res.json({ submission });
}

export async function submitRecord(req: Request, res: Response): Promise<void> {
  const actor = await actorFrom(req);
  if (!actor) { res.status(401).json({ error: 'Not authenticated.' }); return; }
  res.json({ submission: await dc.submitRecord(String(req.params.submissionId), String(req.params.recordId), actor) });
}

export async function signRecord(req: Request, res: Response): Promise<void> {
  const actor = await actorFrom(req);
  if (!actor) { res.status(401).json({ error: 'Not authenticated.' }); return; }
  res.json({ submission: await dc.signRecord(String(req.params.submissionId), String(req.params.recordId), actor) });
}
