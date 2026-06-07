import { PrismaClient } from '../generated/prisma';
import jwt from "jsonwebtoken";
import crypto from 'crypto';
import bcrypt from 'bcrypt';

import {
  ValidationError,
  UserAlreadyExistsError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
} from './auth.errors';

// ==================== TYPES ====================
export interface UserRegistrationData {
  email: string;
  password: string;
  name: string;
}

export interface UserLoginData {
  email: string;
  password: string;
}

export interface UserPublicData {
  id: number;
  email: string;
  role: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: string;
}

export interface RegistrationResponse {
  message: string;
  user: UserPublicData;
  tokens: AuthTokens;
}

export interface LoginResponse {
  user: UserPublicData;
  tokens: AuthTokens;
}

// ==================== CONSTANTS ====================
const ACCESS_TOKEN_SECRET = process.env.JWT_SECRET as string;
const ACCESS_TOKEN_EXPIRY = (process.env.ACCESS_TOKEN_EXPIRY || '15m') as string;
const REFRESH_TOKEN_EXPIRY_DAYS = parseInt(process.env.REFRESH_TOKEN_EXPIRY_DAYS || '7', 10);
const BCRYPT_SALT_ROUNDS = parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10);

// ==================== VALIDATION HELPERS ====================
const validateString = (value: unknown, fieldName: string, minLength = 1): string => {
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
  const trimmed = password.trim();
  if (trimmed.length < 8) {
    throw new ValidationError('Password must be at least 8 characters', 'password');
  }
  return trimmed;
};

// ==================== AUTH SERVICE ====================
export class AuthService {
  constructor(private prisma: PrismaClient) {}

  /** Creates a signed access token for an authenticated user. */
  generateAccessToken(userId: number, email: string, role: string): string {
    return jwt.sign(
      { userId, email, role }, 
      ACCESS_TOKEN_SECRET,
      { expiresIn: ACCESS_TOKEN_EXPIRY } as jwt.SignOptions
    );
  }

  /** Creates and stores a refresh token for a user. */
  async generateRefreshToken(userId: number): Promise<string> {
    const token = crypto.randomBytes(48).toString('hex');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token,
        expiresAt,
      }
    });

    return token;
  }

  /** Registers a user and returns public user data with tokens. */
  async registerUser(data: UserRegistrationData): Promise<RegistrationResponse> {
    const name = validateString(data.name, 'name', 2);
    const email = validateEmail(data.email);
    const password = validatePassword(data.password);

    const existing = await this.prisma.authAccount.findUnique({
      where: { email }
    });

    if (existing) {
      throw new UserAlreadyExistsError(email);
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    const roleIdValue = 1;

    const authAccount = await this.prisma.authAccount.create({
      data: {
        email,
        passwordHash,
        name,
        roleId: roleIdValue,
      },
      select: {
        id: true,
        email: true,
        role: { select: { name: true } }
      }
    });

    const user: UserPublicData = {
      id: authAccount.id,
      email: authAccount.email,
      role: authAccount.role.name,
    };

    const accessToken = this.generateAccessToken(user.id, user.email, user.role);
    const refreshToken = await this.generateRefreshToken(user.id);

    return {
      message: 'User created successfully',
      user,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: ACCESS_TOKEN_EXPIRY,
      },
    };
  }

  /** Authenticates credentials and returns public user data with tokens. */
  async login(data: UserLoginData): Promise<LoginResponse> {
    const email = validateEmail(data.email);
    const password = validatePassword(data.password);

    const authAccount = await this.prisma.authAccount.findUnique({
      where: { email },
      include: { role: true }
    });

    if (!authAccount) {
      throw new InvalidCredentialsError();
    }

    const isPasswordValid = await bcrypt.compare(password, authAccount.passwordHash);
    
    if (!isPasswordValid) {
      throw new InvalidCredentialsError();
    }

    const publicUser: UserPublicData = {
      id: authAccount.id,
      email: authAccount.email,
      role: authAccount.role.name,
    };

    const accessToken = this.generateAccessToken(publicUser.id, publicUser.email, publicUser.role);
    const refreshToken = await this.generateRefreshToken(publicUser.id);

    return {
      user: publicUser,
      tokens: {
        accessToken,
        refreshToken,
        expiresIn: ACCESS_TOKEN_EXPIRY,
      },
    };
  }

  /** Rotates a valid refresh token and returns fresh tokens. */
  async refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
    if (!refreshToken || typeof refreshToken !== 'string' || refreshToken.length !== 96) {
      throw new InvalidRefreshTokenError('Invalid refresh token format');
    }

    const refreshTokenRecord = await this.prisma.refreshToken.findUnique({
      where: { token: refreshToken },
      include: { 
        authAccount: { 
          include: { role: true }
        } 
      }
    });

    if (!refreshTokenRecord) {
      throw new InvalidRefreshTokenError();
    }

    if (refreshTokenRecord.expiresAt < new Date()) {
      await this.prisma.refreshToken.delete({
        where: { token: refreshToken }
      });
      throw new InvalidRefreshTokenError('Refresh token expired');
    }

    const authAccount = refreshTokenRecord.authAccount;
    
    const newAccessToken = this.generateAccessToken(
      authAccount.id,
      authAccount.email,
      authAccount.role.name
    );
    
    const newRefreshToken = await this.generateRefreshToken(authAccount.id);

    await this.prisma.refreshToken.delete({
      where: { token: refreshToken }
    });

    return {
      accessToken: newAccessToken,
      refreshToken: newRefreshToken,
      expiresIn: ACCESS_TOKEN_EXPIRY,
    };
  }

  /** Deletes a refresh token if it exists. */
  async logout(refreshToken: string): Promise<void> {
    if (!refreshToken || typeof refreshToken !== 'string') {
      throw new ValidationError('Refresh token is required', 'refreshToken');
    }

    try {
      await this.prisma.refreshToken.delete({
        where: { token: refreshToken }
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        console.warn('Refresh token not found, skipping deletion');
        return;
      }
      throw error;
    }
  }
}