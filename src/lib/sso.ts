import { APP_ID } from '../../shared/schema.ts';
import { HUB_URL } from './supabase';

// One sign-in for all Nutri Partners apps, done in the hub. The hub opens this app with a one-time Supabase token
// in the address (#sso=…), which becomes this app's own session. Without a session the app asks the hub for one:
// the hub signs the person in first if needed and sends them back to the same page.

const ATTEMPT_KEY = 'np-sso-attempt';
/** A second trip to the hub within this time means it did not work: show the sign-in form instead (no loop). */
const RETRY_AFTER_MS = 60_000;

/** The token from the hub, removed from the address bar (and the browser history) right away. */
export function takeSsoToken(): string | null {
  const params = new URLSearchParams(window.location.hash.slice(1));
  const token = params.get('sso');
  if (!token) return null;
  params.delete('sso');
  const rest = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${rest ? `#${rest}` : ''}`);
  return token;
}

/** Sends the browser to the hub to sign in here. False when that was tried a moment ago or cannot be tracked. */
export function signInViaHub(): boolean {
  try {
    const last = Number(sessionStorage.getItem(ATTEMPT_KEY));
    if (last && Date.now() - last < RETRY_AFTER_MS) return false;
    sessionStorage.setItem(ATTEMPT_KEY, String(Date.now()));
  } catch {
    return false;
  }
  const { origin, pathname, search } = window.location;
  window.location.assign(`${HUB_URL}/sso?${new URLSearchParams({ app: APP_ID, to: pathname + search, back: origin })}`);
  return true;
}

/** Signed in: the hub may be asked again the next time the session ends. */
export function ssoDone(): void {
  try {
    sessionStorage.removeItem(ATTEMPT_KEY);
  } catch {
    // Nothing stored.
  }
}

/** Signing out here signs out of the hub too; otherwise the hub would sign the person straight back in. */
export function signOutOfHub(): void {
  window.location.assign(`${HUB_URL}/logout`);
}
