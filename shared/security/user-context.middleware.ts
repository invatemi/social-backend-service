import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { extractBearer } from './extract-bearer.js';
import { AuthenticatedRequest } from './types.js';
import { UserJwtClaimError, verifyUserJwt, type VerifyUserJwtOptions } from './verify-user-jwt.js';

export type UserContextOptions = VerifyUserJwtOptions;

/** Validates user JWT and populates req.user; rejects spoofed x-user-id headers. */
export const createUserContextMiddleware = (options: UserContextOptions) => {
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
      const payload = verifyUserJwt(token, options);

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
      if (error instanceof UserJwtClaimError) {
        res.status(403).json({ success: false, message: error.message });
        return;
      }
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
