import type { Logger } from 'pino';
import { AppError } from '../../common/errors/app-error.js';
import type { PasswordHasher } from '../../common/security/password-hasher.js';
import { publicId, randomToken, sha256, type AccessTokenService } from '../../common/security/tokens.js';
import { mongoose } from '../../infrastructure/database/mongodb/mongoose.js';
import { UserModel, type UserDocument } from '../users/user.model.js';
import { toUserDto } from '../users/user.schemas.js';
import { PasswordResetModel } from './password-reset.model.js';
import { PREVIOUS_TOKEN_HASHES_KEPT, SessionModel, type SessionDocument } from './session.model.js';

const REFRESH_TOKEN_FORMAT = /^(ses_[a-f0-9]{20})\.([A-Za-z0-9_-]{43})$/;
const RESET_TOKEN_TTL_MS = 30 * 60_000;
const { trusted } = mongoose;

export interface AuthServiceDeps {
  hasher: PasswordHasher;
  tokens: AccessTokenService;
  refreshTokenTtlDays: number;
  logger: Logger;
  now?: () => Date;
}

export interface SessionGrant {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: ReturnType<typeof toUserDto>;
}

export interface RegisterInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string | undefined;
  password: string;
}

function isDuplicateKey(err: unknown): boolean {
  return (err as { code?: number }).code === 11000;
}

function passwordMentionsEmail(password: string, email: string): boolean {
  const local = email.split('@')[0] ?? '';
  return local.length >= 4 && password.toLowerCase().includes(local.toLowerCase());
}

