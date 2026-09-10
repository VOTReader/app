/**
 * tools/e2e-scriptureweb.mjs — the Scripture Web browser walk.
 *
 * WHY THIS EXISTS. Landing 67 (the Essential auto-switch) shipped with
 * `geometry.test.js` as its only witness: a unit pair over the pure function.
 * No browser gate reached the screen at all — `e2e:read` never goes there and
 * `smoke:ci` touches the Scripture Web only through the Home tile — so nothing
 * proved that the law the unit test pins is the law the SCREEN runs. This walk
 * closes that: it reaches the screen the way a reader does (Home -> Library ->
 * The Whole Counsel) and drives the real zoom buttons against the real WebGL
 * canvas, at two phone frames and two text scales.
 *
 * WHAT IT ASSERTS, AND WHAT IT ONLY PRINTS
 *
 * ARM 1 — the depth-density auto-switch. Four samples off one zoom arc:
 *   1a  the control is there and reads a real value        (else there is nothing to check)
 *   1b  RISING, inside the band, still Famous
 *   1c  RISING, past the enter threshold, Essential — AND the live region
 *       ANNOUNCED the change, having not announced it one step earlier
 *   1d  FALLING, back inside the band, still Essential
 *   1e  THE BAND DISAGREES WITH ITSELF: 1b and 1d are both strictly inside
 *       (exit, enter) and their densities DIFFER
 *   1f  FALLING, past the lower bound, Famous again, announced
 *   1g  one tap on the density control puts it back to Famous AND PINS it:
 *       a further zoom step, still past the enter threshold, leaves it Famous
 *
 *   1e is the arm. A single threshold at any value cannot produce two
 *   different answers for two points inside the same band, and a latch that
 *   never releases cannot produce 1f. 1c's announcement is what stops "past
 *   the threshold reads Essential" from being satisfied by a screen that
 *   renders Essential from boot and never switched anything.
 *
 *   The walk reads the thresholds from `geometry.js` rather than re-typing
 *   them, for the reason the screen's own `ribbonStyle` comment gives: a probe
 *   that re-types the law measures its own copy of it. What it does NOT take
 *   on faith is that its own ladder can see the band — see STEP RATIO below.
 *
 * ARM 2 — chrome geometry. THE BRIEF ASKED FOR "NO CHROME OVERLAPS THE READING
 *   COLUMN" AND THIS SCREEN HAS NO READING COLUMN: the canvas is the whole
 *   root and every word on it is chrome. Replaced, not skipped, by the two
 *   properties that carry the same meaning here, both reported with their
 *   numbers whichever way they land:
 *     2a  no two persistent chrome blocks overlap each other
 *     2b  every control is HIT-TESTABLE at its own centre (elementFromPoint,
 *         because a bounding box cannot see what is painted on top of it)
 *     2c  nothing spills the viewport horizontally
 *     2d  the open canvas band — the tallest run of viewport height no chrome
 *         covers — PRINTED, because "how much map is left" is the property the
 *         reading-column question was really asking about, and no threshold
 *         for it has been agreed.
 *
 * ARM 3 — deep-zoom frame time. PRINTED, NEVER ASSERTED. A wall-clock
 *   requestAnimationFrame interval taken while panning at the zoom ceiling.
 *   Design/Perf's reference figure is 3.05 ms for a deep-zoom frame on a
 *   Radeon 890M (2026-09-04), and -69 % at 400x after the 09-06 fix. THAT IS A
 *   DIFFERENT INSTRUMENT — theirs is GPU fill time, this is the whole frame
 *   including composite and event handling — so it is quoted as a magnitude to
 *   sit beside, never as a baseline to diff against. The renderer string is
 *   printed with every number for the same reason: a SwiftShader number and a
 *   Radeon number are not two readings of one quantity.
 *
 * STEP RATIO — WHY AN IN-BAND SAMPLE IS GUARANTEED AND NOT LUCKY. The zoom
 * button multiplies by ZOOM_STEP (1.8); the band is enter/exit = 2.0 wide. A
 * geometric ladder whose ratio is strictly less than the band's ratio cannot
 * step over the band: if a sample sits at p <= exit then the next is at
 * 1.8p <= 1.8*exit < 2*exit = enter. The walk ASSERTS that relation at
 * startup rather than trusting it, so that changing either constant fails
 * loudly instead of quietly turning 1b/1d/1e into arms that never fire.
 *
 * EXIT CODES — ONE MEANING EACH.
 *   0  every arm ran and passed
 *   1  an arm ran and FAILED — a defect
 *   2  NOTHING TO CHECK — the screen could not draw (no WebGL2), so no arm is
 *      meaningful. A runner treats this as INCOMPLETE, never as a skip or a
 *      pass. Nothing else routes here: a missing tile, a missing density
 *      control or a missing `data-ppv-css` are all defects and exit 1.
 *   3  HARNESS FAULT — the browser, the server or the navigation broke before
 *      any arm could be evaluated. Says nothing about the tree.
 */
