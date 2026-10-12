import type { Profile } from '../../shared/schema.js';
import { HttpError } from './http.js';
import { db } from './supabase.js';

const adminEmails = () =>
  (process.env.ADMIN_EMAILS ?? '')
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

/** The signed-in user (from the Supabase access token in the Authorization header) and their profile. */
export async function requireUser(request: Request): Promise<Profile> {
  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) throw new HttpError(401, 'Zaloguj się.');
  const { data, error } = await db().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'Sesja wygasła. Zaloguj się ponownie.');
  const user = data.user;
  const email = (user.email ?? '').toLowerCase();
  const shouldBeAdmin = adminEmails().includes(email);

  const { data: existing, error: readError } = await db().from('profiles').select('id, email, full_name, role').eq('id', user.id).maybeSingle();
  if (readError) throw readError;
  if (existing) {
    // ADMIN_EMAILS only ever grants the role, so the first administrator can sign in without touching the database.
    if (shouldBeAdmin && existing.role !== 'admin') {
      await db().from('profiles').update({ role: 'admin' }).eq('id', user.id);
      return { ...(existing as Profile), role: 'admin' };
    }
    return existing as Profile;
  }
  const profile: Profile = {
    id: user.id,
    email,
    full_name: (user.user_metadata?.full_name as string | undefined) ?? null,
    role: shouldBeAdmin ? 'admin' : 'user',
  };
  const { error: insertError } = await db().from('profiles').upsert(profile);
  if (insertError) throw insertError;
  return profile;
}

export async function requireAdmin(request: Request): Promise<Profile> {
  const profile = await requireUser(request);
  if (profile.role !== 'admin') throw new HttpError(403, 'Ta funkcja jest dostępna tylko dla administratora.');
  return profile;
}
