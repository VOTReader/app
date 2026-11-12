/* ═══════════════════════════════════════════════════════════════════════
   useThumbnails — the Tabs screen's card pictures: snapshot, IDB, GC
   ═══════════════════════════════════════════════════════════════════════
   Global-scope module. Bundled into dist/bundle-b.js.

   TABS1 (2026-11-11). A card's picture is a SNAPSHOT of the tab's own page
   (utils/tab-snap.js): the live reading area's markup, trimmed to one screen,
   which the card lays out again with the app's own stylesheet and scales down.
   It replaced the html2canvas JPEGs (two per tab, one per theme, 150-400 KB
   each, a 0.5-2 s main-thread render apiece on a phone, and text that came
   out squeezed and in the wrong faces). Consequences that shaped this file:
     - taking one costs a few ms, so it is taken synchronously, right where it
       is needed: goTabs (app.jsx) takes the active tab's just before the Tabs
       screen mounts, so that card is in the screen's first frame; the calm
       gate, boot window, render queue and retries the JPEGs needed are gone;
     - a snapshot has no theme of its own (colours are the theme's CSS
       variables), so a theme switch needs nothing: every card follows it;
     - the active tab is snapshotted again when it settles: 600 ms after a
       screen or tab change, 1 s after its scroll stops, and when the page is
       hidden, so a tab left any other way (a link that opens a new tab) has a
       picture from its last still moment;
     - each entry is a few KB of HTML in IndexedDB under the tab's content key
       (tabContentKey, unchanged), written when the main thread is idle and at
       once when the page is hidden, so a restart shows every card at once.

   OWNS:
     - tabThumbnails state: { [contentKey]: { snap } } (older rows keep their
       { dark?, light?, unknown? } JPEGs until the tab is next seen; the
       overview draws those only where no snapshot exists yet)
     - setTabThumbnails   (returned so App's closeAllTabs can clear it)
     - IDB load           (idbReadAll(liveKeys), tabsEnabled-gated, re-run when
                           the set of open tabs changes; it deletes nothing)
     - GC effect          (debounced; sweeps the STORE's keys, only once
                           StateStore reports 'loaded')
     - captureActiveTabThumbnail(opts?)  synchronous; stable on [tabsEnabled]

   DOES NOT OWN: tabContentKey / idbReadAll / idbPut / idbDelete / idbAllKeys
   (globals from the thumb store, reached as bare names via window).

   RETURNS: { tabThumbnails, setTabThumbnails, captureActiveTabThumbnail }
   ═══════════════════════════════════════════════════════════════════════ */

import { useRefMirror } from './use-ref-mirror.js';
import { StateStore } from '../stores/state-store.js';
import { onIdle } from '../utils/on-idle.js';
import { snapLiveTab, readSnap } from '../utils/tab-snap.js';

/** After a screen or tab change, the snapshot waits this long (scroll restore lands first). */
export const SNAP_AFTER_NAV_MS = 600;
/** After the reading area's scroll stops, the snapshot waits this long. */
export const SNAP_AFTER_SCROLL_MS = 1000;

/** True while the page is hidden. */
function pageHidden() {
  return typeof document !== 'undefined' && document.visibilityState === 'hidden';
}

/**
 * Card pictures for the Tabs screen.
 * @param {{ tabs: any[], activeTabIdx: number, activeTab: any, tabsEnabled: boolean, tabsOverviewOpen: boolean, theme?: string }} args
 * @returns {{
 *   tabThumbnails: Record<string, { snap?: any, dark?: string, light?: string, unknown?: string }>,
 *   setTabThumbnails: (val: any) => void,
 *   captureActiveTabThumbnail: (opts?: { urgent?: boolean, force?: boolean }) => void
 * }}
 */
