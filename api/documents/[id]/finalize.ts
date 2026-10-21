//   POST /api/documents/:id/finalize → { document, outputUrl }
//
// Renders the reviewed document on the Nutri Partners letterhead and stores the PDF. Only possible when every
// warning has been acknowledged or corrected.

import { toPrintable } from '../../../shared/printable.js';
import { requireUser } from '../../_lib/auth.js';
import { downloadName, ensureOutputName, loadDocument, logEvent, openWarnings, saveDocument, toPublic } from '../../_lib/documents.js';
import { HttpError, documentId, handle, json } from '../../_lib/http.js';
import { lostCharacters, missingGlyphs, renderPdf } from '../../_lib/pdf/render.js';
import { OUTPUTS, db } from '../../_lib/supabase.js';
import { logError } from '../../_lib/monitoring.js';

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const profile = await requireUser(request);
    const loaded = await loadDocument(documentId(request), profile);
    if (loaded.status !== 'review' || !loaded.extraction) throw new HttpError(409, 'The document is not ready to be generated.');
    const open = openWarnings(loaded.warnings);
    if (open > 0) throw new HttpError(409, `Resolve all warnings first (${open} left).`);

    const printable = toPrintable(loaded.extraction, { productName: loaded.np_product_name, productCode: loaded.np_product_code });
    if (!printable.blocks.length) throw new HttpError(409, 'After neutralization the document has no content.');
    const missing = missingGlyphs(printable);
    if (missing.length) {
      throw new HttpError(422, `The PDF cannot contain these characters: ${missing.slice(0, 20).join(' ')} (no font for them). Report this to your administrator.`);
    }
    const row = await ensureOutputName(loaded);
    const pdf = await renderPdf({ printable, reference: row.output_name });
    // The PDF is read back before it is stored: a binding document must never lose a character on the way to paper.
    const lost = await lostCharacters(pdf, printable);
    if (lost.length) {
      // Only the count: the characters are document content.
      logError('finalize.lostCharacters', new Error('Characters lost in the generated PDF'), { documentId: row.id, lost: lost.length });
      throw new HttpError(422, `Characters are missing from the generated PDF: ${lost.slice(0, 20).join(' ')}. The file was not saved. Report this to your administrator.`);
    }

    const path = `${row.owner_id}/${row.id}/${row.output_name}_${Date.now()}.pdf`;
    const { error: uploadError } = await db().storage.from(OUTPUTS).upload(path, pdf, { contentType: 'application/pdf' });
    if (uploadError) throw uploadError;
    const saved = await saveDocument(row, { status: 'done', output_path: path, finalized_at: new Date().toISOString(), finalized_by: profile.id });
    // Earlier versions stay in storage; the event log keeps the path of every generated file.
    await logEvent(row.id, profile.id, 'finalize', { path, name: row.output_name, bytes: pdf.length, illegible: printable.illegible.length });

    const { data } = await db().storage.from(OUTPUTS).createSignedUrl(path, 15 * 60, { download: downloadName(saved) });
    return json({ document: toPublic(saved), outputUrl: data?.signedUrl ?? null });
  });
}
