// One document.
//
//   GET    /api/documents/:id   → { document, originalUrl, outputUrl, events }
//   PATCH  /api/documents/:id   body ReviewAction | { action: 'products', npProductName, npProductCode } | { action: 'type', documentType }
//                               | { action: 'reopen' }
//                               → { document }
//   DELETE /api/documents/:id   → { ok: true }   (owner before finalization, or administrator)

import { applyReview, ReviewError, type ReviewAction } from '../../shared/review.js';
import { REDACTION_CATEGORIES, isDocumentType } from '../../shared/schema.js';
import { requireUser } from '../_lib/auth.js';
import { downloadName, loadDocument, logEvent, saveDocument, toPublic } from '../_lib/documents.js';
import { HttpError, documentId, handle, json, readJson } from '../_lib/http.js';
import { ORIGINALS, OUTPUTS, db } from '../_lib/supabase.js';

const URL_TTL_SECONDS = 15 * 60;

export function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const profile = await requireUser(request);
    const row = await loadDocument(documentId(request), profile);
    const original = await db().storage.from(ORIGINALS).createSignedUrl(row.original_path, URL_TTL_SECONDS);
    const output = row.output_path
      ? await db().storage.from(OUTPUTS).createSignedUrl(row.output_path, URL_TTL_SECONDS, { download: downloadName(row) })
      : null;
    const { data: events } = await db()
      .from('document_events')
      .select('id, kind, payload, created_at, actor:profiles(email, full_name)')
      .eq('document_id', row.id)
      .order('created_at', { ascending: false })
      .limit(200);
    return json({
      document: toPublic(row),
      originalUrl: original.data?.signedUrl ?? null,
      outputUrl: output?.data?.signedUrl ?? null,
      events: events ?? [],
    });
  });
}

type PatchBody =
  | ReviewAction
  | { action: 'products'; npProductName?: unknown; npProductCode?: unknown }
  | { action: 'type'; documentType?: unknown }
  | { action: 'reopen' };

const isRef = (v: unknown) => {
  const r = v as { blockId?: unknown; cell?: unknown; run?: unknown } | null;
  return !!r && typeof r.blockId === 'string' && Array.isArray(r.cell) && r.cell.every(Number.isInteger) && Number.isInteger(r.run);
};

const clean = (value: unknown, max: number) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);

export function PATCH(request: Request): Promise<Response> {
  return handle(async () => {
    const profile = await requireUser(request);
    const row = await loadDocument(documentId(request), profile);
    const body = await readJson<PatchBody>(request);

    if (body.action === 'reopen') {
      if (row.status !== 'done') throw new HttpError(409, 'The document is not done.');
      const saved = await saveDocument(row, { status: 'review' });
      await logEvent(row.id, profile.id, 'reopen');
      return json({ document: toPublic(saved) });
    }

    if (row.status !== 'review') throw new HttpError(409, 'The document can only be changed while it is in review.');
    if (!row.extraction || !row.warnings) throw new HttpError(409, 'The document has not been processed yet.');

    if (body.action === 'products') {
      const changes = { np_product_name: clean(body.npProductName, 200), np_product_code: clean(body.npProductCode, 100) };
      const saved = await saveDocument(row, changes);
      await logEvent(row.id, profile.id, 'products', { before: { np_product_name: row.np_product_name, np_product_code: row.np_product_code }, after: changes });
      return json({ document: toPublic(saved) });
    }

    if (body.action === 'type') {
      if (!isDocumentType(body.documentType)) throw new HttpError(400, 'Invalid document type.');
      // The name may already have been sent to someone, so it does not change with the type.
      if (row.output_name) throw new HttpError(409, `The PDF already has its name (${row.output_name}).`);
      const saved = await saveDocument(row, { document_type: body.documentType });
      await logEvent(row.id, profile.id, 'type', { before: row.document_type, after: body.documentType });
      return json({ document: toPublic(saved) });
    }

    // Validate the shape before it reaches the review logic.
    switch (body.action) {
      case 'ack':
        if (!Array.isArray(body.warningIds) || !body.warningIds.length || !body.warningIds.every((id) => typeof id === 'string'))
          throw new HttpError(400, 'Invalid warnings.');
        break;
      case 'edit':
        if (!isRef(body.ref) || typeof body.text !== 'string') throw new HttpError(400, 'Invalid correction.');
        break;
      case 'restore':
        if (!isRef(body.ref)) throw new HttpError(400, 'Invalid fragment.');
        break;
      case 'redact':
        if (!isRef(body.ref) || !REDACTION_CATEGORIES.includes(body.category)) throw new HttpError(400, 'Invalid fragment.');
        break;
      case 'insert':
        if ((body.afterBlockId !== null && typeof body.afterBlockId !== 'string') || typeof body.text !== 'string' || !Number.isFinite(body.page))
          throw new HttpError(400, 'Invalid text to add.');
        break;
      default:
        throw new HttpError(400, 'Unknown operation.');
    }

    try {
      const result = applyReview(row.extraction, row.warnings, body, profile.id);
      const saved = await saveDocument(row, { extraction: result.extraction, warnings: result.warnings });
      await logEvent(row.id, profile.id, result.event.kind, result.event.payload);
      return json({ document: toPublic(saved) });
    } catch (error) {
      if (error instanceof ReviewError) throw new HttpError(409, error.message);
      throw error;
    }
  });
}

export function DELETE(request: Request): Promise<Response> {
  return handle(async () => {
    const profile = await requireUser(request);
    const row = await loadDocument(documentId(request), profile);
    if (profile.role !== 'admin' && row.status === 'done') {
      throw new HttpError(403, 'Only an administrator can delete a document that is done.');
    }
    if (row.status === 'processing') throw new HttpError(409, 'Wait until processing has finished.');
    await db().storage.from(ORIGINALS).remove([row.original_path]);
    if (row.output_path) await db().storage.from(OUTPUTS).remove([row.output_path]);
    const { error } = await db().from('documents').delete().eq('id', row.id);
    if (error) throw error;
    return json({ ok: true });
  });
}
