import { describe, expect, it } from 'vitest';
import type { Block, Extraction, Run } from './schema.js';
import { compareWithSecondPass, findLeaks, findOmissions, structuralWarnings, verifyAgainstSource } from './verify.js';
import { toPrintable } from './printable.js';

const t = (text: string): Run => ({ kind: 'text', text, category: null, reason: null });
const ill = (text: string, reason = 'blurred'): Run => ({ kind: 'illegible', text, category: null, reason });
const red = (text: string, category: Run['category']): Run => ({ kind: 'redact', text, category, reason: 'supplier data' });

function block(partial: Partial<Block> & Pick<Block, 'type'>): Block {
  return { id: Math.random().toString(36).slice(2), page: 1, level: null, runs: null, items: null, rows: null, header: null, body: null, ...partial };
}

const doc = (blocks: Block[], notes: string[] = []): Extraction => ({ language: 'en', page_count: 1, blocks, notes });

const SOURCE = [
  `ACME Dairy GmbH, Milchstraße 1, 12345 Berlin
PRODUCT SPECIFICATION
Skimmed milk powder ACME-SMP 26
Moisture max. 4.0 %
Protein (N x 6.38) min. 34.0 %
Salmonella absent in 25 g
Price: 2.50 EUR/kg
Page 1 of 1`,
];

const faithful = () =>
  doc([
    block({ type: 'paragraph', runs: [red('ACME Dairy GmbH, Milchstraße 1, 12345 Berlin', 'supplier_identity')] }),
    block({ type: 'heading', level: 1, runs: [t('PRODUCT SPECIFICATION')] }),
    block({ type: 'paragraph', runs: [t('Skimmed milk powder '), red('ACME-SMP 26', 'trade_name')] }),
    block({
      type: 'key_value',
      rows: [
        { key: [t('Moisture')], value: [t('max. 4.0 %')] },
        { key: [t('Protein (N x 6.38)')], value: [t('min. 34.0 %')] },
        { key: [t('Salmonella')], value: [t('absent in 25 g')] },
        { key: [t('Price:')], value: [red('2.50 EUR/kg', 'commercial_terms')] },
      ],
    }),
  ]);

describe('verifyAgainstSource', () => {
  it('accepts a faithful transcription', () => {
    expect(verifyAgainstSource(faithful(), SOURCE)).toEqual([]);
  });

  it('flags a changed number', () => {
    const e = faithful();
    e.blocks[3].rows![0].value = [t('max. 4.5 %')];
    const w = verifyAgainstSource(e, SOURCE);
    expect(w).toHaveLength(1);
    expect(w[0].kind).toBe('unverified');
    expect(w[0].message).toContain('4.5');
    expect(w[0].ref).toEqual({ blockId: e.blocks[3].id, cell: [0, 1], run: 0 });
  });

  it('flags a changed meaning word and an invented sentence', () => {
    const e = faithful();
    e.blocks[3].rows![0].value = [t('min. 4.0 %')];
    e.blocks.push(block({ type: 'note', runs: [t('Suitable for infant formula.')] }));
    const kinds = verifyAgainstSource(e, SOURCE).map((w) => w.message);
    expect(kinds).toHaveLength(2);
  });

  it('tolerates line breaks and typographic dashes', () => {
    const src = ['Natrium-\ncaseinat 90 – 92 %'];
    const e = doc([block({ type: 'paragraph', runs: [t('Natriumcaseinat 90 - 92 %')] })]);
    expect(verifyAgainstSource(e, src)).toEqual([]);
  });
});

