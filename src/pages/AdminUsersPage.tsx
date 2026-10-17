import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Check, Mail, Pencil, Trash2, UserPlus, Users, X } from 'lucide-react';
import type { Profile } from '../../shared/schema.ts';
import { Button } from '../components/Button';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Input } from '../components/Input';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDateTime } from '../lib/format';
import { useToast } from '../lib/toast';

type UserRow = Profile & { created_at: string; documents: number; status: 'active' | 'invited' | 'created'; last_sign_in_at: string | null };

const STATUS: Record<UserRow['status'], { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-green-50 text-green-700' },
  invited: { label: 'Invited', className: 'bg-amber-50 text-amber-700' },
  created: { label: 'Never signed in', className: 'bg-gray-100 text-gray-600' },
};

function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

/** The account's name and e-mail; the pencil turns the name into a field (Enter saves, Escape cancels). */
function UserName({ user, onSave }: { user: UserRow; onSave: (fullName: string) => Promise<boolean> }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (draft === null) return;
    setSaving(true);
    const saved = draft.trim() === (user.full_name ?? '') || (await onSave(draft));
    setSaving(false);
    if (saved) setDraft(null);
  };

  if (draft !== null) {
    return (
      <form onSubmit={save} className="flex items-center gap-1" onKeyDown={(e) => e.key === 'Escape' && setDraft(null)}>
        <input
          autoFocus
          value={draft}
          maxLength={200}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Full name"
          aria-label={`Full name of ${user.email}`}
          className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC1F1F] focus:border-transparent"
        />
        <button type="submit" disabled={saving} className="shrink-0 rounded-lg p-1.5 pointer-coarse:p-3 text-green-700 hover:bg-green-50" aria-label="Save name" title="Save">
          <Check size={16} />
        </button>
        <button type="button" disabled={saving} onClick={() => setDraft(null)} className="shrink-0 rounded-lg p-1.5 pointer-coarse:p-3 text-gray-500 hover:bg-gray-100" aria-label="Cancel" title="Cancel">
          <X size={16} />
        </button>
      </form>
    );
  }

  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 font-medium text-gray-900 break-words">
        <span className="min-w-0">{user.full_name || user.email}</span>
        <button
          type="button"
          onClick={() => setDraft(user.full_name ?? '')}
          className="shrink-0 rounded p-1 pointer-coarse:p-2.5 pointer-coarse:-my-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100"
          aria-label={`Edit the name of ${user.email}`}
          title="Edit name"
        >
          <Pencil size={13} />
        </button>
      </p>
      {user.full_name && <p className="text-xs text-gray-500 break-all">{user.email}</p>}
    </div>
  );
}

