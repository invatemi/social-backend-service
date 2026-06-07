import express from 'express';
import { PrismaClient } from '@prisma/client/index';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import postRoutes from './routes/post/endpoints';
import commentRoutes from './routes/comment/endpoints';
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
const PORT = parseInt(process.env.PORT || '3003', 10);

app.use(express.json());
app.use(jsonErrorHandler);
app.use(requestLogger);

app.use('/api/posts', (req, res, next) => {
  (req as any).prisma = prisma;
  next();
}, postRoutes);

app.use('/api/comments', (req, res, next) => {
  (req as any).prisma = prisma;
  next();
}, commentRoutes);

app.use(errorHandler);

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'ok',
      service: 'social-post-service',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: 'degraded',
      service: 'social-post-service',
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