import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileCheck2, FileText, History, Loader2, Package, RefreshCw, RotateCcw, Trash2, TriangleAlert } from 'lucide-react';
import type { ReviewAction } from '../../shared/review.ts';
import { outputName, polishDate } from '../../shared/outputName.ts';
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, type DocumentRecord, type DocumentType, type RedactionCategory, type RunRef, type Warning } from '../../shared/schema.ts';
import { Button } from '../components/Button';
import { Card, CardBody, CardHeader } from '../components/Card';
import { Input } from '../components/Input';
import { StatusBadge } from '../components/StatusBadge';
import { ExtractionView } from '../components/review/ExtractionView';
import { runDomId, runKey } from '../components/review/refs';
import { FragmentEditor } from '../components/review/FragmentEditor';
import { WarningsPanel } from '../components/review/WarningsPanel';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import { formatDateTime, ownerName } from '../lib/format';
import { useToast } from '../lib/toast';

interface EventRow {
  id: number;
  kind: string;
  payload: Record<string, unknown> | null;
  created_at: string;
  actor: { email: string; full_name: string | null } | null;
}

interface DocumentResponse {
  document: DocumentRecord;
  originalUrl: string | null;
  outputUrl: string | null;
  events: EventRow[];
}

const EVENT_LABELS: Record<string, string> = {
  process: 'Processing started',
  reprocess: 'Reprocessing started',
  processed: 'Document read and verified',
  processing_failed: 'Processing failed',
  ack_warning: 'Warning confirmed',
  edit: 'Fragment corrected',
  restore_redaction: 'Fragment restored',
  add_redaction: 'Fragment marked for removal',
  insert: 'Missing text added',
  products: 'NP product name/code changed',
  type: 'Document type changed',
  finalize: 'PDF generated',
  reopen: 'Reopened for editing',
};

const POLL_MS = 4000;

