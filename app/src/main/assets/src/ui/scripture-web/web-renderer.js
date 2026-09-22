/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/web-renderer — Cluster F (esbuild bundle-f.js)

   The GPU side of The Scripture Web.

   Every cross-reference is one instance of a triangle-strip ribbon. The
   vertex shader turns (from, to) into a half-ellipse in screen space and
   offsets each vertex along the curve normal to give the stroke width, so a
   whole canon of arcs is a handful of draw calls and zero per-frame CPU
   geometry. The fragment shader does nothing but antialias the edge.

   Three things make it fast enough for a mid-range phone:
     · The asset is pre-sorted into span buckets, so short arcs are drawn with
       8 segments and only the longest get 48 — the average is ~12, not 48.
     · Each density is a PREFIX of its bucket, so switching Essential / Famous
       just shortens the instance count. Nothing re-uploads.
     · Buckets carry per-chunk [minFrom, maxTo] extents, so a zoomed-in view
       skips whole runs of instances that cannot touch the viewport.

   Neither the height law nor the fly-over cull is written here, nor the
   density law (which threads are drawn at all at this zoom: a reveal level
   per anchored thread, one representative per fly-over group, decode.lodOf).
   All three are imported from utils/scripture-web/geometry.js as GLSL and
   inlined, because the CPU hit test applies the same laws — if any drifts,
   arcs stop being tappable where they look tappable, or start being tappable
   where nothing is drawn. Tests assert this shader contains them.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  arcShapeGLSL, flyOverGLSL, lodGLSL, strataGLSL, segmentsFor, CLIP_MARGIN, DOME, glslFloat, spanLogOf,
  STROKE_MIN_CSS, STROKE_DEEP_CSS, LOD_OFF,
} from '../../utils/scripture-web/geometry.js';
import { rampGLSL, cssColorToRGB } from '../../utils/scripture-web/palette.js';
import { bucketDrawCount, fansOf, lodOf } from '../../utils/scripture-web/decode.js';

/** Colour modes, in the order the control cycles them. */
export const COLOR_MODES = ['distance', 'testament', 'genre'];
/** Density steps, in the order the control cycles them. */
export const DENSITY_STEPS = ['essential', 'famous'];

// The zero-alpha cull in VERT's main(), on the line marked `zero-alpha cull`.
//
// A zero dim is not drawn. flyOverDim can no longer produce one (FLYOVER_FLOOR
// is never 0, by owner rule), so this cull is kept for any OTHER zero the law
// is ever handed, and is not the fly-over law's exit any more.
// (Original rationale follows.) Once flyOverDim has faded an arc to zero, STOP DRAWING IT. Alpha 0 still costs a full
// rasterise and blend of every pixel of the ribbon. Measured with
// EXT_disjoint_timer_query_webgl2 on the real asset (Design & Performance,
// scripture-web-3-fill-measure.md): phone 375@3 at zoom 400x, 3.05 -> 1.09 ms on a
// Radeon 890M (-64 %) and 319.7 -> 134.5 ms on SwiftShader (-58 %). The chunk cull already
// dropped 63,418 instances to 18,944 there; only a few dozen of those are visible, and the
// rest were being blended for nothing.
//
// The threshold is EXACTLY the zero pick.js refuses taps on (pick.js:87), not an epsilon
// near it. Culling any wider would blank arcs inside the partial fade band that are still
// tappable, and the reader would be tapping a line that is not on the screen.
//
// This lives out here, not beside the line, because a template literal ships its comments
// verbatim: inside the shader these twelve lines were 821 B of the 917 B that put bundle-f
// over its byte ceiling. esbuild strips them here and the shipped shader is unchanged.

