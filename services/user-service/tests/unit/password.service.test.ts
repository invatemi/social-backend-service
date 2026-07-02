import bcrypt from 'bcrypt';
import { PasswordService } from '../../src/routes/password/password.service';
import {
  PasswordUserNotFoundError,
  PasswordValidationError,
} from '../../src/routes/password/password.errors';
import { mailer } from '../../src/lib/mailer';

jest.mock('../../src/config/env', () => ({
  getConfig: () => ({
    passwordCodeTtlMinutes: 10,
    passwordChangePurpose: 'password_change',
    bcryptSaltRounds: 10,
    minPasswordLength: 8,
  }),
}));

jest.mock('../../src/lib/mailer', () => ({
  mailer: { send: jest.fn() },
}));

describe('PasswordService unit', () => {
  const prismaMock = {
    user: {
      findUnique: jest.fn(),
    },
  };
  const authPoolMock = {
    query: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('requestPasswordChangeCode: user not found -> PasswordUserNotFoundError', async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    const service = new PasswordService(prismaMock as any, authPoolMock as any);

    await expect(service.requestPasswordChangeCode(99)).rejects.toBeInstanceOf(PasswordUserNotFoundError);
    expect(mailer.send).not.toHaveBeenCalled();
  });

  it('verifyCodeAndChangePassword: invalid code format -> PasswordValidationError', async () => {
    const service = new PasswordService(prismaMock as any, authPoolMock as any);
    await expect(
      service.verifyCodeAndChangePassword(1, '12', 'long-enough-password')
    ).rejects.toBeInstanceOf(PasswordValidationError);
  });

  it('verifyCodeAndChangePassword: happy path updates password and revokes refresh tokens', async () => {
    jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed' as never);
    authPoolMock.query
      .mockResolvedValueOnce({
        rows: [
          {
            code_hash: '03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4',
            expires_at: new Date(Date.now() + 60_000),
            is_used: false,
          },
        ],
      })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 })
      .mockResolvedValueOnce({ rowCount: 1 });

    const service = new PasswordService(prismaMock as any, authPoolMock as any);
    const result = await service.verifyCodeAndChangePassword(1, '1234', 'long-enough-password');

    expect(result.message).toBe('Password changed successfully');
    expect(authPoolMock.query).toHaveBeenCalledTimes(4);
  });
});
