/**
 * tools/e2e-dock-geometry.mjs — no two floating bottom controls overlap, in any combination that can show
 * at once (zones cz1, 2026-10-05).
 *
 * WHY. Fifteen floating controls were kept apart by eleven pairwise lifts (+58, +72, +130, 7.5rem), each
 * written for one pair. Everything no lift named collided: the Study Notes toggle sat on the auto-scroll
 * pill at every width and on the mini player's buttons, toasts sat on the player, the tour prompt hid the
 * whole player, the pill sat on the player's pull tab under the APK's insets (hub overlay audit,
 * D:/Swarm/lanes/hub/out/overhaul-2026-10-05/reports/audit-overlays.md). app.css now stacks them as one
 * bottom dock (--dock-sys / -floor / -player / -transport / -context, and the --dock-message lane).
 *
 * WHAT. The SHIPPED stylesheet (dist/app.min.css) and the journal's injected sheet are loaded into a blank
 * page that holds one stand-in per control, carrying the control's real class and its measured size
 * (412x915, ceb02901 + cz1; the size is set on an inner box, so the control's own padding and the inset
 * terms in its CSS still apply). Centred controls are drawn as wide as their CSS lets them get, so only the
 * stack can keep them apart. For every combination that can be on screen together (CASES), at 412x915,
 * 360x740 and 915x412, each without insets and with the APK's: --inset-top/--inset-bottom 68/24 in portrait (the Pixel),
 * (28, 24) in landscape, where the top inset is the status bar alone (MainActivity reserves systemBars +
 * displayCutout, and a landscape cutout sits on a side edge). 915x412 under a 68px top inset is a nav 135px
 * tall: 277px cannot hold the player, the open dwell row, find and a toast, whatever the stack does.
 * It asserts:
 *   G1  no two visible controls' rects intersect (a control nested in another is one control);
 *   G2  every visible control lies inside the viewport, below the top bar (inset-top + --bar-h, 56 px since the UI pass) and above
 *       the gesture inset (the player's own padding is the one thing allowed under it);
 *   G4  scrolled to its end, the reading text's last line rests clear above every control that stays up (the
 *       scroller's end padding is the dock's live height; toasts come and go);
 *   G3  every control the case expects is visible (a stopped auto-scroll pill and the tour prompt step aside
 *       while find is open). The Study Notes toggle and the prophecy Expand FAB left the dock (POL1/POL2, 2026-11-11):
 *       both are in the page now.
 * It cannot see a control whose size grows past its stand-in: the sizes are the measured ones, and a
 * redesign that changes them must change them here.
 *
 * Run: npm run e2e:dock (no server, ~5 s). Exit 0 all pass, 1 any failure (each one printed).
 */
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..', 'app', 'src', 'main', 'assets');
const CSS = readFileSync(resolve(ASSETS, 'dist', 'app.min.css'), 'utf8');
const JOURNAL = readFileSync(resolve(ASSETS, 'src', 'styles', 'journal-styles.js'), 'utf8');
// The root-exit toast styles itself inline; take its declarations from the source so the check follows them.
const ROOT_EXIT = (() => {
  const src = readFileSync(resolve(ASSETS, 'src', 'utils', 'root-exit-toast.js'), 'utf8');
  const arr = src.slice(src.indexOf('el.style.cssText = ['), src.indexOf("].join(';')"));
  return [...arr.matchAll(/^\s*(['"])(.*)\1,/gm)].map((m) => m[2]).join(';');
})();

// Stand-ins: [class(es), inner height px, inner width ('max' = as wide as the CSS allows), where it mounts].
const PARTS = {
  // The mini bar of the player brief (pl-l0 L1): 48 px controls in 8 px padding, no pull tab; the real one also writes its
  // measured height to --audio-bar-h, which the mount below mirrors.
  player:     '<div class="audio-bar"><div style="height:48px;flex:1"></div></div>',
  // A01.4 (0606ef9c4): while find is open a STOPPED pill steps aside and a running one stays to be paused, so the
  // running pill is the one that shares the dock with find; 'stopped' checks that it does step aside.
  autoscroll: '<div class="ascroll-pill is-running"><div style="height:44px;width:100vw"></div></div>',
  stopped:    '<div class="ascroll-pill"><div style="height:44px;width:100vw"></div></div>',
  expanded:   '<div class="ascroll-pill is-running is-expanded"><div style="height:44px;width:100vw"></div><div class="ascroll-row ascroll-dwell-row" style="height:44px"></div></div>',
  find:       '<div class="find-pill"><div style="height:44px;width:100vw"></div></div>',
  toast:      '<div class="vot-toast show"><div style="height:38px;width:100vw"></div></div>',          // two lines: 68px
  rootexit:   `<div id="vot-root-exit-toast" style="${ROOT_EXIT};opacity:1"><div style="height:20px;width:200px"></div></div>`,
  fab:        '<button class="jrn-fab jrn-fab-newentry"></button>',
};
// What can be on screen at once. (The first-run annotation hint no longer floats: W2d made it the first row of the
// reader's More menu, AnnotationHint.jsx, and its .ann-hint-pill rules are gone. The tour offer is an inline card in
// the Read tab since W1, so it is not on the dock either.) Journal: the FAB.
const CASES = [];
for (const player of [0, 1]) for (const as of ['', 'autoscroll', 'expanded', 'stopped']) for (const find of [0, 1])
  for (const msg of ['', 'toast', 'rootexit']) {
    const c = [player && 'player', as, find && 'find', msg].filter(Boolean);
    CASES.push(c);
  }
for (const player of [0, 1]) for (const msg of ['', 'toast', 'rootexit']) {
  CASES.push(['fab', player && 'player', msg].filter(Boolean));
}
const VIEWPORTS = [[412, 915], [360, 740], [915, 412]];
const insetsFor = (w, h) => [null, w > h ? [28, 24] : [68, 24]];

const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
const fails = [];
let checked = 0;
try {
  const page = await browser.newPage();
  for (const [w, h] of VIEWPORTS) {
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: w < 700, hasTouch: true });
    for (const ins of insetsFor(w, h)) {
      await page.setContent('<!doctype html><html><head></head><body class="history-in-nav"></body></html>');
      await page.addStyleTag({ content: CSS });
      // Docked things slide in as they enter; measure where they rest.
      await page.addStyleTag({ content: '*, *::before, *::after { animation: none !important; transition: none !important; }' });
      await page.addScriptTag({ content: JOURNAL });
      if (ins) await page.evaluate(([t, b]) => {
        document.documentElement.style.setProperty('--inset-top', t + 'px');
        document.documentElement.style.setProperty('--inset-bottom', b + 'px');
      }, ins);
      for (const c of CASES) {
        const r = await page.evaluate((parts, c) => {
          document.body.innerHTML = '<div class="screen-scroll" style="position:fixed;inset:0"><div style="height:3000px"></div><p id="dock-last" style="margin:0;height:28px">the last line</p></div>'
            + c.map((k) => parts[k]).join('');
          document.body.classList.toggle('audio-bar-open', c.includes('player'));
          document.body.classList.toggle('autoscroll-on', c.includes('autoscroll') || c.includes('expanded') || c.includes('stopped'));
          // As AudioPlayerBar measures itself: its height less the system inset's share of its bottom padding.
          const bar = document.querySelector('.audio-bar');
          document.documentElement.style.removeProperty('--audio-bar-h');
          if (bar) {
            const bs = getComputedStyle(bar);
            const share = Math.max(0, (parseFloat(bs.paddingBottom) || 0) - (parseFloat(bs.paddingTop) || 0));
            document.documentElement.style.setProperty('--audio-bar-h', Math.round(bar.getBoundingClientRect().height - share) + 'px');
          }
          const sys = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--inset-bottom')) || 0;
          const navBottom = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--inset-top')) || 0) + (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--bar-h')) || 67.4);
          const els = [...document.body.querySelectorAll('.audio-bar, .audio-bar-pull, .ascroll-pill, .find-pill, .vot-toast, #vot-root-exit-toast, .jrn-fab')];
          const vis = els.map((el) => ({ el, k: el.className || el.id, cs: getComputedStyle(el), q: el.getBoundingClientRect() }))
            .filter((o) => o.cs.display !== 'none' && o.q.width && o.q.height);
          const out = { hits: [], off: [], missing: [], shown: [], text: [] };
          const scroller = document.querySelector('.screen-scroll');
          scroller.scrollTop = 1e6;
          const last = document.getElementById('dock-last').getBoundingClientRect();
          for (const o of vis) {
            if (o.el.closest('.vot-toast, #vot-root-exit-toast')) continue;
            if (o.q.top < last.bottom - 0.5) out.text.push(`${o.k} top ${Math.round(o.q.top)} < last line ${Math.round(last.bottom)}`);
          }
          for (let i = 0; i < vis.length; i++) for (let j = i + 1; j < vis.length; j++) {
            const A = vis[i], B = vis[j];
            if (A.el.contains(B.el) || B.el.contains(A.el)) continue;
            const ix = Math.min(A.q.right, B.q.right) - Math.max(A.q.left, B.q.left);
            const iy = Math.min(A.q.bottom, B.q.bottom) - Math.max(A.q.top, B.q.top);
            if (ix > 0.5 && iy > 0.5) out.hits.push(`${A.k} x ${B.k} (${Math.round(ix)}x${Math.round(iy)})`);
          }
          for (const o of vis) {
            const floor = o.el.classList.contains('audio-bar') ? innerHeight : innerHeight - sys;
            if (o.q.left < -0.5 || o.q.top < navBottom - 0.5 || o.q.right > innerWidth + 0.5 || o.q.bottom > floor + 0.5)
              out.off.push(`${o.k} [${[o.q.left, o.q.top, o.q.right, o.q.bottom].map(Math.round)}]`);
          }
          const want = { player: '.audio-bar', autoscroll: '.ascroll-pill', expanded: '.ascroll-pill', stopped: '.ascroll-pill', find: '.find-pill',
            toast: '.vot-toast', rootexit: '#vot-root-exit-toast', fab: '.jrn-fab' };
          for (const k of c) {
            const el = document.querySelector(want[k]);
            const shown = vis.some((o) => o.el === el);
            const expect = !(k === 'stopped' && c.includes('find'));
            if (shown !== expect) out.missing.push(`${k} ${shown ? 'shown' : 'hidden'}`);
          }
          return out;
        }, PARTS, c);
        checked++;
        const tag = `${w}x${h}${ins ? ` insets ${ins.join('/')}` : ''} [${c.join(' + ') || 'empty'}]`;
        for (const x of r.hits) fails.push(`G1 ${tag}: ${x}`);
        for (const x of r.off) fails.push(`G2 ${tag}: off screen ${x}`);
        for (const x of r.missing) fails.push(`G3 ${tag}: ${x}`);
        for (const x of r.text) fails.push(`G4 ${tag}: ${x}`);
      }
    }
  }
} finally {
  await browser.close();
}
if (!checked) { console.error('e2e-dock-geometry: NOTHING CHECKED'); process.exit(1); }
for (const f of fails) console.error(f);
console.log(`e2e-dock-geometry: ${checked} layouts (${CASES.length} combinations x ${VIEWPORTS.length} viewports x with/without insets), ${fails.length} failures`);
process.exit(fails.length ? 1 : 0);
