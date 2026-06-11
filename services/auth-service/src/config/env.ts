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

export interface AuthServiceConfig {
  serviceName: string;
  port: number;
  host: string;
  databaseUrl: string;
  rabbitmqUrl: string;
  jwtSecret: string;
  accessTokenKeyId: string;
  accessTokenExpiry: string;
  refreshTokenExpiryDays: number;
  bcryptSaltRounds: number;
  defaultUserRoleId: number;
  refreshTokenBytes: number;
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
      databaseUrl: requireEnv('DATABASE_URL'),
      rabbitmqUrl: requireEnv('RABBITMQ_URL'),
      jwtSecret: requireEnv('JWT_SECRET'),
      accessTokenKeyId: requireEnv('ACCESS_TOKEN_KEY_ID'),
      accessTokenExpiry: requireEnv('ACCESS_TOKEN_EXPIRY'),
      refreshTokenExpiryDays: requirePositiveInt('REFRESH_TOKEN_EXPIRY_DAYS'),
      bcryptSaltRounds: requirePositiveInt('BCRYPT_SALT_ROUNDS'),
      defaultUserRoleId: requirePositiveInt('DEFAULT_USER_ROLE_ID'),
      refreshTokenBytes: requirePositiveInt('REFRESH_TOKEN_BYTES'),
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
