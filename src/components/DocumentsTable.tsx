import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ChevronRight } from 'lucide-react';
import type { DocumentSummary } from '../../shared/schema.ts';
import { formatDateTime, ownerName } from '../lib/format';
import { StatusBadge } from './StatusBadge';

export function DocumentsTable({ documents, showOwner = false }: { documents: DocumentSummary[]; showOwner?: boolean }) {
  if (!documents.length) {
    return <p className="px-6 py-10 text-center text-sm text-gray-500">Brak dokumentów.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs font-semibold uppercase tracking-wider text-gray-500 border-b border-gray-100">
            <th className="px-6 py-3">Plik</th>
            {showOwner && <th className="px-4 py-3">Właściciel</th>}
            <th className="px-4 py-3">Wgrano</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Ostrzeżenia</th>
            <th className="px-4 py-3" aria-label="Otwórz" />
          </tr>
        </thead>
        <tbody>
          {documents.map((d) => (
            <tr key={d.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/70">
              <td className="px-6 py-3 max-w-[360px]">
                <Link to={`/dokumenty/${d.id}`} className="font-medium text-gray-900 hover:text-[#CC1F1F] break-all">
                  {d.original_filename}
                </Link>
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
                {d.status === 'review' && d.open_warnings > 0 ? (
                  <span className="inline-flex items-center gap-1 text-amber-700">
                    <AlertTriangle size={14} /> {d.open_warnings} do rozpatrzenia
                  </span>
                ) : d.status === 'review' || d.status === 'done' ? (
                  <span className="inline-flex items-center gap-1 text-green-700">
                    <CheckCircle2 size={14} /> rozpatrzone ({d.total_warnings})
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                <Link to={`/dokumenty/${d.id}`} className="inline-flex text-gray-400 hover:text-gray-700" aria-label="Otwórz dokument">
                  <ChevronRight size={18} />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
