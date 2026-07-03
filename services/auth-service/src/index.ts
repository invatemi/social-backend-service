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

loadEnv();
const config = getConfig();

const database = new Database(config.databaseUrl);
const app = express();
const { port, host, serviceName } = config;
const { loginRateLimiter, registerRateLimiter } = createAuthRateLimiters(config);

app.set('trust proxy', config.trustProxyHops);

app.use(express.json());
app.use(cookieParser());
app.use(jsonErrorHandler);
app.use(requestLogger);

app.use('/api/auth/login', loginRateLimiter);
app.use('/api/auth/register', registerRateLimiter);

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

registerShutdown(server, [
  () => eventBus.disconnect(),
  () => database.disconnect(),
]);
