import type { DocumentRecord, DocumentSummary, Profile, Warning } from '../../shared/schema.js';
import { HttpError } from './http.js';
import { db } from './supabase.js';

/** A run longer than this is assumed to have been killed by the function time limit. */
const PROCESSING_TIMEOUT_MS = 6 * 60 * 1000;

export const DOCUMENT_COLUMNS =
  'id, owner_id, original_filename, original_path, mime_type, size_bytes, source_kind, page_count, status, np_product_name, np_product_code, extraction, warnings, model, error_message, output_path, created_at, updated_at, processing_started_at, finalized_at, finalized_by';

export const OWNER_JOIN = 'owner:profiles!documents_owner_id_fkey(id, email, full_name)';

export interface DocumentRow extends DocumentRecord {
  original_path: string;
  size_bytes: number | null;
  model: string | null;
  processing_started_at: string | null;
  finalized_by: string | null;
}

export function canAccess(row: Pick<DocumentRow, 'owner_id'>, profile: Profile): boolean {
  return row.owner_id === profile.id || profile.role === 'admin';
}

export async function loadDocument(id: string, profile: Profile): Promise<DocumentRow> {
  const { data, error } = await db().from('documents').select(`${DOCUMENT_COLUMNS}, ${OWNER_JOIN}`).eq('id', id).maybeSingle();
  if (error) throw error;
  if (!data || !canAccess(data as unknown as DocumentRow, profile)) throw new HttpError(404, 'Nie znaleziono dokumentu.');
  return failIfStale(data as unknown as DocumentRow);
}

/** Marks a document whose processing never finished (function timeout, crash) as failed so it can be retried. */
export async function failIfStale<T extends Pick<DocumentRow, 'id' | 'status' | 'processing_started_at' | 'error_message'>>(row: T): Promise<T> {
  if (row.status !== 'processing' || !row.processing_started_at) return row;
  if (Date.now() - new Date(row.processing_started_at).getTime() < PROCESSING_TIMEOUT_MS) return row;
  const error_message = 'Przetwarzanie trwało zbyt długo i zostało przerwane. Spróbuj ponownie lub podziel dokument na mniejsze pliki.';
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
  if (error) console.error('document_events insert failed', error);
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
  if (!data) throw new HttpError(409, 'Dokument został w międzyczasie zmieniony. Odśwież stronę.');
  return data as unknown as DocumentRow;
}

export function downloadName(originalFilename: string): string {
  const base = originalFilename.replace(/\.[^.]+$/, '').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'dokument';
  return `${base}_NutriPartners.pdf`;
}
