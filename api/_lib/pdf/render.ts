// The neutralized document on the Nutri Partners letterhead, rendered with @react-pdf/renderer on the server.
// Written with createElement (no JSX) so the Vercel function needs no extra build step.

import path from 'node:path';
import * as fontkit from 'fontkit';
import { extractText } from 'unpdf';
import { createElement as h, type ReactElement, type ReactNode } from 'react';
import { Circle, Document, Font, Page, Path, Polygon, Rect, StyleSheet, Svg, Text, View, renderToBuffer } from '@react-pdf/renderer';
import type { PrintBlock, PrintCell, Printable } from '../../../shared/printable.js';
import { LETTERHEAD } from '../../../shared/letterhead.js';
import { LOGO_SHAPES, LOGO_VIEWBOX } from './logo.js';

const FONT_DIR = path.join(process.cwd(), 'assets', 'fonts');
let fontsReady = false;

function registerFonts() {
  if (fontsReady) return;
  Font.register({
    family: 'Inter',
    fonts: [
      { src: path.join(FONT_DIR, 'Inter-Regular.ttf'), fontWeight: 400 },
      { src: path.join(FONT_DIR, 'Inter-Italic.ttf'), fontWeight: 400, fontStyle: 'italic' },
      { src: path.join(FONT_DIR, 'Inter-SemiBold.ttf'), fontWeight: 600 },
      { src: path.join(FONT_DIR, 'Inter-Bold.ttf'), fontWeight: 700 },
    ],
  });
  // Chinese (and Japanese kanji/kana) characters, which Inter does not have. Noto has no italic: the regular face
  // stands in for it.
  Font.register({
    family: 'NotoSansSC',
    fonts: [
      { src: path.join(FONT_DIR, 'NotoSansSC-Regular.ttf'), fontWeight: 400 },
      { src: path.join(FONT_DIR, 'NotoSansSC-Regular.ttf'), fontWeight: 400, fontStyle: 'italic' },
      { src: path.join(FONT_DIR, 'NotoSansSC-SemiBold.ttf'), fontWeight: 600 },
      { src: path.join(FONT_DIR, 'NotoSansSC-Bold.ttf'), fontWeight: 700 },
    ],
  });
  // Never split words with an added hyphen: codes and values must look exactly as in the source.
  Font.registerHyphenationCallback((word) => [word]);
  fontsReady = true;
}

// The regular face of each family in the fallback order. The other weights cover the same characters.
const COVERAGE_FONTS = ['Inter-Regular.ttf', 'NotoSansSC-Regular.ttf'];
let coverage: fontkit.Font[] | null = null;

/**
 * Characters of the document that none of the PDF fonts can draw. The renderer would print them as empty boxes or
 * drop them, so a binding document with such characters must not be generated at all.
 */
export function missingGlyphs(printable: Printable): string[] {
  coverage ??= COVERAGE_FONTS.map((file) => fontkit.openSync(path.join(FONT_DIR, file)) as fontkit.Font);
  const missing = new Set<string>();
  for (const char of contentChars(printable)) {
    if (!coverage.some((font) => font.hasGlyphForCodePoint(char.codePointAt(0)!))) missing.add(char);
  }
  return [...missing];
}

// Whitespace, control and invisible format characters (soft hyphen, zero-width space) carry no content.
const INVISIBLE = /[\s\p{Cc}\p{Cf}]/u;

/** Every visible character the PDF must contain: the document text and the illegible-spot annex. */
function contentChars(printable: Printable): string[] {
  const texts: string[] = [];
  const cells = (list: PrintCell[]) => list.forEach((cell) => cell.forEach((run) => texts.push(run.text)));
  for (const block of printable.blocks) {
    switch (block.type) {
      case 'heading':
      case 'paragraph':
      case 'note':
        cells([block.runs]);
        break;
      case 'list':
        cells(block.items);
        break;
      case 'key_value':
        block.rows.forEach((row) => cells([row.key, row.value]));
        break;
      case 'table':
        [...block.header, ...block.body].forEach(cells);
        break;
    }
  }
  for (const spot of printable.illegible) texts.push(spot.text, spot.reason ?? '');
  return [...texts.join('')].filter((char) => !INVISIBLE.test(char));
}

/**
 * Characters of the document that are not in the rendered PDF, found by reading its text back and comparing how
 * often each character occurs. Catches anything the PDF library drops while laying out the text.
 */
export async function lostCharacters(pdf: Uint8Array, printable: Printable): Promise<string[]> {
  const count = (chars: Iterable<string>) => {
    const counts = new Map<string, number>();
    for (const char of chars) counts.set(char, (counts.get(char) ?? 0) + 1);
    return counts;
  };
  // NFKC on both sides, so that e.g. a full-width "＜" read back from the font compares equal however it is encoded.
  const { text } = await extractText(new Uint8Array(pdf), { mergePages: true });
  const inPdf = count([...text.normalize('NFKC')].filter((char) => !INVISIBLE.test(char)));
  const expected = count([...contentChars(printable).join('').normalize('NFKC')].filter((char) => !INVISIBLE.test(char)));
  return [...expected].filter(([char, n]) => (inPdf.get(char) ?? 0) < n).map(([char]) => char);
}

