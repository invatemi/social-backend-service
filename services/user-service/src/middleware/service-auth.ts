import { createServiceAuthMiddleware } from '../../shared/security/index.js';
import { getConfig } from '../config/env';

const isInternalApiAuthEnabled = (): boolean => process.env.INTERNAL_API_AUTH_ENABLED !== 'false';

/** Protects /api/users/internal/* with service JWT validation. */
export const serviceAuthMiddleware = createServiceAuthMiddleware({
  getJwtSecret: () => process.env.JWT_SECRET ?? getConfig().jwtSecret,
  expectedAudience: 'user-service',
  requiredScope: 'internal:users:read',
  isEnabled: isInternalApiAuthEnabled,
});
