/* ═══════════════════════════════════════════════════════════════
   LINK STORE — bidirectional link persistence
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Bundled into bundle-b via _entry-b.js.
   Depends on: CachedStore (defined earlier in the main script block).

   Data model:
     vot-links: Array<{
       id:      string,
       source:  LinkEndpoint,   // passage where the user originated the link
       target:  LinkEndpoint,   // destination the user picked
       created: number          // Date.now()
     }>

     LinkEndpoint: {
       type:    'bible' | 'study' | 'letter' | 'wtlb' | 'blessed' | 'holy-days',
       key:     string,   // e.g. "bible:genesis:1:3-7" or "letter:the-wide-path:2:10-40"
       label:   string,
       // Optional:
       bookId?, chapter?, verse?, verseEnd?, collection?, letterId?, entryId?,
       start?,  end?,   // char offsets within the container (source endpoints)
       text?,           // captured text of the linked range
       preview?         // resolved verse / excerpt text for LinkCard display
     }

   Migration: legacy {a, b} records are automatically rewritten to
   {source, target} on first load (one-time per user).
═══════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';

/**
 * A link endpoint (either source or target). The `key` is the hlKey
 * convention shared with BookmarkStore (see bookmark-store.js header for
 * the full grammar). All optional fields are kind-specific; consumers
 * branch on `type` and read what they need.
 *
 * @typedef {{
 *   type: 'bible' | 'study' | 'letter' | 'wtlb' | 'blessed' | 'holy-days',
 *   key: string,
 *   label: string,
 *   bookId?: string,
 *   chapter?: number,
 *   verse?: number,
 *   verseEnd?: number,
 *   collection?: string,
 *   letterId?: string,
 *   entryId?: string,
 *   start?: number,
 *   end?: number,
 *   text?: string,
 *   preview?: string
 * }} LinkEndpoint
 */

/**
 * A link record. Bidirectional in spirit (either endpoint can be "source"
 * depending on which side the user originated from) but stored with a
 * directional source/target so the UI knows which to default to.
 *
 * @typedef {{
 *   id: string,
 *   source: LinkEndpoint,
 *   target: LinkEndpoint,
 *   created: number
 * }} Link
 */

/**
 * Generate a fresh annotation id. (Lives here for historical reasons —
 * AnnotationStore uses it via the bundle-b graph.)
 * @returns {string}
 */
export function hlId() { return 'hl_' + Date.now() + '_' + Math.random().toString(36).slice(2,6); }

/**
 * Generate a fresh link id.
 * @returns {string}
 */
export function lnkId() { return 'lnk_' + Date.now() + '_' + Math.random().toString(36).slice(2,6); }

export const LinkStore = extendStore(
  CachedStore('vot-links', /** @type {Link[]} */ ([])),
  {
    /**
     * Override _load to migrate legacy {a,b} records to {source,target}
     * on first access. Migration is one-time per user: after it runs
     * the persisted data is already in the new shape, so subsequent
     * loads are no-ops in the migration branch.
     *
     * Coalesces FIRST so a half-migrated record (source set but `a`
     * still present, or vice-versa — e.g. an interrupted prior
     * migration or a hand-edited export) is healed instead of silently
     * dropped (was real data-loss in an earlier version).
     *
     * @returns {Link[]}
     */
    _load() {
      if (this._cache) return this._cache;
      try { this._cache = JSON.parse(localStorage.getItem('vot-links') || '[]'); }
      catch (_e) { this._cache = []; }

      let migrated = false;
      this._cache = this._cache.filter(function(/** @type {any} */ lnk) {
        if (!lnk || typeof lnk !== 'object') return false;
        if (!lnk.source && lnk.a) { lnk.source = lnk.a; migrated = true; }
        if (!lnk.target && lnk.b) { lnk.target = lnk.b; migrated = true; }
        if (lnk.a) { delete lnk.a; migrated = true; }
        if (lnk.b) { delete lnk.b; migrated = true; }
        // A record is only unusable if BOTH endpoints (with .key) are missing.
        if (!lnk.source || !lnk.source.key || !lnk.target || !lnk.target.key) {
          console.warn('[LinkStore] dropping malformed record (incomplete endpoints):', lnk.id);
          return false;
        }
        return true;
      });
      if (migrated) this._save(); this._bump();
      return this._cache;
    },

    /**
     * All links touching `key` on either endpoint.
     * @param {string} key
     * @returns {Link[]}
     */
    getForKey(key) {
      return this._load().filter(lnk =>
        (lnk.source && lnk.source.key === key) || (lnk.target && lnk.target.key === key));
    },

    /**
     * All links touching `prefix` (or having `prefix` as a key prefix)
     * on either endpoint. Bidirectional prefix-match — useful for the
     * inline link icon scan in LetterView/WtlbEntryView where block-
     * level keys may have selection-range suffixes.
     * @param {string} prefix
     * @returns {Link[]}
     */
    getForKeyPrefix(prefix) {
      return this._load().filter(lnk => {
        if (!lnk.source || !lnk.source.key || !lnk.target || !lnk.target.key) return false;
        const srcMatch = lnk.source.key === prefix || lnk.source.key.startsWith(prefix + ':') || prefix.startsWith(lnk.source.key + ':');
        const tgtMatch = lnk.target.key === prefix || lnk.target.key.startsWith(prefix + ':') || prefix.startsWith(lnk.target.key + ':');
        return srcMatch || tgtMatch;
      });
    },

    /**
     * Every link in the store.
     * @returns {Link[]}
     */
    all() { return this._load(); },

    /**
     * Append a link record.
     * @param {Link} link
     * @returns {void}
     */
    add(link) {
      this._load().push(link);
      this._save();
      this._bump();
    },

    /**
     * Delete a link by id. Idempotent.
     * @param {string} linkId
     * @returns {void}
     */
    remove(linkId) {
      this._cache = this._load().filter(l => l.id !== linkId);
      this._save();
      this._bump();
    }
  }
);

/**
 * Persist a link, dedup'ing if the exact pair already exists. Returns
 * the link object on success OR when the link already exists (so callers
 * can show the green ✓ either way). Returns null only when
 * sourceEndpoint.key is missing.
 *
 * Dedup logic: a link counts as a duplicate when either endpoint on any
 * existing record involving the source key touches the desired target
 * key — so we don't create duplicate pairs regardless of which side was
 * "source" the first time around.
 *
 * @param {LinkEndpoint | null | undefined} sourceEndpoint
 * @param {LinkEndpoint} targetEndpoint
 * @returns {Link | null}
 */
export function persistLink(sourceEndpoint, targetEndpoint) {
  if (!sourceEndpoint || !sourceEndpoint.key) return null;
  const existing = LinkStore.getForKey(sourceEndpoint.key);
  const dup = existing.find(l => l.source.key === targetEndpoint.key || l.target.key === targetEndpoint.key);
  if (dup) return dup; // already exists — return it so the green ✓ still shows
  /** @type {Link} */
  const link = { id: lnkId(), source: sourceEndpoint, target: targetEndpoint, created: Date.now() };
  LinkStore.add(link);
  return link;
}
