import express from 'express';
import request from 'supertest';
import authRoutes from '../../src/routes/auth/endpoints';
import { errorHandler } from '../../src/middleware/error-handler';
import { InvalidRefreshTokenError } from '../../src/routes/auth/auth.errors';

const registerUserMock = jest.fn();
const loginMock = jest.fn();
const refreshAccessTokenMock = jest.fn();
const logoutMock = jest.fn();
const getJwksMock = jest.fn();

jest.mock('../../src/routes/auth/auth.service', () => ({
  AuthService: jest.fn().mockImplementation(() => ({
    registerUser: registerUserMock,
    login: loginMock,
    refreshAccessToken: refreshAccessTokenMock,
    logout: logoutMock,
    getJwks: getJwksMock,
  })),
}));

const buildApp = (withPrisma = true) => {
  const app = express();
  app.use(express.json());
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

  it('POST /api/auth/register: happy path', async () => {
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
      refreshToken: 'ref',
      user: { id: 1, username: 'alice', email: 'alice@example.com', role: 'user' },
    });
    expect(registerUserMock).toHaveBeenCalledWith({
      username: 'alice',
      email: 'alice@example.com',
      password: 'veryStrongPassword',
    });
  });

  it('POST /api/auth/refresh: edge case invalid token', async () => {
    refreshAccessTokenMock.mockRejectedValue(new InvalidRefreshTokenError('expired'));
    const app = buildApp();

    const response = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: 'bad-token' });

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

  it('POST /api/auth/logout: happy path', async () => {
    logoutMock.mockResolvedValue(undefined);
    const app = buildApp();

    const response = await request(app)
      .post('/api/auth/logout')
      .send({ refreshToken: 'f'.repeat(32) });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ message: 'Logged out successfully' });
  });

  it('returns 500 when Prisma is not attached to request', async () => {
    const app = buildApp(false);

    const response = await request(app).get('/api/auth/jwks');

    expect(response.status).toBe(500);
    expect(response.body.success).toBe(false);
    expect(response.body.error.code).toBe('UNKNOWN_ERROR');
  });
});
