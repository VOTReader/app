/* notes-facts (zv1): the day words, meta lines and chips of v2 Notes, and readMarks() re-showing main's saved data
   (journal, highlights, notes, bookmarks, links) read only. */
import { describe, it, expect, vi } from 'vitest';
import { dayLabel, metaLine, marksOfKind, kindOf, kitColour, placeOfKey, readMarks, journalText, gateMarks, KINDS } from './notes-facts.js';
import { GATE_NOW } from './gate.js';

const DAY = 24 * 3600 * 1000;

describe('day words', () => {
  it('Today, Yesterday, a weekday this week, then "Oct 9" (the gate clock is a Wednesday)', () => {
    expect(dayLabel(GATE_NOW - 3600000, GATE_NOW)).toBe('Today');
    expect(dayLabel(GATE_NOW - DAY, GATE_NOW)).toBe('Yesterday');
    expect(dayLabel(GATE_NOW - 2 * DAY, GATE_NOW)).toBe('Monday');
    expect(dayLabel(GATE_NOW - 3 * DAY, GATE_NOW)).toBe('Sunday');
    expect(dayLabel(GATE_NOW - 5 * DAY, GATE_NOW)).toBe('Oct 9');
    expect(dayLabel(GATE_NOW - 12 * DAY, GATE_NOW)).toBe('Oct 2');
    expect(dayLabel(GATE_NOW - 365 * DAY, GATE_NOW)).toBe('Oct 14, 2025');
    expect(dayLabel(0, GATE_NOW)).toBe('');
  });

  it('meta lines join kind, place and day', () => {
    expect(metaLine({ kind: 'highlight', id: 'x', at: GATE_NOW, where: 'Volume One · Letter 1' }, GATE_NOW))
      .toBe('Highlight · Volume One · Letter 1 · Today');
    expect(metaLine({ kind: 'journal', id: 'x', at: GATE_NOW - DAY }, GATE_NOW)).toBe('Journal · Yesterday');
  });
});

describe('chips', () => {
  it('six kinds, Journal second; a chip lists its kind newest first', () => {
    expect(KINDS.map((k) => k.label)).toEqual(['All', 'Journal', 'Highlights', 'Notes', 'Bookmarks', 'Links']);
    const marks = gateMarks(GATE_NOW);
    expect(marksOfKind(marks, 'journal').map((m) => m.title))
      .toEqual(['On being set apart', 'Sunday with the family', 'Questions for this month']);
    expect(marksOfKind(marks, 'all').length).toBe(7);
    expect(marksOfKind(marks.slice(0, 5), 'all').map((m) => m.kind)).toEqual(['journal', 'highlight', 'note', 'bookmark', 'link']);
    expect(kindOf('bookmark')).toBe('bookmark');
    expect(kindOf('nope')).toBe('all');
    expect(kindOf(undefined)).toBe('all');
    expect(kitColour('yellow')).toBe('gold');
    expect(kitColour('green')).toBe('sage');
    expect(kitColour('pink')).toBe('rose');
    expect(kitColour(undefined)).toBe('gold');
  });
});

/** main's globals, as bundle-b/d leave them, with the reader's saved data. */
function env() {
  const writes = vi.fn();
  const store = (o) => ({ ...o, set: writes, update: writes, add: writes, remove: writes, _save: writes });
  return {
    writes,
    COLLECTIONS: [
      { volKey: 'one', label: 'Volume One', globalName: 'LETTERS_V1', prefaceGlobal: 'LETTERS_V1_PREFACE', letterScreen: 'vot-one-letter' },
      { volKey: 'wtlb1', label: 'Words to Live By One', globalName: 'WTLB_ONE', prefaceGlobal: null, letterScreen: 'wtlb-one-entry' },
    ],
    LETTERS_V1: [{ id: 'chosen-by-god', num: 1, title: 'Chosen by God' }, { id: 'honor-not', num: 2, title: 'Honor Not the Day of the Dead... Honor God' }],
    LETTERS_V1_PREFACE: { id: 'v1-preface', title: 'Preface' },
    WTLB_ONE: [{ id: 'w-12', num: 12, title: 'On Prayer' }],
    BIBLE_BOOK_LIST: [{ id: 'john', title: 'John' }, { id: 'matthew', title: 'Matthew' }],
    JournalStore: store({
      all: () => [
        { id: 'j1', title: 'On being set apart', blocks: [{ id: 'b1', type: 'p', text: 'What it asks of me.' }, { id: 'b2', type: 'image', mediaId: 'm' }], created: 1000, updated: 5000 },
        { id: 'j2', title: '', blocks: [{ id: 'b3', type: 'p', text: 'An untitled thought' }], created: 900, updated: 900 },
      ],
      get: (id) => (id === 'j1' ? { id: 'j1', title: 'On being set apart' } : null),
    }),
    _collectMarks: () => [
      { groupId: 'g1', kind: 'highlight', color: 'green', hlKey: 'letter:chosen-by-god:3', created: 4000, text: 'Many things you must overcome.' },
      { groupId: 'g2', kind: 'underline', color: 'yellow', hlKey: 'bible:john:3:16', created: 3000, text: 'For God so loved' },
      { groupId: 'g3', kind: 'highlight', hlKey: 'letter:x:1', created: 1, text: '' },
    ],
    NoteStore: store({ list: () => [{ groupId: 'n1', body: 'Read this again on Sunday.', fullText: 'Timothy, write as I speak.', keys: ['letter:chosen-by-god:1'], created: 2000 }] }),
    BookmarkStore: store({ all: () => [
      { id: 'k1', hlKey: 'letter:honor-not:0', label: '', created: 1500 },
      { id: 'k2', hlKey: 'study:matthew-5:3', label: 'Beatitudes', created: 1400 },
      { id: 'k3', hlKey: 'wtlb:w-12:2', label: '', created: 1300 },
    ] }),
    LinkStore: store({ all: () => [{ id: 'l1', source: { type: 'letter', key: 'letter:chosen-by-god:4', label: 'Chosen by God' },
      target: { type: 'bible', key: 'bible:john:15:16', label: 'John 15:16' }, created: 1200 }] }),
  };
}

