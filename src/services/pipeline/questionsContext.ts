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

// Serialize selected Plan-Mode questions into a prompt block: field-style
// questions become required fields; "preference" questions become directives.
export function buildQuestionsContext(questions?: TemplateQuestion[]): string {
  if (!questions?.length) return '';
  const prefs = questions.filter((q) => q.answerType === 'preference');
  const fields = questions.filter((q) => q.answerType !== 'preference');
  const lines: string[] = [];
  if (fields.length) {
    lines.push('Ensure the relevant forms (especially the Visit / Date-of-Visit form) include these questions as fields, using the given answer format:');
    for (const q of fields) lines.push(`- ${q.text} — answer: ${answerLabel(q)}`);
  }
  if (prefs.length) {
    lines.push('Honor these site/company preferences when designing the forms, fields, and rules:');
    for (const q of prefs) lines.push(`- ${q.text}`);
  }
  return '\n\nPLAN-MODE QUESTIONS & PREFERENCES (incorporate into the build):\n' + lines.join('\n');
}
