import type { StudyVisit, StudyForm, StudyArm } from '../../types/study';

// Fixed folder counts for the replicated arms (see plan / user spec).
export const ARM_COUNTS = { unscheduled: 5, sae: 3, reconsent: 3 } as const;

// Display order of arms in the tree (Study Visit first, then the fixed arms).
export const ARM_ORDER: StudyArm[] = ['Study Visit', 'General', 'Unscheduled Visit', 'SAE', 'Early Termination', 'Reconsent'];

let seq = 0;
const uid = (p: string) => `${p}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

// Deep-clone a form with FRESH ids for the form and every field/rule/alert, so
// the replicated copy is independent of the master and of its siblings. Drops
// per-field learning metadata (a copy is not itself a user edit).
function cloneForm(src: StudyForm, name?: string): StudyForm {
  return {
    ...src,
    id: uid('form'),
    name: name ?? src.name,
    fields: src.fields.map((f) => {
      const { editedByUser, aiOriginal, ...rest } = f;
      void editedByUser; void aiOriginal;
      return { ...rest, id: uid('fld') };
    }),
    rules: src.rules.map((r) => ({ ...r, id: uid('rule') })),
    alerts: src.alerts?.map((a) => ({ ...a, id: uid('al') })),
  };
}

// A minimal standard form for the General arm (Note to File / Dosing Log).
function stubForm(name: string): StudyForm {
  return {
    id: uid('form'),
    name,
    appliedTemplate: null,
    fields: [{
      id: uid('fld'), label: `${name} performed?`, type: 'yesno', required: false,
      confidence: 'medium', reviewStatus: 'pending',
      completionGuidance: `Standard ${name} section (review and complete).`, source: 'Standard arm section',
    }],
    rules: [],
  };
}

function folder(name: string, arm: StudyArm, forms: StudyForm[], kind: 'visit' | 'log' = 'visit'): StudyVisit {
  return { id: uid('v'), name, kind, arm, forms };
}

// The unique "master" forms (first occurrence by name) across the given visits —
// i.e. the masterfile built for the Study-Visit arm.
export function masterForms(visits: StudyVisit[]): StudyForm[] {
  const seen = new Set<string>();
  const out: StudyForm[] = [];
  for (const v of visits) {
    for (const f of v.forms) {
      const k = f.name.trim().toLowerCase();
      if (k && !seen.has(k)) { seen.add(k); out.push(f); }
    }
  }
  return out;
}

// EOS visits 801 & 802 (each containing all master forms) — added to the
// Study-Visit arm and the Early-Termination arm.
export function eosFolders(master: StudyForm[], arm: StudyArm): StudyVisit[] {
  return ['801', '802'].map((n) => folder(n, arm, master.map((f) => cloneForm(f))));
}

// Build the fixed arms (General, Unscheduled, SAE, Early Termination, Reconsent)
// with their folders and replicated master forms. Returns visits to append to
// the study alongside the protocol's Study-Visit arm.
export function scaffoldFixedArms(master: StudyForm[]): StudyVisit[] {
  const all = () => master.map((f) => cloneForm(f));
  const out: StudyVisit[] = [];

  // General arm — Note to File + Dosing Log folders.
  out.push(folder('Note to File', 'General', [stubForm('Note to File')], 'log'));
  out.push(folder('Dosing Log', 'General', [stubForm('Dosing Log')], 'log'));

  // Unscheduled Visit arm — N folders, each all master forms.
  for (let i = 1; i <= ARM_COUNTS.unscheduled; i++) out.push(folder(`Unscheduled Visit ${i}`, 'Unscheduled Visit', all()));

  // SAE arm — N folders, each all master forms.
  for (let i = 1; i <= ARM_COUNTS.sae; i++) out.push(folder(`SAE ${i}`, 'SAE', all()));

  // Early Termination arm — 1 folder (all master forms) + EOS visits 801/802.
  out.push(folder('Early Termination', 'Early Termination', all()));
  out.push(...eosFolders(master, 'Early Termination'));

  // Reconsent arm — N folders, each the Informed Reconsent form (clone of
  // Informed Consent when present, else a stub).
  const consent = master.find((f) => /informed consent/i.test(f.name));
  const reconsent = () => (consent ? cloneForm(consent, 'Informed Reconsent') : stubForm('Informed Reconsent'));
  for (let i = 1; i <= ARM_COUNTS.reconsent; i++) out.push(folder(`Reconsent ${i}`, 'Reconsent', [reconsent()]));

  return out;
}
