import express from 'express';
import request from 'supertest';
import type { AuthServiceConfig } from '../../src/config';
import {
  createLoginRateLimiter,
  createRegisterRateLimiter,
} from '../../src/middleware/rate-limit';

const testRateLimitConfig = {
  rateLimitLoginMax: 2,
  rateLimitLoginWindowMs: 60_000,
  rateLimitRegisterMax: 2,
  rateLimitRegisterWindowMs: 3_600_000,
} as AuthServiceConfig;

const buildRateLimitApp = (limiter: ReturnType<typeof createLoginRateLimiter>, path: string) => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(path, limiter);
  app.post(path, (_req, res) => {
    res.status(200).json({ ok: true });
  });
  return app;
};

describe('rate-limit middleware', () => {
  it('returns 429 with required headers when login limit exceeded', async () => {
    const app = buildRateLimitApp(
      createLoginRateLimiter(testRateLimitConfig),
      '/api/auth/login',
    );

    await request(app).post('/api/auth/login').set('X-Forwarded-For', '203.0.113.10');
    await request(app).post('/api/auth/login').set('X-Forwarded-For', '203.0.113.10');

    const response = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.10');

    expect(response.status).toBe(429);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests. Please try again later.',
      },
    });
    expect(response.headers['x-ratelimit-limit']).toBe('2');
    expect(response.headers['x-ratelimit-remaining']).toBe('0');
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('tracks register limit separately from login', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.use('/api/auth/login', createLoginRateLimiter(testRateLimitConfig));
    app.use('/api/auth/register', createRegisterRateLimiter(testRateLimitConfig));
    app.post('/api/auth/login', (_req, res) => res.status(200).json({ ok: true }));
    app.post('/api/auth/register', (_req, res) => res.status(200).json({ ok: true }));

    const clientIp = '203.0.113.20';

    await request(app).post('/api/auth/login').set('X-Forwarded-For', clientIp);
    await request(app).post('/api/auth/login').set('X-Forwarded-For', clientIp);
    const loginBlocked = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', clientIp);

    expect(loginBlocked.status).toBe(429);

    const registerResponse = await request(app)
      .post('/api/auth/register')
      .set('X-Forwarded-For', clientIp);

    expect(registerResponse.status).toBe(200);
  });

  it('uses client IP from X-Forwarded-For when trust proxy is enabled', async () => {
    const app = buildRateLimitApp(
      createLoginRateLimiter(testRateLimitConfig),
      '/api/auth/login',
    );

    await request(app).post('/api/auth/login').set('X-Forwarded-For', '198.51.100.1');
    await request(app).post('/api/auth/login').set('X-Forwarded-For', '198.51.100.1');

    const blocked = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '198.51.100.1');
    const allowed = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', '198.51.100.2');

    expect(blocked.status).toBe(429);
    expect(allowed.status).toBe(200);
  });
});
