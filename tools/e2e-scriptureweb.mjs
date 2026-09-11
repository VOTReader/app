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
 *     2a  no two persistent chrome blocks overlap each other, EXCEPT where one
 *         contains the other — a parent holding its child is not a block
 *         covering a block, and treating it as one fires on the shape of the
 *         CC-BY fix rather than on a defect
 *     2b  every control AND the CC-BY line is HIT-TESTABLE at its own centre
 *         (elementFromPoint, because a bounding box cannot see what is painted
 *         on top of it, and "present but painted over" is a licence problem).
 *         A non-interactive element that is `pointer-events: none` is reported
 *         as UNHITTABLE, not covered — the hit test has no answer for it, and
 *         what comes back is whatever is behind. 2a's rect overlap is what
 *         covers such an element.
 *     2c  nothing spills the viewport horizontally, and NOTHING IN THE SET IS
 *         UNJUDGEABLE: an element that is `pointer-events: none` gets no answer
 *         from elementFromPoint, and 2a cannot cover for it once the element is
 *         nested inside another chrome block, so the pair of them go quiet
 *         together. Measured 0 here; a legitimate case gets a named allowance
 * ARM 4 — the shaders COMPILE AND LINK in the browser the walk drives. Landing
 *   69 shipped with `web-renderer.test.js` asserting the shader's TEXT in
 *   twenty places and vitest holding no GL context, so a GLSL syntax error
 *   would blank the screen with every gate green. Runs ONCE; scope is total
 *   (the app source declares one shader pair). A deliberately broken shader
 *   must be REJECTED by the same pipeline or the arm reports itself DEAD rather
 *   than passing. It reads the SOURCE module, not the bundle — see the note on
 *   `armShaders`.
 *
 *     2f  the chrome whose ABSENCE is a defect — the topbar (the only way off
 *         this screen) and the CC-BY line (a licence obligation) — is PAINTED,
 *         not merely present. Nothing else in arm 2 can see that: 2a skips the
 *         credit's pair because the fix nests it, 2b drops an unpainted element
 *         from the hit list rather than failing it, and an unpainted required
 *         selector is a note. Without 2f the passing state "2a finds nothing
 *         about the credit" is equally satisfied by a credit that is not there
 *   and every frame prints what arm 2 RAN — the blocks it found, the pairs it
 *   compared, the elements it hit-tested — because 0 failures and 0 checks are
 *   the same output, and a renamed selector shrinks the check set silently.
 *   Zero pairs or zero hits is a FAILURE: an arm that checked nothing has not
 *   run, whatever colour it prints.
 *     2e  the portrait hint, WHEN IT IS UP, sits below the LOWEST chrome above
 *         it — topbar and location readout both — and not far below it — the gap is printed either way, and "the hint is not up at
 *         this frame" is reported as its own answer rather than as a pass
 *     2d  the open canvas band — the tallest run of viewport height no chrome
 *         covers — against a REGISTERED PER-FRAME FLOOR, measured rather than
 *         chosen, with no tolerance band. Chrome that stops overlapping itself
 *         has not necessarily got out of the reader's way: landing 70 cut this
 *         band 39%% at 320x640 with every other arm green. A frame with no
 *         registered floor FAILS rather than passing — and so does an
 *         unregistered PLATFORM, because the band's top is chrome height, which
 *         is text layout, and this walk runs on a developer's win32 and on
 *         ubuntu-latest in ci.yml — the tallest run of viewport height no chrome
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
/* CONDITIONAL chrome: checked when it is up, never failed for being absent. The
   portrait hint only renders after `screen.orientation.lock('landscape')` is
   refused, so "missing" is its ordinary state and the required list's
   rename-detection would fire on it every run. It belongs in the overlap set
   because it is the card that covered the Back button. */
const CHROME_WHEN_SHOWN = ['.sw-orientation-note'];
/* REQUIRED TO BE PAINTED, not merely present. Without this the walk has no
   positive control on the CC-BY line at all: 2a skips its pair because the fix
   puts it INSIDE `.sw-controls` (a child's rect is a subset of its parent's),
   2b drops it from the hit list when it is not painted rather than failing it,
   and an unpainted required selector is only a `notPainted=[...]` note. Every
   arm therefore goes quiet for "the attribution is GONE" in the same way it
   goes quiet for "the attribution is fine".

   `.sw-legend` is deliberately NOT on this list: it is `display: none` at a
   narrow frame by design, and a list that over-claims fires on a layout choice.
   `.sw-controls` is not on it either, and has a stronger witness — arm 1 drives
   the zoom buttons inside it and cannot pass without them. What is left is the
   chrome whose absence is a defect rather than a layout choice: the topbar,
   which is the only way off this screen, and the credit, which is a licence
   obligation. */
