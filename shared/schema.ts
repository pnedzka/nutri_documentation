// Shape of a transcribed supplier document, shared by the API (pipeline, PDF) and the review screen.
//
// Text is stored as "runs": consecutive pieces of verbatim text. A run is either plain text, an illegible spot
// (only the readable part is kept, never a guess) or a fragment marked for removal during neutralization.
// Runs are never deleted by the model: removal happens when the PDF is rendered, so every decision stays
// visible on the review screen and can be undone.
//
// The PDF is printed in English only. Next to the verbatim text every run carries its English version (`en`):
// the English part of a bilingual text, a spelling-corrected or a translated text. `text` stays the verbatim
// transcription that is checked against the source; `en` is checked against `text` and reviewed by a person.

export const REDACTION_CATEGORIES = ['supplier_identity', 'trade_name', 'supplier_code', 'commercial_terms'] as const;
export type RedactionCategory = (typeof REDACTION_CATEGORIES)[number];

export const REDACTION_LABELS: Record<RedactionCategory, string> = {
  supplier_identity: 'Supplier identity',
  trade_name: 'Trade name',
  supplier_code: 'Supplier code',
  commercial_terms: 'Commercial terms',
};

export type RunKind = 'text' | 'illegible' | 'redact';

/**
 * How the English version of a run was made:
 * - same:         already English or language-neutral (numbers, codes); printed as `text`
 * - english_part: the English part of a bilingual text, copied from `text`
 * - corrected:    English text with an obvious spelling mistake fixed
 * - translated:   translated from another language
 * - duplicate:    the content is given in English right next to it; nothing is printed
 * - edited:       written by a person on the review screen
 */
export const EN_HOW = ['same', 'english_part', 'corrected', 'translated', 'duplicate'] as const;
export type EnHow = (typeof EN_HOW)[number] | 'edited';

export interface Run {
  kind: RunKind;
  /** Verbatim text. For `illegible`: only the part that can be read (may be empty). */
  text: string;
  /** Only for `redact`. */
  category: RedactionCategory | null;
  /** Why the run is illegible or removed (short, English). */
  reason: string | null;
  /** English version printed in the PDF; null = print `text` as is. Missing in documents processed before. */
  en?: string | null;
  en_how?: EnHow | null;
}

/** What the PDF prints for a run (removed runs aside). */
export function printedText(run: Run): string {
  return run.en ?? run.text;
}

export type BlockType = 'heading' | 'paragraph' | 'key_value' | 'table' | 'list' | 'note' | 'figure';

export interface KeyValueRow {
  key: Run[];
  value: Run[];
}

export interface Block {
  id: string;
  type: BlockType;
  /** 1-based page of the source document the block comes from. */
  page: number;
  /** heading: 1–3; null otherwise. */
  level: number | null;
  /** heading, paragraph, note, figure (caption only). */
  runs: Run[] | null;
  /** list: one entry per item. */
  items: Run[][] | null;
  /** key_value: label → value pairs (e.g. "Moisture | max. 4.0 %"). */
  rows: KeyValueRow[] | null;
  /** table: header row(s) and body rows; every row is a list of cells, every cell a list of runs. */
  header: Run[][][] | null;
  body: Run[][][] | null;
}

export interface Extraction {
  /** Language of the document as written (ISO 639-1), e.g. "en", "pl", "de". */
  language: string;
  /** Number of pages the model saw. */
  page_count: number;
  blocks: Block[];
  /** Anything the model could not represent (stamps, signatures, handwriting, images), in English. */
  notes: string[];
}

export type WarningKind =
  | 'illegible'
  | 'unverified'
  | 'possibly_omitted'
  | 'uncertain'
  | 'figure_omitted'
  | 'possible_leak'
  | 'translated'
  | 'english_check'
  | 'model_note';

export const WARNING_LABELS: Record<WarningKind, string> = {
  illegible: 'Illegible',
  unverified: 'Not in source',
  possibly_omitted: 'Possibly omitted',
  uncertain: 'Uncertain reading',
  figure_omitted: 'Figure omitted',
  possible_leak: 'Possible supplier data',
  translated: 'Translation',
  english_check: 'English version',
  model_note: 'Note',
};

