import { describe, expect, it } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { PAGES_PER_PART, preparePdf, prepareSource } from './extract.js';

async function makePdf(pages: string[][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = doc.addPage([595, 842]);
    lines.forEach((line, i) => page.drawText(line, { x: 50, y: 780 - i * 16, size: 11, font }));
  }
  return doc.save();
}

describe('preparePdf', () => {
  it('reads the text layer and splits long documents into parts', async () => {
    const pages = Array.from({ length: PAGES_PER_PART + 2 }, (_, i) => [`PRODUCT SPECIFICATION page ${i + 1}`, 'Moisture max. 4.0 %', 'Protein min. 34.0 %']);
    const source = await preparePdf(await makePdf(pages));
    expect(source.kind).toBe('text_pdf');
    expect(source.pageCount).toBe(PAGES_PER_PART + 2);
    expect(source.sourcePages?.[0]).toContain('Moisture max. 4.0 %');
    expect(source.sourcePages?.[0].split('\n').length).toBeGreaterThanOrEqual(3);
    expect(source.parts.map((p) => [p.offset, p.pageCount])).toEqual([
      [0, PAGES_PER_PART],
      [PAGES_PER_PART, 2],
    ]);
    const second = await PDFDocument.load(Buffer.from((source.parts[1].content[0] as { source: { data: string } }).source.data, 'base64'));
    expect(second.getPageCount()).toBe(2);
  });

  it('treats a PDF with an empty page as a scan', async () => {
    const source = await preparePdf(await makePdf([['Some text on the first page of the document'], []]));
    expect(source.kind).toBe('scan');
    expect(source.sourcePages).toBeNull();
  });

  it('rejects unsupported files', async () => {
    await expect(prepareSource(new Uint8Array([1, 2, 3]), 'text/plain')).rejects.toThrow('Nieobsługiwany');
    await expect(preparePdf(new Uint8Array([1, 2, 3]))).rejects.toThrow('PDF');
  });
});

describe('prepareDocx', () => {
  it('converts the document to HTML for the model and keeps its text for verification', async () => {
    const { readFile } = await import('node:fs/promises');
    const data = new Uint8Array(await readFile(new URL('./fixtures/spec.docx', import.meta.url)));
    const source = await prepareSource(data, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(source.kind).toBe('docx');
    expect(source.sourcePages?.[0]).toContain('max. 4.0 %');
    const html = source.parts[0].content.at(-1) as { type: string; text: string };
    expect(html.type).toBe('text');
    expect(html.text).toContain('<table>');
    expect(html.text).toContain('Milchstraße');
  });
});