export function useThumbnails({ tabs, activeTabIdx, activeTab, tabsEnabled, tabsOverviewOpen }) {
  const [tabThumbnails, setTabThumbnails] = React.useState({});
  const thumbnailsRef = React.useRef(/** @type {Record<string, any>} */ ({}));

  // ── Load the open tabs' rows ─────────────────────────────────────────────
  // Only the live keys are read (boot-performance-5) and NOTHING is deleted here:
  // `tabs` can be synthetic boot defaults on a degraded vot-state hydration, and a
  // delete keyed off them wiped the store once. Dead rows go in the GC below.
  const liveKeySig = tabs.map((t) => tabContentKey(t)).join('\n');
  React.useEffect(() => {
    if (!tabsEnabled) return undefined;
    let cancelled = false;
    const ok = (/** @type {any} */ u) => typeof u === 'string' && u.length >= 1000;
    const liveKeys = liveKeySig ? liveKeySig.split('\n') : [];
    idbReadAll(liveKeys).then((rows) => {
      if (cancelled) return;
      const norm = {};
      for (const k of Object.keys(rows || {})) {
        const v = rows[k];
        let entry = null;
        if (v && typeof v === 'object' && v.snap) {
          const snap = readSnap(v.snap);
          if (snap) entry = { snap };
        } else if (typeof v === 'string') {
          if (ok(v)) entry = { unknown: v };
        } else if (v && typeof v === 'object') {
          // older JPEG rows ({ dark?, light?, unknown? } or the interim { url, theme })
          const e = {};
          if (typeof v.url === 'string' && ok(v.url)) e[v.theme === 'dark' || v.theme === 'light' ? v.theme : 'unknown'] = v.url;
          for (const f of ['dark', 'light', 'unknown']) if (ok(v[f])) e[f] = v[f];
          if (Object.keys(e).length) entry = e;
        }
        if (entry) norm[k] = entry; else idbDelete(k);
      }
      // A snapshot taken this session (goTabs before the read landed) outranks the stored row.
      const merged = { ...norm };
      for (const k of Object.keys(thumbnailsRef.current)) if (thumbnailsRef.current[k] && thumbnailsRef.current[k].snap) merged[k] = thumbnailsRef.current[k];
      thumbnailsRef.current = merged;
      setTabThumbnails(merged);
    }, () => {});
    return () => { cancelled = true; };
  }, [tabsEnabled, liveKeySig]);

  // ── Garbage-collect closed tabs' rows ────────────────────────────────────
  // Sweeps the STORE's keys (a row whose tab closed in an earlier session never
  // enters state), and only once StateStore says the tabs are the real ones.
  const thumbGcTimerRef = React.useRef(/** @type {any} */ (null));
  React.useEffect(() => {
    clearTimeout(thumbGcTimerRef.current);
    thumbGcTimerRef.current = setTimeout(() => {
      const stateReal = typeof StateStore === 'undefined'
        || typeof StateStore.getState !== 'function'
        || StateStore.getState() === 'loaded';
      if (!stateReal) return;
      const liveKeys = new Set(tabs.map((t) => tabContentKey(t)));
      if (typeof idbAllKeys === 'function') {
        idbAllKeys().then((keys) => {
          keys.filter((k) => !liveKeys.has(k)).forEach((k) => idbDelete(k));
        });
      }
      setTabThumbnails((prev) => {
        const out = {};
        let changed = false;
        for (const k of Object.keys(prev)) {
          if (liveKeys.has(k)) out[k] = prev[k];
          else changed = true;
        }
        if (changed) thumbnailsRef.current = out;
        return changed ? out : prev;
      });
    }, 2000);
    return () => clearTimeout(thumbGcTimerRef.current);
  }, [tabs, tabThumbnails]);

  // ── Persistence: idle writes, flushed at once when the page hides ────────
  const pendingRef = React.useRef(/** @type {Map<string, any>} */ (new Map()));
  const persistIdleRef = React.useRef(/** @type {null | (() => void)} */ (null));
  const flushPersist = React.useCallback(() => {
    if (persistIdleRef.current) { persistIdleRef.current(); persistIdleRef.current = null; }
    const pending = pendingRef.current;
    pendingRef.current = new Map();
    if (typeof idbPut !== 'function') return;   // a harness without the thumb store (and a late unmount)
    pending.forEach((entry, key) => { idbPut(key, entry); });
  }, []);
  const schedulePersist = React.useCallback(() => {
    if (persistIdleRef.current) return;
    persistIdleRef.current = onIdle(() => { persistIdleRef.current = null; flushPersist(); }, { timeout: 3000 });
  }, [flushPersist]);

  // ── Snapshot the active tab ──────────────────────────────────────────────
  const activeTabIdxRef = useRefMirror(activeTabIdx);
  const tabsRef = useRefMirror(tabs);
  const tabsOverviewOpenRef = useRefMirror(tabsOverviewOpen);
  // HARD INVARIANT: a React.useCallback on [tabsEnabled] - the effects below list it.
  const captureActiveTabThumbnail = React.useCallback(/** @param {{ urgent?: boolean, force?: boolean }} [opts] */ (opts) => {
    if (!tabsEnabled) return;
    const urgent = !!(opts && opts.urgent);
    // Under the Tabs screen the page neither scrolls nor navigates: goTabs already took it.
    if (!urgent && tabsOverviewOpenRef.current) return;
    const tab = tabsRef.current[activeTabIdxRef.current];
    if (!tab || tab.screen === 'scripture-web') return;   // a WebGL canvas: the card keeps its sigil
    let snap = null;
    try { snap = snapLiveTab(); } catch (e) { try { console.warn('[thumb] snapshot failed', e); } catch (_e) { /* ignore */ } }
    if (!snap) return;
    const key = tabContentKey(tab);
    const cur = thumbnailsRef.current[key];
    const was = cur && cur.snap;
    if (was && was.html === snap.html && was.top === snap.top && was.st === snap.st && was.w === snap.w && was.h === snap.h) return;
    const entry = { snap };
    thumbnailsRef.current = { ...thumbnailsRef.current, [key]: entry };
    setTabThumbnails((prev) => ({ ...prev, [key]: entry }));
    pendingRef.current.set(key, entry);
    if (pageHidden()) flushPersist(); else schedulePersist();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- refs read via .current; flushPersist/schedulePersist are stable callbacks
  }, [tabsEnabled]);

  // After a screen or tab change (scroll restore first).
  React.useEffect(() => {
    if (!tabsEnabled || tabsOverviewOpen) return undefined;
    const timer = setTimeout(() => captureActiveTabThumbnail(), SNAP_AFTER_NAV_MS);
    return () => clearTimeout(timer);
  }, [activeTab.screen, activeTab.bookId, activeTab.chapterNum, activeTab.letterId,
    activeTab.studyId, activeTab.studyChapterId, activeTab.genreId, activeTab.journalEntryId,
    activeTab.gardenPage, activeTabIdx, tabsEnabled, tabsOverviewOpen, captureActiveTabThumbnail]);

  // When the reading area's scroll stops, when the window settles after a resize, and when the page hides.
  React.useEffect(() => {
    if (!tabsEnabled) return undefined;
    let t = /** @type {any} */ (null);
    const later = (ms) => { clearTimeout(t); t = setTimeout(() => captureActiveTabThumbnail(), ms); };
    const onScroll = (/** @type {Event} */ e) => {
      const el = /** @type {any} */ (e.target);
      if (el && el.classList && el.classList.contains('screen-scroll')) later(SNAP_AFTER_SCROLL_MS);
    };
    const onResize = () => later(SNAP_AFTER_NAV_MS);
    const onHide = () => { clearTimeout(t); captureActiveTabThumbnail(); flushPersist(); };
    const onVis = () => { if (pageHidden()) onHide(); };
    document.addEventListener('scroll', onScroll, { capture: true, passive: true });
    window.addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('pagehide', onHide);
    return () => {
      clearTimeout(t);
      document.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('pagehide', onHide);
    };
  }, [tabsEnabled, captureActiveTabThumbnail, flushPersist]);

  // Unmount: write what is pending.
  React.useEffect(() => () => flushPersist(), [flushPersist]);

  return { tabThumbnails, setTabThumbnails, captureActiveTabThumbnail };
}
