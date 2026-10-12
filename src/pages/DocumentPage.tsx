import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Download, FileCheck2, FileText, History, Loader2, Package, RefreshCw, RotateCcw, Trash2, TriangleAlert } from 'lucide-react';
import type { ReviewAction } from '../../shared/review.ts';
import type { DocumentRecord, RedactionCategory, RunRef, Warning } from '../../shared/schema.ts';
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
  process: 'Rozpoczęto przetwarzanie',
  reprocess: 'Ponowne przetwarzanie',
  processed: 'Dokument odczytany i zweryfikowany',
  processing_failed: 'Przetwarzanie nie powiodło się',
  ack_warning: 'Potwierdzono ostrzeżenie',
  edit: 'Poprawiono fragment',
  restore_redaction: 'Przywrócono fragment',
  add_redaction: 'Oznaczono fragment do usunięcia',
  insert: 'Dodano brakujący tekst',
  products: 'Zmieniono nazwę/kod produktu NP',
  finalize: 'Wygenerowano PDF',
  reopen: 'Otwarto ponownie do edycji',
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
      toast.error('Nie udało się zapisać zmiany', (e as Error).message);
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
      toast.success('PDF gotowy', 'Dokument na papierze firmowym Nutri Partners został wygenerowany.');
      await load();
      if (res.outputUrl) window.location.assign(res.outputUrl);
    });

  const remove = () =>
    run(async () => {
      if (!confirm('Usunąć dokument wraz z plikami? Tej operacji nie można cofnąć.')) return;
      await api(`/api/documents/${id}`, { method: 'DELETE' });
      toast.success('Dokument usunięty');
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
  if (!data) return <p className="text-sm text-gray-500">Ładowanie…</p>;

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
          <h1 className="text-2xl font-bold text-gray-900 break-all">{doc.original_filename}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-gray-500">
            <StatusBadge status={doc.status} />
            <span>wgrano {formatDateTime(doc.created_at)}</span>
            {doc.page_count ? <span>· stron: {doc.page_count}</span> : null}
            {doc.source_kind && <span>· {SOURCE_LABELS[doc.source_kind]}</span>}
            {!isOwn && <span>· właściciel: <strong className="text-gray-700">{ownerName(doc.owner)}</strong></span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(doc.status === 'review' || doc.status === 'error') && (
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => {
                if (doc.status === 'error' || confirm('Przetworzyć dokument od nowa? Wszystkie dotychczasowe potwierdzenia i poprawki zostaną odrzucone.')) void process();
              }}
            >
              <RefreshCw size={14} /> Przetwórz ponownie
            </Button>
          )}
          {canDelete && (
            <Button variant="danger" size="sm" disabled={busy} onClick={() => void remove()}>
              <Trash2 size={14} /> Usuń
            </Button>
          )}
        </div>
      </div>

      {(doc.status === 'processing' || doc.status === 'uploaded') && (
        <Card>
          <CardBody className="flex items-start gap-3 py-6">
            <Loader2 size={20} className="mt-0.5 animate-spin text-[#CC1F1F]" />
            <div>
              <p className="font-medium text-gray-900">Trwa odczyt i weryfikacja dokumentu</p>
              <p className="text-sm text-gray-500 mt-1">
                Treść jest przepisywana i porównywana ze źródłem. Zwykle trwa to 1–4 minuty. Możesz zamknąć tę stronę – status zobaczysz na liście dokumentów.
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
              <p className="font-medium text-gray-900">Nie udało się przetworzyć dokumentu</p>
              <p className="text-sm text-red-700 mt-1">{doc.error_message}</p>
              <Button className="mt-3" size="sm" disabled={busy} onClick={() => void process()}>
                <RefreshCw size={14} /> Spróbuj ponownie
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
            onReopen={() => confirm('Otworzyć dokument ponownie do edycji? Po zmianach trzeba będzie wygenerować PDF jeszcze raz.') && void patch({ action: 'reopen' })}
          />
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 items-start">
            <Card className="xl:sticky xl:top-36 overflow-hidden">
              <CardHeader className="flex items-center gap-2 py-3">
                <FileText size={16} className="text-[#CC1F1F]" />
                <h2 className="text-sm font-semibold text-gray-900">Oryginał od dostawcy</h2>
                {data.originalUrl && (
                  <a href={data.originalUrl} target="_blank" rel="noreferrer" className="ml-auto text-xs text-gray-500 underline hover:text-gray-800">
                    otwórz w nowej karcie
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
                    <h2 className="text-sm font-semibold text-gray-900">Produkt Nutri Partners</h2>
                  </CardHeader>
                  <CardBody className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <Input label="Nazwa produktu NP" value={products.name} onChange={(e) => setProducts({ ...products, name: e.target.value })} />
                      <Input label="Kod produktu NP" value={products.code} onChange={(e) => setProducts({ ...products, code: e.target.value })} />
                    </div>
                    <div className="flex items-center gap-3">
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={busy || (products.name === (doc.np_product_name ?? '') && products.code === (doc.np_product_code ?? ''))}
                        onClick={() => void patch({ action: 'products', npProductName: products.name, npProductCode: products.code })}
                      >
                        Zapisz
                      </Button>
                      <p className="text-xs text-gray-500">Zastępują usunięte nazwy handlowe i kody dostawcy (zielone w podglądzie).</p>
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
                  <h2 className="text-sm font-semibold text-gray-900">Treść dokumentu</h2>
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

const SOURCE_LABELS = { text_pdf: 'PDF z warstwą tekstową', scan: 'skan (2 niezależne odczyty)', image: 'zdjęcie (2 niezależne odczyty)', docx: 'dokument Word' } as const;

function BackLink() {
  return (
    <Link to="/" className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800">
      <ArrowLeft size={14} /> Moje dokumenty
    </Link>
  );
}

function Legend() {
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
      <span><span className="rounded bg-red-100 px-1 text-red-800 font-semibold">[NIECZYTELNE]</span> nieczytelne</span>
      <span><span className="bg-gray-100 text-gray-400 line-through px-1">tekst</span> usuwane</span>
      <span><span className="bg-amber-100 underline decoration-amber-500 px-1">tekst</span> do sprawdzenia</span>
      <span>Kliknij fragment, aby go poprawić.</span>
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
              <p className="font-medium text-gray-900">Dokument zneutralizowany</p>
              <p className="text-sm text-gray-500">PDF wygenerowano {formatDateTime(doc.finalized_at)}.</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {outputUrl && (
              <a href={outputUrl}>
                <Button size="sm">
                  <Download size={14} /> Pobierz PDF
                </Button>
              </a>
            )}
            <Button size="sm" variant="secondary" disabled={busy} onClick={props.onReopen}>
              <RotateCcw size={14} /> Edytuj ponownie
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
            ? `Przed wygenerowaniem PDF rozpatrz wszystkie ostrzeżenia (pozostało: ${open}). Porównaj treść z oryginałem po lewej.`
            : 'Wszystkie ostrzeżenia rozpatrzone. Sprawdź treść i wygeneruj dokument na papierze firmowym.'}
        </p>
        <Button disabled={busy || open > 0} isLoading={busy} onClick={props.onFinalize} className="whitespace-nowrap">
          <FileCheck2 size={16} /> Generuj PDF
        </Button>
      </CardBody>
    </Card>
  );
}

function OriginalPreview({ url, mimeType }: { url: string | null; mimeType: string }) {
  if (!url) return <p className="px-6 py-10 text-sm text-gray-500">Podgląd niedostępny.</p>;
  if (mimeType.startsWith('image/')) {
    return (
      <div className="max-h-[78vh] overflow-auto bg-gray-50">
        <img src={url} alt="Oryginał dokumentu" className="w-full" />
      </div>
    );
  }
  if (mimeType === 'application/pdf') return <iframe src={url} title="Oryginał dokumentu" className="w-full h-[78vh] bg-gray-50" />;
  return (
    <div className="px-6 py-10 text-sm text-gray-600">
      Podgląd dokumentów Word nie jest dostępny w przeglądarce.{' '}
      <a href={url} className="text-[#CC1F1F] underline">Pobierz oryginał</a>, aby porównać treść.
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
          <h2 className="text-sm font-semibold text-gray-900">Historia zmian ({events.length})</h2>
          <span className="ml-auto text-xs text-gray-500">{open ? 'zwiń' : 'rozwiń'}</span>
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
  const text = (v: unknown) => (v && typeof v === 'object' && 'text' in v ? String((v as { text: unknown }).text) : '');
  if (event.kind === 'edit') return <span className="block text-xs text-gray-500">„{text(p.before)}” → „{text(p.after)}”</span>;
  if (event.kind === 'insert') return <span className="block text-xs text-gray-500">„{String(p.text ?? '')}”</span>;
  if (event.kind === 'restore_redaction' || event.kind === 'add_redaction') return <span className="block text-xs text-gray-500">„{text(p.before)}”</span>;
  if (event.kind === 'ack_warning' && Array.isArray(p.warnings))
    return <span className="block text-xs text-gray-500">{(p.warnings as { message: string }[]).map((w) => w.message).join(' | ')}</span>;
  if (event.kind === 'processing_failed') return <span className="block text-xs text-red-600">{String(p.message ?? '')}</span>;
  return null;
}
