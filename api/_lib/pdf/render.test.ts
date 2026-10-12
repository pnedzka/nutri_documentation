import { writeFileSync } from 'node:fs';
import { extractText } from 'unpdf';
import { describe, expect, it } from 'vitest';
import { missingGlyphs, renderPdf } from './render.js';
import { toPrintable } from '../../../shared/printable.js';
import type { Block, Extraction, Run } from '../../../shared/schema.js';

const t = (text: string): Run => ({ kind: 'text', text, category: null, reason: null });
const b = (p: Partial<Block> & Pick<Block, 'type'>, id: string): Block => ({
  id, page: 1, level: null, runs: null, items: null, rows: null, header: null, body: null, ...p,
});

export const SAMPLE: Extraction = {
  language: 'pl',
  page_count: 1,
  notes: [],
  blocks: [
    b({ type: 'heading', level: 1, runs: [t('SPECYFIKACJA PRODUKTU')] }, 'b1'),
    b({ type: 'paragraph', runs: [t('Mleko w proszku odtłuszczone '), { kind: 'redact', text: 'ACME-SMP 26', category: 'trade_name', reason: 'nazwa handlowa' }, t(', źródło: zażółć gęślą jaźń.')] }, 'b2'),
    b({ type: 'heading', level: 2, runs: [t('Parametry fizykochemiczne')] }, 'b3'),
    b({
      type: 'key_value',
      rows: [
        { key: [t('Wilgotność')], value: [t('maks. 4,0 %')] },
        { key: [t('Białko (N × 6,38)')], value: [t('min. 34,0 %')] },
        { key: [t('Ołów (Pb)')], value: [t('≤ 0,'), { kind: 'illegible', text: '0', category: null, reason: 'rozmazana cyfra' }, t(' mg/kg')] },
      ],
    }, 'b4'),
    b({
      type: 'table',
      header: [[[t('Parametr')], [t('Wymaganie')], [t('Metoda')], [t('Cena')]]],
      body: [
        [[t('Salmonella')], [t('nieobecna w 25 g')], [t('ISO 6579-1')], [{ kind: 'redact', text: '2,50 EUR', category: 'commercial_terms', reason: 'cena' }]],
        [[t('Enterobacteriaceae')], [t('< 10 jtk/g')], [t('ISO 21528-2')], [{ kind: 'redact', text: '2,60 EUR', category: 'commercial_terms', reason: 'cena' }]],
      ],
    }, 'b5'),
    b({ type: 'list', items: [[t('Przechowywać w suchym miejscu, temp. < 25 °C.')], [t('Okres przydatności: 24 miesiące.')]] }, 'b6'),
    b({ type: 'note', runs: [t('* Wartości typowe.')] }, 'b7'),
  ],
};

describe('renderPdf', () => {
  it('renders the letterhead document', async () => {
    const pdf = await renderPdf({ printable: toPrintable(SAMPLE, { productName: 'NP SMP 34', productCode: null }), language: 'pl', reference: 'ab12cd34' });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, pdf);
  }, 30_000);

  it('keeps Chinese characters next to Latin text', async () => {
    const cjk: Extraction = {
      ...SAMPLE,
      language: 'en',
      blocks: [
        b({ type: 'heading', level: 1, runs: [t('分析报告 CERTIFICATE OF ANALYSIS')] }, 'c1'),
        b({ type: 'key_value', rows: [{ key: [t('外观 Appearance')], value: [t('白色粉末 white powder')] }] }, 'c2'),
      ],
    };
    const printable = toPrintable(cjk, { productName: null, productCode: null });
    expect(missingGlyphs(printable)).toEqual([]);
    const pdf = await renderPdf({ printable, language: 'en', reference: 'ab12cd34' });
    const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
    const compact = text.replace(/\s+/g, '');
    expect(compact).toContain('分析报告');
    expect(compact).toContain('白色粉末');
    expect(text).toContain('CERTIFICATE');
  }, 30_000);
});

describe('missingGlyphs', () => {
  it('lists characters no PDF font can draw', () => {
    const printable = toPrintable(
      { ...SAMPLE, blocks: [b({ type: 'paragraph', runs: [t('Zażółć 한글 ≤ 0,5 µg\u00ad\u200b')] }, 'k1')] },
      { productName: null, productCode: null },
    );
    expect(missingGlyphs(printable)).toEqual(['한', '글']);
  });

  it('accepts the Polish sample', () => {
    expect(missingGlyphs(toPrintable(SAMPLE, { productName: 'NP SMP 34', productCode: null }))).toEqual([]);
  });
});
