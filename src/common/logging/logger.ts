import { pino, type Logger, type LoggerOptions } from 'pino';

/**
 * Credential-bearing fields are removed before a log line is written. Keep this
 * list in sync with docs/SECURITY.md ("Sensitive data in logs").
 */
export const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.headers["x-api-key"]',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.currentPassword',
  '*.pin',
  '*.otp',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.secret',
  '*.apiKey',
  '*.privateKey',
  '*.cardNumber',
  '*.cvv',
];

export function createLogger(options: { level: string; pretty?: boolean }): Logger {
  const config: LoggerOptions = {
    level: options.level,
    base: { service: 'mini-payment-server' },
    redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
  if (options.pretty) {
    config.transport = { target: 'pino-pretty', options: { singleLine: true } };
  }
  return pino(config);
}
