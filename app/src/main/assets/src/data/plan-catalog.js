/* ═══════════════════════════════════════════════════════════════════════
   plan-catalog — the plans a reader can start, and the old plans moved in
   ═══════════════════════════════════════════════════════════════════════
   Corbin's call 1A (10-22): keep Bible in a Year and the Volumes plan, add
   the Seven Volumes, Letters in a Year (balanced by words), one collection
   at a time, short starters (The Blessed, Timothy, Holy Days, the Matthew
   Study Bible) and Bible slices (New Testament, Psalms, Proverbs in 31 days,
   the Gospels). Call 1b A: letter plans are cut by words, and "The Volumes
   in Order" is now "Every letter, in order" (it holds 14 collections).
   plans2 (2026-11-10): groups Start here, The Scriptures, The Letters and
   Together (Volumes and Scriptures in a year, side by side); each plan has
   two sentences for its preview, and its minutes a day and days are
   computed from its items (catalogFacts), never typed.

   Every plan here is the plan engine (plan-engine.js) with a preset choice
   of items; the custom builder makes the same specs from the reader's picks.
   Items are frozen when a run starts: Bible words come from the generated
   plan-bible-words.js (no corpus needed), letters from the loaded Volumes.

   Pure: the Volumes arrive through `src` (the loaded corpus), never globals.
   ═══════════════════════════════════════════════════════════════════════ */

import { BIBLE_BOOKS } from './reading-plans.js';
import { BIBLE_CHAPTER_WORDS } from './plan-bible-words.js';
import { newRun, runStatus, todayKey, resumeAt, startFrom, totalDays, itemsWords, itemsCount, minutesFor } from './plan-engine.js';

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
  // plans2: the preface is marked (p: 1), so a collection's letter count is the same on every screen and the preface
  // is named apart ("29 letters and a preface").
  return list.filter((e) => e && e.id).map((e) => {
    /** @type {PlanItem} */ const it = { k: col.readKey + ':' + e.id, w: Math.max(1, Number(src.words(e)) || 1), t: e.title || e.id, s: short };
    if (pref && e === pref) it.p = 1;
    return it;
  });
}

const ALL_WEEK = [true, true, true, true, true, true, true];
const WEEKDAYS = [false, true, true, true, true, true, false];
const SEVEN = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
/** The Volumes in site order (data/scripture-resolution.js READING_CHAIN). */
export const LETTER_CHAIN = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'rebuke', 'wtlb1', 'wtlb2', 'blessed', 'flock', 'timothy', 'holydays'];

/** A letter's date ("3/28/07") as a sortable number (20070328), or null when it has none. @param {any} e */
function letterDate(e) {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(String((e && e.date) || '').trim());
  if (!m) return null;
  const y = m[3].length === 4 ? Number(m[3]) : 2000 + Number(m[3]);
  return y * 10000 + Number(m[1]) * 100 + Number(m[2]);
}

/**
 * S3: every letter in the order it was given, by its date: Volume Seven falls inside the Volume Four and Five years,
 * the Flock and Timothy interleave. A preface goes just before its collection's first letter; the undated (Words
 * To Live By, The Blessed) come at the end, in site order.
 * @param {LetterSource | null} src @returns {PlanItem[]}
 */
export function chronoItems(src) {
  if (!src || !src.colByKey) return [];
  const rows = [];
  LETTER_CHAIN.forEach((volKey, c) => {
    const col = src.colByKey.get(volKey);
    const items = collectionItems(volKey, src);
    if (!col || !items.length) return;
    const pref = src.preface(col);
    const letters = src.letters(col) || [];
    const byId = new Map(letters.filter((e) => e && e.id).map((e) => [String(e.id), e]));
    const dates = letters.map(letterDate).filter((d) => d != null);
    const first = dates.length ? Math.min(...dates) : null;
    items.forEach((it, i) => {
      const id = it.k.slice(it.k.indexOf(':') + 1);
      const isPref = !!pref && String(pref.id) === id;
      const d = isPref ? first : letterDate(byId.get(id));
      rows.push({ it, d: d == null ? Infinity : d, pre: isPref ? 0 : 1, c, i });
    });
  });
  rows.sort((a, b) => a.d - b.d || a.pre - b.pre || a.c - b.c || a.i - b.i);
  return rows.map((r) => r.it);
}

/** @param {string[]} keys @param {LetterSource | null} src @returns {PlanTrack} */
const lettersTrack = (keys, src) => ({ kind: 'letters', by: 'words', items: keys.flatMap((k) => collectionItems(k, src)) });
/** @param {PlanItem[]} items @returns {PlanTrack} */
const bibleTrack = (items) => ({ kind: 'bible', by: 'count', items });

