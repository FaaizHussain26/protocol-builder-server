import type { Request, Response, NextFunction } from 'express';
import type { ZodType } from 'zod';
import { HttpError } from './errorHandler';

// Validate and coerce req.body against a Zod schema; 400 on failure.
export const validateBody =
  <T>(schema: ZodType<T>) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      next(new HttpError(400, result.error.issues.map((i) => i.message).join('; ')));
      return;
    }
    req.body = result.data;
    next();
  };
