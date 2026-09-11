/* ═══════════════════════════════════════════════════════════════════════
   useTranslationLoader — the active edition's lazy load, and the sweep of the ones left behind
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   Lazy-loads the reader's translation. NKJV is always available (baked into
   BOOKS.chapters[].sections[].verses[].text); all others are ~4.5MB JS
   files loaded on demand. Extracted from App() on 2026-09-11 (w-evict-hook):
   boot-performance-4-evict grew the effect past the 800-line canary.

   OWNS:
     - the [translation] effect below, and nothing else.

   DOES NOT OWN:
     - loadTranslation / releaseTranslationsExcept — data/translations.js,
       published as bundle-d globals by ui/_entry-d.js and read here by bare
       name. NOT imported: an import would bundle a second copy of
       translations.js into bundle-b with its own _xlateCache and
       _translationLoaded, and the two copies would disagree about what is
       loaded. Same convention as GARDEN_DEFAULT_TIER in use-settings.js.
     - the tick state — App()'s useState; the setter is a PARAM.

   PARAMS:
     translation         settings.translation ('nkjv' when absent)
     setTranslationTick  App()'s setter; bumped after an alt edition lands so
                         translateVerse() starts returning the loaded text.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * @param {string | undefined} translation
 * @param {(f: (v: number) => number) => void} setTranslationTick
 */
export function useTranslationLoader(translation, setTranslationTick) {
  React.useEffect(() => {
    const code = translation || 'nkjv';
    /* Free the editions this reader has left behind: each is a ~32 MB global and
       nothing else ever releases one. AFTER the new edition loads, never before,
       so a reader switching between two of them is not left staring at NKJV while
       the second download runs.

       Switching all the way back to NKJV frees every alt edition, which is why
       this effect no longer returns early on it — that is the one switch with the
       most to free, and it used to be the one that freed nothing. */
    if (code === 'nkjv') { releaseTranslationsExcept('nkjv'); return; }
    loadTranslation(code).then(() => {
      releaseTranslationsExcept(code);
      setTranslationTick((v) => v + 1);
    });
  // The setter is in the deps for exhaustive-deps' sake; App()'s is a useState setter, so
  // it never changes and the effect runs on the translation alone, as it did inline.
  }, [translation, setTranslationTick]);
}
