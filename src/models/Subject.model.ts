import mongoose, { Schema } from 'mongoose';

// A study participant. Pseudonymous by design — this app never captures real
// PHI (name/DOB/etc.), only a site-assigned identifier, matching how a real
// EDC keeps the clinical database de-identified.
const SubjectSchema = new Schema(
  {
    studyId: { type: Schema.Types.ObjectId, ref: 'Study', required: true, index: true },
    // Site-assigned identifier, e.g. "001-001". Unique within a study.
    subjectCode: { type: String, required: true },
    status: { type: String, enum: ['enrolled', 'screen-failed', 'completed', 'withdrawn'], default: 'enrolled' },
    enrolledAt: { type: Date, default: Date.now },
    createdBy: { type: Schema.Types.Mixed },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  },
);

SubjectSchema.index({ studyId: 1, subjectCode: 1 }, { unique: true });

export const SubjectDoc = mongoose.model('Subject', SubjectSchema);
