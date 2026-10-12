import { Fragment, type ReactNode } from 'react';
import { ImageOff } from 'lucide-react';
import {
  REDACTION_LABELS,
  sameRef,
  type Block,
  type Extraction,
  type Run,
  type RunRef,
  type Warning,
} from '../../../shared/schema.ts';
import { runDomId, runKey } from './refs';


interface Props {
  extraction: Extraction;
  warnings: Warning[];
  selected: RunRef | null;
  onSelect: (ref: RunRef) => void;
  replacements: { productName: string | null; productCode: string | null };
}

/**
 * The transcription as the reviewer sees it: removed fragments struck through, illegible spots in red, fragments
 * with open warnings highlighted. Every fragment can be clicked to correct, remove or restore it.
 */
export function ExtractionView({ extraction, warnings, selected, onSelect, replacements }: Props) {
  const flagged = new Set(warnings.filter((w) => w.status === 'open' && w.ref).map((w) => runKey(w.ref!)));

  const runs = (block: Block, cell: number[], list: Run[] | null | undefined): ReactNode =>
    (list ?? []).map((run, i) => {
      const ref: RunRef = { blockId: block.id, cell, run: i };
      const isSelected = sameRef(selected, ref);
      const base = `cursor-pointer rounded-sm transition-shadow ${isSelected ? 'ring-2 ring-[#CC1F1F] ring-offset-1' : 'hover:ring-1 hover:ring-gray-300'}`;
      const warn = flagged.has(runKey(ref)) ? 'bg-amber-100 underline decoration-amber-500 decoration-2 underline-offset-2' : '';
      const common = { id: runDomId(ref), onClick: () => onSelect(ref) };
      if (run.kind === 'illegible') {
        return (
          <span key={i} {...common} className={`${base} bg-red-100 text-red-800 font-semibold px-0.5`} title={run.reason ?? 'Nieczytelne'}>
            [NIECZYTELNE{run.text.trim() ? `: ${run.text.trim()}…` : ''}]
          </span>
        );
      }
      if (run.kind === 'redact') {
        const replacement =
          run.category === 'trade_name' ? replacements.productName : run.category === 'supplier_code' ? replacements.productCode : null;
        return (
          <span key={i} {...common} className={`${base} ${warn}`} title={`${REDACTION_LABELS[run.category ?? 'supplier_identity']} – usunięte${run.reason ? `: ${run.reason}` : ''}`}>
            <span className="line-through decoration-gray-500 text-gray-400 bg-gray-100">{run.text}</span>
            {replacement && <span className="ml-1 rounded bg-green-100 px-1 text-green-800 no-underline">{replacement}</span>}
          </span>
        );
      }
      return (
        <span key={i} {...common} className={`${base} ${warn} whitespace-pre-wrap`}>
          {run.text}
        </span>
      );
    });

  const cellClass = 'border border-gray-200 px-2 py-1.5 align-top';

  return (
    <div className="text-sm text-gray-900 leading-relaxed space-y-3">
      {extraction.blocks.map((block, i) => {
        const pageBreak = block.page !== extraction.blocks[i - 1]?.page;
        return (
          <Fragment key={block.id}>
            {pageBreak && (
              <div className="flex items-center gap-2 pt-2 text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                <span>Strona {block.page}</span>
                <span className="h-px flex-1 bg-gray-100" />
              </div>
            )}
            {renderBlock(block)}
          </Fragment>
        );
      })}
    </div>
  );

  function renderBlock(block: Block): ReactNode {
    switch (block.type) {
      case 'heading': {
        const size = block.level === 1 ? 'text-lg font-bold' : block.level === 2 ? 'text-base font-semibold' : 'text-sm font-semibold';
        return <p className={size}>{runs(block, [], block.runs)}</p>;
      }
      case 'paragraph':
        return <p>{runs(block, [], block.runs)}</p>;
      case 'note':
        return <p className="text-xs italic text-gray-600">{runs(block, [], block.runs)}</p>;
      case 'figure':
        return (
          <div className="flex items-start gap-2 rounded-lg border border-dashed border-gray-300 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            <ImageOff size={14} className="mt-0.5 shrink-0" />
            <span>
              Grafika ze str. {block.page} – nie jest przenoszona do wyniku.
              {block.runs?.length ? <> Podpis: {runs(block, [], block.runs)}</> : null}
            </span>
          </div>
        );
      case 'list':
        return (
          <ul className="list-disc pl-5 space-y-1">
            {(block.items ?? []).map((item, i) => (
              <li key={i}>{runs(block, [i], item)}</li>
            ))}
          </ul>
        );
      case 'key_value':
        return (
          <table className="w-full border-collapse text-[13px]">
            <tbody>
              {(block.rows ?? []).map((row, i) => (
                <tr key={i}>
                  <td className={`${cellClass} w-2/5 font-medium bg-gray-50/60`}>{runs(block, [i, 0], row.key)}</td>
                  <td className={cellClass}>{runs(block, [i, 1], row.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        );
      case 'table':
        return (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-[13px]">
              {block.header?.length ? (
                <thead>
                  {block.header.map((row, r) => (
                    <tr key={r} className="bg-gray-50">
                      {row.map((cell, c) => (
                        <th key={c} className={`${cellClass} text-left font-semibold`}>
                          {runs(block, [0, r, c], cell)}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
              ) : null}
              <tbody>
                {(block.body ?? []).map((row, r) => (
                  <tr key={r}>
                    {row.map((cell, c) => (
                      <td key={c} className={cellClass}>
                        {runs(block, [1, r, c], cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
    }
  }
}