export function createAuthService(deps: AuthServiceDeps) {
  const { hasher, tokens, logger } = deps;
  const now = deps.now ?? (() => new Date());
  const refreshTtlMs = deps.refreshTokenTtlDays * 24 * 60 * 60_000;

  async function grant(user: UserDocument, sessionId: string, refreshToken: string, expiresAt: Date): Promise<SessionGrant> {
    const access = await tokens.issue({ userId: user.publicId, sessionId, roles: user.roles });
    return {
      accessToken: access.token,
      tokenType: 'Bearer',
      expiresIn: access.expiresIn,
      refreshToken,
      refreshExpiresAt: expiresAt,
      user: toUserDto(user),
    };
  }

  async function startSession(user: UserDocument, userAgent: string): Promise<SessionGrant> {
    const sessionId = publicId('ses');
    const refreshToken = `${sessionId}.${randomToken()}`;
    const time = now();
    const expiresAt = new Date(time.getTime() + refreshTtlMs);
    await SessionModel.create({
      sessionId,
      userId: user.publicId,
      refreshTokenHash: sha256(refreshToken),
      previousTokenHashes: [],
      userAgent: userAgent.slice(0, 200),
      createdAt: time,
      lastUsedAt: time,
      expiresAt,
    });
    return grant(user, sessionId, refreshToken, expiresAt);
  }

  async function revokeSessions(filter: Record<string, unknown>, reason: NonNullable<SessionDocument['revokeReason']>) {
    await SessionModel.updateMany({ ...filter, revokedAt: null }, { $set: { revokedAt: now(), revokeReason: reason } });
  }

  async function setPassword(userId: string, password: string) {
    const passwordHash = await hasher.hash(password);
    await UserModel.updateOne({ publicId: userId }, { $set: { passwordHash, passwordChangedAt: now() } });
  }

  return {
    async register(input: RegisterInput, userAgent: string): Promise<SessionGrant> {
      if (passwordMentionsEmail(input.password, input.email)) {
        throw new AppError('VALIDATION_FAILED', { details: [{ path: 'password', message: 'must not contain your email name' }] });
      }
      let user: UserDocument;
      try {
        const created = await UserModel.create({
          publicId: publicId('usr'),
          email: input.email,
          phone: input.phone ?? null,
          firstName: input.firstName,
          lastName: input.lastName,
          passwordHash: await hasher.hash(input.password),
        });
        user = created.toObject();
      } catch (err) {
        if (isDuplicateKey(err)) throw new AppError('AUTH_REGISTRATION_CONFLICT');
        throw err;
      }
      logger.info({ userId: user.publicId }, 'user registered');
      return startSession(user, userAgent);
    },

    async login(email: string, password: string, userAgent: string): Promise<SessionGrant> {
      const user = await UserModel.findOne({ email }).lean<UserDocument>();
      if (!user) {
        await hasher.verifyDummy(password);
        throw new AppError('AUTH_INVALID_CREDENTIALS');
      }
      const valid = await hasher.verify(user.passwordHash, password);
      if (!valid || user.status !== 'ACTIVE') throw new AppError('AUTH_INVALID_CREDENTIALS');
      return startSession(user, userAgent);
    },

    async refresh(refreshToken: string | undefined, userAgent: string): Promise<SessionGrant> {
      const match = refreshToken ? REFRESH_TOKEN_FORMAT.exec(refreshToken) : null;
      if (!refreshToken || !match) throw new AppError('AUTH_SESSION_EXPIRED');
      const sessionId = match[1]!;
      const presentedHash = sha256(refreshToken);
      const nextToken = `${sessionId}.${randomToken()}`;
      const time = now();

      // Atomic compare-and-swap: of two concurrent refreshes with the same token, only one wins.
      const rotated = await SessionModel.findOneAndUpdate(
        { sessionId, refreshTokenHash: presentedHash, revokedAt: null, expiresAt: trusted({ $gt: time }) },
        {
          $set: { refreshTokenHash: sha256(nextToken), lastUsedAt: time, userAgent: userAgent.slice(0, 200) },
          $push: { previousTokenHashes: { $each: [presentedHash], $slice: -PREVIOUS_TOKEN_HASHES_KEPT } },
        },
        { returnDocument: 'after' },
      ).lean<SessionDocument>();

      if (!rotated) {
        const session = await SessionModel.findOne({ sessionId }).lean<SessionDocument>();
        if (session && !session.revokedAt && session.previousTokenHashes.includes(presentedHash)) {
          await revokeSessions({ sessionId }, 'REUSE_DETECTED');
          logger.warn({ userId: session.userId, sessionId }, 'refresh token reuse detected; session revoked');
        }
        throw new AppError('AUTH_SESSION_EXPIRED');
      }

      const user = await UserModel.findOne({ publicId: rotated.userId }).lean<UserDocument>();
      if (!user || user.status !== 'ACTIVE') {
        await revokeSessions({ sessionId }, 'REVOKED_BY_USER');
        throw new AppError('AUTH_SESSION_EXPIRED');
      }
      return grant(user, sessionId, nextToken, rotated.expiresAt);
    },

    async logout(refreshToken: string | undefined): Promise<void> {
      const match = refreshToken ? REFRESH_TOKEN_FORMAT.exec(refreshToken) : null;
      if (!refreshToken || !match) return;
      await SessionModel.updateOne(
        { sessionId: match[1]!, refreshTokenHash: sha256(refreshToken), revokedAt: null },
        { $set: { revokedAt: now(), revokeReason: 'LOGOUT' } },
      );
    },

    async logoutAll(userId: string): Promise<void> {
      await revokeSessions({ userId }, 'LOGOUT_ALL');
    },

    async isSessionActive(userId: string, sessionId: string): Promise<boolean> {
      const count = await SessionModel.countDocuments({ sessionId, userId, revokedAt: null, expiresAt: trusted({ $gt: now() }) });
      return count > 0;
    },

    async listSessions(userId: string, currentSessionId: string) {
      const sessions = await SessionModel.find({ userId, revokedAt: null, expiresAt: trusted({ $gt: now() }) })
        .sort({ lastUsedAt: -1 })
        .limit(50)
        .lean<SessionDocument[]>();
      return sessions.map((session) => ({
        id: session.sessionId,
        userAgent: session.userAgent,
        createdAt: session.createdAt.toISOString(),
        lastUsedAt: session.lastUsedAt.toISOString(),
        current: session.sessionId === currentSessionId,
      }));
    },

    async revokeSession(userId: string, sessionId: string): Promise<void> {
      const result = await SessionModel.updateOne(
        { userId, sessionId, revokedAt: null },
        { $set: { revokedAt: now(), revokeReason: 'REVOKED_BY_USER' } },
      );
      if (result.matchedCount === 0) throw new AppError('RESOURCE_NOT_FOUND');
    },

    /** Returns the raw token (for the sandbox delivery channel) or null; callers respond identically either way. */
    async requestPasswordReset(email: string): Promise<string | null> {
      const user = await UserModel.findOne({ email, status: 'ACTIVE' }).lean<UserDocument>();
      if (!user) return null;
      await PasswordResetModel.deleteMany({ userId: user.publicId, usedAt: null });
      const token = randomToken();
      const time = now();
      await PasswordResetModel.create({
        tokenHash: sha256(token),
        userId: user.publicId,
        createdAt: time,
        expiresAt: new Date(time.getTime() + RESET_TOKEN_TTL_MS),
      });
      logger.info({ userId: user.publicId }, 'password reset requested');
      return token;
    },

    async resetPassword(token: string, password: string): Promise<void> {
      const time = now();
      const reset = await PasswordResetModel.findOneAndUpdate(
        { tokenHash: sha256(token), usedAt: null, expiresAt: trusted({ $gt: time }) },
        { $set: { usedAt: time } },
        { returnDocument: 'after' },
      ).lean();
      if (!reset) throw new AppError('AUTH_RESET_TOKEN_INVALID');
      const user = await UserModel.findOne({ publicId: reset.userId }).lean<UserDocument>();
      if (!user) throw new AppError('AUTH_RESET_TOKEN_INVALID');
      if (passwordMentionsEmail(password, user.email)) {
        throw new AppError('VALIDATION_FAILED', { details: [{ path: 'password', message: 'must not contain your email name' }] });
      }
      await setPassword(user.publicId, password);
      await revokeSessions({ userId: user.publicId }, 'PASSWORD_RESET');
      logger.info({ userId: user.publicId }, 'password reset completed; sessions revoked');
    },

    async changePassword(userId: string, currentSessionId: string, currentPassword: string, newPassword: string): Promise<void> {
      const user = await UserModel.findOne({ publicId: userId }).lean<UserDocument>();
      if (!user || !(await hasher.verify(user.passwordHash, currentPassword))) {
        throw new AppError('AUTH_INVALID_CREDENTIALS', { message: 'The current password is incorrect.' });
      }
      if (currentPassword === newPassword) {
        throw new AppError('VALIDATION_FAILED', { details: [{ path: 'newPassword', message: 'must differ from the current password' }] });
      }
      if (passwordMentionsEmail(newPassword, user.email)) {
        throw new AppError('VALIDATION_FAILED', { details: [{ path: 'newPassword', message: 'must not contain your email name' }] });
      }
      await setPassword(userId, newPassword);
      await revokeSessions({ userId, sessionId: trusted({ $ne: currentSessionId }) }, 'PASSWORD_CHANGED');
      logger.info({ userId }, 'password changed; other sessions revoked');
    },
  };
}

export type AuthService = ReturnType<typeof createAuthService>;
