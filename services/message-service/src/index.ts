import express from 'express';
import { Pool } from 'pg';
import { getConfig, loadEnv } from './config';

loadEnv();
const config = getConfig();

const app = express();

app.get('/health', (_req, res) => {
  res.status(200).json({
    status: 'ok',
    service: config.serviceName,
    port: config.port,
  });
});

const pool = new Pool({ connectionString: config.databaseUrl });

async function connectWithRetry(): Promise<boolean> {
  const { dbConnectMaxAttempts, dbConnectRetryDelayMs } = config;

  for (let attempt = 1; attempt <= dbConnectMaxAttempts; attempt++) {
    try {
      const client = await pool.connect();
      client.release();
      console.log('Connected to database');
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`DB connection attempt ${attempt}/${dbConnectMaxAttempts} failed:`, message);
      if (attempt === dbConnectMaxAttempts) {
        console.error('Failed to connect to database after all attempts');
        return false;
      }
      await new Promise((resolve) => setTimeout(resolve, dbConnectRetryDelayMs));
    }
  }

  return false;
}

void connectWithRetry();

app.get('/api/users', async (_req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows);
  } catch {
    res.status(503).json({ error: 'Database unavailable' });
  }
});

app.listen(config.port, config.host, () => {
  console.log(`${config.serviceName} running on port ${config.port}`);
});
