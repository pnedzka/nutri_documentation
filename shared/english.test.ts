import { describe, expect, it } from 'vitest';
import type { Block, EnHow, Extraction, Run } from './schema.js';
import { englishWarnings } from './verify.js';
import { halfWidth, toPrintable } from './printable.js';
import { applyReview } from './review.js';

const en = (text: string, how: EnHow, english: string | null = null): Run => ({ kind: 'text', text, category: null, reason: null, en: english, en_how: how });

const doc = (...runs: Run[][]): Extraction => ({
  language: 'zh',
  page_count: 1,
  notes: [],
  blocks: runs.map((r, i): Block => ({ id: `b${i + 1}`, type: 'paragraph', page: 1, level: null, runs: r, items: null, rows: null, header: null, body: null })),
});

const kinds = (extraction: Extraction) => englishWarnings(extraction).map((w) => [w.kind, w.message]);

describe('englishWarnings', () => {
  it('accepts English text and the English part of a bilingual text', () => {
    expect(kinds(doc([en('Moisture max. 4.0 %', 'same')], [en('产品名称：\nProduct name：', 'english_part', 'Product name:')]))).toEqual([]);
  });

  it('skips documents processed before the English version existed', () => {
    expect(kinds(doc([{ kind: 'text', text: '水分', category: null, reason: null }]))).toEqual([]);
  });

  it('flags an "English part" that is not in the original', () => {
    const w = kinds(doc([en('产品名称：\nProduct name：', 'english_part', 'Product description:')]));
    expect(w).toHaveLength(1);
    expect(w[0][0]).toBe('english_check');
    expect(w[0][1]).toContain('nie występuje w oryginale');
  });

  it('asks to confirm every translation and spelling correction', () => {
    const w = kinds(doc([en('未检出', 'translated', 'Not detected')], [en('CERTIFICATE OF ANALAYSIS', 'corrected', 'CERTIFICATE OF ANALYSIS')]));
    expect(w.map((x) => x[0])).toEqual(['translated', 'english_check']);
    expect(w[1][1]).toContain('ANALAYSIS” → „CERTIFICATE OF ANALYSIS');
  });

  it('flags translations that change numbers or symbols', () => {
    const w = kinds(doc([en('水分 ≤ 4,0 %', 'translated', 'Moisture < 4.0 %')]));
    expect(w.map((x) => x[0])).toEqual(['translated', 'english_check']);
    expect(w[1][1]).toContain('brak: 4,0, ≤; dodane: 4.0, <');
  });

  it('accepts full-width symbols written in ASCII', () => {
    expect(kinds(doc([en('＜1 ppm（铅）', 'english_part', '<1 ppm')]))).toEqual([]);
  });

  it('flags text that is printed but not in English', () => {
    const w = kinds(doc([en('水分', 'same')], [en('Wilgotność', 'translated', 'Wilgotność')]));
    expect(w.filter((x) => x[0] === 'english_check').map((x) => x[1])).toEqual([
      'Tekst do druku zawiera znaki spoza alfabetu angielskiego: „水分”.',
      'Tekst do druku zawiera znaki spoza alfabetu angielskiego: „Wilgotność”.',
    ]);
    expect(kinds(doc([en('Lead 0.1 µg/kg', 'same')]))).toEqual([]);
  });

  it('checks that a skipped duplicate has every value in the English text next to it', () => {
    const ok = kinds(doc([en('水分 4.0%\n', 'duplicate', ''), en('Moisture 4.0%', 'same')]));
    expect(ok).toHaveLength(1);
    expect(ok[0][1]).not.toContain('nie występują');
    const lost = kinds(doc([en('水分 4.5%\n', 'duplicate', ''), en('Moisture 4.0%', 'same')]));
    expect(lost[0][1]).toContain('Wartości 4.5 nie występują');
  });

  it('flags a translation that came back empty', () => {
    expect(kinds(doc([en('水分', 'translated', '')])).map((x) => x[0])).toEqual(['translated', 'english_check']);
  });
});

describe('printing the English version', () => {
  it('prints English versions, skips duplicates and uses ASCII for full-width forms', () => {
    const printable = toPrintable(
      doc([en('分析报告\nCERTIFICATE OF ANALAYSIS', 'corrected', 'CERTIFICATE OF ANALYSIS')], [en('镉 ＜1', 'duplicate', ''), en('Cadmium ＜1 ppm', 'same')]),
      { productName: null, productCode: null },
    );
    expect(printable.blocks).toEqual([
      { type: 'paragraph', runs: [{ text: 'CERTIFICATE OF ANALYSIS', illegible: false }] },
      { type: 'paragraph', runs: [{ text: 'Cadmium <1 ppm', illegible: false }] },
    ]);
    expect(halfWidth('（以 Pb 计)，ppm　')).toBe('(以 Pb 计),ppm ');
  });

  it('a correction on the review screen changes the English version and keeps the transcription', () => {
    const ref = { blockId: 'b1', cell: [], run: 0 };
    const r = applyReview(doc([en('未检出', 'translated', 'Not detect')]), [], { action: 'edit', ref, text: 'Not detected' }, 'u1');
    expect(r.extraction.blocks[0].runs![0]).toEqual({ kind: 'text', text: '未检出', category: null, reason: null, en: 'Not detected', en_how: 'edited' });
  });
});
