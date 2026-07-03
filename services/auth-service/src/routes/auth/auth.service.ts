import { PrismaClient } from '../../generated/prisma';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import {
  ValidationError,
  UserAlreadyExistsError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
} from './auth.errors';
import { eventBus } from '../../middleware/event-bus';
import { getConfig } from '../../config/env';
import {
  computeLookupHash,
  hashRefreshToken,
  verifyRefreshTokenHash,
} from '../../lib/refresh-token-hash';

export interface UserRegistrationData {
  username: string;
  email: string;
  password: string;
}

export interface UserLoginData {
  email: string;
  password: string;
}

export interface UserPublicData {
  id: number;
  username: string;
  email: string;
  role: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResponse extends AuthTokens {
  user: UserPublicData;
}

export type RegistrationResponse = AuthResponse;
export type LoginResponse = AuthResponse;

const validateString = (value: unknown, fieldName: string, minLength: number): string => {
  if (typeof value !== 'string') {
    throw new ValidationError(`${fieldName} must be a string`, fieldName);
  }
  const trimmed = value.trim();
  if (trimmed.length < minLength) {
    throw new ValidationError(`${fieldName} must be at least ${minLength} characters`, fieldName);
  }
  return trimmed;
};

const validateEmail = (email: string): string => {
  const normalized = email.toLowerCase().trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
    throw new ValidationError('Invalid email format', 'email');
  }
  return normalized;
};

const validatePassword = (password: string): string => {
  const { minPasswordLength } = getConfig();
  const trimmed = password.trim();
  if (trimmed.length < minPasswordLength) {
    throw new ValidationError(
      `Password must be at least ${minPasswordLength} characters`,
      'password'
    );
  }
  return trimmed;
};

/** Бизнес-логика регистрации, входа и управления токенами. */
export class AuthService {
  private readonly refreshTokenInclude = {
    authAccount: { include: { role: true } },
  } as const;

  /** Принимает Prisma-клиент для работы с auth-базой. */
  constructor(private prisma: PrismaClient) {}

  /** Создаёт JWT access token для пользователя. */
  generateAccessToken(userId: number, email: string, role: string): string {
    const { jwtSecret, accessTokenExpiry, accessTokenKeyId, jwtIssuer, jwtAudience } = getConfig();
    return jwt.sign({ userId, email, role, typ: 'user' }, jwtSecret, {
      algorithm: 'HS256',
      expiresIn: accessTokenExpiry,
      keyid: accessTokenKeyId,
      issuer: jwtIssuer,
      audience: jwtAudience,
    } as jwt.SignOptions);
  }

