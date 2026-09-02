import type { Request, Response } from 'express';
import { buildStudyFromDocuments, regenerateFormContent } from '../services/pipeline/buildPipeline';
import { reviewStudyForms } from '../services/pipeline/reviewPass';
import { applyTemplate } from '../services/pipeline/templateApply';
import { applyScreeningOrder, addGeneralSections } from '../services/pipeline/generalSections';
import { retrieveSimilar, buildMemoryContext } from '../services/memory.service';
import { loadLearnedPreferences } from '../services/editMemory.service';
import { buildQuestionsContext } from '../services/pipeline/questionsContext';
import { planModeFieldDirectives } from '../services/pipeline/prompts';
import { createJob, getJob, completeJob, completeJobResult, failJob, updateJob } from '../services/buildJobs';
import { HttpError } from '../middleware/errorHandler';
import type { TemplatePreferences, IngestedDocument, StudyModel } from '../types/study';

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

    // Stash the corpus on the job so the follow-up "form testing" review can reuse
    // it (and the finished study) without the client re-uploading either.
    updateJob(jobId, { protocolText: String(protocolText ?? '') });

    // A template's free-text instructions + selected Plan-Mode questions flow
    // straight into the build prompt, merged with any per-build custom instructions.
    const opts = { ...(options ?? {}) };
    const extra = [
      prefs?.instructions && String(prefs.instructions).trim(),
      buildQuestionsContext(prefs?.questions),
      planModeFieldDirectives(prefs),
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

    // Stream live phase/progress/tree onto the job as the staged build runs.
    let study = await buildStudyFromDocuments(protocolText, documents ?? [], opts, memoryContext, learned,
      (u) => updateJob(jobId, { phase: u.phase, progress: u.progress, partial: u.tree ?? undefined }));

    // Finalize. Screening ordering and General Sections are no longer user-facing
    // toggles (Plan Mode asks only the five questions in the design) — both are
    // prescribed by the source-document methodology, so they always run.
    updateJob(jobId, { phase: 'Finalizing', progress: 96 });
    if (prefs) study = applyTemplate(study, prefs);
    study = applyScreeningOrder(study);
    study = addGeneralSections(study);

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
  res.json({ status: job.status, study: job.study, result: job.result, memoryUsed: job.memoryUsed, error: job.error, phase: job.phase, progress: job.progress, partial: job.partial });
}

interface ReviewRequestBody {
  /** Completed build job to review — its study + corpus are reused from memory. */
  buildJobId?: string;
  /** Fallback when the build job has expired (or for an already-saved study). */
  study?: StudyModel;
  protocolText?: string;
}

// "Form testing" pass — a second AI review of every generated form against the
// eCRF/Protocol. Runs as its own background job (one call per unique form, so it
// far outlasts a proxy timeout) and is BEST-EFFORT: any failure completes the job
// with the study exactly as built, so a QA hiccup can never lose a build.
async function runReview(jobId: string, body: ReviewRequestBody): Promise<void> {
  let study: StudyModel | undefined;
  try {
    const source = body.buildJobId ? getJob(body.buildJobId) : undefined;
    study = body.study ?? source?.study;
    const corpus = body.protocolText ?? source?.protocolText ?? '';
    if (!study) throw new HttpError(404, 'Build not found (it may have expired). Please rebuild.');

    updateJob(jobId, { phase: 'Testing the forms', progress: 1 });
    const learned = await loadLearnedPreferences();
    const reviewed = await reviewStudyForms(study, corpus, learned,
      (u) => updateJob(jobId, { phase: u.phase, progress: u.progress }));

    completeJob(jobId, reviewed, 0);
  } catch (err) {
    // Never fail the user's build over the QA pass — hand back what we have.
    if (study) completeJob(jobId, study, 0);
    else failJob(jobId, err instanceof Error ? err.message : 'Review failed.');
  }
}

export async function reviewStudy(req: Request, res: Response): Promise<void> {
  const job = createJob();
  void runReview(job.id, req.body as ReviewRequestBody);
  res.status(202).json({ jobId: job.id });
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
