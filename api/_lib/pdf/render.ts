// The neutralized document on the Nutri Partners letterhead, rendered with @react-pdf/renderer on the server.
// Written with createElement (no JSX) so the Vercel function needs no extra build step.

import path from 'node:path';
import * as fontkit from 'fontkit';
import { getDocumentProxy } from 'unpdf';
import { createElement as h, type ReactElement, type ReactNode } from 'react';
import { Circle, Document, Font, G, Page, Path, Polygon, Rect, StyleSheet, Svg, Text, View, renderToBuffer } from '@react-pdf/renderer';
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

/** Every visible character the PDF must contain in its body: the document text and the illegible-spot annex. */
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
  for (const spot of printable.illegible) texts.push(spot.text);
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
  // Only the body of each page counts: the letterhead (company data, page numbers) would hide a lost digit or letter.
  const doc = await getDocumentProxy(new Uint8Array(pdf));
  let text = '';
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const [, , , top] = page.view;
    for (const item of (await page.getTextContent()).items) {
      if (!('str' in item)) continue;
      const y = item.transform[5];
      if (y > BODY.bottom && y < top - BODY.top) text += item.str;
    }
  }
  // NFKC on both sides, so that e.g. a full-width "＜" read back from the font compares equal however it is encoded.
  const inPdf = count([...text.normalize('NFKC')].filter((char) => !INVISIBLE.test(char)));
  const expected = count([...contentChars(printable).join('').normalize('NFKC')].filter((char) => !INVISIBLE.test(char)));
  return [...expected].filter(([char, n]) => (inPdf.get(char) ?? 0) < n).map(([char]) => char);
}

/** Page margins (pt) outside of which only the letterhead is printed. */
const BODY = { top: 92, bottom: 78 };

const INK = '#1A1A1A';
const MUTED = '#6B7280';
const LINE = '#D5D8DD';
const ACCENT = LETTERHEAD.accent;
/** Fill of the cells that name a row: the key column of key/value tables and the first column of tables. */
const ROW_NAME = '#F1F2F4';
// Line heights are absolute (pt) and set per text style: unitless values are misread by this react-pdf version and,
// set on the page, hide the page-number text.
const lh = (fontSize: number, factor: number) => `${(fontSize * factor).toFixed(1)}pt`;

const s = StyleSheet.create({
  // Characters missing from Inter fall back to Noto Sans SC.
  page: { fontFamily: ['Inter', 'NotoSansSC'], fontSize: 9.5, color: INK, paddingTop: BODY.top, paddingBottom: BODY.bottom, paddingHorizontal: 50 },
  header: { position: 'absolute', top: 30, left: 50, right: 50, paddingBottom: 8, borderBottomWidth: 1.2, borderBottomColor: ACCENT },
  // Kept out of the header row: react-pdf drops a whole flex row that contains a `render` text.
  pageNumber: { position: 'absolute', top: 47, right: 50, textAlign: 'right', fontSize: 7.5, color: MUTED },
  footer: { position: 'absolute', bottom: 26, left: 40, right: 40, alignItems: 'center' },
  footerCompany: { fontSize: 7.5, color: INK, textAlign: 'center', lineHeight: lh(7.5, 1.3) },
  footerSeparator: { color: MUTED },
  footerContacts: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 5 },
  footerContact: { flexDirection: 'row', alignItems: 'center', marginHorizontal: 9 },
  footerContactText: { fontSize: 7.5, color: INK, marginLeft: 4 },
  h1: { fontSize: 14, fontWeight: 700, marginTop: 4, marginBottom: 8, lineHeight: lh(14, 1.25) },
  h2: { fontSize: 11.5, fontWeight: 600, marginTop: 10, marginBottom: 5, lineHeight: lh(11.5, 1.25) },
  h3: { fontSize: 10, fontWeight: 600, marginTop: 8, marginBottom: 4, lineHeight: lh(10, 1.25) },
  paragraph: { marginBottom: 6, lineHeight: lh(9.5, 1.4) },
  note: { marginBottom: 6, fontSize: 8, fontStyle: 'italic', color: '#374151', lineHeight: lh(8, 1.4) },
  listItem: { marginBottom: 2, paddingLeft: 4, lineHeight: lh(9.5, 1.4) },
  // Borders sit on rows and cells, not on the table: a table that continues on the next page would otherwise
  // draw its frame down to the bottom margin.
  table: { marginTop: 2, marginBottom: 12 },
  row: { flexDirection: 'row', borderLeftWidth: 0.6, borderLeftColor: LINE },
  firstRow: { borderTopWidth: 0.6, borderTopColor: LINE },
  cell: { flex: 1, borderRightWidth: 0.6, borderBottomWidth: 0.6, borderColor: LINE, paddingVertical: 4, paddingHorizontal: 6, fontSize: 8.5, lineHeight: lh(8.5, 1.35) },
  headCell: { backgroundColor: ACCENT, borderColor: ACCENT, color: '#FFFFFF', fontWeight: 600 },
  rowName: { backgroundColor: ROW_NAME, fontWeight: 600 },
  keyCell: { flex: 2 },
  valueCell: { flex: 3 },
  illegible: { backgroundColor: '#FDE2E2', color: ACCENT, fontWeight: 600 },
  annex: { marginTop: 14, paddingTop: 8, borderTopWidth: 0.8, borderTopColor: ACCENT },
  annexTitle: { fontSize: 10, fontWeight: 700, color: ACCENT, marginBottom: 4 },
  annexItem: { fontSize: 8, marginBottom: 2, lineHeight: lh(8, 1.3) },
});

