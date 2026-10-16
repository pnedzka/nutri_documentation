import { useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Eye, Plus } from 'lucide-react';
import { WARNING_LABELS, type Extraction, type RunRef, type Warning, type WarningKind } from '../../../shared/schema.ts';
import { Button } from '../Button';
import { Card, CardBody, CardHeader } from '../Card';
import { formatDateTime } from '../../lib/format';

const KIND_STYLES: Record<WarningKind, string> = {
  illegible: 'bg-red-50 text-red-700',
  unverified: 'bg-red-50 text-red-700',
  uncertain: 'bg-amber-50 text-amber-800',
  possibly_omitted: 'bg-amber-50 text-amber-800',
  possible_leak: 'bg-purple-50 text-purple-700',
  translated: 'bg-sky-50 text-sky-700',
  english_check: 'bg-amber-50 text-amber-800',
  figure_omitted: 'bg-gray-100 text-gray-700',
  model_note: 'bg-blue-50 text-blue-700',
};

const KIND_HELP: Record<WarningKind, string> = {
  illegible: 'Check the original (or ask the supplier). If you know the value for certain, click "Show" and correct the fragment; otherwise confirm – the PDF will show "ILLEGIBLE".',
  unverified: 'This text does not appear in the source. Compare it with the original and correct the fragment, or confirm if it matches.',
  uncertain: 'Two independent readings of the scan gave different results. Compare with the original and correct or confirm.',
  possibly_omitted: 'This content from the source is missing from the result. Add it, or confirm if it is left out on purpose (e.g. supplier data).',
  possible_leak: 'Supplier data may remain in the text. Click "Show" and mark the fragment for removal, or confirm.',
  translated: 'These fragments were not in English, so they were translated. Compare the translation with the original: correct the fragment ("Show") or confirm.',
  english_check: 'The text in the PDF differs from the original: corrected spelling, an omitted repetition, different numbers or characters outside the English alphabet. Check and correct, or confirm.',
  figure_omitted: 'Graphics are not carried over. Make sure they contain no technical data that is missing from the text.',
  model_note: 'Note from reading the document.',
};

const ORDER: WarningKind[] = ['unverified', 'illegible', 'uncertain', 'english_check', 'possibly_omitted', 'translated', 'possible_leak', 'figure_omitted', 'model_note'];

interface Props {
  warnings: Warning[];
  extraction: Extraction;
  editable: boolean;
  busy: boolean;
  onShow: (ref: RunRef) => void;
  onAck: (ids: string[]) => void;
  onInsert: (warning: Warning, afterBlockId: string | null, text: string) => void;
}

export function WarningsPanel({ warnings, extraction, editable, busy, onShow, onAck, onInsert }: Props) {
  const [showResolved, setShowResolved] = useState(false);
  const [inserting, setInserting] = useState<{ id: string; text: string } | null>(null);
  const open = warnings.filter((w) => w.status === 'open');
  const visible = showResolved ? warnings : open;

  /** New text goes after the last block of the warning's page. */
  const insertPosition = (page: number | null) => {
    const before = extraction.blocks.filter((b) => b.page <= (page ?? Infinity));
    return before.length ? before[before.length - 1].id : null;
  };

  return (
    <Card>
      <CardHeader className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {open.length ? <AlertTriangle size={16} className="text-amber-600" /> : <CheckCircle2 size={16} className="text-green-600" />}
          <h2 className="text-sm font-semibold text-gray-900">
            {open.length ? `To review: ${open.length}` : 'All warnings reviewed'}
            <span className="font-normal text-gray-500"> / {warnings.length}</span>
          </h2>
        </div>
        {warnings.length > open.length && (
          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={showResolved} onChange={(e) => setShowResolved(e.target.checked)} />
            show reviewed
          </label>
        )}
      </CardHeader>
      {visible.length > 0 && (
        <CardBody className="space-y-5 max-h-[60vh] overflow-y-auto">
          {ORDER.filter((kind) => visible.some((w) => w.kind === kind)).map((kind) => {
            const group = visible.filter((w) => w.kind === kind);
            const openIds = group.filter((w) => w.status === 'open').map((w) => w.id);
            return (
              <section key={kind} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${KIND_STYLES[kind]}`}>
                    {WARNING_LABELS[kind]} ({group.length})
                  </span>
                  {editable && openIds.length > 1 && (
                    <button
                      className="text-xs text-gray-500 hover:text-gray-800 underline"
                      disabled={busy}
                      onClick={() => {
                        if (confirm(`Confirm ${openIds.length} "${WARNING_LABELS[kind]}" warnings? Only do this after checking each one against the original.`)) onAck(openIds);
                      }}
                    >
                      Confirm all ({openIds.length})
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-500">{KIND_HELP[kind]}</p>
                <ul className="space-y-2">
                  {group.map((w) => (
                    <li key={w.id} className={`rounded-lg border px-3 py-2 ${w.status === 'open' ? 'border-gray-200' : 'border-gray-100 bg-gray-50 opacity-70'}`}>
                      <p className="text-sm text-gray-800">
                        {w.page ? <span className="mr-1 text-xs font-semibold text-gray-500">p. {w.page}</span> : null}
                        {w.message}
                      </p>
                      {w.excerpt && w.kind === 'possibly_omitted' && (
                        <pre className="mt-1.5 whitespace-pre-wrap rounded bg-gray-50 px-2 py-1.5 font-sans text-xs text-gray-700">{w.excerpt}</pre>
                      )}
                      {inserting?.id === w.id && (
                        <div className="mt-2 space-y-2">
                          <textarea
                            className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#CC1F1F]"
                            rows={4}
                            value={inserting.text}
                            onChange={(e) => setInserting({ id: w.id, text: e.target.value })}
                          />
                          <p className="text-xs text-gray-500">The text will be added as a paragraph at the end of page {w.page ?? ''}. Remove any supplier data from it.</p>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              disabled={busy || !inserting.text.trim()}
                              onClick={() => {
                                onInsert(w, insertPosition(w.page), inserting.text);
                                setInserting(null);
                              }}
                            >
                              Add to document
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setInserting(null)}>Cancel</Button>
                          </div>
                        </div>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        {w.ref && (
                          <Button size="sm" variant="secondary" onClick={() => onShow(w.ref!)}>
                            <Eye size={14} /> Show
                          </Button>
                        )}
                        {editable && w.status === 'open' && w.kind === 'possibly_omitted' && inserting?.id !== w.id && (
                          <Button size="sm" variant="secondary" onClick={() => setInserting({ id: w.id, text: w.excerpt ?? '' })}>
                            <Plus size={14} /> Add missing text
                          </Button>
                        )}
                        {editable && w.status === 'open' && (
                          <Button size="sm" variant="secondary" disabled={busy} onClick={() => onAck([w.id])}>
                            <Check size={14} /> Confirm
                          </Button>
                        )}
                        {w.status !== 'open' && (
                          <span className="text-xs text-gray-500">
                            {w.status === 'edited' ? 'Corrected' : 'Confirmed'} {formatDateTime(w.resolvedAt)}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </CardBody>
      )}
    </Card>
  );
}
