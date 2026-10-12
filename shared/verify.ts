// Deterministic checks of a model transcription against the source document. No model is involved here:
// everything below is plain string and token comparison, so a passing check means the text really is in the source.
//
// - verifyAgainstSource: every transcribed run must appear in the source text (PDF text layer / DOCX text).
// - findOmissions:       every source line must be accounted for in the transcription (kept or marked for removal).
// - compareWithSecondPass: for scans and photos, values of the first transcription must be confirmed by an
//                          independent second transcription.
// - structuralWarnings:  illegible spots, omitted figures, model notes and possible leaks of supplier data.
// - englishWarnings:     the English version printed in the PDF keeps every number and symbol of the transcription;
//                        translations, corrections and anything not in English go to the reviewer.

import {
  printedText,
  runLists,
  type Block,
  type Extraction,
  type Run,
  type RunRef,
  type Warning,
  type WarningKind,
} from './schema.js';

const MAX_WARNINGS_PER_KIND = 40;

export function normalize(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/\u00AD/g, '')
    .replace(/[\u2010-\u2015\u2212\uFE58\uFE63\uFF0D]/g, '-')
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, ' ')
    .toLowerCase();
}

/** Text without any whitespace: makes substring checks immune to line breaks and column layout. */
export function compact(s: string): string {
  return normalize(s).replace(/\s+/g, '');
}

// Words and numbers (a number keeps its decimal / thousands separators: "4.0", "1,5", "10 000" → "10", "000"),
// plus the symbols that change the meaning of a value.
const TOKEN_RE = /[\p{L}\p{N}]+(?:[.,/][\p{N}]+)*|[<>≤≥±%°=+]/gu;

export function tokens(s: string): string[] {
  return normalize(s).match(TOKEN_RE) ?? [];
}

export const isNumeric = (t: string) => /\p{N}/u.test(t);

/** Tokens worth checking for omissions: numbers, symbols and words of 2+ characters. */
const isSignificant = (t: string) => isNumeric(t) || /[<>≤≥±%°=]/.test(t) || t.length >= 2;

// Page furniture that is legitimately left out of the transcription.
const IGNORABLE_LINE =
  /^\s*((page|strona|seite|página|pagina|side)\s*\d+(\s*(of|z|von|de|di|\/)\s*\d+)?|\d+\s*(\/|of|z)\s*\d+|\d+)\s*$/i;

interface Collector {
  list: Warning[];
  counts: Partial<Record<WarningKind, number>>;
  overflow: Partial<Record<WarningKind, number>>;
}

function collector(): Collector {
  return { list: [], counts: {}, overflow: {} };
}

function add(
  c: Collector,
  kind: WarningKind,
  message: string,
  extra: { page?: number | null; ref?: RunRef | null; excerpt?: string | null } = {},
) {
  const count = c.counts[kind] ?? 0;
  if (count >= MAX_WARNINGS_PER_KIND) {
    c.overflow[kind] = (c.overflow[kind] ?? 0) + 1;
    return;
  }
  c.counts[kind] = count + 1;
  c.list.push({
    id: '',
    kind,
    message,
    page: extra.page ?? null,
    ref: extra.ref ?? null,
    excerpt: extra.excerpt ?? null,
    status: 'open',
    resolvedBy: null,
    resolvedAt: null,
  });
}

function finish(c: Collector): Warning[] {
  for (const [kind, extra] of Object.entries(c.overflow) as [WarningKind, number][]) {
    c.list.push({
      id: '',
      kind,
      message: `…oraz ${extra} kolejnych ostrzeżeń tego typu. Porównaj cały dokument z oryginałem.`,
      page: null,
      ref: null,
      excerpt: null,
      status: 'open',
      resolvedBy: null,
      resolvedAt: null,
    });
  }
  return c.list;
}

const shorten = (s: string, max = 120) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};

interface PageIndex {
  compact: string[];
  dehyphenated: string[];
  streams: string[][];
}

function indexPages(pages: string[]): PageIndex {
  return {
    compact: pages.map(compact),
    // "Natrium-\ncaseinat" in the text layer is "Natriumcaseinat" in the transcription.
    dehyphenated: pages.map((p) => compact(p.replace(/(\p{L})-\s*\n\s*(\p{L})/gu, '$1$2'))),
    streams: pages.map(tokens),
  };
}

const MAX_GAP = 3;