import puppeteer from 'puppeteer';
import { serveOwnTree } from './e2e-read-serve.mjs';

/* A STATIC `import` CANNOT BE GUARDED BY CODE THAT RUNS AFTER IT, and the case
   the guard below exists for is exactly the one that kills a static import.
   Measured: deleting `autoDensity` and its thresholds from geometry.js made
   this file die at link time with `SyntaxError: ... does not provide an export
   named 'DENSITY_ENTER_PPV_CSS'` and a Node stack — before the parameter line,
   before the guard, with an exit code Node chose. So the guard written for the
   missing law had never been reachable in the state it was written for.

   A dynamic import returns a NAMESPACE: a missing export is simply an absent
   property, so `undefined` reaches the guard instead of a link error, and a
   genuinely broken module rejects where it can be caught. */
const GEOMETRY_PATH = '../app/src/main/assets/src/utils/scripture-web/geometry.js';
let LAW = /** @type {any} */ ({});
let lawLoadError = null;
try { LAW = await import(GEOMETRY_PATH); } catch (e) { lawLoadError = e && e.message ? e.message : String(e); }
const { PPV_MAX_CSS, DENSITY_ENTER_PPV_CSS, DENSITY_EXIT_PPV_CSS } = LAW;

const EXIT_PASS = 0;
const EXIT_FAIL = 1;
const EXIT_NOTHING_TO_CHECK = 2;
const EXIT_HARNESS = 3;

const num = (name, dflt) => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return dflt;
  const v = Number(raw);
  if (!Number.isFinite(v)) throw new Error(`${name}=${JSON.stringify(raw)} is not a number`);
  return v;
};

/* Frames: the two the brief names. 320x640 is the narrowest phone the tour
   walk covers; 426x952 is a tall modern one. Both are PORTRAIT, and the screen
   CSS-rotates itself into landscape on a portrait phone — so arm 2 measures
   the rotated frame, which is what a reader's thumb actually meets. */
const FRAMES = [{ w: 320, h: 640 }, { w: 426, h: 952 }];
const TEXT_SCALES = [1, 1.8];
const DPR = num('SWWEB_DPR', 2);
const ZOOM_STEP = num('SWWEB_ZOOM_STEP', 1.8);        // must match changeZoom()'s factor
const MAX_ZOOM_STEPS = num('SWWEB_MAX_ZOOM_STEPS', 24);
const SETTLE_MS = num('SWWEB_SETTLE_MS', 6000);
const NAV_MS = num('SWWEB_NAV_MS', 30000);
const PAN_MS = num('SWWEB_PAN_MS', 1800);
const CHROME = ['.sw-topbar', '.sw-controls', '.sw-context', '.sw-legend', '.sw-credit'];

const PARAMS = [
  'frames=' + FRAMES.map((f) => f.w + 'x' + f.h).join(','),
  'dpr=' + DPR,
  'textScales=' + TEXT_SCALES.join(','),
  'zoomStep=' + ZOOM_STEP,
  'enterPpvCss=' + DENSITY_ENTER_PPV_CSS,
  'exitPpvCss=' + DENSITY_EXIT_PPV_CSS,
  'ppvMaxCss=' + PPV_MAX_CSS,
  'maxZoomSteps=' + MAX_ZOOM_STEPS,
  'settleMs=' + SETTLE_MS,
  'navMs=' + NAV_MS,
  'panMs=' + PAN_MS,
  'chrome=' + CHROME.join('|'),
].join(' ');

console.log('[e2e-swweb] PARAMS ' + PARAMS);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const r2 = (n) => Math.round(n * 100) / 100;