describe('findOmissions', () => {
  it('accepts a complete transcription (removed fragments count as accounted for)', () => {
    expect(findOmissions(faithful(), SOURCE)).toEqual([]);
  });

  it('flags a skipped row', () => {
    const e = faithful();
    e.blocks[3].rows!.splice(2, 1);
    const w = findOmissions(e, SOURCE);
    expect(w).toHaveLength(1);
    expect(w[0].kind).toBe('possibly_omitted');
    expect(w[0].excerpt).toContain('Salmonella');
  });

  it('accepts values the text layer splits with spaces', () => {
    const e = doc([
      block({ type: 'key_value', rows: [{ key: [t('Package:')], value: [t('25kgs/Carton')] }, { key: [t('Mercury(as Hg) ppm')], value: [t('≤0.1 GB 5009.71 <0.1')] }] }),
    ]);
    expect(findOmissions(e, ['Package: 25 kgs/Carton\nMercury(as Hg) ppm ≤0. 1 GB 5009.71 <0.1'])).toEqual([]);
    // A value that really is missing is still reported.
    expect(findOmissions(e, ['Package: 25 kgs/Carton\nMercury(as Hg) ppm ≤0. 2 GB 5009.71 <0.1'])).toHaveLength(1);
  });
});

describe('compareWithSecondPass', () => {
  it('flags a number the second reading does not confirm', () => {
    const second = [SOURCE[0].replace('34.0', '84.0')];
    const w = compareWithSecondPass(faithful(), second);
    expect(w).toHaveLength(1);
    expect(w[0].kind).toBe('uncertain');
    expect(w[0].message).toContain('34.0');
  });

  it('accepts matching readings', () => {
    expect(compareWithSecondPass(faithful(), SOURCE)).toEqual([]);
  });
});

describe('structuralWarnings', () => {
  it('reports illegible spots, figures and notes', () => {
    const e = doc(
      [
        block({ type: 'paragraph', runs: [t('Lead '), ill('0.0', 'last digit illegible')] }),
        block({ type: 'figure', runs: [t('Fig. 1 Particle size')] }),
      ],
      ['Handwritten signature on page 1.'],
    );
    expect(structuralWarnings(e).map((w) => w.kind)).toEqual(['illegible', 'figure_omitted', 'model_note']);
  });

  it('finds supplier names left in printed text', () => {
    const e = faithful();
    e.blocks.push(block({ type: 'paragraph', runs: [t('Produced by ACME Dairy GmbH, Milchstraße 1, 12345 Berlin.')] }));
    expect(findLeaks(e)).toHaveLength(1);
  });
});

describe('toPrintable', () => {
  it('drops removed fragments, rows left without a value and applies replacements', () => {
    const p = toPrintable(faithful(), { productName: 'NP SMP', productCode: null });
    expect(p.blocks.map((b) => b.type)).toEqual(['heading', 'paragraph', 'key_value']);
    const para = p.blocks[1] as Extract<typeof p.blocks[number], { type: 'paragraph' | 'note' }>;
    expect(para.runs.map((r) => r.text).join('')).toBe('Skimmed milk powder NP SMP');
    const kv = p.blocks[2] as Extract<typeof p.blocks[number], { type: 'key_value' }>;
    expect(kv.rows.map((r) => r.key.map((x) => x.text).join(''))).toEqual(['Moisture', 'Protein (N x 6.38)', 'Salmonella']);
  });

  it('drops table columns emptied by removal and keeps illegible cells', () => {
    const e = doc([
      block({
        type: 'table',
        header: [[[t('Parameter')], [t('Value')], [t('Price')]]],
        body: [
          [[t('Fat')], [ill('1,')], [red('3 EUR', 'commercial_terms')]],
          [[t('Ash')], [t('8 %')], [red('4 EUR', 'commercial_terms')]],
        ],
      }),
    ]);
    const p = toPrintable(e, { productName: null, productCode: null });
    const table = p.blocks[0] as Extract<typeof p.blocks[number], { type: 'table' }>;
    expect(table.header[0].map((c) => c.map((r) => r.text).join(''))).toEqual(['Parameter', 'Value']);
    expect(table.body[0][1]).toEqual([{ text: '1,', illegible: true }]);
    expect(p.illegible).toEqual([{ page: 1, text: '1,', reason: 'blurred' }]);
  });
});
