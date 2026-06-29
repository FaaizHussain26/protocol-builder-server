import type { StudyModel, StudyField, TemplatePreferences, FormAlert } from '../../types/study';

// Resolve the date display format. Prefer an explicit token string
// ("YYYY-MM-DD", "YY", …); fall back to the legacy segment model.
export function dateFormatString(p: TemplatePreferences): string {
  if (p.dateFormat && p.dateFormat.trim()) return p.dateFormat.trim();
  const tok: Record<string, string> = { D: 'DD', M: 'MMM', Y: 'YYYY' };
  return (p.dateOrder ?? ['M', 'Y', 'D']).map((s) => tok[s] ?? '').filter(Boolean).join(p.dateSeparator || ' ');
}

let sigSeq = 0;
let alertSeq = 0;

function signatureField(): StudyField {
  sigSeq += 1;
  return {
    id: `sig-${sigSeq}`,
    label: 'Signature',
    type: 'signature',
    required: true,
    section: 'Completion',
    confidence: 'medium',
    completionGuidance: 'Electronic signature confirming the form is complete and accurate.',
    source: 'Template preference',
    reviewStatus: 'pending',
  };
}

function withAlertId(a: FormAlert): FormAlert {
  alertSeq += 1;
  return { ...a, id: a.id || `al-${alertSeq}` };
}

// Apply template preferences to a built study: date/time display formats,
// a signature field on consent/completion forms, and default alerts.
export function applyTemplate(study: StudyModel, p: TemplatePreferences): StudyModel {
  const dateFmt = dateFormatString(p);
  const timeFmt = p.timeFormat === '12h' ? 'hh:mm A' : 'HH:mm';

  const visits = study.visits.map((v) => ({
    ...v,
    forms: v.forms.map((f) => {
      let fields = f.fields.map((fld) => {
        if (fld.type === 'date' || fld.type === 'datetime') return { ...fld, format: fld.format || dateFmt };
        if (fld.type === 'time') return { ...fld, format: fld.format || timeFmt };
        return fld;
      });
      if (p.requireSignature && /\bconsent\b|\bcompletion\b|sign[- ]?off/i.test(f.name) && !fields.some((x) => x.type === 'signature')) {
        fields = [...fields, signatureField()];
      }
      const alerts = f.alerts && f.alerts.length ? f.alerts : p.alertDefaults?.map(withAlertId) ?? f.alerts;
      return { ...f, fields, alerts };
    }),
  }));

  return { ...study, visits, dateFormatPreference: dateFmt };
}
