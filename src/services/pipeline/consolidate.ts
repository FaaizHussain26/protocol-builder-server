import type { StudyModel, StudyForm, StudyField } from '../../types/study';

// Deterministic post-build cleanup: consolidate routine labs into a single
// "Lab Assessments" form and de-duplicate Height/Weight/BMI so they live once in
// Vital Signs. Runs BEFORE the master forms are replicated into the fixed arms,
// so every arm inherits the cleaned structure.

let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

// Routine labs are merged; specialty labs (Genetic / PK / Exploratory / Biomarker)
// stay as their own distinct forms.
const ROUTINE_LAB = /lab|laborator|hematolog|haematolog|chemistr|urinalys|coagulat|serolog/i;
const SPECIALTY_LAB = /genetic|pharmacokinet|\bpk\b|\bpd\b|exploratory|biomarker|immunogen/i;
const isRoutineLab = (name: string) => ROUTINE_LAB.test(name) && !SPECIALTY_LAB.test(name);

// Merge all routine-lab forms in each visit into one "Lab Assessments" form.
// Fields are concatenated and de-duplicated by label; fields that carry no
// section are grouped under a section named after their original form (e.g.
// "Hematology", "Clinical Chemistry"). Specialty labs are left untouched.
export function consolidateLabForms(study: StudyModel): StudyModel {
  const visits = study.visits.map((v) => {
    const routine = v.forms.filter((f) => isRoutineLab(f.name));
    if (routine.length < 1) return v;

    const merged: StudyForm = {
      id: routine[0].id,
      name: 'Lab Assessments',
      appliedTemplate: routine[0].appliedTemplate ?? null,
      fields: [],
      rules: [],
    };
    const seenField = new Set<string>();
    const seenRule = new Set<string>();
    for (const f of routine) {
      const groupSection = f.name.trim();
      for (const fld of f.fields) {
        const key = norm(fld.label);
        if (key && seenField.has(key)) continue;
        if (key) seenField.add(key);
        merged.fields.push({ ...fld, section: fld.section?.trim() || groupSection });
      }
      for (const r of f.rules) {
        const key = norm(r.description);
        if (key && seenRule.has(key)) continue;
        if (key) seenRule.add(key);
        merged.rules.push(r);
      }
    }

    // Replace the FIRST routine-lab form with the merged one, drop the rest,
    // keep every other form (incl. specialty labs) in its original position.
    const routineIds = new Set(routine.map((f) => f.id));
    let placed = false;
    const forms: StudyForm[] = [];
    for (const f of v.forms) {
      if (!routineIds.has(f.id)) { forms.push(f); continue; }
      if (!placed) { forms.push(merged); placed = true; }
    }
    return { ...v, forms };
  });
  return { ...study, visits };
}

// Clearly log/table-style forms are ALWAYS repeatable (guaranteed regardless of
// what the AI returned). Other forms keep the AI's per-form "repeatable" value.
const REPEATABLE_NAME = /\blog\b|vital sign|adverse event|concomitant|con ?med|medical histor|dosing|study drug|drug administration|treatment administration|allerg|deviation/i;
export function markRepeatableForms(study: StudyModel): StudyModel {
  const mark = (f: StudyForm): StudyForm => {
    const isLog = REPEATABLE_NAME.test(f.name) || /log$/i.test(f.appliedTemplate ?? '');
    return isLog && !f.repeatable ? { ...f, repeatable: true } : f;
  };
  return { ...study, visits: study.visits.map((v) => ({ ...v, forms: v.forms.map(mark) })) };
}

// The Eligibility Determination form is built DETERMINISTICALLY from the verbatim
// criteria the protocol-only pass extracted — one Yes/No/N-A field per criterion,
// exact protocol wording and numbering preserved, never combined. Letting the
// enrichment call re-derive these from an excerpt risks paraphrasing, renumbering,
// or dropping criteria; study.eligibility is already the untouched source text.
const ELIGIBILITY_FORM = /eligibility|inclusion|exclusion/i;
// Administrative fields the AI may have added are worth keeping (sign-off, date).
const ADMIN_FIELD = /signature|sign-?off|date|comment|complet|initial|investigator|assessor|reviewed/i;