// The document is always printed in English.
const L = {
  illegible: 'ILLEGIBLE',
  annexTitle: 'Illegible parts of the source document',
  annexIntro: 'The following parts of the source document were illegible and are marked in the text as [ILLEGIBLE].',
  page: 'p.',
  readable: 'readable part',
  reference: 'Ref.',
};
type Labels = typeof L;

// Contact icons of the footer (outline icons from Lucide, ISC licence) inside a circle.
const ICONS = {
  phone: [
    'M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384',
  ],
  mail: ['m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7', 'M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z'],
  web: ['M12 2a10 10 0 1 0 0 20 10 10 0 1 0 0-20z', 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20', 'M2 12h20'],
};

function ContactIcon({ paths }: { paths: string[] }): ReactElement {
  const stroke = { stroke: ACCENT, fill: 'none', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;
  return h(
    Svg,
    { width: 14, height: 14, viewBox: '0 0 26 26' },
    h(Circle, { cx: 13, cy: 13, r: 12.2, strokeWidth: 1.2, ...stroke }),
    h(G, { transform: 'translate(5.8 5.8) scale(0.6)' }, ...paths.map((d, i) => h(Path, { key: i, d, strokeWidth: 1.9, ...stroke }))),
  );
}

function Footer(): ReactElement {
  const company = [LETTERHEAD.legalName || LETTERHEAD.companyName, LETTERHEAD.address, LETTERHEAD.taxId, LETTERHEAD.registry].filter(Boolean);
  const contacts = [
    { icon: ICONS.phone, text: LETTERHEAD.phone },
    { icon: ICONS.mail, text: LETTERHEAD.email },
    { icon: ICONS.web, text: LETTERHEAD.website },
  ].filter((c) => c.text);
  return h(
    View,
    { style: s.footer, fixed: true },
    h(Text, { style: s.footerCompany }, ...company.flatMap((part, i) => (i ? [h(Text, { key: i, style: s.footerSeparator }, '  |  '), part] : [part]))),
    contacts.length
      ? h(
          View,
          { style: s.footerContacts },
          ...contacts.map((c, i) => h(View, { key: i, style: s.footerContact }, h(ContactIcon, { paths: c.icon }), h(Text, { style: s.footerContactText }, c.text))),
        )
      : null,
  );
}

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
            { key: j, style: j === 0 ? [s.row, s.firstRow] : s.row, wrap: false },
            h(Text, { style: [s.cell, s.rowName, s.keyCell] }, ...runsOf(row.key, l)),
            h(Text, { style: [s.cell, s.valueCell] }, ...runsOf(row.value, l)),
          ),
        ),
      );
    case 'table': {
      const width = Math.max(1, ...[...block.header, ...block.body].map((r) => r.length));
      const cellStyle = (head: boolean, c: number) => (head ? [s.cell, s.headCell] : c === 0 && width > 1 ? [s.cell, s.rowName] : s.cell);
      const row = (cells: PrintCell[], head: boolean, j: number) =>
        h(
          View,
          // Header rows are `fixed`: react-pdf repeats them on every page the table continues on.
          { key: j, style: j === 0 ? [s.row, s.firstRow] : s.row, wrap: false, fixed: head },
          ...Array.from({ length: width }, (_, c) => h(Text, { key: c, style: cellStyle(head, c) }, ...runsOf(cells[c] ?? [], l))),
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
  reference: string;
}

export function buildDocument({ printable, reference }: RenderInput): ReactElement {
  const l = L;

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
            // The reason is a note for the Polish reviewer, so it is not printed.
            `${i + 1}. ${l.page} ${spot.page}` + (spot.text.trim() ? ` – ${l.readable}: "${spot.text.trim()}"` : ''),
          ),
        ),
      )
    : null;

  return h(
    Document,
    { title: `${LETTERHEAD.companyName} ${reference}`, author: LETTERHEAD.companyName, creator: LETTERHEAD.companyName, producer: LETTERHEAD.companyName, language: 'en' },
    h(
      Page,
      { size: 'A4', style: s.page },
      h(View, { style: s.header, fixed: true }, h(Logo, null)),
      h(
        View,
        { style: s.pageNumber, fixed: true },
        h(Text, {
          render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) =>
            `${l.reference} ${reference}   ·   Page ${pageNumber} of ${totalPages}`,
        }),
      ),
      h(Footer, null),
      ...printable.blocks.map((b, i) => renderBlock(b, i, l)),
      annex,
    ),
  );
}

export async function renderPdf(input: RenderInput): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(buildDocument(input) as Parameters<typeof renderToBuffer>[0]);
}
