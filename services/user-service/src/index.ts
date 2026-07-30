import express from 'express';
import {
  getConfig,
  loadEnv,
  Database,
  AuthDatabase,
  createHealthHandler,
  registerShutdown,
} from './config';
import {
  errorHandler,
  requestLogger,
  jsonErrorHandler,
  eventBus,
  cache,
} from './middleware';
import {
  followersRoutes,
  friendsRoutes,
  profileRoutes,
  passwordRoutes,
  userPhotosRouter,
  photosRouter,
} from './routes';
import { registerUserRegisteredConsumer } from './consumers';


loadEnv();
const config = getConfig();

const database = new Database(config.databaseUrl);
const authDatabase = new AuthDatabase(config.authDatabaseUrl);
const app = express();
const { port, host, serviceName } = config;

app.use(express.json());
app.use(jsonErrorHandler);
app.use(requestLogger);

const attachUserContext = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
  (req as any).prisma = database.prisma;
  next();
};

const attachProfileContext = (req: express.Request, _res: express.Response, next: express.NextFunction) => {
  (req as any).prisma = database.prisma;
  (req as any).authPool = authDatabase.pool;
  next();
};

app.use('/api/followers', attachUserContext, followersRoutes);
app.use('/api/friends', attachUserContext, friendsRoutes);
app.use('/api/users', attachProfileContext, passwordRoutes);
app.use('/api/users', attachProfileContext, userPhotosRouter);
app.use('/api/photos', attachProfileContext, photosRouter);
app.use('/api/users', attachProfileContext, profileRoutes);

app.get('/health', createHealthHandler(serviceName, () => database.isHealthy()));
app.use(errorHandler);

void (async () => {
  try {
    await eventBus.connect();
    await registerUserRegisteredConsumer(database.prisma);
  } catch (error) {
    console.log('[EventBus] Не удалось запустить consumer:', error);
  }
})();

const server = app.listen(port, host, () => {
  console.log(`${serviceName} запущен на порту ${port}`);
});

registerShutdown(server, [
  () => cache.disconnect(),
  () => eventBus.disconnect(),
  () => database.disconnect(),
  () => authDatabase.disconnect(),
]);
