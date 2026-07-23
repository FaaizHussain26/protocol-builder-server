import type { StudyModel, BuildOptions, IngestedDocument } from '../../types/study';
import { DEFAULT_OPTIONS } from '../../types/study';
import { callModel } from './azureClient';
import { SKELETON_SYSTEM_PROMPT, ENRICH_SYSTEM_PROMPT, ENRICH_SYSTEM_PROMPT_SAFE, ELIGIBILITY_SYSTEM_PROMPT, enrichDetailLine } from './prompts';
import { skeletonInput, eligibilityInput, excerptFor, mapPool, norm, MAX_CONTEXT_CHARS, ENRICH_CONCURRENCY } from './excerpt';
import { normalizeStudy, normalizeFields, normalizeRules, type RawStudy, type RawForm } from './normalize';
import { universalRulesFor, universalSkeletonRules } from './universalRules';
import { masterForms, scaffoldFixedArms, eosFolders } from './arms';
import { learnedPrefsContext } from '../editMemory.service';

// A lightweight live view of the study tree, streamed to the UI during a build.
export interface BuildTreeRow { arm: string; folder: string; kind: string; forms: { name: string; fieldCount: number }[] }
export interface BuildProgressUpdate { phase: string; progress: number; tree?: BuildTreeRow[] }
export type ProgressFn = (u: BuildProgressUpdate) => void;

type LooseVisit = { arm?: string; name?: string; kind?: string; forms?: Array<{ name?: string; fields?: unknown[] }> };
function liveTree(visits: LooseVisit[] | undefined): BuildTreeRow[] {
  return (visits ?? []).map((v) => ({
    arm: v.arm ?? 'Study Visit',
    folder: v.name ?? '',
    kind: v.kind === 'log' ? 'log' : 'visit',
    forms: (v.forms ?? []).map((f) => ({ name: f.name ?? '', fieldCount: (f.fields ?? []).length })),
  }));
}

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

// Staged, streaming build. Stages: (1) structure (skeleton, no fields),
// (2) fields (per-unique-form enrichment, streamed as each completes),
// (3) eligibility (parallel, protocol-only), (4) replicate master forms into the
// fixed arms, (5) return. `onProgress` fires between/within stages so the
// controller can push live phase/progress/tree onto the job for the UI to poll.
export async function buildStudyFromDocuments(
  protocolText: string,
  documents: IngestedDocument[],
  options: BuildOptions = {},
  memoryContext = '',
  learned: Map<string, string[]> = new Map(),
  onProgress: ProgressFn = () => {},
): Promise<StudyModel> {
  const o = { ...DEFAULT_OPTIONS, ...options };
  const corpus = protocolText.length > MAX_CONTEXT_CHARS ? protocolText.slice(0, MAX_CONTEXT_CHARS) : protocolText;
  const customLine = o.customInstructions.trim()
    ? `\n\nUser custom instructions (follow closely):\n${o.customInstructions.trim()}`
    : '';

  // Eligibility runs in parallel with structure+fields (protocol-only pass).
  const eligP = extractEligibility(corpus);

  // ---- Stage 1: structure (visit/log schedule + form NAMES; no fields). ----
  onProgress({ phase: 'Reading the protocol structure', progress: 6 });
  const skeleton = (await callModel(
    SKELETON_SYSTEM_PROMPT + universalSkeletonRules() + customLine + memoryContext,
    `Extract the study structure — the COMPLETE visit/log schedule from the SOA, plus the form names collected at each visit — from the following source document(s):\n\n${skeletonInput(corpus)}`,
  )) as RawStudy;
  for (const v of skeleton.visits ?? []) v.arm = 'Study Visit';
  onProgress({ phase: 'Structure ready — building forms', progress: 15, tree: liveTree(skeleton.visits) });

  // ---- Stage 2: enrich each UNIQUE form once; stream as each completes. ----
  const uniqueForms = new Map<string, RawForm>();
  for (const v of skeleton.visits ?? [])
    for (const f of v.forms ?? []) {
      const key = norm(f.name);
      if (key && !uniqueForms.has(key)) uniqueForms.set(key, f);
    }
  const total = uniqueForms.size || 1;
  let done = 0;
  const detailLine = enrichDetailLine(o);
  await mapPool([...uniqueForms.values()], ENRICH_CONCURRENCY, async (form) => {
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
    let fields: RawForm['fields'] = [];
    let rules: RawForm['rules'] = [];
    try {
      const r = await callEnrich(user, safeUser);
      fields = r.fields ?? [];
      rules = r.rules ?? [];
    } catch { /* leave this form empty; normalize will drop it */ }
    // Attach to every visit that collects this form, then stream the update.
    const key = norm(form.name);
    for (const v of skeleton.visits ?? [])
      for (const f of v.forms ?? [])
        if (norm(f.name) === key) { f.fields = fields; f.rules = rules; }
    done += 1;
    onProgress({ phase: `Building fields (${done}/${total} forms)`, progress: 15 + Math.round(55 * done / total), tree: liveTree(skeleton.visits) });
  });

  // ---- Stage 3: eligibility (already running; surface it as its own phase). ----
  onProgress({ phase: 'Extracting eligibility (I/E) criteria', progress: 74, tree: liveTree(skeleton.visits) });
  const eligibility = await eligP;
  if ((eligibility?.length ?? 0) >= (skeleton.eligibility?.length ?? 0)) skeleton.eligibility = eligibility;

  // Normalize the Study-Visit arm (drops forms that failed enrichment).
  const base = normalizeStudy(skeleton, documents);

  // ---- Stage 4: replicate the master forms into the fixed arms. ----
  onProgress({ phase: 'Creating arms & folders', progress: 84 });
  const master = masterForms(base.visits);
  base.visits = [...base.visits, ...eosFolders(master, 'Study Visit'), ...scaffoldFixedArms(master)];
  onProgress({ phase: 'Arms created', progress: 92, tree: liveTree(base.visits) });

  return base;
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
