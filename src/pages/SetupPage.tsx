import { Card, CardBody, CardHeader } from '../components/Card';

export function SetupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="max-w-lg">
        <CardHeader>
          <h1 className="text-base font-semibold text-gray-900">Aplikacja nie jest jeszcze skonfigurowana</h1>
        </CardHeader>
        <CardBody className="space-y-3 text-sm text-gray-600">
          <p>Brakuje połączenia z bazą Supabase (zmienne <code>NEXT_PUBLIC_SUPABASE_URL</code> i <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>).</p>
          <p>W Vercelu: projekt → <strong>Storage</strong> → <strong>Supabase</strong> → podłącz do projektu, a następnie wdróż ponownie. Szczegóły w pliku README.</p>
        </CardBody>
      </Card>
    </div>
  );
}
