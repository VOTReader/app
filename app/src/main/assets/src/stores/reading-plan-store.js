/* ═══════════════════════════════════════════════════════════════
   READING PLAN STORE — the reader's plan runs (mw18, 2026-10-22)
   ═══════════════════════════════════════════════════════════════
   Each record is one run of one plan (data/plan-engine.js PlanRun: its
   frozen items, day cuts, weekdays, planned finish and its own dated
   ticks). rp1 kept plans in settings.readingPlans, which merges
   last-writer-wins with the rest of the settings (store-merge.js
   mergeStateStore), so a tick in one tab could undo an edit in another
   (plans brief §6 bug 11). Here every run merges on its own and two
   copies of a run keep the ticks of both.

   noteRead(bid, cid) is called by the read record (useReadProgress) for
   every completed read, full listen and manual mark, BEFORE its global
   Mark-as-read gate: a running plan tracks its own days even with that
   switch off (Corbin's call 3b, 10-22). The Matthew Study Bible marks
   'matthew' while the Bible plans hold 'matthew-plain' (bug 2), so a
   'matthew' read ticks both.

   Registered like every user-data store: idb-adapter STORE_NAMES (+ DB
   version), _entry-b window map, import-validators, backup-flow export,
   user-data-size, data-safety summarize/mergeForRestore.
   ═══════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';
import { mergePlanStore } from './store-merge.js';
import { tickItem, todayKey } from '../data/plan-engine.js';

/** @typedef {import('../data/plan-engine.js').PlanRun} PlanRun */

/** A record worth keeping: an id, a plan, a start, and tracks. @param {any} r */
function _valid(r) {
  return !!(r && typeof r === 'object' && typeof r.id === 'string' && r.id && typeof r.plan === 'string'
    && typeof r.start === 'string' && Array.isArray(r.tracks) && Array.isArray(r.segs));
}

/** The read keys a read of (bid, cid) ticks: 'matthew' reads count for 'matthew-plain' too. */
const _keysFor = (/** @type {string} */ bid, /** @type {any} */ cid) =>
  (bid === 'matthew' ? ['matthew:' + cid, 'matthew-plain:' + cid] : [bid + ':' + cid]);

export const ReadingPlanStore = extendStore(
  CachedStore('vot-reading-plans', /** @type {PlanRun[]} */ ([]), { idb: true, crossTabMerge: mergePlanStore }),
  {
    /** @returns {PlanRun[]} */
    _load() {
      if (this._cache) return this._cache;
      if (this._idb && this._state !== 'loaded') {
        return /** @type {PlanRun[]} */ (this._pendingCache !== null ? this._pendingCache : []);
      }
      try { this._cache = JSON.parse(localStorage.getItem('vot-reading-plans') || '[]'); }
      catch (_e) { this._cache = []; }
      if (!Array.isArray(this._cache)) this._cache = [];
      return /** @type {PlanRun[]} */ (this._cache);
    },

    /** Every run, any status. @returns {PlanRun[]} */
    all() { return this._load().filter(_valid); },

    /** The runs being followed: running or paused. @returns {PlanRun[]} */
    active() { return this.all().filter((r) => r.status === 'running' || r.status === 'paused'); },

    /** @param {string} id @returns {PlanRun | null} */
    get(id) { return this.all().find((r) => r.id === id) || null; },

    /**
     * Add or replace a run (by id).
     * @param {PlanRun} run
     */
    put(run) {
      if (!_valid(run)) return;
      if (this._shouldDefer('put', run)) return;
      const list = this._load().filter((r) => !r || r.id !== run.id);
      list.push(run);
      this._cache = list;
      this._save();
      this._bump();
    },

    /** @param {string} id */
    remove(id) {
      if (this._shouldDefer('remove', id)) return;
      this._cache = this._load().filter((r) => !r || r.id !== id);
      this._save();
      this._bump();
    },

    /**
     * A chapter or letter was read (or listened to the end, or marked): tick it in
     * every running or paused run that holds it. Dated by the reader's local date.
     * @param {string} bid @param {string | number} cid @param {Date} [now]
     */
    noteRead(bid, cid, now) {
      if (!bid || cid == null || cid === '') return;
      if (this._shouldDefer('noteRead', bid, cid, now)) return;
      const when = now || new Date();
      const key = todayKey(when);
      const keys = _keysFor(String(bid), cid);
      let changed = false;
      const next = this._load().map((r) => {
        if (!_valid(r) || (r.status !== 'running' && r.status !== 'paused')) return r;
        let out = r;
        for (const k of keys) out = tickItem(out, k, key, when.getTime());
        if (out !== r) changed = true;
        return out;
      });
      if (!changed) return;
      this._cache = next;
      this._save();
      this._bump();
    },

    /**
     * Replace every run (backup import and restore).
     * @param {PlanRun[] | null | undefined} data
     */
    replaceAll(data) {
      if (this._shouldDefer('replaceAll', data)) return;
      this._cache = Array.isArray(data) ? data.filter(_valid) : [];
      this._save();
      this._bump();
    },
  }
);