/**
 * @typedef {{ id: string, group: 'starter' | 'bible' | 'letters' | 'together', name: string, sub: string, about: string,
 *   letters?: boolean, tracks: (src: LetterSource | null, opt?: any) => PlanTrack[], pace: PlanPace, weekdays?: boolean[],
 *   paces?: PlanPace[], share?: 'side' | 'serial' }} PlanDef
 *   sub: one line of what it is (no typed lengths: minutes and days are computed from the items, catalogFacts);
 *   about: the preview's two sentences, prefaces included or not said there
 */

/** The groups of Find a plan, in order (plans2: Start here, The Scriptures, The Letters, Together). */
export const PLAN_GROUPS = Object.freeze([['starter', 'Start here'], ['bible', 'The Scriptures'], ['letters', 'The Letters'], ['together', 'Together']]);

/** The plans there are (call 1A, plans2), in the order Find a plan lists them within each group. @type {PlanDef[]} */
export const PLAN_CATALOG = [
  { id: 'bible-year', group: 'bible', name: 'Bible in a Year', sub: 'Genesis to Revelation',
    about: 'Genesis to Revelation, straight through. About three chapters a day, read or listened to.',
    tracks: () => [bibleTrack(bibleItems('genesis', 1, 'revelation'))], pace: { mode: 'days', n: 365 },
    paces: [{ mode: 'days', n: 90 }, { mode: 'days', n: 365 }, { mode: 'days', n: 730 }] },
  { id: 'new-testament', group: 'bible', name: 'New Testament', sub: 'A chapter each weekday',
    about: 'Matthew to Revelation, one chapter each weekday. Weekends are free.',
    tracks: () => [bibleTrack(bibleItems('matthew-plain', 1, 'revelation'))], pace: { mode: 'days', n: 260 }, weekdays: WEEKDAYS },
  { id: 'psalms', group: 'bible', name: 'Psalms', sub: 'Five psalms a day',
    about: 'All 150 psalms in a month. Five a day, read or listened to.',
    tracks: () => [bibleTrack(bibleItems('psalms'))], pace: { mode: 'days', n: 30 } },
  { id: 'proverbs', group: 'bible', name: 'Proverbs in 31 days', sub: 'A chapter a day',
    about: 'One chapter of Proverbs for each day of a month. Short enough for any morning.',
    tracks: () => [bibleTrack(bibleItems('proverbs'))], pace: { mode: 'days', n: 31 } },
  { id: 'gospels', group: 'bible', name: 'The Gospels', sub: 'Matthew to John',
    about: 'Matthew, Mark, Luke and John, in order. About two chapters a day.',
    tracks: () => [bibleTrack(bibleItems('matthew-plain', 1, 'john'))], pace: { mode: 'days', n: 45 } },
  { id: 'seven-volumes', group: 'letters', name: 'The Seven Volumes', sub: 'Volumes One to Seven', letters: true,
    about: 'Every letter of Volumes One to Seven, in order. Each volume begins with its preface.',
    tracks: (src) => [lettersTrack(SEVEN, src)], pace: { mode: 'minutes', n: 5 } },
  { id: 'letters-year', group: 'letters', name: 'Letters in a Year', sub: 'Every collection, balanced by words', letters: true,
    about: 'All fourteen collections in a year, prefaces included. Each day is about the same length.',
    tracks: (src) => [lettersTrack(LETTER_CHAIN, src)], pace: { mode: 'days', n: 365 } },
  { id: 'volumes', group: 'letters', name: 'Every letter, in order', sub: 'All 14 collections', letters: true,
    about: 'Every letter of all fourteen collections, in the order they stand, prefaces included. A few minutes a day.',
    tracks: (src) => [lettersTrack(LETTER_CHAIN, src)], pace: { mode: 'minutes', n: 5 } },
  { id: 'letters-chrono', group: 'letters', name: 'Letters by date', sub: 'Every letter in the order it was given', letters: true,
    about: 'Every letter in the order it was given. Prefaces come before their collection, and the undated letters come last.',
    tracks: (src) => [{ kind: 'letters', by: 'words', items: chronoItems(src) }], pace: { mode: 'minutes', n: 5 } },
  { id: 'collection', group: 'letters', name: 'One collection', sub: 'Any collection, at your pace', letters: true,
    about: 'One collection of your choice, start to finish, its preface included.',
    tracks: (src, opt) => [lettersTrack([String(opt && opt.volKey || 'one')], src)], pace: { mode: 'minutes', n: 5 } },
  { id: 'blessed', group: 'starter', name: 'The Blessed', sub: 'Eight short readings to begin with', letters: true,
    about: 'The Blessed, one reading a day, its introduction first. A gentle way to begin.',
    tracks: (src) => [{ ...lettersTrack(['blessed'], src), by: 'count' }], pace: { mode: 'items', n: 1 } },
  { id: 'timothy', group: 'starter', name: 'Timothy', sub: 'The letters from Timothy', letters: true,
    about: 'The letters from Timothy, one a day, with the preface first.',
    tracks: (src) => [{ ...lettersTrack(['timothy'], src), by: 'count' }], pace: { mode: 'items', n: 1 } },
  { id: 'holy-days', group: 'starter', name: 'Holy Days', sub: 'One reading a day', letters: true,
    about: 'The Holy Days readings, one a day.',
    tracks: (src) => [{ ...lettersTrack(['holydays'], src), by: 'count' }], pace: { mode: 'items', n: 1 } },
  { id: 'matthew-study', group: 'starter', name: 'Matthew Study Bible', sub: 'A chapter a day with the study',
    about: 'The Gospel of Matthew with the study, one chapter a day.',
    tracks: () => [bibleTrack(bibleItems('matthew-plain').map((it) => ({ ...it, k: 'matthew:' + it.k.split(':')[1] })))], pace: { mode: 'days', n: 28 } },
  // plans2: the first Together plan: the letters in a year and the Bible in a year, side by side on the same days.
  { id: 'together-year', group: 'together', name: 'Volumes and Scriptures in a year', sub: 'The letters and the Bible, side by side', letters: true,
    about: 'Every letter and the whole Bible in a year, side by side: some of each every day. Prefaces included.',
    tracks: (src) => { const l = lettersTrack(LETTER_CHAIN, src); return l.items.length ? [l, bibleTrack(bibleItems('genesis', 1, 'revelation'))] : []; },
    pace: { mode: 'days', n: 365 }, share: 'side',
    paces: [{ mode: 'days', n: 365 }, { mode: 'days', n: 730 }] },
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
 * @param {{ pace?: PlanPace, weekdays?: boolean[], volKey?: string, name?: string, from?: string, startOn?: string }} [opt]
 *   from: start at this letter (n354b's Start where I am), the plan's letters before it left out; startOn: a later
 *   start date (plans2). A new plan starts at zero: what was read before it never counts (Corbin 11-17, 0245).
 * @returns {PlanRun | null}
 */
export function startCatalogPlan(id, src, now, opt = {}) {
  const def = planDef(id);
  if (!def) return null;
  const tracks = opt.from ? startFrom(def.tracks(src, opt), opt.from) : def.tracks(src, opt);
  if (!tracks.some((t) => t.items.length)) return null;
  let run = newRun({ plan: id, tracks, share: def.share, pace: opt.pace || def.pace, weekdays: opt.weekdays || def.weekdays || ALL_WEEK, startOn: opt.startOn }, now);
  if (id === 'collection') {
    const col = src && src.colByKey.get(String(opt.volKey || 'one'));
    run.name = (col && (col.label || col.short)) || 'One collection';
  } else if (opt.name) run.name = opt.name;
  return run;
}

/**
 * What a catalog plan asks, computed from its real items (plans2: no typed lengths): minutes a day (the average day),
 * days, and the items counted ("1,189 chapters", "29 letters and a preface"). Null when its items are not loaded.
 * @param {string} id @param {LetterSource | null} src @param {Date} now @param {any} [opt]
 * @returns {{ minutes: number, days: number, count: string, items: number } | null}
 */
export function catalogFacts(id, src, now, opt) {
  const def = planDef(id);
  if (!def) return null;
  const tracks = def.tracks(src, opt);
  if (!tracks.some((t) => t.items.length)) return null;
  return runFacts(newRun({ plan: id, tracks, share: def.share, pace: (opt && opt.pace) || def.pace, weekdays: def.weekdays || ALL_WEEK }, now));
}

/** The same facts for any run. @param {PlanRun} run */
export function runFacts(run) {
  const items = run.tracks.flatMap((t) => t.items);
  const days = Math.max(1, totalDays(run));
  return { minutes: minutesFor(itemsWords(items) / days), days, count: itemsCount(items), items: items.length };
}

/**
 * n354b: where a catalog plan could start for this reader (its first unread letter, in its own order), or null.
 * @param {string} id @param {LetterSource | null} src @param {(bid: string, cid: string) => boolean} isRead
 * @param {{ volKey?: string }} [opt]
 */
export function catalogResume(id, src, isRead, opt = {}) {
  const def = planDef(id);
  return def && def.letters && src ? resumeAt(def.tracks(src, opt), isRead) : null;
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
    // A fixed id: two tabs moving the same plan make the same run, which the cross-tab merge keeps once.
    const run = newRun({ id: 'rp1_' + p.id + '_' + p.start, plan: p.id, tracks, pace: /** @type {PlanPace} */ (pace) }, startDate);
    run.created = now.getTime();
    run.updated = now.getTime();
    run.from = 'rp1';
    // rp1 kept no dates for what was read, so the days before the move are unknown, never "missed".
    run.known = todayKey(now);
    for (const it of tracks[0].items) {
      const i = it.k.lastIndexOf(':');
      if (isRead(it.k.slice(0, i), it.k.slice(i + 1))) run.ticks[it.k] = '';
    }
    if (runStatus(run, now).finished) { run.status = 'finished'; run.finished = p.start; }
    out.push(run);
  }
  return out;
}
