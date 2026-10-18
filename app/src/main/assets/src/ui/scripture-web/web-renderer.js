/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/web-renderer — Cluster F (bundle-d since lz1; lazy bundle-f before)

   The GPU side of The Scripture Web.

   Every cross-reference is one instance of a triangle-strip ribbon. The
   vertex shader turns (from, to) into a half-ellipse in screen space and
   offsets each vertex along the curve normal to give the stroke width, so a
   whole canon of arcs is a handful of draw calls and no per-frame CPU
   geometry. The fragment shader does nothing but antialias the edge.

   What makes it fast enough for a mid-range phone (E1):
     · The frame's VISIBLE SET (utils/scripture-web/frame-set.js): one pass
       per camera finds every thread whose body touches the frame, x window
       and heights both, and the segments its own piece on screen needs
       (chord error under geometry.TESS_TOL_CSS at every zoom). The picker,
       the labels and the pills read the same set, so what is drawn is what
       is counted, labelled and pickable.
     · The threads live in two textures, once (their feet and fans, their
       votes); a frame sends only the set's ids, uploaded when the set
       changes, and draws them in rank order (the blend is premultiplied
       over, so the order is the picture) as a few runs, one draw each, each
       thread with at least the segments it asked for. Nothing off the frame
       runs.
     · During a gesture on a dense screen the backing shrinks to
       GESTURE_DPR device px per CSS px (E2) and the frame after the gesture
       redraws it whole; the geometry stays in full-resolution px (uPx).

   Over it a TOP PASS draws the prophecy class (every g.prophecy pair, always
   on) and redraws the few threads the reader has asked about (the lit, the
   hovered, the chosen: utils/scripture-web/frame-set.js) in
   the ink table's gold (sw-ink.js), a core under a soft halo, each
   tessellated for its own visible piece (geometry.topSegmentsFor), culled
   by the main pass's own test and drawn in runs by segment class
   (frame-set.topDraws), so the
   chosen line shows no facet at any zoom and is never drawn under another
   (digest C1, C3, item 10). While a line is chosen the rest of the web
   recedes to TAP_CONTEXT, eased (uTapFade), the prophecy class with it but
   for the pairs the chosen range keeps lit, by the main pass's own law; a
   hover dims nothing.

   Neither the height law (the structure law: every thread the half-ellipse
   of its own span, every thread drawn at every zoom), the frame's piece of
   it nor the fly-over leg is written here. All three are imported from
   utils/scripture-web/geometry.js as GLSL and inlined, because the CPU
   (the visible set, the hit test) applies the same laws — if either drifts,
   arcs stop being tappable where they look tappable, or start being tappable
   where nothing is drawn. Tests assert this shader contains them.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  arcShapeGLSL, arcFrameGLSL, flyOverGLSL, CLIP_MARGIN, glslFloat, frameHeights,
  STROKE_MIN_CSS, STROKE_DEEP_CSS, skyLocalize,
} from '../../utils/scripture-web/geometry.js';
import {
  CENTRE_BRIGHT, CENTRE_WIDTH, FLYOVER_LEG_WIDTH, TAP_CONTEXT, rgba01, inkWidth,
} from '../../utils/scripture-web/sw-ink.js';
import { topSet, topDraws, isCompact, frameSetAt, TOP_ORDER } from '../../utils/scripture-web/frame-set.js';
import { rampGLSL, cssColorToRGB } from '../../utils/scripture-web/palette.js';
import { fansOf } from '../../utils/scripture-web/decode.js';

/** Density steps, in the order the control cycles them. */
export const DENSITY_STEPS = ['essential', 'famous'];

/** Texels per row of the thread textures; the vertex stage's `i & 1023, i >> 10` is this. */
export const ARC_TEX_W = 1024;

/** E2: the most device px per CSS px the GL backing keeps while the camera moves. */
export const GESTURE_DPR = 2;

/**
 * The backing's share of the full-resolution frame (E2): 1 at rest, and during a
 * gesture on a screen denser than GESTURE_DPR, that density's share of it.
 * @param {number} dpr  device px per CSS px
 * @param {boolean} moving  the camera is in a gesture
 */
export function backingScale(dpr, moving) {
  return moving && dpr > GESTURE_DPR ? GESTURE_DPR / dpr : 1;
}

/**
 * One side of the GL backing, backing px, for a full-resolution side and backingScale:
 * the size the screen gives the canvas and the viewport the renderer draws into.
 * @param {number} n  full-resolution device px
 * @param {number} [scale]
 */
export function backingSize(n, scale) {
  const s = scale > 0 && scale < 1 ? scale : 1;
  const b = Math.round(n * s);
  return b > 1 ? b : 1;
}

