// dp-tourclip — does the tour card's own sticky button row cover the last line of its text?
//
//   node tools/dp-tourclip.mjs [--frames 320x640,426x952] [--scale 1] [--gap 8] [--shots DIR]
//
// The defect (Native Builder on device, 2026-09-06): at 320x640 dp the LISTEN stop's last sentence
// "Tap it now, or press Next and I will do it for you." is sliced in half by the SKIP / BACK / NEXT
// row; at 426x952 dp the same line has clear space beneath it. `.tour-row` is `position: sticky`
// with a solid `--bg3` background inside the card's own scroller, so when the body is taller than
// the docked card's cap the tail sits UNDER the row and the reader is shown half a sentence.
//
// What this measures, and why in this shape:
//   * LINE boxes, not block boxes. A Range over each text node gives one rect per rendered LINE
//     (`getClientRects`), so "the lowest text" is the lowest LINE, which is what the eye sees cut.
//     A block rect would report the paragraph's bottom and miss which line is under the row.
//   * The card's own DOM, not an accessibility tree. The device-side witness had to classify nodes
//     by label and got the button row wrong; here `.tour-row` IS the row and everything else inside
//     `.tour-card` that is not inside it is body. Nothing is fitted to the data.
//   * The reader's FIRST view: measured at the card's initial scrollTop, because a sentence the
//     reader must scroll to complete is the defect, not the remedy.
//   * CONTROL FRAME: 426x952 must PASS in the same run. A gate that fails at every size is not
//     measuring the size.
//   * The card's scroll state is reported beside every gap (scrollTop / scrollHeight / clientHeight),
//     so a green that comes from the card no longer scrolling is visible rather than assumed.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import puppeteer from 'puppeteer';
import { serveOwnTree } from './e2e-read-serve.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const FRAMES = arg('--frames', '320x640,426x952').split(',').map((s) => { const [w, h] = s.split('x').map(Number); return { w, h }; });
const SCALE = Number(arg('--scale', '1'));
const MIN_GAP = Number(arg('--gap', '8'));
const SHOTS = arg('--shots', null);
const OUT = arg('--out', null);
if (SHOTS) mkdirSync(resolve(SHOTS), { recursive: true });
if (OUT) mkdirSync(resolve(OUT), { recursive: true });

