import { mongoose } from '../../infrastructure/database/mongodb/mongoose.js';

export interface PasswordResetDocument {
  tokenHash: string;
  userId: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt?: Date | null;
}

const passwordResetSchema = new mongoose.Schema<PasswordResetDocument>(
  {
    tokenHash: { type: String, required: true },
    userId: { type: String, required: true },
    createdAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { collection: 'password_resets', versionKey: false },
);

passwordResetSchema.index({ tokenHash: 1 }, { unique: true });
passwordResetSchema.index({ userId: 1 });
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const PasswordResetModel = mongoose.model<PasswordResetDocument>('PasswordReset', passwordResetSchema);
