import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../../shared/schema.ts';
import { ApiError, api } from './api';
import { supabase } from './supabase';
import { setMonitoringUser } from './monitoring';
import { signInViaHub, signOutOfHub, ssoDone, takeSsoToken } from './sso';

type Status = 'loading' | 'unconfigured' | 'signedOut' | 'signedIn' | 'error';

interface AuthState {
  status: Status;
  session: Session | null;
  profile: Profile | null;
  error: string | null;
  init: () => () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const SSO_FAILED = 'Automatic sign-in from Nutri Partners apps did not work. Sign in below.';

// A one-time token from the hub (lib/sso.ts) becomes this app's session, exactly once: React StrictMode runs effects
// twice, and the token can be used only once.
const ssoToken = supabase ? takeSsoToken() : null;
async function signInWithHubToken(token: string): Promise<string | null> {
  const { error } = await supabase!.auth.verifyOtp({ token_hash: token, type: 'magiclink' });
  if (error) return SSO_FAILED;
  ssoDone();
  return null;
}
const ssoSignIn = ssoToken ? signInWithHubToken(ssoToken) : null;
/** Set while signing out here, so the app does not ask the hub to sign the person back in. */
let signingOut = false;

// Sign-in only: accounts are created, invited and reset in the Nutri Partners hub (User management). People sign in
// once, in the hub; the form here is the fallback when that does not work.
export const useAuth = create<AuthState>((set, get) => {
  async function loadProfile(session: Session | null) {
    if (!session) {
      set({ status: 'signedOut', session: null, profile: null });
      setMonitoringUser(null);
      return;
    }
    // Token refreshes fire this again: keep the profile we already have for the same user.
    const current = get().profile;
    if (current && current.id === session.user.id) {
      set({ session, status: 'signedIn' });
      return;
    }
    set({ session });
    try {
      const { profile } = await api<{ profile: Profile }>('/api/me');
      set({ status: 'signedIn', profile, error: null });
      setMonitoringUser(profile);
    } catch (e) {
      // The session ended elsewhere (e.g. signed out in another app): drop it here, so the app gets a new one from
      // the hub (or shows the sign-in form with this message).
      if (e instanceof ApiError && e.status === 401) {
        set({ profile: null, error: e.message });
        await supabase!.auth.signOut({ scope: 'local' });
        return;
      }
      set({ status: 'error', error: (e as Error).message });
    }
  }

  return {
    status: 'loading',
    session: null,
    profile: null,
    error: null,
    init: () => {
      if (!supabase) {
        set({ status: 'unconfigured' });
        return () => {};
      }
      const client = supabase;
      let unsubscribe: (() => void) | null = null;
      let stopped = false;
      const listen = (ssoError: string | null) => {
        if (stopped) return;
        if (ssoError) set({ error: ssoError });
        const { data } = client.auth.onAuthStateChange((_event, session) => {
          // No session (on opening, or after it ended elsewhere): sign in through the hub, unless its token just
          // failed or that was tried a moment ago.
          if (!session && !ssoToken && !signingOut && signInViaHub()) return;
          // Supabase recommends not awaiting inside the callback.
          setTimeout(() => void loadProfile(session), 0);
        });
        unsubscribe = () => data.subscription.unsubscribe();
      };
      // Listen only once the hub's token is exchanged, so the first state seen is the new session.
      if (ssoSignIn) void ssoSignIn.then(listen);
      else listen(null);
      return () => {
        stopped = true;
        unsubscribe?.();
      };
    },
    signIn: async (email, password) => {
      if (!supabase) throw new Error('The app is not configured.');
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Incorrect e-mail or password.' : error.message);
    },
    signOut: async () => {
      signingOut = true;
      await supabase?.auth.signOut();
      set({ status: 'signedOut', session: null, profile: null });
      signOutOfHub();
    },
  };
});
