import type { DocumentStatus } from '../../shared/schema.ts';

const STYLES: Record<DocumentStatus, { label: string; className: string }> = {
  uploaded: { label: 'Uploaded', className: 'bg-gray-100 text-gray-700' },
  processing: { label: 'Processing', className: 'bg-blue-50 text-blue-700' },
  review: { label: 'In review', className: 'bg-amber-50 text-amber-800' },
  done: { label: 'Done', className: 'bg-green-50 text-green-700' },
  error: { label: 'Error', className: 'bg-red-50 text-red-700' },
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const s = STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${s.className}`}>
      {status === 'processing' && <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />}
      {s.label}
    </span>
  );
}
