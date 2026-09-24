import { loadConfig } from './env.js';

const LOCAL_HOST = /(^|@|\/\/)(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)([:/?]|$)/i;

/**
 * Stricter checks for a hosted deployment (Railway), on top of `loadConfig`.
 * Messages name variables and rules only; values are never included.
 */
export function validateDeploymentEnv(source: NodeJS.ProcessEnv): string[] {
  let config;
  try {
    config = loadConfig(source);
  } catch (err) {
    return [(err as Error).message];
  }

  const errors: string[] = [];
  if (config.NODE_ENV !== 'production') errors.push('NODE_ENV must be production');
  if (config.APP_ENV !== 'staging' && config.APP_ENV !== 'production') errors.push('APP_ENV must be staging or production');
  if (config.LOG_LEVEL === 'debug' || config.LOG_LEVEL === 'trace') errors.push('LOG_LEVEL must not be debug or trace');
  if (config.TRUST_PROXY_HOPS < 1) errors.push('TRUST_PROXY_HOPS must be at least 1 behind the Railway proxy');

  if (config.CORS_ORIGINS.length === 0) errors.push('CORS_ORIGINS must list the frontend origin(s)');
  for (const origin of config.CORS_ORIGINS) {
    let valid: boolean;
    try {
      const url = new URL(origin);
      valid = url.protocol === 'https:' && url.origin === origin;
    } catch {
      valid = false;
    }
    if (!valid) {
      errors.push('CORS_ORIGINS entries must be HTTPS origins without a path or trailing slash (e.g. https://user.github.io)');
      break;
    }
  }

  if (LOCAL_HOST.test(config.MONGODB_URI)) errors.push('MONGODB_URI must point to a hosted MongoDB, not localhost');
  if (config.MONGODB_URI.startsWith('mongodb://') && !/[?&]replicaSet=/.test(config.MONGODB_URI)) {
    errors.push('MONGODB_URI must use mongodb+srv:// or include replicaSet=… (transactions need a replica set)');
  }
  if (LOCAL_HOST.test(config.REDIS_URL)) errors.push('REDIS_URL must point to a hosted Redis, not localhost');
  return errors;
}
