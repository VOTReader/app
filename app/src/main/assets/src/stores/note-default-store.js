/* ══════════════════════════════════════════════════════════════════════
   NoteDefaultStore — the last-used note style + color ("make a note" default)
   ══════════════════════════════════════════════════════════════════════
   ES module. Bundled into bundle-b via _entry-b.js.
   Depends on: CachedStore (loaded first).

   Holds the default a new note is created with. The cold-start default is a
   BLANK highlight (invisible mark + just the note icon — a note with no visual
   overhead). Whenever the user sets a note's style/color (in the NoteSheet),
   that becomes the new default for the next note. Tiny single-record store,
   IDB-backed (schema v3) so the preference survives restarts.

   Shape: { style: 'highlight'|'underline'|'squiggle', color: <palette>|'blank' }
   (blank is only valid with the highlight style — squiggle/underline are
   always a visible color.)
   ═══════════════════════════════════════════════════════════════════════ */

import { CachedStore, extendStore } from './cached-store.js';

/** @typedef {{ style: string, color: string }} NoteDefault */

export const NoteDefaultStore = extendStore(
  CachedStore('vot-note-default', /** @type {NoteDefault} */ ({ style: 'highlight', color: 'blank' }), { idb: true }),
  {
    /**
     * The current note default. Always returns a well-formed shape even if
     * the cache is empty/partial (cold start → blank highlight).
     * @returns {NoteDefault}
     */
    get() {
      const d = /** @type {any} */ (this._load() || {});
      return { style: d.style || 'highlight', color: d.color || 'blank' };
    },

    /**
     * Replace the note default. Normalizes the pair: a non-highlight style
     * can't be blank (squiggle/underline are always a visible color), so a
     * blank color with such a style falls back to 'yellow'.
     * @param {string} style
     * @param {string} color
     * @returns {void}
     */
    set(style, color) {
      if (this._shouldDefer('set', style, color)) return;
      const s = style || 'highlight';
      let c = color || 'blank';
      if (c === 'blank' && s !== 'highlight') c = 'yellow';
      this._cache = /** @type {any} */ ({ style: s, color: c });
      this._save();
      this._bump();
    },
  }
);