/** True when `needle` occurs in `stream` in the same order, with at most MAX_GAP foreign tokens between neighbours. */
export function inOrder(needle: string[], stream: string[]): boolean {
  if (!needle.length) return true;
  for (let start = 0; start < stream.length; start++) {
    if (stream[start] !== needle[0]) continue;
    let pos = start;
    let ok = true;
    for (let k = 1; k < needle.length && ok; k++) {
      let found = -1;
      for (let j = pos + 1; j <= Math.min(pos + 1 + MAX_GAP, stream.length - 1); j++) {
        if (stream[j] === needle[k]) {
          found = j;
          break;
        }
      }
      if (found < 0) ok = false;
      else pos = found;
    }
    if (ok) return true;
  }
  return false;
}

interface Located {
  ok: boolean;
  /** Tokens of the run that do not occur on the nearby pages at all. */
  missing: string[];
}

/**
 * Finds a run in the source: as a whole (ignoring whitespace), or as its tokens in the same order close together.
 * Tokens that merely exist somewhere on the page are not enough: "min. 4.0 %" must not pass because "min" and
 * "4.0" appear in different rows.
 */
function locate(text: string, index: PageIndex, page: number): Located {
  const c = compact(text);
  const pages = nearbyPages(index, page);
  if (pages.some((p) => index.compact[p].includes(c) || index.dehyphenated[p].includes(c))) return { ok: true, missing: [] };
  const runTokens = tokens(text);
  const stream = pages.sort((a, b) => a - b).flatMap((p) => index.streams[p]);
  if (inOrder(runTokens, stream)) return { ok: true, missing: [] };
  const local = new Set(stream);
  return { ok: false, missing: [...new Set(runTokens.filter((t) => !local.has(t)))] };
}

/** Pages a block may come from: its own page and the neighbours (tables and paragraphs run across pages). */
function nearbyPages(index: PageIndex, page: number): number[] {
  const out: number[] = [];
  for (const p of [page - 1, page - 2, page]) if (p >= 0 && p < index.compact.length) out.push(p);
  return out.length ? out : index.compact.map((_, i) => i);
}

function* eachRun(extraction: Extraction): Generator<{ block: Block; run: Run; ref: RunRef }> {
  for (const block of extraction.blocks) {
    for (const loc of runLists(block)) {
      for (let i = 0; i < loc.runs.length; i++) {
        yield { block, run: loc.runs[i], ref: { blockId: block.id, cell: loc.cell, run: i } };
      }
    }
  }
}

/**
 * Every run that will be printed (text, readable part of an illegible spot) must be found in the source text,
 * either as a whole or token by token on the same page or a neighbouring one.
 */
export function verifyAgainstSource(extraction: Extraction, sourcePages: string[]): Warning[] {
  const c = collector();
  const index = indexPages(sourcePages);
  for (const { block, run, ref } of eachRun(extraction)) {
    if (run.kind === 'redact' || !compact(run.text)) continue;
    const { ok, missing } = locate(run.text, index, block.page);
    if (ok) continue;
    const detail = missing.length
      ? `brak: ${missing.slice(0, 6).join(', ')}`
      : 'słowa występują w źródle, ale w innym miejscu lub innej kolejności';
    add(c, 'unverified', `Fragment „${shorten(run.text, 80)}” nie występuje w dokumencie źródłowym (${detail}).`, {
      page: block.page,
      ref,
      excerpt: run.text,
    });
  }
  return finish(c);
}

/** Every token of the transcription, including fragments marked for removal and readable parts of illegible spots. */
function outputTokens(extraction: Extraction): Set<string> {
  const out = new Set<string>();
  for (const { run } of eachRun(extraction)) for (const t of tokens(run.text)) out.add(t);
  return out;
}

/**
 * Source lines whose content is missing from the transcription: a missing number, or at least half of the words.
 * Consecutive flagged lines on a page are reported together.
 */
export function findOmissions(extraction: Extraction, sourcePages: string[], label = 'dokumentu źródłowego'): Warning[] {
  const c = collector();
  const present = outputTokens(extraction);
  sourcePages.forEach((pageText, p) => {
    let group: string[] = [];
    const flush = () => {
      if (!group.length) return;
      add(c, 'possibly_omitted', `Treść z ${label} (str. ${p + 1}) nie została znaleziona w wyniku.`, {
        page: p + 1,
        excerpt: shorten(group.join('\n'), 400),
      });
      group = [];
    };
    for (const line of pageText.split(/\n+/)) {
      if (!line.trim() || IGNORABLE_LINE.test(line)) {
        flush();
        continue;
      }
      const significant = tokens(line).filter(isSignificant);
      if (!significant.length) continue;
      const missing = significant.filter((t) => !present.has(t));
      const missesNumber = missing.some(isNumeric);
      if (missesNumber || missing.length / significant.length >= 0.5) group.push(line.trim());
      else flush();
    }
    flush();
  });
  return finish(c);
}

