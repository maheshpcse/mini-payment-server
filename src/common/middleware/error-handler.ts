import type { ErrorRequestHandler, RequestHandler } from 'express';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import { AppError, type ErrorResponseBody } from '../errors/app-error.js';

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(new AppError('ROUTE_NOT_FOUND'));
};

function hasType(err: unknown, type: string): boolean {
  return typeof err === 'object' && err !== null && (err as { type?: unknown }).type === type;
}

function normalize(err: unknown): AppError {
  if (err instanceof AppError) return err;
  if (err instanceof ZodError) {
    return new AppError('VALIDATION_FAILED', {
      details: err.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  if (hasType(err, 'entity.parse.failed')) return new AppError('REQUEST_MALFORMED', { cause: err });
  if (hasType(err, 'entity.too.large')) return new AppError('REQUEST_TOO_LARGE', { cause: err });
  return new AppError('INTERNAL_ERROR', { cause: err });
}

/**
 * Converts every failure into the documented error contract. Stack traces and
 * internal messages are logged server-side only.
 */
export function createErrorHandler(logger: Logger): ErrorRequestHandler {
  return (err, req, res, _next) => {
    const appError = normalize(err);
    const requestId = req.requestId ?? 'unknown';

    if (appError.status >= 500) {
      logger.error({ err, requestId, code: appError.code }, 'request failed');
    } else {
      logger.warn({ requestId, code: appError.code }, 'request rejected');
    }

    const body: ErrorResponseBody = {
      error: { code: appError.code, message: appError.message, requestId },
    };
    if (appError.details !== undefined) body.error.details = appError.details;

    res.status(appError.status).json(body);
  };
}
