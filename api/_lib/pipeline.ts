// Processing of an uploaded document: model transcription, deterministic verification, warnings for the review.

import {
  EN_HOW,
  REDACTION_CATEGORIES,
  type Block,
  type BlockType,
  type Extraction,
  type Run,
  type Warning,
} from '../../shared/schema.js';
import {
  compareWithSecondPass,
  englishWarnings,
  findOmissions,
  numberWarnings,
  structuralWarnings,
  verifyAgainstSource,
} from '../../shared/verify.js';
import { PipelineError, structuredCall } from './claude.js';
import { prepareSource, type PreparedSource, type SourcePart } from './extract.js';
import { EXTRACTION_SCHEMA, READING_SCHEMA, READING_SYSTEM, TRANSCRIPTION_SYSTEM, readingTask, transcriptionTask } from './prompts.js';

/** Parallel model requests per document. */
const CONCURRENCY = 4;

interface Reading {
  pages: { page: number; text: string }[];
}

export interface PipelineResult {
  extraction: Extraction;
  warnings: Warning[];
  source: Pick<PreparedSource, 'kind' | 'pageCount'>;
}

export async function processFile(bytes: Uint8Array, mimeType: string): Promise<PipelineResult> {
  const source = await prepareSource(bytes, mimeType);
  const needsSecondReading = source.sourcePages === null;

  const [transcriptions, readings] = await Promise.all([
    mapLimit(source.parts, CONCURRENCY, (part) =>
      structuredCall<Extraction>({
        system: TRANSCRIPTION_SYSTEM,
        content: [...part.content, { type: 'text', text: transcriptionTask(part.offset, part.pageCount) }],
        schema: EXTRACTION_SCHEMA,
      }),
    ),
    needsSecondReading
      ? mapLimit(source.parts, CONCURRENCY, (part) =>
          structuredCall<Reading>({
            system: READING_SYSTEM,
            content: [...part.content, { type: 'text', text: readingTask(part.offset) }],
            schema: READING_SCHEMA,
            effort: 'low',
          }),
        )
      : Promise.resolve(null),
  ]);

  const extraction = mergeTranscriptions(transcriptions, source.parts, source);
  const warnings: Warning[] = [...structuralWarnings(extraction), ...englishWarnings(extraction)];
  if (source.sourcePages) {
    warnings.push(...verifyAgainstSource(extraction, source.sourcePages));
    warnings.push(...findOmissions(extraction, source.sourcePages));
  } else if (readings) {
    const pages = mergeReadings(readings, source.parts, extraction.page_count);
    warnings.push(...compareWithSecondPass(extraction, pages));
    warnings.push(...findOmissions(extraction, pages, 'the second reading of the document'));
  }
  return { extraction, warnings: numberWarnings(warnings), source: { kind: source.kind, pageCount: source.pageCount } };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

/** Pages are numbered from the start of the whole document; a model that numbered from its part gets corrected. */
function absolutePage(page: unknown, part: SourcePart): number {
  const p = typeof page === 'number' && Number.isFinite(page) ? Math.round(page) : part.offset + 1;
  if (part.pageCount === null) return Math.max(1, p);
  const first = part.offset + 1;
  const last = part.offset + part.pageCount;
  if (p >= first && p <= last) return p;
  if (p >= 1 && p <= part.pageCount) return part.offset + p;
  return Math.min(Math.max(p, first), last);
}

const BLOCK_TYPES = new Set<BlockType>(['heading', 'paragraph', 'key_value', 'table', 'list', 'note', 'figure']);

function sanitizeRun(value: unknown): Run | null {
  const r = value as Partial<Run> | null;
  if (!r || typeof r.text !== 'string') return null;
  const kind = r.kind === 'illegible' || r.kind === 'redact' ? r.kind : 'text';
  const category = kind === 'redact' && REDACTION_CATEGORIES.includes(r.category as never) ? r.category! : kind === 'redact' ? 'supplier_identity' : null;
  const reason = typeof r.reason === 'string' && r.reason.trim() ? r.reason.trim() : null;
  // A missing or unknown English mode means "print as transcribed"; englishWarnings flags anything not in English.
  const enHow = EN_HOW.includes(r.en_how as never) ? (r.en_how as (typeof EN_HOW)[number]) : 'same';
  const en = enHow === 'same' ? null : enHow === 'duplicate' ? '' : typeof r.en === 'string' ? r.en : null;
  return { kind, text: r.text, category, reason, en, en_how: enHow };
}

const runs = (value: unknown): Run[] => (Array.isArray(value) ? value.map(sanitizeRun).filter((r): r is Run => r !== null) : []);
const rowsOfCells = (value: unknown): Run[][][] => (Array.isArray(value) ? value.map((row) => (Array.isArray(row) ? row.map(runs) : [])) : []);

function sanitizeBlock(value: unknown, page: number, id: string): Block | null {
  const b = value as Partial<Block> | null;
  if (!b || !BLOCK_TYPES.has(b.type as BlockType)) return null;
  const type = b.type as BlockType;
  const block: Block = { id, type, page, level: null, runs: null, items: null, rows: null, header: null, body: null };
  switch (type) {
    case 'heading':
      block.level = typeof b.level === 'number' ? Math.min(Math.max(Math.round(b.level), 1), 3) : 1;
      block.runs = runs(b.runs);
      break;
    case 'list':
      block.items = Array.isArray(b.items) ? b.items.map(runs) : [];
      break;
    case 'key_value':
      block.rows = Array.isArray(b.rows) ? b.rows.map((r) => ({ key: runs(r?.key), value: runs(r?.value) })) : [];
      break;
    case 'table':
      block.header = rowsOfCells(b.header);
      block.body = rowsOfCells(b.body);
      break;
    default:
      block.runs = runs(b.runs);
  }
  return block;
}

/** Joins the transcriptions of the parts into one document with page numbers and block ids of the whole file. */
export function mergeTranscriptions(parts: Extraction[], sourceParts: SourcePart[], source: Pick<PreparedSource, 'pageCount' | 'notes'>): Extraction {
  const blocks: Block[] = [];
  const notes: string[] = [...source.notes];
  const languages = new Map<string, number>();
  parts.forEach((part, i) => {
    const sp = sourceParts[i];
    if (!part || !Array.isArray(part.blocks)) throw new PipelineError('Claude returned an incomplete result. Try again.');
    for (const raw of part.blocks) {
      const block = sanitizeBlock(raw, absolutePage((raw as Block)?.page, sp), `b${blocks.length + 1}`);
      if (block) blocks.push(block);
    }
    for (const note of Array.isArray(part.notes) ? part.notes : []) if (typeof note === 'string' && note.trim()) notes.push(note.trim());
    const lang = typeof part.language === 'string' ? part.language.toLowerCase().slice(0, 2) : '';
    if (lang) languages.set(lang, (languages.get(lang) ?? 0) + part.blocks.length);
  });
  if (!blocks.length) throw new PipelineError('No content could be read from the document.');
  const language = [...languages.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'en';
  return { language, page_count: source.pageCount ?? 1, blocks, notes };
}

/** Second reading as text per page (index 0 = page 1). */
export function mergeReadings(readings: Reading[], sourceParts: SourcePart[], pageCount: number): string[] {
  const pages: string[] = Array.from({ length: Math.max(pageCount, 1) }, () => '');
  readings.forEach((reading, i) => {
    for (const p of reading?.pages ?? []) {
      if (typeof p?.text !== 'string') continue;
      const page = absolutePage(p.page, sourceParts[i]);
      while (pages.length < page) pages.push('');
      pages[page - 1] += `${pages[page - 1] ? '\n' : ''}${p.text}`;
    }
  });
  return pages;
}
