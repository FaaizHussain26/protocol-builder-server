import mongoose, { Schema } from 'mongoose';

// Append-only change record — the audit trail (Phase 4). Two kinds of entry:
// entityType 'field' = a study-definition (build) change, entityType
// 'form-submission-record' = a data-capture change. No update/delete routes
// are exposed for this collection; it is written once per change and never
// touched again.
const AuditLogSchema = new Schema(
  {
    studyId: { type: Schema.Types.ObjectId, ref: 'Study', required: true, index: true },
    entityType: { type: String, enum: ['field', 'form-submission-record'], required: true },
    // The StudyField.id for a 'field' entry, or the SubmissionRecord.id for a
    // 'form-submission-record' entry.
    entityId: { type: String, required: true },
    action: { type: String, required: true }, // e.g. 'added' | 'updated' | 'removed' | 'created' | 'submitted' | 'signed'
    summary: { type: String, required: true }, // human-readable one-liner shown in the trail
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    userId: { type: String },
    userName: { type: String },
  },
  {
    timestamps: true,
    minimize: false,
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

AuditLogSchema.index({ studyId: 1, createdAt: -1 });

export const AuditLogDoc = mongoose.model('AuditLog', AuditLogSchema);
