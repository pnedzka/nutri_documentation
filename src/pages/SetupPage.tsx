import { Card, CardBody, CardHeader } from '../components/Card';

export function SetupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="max-w-lg">
        <CardHeader>
          <h1 className="text-base font-semibold text-gray-900">The app is not configured yet</h1>
        </CardHeader>
        <CardBody className="space-y-3 text-sm text-gray-600">
          <p>The Supabase database connection is missing (variables <code>NEXT_PUBLIC_SUPABASE_URL</code> and <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code>).</p>
          <p>In Vercel: project → <strong>Storage</strong> → <strong>Supabase</strong> → connect it to the project, then redeploy. See the README for details.</p>
        </CardBody>
      </Card>
    </div>
  );
}
