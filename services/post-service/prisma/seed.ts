import path from 'path';
import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error('DATABASE_URL not found in .env');
}

async function main() {
  console.log('Starting seed for post-service...');
  
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    await pool.query(`
      INSERT INTO posts (id_user, title, content, is_published) VALUES 
      (1, 'First Post', 'This is the first post content', true),
      (2, 'Second Post', 'This is the second post content', true),
      (1, 'Draft Post', 'This is a draft', false)
      ON CONFLICT DO NOTHING
    `);

    await pool.query(`
      INSERT INTO comments (id_post, id_user, content) VALUES 
      (1, 2, 'Great post!'),
      (1, 3, 'I agree!'),
      (2, 1, 'Thanks for sharing')
      ON CONFLICT DO NOTHING
    `);

    await pool.query(`
      INSERT INTO likes (id_post, id_user) VALUES 
      (1, 2),
      (1, 3),
      (2, 1)
      ON CONFLICT DO NOTHING
    `);

    await pool.query(`
      UPDATE posts SET 
        likes_count = (SELECT COUNT(*) FROM likes WHERE likes.id_post = posts.id_post),
        comments_count = (SELECT COUNT(*) FROM comments WHERE comments.id_post = posts.id_post)
    `);

    console.log('Seed completed successfully');

    const posts = await pool.query('SELECT * FROM posts');
    console.log('Posts:', posts.rows);
  } finally {
    await pool.end();
  }
}

main().catch((e) => {
  console.error('Seed failed:', e);
  process.exit(1);
});