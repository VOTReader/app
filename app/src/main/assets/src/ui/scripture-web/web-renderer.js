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

   Neither the height law nor the fly-over cull is written here. Both are
   imported from utils/scripture-web/geometry.js as GLSL and inlined, because
   the CPU hit test applies the same two laws — if either drifts, arcs stop
   being tappable where they look tappable, or start being tappable where
   nothing is drawn. Tests assert this shader contains them.
   ═══════════════════════════════════════════════════════════════════════ */

import { arcRadiusGLSL, flyOverGLSL } from '../../utils/scripture-web/geometry.js';
import { rampGLSL, cssColorToRGB } from '../../utils/scripture-web/palette.js';
import { bucketDrawCount } from '../../utils/scripture-web/decode.js';

/** Colour modes, in the order the control cycles them. */
export const COLOR_MODES = ['distance', 'testament', 'genre'];
/** Density steps, in the order the control cycles them. */
export const DENSITY_STEPS = ['essential', 'famous'];

const VERT = `#version 300 es
precision highp float;
uniform vec2  uRes;
uniform float uCamX, uPPV, uBase, uCeil, uSquash, uLocalize;
uniform float uWidth, uAlpha, uTotal, uNT, uColorMode, uLightness;
uniform float uSegments;
uniform vec2  uFocusRange;   // verse range kept lit (lo > hi = no focus)
uniform float uFocusArc;     // TAPPED instance: spotlit AND dims everything else
uniform float uHoverArc;     // HOVERED instance: brightened only, dims nothing
uniform float uInstanceBase; // gl_InstanceID offset of this draw range
in uint aFrom; in uint aTo; in float aVotes; in float aGenre;
out vec4 vCol; out float vEdge;
${arcRadiusGLSL}
${flyOverGLSL}
${rampGLSL()}
void main(){
  float a = float(aFrom), b = float(aTo);
  float x0 = (a - uCamX)*uPPV + uRes.x*.5;
  float x1 = (b - uCamX)*uPPV + uRes.x*.5;
  float rx = (x1 - x0)*.5;
  float cx = x0 + rx;
  float ry = arcRadiusY(rx, uCeil, uSquash, uLocalize);

  // Ribbon: two vertices per segment step, offset along the curve normal.
  int vid = gl_VertexID;
  float t = float(vid >> 1) / uSegments;
  float side = float(vid & 1)*2. - 1.;
  float th = 3.14159265*(1. - t);
  vec2 p = vec2(cx + rx*cos(th), uBase - ry*sin(th));
  vec2 tg = normalize(vec2(-rx*sin(th), -ry*cos(th)) + vec2(1e-6, 0.));
  float hw = uWidth*.5 + 1.0;                    // +1px feather skirt
  p += vec2(-tg.y, tg.x)*side*hw;

  float id = float(gl_InstanceID) + uInstanceBase;
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

  // Semantic zoom: once the reader is inside a passage, arcs merely passing
  // overhead recede so the local weave is legible instead of fogged. At FULL
  // depth they are culled outright — the tanh ceiling flattens every big
  // arc's apex to the same height, so hundreds of fly-overs otherwise stack
  // into horizontal smears across the view (the on-device report).
  // The law lives in geometry.js, inlined above, because pick.js applies the
  // same test — an arc faded to nothing here must not win a tap there.
  dim *= flyOverDim(arcAnchored(x0, x1, uRes.x), uLocalize);

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

  float strength = clamp(aVotes/70., .30, 1.);
  vCol = vec4(col, uAlpha*dim*strength*mix(1., 3.0, bright));
  vEdge = side;
  gl_Position = vec4(p/uRes*2. - 1., 0, 1);
  gl_Position.y = -gl_Position.y;
}`;

const FRAG = `#version 300 es
precision highp float;
uniform float uWidth;
in vec4 vCol; in float vEdge; out vec4 o;
void main(){
  float hw = uWidth*.5 + 1.0;
  float d = abs(vEdge)*hw;
  float aa = 1.0 - smoothstep(uWidth*.5 - .5, uWidth*.5 + .5, d);
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
 * @param {{onContextRestored?: () => void}} [opts]
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
  for (const name of ['uRes', 'uCamX', 'uPPV', 'uBase', 'uCeil', 'uSquash',
    'uLocalize', 'uWidth', 'uAlpha', 'uTotal', 'uNT', 'uColorMode',
    'uLightness', 'uSegments', 'uFocusRange', 'uFocusArc', 'uHoverArc',
    'uInstanceBase']) {
    U[name] = gl.getUniformLocation(program, name);
  }

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
  let lost = false;
  const onLost = (e) => { e.preventDefault(); lost = true; };
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
     *   squash:number, localize:number, camX:number, ppv:number,
     *   strokeWidth:number, alpha:number, colorMode:string,
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
      gl.uniform1f(U.uCeil, v.ceil);
      gl.uniform1f(U.uSquash, v.squash);
      gl.uniform1f(U.uLocalize, v.localize);
      gl.uniform1f(U.uWidth, v.strokeWidth);
      gl.uniform1f(U.uAlpha, v.alpha);
      gl.uniform1f(U.uTotal, graph.total);
      gl.uniform1f(U.uNT, ntStart);
      gl.uniform1f(U.uColorMode, COLOR_MODES.indexOf(v.colorMode));
      gl.uniform1f(U.uLightness, v.light ? 0.72 : 1);
      gl.uniform1f(U.uFocusArc, v.focusArc == null ? -1 : v.focusArc);
      gl.uniform1f(U.uHoverArc, v.hoverArc == null ? -1 : v.hoverArc);
      if (v.focusRange) gl.uniform2f(U.uFocusRange, v.focusRange[0], v.focusRange[1]);
      else gl.uniform2f(U.uFocusRange, 1, 0);

      // Viewport verse range, for chunk culling.
      const viewLo = v.camX - (v.width / 2) / v.ppv;
      const viewHi = v.camX + (v.width / 2) / v.ppv;
      const chunkSize = graph.chunkSize || 256;

      let instances = 0, draws = 0;
      for (const bucket of graph.buckets) {
        const count = bucketDrawCount(bucket, v.density);
        if (count <= 0) continue;
        gl.uniform1f(U.uSegments, bucket.segments);
        const verts = 2 * (bucket.segments + 1);
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
