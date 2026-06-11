import path from 'path';

let loaded = false;

export const loadEnv = (): void => {
  if (loaded) return;

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

const requirePositiveInt = (name: string): number => {
  const value = Number.parseInt(requireEnv(name), 10);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
};

export interface MessageServiceConfig {
  serviceName: string;
  port: number;
  host: string;
  databaseUrl: string;
  jwtSecret: string;
  dbConnectMaxAttempts: number;
  dbConnectRetryDelayMs: number;
}

let configCache: MessageServiceConfig | null = null;

export const getConfig = (): MessageServiceConfig => {
  if (!configCache) {
    loadEnv();
    configCache = {
      serviceName: requireEnv('SERVICE_NAME'),
      port: requirePositiveInt('PORT'),
      host: requireEnv('HOST'),
      databaseUrl: requireEnv('DATABASE_URL'),
      jwtSecret: requireEnv('JWT_SECRET'),
      dbConnectMaxAttempts: requirePositiveInt('DB_CONNECT_MAX_ATTEMPTS'),
      dbConnectRetryDelayMs: requirePositiveInt('DB_CONNECT_RETRY_DELAY_MS'),
    };
  }

  return configCache;
};
