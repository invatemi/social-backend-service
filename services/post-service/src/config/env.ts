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

export interface PostServiceConfig {
  serviceName: string;
  port: number;
  host: string;
  jwtSecret: string;
  authServiceUrl: string;
  serviceClientId: string;
  serviceClientSecret: string;
  databaseUrl: string;
  rabbitmqUrl: string;
  redisUrl: string;
  redisConnectTimeoutMs: number;
  redisReconnectBaseMs: number;
  redisReconnectMaxMs: number;
  postCacheTtlSeconds: number;
  postListCacheTtlSeconds: number;
  userServiceUrl: string;
  userServiceTimeoutMs: number;
  postEventsExchange: string;
  defaultPage: number;
  defaultPageSize: number;
  rabbitmqConnectMaxAttempts: number;
  rabbitmqConnectRetryDelayMs: number;
  rabbitmqConnectMaxRetryDelayMs: number;
}

let configCache: PostServiceConfig | null = null;

/** Возвращает конфигурацию post-service из переменных окружения. */
export const getConfig = (): PostServiceConfig => {
  if (!configCache) {
    loadEnv();
    configCache = {
      serviceName: requireEnv('SERVICE_NAME'),
      port: requirePositiveInt('PORT'),
      host: requireEnv('HOST'),
      jwtSecret: requireEnv('JWT_SECRET'),
      authServiceUrl: requireEnv('AUTH_SERVICE_URL'),
      serviceClientId: requireEnv('SERVICE_CLIENT_ID'),
      serviceClientSecret: requireEnv('SERVICE_CLIENT_SECRET'),
      databaseUrl: requireEnv('DATABASE_URL'),
      rabbitmqUrl: requireEnv('RABBITMQ_URL'),
      redisUrl: requireEnv('REDIS_URL'),
      redisConnectTimeoutMs: requirePositiveInt('REDIS_CONNECT_TIMEOUT_MS'),
      redisReconnectBaseMs: requirePositiveInt('REDIS_RECONNECT_BASE_MS'),
      redisReconnectMaxMs: requirePositiveInt('REDIS_RECONNECT_MAX_MS'),
      postCacheTtlSeconds: requirePositiveInt('POST_CACHE_TTL_SECONDS'),
      postListCacheTtlSeconds: requirePositiveInt('POST_LIST_CACHE_TTL_SECONDS'),
      userServiceUrl: requireEnv('USER_SERVICE_URL'),
      userServiceTimeoutMs: requirePositiveInt('USER_SERVICE_TIMEOUT_MS'),
      postEventsExchange: requireEnv('POST_EVENTS_EXCHANGE'),
      defaultPage: requirePositiveInt('DEFAULT_PAGE'),
      defaultPageSize: requirePositiveInt('DEFAULT_PAGE_SIZE'),
      rabbitmqConnectMaxAttempts: requirePositiveInt('RABBITMQ_CONNECT_MAX_ATTEMPTS'),
      rabbitmqConnectRetryDelayMs: requirePositiveInt('RABBITMQ_CONNECT_RETRY_DELAY_MS'),
      rabbitmqConnectMaxRetryDelayMs: requirePositiveInt('RABBITMQ_CONNECT_MAX_RETRY_DELAY_MS'),
    };
  }

  return configCache;
};
