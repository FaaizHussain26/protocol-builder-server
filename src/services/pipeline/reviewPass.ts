import type { StudyModel, StudyForm, StudyField, FieldType } from '../../types/study';
import { callModel } from './azureClient';
import { REVIEW_SYSTEM_PROMPT, sourceDocFieldGuidance } from './prompts';
import { excerptFor, mapPool, norm, ENRICH_CONCURRENCY } from './excerpt';
import { normalizeFields, type RawForm } from './normalize';
import { universalRulesFor } from './universalRules';
import { learnedPrefsContext } from '../editMemory.service';

// "Form testing" pass — a second AI review of each already-built form against the
// eCRF + Protocol, repairing what the single-shot enrichment missed. It may ADD
// missing fields and PATCH wrong/incomplete ones; it can NEVER delete, because the
// model returns a delta that is only ever applied on top of the existing fields.

export type ReviewProgressFn = (u: { phase: string; progress: number }) => void;

interface FieldPatch {
  matchLabel?: string;
  type?: string | null;
  required?: boolean | null;
  options?: string[] | null;
  section?: string | null;
  expression?: string | null;
  completionGuidance?: string | null;
  footnote?: string | null;
}
export interface ReviewDelta {
  addFields?: RawForm['fields'];
  patchFields?: FieldPatch[];
}

const FIELD_TYPES = new Set<string>([
  'text', 'textarea', 'number', 'integer', 'decimal', 'date', 'datetime', 'time',
  'select', 'multiselect', 'radio', 'checkbox', 'yesno', 'signature', 'file', 'calculated',
]);

// Keep the rendered "current fields" block bounded so a very large form can't
// crowd out the source excerpt in the prompt.
const MAX_RENDERED_FIELDS = 150;

function renderCurrentFields(form: StudyForm): string {
  const shown = form.fields.slice(0, MAX_RENDERED_FIELDS);
  const lines = shown.map((f, i) => {
    const bits = [`${i + 1}. ${f.label}`, `[${f.type}]`];
    if (f.required) bits.push('(required)');
    if (f.section) bits.push(`{section: ${f.section}}`);
    if (f.options?.length) bits.push(`options: ${f.options.slice(0, 25).join(' | ')}`);
    return bits.join(' ');
  });
  if (form.fields.length > shown.length) lines.push(`… (+${form.fields.length - shown.length} more fields)`);
  return lines.join('\n') || '(this form currently has NO fields)';
}

// Ask the model what is missing/wrong in one form. Best-effort: any failure
// (including an Azure content filter) yields an empty delta so the form is left
// exactly as built.
async function reviewOneForm(form: StudyForm, corpus: string, studyTitle: string, learned: Map<string, string[]>): Promise<ReviewDelta> {
  const excerpt = corpus ? excerptFor(corpus, form.name) : '';
  if (!excerpt.trim()) return {};
  const user =
    `STUDY: ${studyTitle}\n` +
    `FORM UNDER REVIEW: "${form.name}"${form.description ? ` — ${form.description}` : ''}\n\n` +
    `===== CURRENT FIELDS IN THIS FORM =====\n${renderCurrentFields(form)}\n` +
    universalRulesFor(form.name) +
    sourceDocFieldGuidance(form.name) +
    learnedPrefsContext(learned, form.name) +
    `\n\n===== SOURCE EXCERPTS =====\n${excerpt}`;
  try {
    const r = (await callModel(REVIEW_SYSTEM_PROMPT, user)) as ReviewDelta;
    return { addFields: r.addFields ?? [], patchFields: r.patchFields ?? [] };
  } catch {
    return {};
  }
}

// Apply a delta to ONE form instance. Fields are normalized per instance so every
// replicated copy gets FRESH ids — sharing ids across copies is the bug where
// editing one form mutates another (see arms.ts cloneForm).
function applyDelta(form: StudyForm, delta: ReviewDelta): StudyForm {
  const existing = new Set(form.fields.map((f) => norm(f.label)));

  // ---- patches: match an existing field by label, apply only supplied keys ----
  const patches = new Map<string, FieldPatch>();
  for (const p of delta.patchFields ?? []) {
    const key = norm(p.matchLabel);
    if (key && existing.has(key)) patches.set(key, p);
  }
  let fields = form.fields.map((f): StudyField => {
    const p = patches.get(norm(f.label));
    if (!p) return f;
    const next: StudyField = { ...f };
    if (p.type && FIELD_TYPES.has(p.type)) next.type = p.type as FieldType;
    if (typeof p.required === 'boolean') next.required = p.required;
    if (p.options?.length) next.options = p.options;
    if (p.section?.trim()) next.section = p.section.trim();
    if (p.expression?.trim()) next.expression = p.expression.trim();
    if (p.completionGuidance?.trim()) next.completionGuidance = p.completionGuidance.trim();
    if (p.footnote?.trim()) next.footnote = p.footnote.trim();
    return next;
  });

  // ---- additions: only labels the form doesn't already have ----
  const fresh = (delta.addFields ?? []).filter((f) => {
    const key = norm(f?.label);
    if (!key || existing.has(key)) return false;
    existing.add(key); // also de-dupes within the returned list
    return true;
  });
  if (fresh.length) fields = [...fields, ...normalizeFields(fresh)];

  return fields === form.fields ? form : { ...form, fields };
}

