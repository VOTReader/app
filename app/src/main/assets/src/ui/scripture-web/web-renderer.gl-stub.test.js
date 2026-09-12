/* web-renderer.gl-stub.test.js — the counter in the draw path (w-sw-phase1, M2).
   ─────────────────────────────────────────────────────────────────────────
   Corbin, 2026-09-11: "other lines that aren't even close to user screen
   don't continually update and hog resources." The proof the plan
   registers is the instance count SUBMITTED against the corpus at each
   zoom, read from the renderer's own stats — a counter in the draw path,
   asserted here, not a claim. jsdom has no WebGL2, so the renderer is
   driven through a fake `gl` that records every drawArraysInstanced and
   bufferSubData; the SHIPPED asset is decoded with the tree's own decoder so
   the numbers are the corpus's, not a fixture's.

   The camera rows are the plan's (sessions/2026-09-11-orchestrator/
   plan-sw-phase1.md section (b)): phone landscape 800x360 at DPR 2 (frame
   base 520, squash 0.64), Famous, centre verse 15,000: at fit every one of
   the 63,418 threads; at the 44 px ceiling 142 threads have a piece on
   screen (141 were anchored under the old law); at 132 px, 37.
   MEASURED FIRST on the tree the RED was cut on: at the ceiling the chunk
   cull submits every instance in the buckets whose extents touch the
   viewport — the number this file exists to bring down. */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { createRenderer } from './web-renderer.js';
import { decodeGraph } from '../../utils/scripture-web/decode.js';
import { squashFactor } from '../../utils/scripture-web/geometry.js';

const here = dirname(fileURLToPath(import.meta.url));
const ASSET = resolve(here, '../../data/scripture-web-data.js');

/** The shipped asset, decoded once: 63,418 threads over 31,102 verses. */
let graph = null;
beforeAll(() => {
  const src = fs.readFileSync(ASSET, 'utf8');
  const m = /var SCRIPTURE_WEB_DATA = (\{[\s\S]*\});?\s*$/.exec(src);
  if (!m) throw new Error('the asset did not parse: nothing below is about the corpus');
  const data = JSON.parse(m[1]);
  graph = decodeGraph(data);
  graph.chunkSize = data.chunkSize || 256;
});

/**
 * A WebGL2 stand-in: every method the renderer calls, recording the two
 * that carry the claim. Uniform locations are their names, attribute
 * locations their index, so a recorded call reads like the source.
 */
function fakeGL() {
  const rec = { draws: [], subData: [], uniforms: {} };
  let attribs = 0;
  const gl = {
    rec,
    VERTEX_SHADER: 1, FRAGMENT_SHADER: 2, COMPILE_STATUS: 3, LINK_STATUS: 4,
    ARRAY_BUFFER: 5, STATIC_DRAW: 6, DYNAMIC_DRAW: 7, UNSIGNED_SHORT: 8, FLOAT: 9,
    DEPTH_TEST: 10, BLEND: 11, COLOR_BUFFER_BIT: 12, ONE: 13, ONE_MINUS_SRC_ALPHA: 14,
    TRIANGLE_STRIP: 15, UNSIGNED_INT: 16,
    createProgram: () => ({}), createShader: () => ({}), shaderSource() {}, compileShader() {},
    getShaderParameter: () => true, attachShader() {}, linkProgram() {}, deleteShader() {},
    getProgramParameter: () => true, useProgram() {}, deleteProgram() {},
    getUniformLocation: (_p, name) => name,
    createVertexArray: () => ({}), bindVertexArray() {}, deleteVertexArray() {},
    getAttribLocation: () => attribs++,
    createBuffer: () => ({ id: Math.random() }), bindBuffer() {}, deleteBuffer() {},
    bufferData() {},
    bufferSubData: (_t, offset, view) => { rec.subData.push({ offset, bytes: view.byteLength }); },
    enableVertexAttribArray() {}, disableVertexAttribArray() {}, vertexAttribDivisor() {},
    vertexAttribIPointer() {}, vertexAttribPointer() {}, vertexAttrib1f() {},
    disable() {}, enable() {}, viewport() {}, clearColor() {}, clear() {}, blendFunc() {},
    uniform1f: (name, v) => { rec.uniforms[name] = v; },
    uniform2f: (name, a, b) => { rec.uniforms[name] = [a, b]; },
    drawArraysInstanced: (_mode, _first, verts, n) => { rec.draws.push({ verts, n }); },
  };
  return gl;
}

function fakeCanvas(gl) {
  return { getContext: () => gl, addEventListener() {}, removeEventListener() {} };
}

/** The phone landscape frame at DPR 2: what ScriptureWebScreen's frame() computes for 800x360. */
const W = 1600, H = 720, BASE = 520, CEIL = 512.2;
const SQUASH = squashFactor(CEIL, W);   // 0.64
const fit = () => W / 31102;

function drawAt(r, ppv, camY, density, camX = 15000) {
  return r.draw({
    width: W, height: H, base: BASE, ceil: CEIL, squash: SQUASH,
    camX, camY, ppv, zoom: ppv / fit(),
    strokeWidth: 2, alpha: 0.5, voteMix: 0, dpr: 2,
    colorMode: 'distance', density, light: false, bg: '#000',
    focusRange: null, focusArc: -1, hoverArc: -1,
  });
}

