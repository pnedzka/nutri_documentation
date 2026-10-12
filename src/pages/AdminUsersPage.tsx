import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Mail, Trash2, UserPlus, Users } from 'lucide-react';
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
  active: { label: 'Aktywne', className: 'bg-green-50 text-green-700' },
  invited: { label: 'Zaproszone', className: 'bg-amber-50 text-amber-700' },
  created: { label: 'Bez logowania', className: 'bg-gray-100 text-gray-600' },
};

function randomPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = crypto.getRandomValues(new Uint32Array(14));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
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
      const body = form.invite ? { ...form, password: undefined } : form;
      await api('/api/admin/users', { method: 'POST', body });
      toast.success(form.invite ? 'Zaproszenie wysłane' : 'Konto utworzone');
      setCreated({ email: form.email.trim().toLowerCase(), password: form.invite ? null : form.password });
      setForm(emptyForm());
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

  const sendLink = async (u: UserRow) => {
    const what = u.status === 'invited' ? 'ponownie zaproszenie' : 'link do ustawienia nowego hasła';
    if (!confirm(`Wysłać ${what} na adres ${u.email}?`)) return;
    try {
      const { sent } = await api<{ sent: 'invite' | 'recovery' }>('/api/admin/users', { method: 'PATCH', body: { id: u.id, sendLink: true } });
      toast.success(sent === 'invite' ? `Zaproszenie wysłane ponownie na ${u.email}` : `Link do zmiany hasła wysłany na ${u.email}`);
      await load();
    } catch (err) {
      toast.error('Nie udało się wysłać e-maila', (err as Error).message);
    }
  };

  const remove = async (u: UserRow) => {
    if (!confirm(`Usunąć konto ${u.email}?\n\nTej operacji nie można cofnąć. Osoba straci dostęp do aplikacji.`)) return;
    try {
      await api('/api/admin/users', { method: 'DELETE', body: { id: u.id } });
      toast.success(`Konto ${u.email} zostało usunięte`);
      await load();
    } catch (err) {
      toast.error('Nie udało się usunąć konta', (err as Error).message);
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
        <p className="text-sm text-gray-500 mt-1">
          Konta zakłada administrator. Nowa osoba dostaje e-mail z linkiem do ustawienia hasła, a hasło może potem zmienić w „Moje konto”.
        </p>
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
              <label className="flex items-start gap-2 text-sm text-gray-700">
                <input type="checkbox" className="mt-0.5" checked={form.invite} onChange={(e) => setForm({ ...form, invite: e.target.checked })} />
                <span>
                  Wyślij zaproszenie e-mailem
                  <span className="block text-xs text-gray-500">Użytkownik sam ustawi hasło przez link w wiadomości.</span>
                </span>
              </label>
              {!form.invite && (
                <Input label="Hasło startowe" required minLength={10} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              )}
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={form.role === 'admin'} onChange={(e) => setForm({ ...form, role: e.target.checked ? 'admin' : 'user' })} />
                Administrator (widzi dokumenty wszystkich użytkowników)
              </label>
              <Button type="submit" isLoading={busy}>{form.invite ? 'Wyślij zaproszenie' : 'Utwórz konto'}</Button>
            </form>
            {created && (
              <div className="mt-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
                {created.password ? (
                  <>
                    <p className="font-medium">Konto utworzone – przekaż dane logowania:</p>
                    <p className="mt-1 font-mono break-all">{created.email}</p>
                    <p className="font-mono break-all">{created.password}</p>
                  </>
                ) : (
                  <p>
                    Zaproszenie wysłane na <span className="font-medium break-all">{created.email}</span>. Link w wiadomości jest jednorazowy. Jeśli wygaśnie, wyślij go ponownie z listy kont.
                  </p>
                )}
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
                      <span
                        className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${STATUS[u.status].className}`}
                        title={u.last_sign_in_at ? `Ostatnie logowanie: ${formatDateTime(u.last_sign_in_at)}` : undefined}
                      >
                        {STATUS[u.status].label}
                      </span>
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
                    <td className="px-4 py-3 text-gray-600">{formatDateTime(u.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-col items-end gap-1 whitespace-nowrap">
                        <Button variant="ghost" size="sm" onClick={() => void sendLink(u)} title={u.status === 'invited' ? 'Wyślij zaproszenie ponownie' : 'Wyślij link do zmiany hasła'}>
                          <Mail size={14} className="mr-1" />
                          Wyślij link
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => resetPassword(u)}>Nowe hasło</Button>
                        {u.id !== me?.id && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-red-600 hover:text-red-700 disabled:text-gray-300"
                            disabled={u.documents > 0}
                            title={u.documents > 0 ? 'Konta z dokumentami nie można usunąć: dokumenty i ich historia muszą zostać zachowane.' : 'Usuń konto'}
                            onClick={() => void remove(u)}
                          >
                            <Trash2 size={14} className="mr-1" />
                            Usuń
                          </Button>
                        )}
                      </div>
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