describe('readMarks: main saved data, re-shown read only', () => {
  it('every journal entry, highlight, note, bookmark and link becomes one row', () => {
    const e = env();
    const { marks, pending } = readMarks(e);
    expect(pending).toBe(false);
    const by = Object.fromEntries(marks.map((m) => [m.id, m]));
    expect(by['journal:j1']).toMatchObject({ kind: 'journal', title: 'On being set apart', text: 'What it asks of me.', at: 5000, open: { place: 'journal-entry', id: 'j1' } });
    expect(by['journal:j2']).toMatchObject({ title: 'An untitled thought', text: '' });
    expect(by['hl:g1']).toMatchObject({ kind: 'highlight', colour: 'sage', where: 'Volume One · Letter 1', open: { place: 'letter', collection: 'one', n: 1 } });
    expect(by['hl:g2']).toMatchObject({ where: 'John 3:16', open: { place: 'bible-chapter', book: 'john', chapter: 3, verse: 16 } });
    expect(by['hl:g3']).toBe(undefined);
    expect(by['note:n1']).toMatchObject({ kind: 'note', quote: '“Timothy, write as I speak.”', note: 'Read this again on Sunday.', where: 'Volume One · Letter 1' });
    expect(by['bkm:k1']).toMatchObject({ kind: 'bookmark', title: 'Honor Not the Day of the Dead... Honor God', where: 'Volume One · Letter 2' });
    expect(by['bkm:k2']).toMatchObject({ title: 'Beatitudes', where: 'Matthew 5:3', open: { place: 'bible-chapter', book: 'matthew', chapter: 5, verse: 3 } });
    expect(by['bkm:k3']).toMatchObject({ title: 'On Prayer', where: 'Words to Live By One', open: null });
    expect(by['lnk:l1']).toMatchObject({ kind: 'link', title: 'Chosen by God, joined to John 15:16', where: 'Volume One · Letter 1' });
    expect(marks.length).toBe(9);
    expect(e.writes).not.toHaveBeenCalled();
  });

  it('a letter whose volume has not loaded yet is pending (its title comes after the load)', () => {
    const e = { ...env(), LETTERS_V1: undefined, __votCorpus: { loaded: false }, _bookmarkSourceLabel: (k) => k.split(':')[1] };
    const { marks, pending } = readMarks(e);
    expect(pending).toBe(true);
    expect(marks.find((m) => m.id === 'bkm:k1').title).toBe('honor-not');
  });

  it('no stores at all (a shell without bundle-b) is simply nothing marked', () => {
    expect(readMarks({})).toEqual({ marks: [], pending: false });
  });

  it('places: a preface, a journal block, an unknown key', () => {
    const e = env();
    expect(placeOfKey('letter:v1-preface:2', e)).toMatchObject({ where: 'Volume One', title: 'Preface' });
    expect(placeOfKey('journal:j1:b1', e)).toMatchObject({ where: 'Journal · On being set apart', open: { place: 'journal-entry', id: 'j1' } });
    expect(placeOfKey('mystery:1', e)).toMatchObject({ where: '', open: null });
    expect(journalText({ blocks: [{ type: 'p', text: ' a ' }, { type: 'image' }, { type: 'p', text: 'b\n c' }] })).toBe('a b c');
  });
});
