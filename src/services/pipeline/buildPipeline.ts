import type { StudyModel, BuildOptions, IngestedDocument } from '../../types/study';
import { DEFAULT_OPTIONS } from '../../types/study';
import { callModel } from './azureClient';
import { SKELETON_SYSTEM_PROMPT, ENRICH_SYSTEM_PROMPT, ENRICH_SYSTEM_PROMPT_SAFE, ELIGIBILITY_SYSTEM_PROMPT, enrichDetailLine } from './prompts';
import { skeletonInput, eligibilityInput, excerptFor, mapPool, norm, MAX_CONTEXT_CHARS, ENRICH_CONCURRENCY } from './excerpt';
import { normalizeStudy, normalizeFields, normalizeRules, type RawStudy, type RawForm } from './normalize';
import { universalRulesFor, universalSkeletonRules } from './universalRules';
import { learnedPrefsContext } from '../editMemory.service';

// Enrich one form. If Azure's content filter flags the rich, instruction-heavy
// prompt as a jailbreak, retry once with a neutral prompt (form context +
// excerpt only) that returns the same JSON shape.
async function callEnrich(fullUser: string, safeUser: string): Promise<RawForm> {
  try {
    return (await callModel(ENRICH_SYSTEM_PROMPT, fullUser)) as RawForm;
  } catch (err) {
    if ((err as { contentFilter?: boolean })?.contentFilter) {
      return (await callModel(ENRICH_SYSTEM_PROMPT_SAFE, safeUser)) as RawForm;
    }
    throw err;
  }
}

// Dedicated, protocol-only eligibility extraction. Best-effort: returns [] on
// failure so a hiccup here never blocks the build.
async function extractEligibility(corpus: string): Promise<RawStudy['eligibility']> {
  try {
    const r = (await callModel(
      ELIGIBILITY_SYSTEM_PROMPT,
      `Extract EVERY inclusion and exclusion criterion from the protocol below.\n\n${eligibilityInput(corpus)}`,
    )) as { eligibility?: RawStudy['eligibility'] };
    return r.eligibility ?? [];
  } catch {
    return [];
  }
}

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
  // memoryContext (similar prior builds) is appended so the model "remembers".
  // In PARALLEL: a dedicated eligibility pass reads ONLY the protocol (no
  // template/memory), so inclusion/exclusion criteria are always extracted
  // straight from the protocol and never crowded out by the skeleton prompt. ----
  const [skeleton, eligibility] = await Promise.all([
    callModel(
      SKELETON_SYSTEM_PROMPT + universalSkeletonRules() + customLine + memoryContext,
      `Extract the study structure — the COMPLETE visit/log schedule from the SOA, plus the form names collected at each visit — from the following source document(s):\n\n${skeletonInput(corpus)}`,
    ) as Promise<RawStudy>,
    extractEligibility(corpus),
  ]);

  // The protocol is authoritative for eligibility: prefer the dedicated pass
  // whenever it found at least as many criteria as the skeleton did.
  if ((eligibility?.length ?? 0) >= (skeleton.eligibility?.length ?? 0)) {
    skeleton.eligibility = eligibility;
  }

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
    const excerpt = excerptFor(corpus, form.name);
    const user =
      `STUDY: ${skeleton.studyTitle ?? ''}${skeleton.indication ? ` — ${skeleton.indication}` : ''}. ${detailLine}\n` +
      `TARGET FORM: "${form.name}"${form.description ? ` — ${form.description}` : ''}.${customLine}\n\n` +
      `Build the complete, sectioned field list for THIS form only, using the document excerpts below.` +
      universalRulesFor(form.name) +
      learnedPrefsContext(learned, form.name) +
      `\n\n===== SOURCE EXCERPTS =====\n${excerpt}`;
    const safeUser =
      `Form: "${form.name}"${form.description ? ` (${form.description})` : ''}. Study: ${skeleton.studyTitle ?? ''}.\n` +
      `List the data-entry fields for this form based on the source text below.\n\n${excerpt}`;
    try {
      const r = await callEnrich(user, safeUser);
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
  const excerpt = corpus ? excerptFor(corpus, args.formName) : '(no source text supplied — design from the form name and instructions)';
  const user =
    `STUDY: ${args.studyTitle ?? ''}${args.indication ? ` — ${args.indication}` : ''}. ${detailLine}\n` +
    `TARGET FORM: "${args.formName}"${args.formDescription ? ` — ${args.formDescription}` : ''}.${promptLine}\n\n` +
    `Build the complete, sectioned field list for THIS form only, using the document excerpts below.` +
    universalRulesFor(args.formName) +
    learnedPrefsContext(args.learned ?? new Map(), args.formName) +
    `\n\n===== SOURCE EXCERPTS =====\n${excerpt}`;
  const safeUser =
    `Form: "${args.formName}"${args.formDescription ? ` (${args.formDescription})` : ''}. Study: ${args.studyTitle ?? ''}.\n` +
    `List the data-entry fields for this form based on the source text below.\n\n${excerpt}`;

  const r = await callEnrich(user, safeUser);
  return { fields: normalizeFields(r.fields), rules: normalizeRules(r.rules) };
}
