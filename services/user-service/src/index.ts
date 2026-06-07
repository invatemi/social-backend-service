import express from 'express';
import { PrismaClient } from './generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import followersRoutes from './routes/followers/endpoints';
import friendsRoutes from './routes/friends/endpoints';
import profileRoutes from './routes/profile/endpoints';
import { errorHandler } from './middleware/error-handler';
import { requestLogger } from './middleware/request-logger';
import { jsonErrorHandler } from './middleware/json-error-handler';
import { eventBus } from './middleware/event-bus';
import { cache } from './middleware/redis';


if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});


const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const app = express();
const PORT = parseInt(process.env.PORT || '3002', 10);

app.use(express.json());
app.use(jsonErrorHandler);
app.use(requestLogger);

app.use('/api/followers', (req, res, next) => {
  (req as any).prisma = prisma;
  next();
}, followersRoutes);

app.use('/api/friends', (req, res, next) => {
  (req as any).prisma = prisma;
  next();
}, friendsRoutes);

app.use('/api/users', (req, res, next) => {
  (req as any).prisma = prisma;
  next();
}, profileRoutes);

app.use(errorHandler);

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'ok',
      service: 'social-user-service',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: 'degraded',
      service: 'social-user-service',
      database: 'disconnected',
      timestamp: new Date().toISOString(),
    });
  }
});

void eventBus.connect().catch((error) => {
  console.log('[EventBus] RabbitMQ startup connection failed:', error);
});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`Service running on port ${PORT}`);
});

/** Gracefully closes HTTP, cache, broker, and database resources. */
const shutdown = async (signal: string) => {
  console.log(`${signal} received`);
  server.close(async () => {
    await cache.disconnect();
    await eventBus.disconnect();
    await prisma.$disconnect();
    await pool.end();
    process.exit(0);
  });
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));