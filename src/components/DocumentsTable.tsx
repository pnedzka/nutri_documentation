import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import type { DocumentSummary } from '../../shared/schema.ts';
import { formatDateTime, ownerName } from '../lib/format';
import { StatusBadge } from './StatusBadge';

function Warnings({ d }: { d: DocumentSummary }) {
  if (d.status === 'review' && d.open_warnings > 0) {
    return (
      <span className="inline-flex items-center gap-1 text-amber-700">
        <AlertTriangle size={14} /> {d.open_warnings} to review
      </span>
    );
  }
  if (d.status === 'review' || d.status === 'done') {
    return (
      <span className="inline-flex items-center gap-1 text-green-700">
        <CheckCircle2 size={14} /> reviewed ({d.total_warnings})
      </span>
    );
  }
  return <span className="text-gray-400">—</span>;
}

export function DocumentsTable({ documents, showOwner = false }: { documents: DocumentSummary[]; showOwner?: boolean }) {
  if (!documents.length) {
    return <p className="px-6 py-10 text-center text-sm text-gray-500">No documents.</p>;
  }
  // The layout follows the width of the box, not of the screen: the list also sits in a narrow column next to the
  // upload form on laptops. Below 768px of its own width it shows one card per document instead of the table.
  return (
    <div className="@container">
      <ul className="@3xl:hidden divide-y divide-gray-100">
        {documents.map((d) => (
          <li key={d.id}>
            <Link to={`/dokumenty/${d.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-gray-50">
              <div className="min-w-0 flex-1 space-y-1">
                <p className="font-medium text-gray-900 break-words">{d.original_filename}</p>
                {d.output_name && <p className="text-xs font-mono text-gray-700 break-all">{d.output_name}.pdf</p>}
                {(d.np_product_name || d.np_product_code) && (
                  <p className="text-xs text-gray-500 break-words">{[d.np_product_name, d.np_product_code].filter(Boolean).join(' · ')}</p>
                )}
                {showOwner && <p className="text-xs text-gray-500 break-words">{ownerName(d.owner)}</p>}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <StatusBadge status={d.status} />
                  <Warnings d={d} />
                  <span className="text-gray-500">{formatDateTime(d.created_at)}</span>
                </div>
              </div>
              <ChevronRight size={18} className="shrink-0 text-gray-400" />
            </Link>
          </li>
        ))}
      </ul>
      <div className="hidden @3xl:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">
              <th className="px-6 py-3">File</th>
              {showOwner && <th className="px-4 py-3">Owner</th>}
              <th className="px-4 py-3">Uploaded</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Warnings</th>
              <th className="px-4 py-3" aria-label="Open" />
            </tr>
          </thead>
          <tbody>
            {documents.map((d) => (
              <tr key={d.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/70">
                <td className="px-6 py-3 max-w-[360px]">
                  <Link to={`/dokumenty/${d.id}`} className="font-medium text-gray-900 hover:text-[#CC1F1F] break-words">
                    {d.original_filename}
                  </Link>
                  {d.output_name && <p className="text-xs font-mono text-gray-700 break-all">{d.output_name}.pdf</p>}
                  {(d.np_product_name || d.np_product_code) && (
                    <p className="text-xs text-gray-500 truncate">{[d.np_product_name, d.np_product_code].filter(Boolean).join(' · ')}</p>
                  )}
                </td>
                {showOwner && (
                  <td className="px-4 py-3">
                    <p className="text-gray-900">{ownerName(d.owner)}</p>
                    {d.owner?.full_name && <p className="text-xs text-gray-500">{d.owner.email}</p>}
                  </td>
                )}
                <td className="px-4 py-3 whitespace-nowrap text-gray-600">{formatDateTime(d.created_at)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={d.status} />
                </td>
                <td className="px-4 py-3 whitespace-nowrap">
                  <Warnings d={d} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Link to={`/dokumenty/${d.id}`} className="inline-flex text-gray-400 hover:text-gray-700" aria-label="Open document">
                    <ChevronRight size={18} />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