/* THE LAW BEING GONE IS A FACT ABOUT THE TREE, NOT ABOUT THE HARNESS. Without
   this, deleting `autoDensity`'s thresholds from geometry.js makes BAND_RATIO
   NaN, the ratio guard below refuses, and the walk exits 3 — "nothing to do
   with the tree" — for the one change that is most about the tree. */
if (lawLoadError || ![DENSITY_ENTER_PPV_CSS, DENSITY_EXIT_PPV_CSS, PPV_MAX_CSS].every(Number.isFinite)) {
  console.error('[e2e-swweb] geometry.js no longer gives the density law as numbers: '
    + (lawLoadError ? `the module would not load (${lawLoadError}). ` : '')
    + `DENSITY_ENTER_PPV_CSS=${DENSITY_ENTER_PPV_CSS} DENSITY_EXIT_PPV_CSS=${DENSITY_EXIT_PPV_CSS} PPV_MAX_CSS=${PPV_MAX_CSS}. `
    + 'The auto-switch has no thresholds to switch on, so there is nothing for the screen to run.');
  console.error('[e2e-swweb] RESULT FAIL (1) PARAMS ' + PARAMS);
  process.exit(EXIT_FAIL);
}

/** A guard, not a comment: the ladder must be finer than the band. */
const BAND_RATIO = DENSITY_ENTER_PPV_CSS / DENSITY_EXIT_PPV_CSS;
if (!(ZOOM_STEP < BAND_RATIO)) {
  console.error(
    `[e2e-swweb] REFUSING TO RUN: the zoom ladder steps by ${ZOOM_STEP} and the hysteresis band is `
    + `${r2(BAND_RATIO)}:1 (${DENSITY_EXIT_PPV_CSS}..${DENSITY_ENTER_PPV_CSS} CSS px per verse). A ladder `
    + 'at or above the band ratio can step straight over the band, and arms 1b/1d/1e would then pass or '
    + 'fail on where the samples happened to land rather than on the law. Change the walk, not this guard.'
  );
  process.exit(EXIT_HARNESS);
}

const fails = [];
const notes = [];
let nothingToCheck = null;

/* e2e-tour.mjs's idiom, written out the same way it is there rather than
   shared: the width test is the load-bearing half, because a tile can be in
   the DOM and unpainted, and a click on it goes nowhere. */
async function clickLabel(page, label) {
  await page.waitForFunction((l) => [...document.querySelectorAll('button,[role=button],a')]
    .some((b) => (b.getAttribute('aria-label') || b.textContent.trim()).startsWith(l) && b.getBoundingClientRect().width > 0),
  { timeout: NAV_MS }, label);
  await page.evaluate((l) => {
    const b = [...document.querySelectorAll('button,[role=button],a')]
      .find((x) => (x.getAttribute('aria-label') || x.textContent.trim()).startsWith(l) && x.getBoundingClientRect().width > 0);
    /** @type {HTMLElement} */ (b).click();
  }, label);
}

/** Click if present, no wait — for prompts that may or may not be up. */
async function clickIfPresent(page, label) {
  return page.evaluate((l) => {
    const b = [...document.querySelectorAll('button,[role=button],a')]
      .find((x) => (x.getAttribute('aria-label') || x.textContent.trim()).startsWith(l) && x.getBoundingClientRect().width > 0);
    if (!b) return false;
    /** @type {HTMLElement} */ (b).click();
    return true;
  }, label);
}

/** Everything arm 1 reads, taken in one round trip so the parts cannot disagree. */
const readState = () => {
  const root = document.querySelector('.sw-root');
  const sel = /** @type {HTMLSelectElement|null} */ (document.querySelector('select[aria-label="Connection density"]'));
  const live = document.querySelector('.sw-live');
  const raw = root ? root.getAttribute('data-ppv-css') : null;
  return {
    root: !!root,
    fallback: !!document.querySelector('.sw-fallback'),
    loading: !!document.querySelector('.sw-loading'),
    ppvRaw: raw,
    ppv: raw === null ? null : Number(raw),
    density: sel ? sel.value : null,
    live: live ? live.textContent.trim() : '',
    zoomLabel: (document.querySelector('.sw-context-zoom') || { textContent: '' }).textContent.trim(),
  };
};

const state = (page) => page.evaluate(readState);

/**
 * One zoom click, then wait for the screen to actually move. Returns the new
 * state, or null when the camera did not move — which at the top of the ladder
 * means the ceiling, not a hang.
 */
