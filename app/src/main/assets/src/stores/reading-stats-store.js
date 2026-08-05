/* ═══════════════════════════════════════════════════════════════
   READING STATS STORE — words read, pace, and in-progress frontiers
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Bundled into bundle-b via _entry-b.js.
   Depends on: CachedStore/extendStore + _jrnDateStr (journal-stats).

   The measurement half of the read detector (use-read-tracker.js):
   the detector decides WHEN a genuine read happened; this store is
   the durable ledger of WHAT that adds up to.

   Tracks:
     - totalWordsRead / totalActiveMs / totalCompletions — lifetime
       sums of CREDITED reads (detector-fired or the words at manual
       mark time). activeMs is visibility-honest reading time only.
     - rereads — completions of an item that was already read once.
     - wordsByDay — 'YYYY-MM-DD' → words credited that local day.
       Bounded: pruned to the most recent ~400 day keys.
     - wpmSamples — rolling window (50) of {w, ms} from completed
       reads with sane pace, for the MEASURED words-per-minute the
       display surfaces use instead of a 230-wpm guess.
     - progress — readKey → { b: blockCount, c: credited segment
       indices, t: last-touch ts }. The per-item reading FRONTIER for
       in-progress items. RECORDING-ONLY since 2026-08-04: it does NOT
       move the viewport — the frontier jump was retired by owner call
       and use-scroll-memory's saved position owns reopening. The data
       feeds the reading record and the held per-letter skim indicator
       (BACKLOG [21]). LRU-bounded to 50 in-progress items; an item's
       entry is DELETED the moment it completes (the frontier of a
       finished read is meaningless).

   Day semantics reuse _jrnDateStr (local-timezone calendar dates),
   matching JournalStats + ReadingStreak so all three "day" concepts
   agree across midnight.

   EVERY mutation calls _save() AND _bump() (CachedStore's contract).
   Until 2026-08-04 only replaceAll bumped, so getVersion() sat frozen
   through completions, pace samples and frontier writes — and both
   subscribers (MyProgressScreen.jsx:118, SettingsScreen.jsx:405) read
   this store through useSyncExternalStore(subscribe, getVersion). An open
   stats screen therefore showed stale numbers no matter how much the
   reader read; you only saw the truth by navigating away and back.
   ═══════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';
import { _jrnDateStr } from './journal-stats-store.js';

/**
 * @typedef {{
 *   totalWordsRead: number,
 *   totalActiveMs: number,
 *   totalCompletions: number,
 *   rereads: number,
 *   wordsByDay: Record<string, number>,
 *   wpmSamples: Array<{ w: number, ms: number }>,
 *   progress: Record<string, { b: number, c: number[], t: number,
 *                              w?: number, tw?: number }>
 * }} ReadingStatsData
 */

var MAX_DAY_KEYS = 400;
var MAX_WPM_SAMPLES = 50;
var MAX_PROGRESS_ITEMS = 50;
// Pace sanity band for wpm samples: outside it the "read" was autoscroll
// parked overnight or a skim the detector shouldn't have credited — either
// way not evidence about the user's true pace.
var WPM_MIN = 30;
var WPM_MAX = 1500;
// A measured pace is only shown once it rests on this many samples.
var WPM_MIN_SAMPLES = 5;

/**
 * Coerce an imported `progress` map into exactly the shape recordProgress
 * writes, dropping anything that can't be made sense of, and keep only the
 * most-recently-touched MAX_PROGRESS_ITEMS. Import validation checks the
 * envelope's top level only, so this is where nested reading stats get their
 * type + bounds check.
 *
 * @param {any} raw
 * @returns {Record<string, { b: number, c: number[], t: number, w?: number, tw?: number }>}
 */
