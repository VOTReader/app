/* plan-builder (mw18): the reader's own plan from any mix of Bible and letters, with its daily breakdown. */

import { describe, it, expect } from 'vitest';
import { BIBLE_GROUPS, pickItems, pickName, pickChips, defaultName, builderTracks, builderSpec, builderPreview, chapterCount } from './plan-builder.js';
import { newRun, runStatus, dayItems, totalDays } from './plan-engine.js';

const at = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 9); };
const mkCol = (volKey, readKey, label, n, preface = false) => ({
  col: { volKey, readKey, label, letterScreen: volKey + '-letter' },
  letters: Array.from({ length: n }, (_, i) => ({ id: volKey + '-' + (i + 1), title: 'Letter ' + (i + 1), words: 1000 })),
  preface: preface ? { id: volKey + '-preface', title: 'Preface', words: 500 } : null,
});
const COLS = [mkCol('seven', 'volume-seven', 'Volume Seven', 25), mkCol('one', 'volume-one', 'Volume One', 29, true)];
const src = {
  colByKey: new Map(COLS.map((c) => [c.col.volKey, c.col])),
  letters: (col) => (COLS.find((c) => c.col === col) || { letters: [] }).letters,
  preface: (col) => (COLS.find((c) => c.col === col) || { preface: null }).preface,
  words: (e) => e.words,
};
const ALL = [true, true, true, true, true, true, true];