const VERT = `#version 300 es
precision highp float;
uniform vec2  uRes;
uniform float uCamX, uPPV, uBase, uCeil, uSquash, uLocalize;
uniform float uCamY;         // the picture's shift down the frame, device px
uniform float uWidth, uAlpha, uTotal, uNT, uColorMode, uLightness;
uniform float uSegments;
uniform float uVoteMix;      // 0 = votes drive alpha (overview), 1 = width (depth)
uniform vec2  uFocusRange;   // verse range kept lit (lo > hi = no focus)
uniform vec2  uFocusRange2;  // with uFocusRange: a GROUP, one foot in each, lit AND drawn
uniform float uFocusArc;     // TAPPED instance: spotlit AND dims everything else
uniform float uHoverArc;     // HOVERED instance: brightened only, dims nothing
uniform float uInstanceBase; // gl_InstanceID offset of this draw range
uniform float uLevel;        // the zoom as a level (geometry.levelOf), or LOD_OFF
uniform float uEssential;    // 1 = the Essential density's table, 0 = Famous
in uint aFrom; in uint aTo; in float aVotes; in float aGenre;
in float aFanA; in float aFanB; // each foot's departure rank, -0.5..0.5
in uint aLod;                   // decode.lodOf: reveal levels + representative bits
out vec4 vCol; out float vEdge; out float vHalfW;
${arcShapeGLSL}
${flyOverGLSL}
${lodGLSL}
${strataGLSL}
${rampGLSL()}
void main(){
  float a = float(aFrom), b = float(aTo);
  float x0 = (a - uCamX)*uPPV + uRes.x*.5;
  float x1 = (b - uCamX)*uPPV + uRes.x*.5;
  float rx = (x1 - x0)*.5;
  float cx = x0 + rx;
  float r = max(rx, 0.);
  float left = cx - r, right = cx + r;
  float spanLog = log(max(abs(b - a), 1.))/log(max(uTotal, 2.));
  // one shape per FOOT: its rank sets its quarter; A is the same at both
  vec2 shL = arcShape(rx, uCeil, uSquash, uLocalize, spanLog, aFanA);
  vec2 shR = arcShape(rx, uCeil, uSquash, uLocalize, spanLog, aFanB);
  float RL = shL.x, RR = shR.x, A = shL.y;
  // parameter length, in units of the mean quarter: geometry.arcParamLength
  float Rm = (RL + RR)*.5;
  float P = 3.14159265 + (Rm > 0. ? max(0., (2.*r - RL - RR)/Rm) : 0.);
  float bow = ${glslFloat(DOME)}*uLocalize;

  // The piece worth tessellating. At overview this is the whole arc, so the 1x
  // frame cannot move; as the reader localizes it closes onto the viewport,
  // because a 440,000 px arc spending 47 of its 48 segments off screen is what
  // draws the visible piece as one straight chord. Clipping moves only WHERE
  // the samples land — never the curve they land on. geometry.visibleWindow.
  float m = ${CLIP_MARGIN}.;
  float lo = mix(left,  max(left,  -m),         uLocalize);
  float hi = mix(right, min(right, uRes.x + m), uLocalize);
  hi = max(hi, lo);

  // Ribbon: two vertices per segment step, offset along the curve normal.
  int vid = gl_VertexID;
  float t = float(vid >> 1) / uSegments;
  float side = float(vid & 1)*2. - 1.;
  float tau = mix(arcTau(lo, left, right, RL, RR, P), arcTau(hi, left, right, RL, RR, P), t);
  float px, hgt; vec2 tgv;
  arcAt(tau, left, right, RL, RR, A, P, bow, px, hgt, tgv);
  // the strata: a thread whose feet have both left the frame rises into its
  // band as one piece (the density law, part 3); pick.js lifts the same
  float lift = strataLift(abs(b - a), uTotal, x0, x1, uRes.x, uCeil, uLocalize);
  // the baseline draws uCamY below the frame's base; pick.js adds the same
  vec2 p = vec2(px, uBase + uCamY - hgt - lift);
  vec2 tg = normalize(tgv + vec2(1e-6, 0.));

  // At depth every anchored ribbon needs the full alpha to clear 3:1 alone, so
  // votes can no longer ride on alpha; they drive WIDTH instead. uVoteMix is
  // the same fly-over crossover the cull uses, so there is never a zoom where
  // an arc is culled under one law and styled under another.
  float strength = clamp(aVotes/70., .30, 1.);
  float wScale = mix(1., mix(${STROKE_MIN_CSS / STROKE_DEEP_CSS}, 1., (strength - .30)/.70), uVoteMix);
  float halfW = uWidth*.5*wScale;
  float hw = halfW + 1.0;                        // +1px feather skirt
  p += vec2(-tg.y, tg.x)*side*hw;

  float id = float(gl_InstanceID) + uInstanceBase;
  float spot = (uFocusArc >= 0. && abs(id - uFocusArc) < .5) ? 1. : 0.;
  float hovered = (uHoverArc >= 0. && abs(id - uHoverArc) < .5) ? 1. : 0.;
  float a1 = step(uFocusRange.x, a)*step(a, uFocusRange.y);
  float b1 = step(uFocusRange.x, b)*step(b, uFocusRange.y);
  float inRange = (uFocusRange.x <= uFocusRange.y && max(a1, b1) > .5) ? 1. : 0.;
  // a chosen group: a foot in each range. Lit, and DRAWN whatever the
  // density law says - the bundle the reader opened is what they asked for.
  float a2 = step(uFocusRange2.x, a)*step(a, uFocusRange2.y);
  float b2 = step(uFocusRange2.x, b)*step(b, uFocusRange2.y);
  float pair = (uFocusRange2.x <= uFocusRange2.y && max(a1*b2, b1*a2) > .5) ? 1. : 0.;
  float grouped = (uFocusRange2.x <= uFocusRange2.y) ? 1. : 0.;
  float lit = max(spot, mix(inRange, pair, grouped));
  // Only a TAP darkens the rest of the web. Merely moving the mouse across
  // the dome must not blank the picture the reader is looking at.
  float focusing = (uFocusArc >= 0. || uFocusRange.x <= uFocusRange.y) ? 1. : 0.;
  float dim = mix(1., mix(.05, 1., lit), focusing);
  float bright = max(spot, hovered);

  // The density law: is this thread drawn at this zoom at all? The table
  // (aLod) says; the tapped thread and a chosen group always are. NOT the
  // hovered one: a hidden thread cannot be hovered into existence, and a
  // hover that outlived a wheel zoom-out kept a line the picker could not
  // see (the refuter, 2026-09-21: thread #89 at 12x). pick.drawnTest agrees.
  float shown = max(lodShown(aLod, uEssential, arcAnchored(x0, x1, uRes.x), uLevel), max(spot, pair));

  // Semantic zoom: once the reader is inside a passage, arcs merely passing
  // overhead recede so the local weave is legible instead of fogged. At FULL
  // depth they are culled outright — the tanh ceiling flattens every big
  // arc's apex to the same height, so hundreds of fly-overs otherwise stack
  // into horizontal smears across the view (the on-device report).
  // The law lives in geometry.js, inlined above, because pick.js applies the
  // same test — an arc faded to nothing here must not win a tap there.
  dim *= flyOverDim(arcAnchored(x0, x1, uRes.x), uLocalize);
  // zero-alpha cull: why, and why exactly zero, above this shader
  if (dim <= 0.) { vCol = vec4(0.); vEdge = side; gl_Position = vec4(2., 2., 0., 1.); return; }
  // the density law's hidden threads leave by the same door: not drawn is not drawn
  if (shown < .5) { vCol = vec4(0.); vEdge = side; gl_Position = vec4(2., 2., 0., 1.); return; }

  vec3 col;
  if (uColorMode < .5) {
    col = distanceRamp(pow(abs(b - a)/uTotal, .40));
  } else if (uColorMode < 1.5) {
    col = testamentColor(step(uNT, a) + step(uNT, b));
  } else {
    col = genreColor(aGenre);
  }
  col = mix(col, vec3(1.), bright*.55);
  col *= uLightness;                              // parchment needs darker ink

  float aStrength = mix(strength, 1., uVoteMix);
  vCol = vec4(col, uAlpha*dim*aStrength*mix(1., 3.0, bright));
  vEdge = side;
  vHalfW = halfW;
  gl_Position = vec4(p/uRes*2. - 1., 0, 1);
  gl_Position.y = -gl_Position.y;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec4 vCol; in float vEdge; in float vHalfW; out vec4 o;
void main(){
  float hw = vHalfW + 1.0;
  float d = abs(vEdge)*hw;
  float aa = 1.0 - smoothstep(vHalfW - .5, vHalfW + .5, d);
  float a = clamp(vCol.a, 0., 1.)*aa;
  o = vec4(vCol.rgb*a, a);                        // premultiplied
}`;

