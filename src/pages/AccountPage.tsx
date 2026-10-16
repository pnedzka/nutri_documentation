import { useState, type FormEvent } from 'react';
import { KeyRound } from 'lucide-react';
import { Button } from '../components/Button';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Input } from '../components/Input';
import { useAuth } from '../lib/auth';
import { supabase } from '../lib/supabase';
import { useToast } from '../lib/toast';

export function AccountPage() {
  const profile = useAuth((s) => s.profile);
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 10) return toast.error('The password must be at least 10 characters long.');
    if (password !== repeat) return toast.error("The passwords don't match.");
    setBusy(true);
    const { error } = (await supabase?.auth.updateUser({ password })) ?? { error: null };
    setBusy(false);
    if (error) return toast.error('Could not change the password', error.message);
    setPassword('');
    setRepeat('');
    toast.success('Password changed');
  };

  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My account</h1>
        <p className="text-sm text-gray-500 mt-1">
          {profile?.full_name ? `${profile.full_name} · ` : ''}
          {profile?.email} · {profile?.role === 'admin' ? 'administrator' : 'user'}
        </p>
      </div>
      <Card>
        <CardHeader className="flex items-center gap-2">
          <KeyRound size={16} className="text-[#CC1F1F]" />
          <h2 className="text-sm font-semibold text-gray-900">Change password</h2>
        </CardHeader>
        <CardBody>
          <form onSubmit={submit} className="space-y-4">
            <Input label="New password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            <Input label="Repeat password" type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} />
            <Button type="submit" isLoading={busy}>Change password</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
