/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/overlay-renderer — Cluster F (bundle-d)

   The Canvas2D overlay (#ui, .sw-canvas-ui) the Scripture Web paints over
   its WebGL threads, once per frame: the scripture ruler and its book names,
   the sky's altitude ruler and elevator (landing 9), the references beside
   the lines, and the convergence pills; on My Web, the reader's links and
   the scripture rail's book names. Moved out of ScriptureWebScreen
   unchanged (F0, 2026-10-18): the same strokes, in the same order, with the
   same reserved boxes.

   Two entry points, each one clear and then the painters, as (ctx,
   frameState): paintCanonOverlay and paintMyWebOverlay. Every painter
   takes the 2D context (null when there is none, as in jsdom) and keeps its
   old early returns, so what a frame computes without a context - the
   altitude marks, the elevator's box - it still computes. The screen
   publishes the results (the data-* attributes, the tap boxes).
   ═══════════════════════════════════════════════════════════════════════ */

import { verseToX, xToVerse, arcShape, maxCamY, ALTITUDE_MARKS, spanAtHeight, lensDimFor } from '../../utils/scripture-web/geometry.js';
import { refOfVerse, visibleArcs, threadEnds } from '../../utils/scripture-web/pick.js';
import { distanceRampRGB } from '../../utils/scripture-web/palette.js';
import { placeRailLabels } from '../../utils/scripture-web/rail-labels.js';
import { drawPersonalWeb, railFrame, segmentSpan } from './rail-renderer.js';

/**
 * @typedef {object} CanonFrame
 * @property {any} g             the decoded graph
 * @property {any} cam           the canon camera
 * @property {any} view          the frame's render arguments (viewFor(): base, squash, localize, ...)
 * @property {{W:number, H:number, DPR:number}} v  the view size, device px
 * @property {any} chrome        the chrome tokens (readChromeTokens)
 * @property {number} canvasH    the overlay canvas's own height, the clear's
 * @property {number} inset      where the sky starts under the top chrome, device px (0: hidden)
 * @property {any} yFrame        the camera's y frame (yFrameFor), or null
 * @property {string} density
 * @property {number} focusArc   the chosen OpenBible thread, or -1 (view.focusArc: a chosen prophecy
 *                               pair is view.focusProphecy; the rest of the focus is on view too)
 * @property {any} bundles       the convergence pills' counts (bundlesFor)
 * @property {[number, number]|null} lens  the lit chapter's verse range, or null
 * @property {number} lensDim
 * @property {import('../../utils/scripture-web/web-frame.js').CentreChapter|null} [centre]
 *                               the centre chapter (web-frame.centreOf, GL-computed): the overlay
 *                               paints its wash and gold numeral at centre.t and dims nothing
 * @property {{right:number, bottom:number}} [panelInset]  CSS px the open panel covers at the
 *                               right edge (docked) or the bottom (the sheet under 560 px); labels,
 *                               chips and pills keep out of it
 * @property {OverlayBox[]} [hits]  what the last paint made tappable; the draw copies
 *                               paintCanonOverlay's result here so hitOverlay can read it
 */

/**
 * @typedef {{ kind: 'book', book: number }
 *   | { kind: 'chapter', book: number, chapter: number }
 *   | { kind: 'pill', ids: ArrayLike<number>, label: string }} OverlayHit
 *   book: an index into g.books; chapter: its number (1-based); ids: the OpenBible
 *   arc ids a "+n" pill counts, label: what the panel's group mode is titled
 */
/** @typedef {{ x0:number, y0:number, x1:number, y1:number, hit: OverlayHit }} OverlayBox  device px */

/**
 * What the overlay drew under a CSS-px point, for the tap path: the tap tries it
 * after the elevator's track and before the badges and the threads, so a book
 * name, a chapter numeral or a pill is never read as the line beneath it.
 * The canvas stream records the boxes (paintCanonOverlay's `hits`) as it
 * paints and owns this lookup; the navigation stream routes the result
 * (goto.jsx routeOverlayHit). The box painted last is on top. Until a painter
 * records one, this is always null: today's taps.
 * @param {CanonFrame|null} fs  the last painted frame (useWebRenderer's overlayFrameRef)
 * @param {number} xCss @param {number} yCss
 * @returns {OverlayHit|null}
 */
export function hitOverlay(fs, xCss, yCss) {
  const hits = fs && fs.hits;
  if (!hits || !hits.length) return null;
  const dpr = (fs.v && fs.v.DPR) || 1;
  const px = xCss * dpr, py = yCss * dpr;
  for (let i = hits.length - 1; i >= 0; i--) {
    const b = hits[i];
    if (px >= b.x0 && px <= b.x1 && py >= b.y0 && py <= b.y1) return b.hit;
  }
  return null;
}

/**
 * The canon web's overlay for one frame. One clear, then the ruler, the
 * altitude ruler, the elevator, the references beside the lines and the
 * pills, each keeping off the boxes the ones before it reserved. The book
 * rail is drawn whether or not the chrome is hidden: the hide button takes
 * the pills and the counter, and the books along the bottom are how the
 * reader knows where in scripture the web is (Corbin, 2026-09-11: "keep the
 * web legend (the books at the bottom, etc)"). It used to be cleared as
 * "chrome too".
 * @param {CanvasRenderingContext2D|null} ctx
 * @param {CanonFrame} fs
 * @returns {{marks:number[], altitudeSpan:number, elevator:any, labels:number, badges:any[], hits:OverlayBox[]}}
 */
export function paintCanonOverlay(ctx, fs) {
  const { g, cam, view, v, chrome, inset } = fs;
  if (ctx) ctx.clearRect(0, 0, v.W, fs.canvasH);
  const numerals = drawRuler(ctx, g, cam, view, v, chrome);
  // the labels and badges keep off the ruler's chapter numerals (the hub,
  // 2026-09-21: "106" over "Ps 104:10")
  const reserved = numerals.slice();
  // the sky's chrome (landing 9): the altitude ruler on the left, only
  // above the baseline, and the elevator on the right, once there is a sky
  // to climb. Both reserve their boxes first, so the thread labels keep off.
  const altitude = { span: 0 };
  const marks = drawAltitude(ctx, g, cam, Object.assign({}, view, { inset, reserved }), v, chrome, altitude);
  const elevator = drawElevator(ctx, cam, Object.assign({}, view, { inset, reserved, total: g.total }), v, chrome, fs.yFrame);
  const labels = drawThreadRefs(ctx, g, cam, Object.assign({}, view, { inset, reserved }), v, chrome, fs.density, fs.focusArc);
  const badges = drawBundleBadges(ctx, g, cam, Object.assign({}, view, { inset, reserved, lens: fs.lens, lensDim: fs.lensDim }), v, chrome, fs.bundles);
  // the boxes a tap can land on (hitOverlay), device px; no painter records one yet
  /** @type {OverlayBox[]} */
  const hits = [];
  return { marks, altitudeSpan: altitude.span, elevator, labels, badges, hits };
}

/**
 * My Web's overlay for one frame: one clear, the reader's links over the
 * Volumes and scripture rails (rail-renderer.js), then the scripture rail's
 * book names. The rail stays under the hidden chrome: it is the legend of
 * the web, not a control (Corbin, 2026-09-11).
 * @param {CanvasRenderingContext2D|null} ctx
 * @param {{personal:any, rail:any, g:any, cam:any, view:any, v:{W:number, H:number, DPR:number}, chrome:any}} fs
 */
export function paintMyWebOverlay(ctx, fs) {
  if (!ctx) return;
  const { personal: p, v } = fs;
  ctx.clearRect(0, 0, v.W, v.H);
  drawPersonalWeb(ctx, p && p.graph, p && p.underlay, fs.rail);
  drawRulerOnly(ctx, fs.g, fs.cam, fs.view, v, fs.chrome);
}

/* ── the ruler ─────────────────────────────────────────────────────────────
   Books always; chapter numerals once a chapter is wide enough to hold one;
   verse ticks and numerals past that. The chapter histogram hangs BELOW the
   baseline, its depth proportional to verse count — Psalm 119 reaching
   furthest down, exactly as in the visualization this descends from.
   It no longer clears: the frame's one clear is paintCanonOverlay's. */
function drawRuler(ctx, g, cam, view, v, chrome) {
  /** the chapter numerals' boxes, device px: the label pass keeps off them */
  const numerals = [];
  if (!ctx) return numerals;
  const W = v.W, DPR = v.DPR, base = view.base;
  const ink = '235,231,222';
  const gold = '232,192,80';
  const X = (verse) => verseToX(cam, W, verse);

  if (cam.ppv < 8 * DPR) {
    for (let i = 0; i < g.chapters.length; i++) {
      const c = g.chapters[i];
      const x = X(c[2]), x2 = X(c[2] + c[3]);
      if (x2 < -4 || x > W + 4) continue;
      ctx.fillStyle = 'rgba(' + ink + ',' + (c[0] < 39 ? 0.5 : 0.78) + ')';
      // the bar's HEIGHT is the chapter's length; its width only marks where the chapter starts.
      // 0.8 of the chapter's width turned a long chapter into a grey block once zoomed (sw1).
      ctx.fillRect(x, base + 2 * DPR, Math.min(Math.max((x2 - x) * 0.8, 0.7 * DPR), 3 * DPR), 2 * DPR + c[3] * 0.22 * DPR);
    }
  } else {
    const v0 = Math.max(0, Math.floor(xToVerse(cam, W, -10)));
    const v1 = Math.min(g.total - 1, Math.ceil(xToVerse(cam, W, W + 10)));
    ctx.fillStyle = 'rgba(' + ink + ',0.6)';
    for (let verse = v0; verse <= v1; verse++) {
      ctx.fillRect(X(verse) - 0.75 * DPR, base + 2 * DPR, 1.5 * DPR, 9 * DPR);
    }
    if (cam.ppv > 30 * DPR) {
      ctx.font = chrome.fsRuler * DPR + 'px Georgia,serif';
      ctx.fillStyle = 'rgba(' + ink + ',0.62)';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let verse = v0; verse <= v1; verse++) {
        ctx.fillText(String(refOfVerse(g, verse).verse), X(verse) + cam.ppv / 2, base + 14 * DPR);
      }
    }
  }

  ctx.strokeStyle = 'rgba(' + gold + ',0.30)';
  ctx.lineWidth = DPR;
  ctx.beginPath(); ctx.moveTo(0, base + 1.5 * DPR); ctx.lineTo(W, base + 1.5 * DPR); ctx.stroke();

  // chapter numerals from the middle zoom band up, each centred on the part
  // of its chapter the frame holds: at close zoom one chapter is wider than
  // the frame, and a foot's reference is book + chapter + verse, so the
  // chapter must stay in view with the verse numerals (it used to stop at
  // 30 px/verse, leaving "GENESIS ... 552" with no chapter to read).
  if (cam.ppv > 2.4 * DPR) {
    ctx.font = chrome.fsRuler * DPR + 'px Georgia,serif';
    ctx.fillStyle = 'rgba(' + ink + ',0.55)';
    ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    for (const c of g.chapters) {
      const x0 = Math.max(X(c[2]), 0), x1 = Math.min(X(c[2] + c[3]), W);
      if (x1 - x0 < 22 * DPR) continue;
      const text = String(c[1]);
      ctx.fillText(text, (x0 + x1) / 2, base - 6 * DPR);
      // the numeral's box, for the label pass to keep off (the chapter
      // numeral sits on the baseline where a foot label lands)
      const w = ctx.measureText(text).width, cx = (x0 + x1) / 2;
      numerals.push({ x0: cx - w / 2, x1: cx + w / 2, y0: base - 6 * DPR - chrome.fsRuler * DPR, y1: base - 6 * DPR });
    }
  }

  // book names + separators
  drawBookNames(ctx, g, X, W, DPR, base, chrome, ink, gold);
  return numerals;
}

