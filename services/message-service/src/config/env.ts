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

export interface MessageServiceConfig {
  serviceName: string;
  port: number;
  host: string;
  jwtSecret: string;
  authServiceUrl: string;
  serviceClientId: string;
  serviceClientSecret: string;
  databaseUrl: string;
  rabbitmqUrl: string;
  userServiceUrl: string;
  userServiceTimeoutMs: number;
  messageEventsExchange: string;
  defaultPage: number;
  defaultPageSize: number;
  rabbitmqConnectMaxAttempts: number;
  rabbitmqConnectRetryDelayMs: number;
  rabbitmqConnectMaxRetryDelayMs: number;
  s3Endpoint: string;
  s3Region: string;
  s3Bucket: string;
  s3AccessKeyId: string;
  s3SecretAccessKey: string;
  s3PublicBaseUrl: string;
  s3UploadEndpoint: string;
  s3UploadUrlTtlSeconds: number;
  s3ForcePathStyle: boolean;
  maxAttachmentBytes: number;
  maxAttachmentsPerMessage: number;
  redisUrl: string;
  rateLimitSendMax: number;
  rateLimitSendWindowMs: number;
}

let configCache: MessageServiceConfig | null = null;

/** Возвращает конфигурацию message-service из переменных окружения. */
export const getConfig = (): MessageServiceConfig => {
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
      userServiceUrl: requireEnv('USER_SERVICE_URL'),
      userServiceTimeoutMs: requirePositiveInt('USER_SERVICE_TIMEOUT_MS'),
      messageEventsExchange: requireEnv('MESSAGE_EVENTS_EXCHANGE'),
      defaultPage: requirePositiveInt('DEFAULT_PAGE'),
      defaultPageSize: requirePositiveInt('DEFAULT_PAGE_SIZE'),
      rabbitmqConnectMaxAttempts: requirePositiveInt('RABBITMQ_CONNECT_MAX_ATTEMPTS'),
      rabbitmqConnectRetryDelayMs: requirePositiveInt('RABBITMQ_CONNECT_RETRY_DELAY_MS'),
      rabbitmqConnectMaxRetryDelayMs: requirePositiveInt('RABBITMQ_CONNECT_MAX_RETRY_DELAY_MS'),
      s3Endpoint: requireEnv('S3_ENDPOINT'),
      s3Region: requireEnv('S3_REGION'),
      s3Bucket: requireEnv('S3_BUCKET'),
      s3AccessKeyId: requireEnv('S3_ACCESS_KEY_ID'),
      s3SecretAccessKey: requireEnv('S3_SECRET_ACCESS_KEY'),
      s3PublicBaseUrl: requireEnv('S3_PUBLIC_BASE_URL'),
      s3UploadEndpoint: requireEnv('S3_UPLOAD_ENDPOINT'),
      s3UploadUrlTtlSeconds: requirePositiveInt('S3_UPLOAD_URL_TTL_SECONDS'),
      s3ForcePathStyle: requireEnv('S3_FORCE_PATH_STYLE') === 'true',
      maxAttachmentBytes: Number.parseInt(process.env.MAX_ATTACHMENT_BYTES ?? '20971520', 10) || 20971520,
      maxAttachmentsPerMessage:
        Number.parseInt(process.env.MAX_ATTACHMENTS_PER_MESSAGE ?? '5', 10) || 5,
      redisUrl: process.env.REDIS_URL ?? '',
      rateLimitSendMax: Number.parseInt(process.env.RATE_LIMIT_SEND_MAX ?? '60', 10) || 60,
      rateLimitSendWindowMs:
        Number.parseInt(process.env.RATE_LIMIT_SEND_WINDOW_MS ?? '60000', 10) || 60_000,
    };
  }

  return configCache;
};
