/* ═══════════════════════════════════════════════════════════════
   LINK STORE — bidirectional link persistence
   ═══════════════════════════════════════════════════════════════
   Global-scope module. Concatenates with index.html; no import/export.
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

import { CachedStore } from './cached-store.js';

/* ID generators — also used by AnnotationStore (hlId) */
export function hlId() { return 'hl_' + Date.now() + '_' + Math.random().toString(36).slice(2,6); }
export function lnkId() { return 'lnk_' + Date.now() + '_' + Math.random().toString(36).slice(2,6); }

export const LinkStore = Object.assign(CachedStore('vot-links', []), {
  /* Override _load to migrate legacy {a,b} records to {source,target} on
     first access. Migration is one-time per user: after it runs the
     persisted data is already in the new shape, so subsequent loads are
     no-ops in the migration branch. */
  _load() {
    if (this._cache) return this._cache;
    try { this._cache = JSON.parse(localStorage.getItem('vot-links') || '[]'); }
    catch (_e) { this._cache = []; }

    // Migrate legacy {a, b} records → {source, target}. Coalesce FIRST so a
    // half-migrated record (source set but a still present, or vice-versa —
    // e.g. an interrupted prior migration or a hand-edited export) is
    // healed instead of silently dropped (was real data-loss).
    let migrated = false;
    this._cache = this._cache.filter(function(lnk) {
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
    if (migrated) this._save();
    return this._cache;
  },
  getForKey(key) {
    return this._load().filter(lnk =>
      (lnk.source && lnk.source.key === key) || (lnk.target && lnk.target.key === key));
  },
  getForKeyPrefix(prefix) {
    return this._load().filter(lnk => {
      if (!lnk.source || !lnk.source.key || !lnk.target || !lnk.target.key) return false;
      const srcMatch = lnk.source.key === prefix || lnk.source.key.startsWith(prefix + ':') || prefix.startsWith(lnk.source.key + ':');
      const tgtMatch = lnk.target.key === prefix || lnk.target.key.startsWith(prefix + ':') || prefix.startsWith(lnk.target.key + ':');
      return srcMatch || tgtMatch;
    });
  },
  all() { return this._load(); },
  add(link) {
    this._load().push(link);
    this._save();
  },
  remove(linkId) {
    this._cache = this._load().filter(l => l.id !== linkId);
    this._save();
  }
});

/* Persist a link, dedup'ing if the exact pair already exists.
   Returns the link object on success OR when the link already exists
   (so callers can show the green ✓ either way). Returns null only when
   sourceEndpoint.key is missing. */
export function persistLink(sourceEndpoint, targetEndpoint) {
  if (!sourceEndpoint || !sourceEndpoint.key) return null;
  const existing = LinkStore.getForKey(sourceEndpoint.key);
  // Dedup: a link exists if either endpoint on any existing record touches
  // the desired target key (so we don't create duplicate pairs regardless
  // of which side was "source" when the prior link was made).
  const dup = existing.find(l => l.source.key === targetEndpoint.key || l.target.key === targetEndpoint.key);
  if (dup) return dup; // already exists — return it so the green ✓ still shows
  const link = { id: lnkId(), source: sourceEndpoint, target: targetEndpoint, created: Date.now() };
  LinkStore.add(link);
  return link;
}
