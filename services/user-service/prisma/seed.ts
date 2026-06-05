import path from 'path';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL not found in .env');
}

async function main() {
  console.log('🌱 Starting seed for user-service...');
  
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await pool.query(`
      INSERT INTO roles (id, name) VALUES 
      (1, 'admin'),
      (2, 'moderator'),
      (3, 'user'),
      (4, 'verified')
      ON CONFLICT (id) DO NOTHING
    `);
    console.log('✅ Roles created');

    await pool.query(`
      INSERT INTO users (id_user, name_user, email, role_id, bio, location) VALUES 
      (1, 'Alice', 'alice@example.com', 1, 'Admin user', 'New York'),
      (2, 'Bob', 'bob@example.com', 3, 'Regular user', 'London'),
      (3, 'Charlie', 'charlie@example.com', 3, 'Another user', 'Paris'),
      (4, 'Diana', 'diana@example.com', 4, 'Verified user', 'Berlin')
      ON CONFLICT (id_user) DO NOTHING
    `);
    console.log('✅ Users created');

    await pool.query(`
      INSERT INTO friend_requests (from_user_id, to_user_id, status) VALUES 
      (1, 2, 'accepted'),
      (2, 3, 'pending'),
      (3, 4, 'declined')
      ON CONFLICT DO NOTHING
    `);
    console.log('✅ Friend requests created');

    await pool.query(`
      INSERT INTO friendships (user_id, friend_id) VALUES 
      (1, 2),
      (2, 1)
      ON CONFLICT DO NOTHING
    `);
    console.log('✅ Friendships created');

    await pool.query(`
      INSERT INTO followers (follower_id, following_id) VALUES 
      (2, 1),
      (3, 1),
      (4, 1),
      (1, 4)
      ON CONFLICT DO NOTHING
    `);
    console.log('✅ Followers created');

    const users = await pool.query('SELECT id_user, name_user, email FROM users');
    console.log('📋 Users:', users.rows);

    const requests = await pool.query('SELECT * FROM friend_requests');
    console.log('📋 Friend requests:', requests.rows);

    const friendships = await pool.query('SELECT * FROM friendships');
    console.log('📋 Friendships:', friendships.rows);

    const followers = await pool.query('SELECT * FROM followers');
    console.log('📋 Followers:', followers.rows);

    console.log('✅ Seed completed successfully');
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('❌ Seed failed:', e);
  process.exit(1);
});