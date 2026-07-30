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

const optionalString = (name: string, defaultValue: string): string => {
  return process.env[name] ?? defaultValue;
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

const optionalBoolean = (name: string, defaultValue: boolean): boolean => {
  const raw = process.env[name];
  if (raw === undefined) {
    return defaultValue;
  }
  return raw === 'true' || raw === '1';
};

export interface NotificationQueuesConfig {
  commentCreated: string;
  commentUpdated: string;
  commentDeleted: string;
  postCreated: string;
  postUpdated: string;
  postDeleted: string;
  postLiked: string;
  friendRequested: string;
  friendAccepted: string;
  friendRemoved: string;
  friendCancelled: string;
  friendDeclined: string;
  followCreated: string;
  followDeleted: string;
  userUpdated: string;
  photoCreated: string;
  photoDeleted: string;
}

export interface NotificationsServiceConfig {
  serviceName: string;
  port: number;
  host: string;
  databaseUrl: string;
  rabbitmqUrl: string;
  jwtSecret: string;
  jwtIssuer: string;
  jwtAudience: string;
  jwtClockToleranceSec: number;
  jwtClaimsStrict: boolean;
  authServiceUrl: string;
  serviceClientId: string;
  serviceClientSecret: string;
  userServiceUrl: string;
  userServiceTimeoutMs: number;
  socketCorsOrigin: string;
  userEventsExchange: string;
  postEventsExchange: string;
  rabbitmqConnectMaxAttempts: number;
  rabbitmqConnectRetryDelayMs: number;
  rabbitmqConnectMaxRetryDelayMs: number;
  rabbitmqPrefetchCount: number;
  dbConnectMaxAttempts: number;
  dbConnectRetryDelayMs: number;
  queues: NotificationQueuesConfig;
}

let configCache: NotificationsServiceConfig | null = null;

/** Возвращает конфигурацию notifications-service из переменных окружения. */
export const getConfig = (): NotificationsServiceConfig => {
  if (!configCache) {
    loadEnv();
    configCache = {
      serviceName: requireEnv('SERVICE_NAME'),
      port: requirePositiveInt('PORT'),
      host: requireEnv('HOST'),
      databaseUrl: requireEnv('DATABASE_URL'),
      rabbitmqUrl: requireEnv('RABBITMQ_URL'),
      jwtSecret: requireEnv('JWT_SECRET'),
      jwtIssuer: optionalString('JWT_ISSUER', 'social-auth-service'),
      jwtAudience: optionalString('JWT_AUDIENCE', 'social-api'),
      jwtClockToleranceSec: optionalPositiveInt('JWT_CLOCK_TOLERANCE_SEC', 30),
      jwtClaimsStrict: optionalBoolean('JWT_CLAIMS_STRICT', false),
      authServiceUrl: requireEnv('AUTH_SERVICE_URL'),
      serviceClientId: requireEnv('SERVICE_CLIENT_ID'),
      serviceClientSecret: requireEnv('SERVICE_CLIENT_SECRET'),
      userServiceUrl: requireEnv('USER_SERVICE_URL'),
      userServiceTimeoutMs: requirePositiveInt('USER_SERVICE_TIMEOUT_MS'),
      socketCorsOrigin: requireEnv('SOCKET_CORS_ORIGIN'),
      userEventsExchange: requireEnv('USER_EVENTS_EXCHANGE'),
      postEventsExchange: requireEnv('POST_EVENTS_EXCHANGE'),
      rabbitmqConnectMaxAttempts: requirePositiveInt('RABBITMQ_CONNECT_MAX_ATTEMPTS'),
      rabbitmqConnectRetryDelayMs: requirePositiveInt('RABBITMQ_CONNECT_RETRY_DELAY_MS'),
      rabbitmqConnectMaxRetryDelayMs: requirePositiveInt('RABBITMQ_CONNECT_MAX_RETRY_DELAY_MS'),
      rabbitmqPrefetchCount: requirePositiveInt('RABBITMQ_PREFETCH_COUNT'),
      dbConnectMaxAttempts: requirePositiveInt('DB_CONNECT_MAX_ATTEMPTS'),
      dbConnectRetryDelayMs: requirePositiveInt('DB_CONNECT_RETRY_DELAY_MS'),
      queues: {
        commentCreated: requireEnv('QUEUE_COMMENT_CREATED'),
        commentUpdated: requireEnv('QUEUE_COMMENT_UPDATED'),
        commentDeleted: requireEnv('QUEUE_COMMENT_DELETED'),
        postCreated: requireEnv('QUEUE_POST_CREATED'),
        postUpdated: requireEnv('QUEUE_POST_UPDATED'),
        postDeleted: requireEnv('QUEUE_POST_DELETED'),
        postLiked: requireEnv('QUEUE_POST_LIKED'),
        friendRequested: requireEnv('QUEUE_FRIEND_REQUESTED'),
        friendAccepted: requireEnv('QUEUE_FRIEND_ACCEPTED'),
        friendRemoved: requireEnv('QUEUE_FRIEND_REMOVED'),
        friendCancelled: requireEnv('QUEUE_FRIEND_CANCELLED'),
        friendDeclined: requireEnv('QUEUE_FRIEND_DECLINED'),
        followCreated: requireEnv('QUEUE_FOLLOW_CREATED'),
        followDeleted: requireEnv('QUEUE_FOLLOW_DELETED'),
        userUpdated: requireEnv('QUEUE_USER_UPDATED'),
        photoCreated: requireEnv('QUEUE_PHOTO_CREATED'),
        photoDeleted: requireEnv('QUEUE_PHOTO_DELETED'),
      },
    };
  }

  return configCache;
};
