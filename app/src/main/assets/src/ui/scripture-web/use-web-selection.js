/* ═══════════════════════════════════════════════════════════════════════
   useWebSelection — what the pointer is on, and what is open over the web.
   Cluster F (bundle-d), used by ui/screens/ScriptureWebScreen.jsx.
   ═══════════════════════════════════════════════════════════════════════

   Split out of ScriptureWebScreen unchanged (F0, 2026-10-18): the hover chip
   (tip), the chooser for close threads (choices), the Nearby list and the
   detail sheet; the tap test (the elevator's track, the pills, then the
   lines, a chapter or a verse), what a hit is in the panels' terms
   (describe.js), and the handlers the gestures call through handlersRef
   (hover, tap, doubleTap); the cards' one close, Follow, and a bundle's
   group. The focus (focus-state.js: the chosen thread, the hover, the lit
   set) is the per-frame ref the draw reads; the boxes it drew last frame
   come back in elevatorRef, badgeBoxesRef and overlayFrameRef
   (use-web-renderer.js).

   The panel API every stream opens the panel through (CONTRACTS.md section 6):
     openPanel(spec)   spec is a PanelSpec (below); returns whether it opened
     closePanel()      the one close (closeCards)
     panel             { spec, info } | null: what is open, in the panel's terms
     lightThreads(ids) the lit set (focus.lit): the one writer of it
   The journey (use-journey.js) rides through here to the panel; Follow
   pushes onto it and moves the camera with flyTo (use-web-camera.js).

   THE DOCKED PANEL (panel stream, 2026-10-18; web-panel.jsx draws it): a
   chosen connection is FRAMED, both feet inside the canvas area the panel
   leaves with 10 % margins (spec section 3, A3; panel-model connectionFrame),
   the far foot read before the camera moves; a verse, a chapter or a bundle
   moves the camera only when it would sit under the panel. A prophecy pair
   and a letter open (their own describe.js kinds), verse mode lights the
   verse's threads, and a row's Follow (followRow) swaps the panel to that
   connection at its far end. */

import { zoomAbout, fitPPV, verseToX } from '../../utils/scripture-web/geometry.js';
import {
  pickThreads, pickChapter, pickVerse, chapterRange, nearbyChapter, nearbyThreads, arcsTouching, refOfVerse,
} from '../../utils/scripture-web/pick.js';
import {
  connectionFrame, chapterFrame, frameHolds, landingOf, chapterAtX, chooserChapter, FEET_BAND,
} from '../../utils/scripture-web/panel-model.js';
import { maxZoomOf, flightCapOf } from '../../utils/scripture-web/web-frame.js';
import { focusState, withLit } from '../../utils/scripture-web/focus-state.js';
import {
  describeFound, summaryOf, chooserAnnouncement, followAnnouncement,
} from '../../utils/scripture-web/describe.js';
import { pickPersonalLinks, pickUnderlayLinks, nearestLinks, nearestUnderlay } from './rail-renderer.js';
import { hitOverlay, fanAt } from './overlay-renderer.js';
import { routeOverlayHit } from './goto.jsx';

/** How far a choice's frame must zoom out (the zoom it leaves over the landing's) to offer the way back. */
export const RETURN_ZOOM_OUT = 1.5;

/**
 * What the panel is asked to show (CONTRACTS.md section 6). `arc` is an OpenBible arc id unless
 * `prophecy` (then an index into g.prophecy); `verse` is a graph verse id; `chapter` an index into
 * g.chapters; `letterKey` is vot-citations' key for a letter (its collection and id). A verse
 * spec with `verseEnd` (a later verse id) is a range: the go-to's "John 3:16-18", its first verse's
 * text and the range's threads (w4: verse mode on the first verse lit only that verse's).
 * @typedef {{ mode: 'connection', arc: number, prophecy?: boolean }
 *   | { mode: 'verse', verse: number, verseEnd?: number }
 *   | { mode: 'group', ids: ArrayLike<number>, label: string, chapter?: number }
 *   | { mode: 'letter', letterKey: string }
 *   | { mode: 'exits', ids: ArrayLike<number>, label: string, key: string, side?: 'left'|'right'|null,
 *       books?: [number, number]|null, cell?: {lo:number, hi:number}|null, area?: {label:string, lo:number, hi:number}|null }} PanelSpec
 *   exits: a chip of a "+n" pill's fan (exits.js): the lines it counts, from its cell to the books
 *   it names on its side, lit and listed by the book they go to
 */
/**
 * What is open: the spec in the panel's terms and the described payload today's cards render
 * (describe.js describeFound, or for the chooser its described rows). A My Web card is a
 * connection spec with `myWeb` naming the rail list ('link' | 'underlay') `arc` indexes.
 * @typedef {{ spec: PanelSpec & { myWeb?: string }, info: any }} PanelState
 */

/**
 * Which modes openPanel opens (true) and which it has no panel for yet (false), so a door into
 * the web offers only what opens: the reader's "See this letter's scriptures" (screen-routes.jsx
 * __openScriptureWeb) stays hidden while letter is false, because the web would otherwise open at
 * its old place and name nothing of the letter (the navigation stream's review, 2026-10-18). Letter
 * mode came with the panel stream (web-panel.jsx), so every mode opens and the door shows (set at
 * integration: the panel stream branched before the flag existed); contracts.test.jsx holds each
 * flag to what openPanel does.
 * @type {Readonly<Record<PanelSpec['mode'], boolean>>}
 */
export const PANEL_MODES = Object.freeze({ connection: true, verse: true, group: true, letter: true, exits: true });

/** A verse card's last verse: its range's end, or the verse. @param {any} found */
const endOf = (found) => (found.verseEnd > found.verse ? found.verseEnd : found.verse);

/**
 * What a fan's hit asks (focus-state.js ExitAsk): a "+n" pill its column's fan; a fan's chip its
 * column and the books its lines go to, on its side.
 * @param {any} hit  an overlay hit: 'pill' (with a cell) or 'exit'
 * @returns {import('../../utils/scripture-web/focus-state.js').ExitAsk}
 */
