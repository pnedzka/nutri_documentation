import { FolderOpen } from 'lucide-react';
import { Card, CardHeader } from '../components/Card';
import { DocumentsTable } from '../components/DocumentsTable';
import { UploadCard } from '../components/UploadCard';
import { useDocuments } from '../lib/useDocuments';

export function DocumentsPage() {
  const { documents, error } = useDocuments('mine');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">My documents</h1>
        <p className="text-sm text-gray-500 mt-1">
          Upload a supplier document – you get it back on Nutri Partners letterhead, without the supplier's details and with all technical data kept.
        </p>
      </div>
      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,440px)_minmax(0,1fr)] gap-6 items-start">
        <UploadCard />
        <Card>
          <CardHeader className="flex items-center gap-2">
            <FolderOpen size={16} className="text-[#CC1F1F]" />
            <h2 className="text-sm font-semibold text-gray-900">Neutralized files</h2>
          </CardHeader>
          {error && <p className="px-6 py-4 text-sm text-red-600">{error}</p>}
          {documents ? <DocumentsTable documents={documents} /> : !error && <p className="px-6 py-10 text-center text-sm text-gray-500">Loading…</p>}
        </Card>
      </div>
    </div>
  );
}