const VERT = `#version 300 es
precision highp float;
precision highp int;
uniform highp sampler2D uArcs;   // per thread: (from, to, fanA, fanB), ARC_TEX_W texels a row
uniform highp sampler2D uVotes;  // per thread: its votes
uniform vec2  uRes;          // the frame, full-resolution device px (the backing may be smaller: uPx)
uniform float uCamXHi, uCamXLo;  // the camera's x, split: hi = floor(x), lo = x - hi (float32 at the ceiling)
uniform float uPPV, uBase, uSquash;
uniform float uFlyLocalize;  // the fly-over leg's localize: the zoom's, let go as the camera rises (geometry.skyLocalize)
uniform float uCamY;         // the picture's shift down the frame, device px
uniform vec2  uFrameH;       // the heights a body must reach to be in the frame (geometry.frameHeights)
uniform float uPx;           // full-resolution px per backing px: 1 at rest, more in a gesture (E2)
uniform float uWidth, uAlpha, uTotal;
uniform float uSegments;     // this run's segment count: the most any thread in it asked for
uniform float uVoteMix;      // 0 = votes drive alpha (overview), 1 = width (depth)
uniform vec2  uFocusRange;   // verse range kept lit (lo > hi = no focus)
uniform vec2  uFocusRange2;  // with uFocusRange: a GROUP, one foot in each, lit AND drawn
uniform float uFocusArc;     // the chosen thread: kept at full ink while the rest recedes
uniform float uTapFade;      // 0..1: how far the rest has receded to TAP_CONTEXT (a tap only, eased)
uniform vec2  uCentre;       // the centre chapter, canon x [x0, x1) (x0 >= x1 = none): its own arcs are emphasised
uniform float uCentreT;      // the centre's emphasis ease, 0..1 (web-frame CentreChapter.t)
in uint aId;                 // the thread: one id of the frame's visible set (frame-set.js) per instance
// colour and half width are one per instance: flat, so nothing is interpolated
flat out vec4 vCol; out float vEdge; flat out float vHalfW;
${arcShapeGLSL}
${arcFrameGLSL}
${flyOverGLSL}
${rampGLSL()}
void main(){
  // the thread's own data, by id (an integer texel fetch: no filtering, exact)
  int i = int(aId);
  ivec2 at = ivec2(i & 1023, i >> 10);
  vec4 arc = texelFetch(uArcs, at, 0);
  float aVotes = texelFetch(uVotes, at, 0).r;
  float a = arc.x, b = arc.y, aFanA = arc.z, aFanB = arc.w;
  // each foot stands in its verse's own cell, in the order of its far end
  // (geometry.footX; the picker computes the same). The camera's x comes
  // split, because a verse id near 31,102 carries ~0.002 of float32 error
  // and the ceiling's ~132 device px per verse turns that into ~0.26 px of
  // jitter on every foot as the camera pans (digest 39): the whole verses
  // subtract exactly, then the fractions are added.
  float x0 = ((a - uCamXHi) + (.5 + aFanA - uCamXLo))*uPPV + uRes.x*.5;
  float x1 = ((b - uCamXHi) + (.5 + aFanB - uCamXLo))*uPPV + uRes.x*.5;
  float rx = (x1 - x0)*.5;
  float left = x0, right = x0 + 2.*max(rx, 0.);
  // the structure law: the half-ellipse of its own span, at every zoom
  float A = arcShape(rx, uSquash).y;

  // E1: the piece of it in the frame (geometry.arcFrameTau, the same law the
  // visible set chose this draw's segments by), sampled evenly in its
  // parameter. Clipping moves only WHERE the samples land, never the curve
  // they land on. A piece float32 finds empty is a point: nothing is drawn.
  vec2 win = arcFrameTau(left, right, uRes.x, A, uFrameH.x, uFrameH.y);
  win.y = max(win.y, win.x);
  float dTau = (win.y - win.x)/uSegments;

  // Ribbon: two vertices per segment step, offset along the curve normal.
  int vid = gl_VertexID;
  float side = float(vid & 1)*2. - 1.;
  float tau = win.x + float(vid >> 1)*dTau;
  float px, hgt; vec2 tgv;
  arcAt(tau, left, right, A, px, hgt, tgv);
  vec2 tg = normalize(tgv + vec2(1e-6, 0.));
  // the baseline draws uCamY below the frame's base; pick.js adds the same.
  // Each sample is pushed out from the ellipse's centre by arcPush of its
  // own offset from it (geometry.frameSegments), so the chords straddle the
  // curve. The offset is built from tau, never as p minus the centre, which
  // float32 would round at the ceiling's million-px radii.
  float rr = max(rx, 0.);
  vec2 p = vec2(px, uBase + uCamY - hgt) + vec2(-rr*cos(tau), -A*sin(tau))*arcPush(dTau);

  // At depth every anchored ribbon needs the full alpha to clear 3:1 alone, so
  // votes can no longer ride on alpha; they drive WIDTH instead. uVoteMix is
  // the same fly-over crossover the fade uses, so there is never a zoom where
  // an arc is faded under one law and styled under another.
  float strength = clamp(aVotes/70., .30, 1.);
  float wScale = mix(1., mix(${glslFloat(STROKE_MIN_CSS / STROKE_DEEP_CSS)}, 1., (strength - .30)/.70), uVoteMix);
  float halfW = uWidth*.5*wScale;
  // Q3 (ii): once the reader is inside a passage a thread merely passing
  // overhead draws thinner, never fainter (geometry.flyOverWidth, inlined
  // above), so the local weave reads and every line stays where it was.
  halfW *= flyOverWidth(arcAnchored(x0, x1, uRes.x), uFlyLocalize, ${glslFloat(FLYOVER_LEG_WIDTH)});
  // The centre chapter (spec 4.4, Q2): its own arcs, a foot inside it, are
  // wider and brighter as the reader settles in (uCentreT eases 6x -> 24x);
  // the rest of the web is left exactly as it is (web-frame.centreEmphasis).
  float inCentre = (uCentre.x < uCentre.y
    && ((a >= uCentre.x && a < uCentre.y) || (b >= uCentre.x && b < uCentre.y))) ? 1. : 0.;
  float cT = uCentreT*inCentre;
  halfW *= mix(1., ${glslFloat(CENTRE_WIDTH)}, cT);

  // The chosen and hovered lines are not styled here: the top pass redraws
  // them over this one in their own ink and width, at every zoom (sw1 B2).
  // The instance's id IS the thread's (the stream carries it), so no range base.
  float id = float(aId);
  float spot = (uFocusArc >= 0. && abs(id - uFocusArc) < .5) ? 1. : 0.;
  // Thin-line hygiene: a ribbon under one backing px wide aliases into dashes as it crosses
  // the pixel grid. Hold the half width at half a backing px and pay for the
  // extra width in alpha (thin), so a thin line puts the same ink on screen.
  float thin = clamp(halfW/(.5*uPx), 0., 1.);
  halfW = max(halfW, .5*uPx);
  float hw = halfW + .5*uPx;                     // + half a backing px of feather skirt: the antialias ramp's own half
  p += vec2(-tg.y, tg.x)*side*hw;
  float a1 = step(uFocusRange.x, a)*step(a, uFocusRange.y);
  float b1 = step(uFocusRange.x, b)*step(b, uFocusRange.y);
  float inRange = (uFocusRange.x <= uFocusRange.y && max(a1, b1) > .5) ? 1. : 0.;
  // a chosen group: a foot in each range, lit - the bundle the reader
  // opened is what they asked for.
  float a2 = step(uFocusRange2.x, a)*step(a, uFocusRange2.y);
  float b2 = step(uFocusRange2.x, b)*step(b, uFocusRange2.y);
  float pair = (uFocusRange2.x <= uFocusRange2.y && max(a1*b2, b1*a2) > .5) ? 1. : 0.;
  float grouped = (uFocusRange2.x <= uFocusRange2.y) ? 1. : 0.;
  float lit = max(spot, mix(inRange, pair, grouped));
  // Only a TAP makes the rest of the web recede, and only to TAP_CONTEXT
  // (sw-ink.js): never to black, never for a hover (C3). uTapFade eases it
  // in and out (web-frame.tapFadeStep). What the reader asked for, the
  // chosen thread and the chosen range's threads, keeps its full ink.
  float dim = mix(1., ${glslFloat(TAP_CONTEXT)}, uTapFade*(1. - lit));

  // colour is distance, the one law (Corbin, 2026-09-10: genre and testament retired)
  // (the chosen, hovered and lit lines take the ink table's gold in the top pass)
  vec3 col = distanceRamp(pow(abs(b - a)/uTotal, .40));

  float aStrength = mix(strength, 1., uVoteMix);
  float aOut = uAlpha*dim*aStrength*mix(1., ${glslFloat(CENTRE_BRIGHT)}, cT)*thin;
  // past full ink the centre's boost lifts the colour instead, clamped
  col = min(col*max(aOut, 1.), vec3(1.));
  vCol = vec4(col, min(aOut, 1.));
  vEdge = side;
  vHalfW = halfW;
  gl_Position = vec4(p/uRes*2. - 1., 0, 1);
  gl_Position.y = -gl_Position.y;
}`;

