import type { Request, Response } from 'express';
import { buildStudyFromDocuments, regenerateFormContent } from '../services/pipeline/buildPipeline';
import { applyTemplate } from '../services/pipeline/templateApply';
import { applyScreeningOrder, addGeneralSections } from '../services/pipeline/generalSections';
import { retrieveSimilar, buildMemoryContext } from '../services/memory.service';
import { buildQuestionsContext } from '../services/pipeline/questionsContext';
import type { TemplatePreferences } from '../types/study';

export async function buildStudy(req: Request, res: Response): Promise<void> {
  const { protocolText, documents, options, templatePreferences } = req.body;
  const prefs = templatePreferences as TemplatePreferences | undefined;

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

  // Phase 3: retrieve similar prior builds (best-effort; [] without Mongo/index).
  const memory = await retrieveSimilar(String(protocolText).slice(0, 4000), 3);
  const memoryContext = buildMemoryContext(memory);

  let study = await buildStudyFromDocuments(protocolText, documents ?? [], opts, memoryContext);

  // Phase 2: apply template preferences (date/time formats, signature, alerts),
  // then optional Screening ordering and General Sections.
  if (prefs) {
    study = applyTemplate(study, prefs);
    if (prefs.screeningOrder) study = applyScreeningOrder(study);
    if (prefs.generalSections) study = addGeneralSections(study);
  }

  res.json({ study, memoryUsed: memory.length });
}

export async function regenerateForm(req: Request, res: Response): Promise<void> {
  const { formName, formDescription, studyTitle, indication, protocolText, prompt, options } = req.body;
  const result = await regenerateFormContent({
    formName,
    formDescription,
    studyTitle,
    indication,
    protocolText: protocolText ?? '',
    prompt,
    options,
  });
  res.json(result);
}