const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
if (dirty && !dirty.split('\n').every((l) => l.includes('dp-tourclip'))) {
  console.error('REFUSED: working tree is dirty; the tree under test must be the commit.\n' + dirty);
  process.exit(2);
}
const SHA = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
console.log(`dp-tourclip  SHA ${SHA}  frames ${FRAMES.map((f) => f.w + 'x' + f.h).join(',')}  text size ${SCALE}x  floor ${MIN_GAP} px`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const fail = (m) => { console.log('  FAIL ' + m); failed++; };
const ok = (m) => console.log('  ok   ' + m);

const { server, url: BASE } = await serveOwnTree();
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const rows = [];
try {
  for (const { w, h } of FRAMES) {
    const tag = `${w}x${h}`;
    console.log(`\n[${tag} @2, text size ${SCALE}x]`);
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.setRequestInterception(true);
    page.on('request', (r) => { const u = r.url(); if (/github\.com\/VOTReader\/votreader-assets|\.mp3(\?|$)/.test(u)) r.respond({ status: 404, body: '' }); else r.continue(); });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('#root') && document.querySelector('#root').children.length > 0, { timeout: 30000 });
    await sleep(700);

    const clickLabel = async (label) => {
      await page.waitForFunction((l) => [...document.querySelectorAll('button,[role=button]')].some((b) => (b.getAttribute('aria-label') || b.textContent.trim()).startsWith(l) && b.getBoundingClientRect().width > 0), { timeout: 15000 }, label);
      await page.evaluate((l) => { const b = [...document.querySelectorAll('button,[role=button]')].find((b) => (b.getAttribute('aria-label') || b.textContent.trim()).startsWith(l) && b.getBoundingClientRect().width > 0); b.click(); }, label);
      await sleep(450);
    };

    await clickLabel('Continue');
    await clickLabel('Begin Reading');

    if (SCALE !== 1) {
      // Text Size the way the reader sets it: the real slider, through React's own setter, then the
      // value is READ BACK at the site. A harness that writes the store directly measures nothing.
      await clickLabel('App Configuration'); await sleep(600);
      await page.evaluate(() => { const head = [...document.querySelectorAll('.settings-group-head')].find((x) => /Appearance/.test(x.textContent)); if (head && head.getAttribute('aria-expanded') !== 'true') head.click(); });
      await sleep(450);
      const slid = await page.evaluate((sc) => {
        const el = document.querySelector('.txtsize-slider');
        if (!el) return 'no slider';
        el.scrollIntoView({ block: 'center' });
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        set.call(el, String(sc)); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
        return 'ok';
      }, SCALE);
      await sleep(800);
      const got = await page.evaluate(() => ({ store: String((window.StateStore.get().settings || {}).fontScale), css: getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim() }));
      if (slid !== 'ok' || got.store !== String(SCALE) || got.css !== String(SCALE)) { fail(`text size ${SCALE} did not take (${slid}; store ${got.store}, --font-scale ${got.css || 'unset'})`); await ctx.close(); continue; }
      ok(`text size ${SCALE}x through the slider (--font-scale ${got.css} read at the site)`);
      await clickLabel('Home'); await sleep(500);
    }

    // Start the tour from Settings > Help, the same door e2e-tour.mjs uses.
    await clickLabel('Maybe later');
    await clickLabel('App Configuration'); await sleep(600);
    await page.evaluate(() => { const x = [...document.querySelectorAll('.settings-group-head')].find((y) => /Help/.test(y.textContent)); if (x) { x.scrollIntoView({ block: 'center' }); x.click(); } });
    await sleep(450);
    await clickLabel('Show me around');
    await page.waitForFunction(() => document.querySelector('.tour-card'), { timeout: 20000 });
    await sleep(600);

    // Advance to the LISTEN stop (stop 2 of 6), the one the device saw clipped.
    let step = null;
    for (let i = 0; i < 8; i++) {
      step = await page.evaluate(() => { const s = window.TourController && window.TourController.getState(); return s && s.step ? s.step.id : null; });
      if (step === 'listen') break;
      await page.evaluate(() => { const b = document.querySelector('.tour-card .tour-btn.primary'); b && b.click(); });
      await sleep(900);
    }
    if (step !== 'listen') { fail(`never reached the listen stop (stopped at ${step})`); await ctx.close(); continue; }
    // The ring and the dock settle a frame or two after the screen mounts.
    for (let i = 0; i < 25 && !(await page.evaluate(() => !!document.querySelector('.tour-ring'))); i++) await sleep(150);
    await sleep(500);

    const m = await page.evaluate((scrollToEnd) => {
      const card = document.querySelector('.tour-card');
      const row = card && card.querySelector('.tour-row');
      if (!card || !row) return { error: 'no card or no .tour-row' };
      if (scrollToEnd) card.scrollTop = card.scrollHeight;
      const rowR = row.getBoundingClientRect();
      // Every rendered LINE of body text: a Range per text node, one rect per line.
      const walk = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      const lines = [];
      let n;
      while ((n = walk.nextNode())) {
        if (row.contains(n)) continue;                       // the row's own labels are not body
        if (!(n.textContent || '').trim()) continue;
        const r = document.createRange(); r.selectNodeContents(n);
        for (const rect of r.getClientRects()) {
          if (rect.width > 0 && rect.height > 0) lines.push({ top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, text: (n.textContent || '').trim().slice(0, 70) });
        }
      }
      lines.sort((a, b) => a.bottom - b.bottom);
      const lowest = lines[lines.length - 1] || null;
      const covered = lines.filter((l) => l.bottom > rowR.top + 0.5);
      return {
        vh: window.innerHeight, vw: window.innerWidth,
        fontScale: getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim() || '1',
        docked: card.classList.contains('docked'),
        card: { top: cardR(card).top, bottom: cardR(card).bottom, height: cardR(card).height },
        scroll: { top: card.scrollTop, height: card.scrollHeight, client: card.clientHeight, scrollable: card.scrollHeight > card.clientHeight + 1 },
        rowTop: rowR.top, rowHeight: rowR.height,
        lowest, lineCount: lines.length,
        coveredLines: covered.map((l) => ({ text: l.text, bottom: Math.round(l.bottom), over: Math.round(l.bottom - rowR.top) })),
      };
      function cardR(el) { const r = el.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, height: r.height }; }
    }, false);
    // The same measurement with the card scrolled to its end: it separates "the reader is shown half a
    // line" from "the reader cannot reach the end at all", and the two want different fixes.
    const mEnd = await page.evaluate(() => {
      const card = document.querySelector('.tour-card');
      const row = card && card.querySelector('.tour-row');
      if (!card || !row) return null;
      card.scrollTop = card.scrollHeight;
      const rowR = row.getBoundingClientRect();
      const walk = document.createTreeWalker(card, NodeFilter.SHOW_TEXT);
      let lowest = null, n;
      while ((n = walk.nextNode())) {
        if (row.contains(n) || !(n.textContent || '').trim()) continue;
        const r = document.createRange(); r.selectNodeContents(n);
        for (const rect of r.getClientRects()) if (rect.width > 0 && rect.height > 0 && (!lowest || rect.bottom > lowest.bottom)) lowest = { bottom: rect.bottom, text: (n.textContent || '').trim().slice(0, 70) };
      }
      const g = lowest ? rowR.top - lowest.bottom : null;
      const top = card.scrollTop;
      card.scrollTop = 0;
      return { gapAtEnd: g === null ? null : +g.toFixed(1), scrolledTo: top, lowest: lowest && lowest.text };
    });

    if (m.error) { fail(m.error); await ctx.close(); continue; }
    const gap = m.lowest ? m.rowTop - m.lowest.bottom : null;
    const row_ = { sha: SHA, probe: 'dp-tourclip v1', frame: tag, scale: SCALE, gap: gap === null ? null : +gap.toFixed(1), atEnd: mEnd, ...m };
    rows.push(row_);
    console.log(`  card ${Math.round(m.card.top)}..${Math.round(m.card.bottom)} (${Math.round(m.card.height)} px of ${m.vh}), docked ${m.docked}, scroll ${m.scroll.top}/${m.scroll.height} in ${m.scroll.client}${m.scroll.scrollable ? ' (scrollable)' : ''}`);
    console.log(`  button row top ${Math.round(m.rowTop)}  lowest line bottom ${m.lowest ? Math.round(m.lowest.bottom) : 'n/a'}  gap ${gap === null ? 'n/a' : Math.round(gap)} px`);
    if (m.lowest) console.log(`  lowest line: "${m.lowest.text}"`);
    if (mEnd) console.log(`  scrolled to the end (${mEnd.scrolledTo}): gap ${mEnd.gapAtEnd === null ? 'n/a' : Math.round(mEnd.gapAtEnd)} px`);
    if (m.coveredLines.length) console.log(`  covered: ${JSON.stringify(m.coveredLines)}`);
    if (SHOTS) await page.screenshot({ path: resolve(SHOTS, `tourclip-${tag}-${SCALE}x-${SHA}.png`) });

    if (gap === null) fail(`${tag}: no body text found in the card`);
    else if (gap < MIN_GAP) fail(`${tag}: the last line's bottom is ${Math.round(gap)} px from the button row top, under the ${MIN_GAP} px floor` + (gap < 0 ? ' — the row covers it' : ''));
    else ok(`${tag}: ${Math.round(gap)} px clear of the button row`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
if (OUT) writeFileSync(resolve(OUT, `tourclip-${SHA}-${SCALE}x.json`), JSON.stringify(rows, null, 2) + '\n');
console.log(`\ndp-tourclip: ${failed} failing`);
process.exit(failed ? 1 : 0);