const FRAG = `#version 300 es
precision mediump float;
uniform float uFeather;      // the vertex stage's uPx: one backing px of feather, in full-resolution px
flat in vec4 vCol; in float vEdge; flat in float vHalfW; out vec4 o;
void main(){
  float hw = vHalfW + .5*uFeather;                // the vertex stage's skirt
  float d = abs(vEdge)*hw;
  float aa = 1.0 - smoothstep(vHalfW - .5*uFeather, vHalfW + .5*uFeather, d);
  float a = clamp(vCol.a, 0., 1.)*aa;
  o = vec4(vCol.rgb*a, a);                        // premultiplied
}`;

/** The shader sources, exported so a test can prove they inline the shared law. */
export const SHADER_SOURCE = { vertex: VERT, fragment: FRAG };

/* The top pass (GL item 3). One instance is one thread the reader asked
   about, drawn as one ribbon wide enough for its halo: the fragment stage
   lays the core over the halo, both antialiased, premultiplied. Its feet and
   curve are the main pass's (the same footX, the same shared arc law, the
   same camera split), so the gold lies exactly over the line it covers and
   over the curve the picker hits; only the sampling differs: always clipped
   to the window, with as many segments as the visible piece needs
   (geometry.topSegmentsFor). */
const TOP_VERT = `#version 300 es
precision highp float;
uniform vec2  uRes;
uniform float uCamXHi, uCamXLo;  // the camera's x, split for float32 (the main pass's feet)
uniform float uPPV, uBase, uSquash, uCamY;
uniform float uSegments;
uniform float uRibbonHalf;   // the ribbon's half width, device px: the wider of core and halo, plus the skirt
in uint aFrom; in uint aTo;
in float aFanA; in float aFanB;
out float vEdge;
${arcShapeGLSL}
void main(){
  float a = float(aFrom), b = float(aTo);
  float x0 = ((a - uCamXHi) + (.5 + aFanA - uCamXLo))*uPPV + uRes.x*.5;
  float x1 = ((b - uCamXHi) + (.5 + aFanB - uCamXLo))*uPPV + uRes.x*.5;
  float rx = (x1 - x0)*.5;
  float left = x0, right = x0 + 2.*max(rx, 0.);
  float A = arcShape(rx, uSquash).y;
  // always the piece in the window: the segments go where the reader looks
  float m = ${glslFloat(CLIP_MARGIN)};
  float lo = max(left, -m);
  float hi = max(min(right, uRes.x + m), lo);
  int vid = gl_VertexID;
  float t = float(vid >> 1) / uSegments;
  float side = float(vid & 1)*2. - 1.;
  float tau = mix(arcTau(lo, left, right), arcTau(hi, left, right), t);
  float px, hgt; vec2 tgv;
  arcAt(tau, left, right, A, px, hgt, tgv);
  vec2 p = vec2(px, uBase + uCamY - hgt);
  vec2 tg = normalize(tgv + vec2(1e-6, 0.));
  p += vec2(-tg.y, tg.x)*side*uRibbonHalf;
  vEdge = side;
  gl_Position = vec4(p/uRes*2. - 1., 0, 1);
  gl_Position.y = -gl_Position.y;
}`;

