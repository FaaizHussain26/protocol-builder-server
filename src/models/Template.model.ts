import mongoose, { Schema } from 'mongoose';

const TemplateSchema = new Schema(
  {
    name: { type: String, required: true },
    description: String,
    preferences: { type: Schema.Types.Mixed, default: {} },
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

export const TemplateDoc = mongoose.model('Template', TemplateSchema);
