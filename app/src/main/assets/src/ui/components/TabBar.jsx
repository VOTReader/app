/* ═══════════════════════════════════════════════════════════════════════
   TabBar — Read / Listen / Library at the bottom (the layout pass, 2026-11-10)
   ═══════════════════════════════════════════════════════════════════════
   Built to the hub's mocks (read.png, listen.png, library.png). Which tab a
   screen lights and whether the bar shows at all is utils/app-sections.js,
   the one source of truth; this file only draws it and answers taps.

   While it shows, body.tabbar-on lifts the bottom dock above it (app.css,
   BOTTOM DOCK: --dock-tabbar), so the mini player sits directly on the bar
   and toasts, the tour strip and the selection toolbar clear both. At 1024
   css px and wider it is a left rail instead (app.css), and the dock stays
   at the bottom of the page column.

   body.nav-tabbed marks every screen that has the bar (whether or not it is
   up this moment, so the keyboard never reshapes the top bar): the top bar
   there is Back, Search, Tabs and the Settings gear, and the Home icon and
   the ⋯ menu are readers' only (app.css, ONE TOP-BAR RULE).
   It reads three things the app keeps elsewhere: the tour (TourController),
   the first-run About (AboutSeenFlagStore) and the keyboard (html.kb-up,
   use-keyboard-inset).
   ═══════════════════════════════════════════════════════════════════════ */

import { TABS, TAB_LABELS, TAB_ROOTS, sectionOf, barShown, tabTap, litTab } from '../../utils/app-sections.js';

const SVG = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeLinecap: /** @type {const} */ ('round'), strokeLinejoin: /** @type {const} */ ('round'), 'aria-hidden': true };

/** @type {Record<string, any>} */
const ICONS = {
  read: <svg {...SVG}><path d="M12 6c-2-1.6-4.6-2-8-2v14c3.4 0 6 .4 8 2 2-1.6 4.6-2 8-2V4c-3.4 0-6 .4-8 2zM12 6v14" /></svg>,
  listen: <svg {...SVG}><path d="M4 14v-2a8 8 0 0116 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /></svg>,
  library: <svg {...SVG}><path d="M6 3h12v18l-6-4-6 4z" /></svg>,
};

/** A class on <html>, kept live. @param {string} name @returns {boolean} */
function useRootClass(name) {
  return React.useSyncExternalStore(
    React.useCallback((/** @type {() => void} */ cb) => {
      if (typeof MutationObserver === 'undefined') return () => {};
      const mo = new MutationObserver(cb);
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
      return () => mo.disconnect();
    }, []),
    () => document.documentElement.classList.contains(name),
  );
}

/** A flag store's or controller's version, so a change re-renders the bar. @param {any} store */
function useVersion(store) {
  React.useSyncExternalStore(
    React.useCallback((/** @type {() => void} */ cb) => (store && typeof store.subscribe === 'function' ? store.subscribe(cb) : () => {}), [store]),
    () => (store && typeof store.getVersion === 'function' ? store.getVersion() : 0),
  );
}

/** Scroll the page's scroller to the top (the lit tab, tapped again on its root). */
function scrollPageTop() {
  const el = typeof __scrollEl !== 'undefined' ? /** @type {any} */ (__scrollEl) : null;
  if (!el || typeof el.scrollTo !== 'function') return;
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
}

/**
 * @param {{ screen: string, overviewOpen?: boolean, onOpen: (tab: 'read' | 'listen' | 'library', root: string) => void }} props
 */
export function TabBar({ screen, overviewOpen = false, onOpen }) {
  const g = /** @type {any} */ (globalThis);
  const tour = typeof g.TourController !== 'undefined' ? g.TourController : null;
  const about = typeof g.AboutSeenFlagStore !== 'undefined' ? g.AboutSeenFlagStore : null;
  useVersion(tour);
  useVersion(about);
  const keyboardUp = useRootClass('kb-up');
  // FSET2 (tr-welcome): the welcome card (stop 0) points at nothing and floats mid-screen, so the bar stays, dimmed.
  const tourSt = tour ? tour.getState() : null;
  const tourOn = !!(tourSt && tourSt.active && tourSt.index !== 0);
  const firstRunAbout = screen === 'about' && !!about && typeof about.is === 'function' && !about.is();
  const shown = barShown({ screen, firstRunAbout, overviewOpen, tourOn, keyboardUp });
  const tabbed = sectionOf(screen).bar;
  // Search, Settings and About keep the tab you came from lit.
  const lastTab = React.useRef(/** @type {any} */ (null));
  const lit = litTab(screen, lastTab.current);
  React.useEffect(() => { if (lit) lastTab.current = lit; }, [lit]);

  React.useLayoutEffect(() => {
    document.body.classList.toggle('tabbar-on', shown);
    return () => { document.body.classList.remove('tabbar-on'); };
  }, [shown]);
  React.useLayoutEffect(() => {
    document.body.classList.toggle('nav-tabbed', tabbed);
    return () => { document.body.classList.remove('nav-tabbed'); };
  }, [tabbed]);

  if (!shown) return null;
  return (
    <nav className="tabbar" aria-label="Sections">
      {TABS.map((tab) => (
        <button key={tab} type="button" className={'tabbar-tab' + (tab === lit ? ' is-on' : '')} aria-current={tab === lit ? 'page' : undefined}
          onClick={() => { if (tabTap(tab, screen) === 'top') scrollPageTop(); else onOpen(tab, TAB_ROOTS[tab]); }}>
          {ICONS[tab]}
          <span className="tabbar-label">{TAB_LABELS[tab]}</span>
        </button>
      ))}
    </nav>
  );
}
