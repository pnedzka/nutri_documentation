//   POST /api/documents/:id/process → 202 { document }
//
// Starts (or restarts) the transcription. The response returns right away; the work continues in the background
// (waitUntil) and the client polls GET /api/documents/:id until the status leaves "processing".
// Restarting discards the previous transcription and every review decision made on it.

import { waitUntil } from '@vercel/functions';
import { requireUser } from '../../_lib/auth.js';
import { PipelineError, MODEL } from '../../_lib/claude.js';
import { loadDocument, logEvent, saveDocument, toPublic, type DocumentRow } from '../../_lib/documents.js';
import { HttpError, documentId, handle, json } from '../../_lib/http.js';
import { processFile } from '../../_lib/pipeline.js';
import { ORIGINALS, db } from '../../_lib/supabase.js';

async function run(row: DocumentRow, actorId: string) {
  const started = Date.now();
  try {
    const { data: file, error } = await db().storage.from(ORIGINALS).download(row.original_path);
    if (error || !file) throw new PipelineError('The uploaded file was not found. Upload the document again.');
    const result = await processFile(new Uint8Array(await file.arrayBuffer()), row.mime_type);
    await db()
      .from('documents')
      .update({
        status: 'review',
        source_kind: result.source.kind,
        page_count: result.source.pageCount,
        extraction: result.extraction,
        warnings: result.warnings,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);
    await logEvent(row.id, actorId, 'processed', {
      model: MODEL,
      seconds: Math.round((Date.now() - started) / 1000),
      sourceKind: result.source.kind,
      blocks: result.extraction.blocks.length,
      warnings: result.warnings.length,
    });
  } catch (error) {
    console.error('processing failed', row.id, error);
    const message = error instanceof PipelineError ? error.message : 'Processing failed. Try again.';
    await db().from('documents').update({ status: 'error', error_message: message, updated_at: new Date().toISOString() }).eq('id', row.id);
    await logEvent(row.id, actorId, 'processing_failed', { message });
  }
}

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const profile = await requireUser(request);
    const row = await loadDocument(documentId(request), profile);
    if (row.status === 'processing') throw new HttpError(409, 'The document is already being processed.');
    if (row.status === 'done') throw new HttpError(409, 'The document is done. Reopen it for review first.');
    const saved = await saveDocument(row, {
      status: 'processing',
      processing_started_at: new Date().toISOString(),
      error_message: null,
      extraction: null,
      warnings: null,
      model: MODEL,
    });
    await logEvent(row.id, profile.id, row.status === 'uploaded' ? 'process' : 'reprocess');
    waitUntil(run(saved, profile.id));
    return json({ document: toPublic(saved) }, 202);
  });
}
