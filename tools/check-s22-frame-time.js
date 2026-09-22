#!/usr/bin/env node
/* check-s22-frame-time — the Scripture Web's frame-time budget, as a gate.
 * ═══════════════════════════════════════════════════════════════════════
 * WHY THIS GATE EXISTS
 * The Scripture Web is one WebGL2 shader over 63k threads, and the phone is
 * where it is read. Every landing of the structure law (2026-09-21/22) was
 * measured by hand on the S22 (Adreno 730): median / p90 rAF gap while
 * panning at fit, ~12x, the ceiling and the ceiling panned up; vsync-bound
 * is median 16.7 / p90 16.8 ms. Those numbers lived in a lane's out/ folder
 * and nothing failed when they slipped. Now measure-s22-frame-time.mjs
 * writes them to tools/perf/s22-frame-time.json with a hash of the Scripture
 * Web SOURCE it measured, and this check fails when
 *   (a) the Scripture Web source has changed since the measurement - a
 *       landing that touches the web must carry its own measurement; or
 *   (b) any scene is over budget (BUDGET below).
 *
 * CI has no phone, so the measurement is made here before the commit
 * (see the recipe in measure-s22-frame-time.mjs). A stale hash is not a
 * performance failure - it is an unmeasured change, which is the thing this
 * gate refuses to let through. Docs, tests, CSS and the rest of the app do
 * not move the hash.
 *
 * RE-BASELINING the budget is a deliberate act: edit BUDGET below in the
 * same commit as the reason. No env var and no flag silences this gate.
 *
 * Run: node tools/check-s22-frame-time.js   (exit 1 stale or over budget)
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Where the measurement lives, relative to the repo root. */
export const JSON_PATH = 'tools/perf/s22-frame-time.json';
/** The four scenes measure-s22-frame-time.mjs records, in order. */
export const SCENES = ['fit', 'mid', 'ceiling', 'ceilingUp'];
/**
 * ms per frame. vsync on the S22 is 16.7; the median must sit on it and the
 * p90 may lose one frame in ten to the phone's own work (a p90 of 33 is a
 * dropped frame every other frame: the ceiling-up scene at landing 6 was
 * 33.4 and was fixed). Measured 2026-09-22 at landing 9: every scene
 * median 16.7 / p90 16.8.
 */
export const BUDGET = { median: 17.0, p90: 20.0 };

/** The Scripture Web source the measurement speaks for (tests excluded). */
const SOURCE_DIRS = ['app/src/main/assets/src/utils/scripture-web', 'app/src/main/assets/src/ui/scripture-web'];
// the data asset (scripture-web-data.js) is NOT in the hash: a corpus lane
// regenerating the links must not wait on this phone; thread count is
// recorded in the JSON for the reader instead
const SOURCE_FILES = ['app/src/main/assets/src/ui/screens/ScriptureWebScreen.jsx'];
const isSource = (f) => /\.(js|jsx)$/.test(f) && !/\.test\.(js|jsx)$/.test(f);

/** sha256 over the sorted Scripture Web source files (path + bytes). */
export function sourceHash(root) {
  const files = [];
  for (const d of SOURCE_DIRS) {
    const abs = join(root, d);
    if (!existsSync(abs)) continue;
    for (const f of readdirSync(abs)) if (isSource(f)) files.push(join(d, f).replace(/\\/g, '/'));
  }
  for (const f of SOURCE_FILES) if (existsSync(join(root, f))) files.push(f);
  files.sort();
  const h = createHash('sha256');
  for (const f of files) { h.update(f); h.update('\0'); h.update(readFileSync(join(root, f))); h.update('\0'); }
  return h.digest('hex').slice(0, 16);
}

/**
 * @param {string} root
 * @returns {{ok:boolean, lines:string[]}}
 */
export function check(root) {
  const lines = [];
  const path = join(root, JSON_PATH);
  if (!existsSync(path)) return { ok: false, lines: [`${JSON_PATH} missing - run npm run measure:s22 on the phone`] };
  const m = JSON.parse(readFileSync(path, 'utf8'));
  let ok = true;
  const now = sourceHash(root);
  if (m.sourceHash !== now) {
    ok = false;
    lines.push(`STALE: the Scripture Web source is ${now}, the measurement (${m.measured}, ${m.sha}) speaks for ${m.sourceHash} - run npm run measure:s22 and commit ${JSON_PATH}`);
  }
  for (const k of SCENES) {
    const s = m.scenes && m.scenes[k];
    if (!s) { ok = false; lines.push(`scene ${k} missing from ${JSON_PATH}`); continue; }
    const over = [];
    if (!(s.median <= BUDGET.median)) over.push(`median ${s.median} > ${BUDGET.median}`);
    if (!(s.p90 <= BUDGET.p90)) over.push(`p90 ${s.p90} > ${BUDGET.p90}`);
    if (over.length) { ok = false; lines.push(`OVER BUDGET ${k}: ${over.join(', ')} ms`); }
    else lines.push(`ok ${k.padEnd(9)} median ${s.median} p90 ${s.p90} ms (${s.frames} frames)`);
  }
  lines.push(`${m.device && m.device.renderer} - measured ${m.measured} at ${m.sha}, source ${m.sourceHash}`);
  return { ok, lines };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const { ok, lines } = check(root);
  for (const l of lines) console.log('[s22-frame-time] ' + l);
  if (!ok) { console.error('[s22-frame-time] FAIL'); process.exit(1); }
  console.log('[s22-frame-time] ok');
}