const REQUIRED_PAINTED = [
  { sel: '.sw-topbar', why: 'it is the only way off this screen' },
  { sel: '.sw-credit', why: 'it is a licence obligation, and an absent attribution is worse than an unreadable one' },
];
/* The portrait hint is placed 10 px below the topbar. The ceiling is not a pin
   on the 10 — it catches a MEASUREMENT THAT HAS GONE STALE, which is not a
   hypothetical: a draft that observed the topbar only on mount read its
   CSS-rotated box and placed the note 227 px out, at 299 px against a topbar
   ending at 72. */
const NOTE_GAP_MAX = num('SWWEB_NOTE_GAP_MAX', 30);
/* 2d's FLOOR, PER FRAME — the READER'S reading area, which until now nothing
   gated. 2d was the only arm on this screen with no `fail()` at all, and a
   measurement with no threshold is a note, which is what a reader skims. The
   cost of that: landing 70 cut this band from 253 to 154 px at 320x640
   (−39.1%) and from 584 to 518 at 426x952 **with every arm green**, signed off
   by two people including me. CHROME THAT STOPS OVERLAPPING ITSELF HAS NOT
   NECESSARILY GOT OUT OF THE READER'S WAY, and only this number tells them
   apart.

   MEASURED, NOT CHOSEN: three consecutive control runs against main at f32380ea,
   agreeing at every frame in POSITION as well as height, across both text
   scales and under CPU contention. A stable height whose y range slides would
   be a passing number produced by a racing measurement.

   ZERO TOLERANCE BAND, deliberately, and the reason is not fussiness: a floor
   at exactly the measured value makes a 1 px shrink RED, which is the point —
   any shrink is a cost to the reader and wants justifying. The bundle CEILING
   carries 15% headroom because a ceiling is room for growth; a floor is a
   claim about the present, and jitter in the present is an instrument fault,
   not something to leave slack for. A floor that has been lowered once to stop
   a flake is decoration. Moving one takes a commit showing the arithmetic.

   A FRAME WITH NO REGISTERED FLOOR FAILS rather than passing: a default that
   passes is indistinguishable from a gate that is not watching that frame. */
/* The browser build the walk actually drove, printed beside the band. A floor
   at zero margin has exactly one innocent way to go red on an unrelated
   landing: a browser or font update moving layout. The first thing a reader
   needs then is whether the INSTRUMENT changed under the number — same build
   and a smaller band is a regression, a different build is an instrument event
   and the floor moves by a commit naming that cause. Undetermined is printed as
   undetermined; a plausible default here would be the reader's whole answer. */
let BROWSER_BUILD = null;

const BAND_FLOOR = {
  /* KEYED BY PLATFORM AS WELL AS FRAME, because the band's top is chrome
     height, which is TEXT LAYOUT, and this walk runs on two platforms: a
     developer's win32 and `ubuntu-latest` in ci.yml. At zero margin one pixel
     of font-metric difference reddens it by construction, and a floor that
     reddens for a reason nobody can act on is a floor that gets lowered. */
  win32: {
    '320x640': 154,   // y 237..391, chrome 70.6% — identical in all three runs
    '426x952': 518,   // y 237..755, chrome 42.0% — identical in all three runs
  },
  /* linux: DELIBERATELY UNREGISTERED. Registering a guess would be worse than
     the gap — an unregistered platform says "this has never been measured
     here", which is true and actionable, while a guessed number says "the band
     shrank" about a machine nobody has measured. It fails exactly the way an
     unregistered FRAME does, and for the same reason. */
};
const BAND_FLOOR_PLATFORM = BAND_FLOOR[process.platform];

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
  'chromeWhenShown=' + CHROME_WHEN_SHOWN.join('|'),
  'requiredPainted=' + REQUIRED_PAINTED.map((r) => r.sel).join('|'),
  'noteGapMax=' + NOTE_GAP_MAX,
  'platform=' + process.platform,
  'bandFloor=' + (BAND_FLOOR_PLATFORM
    ? Object.entries(BAND_FLOOR_PLATFORM).map(([k, v]) => k + ':' + v).join('|')
    : 'NONE REGISTERED FOR ' + process.platform),
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
/* ARM 4's OWN incompleteness, deliberately NOT the walk's global
   `nothingToCheck`: that one short-circuits the frame loop, and an early draft
   of this file already made the mistake of letting one arm's precondition
   switch off an independent one. A shader probe that cannot arm says nothing
   about the density law or the chrome, so arms 1-3 still run. It does make the
   RUN incomplete, which is a distinct answer from passing and gets the distinct
   exit. */
