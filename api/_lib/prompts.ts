// Instructions and output schemas for the two model passes.
//
// Pass A (transcription) produces the structured document. Pass B (independent reading) only exists for scans and
// photos: a plain-text reading made without seeing pass A, used to confirm the values pass A read.

const RUN = {
  type: 'object',
  additionalProperties: false,
  required: ['kind', 'text', 'category', 'reason'],
  properties: {
    kind: { type: 'string', enum: ['text', 'illegible', 'redact'] },
    text: { type: 'string' },
    category: {
      anyOf: [{ type: 'string', enum: ['supplier_identity', 'trade_name', 'supplier_code', 'commercial_terms'] }, { type: 'null' }],
    },
    reason: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
} as const;

const RUNS = { type: 'array', items: { $ref: '#/$defs/run' } } as const;
const nullable = (schema: object) => ({ anyOf: [schema, { type: 'null' }] });

export const EXTRACTION_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['language', 'page_count', 'blocks', 'notes'],
  $defs: { run: RUN },
  properties: {
    language: { type: 'string' },
    page_count: { type: 'integer' },
    notes: { type: 'array', items: { type: 'string' } },
    blocks: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'type', 'page', 'level', 'runs', 'items', 'rows', 'header', 'body'],
        properties: {
          id: { type: 'string' },
          type: { type: 'string', enum: ['heading', 'paragraph', 'key_value', 'table', 'list', 'note', 'figure'] },
          page: { type: 'integer' },
          level: nullable({ type: 'integer' }),
          runs: nullable(RUNS),
          items: nullable({ type: 'array', items: RUNS }),
          rows: nullable({
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['key', 'value'],
              properties: { key: RUNS, value: RUNS },
            },
          }),
          header: nullable({ type: 'array', items: { type: 'array', items: RUNS } }),
          body: nullable({ type: 'array', items: { type: 'array', items: RUNS } }),
        },
      },
    },
  },
} as const;

export const READING_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['pages'],
  properties: {
    pages: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['page', 'text'],
        properties: { page: { type: 'integer' }, text: { type: 'string' } },
      },
    },
  },
} as const;

export const TRANSCRIPTION_SYSTEM = `You transcribe supplier documents (product specifications, technical data sheets, certificates of analysis, declarations) for Nutri Partners, a food ingredients distributor. Nutri Partners reissues these documents on its own letterhead without the supplier's identity. The documents are legally binding: the result is checked against the source and every difference is treated as a defect.

# Fidelity rules (most important)
- Transcribe verbatim, character for character: numbers, decimal separators, units, symbols (<, >, ≤, ≥, ±, %, °C, µ), ranges, footnote markers, capitalisation, spelling – including the supplier's own typos.
- Never translate, summarise, paraphrase, normalise, convert units, round, complete or "fix" anything. Keep the document's original language.
- Never add anything that is not printed in the document: no headings of your own, no explanations, no assumed values.
- Include all content: every section, table row and column, footnote, method reference, standard number, date, batch/lot number, validity statement and remark. Do not skip repeated or boilerplate text.
- Keep the reading order of the source.

# Illegible content
- If any character cannot be read with certainty (blurred, cut off, covered by a stamp, low resolution, handwriting), do not guess. Emit a run with kind "illegible", put in "text" only the characters you can read with certainty (may be empty) and describe the problem briefly in Polish in "reason" (e.g. "rozmazana ostatnia cyfra", "zasłonięte pieczątką").
- A value that is only partly legible is still an illegible run; never complete it from context.

# Neutralization: mark (do not delete) supplier-specific content
Split text into runs so that each removable fragment is its own run with kind "redact", the exact original text in "text", a category and a short Polish reason:
- supplier_identity: supplier/manufacturer company names, logos' text, addresses, tax and registration numbers (VAT/NIP, KRS, DUNS…), phone/fax numbers, e-mails, websites, names and signatures of the supplier's employees, the supplier's document numbers and form codes tied to the supplier's quality system, certificate numbers issued to the supplier.
- trade_name: the supplier's brand or trade name of the product (e.g. "Lactoprot SMP Premium"). The generic product description (e.g. "Skimmed milk powder", "Sodium caseinate") is NOT removed.
- supplier_code: the supplier's internal article/product/material codes.
- commercial_terms: prices, discounts, currencies tied to prices, payment terms, delivery terms and Incoterms, minimum order quantities, offer validity.
Keep everything else, in particular: country of origin, plant approval/veterinary numbers, batch/lot numbers, production and expiry dates, analytical values, methods, standards, regulations, allergen and GMO statements, storage, shelf life and packaging information.
When unsure whether something identifies the supplier, mark it as redact – a person reviews every mark and can restore it.

# Structure
Use blocks: heading (level 1–3), paragraph, key_value (label → value pairs, e.g. parameter tables with two columns), table (header rows and body rows; every cell is a list of runs; keep empty cells as empty lists), list (one entry per item, without the bullet character), note (footnotes, small print), figure (charts, photos, drawings: put only a printed caption in "runs" if there is one, never describe the image).
Set unused fields to null. "page" is the 1-based page of the source where the block starts. Give blocks ids "b1", "b2", … in order.
Runs are concatenated without separators, so keep the spaces between words inside the run texts.
Put in "notes" (in Polish) anything you could not represent: stamps, signatures, handwritten additions, rotated or overlapping text, content you are unsure belongs to the document. Leave it empty when there is nothing to report.
"language" is the ISO 639-1 code of the document's main language. "page_count" is the number of pages you received.`;

export const READING_SYSTEM = `You read scanned documents and photos character by character. Output the complete text of every page exactly as printed, in reading order, one line of the source per line of output: no translation, no corrections, no summaries, no formatting, no commentary. Keep every number, unit and symbol exactly as printed. Where a character cannot be read with certainty write "?" in its place instead of guessing. "page" is 1-based.`;

export function transcriptionTask(pageOffset: number, pageCount: number | null): string {
  const range = pageCount ? ` The attached part contains ${pageCount} page(s); it starts at page ${pageOffset + 1} of the full document, so number pages from ${pageOffset + 1}.` : '';
  return `Transcribe the attached supplier document following the rules.${range}`;
}

export function readingTask(pageOffset: number): string {
  return `Read the attached document page by page.${pageOffset ? ` The attached part starts at page ${pageOffset + 1} of the full document, so number pages from ${pageOffset + 1}.` : ''}`;
}