/**
 * The altitude ruler (landing 9): only while the camera is above the
 * baseline. Each mark stands where a thread of that span would crown -
 * y = base + camY - arcShape(span * ppv / 2, squash).A - in the canon
 * ramp's colour for that span, so the height reads in the web's own key: a
 * chapter, a book, a testament, the canon. The marks in view are returned
 * (and published as data-altitude) whether or not there is a 2D context;
 * the labels reserve their boxes so the thread labels keep off them.
 *
 * The named marks are a chapter, a book, a testament and the canon - a
 * factor of 30 apart, so most heights have none in view (at the ceiling
 * a chapter crowns 422 px up; a book 14,000). The frame's middle row
 * therefore always carries a live readout of its own span ("~150
 * verses"), published as data-altitude-span, so the height is never
 * nameless.
 * @returns {number[]} the marks' spans in view, bottom to top
 */
function drawAltitude(ctx, g, cam, view, v, chrome, out) {
  const shown = [];
  const camY = cam.y > 0 ? cam.y : 0;
  if (out) out.span = 0;
  if (!(camY > 0) || !g || !(g.total > 0)) return shown;
  const DPR = v.DPR, base = view.base, top = view.inset > 0 ? view.inset : 0;
  const fs = chrome.fsRuler * DPR;
  if (ctx) {
    ctx.save();
    ctx.font = fs + 'px Georgia,serif';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'left';
    ctx.lineWidth = DPR;
  }
  const marksY = [];
  for (const m of ALTITUDE_MARKS) {
    const y = base + camY - arcShape((m.span * cam.ppv) / 2, view.squash).A;
    if (y < top + fs || y > base - fs) continue;
    shown.push(m.span);
    if (!ctx) continue;
    const rgb = distanceRampRGB(Math.pow(m.span / g.total, 0.40)).join(',');
    const text = m.span.toLocaleString('en-US') + ' · ' + m.name;
    ctx.strokeStyle = 'rgba(' + rgb + ',0.85)';
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(14 * DPR, y); ctx.stroke();
    const w = ctx.measureText(text).width;
    const box = { x0: 18 * DPR, x1: 18 * DPR + w, y0: y - fs * 0.7, y1: y + fs * 0.7 };
    ctx.lineWidth = 3 * DPR;
    ctx.strokeStyle = chrome.bg;
    ctx.strokeText(text, box.x0, y);
    ctx.lineWidth = DPR;
    ctx.fillStyle = 'rgba(' + rgb + ',0.95)';
    ctx.fillText(text, box.x0, y);
    if (view.reserved) view.reserved.push(box);
    marksY.push(y);
  }
  // the live readout at the frame's middle row
  const yMid = (top + base) / 2;
  const span = spanAtHeight(base + camY - yMid, cam.ppv, view.squash);
  if (span >= 1 && out) out.span = Math.round(span);
  if (ctx && span >= 1 && !marksY.some((y) => Math.abs(y - yMid) < fs * 1.6)) {
    const rgb = distanceRampRGB(Math.pow(Math.min(span, g.total) / g.total, 0.40)).join(',');
    const text = '~' + Math.round(span).toLocaleString('en-US') + ' verses';
    ctx.strokeStyle = 'rgba(' + rgb + ',0.6)';
    ctx.beginPath(); ctx.moveTo(0, yMid); ctx.lineTo(8 * DPR, yMid); ctx.stroke();
    const w = ctx.measureText(text).width;
    const box = { x0: 12 * DPR, x1: 12 * DPR + w, y0: yMid - fs * 0.7, y1: yMid + fs * 0.7 };
    ctx.lineWidth = 3 * DPR;
    ctx.strokeStyle = chrome.bg;
    ctx.strokeText(text, box.x0, yMid);
    ctx.lineWidth = DPR;
    ctx.fillStyle = 'rgba(' + rgb + ',0.8)';
    ctx.fillText(text, box.x0, yMid);
    if (view.reserved) view.reserved.push(box);
  }
  if (ctx) ctx.restore();
  return shown;
}