const INK = '#1A1A1A';
const MUTED = '#6B7280';
const LINE = '#D1D5DB';
const ACCENT = LETTERHEAD.accent;
// Line heights are absolute (pt) and set per text style: unitless values are misread by this react-pdf version and,
// set on the page, hide the page-number text.
const lh = (fontSize: number, factor: number) => `${(fontSize * factor).toFixed(1)}pt`;

const s = StyleSheet.create({
  // Characters missing from Inter fall back to Noto Sans SC.
  page: { fontFamily: ['Inter', 'NotoSansSC'], fontSize: 9.5, color: INK, paddingTop: 92, paddingBottom: 72, paddingHorizontal: 50 },
  header: { position: 'absolute', top: 30, left: 50, right: 50, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingBottom: 8, borderBottomWidth: 1.2, borderBottomColor: ACCENT },
  headerRight: { fontSize: 8, color: MUTED },
  footer: { position: 'absolute', bottom: 28, left: 50, right: 50, borderTopWidth: 0.6, borderTopColor: LINE, paddingTop: 6, paddingRight: 110, fontSize: 7, color: MUTED, lineHeight: lh(7, 1.35) },
  pageNumber: { position: 'absolute', bottom: 28, right: 50, width: 110, paddingTop: 6.6, textAlign: 'right', fontSize: 7, color: MUTED },
  h1: { fontSize: 14, fontWeight: 700, marginTop: 4, marginBottom: 8 },
  h2: { fontSize: 11.5, fontWeight: 600, marginTop: 10, marginBottom: 5 },
  h3: { fontSize: 10, fontWeight: 600, marginTop: 8, marginBottom: 4 },
  paragraph: { marginBottom: 6, lineHeight: lh(9.5, 1.4) },
  note: { marginBottom: 6, fontSize: 8, fontStyle: 'italic', color: '#374151', lineHeight: lh(8, 1.4) },
  listItem: { marginBottom: 2, paddingLeft: 4, lineHeight: lh(9.5, 1.4) },
  table: { marginTop: 2, marginBottom: 10, borderTopWidth: 0.6, borderLeftWidth: 0.6, borderColor: LINE },
  row: { flexDirection: 'row' },
  cell: { flex: 1, borderRightWidth: 0.6, borderBottomWidth: 0.6, borderColor: LINE, paddingVertical: 3, paddingHorizontal: 4, fontSize: 8.5, lineHeight: lh(8.5, 1.3) },
  headCell: { backgroundColor: '#F3F4F6', fontWeight: 600 },
  keyCell: { flex: 2, fontWeight: 600 },
  valueCell: { flex: 3 },
  illegible: { backgroundColor: '#FDE2E2', color: ACCENT, fontWeight: 600 },
  annex: { marginTop: 14, paddingTop: 8, borderTopWidth: 0.8, borderTopColor: ACCENT },
  annexTitle: { fontSize: 10, fontWeight: 700, color: ACCENT, marginBottom: 4 },
  annexItem: { fontSize: 8, marginBottom: 2, lineHeight: lh(8, 1.3) },
});

interface Labels {
  illegible: string;
  annexTitle: string;
  annexIntro: string;
  page: string;
  readable: string;
  reference: string;
}

const LABELS: Record<'pl' | 'en', Labels> = {
  pl: {
    illegible: 'NIECZYTELNE',
    annexTitle: 'Fragmenty nieczytelne w dokumencie źródłowym',
    annexIntro: 'Poniższe miejsca dokumentu źródłowego były nieczytelne i zostały oznaczone w treści jako [NIECZYTELNE].',
    page: 'str.',
    readable: 'odczytano',
    reference: 'Nr ref.',
  },
  en: {
    illegible: 'ILLEGIBLE',
    annexTitle: 'Illegible parts of the source document',
    annexIntro: 'The following parts of the source document were illegible and are marked in the text as [ILLEGIBLE].',
    page: 'p.',
    readable: 'readable part',
    reference: 'Ref.',
  },
};

function Logo(): ReactElement {
  const width = 118;
  const height = (width * LOGO_VIEWBOX.height) / LOGO_VIEWBOX.width;
  return h(
    Svg,
    { width, height, viewBox: `0 0 ${LOGO_VIEWBOX.width} ${LOGO_VIEWBOX.height}` },
    ...LOGO_SHAPES.map((shape, i) => {
      switch (shape.tag) {
        case 'path':
          return h(Path, { key: i, d: shape.d, fill: shape.fill });
        case 'circle':
          return h(Circle, { key: i, cx: shape.cx, cy: shape.cy, r: shape.r, fill: shape.fill });
        case 'polygon':
          return h(Polygon, { key: i, points: shape.points, fill: shape.fill });
        case 'rect':
          return h(Rect, { key: i, x: shape.x, y: shape.y, width: shape.width, height: shape.height, fill: shape.fill });
      }
    }),
  );
}