  /** Генерирует и сохраняет refresh token. */
  async generateRefreshToken(userId: number): Promise<string> {
    const { refreshTokenBytes, refreshTokenExpiryDays, refreshTokenPepper } = getConfig();
    const token = crypto.randomBytes(refreshTokenBytes).toString('hex');
    const expiresAt = new Date(Date.now() + refreshTokenExpiryDays * 24 * 60 * 60 * 1000);
    const hashed = hashRefreshToken(token, refreshTokenPepper);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        expiresAt,
        tokenLookupHash: hashed.tokenLookupHash,
        tokenHash: hashed.tokenHash,
        tokenSalt: hashed.tokenSalt,
      },
    });

    return token;
  }

  private async resolveRefreshTokenRecord(refreshToken: string) {
    const { refreshTokenPepper } = getConfig();
    const tokenLookupHash = computeLookupHash(refreshToken, refreshTokenPepper);

    const record = await this.prisma.refreshToken.findUnique({
      where: { tokenLookupHash },
      include: this.refreshTokenInclude,
    });

    if (!record) {
      return null;
    }

    if (!verifyRefreshTokenHash(refreshToken, record.tokenSalt, record.tokenHash)) {
      return null;
    }

    return record;
  }

  /** Возвращает JWKS для валидации JWT в KrakenD. */
  getJwks() {
    const { jwtSecret, accessTokenKeyId } = getConfig();
    return {
      keys: [{
        kty: 'oct',
        alg: 'HS256',
        kid: accessTokenKeyId,
        k: Buffer.from(jwtSecret, 'utf8').toString('base64url'),
      }],
    };
  }

  /** Регистрирует пользователя и публикует событие user.registered. */
  async registerUser(data: UserRegistrationData): Promise<RegistrationResponse> {
    const { minUsernameLength, bcryptSaltRounds, defaultUserRoleId } = getConfig();
    const username = validateString(data.username, 'username', minUsernameLength);
    const email = validateEmail(data.email);
    const password = validatePassword(data.password);

    const existing = await this.prisma.authAccount.findUnique({ where: { email } });
    if (existing) {
      throw new UserAlreadyExistsError(email);
    }

    const passwordHash = await bcrypt.hash(password, bcryptSaltRounds);
    const authAccount = await this.prisma.authAccount.create({
      data: { email, passwordHash, username, roleId: defaultUserRoleId },
      select: { id: true, username: true, email: true, role: { select: { name: true } } },
    });

    const user: UserPublicData = {
      id: authAccount.id,
      username: authAccount.username,
      email: authAccount.email,
      role: authAccount.role.name,
    };

    const accessToken = this.generateAccessToken(user.id, user.email, user.role);
    const refreshToken = await this.generateRefreshToken(user.id);

    try {
      await eventBus.publish('user.registered', {
        userId: authAccount.id,
        username,
        email,
        roleId: defaultUserRoleId,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('[AuthService] Не удалось опубликовать user.registered:', error);
    }

    return { accessToken, refreshToken, user };
  }

  /** Проверяет учётные данные и выдаёт токены. */
  async login(data: UserLoginData): Promise<LoginResponse> {
    const email = validateEmail(data.email);
    const password = validatePassword(data.password);

    const authAccount = await this.prisma.authAccount.findUnique({
      where: { email },
      include: { role: true },
    });

    if (!authAccount || !(await bcrypt.compare(password, authAccount.passwordHash))) {
      throw new InvalidCredentialsError();
    }

    const publicUser: UserPublicData = {
      id: authAccount.id,
      username: authAccount.username,
      email: authAccount.email,
      role: authAccount.role.name,
    };

    return {
      accessToken: this.generateAccessToken(publicUser.id, publicUser.email, publicUser.role),
      refreshToken: await this.generateRefreshToken(publicUser.id),
      user: publicUser,
    };
  }

  /** Обновляет access token по действующему refresh token. */
  async refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
    const expectedRefreshTokenLength = getConfig().refreshTokenBytes * 2;
    if (
      !refreshToken ||
      typeof refreshToken !== 'string' ||
      refreshToken.length !== expectedRefreshTokenLength
    ) {
      throw new InvalidRefreshTokenError('Invalid refresh token format');
    }

    const refreshTokenRecord = await this.resolveRefreshTokenRecord(refreshToken);

    if (!refreshTokenRecord) {
      throw new InvalidRefreshTokenError();
    }

    if (refreshTokenRecord.expiresAt < new Date()) {
      await this.prisma.refreshToken.delete({ where: { id: refreshTokenRecord.id } });
      throw new InvalidRefreshTokenError('Refresh token expired');
    }

    const authAccount = refreshTokenRecord.authAccount;
    const newAccessToken = this.generateAccessToken(
      authAccount.id,
      authAccount.email,
      authAccount.role.name
    );
    const newRefreshToken = await this.generateRefreshToken(authAccount.id);
    await this.prisma.refreshToken.delete({ where: { id: refreshTokenRecord.id } });

    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  /** Удаляет refresh token при выходе из системы. */
  async logout(refreshToken: string): Promise<void> {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new ValidationError('Refresh token is required', 'refreshToken');
    }

    const refreshTokenRecord = await this.resolveRefreshTokenRecord(refreshToken);
    if (!refreshTokenRecord) {
      return;
    }

    try {
      await this.prisma.refreshToken.delete({ where: { id: refreshTokenRecord.id } });
    } catch (error: any) {
      if (error.code !== 'P2025') throw error;
    }
  }
}
