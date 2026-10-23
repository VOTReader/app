/* ═══════════════════════════════════════════════════════════════════════
   plan-builder — the reader's own reading plan (mw18, Corbin 2026-10-22)
   ═══════════════════════════════════════════════════════════════════════
   "should be able to do a custom reading plan where you personally select
   what you want, whether the whole bible, or a bible book or a few chapters
   and a few letters or any kind of combination that also breaks down how
   many letters/chapters/words/minutes you'll read daily, account for missed
   days". The picks (whole books or some chapters, whole collections or some
   letters) become the same engine run the catalog plans are; a mix of Bible
   and letters shares each day side by side (his pick, A) or reads one after
   the other (B). Missed days are the engine's (behind, Catch me up, Spread
   it out). Pure: the Volumes arrive through `src`, never globals.
   ═══════════════════════════════════════════════════════════════════════ */

import { BIBLE_BOOKS } from './reading-plans.js';
import { bibleItems, collectionItems, bookTitle, LETTER_CHAIN } from './plan-catalog.js';
import { newRun, totalDays, minutesFor } from './plan-engine.js';

/** @typedef {import('./plan-engine.js').PlanItem} PlanItem */
/** @typedef {import('./plan-engine.js').PlanTrack} PlanTrack */
/** @typedef {import('./plan-engine.js').PlanPace} PlanPace */
/** @typedef {import('./plan-catalog.js').LetterSource} LetterSource */
/**
 * One pick, in the order the reader made it: a Bible book (`ch` null = all of it) or a collection (`ids` null = all
 * of it; else the letters' ids, the preface's included).
 * @typedef {{ t: 'b', bid: string, ch: number[] | null } | { t: 'l', volKey: string, ids: string[] | null }} Pick
 */

const BOOK_INDEX = new Map(BIBLE_BOOKS.map((b, i) => [b[0], i]));
const NT_FROM = BOOK_INDEX.get('matthew-plain') ?? 39;
/** The three whole-Bible groups the pick screen offers above the books. */
export const BIBLE_GROUPS = Object.freeze([
  { id: 'all', name: 'Whole Bible', sub: 'Genesis to Revelation', books: BIBLE_BOOKS.map((b) => String(b[0])) },
  { id: 'ot', name: 'Old Testament', sub: 'Genesis to Malachi', books: BIBLE_BOOKS.slice(0, NT_FROM).map((b) => String(b[0])) },
  { id: 'nt', name: 'New Testament', sub: 'Matthew to Revelation', books: BIBLE_BOOKS.slice(NT_FROM).map((b) => String(b[0])) },
]);

/** A book's chapter count. @param {string} bid */
export const chapterCount = (bid) => { const i = BOOK_INDEX.get(bid); return i == null ? 0 : Number(BIBLE_BOOKS[i][2]); };

/** The items one pick stands for. @param {Pick} p @param {LetterSource | null} src @returns {PlanItem[]} */
export function pickItems(p, src) {
  if (p.t === 'b') {
    const all = bibleItems(p.bid);
    if (!p.ch) return all;
    const want = new Set(p.ch.map(String));
    return all.filter((it) => want.has(it.k.slice(it.k.lastIndexOf(':') + 1)));
  }
  const all = collectionItems(p.volKey, src);
  if (!p.ids) return all;
  const want = new Set(p.ids);
  return all.filter((it) => want.has(it.k.slice(it.k.lastIndexOf(':') + 1)));
}

/** "1-11", "1, 3, 5-7" for some chapters. @param {number[]} ch */
function chapterRanges(ch) {
  const s = [...new Set(ch)].sort((a, b) => a - b);
  const out = [];
  for (let i = 0; i < s.length; i++) {
    let j = i;
    while (j + 1 < s.length && s[j + 1] === s[j] + 1) j++;
    out.push(i === j ? String(s[i]) : s[i] + '-' + s[j]);
    i = j;
  }
  return out.join(', ');
}

/** A pick as the reader says it: "Genesis", "Genesis 1-11", "Volume Seven", "Volume Seven: 3 letters". @param {Pick} p @param {LetterSource | null} src */
export function pickName(p, src) {
  if (p.t === 'b') {
    const title = bookTitle(p.bid) || p.bid;
    return !p.ch || p.ch.length >= chapterCount(p.bid) ? title : title + ' ' + chapterRanges(p.ch);
  }
  const col = src && src.colByKey ? src.colByKey.get(p.volKey) : null;
  const label = (col && (col.label || col.short)) || p.volKey;
  if (!p.ids) return label;
  return label + ': ' + p.ids.length + (p.ids.length === 1 ? ' letter' : ' letters');
}

