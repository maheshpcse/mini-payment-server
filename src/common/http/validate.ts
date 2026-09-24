import type { z } from 'zod';
import { AppError } from '../errors/app-error.js';

export function parseWith<T extends z.ZodType>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input ?? {});
  if (!result.success) {
    throw new AppError('VALIDATION_FAILED', {
      details: result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    });
  }
  return result.data;
}
