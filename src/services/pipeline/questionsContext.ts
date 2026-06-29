import type { TemplateQuestion } from '../../types/study';

function answerLabel(q: TemplateQuestion): string {
  switch (q.answerType) {
    case 'yesno': return 'Yes/No';
    case 'date': return 'date (DD-MM-YYYY)';
    case 'time': return '24-hour time';
    case 'dropdown': return `dropdown${q.options?.length ? ` (${q.options.join(', ')})` : ''}`;
    case 'textarea': return 'multi-line text';
    case 'number': return 'number';
    default: return 'text';
  }
}

// Universal-rule questions (id prefix "u-") are already injected per-form by
// universalRules.ts. Here we only need to carry through user EDITS to them —
// i.e. a universal rule the user flipped to "No" — plus any non-universal
// (custom or visit) questions selected in the template.
const isUniversal = (q: TemplateQuestion): boolean => q.id.startsWith('u-');

// Serialize selected Plan-Mode questions into a prompt block: field-style
// questions become required fields; "preference" questions become directives;
// yes/no questions become rule directives carrying their answer.
export function buildQuestionsContext(questions?: TemplateQuestion[]): string {
  if (!questions?.length) return '';

  // Universal rules already in the prompt — emit only the "No" (disabled) overrides.
  const overrides = questions.filter((q) => isUniversal(q) && q.answer === 'no');
  const rest = questions.filter((q) => !isUniversal(q));

  const prefs = rest.filter((q) => q.answerType === 'preference');
  const yesno = rest.filter((q) => q.answerType === 'yesno');
  const fields = rest.filter((q) => q.answerType !== 'preference' && q.answerType !== 'yesno');

  const lines: string[] = [];
  if (overrides.length) {
    lines.push('Disable these universal rules for this build (override to No):');
    for (const q of overrides) lines.push(`- ${q.text}`);
  }
  if (yesno.length) {
    lines.push('Apply these rules using the given answer:');
    for (const q of yesno) lines.push(`- ${q.text} — ${q.answer === 'no' ? 'No' : 'Yes'}`);
  }
  if (fields.length) {
    lines.push('Ensure the relevant forms (especially the Visit / Date-of-Visit form) include these questions as fields, using the given answer format:');
    for (const q of fields) lines.push(`- ${q.text} — answer: ${answerLabel(q)}`);
  }
  if (prefs.length) {
    lines.push('Honor these site/company preferences when designing the forms, fields, and rules:');
    for (const q of prefs) lines.push(`- ${q.text}`);
  }
  if (!lines.length) return '';
  return '\n\nPLAN-MODE QUESTIONS & PREFERENCES (incorporate into the build):\n' + lines.join('\n');
}
