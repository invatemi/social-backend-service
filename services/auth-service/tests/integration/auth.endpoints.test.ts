import express from 'express';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import authRoutes from '../../src/routes/auth/endpoints';
import { errorHandler } from '../../src/middleware/error-handler';
import { InvalidRefreshTokenError, InvalidCredentialsError } from '../../src/routes/auth/auth.errors';
import {
  createLoginRateLimiter,
  createRegisterRateLimiter,
} from '../../src/middleware/rate-limit';
import type { AuthServiceConfig } from '../../src/config';

const testRateLimitConfig = {
  rateLimitLoginMax: 2,
  rateLimitLoginWindowMs: 60_000,
  rateLimitRegisterMax: 2,
  rateLimitRegisterWindowMs: 3_600_000,
} as AuthServiceConfig;

const registerUserMock = jest.fn();
const loginMock = jest.fn();
const refreshAccessTokenMock = jest.fn();
const logoutMock = jest.fn();
const logoutWithVaultMock = jest.fn();
const addAccountMock = jest.fn();
const listAccountsMock = jest.fn();
const switchAccountMock = jest.fn();
const getJwksMock = jest.fn();

jest.mock('../../src/routes/auth/auth.service', () => ({
  AuthService: jest.fn().mockImplementation(() => ({
    registerUser: registerUserMock,
    login: loginMock,
    refreshAccessToken: refreshAccessTokenMock,
    logout: logoutMock,
    logoutWithVault: logoutWithVaultMock,
    addAccount: addAccountMock,
    listAccounts: listAccountsMock,
    switchAccount: switchAccountMock,
    getJwks: getJwksMock,
  })),
}));

jest.mock('../../src/config/env', () => ({
  loadEnv: jest.fn(),
  getConfig: () => ({
    refreshCookieName: 'refreshToken',
    refreshCookiePath: '/api/auth',
    refreshCookieSameSite: 'lax',
    refreshCookieSecure: false,
    refreshCookieMaxAgeDays: 7,
    accountSessionCookieName: 'accountSession',
    accountSessionCookieMaxAgeDays: 30,
    accountSessionTokenBytes: 48,
  }),
}));

const buildApp = (withPrisma = true, withRateLimit = false) => {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use(cookieParser());

  if (withRateLimit) {
    app.use('/api/auth/login', createLoginRateLimiter(testRateLimitConfig));
    app.use('/api/auth/register', createRegisterRateLimiter(testRateLimitConfig));
  }

  app.use('/api/auth', (req, _res, next) => {
    if (withPrisma) {
      (req as any).prisma = {};
    }
    next();
  }, authRoutes);
  app.use(errorHandler);
  return app;
};

