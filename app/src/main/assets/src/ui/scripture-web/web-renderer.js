/* ═══════════════════════════════════════════════════════════════════════
   scripture-web/web-renderer — Cluster F (bundle-d since lz1; lazy bundle-f before)

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

   Neither the height law (the structure law: every thread the half-ellipse
   of its own span, every thread drawn at every zoom) nor the fly-over leg
   is written here. Both are imported from utils/scripture-web/geometry.js
   as GLSL and inlined, because the CPU hit test applies the same laws — if
   either drifts,
   arcs stop being tappable where they look tappable, or start being tappable
   where nothing is drawn. Tests assert this shader contains them.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  arcShapeGLSL, flyOverGLSL, segmentsFor, CLIP_MARGIN, glslFloat,
  STROKE_MIN_CSS, STROKE_DEEP_CSS, skyLocalize,
} from '../../utils/scripture-web/geometry.js';
import { CENTRE_BRIGHT, CENTRE_WIDTH, FLYOVER_LEG_WIDTH } from '../../utils/scripture-web/sw-ink.js';
import { rampGLSL, cssColorToRGB } from '../../utils/scripture-web/palette.js';
import { bucketDrawCount, fansOf } from '../../utils/scripture-web/decode.js';
import { walkDrawnRuns } from '../../utils/scripture-web/chunk-walk.js';

/** Density steps, in the order the control cycles them. */
export const DENSITY_STEPS = ['essential', 'famous'];

