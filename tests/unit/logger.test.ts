import { Writable } from 'node:stream';
import { pino } from 'pino';
import { describe, expect, it } from 'vitest';
import { REDACTED_PATHS } from '../../src/common/logging/logger.js';

function captureLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  const logger = pino({ redact: { paths: REDACTED_PATHS, censor: '[REDACTED]' } }, stream);
  return { logger, lines };
}

describe('log redaction', () => {
  it('removes credentials and payment secrets from structured logs', () => {
    const { logger, lines } = captureLogger();
    logger.info(
      {
        req: { headers: { authorization: 'Bearer abc.def.ghi', cookie: 'rt=xyz' } },
        body: { password: 'hunter2', pin: '1234', otp: '987654', refreshToken: 'rt-secret', amountMinor: 1023 },
      },
      'test',
    );
    const output = lines.join('');
    for (const secret of ['abc.def.ghi', 'rt=xyz', 'hunter2', '"1234"', '987654', 'rt-secret']) {
      expect(output).not.toContain(secret);
    }
    expect(output).toContain('"amountMinor":1023');
    expect(output).toContain('[REDACTED]');
  });
});
