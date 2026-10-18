/* ═══════════════════════════════════════════════════════════════════════
   ScriptureWebScreen — Cluster F (bundle-d since lz1; lazy bundle-f before)
   ═══════════════════════════════════════════════════════════════════════
   The Scripture Web: every cross-reference in scripture as one zoomable,
   tappable instrument — and the same instrument turned on the reader's own
   links across the Volumes.

   Two canvases stacked over a DOM chrome layer:
     #gl  WebGL2, every arc in a handful of instanced draws (web-renderer.js)
     #ui  Canvas2D ruler, book names, chapter and verse numerals
     DOM  tooltip, detail sheet, controls — real buttons, real tab order

   Gesture doctrine copied from GardenView: nothing that runs per frame
   touches React state. The camera is a mutable ref, gestures write it
   directly, and a dirty-flag rAF redraws. React state is only for things
   that genuinely change the UI (mode, density, the open sheet).

   Free globals (PlatformBridge, ScreenLayout, LinkStore, …) are resolved at
   call time, the free-global pattern the other bundle-d screens use (from
   when this rode lazy bundle-f), so this file imports only the feature's own code.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  clampCamera, fitPPV, xToVerse, zoomAbout,
} from '../../utils/scripture-web/geometry.js';
import { lensRange } from '../../utils/scripture-web/pick.js';
import { DENSITY_STEPS } from '../scripture-web/web-renderer.js';
import { useWebCamera } from '../scripture-web/use-web-camera.js';
import { useFrameScheduler } from '../scripture-web/use-frame-scheduler.js';
import { useForcedLandscape } from '../scripture-web/use-forced-landscape.js';
import { useWebGraph, useChromeTokens, useWebRenderer } from '../scripture-web/use-web-renderer.js';
import { usePersonalWeb } from '../scripture-web/use-personal-web.js';
import { useWebSelection } from '../scripture-web/use-web-selection.js';
import { useWebKeys } from '../scripture-web/use-web-keys.js';
import { maxZoomOf } from '../../utils/scripture-web/web-frame.js';
/** @typedef {import('../../utils/scripture-web/decode.js').Density} Density */
import { attachWebGestures } from '../scripture-web/gestures.js';
import { WebFallbackList } from '../scripture-web/WebFallbackList.jsx';
import {
  TipChip, HowToReadGuide, ConnectionChooser, ConnectionList, DetailSheet, EmptyWebNotice,
  loadErrorPanel, legendFor,
} from '../scripture-web/panels.jsx';
import { startChapter } from '../../utils/scripture-web/chapter-connections.js';
import { verseTextFor, graphStats, densityHint } from '../../utils/scripture-web/describe.js';
import { ensureScriptureWebData } from '../../utils/scripture-web/web-data.js';

/* The zoom ceiling (maxZoomOf), the frame, the render arguments and the y
   frame live in utils/scripture-web/web-frame.js, pure and tested; the
   cameras and view that feed them in ui/scripture-web/use-web-camera.js. */

/* HIDE ALL. One session-scoped flag, not a profile setting: the reader hides
   the chrome to look at the web, and the next visit should open with the
   controls back. Absence is the signal — the key is removed, never set to
   '0' — so a default can never impersonate a choice. sessionStorage is not
   swept by the vot-* localStorage migration and is per-tab, which is the
   scope the flag means. */
const CHROME_HIDDEN_KEY = 'vot-sw-chrome-hidden';

/* Where the reader was when they opened a verse from the web (sw1 B3, 2026-10-05). The screen
   unmounts while the reader is up, and its camera, focus and card live in refs, so "Back to The
   Scripture Web" used to land at fit with nothing chosen. In memory only, never stored, and
   one-shot: the next mount takes it, the way WebFallbackList keeps its chapter. */
let resumeWeb = null;
/** Tests only: forget the resume point between cases. */
export function _resetWebPlace() { resumeWeb = null; }
function readChromeHidden() {
  try { return sessionStorage.getItem(CHROME_HIDDEN_KEY) === '1'; } catch (_e) { return false; }
}