const TOP_FRAG = `#version 300 es
precision mediump float;
uniform float uRibbon;       // the vertex stage's uRibbonHalf
uniform float uCoreHalf;     // the core's half width, device px (at least half a backing px)
uniform float uHaloHalf;     // the halo's half width, device px (0: none)
uniform float uFeather;      // one backing px, in full-resolution px (the main pass's uPx)
uniform vec4  uCore;         // straight rgba
uniform vec4  uHalo;         // straight rgba, its alpha at the core's edge
in float vEdge; out vec4 o;
void main(){
  float d = abs(vEdge)*uRibbon;
  float core = (1. - smoothstep(uCoreHalf - .5*uFeather, uCoreHalf + .5*uFeather, d))*uCore.a;
  // the halo: full under the core, falling softly to nothing at its own edge
  float h = uHaloHalf > uCoreHalf ? clamp(1. - (d - uCoreHalf)/(uHaloHalf - uCoreHalf), 0., 1.) : 0.;
  float halo = h*h*uHalo.a;
  float a = core + halo*(1. - core);
  o = vec4(uCore.rgb*core + uHalo.rgb*halo*(1. - core), a);   // premultiplied, the core over the halo
}`;

/** The top pass's shader sources, exported for the same proofs. */
export const TOP_SHADER_SOURCE = { vertex: TOP_VERT, fragment: TOP_FRAG };

/** Each top-pass kind's ink (sw-ink.js rows) and its tessellation cap. */
const TOP_LOOK = {
  // the core is 1 device px on every screen (the ink table's prophecy row has no CSS width, and
  // nothing draws it thinner); it recedes with a tap
  prophecy: { core: 'prophecy', halo: 'prophecyGlow', cap: 192, minDevicePx: 1, recedes: true },
  // the pairs the chosen range keeps lit (frame-set.topSet): the same ink, and it does not recede
  prophecyInRange: { core: 'prophecy', halo: 'prophecyGlow', cap: 192, minDevicePx: 1 },
  lit: { core: 'lit', halo: '', cap: 192 },
  hover: { core: 'hover', halo: 'hoverHalo', cap: 512 },
  chosen: { core: 'chosen', halo: 'chosenHalo', cap: 512 },
};

/**
 * The uniforms one top-pass kind draws with, from the ink table: device px
 * widths (the compact width on a phone), the core held at half a backing px
 * with the lost width paid in alpha (the main pass's thin-line law).
 * The prophecy class recedes with the rest of the web while a line is
 * chosen (to TAP_CONTEXT at tapFade 1); what the reader asked for does not,
 * nor do the pairs the chosen range keeps lit (prophecyInRange).
 * @param {string} kind  a frame-set TOP_ORDER kind
 * @param {number} dpr
 * @param {boolean} compact
 * @param {number} [tapFade]  0..1, the frame's (uTapFade)
 * @param {number} [px]  full-resolution px per backing px (E2; 1 at rest)
 * @returns {{ coreHalf: number, haloHalf: number, core: number[], halo: number[], ribbon: number, cap: number }}
 */
export function topLook(kind, dpr, compact, tapFade, px) {
  const look = TOP_LOOK[kind];
  const d = dpr > 0 ? dpr : 1;
  const p = px > 0 ? px : 1;
  const wide = inkWidth(look.core, compact) * d;
  const half = (look.minDevicePx && wide < look.minDevicePx ? look.minDevicePx : wide) / 2;
  const thin = half >= 0.5 * p ? 1 : half / (0.5 * p);
  const coreHalf = half > 0.5 * p ? half : 0.5 * p;
  const haloHalf = look.halo ? (inkWidth(look.halo, compact) * d) / 2 : 0;
  const fade = look.recedes && tapFade > 0 ? 1 + (TAP_CONTEXT - 1) * (tapFade < 1 ? tapFade : 1) : 1;
  const core = rgba01(look.core, thin * fade);
  const halo = look.halo ? rgba01(look.halo, fade) : [0, 0, 0, 0];
  return { coreHalf, haloHalf, core, halo, ribbon: Math.max(coreHalf, haloHalf) + 0.5 * p, cap: look.cap };
}

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error('scripture-web shader: ' + log);
  }
  return s;
}

