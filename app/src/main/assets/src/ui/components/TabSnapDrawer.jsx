/* ═══════════════════════════════════════════════════════════════════════
   TabSnapDrawer - every open tab's card gets its true picture by itself (TABS6, 2026-11-12)
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-d.js; App renders it while the Tabs screen is open.

   WHY. A card's picture (utils/tab-snap.js) is a copy of the tab's own page, taken while that page is on screen. A
   tab not seen since an update had none, and the overview drew the OLD build's stored JPEG in its place: a narrow
   strip between bars, and a dark one pushed through an invert filter in the light theme (blue-white page between
   black bars, Corbin's phone, 11-12). Those JPEGs are gone (use-thumbnails drops the rows); this draws the missing
   pictures instead.

   HOW. While the Tabs screen is open, the open tabs that have no picture are drawn ONE AT A TIME, at an idle moment
   (a transition, so a tap or a drag on the overview comes first): the tab's own route, built from the app's route
   deps with the tab's fields, rendered out of sight under the overview in a box the size of the live column, inert
   (bg-draw.js: no singletons claimed, at the tab's saved place), then copied by tab-snap's snapArea exactly as a live
   page is, and handed to useThumbnails, which shows it on the card and stores it. Nothing runs while a page is being
   read, so a reading page's first paint pays nothing for it.

   Which tabs: the reading screens (the pages a swipe already draws inert) and the plain list screens. A screen with
   app-wide side effects when it mounts (Settings, Search, the journal editor, About and the others that take the
   Android back, the listening desk, the Garden, the Scripture Web's canvas) is not drawn: its card keeps the quiet
   page-coloured placeholder until the tab is next seen, when the live capture takes it.
   ═══════════════════════════════════════════════════════════════════════ */

import { BgDrawContext } from './bg-draw.js';
import { snapArea, liveReadingArea } from '../../utils/tab-snap.js';
import { resolveActiveContent } from '../../utils/active-content.js';
import { paintAnnotations } from '../../hooks/use-pager-gesture.js';
import { onIdle } from '../../utils/on-idle.js';
import { RouteSlot } from '../../components/RouteSlot.jsx';
import { placeTarget } from '../../utils/scroll-place.js';

/** Plain list screens drawn off screen (reading screens come from READING_SCREENS). */
export const BG_LIST_SCREENS = new Set([
  'home', 'library', 'volumes-home', 'scriptures-home', 'scripture-genre', 'studies-home',
  'bible-idx', 'matthew-idx', 'bible-study-index', 'holy-days-index',
  'vot-index', 'vot-one-index', 'vot-three-index', 'vot-four-index', 'vot-five-index', 'vot-six-index',
  'vot-seven-index', 'vot-timothy-index', 'vot-flock-index', 'vot-rebuke-index',
  'wtlb-one-index', 'wtlb-two-index', 'blessed-index',
  'answers-group', 'answers-media', 'answers-saved',
  'history', 'my-progress', 'highlights-index', 'links-index', 'bookmarks-index', 'journal-home',
]);

/** True for a reading screen (drawn in the live pager's boxes). @param {string} screen */
export function bgReading(screen) {
  return typeof READING_SCREENS !== 'undefined' && READING_SCREENS.has(screen) && screen !== 'garden-view';
}

/** True when this tab's card picture may be drawn off screen. @param {any} tab */
export function canDrawInBackground(tab) {
  const s = tab && (tab.screen || 'home');
  return !!s && (bgReading(s) || BG_LIST_SCREENS.has(s));
}

/** The tab fields the route deps carry under the same name (use-tabs Tab). */
const TAB_FIELDS = ['screen', 'bookId', 'chapterNum', 'letterId', 'studyId', 'studyChapterId', 'journalEntryId',
  'fromStudies', 'genreId', 'audioColKey', 'mode', 'showStudy', 'surpriseAnchor', 'titleFocusHidden',
  'headingsFocusHidden', 'fromWtlb', 'fromSearch', 'fromSurprise', 'fromSearchIndex', 'searchLanding', 'searchQuery',
  'searchScope', 'searchContext', 'navOrigin', 'gardenPage'];
/** Route deps that DO something (navigate, write, open a sheet): none may run from a drawing. */
const ACTION = /^(set|go|handle|select|mark|unmark|clear|toggle|update|open|navigate|push|retarget|tapThrough|create|save|retry|bcvOn)/;
const NOOP = () => {};

/**
 * The app's route deps, turned to another tab: its fields, its resolved letter/book/chapter, every action a no-op, no
 * tap-through back pill (that rides the active tab's history) and no book-edge cards of the active chapter.
 * @param {Record<string, any>} deps the deps App builds its own routes from
 * @param {any} tab
 * @returns {any}
 */
export function bgRouteDeps(deps, tab) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const k of Object.keys(deps)) out[k] = typeof deps[k] === 'function' && ACTION.test(k) ? NOOP : deps[k];
  for (const k of TAB_FIELDS) if (k in deps) out[k] = tab[k] === undefined ? null : tab[k];
  if (!out.screen) out.screen = 'home';
  if (typeof out.fromSearch !== 'boolean') out.fromSearch = !!out.fromSearch;
  const c = resolveActiveContent({ screen: out.screen, bookId: tab.bookId || null, chapterNum: tab.chapterNum ?? null, letterId: tab.letterId || null });
  out.book = c.book; out.chapter = c.chapter; out.activeLetter = c.activeLetter; out.activeVolKey = c.activeVolKey;
  out.backHint = null; out.backActive = false;
  // The route build skips what it would tell the app about the screen on show (screen-routes: the plan session's
  // place and host, the plan pages' kept place).
  out.bgDraw = true;
  out.fromMatthewChRef = { current: tab.fromMatthewCh || null };
  out.bcvPrevBook = null; out.bcvNextBook = null; out.bcvPrevBoundaryTitle = null; out.bcvNextBoundaryTitle = null;
  return out;
}

