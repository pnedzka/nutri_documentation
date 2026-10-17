import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { parseAuthLink, type AuthLink } from '../../shared/authLink.ts';

// The Supabase integration on Vercel sets NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY
// (newer projects: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY); VITE_* works for local development.
const env = import.meta.env;
const url: string | undefined = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key: string | undefined =
  env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

/** Invitation or password-reset link the page was opened from. Read before the client below consumes the URL. */
export const authLink: AuthLink = parseAuthLink(window.location.hash, window.location.search);
// Error details and one-time tokens do not stay in the address bar (or the browser history).
if (authLink?.kind === 'error' || (authLink && ('tokenHash' in authLink || 'linkToken' in authLink))) {
  window.history.replaceState(null, '', window.location.pathname);
}

export const supabase: SupabaseClient | null = url && key ? createClient(url, key) : null;

/** The Nutri Partners app hub: the logo and "All apps" in the header lead back there. */
export const HUB_URL: string = (env.VITE_HUB_URL || 'https://nutripartners.vercel.app').replace(/\/+$/, '');
