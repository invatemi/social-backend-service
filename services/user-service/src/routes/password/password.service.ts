import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { Pool } from 'pg';
import { PrismaClient } from '../../generated/prisma';
import { sendMail } from '../../lib/mailer';
import {
  InvalidVerificationCodeError,
  PasswordUserNotFoundError,
  PasswordValidationError,
  VerificationCodeExpiredError,
} from './password.errors';

const PASSWORD_CHANGE_PURPOSE = 'password_change';
const BCRYPT_SALT_ROUNDS = 10;

const getCodeTtlMs = (): number =>
  Number(process.env.PASSWORD_CODE_TTL_MINUTES ?? 15) * 60 * 1000;

const hashVerificationCode = (code: string): string =>
  crypto.createHash('sha256').update(code).digest('hex');

const generateVerificationCode = (): string =>
  String(Math.floor(1000 + Math.random() * 9000));

const validatePassword = (password: string): string => {
  const trimmed = password.trim();
  if (trimmed.length < 8) {
    throw new PasswordValidationError('Password must be at least 8 characters', 'newPassword');
  }
  return trimmed;
};

export class PasswordService {
  constructor(
    private prisma: PrismaClient,
    private authPool: Pool
  ) {}

  async requestPasswordChangeCode(userId: number): Promise<{ message: string; email: string }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      throw new PasswordUserNotFoundError();
    }

    const code = generateVerificationCode();
    const codeHash = hashVerificationCode(code);
    const expiresAt = new Date(Date.now() + getCodeTtlMs());
    const ttlMinutes = Number(process.env.PASSWORD_CODE_TTL_MINUTES ?? 15);

    await this.authPool.query(
      `
      INSERT INTO verification_codes (user_id, code_hash, purpose, expires_at, is_used, created_at)
      VALUES ($1, $2, $3, $4, false, NOW())
      ON CONFLICT (user_id, purpose)
      DO UPDATE SET
        code_hash = EXCLUDED.code_hash,
        expires_at = EXCLUDED.expires_at,
        is_used = false,
        created_at = NOW()
      `,
      [userId, codeHash, PASSWORD_CHANGE_PURPOSE, expiresAt]
    );

    await sendMail({
      to: user.email,
      subject: 'Код для смены пароля',
      text: `Ваш код подтверждения: ${code}\n\nКод действителен ${ttlMinutes} минут.`,
    });

    return {
      message: 'Verification code sent',
      email: user.email,
    };
  }

  async verifyCodeAndChangePassword(
    userId: number,
    code: string,
    newPassword: string
  ): Promise<{ message: string }> {
    const normalizedCode = code.trim();
    if (!/^\d{4}$/.test(normalizedCode)) {
      throw new PasswordValidationError('Code must be 4 digits', 'code');
    }

    const password = validatePassword(newPassword);

    const verificationResult = await this.authPool.query<{
      code_hash: string;
      expires_at: Date;
      is_used: boolean;
    }>(
      `
      SELECT code_hash, expires_at, is_used
      FROM verification_codes
      WHERE user_id = $1 AND purpose = $2
      `,
      [userId, PASSWORD_CHANGE_PURPOSE]
    );

    const verification = verificationResult.rows[0];
    if (!verification || verification.is_used) {
      throw new InvalidVerificationCodeError();
    }

    if (verification.expires_at < new Date()) {
      throw new VerificationCodeExpiredError();
    }

    if (hashVerificationCode(normalizedCode) !== verification.code_hash) {
      throw new InvalidVerificationCodeError();
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const updateResult = await this.authPool.query(
      `UPDATE auth_accounts SET password_hash = $1 WHERE id = $2`,
      [passwordHash, userId]
    );

    if (updateResult.rowCount === 0) {
      throw new PasswordUserNotFoundError();
    }

    await this.authPool.query(
      `UPDATE verification_codes SET is_used = true WHERE user_id = $1 AND purpose = $2`,
      [userId, PASSWORD_CHANGE_PURPOSE]
    );

    await this.authPool.query(`DELETE FROM refresh_tokens WHERE user_id = $1`, [userId]);

    return { message: 'Password changed successfully' };
  }
}