/** A name for the plan from its picks: "Genesis and Volume Seven", "Genesis, John and more". @param {Pick[]} picks @param {LetterSource | null} src */
export function defaultName(picks, src) {
  const names = picks.map((p) => pickName(p, src));
  if (!names.length) return 'My reading plan';
  if (names.length === 1) return names[0];
  if (names.length === 2) return names[0] + ' and ' + names[1];
  return names[0] + ', ' + names[1] + ' and more';
}

/**
 * The plan's tracks: the Bible picks as one track and the letters as another, each in the order picked or in
 * Bible order (Genesis to Revelation; the Volumes in site order). An item picked twice is read once. As picked,
 * the kind picked first comes first (it leads a one-after-the-other plan); in Bible order the Bible does.
 * @param {Pick[]} picks @param {'picked' | 'canonical'} order @param {LetterSource | null} src
 * @returns {PlanTrack[]}
 */
export function builderTracks(picks, order, src) {
  const bible = picks.filter((p) => p.t === 'b');
  const letters = picks.filter((p) => p.t === 'l');
  if (order === 'canonical') {
    bible.sort((a, b) => (BOOK_INDEX.get(/** @type {any} */ (a).bid) ?? 0) - (BOOK_INDEX.get(/** @type {any} */ (b).bid) ?? 0));
    letters.sort((a, b) => LETTER_CHAIN.indexOf(/** @type {any} */ (a).volKey) - LETTER_CHAIN.indexOf(/** @type {any} */ (b).volKey));
  }
  const seen = new Set();
  const once = (/** @type {PlanItem[]} */ items) => items.filter((it) => (seen.has(it.k) ? false : (seen.add(it.k), true)));
  const b = once(bible.flatMap((p) => pickItems(p, src)));
  const l = once(letters.flatMap((p) => pickItems(p, src)));
  /** @type {PlanTrack[]} */
  const tracks = [];
  if (b.length) tracks.push({ kind: 'bible', by: 'words', items: b });
  if (l.length) tracks.push({ kind: 'letters', by: 'words', items: l });
  const lettersFirst = order !== 'canonical' && picks.length > 0 && picks[0].t === 'l';
  return lettersFirst ? tracks.reverse() : tracks;
}

/**
 * What the reader set on the goal screen, as an engine spec for newRun.
 * @param {{ picks: Pick[], order: 'picked' | 'canonical', share: 'side' | 'serial', goal: PlanPace, weekdays: boolean[], name?: string }} b
 * @param {LetterSource | null} src
 */
export function builderSpec(b, src) {
  // "N chapters or letters a day" counts items; every other goal balances the days by words.
  const tracks = builderTracks(b.picks, b.order, src).map((t) => (b.goal && b.goal.mode === 'items' ? { ...t, by: /** @type {'count'} */ ('count') } : t));
  return { plan: 'custom', name: (b.name || '').trim() || defaultName(b.picks, src), tracks, share: b.share, pace: b.goal, weekdays: b.weekdays };
}

/** "2 chapters", "a chapter every 3 days", "" for none. @param {number} n per day @param {string} one @param {string} many */
function perDay(n, one, many) {
  if (!(n > 0)) return '';
  if (n < 0.75) { const every = Math.round(1 / n); return 'a ' + one + ' every ' + (every <= 1 ? 'day' : every + ' days'); }
  const r = Math.round(n);
  return r + ' ' + (r === 1 ? one : many);
}

/**
 * The live breakdown while building (and the same numbers the plan will keep): what the picks hold, and what each
 * reading day asks.
 * @param {ReturnType<typeof builderSpec>} spec @param {Date} now
 * @returns {{ chapters: number, letters: number, words: number, picked: string, days: number, finish: string,
 *   each: string, dayWords: number, dayMinutes: number } | null}
 */
export function builderPreview(spec, now) {
  const items = spec.tracks.flatMap((t) => t.items);
  if (!items.length) return null;
  let chapters = 0, letters = 0, words = 0;
  for (const it of items) { if (it.t) letters++; else chapters++; words += Number(it.w) || 0; }
  const run = newRun(spec, now);
  const days = totalDays(run);
  const fmt = (/** @type {number} */ n) => n.toLocaleString('en-US');
  const picked = [chapters ? fmt(chapters) + (chapters === 1 ? ' chapter' : ' chapters') : '', letters ? fmt(letters) + (letters === 1 ? ' letter' : ' letters') : '']
    .filter(Boolean).join(' + ') + ' · about ' + fmt(Math.round(words / 1000) * 1000 || words) + ' words';
  const each = [perDay(chapters / days, 'chapter', 'chapters'), perDay(letters / days, 'letter', 'letters')].filter(Boolean).join(' + ');
  const dayWords = Math.round(words / days);
  return { chapters, letters, words, picked, days, finish: run.target, each, dayWords, dayMinutes: minutesFor(dayWords) };
}
