/* ═══════════════════════════════════════════════════════════════════════
   plan-catalog — the plans a reader can start, and the old plans moved in
   ═══════════════════════════════════════════════════════════════════════
   Corbin's call 1A (10-22): keep Bible in a Year and the Volumes plan, add
   the Seven Volumes, Letters in a Year (balanced by words), one collection
   at a time, short starters (The Blessed, Timothy, Holy Days, the Matthew
   Study Bible) and Bible slices (New Testament, Psalms, Proverbs in 31 days,
   the Gospels). Call 1b A: letter plans are cut by words, and "The Volumes
   in Order" is now "Every letter, in order" (it holds 14 collections).

   Every plan here is the plan engine (plan-engine.js) with a preset choice
   of items; the custom builder makes the same specs from the reader's picks.
   Items are frozen when a run starts: Bible words come from the generated
   plan-bible-words.js (no corpus needed), letters from the loaded Volumes.

   Pure: the Volumes arrive through `src` (the loaded corpus), never globals.
   ═══════════════════════════════════════════════════════════════════════ */

import { BIBLE_BOOKS } from './reading-plans.js';
import { BIBLE_CHAPTER_WORDS } from './plan-bible-words.js';
import { newRun, runStatus } from './plan-engine.js';

/** @typedef {import('./plan-engine.js').PlanItem} PlanItem */
/** @typedef {import('./plan-engine.js').PlanTrack} PlanTrack */
/** @typedef {import('./plan-engine.js').PlanPace} PlanPace */
/** @typedef {import('./plan-engine.js').PlanRun} PlanRun */
/**
 * The loaded Volumes, as the caller has them (COL_BY_KEY, colLetterArr, colPreface, countItemWords).
 * @typedef {{ colByKey: Map<string, any>, letters: (col: any) => any[], preface: (col: any) => any, words: (item: any) => number }} LetterSource
 */

const BOOK_INDEX = new Map(BIBLE_BOOKS.map((b, i) => [b[0], i]));

/** A Bible book's title ("Genesis"); '' for an unknown id. 'matthew' (the study) is Matthew too. @param {string} bid */
export function bookTitle(bid) {
  const i = BOOK_INDEX.get(bid === 'matthew' ? 'matthew-plain' : bid);
  return i == null ? '' : String(BIBLE_BOOKS[i][1]);
}

/**
 * Chapters as plan items, in canonical order, from book `a` chapter `ac` through book `z` chapter `zc`
 * (zc 0 = the book's last chapter). Words from the generated NKJV table.
 * @param {string} a @param {number} ac @param {string} z @param {number} zc
 * @returns {PlanItem[]}
 */
export function bibleItems(a, ac = 1, z = a, zc = 0) {
  const i0 = BOOK_INDEX.get(a), i1 = BOOK_INDEX.get(z);
  if (i0 == null || i1 == null || i1 < i0) return [];
  const out = [];
  for (let i = i0; i <= i1; i++) {
    const [bid, , n] = BIBLE_BOOKS[i];
    const words = BIBLE_CHAPTER_WORDS[bid] || [];
    const first = i === i0 ? Math.max(1, ac) : 1;
    const last = i === i1 && zc > 0 ? Math.min(Number(n), zc) : Number(n);
    for (let c = first; c <= last; c++) out.push({ k: bid + ':' + c, w: words[c - 1] || 650 });
  }
  return out;
}

/**
 * A collection's preface and letters as plan items, frozen with their titles and words. [] when the Volumes
 * are not loaded or the collection has no letter screen.
 * @param {string} volKey @param {LetterSource | null} src
 * @returns {PlanItem[]}
 */
export function collectionItems(volKey, src) {
  if (!src || !src.colByKey) return [];
  const col = src.colByKey.get(volKey);
  if (!col || !col.letterScreen || !col.readKey) return [];
  const pref = src.preface(col);
  const list = (pref ? [pref] : []).concat(src.letters(col) || []);
  const short = col.short || col.label || '';
  return list.filter((e) => e && e.id).map((e) => ({ k: col.readKey + ':' + e.id, w: Math.max(1, Number(src.words(e)) || 1), t: e.title || e.id, s: short }));
}

