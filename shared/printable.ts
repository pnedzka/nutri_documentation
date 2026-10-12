// Turns a reviewed extraction into what goes on paper: fragments marked for removal are dropped (or replaced by the
// Nutri Partners product name / code), rows, columns and blocks left empty by the removal disappear.
// Nothing is ever added here except those two replacement values entered by the user.

import type { Block, Extraction, Run } from './schema.js';

export interface PrintRun {
  text: string;
  illegible: boolean;
}

export type PrintCell = PrintRun[];

export type PrintBlock =
  | { type: 'heading'; level: number; runs: PrintCell }
  | { type: 'paragraph' | 'note'; runs: PrintCell }
  | { type: 'list'; items: PrintCell[] }
  | { type: 'key_value'; rows: { key: PrintCell; value: PrintCell }[] }
  | { type: 'table'; header: PrintCell[][]; body: PrintCell[][] };

export interface IllegibleSpot {
  page: number;
  text: string;
  reason: string | null;
}

export interface Printable {
  blocks: PrintBlock[];
  illegible: IllegibleSpot[];
}

export interface Replacements {
  productName: string | null;
  productCode: string | null;
}

const isEmpty = (cell: PrintCell) => cell.every((r) => !r.illegible && !r.text.trim());

export function toPrintable(extraction: Extraction, replacements: Replacements): Printable {
  const illegible: IllegibleSpot[] = [];

  const cell = (runs: Run[] | null | undefined, page: number): PrintCell => {
    const out: PrintCell = [];
    let lastReplaced: string | null = null;
    for (const run of runs ?? []) {
      if (run.kind === 'redact') {
        const replacement =
          run.category === 'trade_name' ? replacements.productName : run.category === 'supplier_code' ? replacements.productCode : null;
        // A trade name split into several runs is replaced once.
        if (replacement && lastReplaced !== run.category) out.push({ text: withSpacing(run.text, replacement), illegible: false });
        lastReplaced = replacement ? run.category : null;
        continue;
      }
      lastReplaced = null;
      if (run.kind === 'illegible') {
        illegible.push({ page, text: run.text, reason: run.reason });
        out.push({ text: run.text, illegible: true });
      } else {
        out.push({ text: run.text, illegible: false });
      }
    }
    return tidy(out);
  };

  const blocks: PrintBlock[] = [];
  for (const block of extraction.blocks) {
    const printed = printBlock(block, cell);
    if (printed) blocks.push(printed);
  }
  return { blocks, illegible };
}

function printBlock(block: Block, cell: (runs: Run[] | null | undefined, page: number) => PrintCell): PrintBlock | null {
  const p = block.page;
  switch (block.type) {
    case 'figure':
      return null; // Graphics are not reproduced; the review screen required an acknowledgement for each one.
    case 'heading': {
      const runs = cell(block.runs, p);
      return isEmpty(runs) ? null : { type: 'heading', level: Math.min(Math.max(block.level ?? 1, 1), 3), runs };
    }
    case 'paragraph':
    case 'note': {
      const runs = cell(block.runs, p);
      return isEmpty(runs) ? null : { type: block.type, runs };
    }
    case 'list': {
      const items = (block.items ?? []).map((i) => cell(i, p)).filter((i) => !isEmpty(i));
      return items.length ? { type: 'list', items } : null;
    }
    case 'key_value': {
      // A row whose value was removed (e.g. "Price | 2.50 EUR") goes as a whole: a label alone means nothing.
      const rows = (block.rows ?? [])
        .map((r) => ({ key: cell(r.key, p), value: cell(r.value, p), valueHadContent: r.value.length > 0 }))
        .filter((r) => !(isEmpty(r.value) && r.valueHadContent) && !(isEmpty(r.key) && isEmpty(r.value)))
        .map(({ key, value }) => ({ key, value }));
      return rows.length ? { type: 'key_value', rows } : null;
    }
    case 'table': {
      const header = (block.header ?? []).map((row) => row.map((c) => cell(c, p)));
      let body = (block.body ?? []).map((row) => row.map((c) => cell(c, p)));
      body = body.filter((row) => !row.every(isEmpty));
      if (!body.length) return null;
      // Drop columns that are empty everywhere after removal (e.g. a "Price" column).
      const width = Math.max(...[...header, ...body].map((r) => r.length));
      const keep: number[] = [];
      for (let col = 0; col < width; col++) {
        const bodyEmpty = body.every((row) => !row[col] || isEmpty(row[col]));
        if (!bodyEmpty) keep.push(col);
      }
      const pick = (row: PrintCell[]) => keep.map((col) => row[col] ?? []);
      return { type: 'table', header: header.map(pick).filter((r) => !r.every(isEmpty)), body: body.map(pick) };
    }
  }
}

/** Keeps the whitespace around a replaced fragment so "Product: ACME Milk 26" becomes "Product: NP Milk". */
function withSpacing(original: string, replacement: string): string {
  const lead = original.match(/^\s*/)?.[0] ?? '';
  const trail = original.match(/\s*$/)?.[0] ?? '';
  return `${lead}${replacement}${trail}`;
}

/** Collapses double spaces left where a fragment was removed and trims the cell. */
function tidy(runs: PrintCell): PrintCell {
  const out = runs.filter((r) => r.illegible || r.text.length > 0);
  for (let i = 1; i < out.length; i++) {
    if (/\s$/.test(out[i - 1].text) && /^\s/.test(out[i].text)) out[i] = { ...out[i], text: out[i].text.replace(/^\s+/, '') };
  }
  if (out.length) {
    out[0] = { ...out[0], text: out[0].text.replace(/^\s+/, '') };
    const last = out.length - 1;
    out[last] = { ...out[last], text: out[last].text.replace(/\s+$/, '') };
  }
  return out;
}