/** Compile and link one program; throws with the driver's log. */
function link(gl, vertex, fragment) {
  const program = gl.createProgram();
  let vs, fs;
  try {
    vs = compile(gl, gl.VERTEX_SHADER, vertex);
    fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  } catch (e) {
    if (vs) gl.deleteShader(vs);
    gl.deleteProgram(program);
    throw e;
  }
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error('scripture-web link: ' + log);
  }
  return program;
}

/**
 * One program's uniforms, each sent only when its value changes (E3): a
 * frame that moves the camera sends the camera and nothing else.
 * @param {WebGL2RenderingContext} gl
 * @param {WebGLProgram} program
 * @param {string[]} names
 */
function uniformsOf(gl, program, names) {
  /** @type {Record<string, WebGLUniformLocation | null>} */
  const loc = Object.create(null);
  /** @type {Record<string, Float64Array>} */
  const held = Object.create(null);
  for (const name of names) {
    loc[name] = gl.getUniformLocation(program, name);
    held[name] = new Float64Array(4).fill(NaN);
  }
  return {
    /** @param {string} n @param {number} a */
    f1(n, a) {
      const h = held[n];
      if (h[0] === a) return;
      h[0] = a;
      gl.uniform1f(loc[n], a);
    },
    /** @param {string} n @param {number} a @param {number} b */
    f2(n, a, b) {
      const h = held[n];
      if (h[0] === a && h[1] === b) return;
      h[0] = a; h[1] = b;
      gl.uniform2f(loc[n], a, b);
    },
    /** @param {string} n @param {ArrayLike<number>} v */
    f4(n, v) {
      const h = held[n];
      if (h[0] === v[0] && h[1] === v[1] && h[2] === v[2] && h[3] === v[3]) return;
      h[0] = v[0]; h[1] = v[1]; h[2] = v[2]; h[3] = v[3];
      gl.uniform4f(loc[n], v[0], v[1], v[2], v[3]);
    },
    /** @param {string} n @param {number} a */
    i1(n, a) {
      const h = held[n];
      if (h[0] === a) return;
      h[0] = a;
      gl.uniform1i(loc[n], a);
    },
  };
}

/**
 * Create the renderer over a canvas. Returns null when WebGL2 is
 * unavailable — the screen shows its fallback panel rather than a blank void.
 *
 * @param {HTMLCanvasElement} canvas
 * @param {import('../../utils/scripture-web/decode.js').ScriptureGraph} graph
 * @param {{onContextRestored?: () => void, onContextLost?: () => void}} [opts]
 * @returns {object|null}
 */
