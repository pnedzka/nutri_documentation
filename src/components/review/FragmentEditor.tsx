import { useState } from 'react';
import { Eraser, RotateCcw, Save, Scissors, X } from 'lucide-react';
import {
  REDACTION_CATEGORIES,
  REDACTION_LABELS,
  WARNING_LABELS,
  findRun,
  sameRef,
  type Extraction,
  type RedactionCategory,
  type RunRef,
  type Warning,
} from '../../../shared/schema.ts';
import { Button } from '../Button';
import { Card, CardBody, CardHeader } from '../Card';

interface Props {
  extraction: Extraction;
  warnings: Warning[];
  selected: RunRef;
  editable: boolean;
  busy: boolean;
  onClose: () => void;
  onEdit: (text: string) => void;
  onRedact: (category: RedactionCategory) => void;
  onRestore: () => void;
  onAck: (ids: string[]) => void;
}

const KIND_LABEL = { text: 'Tekst', illegible: 'Nieczytelne', redact: 'Do usunięcia' } as const;

/** Details and actions for the fragment clicked in the document view. */
export function FragmentEditor(props: Props) {
  const { extraction, warnings, selected, editable, busy } = props;
  const run = findRun(extraction, selected);
  // The parent remounts this component (key) when another fragment is selected, which resets the draft.
  const [draft, setDraft] = useState(run?.text ?? '');
  const [category, setCategory] = useState<RedactionCategory>('supplier_identity');
  if (!run) return null;
  const related = warnings.filter((w) => sameRef(w.ref, selected));
  const page = extraction.blocks.find((b) => b.id === selected.blockId)?.page;

  return (
    <Card className="border-[#CC1F1F]/30 shadow-md">
      <CardHeader className="flex items-center justify-between gap-2 py-3">
        <h2 className="text-sm font-semibold text-gray-900">
          Wybrany fragment <span className="font-normal text-gray-500">· {KIND_LABEL[run.kind]}{page ? ` · str. ${page}` : ''}</span>
        </h2>
        <button onClick={props.onClose} className="text-gray-400 hover:text-gray-700" aria-label="Zamknij">
          <X size={16} />
        </button>
      </CardHeader>
      <CardBody className="space-y-3">
        {run.kind === 'redact' && (
          <p className="text-sm text-gray-700">
            Oznaczone do usunięcia jako <strong>{REDACTION_LABELS[run.category ?? 'supplier_identity']}</strong>
            {run.reason ? ` – ${run.reason}` : ''}. W PDF ten fragment nie wystąpi.
          </p>
        )}
        {run.kind === 'illegible' && (
          <p className="text-sm text-red-700">
            Nieczytelne{run.reason ? ` – ${run.reason}` : ''}. Wpisz wartość tylko wtedy, gdy znasz ją na pewno (np. z lepszej kopii dokumentu).
          </p>
        )}
        {related.map((w) => (
          <div key={w.id} className="flex items-start justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <span>
              <strong>{WARNING_LABELS[w.kind]}:</strong> {w.message}
            </span>
            {editable && w.status === 'open' && (
              <button className="shrink-0 underline" disabled={busy} onClick={() => props.onAck([w.id])}>
                Potwierdzam
              </button>
            )}
          </div>
        ))}

        {editable && run.kind !== 'redact' && (
          <>
            <textarea
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC1F1F]"
              rows={Math.min(8, Math.max(2, Math.ceil(draft.length / 60)))}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <p className="text-xs text-gray-500">Poprawiaj wyłącznie na podstawie oryginału dokumentu. Każda zmiana jest zapisywana w historii.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy || draft === run.text} onClick={() => props.onEdit(draft)}>
                <Save size={14} /> Zapisz poprawkę
              </Button>
              {run.text && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => confirm('Usunąć ten tekst z dokumentu (np. gdy nie występuje w oryginale)?') && props.onEdit('')}
                >
                  <Eraser size={14} /> Usuń tekst
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as RedactionCategory)}
                className="rounded-lg border border-gray-200 bg-white px-2 py-1.5 text-sm"
                aria-label="Kategoria usunięcia"
              >
                {REDACTION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{REDACTION_LABELS[c]}</option>
                ))}
              </select>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => props.onRedact(category)}>
                <Scissors size={14} /> Oznacz do usunięcia
              </Button>
            </div>
          </>
        )}
        {editable && run.kind === 'redact' && (
          <>
            <p className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-700 whitespace-pre-wrap">{run.text}</p>
            <Button size="sm" variant="secondary" disabled={busy} onClick={props.onRestore}>
              <RotateCcw size={14} /> Przywróć do dokumentu
            </Button>
          </>
        )}
        {!editable && <p className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-700 whitespace-pre-wrap">{run.text || '—'}</p>}
      </CardBody>
    </Card>
  );
}
