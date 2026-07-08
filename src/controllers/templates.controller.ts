import type { Request, Response } from 'express';
import * as templates from '../services/templates.service';
import { analyzeEsourceDocument } from '../services/pipeline/analyzeEsource';
import { createJob, getJob, completeJobResult, failJob } from '../services/buildJobs';
import { HttpError } from '../middleware/errorHandler';

export async function list(_req: Request, res: Response): Promise<void> {
  res.json({ items: await templates.listTemplates() });
}

export async function getOne(req: Request, res: Response): Promise<void> {
  res.json({ template: await templates.getTemplate(String(req.params.id)) });
}

export async function create(req: Request, res: Response): Promise<void> {
  res.status(201).json({ template: await templates.createTemplate(req.body) });
}

export async function update(req: Request, res: Response): Promise<void> {
  res.json({ template: await templates.updateTemplate(String(req.params.id), req.body) });
}

export async function remove(req: Request, res: Response): Promise<void> {
  await templates.deleteTemplate(String(req.params.id));
  res.json({ ok: true });
}

// ---- eSource → template analysis (async job, same pattern as /api/build) ----

// The Azure call can run past a hosting proxy's connection timeout, so the
// request returns a job id immediately and the client polls for the analysis.
export async function analyzeEsource(req: Request, res: Response): Promise<void> {
  const { esourceText, fileName } = req.body as { esourceText: string; fileName?: string };
  const job = createJob();
  void (async () => {
    try {
      completeJobResult(job.id, await analyzeEsourceDocument(esourceText, fileName));
    } catch (err) {
      failJob(job.id, err instanceof Error ? err.message : 'eSource analysis failed.');
    }
  })();
  res.status(202).json({ jobId: job.id });
}

export async function getAnalyzeStatus(req: Request, res: Response): Promise<void> {
  const job = getJob(String(req.params.jobId));
  if (!job) throw new HttpError(404, 'Analysis job not found (it may have expired). Upload again.');
  res.json({ status: job.status, analysis: job.result, error: job.error });
}
