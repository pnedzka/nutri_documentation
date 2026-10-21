// Name of a generated PDF: {document type}_NP_{yyyymmdd}_{number of the day}, e.g. "CoA_NP_20261021_01".
// The date is the day of the first generation in Poland; the number counts the PDFs of that day across the whole
// company (table `output_counters`). The name is given once and kept when the document is generated again.

import type { DocumentType } from './schema.js';

export const OUTPUT_TIME_ZONE = 'Europe/Warsaw';

/** Calendar day in Poland as "yyyy-mm-dd". */
export function polishDate(at: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: OUTPUT_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
}

export function outputName(type: DocumentType, day: string, seq: number): string {
  return `${type}_NP_${day.replaceAll('-', '')}_${String(seq).padStart(2, '0')}`;
}
