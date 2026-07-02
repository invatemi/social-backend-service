import express from 'express';
import request from 'supertest';
import profileRoutes from '../../src/routes/profile/endpoints';
import followersRoutes from '../../src/routes/followers/endpoints';
import passwordRoutes from '../../src/routes/password/endpoints';
import { errorHandler } from '../../src/middleware/error-handler';
import { PasswordValidationError } from '../../src/routes/password/password.errors';
import { testAuthHeader } from '../helpers/auth';

const getProfileMock = jest.fn();
const updateProfileMock = jest.fn();
const isFollowingMock = jest.fn();
const requestPasswordCodeMock = jest.fn();
const verifyPasswordMock = jest.fn();

jest.mock('../../src/routes/profile/profile.service', () => ({
  ProfileService: jest.fn().mockImplementation(() => ({
    getProfile: getProfileMock,
    updateProfile: updateProfileMock,
    searchUsers: jest.fn(),
    getAvatarUploadUrl: jest.fn(),
    getPostAudienceUserIds: jest.fn(),
    getFeedSourceUserIds: jest.fn(),
    getAuthorsByIds: jest.fn(),
  })),
}));

jest.mock('../../src/routes/followers/followers.service', () => ({
  FollowersService: jest.fn().mockImplementation(() => ({
    isFollowing: isFollowingMock,
    getFollowers: jest.fn(),
    getFollowing: jest.fn(),
    getCounts: jest.fn(),
    followUser: jest.fn(),
    unfollowUser: jest.fn(),
  })),
}));

jest.mock('../../src/routes/password/password.service', () => ({
  PasswordService: jest.fn().mockImplementation(() => ({
    requestPasswordChangeCode: requestPasswordCodeMock,
    verifyCodeAndChangePassword: verifyPasswordMock,
  })),
}));

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    (req as any).prisma = {};
    (req as any).authPool = {};
    next();
  });
  app.use('/api/users', profileRoutes);
  app.use('/api/followers', followersRoutes);
  app.use('/api/users', passwordRoutes);
  app.use(errorHandler);
  return app;
};

describe('User service endpoints integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('GET /api/users/me returns profile', async () => {
    getProfileMock.mockResolvedValue({ id: 11, name: 'John' });
    const app = buildApp();

    const response = await request(app)
      .get('/api/users/me')
      .set('Authorization', testAuthHeader(11));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.user).toEqual({ id: 11, name: 'John' });
  });

  it('GET /api/followers/me/is-following/:id returns relation', async () => {
    isFollowingMock.mockResolvedValue(true);
    const app = buildApp();
    const response = await request(app)
      .get('/api/followers/me/is-following/9')
      .set('Authorization', testAuthHeader(11));

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true, isFollowing: true });
  });

  it('POST /api/users/me/password/request happy path', async () => {
    requestPasswordCodeMock.mockResolvedValue({
      message: 'Verification code sent',
      email: 'john@example.com',
    });
    const app = buildApp();

    const response = await request(app)
      .post('/api/users/me/password/request')
      .set('Authorization', testAuthHeader(11));

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it('POST /api/users/me/password/verify maps service validation error', async () => {
    verifyPasswordMock.mockRejectedValue(
      new PasswordValidationError('Password must be at least 8 characters', 'newPassword')
    );
    const app = buildApp();

    const response = await request(app)
      .post('/api/users/me/password/verify')
      .set('Authorization', testAuthHeader(11))
      .send({ code: '1234', newPassword: 'short' });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('GET /api/users/me without token returns 401', async () => {
    const app = buildApp();
    const response = await request(app).get('/api/users/me');

    expect(response.status).toBe(401);
    expect(response.body.success).toBe(false);
  });
});
