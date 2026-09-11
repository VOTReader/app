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
 * ARM 4 — the shaders COMPILE, in two different senses, because one of them
 *   is about the source and the other is about what ships.
 *     4a  the SOURCE module's shaders compile and link, once, in a real driver
 *     4b  every shader THE APP ACTUALLY HANDED THE DRIVER compiled — recorded
 *         by hooking `shaderSource` before boot, so it reads the SHIPPED
 *         shader whatever the build did to it. And if the recorder holds
 *         NOTHING, the screen compiled nothing at all: a blank canvas that
 *         every other arm here would pass over. A disagreement between 4a and
 *         4b is itself information — the build rewrote the shader.
 *
 *   The old single-arm description follows; it is 4a's. Landing
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
 *     2e  RETIRED 2026-09-10: it placed the portrait hint, and nobox deleted the
 *         hint (the screen rotates itself; nothing asks the reader to turn)
 *     2g  the hide-all button, pressed both ways, once per frame: after one press
 *         the root carries .sw-chrome-hidden, every block in CHROME_HIDDEN_BY_BUTTON
 *         is display:none, aria-pressed reads true and the button itself is still
 *         hit-testable at its centre (it is the way back); after a second press
 *         every block that was painted on arrival is painted again and the
 *         sessionStorage key is gone. Restored in a finally, so a red 2g cannot
 *         hand arm 1 a chromeless screen. Whether the strip and the button sit
 *         INSIDE the root's box is chrome-fit's F1 (tools/e2e-sw-chrome.mjs, its
 *         own gate); 2b/2c do not re-measure it
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
/* 1.6 is the +/- KEY's factor (ScriptureWebScreen onKeyDown -> zoomAbout(..., 1.6, ...)).
   The ladder clicked the zoom buttons at 1.8 until Corbin's trim deleted them
   (2026-09-10); pinch, wheel and the keys are the routes that remain, and the
   keys are the one a driver can step exactly. */
const ZOOM_STEP = num('SWWEB_ZOOM_STEP', 1.6);        // must match onKeyDown's +/- factor
const MAX_ZOOM_STEPS = num('SWWEB_MAX_ZOOM_STEPS', 24);
const SETTLE_MS = num('SWWEB_SETTLE_MS', 6000);
const NAV_MS = num('SWWEB_NAV_MS', 30000);
const PAN_MS = num('SWWEB_PAN_MS', 1800);
/* `.sw-context` (the location card) and `.sw-orientation-note` (the portrait
   hint) left this list with Corbin's trim and nobox (2026-09-10); `.sw-hide-all`
   joined with the trim — it is the one control that must never be under
   anything, because it is the way back once the rest is hidden. */
const CHROME = ['.sw-topbar', '.sw-controls', '.sw-legend', '.sw-credit', '.sw-hide-all'];
/* Chrome the hide-all button must make disappear. `.sw-credit` rides inside
   `.sw-controls`; `.sw-legend` is display:none on a narrow root anyway. */
const CHROME_HIDDEN_BY_BUTTON = ['.sw-topbar', '.sw-controls', '.sw-legend'];
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
/* The GL renderer string (UNMASKED_RENDERER_WEBGL), printed beside every number a
   GPU could move and beside the band's floor line, so a red line names the whole
   instrument (Charter 2026-09-10: GPU named or not a number). The band is TEXT
   LAYOUT, so its floor stays keyed by frame x platform; the renderer only rides
   along there. Undetermined prints as undetermined. */
let GL_RENDERER = null;