const VERT = `#version 300 es
precision highp float;
uniform vec2  uRes;
uniform float uCamXHi, uCamXLo;  // the camera's x, split: hi = floor(x), lo = x - hi (float32 at the ceiling)
uniform float uPPV, uBase, uSquash, uLocalize;
uniform float uFlyLocalize;  // the fly-over leg's localize: the zoom's, let go as the camera rises (geometry.skyLocalize)
uniform float uCamY;         // the picture's shift down the frame, device px
uniform float uWidth, uAlpha, uTotal;
uniform float uSegments;
uniform float uVoteMix;      // 0 = votes drive alpha (overview), 1 = width (depth)
uniform vec2  uFocusRange;   // verse range kept lit (lo > hi = no focus)
uniform vec2  uFocusRange2;  // with uFocusRange: a GROUP, one foot in each, lit AND drawn
uniform float uFocusArc;     // TAPPED instance: spotlit AND dims everything else
uniform vec2  uCentre;       // the centre chapter, canon x [x0, x1) (x0 >= x1 = none): its own arcs are emphasised
uniform float uCentreT;      // the centre's emphasis ease, 0..1 (web-frame CentreChapter.t)
uniform float uHoverArc;     // HOVERED instance: brightened only, dims nothing
uniform float uInstanceBase; // gl_InstanceID offset of this draw range
uniform float uDpr;          // device px per CSS px: the chosen line's floor width is set in CSS px
in uint aFrom; in uint aTo; in float aVotes;
in float aFanA; in float aFanB; // each foot's departure rank, -0.5..0.5
// colour and half width are one per instance: flat, so nothing is interpolated
flat out vec4 vCol; out float vEdge; flat out float vHalfW;
${arcShapeGLSL}
${flyOverGLSL}
${rampGLSL()}
void main(){
  float a = float(aFrom), b = float(aTo);
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

  // The piece worth tessellating. At overview this is the whole arc, so the 1x
  // frame cannot move; as the reader localizes it closes onto the viewport,
  // because a 440,000 px arc spending 47 of its 48 segments off screen is what
  // draws the visible piece as one straight chord. Clipping moves only WHERE
  // the samples land — never the curve they land on. geometry.visibleWindow.
  float m = ${glslFloat(CLIP_MARGIN)};
  float lo = mix(left,  max(left,  -m),         uLocalize);
  float hi = mix(right, min(right, uRes.x + m), uLocalize);
  hi = max(hi, lo);

  // Ribbon: two vertices per segment step, offset along the curve normal.
  int vid = gl_VertexID;
  float t = float(vid >> 1) / uSegments;
  float side = float(vid & 1)*2. - 1.;
  float tau = mix(arcTau(lo, left, right), arcTau(hi, left, right), t);
  float px, hgt; vec2 tgv;
  arcAt(tau, left, right, A, px, hgt, tgv);
  // the baseline draws uCamY below the frame's base; pick.js adds the same
  vec2 p = vec2(px, uBase + uCamY - hgt);
  vec2 tg = normalize(tgv + vec2(1e-6, 0.));

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

  float id = float(gl_InstanceID) + uInstanceBase;
  float spot = (uFocusArc >= 0. && abs(id - uFocusArc) < .5) ? 1. : 0.;
  float hovered = (uHoverArc >= 0. && abs(id - uHoverArc) < .5) ? 1. : 0.;
  // The chosen line reads at every zoom: at least 2.4 CSS px wide (2 for a hovered one). At the
  // overview the stroke law gives ~0.9 px, and the reader lost the line they had just tapped
  // (sw1 B2, 2026-10-05). Drawing only; pick.js keeps its own hit width.
  halfW = max(halfW, max(spot*1.2, hovered*1.)*uDpr);
  // Thin-line hygiene: a ribbon under one device px wide aliases into dashes as it crosses
  // the pixel grid. Hold the half width at 0.5 device px and pay for the
  // extra width in alpha (thin), so a thin line puts the same ink on screen.
  float thin = clamp(halfW/.5, 0., 1.);
  halfW = max(halfW, .5);
  float hw = halfW + .5;                         // +0.5 px feather skirt: the antialias ramp's own half
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
  // Only a TAP darkens the rest of the web. Merely moving the mouse across
  // the dome must not blank the picture the reader is looking at.
  float focusing = (uFocusArc >= 0. || uFocusRange.x <= uFocusRange.y) ? 1. : 0.;
  float dim = mix(1., mix(.05, 1., lit), focusing);
  float bright = max(spot, hovered);

  // colour is distance, the one law (Corbin, 2026-09-10: genre and testament retired)
  vec3 col = distanceRamp(pow(abs(b - a)/uTotal, .40));
  col = mix(col, vec3(1.), hovered*(1. - spot)*.55);
  col = mix(col, vec3(.784, .643, .337), spot);  // the chosen line is the app's gold (#c8a456)

  float aStrength = mix(strength, 1., uVoteMix);
  // ...and nearly opaque: uAlpha at the overview is 0.075, so x3 left a tapped line at ~0.12.
  float aOut = uAlpha*dim*aStrength*mix(1., 3.0, bright)*mix(1., ${glslFloat(CENTRE_BRIGHT)}, cT)*thin;
  // past full ink the centre's boost lifts the colour instead, clamped
  col = min(col*max(aOut, 1.), vec3(1.));
  vCol = vec4(col, max(min(aOut, 1.), max(spot*.95, hovered*.7)));
  vEdge = side;
  vHalfW = halfW;
  gl_Position = vec4(p/uRes*2. - 1., 0, 1);
  gl_Position.y = -gl_Position.y;
}`;

