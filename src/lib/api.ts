import { supabase } from './supabase';

/** An error from the app's API, with its HTTP status (401: the session is no longer valid). */
export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** Calls the app's API with the signed-in user's access token. Throws an Error with a user-facing message. */
export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data } = (await supabase?.auth.getSession()) ?? { data: { session: null } };
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      headers: {
        ...(data.session ? { authorization: `Bearer ${data.session.access_token}` } : {}),
        ...(init.body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      cache: 'no-store',
    });
  } catch {
    throw new Error('Cannot connect to the server.');
  }
  const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
  const payload = isJson ? ((await res.json()) as T & { error?: string }) : null;
  if (!res.ok || !payload) {
    throw new ApiError(payload?.error ?? (res.status === 404 ? 'The API server is not responding (run the app with `vercel dev`).' : `Server error (${res.status}).`), res.status);
  }
  return payload;
}