export function AdminUsersPage() {
  const me = useAuth((s) => s.profile);
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const emptyForm = () => ({ email: '', fullName: '', password: randomPassword(), role: 'user' as Profile['role'], invite: true });
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string | null } | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers((await api<{ users: UserRow[] }>('/api/admin/users')).users);
    } catch (e) {
      toast.error('Could not load users', (e as Error).message);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state is set when the request resolves
    void load();
  }, [load]);

  const create = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = form.invite ? { ...form, password: undefined } : form;
      await api('/api/admin/users', { method: 'POST', body });
      toast.success(form.invite ? 'Invitation sent' : 'Account created');
      setCreated({ email: form.email.trim().toLowerCase(), password: form.invite ? null : form.password });
      setForm(emptyForm());
      await load();
    } catch (err) {
      toast.error('Could not create the account', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const update = async (id: string, body: Record<string, unknown>, done: string) => {
    try {
      await api('/api/admin/users', { method: 'PATCH', body: { id, ...body } });
      toast.success(done);
      await load();
      return true;
    } catch (err) {
      toast.error('Could not save the change', (err as Error).message);
      return false;
    }
  };

  const rename = (u: UserRow) => (fullName: string) => update(u.id, { fullName }, 'Name changed');

  const sendLink = async (u: UserRow) => {
    const what = u.status === 'invited' ? 'the invitation again' : 'a link to set a new password';
    if (!confirm(`Send ${what} to ${u.email}?`)) return;
    try {
      const { sent } = await api<{ sent: 'invite' | 'recovery' }>('/api/admin/users', { method: 'PATCH', body: { id: u.id, sendLink: true } });
      toast.success(sent === 'invite' ? `Invitation resent to ${u.email}` : `Password reset link sent to ${u.email}`);
      await load();
    } catch (err) {
      toast.error('Could not send the e-mail', (err as Error).message);
    }
  };

  const remove = async (u: UserRow) => {
    if (!confirm(`Delete the account ${u.email}?\n\nThis cannot be undone. The person will lose access to the app.`)) return;
    try {
      await api('/api/admin/users', { method: 'DELETE', body: { id: u.id } });
      toast.success(`Account ${u.email} deleted`);
      await load();
    } catch (err) {
      toast.error('Could not delete the account', (err as Error).message);
    }
  };

  const resetPassword = (u: UserRow) => {
    const password = randomPassword();
    if (!confirm(`Set a new password for ${u.email}?\n\nNew password: ${password}\n\nWrite it down and pass it on to the user.`)) return;
    void update(u.id, { password }, `New password for ${u.email}: ${password}`);
  };

  const statusPill = (u: UserRow) => (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[u.status].className}`}
      title={u.last_sign_in_at ? `Last sign-in: ${formatDateTime(u.last_sign_in_at)}` : undefined}
    >
      {STATUS[u.status].label}
    </span>
  );

  const roleSelect = (u: UserRow) => (
    <select
      value={u.role}
      disabled={u.id === me?.id}
      onChange={(e) => void update(u.id, { role: e.target.value }, 'Role changed')}
      className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm disabled:bg-gray-50"
      aria-label={`Role of ${u.email}`}
    >
      <option value="user">user</option>
      <option value="admin">administrator</option>
    </select>
  );

  const actions = (u: UserRow) => (
    <>
      <Button variant="ghost" size="sm" onClick={() => void sendLink(u)} title={u.status === 'invited' ? 'Resend invitation' : 'Send password reset link'}>
        <Mail size={14} className="mr-1" />
        Send link
      </Button>
      <Button variant="ghost" size="sm" onClick={() => resetPassword(u)}>New password</Button>
      {u.id !== me?.id && (
        <Button
          variant="ghost"
          size="sm"
          className="text-red-600 hover:text-red-700 disabled:text-gray-300"
          disabled={u.documents > 0}
          title={u.documents > 0 ? 'An account with documents cannot be deleted: its documents and their history must be kept.' : 'Delete account'}
          onClick={() => void remove(u)}
        >
          <Trash2 size={14} className="mr-1" />
          Delete
        </Button>
      )}
    </>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Users</h1>
        <p className="text-sm text-gray-500 mt-1">
          Accounts are created by an administrator. A new user gets an e-mail with a link to set a password, which they can later change in "My account".
        </p>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)] gap-6 items-start">
        <Card>
          <CardHeader className="flex items-center gap-2">
            <UserPlus size={16} className="text-[#CC1F1F]" />
            <h2 className="text-sm font-semibold text-gray-900">New account</h2>
          </CardHeader>
          <CardBody>
            <form onSubmit={create} className="space-y-4">
              <Input label="E-mail" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input label="Full name" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input type="checkbox" className="mt-0.5" checked={form.invite} onChange={(e) => setForm({ ...form, invite: e.target.checked })} />
                <span>
                  Send an e-mail invitation
                  <span className="block text-xs text-gray-500">The user sets their own password via the link in the e-mail.</span>
                </span>
              </label>
              {!form.invite && (
                <Input label="Initial password" required minLength={10} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              )}
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.role === 'admin'} onChange={(e) => setForm({ ...form, role: e.target.checked ? 'admin' : 'user' })} />
                Administrator (sees all users' documents)
              </label>
              <Button type="submit" isLoading={busy}>{form.invite ? 'Send invitation' : 'Create account'}</Button>
            </form>
            {created && (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
                {created.password ? (
                  <>
                    <p className="font-medium">Account created – pass on the sign-in details:</p>
                    <p className="mt-1 font-mono break-all">{created.email}</p>
                    <p className="font-mono break-all">{created.password}</p>
                  </>
                ) : (
                  <p>
                    Invitation sent to <span className="font-medium break-all">{created.email}</span>. The link in the e-mail works only once. If it expires, send it again from the account list.
                  </p>
                )}
              </div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader className="flex items-center gap-2">
            <Users size={16} className="text-[#CC1F1F]" />
            <h2 className="text-sm font-semibold text-gray-900">Accounts {users ? `(${users.length})` : ''}</h2>
          </CardHeader>
          {/* Phones: one card per account. */}
          <ul className="md:hidden divide-y divide-gray-100">
            {(users ?? []).map((u) => (
              <li key={u.id} className="px-4 py-4 space-y-3">
                <div className="min-w-0">
                  <UserName user={u} onSave={rename(u)} />
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    {statusPill(u)}
                    <span>Documents: {u.documents}</span>
                    <span>Created {formatDateTime(u.created_at)}</span>
                  </div>
                </div>
                {roleSelect(u)}
                <div className="flex flex-wrap gap-1 -ml-2">{actions(u)}</div>
              </li>
            ))}
          </ul>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">
                  <th className="px-6 py-3">User</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Documents</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map((u) => (
                  <tr key={u.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-6 py-3">
                      <UserName user={u} onSave={rename(u)} />
                      <div className="mt-1">{statusPill(u)}</div>
                    </td>
                    <td className="px-4 py-3">{roleSelect(u)}</td>
                    <td className="px-4 py-3 text-gray-600">{u.documents}</td>
                    <td className="px-4 py-3 text-gray-600">{formatDateTime(u.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-end gap-1 whitespace-nowrap">{actions(u)}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