/** Longest wait for a drawn tab to be ready (a lazy corpus, a font) before it is given up for this opening. */
export const BG_DRAW_GIVE_UP_MS = 8000;

/**
 * @param {{ tabs: any[], activeTabIdx: number, thumbnails: Record<string, any>, deps: any,
 *   buildRoutes: (deps: any) => Record<string, () => any>, onSnap: (key: string, snap: any) => void }} props
 */
export function TabSnapDrawer({ tabs, activeTabIdx, thumbnails, deps, buildRoutes, onSnap }) {
  const [cur, setCur] = React.useState(/** @type {null | { key: string, w: number, h: number }} */ (null));
  // Content keys drawn or given up while this overview is open (a tab that cannot be drawn is not retried in a loop).
  const triedRef = React.useRef(/** @type {Set<string>} */ (new Set()));
  const boxRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const savedRef = React.useRef(/** @type {any} */ (null));
  const onSnapRef = React.useRef(onSnap);
  onSnapRef.current = onSnap;

  const want = cur ? null : tabs.find((t, i) => {
    if (i === activeTabIdx || !canDrawInBackground(t)) return false;
    const k = tabContentKey(t);
    const e = thumbnails && thumbnails[k];
    return !(e && e.snap) && !triedRef.current.has(k);
  });
  const wantKey = want ? tabContentKey(want) : null;

  // Pick the next tab at an idle moment, in the live column's size.
  React.useEffect(() => {
    if (!wantKey) return undefined;
    return onIdle(() => {
      const live = liveReadingArea();
      const w = live ? Math.round(/** @type {HTMLElement} */ (live.layout).clientWidth) : window.innerWidth;
      const h = live ? live.scroller.clientHeight : Math.max(200, window.innerHeight - 56);
      React.startTransition(() => setCur({ key: wantKey, w: w || window.innerWidth, h }));
    }, { timeout: 1500, fallbackDelay: 50 });
  }, [wantKey]);

  const tab = cur ? tabs.find((t) => tabContentKey(t) === cur.key) : null;

  // Wait until the drawn page stands (no loading view, its height still for two looks), then copy it.
  React.useEffect(() => {
    if (!cur) return undefined;
    const key = cur.key;
    const done = (/** @type {any} */ snap) => {
      triedRef.current.add(key);
      if (snap) onSnapRef.current(key, snap);
      setCur(null);
    };
    if (!tab) { done(null); return undefined; }
    // A study screen needs the studies file, which App loads only for the screen on show (its own retry does it).
    if (/^(studies-home|bible-study-index|bible-study-chapter)$/.test(tab.screen) && typeof BIBLE_STUDIES === 'undefined'
      && typeof deps.retryStudies === 'function') deps.retryStudies();
    const t0 = Date.now();
    let last = -1;
    let timer = /** @type {any} */ (null);
    let stopped = false;
    const look = () => {
      if (stopped) return;
      const box = boxRef.current;
      const layout = box && box.querySelector(':scope > .screen-layout');
      const viewport = layout && layout.querySelector(':scope > .pager-viewport');
      const scroller = /** @type {HTMLElement | null} */ (layout && (viewport || layout).querySelector(':scope > .screen-scroll'));
      const fontsIn = !document.fonts || document.fonts.status === 'loaded';
      const ready = !!(scroller && scroller.childElementCount && !scroller.querySelector('.route-fallback') && fontsIn);
      if (ready && scroller && scroller.scrollHeight === last) {
        let snap = null;
        try {
          // The tab's saved place, by the live restore's rule, now that the page's real heights are in.
          const y = placeTarget(scroller, savedRef.current).y;
          if (Math.abs(scroller.scrollTop - y) >= 1) scroller.scrollTop = y;
          paintAnnotations();
          snap = snapArea({ layout: /** @type {Element} */ (layout), viewport, scroller, track: scroller.querySelector(':scope > .pager-track') });
        } catch (e) { try { console.warn('[thumb] background snapshot failed', e); } catch (_e) { /* ignore */ } }
        done(snap);
        return;
      }
      last = ready && scroller ? scroller.scrollHeight : -1;
      if (Date.now() - t0 > BG_DRAW_GIVE_UP_MS) { done(null); return; }
      timer = setTimeout(() => requestAnimationFrame(look), ready ? 120 : 250);
    };
    timer = setTimeout(() => requestAnimationFrame(look), 60);
    return () => { stopped = true; clearTimeout(timer); };
    // Re-arms only for a new tab; the page it waits on re-renders by itself as corpora land.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- tab is read for its presence when the draw starts
  }, [cur]);

  if (!cur || !tab) return null;
  const routes = buildRoutes(bgRouteDeps(deps, tab));
  const route = routes[tab.screen || 'home'];
  const saved = tab.scrollPositions ? tab.scrollPositions[scrollKeyForTab(tab)] : null;
  savedRef.current = saved == null ? null : saved;
  const ctx = { restore: savedRef.current, pager: bgReading(tab.screen) };
  return (
    <div className="tab-bg-draw" ref={boxRef} aria-hidden="true" {...{ inert: '' }} style={{ width: cur.w + 'px', height: cur.h + 'px' }}>
      <BgDrawContext.Provider value={ctx}>
        <ErrorBoundary fallback={null} resetKey={cur.key} onCatch={() => { triedRef.current.add(cur.key); setCur(null); }}>
          <RouteSlot route={route || null} />
        </ErrorBoundary>
      </BgDrawContext.Provider>
    </div>
  );
}
