import mongoose, { Schema } from 'mongoose';

// One subject's occurrence of a StudyVisit (the build's visit/folder is a
// schema — this is a real, dated instance of it for one subject). visitName/
// arm are snapshotted from the study at creation time since StudyVisit lives
// as embedded Mixed data on the Study document, not a referenceable collection.
const VisitInstanceSchema = new Schema(
  {
    studyId: { type: Schema.Types.ObjectId, ref: 'Study', required: true, index: true },
    subjectId: { type: Schema.Types.ObjectId, ref: 'Subject', required: true, index: true },
    visitId: { type: String, required: true }, // StudyVisit.id within the study
    visitName: { type: String, required: true },
    arm: String,
    status: { type: String, enum: ['scheduled', 'completed', 'missed'], default: 'scheduled' },
    scheduledDate: Date,
    completedDate: Date,
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

export const VisitInstanceDoc = mongoose.model('VisitInstance', VisitInstanceSchema);
