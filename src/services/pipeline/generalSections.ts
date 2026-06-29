import type { StudyModel, StudyVisit, StudyForm } from '../../types/study';

// Canonical Screening-visit form order.
const SCREENING_ORDER = [
  'Date of Visit',
  'Informed Consent',
  'Demographics',
  'Inclusion/Exclusion Criteria',
  'Eligibility',
  'Vital Signs',
  'Physical Examination',
  'ECG',
  'Laboratory',
  'Progress Notes',
  'Completion',
];

// General Sections that should always be available.
const GENERAL_FORMS = ['Medical History', 'Allergies', 'Social History', 'Adverse Events', 'Serious Adverse Events'];

let stubSeq = 0;
function stubForm(name: string): StudyForm {
  stubSeq += 1;
  return {
    id: `std-${stubSeq}`,
    name,
    appliedTemplate: null,
    fields: [
      {
        id: `stdf-${stubSeq}`,
        label: `${name} performed?`,
        type: 'yesno',
        required: false,
        confidence: 'low',
        completionGuidance: `Standard ${name} section added from the template — review and complete (regenerate to populate fields).`,
        source: 'Standard section (review)',
        reviewStatus: 'pending',
      },
    ],
    rules: [],
  };
}

// Rank a form name against the canonical Screening order (lower = earlier).
function canonicalRank(name: string): number {
  const n = name.toLowerCase();
  const i = SCREENING_ORDER.findIndex((c) => {
    const head = c.toLowerCase().split('/')[0];
    return n.includes(head) || c.toLowerCase().includes(n);
  });
  return i === -1 ? 999 : i;
}

// Reorder Screening visits' forms to the canonical sequence and add any missing
// canonical forms (to the first Screening visit) as low-confidence stubs.
export function applyScreeningOrder(study: StudyModel): StudyModel {
  let firstScreeningDone = false;
  const byRank = (a: StudyForm, b: StudyForm) => canonicalRank(a.name) - canonicalRank(b.name);

  const visits = study.visits.map((v) => {
    if (!/screen/i.test(v.name)) return v;
    let forms = [...v.forms].sort(byRank);
    if (!firstScreeningDone) {
      const missing = SCREENING_ORDER.filter((_name, i) => !forms.some((f) => canonicalRank(f.name) === i)).map(stubForm);
      forms = [...forms, ...missing].sort(byRank);
      firstScreeningDone = true;
    }
    return { ...v, forms };
  });

  return { ...study, visits };
}

// Append a "General Sections" log containing any general forms not already
// present elsewhere in the study.
export function addGeneralSections(study: StudyModel): StudyModel {
  const missing = GENERAL_FORMS.filter(
    (name) => !study.visits.some((v) => v.forms.some((f) => f.name.toLowerCase() === name.toLowerCase())),
  ).map(stubForm);
  if (!missing.length) return study;

  const genVisit: StudyVisit = { id: 'general-sections', name: 'General Sections', kind: 'log', forms: missing };
  return { ...study, visits: [...study.visits, genVisit] };
}