export function DocumentPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const profile = useAuth((s) => s.profile);
  const [data, setData] = useState<DocumentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<RunRef | null>(null);
  const [products, setProducts] = useState({ name: '', code: '' });
  const busyRef = useRef(false);

  const load = useCallback(async () => {
    try {
      const res = await api<DocumentResponse>(`/api/documents/${id}`);
      setData(res);
      setProducts({ name: res.document.np_product_name ?? '', code: res.document.np_product_code ?? '' });
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state is set when the request resolves
    void load();
  }, [load]);

  const status = data?.document.status;
  useEffect(() => {
    if (status !== 'processing' && status !== 'uploaded') return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [status, load]);

  /** Runs one change at a time; the server rejects changes made on an outdated version anyway. */
  const run = async (fn: () => Promise<void>) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      toast.error('Could not save the change', (e as Error).message);
      void load();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const patch = (body: ReviewAction | Record<string, unknown>) =>
    run(async () => {
      const { document } = await api<{ document: DocumentRecord }>(`/api/documents/${id}`, { method: 'PATCH', body });
      setData((prev) => (prev ? { ...prev, document } : prev));
      void api<DocumentResponse>(`/api/documents/${id}`).then((res) => setData((prev) => (prev ? { ...prev, events: res.events } : prev)));
    });

  const process = () =>
    run(async () => {
      await api(`/api/documents/${id}/process`, { method: 'POST' });
      setSelected(null);
      await load();
    });

  const finalize = () =>
    run(async () => {
      const res = await api<{ document: DocumentRecord; outputUrl: string | null }>(`/api/documents/${id}/finalize`, { method: 'POST' });
      toast.success('PDF ready', 'The document on Nutri Partners letterhead has been generated.');
      await load();
      if (res.outputUrl) window.location.assign(res.outputUrl);
    });

  const remove = () =>
    run(async () => {
      if (!confirm('Delete the document and its files? This cannot be undone.')) return;
      await api(`/api/documents/${id}`, { method: 'DELETE' });
      toast.success('Document deleted');
      navigate(profile?.role === 'admin' && data?.document.owner_id !== profile.id ? '/admin/dokumenty' : '/');
    });

  const show = (ref: RunRef) => {
    setSelected(ref);
    requestAnimationFrame(() => document.getElementById(runDomId(ref))?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  };

  if (error && !data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }
  if (!data) return <p className="text-sm text-gray-500">Loading…</p>;

  const doc = data.document;
  const warnings: Warning[] = doc.warnings ?? [];
  const open = warnings.filter((w) => w.status === 'open').length;
  const editable = doc.status === 'review';
  const isOwn = doc.owner_id === profile?.id;
  const canDelete = doc.status !== 'processing' && (profile?.role === 'admin' || doc.status !== 'done');

  return (
    <div className="space-y-6">
      <BackLink />
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900 break-words">{doc.original_filename}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
            <StatusBadge status={doc.status} />
            <span>uploaded {formatDateTime(doc.created_at)}</span>
            {doc.page_count ? <span>· {doc.page_count} {doc.page_count === 1 ? 'page' : 'pages'}</span> : null}
            {doc.source_kind && <span>· {SOURCE_LABELS[doc.source_kind]}</span>}
            {!isOwn && <span>· owner: <strong className="text-gray-700">{ownerName(doc.owner)}</strong></span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(doc.status === 'review' || doc.status === 'error') && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (doc.status === 'error' || confirm('Process the document from scratch? All confirmations and corrections made so far will be discarded.')) void process();
              }}
            >
              <RefreshCw size={14} /> Reprocess
            </Button>
          )}
          {canDelete && (
            <Button variant="danger" size="sm" disabled={busy} onClick={() => void remove()}>
              <Trash2 size={14} /> Delete
            </Button>
          )}
        </div>
      </div>

      {(doc.status === 'processing' || doc.status === 'uploaded') && (
        <Card>
          <CardBody className="flex items-start gap-3 py-6">
            <Loader2 size={20} className="mt-0.5 animate-spin text-[#CC1F1F]" />
            <div>
              <p className="font-medium text-gray-900">Reading and verifying the document</p>
              <p className="text-sm text-gray-500 mt-1">
                The content is being transcribed and compared with the source. This usually takes 1–4 minutes. You can close this page – the status is shown in the document list.
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {doc.status === 'error' && (
        <Card>
          <CardBody className="flex items-start gap-3 py-6">
            <TriangleAlert size={20} className="mt-0.5 text-red-600" />
            <div>
              <p className="font-medium text-gray-900">Could not process the document</p>
              <p className="text-sm text-red-700 mt-1">{doc.error_message}</p>
              <Button className="mt-3" size="sm" disabled={busy} onClick={() => void process()}>
                <RefreshCw size={14} /> Try again
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {(doc.status === 'review' || doc.status === 'done') && doc.extraction && (
        <>
          <ActionBar
            doc={doc}
            open={open}
            busy={busy}
            outputUrl={data.outputUrl}
            onFinalize={() => void finalize()}
            onReopen={() => confirm('Reopen the document for editing? After making changes, you will need to generate the PDF again.') && void patch({ action: 'reopen' })}
          />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            <Card className="xl:sticky xl:top-36 overflow-hidden">
              <CardHeader className="flex items-center gap-2 py-3">
                <FileText size={16} className="text-[#CC1F1F]" />
                <h2 className="text-sm font-semibold text-gray-900">Supplier's original</h2>
                {data.originalUrl && (
                  <a
                    href={data.originalUrl}
                    target="_blank"
                    rel="noreferrer"
                    // Phones get a full-width button for PDFs instead (see OriginalPreview).
                    className={`ml-auto text-xs text-gray-500 underline hover:text-gray-800 ${doc.mime_type === 'application/pdf' ? 'hidden md:inline' : ''}`}
                  >
                    open in new tab
                  </a>
                )}
              </CardHeader>
              <OriginalPreview url={data.originalUrl} mimeType={doc.mime_type} />
            </Card>

            <div className="space-y-6">
              <WarningsPanel
                warnings={warnings}
                extraction={doc.extraction}
                editable={editable}
                busy={busy}
                onShow={show}
                onAck={(warningIds) => void patch({ action: 'ack', warningIds })}
                onInsert={(w, afterBlockId, text) => void patch({ action: 'insert', afterBlockId, page: w.page ?? 1, text, warningId: w.id })}
              />

              {editable && (
                <Card>
                  <CardHeader className="flex items-center gap-2 py-3">
                    <Package size={16} className="text-[#CC1F1F]" />
                    <h2 className="text-sm font-semibold text-gray-900">PDF name and Nutri Partners product</h2>
                  </CardHeader>
                  <CardBody className="space-y-3">
                    <PdfName doc={doc} busy={busy} onChange={(documentType) => void patch({ action: 'type', documentType })} />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input label="NP product name" value={products.name} onChange={(e) => setProducts({ ...products, name: e.target.value })} />
                      <Input label="NP product code" value={products.code} onChange={(e) => setProducts({ ...products, code: e.target.value })} />
                    </div>
                    <div className="flex items-center gap-3">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy || (products.name === (doc.np_product_name ?? '') && products.code === (doc.np_product_code ?? ''))}
                        onClick={() => void patch({ action: 'products', npProductName: products.name, npProductCode: products.code })}
                      >
                        Save
                      </Button>
                      <p className="text-xs text-gray-500">These replace the supplier's removed trade names and codes (green in the preview).</p>
                    </div>
                  </CardBody>
                </Card>
              )}

              {selected && (
                <div className="sticky top-36 z-20">
                  <FragmentEditor
                    key={runKey(selected)}
                    extraction={doc.extraction}
                    warnings={warnings}
                    selected={selected}
                    editable={editable}
                    busy={busy}
                    onClose={() => setSelected(null)}
                    onAck={(warningIds) => void patch({ action: 'ack', warningIds })}
                    onEdit={(text) => void patch({ action: 'edit', ref: selected, text })}
                    onRedact={(category: RedactionCategory) => void patch({ action: 'redact', ref: selected, category })}
                    onRestore={() => void patch({ action: 'restore', ref: selected })}
                  />
                </div>
              )}

              <Card>
                <CardHeader className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
                  <h2 className="text-sm font-semibold text-gray-900">Document content</h2>
                  <Legend />
                </CardHeader>
                <CardBody>
                  <ExtractionView
                    extraction={doc.extraction}
                    warnings={warnings}
                    selected={selected}
                    onSelect={setSelected}
                    replacements={{ productName: doc.np_product_name, productCode: doc.np_product_code }}
                  />
                </CardBody>
              </Card>
            </div>
          </div>
        </>
      )}

      <EventsCard events={data.events} />
    </div>
  );
}

const SOURCE_LABELS = { text_pdf: 'PDF with a text layer', scan: 'scan (2 independent readings)', image: 'photo (2 independent readings)', docx: 'Word document' } as const;

function BackLink() {
  return (
    <Link to="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
      <ArrowLeft size={14} /> My documents
    </Link>
  );
}

/** Document type, which starts the PDF name, and the name itself once given. */
function PdfName({ doc, busy, onChange }: { doc: DocumentRecord; busy: boolean; onChange: (type: DocumentType) => void }) {
  const type = doc.document_type ?? 'Doc';
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="document-type" className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
          Document type
        </label>
        <select
          id="document-type"
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#CC1F1F] focus:border-transparent disabled:bg-gray-50 disabled:text-gray-500"
          value={type}
          disabled={busy || !!doc.output_name}
          onChange={(e) => onChange(e.target.value as DocumentType)}
        >
          {DOCUMENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {t} – {DOCUMENT_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">PDF name</span>
        <p className="py-2.5 text-sm font-mono text-gray-900 break-all">
          {doc.output_name ? `${doc.output_name}.pdf` : `${outputName(type, polishDate(new Date()), 0).replace(/_00$/, '_NN')}.pdf`}
        </p>
        <p className="text-xs text-gray-500">
          {doc.output_name ? 'Given at the first generation; it stays the same.' : 'NN is the number of the day, given when the PDF is generated.'}
        </p>
      </div>
    </div>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
      <span><span className="rounded bg-red-100 px-1 text-red-800 font-semibold">[ILLEGIBLE]</span> illegible</span>
      <span><span className="bg-gray-100 text-gray-400 line-through px-1">text</span> removed</span>
      <span><span className="bg-amber-100 underline decoration-amber-500 px-1">text</span> to check</span>
      <span>Click a fragment to correct it.</span>
    </div>
  );
}

function ActionBar(props: { doc: DocumentRecord; open: number; busy: boolean; outputUrl: string | null; onFinalize: () => void; onReopen: () => void }) {
  const { doc, open, busy, outputUrl } = props;
  if (doc.status === 'done') {
    return (
      <Card className="border-green-200">
        <CardBody className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <FileCheck2 size={20} className="text-green-600" />
            <div>
              <p className="font-medium text-gray-900">Document neutralized</p>
              <p className="text-sm text-gray-500">PDF generated {formatDateTime(doc.finalized_at)}.</p>
              {doc.output_name && <p className="text-sm text-gray-900 break-all font-mono">{doc.output_name}.pdf</p>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {outputUrl && (
              <a href={outputUrl}>
                <Button size="sm">
                  <Download size={14} /> Download PDF
                </Button>
              </a>
            )}
            <Button size="sm" variant="secondary" disabled={busy} onClick={props.onReopen}>
              <RotateCcw size={14} /> Reopen
            </Button>
          </div>
        </CardBody>
      </Card>
    );
  }
  return (
    <Card className={open ? 'border-amber-200' : 'border-green-200'}>
      <CardBody className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-gray-700">
          {open
            ? `Review all warnings before generating the PDF (${open} left). Compare the content with the original.`
            : 'All warnings reviewed. Check the content and generate the document on the letterhead.'}
        </p>
        <Button disabled={busy || open > 0} isLoading={busy} onClick={props.onFinalize} className="whitespace-nowrap">
          <FileCheck2 size={16} /> Generate PDF
        </Button>
      </CardBody>
    </Card>
  );
}

function OriginalPreview({ url, mimeType }: { url: string | null; mimeType: string }) {
  if (!url) return <p className="px-6 py-10 text-sm text-gray-500">Preview unavailable.</p>;
  if (mimeType.startsWith('image/')) {
    return (
      <div className="max-h-[78vh] overflow-auto bg-gray-50">
        <img src={url} alt="Original document" className="w-full" />
      </div>
    );
  }
  if (mimeType === 'application/pdf') {
    return (
      <>
        {/* Phones show an embedded PDF as its first page only, without scrolling: open it in the browser's viewer. */}
        <div className="md:hidden px-4 py-6">
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-800 active:bg-gray-50"
          >
            <FileText size={16} className="text-[#CC1F1F]" />
            Open original (PDF)
          </a>
        </div>
        <iframe src={url} title="Original document" className="hidden md:block w-full h-[78vh] bg-gray-50" />
      </>
    );
  }
  return (
    <div className="px-6 py-10 text-sm text-gray-600">
      Word documents cannot be previewed in the browser.{' '}
      <a href={url} className="text-[#CC1F1F] underline">Download the original</a> to compare the content.
    </div>
  );
}

function EventsCard({ events }: { events: EventRow[] }) {
  const [open, setOpen] = useState(false);
  if (!events.length) return null;
  return (
    <Card>
      <CardHeader className="py-3">
        <button className="flex w-full items-center gap-2 text-left" onClick={() => setOpen(!open)}>
          <History size={16} className="text-[#CC1F1F]" />
          <h2 className="text-sm font-semibold text-gray-900">Change history ({events.length})</h2>
          <span className="ml-auto text-xs text-gray-500">{open ? 'collapse' : 'expand'}</span>
        </button>
      </CardHeader>
      {open && (
        <CardBody>
          <ul className="space-y-2 text-sm">
            {events.map((e) => (
              <li key={e.id} className="flex flex-col sm:flex-row sm:gap-3">
                <span className="w-36 shrink-0 text-gray-500">{formatDateTime(e.created_at)}</span>
                <span className="text-gray-900">
                  {EVENT_LABELS[e.kind] ?? e.kind}
                  <span className="text-gray-500"> · {ownerName(e.actor)}</span>
                  <EventDetail event={e} />
                </span>
              </li>
            ))}
          </ul>
        </CardBody>
      )}
    </Card>
  );
}

function EventDetail({ event }: { event: EventRow }) {
  const p = event.payload ?? {};
  if (event.kind === 'type') return <span className="block text-xs text-gray-500">{String(p.before ?? 'none')} → {String(p.after ?? '')}</span>;
  const text = (v: unknown) => (v && typeof v === 'object' && 'text' in v ? String((v as { text: unknown }).text) : '');
  if (event.kind === 'edit') return <span className="block text-xs text-gray-500">"{text(p.before)}" → "{text(p.after)}"</span>;
  if (event.kind === 'insert') return <span className="block text-xs text-gray-500">"{String(p.text ?? '')}"</span>;
  if (event.kind === 'restore_redaction' || event.kind === 'add_redaction') return <span className="block text-xs text-gray-500">"{text(p.before)}"</span>;
  if (event.kind === 'ack_warning' && Array.isArray(p.warnings))
    return <span className="block text-xs text-gray-500">{(p.warnings as { message: string }[]).map((w) => w.message).join(' | ')}</span>;
  if (event.kind === 'processing_failed') return <span className="block text-xs text-red-600">{String(p.message ?? '')}</span>;
  return null;
}
