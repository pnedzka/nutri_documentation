import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import type { Profile } from '../../shared/schema.ts';
import { api } from './api';
import { supabase } from './supabase';

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

export const useAuth = create<AuthState>((set, get) => {
  async function loadProfile(session: Session | null) {
    if (!session) {
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
    init: () => {
      if (!supabase) {
        set({ status: 'unconfigured' });
        return () => {};
      }
      const { data } = supabase.auth.onAuthStateChange((_event, session) => {
        // Supabase recommends not awaiting inside the callback.
        setTimeout(() => void loadProfile(session), 0);
      });
      return () => data.subscription.unsubscribe();
    },
    signIn: async (email, password) => {
      if (!supabase) throw new Error('Aplikacja nie jest skonfigurowana.');
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Nieprawidłowy e-mail lub hasło.' : error.message);
    },
    signOut: async () => {
      await supabase?.auth.signOut();
      set({ status: 'signedOut', session: null, profile: null });
    },
  };
});
