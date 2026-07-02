import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { AuthService } from '../../src/routes/auth/auth.service';
import {
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  UserAlreadyExistsError,
  ValidationError,
} from '../../src/routes/auth/auth.errors';
import { eventBus } from '../../src/middleware/event-bus';

jest.mock('../../src/config/env', () => ({
  getConfig: () => ({
    jwtSecret: 'test-secret',
    accessTokenExpiry: '15m',
    accessTokenKeyId: 'kid-1',
    refreshTokenBytes: 16,
    refreshTokenExpiryDays: 30,
    minPasswordLength: 8,
    minUsernameLength: 3,
    bcryptSaltRounds: 10,
    defaultUserRoleId: 2,
  }),
}));

jest.mock('../../src/middleware/event-bus', () => ({
  eventBus: {
    publish: jest.fn(),
  },
}));

const prismaMock = {
  authAccount: {
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  refreshToken: {
    create: jest.fn(),
    findUnique: jest.fn(),
    delete: jest.fn(),
  },
};

describe('AuthService unit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registerUser: создает пользователя, токены и публикует событие', async () => {
    prismaMock.authAccount.findUnique.mockResolvedValue(null);
    prismaMock.authAccount.create.mockResolvedValue({
      id: 101,
      username: 'alice',
      email: 'alice@example.com',
      role: { name: 'user' },
    });
    prismaMock.refreshToken.create.mockResolvedValue({ token: 'stored' });

    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed-password' as never);
    jest.spyOn(jwt, 'sign').mockReturnValue('access-token' as never);
    jest
      .spyOn(crypto, 'randomBytes')
      .mockImplementation(() => Buffer.from('1234567890abcdef1234567890abcdef', 'hex') as any);

    const service = new AuthService(prismaMock as any);
    const result = await service.registerUser({
      username: ' alice ',
      email: 'Alice@Example.com',
      password: 'veryStrongPassword',
    });

    expect(result.user).toEqual({
      id: 101,
      username: 'alice',
      email: 'alice@example.com',
      role: 'user',
    });
    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken).toHaveLength(32);
    expect(prismaMock.authAccount.create).toHaveBeenCalled();
    expect(prismaMock.refreshToken.create).toHaveBeenCalled();
    expect(eventBus.publish).toHaveBeenCalledWith(
      'user.registered',
      expect.objectContaining({
        userId: 101,
        email: 'alice@example.com',
      })
    );
  });

  it('registerUser: бросает UserAlreadyExistsError при существующем email', async () => {
    prismaMock.authAccount.findUnique.mockResolvedValue({ id: 1 });
    const service = new AuthService(prismaMock as any);

    await expect(
      service.registerUser({
        username: 'alice',
        email: 'alice@example.com',
        password: 'veryStrongPassword',
      })
    ).rejects.toBeInstanceOf(UserAlreadyExistsError);
    expect(prismaMock.authAccount.create).not.toHaveBeenCalled();
  });

  it('login: бросает InvalidCredentialsError при неверном пароле', async () => {
    prismaMock.authAccount.findUnique.mockResolvedValue({
      id: 1,
      username: 'alice',
      email: 'alice@example.com',
      passwordHash: 'stored',
      role: { name: 'user' },
    });
    jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);
    const service = new AuthService(prismaMock as any);

    await expect(
      service.login({ email: 'alice@example.com', password: 'wrong-password' })
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
  });

  it('refreshAccessToken: удаляет истекший refresh token и возвращает ошибку', async () => {
    const expiredToken = 'a'.repeat(32);
    prismaMock.refreshToken.findUnique.mockResolvedValue({
      token: expiredToken,
      expiresAt: new Date(Date.now() - 60_000),
      authAccount: {
        id: 1,
        email: 'alice@example.com',
        role: { name: 'user' },
      },
    });
    const service = new AuthService(prismaMock as any);

    await expect(service.refreshAccessToken(expiredToken)).rejects.toBeInstanceOf(
      InvalidRefreshTokenError
    );
    expect(prismaMock.refreshToken.delete).toHaveBeenCalledWith({
      where: { token: expiredToken },
    });
  });

  it('logout: бросает ValidationError при пустом токене', async () => {
    const service = new AuthService(prismaMock as any);
    await expect(service.logout('')).rejects.toBeInstanceOf(ValidationError);
    expect(prismaMock.refreshToken.delete).not.toHaveBeenCalled();
  });
});
