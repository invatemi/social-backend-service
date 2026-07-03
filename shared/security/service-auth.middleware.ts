import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { extractBearer } from './extract-bearer.js';
import { AuthenticatedRequest, ServiceJwtPayload } from './types.js';

export interface ServiceAuthOptions {
  getJwtSecret: () => string;
  expectedAudience: string;
  requiredScope?: string;
  isEnabled?: () => boolean;
  clockToleranceSec?: number;
}

/** Validates service-to-service JWT on internal API routes. */
export const createServiceAuthMiddleware = (options: ServiceAuthOptions) => {
  const clockTolerance = options.clockToleranceSec ?? 30;

  return (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (options.isEnabled && !options.isEnabled()) {
      console.warn('[Security] INTERNAL_API_AUTH_ENABLED=false — internal route is unauthenticated');
      next();
      return;
    }

    const token = extractBearer(req.headers.authorization);
    if (!token) {
      res.status(401).json({
        success: false,
        message: 'Unauthorized: missing service token',
      });
      return;
    }

    try {
      const payload = jwt.verify(token, options.getJwtSecret(), {
        algorithms: ['HS256'],
        clockTolerance,
      }) as ServiceJwtPayload;

      if (payload.typ !== 'service') {
        res.status(403).json({
          success: false,
          message: 'Forbidden: user token cannot be used for internal API',
        });
        return;
      }

      if (payload.aud !== options.expectedAudience) {
        res.status(403).json({
          success: false,
          message: 'Forbidden: invalid token audience',
        });
        return;
      }

      const scopes = Array.isArray(payload.scope) ? payload.scope : [];
      if (options.requiredScope && !scopes.includes(options.requiredScope)) {
        res.status(403).json({
          success: false,
          message: 'Forbidden: insufficient service scope',
        });
        return;
      }

      req.service = { id: payload.sub, scopes };
      next();
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        res.status(401).json({ success: false, message: 'Unauthorized: service token expired' });
        return;
      }
      if (error instanceof jwt.JsonWebTokenError) {
        res.status(403).json({ success: false, message: 'Forbidden: invalid service token' });
        return;
      }
      res.status(500).json({ success: false, message: 'Internal server error' });
    }
  };
};
