import express from 'express';
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
  createMessageSendRateLimiter,
} from './middleware';
import { messageRoutes } from './routes';

loadEnv();
const config = getConfig();

const database = new Database(config.databaseUrl);
const app = express();
const { port, host, serviceName } = config;
const messageSendRateLimiter = createMessageSendRateLimiter();

app.use(express.json({ limit: '1mb' }));
app.use(jsonErrorHandler);
app.use(requestLogger);

const attachDb = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
  (req as any).prisma = database.prisma;
  next();
};

app.use('/api/messages/send', messageSendRateLimiter);
app.use('/api/messages', attachDb, messageRoutes);

app.get('/health', createHealthHandler(serviceName, () => database.isHealthy()));
app.use(errorHandler);

void eventBus.connect().catch((error) => {
  console.log('[EventBus] Не удалось подключиться к RabbitMQ:', error);
});

const server = app.listen(port, host, () => {
  console.log(`${serviceName} запущен на порту ${port}`);
});

registerShutdown(server, [() => eventBus.disconnect(), () => database.disconnect()]);
