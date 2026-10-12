// Documents of the signed-in user (or of everyone, for an administrator).
//
//   GET  /api/documents             → { documents: DocumentSummary[] }   own documents
//   GET  /api/documents?scope=all   → { documents: DocumentSummary[] }   all documents with owners (admin)
//   POST /api/documents             body { filename, mimeType, size, npProductName?, npProductCode? }
//                                   → { document, upload: { path, token } }  signed upload to Supabase Storage
//
// The file goes straight from the browser to Storage (the upload token), so it is not limited by the size of a
// function request body. Processing starts with POST /api/documents/:id/process once the upload has finished.

import { ACCEPTED_TYPES, MAX_UPLOAD_BYTES } from '../../shared/schema.js';
import { requireUser } from '../_lib/auth.js';
import { DOCUMENT_COLUMNS, OWNER_JOIN, failIfStale, toPublic, toSummary, type DocumentRow } from '../_lib/documents.js';
import { HttpError, handle, json, readJson } from '../_lib/http.js';
import { ORIGINALS, db, ensureBuckets } from '../_lib/supabase.js';

export function GET(request: Request): Promise<Response> {
  return handle(async () => {
    const profile = await requireUser(request);
    const all = new URL(request.url).searchParams.get('scope') === 'all';
    if (all && profile.role !== 'admin') throw new HttpError(403, 'Ta lista jest dostępna tylko dla administratora.');
    let query = db().from('documents').select(`${DOCUMENT_COLUMNS}, ${OWNER_JOIN}`).order('created_at', { ascending: false }).limit(500);
    if (!all) query = query.eq('owner_id', profile.id);
    const { data, error } = await query;
    if (error) throw error;
    const rows = await Promise.all((data as unknown as DocumentRow[]).map(failIfStale));
    return json({ documents: rows.map(toSummary) });
  });
}

const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

const clean = (value: unknown, max: number) => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const profile = await requireUser(request);
    const body = await readJson<{ filename?: unknown; mimeType?: unknown; size?: unknown; npProductName?: unknown; npProductCode?: unknown }>(request);
    const filename = clean(body.filename, 200);
    const mimeType = typeof body.mimeType === 'string' ? body.mimeType : '';
    const size = typeof body.size === 'number' ? body.size : 0;
    if (!filename) throw new HttpError(400, 'Brak nazwy pliku.');
    if (!ACCEPTED_TYPES[mimeType]) throw new HttpError(400, 'Obsługiwane są pliki PDF, DOCX, JPG i PNG.');
    if (size <= 0 || size > MAX_UPLOAD_BYTES) throw new HttpError(400, `Plik może mieć najwyżej ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`);

    await ensureBuckets();
    const id = crypto.randomUUID();
    const path = `${profile.id}/${id}/original.${EXTENSIONS[mimeType]}`;
    const { data: upload, error: uploadError } = await db().storage.from(ORIGINALS).createSignedUploadUrl(path);
    if (uploadError) throw uploadError;

    const { data, error } = await db()
      .from('documents')
      .insert({
        id,
        owner_id: profile.id,
        original_filename: filename,
        original_path: path,
        mime_type: mimeType,
        size_bytes: size,
        status: 'uploaded',
        np_product_name: clean(body.npProductName, 200),
        np_product_code: clean(body.npProductCode, 100),
      })
      .select(`${DOCUMENT_COLUMNS}, ${OWNER_JOIN}`)
      .single();
    if (error) throw error;
    return json({ document: toPublic(data as unknown as DocumentRow), upload: { path: upload.path, token: upload.token } }, 201);
  });
}
