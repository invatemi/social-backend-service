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

export interface UserServiceConfig {
  serviceName: string;
  port: number;
  host: string;
  jwtSecret: string;
  databaseUrl: string;
  authDatabaseUrl: string;
  rabbitmqUrl: string;
  redisUrl: string;
  redisConnectTimeoutMs: number;
  redisReconnectBaseMs: number;
  redisReconnectMaxMs: number;
  userCacheTtlSeconds: number;
  userListCacheTtlSeconds: number;
  userEventsExchange: string;
  userRegisteredQueue: string;
  userRegisteredRoutingKey: string;
  rabbitmqConnectMaxAttempts: number;
  rabbitmqConnectRetryDelayMs: number;
  rabbitmqConnectMaxRetryDelayMs: number;
  rabbitmqPrefetchCount: number;
  paginationDefaultLimit: number;
  paginationMaxLimit: number;
  maxAuthorsBatchSize: number;
  minSearchQueryLength: number;
  bcryptSaltRounds: number;
  passwordChangePurpose: string;
  passwordCodeTtlMinutes: number;
  minPasswordLength: number;
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  s3Endpoint: string;
  s3Region: string;
  s3Bucket: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3PublicBaseUrl: string;
  s3UploadEndpoint: string;
  s3UploadUrlTtlSeconds: number;
  s3ForcePathStyle: boolean;
}

let configCache: UserServiceConfig | null = null;

/** Возвращает конфигурацию user-service из переменных окружения. */
export const getConfig = (): UserServiceConfig => {
  if (!configCache) {
    loadEnv();
    configCache = {
      serviceName: requireEnv('SERVICE_NAME'),
      port: requirePositiveInt('PORT'),
      host: requireEnv('HOST'),
      jwtSecret: requireEnv('JWT_SECRET'),
      databaseUrl: requireEnv('DATABASE_URL'),
      authDatabaseUrl: requireEnv('AUTH_DATABASE_URL'),
      rabbitmqUrl: requireEnv('RABBITMQ_URL'),
      redisUrl: requireEnv('REDIS_URL'),
      redisConnectTimeoutMs: requirePositiveInt('REDIS_CONNECT_TIMEOUT_MS'),
      redisReconnectBaseMs: requirePositiveInt('REDIS_RECONNECT_BASE_MS'),
      redisReconnectMaxMs: requirePositiveInt('REDIS_RECONNECT_MAX_MS'),
      userCacheTtlSeconds: requirePositiveInt('USER_CACHE_TTL_SECONDS'),
      userListCacheTtlSeconds: requirePositiveInt('USER_LIST_CACHE_TTL_SECONDS'),
      userEventsExchange: requireEnv('USER_EVENTS_EXCHANGE'),
      userRegisteredQueue: requireEnv('USER_REGISTERED_QUEUE'),
      userRegisteredRoutingKey: requireEnv('USER_REGISTERED_ROUTING_KEY'),
      rabbitmqConnectMaxAttempts: requirePositiveInt('RABBITMQ_CONNECT_MAX_ATTEMPTS'),
      rabbitmqConnectRetryDelayMs: requirePositiveInt('RABBITMQ_CONNECT_RETRY_DELAY_MS'),
      rabbitmqConnectMaxRetryDelayMs: requirePositiveInt('RABBITMQ_CONNECT_MAX_RETRY_DELAY_MS'),
      rabbitmqPrefetchCount: requirePositiveInt('RABBITMQ_PREFETCH_COUNT'),
      paginationDefaultLimit: requirePositiveInt('PAGINATION_DEFAULT_LIMIT'),
      paginationMaxLimit: requirePositiveInt('PAGINATION_MAX_LIMIT'),
      maxAuthorsBatchSize: requirePositiveInt('MAX_AUTHORS_BATCH_SIZE'),
      minSearchQueryLength: requirePositiveInt('MIN_SEARCH_QUERY_LENGTH'),
      bcryptSaltRounds: requirePositiveInt('BCRYPT_SALT_ROUNDS'),
      passwordChangePurpose: requireEnv('PASSWORD_CHANGE_PURPOSE'),
      passwordCodeTtlMinutes: requirePositiveInt('PASSWORD_CODE_TTL_MINUTES'),
      minPasswordLength: requirePositiveInt('MIN_PASSWORD_LENGTH'),
      smtpHost: requireEnv('SMTP_HOST'),
      smtpPort: requirePositiveInt('SMTP_PORT'),
      smtpUser: requireEnv('SMTP_USER'),
      smtpPass: requireEnv('SMTP_PASS'),
      smtpFrom: requireEnv('SMTP_FROM'),
      s3Endpoint: requireEnv('S3_ENDPOINT'),
      s3Region: requireEnv('S3_REGION'),
      s3Bucket: requireEnv('S3_BUCKET'),
      s3AccessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
      s3SecretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
      s3PublicBaseUrl: requireEnv('S3_PUBLIC_BASE_URL'),
      s3UploadEndpoint: requireEnv('S3_UPLOAD_ENDPOINT'),
      s3UploadUrlTtlSeconds: requirePositiveInt('S3_UPLOAD_URL_TTL_SECONDS'),
      s3ForcePathStyle: requireEnv('S3_FORCE_PATH_STYLE') === 'true',
    };
  }

  return configCache;
};