// Words that flip the meaning of a value; a disagreement on them is as serious as on a number.
const CRITICAL_WORDS = new Set([
  'min', 'max', 'maks', 'not', 'no', 'nie', 'less', 'more', 'than', 'below', 'above', 'under', 'over', 'absent',
  'present', 'negative', 'positive', 'detected', 'nieobecny', 'nieobecne', 'obecny', 'ujemny', 'dodatni', 'brak',
  'nicht', 'kein', 'keine', 'nachweisbar', 'free', 'without', 'with', 'bez', 'poniżej', 'powyżej',
]);

/**
 * Scans and photos have no text layer to compare against, so the first transcription is checked against an
 * independent second one. Numbers, symbols and meaning-changing words that the second reading does not confirm
 * are reported as uncertain.
 */
export function compareWithSecondPass(extraction: Extraction, secondPass: string[]): Warning[] {
  const c = collector();
  const index = indexPages(secondPass);
  for (const { block, run, ref } of eachRun(extraction)) {
    if (run.kind === 'redact' || !compact(run.text)) continue;
    const { ok, missing } = locate(run.text, index, block.page);
    if (ok) continue;
    const runTokens = tokens(run.text);
    const critical = missing.filter((t) => isNumeric(t) || /[<>≤≥±%°=]/.test(t) || CRITICAL_WORDS.has(t));
    const words = runTokens.filter((t) => !isNumeric(t));
    const missingWords = missing.filter((t) => !isNumeric(t));
    // Spelling differences between two readings of ordinary words are noise; values, symbols, meaning-changing
    // words and a different order of the same tokens are not.
    const reordered = missing.length === 0;
    if (!reordered && critical.length === 0 && (words.length === 0 || missingWords.length / words.length < 0.3)) continue;
    const detail = reordered ? 'inna kolejność lub kontekst' : `różnice: ${(critical.length ? critical : missing).slice(0, 6).join(', ')}`;
    add(c, 'uncertain', `Odczyt „${shorten(run.text, 80)}” nie został potwierdzony drugim, niezależnym odczytem (${detail}).`, {
      page: block.page,
      ref,
      excerpt: run.text,
    });
  }
  return finish(c);
}

/** Warnings that follow from the transcription itself. */
export function structuralWarnings(extraction: Extraction): Warning[] {
  const c = collector();
  for (const { block, run, ref } of eachRun(extraction)) {
    if (run.kind !== 'illegible') continue;
    const partial = run.text.trim() ? ` Odczytano częściowo: „${shorten(run.text, 60)}”.` : '';
    add(c, 'illegible', `Nieczytelny fragment${run.reason ? ` (${run.reason})` : ''}.${partial}`, {
      page: block.page,
      ref,
    });
  }
  for (const block of extraction.blocks) {
    if (block.type !== 'figure') continue;
    const caption = (block.runs ?? []).map((r) => r.text).join('').trim();
    add(
      c,
      'figure_omitted',
      `Grafika, wykres lub zdjęcie ze str. ${block.page} nie jest przenoszone do wyniku${caption ? ` (podpis: „${shorten(caption, 60)}”)` : ''}. Sprawdź, czy nie zawiera danych technicznych.`,
      { page: block.page },
    );
  }
  for (const note of extraction.notes) add(c, 'model_note', note);
  for (const w of findLeaks(extraction)) c.list.push(w);
  return finish(c);
}

/**
 * A fragment marked for removal that still appears in printed text (e.g. the supplier name inside a sentence).
 */
