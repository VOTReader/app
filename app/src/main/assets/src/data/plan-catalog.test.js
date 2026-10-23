/* plan-catalog (mw18): the call-1A plans, frozen items, and rp1's plans moved into runs. */

import { describe, it, expect } from 'vitest';
import { PLAN_CATALOG, bibleItems, collectionItems, startCatalogPlan, migrateRp1, bookTitle, runName } from './plan-catalog.js';
import { runStatus, dayItems, itemsLabel, totalDays } from './plan-engine.js';
import { biblePortion, BIBLE_CHAPTER_COUNT } from './reading-plans.js';

const at = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 9); };
const mkCol = (volKey, readKey, label, n, preface = false) => ({
  col: { volKey, readKey, label, letterScreen: volKey + '-letter' },
  letters: Array.from({ length: n }, (_, i) => ({ id: volKey + '-' + (i + 1), title: 'Letter ' + (i + 1), words: 300 + (i % 5) * 900 })),
  preface: preface ? { id: volKey + '-preface', title: 'Preface', words: 500 } : null,
});
const COLS = [mkCol('one', 'volume-one', 'Volume One', 29, true), mkCol('two', 'volume-two', 'Volume Two', 29),
  mkCol('blessed', 'the-blessed', 'The Blessed', 8), mkCol('timothy', 'letters-timothy', 'Letters from Timothy', 14, true),
  mkCol('holydays', 'holy-days', 'Regarding The Holy Days', 16)];
const src = {
  colByKey: new Map(COLS.map((c) => [c.col.volKey, c.col])),
  letters: (col) => (COLS.find((c) => c.col === col) || { letters: [] }).letters,
  preface: (col) => (COLS.find((c) => c.col === col) || { preface: null }).preface,
  words: (e) => e.words,
};

describe('Bible items', () => {
  it('every chapter, in order, with real NKJV word counts', () => {
    const all = bibleItems('genesis', 1, 'revelation');
    expect(all.length).toBe(BIBLE_CHAPTER_COUNT);
    expect(all[0].k).toBe('genesis:1');
    expect(all[all.length - 1].k).toBe('revelation:22');
    expect(all.every((it) => it.w >= 30 && it.w < 2400)).toBe(true);   // Psalm 117 (30 words) to Psalm 119 (2,385)
    expect(bibleItems('genesis', 1, 'genesis', 11).length).toBe(11);
    expect(bibleItems('john').length).toBe(21);
    expect(bookTitle('matthew')).toBe('Matthew');
  });
});

describe('the catalog', () => {
  it('has the call-1A plans and every one starts', () => {
    expect(PLAN_CATALOG.map((p) => p.id)).toEqual(['bible-year', 'new-testament', 'psalms', 'proverbs', 'gospels',
      'seven-volumes', 'letters-year', 'volumes', 'collection', 'blessed', 'timothy', 'holy-days', 'matthew-study']);
    for (const p of PLAN_CATALOG) {
      const run = startCatalogPlan(p.id, src, at('2026-10-22'), { volKey: 'one' });
      if (p.id === 'seven-volumes' || p.id === 'letters-year' || p.id === 'volumes') { expect(run).not.toBeNull(); continue; }
      expect(run, p.id).not.toBeNull();
    }
  });
  it('the starters are a letter a day: The Blessed 8 days, Timothy 15 (with its preface), Holy Days 16', () => {
    expect(totalDays(/** @type {any} */ (startCatalogPlan('blessed', src, at('2026-10-22'))))).toBe(8);
    expect(totalDays(/** @type {any} */ (startCatalogPlan('timothy', src, at('2026-10-22'))))).toBe(15);
    expect(totalDays(/** @type {any} */ (startCatalogPlan('holy-days', src, at('2026-10-22'))))).toBe(16);
  });
  it('the New Testament runs on weekdays only; Proverbs is one chapter a day', () => {
    const nt = /** @type {any} */ (startCatalogPlan('new-testament', src, at('2026-10-22')));
    expect(nt.weekdays).toEqual([false, true, true, true, true, true, false]);
    expect(totalDays(nt)).toBe(260);
    const pr = /** @type {any} */ (startCatalogPlan('proverbs', src, at('2026-10-22')));
    expect(itemsLabel(dayItems(pr, 0), bookTitle)).toBe('Proverbs 1');
  });
  it('the Matthew Study Bible plan holds the study\'s own "matthew" keys', () => {
    const m = /** @type {any} */ (startCatalogPlan('matthew-study', src, at('2026-10-22')));
    expect(dayItems(m, 0).map((it) => it.k)).toEqual(['matthew:1']);
    expect(itemsLabel(dayItems(m, 4), bookTitle)).toBe('Matthew 5');
  });
  it('a letters plan waits for the Volumes: null without them', () => {
    expect(startCatalogPlan('seven-volumes', null, at('2026-10-22'))).toBeNull();
  });
  it('One collection is named for its collection', () => {
    const r = /** @type {any} */ (startCatalogPlan('collection', src, at('2026-10-22'), { volKey: 'two' }));
    expect(runName(r, src)).toBe('Volume Two');
    expect(collectionItems('two', src)[0]).toEqual({ k: 'volume-two:two-1', w: 300, t: 'Letter 1', s: 'Volume Two' });
  });
});

describe('moving rp1 plans into runs', () => {
  it('Bible in a Year keeps its days, its start, its planned finish and what was read', () => {
    const read = new Set(['genesis:1', 'genesis:2', 'genesis:3', 'genesis:4']);
    const runs = migrateRp1([{ id: 'bible-year', start: '2026-10-01' }], (b, c) => read.has(b + ':' + c), src, [], at('2026-10-22'));
    expect(runs.length).toBe(1);
    const r = runs[0];
    expect(r.start).toBe('2026-10-01');
    expect(r.target).toBe('2027-09-30');
    expect(dayItems(r, 40).map((it) => it.k)).toEqual(biblePortion(40).items.map((it) => it.bid + ':' + it.cid));
    expect(r.ticks).toEqual({ 'genesis:1': '', 'genesis:2': '', 'genesis:3': '', 'genesis:4': '' });
    const st = runStatus(r, at('2026-10-22'));
    expect(st.day).toBe(1);
    expect(st.todayTicked).toBe(1);
  });
  it('the Volumes plan keeps its letters a day; it waits (no run) until the Volumes load; it never runs twice', () => {
    const old = [{ id: 'volumes', start: '2026-10-01', pace: 2 }];
    expect(migrateRp1(old, () => false, null, [], at('2026-10-22'))).toEqual([]);
    const runs = migrateRp1(old, () => false, src, [], at('2026-10-22'));
    expect(dayItems(runs[0], 0).length).toBe(2);
    expect(migrateRp1(old, () => false, src, runs, at('2026-10-22'))).toEqual([]);
    expect(migrateRp1([{ id: 'x', start: '2026-10-01' }, { id: 'bible-year', start: 'bad' }], () => false, src, [], at('2026-10-22'))).toEqual([]);
  });
});
