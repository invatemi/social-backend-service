import { createUserContextMiddleware, type AuthenticatedRequest } from '../../shared/security/index.js';
import { getConfig } from '../config/env';

export type KrakenDRequest = AuthenticatedRequest;

/** Validates user JWT and attaches req.user (ignores untrusted x-user-id unless it matches). */
export const userContextMiddleware = createUserContextMiddleware({
  getJwtSecret: () => process.env.JWT_SECRET ?? getConfig().jwtSecret,
});

/** @deprecated Use userContextMiddleware */
export const krakendAuthMiddleware = userContextMiddleware;