const ALL_WEEK = [true, true, true, true, true, true, true];
const WEEKDAYS = [false, true, true, true, true, true, false];
const SEVEN = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
/** The Volumes in site order (data/scripture-resolution.js READING_CHAIN). */
export const LETTER_CHAIN = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'rebuke', 'wtlb1', 'wtlb2', 'blessed', 'flock', 'timothy', 'holydays'];

/** @param {string[]} keys @param {LetterSource | null} src @returns {PlanTrack} */
const lettersTrack = (keys, src) => ({ kind: 'letters', by: 'words', items: keys.flatMap((k) => collectionItems(k, src)) });
/** @param {PlanItem[]} items @returns {PlanTrack} */
const bibleTrack = (items) => ({ kind: 'bible', by: 'count', items });

/**
 * @typedef {{ id: string, group: 'bible' | 'letters' | 'starter', name: string, sub: string, letters?: boolean,
 *   tracks: (src: LetterSource | null, opt?: any) => PlanTrack[], pace: PlanPace, weekdays?: boolean[],
 *   paces?: PlanPace[] }} PlanDef
 */

/** The plans there are (call 1A), in the order the Plans screen lists them. @type {PlanDef[]} */
export const PLAN_CATALOG = [
  { id: 'bible-year', group: 'bible', name: 'Bible in a Year', sub: 'Genesis to Revelation · 90 days to 2 years',
    tracks: () => [bibleTrack(bibleItems('genesis', 1, 'revelation'))], pace: { mode: 'days', n: 365 },
    paces: [{ mode: 'days', n: 90 }, { mode: 'days', n: 365 }, { mode: 'days', n: 730 }, { mode: 'by' }] },
  { id: 'new-testament', group: 'bible', name: 'New Testament', sub: 'A chapter each weekday · 260 days',
    tracks: () => [bibleTrack(bibleItems('matthew-plain', 1, 'revelation'))], pace: { mode: 'days', n: 260 }, weekdays: WEEKDAYS },
  { id: 'psalms', group: 'bible', name: 'Psalms', sub: 'Five psalms a day · 30 days',
    tracks: () => [bibleTrack(bibleItems('psalms'))], pace: { mode: 'days', n: 30 } },
  { id: 'proverbs', group: 'bible', name: 'Proverbs in 31 days', sub: 'A chapter a day',
    tracks: () => [bibleTrack(bibleItems('proverbs'))], pace: { mode: 'days', n: 31 } },
  { id: 'gospels', group: 'bible', name: 'The Gospels', sub: 'Matthew to John · 45 days',
    tracks: () => [bibleTrack(bibleItems('matthew-plain', 1, 'john'))], pace: { mode: 'days', n: 45 } },
  { id: 'seven-volumes', group: 'letters', name: 'The Seven Volumes', sub: 'Volumes One to Seven · about 5 min a day', letters: true,
    tracks: (src) => [lettersTrack(SEVEN, src)], pace: { mode: 'minutes', n: 5 } },
  { id: 'letters-year', group: 'letters', name: 'Letters in a Year', sub: 'Every collection, balanced by words', letters: true,
    tracks: (src) => [lettersTrack(LETTER_CHAIN, src)], pace: { mode: 'days', n: 365 } },
  { id: 'volumes', group: 'letters', name: 'Every letter, in order', sub: 'All 14 collections · about 5 min a day', letters: true,
    tracks: (src) => [lettersTrack(LETTER_CHAIN, src)], pace: { mode: 'minutes', n: 5 } },
  { id: 'collection', group: 'letters', name: 'One collection', sub: 'Any collection, at your pace', letters: true,
    tracks: (src, opt) => [lettersTrack([String(opt && opt.volKey || 'one')], src)], pace: { mode: 'minutes', n: 5 } },
  { id: 'blessed', group: 'starter', name: 'The Blessed', sub: '8 days', letters: true,
    tracks: (src) => [{ ...lettersTrack(['blessed'], src), by: 'count' }], pace: { mode: 'items', n: 1 } },
  { id: 'timothy', group: 'starter', name: 'Timothy', sub: '15 days', letters: true,
    tracks: (src) => [{ ...lettersTrack(['timothy'], src), by: 'count' }], pace: { mode: 'items', n: 1 } },
  { id: 'holy-days', group: 'starter', name: 'Holy Days', sub: '16 days', letters: true,
    tracks: (src) => [{ ...lettersTrack(['holydays'], src), by: 'count' }], pace: { mode: 'items', n: 1 } },
  { id: 'matthew-study', group: 'starter', name: 'Matthew Study Bible', sub: '28 days',
    tracks: () => [bibleTrack(bibleItems('matthew-plain').map((it) => ({ ...it, k: 'matthew:' + it.k.split(':')[1] })))], pace: { mode: 'days', n: 28 } },
];

