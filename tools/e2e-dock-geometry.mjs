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
 * 360x740 and 915x412, each without insets and with the APK's: __setInsets(68, 24) in portrait (the Pixel),
 * (28, 24) in landscape, where the top inset is the status bar alone (MainActivity reserves systemBars +
 * displayCutout, and a landscape cutout sits on a side edge). 915x412 under a 68px top inset is a nav 135px
 * tall: 277px cannot hold the player, the open dwell row, find and a toast, whatever the stack does.
 * It asserts:
 *   G1  no two visible controls' rects intersect (a control nested in another is one control);
 *   G2  every visible control lies inside the viewport, below the top bar (inset-top + 67.4 px) and above
 *       the gesture inset (the player's own padding is the one thing allowed under it);
 *   G4  scrolled to its end, the reading text's last line rests clear above every control that stays up (the
 *       scroller's end padding is the dock's live height; toasts and the first-run hint come and go);
 *   G3  every control the case expects is visible, and the Study Notes toggle is hidden while find is open
 *       (and, on a short screen, while the dwell row is open).
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
  player:     '<div class="audio-bar"><div style="height:49px;flex:1"></div><button class="audio-bar-pull"></button></div>',
  autoscroll: '<div class="ascroll-pill"><div style="height:44px;width:100vw"></div></div>',
  expanded:   '<div class="ascroll-pill is-expanded"><div style="height:44px;width:100vw"></div><div class="ascroll-row ascroll-dwell-row" style="height:44px"></div></div>',
  find:       '<div class="find-pill"><div style="height:44px;width:100vw"></div></div>',
  toggle:     '<div class="mode-toggle-wrap"><div class="mode-toggle-label">Study Notes</div><div class="mode-toggle"><div style="height:33px;width:229px"></div></div></div>',
  hint:       '<div class="ann-hint-pill"><div style="height:57px;width:100vw"></div></div>',            // 79px with its padding
  toast:      '<div class="vot-toast show"><div style="height:38px;width:100vw"></div></div>',          // two lines: 68px
  rootexit:   `<div id="vot-root-exit-toast" style="${ROOT_EXIT};opacity:1"><div style="height:20px;width:200px"></div></div>`,
  tour:       '<div class="tour-prompt"><div style="height:192px"></div></div>',                         // 218px
  fab:        '<button class="jrn-fab jrn-fab-newentry"></button>',
  tabbar:     '<nav class="tabbar"><button class="tabbar-tab"></button></nav>',                     // rs1 (overhaul)
};
// What can be on screen at once. Reading screens: hint yields to the player (AnnotationHint), autoscroll and
// find hide it (app.css); find hides the toggle. Home: the tour prompt. Journal: the FAB.
const CASES = [];
for (const player of [0, 1]) for (const as of ['', 'autoscroll', 'expanded']) for (const find of [0, 1])
  for (const toggle of [0, 1]) for (const msg of ['', 'toast', 'rootexit']) {
    const c = [player && 'player', as, find && 'find', toggle && 'toggle', msg].filter(Boolean);
    CASES.push(c);
    if (!player && !as && !find) CASES.push([...c, 'hint']);
  }
for (const player of [0, 1]) for (const msg of ['', 'toast', 'rootexit']) {
  CASES.push(['tour', player && 'player', msg].filter(Boolean));
  CASES.push(['fab', player && 'player', msg].filter(Boolean));
}
// rs1 (overhaul): every case again with the 4-tab bar under the dock.
for (const c of CASES.splice(0)) CASES.push(c, [...c, 'tabbar']);
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
      // The hint slides up 8px as it enters; measure where things rest.
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
          document.body.classList.toggle('autoscroll-on', c.includes('autoscroll') || c.includes('expanded'));
          document.body.classList.toggle('tour-prompt-open', c.includes('tour'));
          const tour = document.querySelector('.tour-prompt');
          if (tour) document.documentElement.style.setProperty('--tour-prompt-h', Math.round(tour.getBoundingClientRect().height) + 'px');
          const sys = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--inset-bottom')) || 0;
          const navBottom = (parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--inset-top')) || 0) + 67.4;
          const els = [...document.body.querySelectorAll('.audio-bar, .audio-bar-pull, .ascroll-pill, .find-pill, .mode-toggle-wrap, .ann-hint-pill, .vot-toast, #vot-root-exit-toast, .tour-prompt, .jrn-fab, .tabbar')];
          const vis = els.map((el) => ({ el, k: el.className || el.id, cs: getComputedStyle(el), q: el.getBoundingClientRect() }))
            .filter((o) => o.cs.display !== 'none' && o.q.width && o.q.height);
          const out = { hits: [], off: [], missing: [], shown: [], text: [] };
          const scroller = document.querySelector('.screen-scroll');
          scroller.scrollTop = 1e6;
          const last = document.getElementById('dock-last').getBoundingClientRect();
          for (const o of vis) {
            if (o.el.closest('.vot-toast, #vot-root-exit-toast, .ann-hint-pill')) continue;
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
            const floor = o.el.classList.contains('audio-bar') || o.el.classList.contains('tabbar') ? innerHeight : innerHeight - sys;
            if (o.q.left < -0.5 || o.q.top < navBottom - 0.5 || o.q.right > innerWidth + 0.5 || o.q.bottom > floor + 0.5)
              out.off.push(`${o.k} [${[o.q.left, o.q.top, o.q.right, o.q.bottom].map(Math.round)}]`);
          }
          const want = { player: '.audio-bar', autoscroll: '.ascroll-pill', expanded: '.ascroll-pill', find: '.find-pill', toggle: '.mode-toggle-wrap',
            hint: '.ann-hint-pill', toast: '.vot-toast', rootexit: '#vot-root-exit-toast', tour: '.tour-prompt', fab: '.jrn-fab', tabbar: '.tabbar' };
          for (const k of c) {
            const el = document.querySelector(want[k]);
            const shown = vis.some((o) => o.el === el);
            const busy = c.includes('find') || c.includes('autoscroll') || c.includes('expanded');
            const expect = !(k === 'toggle' && (c.includes('find') || (c.includes('expanded') && innerHeight <= 500)))
              && !(k === 'tabbar' && busy && innerHeight <= 500);  // rs1: on a short screen the bar steps aside for a working dock
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
