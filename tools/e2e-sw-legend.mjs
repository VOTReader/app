/**
 * tools/e2e-sw-legend.mjs — the Scripture Web's legend never clips its credit
 * (w4 band review: the phone's one-line legend, nowrap under overflow:hidden).
 *
 * WHY. The legend's tail is "Cross-reference data © OpenBible.info (CC-BY)",
 * a licence obligation. The legend keeps the corner buttons' corner with a
 * max-width and clips with overflow:hidden; w4 made a phone's legend one line
 * that never wrapped, so on any phone narrower than the 891 px it was shot on
 * the clip cut the credit: "... OpenBible.info (CC" at 780x360, "... © Open"
 * there with the controls hidden, almost all of it at 667x375. jsdom lays
 * nothing out, so this is a walk.
 *
 *   L1  the .sw-credit box lies wholly inside the .sw-legend box (its clip)
 *       and inside the screen root, with the chrome shown and hidden, at every
 *       frame below (four landscape phones, two rotated portrait phones, a PC)
 *   L2  one line where it fits: the legend wraps only when its items, side by
 *       side, are wider than its box (r2-06's one line on the 891 px phone)
 *   L3  never more than two lines on a phone (the canvas stacks the ruler
 *       above the legend's live top; a third line would eat the band)
 *
 * EXIT: 0 pass, 1 fail, 2 nothing-to-check (the screen never drew), 3 harness.
 * Run from the repo root on a clean tree:  node tools/e2e-sw-legend.mjs [--out DIR] [--frames a,b]
 */
import puppeteer from 'puppeteer';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serveOwnTree } from './e2e-read-serve.mjs';
import { throughFirstRun } from './first-run.mjs';   // About → Begin Reading → Letter 1 → Home, in one place

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const OUT = arg('out', null);
/** CSS px; a portrait phone shows the web CSS-rotated into landscape (.sw-rotated). */
const FRAMES = {
  land891: { w: 891, h: 411, dpr: 2.6, mobile: true },
  land851: { w: 851, h: 393, dpr: 2.75, mobile: true },
  land780: { w: 780, h: 360, dpr: 3, mobile: true },
  land667: { w: 667, h: 375, dpr: 2, mobile: true },
  port426: { w: 426, h: 952, dpr: 2, mobile: true },
  port320: { w: 320, h: 640, dpr: 2, mobile: true },
  desktop: { w: 1600, h: 900, dpr: 1, mobile: false },
};
const WANT = arg('frames', Object.keys(FRAMES).join(',')).split(',');
const NAV_MS = 60000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fails = [], notes = [];
let nothingToCheck = null;
const note = (s) => { notes.push(s); console.log('  ' + s); };

const dirty = execSync('git status --porcelain').toString().trim();
if (dirty) { console.error('[e2e-sw-legend] REFUSING: dirty tree\n' + dirty); process.exit(3); }
const HEAD = execSync('git rev-parse --short HEAD').toString().trim();

const finder = (l) => [...document.querySelectorAll('button,[role=button],a')]
  .find((b) => (b.getAttribute('aria-label') || b.textContent.trim()).startsWith(l) && b.getBoundingClientRect().width > 0);
async function clickLabel(page, label) {
  await page.waitForFunction((l, s) => !!(new Function('return ' + s)())(l), { timeout: NAV_MS }, label, finder.toString());
  await page.evaluate((l, s) => (new Function('return ' + s)())(l).click(), label, finder.toString());
}
const clickIfPresent = (page, label) => page.evaluate((l, s) => { const b = (new Function('return ' + s)())(l); if (!b) return false; b.click(); return true; }, label, finder.toString());

async function boot(page, url) {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: NAV_MS });
  await page.waitForFunction(() => { const r = document.getElementById('root'); return !!r && r.children.length > 0; }, { timeout: NAV_MS });
  await throughFirstRun(page);
  await sleep(500);
  await clickIfPresent(page, 'Maybe later');
  await sleep(200);
  await clickLabel(page, 'Personal Study');
  await sleep(400);
  await clickLabel(page, 'Scripture Web');
  await page.waitForFunction(() => !!document.querySelector('.sw-root') || !!document.querySelector('.sw-fallback'), { timeout: NAV_MS });
  if (await page.$('.sw-fallback')) return false;
  await page.waitForFunction(() => !document.querySelector('.sw-loading'), { timeout: NAV_MS });
  await sleep(600);
  await clickIfPresent(page, 'Got it');
  await clickIfPresent(page, 'Dismiss');
  // the face: the widths below are the face's, not a fallback's
  await page.evaluate(() => (document.fonts && document.fonts.ready ? document.fonts.ready.then(() => true) : true));
  await sleep(600);
  return true;
}

