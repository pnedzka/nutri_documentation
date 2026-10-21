import { describe, expect, it } from 'vitest';
import { downloadName } from './documents.js';

describe('downloadName', () => {
  it('uses the PDF name and never the supplier file name', () => {
    expect(downloadName({ id: '540f18ed-82ac-40a8-9a78-94d23c0fd139', output_name: 'CoA_NP_20261021_01', finalized_at: '2026-10-21T09:00:00Z' })).toBe('CoA_NP_20261021_01.pdf');
  });

  it('names PDFs generated before names existed after their reference', () => {
    expect(downloadName({ id: '540f18ed-82ac-40a8-9a78-94d23c0fd139', output_name: null, finalized_at: '2026-10-12T22:30:00Z' })).toBe('Doc_NP_20261013_540F18ED.pdf');
  });
});
