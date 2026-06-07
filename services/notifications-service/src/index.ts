import express from 'express';
import { Pool } from 'pg';
import { registerCommentCreatedConsumer } from './consumers/comment-created.consumer';
import { registerCommentDeletedConsumer } from './consumers/comment-deleted.consumer';
import { registerCommentUpdatedConsumer } from './consumers/comment-updated.consumer';
import { registerPostCreatedConsumer } from './consumers/post-created.consumer';
import { registerPostDeletedConsumer } from './consumers/post-deleted.consumer';
import { registerPostUpdatedConsumer } from './consumers/post-updated.consumer';
import { eventBus } from './middleware/event-bus';

const app = express();

app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'ok', 
    service: process.env.npm_package_name || 'unknown',
    port: process.env.PORT 
  });
});

const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

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

app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows);
  } catch (err) {
    res.status(503).json({ error: 'Database unavailable' });
  }
});

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
