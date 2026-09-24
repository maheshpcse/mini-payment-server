import { Redis } from 'ioredis';
import type { Logger } from 'pino';
import { withTimeout } from '../../../common/utils/with-timeout.js';
import type { DependencyCheck } from '../../../modules/health/health.types.js';

export interface RedisConnection {
  client: Redis;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  readinessCheck: DependencyCheck;
}

/**
 * Redis holds only short-lived, reconstructible state (rate limits, OTP
 * attempts, idempotency cache, queues). It is never the source of truth for
 * financial records.
 */
export function createRedisConnection(options: { url: string; logger: Logger }): RedisConnection {
  const { url, logger } = options;
  const client = new Redis(url, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy: (times) => Math.min(times * 500, 10_000),
  });

  let lastStatus = '';
  const logStatus = (status: string, level: 'info' | 'warn') => {
    if (status === lastStatus) return;
    lastStatus = status;
    logger[level]({ status }, 'redis status changed');
  };
  client.on('ready', () => logStatus('ready', 'info'));
  client.on('error', (err: Error) => logStatus(`error: ${err.message}`, 'warn'));

  return {
    client,
    async connect() {
      try {
        await client.connect();
      } catch (err) {
        // ioredis keeps reconnecting in the background; readiness reports the outage.
        logger.error({ err: { message: (err as Error).message } }, 'redis initial connection failed');
      }
    },
    async disconnect() {
      client.disconnect();
    },
    readinessCheck: {
      name: 'redis',
      async check() {
        if (client.status !== 'ready') throw new Error(`status ${client.status}`);
        await withTimeout(client.ping(), 2_000, 'redis ping');
      },
    },
  };
}
