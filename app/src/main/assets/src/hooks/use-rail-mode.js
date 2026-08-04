/* ═══════════════════════════════════════════════════════════════════════
   useRailMode — "is there a real right-hand gutter to dock a panel in?"
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into bundle-b via _entry-b.js.

   The desktop companion rail (Sol review #4, adjudicated the highest-value
   desktop item): on a wide viewport the footnote / scripture sheets dock
   into the empty gutter BESIDE the reading column instead of opening as a
   bottom sheet 1,000+ px below the tapped marker. This hook is the ONE
   switch both the JSX semantics and the CSS key off:

     - JSX (FootnoteSheet / ScriptureSheet): rail mode is NOT a modal —
       role="complementary" instead of dialog, no aria-modal, no backdrop,
       and the focus trap stays OFF (the reader keeps reading; trapping
       focus in a persistent side panel is an a11y bug, not a feature).
     - CSS (.fn-sheet.rail): docked fixed panel in the right gutter.

   THRESHOLD: 1640px CSS. At the 1600-tier column (--col-max 1040px) the
   gutter is (100vw − 1040)/2; 1640px is where that clears ~280px — the
   narrowest a footnote panel reads comfortably. The owner's laptop
   (≈2048 CSS px) gets a ~420px rail. KEEP IN SYNC with the
   `@media (min-width: 1640px)` block in app.css (.fn-sheet.rail) — a
   test pins this constant so the pair can't drift silently.

   Escape/Back dismissal is unchanged in rail mode — the sheets' existing
   registrations still close them; only the MODALITY is dropped.
   ═══════════════════════════════════════════════════════════════════════ */

export var RAIL_MIN_WIDTH_PX = 1640;
var QUERY = '(min-width: ' + RAIL_MIN_WIDTH_PX + 'px)';

/**
 * True when the viewport has a usable right-hand gutter for docked
 * companion panels. Resize-reactive; false wherever matchMedia is absent
 * (jsdom default) so every test and every phone keeps bottom sheets.
 *
 * @returns {boolean}
 */
export function useRailMode() {
  var get = function() {
    return typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia(QUERY).matches;
  };
  var state = React.useState(get);
  var rail = state[0], setRail = state[1];
  React.useEffect(function() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return undefined;
    var mql = window.matchMedia(QUERY);
    var onChange = function() { setRail(mql.matches); };
    onChange(); // resync after mount (SSR-safe init above may be stale)
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return function() { mql.removeEventListener('change', onChange); };
    }
    // chrome108 supports addEventListener; addListener kept for jsdom stubs.
    mql.addListener(onChange);
    return function() { mql.removeListener(onChange); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- setRail is a useState setter (stable identity); QUERY is module-constant.
  }, []);
  return rail;
}
