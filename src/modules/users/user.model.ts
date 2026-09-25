import { mongoose } from '../../infrastructure/database/mongodb/mongoose.js';

export const USER_ROLES = ['USER', 'SUPPORT', 'OPERATIONS', 'ADMIN', 'AUDITOR'] as const;

/** Sandbox caps; real limits would come from risk and compliance rules (BE-022). */
export const PAYMENT_LIMIT_CEILINGS = { perTransactionMinor: 10_000_000, dailyMinor: 20_000_000 } as const;

export const DEFAULT_PREFERENCES = {
  notifications: {
    channels: { push: false, email: true, sms: false },
    events: { payments: true, requests: true, promotions: false, security: true },
  },
  payments: { perTransactionLimitMinor: 1_000_000, dailyLimitMinor: 2_500_000, hideBalance: false },
};

export interface UserPreferences {
  notifications: {
    channels: { push: boolean; email: boolean; sms: boolean };
    events: { payments: boolean; requests: boolean; promotions: boolean; security: boolean };
  };
  payments: { perTransactionLimitMinor: number; dailyLimitMinor: number; hideBalance: boolean };
}

export interface UserDocument {
  publicId: string;
  email: string;
  /** Lowercase sign-in handle; null only for rows created before migration 0004 ran. */
  username?: string | null;
  phone?: string | null;
  firstName: string;
  lastName: string;
  passwordHash: string;
  passwordChangedAt?: Date | null;
  roles: string[];
  status: 'ACTIVE' | 'DISABLED';
  avatar?: { avatarId: string; contentType: string; updatedAt: Date } | null;
  preferences: UserPreferences;
  /** Shared demo login: profile, password and sessions are read-only. */
  isDemo: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new mongoose.Schema<UserDocument>(
  {
    publicId: { type: String, required: true },
    email: { type: String, required: true },
    username: { type: String, default: null },
    phone: { type: String, default: null },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    passwordHash: { type: String, required: true },
    passwordChangedAt: { type: Date, default: null },
    roles: { type: [String], enum: USER_ROLES, default: ['USER'] },
    status: { type: String, enum: ['ACTIVE', 'DISABLED'], default: 'ACTIVE' },
    avatar: {
      type: new mongoose.Schema({ avatarId: String, contentType: String, updatedAt: Date }, { _id: false }),
      default: null,
    },
    preferences: {
      type: new mongoose.Schema(
        {
          notifications: {
            channels: { push: Boolean, email: Boolean, sms: Boolean },
            events: { payments: Boolean, requests: Boolean, promotions: Boolean, security: Boolean },
          },
          payments: { perTransactionLimitMinor: Number, dailyLimitMinor: Number, hideBalance: Boolean },
        },
        { _id: false },
      ),
      default: () => structuredClone(DEFAULT_PREFERENCES),
    },
    isDemo: { type: Boolean, default: false },
  },
  { collection: 'users', timestamps: true, versionKey: false },
);

userSchema.index({ publicId: 1 }, { unique: true });
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ username: 1 }, { unique: true, partialFilterExpression: { username: { $type: 'string' } } });
userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });

export const UserModel = mongoose.model<UserDocument>('User', userSchema);
