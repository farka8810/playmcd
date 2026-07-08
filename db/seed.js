import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { getPool, query } from './index.js';

const here = dirname(fileURLToPath(import.meta.url));

// Applies db/schema.sql, then optionally inserts sample rows with --sample.
async function main() {
  const schema = await readFile(join(here, 'schema.sql'), 'utf8');
  await query(schema); // multiple statements are fine without bound params
  console.log('✓ schema applied');

  if (process.argv.includes('--sample')) {
    await query(
      `INSERT INTO scores (player_name, game, score, room) VALUES
         ('Neo', 'tap-battle', 88, 'lobby'),
         ('Trinity', 'tap-battle', 92, 'lobby'),
         ('Morpheus', 'tap-battle', 75, 'lobby')`
    );
    console.log('✓ sample scores inserted');
  }

  await getPool().end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
