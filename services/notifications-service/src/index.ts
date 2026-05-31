import express from 'express';
import { Pool } from 'pg';

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

async function connectWithRetry(maxAttempts = 10, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await pool.connect();
      console.log('✓ Connected to database');
      return true;
    } catch (err : any) {
      console.warn(`⚠ DB connection attempt ${attempt}/${maxAttempts} failed:`, err.message);
      if (attempt === maxAttempts) {
        console.error('✗ Failed to connect to database after all attempts');
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, delayMs));
    }
  }
}

connectWithRetry();

app.get('/api/users', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM users');
    res.json(result.rows);
  } catch (err) {
    res.status(503).json({ error: 'Database unavailable' });
  }
});

const PORT = parseInt(process.env.PORT || '3001', 10);
app.listen(PORT, '0.0.0.0', () => console.log(`Running on port ${PORT}`));