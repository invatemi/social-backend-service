import express from 'express';
import cookieParser from 'cookie-parser';
import {
  getConfig,
  loadEnv,
  Database,
  createHealthHandler,
  registerShutdown,
} from './config';
import {
  errorHandler,
  requestLogger,
  jsonErrorHandler,
  eventBus,
  createAuthRateLimiters,
} from './middleware';
import { authRoutes, internalRoutes } from './routes';
import { AuthService } from './routes/auth/auth.service';

loadEnv();
const config = getConfig();

const database = new Database(config.databaseUrl);
const app = express();
const { port, host, serviceName } = config;
const { loginRateLimiter, registerRateLimiter, refreshRateLimiter } =
  createAuthRateLimiters(config);
const REFRESH_TOKEN_CLEANUP_MS = 60 * 60 * 1000;

app.set('trust proxy', config.trustProxyHops);

app.use(express.json());
app.use(cookieParser());
app.use(jsonErrorHandler);
app.use(requestLogger);

app.use('/api/auth/login', loginRateLimiter);
app.use('/api/auth/register', registerRateLimiter);
app.use('/api/auth/refresh', refreshRateLimiter);

app.use('/api/auth', (req, _res, next) => {
  (req as any).prisma = database.prisma;
  next();
}, authRoutes);

app.use('/api/auth/internal', internalRoutes);

app.get('/health', createHealthHandler(serviceName, () => database.isHealthy()));
app.use(errorHandler);

void eventBus.connect().catch((error) => {
  console.log('[EventBus] Не удалось подключиться к RabbitMQ:', error);
});

const server = app.listen(port, host, () => {
  console.log(`${serviceName} запущен на порту ${port}`);
});

const authCleanupService = new AuthService(database.prisma);
const purgeExpiredTokens = () =>
  authCleanupService
    .purgeExpiredRefreshTokens()
    .then((count) => {
      if (count > 0) {
        console.log(`[AuthService] Purged ${count} expired refresh token(s)`);
      }
    })
    .catch((error) => {
      console.log('[AuthService] Failed to purge expired refresh tokens:', error);
    });

void purgeExpiredTokens();
const refreshCleanupTimer = setInterval(() => {
  void purgeExpiredTokens();
}, REFRESH_TOKEN_CLEANUP_MS);
refreshCleanupTimer.unref?.();

registerShutdown(server, [
  async () => {
    clearInterval(refreshCleanupTimer);
  },
  () => eventBus.disconnect(),
  () => database.disconnect(),
]);
