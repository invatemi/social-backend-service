export { AUTH_BYPASS_PATHS, isBypassPath } from './bypass-paths.js';
export { extractBearer } from './extract-bearer.js';
export { createUserContextMiddleware, type UserContextOptions } from './user-context.middleware.js';
export { verifyUserJwt, UserJwtClaimError, type VerifyUserJwtOptions } from './verify-user-jwt.js';
export { createServiceAuthMiddleware, type ServiceAuthOptions } from './service-auth.middleware.js';
export { ServiceTokenClient, type ServiceTokenClientOptions } from './service-token-client.js';
export type {
  AuthenticatedRequest,
  ServiceJwtPayload,
  UserJwtPayload,
  UserRole,
} from './types.js';
