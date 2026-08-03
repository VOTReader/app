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
       in-progress items: powers resume-at-first-unread-paragraph
       (and, later, the held per-letter skim indicator). LRU-bounded
       to 50 in-progress items; an item's entry is DELETED the moment
       it completes (the frontier of a finished read is meaningless).

   Day semantics reuse _jrnDateStr (local-timezone calendar dates),
   matching JournalStats + ReadingStreak so all three "day" concepts
   agree across midnight.
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
 *   progress: Record<string, { b: number, c: number[], t: number }>
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
     * @param {number} [ts]
     * @returns {void}
     */
    recordProgress(key, blockCount, creditedIdx, ts) {
      if (this._shouldDefer('recordProgress', key, blockCount, creditedIdx, ts)) return;
      if (!key || !blockCount) return;
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
      map[key] = { b: blockCount, c: merged, t: ts || Date.now() };

      var keys = Object.keys(map);
      if (keys.length > MAX_PROGRESS_ITEMS) {
        keys.sort(function(a, b) { return (map[a].t || 0) - (map[b].t || 0); });
        for (var k = 0; k < keys.length - MAX_PROGRESS_ITEMS; k++) delete map[keys[k]];
      }
      this._save();
    },

    /**
     * In-progress data for one item, or null.
     * @param {string} key
     * @returns {{ b: number, c: number[], t: number } | null}
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
      }
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
        wpmSamples: Array.isArray(d.wpmSamples) ? d.wpmSamples : [],
        progress: (d.progress && typeof d.progress === 'object') ? d.progress : {}
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
      var now = Date.now();
      for (var i = n - 1; i >= 0; i--) {
        var d = _jrnDateStr(now - i * 86400000);
        out.push({ date: d, words: byDay[d] || 0 });
      }
      return out;
    }
  }
);
