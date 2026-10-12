// Prepares an uploaded file for the model and for the deterministic checks:
// - the source text the transcription is verified against (PDF text layer, DOCX text), when there is one,
// - the content blocks sent to Claude, split into parts of a few pages so long PDFs are read in parallel.

import mammoth from 'mammoth';
import { PDFDocument } from 'pdf-lib';
import { extractText, getDocumentProxy } from 'unpdf';
import type { SourceKind } from '../../shared/schema.js';
import { PipelineError, type UserContent } from './claude.js';

/** Pages per model request. Small parts keep every request well inside the function time limit. */
export const PAGES_PER_PART = 3;
/** A page with less text than this is treated as scanned. */
const MIN_PAGE_TEXT = 20;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_DOCX_IMAGES = 20;

export interface SourcePart {
  /** Index of the first page of this part in the whole document (0-based). */
  offset: number;
  pageCount: number | null;
  content: UserContent;
}

export interface PreparedSource {
  kind: SourceKind;
  pageCount: number | null;
  /** Text per page to verify the transcription against; null for scans and photos. */
  sourcePages: string[] | null;
  parts: SourcePart[];
  /** Things the user should know about the conversion (Polish). */
  notes: string[];
}

const pdfBlock = (data: Uint8Array): UserContent[number] => ({
  type: 'document',
  source: { type: 'base64', media_type: 'application/pdf', data: Buffer.from(data).toString('base64') },
});

export async function preparePdf(data: Uint8Array): Promise<PreparedSource> {
  let pages: string[];
  let totalPages: number;
  try {
    const pdf = await getDocumentProxy(new Uint8Array(data));
    ({ text: pages, totalPages } = await extractText(pdf, { mergePages: false }));
  } catch {
    throw new PipelineError('Nie udało się otworzyć pliku PDF (uszkodzony lub zabezpieczony hasłem).');
  }
  const scanned = pages.some((p) => p.replace(/\s+/g, '').length < MIN_PAGE_TEXT);

  const parts: SourcePart[] = [];
  if (totalPages <= PAGES_PER_PART) {
    parts.push({ offset: 0, pageCount: totalPages, content: [pdfBlock(data)] });
  } else {
    const source = await PDFDocument.load(data, { ignoreEncryption: true });
    for (let offset = 0; offset < totalPages; offset += PAGES_PER_PART) {
      const part = await PDFDocument.create();
      const indices = Array.from({ length: Math.min(PAGES_PER_PART, totalPages - offset) }, (_, i) => offset + i);
      for (const page of await part.copyPages(source, indices)) part.addPage(page);
      parts.push({ offset, pageCount: indices.length, content: [pdfBlock(await part.save())] });
    }
  }
  return {
    kind: scanned ? 'scan' : 'text_pdf',
    pageCount: totalPages,
    // A partly scanned PDF is verified like a scan (second reading) because the text layer misses pages.
    sourcePages: scanned ? null : pages,
    parts,
    notes: [],
  };
}

export async function prepareDocx(data: Uint8Array): Promise<PreparedSource> {
  const buffer = Buffer.from(data);
  const images: { mediaType: string; data: string }[] = [];
  const notes: string[] = [];
  let html: string;
  let raw: string;
  try {
    html = (
      await mammoth.convertToHtml(
        { buffer },
        {
          convertImage: mammoth.images.imgElement(async (image) => {
            const bytes = await image.readAsBuffer();
            if (!IMAGE_TYPES.has(image.contentType) || bytes.length > MAX_IMAGE_BYTES || images.length >= MAX_DOCX_IMAGES) {
              notes.push(`Obraz osadzony w dokumencie Word (${image.contentType}) nie mógł zostać odczytany – sprawdź go ręcznie.`);
              return { src: 'pominięty-obraz' };
            }
            images.push({ mediaType: image.contentType, data: bytes.toString('base64') });
            return { src: `obraz-${images.length}` };
          }),
        },
      )
    ).value;
    raw = (await mammoth.extractRawText({ buffer })).value;
  } catch {
    throw new PipelineError('Nie udało się odczytać pliku Word (DOCX).');
  }
  notes.push('Nagłówki i stopki stron dokumentu Word nie są odczytywane – jeśli zawierały dane techniczne, sprawdź je ręcznie.');
  // Each picture is preceded by its label so the model can match <img src="obraz-N"> to the right image.
  const content: UserContent = images.flatMap((img, i): UserContent => [
    { type: 'text', text: `Obraz „obraz-${i + 1}” z dokumentu:` },
    { type: 'image', source: { type: 'base64', media_type: img.mediaType as 'image/png', data: img.data } },
  ]);
  content.push({
    type: 'text',
    text: `Treść dokumentu Word przekonwertowana do HTML (tabele jako <table>, obrazy jako <img src="obraz-N">). Page numbers do not exist in this format: use page 1 for every block.\n\n${html}`,
  });
  return { kind: 'docx', pageCount: 1, sourcePages: [raw], parts: [{ offset: 0, pageCount: null, content }], notes };
}

export function prepareImage(data: Uint8Array, mimeType: string): PreparedSource {
  if (!IMAGE_TYPES.has(mimeType)) throw new PipelineError('Nieobsługiwany format obrazu.');
  if (data.length > MAX_IMAGE_BYTES) throw new PipelineError('Zdjęcie jest większe niż 5 MB. Wgraj je ponownie – aplikacja je zmniejszy.');
  return {
    kind: 'image',
    pageCount: 1,
    sourcePages: null,
    parts: [
      {
        offset: 0,
        pageCount: 1,
        content: [{ type: 'image', source: { type: 'base64', media_type: mimeType as 'image/png', data: Buffer.from(data).toString('base64') } }],
      },
    ],
    notes: [],
  };
}

export async function prepareSource(data: Uint8Array, mimeType: string): Promise<PreparedSource> {
  if (mimeType === 'application/pdf') return preparePdf(data);
  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') return prepareDocx(data);
  if (mimeType.startsWith('image/')) return prepareImage(data, mimeType);
  throw new PipelineError('Nieobsługiwany typ pliku.');
}
