/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/web-data — Cluster F (bundle-d)

   The Scripture Web's graph asset (src/data/scripture-web-data.js, written
   by tools/gen-scripture-web.mjs), injected as a script once. Moved out of
   ScriptureWebScreen unchanged (F0, 2026-10-18); the screen re-exports it,
   so _entry-d.js and window.ensureScriptureWebData are as they were.
   ═══════════════════════════════════════════════════════════════════════ */

/**
 * Inject the graph asset once, the same way bible-studies.js is loaded.
 * It is precached into the STABLE corpus cache, so this is a cache hit
 * offline and after an app-version bump.
 */
let _swDataPromise = null;
export function ensureScriptureWebData(force) {
  if (typeof window !== 'undefined' && window.SCRIPTURE_WEB_DATA) {
    return Promise.resolve(window.SCRIPTURE_WEB_DATA);
  }
  if (force) _swDataPromise = null;
  if (_swDataPromise) return _swDataPromise;
  _swDataPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'src/data/scripture-web-data.js';
    script.async = true;
    script.onload = () => {
      if (window.SCRIPTURE_WEB_DATA) resolve(window.SCRIPTURE_WEB_DATA);
      else reject(new Error('scripture-web-data.js loaded but defined nothing'));
    };
    script.onerror = () => { _swDataPromise = null; reject(new Error('Couldn’t fetch the cross-reference data.')); };
    document.head.appendChild(script);
  });
  return _swDataPromise;
}
