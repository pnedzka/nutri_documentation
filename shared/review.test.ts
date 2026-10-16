import { describe, expect, it } from 'vitest';
import { applyReview, ReviewError } from './review.js';
import type { Extraction, Warning } from './schema.js';

const extraction = (): Extraction => ({
  language: 'en',
  page_count: 1,
  notes: [],
  blocks: [
    {
      id: 'b1', type: 'key_value', page: 1, level: null, runs: null, items: null, header: null, body: null,
      rows: [{ key: [{ kind: 'text', text: 'Lead', category: null, reason: null }], value: [{ kind: 'illegible', text: '0.0', category: null, reason: 'blurred' }] }],
    },
    { id: 'b2', type: 'paragraph', page: 1, level: null, items: null, rows: null, header: null, body: null, runs: [{ kind: 'redact', text: 'ACME GmbH', category: 'supplier_identity', reason: 'supplier' }] },
  ],
});

const warning = (id: string, ref: Warning['ref']): Warning => ({ id, kind: 'illegible', message: 'm', page: 1, ref, excerpt: null, status: 'open', resolvedBy: null, resolvedAt: null });
const ref = { blockId: 'b1', cell: [0, 1], run: 0 };

describe('applyReview', () => {
  it('corrects an illegible value and resolves its warnings', () => {
    const r = applyReview(extraction(), [warning('w1', ref), warning('w2', null)], { action: 'edit', ref, text: '0.02' }, 'u1');
    expect(r.extraction.blocks[0].rows![0].value[0]).toEqual({ kind: 'text', text: '0.02', category: null, reason: null });
    expect(r.warnings.map((w) => w.status)).toEqual(['edited', 'open']);
    expect(r.event.kind).toBe('edit');
    expect(r.event.payload.before).toMatchObject({ kind: 'illegible', text: '0.0' });
  });

  it('acknowledges warnings once', () => {
    const r = applyReview(extraction(), [warning('w1', ref)], { action: 'ack', warningIds: ['w1'] }, 'u1');
    expect(r.warnings[0]).toMatchObject({ status: 'acknowledged', resolvedBy: 'u1' });
    expect(() => applyReview(extraction(), r.warnings, { action: 'ack', warningIds: ['w1'] }, 'u1')).toThrow(ReviewError);
  });

  it('restores and adds removals without touching the original', () => {
    const original = extraction();
    const restored = applyReview(original, [], { action: 'restore', ref: { blockId: 'b2', cell: [], run: 0 } }, 'u1');
    expect(restored.extraction.blocks[1].runs![0].kind).toBe('text');
    expect(original.blocks[1].runs![0].kind).toBe('redact');
    const redacted = applyReview(original, [], { action: 'redact', ref: { blockId: 'b1', cell: [0, 0], run: 0 }, category: 'trade_name' }, 'u1');
    expect(redacted.extraction.blocks[0].rows![0].key[0]).toMatchObject({ kind: 'redact', category: 'trade_name' });
  });

  it('rejects unknown fragments', () => {
    expect(() => applyReview(extraction(), [], { action: 'edit', ref: { blockId: 'nope', cell: [], run: 0 }, text: 'x' }, 'u1')).toThrow(ReviewError);
  });
});

describe('insert', () => {
  it('adds a missed fragment after a block and resolves the warning', () => {
    const w: Warning = { id: 'w9', kind: 'possibly_omitted', message: 'm', page: 1, ref: null, excerpt: 'Ash 8 %', status: 'open', resolvedBy: null, resolvedAt: null };
    const r = applyReview(extraction(), [w], { action: 'insert', afterBlockId: 'b1', page: 1, text: 'Ash 8 %', warningId: 'w9' }, 'u1');
    expect(r.extraction.blocks.map((b) => b.id)).toEqual(['b1', 'u1', 'b2']);
    expect(r.warnings[0].status).toBe('edited');
    const again = applyReview(r.extraction, [], { action: 'insert', afterBlockId: null, page: 1, text: 'x' }, 'u1');
    expect(again.extraction.blocks[0].id).toBe('u2');
  });
});