export function populateEligibilityForm(study: StudyModel): StudyModel {
  const criteria = study.eligibility ?? [];
  if (!criteria.length) return study; // nothing verbatim to copy — leave as built

  const ordered = [
    ...criteria.filter((c) => c.kind === 'inclusion'),
    ...criteria.filter((c) => c.kind !== 'inclusion'),
  ];

  const buildFields = (existing: StudyField[]): StudyField[] => {
    const fields: StudyField[] = ordered.map((c) => ({
      id: uid('fld'),
      // The label IS the protocol's own text, copied over unchanged.
      label: c.criterion,
      type: 'radio',
      options: ['Yes', 'No', 'N/A'],
      required: true,
      section: c.kind === 'inclusion' ? 'Inclusion Criteria' : 'Exclusion Criteria',
      confidence: c.confidence ?? 'high',
      completionGuidance: c.logic || 'Record whether the subject meets this criterion.',
      source: 'Protocol - eligibility criteria (verbatim)',
      reviewStatus: 'pending',
    }));
    // Preserve any sign-off/date/comment fields the build produced.
    const seen = new Set(fields.map((f) => norm(f.label)));
    for (const f of existing) {
      if (!ADMIN_FIELD.test(f.label)) continue;      // drop AI-paraphrased criteria
      if (seen.has(norm(f.label))) continue;
      seen.add(norm(f.label));
      fields.push({ ...f, id: uid('fld') });
    }
    return fields;
  };

  let replaced = false;
  const visits = study.visits.map((v) => ({
    ...v,
    forms: v.forms.map((f) => {
      if (!ELIGIBILITY_FORM.test(f.name)) return f;
      replaced = true;
      return { ...f, fields: buildFields(f.fields) };
    }),
  }));

  // No such form anywhere: add one to Screening (else the first visit).
  if (!replaced && visits.length) {
    const i = Math.max(0, visits.findIndex((v) => /screen/i.test(v.name)));
    const form: StudyForm = {
      id: uid('form'), name: 'Eligibility Determination', appliedTemplate: null,
      fields: buildFields([]), rules: [],
    };
    visits[i] = { ...visits[i], forms: [...visits[i].forms, form] };
  }
  return { ...study, visits };
}

const HEIGHT = /\bheight\b/i;
const WEIGHT = /\bweight\b/i;
const BMI = /\bbmi\b|body mass index/i;
const ANTHRO = /\b(height|weight|bmi|bsa)\b|body mass index|body surface area/i;
const isVitals = (name: string) => /vital sign/i.test(name) || /^\s*vs\s*$/i.test(name);
const isPhysMeas = (name: string) => /physical measurement|anthropom/i.test(name);

// Anthropometry (Height/Weight/BMI/BSA) belongs on a dedicated "Physical
// Measurements" form, SEPARATE from Vital Signs (per the source-doc methodology).
// Per visit: gather every anthropometry field, move them (de-duplicated by label)
// into a Physical Measurements form (creating one just before Vital Signs when the
// visit has anthropometry but no such form), strip them from all other forms
// (dropping any that become empty), and ensure a calculated BMI is present.
export function consolidateAnthropometry(study: StudyModel): StudyModel {
  const visits = study.visits.map((v) => {
    const existingPM = v.forms.find((f) => isPhysMeas(f.name));
    const hasAnthroElsewhere = v.forms.some((f) => !(existingPM && f.id === existingPM.id) && f.fields.some((fld) => ANTHRO.test(fld.label)));
    if (!existingPM && !hasAnthroElsewhere) return v; // nothing to do

    const collected: StudyField[] = [];
    const seen = new Set<string>();
    const pushUnique = (fld: StudyField) => { const k = norm(fld.label); if (k && seen.has(k)) return; if (k) seen.add(k); collected.push(fld); };

    // Seed with the PM form's own fields (keep its non-anthro fields too).
    const pmOwnOther: StudyField[] = [];
    if (existingPM) for (const fld of existingPM.fields) (ANTHRO.test(fld.label) ? pushUnique(fld) : pmOwnOther.push(fld));

    // Strip anthropometry from every other form.
    const others: StudyForm[] = [];
    for (const f of v.forms) {
      if (existingPM && f.id === existingPM.id) continue;
      const anthro = f.fields.filter((fld) => ANTHRO.test(fld.label));
      if (!anthro.length) { others.push(f); continue; }
      anthro.forEach(pushUnique);
      const kept = f.fields.filter((fld) => !ANTHRO.test(fld.label));
      if (kept.length === 0) continue; // form was only anthropometry → drop it
      others.push({ ...f, fields: kept });
    }

    let pmFields = [...pmOwnOther, ...collected.map((fld) => ({ ...fld, section: fld.section?.trim() || 'Physical Measurements' }))];
    // Ensure a calculated BMI when Height & Weight are present.
    if (pmFields.some((f) => HEIGHT.test(f.label)) && pmFields.some((f) => WEIGHT.test(f.label)) && !pmFields.some((f) => BMI.test(f.label))) {
      pmFields = [...pmFields, {
        id: uid('fld'), label: 'BMI', type: 'calculated', required: false,
        expression: 'weight / (height/100)^2', section: 'Physical Measurements',
        confidence: 'high', completionGuidance: 'Auto-calculated from Height and Weight (kg/m²).',
        source: 'Auto-calculated', reviewStatus: 'pending',
      }];
    }
    const pmForm: StudyForm = existingPM
      ? { ...existingPM, name: 'Physical Measurements', fields: pmFields }
      : { id: uid('form'), name: 'Physical Measurements', appliedTemplate: null, fields: pmFields, rules: [] };

    // Place PM just before Vital Signs (else at the front of the form list).
    const forms: StudyForm[] = [];
    let placed = false;
    for (const f of others) {
      if (!placed && isVitals(f.name)) { forms.push(pmForm); placed = true; }
      forms.push(f);
    }
    if (!placed) forms.unshift(pmForm);
    return { ...v, forms };
  });
  return { ...study, visits };
}
