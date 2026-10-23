/* THE SEARCH INDEX IS BUILT AT LAUNCH, IN IDLE TIME (search200 wave 3, U10.3).
   ─────────────────────────────────────────────────────────────────────────────
   The index was built the first time Search opened, so after a cold start a reader's
   first search sat behind "Building search index…" (a warm restore is ~0.3 s, a cold
   build ~10 s). The app now asks for it once at launch, out of the reader's way:
   after the first frame is painted, after a pause that leaves the first chapter the
   page to itself (its corpus, its layout, the scroll restore), and then at an idle
   turn (bounded by a timeout, so a page never idle still gets it). The build itself
   runs a chunk per idle turn (engine.js init `background`); opening Search meanwhile
   joins it and takes it to full speed. Reference jumps never waited for it.
   A failed build says nothing here: Search builds again, and reports, when it opens. */
import { onIdle } from '../utils/on-idle.js';

/** The pause after the first paint before the idle wait starts. */
export const WARM_DELAY_MS = 3000;
/** The longest the idle wait holds once the pause is over. */
const IDLE_TIMEOUT_MS = 10000;

/**
 * @param {{ engine: () => any, translation: () => string | undefined }} deps
 *   `engine` the search engine (window.VotSearchMini), `translation` the reader's edition, read when the build starts
 * @returns {() => void} cancel: idempotent, safe after the build has started
 */
export function warmSearchAtLaunch(deps) {
  let cancelled = false;
  let cancelIdle = () => {};
  let timer = /** @type {any} */ (null);
  const start = () => {
    if (cancelled) return;
    const E = deps.engine();
    if (!E || typeof E.init !== 'function') return;
    const translation = deps.translation() || 'nkjv';
    const st = typeof E.getState === 'function' ? E.getState() : null;
    if (st && st.building) return;   // Search (or a search) got there first
    if (st && st.ready && (typeof E.isCurrent !== 'function' || E.isCurrent({ translation }))) return;
    try {
      const p = E.init({ translation, background: true });
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* Search builds again, and says why, when it opens */ }
  };
  const afterPaint = () => {
    if (cancelled) return;
    timer = setTimeout(() => { timer = null; if (!cancelled) cancelIdle = onIdle(start, { timeout: IDLE_TIMEOUT_MS, fallbackDelay: 2000 }); }, WARM_DELAY_MS);
  };
  const raf = /** @type {any} */ (globalThis).requestAnimationFrame;
  if (typeof raf === 'function') raf(() => setTimeout(afterPaint, 0));
  else setTimeout(afterPaint, 0);
  return () => {
    cancelled = true;
    if (timer) clearTimeout(timer);
    cancelIdle();
  };
}