/** @param {string} id @returns {PlanDef | null} */
export const planDef = (id) => PLAN_CATALOG.find((p) => p.id === id) || null;

/** A run's name: the catalog's, the reader's own for a custom plan, or the collection's for One collection. */
export function runName(run, src) {
  if (run.name) return run.name;
  const def = planDef(run.plan);
  return def ? def.name : 'Reading plan';
}

/**
 * Start a catalog plan. Null when it needs the Volumes and they are not loaded.
 * @param {string} id @param {LetterSource | null} src @param {Date} now
 * @param {{ pace?: PlanPace, weekdays?: boolean[], volKey?: string, name?: string }} [opt]
 * @returns {PlanRun | null}
 */
export function startCatalogPlan(id, src, now, opt = {}) {
  const def = planDef(id);
  if (!def) return null;
  const tracks = def.tracks(src, opt);
  if (!tracks.some((t) => t.items.length)) return null;
  const run = newRun({ plan: id, tracks, pace: opt.pace || def.pace, weekdays: opt.weekdays || def.weekdays || ALL_WEEK }, now);
  if (id === 'collection') {
    const col = src && src.colByKey.get(String(opt.volKey || 'one'));
    run.name = (col && (col.label || col.short)) || 'One collection';
  } else if (opt.name) run.name = opt.name;
  return run;
}

/**
 * rp1's plans (settings.readingPlans: [{ id: 'bible-year' | 'volumes', start, pace? }]) as runs. A day keeps its
 * portion (Bible by chapter count over 365 days; the Volumes at rp1's letters a day), what was already read
 * becomes ticks with no date (rp1 counted anything ever read, so the plan looks as it did), and the planned finish
 * is the old one. Plans the store already holds (same plan, same start) are skipped, so this can run twice.
 * @param {any[]} old @param {(bid: string, cid: any) => boolean} isRead @param {LetterSource | null} src
 * @param {PlanRun[]} existing @param {Date} now
 * @returns {PlanRun[]} the new runs
 */
export function migrateRp1(old, isRead, src, existing, now) {
  const out = [];
  for (const p of Array.isArray(old) ? old : []) {
    if (!p || typeof p.start !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(p.start)) continue;
    if (p.id !== 'bible-year' && p.id !== 'volumes') continue;
    if (existing.some((r) => r.plan === p.id && r.start === p.start) || out.some((r) => r.plan === p.id)) continue;
    const tracks = p.id === 'bible-year' ? [bibleTrack(bibleItems('genesis', 1, 'revelation'))]
      : [{ ...lettersTrack(LETTER_CHAIN, src), by: /** @type {'count'} */ ('count') }];
    if (!tracks[0].items.length) continue;   // the Volumes are not loaded yet: try again when they are
    const [y, m, d] = p.start.split('-').map(Number);
    const startDate = new Date(y, m - 1, d, 12);
    const pace = p.id === 'bible-year' ? { mode: 'days', n: 365 } : { mode: 'items', n: Math.max(1, Math.floor(Number(p.pace) || 1)) };
    const run = newRun({ plan: p.id, tracks, pace: /** @type {PlanPace} */ (pace) }, startDate);
    run.created = now.getTime();
    run.updated = now.getTime();
    run.from = 'rp1';
    for (const it of tracks[0].items) {
      const i = it.k.lastIndexOf(':');
      if (isRead(it.k.slice(0, i), it.k.slice(i + 1))) run.ticks[it.k] = '';
    }
    if (runStatus(run, now).finished) { run.status = 'finished'; run.finished = p.start; }
    out.push(run);
  }
  return out;
}
