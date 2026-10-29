import { useState } from 'react';
import { Eraser, RotateCcw, Save, Scissors, X } from 'lucide-react';
import {
  REDACTION_CATEGORIES,
  REDACTION_LABELS,
  WARNING_LABELS,
  findRun,
  printedText,
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

const KIND_LABEL = { text: 'Text', illegible: 'Illegible', redact: 'To be removed' } as const;

/** Details and actions for the fragment clicked in the document view. */
export function FragmentEditor(props: Props) {
  const { extraction, warnings, selected, editable, busy } = props;
  const run = findRun(extraction, selected);
  // The parent remounts this component (key) when another fragment is selected, which resets the draft.
  const [draft, setDraft] = useState(run ? printedText(run) : '');
  const [category, setCategory] = useState<RedactionCategory>('supplier_identity');
  if (!run) return null;
  const related = warnings.filter((w) => sameRef(w.ref, selected));
  const printed = printedText(run);
  // The verbatim transcription, shown when the English version printed in the PDF differs from it.
  const original = run.kind !== 'redact' && run.en_how && run.en_how !== 'same' && run.en !== run.text ? run.text : null;
  const page = extraction.blocks.find((b) => b.id === selected.blockId)?.page;

  return (
    <Card className="border-[#CC1F1F]/30 shadow-md">
      <CardHeader className="flex items-center justify-between gap-2 py-3">
        <h2 className="text-sm font-semibold text-gray-900">
          Selected fragment <span className="font-normal text-gray-500">· {KIND_LABEL[run.kind]}{page ? ` · p. ${page}` : ''}</span>
        </h2>
        <button onClick={props.onClose} className="text-gray-400 hover:text-gray-700" aria-label="Close">
          <X size={16} />
        </button>
      </CardHeader>
      <CardBody className="space-y-3">
        {run.kind === 'redact' && (
          <p className="text-sm text-gray-700">
            Marked for removal as <strong>{REDACTION_LABELS[run.category ?? 'supplier_identity']}</strong>
            {run.reason ? ` – ${run.reason}` : ''}. This fragment will not appear in the PDF.
          </p>
        )}
        {run.kind === 'illegible' && (
          <p className="text-sm text-red-700">
            Illegible{run.reason ? ` – ${run.reason}` : ''}. Enter a value only if you know it for certain (e.g. from a better copy of the document).
          </p>
        )}
        {related.map((w) => (
          <div key={w.id} className="flex items-start justify-between gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900">
            <span>
              <strong>{WARNING_LABELS[w.kind]}:</strong> {w.message}
            </span>
            {editable && w.status === 'open' && (
              <button className="shrink-0 underline" disabled={busy} onClick={() => props.onAck([w.id])}>
                Confirm
              </button>
            )}
          </div>
        ))}

        {original !== null && (
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
            <p className="font-semibold text-gray-700">Original (transcription):</p>
            <p className="mt-0.5 whitespace-pre-wrap">{original}</p>
          </div>
        )}
        {editable && run.kind !== 'redact' && (
          <>
            {original !== null && <p className="text-xs font-semibold text-gray-700">Text in the PDF (English):</p>}
            <textarea
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC1F1F]"
              rows={Math.min(8, Math.max(2, Math.ceil(draft.length / 60)))}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <p className="text-xs text-gray-500">Make corrections only based on the original document. Every change is recorded in the history.</p>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busy || draft === printed} onClick={() => props.onEdit(draft)}>
                <Save size={14} /> Save correction
              </Button>
              {printed && (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => confirm('Delete this text from the document (e.g. if it is not in the original)?') && props.onEdit('')}
                >
                  <Eraser size={14} /> Delete text
                </Button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value as RedactionCategory)}
                className="min-h-11 sm:min-h-9 rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#CC1F1F] focus:border-transparent"
                aria-label="Removal category"
              >
                {REDACTION_CATEGORIES.map((c) => (
                  <option key={c} value={c}>{REDACTION_LABELS[c]}</option>
                ))}
              </select>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => props.onRedact(category)}>
                <Scissors size={14} /> Mark for removal
              </Button>
            </div>
          </>
        )}
        {editable && run.kind === 'redact' && (
          <>
            <p className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-700 whitespace-pre-wrap">{run.text}</p>
            <Button size="sm" variant="secondary" disabled={busy} onClick={props.onRestore}>
              <RotateCcw size={14} /> Restore to document
            </Button>
          </>
        )}
        {!editable && run.kind !== 'redact' && <p className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-700 whitespace-pre-wrap">{printed || '—'}</p>}
        {!editable && run.kind === 'redact' && <p className="rounded bg-gray-50 px-3 py-2 text-sm text-gray-700 whitespace-pre-wrap">{run.text || '—'}</p>}
      </CardBody>
    </Card>
  );
}