/** The elevator's tap zone, CSS px in from the right edge. */
const ELEVATOR_ZONE_CSS = 24;

/**
 * The elevator (landing 9): a thin track down the right edge from the top
 * chrome to the baseline, its thumb at camY / maxCamY - the top is the
 * tallest apex, the bottom the baseline. Drawn only on the canon web once
 * there is a sky to climb (maxCamY > 0: past the overview). Returns the
 * track's tap box (the right ELEVATOR_ZONE_CSS px), the height its top
 * stands for and the thumb's fraction, or null; the tap callback reads it.
 * @returns {{x0:number, x1:number, y0:number, y1:number, maxY:number, at:number}|null}
 */
function drawElevator(ctx, cam, view, v, chrome, yf) {
  if (!yf) return null;
  const maxY = maxCamY(cam, yf);
  if (!(maxY > 0)) return null;
  const DPR = v.DPR, W = v.W, base = view.base, top = view.inset > 0 ? view.inset : 0;
  const y0 = top + 8 * DPR, y1 = base - 8 * DPR;
  if (!(y1 > y0)) return null;
  const camY = cam.y > 0 ? cam.y : 0;
  const at = Math.min(1, camY / maxY);
  const box = { x0: W - ELEVATOR_ZONE_CSS * DPR, x1: W, y0, y1, maxY, at };
  if (view.reserved) view.reserved.push({ x0: box.x0, x1: box.x1, y0, y1 });
  if (!ctx) return box;
  const ink = '235,231,222';
  const gold = '232,192,80';
  const x = W - 10 * DPR;
  ctx.save();
  ctx.lineWidth = 1.5 * DPR;
  ctx.strokeStyle = 'rgba(' + ink + ',0.28)';
  ctx.beginPath(); ctx.moveTo(x, y0); ctx.lineTo(x, y1); ctx.stroke();
  // the altitude marks on the track, in the ramp's colour: where a chapter,
  // a book, a testament and the canon crown, so the reader knows how far
  // up each lies before going there (g.total for the ramp's scale)
  if (view.total > 0) {
    for (const m of ALTITUDE_MARKS) {
      const f = arcShape((m.span * cam.ppv) / 2, view.squash).A / maxY;
      if (!(f > 0.005) || f > 1) continue;
      const my = y1 - f * (y1 - y0);
      ctx.strokeStyle = 'rgba(' + distanceRampRGB(Math.pow(m.span / view.total, 0.40)).join(',') + ',0.9)';
      ctx.beginPath(); ctx.moveTo(x - 5 * DPR, my); ctx.lineTo(x + 5 * DPR, my); ctx.stroke();
    }
  }
  // the thumb: a short rounded bar, gold once the reader has left the baseline
  const th = 18 * DPR, tw = 6 * DPR, cy = y1 - at * (y1 - y0);
  const ty0 = Math.max(y0, Math.min(y1 - th, cy - th / 2)), r = tw / 2;
  ctx.beginPath();
  ctx.moveTo(x - r, ty0 + r); ctx.arc(x, ty0 + r, r, Math.PI, 0);
  ctx.lineTo(x + r, ty0 + th - r); ctx.arc(x, ty0 + th - r, r, 0, Math.PI); ctx.closePath();
  ctx.fillStyle = 'rgba(' + (camY > 0 ? gold : ink) + ',' + (camY > 0 ? 0.95 : 0.6) + ')';
  ctx.fill();
  ctx.restore();
  return box;
}