describe('the counter in the draw path: instances submitted against the corpus', () => {
  it('PRECONDITION and CONTROL (green before the fix): the stub drives the renderer — at fit every thread is drawn, 63,418, with no per-frame upload', () => {
    const gl = fakeGL();
    const r = createRenderer(fakeCanvas(gl), graph);
    expect(r, 'createRenderer accepted the stub').not.toBeNull();
    // at fit the clamp centres the camera (total / 2); 15,000 would leave the last 550 verses off the right edge
    drawAt(r, fit(), 0, 'famous', 31102 / 2);
    const submitted = gl.rec.draws.reduce((n, d) => n + d.n, 0);
    expect(submitted, 'instances drawn at fit').toBe(63418);
    expect(gl.rec.subData.length, 'bufferSubData calls at fit').toBe(0);
  });

  it('the stats name the regime and the count: at fit, mode static, 63,418 submitted, the window is every candidate', () => {
    const gl = fakeGL();
    const r = createRenderer(fakeCanvas(gl), graph);
    const stats = drawAt(r, fit(), 0, 'famous', 31102 / 2);
    expect(stats.mode).toBe('static');
    expect(stats.submitted, 'stats.submitted agrees with the recorded draws').toBe(gl.rec.draws.reduce((n, d) => n + d.n, 0));
    expect(stats.submitted).toBe(63418);
    expect(stats.draws).toBe(gl.rec.draws.length);
    expect(stats.window, 'the windows at fit hold every thread twice, less the ones a single window covers').toBeGreaterThan(63418);
    expect('visible' in stats, 'static mode does not count: absence is the signal, never a 0').toBe(false);
  });

  it('at the 44 px ceiling the renderer submits the 142 threads with a piece on screen, not every chunk that touches the viewport', () => {
    const gl = fakeGL();
    const r = createRenderer(fakeCanvas(gl), graph);
    const stats = drawAt(r, 88, 0, 'famous');
    const submitted = gl.rec.draws.reduce((n, d) => n + d.n, 0);
    expect(submitted, 'instances submitted at the phone ceiling').toBe(142);
    expect(stats.submitted).toBe(142);
    expect(stats.visible).toBe(142);
    expect(stats.mode).toBe('gathered');
    expect(gl.rec.draws.length, 'draw calls (one per bucket with members, at most)').toBeLessThanOrEqual(8);
    expect(stats.visited, 'candidates examined').toBeLessThanOrEqual(160);
    expect(stats.window).toBe(stats.visited);
    expect(stats.draws).toBe(gl.rec.draws.length);
    expect(gl.rec.subData.length, 'one upload per instance stream (from, to, votes, genre, id)').toBe(5);
  });

  it('the gathered list is uploaded once per camera, not once per frame', () => {
    const gl = fakeGL();
    const r = createRenderer(fakeCanvas(gl), graph);
    drawAt(r, 88, 0, 'famous');
    const after1 = gl.rec.subData.length;
    drawAt(r, 88, 0, 'famous');
    expect(gl.rec.subData.length, 'a second frame at the same camera uploads nothing').toBe(after1);
    drawAt(r, 88, 0.5, 'famous');
    expect(gl.rec.subData.length, 'a moved camera uploads again').toBe(after1 + 5);
  });

  it('at 132 px per verse: 37 on the phone frame; Essential at the ceiling: 15', () => {
    const gl = fakeGL();
    const r = createRenderer(fakeCanvas(gl), graph);
    expect(drawAt(r, 264, 0, 'famous').submitted).toBe(37);
    expect(drawAt(r, 88, 0, 'essential').submitted).toBe(15);
  });

  it('a camera raised ten band heights at the ceiling submits the 113 threads whose stems cross that band', () => {
    const gl = fakeGL();
    const r = createRenderer(fakeCanvas(gl), graph);
    const band = BASE / (88 * SQUASH);            // 9.23 verses
    const stats = drawAt(r, 88, 10 * band, 'famous');
    expect(stats.submitted).toBe(113);
    expect(gl.rec.uniforms.uCamY, 'the y camera reached the shader').toBeCloseTo(10 * band, 9);
  });

  it('the regime switch is by the window, not by zoom: 16x gathers 11,557 and 8x stays static', () => {
    const gl = fakeGL();
    const r = createRenderer(fakeCanvas(gl), graph);
    const s16 = drawAt(r, fit() * 16, 0, 'famous');
    expect(s16.mode).toBe('gathered');
    expect(s16.submitted).toBe(11557);
    const s8 = drawAt(r, fit() * 8, 0, 'famous');
    expect(s8.mode).toBe('static');
    expect(s8.submitted, 'the whole-bucket path submits the chunk-culled set, a superset').toBeGreaterThan(17042);
  });

  it('the spotlight reads the instance id from its own attribute, so a gathered list can light the tapped thread', () => {
    // A thread's id is data the instance carries (aId), never its position
    // in whatever list it was drawn from: uInstanceBase was that position's
    // offset and is gone.
    const gl = fakeGL();
    const r = createRenderer(fakeCanvas(gl), graph);
    const stats = r.draw(Object.assign({}, {
      width: W, height: H, base: BASE, ceil: CEIL, squash: SQUASH,
      camX: 15000, camY: 0, ppv: 88, zoom: 88 / fit(),
      strokeWidth: 2, alpha: 0.5, voteMix: 1, dpr: 2,
      colorMode: 'distance', density: 'famous', light: false, bg: '#000',
      focusRange: null, focusArc: 40211, hoverArc: -1,
    }));
    expect(stats.submitted).toBe(142);
    expect(gl.rec.uniforms.uFocusArc, 'the tapped id goes to the shader as itself').toBe(40211);
    expect('uInstanceBase' in gl.rec.uniforms, 'no base-offset uniform any more').toBe(false);
  });
});
