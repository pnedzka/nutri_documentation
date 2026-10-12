//   POST /api/documents/:id/finalize → { document, outputUrl }
//
// Renders the reviewed document on the Nutri Partners letterhead and stores the PDF. Only possible when every
// warning has been acknowledged or corrected.

import { toPrintable } from '../../../shared/printable.js';
import { requireUser } from '../../_lib/auth.js';
import { downloadName, loadDocument, logEvent, openWarnings, saveDocument, toPublic } from '../../_lib/documents.js';
import { HttpError, documentId, handle, json } from '../../_lib/http.js';
import { lostCharacters, missingGlyphs, renderPdf } from '../../_lib/pdf/render.js';
import { OUTPUTS, db } from '../../_lib/supabase.js';

export function POST(request: Request): Promise<Response> {
  return handle(async () => {
    const profile = await requireUser(request);
    const row = await loadDocument(documentId(request), profile);
    if (row.status !== 'review' || !row.extraction) throw new HttpError(409, 'Dokument nie jest gotowy do wygenerowania.');
    const open = openWarnings(row.warnings);
    if (open > 0) throw new HttpError(409, `Najpierw rozpatrz wszystkie ostrzeżenia (pozostało: ${open}).`);

    const printable = toPrintable(row.extraction, { productName: row.np_product_name, productCode: row.np_product_code });
    if (!printable.blocks.length) throw new HttpError(409, 'Po neutralizacji dokument nie zawiera żadnej treści.');
    const missing = missingGlyphs(printable);
    if (missing.length) {
      throw new HttpError(422, `PDF nie może zawierać znaków: ${missing.slice(0, 20).join(' ')} (brak czcionki). Zgłoś administratorowi.`);
    }
    const pdf = await renderPdf({ printable, reference: row.id.slice(0, 8).toUpperCase() });
    // The PDF is read back before it is stored: a binding document must never lose a character on the way to paper.
    const lost = await lostCharacters(pdf, printable);
    if (lost.length) {
      console.error('[finalize] characters lost in the PDF', row.id, lost);
      throw new HttpError(422, `W wygenerowanym PDF brakuje znaków: ${lost.slice(0, 20).join(' ')}. Plik nie został zapisany. Zgłoś administratorowi.`);
    }

    const path = `${row.owner_id}/${row.id}/${Date.now()}.pdf`;
    const { error: uploadError } = await db().storage.from(OUTPUTS).upload(path, pdf, { contentType: 'application/pdf' });
    if (uploadError) throw uploadError;
    const saved = await saveDocument(row, { status: 'done', output_path: path, finalized_at: new Date().toISOString(), finalized_by: profile.id });
    // Earlier versions stay in storage; the event log keeps the path of every generated file.
    await logEvent(row.id, profile.id, 'finalize', { path, bytes: pdf.length, illegible: printable.illegible.length });

    const { data } = await db().storage.from(OUTPUTS).createSignedUrl(path, 15 * 60, { download: downloadName(row.original_filename) });
    return json({ document: toPublic(saved), outputUrl: data?.signedUrl ?? null });
  });
}
