import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { EXPIRED_LINK } from '../../shared/authLink.ts';
import type { Profile } from '../../shared/schema.ts';
import { api } from './api';
import { authLink, supabase } from './supabase';

type Status = 'loading' | 'unconfigured' | 'signedOut' | 'signedIn' | 'error';

interface AuthState {
  status: Status;
  session: Session | null;
  profile: Profile | null;
  error: string | null;
  /** Opened from an invitation or password-reset e-mail: the user must set a password before using the app. */
  passwordSetup: 'invite' | 'recovery' | null;
  /** Why the e-mail link did not work, shown on the login screen. */
  linkError: string | null;
  init: () => () => void;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setPassword: (password: string) => Promise<void>;
  requestReset: (email: string) => Promise<void>;
}

export const MIN_PASSWORD = 10;

// A link from the app's e-mail carries a one-time token: exchange it for a session exactly once (React StrictMode
// runs effects twice, and a second exchange would fail because the token is used up).
async function openLink(): Promise<string | null> {
  if (!supabase || !authLink || authLink.kind === 'error') return null;
  let tokenHash = authLink.tokenHash;
  let type: 'invite' | 'recovery' = authLink.kind;
  if (authLink.linkToken) {
    try {
      ({ tokenHash, type } = await api<{ tokenHash: string; type: 'invite' | 'recovery' }>('/api/auth/accept', { method: 'POST', body: { token: authLink.linkToken } }));
    } catch (e) {
      return (e as Error).message;
    }
  }
  if (!tokenHash) return null;
  const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
  return error ? EXPIRED_LINK : null;
}
const linkVerification = authLink && authLink.kind !== 'error' && (authLink.tokenHash || authLink.linkToken) ? openLink() : null;

export const useAuth = create<AuthState>((set, get) => {
  async function loadProfile(session: Session | null) {
    if (!session) {
      // The link carried no usable session (already used or expired).
      if (get().passwordSetup) set({ passwordSetup: null, linkError: EXPIRED_LINK });
      set({ status: 'signedOut', session: null, profile: null });
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
    } catch (e) {
      set({ status: 'error', error: (e as Error).message });
    }
  }

  return {
    status: 'loading',
    session: null,
    profile: null,
    error: null,
    passwordSetup: authLink && authLink.kind !== 'error' ? authLink.kind : null,
    linkError: authLink?.kind === 'error' ? authLink.message : null,
    init: () => {
      if (!supabase) {
        set({ status: 'unconfigured' });
        return () => {};
      }
      const client = supabase;
      let unsubscribe: (() => void) | null = null;
      let stopped = false;
      const listen = () => {
        if (stopped) return;
        const { data } = client.auth.onAuthStateChange((event, session) => {
          if (event === 'PASSWORD_RECOVERY') set({ passwordSetup: 'recovery' });
          // Supabase recommends not awaiting inside the callback.
          setTimeout(() => void loadProfile(session), 0);
        });
        unsubscribe = () => data.subscription.unsubscribe();
      };
      // Listen only once the link's token is exchanged, so the first state seen is the new session.
      if (linkVerification) {
        void linkVerification.then((error) => {
          if (error) set({ passwordSetup: null, linkError: error });
          listen();
        });
      } else {
        listen();
      }
      return () => {
        stopped = true;
        unsubscribe?.();
      };
    },
    signIn: async (email, password) => {
      if (!supabase) throw new Error('The app is not configured.');
      set({ linkError: null });
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Incorrect e-mail or password.' : error.message);
    },
    signOut: async () => {
      await supabase?.auth.signOut();
      set({ status: 'signedOut', session: null, profile: null, passwordSetup: null });
    },
    setPassword: async (password) => {
      if (!supabase) throw new Error('The app is not configured.');
      if (password.length < MIN_PASSWORD) throw new Error(`The password must be at least ${MIN_PASSWORD} characters long.`);
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        throw new Error(error.code === 'same_password' ? 'The new password must be different from the previous one.' : `Could not set the password: ${error.message}`);
      }
      set({ passwordSetup: null });
    },
    requestReset: async (email) => {
      if (!supabase) throw new Error('The app is not configured.');
      await api('/api/auth/recover', { method: 'POST', body: { email } });
    },
  };
});
