import type {
  StudyModel,
  StudyField,
  StudyVisit,
  StudyForm,
  ValidationRule,
  IngestedDocument,
} from '../../types/study';

// Raw shapes returned by the model (before we attach review state / IDs).
export interface RawStudy {
  studyTitle?: string;
  studyDescription?: string;
  protocolNumber?: string | null;
  sponsor?: string | null;
  phase?: string | null;
  indication?: string | null;
  objectives?: string | null;
  visits?: RawVisit[];
  eligibility?: StudyModel['eligibility'];
  findings?: Array<Omit<StudyModel['findings'][number], 'resolved'>>;
}
export interface RawVisit extends Omit<StudyVisit, 'forms'> {
  forms?: RawForm[];
}
export interface RawForm extends Omit<StudyForm, 'fields' | 'rules'> {
  fields?: Array<Omit<StudyField, 'reviewStatus'>>;
  rules?: Array<Omit<ValidationRule, 'accepted'>>;
}

let fieldSeq = 0;
let ruleSeq = 0;

export function normalizeFields(raw: RawForm['fields']): StudyField[] {
  return (raw ?? []).map((fld): StudyField => ({
    id: fld.id || `fld${++fieldSeq}`,
    label: fld.label || 'Untitled field',
    type: fld.type || 'text',
    required: !!fld.required,
    options: fld.options,
    section: fld.section || undefined,
    expression: fld.expression || undefined,
    format: fld.format || undefined,
    confidence: fld.confidence || 'medium',
    completionGuidance: fld.completionGuidance,
    source: fld.source,
    protocolSection: fld.protocolSection || undefined,
    page: typeof fld.page === 'number' ? fld.page : undefined,
    originalText: fld.originalText || undefined,
    reviewStatus: 'pending',
  }));
}

export function normalizeRules(raw: RawForm['rules']): ValidationRule[] {
  return (raw ?? []).map((r): ValidationRule => ({
    id: r.id || `r${++ruleSeq}`,
    description: r.description || '',
    ruleType: r.ruleType || 'range',
    confidence: r.confidence || 'medium',
    accepted: null,
  }));
}

// Attach review state, fill defaults, and guarantee stable IDs.
export function normalizeStudy(raw: RawStudy, documents: IngestedDocument[]): StudyModel {
  const visits: StudyVisit[] = (raw.visits ?? [])
    .map((v, vi): StudyVisit => ({
      id: v.id || `v${vi + 1}`,
      name: v.name || `Visit ${vi + 1}`,
      kind: v.kind === 'log' ? 'log' : 'visit',
      timing: v.timing || undefined,
      window: v.window || undefined,
      forms: (v.forms ?? [])
        .filter((f) => (f.fields ?? []).length > 0)
        .map((f, fi): StudyForm => ({
          id: f.id || `v${vi + 1}f${fi + 1}`,
          name: f.name || `Form ${fi + 1}`,
          description: f.description || undefined,
          appliedTemplate: f.appliedTemplate || null,
          prompt: f.prompt || undefined,
          fields: normalizeFields(f.fields),
          rules: normalizeRules(f.rules),
        })),
    }))
    .filter((v) => v.forms.length > 0);

  return {
    studyTitle: raw.studyTitle || 'Untitled Study',
    studyDescription: raw.studyDescription || '',
    protocolNumber: raw.protocolNumber || undefined,
    sponsor: raw.sponsor || undefined,
    phase: raw.phase || undefined,
    indication: raw.indication || undefined,
    objectives: raw.objectives || undefined,
    documents,
    visits,
    eligibility: (raw.eligibility ?? []).map((e, i) => ({
      ...e,
      id: e.id || `e${i + 1}`,
      confidence: e.confidence || 'medium',
    })),
    findings: (raw.findings ?? []).map((f, i) => ({
      ...f,
      id: f.id || `fnd${i + 1}`,
      confidence: f.confidence || 'medium',
      severity: f.severity || 'warning',
      suggestedAction: f.suggestedAction || 'review',
      resolved: false,
    })),
  };
}
