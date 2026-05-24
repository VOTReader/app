/* ══════════════════════════════════════════════════════════════════════
   RecentNavStore — LinkPicker history
   ══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into bundle-b via _entry-b.js.
   Depends on: CachedStore (loaded before this).
   ═══════════════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';

/**
 * A nav-item record persisted in the recent-nav cache. Shape mirrors
 * NavItem from utils/nav-index.js but is wider to accept all the kinds
 * the LinkPicker can record. `ts` is set on add().
 *
 * @typedef {{
 *   kind: string,
 *   bookId?: string,
 *   chapter?: number,
 *   letterId?: string,
 *   entryId?: string,
 *   ts?: number,
 *   [k: string]: any
 * }} NavItemRecord
 */

/* ── Recent navigations (LinkPicker history) ──
   Persists up to 30 entries; surfaces the last 20 to the UI. Dedups on
   the (kind, bookId, chapter, letterId, entryId) tuple so re-opening the
   same destination doesn't push older items off the list. */
export const RecentNavStore = extendStore(
  CachedStore('vot-recent-nav', /** @type {NavItemRecord[]} */ ([])),
  {
    /**
     * Top-20 of the recent list (newest first).
     * @returns {NavItemRecord[]}
     */
    list() { return this._load().slice(0, 20); },

    /**
     * Insert a nav item at the top of the list. No-op when item is null
     * or has no `kind`. Dedups against the (kind/bookId/chapter/letterId/
     * entryId) tuple and trims the list to 30 entries.
     * @param {NavItemRecord | null | undefined} item
     * @returns {void}
     */
    add(item) {
      if (!item || !item.kind) return;
      let data = this._load();
      const sig = JSON.stringify({ kind: item.kind, bookId: item.bookId, chapter: item.chapter, letterId: item.letterId, entryId: item.entryId });
      data = data.filter(x => JSON.stringify({ kind: x.kind, bookId: x.bookId, chapter: x.chapter, letterId: x.letterId, entryId: x.entryId }) !== sig);
      data.unshift({ ...item, ts: Date.now() });
      data = data.slice(0, 30);
      this._cache = data;
      this._save();
    }
  }
);
