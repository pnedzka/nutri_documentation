import { useEffect, useState } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';

// The signed-in person's photo for the shared top bar (AppHeader), in the apps outside the hub: the same file in
// each of them (nutri_documentation, nutri_signatures, nutripartners and every new app). The photo is in the hub's
// private "intranet" bucket (avatars/<id>/…); a storage policy lets anyone signed in read photos (nutri_hub
// db/schema.sql, intranet_avatars_read), so the app signs the link with the person's own session.

/** As long as in the hub: a day. */
const LINK_SECONDS = 24 * 60 * 60;

/** One link per person while the page is open, so moving between pages does not sign it again. */
const cache = new Map<string, Promise<string | null>>();

async function signPhoto(supabase: SupabaseClient, userId: string): Promise<string | null> {
  // Row level security returns only the person's own row.
  const { data } = await supabase.from('profiles').select('avatar_path').eq('id', userId).maybeSingle();
  const path = typeof data?.avatar_path === 'string' ? data.avatar_path : null;
  if (!path) return null;
  const { data: signed } = await supabase.storage.from('intranet').createSignedUrl(path, LINK_SECONDS);
  return signed?.signedUrl ?? null;
}

/** The photo's signed link, or null (no photo, not signed in, or it could not be read: the initials show). */
export function useHeaderPhoto(supabase: SupabaseClient | null, signedIn: boolean): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!supabase || !signedIn) return;
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      const id = data.session?.user.id;
      if (!id) return;
      if (!cache.has(id)) cache.set(id, signPhoto(supabase, id).catch(() => null));
      void cache.get(id)!.then((link) => active && setUrl(link));
    });
    return () => {
      active = false;
    };
  }, [supabase, signedIn]);
  return signedIn ? url : null;
}