function _normalizeProgress(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  /** @type {Record<string, any>} */
  var out = {};
  var keys = Object.keys(raw);
  for (var i = 0; i < keys.length; i++) {
    var v = raw[keys[i]];
    if (!v || typeof v !== 'object') continue;
    var b = Math.max(0, Math.floor(Number(v.b) || 0));
    if (!b) continue;                                   // no block count = unusable
    var c = [];
    if (Array.isArray(v.c)) {
      var seen = {};
      for (var j = 0; j < v.c.length; j++) {
        var idx = Math.floor(Number(v.c[j]));
        // In-range, integral, de-duplicated — the invariants the readers
        // (and the frontier math) assume of a locally-written entry.
        if (!isFinite(idx) || idx < 0 || idx >= b || seen[idx]) continue;
        seen[idx] = true;
        c.push(idx);
      }
      c.sort(function(a, z) { return a - z; });
    }
    /** @type {any} */
    var entry = { b: b, c: c, t: Math.max(0, Math.floor(Number(v.t) || 0)) };
    var tw = Number(v.tw), w = Number(v.w);
    if (isFinite(tw) && tw > 0) entry.tw = tw;
    if (isFinite(w) && w >= 0) entry.w = entry.tw ? Math.min(w, entry.tw) : w;
    out[keys[i]] = entry;
  }
  var outKeys = Object.keys(out);
  if (outKeys.length > MAX_PROGRESS_ITEMS) {
    outKeys.sort(function(a, z) { return (out[a].t || 0) - (out[z].t || 0); });
    for (var k = 0; k < outKeys.length - MAX_PROGRESS_ITEMS; k++) delete out[outKeys[k]];
  }
  return out;
}

