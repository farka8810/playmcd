import pg from 'pg';

const { Pool } = pg;

// Lazily-created singleton pool. Reused across hot reloads in dev and across
// requests in prod. Reads DATABASE_URL from the environment (see .env.example).
let pool;

export function getPool() {
  if (!pool) {
    if (!process.env.DATABASE_URL) {
      throw new Error('DATABASE_URL is not set — copy .env.example to .env');
    }
    pool = new Pool({ connectionString: process.env.DATABASE_URL });
  }
  return pool;
}

export function query(text, params) {
  return getPool().query(text, params);
}
