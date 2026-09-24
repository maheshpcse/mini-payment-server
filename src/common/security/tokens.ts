import { createHash, createHmac, randomBytes } from 'node:crypto';
import { jwtVerify, SignJWT } from 'jose';

export const TOKEN_ISSUER = 'mini-payment-server';
export const TOKEN_AUDIENCE = 'mini-payment-app';

export interface AccessTokenClaims {
  userId: string;
  sessionId: string;
  roles: string[];
}

export interface AccessTokenService {
  issue(claims: AccessTokenClaims): Promise<{ token: string; expiresIn: number }>;
  verify(token: string): Promise<AccessTokenClaims | null>;
}

export function createAccessTokenService(options: { secret: string; ttlSeconds: number }): AccessTokenService {
  const key = new TextEncoder().encode(options.secret);
  return {
    async issue({ userId, sessionId, roles }) {
      const token = await new SignJWT({ sid: sessionId, roles })
        .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
        .setSubject(userId)
        .setIssuer(TOKEN_ISSUER)
        .setAudience(TOKEN_AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(`${options.ttlSeconds}s`)
        .sign(key);
      return { token, expiresIn: options.ttlSeconds };
    },
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key, { algorithms: ['HS256'], issuer: TOKEN_ISSUER, audience: TOKEN_AUDIENCE });
        if (typeof payload.sub !== 'string' || typeof payload.sid !== 'string' || !Array.isArray(payload.roles)) return null;
        return { userId: payload.sub, sessionId: payload.sid, roles: payload.roles.filter((role): role is string => typeof role === 'string') };
      } catch {
        return null;
      }
    },
  };
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Opaque, non-sequential external identifier such as `usr_4f0c…` (80 random bits). */
export function publicId(prefix: string): string {
  return `${prefix}_${randomBytes(10).toString('hex')}`;
}

/** Tokens are stored only as SHA-256 digests so a database leak does not expose usable tokens. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function hmac(secret: string, purpose: string, value: string): string {
  return createHmac('sha256', `${purpose}:${secret}`).update(value).digest('hex');
}