/**
 * @param {object} props
 * @param {(endpoint:object, meta?:object) => void} props.navigateToLink
 * @param {() => void} props.onBack
 * @param {{webDensity?:string, theme?:string, swEmptyDismissed?:boolean, swGuideSeen?:boolean}} props.settings
 * @param {(key:string, value:any) => void} props.updateSetting
 */
export function ScriptureWebScreen({ navigateToLink, onBack, settings, updateSetting }) {
  // Taken once per mount (a ref survives StrictMode's second render; the module slot does not).
  const resumeRef = React.useRef(/** @type {any} */ (undefined));
  if (resumeRef.current === undefined) { resumeRef.current = resumeWeb; resumeWeb = null; }
  const glRef = React.useRef(null);
  const uiRef = React.useRef(null);
  const wrapRef = React.useRef(null);
  // the one frame loop (use-frame-scheduler.js) and landscape, always
  // (use-forced-landscape.js): rotation, orientation lock, immersive, loc()
  const { drawRef, schedule, live, capFractionNow } = useFrameScheduler();
  const { rotated, loc } = useForcedLandscape(schedule);

  // the graph asset, loaded once (use-web-renderer.js); Try again refetches
  const { graph, loadError, setLoadError, retryLoad } = useWebGraph();
  const [mode, setMode] = React.useState(() => (resumeRef.current && resumeRef.current.mode) || 'canonical');   // 'canonical' | 'personal'
  // The empty-web notice hands focus back here when it closes, so a keyboard
  // reader stays in the control they were using instead of at the document top.
  const myWebBtnRef = React.useRef(null);
  const [emptyDismissed, setEmptyDismissed] = React.useState(false);
  /* The one-screen "how to read this web" card (landing 13). Open on the
     first visit to the canon web until the reader closes it; the ? button
     brings it back. The seen flag rides `settings` like swEmptyDismissed. */
  const [guideOpen, setGuideOpen] = React.useState(() => !(settings && settings.swGuideSeen));
  const closeGuide = React.useCallback(() => {
    setGuideOpen(false);
    if (typeof updateSetting === 'function') updateSetting('swGuideSeen', true);
  }, [updateSetting]);
  // THE DENSITY IS THE READER'S CHOICE AND NOTHING ELSE MOVES IT. From 09-06
  // to 09-11 (9aa0cfa9) the web switched itself to Essential past 22 CSS px
  // per verse; Corbin, 2026-09-11: "verify that fully zoomed in, the full
  // corpus and all 63000 lines are visible and interactable, UNLESS the user
  // has it set to essential." The stored setting is the whole state.
  /** @returns {Density} */
  const storedDensity = () => {
    // `classic` was the old internal name; accept it once so existing
    // settings migrate naturally while the feature speaks in user terms.
    const saved = settings && settings.webDensity === 'classic' ? 'famous' : settings && settings.webDensity;
    return DENSITY_STEPS.indexOf(saved) >= 0 ? /** @type {Density} */ (saved) : 'famous';
  };
  const [density, setDensity] = React.useState(storedDensity);
  const [chromeHidden, setChromeHidden] = React.useState(readChromeHidden);
  const [announce, setAnnounce] = React.useState('');
  // A transient explanation under the title — set on control cycles so the
  // reader is TOLD what Essential/Famous and the colour modes mean
  // instead of having to guess (the on-device report).
  const [hint, setHint] = React.useState('');
  const hintTimer = React.useRef(0);
  const flashHint = React.useCallback((text) => {
    setHint(text);
    if (hintTimer.current) clearTimeout(hintTimer.current);
    hintTimer.current = setTimeout(() => setHint(''), 3600);
  }, []);
  const [showUnderlay, setShowUnderlay] = React.useState(true);

  // ── everything below here is per-frame state; deliberately NOT React ──
  const topbarRef = React.useRef(null);
  // Hover is a LIGHT touch: it brightens the thread under the pointer and
  // names it, but never dims the rest of the web. Only a tap focuses.
  const hoverRef = React.useRef(-1);
  // frame() runs per draw and must stay identity-stable, so it reads the mode
  // from a ref rather than closing over the state value.
  const modeRef = React.useRef(mode);
  // The cameras (canon + Volumes rail), the view, the focused thread and the
  // frame maths that reads them (v15-code-health-06).
  const {
    camRef, camVRef, lastRailRef, viewRef, focusRef,
    frame, viewFor, zoomCapFor, yFrameFor, camFor,
  } = useWebCamera({ graph, density, modeRef });
  const theme = settings && settings.theme;

  // the canvas's colours, re-read when the theme flips (use-web-renderer.js)
  const chromeRef = useChromeTokens(theme, schedule);

  // frame() reads the mode from a ref so it can stay identity-stable across
  // renders; keep that ref in step with the state it mirrors.
  React.useEffect(() => { modeRef.current = mode; schedule(); }, [mode, schedule]);

  // My Web (use-personal-web.js): the reader's links built into the dual
  // rail, rebuilt live; railOpts() is what the rail renderer places them by
  const { personalRef, personalCount, railOpts } = usePersonalWeb({
    graph, mode, showUnderlay, camRef, camVRef, viewRef, frame, chromeRef, schedule,
  });

  /**
   * Close the empty-web notice for good.
   *
   * The dismissal rides `settings` (vot-state — already exported, counted and
   * shape-checked by the backup) rather than a sixth flag store, so there is no
   * schema bump and no seven-legged registration; and it comes back on a fresh
   * profile because a fresh profile has no key. Local state as well, so the
   * notice goes the moment it is tapped rather than after the settings write
   * round-trips, and so a host with no updateSetting still closes it.
   */
  /* Whether the empty-web notice is on screen. ONE definition: the render
     below and the Escape branch above both read it, because two spellings of
     "is the notice up" is how a keystroke came to dismiss it and leave the
     screen in the same breath. */
  const emptyShown = mode === 'personal' && !!graph && personalCount === 0
    && !emptyDismissed && !(settings && settings.swEmptyDismissed);

  const dismissEmpty = React.useCallback(() => {
    setEmptyDismissed(true);
    if (typeof updateSetting === 'function') updateSetting('swEmptyDismissed', true);
    if (myWebBtnRef.current) myWebBtnRef.current.focus();
  }, [updateSetting]);

  // the WebGL renderer, its lifecycle and the frame's draw (use-web-renderer.js):
  // it writes the elevator's track and the pills' boxes the tap test reads
  const { noWebGL, glRetry, retryGL, railZoom, elevatorRef, badgeBoxesRef } = useWebRenderer({
    graph, mode, density, setLoadError, resumeRef, glRef, uiRef, wrapRef, topbarRef,
    camRef, camVRef, viewRef, focusRef, viewFor, zoomCapFor, yFrameFor,
    chromeRef, personalRef, hoverRef, railOpts, drawRef, schedule, capFractionNow,
  });

  // what the pointer is on and what is open (use-web-selection.js): the hover
  // chip, the chooser, Nearby and the sheet; the tap test and the handlers the
  // gestures call; the cards' close, Follow and a bundle's group
  const {
    tip, choices, detail, listOpen, setTip, setChoices, setDetail, setListOpen,
    handlersRef, dropHover, liftAt, listItems, commitFound, closeCards, followThread, chooseGroup,
  } = useWebSelection({
    graph, mode, density, showUnderlay, resumeRef, camRef, viewRef, focusRef, viewFor, zoomCapFor, yFrameFor,
    personalRef, railOpts, hoverRef, elevatorRef, badgeBoxesRef, schedule, setAnnounce,
  });

  // ── gestures — imperative, never React state per frame ──────────────────
  // Wiring itself lives in gestures.js (attachWebGestures) — a pure move, so
  // it can be exercised with real dispatched DOM events instead of only a
  // screenshot. This effect just owns the mount guard and hands over refs.
  // W52: noWebGL and glRetry are deps because the fallback unmounts .sw-root
  // and Try again mounts a NEW one; without them the listeners stayed on the
  // first, detached root and the web came back dead to every drag and pinch.
  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el || !graph || noWebGL) return;
    return attachWebGestures(el, {
      loc, dpr: () => viewRef.current.DPR, cam: () => camRef.current, camFor,
      view: () => viewRef.current, handlers: () => handlersRef.current,
      live: () => { live(); dropHover(); },
      schedule, maxZoom: (c) => zoomCapFor(c || camRef.current), clampCamera, zoomAbout, xToVerse,
      yFrame: yFrameFor, lift: liftAt,
    });
  }, [graph, noWebGL, glRetry, schedule, loc, camFor, zoomCapFor, live, dropHover, yFrameFor, liftAt, viewRef, camRef, handlersRef]);

  /** Reset one rail's camera to fit (r2: each rail has its own). */
  const resetRail = React.useCallback((which) => {
    const v = viewRef.current;
    const c = which === 'top' ? camVRef.current : camRef.current;
    if (!c) return;
    c.ppv = fitPPV(c, v.W);
    c.x = c.total / 2;
    clampCamera(c, v.W, zoomCapFor(c));
    schedule();
  }, [camRef, camVRef, schedule, viewRef, zoomCapFor]);

  const resetView = React.useCallback(() => {
    const cam = camRef.current, v = viewRef.current;
    if (!cam) return;
    cam.ppv = fitPPV(cam, v.W);
    cam.x = cam.total / 2;
    // explicit, though the frameless clamp below also holds y at 0: Reset
    // MEANS the baseline, whatever clamp a later edit puts after it
    cam.y = 0;
    clampCamera(cam, v.W, maxZoomOf(graph, v));
    if (camVRef.current) resetRail('top');
    focusRef.current = { arc: -1, range: null };
    hoverRef.current = -1;
    setDetail(null); setChoices(null); setListOpen(false); setTip(null); schedule();
  }, [camRef, viewRef, graph, camVRef, resetRail, focusRef, schedule, setChoices, setDetail, setListOpen, setTip]);

  const toggleChrome = React.useCallback(() => {
    const next = !chromeHidden;
    try {
      if (next) sessionStorage.setItem(CHROME_HIDDEN_KEY, '1');
      else sessionStorage.removeItem(CHROME_HIDDEN_KEY);
    } catch (_e) { /* private mode: the toggle still works for this mount */ }
    setChromeHidden(next);
  }, [chromeHidden]);

  /** Scripture / My web. The chosen line goes with the cards: a link's index and a canon thread's
   * index number two different graphs, so a focus kept across the switch spotlit an unrelated
   * line in the other web, with nothing open for Escape or Back to close (sweep v5, 2026-10-14). */
  const switchMode = React.useCallback((next) => {
    closeCards();
    setMode(next);
  }, [closeCards]);

  // Escape, Android Back and the web's own keys (use-web-keys.js): one layer
  // closes a press, then the keys pan, climb, zoom and reset
  const { onKeyDown } = useWebKeys({
    graph, guideOpen, emptyShown, listOpen, choices, detail, tip, closeGuide, dismissEmpty, closeCards,
    camRef, camVRef, lastRailRef, viewRef, modeRef, personalRef, zoomCapFor, yFrameFor,
    resetView, onBack, dropHover, setAnnounce, schedule,
  });

  const openEndpoint = React.useCallback((endpoint) => {
    if (!endpoint || typeof navigateToLink !== 'function') return;
    // meta.sourceLetterTitle is what the reader's back pill is labelled with,
    // and the hook snapshots the current screen as the return target — so a
    // jump from here comes back HERE.
    const cam = camRef.current;
    resumeWeb = cam ? { mode: modeRef.current, cam: Object.assign({}, cam), focus: Object.assign({}, focusRef.current), detail } : null;
    navigateToLink(endpoint, { sourceLetterTitle: 'The Scripture Web' });
  }, [navigateToLink, camRef, focusRef, modeRef, detail]);

  // ── render ──────────────────────────────────────────────────────────────
  if (loadError) return loadErrorPanel(loadError, retryLoad);
  if (noWebGL && graph) {
    // A7: the web read as a list instead of a dead end (WebFallbackList.jsx).
    // It opens on the reader's last Bible chapter (HistoryStore, newest first).
    const hist = typeof HistoryStore !== 'undefined' ? HistoryStore.list() : [];
    const lastCh = (hist || []).find((h) => h && h.type === 'chapter' && h.bookId && h.chapterNum);
    return (
      <WebFallbackList graph={graph}
        initialChapter={startChapter(graph, lastCh && lastCh.bookId, lastCh && lastCh.chapterNum)}
        onOpen={(ref) => navigateToLink && navigateToLink({ type: 'bible', bookId: ref.bookId, chapter: ref.chapter, verse: ref.verse })}
        onRetry={retryGL}
        onBack={onBack} verseText={verseTextFor} />
    );
  }
  // (noWebGL is only ever set by the renderer effect, which needs the graph,
  // and the graph is never cleared once loaded: the list above is the one
  // no-WebGL face.)

  const stats = graph ? graphStats(graph, density) : null;

  return (
    <div className={'sw-root' + (rotated ? ' sw-rotated' : '') + (chromeHidden ? ' sw-chrome-hidden' : '')} ref={wrapRef}
      tabIndex={0} onKeyDown={onKeyDown}
      role="application"
      aria-label="The Scripture Web — an interactive map of cross-references"
      aria-describedby="sw-a11y-help">
      <canvas className="sw-canvas sw-canvas-gl" ref={glRef} aria-hidden="true" />
      <canvas className="sw-canvas sw-canvas-ui" ref={uiRef} aria-hidden="true" />

      {!graph && <div className="sw-loading">Weaving the web…</div>}

      <div className="sw-topbar" ref={topbarRef}>
        <button type="button" className="sw-btn sw-btn-icon" onClick={onBack} aria-label="Back">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15 18l-6-6 6-6" /></svg>
        </button>
        <div className="sw-title">
          <h1>{mode === 'personal' ? 'My Web' : 'The Scripture Web'}</h1>
          {mode === 'personal'
            ? (personalCount === 0
              /* An invitation, not a count of zero: "0 links you have made" under
                 a fog was Corbin's screenshot of a dead screen (design-perf,
                 2026-09-10). The number returns with the first link. */
              ? <p>No links yet — select any text and tap Link.</p>
              : <p>{personalCount.toLocaleString()} {personalCount === 1 ? 'link' : 'links'} you have made</p>)
            /* The count shown, alone: "15,402 of 63,418" read as a fraction of
               something the reader had not asked about (Corbin, 2026-09-11:
               "just keep x connections"); the density hint that flashes on a
               switch is where the two densities are explained. */
            : (stats && <p>{stats.shown.toLocaleString()} connections</p>)}
          {hint && <p className="sw-hint" role="status">{hint}</p>}
        </div>
      </div>

      <div className="sw-controls">
        <div className="sw-seg" role="group" aria-label="Which web">
          <button type="button" className={'sw-seg-btn' + (mode === 'canonical' ? ' is-on' : '')}
            aria-pressed={mode === 'canonical'} onClick={() => switchMode('canonical')}>Scripture</button>
          <button type="button" ref={myWebBtnRef} className={'sw-seg-btn' + (mode === 'personal' ? ' is-on' : '')}
            aria-pressed={mode === 'personal'} onClick={() => switchMode('personal')}>My web</button>
        </div>
        <button type="button" className={'sw-btn' + (listOpen ? ' is-on' : '')}
          onClick={() => { setListOpen(!listOpen); setChoices(null); }}
          aria-expanded={listOpen} aria-haspopup="dialog">Nearby</button>
        {mode === 'canonical' ? (
            <label className="sw-select-wrap">
              <span className="sw-sr-only">Connection density</span>
              <select className="sw-select" value={density} aria-label="Connection density"
                onChange={(e) => {
                  const next = /** @type {Density} */ (e.target.value);
                  setDensity(next);
                  flashHint(densityHint(next));
                  if (typeof updateSetting === 'function') updateSetting('webDensity', next);
                }}>
                <option value="essential">Essential</option>
                <option value="famous">Famous</option>
              </select>
            </label>
        ) : (
          <button type="button" className={'sw-btn sw-toggle' + (showUnderlay ? ' is-on' : '')} aria-pressed={showUnderlay}
            onClick={() => { setShowUnderlay(!showUnderlay); schedule(); }}
            aria-label={'Corpus context · ' + (personalRef.current && personalRef.current.underlay
              ? personalRef.current.underlay.count.toLocaleString() : '…') + ' curated connections'}>
            Corpus context · {personalRef.current && personalRef.current.underlay
              ? personalRef.current.underlay.count.toLocaleString() : '…'}
          </button>
        )}
        <button type="button" className="sw-btn" onClick={resetView} aria-label="Reset the view">Reset</button>
        {/* NO CREDIT LINE HERE. The CC-BY attribution for the OpenBible.info
            dataset lives on About ("Cross-reference data from OpenBible.info,
            used under CC-BY."); the copy this strip carried printed over the
            book labels in landscape (Corbin, 2026-09-11). */}
      </div>

      {/* HIDE THE CONTROLS — outside everything it hides, because it is the way
          back; bottom-right, the one free corner on the smallest frame (app.css
          says why). Hidden means the topbar and the strip (the pills, Reset, the
          counter); the book rail on the UI canvas and the colour key stay, because
          they are how the web is read, not how it is driven (Corbin, 2026-09-11:
          "keep the web legend (the books at the bottom, etc) but just hide the
          interactable UI"). The label stays constant and aria-pressed carries
          the state, the same convention as the Scripture / My web seg. */}
      <button type="button" className="sw-btn sw-btn-icon sw-hide-all"
        aria-label="Hide controls" aria-pressed={chromeHidden} onClick={toggleChrome}>
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
        </svg>
      </button>

      {/* the how-to-read card's button: the corner above the hide-all
          button, off the controls strip (which it overflowed on a phone) */}
      <button type="button" className={'sw-btn sw-btn-icon sw-guide-btn' + (guideOpen ? ' is-on' : '')}
        onClick={() => (guideOpen ? closeGuide() : setGuideOpen(true))}
        aria-label="How to read this web" aria-expanded={guideOpen} aria-haspopup="dialog">?</button>
      {guideOpen && <HowToReadGuide onClose={closeGuide} />}
      {emptyShown && <EmptyWebNotice onDismiss={dismissEmpty} />}
      {tip && <TipChip info={tip} viewport={viewRef.current} />}
      {choices && <ConnectionChooser choices={choices} onChoose={commitFound} onClose={closeCards} />}
      {listOpen && <ConnectionList items={listItems} mode={mode}
        lensOn={mode !== 'personal' && !!(camRef.current && viewRef.current.W && lensRange(graph, camRef.current, viewRef.current.W))}
        onChoose={commitFound} onClose={closeCards} />}
      {detail && (
        <DetailSheet info={detail} onClose={closeCards} onOpen={openEndpoint} onFollow={followThread}
          onGroup={chooseGroup} />
      )}

      <div className="sw-legend" aria-hidden="true">{legendFor(mode)}</div>
      {mode === 'personal' && railZoom.top ? (
        <button type="button" className="sw-btn sw-rail-reset sw-rail-reset-top" aria-label="Reset the Volumes rail"
          data-wheel-through="1" onClick={() => resetRail('top')}>Reset Volumes</button>
      ) : null}
      {mode === 'personal' && railZoom.bottom ? (
        <button type="button" className="sw-btn sw-rail-reset sw-rail-reset-bottom" aria-label="Reset the Bible rail"
          data-wheel-through="1" onClick={() => resetRail('bottom')}>Reset Bible</button>
      ) : null}
      <div className="sw-live" role="status" aria-live="polite">{announce}</div>
      <div id="sw-a11y-help" className="sw-sr-only">
        Drag to move through scripture. Pinch or scroll to zoom, or use the plus and minus keys.
        Select a line to see its references; Nearby opens a keyboard-friendly list.
      </div>
    </div>
  );
}

/* The graph asset's loader lives in utils/scripture-web/web-data.js; it is
   still exported from here, where _entry-d.js imports it. */
export { ensureScriptureWebData };
