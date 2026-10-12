// Changes a person makes on the review screen. Pure functions: the API applies them and logs the returned event.

import {
  REDACTION_CATEGORIES,
  type Block,
  findRun,
  sameRef,
  type Extraction,
  type RedactionCategory,
  type Run,
  type RunRef,
  type Warning,
} from './schema.js';

export type ReviewAction =
  | { action: 'ack'; warningIds: string[] }
  | { action: 'edit'; ref: RunRef; text: string }
  | { action: 'restore'; ref: RunRef }
  | { action: 'redact'; ref: RunRef; category: RedactionCategory }
  /** Adds text the transcription missed as a new paragraph (e.g. from a "possibly omitted" warning). */
  | { action: 'insert'; afterBlockId: string | null; page: number; text: string; warningId?: string };

export interface ReviewResult {
  extraction: Extraction;
  warnings: Warning[];
  event: { kind: string; payload: Record<string, unknown> };
}

export class ReviewError extends Error {}

function cloneRun(extraction: Extraction, ref: RunRef): { extraction: Extraction; run: Run } {
  const copy = structuredClone(extraction);
  const run = findRun(copy, ref);
  if (!run) throw new ReviewError('Nie znaleziono wskazanego fragmentu dokumentu.');
  return { extraction: copy, run };
}

export function applyReview(extraction: Extraction, warnings: Warning[], change: ReviewAction, actorId: string, now = new Date()): ReviewResult {
  const resolvedAt = now.toISOString();
  switch (change.action) {
    case 'ack': {
      const ids = new Set(change.warningIds);
      const found = warnings.filter((w) => ids.has(w.id) && w.status === 'open');
      if (!found.length) throw new ReviewError('Te ostrzeżenia zostały już rozpatrzone.');
      return {
        extraction,
        warnings: warnings.map((w) => (ids.has(w.id) && w.status === 'open' ? { ...w, status: 'acknowledged', resolvedBy: actorId, resolvedAt } : w)),
        event: { kind: 'ack_warning', payload: { warnings: found.map((w) => ({ id: w.id, kind: w.kind, message: w.message })) } },
      };
    }
    case 'edit': {
      const text = change.text.replace(/\r\n?/g, '\n');
      if (text.length > 5000) throw new ReviewError('Tekst jest zbyt długi.');
      const { extraction: next, run } = cloneRun(extraction, change.ref);
      const before = { ...run };
      run.kind = 'text';
      run.category = null;
      run.reason = null;
      if (run.en_how) {
        // The person corrects what is printed (the English version); the verbatim transcription stays for the record.
        run.en = text;
        run.en_how = 'edited';
      } else {
        run.text = text;
      }
      return {
        extraction: next,
        // A corrected fragment resolves every open warning that points at it.
        warnings: warnings.map((w) => (w.status === 'open' && sameRef(w.ref, change.ref) ? { ...w, status: 'edited', resolvedBy: actorId, resolvedAt } : w)),
        event: { kind: 'edit', payload: { ref: change.ref, before, after: { ...run } } },
      };
    }
    case 'restore': {
      const { extraction: next, run } = cloneRun(extraction, change.ref);
      if (run.kind !== 'redact') throw new ReviewError('Ten fragment nie jest oznaczony do usunięcia.');
      const before = { ...run };
      run.kind = 'text';
      run.category = null;
      run.reason = null;
      return { extraction: next, warnings, event: { kind: 'restore_redaction', payload: { ref: change.ref, before } } };
    }
    case 'redact': {
      if (!REDACTION_CATEGORIES.includes(change.category)) throw new ReviewError('Nieznana kategoria usunięcia.');
      const { extraction: next, run } = cloneRun(extraction, change.ref);
      if (run.kind === 'redact') throw new ReviewError('Ten fragment jest już oznaczony do usunięcia.');
      const before = { ...run };
      run.kind = 'redact';
      run.category = change.category;
      run.reason = 'oznaczone ręcznie';
      return {
        extraction: next,
        // Removing a flagged fragment settles its warnings: it will not be printed.
        warnings: warnings.map((w) => (w.status === 'open' && sameRef(w.ref, change.ref) ? { ...w, status: 'edited', resolvedBy: actorId, resolvedAt } : w)),
        event: { kind: 'add_redaction', payload: { ref: change.ref, before, category: change.category } },
      };
    }
    case 'insert': {
      const text = change.text.replace(/\r\n?/g, '\n').trim();
      if (!text) throw new ReviewError('Wpisz tekst do dodania.');
      if (text.length > 5000) throw new ReviewError('Tekst jest zbyt długi.');
      const next = structuredClone(extraction);
      const at = change.afterBlockId === null ? 0 : next.blocks.findIndex((b) => b.id === change.afterBlockId) + 1;
      if (at === 0 && change.afterBlockId !== null) throw new ReviewError('Nie znaleziono miejsca wstawienia.');
      const used = next.blocks.map((b) => Number(b.id.match(/^u(\d+)$/)?.[1] ?? 0));
      const block: Block = {
        id: `u${Math.max(0, ...used) + 1}`,
        type: 'paragraph',
        page: Math.max(1, Math.round(change.page)),
        level: null,
        runs: [{ kind: 'text', text, category: null, reason: null }],
        items: null,
        rows: null,
        header: null,
        body: null,
      };
      next.blocks.splice(at, 0, block);
      return {
        extraction: next,
        warnings: warnings.map((w) => (w.status === 'open' && w.id === change.warningId ? { ...w, status: 'edited', resolvedBy: actorId, resolvedAt } : w)),
        event: { kind: 'insert', payload: { blockId: block.id, afterBlockId: change.afterBlockId, text, warningId: change.warningId ?? null } },
      };
    }
  }
}