const FRAG = `#version 300 es
precision mediump float;
flat in vec4 vCol; in float vEdge; flat in float vHalfW; out vec4 o;
void main(){
  float hw = vHalfW + .5;                         // the vertex stage's skirt
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
  for (const name of ['uRes', 'uCamXHi', 'uCamXLo', 'uCamY', 'uPPV', 'uBase', 'uSquash',
    'uLocalize', 'uFlyLocalize', 'uWidth', 'uAlpha', 'uTotal',
    'uSegments', 'uVoteMix', 'uFocusRange', 'uFocusArc',
    'uHoverArc', 'uInstanceBase', 'uFocusRange2', 'uCentre', 'uCentreT', 'uDpr']) {
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
  // Each foot's departure rank, the table the hit test reads too.
  const fans = fansOf(graph);
  attrib(fans.fanA, 'aFanA', gl.FLOAT, false, 4);
  attrib(fans.fanB, 'aFanB', gl.FLOAT, false, 4);

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
     * Paint the ground and nothing else: My Web draws its links in Canvas2D
     * over this, so a whole instanced pass at alpha 0 was a frame of vertex
     * work for one colour (refactor.md #10).
     * @param {string} bgColor  a CSS colour (the chrome's ground)
     */
    clear(bgColor) {
      if (lost) return;
      const bg = cssColorToRGB(bgColor);
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(bg[0], bg[1], bg[2], 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      lastStats = { instances: 0, draws: 0 };
    },

    /**
     * Draw one frame.
     * @param {{width:number, height:number, base:number, ceil:number,
     *   squash:number, localize:number, camX:number, camY?:number, ppv:number,
     *   strokeWidth:number, alpha:number, voteMix?:number, dpr?:number,
     *   density:import('../../utils/scripture-web/decode.js').Density,
     *   bg:string,
     *   focusRange:(number[]|null), focusRange2?:(number[]|null), focusArc:number, hoverArc?:number,
     *   centre?:(import('../../utils/scripture-web/web-frame.js').CentreChapter|null)}} v
     *   centre: the centre chapter (web-frame.centreOf over centreRange), its own arcs emphasised
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
      // split for float32 (the vertex stage's feet): hi whole, lo the rest
      const camXHi = Math.floor(v.camX);
      gl.uniform1f(U.uCamXHi, camXHi);
      gl.uniform1f(U.uCamXLo, v.camX - camXHi);
      gl.uniform1f(U.uCamY, v.camY > 0 ? v.camY : 0);
      gl.uniform1f(U.uPPV, v.ppv);
      gl.uniform1f(U.uBase, v.base);
      gl.uniform1f(U.uSquash, v.squash);
      gl.uniform1f(U.uLocalize, v.localize);
      gl.uniform1f(U.uFlyLocalize, skyLocalize(v.localize, v.camY > 0 ? v.camY : 0, v.ceil));
      gl.uniform1f(U.uWidth, v.strokeWidth);
      gl.uniform1f(U.uDpr, v.dpr || 1);
      gl.uniform1f(U.uAlpha, v.alpha);
      gl.uniform1f(U.uTotal, graph.total);
      gl.uniform1f(U.uVoteMix, v.voteMix || 0);
      gl.uniform1f(U.uFocusArc, v.focusArc == null ? -1 : v.focusArc);
      if (v.centre && v.centre.x0 < v.centre.x1) {
        gl.uniform2f(U.uCentre, v.centre.x0, v.centre.x1);
        gl.uniform1f(U.uCentreT, v.centre.t > 0 ? Math.min(1, v.centre.t) : 0);
      } else {
        gl.uniform2f(U.uCentre, 1, 0);
        gl.uniform1f(U.uCentreT, 0);
      }
      gl.uniform1f(U.uHoverArc, v.hoverArc == null ? -1 : v.hoverArc);
      if (v.focusRange) gl.uniform2f(U.uFocusRange, v.focusRange[0], v.focusRange[1]);
      else gl.uniform2f(U.uFocusRange, 1, 0);
      if (v.focusRange && v.focusRange2) gl.uniform2f(U.uFocusRange2, v.focusRange2[0], v.focusRange2[1]);
      else gl.uniform2f(U.uFocusRange2, 1, 0);

      // Viewport verse range, for chunk culling - with a verse of slack each
      // side: a foot stands anywhere in its verse's cell (geometry.footX), so
      // a chunk whose last verse is just left of the frame can still put a
      // foot inside it (the refuter, 2026-09-22).
      const viewLo = v.camX - (v.width / 2) / v.ppv - 1;
      const viewHi = v.camX + (v.width / 2) / v.ppv + 1;
      const chunkSize = graph.chunkSize || 256;

      let instances = 0, draws = 0;
      for (let bi = 0; bi < graph.buckets.length; bi++) {
        const bucket = graph.buckets[bi];
        const count = bucketDrawCount(bucket, v.density);
        if (count <= 0) continue;
        // Segments from what this bucket can put ON SCREEN, not from its span.
        const segments = segmentsFor(bucket.segments, v.localize,
          bucketMaxSpan[bi] * v.ppv * 0.5, v.ceil, v.width, v.dpr || 1, v.squash);
        gl.uniform1f(U.uSegments, segments);
        const verts = 2 * (segments + 1);
        // One draw per run of adjacent visible chunks (chunk-walk.js; a
        // bucket without chunks is one run of its whole count).
        walkDrawnRuns(bucket, count, chunkSize, viewLo, viewHi, (start, end) => {
          const n = end - start;
          pointInstances(start);
          gl.uniform1f(U.uInstanceBase, start);
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, verts, n);
          instances += n;
          draws++;
        });
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