/* ── the convergence pills ──────────────────────────────────────────────
   Every thread is drawn (the structure law); what converges is counted
   where it lands. At each in-view foot cell (pick.footBundles: a verse at
   depth, a chapter or a run of narrow chapters otherwise) a "+n" pill under
   the baseline says how many anchored threads have a foot there; tapping it
   opens the bundle by target chapter, and a chosen chapter's threads are
   spotlit. The counts are cached while the camera moves less than a few
   percent; the pills' x follow the camera every frame. */
const BADGE_FONT_CSS = 11;
const fmtCount = (n) => (n >= 10000 ? Math.round(n / 1000) + 'k' : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n));

function drawBundleBadges(ctx, g, cam, view, v, chrome, bundles) {
  const boxes = [];
  if (!ctx || !g || !g.count || !bundles) return boxes;
  const taken = view.reserved ? view.reserved.slice() : [];
  const DPR = v.DPR, W = v.W;
  const fs = BADGE_FONT_CSS * DPR;
  const camY = cam.y > 0 ? cam.y : 0;
  const baseY = view.base + camY;
  const ink = '235,231,222';
  const gold = '232,192,80';
  ctx.save();
  ctx.font = '600 ' + fs + 'px Georgia,serif';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  const half = W / 2, camX = cam.x, ppv = cam.ppv;
  const pill = (text, cx, cy, strong, dim = 1) => {
    const w = ctx.measureText(text).width + fs * 0.9, h = fs * 1.35;
    const box = { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 };
    if (box.x1 < 0 || box.x0 > W) return null;
    for (const b of boxes.concat(taken)) {
      if (box.x0 < b.x1 + 3 * DPR && box.x1 > b.x0 - 3 * DPR && box.y0 < b.y1 && box.y1 > b.y0) return null;
    }
    const r = h / 2;
    ctx.beginPath();
    ctx.moveTo(box.x0 + r, box.y0); ctx.lineTo(box.x1 - r, box.y0); ctx.arc(box.x1 - r, cy, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(box.x0 + r, box.y1); ctx.arc(box.x0 + r, cy, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
    ctx.fillStyle = 'rgba(14,12,10,0.88)';
    ctx.fill();
    ctx.lineWidth = 1 * DPR;
    ctx.strokeStyle = 'rgba(' + gold + ',' + ((strong ? 0.9 : 0.55) * dim).toFixed(3) + ')';
    ctx.stroke();
    ctx.fillStyle = 'rgba(' + (strong ? gold : ink) + ',' + (0.95 * dim).toFixed(3) + ')';
    ctx.fillText(text, cx, cy + fs * 0.05);
    return box;
  };
  // the pills: under the baseline's feet, above the ruler's numerals, how
  // many threads converge on each cell - Corbin (2026-09-21 21:21): "a count
  // for how many lines are converging on a single spot". Past the overview
  // only (6x, localize > 0, where a foot cell is a chapter or a verse), and
  // only where two or more meet. Information, never grouping: every thread
  // counted is drawn. Lens-dimmed like the threads (landing 11): the cells
  // outside the chapter under the centre keep LENS_CONTEXT of their ink.
  const cy = baseY + fs * 0.95;
  for (const cell of bundles.cells) {
    const n = view.localize > 0 ? cell.drawn + cell.hidden : 0;
    if (!(n > 1)) continue;
    const cx = ((cell.lo + cell.hi + 1) / 2 - camX) * ppv + half;
    const wCell = (cell.hi - cell.lo + 1) * ppv;
    const text = fmtCount(n);
    if (ctx.measureText(text).width + fs * 0.9 > wCell + 2 * DPR) continue;   // a pill wider than its cell lies
    const box = pill(text, cx, cy, false, lensDimFor(cell.lo, cell.hi, view.lens || null, view.lensDim));
    if (box) boxes.push(Object.assign(box, { cell }));
  }
  ctx.restore();
  return boxes;
}

/* ── the references beside the lines ────────────────────────────────────
   Corbin's brief (2026-09-11): "when zoomed close, each line shows its source
   and target beside it — the verse refs at the two feet, or at the body when
   the feet are off-screen." A foot the frame holds is read off the ruler
   (book, chapter, verse numeral under its tick); a foot the frame does not
   hold has its reference written ON the body at the body's nearest on-screen
   point to it (pick.threadEnds), along the tangent, with an arrow toward the
   foot. Zoomed close means the ruler's verse-numeral band (VERSE_LABELS_PPV);
   the chosen line is labelled at every zoom, its feet marked on the baseline,
   so a tapped line is followable from either end (item b).
   A label runs along the tangent while the line is shallower than 45 deg and
   stands level beside a steep one (a near-vertical label is not readable).
   Crowding: a label whose box meets one already written is skipped, the
   chosen line's first — density handling only as far as it is free. */
const VERSE_LABELS_PPV = 30;   // CSS px per verse: where the ruler numbers verses
const LABEL_PASS_LIMIT = 400;  // drawn threads walked per frame at most

function drawThreadRefs(ctx, g, cam, view, v, chrome, density, focusArc) {
  if (!ctx || !g || !g.count) return 0;
  const DPR = v.DPR;
  const close = cam.ppv >= VERSE_LABELS_PPV * DPR;
  if (!close && focusArc < 0) return 0;
  const ink = '235,231,222';
  const gold = '232,192,80';
  const fs = chrome.fsRuler * DPR;
  // boxes already taken (the ruler's numerals), so a label is never written over them
  const placed = view.reserved ? view.reserved.slice() : [];
  let drawn = 0;
  const camY = cam.y > 0 ? cam.y : 0;
  const skyTop = view.inset > 0 ? view.inset : 0;
  ctx.font = fs + 'px Georgia,serif';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  const label = (index, chosen) => {
    const ends = threadEnds(g, cam, view, index);
    for (const side of ['from', 'to']) {
      const e = ends[side];
      if (chosen && e.onScreen) {
        // the foot, marked on the baseline the line stands on
        ctx.fillStyle = 'rgba(' + gold + ',0.95)';
        ctx.beginPath(); ctx.arc(e.x, view.base + camY, 4 * DPR, 0, Math.PI * 2); ctx.fill();
        continue;
      }
      if (!e.at) continue;
      const { x, y, angle } = e.at;
      const ref = refOfVerse(g, e.verse);
      const text = side === 'from'
        ? '\u2190 ' + ref.abbr + ' ' + ref.chapter + ':' + ref.verse
        : ref.abbr + ' ' + ref.chapter + ':' + ref.verse + ' \u2192';
      const w = ctx.measureText(text).width;
      const dir = side === 'from' ? 1 : -1;      // the text runs away from the foot
      const steep = Math.abs(angle) > Math.PI / 4;
      const rot = steep ? 0 : angle;
      // the text's centre: along the (level or tangent) line from the anchor,
      // and off it — above a shallow line, just under a steep one's crossing
      const along = 4 * DPR + w / 2;
      const off = steep ? fs * 0.9 : -fs * 0.7;
      const cx = x + Math.cos(rot) * along * dir - Math.sin(rot) * off;
      const cy = y + Math.sin(rot) * along * dir + Math.cos(rot) * off;
      const hw = (Math.abs(Math.cos(rot)) * w + Math.abs(Math.sin(rot)) * fs) / 2;
      const hh = (Math.abs(Math.sin(rot)) * w + Math.abs(Math.cos(rot)) * fs) / 2;
      const box = { x0: cx - hw, x1: cx + hw, y0: cy - hh, y1: cy + hh };
      // clear of the header by 8 px: a label tucked under it ran into the control pills (sw1)
      if (box.y0 < skyTop + 8 * DPR || box.y1 > view.base + fs) continue;
      // a gap between neighbours, or two labels on one line read as one
      const m = 6 * DPR;
      if (!chosen && placed.some((q) => box.x0 < q.x1 + m && box.x1 > q.x0 - m && box.y0 < q.y1 + m && box.y1 > q.y0 - m)) continue;
      placed.push(box);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.textAlign = 'center';
      ctx.lineWidth = 3 * DPR;
      ctx.strokeStyle = chrome.bg;
      ctx.strokeText(text, 0, 0);
      ctx.fillStyle = 'rgba(' + (chosen ? gold : ink) + ',' + (chosen ? 1 : 0.8) + ')';
      ctx.fillText(text, 0, 0);
      ctx.restore();
      drawn++;
    }
  };
  if (focusArc >= 0 && focusArc < g.count) label(focusArc, true);
  if (close) {
    for (const i of visibleArcs(g, cam, view, LABEL_PASS_LIMIT)) {
      if (i !== focusArc) label(i, false);
    }
  }
  return drawn;
}

/**
 * r2: what the rails show, published for the browser walk (data-rails on the
 * root): every visible Volumes band and every visible Bible book with its
 * on-screen span in CSS px, and where the two rails sit. A walk that zooms
 * the top rail to Rebuke and the bottom to Isaiah reads this to know the
 * zoom took before it reads a pixel.
 */
export function publishRails(ro, p, g, cam, camV, v) {
  const el = /** @type {HTMLElement|null} */ (ro && ro.width ? document.querySelector('.sw-root') : null);
  if (!el || !g) return;
  const rails = railFrame({ H: v.H, DPR: v.DPR }, ro.base);
  const top = [];
  if (p && p.votRail && p.votRail.segments) {
    for (const seg of p.votRail.segments) {
      if (!seg.count) continue;
      const span = segmentSpan(seg, ro);
      if (span) top.push({ label: (seg.short || seg.label), x0: +(span.x0 / v.DPR).toFixed(1), x1: +(span.x1 / v.DPR).toFixed(1) });
    }
  }
  const bottom = [];
  const span = [];
  for (const c of g.chapters) {
    if (!span[c[0]]) span[c[0]] = [c[2], c[2] + c[3]];
    span[c[0]][1] = c[2] + c[3];
  }
  for (let bi = 0; bi < span.length; bi++) {
    const x0 = verseToX(cam, v.W, span[bi][0]), x1 = verseToX(cam, v.W, span[bi][1]);
    if (x1 < 0 || x0 > v.W) continue;
    bottom.push({ label: g.books[bi].title, x0: +(x0 / v.DPR).toFixed(1), x1: +(x1 / v.DPR).toFixed(1) });
  }
  el.setAttribute('data-rails', JSON.stringify({
    topY: +(rails.topY / v.DPR).toFixed(1), bottomY: +(rails.bottomY / v.DPR).toFixed(1),
    top, bottom, camV: camV ? { x: camV.x, ppv: camV.ppv, total: camV.total } : null, cam: { x: cam.x, ppv: cam.ppv, total: cam.total },
  }));
  el.style.setProperty('--sw-rail-top', (rails.topY / v.DPR).toFixed(0) + 'px');
  el.style.setProperty('--sw-rail-bottom', (rails.bottomY / v.DPR).toFixed(0) + 'px');
}

/**
 * The books along the scripture rail — the tick, then the name where it can
 * be read: the full title when it fits the book's span, else the abbreviation
 * when that is under twice the span, else nothing. Rows come from the ONE
 * placement law both rails share (rail-labels.js): the top row first, the
 * second when the top's last name would be nearer than 5 px, no row when
 * neither has room. Shared by drawRuler (the canon) and drawRulerOnly (My
 * Web), which each carried a copy of this before.
 */
function drawBookNames(ctx, g, X, W, DPR, base, chrome, ink, gold) {
  const span = [];
  for (const c of g.chapters) {
    if (!span[c[0]]) span[c[0]] = [c[2], c[2] + c[3]];
    span[c[0]][1] = c[2] + c[3];
  }
  ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const fullFont = '600 ' + (chrome.fsLabel * DPR) + 'px Cinzel,Georgia,serif';
  const abbrFont = (chrome.fsRuler * DPR) + 'px Cinzel,Georgia,serif';
  const names = [];
  for (let bi = 0; bi < span.length; bi++) {
    const x0 = X(span[bi][0]), x1 = X(span[bi][1]);
    if (x1 < -90 || x0 > W + 90) continue;
    ctx.strokeStyle = 'rgba(' + gold + ',0.22)';
    ctx.beginPath(); ctx.moveTo(x0, base + 2 * DPR); ctx.lineTo(x0, base + 9 * DPR); ctx.stroke();
    const width = x1 - x0;
    // MEASURE before printing. A label wider than its book's own span (or its
    // share of a staggered row) collides with its neighbour into mush — very
    // visible on a phone, where Matthew/Luke/Acts sit within a few px of each
    // other. Full name if it fits, else the abbreviation, else nothing.
    const full = g.books[bi].title.toUpperCase();
    const abbr = g.books[bi].abbr.toUpperCase();
    ctx.font = fullFont;
    let label = null;
    if (ctx.measureText(full).width <= width - 8 * DPR) {
      label = full;
    } else {
      ctx.font = abbrFont;
      // Staggering onto a second row buys a book roughly twice its own width
      // before it can touch the neighbour printed on the same row.
      if (ctx.measureText(abbr).width <= width * 2) label = abbr;
    }
    if (!label) continue;
    ctx.font = label === full ? fullFont : abbrFont;
    const w = ctx.measureText(label).width;
    const cx = Math.max(Math.min((x0 + x1) / 2, W - 30 * DPR), 30 * DPR);
    names.push({ label, font: ctx.font, cx, left: cx - w / 2, right: cx + w / 2 });
  }
  const rows = placeRailLabels(names, 5 * DPR);
  names.forEach((n, i) => {
    if (rows[i] < 0) return;
    ctx.font = n.font;
    ctx.fillStyle = 'rgba(' + ink + ',' + (rows[i] ? 0.62 : 0.86) + ')';
    ctx.fillText(n.label, n.cx, base + (rows[i] ? 48 : 34) * DPR);
  });
}

/**
 * The scripture rail's ruler, reused under the personal web so the bottom
 * axis reads identically in both modes.
 */
function drawRulerOnly(ctx, g, cam, view, v, chrome) {
  const W = v.W, DPR = v.DPR, base = view.base;
  const ink = '235,231,222';
  const gold = '232,192,80';
  const X = (verse) => verseToX(cam, W, verse);
  drawBookNames(ctx, g, X, W, DPR, base, chrome, ink, gold);
}
