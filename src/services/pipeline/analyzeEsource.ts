import type { Confidence, EsourceAnalysis, TemplateQuestion } from '../../types/study';
import { callModel } from './azureClient';
import { MAX_CONTEXT_CHARS } from './excerpt';
import { UNIVERSAL_RULE_GROUPS } from './universalRules';

// ===== Analyze an EXISTING eSource document to seed a preferences template. =====
// One call: detect the site's conventions (preferences), which universal rules
// the eSource contradicts, and preview the forms/fields the AI would generate —
// everything carries a confidence so the reviewer knows what to double-check.

const ANALYZE_SYSTEM_PROMPT = `You are an expert clinical-trial eSource analyst. The user uploads an EXISTING eSource / eCRF build (or its completion guide). Your job is to reverse-engineer the site's build PREFERENCES from it so future AI builds match this site's style, and to preview the forms/fields an AI rebuild would generate.

Analyze the document for:
1. CONVENTIONS — date format actually used (e.g. DD-MMM-YYYY, YYYY-MM-DD), 12h vs 24h time, whether forms end with an (electronic) signature, whether file/document-upload fields appear, whether general log sections exist (Medical History, Allergies, Social History...), and whether Screening forms follow the canonical chronological order (Consent → Demographics → I/E → ...).
2. PREFERENCE STATEMENTS — concrete, reusable style rules evident in the document (e.g. "Every form has a Comments field", "Units are always metric", "AE severity uses CTCAE grades", "Dates of birth capture year only"). Phrase each as a directive. Only include preferences with real evidence in the document.
3. UNIVERSAL RULE OVERRIDES — from the numbered UNIVERSAL RULES list provided, identify ONLY the rules this eSource clearly CONTRADICTS (i.e. the site evidently does NOT follow them). Return their exact ids with answer "no". Do not list rules the document simply doesn't mention.
4. FIELD PREVIEW — the forms this eSource defines, and for each form the fields an AI rebuild would generate (label, best matching type, options for choice fields, required, section).

EVERY question, rule override, and field MUST include a "confidence": "high" (explicit in the document), "medium" (strongly implied), or "low" (a guess worth human review).

Output ONLY valid JSON:
{
  "templateName": "string (short name for this template, from the study/site)",
  "summary": "string (1-2 sentences: what this eSource is and its dominant conventions)",
  "preferences": {
    "dateFormat": "token string like DD-MMM-YYYY, or null if not determinable",
    "timeFormat": "12h | 24h | null",
    "requireSignature": "true | false | null",
    "documentUploadFields": "true | false | null",
    "generalSections": "true | false | null",
    "screeningOrder": "true | false | null"
  },
  "questions": [ { "text": "string (directive)", "answerType": "preference | yesno", "answer": "yes | no (yesno only)", "confidence": "high|medium|low" } ],
  "ruleOverrides": [ { "id": "u-...", "answer": "no", "confidence": "high|medium|low" } ],
  "forms": [ { "name": "string", "fields": [ { "label": "string", "type": "text|textarea|number|integer|decimal|date|datetime|time|select|multiselect|radio|checkbox|yesno|signature|file|calculated", "required": true, "options": ["..."], "section": "string or null", "confidence": "high|medium|low" } ] } ],
  "instructions": "string (a compact free-text block of the style directives, ready to inject into future build prompts)"
}
Return ONLY the JSON object. No markdown, no prose.`;

// The full rule catalogue, numbered by id, so the model can cite exact ids.
function universalRulesCatalogue(): string {
  const lines: string[] = [];
  for (const g of UNIVERSAL_RULE_GROUPS) {
    lines.push(`[${g.group}]`);
    for (const rule of g.rules) lines.push(`${rule.id}: ${rule.text}`);
  }
  return lines.join('\n');
}

const ANALYZE_MAX_CHARS = Math.min(MAX_CONTEXT_CHARS, 200_000);

