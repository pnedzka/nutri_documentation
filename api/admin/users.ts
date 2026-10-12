// User accounts (administrator only). There is no public sign-up: the administrator creates every account.
//
//   GET   /api/admin/users   → { users: (Profile & { created_at, documents })[] }
//   POST  /api/admin/users   body { email, fullName?, password, role? } → { user }
//   PATCH /api/admin/users   body { id, role?, fullName?, password? } → { user }

import type { Profile } from '../../shared/schema.js';
import { requireAdmin } from '../_lib/auth.js';
import { HttpError, handle, json, readJson } from '../_lib/http.js';
import { db } from '../_lib/supabase.js';

const MIN_PASSWORD = 10;

export function GET(request: Request): Promise<Response> {
  return handle(async () => {
    await requireAdmin(request);
    const { data, error } = await db().from('profiles').select('id, email, full_name, role, created_at').order('email');
    if (error) throw error;
    const { data: docs, error: docsError } = await db().from('documents').select('owner_id');
    if (docsError) throw docsError;
    const counts = new Map<string, number>();
    for (const d of docs ?? []) counts.set(d.owner_id, (counts.get(d.owner_id) ?? 0) + 1);
    return json({ users: (data ?? []).map((u) => ({ ...u, documents: counts.get(u.id) ?? 0 })) });
  });
}

const role = (value: unknown): Profile['role'] => (value === 'admin' ? 'admin' : 'user');

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    await requireAdmin(request);
    const body = await readJson<{ email?: unknown; fullName?: unknown; password?: unknown; role?: unknown }>(request);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const fullName = typeof body.fullName === 'string' && body.fullName.trim() ? body.fullName.trim().slice(0, 200) : null;
    const password = typeof body.password === 'string' ? body.password : '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Nieprawidłowy adres e-mail.');
    if (password.length < MIN_PASSWORD) throw new HttpError(400, `Hasło musi mieć co najmniej ${MIN_PASSWORD} znaków.`);

    const { data, error } = await db().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } });
    if (error || !data.user) throw new HttpError(400, error?.message.includes('already') ? 'Użytkownik z tym adresem już istnieje.' : 'Nie udało się utworzyć konta.');
    const profile: Profile = { id: data.user.id, email, full_name: fullName, role: role(body.role) };
    const { error: profileError } = await db().from('profiles').upsert(profile);
    if (profileError) throw profileError;
    return json({ user: profile }, 201);
  });
}

export function PATCH(request: Request): Promise<Response> {
  return handle(async () => {
    const admin = await requireAdmin(request);
    const body = await readJson<{ id?: unknown; role?: unknown; fullName?: unknown; password?: unknown }>(request);
    if (typeof body.id !== 'string') throw new HttpError(400, 'Brak identyfikatora użytkownika.');
    if (body.id === admin.id && body.role !== undefined && role(body.role) !== 'admin') {
      throw new HttpError(400, 'Nie możesz odebrać uprawnień administratora samemu sobie.');
    }
    const changes: Partial<Profile> = {};
    if (body.role !== undefined) changes.role = role(body.role);
    if (typeof body.fullName === 'string') changes.full_name = body.fullName.trim().slice(0, 200) || null;
    if (body.password !== undefined) {
      if (typeof body.password !== 'string' || body.password.length < MIN_PASSWORD) {
        throw new HttpError(400, `Hasło musi mieć co najmniej ${MIN_PASSWORD} znaków.`);
      }
      const { error } = await db().auth.admin.updateUserById(body.id, { password: body.password });
      if (error) throw new HttpError(400, 'Nie udało się zmienić hasła.');
    }
    const { data, error } = await db().from('profiles').update(changes).eq('id', body.id).select('id, email, full_name, role').maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, 'Nie znaleziono użytkownika.');
    return json({ user: data });
  });
}
