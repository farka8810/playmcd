import pg from 'pg';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

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

// Applies the (idempotent) schema so a fresh deploy needs no manual db:setup.
// Safe to call on every server start; CREATE ... IF NOT EXISTS is a no-op once
// the table/indexes exist.
export async function ensureSchema() {
  const here = dirname(fileURLToPath(import.meta.url));
  const schema = await readFile(join(here, 'schema.sql'), 'utf8');
  await query(schema);
}