describe('Auth endpoints integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('POST /api/auth/register: happy path sets refresh cookie', async () => {
    registerUserMock.mockResolvedValue({
      accessToken: 'acc',
      refreshToken: 'ref',
      user: { id: 1, username: 'alice', email: 'alice@example.com', role: 'user' },
    });

    const app = buildApp();
    const response = await request(app).post('/api/auth/register').send({
      username: 'alice',
      email: 'alice@example.com',
      password: 'veryStrongPassword',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      accessToken: 'acc',
      user: { id: 1, username: 'alice', email: 'alice@example.com', role: 'user' },
    });
    expect(response.headers['set-cookie']?.[0]).toMatch(/refreshToken=ref/);
    expect(registerUserMock).toHaveBeenCalledWith({
      username: 'alice',
      email: 'alice@example.com',
      password: 'veryStrongPassword',
    });
  });

  it('POST /api/auth/login: happy path sets refresh cookie', async () => {
    loginMock.mockResolvedValue({
      accessToken: 'acc',
      refreshToken: 'ref-login',
      user: { id: 2, username: 'bob', email: 'bob@example.com', role: 'user' },
    });

    const app = buildApp();
    const response = await request(app).post('/api/auth/login').send({
      email: 'bob@example.com',
      password: 'password123',
    });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      accessToken: 'acc',
      user: { id: 2, username: 'bob', email: 'bob@example.com', role: 'user' },
    });
    expect(response.headers['set-cookie']?.[0]).toMatch(/refreshToken=ref-login/);
  });

  it('POST /api/auth/refresh: reads refresh token from cookie', async () => {
    refreshAccessTokenMock.mockResolvedValue({
      accessToken: 'new-acc',
      refreshToken: 'new-ref',
    });
    const app = buildApp();

    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', 'refreshToken=existing-ref');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ accessToken: 'new-acc' });
    expect(response.headers['set-cookie']?.[0]).toMatch(/refreshToken=new-ref/);
    expect(refreshAccessTokenMock).toHaveBeenCalledWith('existing-ref');
  });

  it('POST /api/auth/refresh: edge case invalid token', async () => {
    refreshAccessTokenMock.mockRejectedValue(new InvalidRefreshTokenError('expired'));
    const app = buildApp();

    const response = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', 'refreshToken=bad-token');

    expect(response.status).toBe(401);
    expect(response.body).toEqual({
      success: false,
      error: {
        code: 'INVALID_REFRESH_TOKEN',
        message: 'expired',
        field: null,
      },
    });
  });

  it('POST /api/auth/refresh: returns 401 when cookie missing', async () => {
    const app = buildApp();

    const response = await request(app).post('/api/auth/refresh');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INVALID_REFRESH_TOKEN');
    expect(refreshAccessTokenMock).not.toHaveBeenCalled();
  });

  it('GET /api/auth/jwks: возвращает ключи', async () => {
    getJwksMock.mockReturnValue({
      keys: [{ kid: 'kid-1', alg: 'HS256', kty: 'oct', k: 'abc' }],
    });
    const app = buildApp();

    const response = await request(app).get('/api/auth/jwks');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      keys: [{ kid: 'kid-1', alg: 'HS256', kty: 'oct', k: 'abc' }],
    });
  });

  it('POST /api/auth/logout: clears refresh cookie', async () => {
    logoutWithVaultMock.mockResolvedValue({ switched: false, accountSessionToken: null });
    const app = buildApp();

    const response = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', 'refreshToken=logout-ref');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Logged out successfully', switched: false });
    expect(logoutWithVaultMock).toHaveBeenCalledWith('logout-ref', undefined);
    expect(response.headers['set-cookie']?.[0]).toMatch(/refreshToken=;/);
  });

  it('POST /api/auth/logout: auto-switches to remaining vault account', async () => {
    logoutWithVaultMock.mockResolvedValue({
      switched: true,
      accountSessionToken: 'session-token',
      accounts: [
        { id: 2, username: 'bob', email: 'bob@example.com', isActive: true },
      ],
      session: {
        accessToken: 'switched-acc',
        refreshToken: 'switched-ref',
        user: { id: 2, username: 'bob', email: 'bob@example.com', role: 'user' },
      },
    });
    const app = buildApp();

    const response = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', 'refreshToken=logout-ref; accountSession=session-token');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      switched: true,
      accessToken: 'switched-acc',
      user: { id: 2, username: 'bob', email: 'bob@example.com', role: 'user' },
      accounts: [{ id: 2, username: 'bob', email: 'bob@example.com', isActive: true }],
    });
    expect(response.headers['set-cookie']?.join(';')).toMatch(/refreshToken=switched-ref/);
  });

  it('POST /api/auth/accounts/add: parks current and activates new account', async () => {
    addAccountMock.mockResolvedValue({
      accessToken: 'acc-2',
      refreshToken: 'ref-2',
      accountSessionToken: 'device-session',
      user: { id: 2, username: 'bob', email: 'bob@example.com', role: 'user' },
      accounts: [
        { id: 2, username: 'bob', email: 'bob@example.com', isActive: true },
        { id: 1, username: 'alice', email: 'alice@example.com', isActive: false },
      ],
    });
    const app = buildApp();

    const response = await request(app)
      .post('/api/auth/accounts/add')
      .set('Cookie', 'refreshToken=ref-1')
      .send({ email: 'bob@example.com', password: 'password123' });

    expect(response.status).toBe(200);
    expect(response.body.accessToken).toBe('acc-2');
    expect(response.body.accounts).toHaveLength(2);
    expect(response.headers['set-cookie']?.join(';')).toMatch(/refreshToken=ref-2/);
    expect(response.headers['set-cookie']?.join(';')).toMatch(/accountSession=device-session/);
    expect(addAccountMock).toHaveBeenCalledWith(
      'ref-1',
      undefined,
      { email: 'bob@example.com', password: 'password123' },
    );
  });

  it('GET /api/auth/accounts: returns vault accounts', async () => {
    listAccountsMock.mockResolvedValue([
      { id: 1, username: 'alice', email: 'alice@example.com', isActive: true },
    ]);
    const app = buildApp();

    const response = await request(app)
      .get('/api/auth/accounts')
      .set('Cookie', 'refreshToken=ref-1; accountSession=device-session');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      accounts: [{ id: 1, username: 'alice', email: 'alice@example.com', isActive: true }],
    });
    expect(listAccountsMock).toHaveBeenCalledWith('ref-1', 'device-session');
  });

  it('POST /api/auth/accounts/switch: switches active account', async () => {
    switchAccountMock.mockResolvedValue({
      accessToken: 'acc-2',
      refreshToken: 'ref-2',
      user: { id: 2, username: 'bob', email: 'bob@example.com', role: 'user' },
      accounts: [
        { id: 2, username: 'bob', email: 'bob@example.com', isActive: true },
        { id: 1, username: 'alice', email: 'alice@example.com', isActive: false },
      ],
    });
    const app = buildApp();

    const response = await request(app)
      .post('/api/auth/accounts/switch')
      .set('Cookie', 'refreshToken=ref-1; accountSession=device-session')
      .send({ userId: 2 });

    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe(2);
    expect(response.headers['set-cookie']?.[0]).toMatch(/refreshToken=ref-2/);
    expect(switchAccountMock).toHaveBeenCalledWith('ref-1', 'device-session', 2);
  });

  it('returns 500 when Prisma is not attached to request', async () => {
    const app = buildApp(false);

    const response = await request(app).get('/api/auth/jwks');

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('UNKNOWN_ERROR');
  });

  it('POST /api/auth/login: returns 429 after rate limit exceeded', async () => {
    loginMock.mockRejectedValue(new InvalidCredentialsError('Invalid credentials'));
    const app = buildApp(true, true);
    const clientIp = '203.0.113.50';

    await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', clientIp)
      .send({ email: 'a@b.com', password: 'wrong' });
    await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', clientIp)
      .send({ email: 'a@b.com', password: 'wrong' });

    const response = await request(app)
      .post('/api/auth/login')
      .set('X-Forwarded-For', clientIp)
      .send({ email: 'a@b.com', password: 'wrong' });

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(response.headers['retry-after']).toBeDefined();
    expect(loginMock).toHaveBeenCalledTimes(2);
  });

  it('POST /api/auth/register: returns 429 after rate limit exceeded', async () => {
    registerUserMock.mockResolvedValue({
      accessToken: 'acc',
      refreshToken: 'ref',
      user: { id: 1, username: 'alice', email: 'alice@example.com', role: 'user' },
    });
    const app = buildApp(true, true);
    const clientIp = '203.0.113.60';
    const payload = {
      username: 'alice',
      email: 'alice@example.com',
      password: 'veryStrongPassword',
    };

    await request(app)
      .post('/api/auth/register')
      .set('X-Forwarded-For', clientIp)
      .send(payload);
    await request(app)
      .post('/api/auth/register')
      .set('X-Forwarded-For', clientIp)
      .send(payload);

    const response = await request(app)
      .post('/api/auth/register')
      .set('X-Forwarded-For', clientIp)
      .send(payload);

    expect(response.status).toBe(429);
    expect(response.body.error.code).toBe('RATE_LIMIT_EXCEEDED');
    expect(registerUserMock).toHaveBeenCalledTimes(2);
  });
});
