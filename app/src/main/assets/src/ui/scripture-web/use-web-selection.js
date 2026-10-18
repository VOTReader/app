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
   pushes onto it and moves the camera with flyTo (use-web-camera.js). */

import { zoomAbout } from '../../utils/scripture-web/geometry.js';
import { pickThreads, pickChapter, pickVerse, chapterRange, nearbyChapter, nearbyThreads } from '../../utils/scripture-web/pick.js';
import { maxZoomOf } from '../../utils/scripture-web/web-frame.js';
import { focusState, withLit } from '../../utils/scripture-web/focus-state.js';
import {
  describeFound, summaryOf, chooserAnnouncement, followAnnouncement, groupAnnouncement,
} from '../../utils/scripture-web/describe.js';
import { pickPersonalLinks, pickUnderlayLinks, nearestLinks, nearestUnderlay } from './rail-renderer.js';
import { hitOverlay } from './overlay-renderer.js';
import { routeOverlayHit } from './goto.jsx';

/**
 * What the panel is asked to show (CONTRACTS.md section 6). `arc` is an OpenBible arc id unless
 * `prophecy` (then an index into g.prophecy); `verse` is a graph verse id; `chapter` an index into
 * g.chapters; `letterKey` is vot-citations' key for a letter (its collection and id).
 * @typedef {{ mode: 'connection', arc: number, prophecy?: boolean }
 *   | { mode: 'verse', verse: number }
 *   | { mode: 'group', ids: ArrayLike<number>, label: string, chapter?: number }
 *   | { mode: 'letter', letterKey: string }} PanelSpec
 */
/**
 * What is open: the spec in the panel's terms and the described payload today's cards render
 * (describe.js describeFound, or for the chooser its described rows). A My Web card is a
 * connection spec with `myWeb` naming the rail list ('link' | 'underlay') `arc` indexes.
 * @typedef {{ spec: PanelSpec & { myWeb?: string }, info: any }} PanelState
 */

/**
 * The open card in the panel's terms. Pure, so the mapping is pinned without a mount.
 * @param {any} detail  the open sheet's described payload, or null
 * @param {any[] | null} choices  the chooser's described rows, or null
 * @returns {PanelState | null}
 */
export function panelOf(detail, choices) {
  if (detail) {
    const k = detail.kind;
    if (k === 'arc') return { spec: detail.index < 0 && detail.prophecyIndex >= 0 ? { mode: 'connection', arc: detail.prophecyIndex, prophecy: true } : { mode: 'connection', arc: detail.index }, info: detail };
    if (k === 'verse') return { spec: { mode: 'verse', verse: detail.verse }, info: detail };
    if (k === 'chapter') {
      return { spec: { mode: 'group', ids: [], label: detail.book ? detail.book.title + ' ' + detail.chapter : '', chapter: detail.chapterIndex }, info: detail };
    }
    if (k === 'bundle') return { spec: { mode: 'group', ids: [], label: detail.label || '' }, info: detail };
    if (k === 'link' || k === 'underlay') return { spec: { mode: 'connection', arc: detail.index, myWeb: k }, info: detail };
    return null;
  }
  if (choices && choices.length) {
    // the group's ids are OpenBible arc ids: a row for a prophecy pair that is no arc (index -1)
    // stays in the rows (info), never in the ids
    return { spec: { mode: 'group', ids: choices.map((c) => c.index).filter((i) => i >= 0), label: '' }, info: choices };
  }
  return null;
}

/**
 * @param {any} p  the graph, mode, density and showUnderlay; the resume point
 *   (the sheet that was open); the cameras' refs and callbacks and flyTo
 *   (use-web-camera.js); My Web's personalRef and railOpts; the boxes the
 *   draw wrote (elevatorRef, badgeBoxesRef, overlayFrameRef); the journey
 *   (use-journey.js); the frame loop; the live region; and My Web's relink
 *   (use-personal-web.js, optional): the chosen link found again after a rebuild
 */
