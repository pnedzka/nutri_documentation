import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { UserPlus, Users } from 'lucide-react';
import type { Profile } from '../../shared/schema.ts';
import { Button } from '../components/Button';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Input } from '../components/Input';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDateTime } from '../lib/format';
import { useToast } from '../lib/toast';

type UserRow = Profile & { created_at: string; documents: number };

function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export function AdminUsersPage() {
  const me = useAuth((s) => s.profile);
  const toast = useToast();
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [form, setForm] = useState({ email: '', fullName: '', password: randomPassword(), role: 'user' as Profile['role'] });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  const load = useCallback(async () => {
    try {
      setUsers((await api<{ users: UserRow[] }>('/api/admin/users')).users);
    } catch (e) {
      toast.error('Nie udało się pobrać użytkowników', (e as Error).message);
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
      await api('/api/admin/users', { method: 'POST', body: form });
      toast.success('Konto utworzone');
      setCreated({ email: form.email.trim().toLowerCase(), password: form.password });
      setForm({ email: '', fullName: '', password: randomPassword(), role: 'user' });
      await load();
    } catch (err) {
      toast.error('Nie udało się utworzyć konta', (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const update = async (id: string, body: Record<string, unknown>, done: string) => {
    try {
      await api('/api/admin/users', { method: 'PATCH', body: { id, ...body } });
      toast.success(done);
      await load();
    } catch (err) {
      toast.error('Nie udało się zapisać zmiany', (err as Error).message);
    }
  };

  const resetPassword = (u: UserRow) => {
    const password = randomPassword();
    if (!confirm(`Ustawić nowe hasło dla ${u.email}?\n\nNowe hasło: ${password}\n\nZapisz je i przekaż użytkownikowi.`)) return;
    void update(u.id, { password }, `Nowe hasło dla ${u.email}: ${password}`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Użytkownicy</h1>
        <p className="text-sm text-gray-500 mt-1">Konta zakłada administrator. Użytkownik może zmienić hasło w „Moje konto”.</p>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)] gap-6 items-start">
        <Card>
          <CardHeader className="flex items-center gap-2">
            <UserPlus size={16} className="text-[#CC1F1F]" />
            <h2 className="text-sm font-semibold text-gray-900">Nowe konto</h2>
          </CardHeader>
          <CardBody>
            <form onSubmit={create} className="space-y-4">
              <Input label="E-mail" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <Input label="Imię i nazwisko" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
              <Input label="Hasło startowe" required minLength={10} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.role === 'admin'} onChange={(e) => setForm({ ...form, role: e.target.checked ? 'admin' : 'user' })} />
                Administrator (widzi dokumenty wszystkich użytkowników)
              </label>
              <Button type="submit" isLoading={busy}>Utwórz konto</Button>
            </form>
            {created && (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
                <p className="font-medium">Konto utworzone – przekaż dane logowania:</p>
                <p className="mt-1 font-mono break-all">{created.email}</p>
                <p className="font-mono break-all">{created.password}</p>
              </div>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader className="flex items-center gap-2">
            <Users size={16} className="text-[#CC1F1F]" />
            <h2 className="text-sm font-semibold text-gray-900">Konta {users ? `(${users.length})` : ''}</h2>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">
                  <th className="px-6 py-3">Użytkownik</th>
                  <th className="px-4 py-3">Rola</th>
                  <th className="px-4 py-3">Dokumenty</th>
                  <th className="px-4 py-3">Utworzono</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map((u) => (
                  <tr key={u.id} className="border-b border-gray-50 last:border-0">
                    <td className="px-6 py-3">
                      <p className="font-medium text-gray-900">{u.full_name || u.email}</p>
                      {u.full_name && <p className="text-xs text-gray-500">{u.email}</p>}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        disabled={u.id === me?.id}
                        onChange={(e) => void update(u.id, { role: e.target.value }, 'Rola zmieniona')}
                        className="rounded-lg border border-gray-200 bg-white px-2 py-1 text-sm disabled:bg-gray-50"
                        aria-label={`Rola ${u.email}`}
                      >
                        <option value="user">użytkownik</option>
                        <option value="admin">administrator</option>
                      </select>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{u.documents}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDateTime(u.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => resetPassword(u)}>Nowe hasło</Button>
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