let armFourIncomplete = null;

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

/* ARM 4 — the shaders compile and link in the browser the walk drives.
 *
 * SCOPE, stated with the count because a count without its scope means nothing:
 * the app source declares exactly ONE shader pair (`web-renderer.js`, the only
 * `createShader` call site in `app/src/main/assets/src`), so 2 shaders and 1
 * program is total coverage of what exists, not a sample.
 *
 * WHAT IT DOES NOT CLOSE, said here because a green will be quoted: a
 * successful compile does not prove the cull is CORRECT, and GLSL does not
 * error on a varying left unwritten on some path — that is undefined behaviour,
 * not a diagnostic. This answers "does it build", never "does it draw the right
 * thing".
 *
 * AND THE LIMIT THAT MATTERS INSIDE THIS WALK: arm 4 imports the SOURCE module
 * over the origin, so it proves the shader the source declares compiles — not
 * the one in the bundle. Every other arm here drives the BUILT app. A stale or
 * broken bundle leaves arm 4 green; that is arm 2's and 2d's territory, and
 * `check:asset-integrity`'s. The source is imported rather than regex-read
 * because VERT and FRAG are template literals carrying `${...}` interpolations,
 * and reading those as text would measure a different string than the one the
 * driver sees.
 */
async function armShaders(browser, baseUrl, pageUrl) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  let out;
  try {
    await page.goto(pageUrl, { waitUntil: 'load', timeout: NAV_MS });
    out = await page.evaluate(async (base) => {
      const mod = await import(base + '/src/ui/scripture-web/web-renderer.js');
      const S = mod.SHADER_SOURCE;
      if (!S || typeof S.vertex !== 'string' || typeof S.fragment !== 'string') {
        return { armed: false, why: 'web-renderer.js exports no SHADER_SOURCE with vertex and fragment strings' };
      }
      const cv = document.createElement('canvas');
      const gl = cv.getContext('webgl2');
      if (!gl) return { armed: false, why: 'no webgl2 context in this browser' };

      const build = (type, src) => {
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        /* NUL-STRIP (the Verifier's, paid for once): a driver infoLog can carry
           a NUL, which makes every downstream grep treat the whole output as
           BINARY and hide the FAIL row — leaving only an exit code, which is
           also what a crash produces. The row is the evidence. */
        const log = (gl.getShaderInfoLog(sh) || '').replace(/\0/g, '').trim();
        return { ok: !!gl.getShaderParameter(sh, gl.COMPILE_STATUS), log, sh };
      };

      const v = build(gl.VERTEX_SHADER, S.vertex);
      const f = build(gl.FRAGMENT_SHADER, S.fragment);
      let link = { ok: false, log: 'not attempted — a shader failed to compile' };
      if (v.ok && f.ok) {
        const pr = gl.createProgram();
        gl.attachShader(pr, v.sh); gl.attachShader(pr, f.sh); gl.linkProgram(pr);
        link = { ok: !!gl.getProgramParameter(pr, gl.LINK_STATUS), log: (gl.getProgramInfoLog(pr) || '').replace(/\0/g, '').trim() };
      }
      /* POSITIVE CONTROL: the same pipeline must REJECT a deliberate break.
         Without it, "compiled" cannot be told from a pipeline that approves
         anything — and a driver that approves anything is exactly how this arm
         would go green forever. */
      const broken = build(gl.VERTEX_SHADER, S.vertex.replace('void main()', 'void main(@@@)'));
      return {
        armed: true,
        glVersion: String(gl.getParameter(gl.VERSION)),
        vertLen: S.vertex.length, fragLen: S.fragment.length,
        v: { ok: v.ok, log: v.log }, f: { ok: f.ok, log: f.log }, link,
        controlRejected: !broken.ok, controlLog: broken.log,
      };
    }, baseUrl);
  } catch (e) {
    out = { armed: false, why: 'the probe page threw: ' + (e && e.message ? e.message : String(e)) };
  } finally {
    await ctx.close().catch(() => {});
  }

  if (!out.armed) {
    armFourIncomplete = `4 the shader probe COULD NOT ARM (${out.why}). Nothing was compiled, which is not the same `
      + 'as compiling: a missing context is not a passing shader';
    notes.push('arm 4: NOT ARMED — ' + out.why);
    return;
  }
  if (!out.controlRejected) {
    armFourIncomplete = '4 the GL compiler ACCEPTED a deliberately broken vertex shader, so an OK from it means '
      + `nothing (control log ${JSON.stringify(out.controlLog)}). The instrument is dead, and nothing was measured`;
    notes.push('arm 4: INSTRUMENT DEAD — the control was not rejected');
    return;
  }
  for (const [name, r] of [['vertex', out.v], ['fragment', out.f]]) {
    if (!r.ok) fails.push(`4 the ${name} shader DOES NOT COMPILE — ${JSON.stringify(r.log) || 'the driver gave no log'}. `
      + 'web-renderer.test.js asserts this shader\'s TEXT and vitest has no GL context, so this would blank the '
      + 'whole screen with every other gate green');
  }
  if (out.v.ok && out.f.ok && !out.link.ok) {
    fails.push(`4 the shaders compile but the program DOES NOT LINK — ${JSON.stringify(out.link.log) || 'the driver gave no log'}`);
  }
  notes.push(`arm 4: ran ONCE (the shader does not depend on viewport, so four runs would be four extra GL contexts `
    + `for one answer), shaders=2 of 2 in the app source, programs=1, control=rejected, `
    + `vertex ${out.vertLen} chars, fragment ${out.fragLen} chars, gl ${JSON.stringify(out.glVersion)}, `
    + `compile v=${out.v.ok ? 'OK' : 'FAIL'} f=${out.f.ok ? 'OK' : 'FAIL'} link=${out.link.ok ? 'OK' : 'FAIL'}`);
}

