import path from 'path';

let loaded = false;

/** Загружает переменные окружения из .env сервиса в режиме разработки. */
export const loadEnv = (): void => {
  if (loaded) {
    return;
  }

  if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });
  }

  loaded = true;
};

const requireEnv = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
};

const requireInt = (name: string): number => {
  const value = Number.parseInt(requireEnv(name), 10);
  if (!Number.isInteger(value)) {
    throw new Error(`${name} must be an integer`);
  }
  return value;
};

const requirePositiveInt = (name: string): number => {
  const value = requireInt(name);
  if (value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
};

const optionalPositiveInt = (name: string, defaultValue: number): number => {
  const raw = process.env[name];
  if (!raw) {
    return defaultValue;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
};

const optionalString = (name: string, defaultValue: string): string => {
  return process.env[name] ?? defaultValue;
};

const optionalBoolean = (name: string, defaultValue: boolean): boolean => {
  const raw = process.env[name];
  if (raw === undefined) {
    return defaultValue;
  }
  return raw === 'true' || raw === '1';
};

const requireMinLengthSecret = (name: string, minLength: number): string => {
  const value = requireEnv(name);
  if (value.length < minLength) {
    throw new Error(`${name} must be at least ${minLength} characters`);
  }
  return value;
};

export interface AuthServiceConfig {
  serviceName: string;
  port: number;
  host: string;
  trustProxyHops: number;
  rateLimitLoginMax: number;
  rateLimitLoginWindowMs: number;
  rateLimitRegisterMax: number;
  rateLimitRegisterWindowMs: number;
  rateLimitRefreshMax: number;
  rateLimitRefreshWindowMs: number;
  redisUrl: string;
  refreshCookieName: string;
  refreshCookiePath: string;
  refreshCookieSameSite: string;
  refreshCookieSecure: boolean;
  refreshCookieMaxAgeDays: number;
  accountSessionCookieName: string;
  accountSessionCookieMaxAgeDays: number;
  accountSessionTokenBytes: number;
  databaseUrl: string;
  rabbitmqUrl: string;
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  jwtClockToleranceSec: number;
  jwtClaimsStrict: boolean;
  serviceJwtSecret: string;
  serviceJwtTtlSec: number;
  accessTokenKeyId: string;
  accessTokenExpiry: string;
  refreshTokenExpiryDays: number;
  bcryptSaltRounds: number;
  defaultUserRoleId: number;
  refreshTokenBytes: number;
  refreshTokenPepper: string;
  minPasswordLength: number;
  minUsernameLength: number;
  userEventsExchange: string;
  rabbitmqConnectMaxAttempts: number;
  rabbitmqConnectRetryDelayMs: number;
  rabbitmqConnectMaxRetryDelayMs: number;
}

let configCache: AuthServiceConfig | null = null;

/** Возвращает конфигурацию auth-service из переменных окружения. */
export const getConfig = (): AuthServiceConfig => {
  if (!configCache) {
    loadEnv();
    configCache = {
      serviceName: requireEnv('SERVICE_NAME'),
      port: requirePositiveInt('PORT'),
      host: requireEnv('HOST'),
      trustProxyHops: optionalPositiveInt('TRUST_PROXY_HOPS', 1),
      rateLimitLoginMax: optionalPositiveInt('RATE_LIMIT_LOGIN_MAX', 5),
      rateLimitLoginWindowMs: optionalPositiveInt('RATE_LIMIT_LOGIN_WINDOW_MS', 60_000),
      rateLimitRegisterMax: optionalPositiveInt('RATE_LIMIT_REGISTER_MAX', 3),
      rateLimitRegisterWindowMs: optionalPositiveInt('RATE_LIMIT_REGISTER_WINDOW_MS', 3_600_000),
      rateLimitRefreshMax: optionalPositiveInt('RATE_LIMIT_REFRESH_MAX', 30),
      rateLimitRefreshWindowMs: optionalPositiveInt('RATE_LIMIT_REFRESH_WINDOW_MS', 60_000),
      redisUrl: optionalString('REDIS_URL', ''),
      refreshCookieName: optionalString('REFRESH_COOKIE_NAME', 'refreshToken'),
      refreshCookiePath: optionalString('REFRESH_COOKIE_PATH', '/api/auth'),
      refreshCookieSameSite: optionalString('REFRESH_COOKIE_SAME_SITE', 'lax'),
      refreshCookieSecure: optionalBoolean(
        'REFRESH_COOKIE_SECURE',
        process.env.NODE_ENV === 'production',
      ),
      refreshCookieMaxAgeDays: optionalPositiveInt('REFRESH_COOKIE_MAX_AGE_DAYS', 7),
      accountSessionCookieName: optionalString('ACCOUNT_SESSION_COOKIE_NAME', 'accountSession'),
      accountSessionCookieMaxAgeDays: optionalPositiveInt(
        'ACCOUNT_SESSION_COOKIE_MAX_AGE_DAYS',
        30,
      ),
      accountSessionTokenBytes: optionalPositiveInt('ACCOUNT_SESSION_TOKEN_BYTES', 48),
      databaseUrl: requireEnv('DATABASE_URL'),
      rabbitmqUrl: requireEnv('RABBITMQ_URL'),
      jwtSecret: requireMinLengthSecret('JWT_SECRET', 32),
      jwtIssuer: optionalString('JWT_ISSUER', 'social-auth-service'),
      jwtAudience: optionalString('JWT_AUDIENCE', 'social-api'),
      jwtClockToleranceSec: optionalPositiveInt('JWT_CLOCK_TOLERANCE_SEC', 30),
      jwtClaimsStrict: optionalBoolean('JWT_CLAIMS_STRICT', false),
      serviceJwtSecret: requireMinLengthSecret('SERVICE_JWT_SECRET', 32),
      serviceJwtTtlSec: optionalPositiveInt('SERVICE_JWT_TTL_SEC', 300),
      accessTokenKeyId: requireEnv('ACCESS_TOKEN_KEY_ID'),
      accessTokenExpiry: requireEnv('ACCESS_TOKEN_EXPIRY'),
      refreshTokenExpiryDays: requirePositiveInt('REFRESH_TOKEN_EXPIRY_DAYS'),
      bcryptSaltRounds: requirePositiveInt('BCRYPT_SALT_ROUNDS'),
      defaultUserRoleId: requirePositiveInt('DEFAULT_USER_ROLE_ID'),
      refreshTokenBytes: requirePositiveInt('REFRESH_TOKEN_BYTES'),
      refreshTokenPepper: requireMinLengthSecret('REFRESH_TOKEN_PEPPER', 32),
      minPasswordLength: requirePositiveInt('MIN_PASSWORD_LENGTH'),
      minUsernameLength: requirePositiveInt('MIN_USERNAME_LENGTH'),
      userEventsExchange: requireEnv('USER_EVENTS_EXCHANGE'),
      rabbitmqConnectMaxAttempts: requirePositiveInt('RABBITMQ_CONNECT_MAX_ATTEMPTS'),
      rabbitmqConnectRetryDelayMs: requirePositiveInt('RABBITMQ_CONNECT_RETRY_DELAY_MS'),
      rabbitmqConnectMaxRetryDelayMs: requirePositiveInt('RABBITMQ_CONNECT_MAX_RETRY_DELAY_MS'),
    };
  }

  return configCache;
};
