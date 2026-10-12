// Links from Supabase e-mails (invitation, password reset) land on the app with the result in the URL fragment,
// e.g. `#access_token=…&type=invite` or `#error=access_denied&error_code=otp_expired`. supabase-js consumes and
// clears the fragment while it starts, so the app reads it first to know which screen to show.

export type AuthLink = { kind: 'invite' | 'recovery' } | { kind: 'error'; message: string } | null;

export const EXPIRED_LINK = 'Link wygasł albo został już użyty. Poproś administratora o nowy albo użyj „Nie pamiętasz hasła?”.';

export function parseAuthLink(hash: string, search = ''): AuthLink {
  const fragment = new URLSearchParams(hash.replace(/^#/, ''));
  const query = new URLSearchParams(search.replace(/^\?/, ''));
  const errorCode = fragment.get('error_code') ?? query.get('error_code');
  const error = fragment.get('error') ?? query.get('error');
  if (error || errorCode) {
    if (errorCode === 'otp_expired' || error === 'access_denied') return { kind: 'error', message: EXPIRED_LINK };
    const description = fragment.get('error_description') ?? query.get('error_description');
    return { kind: 'error', message: `Link jest nieprawidłowy${description ? ` (${description})` : ''}.` };
  }
  if (!fragment.get('access_token')) return null;
  const type = fragment.get('type');
  return type === 'invite' || type === 'recovery' ? { kind: type } : null;
}