export function useWebSelection({
  graph, mode, density, showUnderlay, resumeRef, camRef, viewRef, focusRef, viewFor, yFrameFor,
  personalRef, railOpts, elevatorRef, badgeBoxesRef, overlayFrameRef, flyTo, journey, schedule, setAnnounce, relink = null,
}) {
  const [detail, setDetail] = React.useState(() => (resumeRef.current && resumeRef.current.detail) || null);      // the open sheet
  // My Web's rebuild found the chosen link again (use-personal-web's relink):
  // its open card moves to the link's new index, or closes with it deleted
  // (fix-review #8)
  React.useEffect(() => {
    if (!relink) return;
    setDetail((d) => (!d || d.kind !== 'link' || !d.record || d.record.id !== relink.id ? d
      : relink.at >= 0 ? Object.assign({}, d, { index: relink.at }) : null));
  }, [relink]);
  const [choices, setChoices] = React.useState(null);    // overlapped line chooser
  const [listOpen, setListOpen] = React.useState(false); // accessible nearby list
  const [tip, setTip] = React.useState(null);            // hover chip

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
  const dropHover = React.useCallback(() => {
    if (hoverRafRef.current) { cancelAnimationFrame(hoverRafRef.current); hoverRafRef.current = 0; }
    hoverPointRef.current = null;
    focusRef.current.hover = -1;
    focusRef.current.hoverProphecy = -1;
    focusRef.current.hoverUnderlay = false;
    if (tipOnRef.current) { tipOnRef.current = false; setTip(null); }
  }, [focusRef]);

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
    return pickThreads(g, cam, view, px, py, 14 * v.DPR, 4)
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
  }, [graph, listOpen, mode, describe, showUnderlay, camRef, viewRef, density, personalRef, railOpts]);

  const commitFound = React.useCallback((found) => {
    if (!found) return;
    // the far foot is the one further from the camera: what Follow pans to
    if (found.kind === 'arc' && camRef.current) {
      const x = camRef.current.x;
      found = Object.assign({}, found, { far: Math.abs(found.to - x) >= Math.abs(found.from - x) ? 'to' : 'from' });
    }
    // a new choice: nothing hovered, nothing lit but what the choice lights
    // (a Timothy thread is chosen in its own list: focus.underlay, fix-review #4)
    focusRef.current = focusState(found.kind === 'arc' || found.kind === 'link' || found.kind === 'underlay'
      ? (found.kind === 'arc' && found.index < 0 && found.prophecyIndex >= 0 ? { arc: found.prophecyIndex, prophecy: true }
        : { arc: found.index, underlay: found.kind === 'underlay' })
      : { range: found.kind === 'chapter' || found.kind === 'bundle' ? [found.lo, found.hi]
        : found.kind === 'verse' ? [found.verse, found.verse] : null });
    setTip(null);
    setChoices(null);
    setListOpen(false);
    setDetail(found);
    setAnnounce(summaryOf(found));
    schedule();
  }, [camRef, focusRef, schedule, setAnnounce]);

  const hover = React.useCallback((cx, cy) => {
    hoverPointRef.current = { cx, cy };
    if (hoverRafRef.current) return;
    hoverRafRef.current = requestAnimationFrame(() => {
      hoverRafRef.current = 0;
      const point = hoverPointRef.current;
      if (!point) return;
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
  }, [describe, hitAt, schedule, focusRef]);

  React.useEffect(() => () => {
    if (hoverRafRef.current) cancelAnimationFrame(hoverRafRef.current);
  }, []);

  /**
   * Open the panel (CONTRACTS.md section 6). THE STUB MAPS EACH MODE ONTO TODAY'S CARDS, so it is
   * behaviour-neutral: connection opens the connection sheet; verse the verse sheet; group the
   * chooser's rows (its ids), or the chapter sheet when it names only a chapter; a letter and a
   * prophecy connection have no card yet and open nothing. The panel stream replaces the body with
   * the docked panel and keeps the signature.
   * @param {PanelSpec} spec
   * @returns {boolean} whether a panel opened
   */
  const openPanel = React.useCallback((spec) => {
    const g = graph;
    if (!g || !spec) return false;
    const arcHit = (i) => ({ kind: 'arc', hit: { index: i, from: g.from[i], to: g.to[i], votes: g.votes[i] } });
    if (spec.mode === 'connection') {
      if (spec.prophecy || !(spec.arc >= 0 && spec.arc < g.count)) return false;
      const info = describe(arcHit(spec.arc));
      if (!info) return false;
      commitFound(info);
      return true;
    }
    if (spec.mode === 'verse') {
      if (!(spec.verse >= 0 && spec.verse < g.total)) return false;
      const info = describe({ kind: 'verse', verse: spec.verse });
      if (!info) return false;
      commitFound(info);
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
        setAnnounce(chooserAnnouncement(rows.length));
        schedule();
        return true;
      }
      if (spec.chapter >= 0 && spec.chapter < g.chapters.length) {
        const info = describe({ kind: 'chapter', chapterIndex: spec.chapter });
        if (!info) return false;
        commitFound(info);
        return true;
      }
      return false;
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

  const tap = React.useCallback((cx, cy) => {
    // the elevator (landing 9): a tap on the track sets the camera's height -
    // the top of the track is the tallest apex, the bottom the baseline
    const lift = liftAt(cx, cy);
    if (lift) { lift(cy); schedule(); return; }
    // then what the overlay drew there (a book name, a chapter numeral, a "+n"
    // pill: overlay-renderer.js hitOverlay), before any line under it; the
    // navigation stream routes it (goto.jsx). Nothing records boxes yet: null.
    const overlayHit = hitOverlay(overlayFrameRef ? overlayFrameRef.current : null, cx, cy);
    if (overlayHit && routeOverlayHit(overlayHit, { graph, flyTo, openPanel, journey })) return;
    const candidates = hitCandidatesAt(cx, cy);
    const described = candidates.map(describe).filter(Boolean);
    if (!described.length) {
      focusRef.current = focusState();
      setTip(null); setChoices(null); setDetail(null); setListOpen(false); schedule(); return;
    }
    const closeEnough = candidates.length > 1 && candidates[1].distance <= 8 * viewRef.current.DPR;
    if (closeEnough && described.length > 1 && described.every((item) => item.kind === 'arc' ||
        item.kind === 'link' || item.kind === 'underlay')) {
      setChoices(described);
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
    overlayFrameRef, graph, flyTo, openPanel, journey]);

  const doubleTap = React.useCallback((cx) => {
    const cam = camRef.current, v = viewRef.current;
    zoomAbout(cam, v.W, cx * v.DPR, 2.5, maxZoomOf(graph, v), yFrameFor(cam) || undefined);
    schedule();
  }, [camRef, graph, schedule, viewRef, yFrameFor]);

  // Publish the latest handlers for the (stable) gesture listeners to call.
  React.useEffect(() => { handlersRef.current = { hover, tap, doubleTap }; }, [hover, tap, doubleTap]);

  /** Close the cards (the chooser, the Nearby list, the connection sheet) and let go of the chosen
   * line. Every close goes through here: the sheet's x once cleared the card but kept focusRef, so
   * the shader held every other thread at 5 % ink until Escape or Back (sw1 B1, 2026-10-05). */
  const closeCards = React.useCallback(() => {
    setListOpen(false); setChoices(null); setDetail(null); setTip(null);
    focusRef.current = focusState();
    schedule();
  }, [focusRef, schedule]);

  /** Follow the chosen line to its far foot: the camera centres on that
   * verse at the same zoom, the line stays spotlit, and the control turns
   * to the other end so the reader can walk it back (Corbin's brief,
   * 2026-09-11: "every line followable end to end"). */
  const followThread = React.useCallback((info) => {
    if (!camRef.current || !info || info.kind !== 'arc') return;
    const toFar = info.far === 'to';
    const verse = toFar ? info.to : info.from;
    const end = toFar ? info.b : info.a;
    // the journey records the arrival (the navigation stream's stack; a no-op today)
    if (journey) journey.push({ verse, label: end.label });
    // the camera goes there through flyTo: same zoom, clamped (instant today; the ease is nav's)
    flyTo({ x: verse });
    setDetail(Object.assign({}, info, { far: toFar ? 'from' : 'to' }));
    setAnnounce(followAnnouncement(end.label));
    schedule();
  }, [camRef, flyTo, journey, schedule, setAnnounce]);

  // A bundle's group, chosen in its sheet: the pair of ranges the shader and
  // the picker draw and spotlight (uFocusRange2). Choosing the
  // same group again lets go of it. The pointer's hover stays as it was.
  const chooseGroup = React.useCallback((info, grp) => {
    const same = focusRef.current.range2 && grp && focusRef.current.range2[0] === grp.lo && focusRef.current.range2[1] === grp.hi;
    focusRef.current = focusState({
      range: [info.lo, info.hi], range2: same || !grp ? null : [grp.lo, grp.hi], hover: focusRef.current.hover,
      hoverProphecy: focusRef.current.hoverProphecy,
    });
    setDetail(Object.assign({}, info, { chosenGroup: same || !grp ? null : grp.chapterIndex }));
    setAnnounce(groupAnnouncement(grp, same || !grp));
    schedule();
  }, [focusRef, schedule, setAnnounce]);

  // what is open, in the panel's terms (panelOf); closePanel is the one close
  const panel = React.useMemo(() => panelOf(detail, choices), [detail, choices]);

  return {
    tip, choices, detail, listOpen, setTip, setChoices, setDetail, setListOpen,
    handlersRef, dropHover, liftAt, listItems, commitFound, closeCards, followThread, chooseGroup,
    panel, openPanel, closePanel: closeCards, lightThreads, journey,
  };
}