async function stepZoom(page, dir) {
  const before = await state(page);
  await page.evaluate((label) => {
    const b = document.querySelector('button[aria-label="' + label + '"]');
    if (!b) throw new Error('no ' + label + ' button');
    /** @type {HTMLButtonElement} */ (b).click();
  }, dir > 0 ? 'Zoom in' : 'Zoom out');
  try {
    await page.waitForFunction(
      (was) => {
        const el = document.querySelector('.sw-root');
        return !!el && el.getAttribute('data-ppv-css') !== was;
      },
      { timeout: 2500, polling: 60 }, before.ppvRaw
    );
  } catch (_e) {
    return null;                            // the camera is against a stop
  }
  return state(page);
}

/** Zoom until `test(s)` or the ceiling. Returns every sample, first to last. */
async function zoomArc(page, dir, test) {
  const arc = [await state(page)];
  for (let i = 0; i < MAX_ZOOM_STEPS; i++) {
    const s = await stepZoom(page, dir);
    if (!s) break;
    arc.push(s);
    if (test(s)) break;
  }
  return arc;
}

const fmtArc = (arc) => arc.map((s) => `${s.ppv}:${s.density}`).join(' ');

function armDensity(tag, rise, fall, pinned) {
  const inBand = (s) => s.ppv > DENSITY_EXIT_PPV_CSS && s.ppv < DENSITY_ENTER_PPV_CSS;
  const fail = (m) => fails.push(`${tag} ${m}`);

  // 1b rising, inside the band, still Famous.
  const riseBand = [...rise].reverse().find(inBand);
  if (!riseBand) {
    fail(`1b no RISING sample inside the band (${DENSITY_EXIT_PPV_CSS}, ${DENSITY_ENTER_PPV_CSS}) — arc: ${fmtArc(rise)}`);
  } else if (riseBand.density !== 'famous') {
    fail(`1b RISING at ppv ${riseBand.ppv} is inside the band and reads ${riseBand.density}, want famous`);
  }

  // 1c rising, past the enter threshold, Essential, and it ANNOUNCED the switch.
  const crossIdx = rise.findIndex((s) => s.ppv >= DENSITY_ENTER_PPV_CSS);
  const cross = crossIdx >= 0 ? rise[crossIdx] : null;
  if (!cross) {
    fail(`1c the arc never reached the enter threshold ${DENSITY_ENTER_PPV_CSS} — arc: ${fmtArc(rise)}`);
  } else {
    if (cross.density !== 'essential') fail(`1c RISING at ppv ${cross.ppv} (>= ${DENSITY_ENTER_PPV_CSS}) reads ${cross.density}, want essential`);
    const prior = rise[crossIdx - 1];
    if (!prior) {
      fail('1c the enter threshold was crossed on the very first sample, so no before/after exists for the announcement');
    } else if (/Essential/.test(prior.live)) {
      fail(`1c the live region already said ${JSON.stringify(prior.live)} at ppv ${prior.ppv}, BEFORE the crossing — the screen is not switching, it was already there`);
    }
    if (!/Essential/.test(cross.live)) {
      fail(`1c crossing at ppv ${cross.ppv} announced ${JSON.stringify(cross.live)} — nothing naming Essential, so no switch was announced`);
    }
  }

  // 1d falling, back inside the band, still Essential.
  const fallBand = fall.find(inBand);
  if (!fallBand) {
    fail(`1d no FALLING sample inside the band — arc: ${fmtArc(fall)}`);
  } else if (fallBand.density !== 'essential') {
    fail(`1d FALLING at ppv ${fallBand.ppv} is inside the band and reads ${fallBand.density}, want essential (the band should hold what it had)`);
  }

  // 1e THE ARM. Same band, two answers.
  if (riseBand && fallBand) {
    if (riseBand.density === fallBand.density) {
      fail(`1e the band does not disagree with itself: rising ppv ${riseBand.ppv} and falling ppv ${fallBand.ppv} are both inside `
        + `(${DENSITY_EXIT_PPV_CSS}, ${DENSITY_ENTER_PPV_CSS}) and both read ${riseBand.density}. That is a threshold, not a hysteresis.`);
    } else {
      notes.push(`${tag} 1e band disagrees: rising ${riseBand.ppv}=${riseBand.density} vs falling ${fallBand.ppv}=${fallBand.density}`);
    }
  }

  // 1f falling, past the lower bound, Famous again, announced. A latch dies here.
  const outIdx = fall.findIndex((s) => s.ppv <= DENSITY_EXIT_PPV_CSS);
  const out = outIdx >= 0 ? fall[outIdx] : null;
  if (!out) {
    fail(`1f the arc never fell to the exit threshold ${DENSITY_EXIT_PPV_CSS} — arc: ${fmtArc(fall)}`);
  } else {
    if (out.density !== 'famous') fail(`1f FALLING at ppv ${out.ppv} (<= ${DENSITY_EXIT_PPV_CSS}) reads ${out.density}, want famous — the band latched and never released`);
    if (!/Famous/.test(out.live)) fail(`1f leaving the band announced ${JSON.stringify(out.live)} — nothing naming Famous`);
  }

  // 1g the one tap back, and the pin that makes it stick.
  if (pinned) {
    if (pinned.afterTap !== 'famous') fail(`1g one tap on the density control left it at ${pinned.afterTap}, want famous`);
    if (pinned.afterStep !== 'famous') {
      fail(`1g after the tap, one more zoom step to ppv ${pinned.stepPpv} (still >= ${DENSITY_ENTER_PPV_CSS}) flipped it back to `
        + `${pinned.afterStep} — the tap did not pin, so the auto-switch overrode the reader`);
    }
    if (!(pinned.stepPpv >= DENSITY_ENTER_PPV_CSS)) {
      fail(`1g the pin was tested at ppv ${pinned.stepPpv}, below the enter threshold ${DENSITY_ENTER_PPV_CSS} — the auto-switch had no reason to fire there, so this proves nothing`);
    }
    if (pinned.beforeTap !== 'essential') {
      fail(`1g the density was ${pinned.beforeTap} before the tap, not essential — there was nothing to tap back FROM`);
    }
  }
}