export function askOfHit(hit) {
  if (hit.kind === 'pill') {
    return { key: 'cell:' + hit.cell.lo + '-' + hit.cell.hi, cell: { lo: hit.cell.lo, hi: hit.cell.hi }, side: null, books: null };
  }
  return { key: hit.key, cell: hit.cell ? { lo: hit.cell.lo, hi: hit.cell.hi } : null, side: hit.side || null, books: [hit.lo, hit.hi] };
}

/**
 * The open card in the panel's terms. Pure, so the mapping is pinned without a mount.
 * @param {any} detail  the open sheet's described payload, or null
 * @param {any[] | null} choices  the chooser's described rows, or null
 * @param {number} [choiceChapter]  the chapter the chooser was opened at (the tap's, a pill's), -1 or
 *   absent when none is known
 * @returns {PanelState | null}
 */
export function panelOf(detail, choices, choiceChapter = -1) {
  if (detail) {
    const k = detail.kind;
    if (k === 'arc') {
      // a prophecy pair the OpenBible data does not hold has no arc: its spec names the pair
      return detail.index >= 0
        ? { spec: { mode: 'connection', arc: detail.index }, info: detail }
        : { spec: { mode: 'connection', arc: detail.prophecyIndex, prophecy: true }, info: detail };
    }
    if (k === 'letter') return { spec: { mode: 'letter', letterKey: detail.letterKey }, info: detail };
    if (k === 'verse') {
      return { spec: detail.verseEnd > detail.verse ? { mode: 'verse', verse: detail.verse, verseEnd: detail.verseEnd }
        : { mode: 'verse', verse: detail.verse }, info: detail };
    }
    if (k === 'chapter') {
      return { spec: { mode: 'group', ids: [], label: detail.book ? detail.book.title + ' ' + detail.chapter : '', chapter: detail.chapterIndex }, info: detail };
    }
    if (k === 'bundle') return { spec: { mode: 'group', ids: [], label: detail.label || '' }, info: detail };
    if (k === 'exits') {
      return { spec: { mode: 'exits', ids: detail.ids, label: detail.label, key: detail.key, side: detail.side,
        books: detail.books, cell: detail.cell, area: detail.area }, info: detail };
    }
    if (k === 'link' || k === 'underlay') return { spec: { mode: 'connection', arc: detail.index, myWeb: k }, info: detail };
    return null;
  }
  if (choices && choices.length) {
    // the group's ids are OpenBible arc ids: a row for a prophecy pair that is no arc (index -1)
    // stays in the rows (info), never in the ids
    const ids = choices.map((c) => c.index).filter((i) => i >= 0);
    return choiceChapter >= 0
      ? { spec: { mode: 'group', ids, label: '', chapter: choiceChapter }, info: choices }
      : { spec: { mode: 'group', ids, label: '' }, info: choices };
  }
  return null;
}

/** The camera's ease when the panel frames what it opened (spec section 3: 450 ms). */
export const FRAME_MS = 450;

/** The most threads a tap's chooser lists, the nearest first from the pick (pick.js pickArcs holds
 * a list of at most 8); the panel says when it listed the nearest of more (w3 review, round 2:
 * at 4, a dense crossing always read "4 threads close together"). */
export const CHOOSER_MOST = 8;

/** How near a second thread must be for a tap to ask which (CSS px), and how much nearer the first
 * must be to be chosen outright: twice as near, and by TIE_CLEAR at least. */
export const TIE_WITHIN = 8;
export const TIE_CLEAR = 3;

/**
 * Whether a tap's two nearest threads (device px from the tap) are a real tie, so the chooser asks.
 * Every line stays tappable (C5): a tap nearer one line than any other chooses it, and where two
 * stand as near the chooser lists them. w4 device check: on a dense field under a fingertip a second
 * thread is almost always within 8 px, so with that test alone every tap of a dozen at the overview,
 * 30x and 40x opened "The 8 nearest threads" and none chose its line.
 * @param {number} d0 the nearest's distance @param {number} d1 the next's @param {number} dpr
 */
export function isTie(d0, d1, dpr) {
  const s = dpr > 0 ? dpr : 1;
  if (!(d1 <= TIE_WITHIN * s)) return false;
  return !(d1 >= 2 * d0 && d1 - d0 >= TIE_CLEAR * s);
}

/**
 * @param {any} p  the graph, mode, density and showUnderlay; the resume point
 *   (the sheet that was open); the cameras' refs and callbacks and flyTo
 *   (use-web-camera.js); My Web's personalRef and railOpts; the boxes the
 *   draw wrote (elevatorRef, badgeBoxesRef, overlayFrameRef); the journey
 *   (use-journey.js); the frame loop; the live region; My Web's relink
 *   (use-personal-web.js, optional): the chosen link found again after a rebuild; settledAt (the navigation stream, A6:
 *   use-web-camera.js's chapter at rest), which Nearby's list re-derives on; insetFor (optional,
 *   use-panel-layout.js): what the panel will cover once open, CSS px, so a
 *   choice is framed before the panel has rendered; slackFor (optional,
 *   use-web-camera.js): the camera clamp's room for the docked panel, which the
 *   double-tap's zoom keeps
 */