export function findLeaks(extraction: Extraction): Warning[] {
  const c = collector();
  const needles = new Set<string>();
  for (const { run } of eachRun(extraction)) {
    if (run.kind !== 'redact' || run.category === 'commercial_terms') continue;
    const n = normalize(run.text).replace(/\s+/g, ' ').trim();
    // Short or purely numeric fragments (e.g. a phone extension) would match everywhere.
    if (n.length >= 4 && /\p{L}/u.test(n)) needles.add(n);
  }
  if (!needles.size) return [];
  for (const { block, run, ref } of eachRun(extraction)) {
    if (run.kind === 'redact') continue;
    const hay = normalize(`${run.text} ${printedText(run)}`).replace(/\s+/g, ' ');
    const hit = [...needles].find((n) => hay.includes(n));
    if (hit) {
      add(c, 'possible_leak', `Tekst „${shorten(hit, 60)}” został oznaczony do usunięcia, ale występuje też w tym miejscu.`, {
        page: block.page,
        ref,
      });
    }
  }
  return finish(c);
}

// Numbers as written (decimal and thousands separators kept), independent of the words around them: "25kg" → "25".
const NUMBER_RE = /\p{N}+(?:[.,]\p{N}+)*/gu;
const SYMBOL_RE = /[<>≤≥±%=]/gu;
// Letters of other alphabets or with diacritics (µ is a unit prefix, not a word).
const NON_ENGLISH_LETTER = /(?![µμ])[^\P{L}a-zA-Z]/u;

const valueSet = (s: string) => new Set([...(normalize(s).match(NUMBER_RE) ?? []), ...(normalize(s).match(SYMBOL_RE) ?? [])]);
const difference = (a: Set<string>, b: Set<string>) => [...a].filter((x) => !b.has(x));

/**
 * Checks of the English version against the verbatim transcription. Nothing a model wrote in English is trusted on
 * its own: copies must really be part of the original, values must be the same, and every translation, correction
 * or skipped duplicate needs a person's confirmation.
 */
export function englishWarnings(extraction: Extraction): Warning[] {
  const c = collector();
  for (const { block, run, ref } of eachRun(extraction)) {
    // Removed runs are not printed; documents processed before the English version have no `en_how`.
    if (run.kind === 'redact' || !run.en_how) continue;
    const en = run.en ?? '';
    const where = { page: block.page, ref, excerpt: run.text };
    switch (run.en_how) {
      case 'english_part':
        if (en.trim() && !compact(run.text).includes(compact(en))) {
          add(c, 'english_check', `Tekst angielski „${shorten(en, 80)}” nie występuje w oryginale „${shorten(run.text, 80)}”.`, where);
        }
        break;
      case 'corrected':
        add(c, 'english_check', `Poprawiona pisownia: „${shorten(run.text, 80)}” → „${shorten(en, 80)}”.`, where);
        break;
      case 'translated':
        add(c, 'translated', `„${shorten(run.text, 80)}” → „${shorten(en, 80)}”.`, where);
        break;
      case 'duplicate': {
        // Every value of the skipped run must be printed in the English text of the same block.
        const neighbours = valueSet(runLists(block).flatMap((l) => l.runs.filter((r) => r.kind !== 'redact').map(printedText)).join(' '));
        const lost = difference(valueSet(run.text), neighbours);
        add(
          c,
          'english_check',
          `Pominięte jako powtórzenie tekstu angielskiego obok: „${shorten(run.text, 80)}”.${lost.length ? ` Wartości ${lost.slice(0, 6).join(', ')} nie występują w tekście angielskim tego bloku.` : ''}`,
          where,
        );
        continue;
      }
    }
    if (run.en_how !== 'same' && run.text.trim() && !en.trim()) {
      add(c, 'english_check', `Brak wersji angielskiej dla „${shorten(run.text, 80)}”.`, where);
      continue;
    }
    if (run.en_how !== 'same') {
      const original = valueSet(run.text);
      const english = valueSet(en);
      const added = difference(english, original);
      const missing = difference(original, english);
      if (added.length || missing.length) {
        const detail = [missing.length ? `brak: ${missing.join(', ')}` : '', added.length ? `dodane: ${added.join(', ')}` : ''].filter(Boolean).join('; ');
        add(c, 'english_check', `Liczby lub symbole w wersji angielskiej różnią się od oryginału (${detail}).`, where);
      }
    }
    const printed = printedText(run);
    if (NON_ENGLISH_LETTER.test(printed)) {
      add(c, 'english_check', `Tekst do druku zawiera znaki spoza alfabetu angielskiego: „${shorten(printed, 80)}”.`, where);
    }
  }
  return finish(c);
}

/** Gives warnings stable ids in reading order. */
export function numberWarnings(warnings: Warning[]): Warning[] {
  return warnings.map((w, i) => ({ ...w, id: `w${i + 1}` }));
}