function armChrome(tag, geo) {
  const fail = (m) => fails.push(`${tag} ${m}`);
  for (const o of geo.overlaps) {
    fail(`2a ${o.a} overlaps ${o.b} by ${o.w}x${o.h} px at (${o.x}, ${o.y})`);
  }
  for (const c of geo.covered) {
    fail(`2b the control ${JSON.stringify(c.label)} (${c.sel}) is covered at its own centre (${c.x}, ${c.y}) by ${c.by} — a bounding box cannot see this`);
  }
  if (geo.overflowX > 1) fail(`2c the page scrolls ${geo.overflowX} px horizontally (scrollWidth ${geo.scrollWidth} > innerWidth ${geo.innerWidth})`);
  for (const s of geo.offscreen) {
    fail(`2c ${JSON.stringify(s.label)} (${s.sel}) sits outside the viewport: rect ${s.rect}`);
  }
  notes.push(`${tag} 2d open canvas band ${geo.band.h} px tall (y ${geo.band.top}..${geo.band.bottom}) of ${geo.innerHeight} px; chrome covers ${geo.coveredPct}%`);
}

/** Chrome geometry, measured in viewport space — which is what the reader meets, rotation included. */
const readGeometry = (chromeSel) => {
  const R = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  const vis = (el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.01; };
  const blocks = chromeSel.map((sel) => ({ sel, el: document.querySelector(sel) }))
    .filter((o) => o.el && vis(o.el)).map((o) => ({ sel: o.sel, rect: R(o.el) }));

  const overlaps = [];
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      const a = blocks[i].rect; const b = blocks[j].rect;
      const w = Math.min(a.r, b.r) - Math.max(a.x, b.x);
      const h = Math.min(a.b, b.b) - Math.max(a.y, b.y);
      if (w > 1 && h > 1) {
        overlaps.push({ a: blocks[i].sel, b: blocks[j].sel, w: Math.round(w), h: Math.round(h), x: Math.round(Math.max(a.x, b.x)), y: Math.round(Math.max(a.y, b.y)) });
      }
    }
  }

  const controls = [...document.querySelectorAll('.sw-topbar button, .sw-controls button, .sw-controls select')].filter(vis);
  const covered = [];
  const offscreen = [];
  for (const el of controls) {
    const b = el.getBoundingClientRect();
    const label = (el.getAttribute('aria-label') || el.textContent.trim() || el.tagName).slice(0, 40);
    const sel = el.className || el.tagName;
    if (b.left < -1 || b.top < -1 || b.right > innerWidth + 1 || b.bottom > innerHeight + 1) {
      offscreen.push({ label, sel, rect: `${Math.round(b.left)},${Math.round(b.top)} ${Math.round(b.width)}x${Math.round(b.height)}` });
      continue;
    }
    const x = Math.round(b.left + b.width / 2); const y = Math.round(b.top + b.height / 2);
    const hit = document.elementFromPoint(x, y);
    if (!hit || !(hit === el || el.contains(hit))) {
      const by = hit ? (hit.className || hit.tagName) : 'nothing';
      covered.push({ label, sel: String(sel).slice(0, 40), x, y, by: String(by).slice(0, 40) });
    }
  }

  /* 2d: the tallest run of viewport height no chrome block covers. Chrome here
     is banded top and bottom, so a 1-D sweep is the honest measure — it is
     reported, never asserted, precisely because no target for it exists. */
  const rows = new Uint8Array(Math.max(1, Math.round(innerHeight)));
  for (const bl of blocks) {
    const from = Math.max(0, Math.floor(bl.rect.y));
    const to = Math.min(rows.length, Math.ceil(bl.rect.b));
    for (let y = from; y < to; y++) rows[y] = 1;
  }
  let best = { top: 0, bottom: 0, h: 0 }; let run = -1;
  for (let y = 0; y <= rows.length; y++) {
    const free = y < rows.length && rows[y] === 0;
    if (free && run < 0) run = y;
    if (!free && run >= 0) { if (y - run > best.h) best = { top: run, bottom: y, h: y - run }; run = -1; }
  }
  let coveredRows = 0;
  for (let y = 0; y < rows.length; y++) if (rows[y]) coveredRows++;

  return {
    overlaps, covered, offscreen, band: best,
    innerWidth, innerHeight: rows.length,
    coveredPct: Math.round((coveredRows / rows.length) * 1000) / 10,
    scrollWidth: document.documentElement.scrollWidth,
    overflowX: document.documentElement.scrollWidth - innerWidth,
    fontScale: getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim(),
    rootFontPx: getComputedStyle(document.documentElement).fontSize,
  };
};