/** The shader sources, exported so a test can prove they inline the shared law. */
export const SHADER_SOURCE = { vertex: VERT, fragment: FRAG };

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

  const program = gl.createProgram();
  let vs, fs;
  try {
    vs = compile(gl, gl.VERTEX_SHADER, VERT);
    fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
  } catch (e) {
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
  gl.useProgram(program);

  const U = {};
  for (const name of ['uRes', 'uCamX', 'uCamY', 'uPPV', 'uBase', 'uCeil', 'uSquash',
    'uLocalize', 'uWidth', 'uAlpha', 'uTotal', 'uNT', 'uColorMode',
    'uLightness', 'uSegments', 'uVoteMix', 'uFocusRange', 'uFocusArc',
    'uHoverArc', 'uInstanceBase', 'uLevel', 'uEssential', 'uFocusRange2']) {
    U[name] = gl.getUniformLocation(program, name);
  }

  // Widest arc in each bucket, once. Tessellation is chosen per draw from the
  // camera, and a bucket of 3-verse arcs must not be given 96 segments because
  // a bucket of 10,000-verse ones needs them.
  const bucketMaxSpan = graph.buckets.map((b) => {
    let m = 0;
    const end = b.off + b.len;
    for (let i = b.off; i < end; i++) {
      const s = Math.abs(graph.to[i] - graph.from[i]);
      if (s > m) m = s;
    }
    return m;
  });

  // Per-instance genre of the earlier endpoint — precomputed once so the
  // shader never walks the chapter table.
  const genre = new Float32Array(graph.count);
  {
    const bookOfChapter = graph.chapters;
    for (let i = 0; i < graph.count; i++) {
      const v = graph.from[i] < graph.to[i] ? graph.from[i] : graph.to[i];
      const bookIndex = bookOfChapter[graph.chapterOfVerse[v]][0];
      genre[i] = genreBucket(bookIndex);
    }
  }

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  /** @type {Array<{buf:WebGLBuffer, loc:number, type:number, isInt:boolean, bytes:number}>} */
  const attribs = [];
  const attrib = (data, name, type, isInt, bytes) => {
    const loc = gl.getAttribLocation(program, name);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribDivisor(loc, 1);
    attribs.push({ buf, loc, type, isInt, bytes });
  };
  // Uint16 verse ids widen to uint in the shader; votes stay signed.
  attrib(graph.from, 'aFrom', gl.UNSIGNED_SHORT, true, 2);
  attrib(graph.to, 'aTo', gl.UNSIGNED_SHORT, true, 2);
  attrib(new Float32Array(graph.votes), 'aVotes', gl.FLOAT, false, 4);
  attrib(genre, 'aGenre', gl.FLOAT, false, 4);
  // Each foot's departure rank, the table the hit test reads too.
  const fans = fansOf(graph);
  attrib(fans.fanA, 'aFanA', gl.FLOAT, false, 4);
  attrib(fans.fanB, 'aFanB', gl.FLOAT, false, 4);
  // The density law's table, the one the hit test reads too.
  attrib(lodOf(graph).lod, 'aLod', gl.UNSIGNED_INT, true, 4);

  /**
   * Point every instance attribute at `first`.
   *
   * WebGL2's drawArraysInstanced has NO base-instance parameter — instance
   * data is always read from the start of the bound range. Drawing a bucket's
   * sub-range therefore means re-pointing the attributes at a byte offset,
   * not just passing a different first index. Getting this wrong silently
   * draws the WRONG arcs (every bucket rendering instance 0..n), which is
   * exactly what it did before this existed.
   */
  let pointedAt = -1;
  const pointInstances = (first) => {
    if (first === pointedAt) return;
    pointedAt = first;
    for (const a of attribs) {
      gl.bindBuffer(gl.ARRAY_BUFFER, a.buf);
      if (a.isInt) gl.vertexAttribIPointer(a.loc, 1, a.type, 0, first * a.bytes);
      else gl.vertexAttribPointer(a.loc, 1, a.type, false, 0, first * a.bytes);
    }
  };
  pointInstances(0);

  gl.disable(gl.DEPTH_TEST);
  gl.enable(gl.BLEND);

  // First verse of Matthew — the testament boundary.
  let ntStart = graph.total;
  for (const ch of graph.chapters) {
    if (graph.books[ch[0]].id === 'matthew-plain') { ntStart = ch[2]; break; }
  }

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

  let lastStats = { instances: 0, draws: 0 };

  return {
    gl,
    get contextLost() { return lost; },
    get stats() { return lastStats; },

    /**
     * Draw one frame.
     * @param {{width:number, height:number, base:number, ceil:number,
     *   squash:number, localize:number, camX:number, camY?:number, ppv:number,
     *   strokeWidth:number, alpha:number, voteMix?:number, dpr?:number,
     *   colorMode:string,
     *   density:import('../../utils/scripture-web/decode.js').Density,
     *   light:boolean, bg:string, level?:number,
     *   focusRange:(number[]|null), focusRange2?:(number[]|null), focusArc:number, hoverArc?:number}} v
     *   level: geometry.levelOf(); absent = the density law off, every thread drawn
     */
    draw(v) {
      if (lost) return lastStats;
      const bg = cssColorToRGB(v.bg);
      gl.viewport(0, 0, v.width, v.height);
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      // Premultiplied-over on both themes keeps dense crossings legible. The
      // old additive dark pass made the 300k tail bloom into neon and exposed
      // the phone GPU to a needless sustained fill-rate spike.
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

      gl.useProgram(program);
      gl.bindVertexArray(vao);
      gl.uniform2f(U.uRes, v.width, v.height);
      gl.uniform1f(U.uCamX, v.camX);
      gl.uniform1f(U.uCamY, v.camY > 0 ? v.camY : 0);
      gl.uniform1f(U.uPPV, v.ppv);
      gl.uniform1f(U.uBase, v.base);
      gl.uniform1f(U.uCeil, v.ceil);
      gl.uniform1f(U.uSquash, v.squash);
      gl.uniform1f(U.uLocalize, v.localize);
      gl.uniform1f(U.uWidth, v.strokeWidth);
      gl.uniform1f(U.uAlpha, v.alpha);
      gl.uniform1f(U.uTotal, graph.total);
      gl.uniform1f(U.uNT, ntStart);
      gl.uniform1f(U.uColorMode, COLOR_MODES.indexOf(v.colorMode));
      gl.uniform1f(U.uLightness, v.light ? 0.72 : 1);
      gl.uniform1f(U.uVoteMix, v.voteMix || 0);
      gl.uniform1f(U.uFocusArc, v.focusArc == null ? -1 : v.focusArc);
      gl.uniform1f(U.uHoverArc, v.hoverArc == null ? -1 : v.hoverArc);
      gl.uniform1f(U.uLevel, typeof v.level === 'number' ? v.level : LOD_OFF);
      gl.uniform1f(U.uEssential, v.density === 'essential' ? 1 : 0);
      if (v.focusRange) gl.uniform2f(U.uFocusRange, v.focusRange[0], v.focusRange[1]);
      else gl.uniform2f(U.uFocusRange, 1, 0);
      if (v.focusRange && v.focusRange2) gl.uniform2f(U.uFocusRange2, v.focusRange2[0], v.focusRange2[1]);
      else gl.uniform2f(U.uFocusRange2, 1, 0);

      // Viewport verse range, for chunk culling.
      const viewLo = v.camX - (v.width / 2) / v.ppv;
      const viewHi = v.camX + (v.width / 2) / v.ppv;
      const chunkSize = graph.chunkSize || 256;

      let instances = 0, draws = 0;
      for (let bi = 0; bi < graph.buckets.length; bi++) {
        const bucket = graph.buckets[bi];
        const count = bucketDrawCount(bucket, v.density);
        if (count <= 0) continue;
        // Segments from what this bucket can put ON SCREEN, not from its span.
        const segments = segmentsFor(bucket.segments, v.localize,
          bucketMaxSpan[bi] * v.ppv * 0.5, v.ceil, v.width, v.dpr || 1, spanLogOf(bucketMaxSpan[bi], graph.total));
        gl.uniform1f(U.uSegments, segments);
        const verts = 2 * (segments + 1);
        // Walk chunks, coalescing adjacent visible ones into single draws.
        const chunks = bucket.chunks || [];
        let runStart = -1;
        const flush = (endExclusive) => {
          if (runStart < 0) return;
          const first = runStart;
          const n = endExclusive - first;
          if (n > 0) {
            pointInstances(bucket.off + first);
            gl.uniform1f(U.uInstanceBase, bucket.off + first);
            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, verts, n);
            instances += n;
            draws++;
          }
          runStart = -1;
        };
        if (!chunks.length) {
          pointInstances(bucket.off);
          gl.uniform1f(U.uInstanceBase, bucket.off);
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, verts, count);
          instances += count;
          draws++;
          continue;
        }
        for (let c = 0; c * chunkSize < count; c++) {
          const ext = chunks[c];
          const start = c * chunkSize;
          const end = Math.min(start + chunkSize, count);
          // An arc is visible if its span overlaps the viewport at all — the
          // apex of a long arc can cross the view with both feet off-screen.
          const visible = !ext || (ext[1] >= viewLo && ext[0] <= viewHi);
          if (visible) { if (runStart < 0) runStart = start; }
          else flush(start);
          if (end >= count) flush(end);
        }
        flush(count);
      }
      lastStats = { instances, draws };
      return lastStats;
    },

    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      for (const a of attribs) gl.deleteBuffer(a.buf);
      gl.deleteVertexArray(vao);
      gl.deleteProgram(program);
      // NOTE: no loseContext() here. A rebuild after a real context loss
      // reuses this same canvas, and force-losing the freshly restored
      // context would kill the replacement renderer as it is being born.
    },
  };
}

/** Local copy of the genre bucket bounds, to avoid a cross-module call per arc. */
const GENRE_ENDS = [5, 17, 22, 27, 39, 43, 44, 57, 65, 66];
function genreBucket(bookIndex) {
  for (let g = 0; g < GENRE_ENDS.length; g++) if (bookIndex < GENRE_ENDS[g]) return g;
  return GENRE_ENDS.length - 1;
}
