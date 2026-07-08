import type { StudyModel, BuildOptions, IngestedDocument } from '../../types/study';
import { DEFAULT_OPTIONS } from '../../types/study';
import { callModel } from './azureClient';
import { SKELETON_SYSTEM_PROMPT, ENRICH_SYSTEM_PROMPT, enrichDetailLine } from './prompts';
import { skeletonInput, excerptFor, mapPool, norm, MAX_CONTEXT_CHARS, ENRICH_CONCURRENCY } from './excerpt';
import { normalizeStudy, normalizeFields, normalizeRules, type RawStudy, type RawForm } from './normalize';
import { universalRulesFor, universalSkeletonRules } from './universalRules';
import { learnedPrefsContext } from '../editMemory.service';

// Two-phase build: (A) one big-context call → complete visit/log schedule + form
// names; (B) parallel per-unique-form enrichment → detailed, sectioned fields.
export async function buildStudyFromDocuments(
  protocolText: string,
  documents: IngestedDocument[],
  options: BuildOptions = {},
  memoryContext = '',
  learned: Map<string, string[]> = new Map(),
): Promise<StudyModel> {
  const o = { ...DEFAULT_OPTIONS, ...options };
  const corpus = protocolText.length > MAX_CONTEXT_CHARS ? protocolText.slice(0, MAX_CONTEXT_CHARS) : protocolText;
  const customLine = o.customInstructions.trim()
    ? `\n\nUser custom instructions (follow closely):\n${o.customInstructions.trim()}`
    : '';

  // ---- Phase A: complete visit/log schedule + form names (one call).
  // memoryContext (similar prior builds) is appended so the model "remembers". ----
  const skeleton = (await callModel(
    SKELETON_SYSTEM_PROMPT + universalSkeletonRules() + customLine + memoryContext,
    `Extract the study structure — the COMPLETE visit/log schedule from the SOA, plus the form names collected at each visit — from the following source document(s):\n\n${skeletonInput(corpus)}`,
  )) as RawStudy;

  const visits = skeleton.visits ?? [];

  // ---- Phase B: enrich each UNIQUE form name once, attach to every visit. ----
  const uniqueForms = new Map<string, RawForm>();
  for (const v of visits)
    for (const f of v.forms ?? []) {
      const key = norm(f.name);
      if (key && !uniqueForms.has(key)) uniqueForms.set(key, f);
    }

  const detailLine = enrichDetailLine(o);
  const enriched = await mapPool([...uniqueForms.values()], ENRICH_CONCURRENCY, async (form) => {
    const user =
      `STUDY: ${skeleton.studyTitle ?? ''}${skeleton.indication ? ` — ${skeleton.indication}` : ''}. ${detailLine}\n` +
      `TARGET FORM: "${form.name}"${form.description ? ` — ${form.description}` : ''}.${customLine}\n\n` +
      `Build the complete, sectioned field list for THIS form only, using the document excerpts below.` +
      universalRulesFor(form.name) +
      learnedPrefsContext(learned, form.name) +
      `\n\n===== SOURCE EXCERPTS =====\n${excerptFor(corpus, form.name)}`;
    try {
      const r = await callModel(ENRICH_SYSTEM_PROMPT, user);
      return { key: norm(form.name), fields: r.fields ?? [], rules: r.rules ?? [] };
    } catch {
      return { key: norm(form.name), fields: [] as RawForm['fields'], rules: [] as RawForm['rules'] };
    }
  });
  const byForm = new Map(enriched.map((e) => [e.key, e]));

  for (const v of visits) {
    v.forms = (v.forms ?? []).map((f) => {
      const e = byForm.get(norm(f.name));
      return e ? { ...f, fields: e.fields, rules: e.rules } : f;
    });
  }

  return normalizeStudy(skeleton, documents);
}

// Re-enrich ONE form using an updated per-form prompt. Returns normalized
// fields + rules ready to replace the form's content during review.
export async function regenerateFormContent(args: {
  formName: string;
  formDescription?: string;
  studyTitle?: string;
  indication?: string;
  protocolText: string;
  prompt?: string;
  options?: BuildOptions;
  learned?: Map<string, string[]>;
}): Promise<{ fields: ReturnType<typeof normalizeFields>; rules: ReturnType<typeof normalizeRules> }> {
  const o = { ...DEFAULT_OPTIONS, ...(args.options ?? {}) };
  const corpus = (args.protocolText || '').slice(0, MAX_CONTEXT_CHARS);
  const detailLine = enrichDetailLine(o);
  const promptLine = args.prompt?.trim() ? `\nADDITIONAL INSTRUCTIONS FOR THIS FORM (follow closely): ${args.prompt.trim()}` : '';
  const user =
    `STUDY: ${args.studyTitle ?? ''}${args.indication ? ` — ${args.indication}` : ''}. ${detailLine}\n` +
    `TARGET FORM: "${args.formName}"${args.formDescription ? ` — ${args.formDescription}` : ''}.${promptLine}\n\n` +
    `Build the complete, sectioned field list for THIS form only, using the document excerpts below.` +
    universalRulesFor(args.formName) +
    learnedPrefsContext(args.learned ?? new Map(), args.formName) +
    `\n\n===== SOURCE EXCERPTS =====\n${corpus ? excerptFor(corpus, args.formName) : '(no source text supplied — design from the form name and instructions)'}`;

  const r = (await callModel(ENRICH_SYSTEM_PROMPT, user)) as RawForm;
  return { fields: normalizeFields(r.fields), rules: normalizeRules(r.rules) };
}
