import type { Request, Response, NextFunction } from 'express';
import { verifyToken, type TokenPayload } from '../services/auth.service';
import { HttpError } from './errorHandler';

// Augment Express's Request with the decoded token — id + role are all any
// route needs; handlers that need the full user record call getUserById.
declare module 'express-serve-static-core' {
  interface Request {
    user?: { id: string; role: TokenPayload['role'] };
  }
}

// Every route mounted behind this requires a valid Bearer token.
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.header('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    next(new HttpError(401, 'Not authenticated. Please log in.'));
    return;
  }
  const payload = verifyToken(token);
  req.user = { id: payload.sub, role: payload.role };
  next();
}

// Layer behind requireAuth to further restrict a route to specific roles.
export const requireRole =
  (...roles: TokenPayload['role'][]) =>
  (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new HttpError(403, 'You do not have permission to do that.'));
      return;
    }
    next();
  };
