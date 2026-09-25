// @ts-nocheck - store globals stubbed per test
/* n4-02 (sweep 2): a corpus edit that inserted or removed a block moved readers'
   marks onto other words (c62, 'Regarding Spiritual Gifts'). The remap moves a
   mark only along a move history proves (stores/mark-shifts.js), and only when
   its recorded words sit there at their own offsets. The refuter's five breaks
   of the first version are pinned here (R1-R5). */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { remapCorpusMarkData, remapCorpusMarks, _resetCorpusRemap } from './corpus-mark-remap.js';
import { MARK_SHIFTS } from './mark-shifts.js';

/** An entry on screen from its blocks' words (textContent = the recorded form). */
function entry(prefix, paras, opts = {}) {
  const keyed = (n) => n < paras.length && !(opts.unkeyed || []).includes(n);
  return {
    prefix,
    count: opts.count == null ? paras.length : opts.count,
    view: (n) => (keyed(n) ? { text: paras[n], at: Array.from(paras[n], (_c, i) => i) } : null),
  };
}

const OLD = [
  'Beloved, hear what the Spirit says to the churches.',
  'The gifts are given to each one for the good of all.',
  'Some prophesy, some teach, and some serve in love.',
  'Desire earnestly the best gifts, yet show a more excellent way.',
];
// c62's shape: one block inserted near the top; the rest unchanged below it.
const NEW = [OLD[0], 'A paragraph the site added in its revision.', OLD[1], OLD[2], OLD[3]];
const P = 'wtlb:gifts:';
const SHIFTS = { [P]: [1, 2, 2, 3, 3, 4] };

/** A segment made on OLD[n] over `words`. */
function seg(n, words, extra = {}) {
  const start = OLD[n].indexOf(words);
  return { id: 'h' + n, groupId: 'g' + n, start, end: start + words.length, text: words, color: 'yellow', created: 100, ...extra };
}
const run = (paras, data, shifts = SHIFTS, opts) => remapCorpusMarkData([entry(P, paras, opts)], data, shifts);

