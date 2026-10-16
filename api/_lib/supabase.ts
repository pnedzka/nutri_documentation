import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { HttpError } from './http.js';

export const ORIGINALS = 'originals';
export const OUTPUTS = 'outputs';

// The Supabase integration on Vercel sets SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (newer projects: SUPABASE_SECRET_KEY).
function config() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
  return url && key ? { url, key } : null;
}

let client: SupabaseClient | null = null;

/** Server-side client with full access. Every query made with it must check ownership itself. */
export function db(): SupabaseClient {
  if (client) return client;
  const cfg = config();
  if (!cfg) throw new HttpError(503, 'The database is not configured (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are missing).');
  client = createClient(cfg.url, cfg.key, { auth: { persistSession: false, autoRefreshToken: false } });
  return client;
}

let bucketsReady = false;

/** Creates the private storage buckets if the database migration could not (once per function instance). */
export async function ensureBuckets(): Promise<void> {
  if (bucketsReady) return;
  for (const [name, limit] of [[ORIGINALS, '20MB'], [OUTPUTS, '50MB']] as const) {
    const { data } = await db().storage.getBucket(name);
    if (!data) {
      const { error } = await db().storage.createBucket(name, { public: false, fileSizeLimit: limit });
      if (error && !/exist/i.test(error.message)) throw error;
    }
  }
  bucketsReady = true;
}
