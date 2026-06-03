import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL not found in .env');
}

async function main() {
  console.log('Starting seed...');

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

    console.log('Roles created successfully');

    const result = await pool.query('SELECT * FROM roles');
    console.log('Current roles:', result.rows);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});