export function useWebSelection({
  graph, mode, density, showUnderlay, resumeRef, camRef, viewRef, focusRef, viewFor, yFrameFor, holdBook,
  personalRef, railOpts, elevatorRef, badgeBoxesRef, overlayFrameRef, flyTo, journey, schedule, setAnnounce, relink = null,
  settledAt, insetFor, slackFor,
}) {
  const [detail, setDetail] = React.useState(() => (resumeRef.current && resumeRef.current.detail) || null);      // the open sheet
  // My Web's rebuild found the chosen line again (use-personal-web's relink):
  // its open card moves to the line's new index, or closes with it gone
  // (fix-review #8; a Timothy thread by its key, fix-review 2 #4)
  React.useEffect(() => {
    if (!relink) return;
    const kind = relink.kind || 'link';
    setDetail((d) => {
      const id = !d ? null : d.kind === 'link' ? d.record && d.record.id : d.kind === 'underlay' ? d.key : null;
      if (!d || d.kind !== kind || !id || id !== relink.id) return d;
      return relink.at >= 0 ? Object.assign({}, d, { index: relink.at }) : null;
    });
  }, [relink]);
  // the open card, for a panel opened from it (its parent: the way back in the panel)
  const detailRef = React.useRef(detail);
  detailRef.current = detail;
  const [choices, setChoices] = React.useState(null);    // overlapped line chooser
  // the chapter the chooser was opened at (under the tap, or a pill's): its "Zoom to" row's, -1 none
  const [choiceChapter, setChoiceChapter] = React.useState(-1);
  // whether a tap's chooser listed the nearest CHOOSER_MOST of more threads than that
  const [choiceCut, setChoiceCut] = React.useState(false);
  const [listOpen, setListOpen] = React.useState(false); // accessible nearby list
  const [tip, setTip] = React.useState(null);            // hover chip
  // whether the docked panel is open (read by the hover: the panel covers the web under it)
  const panelOpenRef = React.useRef(false);
  panelOpenRef.current = !!(detail || (choices && choices.length) || listOpen);

  // The pointer handlers are reached through a ref for the reason draw is
  // (use-frame-scheduler.js): the gesture listeners bind once and call the
  // LATEST handlers, not the ones of the render that attached them.
  const handlersRef = React.useRef(/** @type {any} */ ({}));
  const hoverRafRef = React.useRef(0);
  const hoverPointRef = React.useRef(null);

  /* The hover chip names what is under a resting mouse. A drag, pinch, wheel or key pan moves the
     web out from under it, so each one drops it (sw1 B4: it stayed put over different lines). */
  const tipOnRef = React.useRef(false);
  React.useEffect(() => { tipOnRef.current = !!tip; }, [tip]);

  /* The fan's hover (exits.js): a resting pointer on a "+n" pill raises its column's fan and lights
     nothing (a 239-leg gold column is a flood; the fan already says where the lines go); on a fan's
     chip it lights the lines that chip counts. Both are a preview: what was lit and asked before
     comes back when the pointer leaves. Neither dims anything (the lit ink only, no range: C3, a
     hover never isolates). */
  /** Preview a fan's hit; false when it is what is asked already. @param {any} hit */
  const previewAsk = React.useCallback((hit) => {
    const f = focusRef.current;
    const ask = askOfHit(hit);
    if (f.ask && f.ask.key === ask.key) return false;
    const prev = f.ask && f.ask.hover ? f.ask.prev : { lit: f.lit, ask: f.ask || null };
    focusRef.current = focusState(Object.assign({}, f, {
      hover: -1, hoverProphecy: -1, hoverUnderlay: false,
      // a pill lights nothing: the lit set stays the one the preview stands over
      lit: hit.kind === 'pill' ? prev.lit : hit.ids,
      ask: Object.assign(ask, { hover: true, prev }),
    }));
    return true;
  }, [focusRef]);
  /** End the preview: the lit set and the ask it stood in for come back. False when none was up. */
  const endPreview = React.useCallback(() => {
    const f = focusRef.current;
    if (!f.ask || !f.ask.hover) return false;
    const prev = f.ask.prev || { lit: null, ask: null };
    focusRef.current = focusState(Object.assign({}, f, { lit: prev.lit, ask: prev.ask }));
    return true;
  }, [focusRef]);

  /** Let go of what is hovered (a thread, a pair, the fan's preview); true when the fan's preview
   * was up, so the caller redraws for it as it does for a hovered thread. */
  const dropHover = React.useCallback(() => {
    if (hoverRafRef.current) { cancelAnimationFrame(hoverRafRef.current); hoverRafRef.current = 0; }
    hoverPointRef.current = null;
    const previewed = endPreview();
    focusRef.current.hover = -1;
    focusRef.current.hoverProphecy = -1;
    focusRef.current.hoverUnderlay = false;
    if (tipOnRef.current) { tipOnRef.current = false; setTip(null); }
    return previewed;
  }, [focusRef, endPreview]);

  /**
   * The elevator's lift (landing 14): for a pointer going down on the track
   * (device-px box in elevatorRef, kept by drawElevator), the function of a
   * CSS y that sets the camera's height - the track's top is the tallest
   * apex, its foot the baseline. Null off the track, so the web pans.
   */
  const liftAt = React.useCallback((cx, cy) => {
    const lift = elevatorRef.current, v = viewRef.current;
    if (!lift || !v.W) return null;
    const px = cx * v.DPR, py = cy * v.DPR;
    if (px < lift.x0 || px > lift.x1 || py < lift.y0 || py > lift.y1) return null;
    return (yCss) => {
      const cam = camRef.current;
      if (!cam) return;
      const f = lift.y1 > lift.y0 ? (lift.y1 - yCss * v.DPR) / (lift.y1 - lift.y0) : 0;
      cam.y = Math.max(0, Math.min(1, f)) * lift.maxY;
    };
  }, [camRef, viewRef, elevatorRef]);

  // Verse and chapter candidates carry no distance: they only ever come alone.
  const hitCandidatesAt = React.useCallback(/** @returns {Array<{ kind: string, distance?: number } & Record<string, any>>} */ (cx, cy) => {
    const g = graph, cam = camRef.current, v = viewRef.current;
    if (!g || !cam || !v.W) return [];
    const px = cx * v.DPR, py = cy * v.DPR;
    const view = viewFor();
    if (mode !== 'personal') {
      // a badge is a real target: the bundle it counts
      for (const box of badgeBoxesRef.current) {
        if (px < box.x0 || px > box.x1 || py < box.y0 || py > box.y1) continue;
        if (box.cell) return [{ kind: 'bundle', cell: box.cell, distance: 0 }];
      }
    }
    if (mode === 'personal') {
      const p = personalRef.current;
      const opts = railOpts();
      const userHits = pickPersonalLinks(p && p.graph, opts, px, py, 14 * v.DPR, 4);
      if (userHits.length) return userHits.map((hit) => ({
        kind: 'link', index: hit.index, distance: hit.distance,
      }));
      if (showUnderlay) {
        const contextHits = pickUnderlayLinks(p && p.underlay, opts, px, py, 14 * v.DPR, 4);
        if (contextHits.length) return contextHits.map((hit) => ({
          kind: 'underlay', index: hit.index, distance: hit.distance,
        }));
      }
      const ci = pickChapter(g, cam, view, px, py);
      return ci >= 0 ? [{ kind: 'chapter', chapterIndex: ci }] : [];
    }
    const ci = pickChapter(g, cam, view, px, py);
    if (ci >= 0) {
      const zoomed = cam.ppv > 26 * v.DPR;
      if (zoomed) {
        const verse = pickVerse(g, cam, view, px, py);
        if (verse >= 0) return [{ kind: 'verse', verse }];
      }
      return [{ kind: 'chapter', chapterIndex: ci }];
    }
    // one past the chooser's most, so the tap can tell eight threads from the nearest eight of more (s27.3)
    return pickThreads(g, cam, view, px, py, 14 * v.DPR, CHOOSER_MOST + 1)
      .map((hit) => ({ kind: 'arc', hit, distance: hit.distance }));
  }, [graph, camRef, viewRef, viewFor, mode, railOpts, showUnderlay, badgeBoxesRef, personalRef]);

  const hitAt = React.useCallback((cx, cy) => hitCandidatesAt(cx, cy)[0] || null,
    [hitCandidatesAt]);

  // what a hit is, in the panels' terms (describe.js), read in this frame
  const describe = React.useCallback((found) => describeFound(found, {
    g: graph, personal: personalRef.current, cam: camRef.current, v: viewRef.current, viewFor, density,
  }), [graph, camRef, viewRef, density, viewFor, personalRef]);

  const listItems = React.useMemo(() => {
    if (!graph || !listOpen) return [];
    const found = [];
    if (mode === 'personal') {
      // every link, the one passing nearest the middle of the view first
      // (item 29, w3: it was the first 36 in store order wherever the camera
      // stood); before the first frame has a size, store order
      const p = personalRef.current;
      const cam = camRef.current, v = viewRef.current;
      const opts = cam && v && v.W && p && p.votRail ? railOpts() : null;
      const count = p && p.graph ? p.graph.count : 0;
      const links = opts ? nearestLinks(p.graph, opts) : Array.from({ length: count }, (_, index) => ({ index }));
      for (const hit of links) found.push({ kind: 'link', index: hit.index });
      if (!found.length && showUnderlay && p && p.underlay) {
        const near = opts ? nearestUnderlay(p.underlay, opts, 36)
          : Array.from({ length: Math.min(p.underlay.count, 36) }, (_, index) => ({ index }));
        for (const hit of near) found.push({ kind: 'underlay', index: hit.index });
      }
    } else {
      // the list reads the lens (landing 15): the lit chapter leads - its
      // sheet says where its threads go, by chapter - then its threads,
      // strongest first, so the sky is walked from a list as well as by eye
      const cam = camRef.current, v = viewRef.current;
      if (!cam || !v.W) return [];
      const chapterIndex = nearbyChapter(graph, cam, v.W);
      if (chapterIndex < 0) return [];
      const [lo, hi] = chapterRange(graph, chapterIndex);
      found.push({ kind: 'chapter', chapterIndex });
      for (const index of nearbyThreads(graph, lo, hi, density, 36)) {
        found.push({ kind: 'arc', hit: {
          index, from: graph.from[index], to: graph.to[index], votes: graph.votes[index],
        } });
      }
    }
    return found.map(describe).filter(Boolean);
    // settledAt is the trigger, not an input: the list reads the live camera, and is re-derived
    // each time the camera comes to rest somewhere new (A6)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph, listOpen, mode, describe, showUnderlay, camRef, viewRef, density, personalRef, railOpts, settledAt]);

  /**
   * What the open panel covers and how flyTo is told it: `right` in device px (0 with no layout
   * known), and the opts that name the inset and the spec's ease.
   */
  const coverNow = React.useCallback(() => {
    const v = viewRef.current;
    const inset = typeof insetFor === 'function' ? insetFor() : null;
    /** @type {any} */
    const opts = { ms: FRAME_MS };
    if (inset) { opts.insetRight = inset.right; opts.insetBottom = inset.bottom; }
    return { right: inset && v ? inset.right * (v.DPR || 1) : 0, opts };
  }, [viewRef, insetFor]);

  /**
   * Bring canon x into the canvas area the panel leaves (spec section 3), centred there at the
   * reader's zoom. Near either end of the canon the camera's clamp stops it with the canon's first or
   * last verse the area's outer tenth inside it (its slack for the panel, geometry.clampCamera), so x
   * stands in the area, off centre, and never under the panel (the w3 review's major finding); the zoom is never
   * changed to get there (its second round found the dive that once did a curtain of legs).
   * `always` centres it; otherwise it moves only when x sits under the panel, off the left edge or
   * in the area's outer tenth either side (its threads fan out both ways).
   * @param {number} x  canon x
   * @param {{ always?: boolean }} [how]
   */
  const bringIn = React.useCallback((x, how = {}) => {
    const cam = camRef.current, v = viewRef.current;
    if (!cam || !v || !v.W || typeof flyTo !== 'function') return;
    const { right, opts } = coverNow();
    if (!how.always) {
      const at = verseToX(cam, v.W, x), areaW = v.W - right;
      if (at >= 0.1 * areaW && at <= 0.9 * areaW) return;
    }
    flyTo({ x }, opts);
  }, [camRef, viewRef, flyTo, coverNow]);

  /**
   * Keep what was opened in the canvas area (spec section 3). A connection is framed: both feet
   * inside the area the panel leaves, 10 % margins (connectionFrame), eased over FRAME_MS. A thread
   * the area cannot hold whole (wider than it at fit, or kept from its centre by the camera's clamp
   * at the canon's end) keeps its NEAR foot in instead, the one the reader is looking at; Follow
   * takes them to the other. A verse, a chapter or a bundle moves only when its middle would sit
   * under the panel or in the area's outer tenth (bringIn). My Web's cards stay where the reader
   * put them.
   */
  /* THE WAY BACK (Corbin, 2026-10-22: "tapping a line then having it fully zoom all the way out
     sucks, takes me away from the verse I was zoomed into. Would be ok if I had a button that only
     showed in that moment that allowed me to return to my zoomed in vision"). A choice whose frame
     zooms out past RETURN_ZOOM_OUT keeps the camera it left, and the screen shows "Back to <verse>"
     until the reader takes the camera (a gesture or a key: dropReturn) or goes back (returnBack;
     Escape and Android Back too). A later choice keeps the first way back: it is the verse the
     reader was zoomed into. */
  const [returnTo, setReturnTo] = React.useState(/** @type {null | { x: number, ppv: number, y: number, label: string }} */ (null));
  const returnRef = React.useRef(returnTo);
  returnRef.current = returnTo;
  const dropReturn = React.useCallback(() => { if (returnRef.current) setReturnTo(null); }, []);
  const returnBack = React.useCallback(() => {
    const r = returnRef.current, cam = camRef.current, v = viewRef.current;
    setReturnTo(null);
    if (!r || !cam || !v || !v.W || typeof flyTo !== 'function') return;
    flyTo({ x: r.x, zoom: r.ppv / fitPPV(cam, v.W), y: r.y }, { insetRight: 0, insetBottom: 0, ms: FRAME_MS });
  }, [camRef, viewRef, flyTo]);

  const frameFound = React.useCallback((found) => {
    const cam = camRef.current, v = viewRef.current;
    if (!found || !cam || !v || !v.W || typeof flyTo !== 'function') return;
    if (found.kind === 'arc') {
      const { right, opts } = coverNow();
      const frame = connectionFrame(found.from, found.to);
      const cap = flightCapOf(graph, v, cam);
      if (frameHolds(cam, v.W, right, frame, found.from, found.to, cap)) {
        if (!returnRef.current && graph && landingOf(cam, v.W, right, frame, cap).ppv < cam.ppv / RETURN_ZOOM_OUT) {
          // the verse the reader was looking at: the near foot, the one Follow does not go to
          const near = found.far === 'from' ? found.to : found.from;
          setReturnTo({ x: cam.x, ppv: cam.ppv, y: cam.y > 0 ? cam.y : 0, label: refOfVerse(graph, near).label });
        }
        flyTo(frame, opts);
        return;
      }
      bringIn((found.far === 'to' ? found.from : found.to) + 0.5);
      return;
    }
    const range = found.kind === 'verse' ? [found.verse, endOf(found)]
      : found.kind === 'chapter' || found.kind === 'bundle' ? [found.lo, found.hi] : null;
    if (!range || mode === 'personal') return;
    bringIn((range[0] + range[1] + 1) / 2);
  }, [camRef, viewRef, flyTo, coverNow, bringIn, graph, mode]);

  /**
   * Choose a described hit: it opens in the panel, the focus is its own, and the camera keeps it in
   * the canvas area (frameFound). `opts.frame: false` re-shows a card without moving the camera (the
   * panel's way back); `opts.parent` is the card it was opened from.
   * @param {any} found
   * @param {{ frame?: boolean, parent?: any }} [opts]
   */
  const commitFound = React.useCallback((found, opts = {}) => {
    if (!found) return;
    const o = /** @type {{ frame?: boolean, parent?: any }} */ (opts && typeof opts === 'object' && !('nativeEvent' in opts) ? opts : {});
    // the far foot is the one further from the middle of what the reader sees (the canvas area's
    // centre, the panel left out): what Follow goes to, read BEFORE the framing moves the camera.
    // The near one is what a thread too wide to frame keeps in view (frameFound)
    if (found.kind === 'arc' && camRef.current && !found.far) {
      const cam = camRef.current;
      const x = cam.x - (cam.ppv > 0 ? coverNow().right / (2 * cam.ppv) : 0);
      found = Object.assign({}, found, { far: Math.abs(found.to - x) >= Math.abs(found.from - x) ? 'to' : 'from' });
    }
    if (o.parent !== undefined) found = Object.assign({}, found, { parent: o.parent });
    // a new choice: nothing hovered, nothing lit but what the choice lights. A prophecy pair the
    // OpenBible data does not hold is chosen as the pair; verse mode lights the verse's threads
    // (CONTRACTS.md section 6) and keeps the verse lit as a range. On My Web a Timothy thread is
    // chosen in its own list (focus.underlay, fix-review #4)
    const g = graph;
    focusRef.current = focusState(found.kind === 'arc'
      ? (found.index >= 0 ? { arc: found.index } : { arc: found.prophecyIndex, prophecy: true })
      : found.kind === 'link' || found.kind === 'underlay' ? { arc: found.index, underlay: found.kind === 'underlay' }
      : found.kind === 'verse' ? { range: [found.verse, endOf(found)],
        lit: g ? arcsTouching(g, found.verse, endOf(found), density, 0) : null }
      // a fan chip's card lights its lines and keeps its column's fan up; no range, so nothing
      // recedes (C3: the lit ink only, every other line as it was)
      : found.kind === 'exits' ? { lit: found.ids,
        ask: { key: found.key, cell: found.cell || null, side: found.side || null, books: found.books || null } }
      : { range: found.kind === 'chapter' || found.kind === 'bundle' ? [found.lo, found.hi] : null });
    setTip(null);
    setChoices(null);
    setListOpen(false);
    setDetail(found);
    setAnnounce(summaryOf(found));
    if (o.frame !== false) frameFound(found);
    schedule();
  }, [camRef, focusRef, schedule, setAnnounce, graph, density, frameFound, coverNow]);

  const hover = React.useCallback((cx, cy) => {
    // the docked panel covers the web under it: the gesture surface is the root, so a mouse resting
    // on the panel arrives here, and it hovers nothing there (and leaving the canvas area for the
    // panel lets go of what was hovered)
    if (panelOpenRef.current && typeof insetFor === 'function') {
      const v = viewRef.current;
      const inset = insetFor();
      const dpr = (v && v.DPR) || 1;
      if (v && v.W && inset && ((inset.right > 0 && cx >= v.W / dpr - inset.right) ||
          (inset.bottom > 0 && cy >= v.H / dpr - inset.bottom))) {
        const had = focusRef.current.hover !== -1;
        if (dropHover() || had) schedule();
        return;
      }
    }
    hoverPointRef.current = { cx, cy };
    if (hoverRafRef.current) return;
    hoverRafRef.current = requestAnimationFrame(() => {
      hoverRafRef.current = 0;
      const point = hoverPointRef.current;
      if (!point) return;
      // the fan first (a "+n" pill, a fan's chip): they preview what they ask; on the fan's ground
      // the fan stays up, and nothing under it is hovered
      if (mode !== 'personal') {
        const ofs = overlayFrameRef ? overlayFrameRef.current : null;
        const oh = hitOverlay(ofs, point.cx, point.cy);
        if (oh && (oh.kind === 'exit' || (oh.kind === 'pill' && oh.cell))) {
          const was = focusRef.current.hover !== -1 || focusRef.current.hoverProphecy !== -1;
          if (previewAsk(oh) || was) schedule();
          if (tipOnRef.current) setTip(null);
          return;
        }
        const f0 = focusRef.current;
        if (f0.ask && f0.ask.hover && f0.ask.cell && fanAt(ofs, point.cx, point.cy)) return;
        if (endPreview()) schedule();
      }
      const found = describe(hitAt(point.cx, point.cy));
      // a thread under the pointer lights: an OpenBible arc, or on My Web a
      // reader's link or a Timothy thread (fix-review #11), in its own list
      const line = !!found && (found.kind === 'arc' || found.kind === 'link' || found.kind === 'underlay');
      const nextHover = line ? found.index : -1, nextUnderlay = line && found.kind === 'underlay';
      // a prophecy pair that is no OpenBible arc has no arc index: the focus names the pair
      const nextPair = found && found.kind === 'arc' && found.index < 0 && found.prophecyIndex >= 0 ? found.prophecyIndex : -1;
      const f = focusRef.current;
      if (nextHover !== f.hover || nextPair !== f.hoverProphecy || nextUnderlay !== !!f.hoverUnderlay) {
        f.hover = nextHover; f.hoverProphecy = nextPair; f.hoverUnderlay = nextUnderlay; schedule();
      }
      setTip((previous) => {
        if (!found) return previous ? null : previous;
        if (previous && previous.info.kind === found.kind &&
            (!line || (previous.info.index === found.index && previous.info.prophecyIndex === found.prophecyIndex)) &&
            Math.abs(previous.x - point.cx) < 4 && Math.abs(previous.y - point.cy) < 4) {
          return previous;
        }
        return { info: found, x: point.cx, y: point.cy };
      });
    });
  }, [describe, hitAt, schedule, focusRef, insetFor, viewRef, dropHover, mode, overlayFrameRef, previewAsk, endPreview]);

  React.useEffect(() => () => {
    if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current);
  }, []);

  /**
   * Open the panel (CONTRACTS.md section 6) in one of its modes (web-panel.jsx draws them): a
   * connection (an OpenBible arc, or a prophecy pair by its index), a verse, a group (the chooser's
   * rows for ids, or a chapter), a letter (the verses it cites). Each is chosen through commitFound,
   * so the focus, the lit set and the framing are the tap's own. `opts.back` keeps the open card as
   * the new one's parent (a letter opened from a citation, a verse from that letter); `opts.frame:
   * false` opens it where the camera is (an edge chip's Follow, which has flown there at the
   * reader's zoom: w4, the opening framed both feet and zoomed far out after it).
   * @param {PanelSpec} spec
   * @param {{ back?: boolean, frame?: boolean }} [opts]
   * @returns {boolean} whether a panel opened
   */
  const openPanel = React.useCallback((spec, opts = {}) => {
    const g = graph;
    if (!g || !spec) return false;
    /** @type {{ parent?: any, frame?: boolean }} */
    const via = {};
    if (opts && opts.back) via.parent = detailRef.current;
    if (opts && opts.frame === false) via.frame = false;
    const arcHit = (i) => ({ kind: 'arc', hit: { index: i, from: g.from[i], to: g.to[i], votes: g.votes[i] } });
    if (spec.mode === 'connection') {
      if (spec.prophecy) {
        if (!(g.prophecy && spec.arc >= 0 && spec.arc < g.prophecy.length)) return false;
        const info = describe({ kind: 'prophecy', prophecy: spec.arc });
        if (!info) return false;
        commitFound(info, via);
        return true;
      }
      if (!(spec.arc >= 0 && spec.arc < g.count)) return false;
      const info = describe(arcHit(spec.arc));
      if (!info) return false;
      commitFound(info, via);
      return true;
    }
    if (spec.mode === 'letter') {
      const info = describe({ kind: 'letter', letterKey: spec.letterKey });
      if (!info) return false;
      commitFound(info, via);
      return true;
    }
    if (spec.mode === 'verse') {
      if (!(spec.verse >= 0 && spec.verse < g.total)) return false;
      const end = spec.verseEnd > spec.verse && spec.verseEnd < g.total ? spec.verseEnd : undefined;
      const info = describe(end === undefined ? { kind: 'verse', verse: spec.verse } : { kind: 'verse', verse: spec.verse, verseEnd: end });
      if (!info) return false;
      commitFound(info, via);
      return true;
    }
    if (spec.mode === 'group') {
      const ids = Array.from(spec.ids || []).filter((i) => i >= 0 && i < g.count);
      if (ids.length) {
        const rows = ids.map((i) => describe(arcHit(i))).filter(Boolean);
        if (!rows.length) return false;
        // the chooser's own open: nothing chosen while it asks, its rows replace the hover chip
        focusRef.current = focusState();
        dropHover();
        setDetail(null); setListOpen(false); setChoices(rows);
        setChoiceChapter(spec.chapter >= 0 && spec.chapter < g.chapters.length ? spec.chapter : -1);
        setChoiceCut(false);
        setAnnounce(chooserAnnouncement(rows.length));
        schedule();
        return true;
      }
      if (spec.chapter >= 0 && spec.chapter < g.chapters.length) {
        const info = describe({ kind: 'chapter', chapterIndex: spec.chapter });
        if (!info) return false;
        commitFound(info, via);
        return true;
      }
      return false;
    }
    if (spec.mode === 'exits') {
      // a fan chip's lines: lit, listed by the book they go to (web-panel.jsx), each with Open and
      // Follow. The list is the one it opened with; the camera stays where the reader is
      const ids = Array.from(spec.ids || []).filter((i) => i >= 0 && i < g.count);
      if (!ids.length || !spec.key) return false;
      commitFound({ kind: 'exits', key: spec.key, label: spec.label || '', side: spec.side || null,
        books: spec.books || null, cell: spec.cell || null, area: spec.area || null, ids: Int32Array.from(ids) }, via);
      return true;
    }
    return false;
  }, [graph, describe, commitFound, focusRef, dropHover, schedule, setAnnounce]);

  /** Light a set of threads (focus.lit: the lit ink, the top pass), or none (null). The one writer
   * of the lit set: go-to's verse, verse mode, a chooser row under hover or focus. Nothing draws it
   * until the GL stream does; every new choice (commitFound, closeCards) clears it.
   * @param {ArrayLike<number> | null} ids  OpenBible arc ids */
  const lightThreads = React.useCallback((ids) => {
    focusRef.current = withLit(focusRef.current, ids);
    schedule();
  }, [focusRef, schedule]);

  /** Close the cards (the chooser, the Nearby list, the connection sheet) and let go of the chosen
   * line. Every close goes through here: the sheet's x once cleared the card but kept focusRef, so
   * the shader held every other thread at 5 % ink until Escape or Back (sw1 B1, 2026-10-05). */
  const closeCards = React.useCallback(() => {
    setListOpen(false); setChoices(null); setDetail(null); setTip(null);
    focusRef.current = focusState();
    schedule();
  }, [focusRef, schedule]);

  const tap = React.useCallback((cx, cy) => {
    // the elevator (landing 9): a tap on the track sets the camera's height -
    // the top of the track is the tallest apex, the bottom the baseline
    const lift = liftAt(cx, cy);
    if (lift) { lift(cy); schedule(); return; }
    // then what the overlay drew there (a book name, a chapter numeral, a "+n"
    // pill: overlay-renderer.js hitOverlay), before any line under it; the
    // navigation stream routes it (goto.jsx). Nothing records boxes yet: null.
    const overlayHit = hitOverlay(overlayFrameRef ? overlayFrameRef.current : null, cx, cy);
    // the verse zoom's comb: a far end written along its leg is its thread, chosen as a tap on the leg is
    if (overlayHit && overlayHit.kind === 'thread' && graph && overlayHit.index >= 0 && overlayHit.index < graph.count) {
      const i = overlayHit.index;
      const found = describe({ kind: 'arc', distance: 0,
        hit: { index: i, from: graph.from[i], to: graph.to[i], votes: graph.votes ? graph.votes[i] : 0 } });
      if (found) { commitFound(found); return; }
    }
    if (overlayHit && routeOverlayHit(overlayHit, { graph, flyTo, openPanel, journey, insetFor, closePanel: closeCards })) {
      // a pill's tap opens its group as it always has; with a cell it keeps its column's fan up
      // while that card is open (the phone's way to the fan): closing it, the empty-space clear and
      // any other card let it go (focusState), a fan chip's card asks the same cell
      if (overlayHit.kind === 'pill' && overlayHit.cell) {
        focusRef.current = focusState(Object.assign({}, focusRef.current, { ask: askOfHit(overlayHit) }));
        schedule();
      }
      return;
    }
    const reached = hitCandidatesAt(cx, cy);
    const candidates = reached.slice(0, CHOOSER_MOST);
    const described = candidates.map(describe).filter(Boolean);
    if (!described.length) {
      focusRef.current = focusState();
      setTip(null); setChoices(null); setDetail(null); setListOpen(false); schedule(); return;
    }
    const closeEnough = candidates.length > 1 && isTie(candidates[0].distance, candidates[1].distance, viewRef.current.DPR);
    if (closeEnough && described.length > 1 && described.every((item) => item.kind === 'arc' ||
        item.kind === 'link' || item.kind === 'underlay')) {
      setChoices(described);
      // the nearest of more only when the pick found more than it lists (s27.3: eight read as cut)
      setChoiceCut(reached.length > candidates.length);
      // its "Zoom to": the chapter under the tap only where the listed threads stand (chooserChapter)
      const v = viewRef.current, dpr = v.DPR || 1, cam = camRef.current;
      const base = viewFor().base + (cam.y > 0 ? cam.y : 0); // the baseline as drawn (pickArcs)
      const ids = described.filter((item) => item.kind === 'arc').map((item) => item.index);
      setChoiceChapter(chooserChapter(graph, ids, chapterAtX(graph, cam, v.W, cx * dpr),
        cy * dpr >= base - FEET_BAND * dpr));
      setDetail(null);
      setListOpen(false);
      // nothing is chosen while the chooser asks, and its rows replace the hover chip
      focusRef.current = focusState();
      dropHover();
      setAnnounce(chooserAnnouncement(described.length));
      schedule();
      return;
    }
    commitFound(described[0]);
  }, [liftAt, hitCandidatesAt, describe, viewRef, commitFound, schedule, focusRef, dropHover, setAnnounce,
    overlayFrameRef, graph, flyTo, openPanel, journey, camRef, viewFor, insetFor, closeCards]);

  /** Zoom in 2.5x about the tap (A4, the navigation stream): to where zoomAbout puts the camera,
   * eased through flyTo about the same point (instant under reduced motion). */
  const doubleTap = React.useCallback((cx, cy) => {
    const cam = camRef.current, v = viewRef.current;
    if (!cam || !v.W) return;
    const to = { x: cam.x, y: cam.y, ppv: cam.ppv, total: cam.total };
    zoomAbout(to, v.W, cx * v.DPR, 2.5, maxZoomOf(graph, v), yFrameFor(cam) || undefined,
      typeof cy === 'number' ? cy * v.DPR : undefined, typeof slackFor === 'function' ? slackFor(cam) : 0);
    flyTo({ x: to.x, zoom: to.ppv / fitPPV(cam, v.W), y: to.y }, { insetRight: 0, ms: 280, anchor: cx });
  }, [camRef, graph, viewRef, yFrameFor, flyTo, slackFor]);

  /** What is open now, as a way back to it (A1, the navigation stream): the gestures keep one
   * before a tap, and when that tap turns out to be a double-tap's first, the double takes back
   * the card it opened, so a double-tap only zooms. */
  const snapshot = React.useCallback(() => {
    const was = { detail, choices, listOpen, focus: focusRef.current };
    return () => {
      setDetail(was.detail); setChoices(was.choices); setListOpen(was.listOpen); setTip(null);
      focusRef.current = was.focus;
      // and the first tap's words: the live region said a chooser or a card opened when the
      // double-tap only zoomed (w4 a11y hunt), so it is cleared with what the tap opened
      setAnnounce('');
      schedule();
    };
  }, [detail, choices, listOpen, focusRef, schedule, setAnnounce]);

  // Publish the latest handlers for the (stable) gesture listeners to call.
  /** The mouse left the web, or is over the chrome: what it hovered goes (gestures.js). */
  const leave = React.useCallback(() => {
    const had = focusRef.current.hover !== -1 || focusRef.current.hoverProphecy !== -1 || !!focusRef.current.hoverUnderlay;
    if (dropHover() || had) schedule();
  }, [focusRef, dropHover, schedule]);
  /** A long press (gestures.js): on a drawn book name it filters the web to that book (holdBook,
   * web-filters.jsx). Returns whether it took the press. */
  const holdRef = React.useRef(holdBook);
  holdRef.current = holdBook;
  const hold = React.useCallback((cx, cy) => {
    if (mode === 'personal' || typeof holdRef.current !== 'function') return false;
    const hit = hitOverlay(overlayFrameRef ? overlayFrameRef.current : null, cx, cy);
    if (!hit || hit.kind !== 'book' || !(hit.book >= 0)) return false;
    holdRef.current(hit.book);
    return true;
  }, [mode, overlayFrameRef]);
  React.useEffect(() => { handlersRef.current = { hover, tap, doubleTap, leave, snapshot, hold }; }, [hover, tap, doubleTap, leave, snapshot, hold]);

  // Timothy's notes turned off: a card or a chooser on one of their threads closes, and a hover on
  // one lets go, as the thread is no longer drawn (w4: the card and the focus stayed on a hidden
  // thread). A reader's own link stays open
  const underlayWasRef = React.useRef(showUnderlay);
  React.useEffect(() => {
    const was = underlayWasRef.current;
    underlayWasRef.current = showUnderlay;
    if (showUnderlay || !was) return;
    const onNote = (detail && detail.kind === 'underlay') || (choices && choices.some((c) => c && c.kind === 'underlay'))
      || focusRef.current.underlay;
    if (onNote) { closeCards(); return; }
    if (focusRef.current.hoverUnderlay) { dropHover(); schedule(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the switch is the trigger: what is open is read as it flips
  }, [showUnderlay]);

  /** Follow the chosen line to its far foot: the camera centres that verse in the canvas area at
   * the same zoom (bringIn; at the canon's end it stands right of centre, still in the area), the line
   * stays spotlit, and the control turns to the other end so the reader can walk it back (Corbin's
   * brief, 2026-09-11: "every line followable end to end"). */
  const followThread = React.useCallback((info) => {
    if (!camRef.current || !info || info.kind !== 'arc') return;
    const toFar = info.far === 'to';
    const verse = toFar ? info.to : info.from;
    const end = toFar ? info.b : info.a;
    // the journey records the arrival, and where it set out from (the near foot), so Back comes
    // home with this line open again (use-journey.js)
    // (a prophecy pair the OpenBible data does not hold is reopened as the pair)
    const open = info.index >= 0 ? { mode: 'connection', arc: info.index }
      : { mode: 'connection', arc: info.prophecyIndex, prophecy: true };
    if (journey) journey.push({ verse, label: end.label, open }, { verse: toFar ? info.from : info.to, label: (toFar ? info.a : info.b).label, open });
    // the camera goes there through flyTo (bringIn: out from under the panel, clamped): to the
    // foot, which stands at the verse's middle
    bringIn(verse + 0.5, { always: true });
    setDetail(Object.assign({}, info, { far: toFar ? 'from' : 'to' }));
    setAnnounce(followAnnouncement(end.label));
    schedule();
  }, [camRef, bringIn, journey, schedule, setAnnounce]);

  /**
   * Follow a listed thread (a MORE FROM or a verse-mode row) to its far end: the panel swaps to that
   * connection, the camera goes to the end the row names at the zoom it has, and the connection's
   * own Follow then names the end the reader came from (spec 4.6 "Follow").
   * @param {{ index: number, hereVerse: number, otherVerse: number }} row
   */
  const followRow = React.useCallback((row) => {
    const g = graph;
    if (!g || !row || !(row.index >= 0 && row.index < g.count)) return;
    const info = describe({ kind: 'arc', hit: { index: row.index, from: g.from[row.index], to: g.to[row.index], votes: g.votes[row.index] } });
    if (!info) return;
    const far = info.to === row.otherVerse ? 'from' : 'to';
    const here = far === 'from' ? info.a : info.b, there = far === 'from' ? info.b : info.a;
    if (journey) {
      // the arrival carries the row's own line (w4): left without one, the trail filled it from
      // what was open at the push, the previous connection (setDetail has not rendered), so Back
      // reopened the wrong line. The trail's start keeps what was open there, as it should.
      if (!journey.stack.length) journey.push({ verse: row.hereVerse, label: here.label });
      journey.push({ verse: row.otherVerse, label: there.label, open: { mode: 'connection', arc: row.index } });
    }
    focusRef.current = focusState({ arc: row.index });
    setTip(null); setChoices(null); setListOpen(false);
    setDetail(Object.assign({}, info, { far }));
    bringIn(row.otherVerse + 0.5, { always: true });
    setAnnounce(followAnnouncement(there.label));
    schedule();
  }, [graph, describe, journey, focusRef, bringIn, schedule, setAnnounce]);

  /** "Zoom to <chapter>" (the chooser's last row, Q7): the panel closes and the chapter fills about
   * 70 % of the canvas (panel-model chapterFrame). @param {number} chapterIndex */
  const zoomTo = React.useCallback((chapterIndex) => {
    const frame = graph ? chapterFrame(graph, chapterIndex) : null;
    if (!frame) return;
    setListOpen(false); setChoices(null); setDetail(null); setTip(null);
    focusRef.current = focusState();
    flyTo(frame, { insetRight: 0, insetBottom: 0, ms: FRAME_MS });
    schedule();
  }, [graph, focusRef, flyTo, schedule]);

  // what is open, in the panel's terms (panelOf); closePanel is the one close
  const panel = React.useMemo(() => panelOf(detail, choices, choiceChapter), [detail, choices, choiceChapter]);

  return {
    tip, choices, choiceChapter, choiceCut, detail, listOpen, setTip, setChoices, setDetail, setListOpen,
    handlersRef, dropHover, liftAt, listItems, commitFound, closeCards, followThread, returnTo, returnBack, dropReturn,
    followRow, zoomTo, describe,
    panel, openPanel, closePanel: closeCards, lightThreads, journey,
  };
}