function armChrome(tag, geo) {
  const fail = (m) => fails.push(`${tag} ${m}`);
  const before = fails.length;
  for (const o of geo.overlaps) {
    fail(`2a ${o.a} overlaps ${o.b} by ${o.w}x${o.h} px at (${o.x}, ${o.y})`);
  }
  /* AN UNJUDGEABLE ELEMENT FAILS. Recording the blindness is right and is not
     enough: a blindness that is acceptable today and unacceptable tomorrow
     reads identically in a green log, and `unhittable=1` passing silently is
     the whole problem. The chrome fix removes `pointer-events: none` from
     `.sw-credit`, and that removal is what makes the credit judgeable at all —
     with the property, 2b files it here as a note and 2a skips its pair because
     the fix nests it inside `.sw-controls`, so both arms go quiet and nothing
     looks. Re-adding the property for a plausible reason would return the
     credit to unjudgeable through a one-line change that no arm opposed.
     Measured on this tree: unhittable = 0 at all four frames, so this is a live
     assertion and not an aspiration. A future element that legitimately cannot
     be hit-tested gets a NAMED allowance here, not silence. */
  for (const u of geo.unhittable) {
    fail(`2b ${JSON.stringify(u.label)} (${u.sel}) CANNOT BE JUDGED — it is \`pointer-events: none\`, so `
      + `elementFromPoint returned ${u.by}, which is what is BEHIND it. Its visibility is unproven here, not `
      + 'disproven, and 2a cannot cover for it when the element is nested inside another chrome block. '
      + 'Either make it hit-testable or add a named allowance saying why being unjudgeable is acceptable.');
  }
  for (const c of geo.covered) {
    fail(`2b ${JSON.stringify(c.label)} (${c.sel}) is covered at its own centre (${c.x}, ${c.y}) by ${c.by} — a bounding box cannot see this`);
  }
  if (geo.overflowX > 1) fail(`2c the page scrolls ${geo.overflowX} px horizontally (scrollWidth ${geo.scrollWidth} > innerWidth ${geo.innerWidth})`);
  for (const s of geo.offscreen) {
    fail(`2c ${JSON.stringify(s.label)} (${s.sel}) sits outside the viewport: rect ${s.rect}`);
  }
  if (geo.noteGap === null) {
    notes.push(`${tag} 2e the portrait hint is not up at this frame, so its placement was NOT checked — not the same as passing`);
  } else {
    notes.push(`${tag} 2e the portrait hint sits ${geo.noteGap} px below ${geo.noteAgainst} `
      + `— the lowest chrome above it (intended 10, ceiling ${NOTE_GAP_MAX})`);
    if (geo.noteGap < 0) {
      fail(`2e the portrait hint overlaps ${geo.noteAgainst} by ${-geo.noteGap} px — that card is what covered the Back button`);
    } else if (geo.noteGap > NOTE_GAP_MAX) {
      fail(`2e the portrait hint floats ${geo.noteGap} px below ${geo.noteAgainst} against an intended 10 — its placement measurement `
        + 'has gone stale, which is what a draft observing the topbar only on mount produced (299 px against a topbar ending at 72)');
    }
  }
  /* Built from the fields the object ALREADY carries. A second copy of the
     viewport size would be two definitions that must agree. */
  const frameKey = `${Math.round(geo.innerWidth)}x${geo.innerHeight}`;
  const floor = BAND_FLOOR_PLATFORM && BAND_FLOOR_PLATFORM[frameKey];
  if (!BAND_FLOOR_PLATFORM) {
    fail(`2d NO FLOOR IS REGISTERED FOR PLATFORM ${JSON.stringify(process.platform)} (${geo.band.h} px measured at `
      + `${frameKey}). The band's top is chrome height, which is text layout, so a floor measured on another `
      + 'platform is a number about another machine — and at zero margin one pixel of font-metric difference '
      + 'reddens it by construction. Measure this platform three consecutive times and register what it reads; '
      + 'do NOT reuse another platform\'s number and do NOT add a tolerance to make one fit');
  } else if (floor === undefined) {
    fail(`2d ${frameKey} has NO REGISTERED FLOOR for the open reading band (${geo.band.h} px measured) on `
      + `${process.platform}. A new frame needs a measured floor, not a default — a default that passes is `
      + 'indistinguishable from a gate that is not watching this frame at all');
  } else if (geo.band.h < floor) {
    fail(`2d the open reading band is ${geo.band.h} px at ${frameKey}, BELOW the registered floor of ${floor} px `
      + `— the chrome took ${floor - geo.band.h} px from the reader. Chrome that stops overlapping itself has not `
      + 'necessarily got out of the reader\'s way, and this is the only arm that can tell the difference');
  }
  notes.push(`${tag} 2d open canvas band ${geo.band.h} px tall (y ${geo.band.top}..${geo.band.bottom}) of ${geo.innerHeight} px; `
    + `chrome covers ${geo.coveredPct}%; floor ${floor === undefined ? 'NONE REGISTERED for ' + process.platform : floor + ' px (' + process.platform + ')'}; `
    + `browser ${BROWSER_BUILD || 'UNDETERMINED — browser.version() gave nothing, so a red here cannot be told from an instrument change'}`);

  /* WHAT ARM 2 RAN. 0 failures and 0 checks are the same output, so the counts
     are printed and the empty case is a failure rather than a pass. */
  if (geo.blocksMissing.length) {
    fail(`2 the chrome selectors ${geo.blocksMissing.join(' ')} match nothing in the DOM — renamed, and every check that used them silently left the set`);
  }
  /* EACH ENTRY CARRIES ITS OWN REASON, so there is no catch-all arm guessing on
     behalf of a selector it was not written for. The first version of this line
     was written for the credit and printed "an absent CC-BY line is worse than
     an unreadable one" about `.sw-legend` when the arm was proved live — and
     would say it about the topbar. A gate's sentence is part of the gate. */
  for (const req of REQUIRED_PAINTED) {
    if (!geo.blocksInvisible.includes(req.sel)) continue;
    fail(`2f ${req.sel} is present in the DOM but NOT PAINTED, and ${req.why}. Every other arm is silent `
      + 'about this: 2a skips a nested pair, 2b drops an unpainted element from the hit list, and a required '
      + 'selector that matches but does not paint is only a note. This is the only arm that can see it');
  }
  if (!geo.pairs) fail('2a compared ZERO block pairs — the overlap check did not run, which is not the same as passing');
  if (!geo.hits) fail('2b hit-tested ZERO elements — the reachability check did not run, which is not the same as passing');
  notes.push(`${tag} arm 2: ran, blocks=[${geo.blocksFound.join(' ')}]`
    + (geo.blocksInvisible.length ? ` notPainted=[${geo.blocksInvisible.join(' ')}]` : '')
    + (geo.blocksMissing.length ? ` MISSING=[${geo.blocksMissing.join(' ')}]` : '')
    + `, pairs=${geo.pairs}, hits=${geo.hits}, unhittable=${geo.unhittable.length}, overflow=1, failures=${fails.length - before}`);
}

