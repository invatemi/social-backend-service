import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { extractBearer } from './extract-bearer.js';
import { AuthenticatedRequest, UserJwtPayload } from './types.js';

export interface UserContextOptions {
  getJwtSecret: () => string;
  clockToleranceSec?: number;
}

/** Validates user JWT and populates req.user; rejects spoofed x-user-id headers. */
export const createUserContextMiddleware = (options: UserContextOptions) => {
  const clockTolerance = options.clockToleranceSec ?? 30;

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    const token = extractBearer(req.headers.authorization);
    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized: missing token',
      });
      return;
    }

    try {
      const payload = jwt.verify(token, options.getJwtSecret(), {
        clockTolerance,
      }) as UserJwtPayload;

      if (payload.typ === 'service') {
        res.status(403).json({
          success: false,
          message: 'Forbidden: service token cannot be used for user context',
        });
        return;
      }

      if (!payload.userId || !Number.isInteger(payload.userId) || payload.userId <= 0) {
        res.status(403).json({
          success: false,
          message: 'Forbidden: invalid user token',
        });
        return;
      }

      const headerUserId = req.headers['x-user-id'];
      if (headerUserId && String(payload.userId) !== String(headerUserId)) {
        res.status(403).json({
          success: false,
          message: 'Forbidden: identity mismatch',
        });
        return;
      }

      req.user = { userId: payload.userId, role: payload.role };
      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json({ success: false, message: 'Unauthorized: token expired' });
        return;
      }
      if (error instanceof jwt.JsonWebTokenError) {
        res.status(403).json({ success: false, message: 'Forbidden: invalid token' });
        return;
      }
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  };
};
