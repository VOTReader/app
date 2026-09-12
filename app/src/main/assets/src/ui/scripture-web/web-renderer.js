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
     · Two regimes, chosen per camera by how many candidates the frame's
       rectangle admits (utils/scripture-web/index.js). At the overview the
       whole buckets draw from the static buffers, culled per 256-instance
       chunk by verse extent. Once the index's windows fit GATHER_MAX the
       exact visible set is gathered into dynamic buffers and only that is
       submitted: 142 instances at the phone's 44 px ceiling where the chunk
       cull submitted 18,944 (Corbin, 2026-09-11: "other lines that aren't
       even close to user screen don't continually update and hog
       resources"). Nothing is gathered twice for one camera.

   The law is not written here. It is imported from
   utils/scripture-web/geometry.js as GLSL and inlined, because the CPU hit
   test applies the same law — if it drifts, arcs stop being tappable where
   they look tappable. Tests assert this shader contains it. The world is
   fixed (a thread's height is its span) and the camera has two axes: uCamX
   and uCamY place the frame over it, and sampleTau spends each strip's
   segments on the piece of the thread that is inside the frame's band.
   ═══════════════════════════════════════════════════════════════════════ */

import {
  threadShapeGLSL, voteStrengthGLSL, glslFloat, segmentsFor, CLIP_MARGIN,
  STROKE_MIN_CSS, STROKE_DEEP_CSS, STRENGTH_FLOOR, worldRect,
} from '../../utils/scripture-web/geometry.js';
import { rampGLSL, cssColorToRGB } from '../../utils/scripture-web/palette.js';
import { bucketDrawCount, slotsOf } from '../../utils/scripture-web/decode.js';
import { indexOf, windowSize, gather } from '../../utils/scripture-web/index.js';

/**
 * The gathered regime's capacity, instances — and the walk budget per camera
 * change, since the list is filled by a walk over the index's windows and a
 * window that fits here cannot overflow it. Measured on the shipped asset,
 * phone landscape, Famous: the windows hold 17,509 candidates at 16x (11,557
 * visible) and 26,986 at 8x (17,042 visible), so 16x and deeper gather and 8x
 * and wider draw whole buckets. 320 KB of dynamic buffers.
 */
export const GATHER_MAX = 20480;

/** Colour modes, in the order the control cycles them. */
export const COLOR_MODES = ['distance', 'testament', 'genre'];
/** Density steps, in the order the control cycles them. */
export const DENSITY_STEPS = ['essential', 'famous'];

const VERT = `#version 300 es
precision highp float;
uniform vec2  uRes;
uniform float uCamX, uPPV, uBase, uSquash, uCamY;
uniform float uWidth, uAlpha, uTotal, uNT, uColorMode, uLightness;
uniform float uSegments;
uniform float uVoteMix;      // 0 = votes drive alpha (overview), 1 = width (depth)
uniform vec2  uFocusRange;   // verse range kept lit (lo > hi = no focus)
uniform float uFocusArc;     // TAPPED instance: spotlit AND dims everything else
uniform float uHoverArc;     // HOVERED instance: brightened only, dims nothing
in uint aFrom; in uint aTo; in float aVotes; in float aGenre;
in float aId;                // the instance's position in the asset — its identity for the spotlight
in float aSlotA; in float aSlotB; // departure slots, 0..1 across the foot's verse cell (decode.assignSlots)
out vec4 vCol; out float vEdge; out float vHalfW;
${threadShapeGLSL}
${voteStrengthGLSL}
${rampGLSL()}
void main(){
  float a = float(aFrom), b = float(aTo);
  // The feet stand at their departure slots inside the verse cell; the focus
  // range and the distance colour below keep the integer verse.
  float x0 = (a + aSlotA - uCamX)*uPPV + uRes.x*.5;
  float x1 = (b + aSlotB - uCamX)*uPPV + uRes.x*.5;
  float rx = (x1 - x0)*.5;
  float cx = x0 + rx;
  float r = max(rx, 0.);
  float left = cx - r, right = cx + r;
  vec2 sh = threadShape(rx, uSquash);
  float R = sh.x, A = sh.y;
  float P = 3.14159265;

  // The frame's band, device px above the WORLD baseline: the camera's height
  // at the baseline row, up to the canvas's top edge.
  float hOff = uCamY*uPPV*uSquash;
  float hLo = hOff, hHi = hOff + uBase;

  // The x window: a 440,000 px arc spending 47 of its 48 segments off screen
  // is what draws the visible piece as one straight chord, so the parameter
  // range is cut to the viewport (plus a margin). At fit every foot is inside
  // the frame and the window is the whole arc, so the 1x frame cannot move.
  float m = ${CLIP_MARGIN}.;
  float lo = max(left, -m);
  float hi = max(min(right, uRes.x + m), lo);
  float txLo = arcTau(lo, left, right, R, P), txHi = arcTau(hi, left, right, R, P);

  // At depth every ribbon needs the full alpha to clear 3:1 alone, so votes
  // can no longer ride on alpha; they drive WIDTH instead.
  float strength = voteStrength(aVotes);
  float wScale = mix(1., mix(${glslFloat(STROKE_MIN_CSS / STROKE_DEEP_CSS)}, 1.,
    (strength - ${glslFloat(STRENGTH_FLOOR)})/${glslFloat(1 - STRENGTH_FLOOR)}), uVoteMix);
  float halfW = uWidth*.5*wScale;
  float hw = halfW + 1.0;                        // +1px feather skirt

  // Ribbon: two vertices per segment step, offset along the curve normal, the
  // parameter spent on the piece inside the band (geometry.sampleTau).
  int vid = gl_VertexID;
  float t = float(vid >> 1) / uSegments;
  float side = float(vid & 1)*2. - 1.;
  float tau = sampleTau(t, A, P, hLo, hHi, hw, txLo, txHi);
  float px, hgt; vec2 tgv;
  arcAt(tau, left, right, R, A, P, px, hgt, tgv);
  vec2 p = vec2(px, uBase - (hgt - hOff));
  vec2 tg = normalize(tgv + vec2(1e-6, 0.));
  p += vec2(-tg.y, tg.x)*side*hw;

  float id = aId;
  float spot = (uFocusArc >= 0. && abs(id - uFocusArc) < .5) ? 1. : 0.;
  float hovered = (uHoverArc >= 0. && abs(id - uHoverArc) < .5) ? 1. : 0.;
  float inRange = (uFocusRange.x <= uFocusRange.y &&
      ((a >= uFocusRange.x && a <= uFocusRange.y) ||
       (b >= uFocusRange.x && b <= uFocusRange.y))) ? 1. : 0.;
  float lit = max(spot, inRange);
  // Only a TAP darkens the rest of the web. Merely moving the mouse across
  // the dome must not blank the picture the reader is looking at.
  float focusing = (uFocusArc >= 0. || uFocusRange.x <= uFocusRange.y) ? 1. : 0.;
  float dim = mix(1., mix(.05, 1., lit), focusing);
  float bright = max(spot, hovered);

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
  for (const name of ['uRes', 'uCamX', 'uPPV', 'uBase', 'uSquash',
    'uCamY', 'uWidth', 'uAlpha', 'uTotal', 'uNT', 'uColorMode',
    'uLightness', 'uSegments', 'uVoteMix', 'uFocusRange', 'uFocusArc',
    'uHoverArc']) {
    U[name] = gl.getUniformLocation(program, name);
  }

  // Narrowest and widest arc in each bucket, once. Tessellation is chosen per
  // draw from the camera, and a bucket of 3-verse arcs must not be given 96
  // segments because a bucket of 10,000-verse ones needs them — nor the other
  // way round: the member whose apex sits at the frame's top costs the most.
  const bucketSpan = graph.buckets.map((b) => {
    let lo = Infinity, hi = 0;
    const end = b.off + b.len;
    for (let i = b.off; i < end; i++) {
      const s = Math.abs(graph.to[i] - graph.from[i]);
      if (s > hi) hi = s;
      if (s < lo) lo = s;
    }
    return [lo === Infinity ? 0 : lo, hi];
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
  // The seven per-instance streams, in one order for both regimes. Uint16
  // verse ids widen to uint in the shader; votes stay signed; the id is a
  // float (63,418 < 2^24, exact); the slots are bytes the GPU normalises
  // to 0..1.
  const ids = new Float32Array(graph.count);
  for (let i = 0; i < graph.count; i++) ids[i] = i;
  const slots = slotsOf(graph);
  const STREAMS = [
    { name: 'aFrom', type: gl.UNSIGNED_SHORT, isInt: true, norm: false, bytes: 2, Ctor: Uint16Array, data: graph.from },
    { name: 'aTo', type: gl.UNSIGNED_SHORT, isInt: true, norm: false, bytes: 2, Ctor: Uint16Array, data: graph.to },
    { name: 'aVotes', type: gl.FLOAT, isInt: false, norm: false, bytes: 4, Ctor: Float32Array, data: new Float32Array(graph.votes) },
    { name: 'aGenre', type: gl.FLOAT, isInt: false, norm: false, bytes: 4, Ctor: Float32Array, data: genre },
    { name: 'aId', type: gl.FLOAT, isInt: false, norm: false, bytes: 4, Ctor: Float32Array, data: ids },
    { name: 'aSlotA', type: gl.UNSIGNED_BYTE, isInt: false, norm: true, bytes: 1, Ctor: Uint8Array, data: slots.slotA },
    { name: 'aSlotB', type: gl.UNSIGNED_BYTE, isInt: false, norm: true, bytes: 1, Ctor: Uint8Array, data: slots.slotB },
  ];
  /** @typedef {Array<{buf:WebGLBuffer, loc:number, type:number, isInt:boolean, norm:boolean, bytes:number}>} AttribSet */
  /** One buffer per stream: the whole asset (STATIC_DRAW) or GATHER_MAX empty slots (DYNAMIC_DRAW). */
  const attribSet = (fill) => STREAMS.map((s) => {
    const loc = gl.getAttribLocation(program, s.name);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    if (fill) gl.bufferData(gl.ARRAY_BUFFER, s.data, gl.STATIC_DRAW);
    else gl.bufferData(gl.ARRAY_BUFFER, GATHER_MAX * s.bytes, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribDivisor(loc, 1);
    return { buf, loc, type: s.type, isInt: s.isInt, norm: s.norm, bytes: s.bytes };
  });
  const statics = attribSet(true);
  const dynamics = attribSet(false);
  const staging = STREAMS.map((s) => new s.Ctor(GATHER_MAX));

  /**
   * Point every instance attribute at `first` of one set.
   *
   * WebGL2's drawArraysInstanced has NO base-instance parameter — instance
   * data is always read from the start of the bound range. Drawing a
   * sub-range therefore means re-pointing the attributes at a byte offset,
   * not just passing a different first index. Getting this wrong silently
   * draws the WRONG arcs (every bucket rendering instance 0..n), which is
   * exactly what it did before this existed.
   * @param {AttribSet} set @param {number} first
   */
  let pointedSet = null, pointedAt = -1;
  const pointInstances = (set, first) => {
    if (set === pointedSet && first === pointedAt) return;
    pointedSet = set;
    pointedAt = first;
    for (const a of set) {
      gl.bindBuffer(gl.ARRAY_BUFFER, a.buf);
      if (a.isInt) gl.vertexAttribIPointer(a.loc, 1, a.type, 0, first * a.bytes);
      else gl.vertexAttribPointer(a.loc, 1, a.type, a.norm, 0, first * a.bytes);
    }
  };
  pointInstances(statics, 0);

  /**
   * The regime for a camera, memoised on everything the rectangle reads: a
   * frame at the same camera gathers nothing and uploads nothing. Past
   * GATHER_MAX candidates the whole buckets are cheaper than the list.
   * @type {{mode:'static'|'gathered', window:number, visible?:number, visited?:number}}
   */
  let plan = { mode: 'static', window: 0 };
  let planKey = '';
  const list = { ids: new Uint32Array(GATHER_MAX), count: 0, visited: 0 };
  /** Runs of the gathered list by bucket (the walk hands positions over bucket-major). */
  let groups = [];
  const idx = indexOf(graph);
  const planFor = (v) => {
    const key = [v.camX, v.camY || 0, v.ppv, v.density, v.width, v.base, v.squash].join(',');
    if (key === planKey) return plan;
    planKey = key;
    const rect = worldRect({ x: v.camX, y: v.camY || 0, ppv: v.ppv, total: graph.total }, v.width, v.base, v.squash);
    const window = windowSize(graph, idx, rect, v.density);
    if (window > GATHER_MAX) {
      plan = { mode: 'static', window };
      return plan;
    }
    gather(graph, idx, rect, v.density, list);
    groups = [];
    let bi = 0, first = 0;
    for (let k = 0; k < list.count; k++) {
      const p = list.ids[k];
      while (p >= graph.buckets[bi].off + graph.buckets[bi].len) {
        if (k > first) groups.push({ bucket: bi, first, n: k - first });
        first = k;
        bi++;
      }
      staging[0][k] = graph.from[p];
      staging[1][k] = graph.to[p];
      staging[2][k] = graph.votes[p];
      staging[3][k] = genre[p];
      staging[4][k] = p;
      staging[5][k] = slots.slotA[p];
      staging[6][k] = slots.slotB[p];
    }
    if (list.count > first) groups.push({ bucket: bi, first, n: list.count - first });
    for (let i = 0; i < STREAMS.length; i++) {
      gl.bindBuffer(gl.ARRAY_BUFFER, dynamics[i].buf);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, staging[i].subarray(0, list.count));
    }
    plan = { mode: 'gathered', window, visible: list.count, visited: list.visited };
    return plan;
  };

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

  /** @type {{mode:string, submitted:number, draws:number, window:number, visible?:number, visited?:number}} */
  let lastStats = { mode: 'static', submitted: 0, draws: 0, window: 0 };

  return {
    gl,
    get contextLost() { return lost; },
    get stats() { return lastStats; },

    /**
     * Draw one frame.
     * @param {{width:number, height:number, base:number, ceil:number,
     *   squash:number, camX:number, camY?:number, ppv:number, zoom?:number,
     *   strokeWidth:number, alpha:number, voteMix?:number, dpr?:number,
     *   colorMode:string,
     *   density:import('../../utils/scripture-web/decode.js').Density,
     *   light:boolean, bg:string,
     *   focusRange:(number[]|null), focusArc:number, hoverArc?:number}} v
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
      gl.uniform1f(U.uPPV, v.ppv);
      gl.uniform1f(U.uBase, v.base);
      gl.uniform1f(U.uSquash, v.squash);
      gl.uniform1f(U.uCamY, v.camY || 0);
      gl.uniform1f(U.uWidth, v.strokeWidth);
      gl.uniform1f(U.uAlpha, v.alpha);
      gl.uniform1f(U.uTotal, graph.total);
      gl.uniform1f(U.uNT, ntStart);
      gl.uniform1f(U.uColorMode, COLOR_MODES.indexOf(v.colorMode));
      gl.uniform1f(U.uLightness, v.light ? 0.72 : 1);
      gl.uniform1f(U.uVoteMix, v.voteMix || 0);
      gl.uniform1f(U.uFocusArc, v.focusArc == null ? -1 : v.focusArc);
      gl.uniform1f(U.uHoverArc, v.hoverArc == null ? -1 : v.hoverArc);
      if (v.focusRange) gl.uniform2f(U.uFocusRange, v.focusRange[0], v.focusRange[1]);
      else gl.uniform2f(U.uFocusRange, 1, 0);

      // Segments from what this bucket can put ON SCREEN, not from its span;
      // 2 * (segments + 1) vertices per strip.
      const vertsFor = (bi) => {
        const bucket = graph.buckets[bi];
        const segments = segmentsFor(bucket.segments, v.zoom || 1,
          bucketSpan[bi][0] * v.ppv * 0.5, bucketSpan[bi][1] * v.ppv * 0.5,
          v.squash, v.base, v.width, v.dpr || 1);
        gl.uniform1f(U.uSegments, segments);
        return 2 * (segments + 1);
      };

      const p = planFor(v);
      let submitted = 0, draws = 0;
      if (p.mode === 'gathered') {
        // The exact visible set, one draw per bucket it touches.
        for (const grp of groups) {
          const verts = vertsFor(grp.bucket);
          pointInstances(dynamics, grp.first);
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, verts, grp.n);
          submitted += grp.n;
          draws++;
        }
        lastStats = { mode: 'gathered', submitted, draws, window: p.window, visible: p.visible, visited: p.visited };
        return lastStats;
      }

      // Whole buckets: viewport verse range, for chunk culling.
      const viewLo = v.camX - (v.width / 2) / v.ppv;
      const viewHi = v.camX + (v.width / 2) / v.ppv;
      const chunkSize = graph.chunkSize || 256;
      for (let bi = 0; bi < graph.buckets.length; bi++) {
        const bucket = graph.buckets[bi];
        const count = bucketDrawCount(bucket, v.density);
        if (count <= 0) continue;
        const verts = vertsFor(bi);
        // Walk chunks, coalescing adjacent visible ones into single draws.
        const chunks = bucket.chunks || [];
        let runStart = -1;
        const flush = (endExclusive) => {
          if (runStart < 0) return;
          const first = runStart;
          const n = endExclusive - first;
          if (n > 0) {
            pointInstances(statics, bucket.off + first);
            gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, verts, n);
            submitted += n;
            draws++;
          }
          runStart = -1;
        };
        if (!chunks.length) {
          pointInstances(statics, bucket.off);
          gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, verts, count);
          submitted += count;
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
      lastStats = { mode: 'static', submitted, draws, window: p.window };
      return lastStats;
    },

    dispose() {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      for (const a of statics) gl.deleteBuffer(a.buf);
      for (const a of dynamics) gl.deleteBuffer(a.buf);
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
