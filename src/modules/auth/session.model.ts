import { mongoose } from '../../infrastructure/database/mongodb/mongoose.js';

/**
 * One document per signed-in device (a refresh-token family). Rotation
 * replaces `refreshTokenHash`; recent hashes are kept so a replayed token can
 * be recognised and the whole session revoked.
 */
export interface SessionDocument {
  sessionId: string;
  userId: string;
  refreshTokenHash: string;
  previousTokenHashes: string[];
  userAgent: string;
  createdAt: Date;
  lastUsedAt: Date;
  expiresAt: Date;
  revokedAt?: Date | null;
  revokeReason?: 'LOGOUT' | 'LOGOUT_ALL' | 'REUSE_DETECTED' | 'PASSWORD_CHANGED' | 'PASSWORD_RESET' | 'REVOKED_BY_USER' | null;
}

export const PREVIOUS_TOKEN_HASHES_KEPT = 5;

const sessionSchema = new mongoose.Schema<SessionDocument>(
  {
    sessionId: { type: String, required: true },
    userId: { type: String, required: true },
    refreshTokenHash: { type: String, required: true },
    previousTokenHashes: { type: [String], default: [] },
    userAgent: { type: String, default: '' },
    createdAt: { type: Date, required: true },
    lastUsedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    revokeReason: { type: String, default: null },
  },
  { collection: 'sessions', versionKey: false },
);

sessionSchema.index({ sessionId: 1 }, { unique: true });
sessionSchema.index({ userId: 1, revokedAt: 1 });
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const SessionModel = mongoose.model<SessionDocument>('Session', sessionSchema);
