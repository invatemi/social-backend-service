import rateLimit, { type Options, type RateLimitRequestHandler } from 'express-rate-limit';
import type { AuthServiceConfig } from '../config';

/**
 * In-memory rate limit store (default).
 * Limitations: counters reset on restart; not shared across replicas.
 * For horizontal scaling, replace store with rate-limit-redis + REDIS_URL.
 */

const rateLimitHandler: Options['handler'] = (req, res, _next, optionsUsed) => {
  const resetTime = (req as { rateLimit?: { resetTime?: Date } }).rateLimit?.resetTime;
  const retryAfterSeconds = resetTime
    ? Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
    : Math.max(1, Math.ceil(optionsUsed.windowMs / 1000));

  res
    .status(429)
    .set('Retry-After', String(retryAfterSeconds))
    .json({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      },
    });
};

const createRateLimiter = (max: number, windowMs: number): RateLimitRequestHandler =>
  rateLimit({
    windowMs,
    max,
    legacyHeaders: true,
    standardHeaders: false,
    handler: rateLimitHandler,
  });

/** Login: 5 requests per minute by default. */
export const createLoginRateLimiter = (config: AuthServiceConfig): RateLimitRequestHandler =>
  createRateLimiter(config.rateLimitLoginMax, config.rateLimitLoginWindowMs);

/** Register: 3 requests per hour by default. */
export const createRegisterRateLimiter = (config: AuthServiceConfig): RateLimitRequestHandler =>
  createRateLimiter(config.rateLimitRegisterMax, config.rateLimitRegisterWindowMs);

export const createAuthRateLimiters = (config: AuthServiceConfig) => ({
  loginRateLimiter: createLoginRateLimiter(config),
  registerRateLimiter: createRegisterRateLimiter(config),
});
