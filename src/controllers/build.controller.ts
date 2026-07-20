import type { Request, Response } from 'express';
import { buildStudyFromDocuments, regenerateFormContent } from '../services/pipeline/buildPipeline';
import { applyTemplate } from '../services/pipeline/templateApply';
import { applyScreeningOrder, addGeneralSections } from '../services/pipeline/generalSections';
import { retrieveSimilar, buildMemoryContext } from '../services/memory.service';
import { loadLearnedPreferences } from '../services/editMemory.service';
import { buildQuestionsContext } from '../services/pipeline/questionsContext';
import { createJob, getJob, completeJob, completeJobResult, failJob } from '../services/buildJobs';
import { HttpError } from '../middleware/errorHandler';
import type { TemplatePreferences, IngestedDocument } from '../types/study';

interface BuildRequestBody {
  protocolText: string;
  documents?: IngestedDocument[];
  options?: { customInstructions?: string };
  templatePreferences?: TemplatePreferences;
}

// The actual pipeline. Runs in the background (see buildStudy) and records its
// result/error on the job — it must never throw so the process can't crash.
async function runBuild(jobId: string, body: BuildRequestBody): Promise<void> {
  try {
    const { protocolText, documents, options, templatePreferences } = body;
    const prefs = templatePreferences;

    // A template's free-text instructions + selected Plan-Mode questions flow
    // straight into the build prompt, merged with any per-build custom instructions.
    const opts = { ...(options ?? {}) };
    const extra = [
      prefs?.instructions && String(prefs.instructions).trim(),
      buildQuestionsContext(prefs?.questions),
    ].filter(Boolean).join('\n');
    if (extra) {
      opts.customInstructions = [opts.customInstructions, extra].filter(Boolean).join('\n');
    }

    // Phase 3: retrieve similar prior builds + learned field corrections
    // (both best-effort; empty without Mongo/index).
    const [memory, learned] = await Promise.all([
      retrieveSimilar(String(protocolText).slice(0, 4000), 3),
      loadLearnedPreferences(),
    ]);
    const memoryContext = buildMemoryContext(memory);

    let study = await buildStudyFromDocuments(protocolText, documents ?? [], opts, memoryContext, learned);

    // Phase 2: apply template preferences (date/time formats, signature, alerts),
    // then optional Screening ordering and General Sections.
    if (prefs) {
      study = applyTemplate(study, prefs);
      if (prefs.screeningOrder) study = applyScreeningOrder(study);
      if (prefs.generalSections) study = addGeneralSections(study);
    }

    completeJob(jobId, study, memory.length);
  } catch (err) {
    failJob(jobId, err instanceof Error ? err.message : 'Build failed.');
  }
}

// Start a build job and return its id immediately. The long-running pipeline
// runs in the background so the HTTP request returns well within any proxy
// timeout; the client polls getBuildStatus until the study is ready.
export async function buildStudy(req: Request, res: Response): Promise<void> {
  const job = createJob();
  void runBuild(job.id, req.body as BuildRequestBody);
  res.status(202).json({ jobId: job.id });
}

// Poll the status/result of a build or regenerate job.
export async function getBuildStatus(req: Request, res: Response): Promise<void> {
  const job = getJob(String(req.params.jobId));
  if (!job) throw new HttpError(404, 'Job not found (it may have expired). Please try again.');
  res.json({ status: job.status, study: job.study, result: job.result, memoryUsed: job.memoryUsed, error: job.error });
}

// Regenerating a form makes a full enrichment call, which can outlast a hosting
// proxy's request timeout — so it runs as a background job like the build.
async function runRegenerate(jobId: string, body: Record<string, unknown>): Promise<void> {
  try {
    const result = await regenerateFormContent({
      formName: String(body.formName ?? ''),
      formDescription: body.formDescription as string | undefined,
      studyTitle: body.studyTitle as string | undefined,
      indication: body.indication as string | undefined,
      protocolText: (body.protocolText as string | undefined) ?? '',
      prompt: body.prompt as string | undefined,
      options: body.options as never,
      learned: await loadLearnedPreferences(),
    });
    completeJobResult(jobId, result);
  } catch (err) {
    failJob(jobId, err instanceof Error ? err.message : 'Regenerate failed.');
  }
}

export async function regenerateForm(req: Request, res: Response): Promise<void> {
  const job = createJob();
  void runRegenerate(job.id, req.body as Record<string, unknown>);
  res.status(202).json({ jobId: job.id });
}