const BAND_FLOOR = {
  /* KEYED BY PLATFORM AS WELL AS FRAME, because the band's top is chrome
     height, which is TEXT LAYOUT, and this walk runs on two platforms: a
     developer's win32 and `ubuntu-latest` in ci.yml. At zero margin one pixel
     of font-metric difference reddens it by construction, and a floor that
     reddens for a reason nobody can act on is a floor that gets lowered. */
  win32: {
    /* RE-REGISTERED 2026-09-11 (6cb64297, three consecutive runs identical, RTX 5080 /
       Chrome 152). The REGION moved, not the chrome: nobox rotates the root on a
       portrait frame, so the band is the root's vertical, which is viewport X, and
       the old rows (154 = y 237..391 of 640; 518 = y 237..755 of 952) were sweeps
       down viewport y on the pre-rotation tree — a number about a region that no
       longer exists. A floor measured against a stale definition of the region
       fails whichever way the region moved; the axis is printed on 2d's line now. */
    '320x640': 135,   // x 52..187 of 320 along the rotated root, chrome 52.2% — identical in all three runs
    '426x952': 290,   // x 52..342 of 426 along the rotated root, chrome 27.7% — identical in all three runs
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
  'requiredPainted=' + REQUIRED_PAINTED.map((r) => r.sel).join('|'),
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
  /* The +/- key on the focused root. React's onKeyDown hears a bubbling
     KeyboardEvent dispatched on the element, and the handler zooms about the
     centre by exactly ZOOM_STEP. No button is involved: trim deleted them. */
  await page.evaluate((key) => {
    const root = /** @type {HTMLElement|null} */ (document.querySelector('.sw-root'));
    if (!root) throw new Error('no .sw-root to send ' + key + ' to');
    root.focus();
    root.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }, dir > 0 ? '+' : '-');
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

/* Read arm 4b's recorder. Runs in the PAGE, so it is a plain function of its
   own and closes over nothing here.

   `deleted` is load-bearing and not a detail: web-renderer.js compile() calls
   gl.deleteShader() BEFORE it throws, so on the fallback path the shader is
   already gone and getShaderInfoLog returns ''. An empty log from a live
   shader ("the driver said nothing") and an empty log from a deleted one ("the
   log existed and was thrown away before I looked") are completely different
   facts, and gl.isShader tells them apart exactly. */
const READ_RECORDER = () => (window.__swwebShaders || []).map((r) => {
  const g = r.gl;
  let ok = null;
  try { ok = !!g.getShaderParameter(r.sh, g.COMPILE_STATUS); } catch (_e) { ok = null; }
  let log = '';
  try { log = (g.getShaderInfoLog(r.sh) || '').split(String.fromCharCode(0)).join('').trim(); } catch (_e) { log = ''; }
  let deleted = false;
  try { deleted = !g.isShader(r.sh); } catch (_e) { deleted = false; }
  let t = (r.type === 0 || r.type) ? r.type : null;   // remembered at createShader
  if (t === null) {
    /* Only for a shader created before the hook installed. Returns null on a
       DELETED shader, which is why it cannot be the primary source. */
    try { t = g.getShaderParameter(r.sh, g.SHADER_TYPE); } catch (_e) { t = null; }
  }
  let name = 'a shader of UNKNOWN stage';
  if (t === g.VERTEX_SHADER) name = 'the VERTEX shader';
  else if (t === g.FRAGMENT_SHADER) name = 'the FRAGMENT shader';
  return { ok, log, deleted, name, len: r.src.length, head: r.src.split('\n').slice(0, 3).join(' ').slice(0, 80) };
});

/* NEVER render an empty log as the driver's words. `JSON.stringify('')` is
   '""' -- truthy -- so the obvious `stringify(log) || fallback` is dead on
   arrival, which is exactly how four red rows came back reading `: ""`. */
function glLog(r, carriedBy) {
  if (r.log) return JSON.stringify(r.log);
  if (r.deleted) {
    return 'UNREADABLE HERE -- the renderer deleted the shader before throwing (web-renderer.js compile()), so the '
      + 'driver\'s words survive only in ' + (carriedBy ? JSON.stringify(carriedBy) : "the screen's own message");
  }
  return 'EMPTY -- the shader is still live and the driver gave no log at all, which is itself odd';
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
    armFourIncomplete = `4a the shader probe COULD NOT ARM (${out.why}). Nothing was compiled, which is not the same `
      + 'as compiling: a missing context is not a passing shader';
    notes.push('arm 4a: NOT ARMED — ' + out.why);
    return;
  }
  if (!out.controlRejected) {
    armFourIncomplete = '4a the GL compiler ACCEPTED a deliberately broken vertex shader, so an OK from it means '
      + `nothing (control log ${JSON.stringify(out.controlLog)}). The instrument is dead, and nothing was measured`;
    notes.push('arm 4a: INSTRUMENT DEAD — the control was not rejected');
    return;
  }
  for (const [name, r] of [['vertex', out.v], ['fragment', out.f]]) {
    if (!r.ok) fails.push(`4a the ${name} shader DOES NOT COMPILE — ${JSON.stringify(r.log) || 'the driver gave no log'}. `
      + 'web-renderer.test.js asserts this shader\'s TEXT and vitest has no GL context, so this would blank the '
      + 'whole screen with every other gate green');
  }
  if (out.v.ok && out.f.ok && !out.link.ok) {
    fails.push(`4a the shaders compile but the program DOES NOT LINK — ${JSON.stringify(out.link.log) || 'the driver gave no log'}`);
  }
  notes.push(`arm 4a: ran ONCE (the shader does not depend on viewport, so four runs would be four extra GL contexts `
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
  /* THE AXIS IS PART OF THE NUMBER. On a rotated root the band runs along viewport
     x and its extent is innerWidth; "y .. of innerHeight" there reads a band as a
     share of the wrong edge. readGeometry sweeps the root's axis and says which. */
  const axis = geo.rotated ? 'x' : 'y';
  notes.push(`${tag} 2d open canvas band ${geo.band.h} px tall (${axis} ${geo.band.top}..${geo.band.bottom}) of ${geo.extent} px`
    + `${geo.rotated ? ' along the rotated root' : ''}; `
    + `chrome covers ${geo.coveredPct}%; floor ${floor === undefined ? 'NONE REGISTERED for ' + process.platform : floor + ' px (' + process.platform + ')'}; `
    + `browser ${BROWSER_BUILD || 'UNDETERMINED — browser.version() gave nothing, so a red here cannot be told from an instrument change'}; `
    + `renderer ${GL_RENDERER || 'UNDETERMINED — the probe page gave no WebGL2 context'}`);

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

/* ARM 2g — the hide-all button, pressed both ways. The reader's way back once
   the rest is hidden, so the one property that matters most is that the button
   is still HIT-TESTABLE in the hidden state (a bounding box cannot see a card
   painted over it; elementFromPoint can). Each press is a real click through
   puppeteer (a pointer at the element's centre, transforms included — the root
   is CSS-rotated on the portrait frames), never `el.click()`. The probe reads
   everything in one round trip so the two states are compared like for like.
   RESTORED IN A FINALLY: the toggle persists in sessionStorage, and a red 2g
   that left the chrome hidden would hand arm 1 a screen with no strip to read
   the density from — one arm's failure silently becoming another's. */
const HIDE_ALL_PROBE = (hiddenSel) => {
  const root = document.querySelector('.sw-root');
  const btn = document.querySelector('.sw-hide-all');
  if (!root || !btn) return { missing: !root ? '.sw-root' : '.sw-hide-all' };
  const b = btn.getBoundingClientRect();
  const cx = Math.round(b.left + b.width / 2); const cy = Math.round(b.top + b.height / 2);
  const hit = document.elementFromPoint(cx, cy);
  const painted = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) > 0.01; };
  let key = null; try { key = sessionStorage.getItem('vot-sw-chrome-hidden'); } catch (_e) { key = 'UNREADABLE'; }
  return {
    hidden: root.classList.contains('sw-chrome-hidden'),
    pressed: btn.getAttribute('aria-pressed'),
    hittable: !!hit && (hit === btn || btn.contains(hit)),
    hitBy: hit ? (hit.className && String(hit.className).slice(0, 40)) || hit.tagName : null,
    x: cx, y: cy, w: Math.round(b.width), h: Math.round(b.height),
    blocks: hiddenSel.map((sel) => { const el = document.querySelector(sel); return { sel, state: !el ? 'MISSING' : painted(el) ? 'painted' : 'hidden' }; }),
    key,
  };
};

async function armHideAll(page, tag) {
  const fail = (m) => fails.push(`${tag} 2g ${m}`);
  const before = fails.length;
  const probe = () => page.evaluate(HIDE_ALL_PROBE, CHROME_HIDDEN_BY_BUTTON);
  const press = async (wantHidden) => {
    await page.click('.sw-hide-all');
    await page.waitForFunction((want) => !!document.querySelector('.sw-root') && document.querySelector('.sw-root').classList.contains('sw-chrome-hidden') === want, { timeout: 2000, polling: 50 }, wantHidden).catch(() => {});
  };
  const p0 = await probe();
  if (p0.missing) { fail(`${p0.missing} matches nothing — the arm cannot run, which is not the same as passing`); return; }
  const arrivedPainted = p0.blocks.filter((b) => b.state === 'painted').map((b) => b.sel);
  if (p0.hidden || p0.pressed !== 'false') fail(`arrived HIDDEN (root class ${p0.hidden}, aria-pressed ${JSON.stringify(p0.pressed)}, key ${JSON.stringify(p0.key)}) — a fresh context must arrive with its chrome shown`);
  if (!p0.hittable) fail(`the button is not hit-testable at its centre (${p0.x}, ${p0.y}) on arrival — elementFromPoint gave ${p0.hitBy}`);
  if (Math.min(p0.w, p0.h) < 44) fail(`the button's box is ${p0.w}x${p0.h} px on arrival, under the 44 px tap target .sw-btn promises`);
  let p1 = null;
  try {
    await press(true);
    p1 = await probe();
    if (!p1.hidden) fail(`one press did not hide the chrome: the root has no .sw-chrome-hidden (aria-pressed ${JSON.stringify(p1.pressed)})`);
    if (p1.pressed !== 'true') fail(`aria-pressed reads ${JSON.stringify(p1.pressed)} in the hidden state, not "true" — the state has no name for a screen reader`);
    for (const b of p1.blocks) if (b.state !== 'hidden') fail(`${b.sel} is ${b.state} after the press — the button must make it disappear`);
    if (!p1.hittable) fail(`in the hidden state the button is NOT hit-testable at its centre (${p1.x}, ${p1.y}) — elementFromPoint gave ${p1.hitBy}; the reader has no way back`);
    if (Math.min(p1.w, p1.h) < 44) fail(`in the hidden state the button's box is ${p1.w}x${p1.h} px — the glyph may shrink, the 44 px target may not`);
    if (p1.key !== '1') fail(`the hidden state is not remembered: sessionStorage key reads ${JSON.stringify(p1.key)}, wanted "1"`);
  } finally {
    /* The way back, taken whether or not the checks above passed. */
    await press(false);
  }
  const p2 = await probe();
  if (p2.hidden || p2.pressed !== 'false') fail(`the second press did not restore the chrome (root class ${p2.hidden}, aria-pressed ${JSON.stringify(p2.pressed)}) — every arm after this one would run on a chromeless screen`);
  for (const b of p2.blocks) {
    if (arrivedPainted.includes(b.sel) && b.state !== 'painted') fail(`${b.sel} was painted on arrival and is ${b.state} after the second press`);
  }
  if (p2.key !== null && p2.key !== 'UNREADABLE') fail(`the shown state left the key behind: sessionStorage reads ${JSON.stringify(p2.key)} — absence is the signal, a stored "shown" is a default impersonating a choice`);
  notes.push(`${tag} 2g hide-all: arrived shown [${arrivedPainted.join(' ')}]; pressed -> hidden=${p1 ? p1.hidden : 'n/a'} `
    + `blocks=[${p1 ? p1.blocks.map((b) => b.sel + ':' + b.state).join(' ') : 'n/a'}] button ${p1 ? p1.w + 'x' + p1.h : '?'} at (${p1 ? p1.x + ',' + p1.y : '?'}) hittable=${p1 ? p1.hittable : 'n/a'}; `
    + `pressed again -> hidden=${p2.hidden} blocks=[${p2.blocks.map((b) => b.sel + ':' + b.state).join(' ')}] key=${JSON.stringify(p2.key)}; failures=${fails.length - before}`);
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
  const controls = [...document.querySelectorAll('.sw-topbar button, .sw-controls button, .sw-controls select, .sw-credit, .sw-hide-all')].filter(vis);
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

  /* 2d: the tallest run of the ROOT'S HEIGHT no chrome block covers. Chrome is
     banded top and bottom of the instrument, so a 1-D sweep along the root's
     vertical is the honest measure. On a portrait phone the root is CSS-rotated
     90 deg (nobox, 2026-09-10) and its vertical is the VIEWPORT'S X AXIS: a sweep
     down viewport y there reads the topbar edge-on as covering 91% of the frame
     (28 px at 320x640 with nothing wrong on screen). The axis follows the root. */
  const rotated = !!document.querySelector('.sw-root.sw-rotated');
  const extent = rotated ? innerWidth : innerHeight;
  const rows = new Uint8Array(Math.max(1, Math.round(extent)));
  for (const bl of blocks) {
    const lo = rotated ? bl.rect.x : bl.rect.y;
    const hi = rotated ? bl.rect.r : bl.rect.b;
    const from = Math.max(0, Math.floor(lo));
    const to = Math.min(rows.length, Math.ceil(hi));
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
    overlaps, covered, unhittable, offscreen, band: best, rotated,
    blocksFound: blocks.map((b) => b.sel), blocksMissing, blocksInvisible,
    pairs, hits: controls.length,
    /* The window's own numbers under their own names. `innerHeight: rows.length` used to
       stand here — the swept extent wearing the height's name — and read 640 only while
       the sweep ran down y; along the rotated root it read 320, every portrait frame
       keyed itself "320x320" and 2d found no floor for a frame it had one for. */
    innerWidth, innerHeight, extent: rows.length,
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

  /* ARM 4b's RECORDER, installed before the app boots. Hooks `shaderSource` on
     the context prototype and keeps every string the app hands the driver,
     together with the context that received it, so COMPILE_STATUS can be read
     off the real shader object afterwards. This reaches the SHIPPED shader —
     whatever the build did to it — where 4a reaches only the source module.
     BOTH prototypes are hooked: recording webgl2 alone would make a webgl1
     fallback look like "the screen never compiled anything", which is a
     different defect and must not be impersonated. */
  await page.evaluateOnNewDocument(() => {
    window.__swwebShaders = [];
    /* THE STAGE IS REMEMBERED AT CREATION, not queried later. A shader that
       fails to compile is deleted by web-renderer.js before it throws, and
       `getShaderParameter(sh, SHADER_TYPE)` on a deleted shader returns null --
       so a post-hoc read knows the stage on every path EXCEPT the failure path,
       which is the only one that needs it. `createShader(type)` is handed the
       answer; keep it. */
    window.__swwebStages = new WeakMap();
    for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
      if (!C || !C.prototype || !C.prototype.shaderSource) continue;
      const origCreate = C.prototype.createShader;
      C.prototype.createShader = function createShader(type) {
        const sh = origCreate.call(this, type);
        try { if (sh) window.__swwebStages.set(sh, type); } catch (_e) { /* never break the app */ }
        return sh;
      };
      const orig = C.prototype.shaderSource;
      C.prototype.shaderSource = function shaderSource(sh, src) {
        try {
          let type = null;
          try { type = window.__swwebStages.get(sh); } catch (_e) { type = null; }
          window.__swwebShaders.push({ gl: this, sh, src: String(src), type });
        } catch (_e) { /* never break the app */ }
        return orig.call(this, sh, src);
      };
    }
  });

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
    /* The same NUL `getShaderInfoLog` needs stripping for arrives here too:
       the screen quotes the driver verbatim into its own message. */
    const why = await page.evaluate(() => (document.querySelector('.sw-fallback-body') || { textContent: '' })
      .textContent.split(String.fromCharCode(0)).join('').trim());
    /* ARM 4b ON THE FALLBACK PATH. A shipped shader that does not compile
       THROWS out of buildRenderer, the screen catches it into `loadError`, and
       we arrive here -- which used to return NOTHING-TO-CHECK and never read
       the recorder, leaving 4b's `ok === false` branch unreachable in the real
       app. The recorder still holds the shader, because `shaderSource` runs
       before `compileShader`. Read it, and let a named defect outrank "nothing
       to check": `nothingToCheck` is tested FIRST at exit, so setting both
       would hide the red. */
    const dead = await page.evaluate(READ_RECORDER).catch(() => []);
    const broke = dead.filter((r) => r.ok === false);
    if (broke.length) {
      for (const r of broke) {
        fails.push(`${tag} 4b ${r.name} THE APP SHIPPED does not compile: ${glLog(r, why)} `
          + `(${r.len} chars, starts ${JSON.stringify(r.head)}). The screen fell back to ${JSON.stringify(why)}; `
          + 'this is the arm that names WHICH shader and WHAT the driver said, where the fallback text is only a symptom');
      }
    } else {
      nothingToCheck = `${tag} the web could not be drawn: ${JSON.stringify(why)}. No density control exists to measure, so no arm here means anything.`;
    }
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
  const geo = await page.evaluate(readGeometry, CHROME, []);   // no conditional chrome since nobox
  if (String(geo.fontScale || '1') !== String(scale)) {
    fails.push(`${tag} the text scale did not take: --font-scale reads ${JSON.stringify(geo.fontScale)} and root font-size ${geo.rootFontPx}, wanted ${scale}. Arm 2 would be measuring the wrong frame.`);
  }
  notes.push(`${tag} 2 --font-scale ${geo.fontScale || '1'} root ${geo.rootFontPx} viewport ${geo.innerWidth}x${geo.innerHeight}`);
  armChrome(tag, geo);
  /* 2g right after 2's arrival read and before any gesture: it presses a real
     button twice and restores in a finally, so arm 1 below meets the chrome it
     expects. */
  await armHideAll(page, tag);
  /* 4b SITS ABOVE ARM 1'S RETURN, ON PURPOSE. It owes arm 1 nothing -- the
     recorder was filled at boot -- and on a tree without the ppv publisher the
     frame returns right after the 1a rows. Measured on two branches: with the
     read below that return, 4b never ran and nothing said so. */
  /* ARM 4b — what the APP compiled, read off the recorder. Per frame, because
     it is free: no extra GL context, no extra page, just a read of what already
     happened.

     WHICH BRANCH A BITE CAN DRIVE, measured rather than assumed. Getting here
     means the screen SETTLED, and a shipped shader that fails to compile throws
     out of buildRenderer long before that — so `ok === false` is essentially
     unreachable at THIS read, and the fallback-path read above is what
     witnesses it. (Not provably dead: a context-loss rebuild can leave a failed
     shader in the recorder while an earlier program still paints. It stays, and
     it is cheap.) What this read owns, and the fallback read cannot, is
     `!shipped.length` — THE SCREEN COMPILED NOTHING AT ALL. Every other arm
     here passes over a blank canvas: the chrome still lays out, the density
     control still reads, the band is still measurable. This is the only arm
     that looks at whether the renderer ran. */
  const shipped = await page.evaluate(READ_RECORDER).catch((e) => ({ err: e.message }));

  if (shipped && shipped.err) {
    fails.push(`${tag} 4b the shader recorder could not be read (${shipped.err}) — nothing was measured about what `
      + 'the app compiled, which is not the same as its compiling');
  } else if (!shipped.length) {
    fails.push(`${tag} 4b THE SCREEN COMPILED NO SHADERS AT ALL — \`shaderSource\` was never called, so the canvas `
      + 'cannot have drawn anything. Every other arm here can pass over a blank canvas; this is the only one that '
      + 'looks at whether the renderer ran');
  } else {
    const bad = shipped.filter((r) => r.ok === false);
    const unknown = shipped.filter((r) => r.ok === null);
    for (const r of bad) {
      fails.push(`${tag} 4b ${r.name} THE APP COMPILED failed: ${glLog(r, null)} `
        + `(${r.len} chars, starts ${JSON.stringify(r.head)}). This is the SHIPPED shader, not the source module`);
    }
    for (const r of unknown) {
      fails.push(`${tag} 4b ${r.name}'s COMPILE_STATUS could not be read (${r.len} chars, starts `
        + `${JSON.stringify(r.head)}) — unknown is reported as unknown, never as compiled`);
    }
    notes.push(`${tag} 4b the app handed the driver ${shipped.length} shader${shipped.length === 1 ? '' : 's'}, `
      + `${shipped.filter((r) => r.ok === true).length} compiled, ${bad.length} failed, ${unknown.length} unreadable `
      + `(${shipped.map((r) => r.len).join('+')} chars) — the SHIPPED shader, where 4a reads the source module`);
  }


  const start = await state(page);
  if (start.ppvRaw === null) {
    fails.push(`${tag} 1a the screen does not publish data-ppv-css on .sw-root. The auto-switch's own input is then `
      + 'unobservable and its law is unmeasurable from a browser — that is a defect in the instrument\'s contract, not a skip.');
    notes.push(`${tag} arms 1 and 3 did not run (no ppv publisher, so the zoom ladder has nothing to step on); arms 2 and 4b above DID run`);
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
  notes.push(`${tag} entry ppv ${start.ppv} density ${start.density}`);

  const rise = await zoomArc(page, +1, (s) => s.ppv >= DENSITY_ENTER_PPV_CSS);
  const atCeiling = await zoomArc(page, +1, () => false);          // run to the stop for arm 3
  const top = atCeiling[atCeiling.length - 1];

  const ft = await frameTime(page, PAN_MS).catch((e) => ({ err: e.message }));
  if (ft && ft.err) notes.push(`${tag} 3 frame time UNMEASURED (${ft.err})`);
  else if (!ft) notes.push(`${tag} 3 frame time UNMEASURED (no frames sampled)`);
  else notes.push(`${tag} 3 deep-zoom frame time at ppv ${top.ppv}: median ${ft.median} ms, p95 ${ft.p95} ms, max ${ft.max} ms over ${ft.n} frames (${ft.moves} pointer moves) — PRINTED, NOT ASSERTED; `
    + `renderer ${GL_RENDERER || 'UNDETERMINED'}; browser ${BROWSER_BUILD || 'UNDETERMINED'}`);

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
  GL_RENDERER = renderer;
  console.log('[e2e-swweb] renderer ' + JSON.stringify(renderer) + ' browser ' + JSON.stringify(BROWSER_BUILD));

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
/* A NAMED DEFECT OUTRANKS "NOTHING TO CHECK", decided HERE and nowhere else.
   `fails` accumulates across frames and `nothingToCheck` is set inside the frame
   loop, so frame 1 can record real failures and frame 2 can then fail to draw.
   Testing nothingToCheck first swallowed frame 1's rows and exited 2 -- I had
   the rule written in a comment and applied it at one site of three (the
   Verifier's finding). Guarding each setter is the same mistake waiting for a
   fourth site; the exit is where every path routes through. The run is
   incomplete either way; the difference is whether anyone learns what failed. */
if (fails.length) {
  if (nothingToCheck) {
    console.error('[e2e-swweb] ALSO INCOMPLETE: ' + nothingToCheck);
    console.error('[e2e-swweb] — the failures below are from frames that DID run; the frame above never did, '
      + 'so this result is a FAIL and an incomplete run at once, and the fail is the one that counts');
  }
  console.error('[e2e-swweb] ' + fails.length + ' FAILED:\n  ' + fails.join('\n  '));
  console.error('[e2e-swweb] RESULT FAIL (' + fails.length + ')' + (nothingToCheck ? ' + INCOMPLETE' : '') + ' PARAMS ' + PARAMS);
  process.exit(EXIT_FAIL);
}
if (nothingToCheck) {
  console.error('[e2e-swweb] ' + nothingToCheck);
  console.error('[e2e-swweb] RESULT NOTHING-TO-CHECK — INCOMPLETE, not a pass and not a skip. PARAMS ' + PARAMS);
  process.exit(EXIT_NOTHING_TO_CHECK);
}
console.log('[e2e-swweb] RESULT PASS PARAMS ' + PARAMS);
process.exit(EXIT_PASS);
