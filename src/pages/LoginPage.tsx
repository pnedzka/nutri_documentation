import { useState, type FormEvent } from 'react';
import { ExternalLink, LayoutGrid, Lock, Mail } from 'lucide-react';
import { Button } from '../components/Button';
import { Card, CardBody } from '../components/Card';
import { Input } from '../components/Input';
import { useAuth } from '../lib/auth';
import { HUB_URL } from '../lib/supabase';

export function LoginPage() {
  const { signIn, status, error: authError, signOut } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center mb-8">
          <img src="/logo.png" alt="Nutri Partners" width={180} height={35} />
          <p className="mt-3 text-sm text-gray-500">Supplier document neutralization</p>
        </div>
        <Card>
          <CardBody className="py-6">
            {status === 'error' ? (
              <div className="space-y-4">
                <p className="text-sm text-red-700">{authError}</p>
                <a
                  href={HUB_URL}
                  className="flex items-center justify-center gap-2 min-h-11 rounded-lg bg-[#CC1F1F] px-4 py-2 text-sm font-medium text-white hover:bg-[#A01818]"
                >
                  <LayoutGrid size={16} />
                  All apps
                </a>
                <Button variant="secondary" className="w-full" onClick={() => void signOut()}>
                  Back to sign in
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <Input label="E-mail" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} leftIcon={<Mail size={16} />} />
                <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} leftIcon={<Lock size={16} />} />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <Button type="submit" className="w-full" isLoading={busy}>
                  Sign in
                </Button>
                <a
                  href={HUB_URL}
                  className="flex items-center justify-center gap-1 min-h-11 sm:min-h-0 text-xs text-gray-500 hover:text-gray-700 text-center"
                >
                  Forgot password? Reset it in Nutri Partners apps
                  <ExternalLink size={12} />
                </a>
                <p className="text-xs text-gray-500 text-center">Use your Nutri Partners account. Accounts are created by an administrator.</p>
              </form>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
