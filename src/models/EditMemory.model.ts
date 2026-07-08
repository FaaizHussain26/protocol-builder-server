import mongoose, { Schema } from 'mongoose';

// One remembered field correction: the AI generated `original`, the user changed
// it to `edited`. Upserted per (formKey, fieldKey) so the latest correction wins.
// These feed the LEARNED USER PREFERENCES block of future enrichment prompts.
const EditMemorySchema = new Schema(
  {
    /** Normalized form name (lowercase, trimmed) used for prompt-time lookup. */
    formKey: { type: String, required: true, index: true },
    formName: { type: String, required: true },
    /** Normalized ORIGINAL field label — identifies which generated field was corrected. */
    fieldKey: { type: String, required: true },
    original: { type: Schema.Types.Mixed, required: true },
    edited: { type: Schema.Types.Mixed, required: true },
    /** Precomputed human-readable diff line injected into prompts. */
    note: { type: String, required: true },
    studyId: String,
  },
  { timestamps: true },
);

EditMemorySchema.index({ formKey: 1, fieldKey: 1 }, { unique: true });

export const EditMemoryDoc = mongoose.model('EditMemory', EditMemorySchema);
