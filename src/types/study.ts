// Structured eSource study model — shared domain types.
// MUST stay in sync with the client copy at src/types/study.ts (client is canonical).
// Study → visits/logs → forms → fields, plus eligibility, findings, and review trail.

export type FieldType =
  | 'text'
  | 'textarea'
  | 'number'
  | 'integer'
  | 'decimal'
  | 'date'
  | 'datetime'
  | 'time'
  | 'select'
  | 'multiselect'
  | 'radio'
  | 'checkbox'
  | 'yesno'
  | 'signature'
  | 'file'
  | 'calculated';

export type Confidence = 'high' | 'medium' | 'low';

export type ReviewStatus = 'pending' | 'accepted' | 'rejected';

export interface StudyField {
  id: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
  confidence: Confidence;
  completionGuidance?: string;
  section?: string;
  expression?: string;
  /** Optional display format hint (e.g. date order). Phase 2. */
  format?: string;
  source?: string;
  protocolSection?: string;
  page?: number;
  originalText?: string;
  reviewStatus: ReviewStatus;
  /** True once the user hand-edited this field after generation. */
  editedByUser?: boolean;
  /** Snapshot of the AI-generated version taken on the FIRST user edit —
   *  the (original, edited) pair feeds the preference-learning memory. */
  aiOriginal?: FieldSnapshot;
}

/** The learnable aspects of a field, captured before the user's first edit. */
export interface FieldSnapshot {
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
  completionGuidance?: string;
  section?: string;
}

export interface ValidationRule {
  id: string;
  description: string;
  ruleType: string;
  confidence: Confidence;
  accepted: boolean | null;
}

export interface StudyForm {
  id: string;
  name: string;
  description?: string;
  appliedTemplate?: string | null;
  /** Per-form prompt used to (re)generate this form during review. */
  prompt?: string;
  fields: StudyField[];
  rules: ValidationRule[];
  /** Alerts/notifications configured on this form (Phase 2). */
  alerts?: FormAlert[];
}

export interface FormAlert {
  id: string;
  level: 'info' | 'warning' | 'critical';
  message: string;
  trigger?: string;
  fieldId?: string;
}

export type DateSegment = 'D' | 'M' | 'Y';

export interface TemplatePreferences {
  /** Date format token string, e.g. "YYYY-MM-DD", "DD-MMM-YYYY", "YY". Preferred. */
  dateFormat?: string;
  dateOrder?: DateSegment[];
  dateSeparator?: string;
  timeFormat: '12h' | '24h';
  requireSignature: boolean;
  documentUploadFields: boolean;
  generalSections: boolean;
  screeningOrder: boolean;
  alertDefaults?: FormAlert[];
  /** Free-text instructions injected directly into the build prompt. */
  instructions?: string;
  /** Plan-mode questions selected to feed the build prompt. */
  questions?: TemplateQuestion[];
}

export type QuestionAnswerType =
  | 'yesno'
  | 'date'
  | 'time'
  | 'dropdown'
  | 'text'
  | 'textarea'
  | 'number'
  | 'preference';

export interface TemplateQuestion {
  id: string;
  text: string;
  answerType: QuestionAnswerType;
  group: string;
  options?: string[];
  custom?: boolean;
  /** Yes/No answer for boolean rule-style questions. Defaults to "yes". */
  answer?: 'yes' | 'no';
  /** AI confidence when the question was detected from an uploaded eSource. */
  confidence?: Confidence;
}

// ---- eSource → template analysis (upload an existing eSource, detect prefs) ----

/** A field the AI would generate, previewed from an uploaded eSource. */
export interface DetectedField {
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[];
  section?: string;
  confidence: Confidence;
}

export interface DetectedForm {
  name: string;
  fields: DetectedField[];
}

/** Result of analyzing an uploaded eSource document for template creation. */
export interface EsourceAnalysis {
  /** Suggested template name (from the study/document). */
  templateName: string;
  summary: string;
  /** Core preference toggles detected from the document (null/undefined = not determinable). */
  preferences: Partial<Pick<TemplatePreferences,
    'dateFormat' | 'timeFormat' | 'requireSignature' | 'documentUploadFields' | 'generalSections' | 'screeningOrder'>>;
  /** Detected preference/rule statements, each with AI confidence. */
  questions: TemplateQuestion[];
  /** Universal rules the eSource contradicts (should be answered "no"). */
  ruleOverrides: { id: string; text: string; answer: 'yes' | 'no'; confidence: Confidence }[];
  /** The forms/fields the AI will generate when this template is used. */
  forms: DetectedForm[];
  /** Free-text style directives distilled from the eSource. */
  instructions?: string;
}

export interface Template {
  id?: string;
  name: string;
  description?: string;
  preferences: TemplatePreferences;
}

export const DEFAULT_PREFERENCES: TemplatePreferences = {
  dateFormat: 'DD-MMM-YYYY',
  dateOrder: ['M', 'Y', 'D'],
  dateSeparator: ' ',
  timeFormat: '24h',
  requireSignature: true,
  documentUploadFields: true,
  generalSections: true,
  screeningOrder: true,
};

export interface StudyVisit {
  id: string;
  name: string;
  kind: 'visit' | 'log';
  timing?: string;
  window?: string;
  forms: StudyForm[];
}

export interface EligibilityCriterion {
  id: string;
  kind: 'inclusion' | 'exclusion';
  criterion: string;
  logic: string;
  confidence: Confidence;
}

export type FindingSeverity = 'info' | 'warning' | 'blocker';

export interface IntelligenceFinding {
  id: string;
  title: string;
  description: string;
  source: string;
  confidence: Confidence;
  severity: FindingSeverity;
  suggestedAction: 'review' | 'block';
  resolved: boolean;
}

export interface IngestedDocument {
  name: string;
  docType: string;
  sizeBytes: number;
}

export interface StudyModel {
  /** Persistence id (Mongo _id) once saved. */
  id?: string;
  /** Review lifecycle: "draft" until every field is approved, then "final". */
  status?: 'draft' | 'reviewed' | 'final';
  studyTitle: string;
  studyDescription: string;
  protocolNumber?: string;
  sponsor?: string;
  phase?: string;
  indication?: string;
  objectives?: string;
  documents: IngestedDocument[];
  visits: StudyVisit[];
  eligibility: EligibilityCriterion[];
  findings: IntelligenceFinding[];
  /** Applied template id and date-format preference. Phase 2. */
  templateId?: string;
  dateFormatPreference?: string;
}

// ---- Build options (shared with the client) ----
export interface BuildOptions {
  customInstructions?: string;
  visitCount?: number;
  detailLevel?: 'concise' | 'standard' | 'detailed';
  /** Template to apply at build time. Phase 2. */
  templateId?: string;
}

export const DEFAULT_OPTIONS: Required<Omit<BuildOptions, 'customInstructions' | 'templateId'>> & {
  customInstructions: string;
  templateId?: string;
} = {
  customInstructions: '',
  visitCount: 30,
  detailLevel: 'detailed',
};
