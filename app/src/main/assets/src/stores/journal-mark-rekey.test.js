/* Journal marks move from block POSITIONS to block IDS (v05-01, improvement sweep
   2026-09-22 REPORT #4). The scene every case below comes from: a reader marks
   two paragraphs, then inserts a photo at the top of the entry. Under position
   keys the photo took position 0 and every mark slid one paragraph up; the
   re-key has to put each mark back on the words it was made on. */
import { describe, it, expect, vi } from 'vitest';
import { rekeyJournalMarks, pickBlock, blockPlainText, journalBlockKey, inlineLinkLabel } from './journal-mark-rekey.js';

// The code under test imports these; the test stubs them as globals (bridge-imports, v15-code-health-04).
vi.mock('./bookmark-store.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get BookmarkStore() { return /** @type {any} */ (globalThis).BookmarkStore; } }; });

// The entry AFTER the photo went in above: the marks were made on [A, B, C] at 0, 1, 2.
const ENTRY = {
  id: 'j_1',
  blocks: [
    { id: 'b_img', type: 'image', mediaId: 'm1' },
    { id: 'b_a', type: 'p', text: 'Grace to you, and **peace**.' },
    { id: 'b_b', type: 'p', text: 'I thank my God {{ref:Philippians 1:3}} upon every remembrance of you.' },
    { id: 'b_c', type: 'h2', text: 'Always in every prayer' },
  ],
};
const OTHER = { id: 'j_2', blocks: [{ id: 'b_x', type: 'p', text: 'Another entry.' }] };
const ENTRIES = [ENTRY, OTHER];

const ann = (id, text, extra) => ({ id, groupId: id, kind: 'highlight', color: 'gold', start: 0, end: text.length, text, ...extra });

describe('journal marks: position keys move to block ids', () => {
  it('each mark lands on the block that holds its words, not on the block now at its old position', () => {
    const r = rekeyJournalMarks(ENTRIES, {
      annotations: {
        'journal:j_1:0': [ann('h1', 'Grace to you, and peace.')],          // made on A at 0; the photo is at 0 now
        'journal:j_1:1': [ann('h2', 'upon every remembrance')],            // made on B at 1; A is at 1 now
        'journal:j_1:2': [ann('h3', 'every prayer')],                       // made on C at 2; B is at 2 now
      },
    });
    expect(r.annotations).toEqual({
      [journalBlockKey('j_1', 'b_a')]: [ann('h1', 'Grace to you, and peace.')],
      [journalBlockKey('j_1', 'b_b')]: [ann('h2', 'upon every remembrance')],
      [journalBlockKey('j_1', 'b_c')]: [ann('h3', 'every prayer')],
    });
    expect(r.moved).toBe(3);
  });

  it('a scripture chip reads as its reference: a mark across it still finds its block', () => {
    expect(blockPlainText(ENTRY.blocks[2])).toBe('I thank my God Philippians 1:3 upon every remembrance of you.');
    expect(pickBlock(ENTRY.blocks, 0, 'God Philippians 1:3 upon')).toBe('b_b');
  });

  it('two marks under one old key can part ways', () => {
    const r = rekeyJournalMarks(ENTRIES, {
      annotations: { 'journal:j_1:1': [ann('h1', 'Grace to you'), ann('h2', 'every remembrance')] },
    });
    expect(Object.keys(r.annotations).sort()).toEqual(['journal:j_1:b_a', 'journal:j_1:b_b']);
  });

  it('the nearest block holding the words wins, the old position itself first', () => {
    const blocks = [
      { id: 'b_0', type: 'p', text: 'Amen.' },
      { id: 'b_1', type: 'p', text: 'Pray.' },
      { id: 'b_2', type: 'p', text: 'Amen.' },
      { id: 'b_3', type: 'p', text: 'Amen.' },
    ];
    expect(pickBlock(blocks, 2, 'Amen')).toBe('b_2');
    expect(pickBlock(blocks, 1, 'Amen')).toBe('b_0'); // a tie: the lower wins
  });

  it('words found nowhere: the block at the old position takes the mark, if marks paint there', () => {
    const r = rekeyJournalMarks(ENTRIES, {
      annotations: {
        'journal:j_1:3': [ann('h1', 'words since edited away')],   // C is at 3: a heading, markable
        'journal:j_1:0': [ann('h2', 'also gone')],                  // the photo is at 0: nothing paints there
      },
    });
    expect(r.annotations['journal:j_1:b_c']).toHaveLength(1);
    expect(r.annotations['journal:j_1:0']).toHaveLength(1);
    expect(r.moved).toBe(1);
    expect(r.left).toBe(1);
  });

  it('a position past the last block, or an entry that is gone, keeps its key', () => {
    const r = rekeyJournalMarks(ENTRIES, {
      annotations: {
        'journal:j_1:9': [ann('h1', 'nowhere')],
        'journal:j_gone:0': [ann('h2', 'Grace to you')],
        'journal:j_2:0': [ann('h3', 'Another entry')],
      },
    });
    expect(Object.keys(r.annotations).sort()).toEqual(['journal:j_1:9', 'journal:j_2:b_x', 'journal:j_gone:0']);
    expect(r.left).toBe(2);
  });

  it('ids, other kinds and whole-entry keys are never touched; nothing to move returns no store', () => {
    const data = {
      annotations: {
        'journal:j_1:b_a': [ann('h1', 'Grace')],
        'letter:the-wide-path:2': [ann('h2', 'narrow')],
        'bible:john:3:16': [ann('h3', 'loved')],
      },
      notes: { n1: { groupId: 'n1', keys: ['journal:j_1:b_b'], fullText: 'x' } },
      bookmarks: [{ id: 'k1', hlKey: 'journal:j_1', label: 'the entry' }],
      links: [{ id: 'l1', source: { type: 'journal', key: 'journal:j_2', entryId: 'j_2' }, target: { key: 'bible:john:3:16' } }],
    };
    const r = rekeyJournalMarks(ENTRIES, data);
    expect(r).toEqual({ moved: 0, left: 0 });
  });

  it('a second run changes nothing', () => {
    const first = rekeyJournalMarks(ENTRIES, { annotations: { 'journal:j_1:1': [ann('h1', 'Grace to you')] } });
    const second = rekeyJournalMarks(ENTRIES, { annotations: first.annotations });
    expect(second).toEqual({ moved: 0, left: 0 });
  });

  it("a note's keys follow its own segments", () => {
    const r = rekeyJournalMarks(ENTRIES, {
      annotations: {
        'journal:j_1:1': [ann('n1', 'upon every remembrance', { kind: 'note' })],
        'journal:j_1:2': [ann('n1', 'Always', { kind: 'note', id: 'n1b' })],
      },
      notes: { n1: { groupId: 'n1', keys: ['journal:j_1:1', 'journal:j_1:2'], body: 'Paul prays.', fullText: 'upon every remembrance\nAlways' } },
    });
    expect(r.notes.n1.keys).toEqual(['journal:j_1:b_b', 'journal:j_1:b_c']);
    expect(r.notes.n1.body).toBe('Paul prays.');
  });

  it('a bookmark keeps its range; a link end moves by its own text', () => {
    const r = rekeyJournalMarks(ENTRIES, {
      bookmarks: [{ id: 'k1', hlKey: 'journal:j_1:1:16-38', label: 'upon every remembrance' }],
      links: [{
        id: 'l1',
        source: { type: 'journal', key: 'journal:j_1:0', entryId: 'j_1', text: 'Grace to you' },
        target: { type: 'bible', key: 'bible:philippians:1:3' },
      }],
    });
    expect(r.bookmarks[0].hlKey).toBe('journal:j_1:b_b:16-38');
    expect(r.links[0].source.key).toBe('journal:j_1:b_a');
    expect(r.links[0].target.key).toBe('bible:philippians:1:3');
  });

  it('the stores handed in are never mutated', () => {
    const data = {
      annotations: { 'journal:j_1:1': [ann('h1', 'Grace to you')] },
      bookmarks: [{ id: 'k1', hlKey: 'journal:j_1:1', label: 'Grace to you' }],
    };
    const before = JSON.stringify(data);
    rekeyJournalMarks(ENTRIES, data);
    expect(JSON.stringify(data)).toBe(before);
  });
});

/* The refutation (Codex, 2026-09-24, lanes/myweb/out/refute-v0501-repro.mjs): eight counterexamples, each reproduced
   on the first cut. The pure ones are pinned here; the store-level ones (F1 the merge on save, F8 a late hydration)
   in journal-store.rekey.test.js. */
describe('journal marks: the refutation of the first cut', () => {
  it('F2: an empty bucket already under the block id never swallows the mark moving into it, in either order', () => {
    const moving = { 'journal:j_1:1': [ann('h1', 'Grace to you')] };
    const after = rekeyJournalMarks(ENTRIES, { annotations: { ...moving, 'journal:j_1:b_a': [] } });
    expect(after.annotations['journal:j_1:b_a']).toEqual([ann('h1', 'Grace to you')]);
    const emptyFirst = { 'journal:j_1:b_a': [] };
    const before = rekeyJournalMarks(ENTRIES, { annotations: { ...emptyFirst, ...moving } });
    expect(before.annotations['journal:j_1:b_a']).toEqual([ann('h1', 'Grace to you')]);
    expect(emptyFirst['journal:j_1:b_a']).toEqual([]);   // the store's own array is not pushed into
  });

  it('F3: a block whose id is a number keeps its marks: that key is an id key, and a second run changes nothing', () => {
    const entry = { id: 'j_n', blocks: [{ id: '1', type: 'p', text: 'Edited since the mark' }, { id: 'b_o', type: 'p', text: 'Another' }] };
    const r = rekeyJournalMarks([entry], { annotations: { 'journal:j_n:1': [ann('h1', 'Words edited away')] } });
    expect(r).toEqual({ moved: 0, left: 0 });
    const loop = { id: 'j_n', blocks: [{ id: '1', type: 'p', text: 'Grace' }] };
    const first = rekeyJournalMarks([loop], { annotations: { 'journal:j_n:0': [ann('h2', 'Grace')] } });
    expect(Object.keys(first.annotations)).toEqual(['journal:j_n:1']);
    expect(rekeyJournalMarks([loop], { annotations: first.annotations })).toEqual({ moved: 0, left: 0 });
  });

  it('F4: an inline link reads as the title it shows, so a mark across it finds its own block', () => {
    const blocks = [
      { id: 'b_link', type: 'p', text: 'Read [[bookmark:bk_grace]] today' },
      { id: 'b_same', type: 'p', text: 'Read Grace today' },
    ];
    const labelOf = (kind, data) => (kind === 'bookmark' && data === 'bk_grace' ? 'Grace' : null);
    expect(blockPlainText(blocks[0], labelOf)).toBe('Read Grace today');
    expect(blockPlainText(blocks[0], null)).toBe('Read \u0000 today');   // a title nobody can know here matches nothing
    const r = rekeyJournalMarks([{ id: 'j_l', blocks }], {
      annotations: { 'journal:j_l:0': [ann('h1', 'Read Grace today')] },
      inlineLabel: labelOf,
    });
    expect(Object.keys(r.annotations)).toEqual(['journal:j_l:b_link']);
  });

  it("F5: one note's two segments under one old key that part ways keep both blocks in the note's keys", () => {
    const r = rekeyJournalMarks(ENTRIES, {
      annotations: { 'journal:j_1:0': [ann('s_a', 'Grace to you', { groupId: 'g' }), ann('s_b', 'every prayer', { groupId: 'g' })] },
      notes: { g: { groupId: 'g', keys: ['journal:j_1:0'], fullText: 'Grace to you\nevery prayer', body: 'both' } },
    });
    expect(Object.keys(r.annotations).sort()).toEqual(['journal:j_1:b_a', 'journal:j_1:b_c']);
    expect(r.notes.g.keys).toEqual(['journal:j_1:b_a', 'journal:j_1:b_c']);
  });

  it('F5: a note keeps its old key while one of its segments could not move', () => {
    const r = rekeyJournalMarks(ENTRIES, {
      annotations: { 'journal:j_1:0': [ann('s_a', 'Grace to you', { groupId: 'g' }), ann('s_b', 'edited away', { groupId: 'g' })] },
      notes: { g: { groupId: 'g', keys: ['journal:j_1:0'], fullText: 'Grace to you\nedited away', body: 'both' } },
    });
    expect(r.annotations['journal:j_1:0']).toEqual([ann('s_b', 'edited away', { groupId: 'g' })]);
    expect(r.notes.g.keys).toEqual(['journal:j_1:b_a', 'journal:j_1:0']);
  });

  it("F6: an entry id holding a ':' is never read as another entry plus a position", () => {
    const colon = { id: 'j_1:0', blocks: [{ id: 'b_x', type: 'p', text: 'Grace to you' }] };
    const r = rekeyJournalMarks([ENTRY, colon], {
      annotations: { 'journal:j_1:0:b_x': [ann('h1', 'Grace to you')] },
      bookmarks: [{ id: 'k1', hlKey: 'journal:j_1:1:0-12', label: 'Grace to you' }],   // j_1's position 1, with a range
    });
    expect(r.annotations).toBeUndefined();
    expect(r.bookmarks[0].hlKey).toBe('journal:j_1:b_a:0-12');
  });

  it('F7: the same segment under its old key and under its block id comes out once, the newer copy', () => {
    const older = ann('s1', 'Grace to you', { color: 'yellow', updated: 1 });
    const newer = ann('s1', 'Grace to you', { color: 'blue', updated: 2 });
    const a = rekeyJournalMarks(ENTRIES, { annotations: { 'journal:j_1:b_a': [older], 'journal:j_1:1': [newer] } });
    expect(a.annotations['journal:j_1:b_a']).toEqual([newer]);
    const b = rekeyJournalMarks(ENTRIES, { annotations: { 'journal:j_1:1': [older], 'journal:j_1:b_a': [newer] } });
    expect(b.annotations['journal:j_1:b_a']).toEqual([newer]);
    const green = { ...older, color: 'green' };
    const tie = rekeyJournalMarks(ENTRIES, { annotations: { 'journal:j_1:1': [older], 'journal:j_1:b_a': [green] } });
    expect(tie.annotations['journal:j_1:b_a']).toEqual([green]);   // a tie: the copy already on its block
  });

  it("F1 + B5: a note, bookmark or link the pass changes is stamped half a ms past its own stamp: the merge keeps it, a later real edit beats it", () => {
    const r = rekeyJournalMarks(ENTRIES, {
      annotations: { 'journal:j_1:1': [ann('n1', 'Grace to you', { kind: 'note' })] },
      notes: {
        n1: { groupId: 'n1', keys: ['journal:j_1:1'], fullText: 'Grace to you', created: 5, updated: 7 },
        n2: { groupId: 'n2', keys: ['journal:j_1:b_b'], fullText: 'x', created: 5, updated: 7 },
      },
      bookmarks: [{ id: 'k1', hlKey: 'journal:j_1:1', label: 'Grace to you', created: 3, updated: 4 }],
      links: [{ id: 'l1', source: { key: 'journal:j_1:1', text: 'Grace to you' }, target: { key: 'bible:john:3:16' }, created: 9 }],
    });
    // newer than the copy on disk (the merge keeps the move), older than any edit at a later whole ms (Date.now())
    expect(r.notes.n1.updated).toBe(7.5);
    expect(r.notes.n2.updated).toBe(7);   // untouched
    expect(r.bookmarks[0].updated).toBe(4.5);
    expect(r.links[0].updated).toBe(9.5);
    expect(r.links[0].created).toBe(9);
  });

  it("a mark's own offsets beat a nearer block that holds the same word elsewhere", () => {
    const blocks = [
      { id: 'b_0', type: 'p', text: 'Grace and peace.' },
      { id: 'b_1', type: 'p', text: 'All of it is Grace.' },
    ];
    // made on b_0 at 0-5 when b_0 sat at position 1; b_1 (now at 1) holds 'Grace' at 13-18
    const r = rekeyJournalMarks([{ id: 'j_o', blocks }], { annotations: { 'journal:j_o:1': [ann('h1', 'Grace')] } });
    expect(Object.keys(r.annotations)).toEqual(['journal:j_o:b_0']);
  });
});

/* The second refutation (Codex, 2026-09-24, lanes/myweb/out/refute-v0501b-repro.mjs): B1-B3 and B6 pinned here, B5 in the
   F1 case above. B4 and B7 are left alone on purpose (journal-mark-rekey.js header says why). */
describe('journal marks: the second refutation', () => {
  it("B1: a whole-entry key is never read as a position, even when the entry's id ends in ':<digits>'", () => {
    const other = { id: 'j_1:0', blocks: [{ id: 'b_o', type: 'p', text: 'Other words' }] };
    const r = rekeyJournalMarks([ENTRY, other], {
      bookmarks: [{ id: 'whole', hlKey: 'journal:j_1:0', label: 'Other entry' }],
      links: [{ id: 'l', source: { type: 'journal', key: 'journal:j_1:0', label: 'Other entry' }, target: { key: 'bible:john:3:16' } }],
    });
    expect(r).toEqual({ moved: 0, left: 0 });
  });

  it("B2: a block id holding a ':' is an id key under its own entry, not another entry's position", () => {
    const a = { id: 'j_1', blocks: [{ id: '0:1', type: 'p', text: 'Grace' }] };
    const b = { id: 'j_1:0', blocks: [{ id: 'x', type: 'p', text: 'Other' }, { id: 'y', type: 'p', text: 'Grace' }] };
    const r = rekeyJournalMarks([a, b], { annotations: { 'journal:j_1:0:1': [ann('h1', 'Grace')] } });
    expect(r).toEqual({ moved: 0, left: 0 });
  });

  it('B3: two different marks that share an id (in different groups) both survive moving into one block', () => {
    const entry = { id: 'j_s', blocks: [{ id: 'b_a', type: 'p', text: 'Grace Peace' }, { id: 'b_img', type: 'image' }] };
    const grace = ann('same', 'Grace', { groupId: 'g_grace', kind: 'note' });
    const peace = ann('same', 'Peace', { groupId: 'g_peace', kind: 'note', start: 6, end: 11 });
    const r = rekeyJournalMarks([entry], { annotations: { 'journal:j_s:0': [grace], 'journal:j_s:1': [peace] } });
    expect(r.annotations['journal:j_s:b_a']).toEqual([grace, peace]);
  });

  it("B6: an inline link whose target is gone reads as its own data, as the view draws it", () => {
    const G = /** @type {any} */ (globalThis);
    const had = G.BookmarkStore;
    G.BookmarkStore = { get: () => null };
    try {
      expect(inlineLinkLabel('bookmark', 'deleted')).toBe('deleted');
      const blocks = [{ id: 'b_link', type: 'p', text: 'Read [[bookmark:deleted]] today' }, { id: 'b_same', type: 'p', text: 'Read deleted today' }];
      const r = rekeyJournalMarks([{ id: 'j_g', blocks }], { annotations: { 'journal:j_g:0': [ann('h1', 'Read deleted today')] } });
      expect(Object.keys(r.annotations)).toEqual(['journal:j_g:b_link']);
    } finally {
      if (had === undefined) delete G.BookmarkStore; else G.BookmarkStore = had;
    }
  });
});
