import mongoose, { Schema } from 'mongoose';

// The study is stored as flexible sub-documents; the canonical shape is the
// shared TS StudyModel. PUT replaces the whole study, so Mixed arrays are safe.
const StudySchema = new Schema(
  {
    studyTitle: { type: String, required: true },
    studyDescription: { type: String, default: '' },
    protocolNumber: String,
    sponsor: String,
    phase: String,
    indication: String,
    objectives: String,
    documents: { type: [Schema.Types.Mixed], default: [] },
    visits: { type: [Schema.Types.Mixed], default: [] },
    eligibility: { type: [Schema.Types.Mixed], default: [] },
    findings: { type: [Schema.Types.Mixed], default: [] },
    status: { type: String, enum: ['draft', 'reviewed', 'final'], default: 'draft' },
    // Denormalized counts so the list endpoint never has to load the full
    // visits tree (a study can carry 1500+ fields).
    visitCount: { type: Number, default: 0 },
    fieldCount: { type: Number, default: 0 },
    buildOptions: { type: Schema.Types.Mixed },
    templateId: String,
    dateFormatPreference: String,
    // Vector-ready (Phase 3, unused for now).
    embedding: { type: [Number], default: undefined },
    embeddingModel: String,
    embeddingText: String,
    embeddingUpdatedAt: Date,
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

export const StudyDoc = mongoose.model('Study', StudySchema);
