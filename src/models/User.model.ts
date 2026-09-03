import mongoose, { Schema } from 'mongoose';

// A real per-user account. Replaces the old shared-passcode gate — this is the
// identity ("who") that Phase 4's audit trail attributes changes to.
const UserSchema = new Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, index: true },
    passwordHash: { type: String, required: true },
    // 'admin' manages users; 'builder' can build/review eSources; 'site' is
    // scoped to data entry once Phase 3 adds real submissions.
    role: { type: String, enum: ['admin', 'builder', 'site'], default: 'site' },
    active: { type: Boolean, default: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        ret.id = String(ret._id);
        delete ret._id;
        delete ret.__v;
        delete ret.passwordHash;
        return ret;
      },
    },
  },
);

export const UserDoc = mongoose.model('User', UserSchema);
