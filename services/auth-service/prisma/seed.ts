import bcrypt from 'bcrypt';
import { Pool } from 'pg';

const databaseUrl = process.env.DATABASE_URL;
const DEV_PASSWORD = 'Password1';

if (!databaseUrl) {
  throw new Error('DATABASE_URL not found in .env');
}

async function main() {
  console.log('Starting seed...');

  const pool = new Pool({ connectionString: databaseUrl });
  const passwordHash = await bcrypt.hash(DEV_PASSWORD, 10);

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

    await pool.query(
      `
      INSERT INTO auth_accounts (id, email, password_hash, name, role_id) VALUES 
      (1, 'alice@example.com', $1, 'Alice', 1),
      (2, 'bob@example.com', $1, 'Bob', 3),
      (3, 'charlie@example.com', $1, 'Charlie', 3),
      (4, 'diana@example.com', $1, 'Diana', 4)
      ON CONFLICT (id) DO NOTHING
    `,
      [passwordHash]
    );

    await pool.query(`
      SELECT setval(
        pg_get_serial_sequence('auth_accounts', 'id'),
        (SELECT COALESCE(MAX(id), 1) FROM auth_accounts)
      )
    `);

    console.log(`Auth accounts created (dev password: ${DEV_PASSWORD})`);

    const roles = await pool.query('SELECT * FROM roles');
    console.log('Current roles:', roles.rows);

    const accounts = await pool.query(
      'SELECT id, email, name, role_id FROM auth_accounts ORDER BY id'
    );
    console.log('Current auth accounts:', accounts.rows);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});
