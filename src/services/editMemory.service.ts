import { EditMemoryDoc } from '../models/EditMemory.model';
import { isMongoConnected } from '../config/db';
import type { FieldSnapshot, StudyField, StudyModel } from '../types/study';

// Preference-learning memory: when a saved study contains fields the user
// hand-edited (editedByUser + aiOriginal snapshot), remember WHAT changed so
// the next build generates those fields the way the user wants them.

const norm = (s?: string | null) => (s ?? '').trim().toLowerCase();

const snapshot = (f: StudyField): FieldSnapshot => ({
  label: f.label,
  type: f.type,
  required: f.required,
  options: f.options,
  completionGuidance: f.completionGuidance,
  section: f.section,
});

// Human-readable diff line, e.g.
// "Weight" — type "select" → "decimal"; label → "Body Weight"; options removed
function diffNote(original: FieldSnapshot, edited: FieldSnapshot): string {
  const parts: string[] = [];
  if (norm(original.label) !== norm(edited.label)) parts.push(`label → "${edited.label}"`);
  if (original.type !== edited.type) parts.push(`type "${original.type}" → "${edited.type}"`);
  if (original.required !== edited.required) parts.push(edited.required ? 'made required' : 'made optional');
  const oOpts = (original.options ?? []).join('|');
  const eOpts = (edited.options ?? []).join('|');
  if (oOpts !== eOpts) parts.push(eOpts ? `options → [${(edited.options ?? []).join(', ')}]` : 'options removed');
  if (norm(original.completionGuidance) !== norm(edited.completionGuidance) && edited.completionGuidance) {
    parts.push(`guidance → "${edited.completionGuidance}"`);
  }
  if (norm(original.section) !== norm(edited.section) && edited.section) parts.push(`section → "${edited.section}"`);
  if (!parts.length) return '';
  return `"${original.label}" — ${parts.join('; ')}`;
}

// Record every user-edited field of a saved study. Best-effort and non-blocking:
// call it fire-and-forget after a save; failures only log.
export async function recordFieldEdits(study: Partial<StudyModel>, studyId?: string): Promise<void> {
  if (!isMongoConnected()) return;
  try {
    const ops: Parameters<typeof EditMemoryDoc.bulkWrite>[0] = [];
    for (const visit of study.visits ?? []) {
      for (const form of visit.forms ?? []) {
        const formKey = norm(form.name);
        if (!formKey) continue;
        for (const field of form.fields ?? []) {
          if (!field.editedByUser || !field.aiOriginal) continue;
          const note = diffNote(field.aiOriginal, snapshot(field));
          if (!note) continue;
          ops.push({
            updateOne: {
              filter: { formKey, fieldKey: norm(field.aiOriginal.label) },
              update: {
                $set: {
                  formName: form.name,
                  original: field.aiOriginal,
                  edited: snapshot(field),
                  note,
                  ...(studyId ? { studyId } : {}),
                },
              },
              upsert: true,
            },
          });
        }
      }
    }
    if (ops.length) await EditMemoryDoc.bulkWrite(ops, { ordered: false });
  } catch (e) {
    console.warn('[edit-memory] failed to record field edits:', (e as Error).message);
  }
}

const MAX_NOTES_PER_FORM = 25;
const MAX_FORMS = 200;

// Load the learned corrections grouped by normalized form name. Returns a lookup
// the build pipeline calls once per enrichment; empty map without Mongo.
export async function loadLearnedPreferences(): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (!isMongoConnected()) return map;
  try {
    const docs = await EditMemoryDoc.find({}, { formKey: 1, note: 1 })
      .sort({ updatedAt: -1 })
      .limit(MAX_FORMS * MAX_NOTES_PER_FORM)
      .lean();
    for (const d of docs as { formKey: string; note: string }[]) {
      const notes = map.get(d.formKey) ?? [];
      if (notes.length < MAX_NOTES_PER_FORM) {
        notes.push(d.note);
        map.set(d.formKey, notes);
      }
    }
  } catch (e) {
    console.warn('[edit-memory] failed to load learned preferences:', (e as Error).message);
  }
  return map;
}

// Prompt block for one form's enrichment call. Empty string when nothing learned.
export function learnedPrefsContext(learned: Map<string, string[]>, formName: string): string {
  const notes = learned.get(norm(formName));
  if (!notes?.length) return '';
  return (
    '\n\nLEARNED USER PREFERENCES — on previous builds the user manually corrected these AI-generated fields on this form. ' +
    'Generate each field ALREADY matching the corrected version (right label, type, options, guidance):\n' +
    notes.map((n) => `- ${n}`).join('\n')
  );
}
