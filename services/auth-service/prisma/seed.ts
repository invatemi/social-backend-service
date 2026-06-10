import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL not found in .env');
}

async function main() {
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await pool.query(`
      INSERT INTO roles (id, name) VALUES 
      (1, 'admin'),
      (2, 'moderator'),
      (3, 'user'),
      (4, 'guest')
      ON CONFLICT (id) DO NOTHING
    `);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