describe('remapCorpusMarkData - a mark goes back to its words along a proven move', () => {
  it('a block inserted above: the mark moves to where its unchanged block went', () => {
    const a = seg(2, 'some teach, and some serve');
    const out = run(NEW, { annotations: { [P + '2']: [a] } });
    expect(out.moved).toBe(1);
    expect(out.annotations[P + '3']).toEqual([a]);
    expect(P + '2' in out.annotations).toBe(false);
  });

  it('a mark whose block still holds its words stays (made on today\'s text), nothing written', () => {
    const a = { id: 'h', groupId: 'g', start: 2, end: 11, text: 'paragraph', created: 1 };   // made on NEW[1]
    const out = run(NEW, { annotations: { [P + '1']: [a] } });
    expect(out.annotations).toBeUndefined();
  });

  it('a key no listed move covers is never touched, even with its words elsewhere', () => {
    const a = seg(3, 'show a more excellent way');
    const out = run(NEW, { annotations: { [P + '0']: [{ ...a, start: 0, end: 25 }] } });
    expect(out.annotations).toBeUndefined();
    const out2 = run(NEW, { annotations: { [P + '2']: [seg(2, 'some teach, and some serve')] } }, {});
    expect(out2.annotations).toBeUndefined();   // an entry with no listed moves at all
  });

  it('R1: words that sit in the target at OTHER offsets (footnote digits, a trailing ref) do not move it', () => {
    const a = { ...seg(2, 'some teach, and some serve'), start: 0, end: 26 };
    const out = run(NEW, { annotations: { [P + '2']: [a] } });
    expect(out.annotations).toBeUndefined();
  });

  it('R2: a whole-entry link end (a title, no words) and a bookmark (a label) never move', () => {
    const link = { id: 'l1', source: { key: 'bible:rom:12:6', text: 'x', start: 0, end: 1 }, target: { key: P + '2', label: 'Some prophesy, some teach' }, created: 7 };
    const bk = { id: 'b1', hlKey: P + '2', label: 'Some prophesy, some teach, and some serve in love.', created: 9 };
    const out = run(NEW, { links: [link], bookmarks: [bk] });
    expect(out.links).toBeUndefined();
    expect(out.bookmarks).toBeUndefined();
  });

  it('R4: short words move only along a proven move at their own offsets', () => {
    const the = { id: 'h', groupId: 'g', start: 4, end: 9, text: 'gifts', created: 1 };   // OLD[1] 'The gifts...'
    expect(run(NEW, { annotations: { [P + '1']: [the] } }).annotations[P + '2']).toEqual([the]);
    const off = { ...the, start: 0, end: 5 };                                                  // not at its offsets anywhere
    expect(run(NEW, { annotations: { [P + '1']: [off] } }).annotations).toBeUndefined();
  });

  it('R5: two listed targets that both hold the words leave the mark where it is', () => {
    const refrain = 'Says The Lord.';
    const paras = ['New first.', refrain, 'body', refrain];
    const a = { id: 'h', groupId: 'g', start: 0, end: refrain.length, text: refrain, created: 1 };
    const out = remapCorpusMarkData([entry(P, paras)], { annotations: { [P + '0']: [a] } }, { [P]: [0, 1, 0, 3] });
    expect(out.annotations).toBeUndefined();
  });

  it('a key past the end of a shrunk entry moves along its listed move', () => {
    const shrunk = [OLD[1], OLD[2], OLD[3]];
    const a = seg(3, 'show a more excellent way');
    const out = remapCorpusMarkData([entry(P, shrunk)], { annotations: { [P + '3']: [a] } }, { [P]: [3, 2] });
    expect(out.annotations[P + '2']).toEqual([a]);
  });

  it('r2: a listed position whose block has no key today (a heading) goes straight to the target check', () => {
    const a = seg(2, 'some teach, and some serve');
    expect(run(NEW, { annotations: { [P + '2']: [a] } }, SHIFTS, { unkeyed: [2] }).annotations[P + '3']).toEqual([a]);
    const off = { ...a, start: 0, end: a.text.length };                                      // not at its offsets there: stays
    expect(run(NEW, { annotations: { [P + '2']: [off] } }, SHIFTS, { unkeyed: [2] }).annotations).toBeUndefined();
  });

  it('a note follows its segment; a link end with its range moves', () => {
    const a = seg(2, 'some teach, and some serve');
    const note = { groupId: 'g2', keys: [P + '2'], fullText: a.text, body: 'mine', updated: 500 };
    const link = { id: 'l1', source: { key: P + '2:' + a.start + '-' + a.end, text: a.text }, target: { key: 'bible:rom:12:6' }, created: 7 };
    const out = run(NEW, { annotations: { [P + '2']: [a] }, notes: { g2: note }, links: [link] });
    expect(out.notes.g2.keys).toEqual([P + '3']);
    expect(out.notes.g2.updated).toBe(500.5);
    expect(out.links[0].source.key).toBe(P + '3:' + a.start + '-' + a.end);
    expect(out.links[0].target).toBe(link.target);
  });

  it('keys of other entries, the journal and the Bible are left alone', () => {
    const a = seg(2, 'some teach, and some serve');
    const out = run(NEW, { annotations: { 'wtlb:other:2': [a], 'journal:j1:2': [a], 'bible:gen:1:2': [a], 'wtlb:gifts-2:2': [a] } });
    expect(out.annotations).toBeUndefined();
  });

  it('a second pass over its own result moves nothing', () => {
    const first = run(NEW, { annotations: { [P + '2']: [seg(2, 'some teach, and some serve')] } });
    const again = run(NEW, { annotations: first.annotations });
    expect(again.moved).toBe(0);
    expect(again.annotations).toBeUndefined();
  });
});

