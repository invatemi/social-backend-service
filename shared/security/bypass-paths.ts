export const AUTH_BYPASS_PATHS = [
  '/health',
  '/metrics',
  '/api/auth/register',
  '/api/auth/login',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/jwks',
] as const;

/** Returns true when the request path should skip global auth middleware. */
export const isBypassPath = (path: string): boolean =>
  AUTH_BYPASS_PATHS.some((bypassPath) => path === bypassPath || path.startsWith(`${bypassPath}/`));
