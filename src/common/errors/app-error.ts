import { ERROR_CODES, type ErrorCode } from './error-codes.js';

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(code: ErrorCode, options: { message?: string; details?: unknown; cause?: unknown } = {}) {
    super(options.message ?? ERROR_CODES[code].message, { cause: options.cause });
    this.name = 'AppError';
    this.code = code;
    this.status = ERROR_CODES[code].status;
    this.details = options.details;
  }
}

export interface ErrorResponseBody {
  error: {
    code: ErrorCode;
    message: string;
    requestId: string;
    details?: unknown;
  };
}
