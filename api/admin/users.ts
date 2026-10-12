// User accounts (administrator only). There is no public sign-up: the administrator creates every account.
//
// By default a new account gets an invitation e-mail with a link to set the password (see _lib/mail.ts). A start
// password set by the administrator remains as a fallback.
//
//   GET   /api/admin/users   → { users: (Profile & { created_at, documents, status, last_sign_in_at })[] }
//   POST  /api/admin/users   body { email, fullName?, role?, invite?, password? } → { user, invited }
//   PATCH /api/admin/users   body { id, role?, fullName?, password?, sendLink? } → { user, sent? }
//   DELETE /api/admin/users  body { id } → { deleted: email }

import type { User } from '@supabase/supabase-js';
import type { Profile } from '../../shared/schema.js';
import { requireAdmin } from '../_lib/auth.js';
import { HttpError, appUrl, handle, json, readJson } from '../_lib/http.js';
import { createInvitedUser, issueAccountLink } from '../_lib/accountLinks.js';
import { sendAccountMail } from '../_lib/mail.js';
import { db } from '../_lib/supabase.js';

const MIN_PASSWORD = 10;

/** active: has signed in; invited: invitation not used yet; created: start password, never signed in. */
export type AccountStatus = 'active' | 'invited' | 'created';

function accountStatus(user: User | undefined): AccountStatus {
  if (user?.last_sign_in_at) return 'active';
  return user?.invited_at && !user.email_confirmed_at ? 'invited' : 'created';
}

async function authUsers(): Promise<Map<string, User>> {
  const users = new Map<string, User>();
  for (let page = 1; ; page++) {
    const { data, error } = await db().auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    for (const user of data.users) users.set(user.id, user);
    if (data.users.length < 1000) return users;
  }
}

export function GET(request: Request): Promise<Response> {
  return handle(async () => {
    await requireAdmin(request);
    const { data, error } = await db().from('profiles').select('id, email, full_name, role, created_at').order('email');
    if (error) throw error;
    const { data: docs, error: docsError } = await db().from('documents').select('owner_id');
    if (docsError) throw docsError;
    const counts = new Map<string, number>();
    for (const d of docs ?? []) counts.set(d.owner_id, (counts.get(d.owner_id) ?? 0) + 1);
    const accounts = await authUsers();
    return json({
      users: (data ?? []).map((u) => {
        const account = accounts.get(u.id);
        return { ...u, documents: counts.get(u.id) ?? 0, status: accountStatus(account), last_sign_in_at: account?.last_sign_in_at ?? null };
      }),
    });
  });
}

const role = (value: unknown): Profile['role'] => (value === 'admin' ? 'admin' : 'user');

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const admin = await requireAdmin(request);
    const body = await readJson<{ email?: unknown; fullName?: unknown; password?: unknown; role?: unknown; invite?: unknown }>(request);
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const fullName = typeof body.fullName === 'string' && body.fullName.trim() ? body.fullName.trim().slice(0, 200) : null;
    const invite = body.invite !== false;
    const password = typeof body.password === 'string' ? body.password : '';
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'Nieprawidłowy adres e-mail.');
    if (!invite && password.length < MIN_PASSWORD) throw new HttpError(400, `Hasło musi mieć co najmniej ${MIN_PASSWORD} znaków.`);

    const created = invite
      ? await createInvitedUser(email, fullName)
      : await db().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: fullName } }).then(({ data, error }) => ({ user: data.user, error }));
    if (created.error || !created.user) {
      const error = created.error as { code?: string; message?: string } | null;
      if (error && (error.code === 'email_exists' || /already/i.test(error.message ?? ''))) throw new HttpError(400, 'Użytkownik z tym adresem już istnieje.');
      console.error('[users] create', error);
      throw new HttpError(400, 'Nie udało się utworzyć konta.');
    }
    const profile: Profile = { id: created.user.id, email, full_name: fullName, role: role(body.role) };
    const { error: profileError } = await db().from('profiles').upsert(profile);
    if (profileError) throw profileError;
    if (invite) {
      try {
        const url = await issueAccountLink('invite', created.user.id, appUrl(request));
        await sendAccountMail({ kind: 'invite', email, url, appUrl: appUrl(request), invitedBy: admin.full_name || admin.email });
      } catch (error) {
        const reason = error instanceof HttpError ? error.message : 'błąd wysyłki';
        throw new HttpError(502, `Konto zostało utworzone, ale zaproszenia nie wysłano: ${reason} Wyślij je ponownie przyciskiem „Wyślij link” na liście kont.`);
      }
    }
    return json({ user: profile, invited: invite }, 201);
  });
}

