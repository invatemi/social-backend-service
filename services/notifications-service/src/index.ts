import http from 'http';
import express from 'express';
import {
  getConfig,
  loadEnv,
  Database,
  createHealthHandler,
  registerShutdown,
} from './config';
import {
  eventBus,
  errorHandler,
  jsonErrorHandler,
  requestLogger,
} from './middleware';
import {
  registerCommentCreatedConsumer,
  registerCommentUpdatedConsumer,
  registerCommentDeletedConsumer,
  registerPostCreatedConsumer,
  registerPostUpdatedConsumer,
  registerPostDeletedConsumer,
  registerPostLikedConsumer,
  registerUserEventConsumers,
  registerMessageCreatedConsumer,
  registerChatCreatedConsumer,
  registerChatDeletedConsumer,
  registerChatReadConsumer,
} from './consumers';
import { notificationRoutes, initSocketHub } from './routes';

loadEnv();
const config = getConfig();

const database = new Database(config.databaseUrl);
const app = express();
const { port, host, serviceName } = config;

app.use(express.json());
app.use(jsonErrorHandler);
app.use(requestLogger);

app.get('/health', createHealthHandler(serviceName, () => database.isHealthy()));

app.use('/api/notifications', (req, _res, next) => {
  (req as any).prisma = database.prisma;
  next();
}, notificationRoutes);

app.use(errorHandler);

/** Запускает все RabbitMQ consumers сервиса. */
const startConsumers = async (): Promise<void> => {
  await database.connectWithRetry();
  await eventBus.connect();
  await Promise.all([
    registerCommentCreatedConsumer(),
    registerCommentUpdatedConsumer(),
    registerCommentDeletedConsumer(),
    registerPostCreatedConsumer(),
    registerPostUpdatedConsumer(),
    registerPostDeletedConsumer(),
    registerPostLikedConsumer(),
    registerUserEventConsumers(database.prisma),
    registerMessageCreatedConsumer(),
    registerChatCreatedConsumer(),
    registerChatDeletedConsumer(),
    registerChatReadConsumer(),
  ]);
  console.log('Consumers уведомлений готовы');
};

const httpServer = http.createServer(app);
initSocketHub(httpServer);

const server = httpServer.listen(port, host, () => {
  console.log(`${serviceName} запущен на порту ${port}`);
});

void startConsumers().catch((error) => {
  console.log('Не удалось запустить consumers:', error);
});

registerShutdown(server, [
  () => eventBus.disconnect(),
  () => database.disconnect(),
]);
