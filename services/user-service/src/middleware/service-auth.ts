import { createServiceAuthMiddleware } from '../../shared/security/index.js';
import { getConfig } from '../config/env';

const isInternalApiAuthEnabled = (): boolean => process.env.INTERNAL_API_AUTH_ENABLED !== 'false';

/** Protects /api/users/internal/* with service JWT validation. */
export const serviceAuthMiddleware = createServiceAuthMiddleware({
  getJwtSecret: () => process.env.SERVICE_JWT_SECRET ?? '',
  expectedAudience: 'user-service',
  requiredScope: 'internal:users:read',
  isEnabled: isInternalApiAuthEnabled,
  clockToleranceSec: Number(process.env.JWT_CLOCK_TOLERANCE_SEC ?? 30),
});
