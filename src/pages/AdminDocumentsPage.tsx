import { useMemo, useState } from 'react';
import { Search, Shield } from 'lucide-react';
import type { DocumentStatus } from '../../shared/schema.ts';
import { Card, CardHeader } from '../components/Card';
import { DocumentsTable } from '../components/DocumentsTable';
import { Input } from '../components/Input';
import { ownerName } from '../lib/format';
import { useDocuments } from '../lib/useDocuments';

const selectClass =
  'rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#CC1F1F] focus:border-transparent';

export function AdminDocumentsPage() {
  const { documents, error } = useDocuments('all');
  const [owner, setOwner] = useState('');
  const [status, setStatus] = useState<DocumentStatus | ''>('');
  const [query, setQuery] = useState('');

  const owners = useMemo(() => {
    const map = new Map<string, string>();
    for (const d of documents ?? []) if (d.owner) map.set(d.owner.id, ownerName(d.owner));
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1], 'pl'));
  }, [documents]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (documents ?? []).filter(
      (d) =>
        (!owner || d.owner_id === owner) &&
        (!status || d.status === status) &&
        (!q || [d.original_filename, d.np_product_name, d.np_product_code].some((v) => v?.toLowerCase().includes(q))),
    );
  }, [documents, owner, status, query]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">All documents</h1>
        <p className="text-sm text-gray-500 mt-1">All users' documents, with their owners.</p>
      </div>
      <Card>
        <CardHeader className="flex flex-col lg:flex-row lg:items-center gap-3 justify-between">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-[#CC1F1F]" />
            <h2 className="text-sm font-semibold text-gray-900">
              Documents {documents ? `(${filtered.length}${filtered.length !== documents.length ? ` of ${documents.length}` : ''})` : ''}
            </h2>
          </div>
          <div className="flex flex-col sm:flex-row gap-2">
            <Input placeholder="Search files or products" value={query} onChange={(e) => setQuery(e.target.value)} leftIcon={<Search size={16} />} />
            <select className={selectClass} value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner">
              <option value="">All owners</option>
              {owners.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </select>
            <select className={selectClass} value={status} onChange={(e) => setStatus(e.target.value as DocumentStatus | '')} aria-label="Status">
              <option value="">Any status</option>
              <option value="processing">Processing</option>
              <option value="review">In review</option>
              <option value="done">Done</option>
              <option value="error">Error</option>
            </select>
          </div>
        </CardHeader>
        {error && <p className="px-6 py-4 text-sm text-red-600">{error}</p>}
        {documents ? <DocumentsTable documents={filtered} showOwner /> : !error && <p className="px-6 py-10 text-center text-sm text-gray-500">Loading…</p>}
      </Card>
    </div>
  );
}