/** The legend, its items and the credit, in the root's own axes (a rotated root's are the viewport's turned). */
const READ = () => {
  const root = document.querySelector('.sw-root');
  const l = root && root.querySelector('.sw-legend');
  if (!l || !(l.offsetWidth > 0)) return { shown: false, cls: root ? root.className : '' };
  const rotated = root.classList.contains('sw-rotated');
  const box = (el) => { const b = el.getBoundingClientRect(); return { l: b.left, t: b.top, r: b.right, b: b.bottom }; };
  const within = (a, o) => a.l >= o.l - 0.5 && a.t >= o.t - 0.5 && a.r <= o.r + 0.5 && a.b <= o.b + 0.5;
  const credit = l.querySelector('.sw-credit');
  const line = l.querySelector('.sw-legend-line') || l;
  const kids = [...line.children];
  // a line is a run of items at one top (the root's top: the viewport's right when rotated)
  const tops = new Set(kids.map((c) => { const b = c.getBoundingClientRect(); return Math.round(rotated ? -b.right : b.top); }));
  const gap = kids.length > 1 ? parseFloat(getComputedStyle(kids[1]).marginLeft) || 0 : 0;
  const natural = kids.reduce((s, c) => s + c.offsetWidth, 0) + gap * Math.max(0, kids.length - 1);
  return {
    shown: true, cls: root.className.replace(/\s+/g, ' '), rotated,
    rootBox: box(root), legend: box(l), credit: credit ? box(credit) : null, creditText: credit ? credit.textContent : null,
    clientW: l.clientWidth, natural: Math.round(natural), lines: tops.size,
    inLegend: credit ? within(box(credit), box(l)) : false, inRoot: credit ? within(box(credit), box(root)) : false,
  };
};

async function check(page, tag, f) {
  const r = await page.evaluate(READ);
  if (!r.shown) { if (!/sw-narrow/.test(r.cls)) fails.push(`${tag} the legend is not shown (${r.cls})`); else note(`${tag} narrow: no legend`); return; }
  note(`${tag} legend ${r.clientW} px wide, items ${r.natural} px side by side, ${r.lines} line(s); credit inside the legend ${r.inLegend}, inside the root ${r.inRoot}`);
  if (r.creditText !== 'Cross-reference data © OpenBible.info (CC-BY)') fails.push(`${tag} L1 the credit reads ${JSON.stringify(r.creditText)}`);
  if (!r.inLegend) fails.push(`${tag} L1 the credit runs past the legend's clip: credit ${JSON.stringify(r.credit)} vs legend ${JSON.stringify(r.legend)}`);
  if (!r.inRoot) fails.push(`${tag} L1 the credit runs off the screen: credit ${JSON.stringify(r.credit)} vs root ${JSON.stringify(r.rootBox)}`);
  if (r.lines > 1 && r.natural <= r.clientW + 1) fails.push(`${tag} L2 the legend wraps to ${r.lines} lines although its ${r.natural} px fit its ${r.clientW}`);
  if (f.mobile && r.lines > 2) fails.push(`${tag} L3 the legend is ${r.lines} lines`);
}

async function walk(page, url, fname) {
  const f = FRAMES[fname];
  const tag = `[${fname} ${f.w}x${f.h}]`;
  await page.setViewport({ width: f.w, height: f.h, deviceScaleFactor: f.dpr, isMobile: f.mobile, hasTouch: f.mobile });
  if (!(await boot(page, url))) { nothingToCheck = `${tag} the web could not be drawn (.sw-fallback)`; return; }
  if (OUT) await page.screenshot({ path: resolve(OUT, `${fname}.png`) });
  await check(page, tag + ' shown', f);
  await page.evaluate(() => { const b = document.querySelector('.sw-hide-all'); if (b) b.click(); });
  await sleep(600);
  if (OUT) await page.screenshot({ path: resolve(OUT, `${fname}-hidden.png`) });
  await check(page, tag + ' hidden', f);
}

let browser = null, server = null, harnessFault = null;
try {
  if (OUT) mkdirSync(OUT, { recursive: true });
  const own = await serveOwnTree();
  server = own.server;
  console.log(`[e2e-sw-legend] tree ${HEAD} serving ${own.url}`);
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'], protocolTimeout: 240000 });
  for (const fname of WANT) {
    if (!FRAMES[fname]) { fails.push(`no frame "${fname}"`); continue; }
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    // a frame that will not boot is that frame's harness fault, and the other frames still run
    try {
      await walk(page, own.url, fname);
    } catch (e) {
      const why = `[${fname}] ` + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e));
      harnessFault = harnessFault ? harnessFault + '\n' + why : why;
    } finally { await ctx.close().catch(() => {}); }
  }
} catch (e) {
  harnessFault = e && e.stack ? e.stack : String(e);
} finally {
  if (browser) await browser.close().catch(() => {});
  if (server) server.close();
}
if (OUT) writeFileSync(resolve(OUT, 'e2e-sw-legend.json'), JSON.stringify({ HEAD, notes, fails, nothingToCheck, harnessFault }, null, 2));
if (harnessFault) { console.error('[e2e-sw-legend] HARNESS FAULT: ' + harnessFault); process.exit(3); }
if (fails.length) {
  if (nothingToCheck) console.error('[e2e-sw-legend] ALSO INCOMPLETE: ' + nothingToCheck);
  console.error('[e2e-sw-legend] ' + fails.length + ' FAILED:\n  ' + fails.join('\n  '));
  console.error('[e2e-sw-legend] RESULT FAIL (' + fails.length + ') tree ' + HEAD);
  process.exit(1);
}
if (nothingToCheck) { console.error('[e2e-sw-legend] ' + nothingToCheck); console.error('[e2e-sw-legend] RESULT NOTHING-TO-CHECK'); process.exit(2); }
console.log('[e2e-sw-legend] RESULT PASS tree ' + HEAD);
process.exit(0);
