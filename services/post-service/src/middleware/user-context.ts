import { createUserContextMiddleware, type AuthenticatedRequest } from '../../shared/security/index.js';
import { getConfig } from '../config/env';

export type KrakenDRequest = AuthenticatedRequest;

const parseClaimsStrict = (): boolean => process.env.JWT_CLAIMS_STRICT === 'true';

export const userContextMiddleware = createUserContextMiddleware({
  getJwtSecret: () => process.env.JWT_SECRET ?? getConfig().jwtSecret,
  clockToleranceSec: Number(process.env.JWT_CLOCK_TOLERANCE_SEC ?? 30),
  expectedIssuer: process.env.JWT_ISSUER ?? 'social-auth-service',
  expectedAudience: process.env.JWT_AUDIENCE ?? 'social-api',
  claimsStrict: parseClaimsStrict(),
});

/** @deprecated Use userContextMiddleware */
export const krakendAuthMiddleware = userContextMiddleware;
