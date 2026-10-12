import { useState, type FormEvent } from 'react';
import { Lock, Mail } from 'lucide-react';
import { Button } from '../components/Button';
import { Card, CardBody } from '../components/Card';
import { Input } from '../components/Input';
import { useAuth } from '../lib/auth';

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
          <p className="mt-3 text-sm text-gray-500">Neutralizacja dokumentów dostawców</p>
        </div>
        <Card>
          <CardBody className="py-6">
            {status === 'error' ? (
              <div className="space-y-4">
                <p className="text-sm text-red-700">{authError}</p>
                <Button variant="secondary" className="w-full" onClick={() => void signOut()}>
                  Wróć do logowania
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-4">
                <Input label="E-mail" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} leftIcon={<Mail size={16} />} />
                <Input label="Hasło" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} leftIcon={<Lock size={16} />} />
                {error && <p className="text-sm text-red-600">{error}</p>}
                <Button type="submit" className="w-full" isLoading={busy}>
                  Zaloguj się
                </Button>
                <p className="text-xs text-gray-500 text-center">Konto zakłada administrator aplikacji.</p>
              </form>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}