/** Points at one run inside the extraction. `cell` depends on the block type, see `getRuns`. */
export interface RunRef {
  blockId: string;
  cell: number[];
  run: number;
}

export interface Warning {
  id: string;
  kind: WarningKind;
  message: string;
  page: number | null;
  ref: RunRef | null;
  /** Source excerpt the warning is about (e.g. an omitted line). */
  excerpt: string | null;
  status: 'open' | 'acknowledged' | 'edited';
  resolvedBy: string | null;
  resolvedAt: string | null;
}

export type SourceKind = 'text_pdf' | 'scan' | 'image' | 'docx';
export type DocumentStatus = 'uploaded' | 'processing' | 'review' | 'done' | 'error';

export interface DocumentOwner {
  id: string;
  email: string;
  full_name: string | null;
}

export interface DocumentRecord {
  id: string;
  owner_id: string;
  original_filename: string;
  mime_type: string;
  source_kind: SourceKind | null;
  page_count: number | null;
  status: DocumentStatus;
  np_product_name: string | null;
  np_product_code: string | null;
  extraction: Extraction | null;
  warnings: Warning[] | null;
  error_message: string | null;
  output_path: string | null;
  created_at: string;
  updated_at: string;
  finalized_at: string | null;
  owner?: DocumentOwner | null;
}

export type DocumentSummary = Omit<DocumentRecord, 'extraction' | 'warnings'> & {
  open_warnings: number;
  total_warnings: number;
};

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: 'user' | 'admin';
}

export const ACCEPTED_TYPES: Record<string, string> = {
  'application/pdf': 'PDF',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'DOCX',
  'image/jpeg': 'JPG',
  'image/png': 'PNG',
};
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// ─── Navigation helpers ────────────────────────────────────────────────────

/**
 * Returns the run list a `cell` path points at:
 * - heading / paragraph / note / figure: []            → block.runs
 * - list:                               [item]         → block.items[item]
 * - key_value:                          [row, 0 | 1]   → key / value
 * - table:                              [0, row, col]  → header, [1, row, col] → body
 */
export function getRuns(block: Block, cell: number[]): Run[] | null {
  switch (block.type) {
    case 'list':
      return block.items?.[cell[0]] ?? null;
    case 'key_value': {
      const row = block.rows?.[cell[0]];
      if (!row) return null;
      return cell[1] === 0 ? row.key : row.value;
    }
    case 'table': {
      const part = cell[0] === 0 ? block.header : block.body;
      return part?.[cell[1]]?.[cell[2]] ?? null;
    }
    default:
      return cell.length === 0 ? block.runs : null;
  }
}

export interface RunLocation {
  block: Block;
  cell: number[];
  runs: Run[];
}

/** Every run list of a block with its `cell` path, in reading order. */
export function runLists(block: Block): RunLocation[] {
  const out: RunLocation[] = [];
  switch (block.type) {
    case 'list':
      (block.items ?? []).forEach((runs, i) => out.push({ block, cell: [i], runs }));
      break;
    case 'key_value':
      (block.rows ?? []).forEach((row, i) => {
        out.push({ block, cell: [i, 0], runs: row.key });
        out.push({ block, cell: [i, 1], runs: row.value });
      });
      break;
    case 'table':
      (block.header ?? []).forEach((row, r) => row.forEach((runs, c) => out.push({ block, cell: [0, r, c], runs })));
      (block.body ?? []).forEach((row, r) => row.forEach((runs, c) => out.push({ block, cell: [1, r, c], runs })));
      break;
    default:
      if (block.runs) out.push({ block, cell: [], runs: block.runs });
  }
  return out;
}

export function findRun(extraction: Extraction, ref: RunRef): Run | null {
  const block = extraction.blocks.find((b) => b.id === ref.blockId);
  if (!block) return null;
  return getRuns(block, ref.cell)?.[ref.run] ?? null;
}

export function sameRef(a: RunRef | null, b: RunRef | null): boolean {
  return !!a && !!b && a.blockId === b.blockId && a.run === b.run && a.cell.join('.') === b.cell.join('.');
}

export function runsText(runs: Run[]): string {
  return runs.map((r) => r.text).join('');
}
