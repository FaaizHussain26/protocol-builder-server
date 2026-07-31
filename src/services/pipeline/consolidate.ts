import type { StudyModel, StudyForm } from '../../types/study';

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
const REPEATABLE_NAME = /\blog\b|adverse event|concomitant|con ?med|medical histor|dosing|allerg|deviation/i;
export function markRepeatableForms(study: StudyModel): StudyModel {
  const mark = (f: StudyForm): StudyForm => {
    const isLog = REPEATABLE_NAME.test(f.name) || /log$/i.test(f.appliedTemplate ?? '');
    return isLog && !f.repeatable ? { ...f, repeatable: true } : f;
  };
  return { ...study, visits: study.visits.map((v) => ({ ...v, forms: v.forms.map(mark) })) };
}

const HEIGHT = /\bheight\b/i;
const WEIGHT = /\bweight\b/i;
const BMI = /\bbmi\b|body mass index/i;
const ANTHRO = /\b(height|weight|bmi)\b|body mass index/i;
const isVitals = (name: string) => /vital sign/i.test(name) || /^\s*vs\s*$/i.test(name);

// Keep Height/Weight/BMI ONCE, in Vital Signs. Within each visit that has a
// Vital Signs form, strip anthropometry fields from every other form (dropping a
// form that becomes empty), and ensure Vital Signs carries a calculated BMI when
// it has both Height and Weight. Visits without a Vital Signs form are left as-is
// (no canonical home to move the fields into).
export function dedupeAnthropometry(study: StudyModel): StudyModel {
  const visits = study.visits.map((v) => {
    const vitals = v.forms.find((f) => isVitals(f.name));
    if (!vitals) return v;

    const forms: StudyForm[] = [];
    for (const f of v.forms) {
      if (f.id === vitals.id) { forms.push(f); continue; }
      const kept = f.fields.filter((fld) => !ANTHRO.test(fld.label));
      if (kept.length === f.fields.length) { forms.push(f); continue; } // nothing to remove
      if (kept.length === 0) continue; // form was only anthropometry → drop it
      forms.push({ ...f, fields: kept });
    }

    // Ensure Vital Signs has a calculated BMI when it captures height & weight.
    const idx = forms.findIndex((f) => f.id === vitals.id);
    const vf = forms[idx];
    const hasHeight = vf.fields.some((f) => HEIGHT.test(f.label));
    const hasWeight = vf.fields.some((f) => WEIGHT.test(f.label));
    const hasBMI = vf.fields.some((f) => BMI.test(f.label));
    if (hasHeight && hasWeight && !hasBMI) {
      const section = vf.fields.find((f) => HEIGHT.test(f.label) || WEIGHT.test(f.label))?.section;
      forms[idx] = {
        ...vf,
        fields: [...vf.fields, {
          id: uid('fld'),
          label: 'BMI',
          type: 'calculated',
          required: false,
          expression: 'weight / (height/100)^2',
          section,
          confidence: 'high',
          completionGuidance: 'Auto-calculated from Height and Weight (kg/m²).',
          source: 'Auto-calculated',
          reviewStatus: 'pending',
        }],
      };
    }
    return { ...v, forms };
  });
  return { ...study, visits };
}
