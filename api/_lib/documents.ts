import { outputName, polishDate } from '../../shared/outputName.js';
import type { DocumentRecord, DocumentSummary, Profile, Warning } from '../../shared/schema.js';
import { HttpError } from './http.js';
import { db } from './supabase.js';
import { logError } from './monitoring.js';

/** A run longer than this is assumed to have been killed by the function time limit. */
const PROCESSING_TIMEOUT_MS = 6 * 60 * 1000;

export const DOCUMENT_COLUMNS =
  'id, owner_id, original_filename, original_path, mime_type, size_bytes, source_kind, page_count, status, np_product_name, np_product_code, document_type, output_name, extraction, warnings, model, error_message, output_path, created_at, updated_at, processing_started_at, finalized_at, finalized_by';

export const OWNER_JOIN = 'owner:profiles!documents_owner_id_fkey(id, email, full_name)';

export interface DocumentRow extends DocumentRecord {
  original_path: string;
  size_bytes: number | null;
  model: string | null;
  processing_started_at: string | null;
  finalized_by: string | null;
  /** Written once with output_name; not read back. */
  output_date?: string;
  output_seq?: number;
}

export function canAccess(row: Pick<DocumentRow, 'owner_id'>, profile: Profile): boolean {
  return row.owner_id === profile.id || profile.role === 'admin';
}

export async function loadDocument(id: string, profile: Profile): Promise<DocumentRow> {
  const { data, error } = await db().from('documents').select(`${DOCUMENT_COLUMNS}, ${OWNER_JOIN}`).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data || !canAccess(data as unknown as DocumentRow, profile)) throw new HttpError(404, 'Document not found.');
  return failIfStale(data as unknown as DocumentRow);
}

/** Marks a document whose processing never finished (function timeout, crash) as failed so it can be retried. */
export async function failIfStale<T extends Pick<DocumentRow, 'id' | 'status' | 'processing_started_at' | 'error_message'>>(row: T): Promise<T> {
  if (row.status !== 'processing' || !row.processing_started_at) return row;
  if (Date.now() - new Date(row.processing_started_at).getTime() < PROCESSING_TIMEOUT_MS) return row;
  const error_message = 'Processing took too long and was stopped. Try again or split the document into smaller files.';
  await db().from('documents').update({ status: 'error', error_message }).eq('id', row.id).eq('status', 'processing');
  return { ...row, status: 'error', error_message };
}

export function openWarnings(warnings: Warning[] | null): number {
  return (warnings ?? []).filter((w) => w.status === 'open').length;
}

function omit<T extends object, K extends keyof T>(obj: T, keys: K[]): Omit<T, K> {
  const out = { ...obj };
  for (const key of keys) delete out[key];
  return out;
}

const INTERNAL_COLUMNS = ['original_path', 'processing_started_at', 'finalized_by', 'size_bytes', 'model'] as const;

export function toSummary(row: DocumentRow): DocumentSummary {
  return {
    ...omit(row, ['extraction', 'warnings', ...INTERNAL_COLUMNS]),
    open_warnings: openWarnings(row.warnings),
    total_warnings: row.warnings?.length ?? 0,
  };
}

/** Public shape of a document: storage paths and internal columns stay on the server. */
export function toPublic(row: DocumentRow): DocumentRecord {
  return omit(row, [...INTERNAL_COLUMNS]);
}

export async function logEvent(documentId: string, actorId: string, kind: string, payload: Record<string, unknown> = {}) {
  const { error } = await db().from('document_events').insert({ document_id: documentId, actor_id: actorId, kind, payload });
  if (error) logError('documents.logEvent', error, { documentId, kind });
}

/**
 * Saves changes only if nobody else changed the document in the meantime (two tabs, double clicks).
 */
export async function saveDocument(row: DocumentRow, changes: Partial<DocumentRow>): Promise<DocumentRow> {
  const { data, error } = await db()
    .from('documents')
    .update({ ...changes, updated_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('updated_at', row.updated_at)
    .select(`${DOCUMENT_COLUMNS}, ${OWNER_JOIN}`)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(409, 'The document has been changed in the meantime. Refresh the page.');
  return data as unknown as DocumentRow;
}

/**
 * Gives the document its PDF name at the first generation (see shared/outputName.ts) and saves it right away, so
 * a generation that fails afterwards keeps the number for the next attempt. Later generations keep the name.
 */
export async function ensureOutputName(row: DocumentRow): Promise<DocumentRow & { output_name: string }> {
  if (row.output_name) return row as DocumentRow & { output_name: string };
  const day = polishDate(new Date());
  const { data: seq, error } = await db().rpc('next_output_seq', { p_day: day });
  if (error) throw error;
  if (typeof seq !== 'number') throw new Error('next_output_seq returned no number');
  const name = outputName(row.document_type ?? 'Doc', day, seq);
  const saved = await saveDocument(row, { output_name: name, output_date: day, output_seq: seq });
  return { ...saved, output_name: name };
}

/** File name of the downloaded PDF. It never repeats the supplier's file name, which may name the supplier. */
export function downloadName(row: Pick<DocumentRow, 'id' | 'output_name' | 'finalized_at'>): string {
  if (row.output_name) return `${row.output_name}.pdf`;
  // PDFs generated before names were introduced: their header shows the short reference.
  const day = polishDate(row.finalized_at ? new Date(row.finalized_at) : new Date()).replaceAll('-', '');
  return `Doc_NP_${day}_${row.id.slice(0, 8).toUpperCase()}.pdf`;
}