export var ReadingStatsStore = extendStore(
  CachedStore('vot-reading-stats', /** @type {ReadingStatsData} */ ({
    totalWordsRead: 0,
    totalActiveMs: 0,
    totalCompletions: 0,
    rereads: 0,
    wordsByDay: {},
    wpmSamples: [],
    progress: {}
  }), { idb: true }),
  {
    /** @returns {ReadingStatsData} */
    get() { return this._load(); },

    /**
     * Record one CREDITED read completion.
     *
     * @param {{ key: string, words: number, activeMs: number,
     *           wasReadBefore?: boolean, ts?: number }} args
     * @returns {void}
     */
    recordCompletion(args) {
      if (this._shouldDefer('recordCompletion', args)) return;
      var words = Math.max(0, Math.round((args && args.words) || 0));
      var ms = Math.max(0, Math.round((args && args.activeMs) || 0));
      if (!words) return;
      var data = this._load();
      data.totalWordsRead = (data.totalWordsRead || 0) + words;
      data.totalActiveMs = (data.totalActiveMs || 0) + ms;
      data.totalCompletions = (data.totalCompletions || 0) + 1;
      if (args && args.wasReadBefore) data.rereads = (data.rereads || 0) + 1;

      var day = _jrnDateStr(args && args.ts);
      var byDay = data.wordsByDay || (data.wordsByDay = {});
      byDay[day] = (byDay[day] || 0) + words;
      var dayKeys = Object.keys(byDay);
      if (dayKeys.length > MAX_DAY_KEYS) {
        dayKeys.sort();  // YYYY-MM-DD sorts chronologically
        for (var i = 0; i < dayKeys.length - MAX_DAY_KEYS; i++) delete byDay[dayKeys[i]];
      }

      // NOTE: no pace sampling here. Completion fires the instant activeMs
      // crosses the required floor, so a completion-time sample is biased
      // toward exactly the 600-wpm ceiling on every fits-viewport page.
      // Pace evidence arrives via recordPaceSample at VISIT END instead.

      // A completed item's frontier is meaningless — a future visit starts
      // a fresh read-through.
      if (args && args.key && data.progress && data.progress[args.key]) {
        delete data.progress[args.key];
      }
      this._save();
      this._bump();
    },

    /**
     * Merge in-progress segment credits for one item (the frontier data).
     * Called throttled by the read tracker while a partial read is under
     * way. `creditedIdx` are indices into the item's rendered segment
     * list; they UNION with what's already stored so revisits extend
     * rather than reset.
     *
     * @param {string} key
     * @param {number} blockCount
     * @param {number[]} creditedIdx
     * `segmentWords` lets display surfaces report word-weighted progress.
     * Older callers may still pass `ts` as the fourth argument.
     *
     * @param {number[] | number} [segmentWords]
     * @param {number} [ts]
     * @returns {void}
     */
    recordProgress(key, blockCount, creditedIdx, segmentWords, ts) {
      if (this._shouldDefer('recordProgress', key, blockCount, creditedIdx, segmentWords, ts)) return;
      if (!key || !blockCount) return;
      var weights = Array.isArray(segmentWords) ? segmentWords : null;
      var touchedAt = weights ? ts : /** @type {number | undefined} */ (segmentWords);
      var data = this._load();
      var map = data.progress || (data.progress = {});
      var prev = map[key];
      // A block-count change means the content re-rendered differently
      // (font change reflow doesn't alter segment COUNT — data edits or a
      // different translation do). Stale indices are useless: start over.
      var credited = (prev && prev.b === blockCount) ? prev.c : [];
      var set = {};
      for (var i = 0; i < credited.length; i++) set[credited[i]] = true;
      for (var j = 0; j < (creditedIdx || []).length; j++) set[creditedIdx[j]] = true;
      var merged = Object.keys(set).map(Number).sort(function(a, b) { return a - b; });
      var next = { b: blockCount, c: merged, t: touchedAt || Date.now() };
      if (weights && weights.length === blockCount) {
        next.tw = weights.reduce(function(sum, w) { return sum + Math.max(0, Number(w) || 0); }, 0);
        next.w = merged.reduce(function(sum, idx) { return sum + Math.max(0, Number(weights[idx]) || 0); }, 0);
      }
      map[key] = next;

      var keys = Object.keys(map);
      if (keys.length > MAX_PROGRESS_ITEMS) {
        keys.sort(function(a, b) { return (map[a].t || 0) - (map[b].t || 0); });
        for (var k = 0; k < keys.length - MAX_PROGRESS_ITEMS; k++) delete map[keys[k]];
      }
      this._save();
      this._bump();
    },

    /**
     * In-progress data for one item, or null.
     * @param {string} key
     * @returns {{ b: number, c: number[], t: number, w?: number, tw?: number } | null}
     */
    getProgress(key) {
      var map = this._load().progress;
      return (map && map[key]) || null;
    },

    /**
     * Index of the FIRST segment never credited — the resume frontier —
     * or null when there is no useful frontier (no data, count mismatch
     * with the rendered content, or nothing read yet so the top is the
     * frontier anyway).
     *
     * @param {string} key
     * @param {number} renderedBlockCount  segment count of the live DOM
     * @returns {number | null}
     */
    firstUnreadIndex(key, renderedBlockCount) {
      var p = this.getProgress(key);
      if (!p || !p.c.length) return null;
      if (renderedBlockCount && p.b !== renderedBlockCount) return null;
      var credited = {};
      for (var i = 0; i < p.c.length; i++) credited[p.c[i]] = true;
      for (var idx = 0; idx < p.b; idx++) {
        if (!credited[idx]) return idx === 0 ? null : idx;
      }
      return null; // everything credited — no frontier
    },

    /**
     * @param {string} key
     * @returns {void}
     */
    clearProgress(key) {
      if (this._shouldDefer('clearProgress', key)) return;
      var data = this._load();
      if (data.progress && data.progress[key]) {
        delete data.progress[key];
        this._save();
        this._bump();
      }
    },

    /**
     * Clear every in-progress frontier under one read-key prefix. Lifetime
     * words/time/streak data is deliberately retained: clearing checkmarks
     * resets navigation state, not the historical reading ledger.
     * @param {string} prefix
     * @returns {void}
     */
    clearProgressByPrefix(prefix) {
      if (this._shouldDefer('clearProgressByPrefix', prefix)) return;
      if (!prefix) return;
      var data = this._load();
      var map = data.progress;
      if (!map) return;
      var changed = false;
      Object.keys(map).forEach(function(key) {
        if (key.indexOf(prefix) === 0) { delete map[key]; changed = true; }
      });
      if (changed) { this._save(); this._bump(); }
    },

    /**
     * Median measured reading pace in words/minute, or null until enough
     * completed reads exist to be honest about it.
     * @returns {number | null}
     */
    measuredWpm() {
      var samples = this._load().wpmSamples || [];
      if (samples.length < WPM_MIN_SAMPLES) return null;
      var rates = samples.map(function(s) { return s.w / s.ms * 60000; })
        .sort(function(a, b) { return a - b; });
      var mid = Math.floor(rates.length / 2);
      var med = rates.length % 2 ? rates[mid] : (rates[mid - 1] + rates[mid]) / 2;
      return Math.round(med);
    },

    /**
     * A reading-PACE sample, recorded by the tracker at VISIT END (not at
     * the completion instant — completion fires the moment activeMs crosses
     * the required floor, so completion-time samples would bias toward
     * exactly 600 wpm on every fits-viewport page). Only plausible-pace
     * samples where the reader demonstrably kept reading past the minimum
     * become evidence.
     *
     * @param {{ words: number, activeMs: number, requiredMs: number }} args
     * @returns {void}
     */
    recordPaceSample(args) {
      if (this._shouldDefer('recordPaceSample', args)) return;
      var words = Math.max(0, Math.round((args && args.words) || 0));
      var ms = Math.max(0, Math.round((args && args.activeMs) || 0));
      var required = Math.max(0, Math.round((args && args.requiredMs) || 0));
      if (!words || !ms) return;
      // Boundary guard: a session that ended AT the minimum (walk-away,
      // skim that barely qualified) says nothing about true pace.
      if (ms <= required + 1500) return;
      var wpm = words / ms * 60000;
      if (wpm < WPM_MIN || wpm > WPM_MAX) return;
      var data = this._load();
      var samples = data.wpmSamples || (data.wpmSamples = []);
      samples.push({ w: words, ms: ms });
      if (samples.length > MAX_WPM_SAMPLES) samples.splice(0, samples.length - MAX_WPM_SAMPLES);
      this._save();
      this._bump();
    },

    /**
     * Replace the entire stats object (import path). Defaults fill in any
     * missing fields so a partial payload doesn't break readers.
     * @param {Partial<ReadingStatsData> | null | undefined} data
     * @returns {void}
     */
    replaceAll(data) {
      if (this._shouldDefer('replaceAll', data)) return;
      var d = (data && typeof data === 'object' && !Array.isArray(data)) ? data : /** @type {any} */ ({});
      this._cache = /** @type {any} */ ({
        totalWordsRead: d.totalWordsRead || 0,
        totalActiveMs: d.totalActiveMs || 0,
        totalCompletions: d.totalCompletions || 0,
        rereads: d.rereads || 0,
        wordsByDay: (d.wordsByDay && typeof d.wordsByDay === 'object') ? d.wordsByDay : {},
        wpmSamples: Array.isArray(d.wpmSamples) ? d.wpmSamples.slice(-MAX_WPM_SAMPLES) : [],
        // Import is a TRUST BOUNDARY: the envelope validator checks the
        // top-level shape only, so nested per-item progress arrived
        // unchecked and unbounded — a hand-edited or corrupt .votbak could
        // seed thousands of entries with garbage members, breaking the
        // LRU-50 invariant every writer assumes and feeding NaN into the
        // word-weighted progress math. Normalize to the same shape
        // recordProgress writes, then apply the same bound.
        progress: _normalizeProgress(d.progress)
      });
      this._save();
      this._bump();
    },

    /**
     * The last `n` local calendar days (today last), each with the words
     * credited that day — the My Progress mini-bars.
     * @param {number} n
     * @returns {Array<{ date: string, words: number }>}
     */
    wordsForDays(n) {
      var byDay = this._load().wordsByDay || {};
      var out = [];
      // Walk LOCAL CALENDAR dates, not fixed 24-hour steps. Subtracting
      // i * 86400000 skips a day across a DST spring-forward: just after
      // midnight on the day after the transition, "24 hours ago" lands two
      // local dates back, so one bar silently vanished and another repeated.
      // new Date(y, m, d - i) normalizes into the correct calendar day.
      var today = new Date();
      for (var i = n - 1; i >= 0; i--) {
        var day = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
        var d = _jrnDateStr(day.getTime());
        out.push({ date: d, words: byDay[d] || 0 });
      }
      return out;
    }
  }
);