export function PATCH(request: Request): Promise<Response> {
  return handle(async () => {
    const admin = await requireAdmin(request);
    const body = await readJson<{ id?: unknown; role?: unknown; fullName?: unknown; password?: unknown; sendLink?: unknown }>(request);
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
    let sent: 'invite' | 'recovery' | undefined;
    if (body.sendLink === true) {
      const { data: found, error } = await db().auth.admin.getUserById(body.id);
      if (error || !found.user?.email) throw new HttpError(404, 'Nie znaleziono użytkownika.');
      // An unused invitation is sent again; anyone else gets a password-reset link.
      sent = accountStatus(found.user) === 'invited' ? 'invite' : 'recovery';
      const url = await issueAccountLink(sent, found.user.id, appUrl(request));
      await sendAccountMail({ kind: sent, email: found.user.email, url, appUrl: appUrl(request), invitedBy: admin.full_name || admin.email });
    }
    const query = Object.keys(changes).length ? db().from('profiles').update(changes) : db().from('profiles').select();
    const { data, error } = await query.eq('id', body.id).select('id, email, full_name, role').maybeSingle();
    if (error) throw error;
    if (!data) throw new HttpError(404, 'Nie znaleziono użytkownika.');
    return json({ user: data, sent });
  });
}

/**
 * Deletes an account. Only accounts without documents and without entries in any document's history: documents
 * are binding and their history must stay complete, so such accounts are kept (they can be given a new password or
 * left unused instead).
 */
export function DELETE(request: Request): Promise<Response> {
  return handle(async () => {
    const admin = await requireAdmin(request);
    const body = await readJson<{ id?: unknown }>(request);
    if (typeof body.id !== 'string') throw new HttpError(400, 'Brak identyfikatora użytkownika.');
    if (body.id === admin.id) throw new HttpError(400, 'Nie możesz usunąć własnego konta.');

    const { data: found, error: findError } = await db().auth.admin.getUserById(body.id);
    if (findError || !found.user) throw new HttpError(404, 'Nie znaleziono użytkownika.');
    const count = async (table: 'documents' | 'document_events', column: string) => {
      const { count: n, error } = await db().from(table).select('id', { count: 'exact', head: true }).eq(column, body.id);
      if (error) throw error;
      return n ?? 0;
    };
    const [documents, finalized, events] = await Promise.all([
      count('documents', 'owner_id'),
      count('documents', 'finalized_by'),
      count('document_events', 'actor_id'),
    ]);
    if (documents) throw new HttpError(409, `Tego konta nie można usunąć: ma ${documents} dokument(ów). Dokumenty i ich historia muszą zostać zachowane.`);
    if (finalized || events) throw new HttpError(409, 'Tego konta nie można usunąć: występuje w historii zmian dokumentów, która musi zostać zachowana.');

    // The profile and the account's e-mail links are deleted with the account (foreign keys with ON DELETE CASCADE).
    const { error } = await db().auth.admin.deleteUser(body.id);
    if (error) {
      console.error('[users] delete', error);
      throw new HttpError(500, 'Nie udało się usunąć konta.');
    }
    console.info('[users] deleted', found.user.email, 'by', admin.email);
    return json({ deleted: found.user.email });
  });
}