describe('plan-builder', () => {
  it('the whole-Bible groups split at Matthew', () => {
    expect(BIBLE_GROUPS[0].books.length).toBe(66);
    expect(BIBLE_GROUPS[1].books.at(-1)).toBe('malachi');
    expect(BIBLE_GROUPS[2].books[0]).toBe('matthew-plain');
  });

  it('a pick is a whole book, some chapters, a whole collection or some letters', () => {
    expect(pickItems({ t: 'b', bid: 'genesis', ch: null }, src).length).toBe(50);
    expect(pickItems({ t: 'b', bid: 'genesis', ch: [3, 1, 2] }, src).map((it) => it.k)).toEqual(['genesis:1', 'genesis:2', 'genesis:3']);
    expect(pickItems({ t: 'l', volKey: 'one', ids: null }, src).length).toBe(30);   // the preface too
    expect(pickItems({ t: 'l', volKey: 'seven', ids: ['seven-2'] }, src).map((it) => it.t)).toEqual(['Letter 2']);
    expect(pickItems({ t: 'l', volKey: 'seven', ids: null }, null)).toEqual([]);   // the Volumes not loaded yet
  });

  it('names picks and plans as a reader says them', () => {
    expect(pickName({ t: 'b', bid: 'genesis', ch: [1, 2, 3, 5, 7, 8] }, src)).toBe('Genesis 1-3, 5, 7-8');
    expect(pickName({ t: 'b', bid: 'genesis', ch: Array.from({ length: chapterCount('genesis') }, (_, i) => i + 1) }, src)).toBe('Genesis');
    expect(pickName({ t: 'l', volKey: 'seven', ids: ['a', 'b', 'c'] }, src)).toBe('Volume Seven: 3 letters');
    expect(defaultName([{ t: 'b', bid: 'genesis', ch: null }, { t: 'l', volKey: 'seven', ids: null }], src)).toBe('Genesis and Volume Seven');
    expect(defaultName([{ t: 'b', bid: 'john', ch: null }, { t: 'b', bid: 'genesis', ch: null }, { t: 'l', volKey: 'seven', ids: null }], src)).toBe('John, Genesis and more');
  });

  it('shows a whole testament or the whole Bible as one chip, never 66 (mw-pb1)', () => {
    const books = (/** @type {string} */ id) => BIBLE_GROUPS.find((g) => g.id === id).books.map((bid) => ({ t: 'b', bid, ch: null }));
    const all = pickChips(books('all'), src);
    expect(all.map((c) => c.label)).toEqual(['Whole Bible · 66 books · 1,189 ch']);
    expect(all[0].keys.length).toBe(66);
    expect(pickChips([...books('ot'), ...books('nt')], src).map((c) => c.name)).toEqual(['Whole Bible']);   // OT + NT is the whole Bible
    expect(pickChips([{ t: 'l', volKey: 'seven', ids: null }, ...books('nt'), { t: 'b', bid: 'genesis', ch: [1] }], src).map((c) => c.label))
      .toEqual(['Volume Seven', 'New Testament · 27 books · 260 ch', 'Genesis 1']);
    // one book cut to some chapters breaks its testament back into books
    const ot = books('ot'); ot[0] = { t: 'b', bid: ot[0].bid, ch: [1, 2] };
    expect(pickChips(ot, src).map((c) => c.label)).toEqual(['Genesis 1-2', 'Exodus to Malachi · 38 books · 879 ch']);
    // a run in Bible order is one chip; two in a row, or out of order, stay books
    const b = (/** @type {string} */ bid) => ({ t: 'b', bid, ch: null });
    expect(pickChips([b('ruth'), b('judges'), b('joshua'), b('john'), b('acts')], src).map((c) => c.name)).toEqual(['Ruth', 'Judges', 'Joshua', 'John', 'Acts']);
    expect(pickChips([b('joshua'), b('judges'), b('ruth'), b('john')], src).map((c) => c.name)).toEqual(['Joshua to Ruth', 'John']);
    expect(defaultName(books('all'), src)).toBe('Whole Bible');
  });

  it('keeps the order picked, or Bible order; an item picked twice is read once', () => {
    const picks = [{ t: 'l', volKey: 'seven', ids: ['seven-1'] }, { t: 'b', bid: 'john', ch: [1] }, { t: 'b', bid: 'genesis', ch: [1] }, { t: 'b', bid: 'genesis', ch: [1, 2] }];
    const asPicked = builderTracks(picks, 'picked', src);
    expect(asPicked.map((t) => t.kind)).toEqual(['letters', 'bible']);   // letters were picked first
    expect(asPicked[1].items.map((it) => it.k)).toEqual(['john:1', 'genesis:1', 'genesis:2']);
    const canon = builderTracks(picks, 'canonical', src);
    expect(canon.map((t) => t.kind)).toEqual(['bible', 'letters']);
    expect(canon[0].items.map((it) => it.k)).toEqual(['genesis:1', 'genesis:2', 'john:1']);
  });

  it('a mixed plan side by side reads some of each every day and both finish together (Corbin: A)', () => {
    const spec = builderSpec({ picks: [{ t: 'b', bid: 'genesis', ch: null }, { t: 'l', volKey: 'seven', ids: null }], order: 'picked', share: 'side',
      goal: { mode: 'days', n: 25 }, weekdays: ALL }, src);
    expect(spec.name).toBe('Genesis and Volume Seven');
    const run = newRun(spec, at('2026-10-22'));
    expect(totalDays(run)).toBe(25);
    for (const d of [0, 12, 24]) {
      const items = dayItems(run, d);
      expect(items.some((it) => !it.t)).toBe(true);
      expect(items.some((it) => it.t)).toBe(true);
    }
  });

  it('one after the other reads all the Bible picks, then the letters (B, the option)', () => {
    const spec = builderSpec({ picks: [{ t: 'b', bid: 'ruth', ch: null }, { t: 'l', volKey: 'seven', ids: ['seven-1', 'seven-2'] }], order: 'picked', share: 'serial',
      goal: { mode: 'items', n: 2 }, weekdays: ALL }, src);
    const run = newRun(spec, at('2026-10-22'));
    expect(dayItems(run, 0).map((it) => it.k)).toEqual(['ruth:1', 'ruth:2']);
    expect(dayItems(run, 2).map((it) => it.t)).toEqual(['Letter 1', 'Letter 2']);
  });

  it('breaks down the picks and each day: chapters, letters, words and minutes, and the finish', () => {
    const spec = builderSpec({ picks: [{ t: 'b', bid: 'genesis', ch: null }, { t: 'l', volKey: 'seven', ids: null }], order: 'picked', share: 'side',
      goal: { mode: 'days', n: 25 }, weekdays: ALL }, src);
    const p = builderPreview(spec, at('2026-10-22'));
    expect(p.chapters).toBe(50);
    expect(p.letters).toBe(25);
    expect(p.picked).toMatch(/^50 chapters \+ 25 letters · about [\d,]+ words$/);
    expect(p.each).toBe('2 chapters + 1 letter');
    expect(p.days).toBe(25);
    expect(p.finish).toBe('2026-11-15');
    expect(p.dayMinutes).toBe(Math.max(1, Math.round(p.dayWords / 200)));
    expect(builderPreview(builderSpec({ picks: [], order: 'picked', share: 'side', goal: { mode: 'days', n: 5 }, weekdays: ALL }, src), at('2026-10-22'))).toBeNull();
  });

  it('a goal in minutes a day sets the length; a few letters over many days say how often', () => {
    const spec = builderSpec({ picks: [{ t: 'l', volKey: 'seven', ids: ['seven-1', 'seven-2'] }], order: 'picked', share: 'side',
      goal: { mode: 'days', n: 6 }, weekdays: ALL }, src);
    expect(builderPreview(spec, at('2026-10-22')).each).toBe('a letter every 3 days');
    const mins = builderSpec({ picks: [{ t: 'l', volKey: 'seven', ids: null }], order: 'picked', share: 'side', goal: { mode: 'minutes', n: 10 }, weekdays: ALL }, src);
    const run = newRun(mins, at('2026-10-22'));
    expect(runStatus(run, at('2026-10-22')).total).toBe(Math.ceil(25000 / 2000));
  });
});