describe('the committed move list', () => {
  it('holds c62\'s move in Regarding Spiritual Gifts (old 208 -> 209)', () => {
    const flat = MARK_SHIFTS['wtlb:regarding-spiritual-gifts:'];
    const pairs = []; for (let i = 0; i < flat.length; i += 2) pairs.push(flat[i] + '>' + flat[i + 1]);
    expect(pairs).toContain('88>89');
    expect(pairs).toContain('208>209');
  });

  it('R3: leaves out an id two books share (WTLB One / Two / The Blessed introduction)', () => {
    expect(Object.keys(MARK_SHIFTS).some((p) => /:introduction:$/.test(p))).toBe(false);
  });
});

describe('remapCorpusMarks - on screen, into the stores', () => {
  const RSG = 'wtlb:regarding-spiritual-gifts:';
  const WORDS = 'Beloved, I delight in that which one gives';
  let written;
  const store = (data, name) => ({
    isReady: () => true,
    getVersion: () => written[name + 'V'] || 1,
    all: () => written[name] || data,
    replaceAll: (d) => { written[name] = d; written[name + 'V'] = (written[name + 'V'] || 1) + 1; },
  });
  const stubs = (ann) => {
    globalThis.AnnotationStore = store(ann, 'ann');
    globalThis.NoteStore = store({}, 'note');
    globalThis.BookmarkStore = store([], 'bk');
    globalThis.LinkStore = store([], 'ln');
  };
  beforeEach(() => {
    written = {};
    _resetCorpusRemap();
    // c62: block 208 is now a divider; the words a reader marked there sit at 209.
    document.body.innerHTML = '<div data-mark-entry="' + RSG + '" data-mark-blocks="251">' +
      '<p data-hl-key="' + RSG + '208" data-hl-dom="true">✦</p>' +
      '<p data-hl-key="' + RSG + '209" data-hl-dom="true">' + WORDS + ' to Another in My name.</p></div>';
  });
  afterEach(() => {
    ['AnnotationStore', 'NoteStore', 'BookmarkStore', 'LinkStore', 'DiagnosticLog'].forEach((k) => { delete globalThis[k]; });
    document.body.innerHTML = '';
  });
  const mark = { id: 'h1', groupId: 'g1', start: 0, end: WORDS.length, text: WORDS, color: 'yellow', created: 1 };

  it('moves a shifted mark, writes the store once, logs it, and does not run again until something changes', () => {
    const logs = [];
    stubs({ [RSG + '208']: [mark] });
    globalThis.DiagnosticLog = { warn: (...args) => logs.push(args) };
    expect(remapCorpusMarks()).toEqual({ moved: 1, left: 0 });
    expect(written.ann[RSG + '209']).toEqual([mark]);
    expect(written.note).toBeUndefined();
    expect(logs).toEqual([['corpus-remap', 'moved 1 in ' + RSG]]);
    expect(remapCorpusMarks()).toEqual({ moved: 0, left: 0 });   // the store's version moved: it looks once more
    expect(remapCorpusMarks()).toBe(null);                         // nothing changed since
  });

  it('reads a block\'s words without the note icons painted into it', () => {
    document.querySelector('[data-hl-key="' + RSG + '209"]').insertAdjacentHTML('afterbegin', '<span class="hl-note-icon">N</span>');
    stubs({ [RSG + '208']: [{ ...mark, start: 1, end: WORDS.length + 1 }] });   // textContent offsets, icon included
    remapCorpusMarks();
    expect(written.ann[RSG + '209']).toHaveLength(1);
  });

  it('does nothing while a store is still loading, or with no listed entry on screen', () => {
    stubs({ [RSG + '208']: [mark] });
    globalThis.AnnotationStore.isReady = () => false;
    expect(remapCorpusMarks()).toBe(null);
    globalThis.AnnotationStore.isReady = () => true;
    document.querySelector('[data-mark-entry]').setAttribute('data-mark-entry', 'wtlb:not-listed:');
    expect(remapCorpusMarks()).toBe(null);
    expect(written.ann).toBeUndefined();
  });
});
