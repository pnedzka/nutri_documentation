// Applies db/schema.sql to the Supabase database during the Vercel build (npm run vercel-build).
// Uses the direct connection string the Supabase integration adds (POSTGRES_URL_NON_POOLING); without it the step
// is skipped, so local builds and builds before the database is connected still work.
import { readFile } from 'node:fs/promises';
import postgres from 'postgres';

const url = process.env.POSTGRES_URL_NON_POOLING || process.env.POSTGRES_URL;
if (!url) {
  console.log('[migrate] Brak POSTGRES_URL_NON_POOLING – pomijam migrację bazy.');
  process.exit(0);
}

const sql = postgres(url, { ssl: /sslmode=disable/.test(url) ? false : 'require', max: 1, onnotice: () => {} });
try {
  await sql.unsafe(await readFile(new URL('../db/schema.sql', import.meta.url), 'utf8'));
  console.log('[migrate] Schemat bazy jest aktualny.');
} catch (error) {
  console.error('[migrate] Migracja bazy nie powiodła się:', error.message);
  process.exitCode = 1;
} finally {
  await sql.end();
}
