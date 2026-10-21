import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import type { Extraction } from '../../shared/schema.js';

const calls: { system: string; text: string }[] = [];
let respond: (system: string, text: string) => unknown;

vi.mock('./claude.js', async (original) => {
  const actual = await original<typeof import('./claude.js')>();
  return {
    ...actual,
    structuredCall: vi.fn(async ({ system, content }: { system: string; content: { type: string; text?: string }[] }) => {
      const text = content.filter((c) => c.type === 'text').map((c) => c.text).join('\n');
      calls.push({ system, text });
      return respond(system, text);
    }),
  };
});

const { processFile } = await import('./pipeline.js');
const { TRANSCRIPTION_SYSTEM } = await import('./prompts.js');

async function makePdf(pages: string[][]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  for (const lines of pages) {
    const page = doc.addPage([595, 842]);
    lines.forEach((line, i) => page.drawText(line, { x: 50, y: 780 - i * 16, size: 11, font }));
  }
  return doc.save();
}

const t = (text: string) => ({ kind: 'text', text, category: null, reason: null });

beforeEach(() => {
  calls.length = 0;
});

describe('processFile', () => {
  it('transcribes a text PDF part by part and verifies it against the text layer', async () => {
    const pages = Array.from({ length: 4 }, (_, i) => [`Section ${i + 1}`, `Moisture max. ${i + 1}.0 %`]);
    respond = (_system, text) => {
      const start = Number(text.match(/number pages from (\d+)/)?.[1] ?? 1);
      const count = Number(text.match(/contains (\d+) page/)?.[1] ?? 1);
      const blocks = Array.from({ length: count }, (_, k) => {
        const n = start + k;
        // The model numbers pages within its part (1..count); the pipeline must correct that.
        // Page 4 gets a wrong value to prove the check works.
        const value = n === 4 ? 'max. 9.0 %' : `max. ${n}.0 %`;
        return { id: 'x', type: 'key_value', page: k + 1, level: null, runs: null, items: null, header: null, body: null, rows: [{ key: [t('Moisture')], value: [t(value)] }] };
      });
      const headings = Array.from({ length: count }, (_, k) => ({ id: 'h', type: 'heading', page: k + 1, level: 2, runs: [t(`Section ${start + k}`)], items: null, rows: null, header: null, body: null }));
      return { language: 'en', page_count: count, document_type: start === 1 ? 'CoA' : 'Doc', notes: [], blocks: headings.flatMap((h, k) => [h, blocks[k]]) } satisfies Record<string, unknown>;
    };
    const result = await processFile(await makePdf(pages), 'application/pdf');
    expect(calls.every((c) => c.system === TRANSCRIPTION_SYSTEM)).toBe(true);
    expect(calls).toHaveLength(2);
    expect(result.source.kind).toBe('text_pdf');
    // The first part holds the title page.
    expect(result.extraction.document_type).toBe('CoA');
    expect(result.extraction.blocks.map((b) => b.page)).toEqual([1, 1, 2, 2, 3, 3, 4, 4]);
    expect(new Set(result.extraction.blocks.map((b) => b.id)).size).toBe(8);
    const kinds = result.warnings.map((w) => `${w.kind}@${w.page}`);
    expect(kinds).toContain('unverified@4');
    expect(kinds).toContain('possibly_omitted@4');
    expect(result.warnings.every((w) => w.id && w.status === 'open')).toBe(true);
  });

  it('confirms a scan with a second, independent reading', async () => {
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    respond = (system) =>
      system === TRANSCRIPTION_SYSTEM
        ? ({
            language: 'en',
            page_count: 1,
            notes: [],
            blocks: [
              { id: 'b1', type: 'key_value', page: 1, level: null, runs: null, items: null, header: null, body: null, rows: [{ key: [t('Lead')], value: [t('< 0.02 mg/kg')] }, { key: [t('Ash')], value: [t('8.2 %')] }] },
            ],
          } satisfies Record<string, unknown>)
        : { pages: [{ page: 1, text: 'Lead < 0.02 mg/kg\nAsh 8.7 %' }] };
    const result = await processFile(new Uint8Array(png), 'image/png');
    expect(calls).toHaveLength(2);
    expect(result.source.kind).toBe('image');
    const uncertain = result.warnings.filter((w) => w.kind === 'uncertain');
    expect(uncertain).toHaveLength(1);
    expect(uncertain[0].message).toContain('8.2');
  });

  it('cleans up malformed model output', async () => {
    respond = () => ({
      language: 'EN-gb',
      page_count: 1,
      document_type: 'Invoice',
      notes: ['  '],
      blocks: [
        {
          id: 'z',
          type: 'heading',
          page: 7,
          level: 9,
          runs: [
            { kind: 'redact', text: 'ACME', category: 'bogus', reason: '' },
            { kind: 'text', text: ' 水分', category: null, reason: null, en: ' Moisture', en_how: 'translated' },
            { kind: 'text', text: ' 4%', category: null, reason: null, en: ' 4 %', en_how: 'same' },
            { kind: 'text', text: ' 灰分', category: null, reason: null, en: 'Ash', en_how: 'duplicate' },
            { kind: 'text', text: ' x', category: null, reason: null, en: 'y', en_how: 'bogus' },
          ],
          items: null,
          rows: null,
          header: null,
          body: null,
        },
        { id: 'z', type: 'unknown', page: 1 },
      ],
    });
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
    const { extraction } = await processFile(new Uint8Array(png), 'image/png');
    expect(extraction.language).toBe('en');
    expect(extraction.notes).toEqual([]);
    expect(extraction.document_type).toBe('Doc');
    expect(extraction.blocks).toHaveLength(1);
    const block = extraction.blocks[0] as Extraction['blocks'][number];
    expect(block).toMatchObject({ id: 'b1', page: 1, level: 3 });
    expect(block.runs).toEqual([
      { kind: 'redact', text: 'ACME', category: 'supplier_identity', reason: null, en: null, en_how: 'same' },
      { kind: 'text', text: ' 水分', category: null, reason: null, en: ' Moisture', en_how: 'translated' },
      // "same" prints the transcription, "duplicate" prints nothing, an unknown mode falls back to "same".
      { kind: 'text', text: ' 4%', category: null, reason: null, en: null, en_how: 'same' },
      { kind: 'text', text: ' 灰分', category: null, reason: null, en: '', en_how: 'duplicate' },
      { kind: 'text', text: ' x', category: null, reason: null, en: null, en_how: 'same' },
    ]);
  });
});
