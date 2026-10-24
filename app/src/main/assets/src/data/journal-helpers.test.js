/* Journal card resolvers — the "Card vs Excerpt" contract (2026-07-14).
   ────────────────────────────────────────────────────────────────────
   A plain Card embeds a TITLE only. It used to derive a truncated preview
   of the letter's opening paragraph and render it with a "Show more" button
   that revealed nothing (the text was already clipped at the source) — the
   owner-reported "lying show more". Embedding body text is the Excerpt flow.
   Note cards now title themselves by their annotation source. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { JournalHelpers } from './journal-helpers.js';

// The code under test imports these; the test stubs them as globals (bridge-imports, v15-code-health-04).
vi.mock('./scripture-resolution.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get COL_BY_KEY() { return /** @type {any} */ (globalThis).COL_BY_KEY; }, get findEntryContext() { return /** @type {any} */ (globalThis).findEntryContext; } }; });
vi.mock('../stores/note-store.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get NoteStore() { return /** @type {any} */ (globalThis).NoteStore; } }; });

const g = /** @type {any} */ (globalThis);

describe('resolveLetterCard — Card embeds a title, Excerpt embeds text', () => {
  beforeEach(() => {
    g.COL_BY_KEY = new Map([
      ['wtlb-two', { label: 'Words to Live By: Part Two', kind: 'wtlb' }],
    ]);
    g.findEntryContext = () => ({
      title: 'Impasse',
      entry: {
        title: 'Impasse',
        paragraphs: [{ text: 'When My servants come to an impasse in My Word, according to their own understanding, what is their reaction? They continue on, without hindrance or doubt, for their relationship...' }],
      },
    });
  });
  afterEach(() => { delete g.COL_BY_KEY; delete g.findEntryContext; });

  it('a plain Card carries NO body — the title is the whole card', () => {
    const lc = JournalHelpers.resolveLetterCard('wtlb-two', 'impasse');
    expect(lc).toBeTruthy();
    expect(lc.title).toBe('Impasse');
    expect(lc.eyebrow).toBe('Words to Live By: Part Two');
    expect(lc.body).toBe('');          // no derived opening-paragraph text
    expect(lc.isExcerpt).toBeFalsy();
  });

  it('an Excerpt card keeps the user-chosen text as its body', () => {
    const lc = JournalHelpers.resolveLetterCard('wtlb-two', 'impasse', 'the chosen words');
    expect(lc.isExcerpt).toBe(true);
    expect(lc.body).toContain('the chosen words');
  });
});

describe('resolveNoteCard — titles by annotation source', () => {
  beforeEach(() => {
    g.NoteStore = { get: () => ({ groupId: 'n1', body: 'my reflection', fullText: 'anchor', keys: ['bible:genesis:1:1'] }) };
    g.noteSourceLabel = () => 'Genesis 1:1';
  });
  afterEach(() => { delete g.NoteStore; delete g.noteSourceLabel; });

  it('the card title names the annotation source, not a generic "Note"', () => {
    const nc = JournalHelpers.resolveNoteCard('n1');
    expect(nc.title).toBe('Genesis 1:1');
    expect(nc.eyebrow).toBe('My Note');
    expect(nc.body).toBe('my reflection');
  });

  it('falls back to "Note" when no source label helper is present', () => {
    delete g.noteSourceLabel;
    const nc = JournalHelpers.resolveNoteCard('n1');
    expect(nc.title).toBe('Note');
  });
});

/* shortTime — spelled-out meridiem (Wave 0 timestamp fix).
   Every render site (.jrn-card-date / .jrn-editor-date / .jrn-viewer-date)
   is text-transform:uppercase, so the old terse 'p'/'a' rendered as a lone
   "4:53P" that read as a typo. The util now emits "4:53 PM" directly. */
describe('shortTime — spelled-out AM/PM meridiem', () => {
  it('renders "h:MM AM/PM" — no terse p/a suffix', () => {
    expect(JournalHelpers.shortTime(new Date(2026, 4, 14, 16, 53).getTime())).toBe('4:53 PM');
    expect(JournalHelpers.shortTime(new Date(2026, 4, 14, 9, 8).getTime())).toBe('9:08 AM');
  });

  it('12-hour edge cases: midnight is 12 AM, noon is 12 PM', () => {
    expect(JournalHelpers.shortTime(new Date(2026, 4, 14, 0, 5).getTime())).toBe('12:05 AM');
    expect(JournalHelpers.shortTime(new Date(2026, 4, 14, 12, 0).getTime())).toBe('12:00 PM');
  });

  it('falsy timestamp stays empty', () => {
    expect(JournalHelpers.shortTime(0)).toBe('');
    expect(JournalHelpers.shortTime(undefined)).toBe('');
  });
});

/* id-datasafe2 161: the editor's B / I / Scripture row marks a selection in the viewer's markup. */
describe('formatSelection — B / I / Scripture marks', () => {
  const f = JournalHelpers.formatSelection;

  it('wraps the words and keeps the selection on them', () => {
    expect(f('a word here', 2, 6, 'bold')).toEqual({ text: 'a **word** here', start: 4, end: 8 });
    expect(f('a word here', 2, 6, 'italic')).toEqual({ text: 'a _word_ here', start: 3, end: 7 });
    expect(f('see John 3:16 now', 4, 13, 'ref')).toEqual({ text: 'see {{ref:John 3:16}} now', start: 10, end: 19 });
  });

  it('leaves the spaces a selection caught outside the marks', () => {
    expect(f('a word here', 1, 7, 'bold').text).toBe('a **word** here');
  });

  it('takes the marks off marked words, selected inside or with the marks', () => {
    expect(f('a **word** here', 4, 8, 'bold')).toEqual({ text: 'a word here', start: 2, end: 6 });
    expect(f('a **word** here', 2, 10, 'bold')).toEqual({ text: 'a word here', start: 2, end: 6 });
    expect(f('a _word_ here', 3, 7, 'italic').text).toBe('a word here');
    expect(f('{{ref:John 3:16}}', 6, 15, 'ref').text).toBe('John 3:16');
  });

  it('italic marks each line; Scripture never crosses a line; bold spans lines', () => {
    expect(f('one\ntwo', 0, 7, 'italic').text).toBe('_one_\n_two_');
    expect(f('one\n\ntwo', 0, 8, 'italic').text).toBe('_one_\n\n_two_');
    expect(f('John 3:16\nJohn 3:17', 0, 19, 'ref')).toBeNull();
    expect(f('one\ntwo', 0, 7, 'bold').text).toBe('**one\ntwo**');
  });

  it('nothing to mark: an empty or all-space selection, an unknown kind', () => {
    expect(f('a word', 3, 3, 'bold')).toBeNull();
    expect(f('a   b', 1, 4, 'bold')).toBeNull();
    expect(f('a word', 0, 6, 'underline')).toBeNull();
  });

  it('what it writes is what the viewer renders', () => {
    const out = f('one\ntwo', 0, 7, 'italic').text;
    expect(out.match(/_([^_\n]+?)_/g)).toEqual(['_one_', '_two_']);
  });
});
