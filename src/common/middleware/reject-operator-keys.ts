import type { RequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';

const MAX_DEPTH = 20;

function findOperatorKey(value: unknown, path: string, depth: number): string | undefined {
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return undefined;
  for (const [key, child] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key;
    if (key.startsWith('$') || key.includes('.') || key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return childPath;
    }
    const nested = findOperatorKey(child, childPath, depth + 1);
    if (nested) return nested;
  }
  return undefined;
}

/**
 * Defence in depth against NoSQL operator injection and prototype pollution.
 * Schema validation per route remains the primary control.
 */
export const rejectOperatorKeys: RequestHandler = (req, _res, next) => {
  const offending = findOperatorKey(req.body, '', 0) ?? findOperatorKey(req.query, '', 0);
  if (offending) {
    next(new AppError('VALIDATION_FAILED', { details: [{ path: offending, message: 'reserved key is not allowed' }] }));
    return;
  }
  next();
};
