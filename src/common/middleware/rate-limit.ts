import type { Request, RequestHandler } from 'express';
import type { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { AppError } from '../errors/app-error.js';

export interface RateLimitHit {
  count: number;
  resetInMs: number;
}

export interface RateLimitStore {
  hit(key: string, windowMs: number): Promise<RateLimitHit>;
}

// INCR and set the expiry atomically on the first hit of a window (fixed window).
const HIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then redis.call('PEXPIRE', KEYS[1], ARGV[1]) end
local ttl = redis.call('PTTL', KEYS[1])
return { count, ttl }
`;

export function createRedisRateLimitStore(client: Redis, prefix = 'rl:'): RateLimitStore {
  return {
    async hit(key, windowMs) {
      const [count, ttl] = (await client.eval(HIT_SCRIPT, 1, `${prefix}${key}`, String(windowMs))) as [number, number];
      return { count, resetInMs: ttl > 0 ? ttl : windowMs };
    },
  };
}

export function createMemoryRateLimitStore(now: () => number = Date.now): RateLimitStore {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return {
    async hit(key, windowMs) {
      const time = now();
      let entry = windows.get(key);
      if (!entry || entry.resetAt <= time) {
        entry = { count: 0, resetAt: time + windowMs };
        windows.set(key, entry);
      }
      entry.count += 1;
      if (windows.size > 10_000) {
        for (const [storedKey, value] of windows) if (value.resetAt <= time) windows.delete(storedKey);
      }
      return { count: entry.count, resetInMs: entry.resetAt - time };
    },
  };
}

export interface RateLimitRule {
  name: string;
  limit: number;
  windowMs: number;
  /** Returns the bucket for the request, or undefined to skip this rule. */
  key(req: Request): string | undefined;
}

/**
 * Applies every rule; the first exhausted bucket rejects with 429 and
 * Retry-After. If the store is unavailable the request is allowed and the
 * outage is logged, so a Redis incident does not lock every user out.
 */
export function rateLimit(store: RateLimitStore, logger: Logger, rules: RateLimitRule[]): RequestHandler {
  return async (req, res, next) => {
    for (const rule of rules) {
      const bucket = rule.key(req);
      if (!bucket) continue;
      let hit: RateLimitHit;
      try {
        hit = await store.hit(`${rule.name}:${bucket}`, rule.windowMs);
      } catch (err) {
        logger.error({ err: { message: (err as Error).message }, rule: rule.name }, 'rate limit store unavailable; allowing request');
        continue;
      }
      if (hit.count > rule.limit) {
        res.setHeader('Retry-After', String(Math.max(1, Math.ceil(hit.resetInMs / 1000))));
        next(new AppError('RATE_LIMITED'));
        return;
      }
    }
    next();
  };
}
