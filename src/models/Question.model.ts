import mongoose, { Schema } from 'mongoose';

// User-created "Plan Mode" questions. Persisted so they reappear the next time
// a template is created.
const QuestionSchema = new Schema(
  {
    text: { type: String, required: true },
    answerType: { type: String, default: 'text' },
    group: { type: String, default: 'Custom' },
    options: { type: [String], default: undefined },
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

export const QuestionDoc = mongoose.model('Question', QuestionSchema);