const CONF = new Set<Confidence>(['high', 'medium', 'low']);
const asConf = (c: unknown): Confidence => (CONF.has(c as Confidence) ? (c as Confidence) : 'medium');
const asBool = (v: unknown): boolean | undefined => (typeof v === 'boolean' ? v : undefined);

// Defensive normalization of the raw model output.
function normalizeAnalysis(raw: any, fileName?: string): EsourceAnalysis {
  const ruleById = new Map(UNIVERSAL_RULE_GROUPS.flatMap((g) => g.rules.map((r) => [r.id, r] as const)));

  const questions: TemplateQuestion[] = (Array.isArray(raw?.questions) ? raw.questions : [])
    .filter((q: any) => typeof q?.text === 'string' && q.text.trim())
    .map((q: any, i: number): TemplateQuestion => ({
      id: `es-${Date.now()}-${i}`,
      text: String(q.text).trim(),
      answerType: q.answerType === 'yesno' ? 'yesno' : 'preference',
      group: 'Detected from eSource',
      answer: q.answer === 'no' ? 'no' : q.answerType === 'yesno' ? 'yes' : undefined,
      confidence: asConf(q.confidence),
    }));

  const ruleOverrides = (Array.isArray(raw?.ruleOverrides) ? raw.ruleOverrides : [])
    .filter((o: any) => ruleById.has(String(o?.id)))
    .map((o: any) => ({
      id: String(o.id),
      text: ruleById.get(String(o.id))!.text,
      answer: 'no' as const,
      confidence: asConf(o.confidence),
    }));

  const forms = (Array.isArray(raw?.forms) ? raw.forms : [])
    .filter((f: any) => typeof f?.name === 'string' && f.name.trim())
    .map((f: any) => ({
      name: String(f.name).trim(),
      fields: (Array.isArray(f.fields) ? f.fields : [])
        .filter((fld: any) => typeof fld?.label === 'string' && fld.label.trim())
        .map((fld: any) => ({
          label: String(fld.label).trim(),
          type: fld.type || 'text',
          required: !!fld.required,
          options: Array.isArray(fld.options) ? fld.options.map(String) : undefined,
          section: fld.section || undefined,
          confidence: asConf(fld.confidence),
        })),
    }));

  const p = raw?.preferences ?? {};
  return {
    templateName: (typeof raw?.templateName === 'string' && raw.templateName.trim())
      || (fileName ? fileName.replace(/\.[^.]+$/, '') : 'Imported eSource template'),
    summary: typeof raw?.summary === 'string' ? raw.summary : '',
    preferences: {
      dateFormat: typeof p.dateFormat === 'string' && p.dateFormat.trim() ? p.dateFormat.trim() : undefined,
      timeFormat: p.timeFormat === '12h' || p.timeFormat === '24h' ? p.timeFormat : undefined,
      requireSignature: asBool(p.requireSignature),
      documentUploadFields: asBool(p.documentUploadFields),
      generalSections: asBool(p.generalSections),
      screeningOrder: asBool(p.screeningOrder),
    },
    questions,
    ruleOverrides,
    forms,
    instructions: typeof raw?.instructions === 'string' ? raw.instructions.trim() : undefined,
  };
}

export async function analyzeEsourceDocument(esourceText: string, fileName?: string): Promise<EsourceAnalysis> {
  const corpus = esourceText.length > ANALYZE_MAX_CHARS ? esourceText.slice(0, ANALYZE_MAX_CHARS) : esourceText;
  const raw = await callModel(
    ANALYZE_SYSTEM_PROMPT + `\n\nUNIVERSAL RULES (cite ids from this list only):\n${universalRulesCatalogue()}`,
    `Analyze the following eSource document${fileName ? ` ("${fileName}")` : ''} and return the JSON described:\n\n${corpus}`,
  );
  return normalizeAnalysis(raw, fileName);
}
