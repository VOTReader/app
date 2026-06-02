/* ═══════════════════════════════════════════════════════════════════════
   navHandoff — typed, discoverable cross-component navigation hand-off slots
   ═══════════════════════════════════════════════════════════════════════
   D-bucket D2. Replaces the scattered `window.__pending*` / `__*ReturnCtx`
   mutable data-slot channels with ONE place that documents every channel,
   its shape, its writer, and its reader — so the cross-component coupling is
   discoverable (grep `navHandoff.set('pendingHighlight'`) instead of an
   untyped magic string sprinkled across hooks + screens.

   These are NOT the function bridges (window.__goHome, window.__openNote,
   etc., still documented in BRIDGES.md) — only the one-shot DATA hand-offs a
   navigation writes just before a screen change for the destination to read
   on mount.

   ── WHY a window-backed Map (cross-bundle safety) ──────────────────────────
   Writers live in bundle-b (hooks) and bundle-d (screens / app.jsx /
   screen-routes); readers span both. esbuild compiles those bundles as
   SEPARATE IIFEs, so each gets its own copy of this module — a module-private
   Map would NOT be shared, and a hand-off written in bundle-b would be invisible
   in bundle-d. The original `window.__pending*` slots used `window` precisely
   to bridge that gap. So the backing store stays on the global
   (`window.__navHandoffSlots`): every bundle's copy of `navHandoff` reads and
   writes the SAME Map. Importing `{ navHandoff }` and using `window.navHandoff`
   are therefore interchangeable.

   ── Channels (the canonical registry) ──────────────────────────────────────
     pendingHighlight   {excerpt, letterId} | null
        writer: use-tap-through (tap a letter-link / cross-ref excerpt)
        reader: LetterView / WtlbEntryView (peek on render; scroll+flash)
        cleared by: goHome / use-nav / use-from-letter-stack / use-android-back
     pendingScrollHlKey string | null
        writer: use-navigate-to-link (navigate to a linked annotation)
        reader: use-dom-annotation-sync (take → scrollIntoView the mark)
        cleared by: use-nav (goHome)
     pendingSearchQuery string | null
        writer: SelectionToolbar (Search action on a selection)
        reader: use-search (take → pre-fill the search box once)
     pendingOpenNote    string (groupId) | null
        writer: NotesIndexScreen (tap-through to a note's source)
        reader: use-dom-annotation-sync (take → open the NoteSheet)
     notesReturnCtx     {tab, drilledNbId} | null
        writer: NotesIndexScreen / screen-routes (drill into a notebook)
        reader: NotesIndexScreen (peek on render; clear on mount)

   (Removed in D2: `pendingLinkExcerpt` — it was write-only dead code, set by
   use-navigate-to-link with no reader anywhere.)
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * The shared backing store. Held on the global so every bundle's module copy
 * sees the same Map (see header). Lazily created.
 * @returns {Map<string, any>}
 */
function _slots() {
  const g = /** @type {any} */ ((typeof window !== 'undefined') ? window : globalThis);
  if (!g.__navHandoffSlots) g.__navHandoffSlots = new Map();
  return g.__navHandoffSlots;
}

export const navHandoff = {
  /**
   * Stash a one-shot hand-off value for the destination screen to read.
   * Setting `null`/`undefined` is allowed and read back as `null` (matches the
   * old `window.__x = null` convention).
   * @param {string} key
   * @param {any} value
   * @returns {void}
   */
  set(key, value) { _slots().set(key, value); },

  /**
   * Read AND clear a slot in one step (the one-shot consume). Returns `null`
   * when absent. Use this where the old code did
   * `const v = window.__x; window.__x = null;`.
   * @param {string} key
   * @returns {any}
   */
  take(key) {
    const s = _slots();
    const v = s.has(key) ? s.get(key) : null;
    s.delete(key);
    return v;
  },

  /**
   * Read a slot WITHOUT clearing it (the value survives for later reads /
   * an explicit clear). Returns `null` when absent. Use where the old code
   * read `window.__x` on render and a separate site did the `= null`.
   * @param {string} key
   * @returns {any}
   */
  peek(key) {
    const s = _slots();
    return s.has(key) ? s.get(key) : null;
  },

  /**
   * Drop a slot (the old `window.__x = null`). Idempotent.
   * @param {string} key
   * @returns {void}
   */
  clear(key) { _slots().delete(key); },

  /**
   * True iff the slot currently holds a value (even `null`). Mostly for tests.
   * @param {string} key
   * @returns {boolean}
   */
  has(key) { return _slots().has(key); },

  /** TEST-ONLY: wipe every slot for isolation between cases. */
  _resetForTests() { _slots().clear(); },
};
