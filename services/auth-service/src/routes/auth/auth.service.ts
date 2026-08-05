import { PrismaClient } from '../../generated/prisma';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcrypt';
import {
  ValidationError,
  UserAlreadyExistsError,
  InvalidCredentialsError,
  InvalidRefreshTokenError,
  InvalidAccountSessionError,
  AccountAlreadyLinkedError,
  AccountNotLinkedError,
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

export interface AccountSummary {
  id: number;
  username: string;
  email: string;
  isActive: boolean;
}

export interface AddAccountResult extends AuthResponse {
  accountSessionToken: string;
  accounts: AccountSummary[];
}

export interface SwitchAccountResult extends AuthResponse {
  accounts: AccountSummary[];
}

export interface LogoutResult {
  switched: boolean;
  session?: AuthResponse;
  accounts?: AccountSummary[];
  accountSessionToken?: string | null;
}

type GeneratedRefreshToken = {
  token: string;
  id: number;
};

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

  private readonly deviceSessionAccountInclude = {
    authAccount: { include: { role: true } },
    refreshToken: true,
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
  async generateRefreshToken(userId: number): Promise<GeneratedRefreshToken> {
    const { refreshTokenBytes, refreshTokenExpiryDays, refreshTokenPepper } = getConfig();
    const token = crypto.randomBytes(refreshTokenBytes).toString('hex');
    const expiresAt = new Date(Date.now() + refreshTokenExpiryDays * 24 * 60 * 60 * 1000);
    const hashed = hashRefreshToken(token, refreshTokenPepper);

    const record = await this.prisma.refreshToken.create({
      data: {
        userId,
        expiresAt,
        tokenLookupHash: hashed.tokenLookupHash,
        tokenHash: hashed.tokenHash,
        tokenSalt: hashed.tokenSalt,
      },
    });

    return { token, id: record.id };
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

  private async requireValidRefreshRecord(refreshToken: string) {
    const expectedRefreshTokenLength = getConfig().refreshTokenBytes * 2;
    if (
      !refreshToken ||
      typeof refreshToken !== 'string' ||
      refreshToken.length !== expectedRefreshTokenLength
    ) {
      throw new InvalidRefreshTokenError('Invalid refresh token format');
    }

    const record = await this.resolveRefreshTokenRecord(refreshToken);
    if (!record) {
      throw new InvalidRefreshTokenError();
    }

    if (record.expiresAt < new Date()) {
      try {
        await this.prisma.refreshToken.delete({ where: { id: record.id } });
      } catch {
        // already deleted
      }
      throw new InvalidRefreshTokenError('Refresh token expired');
    }

    return record;
  }

  private async resolveDeviceSession(accountSessionToken: string) {
    const { refreshTokenPepper } = getConfig();
    const tokenLookupHash = computeLookupHash(accountSessionToken, refreshTokenPepper);

    const session = await this.prisma.deviceSession.findUnique({
      where: { tokenLookupHash },
      include: {
        accounts: {
          include: this.deviceSessionAccountInclude,
        },
      },
    });

    if (!session) {
      return null;
    }

    if (!verifyRefreshTokenHash(accountSessionToken, session.tokenSalt, session.tokenHash)) {
      return null;
    }

    if (session.expiresAt < new Date()) {
      try {
        await this.prisma.deviceSession.delete({ where: { id: session.id } });
      } catch {
        // already deleted
      }
      return null;
    }

    return session;
  }

  private async createDeviceSession(): Promise<{ token: string; id: number }> {
    const { accountSessionTokenBytes, accountSessionCookieMaxAgeDays, refreshTokenPepper } =
      getConfig();
    const token = crypto.randomBytes(accountSessionTokenBytes).toString('hex');
    const expiresAt = new Date(
      Date.now() + accountSessionCookieMaxAgeDays * 24 * 60 * 60 * 1000,
    );
    const hashed = hashRefreshToken(token, refreshTokenPepper);

    const session = await this.prisma.deviceSession.create({
      data: {
        expiresAt,
        tokenLookupHash: hashed.tokenLookupHash,
        tokenHash: hashed.tokenHash,
        tokenSalt: hashed.tokenSalt,
      },
    });

    return { token, id: session.id };
  }

  private async upsertVaultAccount(
    deviceSessionId: number,
    userId: number,
    refreshTokenId: number,
  ): Promise<void> {
    const existing = await this.prisma.deviceSessionAccount.findUnique({
      where: {
        deviceSessionId_userId: { deviceSessionId, userId },
      },
    });

    if (existing) {
      const previousRefreshId = existing.refreshTokenId;
      await this.prisma.deviceSessionAccount.update({
        where: { id: existing.id },
        data: {
          refreshTokenId,
          lastActiveAt: new Date(),
        },
      });
      if (previousRefreshId !== refreshTokenId) {
        try {
          await this.prisma.refreshToken.delete({ where: { id: previousRefreshId } });
        } catch (error: any) {
          if (error.code !== 'P2025') throw error;
        }
      }
      return;
    }

    await this.prisma.deviceSessionAccount.create({
      data: {
        deviceSessionId,
        userId,
        refreshTokenId,
        lastActiveAt: new Date(),
      },
    });
  }

  private toAccountSummaries(
    accounts: Array<{
      userId: number;
      authAccount: { id: number; username: string; email: string };
    }>,
    activeUserId: number,
  ): AccountSummary[] {
    return accounts.map((account) => ({
      id: account.authAccount.id,
      username: account.authAccount.username,
      email: account.authAccount.email,
      isActive: account.userId === activeUserId,
    }));
  }

  private async listVaultAccounts(
    deviceSessionId: number,
    activeUserId: number,
  ): Promise<AccountSummary[]> {
    const accounts = await this.prisma.deviceSessionAccount.findMany({
      where: { deviceSessionId },
      include: { authAccount: true },
      orderBy: { lastActiveAt: 'desc' },
    });

    return this.toAccountSummaries(accounts, activeUserId);
  }

  private buildAuthResponse(
    user: UserPublicData,
    accessToken: string,
    refreshToken: string,
  ): AuthResponse {
    return { accessToken, refreshToken, user };
  }

  private toPublicUser(authAccount: {
    id: number;
    username: string;
    email: string;
    role: { name: string };
  }): UserPublicData {
    return {
      id: authAccount.id,
      username: authAccount.username,
      email: authAccount.email,
      role: authAccount.role.name,
    };
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

    const user = this.toPublicUser(authAccount);
    const accessToken = this.generateAccessToken(user.id, user.email, user.role);
    const refresh = await this.generateRefreshToken(user.id);

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

    return this.buildAuthResponse(user, accessToken, refresh.token);
  }

  /** Deletes expired refresh tokens (and optionally orphaned non-vault sessions). */
  async purgeExpiredRefreshTokens(): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }

  /**
   * Revokes refresh tokens for a user that are not bound to a device vault account.
   * Keeps multi-account vault sessions intact.
   */
  private async revokeOrphanRefreshTokens(userId: number): Promise<void> {
    await this.prisma.refreshToken.deleteMany({
      where: {
        userId,
        deviceSessionAccount: null,
      },
    });
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

    const publicUser = this.toPublicUser(authAccount);
    await this.revokeOrphanRefreshTokens(publicUser.id);
    void this.purgeExpiredRefreshTokens().catch(() => undefined);
    const refresh = await this.generateRefreshToken(publicUser.id);

    return this.buildAuthResponse(
      publicUser,
      this.generateAccessToken(publicUser.id, publicUser.email, publicUser.role),
      refresh.token,
    );
  }

  /** Обновляет access token по действующему refresh token. */
  async refreshAccessToken(refreshToken: string): Promise<AuthTokens> {
    const refreshTokenRecord = await this.requireValidRefreshRecord(refreshToken);
    const authAccount = refreshTokenRecord.authAccount;
    const newAccessToken = this.generateAccessToken(
      authAccount.id,
      authAccount.email,
      authAccount.role.name,
    );
    const newRefresh = await this.generateRefreshToken(authAccount.id);

    const vaultLink = await this.prisma.deviceSessionAccount.findUnique({
      where: { refreshTokenId: refreshTokenRecord.id },
    });

    if (vaultLink) {
      await this.prisma.deviceSessionAccount.update({
        where: { id: vaultLink.id },
        data: {
          refreshTokenId: newRefresh.id,
          lastActiveAt: new Date(),
        },
      });
    }

    await this.prisma.refreshToken.delete({ where: { id: refreshTokenRecord.id } });

    return { accessToken: newAccessToken, refreshToken: newRefresh.token };
  }

  /** Удаляет refresh token при выходе из системы (без vault). */
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

  /**
   * Добавляет второй аккаунт в device vault.
   * Паркует текущую сессию и активирует новый аккаунт.
   */
  async addAccount(
    currentRefreshToken: string,
    accountSessionToken: string | undefined,
    data: UserLoginData,
  ): Promise<AddAccountResult> {
    const currentRecord = await this.requireValidRefreshRecord(currentRefreshToken);
    const currentUser = this.toPublicUser(currentRecord.authAccount);

    let deviceSessionId: number;
    let sessionToken: string;

    if (accountSessionToken) {
      const existingSession = await this.resolveDeviceSession(accountSessionToken);
      if (!existingSession) {
        throw new InvalidAccountSessionError();
      }
      deviceSessionId = existingSession.id;
      sessionToken = accountSessionToken;
    } else {
      const created = await this.createDeviceSession();
      deviceSessionId = created.id;
      sessionToken = created.token;
    }

    await this.upsertVaultAccount(deviceSessionId, currentUser.id, currentRecord.id);

    const email = validateEmail(data.email);
    const password = validatePassword(data.password);

    const authAccount = await this.prisma.authAccount.findUnique({
      where: { email },
      include: { role: true },
    });

    if (!authAccount || !(await bcrypt.compare(password, authAccount.passwordHash))) {
      throw new InvalidCredentialsError();
    }

    if (authAccount.id === currentUser.id) {
      throw new AccountAlreadyLinkedError('Cannot add the currently active account');
    }

    const alreadyLinked = await this.prisma.deviceSessionAccount.findUnique({
      where: {
        deviceSessionId_userId: {
          deviceSessionId,
          userId: authAccount.id,
        },
      },
    });

    if (alreadyLinked) {
      throw new AccountAlreadyLinkedError();
    }

    const newUser = this.toPublicUser(authAccount);
    const newRefresh = await this.generateRefreshToken(newUser.id);

    await this.prisma.deviceSessionAccount.create({
      data: {
        deviceSessionId,
        userId: newUser.id,
        refreshTokenId: newRefresh.id,
        lastActiveAt: new Date(),
      },
    });

    const accounts = await this.listVaultAccounts(deviceSessionId, newUser.id);

    return {
      ...this.buildAuthResponse(
        newUser,
        this.generateAccessToken(newUser.id, newUser.email, newUser.role),
        newRefresh.token,
      ),
      accountSessionToken: sessionToken,
      accounts,
    };
  }

  /** Список аккаунтов в vault текущего устройства. */
  async listAccounts(
    currentRefreshToken: string,
    accountSessionToken: string | undefined,
  ): Promise<AccountSummary[]> {
    const currentRecord = await this.requireValidRefreshRecord(currentRefreshToken);

    if (!accountSessionToken) {
      return [
        {
          id: currentRecord.authAccount.id,
          username: currentRecord.authAccount.username,
          email: currentRecord.authAccount.email,
          isActive: true,
        },
      ];
    }

    const session = await this.resolveDeviceSession(accountSessionToken);
    if (!session) {
      return [
        {
          id: currentRecord.authAccount.id,
          username: currentRecord.authAccount.username,
          email: currentRecord.authAccount.email,
          isActive: true,
        },
      ];
    }

    const inVault = session.accounts.some(
      (account) => account.userId === currentRecord.authAccount.id,
    );

    if (!inVault) {
      await this.upsertVaultAccount(
        session.id,
        currentRecord.authAccount.id,
        currentRecord.id,
      );
    }

    return this.listVaultAccounts(session.id, currentRecord.authAccount.id);
  }

  /** Мгновенное переключение на другой аккаунт из vault. */
  async switchAccount(
    currentRefreshToken: string,
    accountSessionToken: string | undefined,
    targetUserId: number,
  ): Promise<SwitchAccountResult> {
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      throw new ValidationError('userId must be a positive integer', 'userId');
    }

    if (!accountSessionToken) {
      throw new InvalidAccountSessionError('Account session is required to switch accounts');
    }

    const currentRecord = await this.requireValidRefreshRecord(currentRefreshToken);
    const session = await this.resolveDeviceSession(accountSessionToken);
    if (!session) {
      throw new InvalidAccountSessionError();
    }

    const currentVault = session.accounts.find(
      (account) => account.userId === currentRecord.authAccount.id,
    );
    if (!currentVault) {
      throw new AccountNotLinkedError('Current account is not linked on this device');
    }

    if (targetUserId === currentRecord.authAccount.id) {
      const accounts = await this.listVaultAccounts(session.id, targetUserId);
      return {
        ...this.buildAuthResponse(
          this.toPublicUser(currentRecord.authAccount),
          this.generateAccessToken(
            currentRecord.authAccount.id,
            currentRecord.authAccount.email,
            currentRecord.authAccount.role.name,
          ),
          currentRefreshToken,
        ),
        accounts,
      };
    }

    const targetVault = session.accounts.find((account) => account.userId === targetUserId);
    if (!targetVault) {
      throw new AccountNotLinkedError();
    }

    await this.prisma.deviceSessionAccount.update({
      where: { id: currentVault.id },
      data: {
        refreshTokenId: currentRecord.id,
        lastActiveAt: new Date(),
      },
    });

    const previousTargetRefreshId = targetVault.refreshTokenId;
    const newRefresh = await this.generateRefreshToken(targetUserId);
    await this.prisma.deviceSessionAccount.update({
      where: { id: targetVault.id },
      data: {
        refreshTokenId: newRefresh.id,
        lastActiveAt: new Date(),
      },
    });

    if (previousTargetRefreshId !== currentRecord.id) {
      try {
        await this.prisma.refreshToken.delete({ where: { id: previousTargetRefreshId } });
      } catch (error: any) {
        if (error.code !== 'P2025') throw error;
      }
    }

    const targetUser = this.toPublicUser(targetVault.authAccount);
    const accounts = await this.listVaultAccounts(session.id, targetUser.id);

    return {
      ...this.buildAuthResponse(
        targetUser,
        this.generateAccessToken(targetUser.id, targetUser.email, targetUser.role),
        newRefresh.token,
      ),
      accounts,
    };
  }

  /**
   * Logout текущего аккаунта из vault.
   * Если остались другие — auto-switch на последний активный.
   */
  async logoutWithVault(
    refreshToken: string | undefined,
    accountSessionToken: string | undefined,
  ): Promise<LogoutResult> {
    if (!refreshToken) {
      return { switched: false, accountSessionToken: null };
    }

    const currentRecord = await this.resolveRefreshTokenRecord(refreshToken);
    if (!currentRecord) {
      return { switched: false, accountSessionToken: null };
    }

    if (!accountSessionToken) {
      try {
        await this.prisma.refreshToken.delete({ where: { id: currentRecord.id } });
      } catch (error: any) {
        if (error.code !== 'P2025') throw error;
      }
      return { switched: false, accountSessionToken: null };
    }

    const session = await this.resolveDeviceSession(accountSessionToken);
    if (!session) {
      try {
        await this.prisma.refreshToken.delete({ where: { id: currentRecord.id } });
      } catch (error: any) {
        if (error.code !== 'P2025') throw error;
      }
      return { switched: false, accountSessionToken: null };
    }

    const currentVault = session.accounts.find(
      (account) => account.userId === currentRecord.authAccount.id,
    );

    if (currentVault) {
      await this.prisma.deviceSessionAccount.delete({ where: { id: currentVault.id } });
    }

    try {
      await this.prisma.refreshToken.delete({ where: { id: currentRecord.id } });
    } catch (error: any) {
      if (error.code !== 'P2025') throw error;
    }

    const remaining = await this.prisma.deviceSessionAccount.findMany({
      where: { deviceSessionId: session.id },
      include: this.deviceSessionAccountInclude,
      orderBy: { lastActiveAt: 'desc' },
    });

    if (remaining.length === 0) {
      try {
        await this.prisma.deviceSession.delete({ where: { id: session.id } });
      } catch {
        // already deleted
      }
      return { switched: false, accountSessionToken: null };
    }

    const next = remaining[0];
    const previousNextRefreshId = next.refreshTokenId;
    const newRefresh = await this.generateRefreshToken(next.userId);
    await this.prisma.deviceSessionAccount.update({
      where: { id: next.id },
      data: {
        refreshTokenId: newRefresh.id,
        lastActiveAt: new Date(),
      },
    });

    try {
      await this.prisma.refreshToken.delete({ where: { id: previousNextRefreshId } });
    } catch (error: any) {
      if (error.code !== 'P2025') throw error;
    }

    const nextUser = this.toPublicUser(next.authAccount);
    const accounts = await this.listVaultAccounts(session.id, nextUser.id);

    return {
      switched: true,
      accountSessionToken,
      accounts,
      session: this.buildAuthResponse(
        nextUser,
        this.generateAccessToken(nextUser.id, nextUser.email, nextUser.role),
        newRefresh.token,
      ),
    };
  }
}