/** ARM 3 — printed. Wall-clock rAF intervals while the camera is panned at the ceiling. */
async function frameTime(page, panMs) {
  await page.evaluate((ms) => {
    const w = /** @type {any} */ (window);
    w.__swFrames = [];
    let last = 0;
    const stop = performance.now() + ms;
    const tick = (t) => {
      if (last) w.__swFrames.push(t - last);
      last = t;
      if (t < stop) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, panMs);

  const box = await page.evaluate(() => {
    const el = document.querySelector('.sw-canvas-gl') || document.querySelector('.sw-root');
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height };
  });
  const amp = Math.max(20, Math.min(box.w, box.h) / 4);
  await page.mouse.move(box.x, box.y);
  await page.mouse.down();
  const t0 = Date.now();
  let k = 0;
  while (Date.now() - t0 < panMs) {
    k++;
    await page.mouse.move(box.x + Math.sin(k / 5) * amp, box.y + Math.cos(k / 7) * amp / 2);
  }
  await page.mouse.up();

  const d = await page.evaluate(() => /** @type {any} */ (window).__swFrames.slice().sort((a, b) => a - b));
  if (!d.length) return null;
  const q = (p) => d[Math.min(d.length - 1, Math.floor(d.length * p))];
  return { n: d.length, median: r2(q(0.5)), p95: r2(q(0.95)), max: r2(d[d.length - 1]), moves: k };
}

async function walk(page, url, frame, scale) {
  const tag = `[${frame.w}x${frame.h} @${scale}x]`;

  await page.setViewport({ width: frame.w, height: frame.h, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  /* The app's OWN path to a text scale: the index.html boot script reads
     `vot-state` from localStorage pre-mount and `useSettings` reads the same
     store, so seeding it means nothing clobbers the value after mount.
     Measured, not assumed — the effective scale is read back below. */
  await page.evaluateOnNewDocument((s) => {
    try { localStorage.setItem('vot-state', JSON.stringify({ settings: { fontScale: String(s) } })); } catch (_e) { /* private mode */ }
  }, scale);

  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => {
    const r = document.getElementById('root');
    return !!r && r.children.length > 0;
  }, { timeout: NAV_MS });

  await clickLabel(page, 'Continue');
  await clickLabel(page, 'Begin Reading');
  await sleep(500);
  await clickIfPresent(page, 'Maybe later');   // the tour prompt is an overlay on Home
  await sleep(200);

  /* Scripture Web is deliberately NOT a Home tile (HomeScreen.test.jsx pins
     that), so the reader's route is Home -> Library -> The Whole Counsel. */
  await clickLabel(page, 'Personal Study');
  await sleep(400);
  await clickLabel(page, 'The Whole Counsel');

  try {
    await page.waitForFunction(() => !!document.querySelector('.sw-root') || !!document.querySelector('.sw-fallback'),
      { timeout: NAV_MS });
  } catch (_e) {
    fails.push(`${tag} the Scripture Web never rendered: neither .sw-root nor .sw-fallback appeared within ${NAV_MS} ms of tapping the Library tile`);
    return;
  }

  const first = await state(page);
  if (first.fallback && !first.root) {
    const why = await page.evaluate(() => (document.querySelector('.sw-fallback-body') || { textContent: '' }).textContent.trim());
    nothingToCheck = `${tag} the web could not be drawn: ${JSON.stringify(why)}. No density control exists to measure, so no arm here means anything.`;
    return;
  }

  // Settled: painted, not loading, publishing a ppv.
  try {
    await page.waitForFunction(() => {
      const el = document.querySelector('.sw-root');
      return !!el && !document.querySelector('.sw-loading') && el.getAttribute('data-ppv-css') !== null;
    }, { timeout: SETTLE_MS, polling: 100 });
  } catch (_e) {
    const s = await state(page);
    if (s.ppvRaw === null) {
      fails.push(`${tag} 1a the screen does not publish data-ppv-css on .sw-root. The auto-switch's own input is then `
        + 'unobservable and its law is unmeasurable from a browser — that is a defect in the instrument\'s contract, not a skip.');
    } else {
      fails.push(`${tag} 1a the web never settled within ${SETTLE_MS} ms: ${JSON.stringify(s)}`);
    }
    return;
  }

  const start = await state(page);
  if (start.density === null) {
    fails.push(`${tag} 1a the canvas is up but there is no density control (select[aria-label="Connection density"])`);
    return;
  }
  if (!Number.isFinite(start.ppv)) {
    fails.push(`${tag} 1a data-ppv-css reads ${JSON.stringify(start.ppvRaw)}, not a number`);
    return;
  }
  notes.push(`${tag} entry ppv ${start.ppv} density ${start.density} zoom ${JSON.stringify(start.zoomLabel)}`);

  const rise = await zoomArc(page, +1, (s) => s.ppv >= DENSITY_ENTER_PPV_CSS);
  const atCeiling = await zoomArc(page, +1, () => false);          // run to the stop for arm 3
  const top = atCeiling[atCeiling.length - 1];

  /* Geometry BEFORE the pan: a drag that ends in a tap would open a sheet, and
     arm 2 is about the chrome a reader meets on arrival, not after a gesture. */
  const geo = await page.evaluate(readGeometry, CHROME);
  if (String(geo.fontScale || '1') !== String(scale)) {
    fails.push(`${tag} the text scale did not take: --font-scale reads ${JSON.stringify(geo.fontScale)} and root font-size ${geo.rootFontPx}, wanted ${scale}. Arm 2 would be measuring the wrong frame.`);
  }
  notes.push(`${tag} 2 --font-scale ${geo.fontScale || '1'} root ${geo.rootFontPx} viewport ${geo.innerWidth}x${geo.innerHeight}`);
  armChrome(tag, geo);

  const ft = await frameTime(page, PAN_MS).catch((e) => ({ err: e.message }));
  if (ft && ft.err) notes.push(`${tag} 3 frame time UNMEASURED (${ft.err})`);
  else if (!ft) notes.push(`${tag} 3 frame time UNMEASURED (no frames sampled)`);
  else notes.push(`${tag} 3 deep-zoom frame time at ppv ${top.ppv}: median ${ft.median} ms, p95 ${ft.p95} ms, max ${ft.max} ms over ${ft.n} frames (${ft.moves} pointer moves) — PRINTED, NOT ASSERTED`);

  const fall = await zoomArc(page, -1, (s) => s.ppv <= DENSITY_EXIT_PPV_CSS);

  // 1g — back up past the enter threshold, tap Famous, prove the tap PINNED.
  const up = await zoomArc(page, +1, (s) => s.ppv >= DENSITY_ENTER_PPV_CSS);
  const beforeTap = up[up.length - 1];
  let pinned = null;
  if (beforeTap.ppv >= DENSITY_ENTER_PPV_CSS) {
    await page.select('select[aria-label="Connection density"]', 'famous');
    await sleep(300);
    const afterTap = await state(page);
    const afterStep = (await stepZoom(page, +1)) || (await state(page));
    pinned = {
      beforeTap: beforeTap.density,
      afterTap: afterTap.density,
      afterStep: afterStep.density,
      stepPpv: afterStep.ppv,
    };
    notes.push(`${tag} 1g tap at ppv ${beforeTap.ppv}: ${pinned.beforeTap} -> ${pinned.afterTap}, still ${pinned.afterStep} at ppv ${pinned.stepPpv}`);
  } else {
    fails.push(`${tag} 1g could not return above the enter threshold to test the one-tap: reached ppv ${beforeTap.ppv}`);
  }

  notes.push(`${tag} 1 rising  ${fmtArc(rise)}`);
  notes.push(`${tag} 1 falling ${fmtArc(fall)}`);
  armDensity(tag, rise, fall, pinned);
}

let browser = null;
let server = null;
let harnessFault = null;
try {
  const own = await serveOwnTree();
  server = own.server;
  console.log('[e2e-swweb] serving ' + own.url);
  /* SWWEB_GL=swiftshader reproduces CI's renderer on a machine that has a GPU.
     Actions runners have none, so Chrome falls back to SwiftShader there by
     itself, and this switch is how you find out locally whether a red is about
     the tree or about the renderer.

     MEASURED on 2026-09-10, Radeon 890M against SwiftShader, same tree, same
     commit: arms 1 and 2 came back BYTE-IDENTICAL — same arcs, same densities,
     same band disagreement, same two chrome failures, same 235 px open band.
     Arm 3 came back 8x apart (median 4.2 / 8.2 ms against 33.3 / 50.0 ms).
     That is the whole reason arm 3 is printed and never asserted, and why the
     renderer string rides with every number: the two are not two readings of
     one quantity. Not a parameter of the walk — the default is whatever the
     machine offers. */
  const swArgs = process.env.SWWEB_GL === 'swiftshader'
    ? ['--use-gl=swiftshader', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : [];
  browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', ...swArgs],
    protocolTimeout: 240000,
  });
  const probe = await browser.newPage();
  const renderer = await probe.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2');
    if (!gl) return null;
    const d = gl.getExtension('WEBGL_debug_renderer_info');
    return d ? String(gl.getParameter(d.UNMASKED_RENDERER_WEBGL)) : String(gl.getParameter(gl.RENDERER));
  });
  await probe.close();
  console.log('[e2e-swweb] renderer ' + JSON.stringify(renderer));

  for (const frame of FRAMES) {
    for (const scale of TEXT_SCALES) {
      const ctx = await browser.createBrowserContext();     // isolated storage per run
      const page = await ctx.newPage();
      try {
        await walk(page, own.url, frame, scale);
      } finally {
        await ctx.close().catch(() => {});
      }
      if (nothingToCheck) break;
    }
    if (nothingToCheck) break;
  }
} catch (e) {
  harnessFault = e && e.stack ? e.stack : String(e);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.close();
}

for (const n of notes) console.log('  ' + n);

if (harnessFault) {
  console.error('[e2e-swweb] HARNESS FAULT: ' + harnessFault);
  console.error('[e2e-swweb] RESULT HARNESS-FAULT — nothing was measured; this says nothing about the tree. PARAMS ' + PARAMS);
  process.exit(EXIT_HARNESS);
}
if (nothingToCheck) {
  console.error('[e2e-swweb] ' + nothingToCheck);
  console.error('[e2e-swweb] RESULT NOTHING-TO-CHECK — INCOMPLETE, not a pass and not a skip. PARAMS ' + PARAMS);
  process.exit(EXIT_NOTHING_TO_CHECK);
}
if (fails.length) {
  console.error('[e2e-swweb] ' + fails.length + ' FAILED:\n  ' + fails.join('\n  '));
  console.error('[e2e-swweb] RESULT FAIL (' + fails.length + ') PARAMS ' + PARAMS);
  process.exit(EXIT_FAIL);
}
console.log('[e2e-swweb] RESULT PASS PARAMS ' + PARAMS);
process.exit(EXIT_PASS);
