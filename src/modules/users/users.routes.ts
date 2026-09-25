import express, { Router, type RequestHandler } from 'express';
import { AppError } from '../../common/errors/app-error.js';
import { parseWith } from '../../common/http/validate.js';
import { authOf } from '../../common/middleware/require-auth.js';
import { randomToken } from '../../common/security/tokens.js';
import { mongoose } from '../../infrastructure/database/mongodb/mongoose.js';
import { duplicateField } from '../auth/auth.service.js';
import { AvatarModel, type AvatarDocument } from './avatar.model.js';
import { PAYMENT_LIMIT_CEILINGS, UserModel, type UserDocument } from './user.model.js';
import { preferencesUpdateSchema, profileUpdateSchema, toUserDto, withDefaultPreferences } from './user.schemas.js';

export const AVATAR_MAX_BYTES = 512 * 1024;
const AVATAR_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
type AvatarType = (typeof AVATAR_TYPES)[number];
const AVATAR_ID = /^[A-Za-z0-9_-]{32}$/;

/** Trust the file signature, not the declared Content-Type. */
function sniffImage(data: Buffer): AvatarType | null {
  if (data.length >= 8 && data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (data.length >= 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length >= 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

async function loadUser(userId: string): Promise<UserDocument> {
  const user = await UserModel.findOne({ publicId: userId }).lean<UserDocument>();
  if (!user) throw new AppError('AUTH_SESSION_EXPIRED');
  return user;
}

const rejectDemo: RequestHandler = async (req, _res, next) => {
  if (await UserModel.exists({ publicId: authOf(req).userId, isDemo: true })) throw new AppError('DEMO_ACCOUNT_RESTRICTED');
  next();
};

export function createUsersRouter({ requireAuth }: { requireAuth: RequestHandler }): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/me', async (req, res) => {
    res.json({ data: toUserDto(await loadUser(authOf(req).userId)) });
  });

  router.patch('/me', rejectDemo, async (req, res) => {
    const { userId } = authOf(req);
    const update = parseWith(profileUpdateSchema, req.body);
    try {
      const user = await UserModel.findOneAndUpdate({ publicId: userId }, { $set: update }, { returnDocument: 'after' }).lean<UserDocument>();
      if (!user) throw new AppError('AUTH_SESSION_EXPIRED');
      res.json({ data: toUserDto(user) });
    } catch (err) {
      if ((err as { code?: number }).code === 11000) {
        if (duplicateField(err) === 'username') {
          throw new AppError('USERNAME_UNAVAILABLE', { details: [{ path: 'username', message: 'is already taken' }] });
        }
        throw new AppError('PROFILE_PHONE_UNAVAILABLE');
      }
      throw err;
    }
  });

  router.put(
    '/me/avatar',
    rejectDemo,
    express.raw({ type: () => true, limit: AVATAR_MAX_BYTES }),
    async (req, res) => {
      const { userId } = authOf(req);
      const declared = req.get('content-type')?.split(';')[0]?.trim().toLowerCase();
      if (!declared || !(AVATAR_TYPES as readonly string[]).includes(declared)) throw new AppError('UNSUPPORTED_MEDIA_TYPE');
      const data = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
      const detected = sniffImage(data);
      if (!detected || detected !== declared) {
        throw new AppError('UNSUPPORTED_MEDIA_TYPE', { message: 'Upload a PNG, JPEG or WebP image.' });
      }

      const avatarId = randomToken(24);
      const time = new Date();
      await AvatarModel.create({ avatarId, userId, contentType: detected, data, size: data.length, createdAt: time });
      const user = await UserModel.findOneAndUpdate(
        { publicId: userId },
        { $set: { avatar: { avatarId, contentType: detected, updatedAt: time } } },
        { returnDocument: 'after' },
      ).lean<UserDocument>();
      // Old images are unreachable once the profile points at the new id.
      await AvatarModel.deleteMany({ userId, avatarId: mongoose.trusted({ $ne: avatarId }) });
      if (!user) throw new AppError('AUTH_SESSION_EXPIRED');
      res.json({ data: toUserDto(user) });
    },
  );

  router.delete('/me/avatar', rejectDemo, async (req, res) => {
    const { userId } = authOf(req);
    const user = await UserModel.findOneAndUpdate({ publicId: userId }, { $set: { avatar: null } }, { returnDocument: 'after' }).lean<UserDocument>();
    await AvatarModel.deleteMany({ userId });
    if (!user) throw new AppError('AUTH_SESSION_EXPIRED');
    res.json({ data: toUserDto(user) });
  });

  router.get('/me/preferences', async (req, res) => {
    const user = await loadUser(authOf(req).userId);
    res.json({ data: { ...withDefaultPreferences(user.preferences), ceilings: PAYMENT_LIMIT_CEILINGS } });
  });

  router.patch('/me/preferences', async (req, res) => {
    const { userId } = authOf(req);
    const patch = parseWith(preferencesUpdateSchema, req.body);
    const current = withDefaultPreferences((await loadUser(userId)).preferences);
    const next = {
      notifications: {
        channels: { ...current.notifications.channels, ...patch.notifications?.channels },
        events: { ...current.notifications.events, ...patch.notifications?.events, security: true },
      },
      payments: { ...current.payments, ...patch.payments },
    };
    if (next.payments.perTransactionLimitMinor > next.payments.dailyLimitMinor) {
      throw new AppError('VALIDATION_FAILED', {
        details: [{ path: 'payments.perTransactionLimitMinor', message: 'must not exceed the daily limit' }],
      });
    }
    await UserModel.updateOne({ publicId: userId }, { $set: { preferences: next } });
    res.json({ data: { ...next, ceilings: PAYMENT_LIMIT_CEILINGS } });
  });

  return router;
}

/**
 * Public by unguessable id so <img> tags work without credentials; the id
 * changes on every upload, which also makes the response safely immutable.
 */
export function createAvatarsRouter(): Router {
  const router = Router();
  router.get('/:avatarId', async (req, res) => {
    if (!AVATAR_ID.test(req.params.avatarId)) throw new AppError('RESOURCE_NOT_FOUND');
    const avatar = await AvatarModel.findOne({ avatarId: req.params.avatarId }).lean<AvatarDocument>();
    if (!avatar) throw new AppError('RESOURCE_NOT_FOUND');
    res.setHeader('Content-Type', avatar.contentType);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'none'");
    const raw: unknown = avatar.data;
    res.send(raw instanceof mongoose.mongo.Binary ? Buffer.from(raw.buffer) : Buffer.from(raw as Buffer));
  });
  return router;
}
