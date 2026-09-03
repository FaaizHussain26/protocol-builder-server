import mongoose, { Schema } from 'mongoose';

// One record of entered data — the unit that gets submitted and signed.
// A non-repeatable form's submission always holds exactly one of these; a
// repeatable form (a log/table, e.g. Adverse Events) holds one per row.
const RecordSchema = new Schema(
  {
    id: { type: String, required: true },
    // { [StudyField.id]: value } — value shape depends on the field type
    // (string/number/boolean/string[] for multiselect/etc.), hence Mixed.
    values: { type: Schema.Types.Mixed, default: {} },
    status: { type: String, enum: ['in-progress', 'submitted', 'signed'], default: 'in-progress' },
    submittedBy: { type: Schema.Types.Mixed },
    submittedAt: Date,
    signedBy: { type: Schema.Types.Mixed },
    signedAt: Date,
  },
  { _id: false },
);

// One form, for one visit instance, for one subject. `repeatable` is
// snapshotted from StudyForm at creation so the UI/validation know the shape
// without re-reading the build.
const FormSubmissionSchema = new Schema(
  {
    studyId: { type: Schema.Types.ObjectId, ref: 'Study', required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    visitInstanceId: { type: Schema.Types.ObjectId, ref: 'VisitInstance', required: true, index: true },
    formId: { type: String, required: true }, // StudyForm.id within the study
    formName: { type: String, required: true },
    repeatable: { type: Boolean, default: false },
    records: { type: [RecordSchema], default: [] },
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

FormSubmissionSchema.index({ visitInstanceId: 1, formId: 1 }, { unique: true });

export const FormSubmissionDoc = mongoose.model('FormSubmission', FormSubmissionSchema);