/** Chrome geometry, measured in viewport space — which is what the reader meets, rotation included. */
const readGeometry = (chromeSel, optionalSel) => {
  const R = (el) => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
  const vis = (el) => { const b = el.getBoundingClientRect(); const cs = getComputedStyle(el); return b.width > 0 && b.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && Number(cs.opacity) > 0.01; };
  const found = chromeSel.map((sel) => ({ sel, el: document.querySelector(sel) }));
  const optional = optionalSel.map((sel) => ({ sel, el: document.querySelector(sel) })).filter((o) => o.el);
  /* ABSENT and NOT PAINTED are different answers and only one of them is a
     defect: `.sw-legend` is legitimately `display: none` at a narrow frame,
     while a selector that matches NOTHING is a rename, which is exactly how a
     check set shrinks without anyone noticing. */
  const blocksMissing = found.filter((o) => !o.el).map((o) => o.sel);
  const blocksInvisible = found.filter((o) => o.el && !vis(o.el)).map((o) => o.sel);
  const blocks = found.concat(optional).filter((o) => o.el && vis(o.el)).map((o) => ({ sel: o.sel, el: o.el, rect: R(o.el) }));

  /* A PARENT CONTAINING ITS CHILD IS NOT ONE BLOCK COVERING ANOTHER, and the
     first draft of 2a could not tell them apart. When the CC-BY credit moved
     INTO the control strip — which is the fix for it being behind the strip —
     the credit's rect became a subset of the strip's by construction, and 2a
     reported a 286x11 "overlap" at every frame, permanently. A check that fires
     on the shape of the fix is worse than no check: whether a nested line is
     readable is a HIT TEST, and it gets one below. */
  const overlaps = [];
  let pairs = 0;
  for (let i = 0; i < blocks.length; i++) {
    for (let j = i + 1; j < blocks.length; j++) {
      if (blocks[i].el.contains(blocks[j].el) || blocks[j].el.contains(blocks[i].el)) continue;
      pairs++;
      const a = blocks[i].rect; const b = blocks[j].rect;
      const w = Math.min(a.r, b.r) - Math.max(a.x, b.x);
      const h = Math.min(a.b, b.b) - Math.max(a.y, b.y);
      if (w > 1 && h > 1) {
        overlaps.push({ a: blocks[i].sel, b: blocks[j].sel, w: Math.round(w), h: Math.round(h), x: Math.round(Math.max(a.x, b.x)), y: Math.round(Math.max(a.y, b.y)) });
      }
    }
  }

  /* `.sw-credit` is in here with the buttons because the property is the same
     one: can the reader actually SEE this, which a rectangle cannot answer. It
     is the CC-BY attribution, so "present but painted over" is a licence
     problem and not a cosmetic one. */
  const controls = [...document.querySelectorAll('.sw-topbar button, .sw-controls button, .sw-controls select, .sw-credit, .sw-orientation-note button')].filter(vis);
  const covered = [];
  const unhittable = [];
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
      const row = { label, sel: String(sel).slice(0, 40), x, y, by: String(by).slice(0, 40) };
      /* A miss has TWO causes and only one is a defect. `pointer-events: none`
         makes the element transparent to the hit test, so what comes back is
         whatever is behind it — which at a wide frame was the GL canvas, i.e.
         something UNDERNEATH being reported as covering it. The instrument has
         no answer there; say that, rather than a wrong one. A control with
         pointer-events: none is a different matter — it cannot be tapped. */
      const interactive = el.tagName === 'BUTTON' || el.tagName === 'SELECT' || el.tagName === 'A';
      if (getComputedStyle(el).pointerEvents === 'none' && !interactive) unhittable.push(row);
      else covered.push(row);
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

  /* 2e: where the portrait hint sits relative to the topbar it used to cover.
     null when the hint is not up — which is a different answer from 0 and is
     reported as one. */
  const noteEl = document.querySelector('.sw-orientation-note');
  /* Measured against the LOWEST chrome above it, not against the topbar alone:
     clearing the topbar and landing on the location readout is the bug this arm
     caught, so an arm that only watched the topbar would have called that fix
     green. */
  const aboveSel = ['.sw-topbar', '.sw-context'];
  const aboveEls = aboveSel.map((s) => document.querySelector(s)).filter((e) => e && vis(e));
  const aboveBottom = aboveEls.length ? Math.max(...aboveEls.map((e) => e.getBoundingClientRect().bottom)) : null;
  /* WHICH element the gap was measured against, printed beside the number. This
     arm's region has already been redefined once -- it measured the topbar
     alone, read 58 px, then measured the lowest chrome above the hint and read
     145 px on the SAME TREE with the same defect. Nothing in the output said
     the question had changed, so the two numbers are diffable only by someone
     who happens to know. A number without its region is not comparable to
     anything. */
  let noteAgainst = null;
  if (aboveBottom !== null) {
    const lowest = aboveEls.reduce((m, e) => (e.getBoundingClientRect().bottom > m.getBoundingClientRect().bottom ? e : m));
    noteAgainst = aboveSel[aboveEls.indexOf(lowest)] || lowest.className || lowest.tagName;
  }
  const noteGap = (noteEl && vis(noteEl) && aboveBottom !== null)
    ? Math.round((noteEl.getBoundingClientRect().top - aboveBottom) * 10) / 10
    : null;

  return {
    overlaps, covered, unhittable, offscreen, band: best, noteGap, noteAgainst,
    blocksFound: blocks.map((b) => b.sel), blocksMissing, blocksInvisible,
    pairs, hits: controls.length,
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

  /* Settled means PAINTED AND NOT LOADING, and deliberately not "publishing a
     ppv". ARM 2 OWES ARM 1 NOTHING: the chrome geometry is the same question on
     a tree that has never heard of the density law, and an earlier draft of
     this walk returned on the missing publisher and took arm 2 down with it —
     so a tree without the publisher reported four 1a failures and NOTHING about
     the chrome, which is how one arm's precondition silently switches off an
     independent one. */
  try {
    await page.waitForFunction(() => {
      const el = document.querySelector('.sw-root');
      return !!el && !document.querySelector('.sw-loading');
    }, { timeout: SETTLE_MS, polling: 100 });
  } catch (_e) {
    fails.push(`${tag} the web never settled within ${SETTLE_MS} ms: ${JSON.stringify(await state(page))}`);
    return;
  }

  /* ARM 2 FIRST, and before any gesture: a drag that ends in a tap would open a
     sheet, and arm 2 is about the chrome a reader meets on arrival. */
  const geo = await page.evaluate(readGeometry, CHROME, CHROME_WHEN_SHOWN);
  if (String(geo.fontScale || '1') !== String(scale)) {
    fails.push(`${tag} the text scale did not take: --font-scale reads ${JSON.stringify(geo.fontScale)} and root font-size ${geo.rootFontPx}, wanted ${scale}. Arm 2 would be measuring the wrong frame.`);
  }
  notes.push(`${tag} 2 --font-scale ${geo.fontScale || '1'} root ${geo.rootFontPx} viewport ${geo.innerWidth}x${geo.innerHeight}`);
  armChrome(tag, geo);

  const start = await state(page);
  if (start.ppvRaw === null) {
    fails.push(`${tag} 1a the screen does not publish data-ppv-css on .sw-root. The auto-switch's own input is then `
      + 'unobservable and its law is unmeasurable from a browser — that is a defect in the instrument\'s contract, not a skip.');
    notes.push(`${tag} arms 1 and 3 did not run (no ppv publisher, so the zoom ladder has nothing to step on); arm 2 above DID run`);
    return;
  }
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
  BROWSER_BUILD = await browser.version().catch(() => null);
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

  await armShaders(browser, own.base, own.url);

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
/* A real FAILURE outranks an incomplete arm: if something is broken, say what
   is broken. An incomplete arm only decides the exit when nothing failed —
   otherwise "incomplete" would hide a red. */
if (!fails.length && armFourIncomplete && !nothingToCheck) nothingToCheck = armFourIncomplete;
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