function runsOf(cell: PrintCell, l: Labels): ReactNode[] {
  // Neighbouring text runs are joined into one string: react-pdf (textkit 7) drops the first characters of a text
  // child when it and the previous child both use the fallback font (e.g. "企业" + "标准" prints "企业").
  const out: ReactNode[] = [];
  cell.forEach((run, i) => {
    if (run.illegible) {
      out.push(h(Text, { key: i, style: s.illegible }, run.text.trim() ? `[${l.illegible}: ${run.text.trim()}…]` : `[${l.illegible}]`));
    } else if (typeof out.at(-1) === 'string') {
      out[out.length - 1] += run.text;
    } else {
      out.push(run.text);
    }
  });
  return out;
}

function renderBlock(block: PrintBlock, i: number, l: Labels): ReactElement {
  switch (block.type) {
    case 'heading':
      return h(Text, { key: i, style: block.level === 1 ? s.h1 : block.level === 2 ? s.h2 : s.h3, minPresenceAhead: 40 }, ...runsOf(block.runs, l));
    case 'paragraph':
      return h(Text, { key: i, style: s.paragraph }, ...runsOf(block.runs, l));
    case 'note':
      return h(Text, { key: i, style: s.note }, ...runsOf(block.runs, l));
    case 'list':
      return h(
        View,
        { key: i, style: { marginBottom: 6 } },
        ...block.items.map((item, j) =>
          h(Text, { key: j, style: s.listItem }, ...runsOf([{ text: '•  ', illegible: false }, ...item], l)),
        ),
      );
    case 'key_value':
      return h(
        View,
        { key: i, style: s.table },
        ...block.rows.map((row, j) =>
          h(
            View,
            { key: j, style: s.row, wrap: false },
            h(Text, { style: [s.cell, s.keyCell] }, ...runsOf(row.key, l)),
            h(Text, { style: [s.cell, s.valueCell] }, ...runsOf(row.value, l)),
          ),
        ),
      );
    case 'table': {
      const width = Math.max(1, ...[...block.header, ...block.body].map((r) => r.length));
      const row = (cells: PrintCell[], head: boolean, j: number) =>
        h(
          View,
          { key: j, style: s.row, wrap: false },
          ...Array.from({ length: width }, (_, c) => h(Text, { key: c, style: head ? [s.cell, s.headCell] : s.cell }, ...runsOf(cells[c] ?? [], l))),
        );
      return h(
        View,
        { key: i, style: s.table },
        ...block.header.map((r, j) => row(r, true, j)),
        ...block.body.map((r, j) => row(r, false, block.header.length + j)),
      );
    }
  }
}

export interface RenderInput {
  printable: Printable;
  language: string;
  reference: string;
}

export function buildDocument({ printable, language, reference }: RenderInput): ReactElement {
  const l = LABELS[language === 'pl' ? 'pl' : 'en'];
  const company = [LETTERHEAD.legalName || LETTERHEAD.companyName, LETTERHEAD.address, LETTERHEAD.taxId, LETTERHEAD.registry]
    .filter(Boolean)
    .join(' · ');
  const contact = [LETTERHEAD.phone, LETTERHEAD.email, LETTERHEAD.website].filter(Boolean).join(' · ');

  const annex = printable.illegible.length
    ? h(
        View,
        { style: s.annex, wrap: false },
        h(Text, { style: s.annexTitle }, l.annexTitle),
        h(Text, { style: s.annexItem }, l.annexIntro),
        ...printable.illegible.map((spot, i) =>
          h(
            Text,
            { key: i, style: s.annexItem },
            `${i + 1}. ${l.page} ${spot.page}` +
              (spot.text.trim() ? ` – ${l.readable}: „${spot.text.trim()}”` : '') +
              (spot.reason ? ` – ${spot.reason}` : ''),
          ),
        ),
      )
    : null;

  return h(
    Document,
    { title: `${LETTERHEAD.companyName} ${reference}`, author: LETTERHEAD.companyName, creator: LETTERHEAD.companyName, producer: LETTERHEAD.companyName, language },
    h(
      Page,
      { size: 'A4', style: s.page },
      h(View, { style: s.header, fixed: true }, h(Logo, null), h(Text, { style: s.headerRight }, LETTERHEAD.website)),
      h(View, { style: s.footer, fixed: true }, h(Text, null, contact ? `${company}\n${contact}` : company)),
      // Kept out of the footer row: react-pdf drops a whole flex row that contains a `render` text.
      h(
        View,
        { style: s.pageNumber, fixed: true },
        h(Text, {
          render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `${l.reference} ${reference}   ${pageNumber} / ${totalPages}`,
        }),
      ),
      ...printable.blocks.map((b, i) => renderBlock(b, i, l)),
      annex,
    ),
  );
}

export async function renderPdf(input: RenderInput): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(buildDocument(input) as Parameters<typeof renderToBuffer>[0]);
}
