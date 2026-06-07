import express from 'express';
import { PrismaClient } from './generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { registerCommentCreatedConsumer } from './consumers/comment-created.consumer';
import { registerCommentDeletedConsumer } from './consumers/comment-deleted.consumer';
import { registerCommentUpdatedConsumer } from './consumers/comment-updated.consumer';
import { registerPostCreatedConsumer } from './consumers/post-created.consumer';
import { registerPostDeletedConsumer } from './consumers/post-deleted.consumer';
import { registerPostUpdatedConsumer } from './consumers/post-updated.consumer';
import { registerUserEventConsumers } from './consumers/user-events.consumer';
import { eventBus } from './middleware/event-bus';
import notificationRoutes from './routes/notifications/endpoints';

const app = express();
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function connectWithRetry(maxAttempts = 10, delayMs = 2000): Promise<boolean> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const client = await pool.connect();
      client.release();
      console.log('✓ Connected to database');
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`⚠ DB connection attempt ${attempt}/${maxAttempts} failed:`, message);
      if (attempt === maxAttempts) {
        console.error('✗ Failed to connect to database after all attempts');
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }

  return false;
}

app.get('/health', async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.status(200).json({
      status: 'ok',
      service: process.env.npm_package_name || 'unknown',
      database: 'connected',
      port: process.env.PORT,
      timestamp: new Date().toISOString(),
    });
  } catch {
    res.status(503).json({
      status: 'degraded',
      service: process.env.npm_package_name || 'unknown',
      database: 'disconnected',
      port: process.env.PORT,
      timestamp: new Date().toISOString(),
    });
  }
});

app.use('/api/notifications', (req, res, next) => {
  (req as any).prisma = prisma;
  next();
}, notificationRoutes);

const PORT = parseInt(process.env.PORT || '3001', 10);

const start = async (): Promise<void> => {
  await connectWithRetry();

  await eventBus.connect();
  await Promise.all([
    registerCommentCreatedConsumer(),
    registerCommentUpdatedConsumer(),
    registerCommentDeletedConsumer(),
    registerPostCreatedConsumer(),
    registerPostUpdatedConsumer(),
    registerPostDeletedConsumer(),
    registerUserEventConsumers(prisma),
  ]);

  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Running on port ${PORT}`);
  });

  let isShuttingDown = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (isShuttingDown) {
      return;
    }

    isShuttingDown = true;
    console.log(`${signal} received`);

    server.close(async () => {
      try {
        await eventBus.disconnect();
        await prisma.$disconnect();
        await pool.end();
        process.exit(0);
      } catch (error) {
        console.log('Failed to shutdown cleanly:', error);
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
};

void start().catch((error) => {
  console.log('Failed to start notifications-service:', error);
  process.exit(1);
});