export function createRenderer(canvas, graph, opts = {}) {
  // No `desynchronized`: the low-latency surface it asks for composites
  // differently under the Android WebView and cost us a blank canvas in
  // verification. Plain opaque + premultiplied is what this draws correctly.
  const gl = canvas.getContext('webgl2', {
    antialias: false, alpha: false, premultipliedAlpha: true,
    powerPreference: 'high-performance',
  });
  if (!gl) return null;

  const program = link(gl, VERT, FRAG);
  let topProgram;
  try {
    topProgram = link(gl, TOP_VERT, TOP_FRAG);
  } catch (e) {
    gl.deleteProgram(program);
    throw e;
  }
  gl.useProgram(program);

  const U = uniformsOf(gl, program, ['uArcs', 'uVotes', 'uRes', 'uCamXHi', 'uCamXLo', 'uCamY', 'uPPV',
    'uBase', 'uSquash', 'uFlyLocalize', 'uFrameH', 'uPx', 'uFeather', 'uWidth', 'uAlpha', 'uTotal',
    'uSegments', 'uVoteMix', 'uFocusRange', 'uFocusArc', 'uTapFade', 'uFocusRange2', 'uCentre', 'uCentreT']);
  const TU = uniformsOf(gl, topProgram, ['uRes', 'uCamXHi', 'uCamXLo', 'uPPV', 'uBase', 'uSquash', 'uCamY',
    'uSegments', 'uRibbonHalf', 'uRibbon', 'uCoreHalf', 'uHaloHalf', 'uFeather', 'uCore', 'uHalo']);

  // The threads, once: their feet and fans in one RGBA32F texture, their
  // votes in an R32F one, ARC_TEX_W a row, fetched by id in the vertex stage
  // (verse ids and votes are exact in float32).
  const count = graph.count > 0 ? graph.count : 0;
  const rows = Math.max(1, Math.ceil(count / ARC_TEX_W));
  const fans = fansOf(graph);
  const arcData = new Float32Array(ARC_TEX_W * rows * 4);
  const voteData = new Float32Array(ARC_TEX_W * rows);
  for (let i = 0; i < count; i++) {
    arcData[4 * i] = graph.from[i];
    arcData[4 * i + 1] = graph.to[i];
    arcData[4 * i + 2] = fans.fanA[i];
    arcData[4 * i + 3] = fans.fanB[i];
    voteData[i] = graph.votes[i];
  }
  const texture = (unit, internal, format, data) => {
    const t = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texImage2D(gl.TEXTURE_2D, 0, internal, ARC_TEX_W, rows, 0, format, gl.FLOAT, data);
    return t;
  };
  const arcTex = texture(0, gl.RGBA32F, gl.RGBA, arcData);
  const voteTex = texture(1, gl.R32F, gl.RED, voteData);
  gl.activeTexture(gl.TEXTURE0);
  U.i1('uArcs', 0);
  U.i1('uVotes', 1);

  // The id stream: the frame's visible set in rank order (frame-set.js),
  // uploaded only when the set changes (a new camera), into one buffer as
  // long as the graph.
  const wide = count > 0xffff;
  const idType = wide ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
  const idBytes = wide ? 4 : 2;
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  const idLoc = gl.getAttribLocation(program, 'aId');
  const idBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, idBuf);
  gl.bufferData(gl.ARRAY_BUFFER, Math.max(1, count) * idBytes, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(idLoc);
  gl.vertexAttribDivisor(idLoc, 1);
  gl.vertexAttribIPointer(idLoc, 1, idType, 0, 0);
  let streamSerial = -1;

  // The top pass's instances: what of the top set touches the frame, packed
  // by run (frame-set.js topDraws), re-uploaded only when the packing changes.
  const topVao = gl.createVertexArray();
  gl.bindVertexArray(topVao);
  /** @type {Array<{buf:WebGLBuffer, loc:number, type:number, isInt:boolean, bytes:number, field:string}>} */
  const topAttribs = [];
  const topAttrib = (field, name, type, isInt, bytes) => {
    const loc = gl.getAttribLocation(topProgram, name);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribDivisor(loc, 1);
    topAttribs.push({ buf, loc, type, isInt, bytes, field });
  };
  topAttrib('from', 'aFrom', gl.UNSIGNED_SHORT, true, 2);
  topAttrib('to', 'aTo', gl.UNSIGNED_SHORT, true, 2);
  topAttrib('fanA', 'aFanA', gl.FLOAT, false, 4);
  topAttrib('fanB', 'aFanB', gl.FLOAT, false, 4);
  /** @type {import('../../utils/scripture-web/frame-set.js').TopSet | null} */
  let topHeld = null;
  /** @type {import('../../utils/scripture-web/frame-set.js').TopDraws | null} */
  let topDrawn = null;
  // what topDraws reads each frame, filled in place (E3): the frame, and each kind's cap and
  // ribbon half width (its look's), in TOP_ORDER
  const topFrame = { width: 0, base: 0, camX: 0, camY: 0, ppv: 0, squash: 0, dpr: 1 };
  const topCaps = TOP_ORDER.map((kind) => TOP_LOOK[kind].cap);
  const topPads = TOP_ORDER.map(() => 0);
  const pointTop = (first) => {
    for (const a of topAttribs) {
      gl.bindBuffer(gl.ARRAY_BUFFER, a.buf);
      if (a.isInt) gl.vertexAttribIPointer(a.loc, 1, a.type, 0, first * a.bytes);
      else gl.vertexAttribPointer(a.loc, 1, a.type, false, 0, first * a.bytes);
    }
  };
  gl.bindVertexArray(vao);

  // Each kind's look, rebuilt only when what it reads changes (E3).
  /** @type {Record<string, {dpr:number, compact:boolean, fade:number, px:number, look:any}>} */
  const looks = Object.create(null);
  const lookOf = (kind, dpr, compact, fade, px) => {
    const held = looks[kind];
    if (held && held.dpr === dpr && held.compact === compact && held.fade === fade && held.px === px) return held.look;
    const look = topLook(kind, dpr, compact, fade, px);
    looks[kind] = { dpr, compact, fade, px, look };
    return look;
  };
  const heights = new Float64Array(2);
  /** The main pass's last frame: instances and vertex invocations it sent, in how many draws. */
  const stats = { instances: 0, vertices: 0, draws: 0 };
  /** The top pass's: the prophecy class and what is asked about. */
  const topStats = { instances: 0, vertices: 0, draws: 0 };

  /**
   * The top pass over the frame the main pass just drew: the lit, hovered and
   * chosen threads in their ink, the chosen last. Not counted in stats (the
   * main pass's instances are the web; these are a handful drawn again).
   */
  const drawTop = (v, camX, ppv, camXHi, camY, dpr, tapFade, px) => {
    const set = topSet(graph, v, topHeld);
    topHeld = set;
    topStats.instances = 0; topStats.vertices = 0; topStats.draws = 0;
    if (!set.count) return;
    const compact = isCompact(v.height / dpr);
    for (let k = 0; k < TOP_ORDER.length; k++) {
      const kind = TOP_ORDER[k];
      topPads[k] = lookOf(kind, dpr, compact, TOP_LOOK[kind].recedes ? tapFade : 0, px).ribbon;
    }
    const f = topFrame;
    f.width = v.width; f.base = v.base; f.camX = camX; f.camY = camY; f.ppv = ppv; f.squash = v.squash; f.dpr = dpr;
    const drawn = topDraws(set, f, topCaps, topPads, topDrawn);
    if (drawn !== topDrawn) {
      // an empty packing keeps the buffers: the next fresh one replaces them
      if (drawn.fresh && drawn.count) {
        gl.bindVertexArray(topVao);
        for (const a of topAttribs) {
          gl.bindBuffer(gl.ARRAY_BUFFER, a.buf);
          gl.bufferData(gl.ARRAY_BUFFER, drawn[a.field], gl.DYNAMIC_DRAW);
        }
      }
      topDrawn = drawn;
    }
    if (!drawn.count) return;
    gl.useProgram(topProgram);
    gl.bindVertexArray(topVao);
    TU.f2('uRes', v.width, v.height);
    TU.f1('uCamXHi', camXHi);
    TU.f1('uCamXLo', camX - camXHi);
    TU.f1('uPPV', ppv);
    TU.f1('uBase', v.base);
    TU.f1('uSquash', v.squash);
    TU.f1('uCamY', camY);
    TU.f1('uFeather', px);
    for (let ri = 0; ri < drawn.runs.length; ri++) {
      const run = drawn.runs[ri];
      const look = lookOf(run.kind, dpr, compact, TOP_LOOK[run.kind].recedes ? tapFade : 0, px);
      TU.f1('uSegments', run.segments);
      TU.f1('uRibbonHalf', look.ribbon);
      TU.f1('uRibbon', look.ribbon);
      TU.f1('uCoreHalf', look.coreHalf);
      TU.f1('uHaloHalf', look.haloHalf);
      TU.f4('uCore', look.core);
      TU.f4('uHalo', look.halo);
      pointTop(run.first);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 2 * (run.segments + 1), run.count);
      topStats.instances += run.count;
      topStats.vertices += 2 * (run.segments + 1) * run.count;
      topStats.draws++;
    }
    gl.bindVertexArray(vao);
  };

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);

  // the ground colour, parsed once per colour (E3)
  let bgKey = '';
  let bg = [0, 0, 0];
  const ground = (css) => {
    if (css !== bgKey) { bgKey = css; bg = cssColorToRGB(css); }
    return bg;
  };

  // Context loss (GPU reset, WebView renderer restart — the on-device
  // "everything washes out" report). preventDefault() tells the browser we
  // want a restore; every GL object is dead after one, so the OWNER must
  // rebuild the renderer — onContextRestored is its hook for that.
  // onContextLost is the OWNER's hook for the loss itself — a loss that
  // never restores (Chrome gives up after repeated resets) otherwise goes
  // unreported and draw() just returns silently forever (scripture-web-7).
  let lost = false;
  const onLost = (e) => {
    e.preventDefault();
    lost = true;
    if (typeof opts.onContextLost === 'function') opts.onContextLost();
  };
  const onRestored = () => {
    lost = false;
    if (typeof opts.onContextRestored === 'function') opts.onContextRestored();
  };
  canvas.addEventListener('webglcontextlost', onLost, false);
  canvas.addEventListener('webglcontextrestored', onRestored, false);

  return {
    gl,
    get contextLost() { return lost; },
    /** The main pass's last frame (the debug stat, E1): {instances, vertices, draws}. */
    get stats() { return stats; },
    /** The top pass's last frame: {instances, vertices, draws}. */
    get topStats() { return topStats; },

    /**
     * Paint the ground and nothing else: My Web draws its links in Canvas2D
     * over this, so a whole instanced pass at alpha 0 was a frame of vertex
     * work for one colour (refactor.md #10).
     * @param {string} bgColor  a CSS colour (the chrome's ground)
     */
    clear(bgColor) {
      if (lost) return;
      const c = ground(bgColor);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(c[0], c[1], c[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      stats.instances = 0; stats.vertices = 0; stats.draws = 0;
      topStats.instances = 0; topStats.vertices = 0; topStats.draws = 0;
    },

    /**
     * Draw one frame.
     * @param {{width:number, height:number, base:number, ceil:number,
     *   squash:number, localize:number, camX:number, camY?:number, ppv:number,
     *   strokeWidth:number, alpha:number, voteMix?:number, dpr?:number,
     *   density:import('../../utils/scripture-web/decode.js').Density,
     *   bg:string,
     *   focusRange:(number[]|null), focusRange2?:(number[]|null), focusArc:number, hoverArc?:number,
     *   hoverProphecy?:number, focusProphecy?:number, lit?:(ArrayLike<number>|null), litKey?:string, tapFade?:number,
     *   scale?:number,
     *   centre?:(import('../../utils/scripture-web/web-frame.js').CentreChapter|null)}} v
     *   the view (web-frame.webViewArgs) and the frame's own values, in one object the screen
     *   fills in place (E3);
     *   centre: the centre chapter (web-frame.centreOf over centreRange), its own arcs emphasised;
     *   tapFade: 0..1, how far the rest of the web has receded (web-frame.tapFadeStep); when it is
     *     not given, the focus decides at once (1 while something is chosen);
     *   scale: the backing's share of the full-resolution frame (backingScale; 1 when not given):
     *     the geometry stays in full-resolution device px and the viewport is the backing
     */
    draw(v) {
      if (lost) return stats;
      const dpr = v.dpr > 0 ? v.dpr : 1;
      const k = v.scale > 0 && v.scale < 1 ? v.scale : 1;
      const px = 1 / k;
      const bw = backingSize(v.width, k), bh = backingSize(v.height, k);
      const c = ground(v.bg);
      gl.viewport(0, 0, bw, bh);
      gl.clearColor(c[0], c[1], c[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      // Premultiplied-over on both themes keeps dense crossings legible. The
      // old additive dark pass made the 300k tail bloom into neon and exposed
      // the phone GPU to a needless sustained fill-rate spike.
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      // GL item 6: the ruler band is the overlay's. The ruler stands at
      // view.base whatever the camera's height (overlay drawRuler, pickChapter),
      // its gold line from base + 1 device px down, while the threads stand on
      // base + camY: every thread pass is held to the rows above that line.
      // Turned on after the clear (which is whole) and off at the frame's end.
      const rows = Math.min(bh, Math.max(0, Math.ceil((v.base + dpr) * k)));
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, bh - rows, bw, rows);

      const camX = v.camX, ppv = v.ppv;
      const camY = v.camY > 0 ? v.camY : 0;
      // THE visible set (frame-set.js): the picker and the overlay ask for the same one
      const set = frameSetAt(graph, v.density, v.width, v.base, v.squash, camX, camY, ppv, dpr);

      gl.useProgram(program);
      gl.bindVertexArray(vao);
      U.f2('uRes', v.width, v.height);
      // split for float32 (the vertex stage's feet): hi whole, lo the rest
      const camXHi = Math.floor(camX);
      U.f1('uCamXHi', camXHi);
      U.f1('uCamXLo', camX - camXHi);
      U.f1('uCamY', camY);
      U.f1('uPPV', ppv);
      U.f1('uBase', v.base);
      U.f1('uSquash', v.squash);
      // the heights the set was cut by (geometry.frameHeights)
      frameHeights(v.base, camY, dpr, heights);
      U.f2('uFrameH', heights[0], heights[1]);
      U.f1('uFlyLocalize', skyLocalize(v.localize, camY, v.ceil));
      U.f1('uPx', px);
      U.f1('uFeather', px);
      U.f1('uWidth', v.strokeWidth);
      U.f1('uAlpha', v.alpha);
      U.f1('uTotal', graph.total);
      U.f1('uVoteMix', v.voteMix || 0);
      U.f1('uFocusArc', v.focusArc == null ? -1 : v.focusArc);
      const chosen = (v.focusArc != null && v.focusArc >= 0) || (v.focusProphecy != null && v.focusProphecy >= 0)
        || !!v.focusRange;
      const t = typeof v.tapFade === 'number' ? v.tapFade : (chosen ? 1 : 0);
      const tapFade = t > 0 ? (t < 1 ? t : 1) : 0;
      U.f1('uTapFade', tapFade);
      const centre = v.centre;
      if (centre && centre.x0 < centre.x1) {
        U.f2('uCentre', centre.x0, centre.x1);
        U.f1('uCentreT', centre.t > 0 ? Math.min(1, centre.t) : 0);
      } else {
        U.f2('uCentre', 1, 0);
        U.f1('uCentreT', 0);
      }
      if (v.focusRange) U.f2('uFocusRange', v.focusRange[0], v.focusRange[1]);
      else U.f2('uFocusRange', 1, 0);
      if (v.focusRange && v.focusRange2) U.f2('uFocusRange2', v.focusRange2[0], v.focusRange2[1]);
      else U.f2('uFocusRange2', 1, 0);

      gl.bindBuffer(gl.ARRAY_BUFFER, idBuf);
      if (set.serial !== streamSerial && set.count) {
        streamSerial = set.serial;
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, set.list, 0, set.count);
      }
      // one draw per run, in rank order: every thread of a run at the run's segments
      let vertices = 0;
      for (let k = 0; k < set.runs; k++) {
        const n = set.runN[k];
        U.f1('uSegments', n);
        gl.vertexAttribIPointer(idLoc, 1, idType, 0, set.runFirst[k] * idBytes);
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 2 * (n + 1), set.runCount[k]);
        vertices += 2 * (n + 1) * set.runCount[k];
      }
      stats.instances = set.count;
      stats.vertices = vertices;
      stats.draws = set.runs;
      drawTop(v, camX, ppv, camXHi, camY, dpr, tapFade, px);
      gl.disable(gl.SCISSOR_TEST);
      return stats;
    },

    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      gl.deleteBuffer(idBuf);
      for (const a of topAttribs) gl.deleteBuffer(a.buf);
      gl.deleteTexture(arcTex);
      gl.deleteTexture(voteTex);
      gl.deleteVertexArray(vao);
      gl.deleteVertexArray(topVao);
      gl.deleteProgram(program);
      gl.deleteProgram(topProgram);
      // NOTE: no loseContext() here. A rebuild after a real context loss
      // reuses this same canvas, and force-losing the freshly restored
      // context would kill the replacement renderer as it is being born.
    },
  };
}