// Deterministic pre-screen: which forms are worth a QA call.
//
// Re-reading a form's source excerpt costs ~4k tokens, and enrichment already spent
// that once — so re-checking EVERY form doubles the build's token bill and pushes
// against the deployment's tokens-per-minute quota. Only forms that actually look
// thin or malformed get a second look.
const VERBATIM_SOURCE = /eligibility criteria \(verbatim\)/i;
const STUB_SOURCE = /standard (section|arm section)/i;
// Form types whose source-document design REQUIRES an upload and/or a sign-off.
const NEEDS_UPLOAD = /lab|ecg|electrocardiogram|imaging|scan|consent|progress note/i;
const NEEDS_SIGNATURE = /consent|ecg|ecog|physical exam|disposition|visit completion/i;

export function needsReview(form: StudyForm): { review: boolean; why: string } {
  const n = form.fields.length;
  // The eligibility form is built verbatim from the protocol — never let the AI
  // paraphrase, renumber, or "improve" those criteria.
  if (form.fields.some((f) => VERBATIM_SOURCE.test(f.source ?? ''))) return { review: false, why: 'verbatim (protected)' };
  if (n === 0) return { review: true, why: 'empty' };
  if (form.fields.every((f) => STUB_SOURCE.test(f.source ?? ''))) return { review: true, why: 'stub' };
  if (n <= 5) return { review: true, why: `thin (${n} fields)` };
  if (n > 8 && form.fields.every((f) => !f.section?.trim())) return { review: true, why: 'no sections' };
  if (form.fields.some((f) => f.confidence === 'low')) return { review: true, why: 'low-confidence field' };
  if (NEEDS_UPLOAD.test(form.name) && !form.fields.some((f) => f.type === 'file')) return { review: true, why: 'missing upload' };
  if (NEEDS_SIGNATURE.test(form.name) && !form.fields.some((f) => f.type === 'signature')) return { review: true, why: 'missing signature' };
  return { review: false, why: 'looks complete' };
}

// Review every UNIQUE form once (a master form replicated across the Unscheduled /
// SAE / ET / EOS arms costs a single call) and apply each delta to every copy.
export async function reviewStudyForms(
  study: StudyModel,
  corpus: string,
  learned: Map<string, string[]> = new Map(),
  onProgress: ReviewProgressFn = () => {},
): Promise<StudyModel> {
  const unique = new Map<string, StudyForm>();
  for (const v of study.visits)
    for (const f of v.forms) {
      const key = norm(f.name);
      // Keep the richest instance as the representative so the model sees the
      // fullest picture of what already exists.
      const prev = unique.get(key);
      if (key && (!prev || f.fields.length > prev.fields.length)) unique.set(key, f);
    }

  // Only send the forms that actually look incomplete.
  const selected = [...unique.entries()].filter(([, form]) => needsReview(form).review);
  const total = selected.length;
  if (!total) return study;

  const deltas = new Map<string, ReviewDelta>();
  let done = 0;
  onProgress({ phase: `Testing forms (0/${total})`, progress: 2 });
  await mapPool(selected, ENRICH_CONCURRENCY, async ([key, form]) => {
    const delta = await reviewOneForm(form, corpus, study.studyTitle, learned);
    if ((delta.addFields?.length ?? 0) || (delta.patchFields?.length ?? 0)) deltas.set(key, delta);
    done += 1;
    onProgress({ phase: `Testing forms (${done}/${total})`, progress: 2 + Math.round(96 * done / total) });
  });

  return applyDeltas(study, deltas);
}

// Map each form-name delta onto EVERY instance of that form across the study, so a
// master form replicated into the Unscheduled / SAE / ET / EOS arms is repaired in
// all of its copies (each with its own fresh field ids). Pure — separated from the
// AI calls above so it can be exercised directly.
export function applyDeltas(study: StudyModel, deltas: Map<string, ReviewDelta>): StudyModel {
  if (!deltas.size) return study;
  return {
    ...study,
    visits: study.visits.map((v) => ({
      ...v,
      forms: v.forms.map((f) => {
        const delta = deltas.get(norm(f.name));
        return delta ? applyDelta(f, delta) : f;
      }),
    })),
  };
}
