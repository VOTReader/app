// dp-selband — what the reader's text selection actually LOOKS like, measured in painted pixels.
//
//   node tools/dp-selband.mjs [--themes dark,light] [--viewport 360x800] [--out DIR]
//
// The defect (a11y-selection-band-1): the ::selection band is under the 3:1 non-text floor against
// the page it sits on. Tokens can be read off the stylesheet; PAINT cannot, so this probe selects
// real verse text in the real reader and samples the pixels the browser drew.
//
// Method, and why each part is there:
//   * walk the real UI to a chapter (Continue -> Begin Reading), never a fabricated page;
//   * pick the longest text node in the reading column and select a run of it with a real Range,
//     so the browser paints ::selection the way it does for a reader's drag;
//   * ONE screenshot per arm holds both measurements: the mode colour INSIDE the selection rect is
//     the band, the mode colour of the same paragraph OUTSIDE it is the page. Same capture, same
//     lighting, no cross-shot drift;
//   * CONTROL ARM: the identical sample with nothing selected must read the page colour on both
//     sides, i.e. contrast 1.00. A probe that cannot read 1.00 for "no selection" cannot be
//     believed when it reads 3.05 for "selected";
//   * PRECONDITION at the site: the theme arm asserts the painted page colour actually changed
//     between dark and light, so a theme toggle that silently failed cannot pass as a light reading.
//
// Exit 1 if any arm is below the floor (default 3.0), 2 if the walk or a precondition failed.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { execSync } from 'node:child_process';
import puppeteer from 'puppeteer';
import { serveOwnTree } from './e2e-read-serve.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const THEMES = arg('--themes', 'dark,light').split(',');
const [VW, VH] = arg('--viewport', '360x800').split('x').map(Number);
const FLOOR = Number(arg('--floor', '3.0'));
const OUT = arg('--out', null);
if (OUT) mkdirSync(resolve(OUT), { recursive: true });

const dirty = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
if (dirty && !dirty.split('\n').every((l) => l.includes('dp-selband'))) {
  console.error('REFUSED: working tree is dirty; the tree under test must be the commit.\n' + dirty);
  process.exit(2);
}
const SHA = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim();
console.log(`dp-selband  SHA ${SHA}  themes ${THEMES.join(',')}  viewport ${VW}x${VH}@2  floor ${FLOOR}:1`);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const fail = (m) => { console.log('  FAIL ' + m); failed++; };
const ok = (m) => console.log('  ok   ' + m);

const { server, url: BASE } = await serveOwnTree();
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
const results = [];
try {
  for (const theme of THEMES) {
    console.log(`\n[${theme}]`);
    try {
    const ctx = await browser.createBrowserContext();
    const page = await ctx.newPage();
    await page.setViewport({ width: VW, height: VH, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForFunction(() => document.querySelector('#root') && document.querySelector('#root').children.length > 0, { timeout: 30000 });
    await sleep(900);

    const click = async (reSrc, what, optional = false) => {
      const r = await page.evaluate((src) => {
        const rx = new RegExp(src, 'i');
        const all = [...document.querySelectorAll('button, a, [role="button"], [role="tab"]')];
        const b = all.find((x) => rx.test((x.textContent || '').trim()) || rx.test(x.getAttribute('aria-label') || ''));
        if (b) { b.click(); return { hit: true }; }
        return { hit: false, saw: all.map((x) => ((x.getAttribute('aria-label') || x.textContent || '').trim()).replace(/\s+/g, ' ').slice(0, 40)).filter(Boolean).slice(0, 30) };
      }, reSrc);
      await sleep(650);
      if (!r.hit && !optional) { fail(`click "${what}" found nothing. On screen: ${JSON.stringify(r.saw)}`); throw new Error('nav'); }
      return r.hit;
    };

    if (theme === 'light') {
      await page.evaluate(() => document.body.classList.add('light'));
      await sleep(300);
    }
    // The real walk to a chapter (the shape tools/e2e-read-detector.mjs uses): onboarding, Home,
    // Prophetic Letters, Volume One, first index row. A probe that stops on the home screen would
    // "measure" a heading nobody selects.
    await click('^Continue$', 'Continue', true);
    await click('^Begin Reading$', 'Begin Reading', true);
    await click('^Maybe later$', 'tour prompt', true);
    await click('Prophetic Letters', 'Prophetic Letters');
    await page.evaluate(() => { if (typeof window.__loadVotCorpus === 'function') window.__loadVotCorpus(); });
    await sleep(500);
    await click('^Volume One', 'Volume One');
    await page.waitForFunction(() => [...document.querySelectorAll('.vol-index button, .vol-index [role=button], .vol-index li, .vol-index [class*=row]')].some((b) => b.querySelector('.idx-min-chip')), { timeout: 20000 });
    const opened = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('.vol-index button, .vol-index [role=button], .vol-index li, .vol-index [class*=row]')].filter((b) => b.querySelector('.idx-min-chip') && !b.querySelector('[class*=row] [class*=row]'));
      if (!rows.length) return null;
      rows[0].click();
      return rows[0].textContent.trim().slice(0, 40);
    });
    await sleep(1200);
    if (!opened) { fail('no index row to open'); await ctx.close(); continue; }
    ok(`opened "${opened}"`);
    // Past the title block, so a whole paragraph is on screen to select.
    await page.evaluate(() => { const sc = document.querySelector('.screen-scroll') || [...document.querySelectorAll('*')].find((e) => e.scrollHeight > e.clientHeight + 100 && e.clientHeight > 300); if (sc) sc.scrollTop = 420; });
    await sleep(700);

    // The longest text node inside a reading segment ([data-hl-key] is what the reader highlights).
    const target = await page.evaluate(() => {
      // ONLY the page the reader is on. The pager renders the next page in a `.pager-peek`
      // subtree: a Range there returns a real bounding box and an EMPTY string, so "the longest
      // text on the page" lands in text nobody can select and every colour after it is the page's.
      const inView = (e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.top >= 0 && r.bottom <= innerHeight; };
      const segs = [...document.querySelectorAll('[data-hl-key]')]
        .filter((e) => e.offsetHeight > 0 && !e.closest('.pager-peek'));
      const root = segs.length ? segs : [document.querySelector('.screen-scroll') || document.querySelector('#root')];
      let best = null, bestLen = 0;
      for (const el of root) {
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
        let n;
        while ((n = walk.nextNode())) {
          const t = (n.textContent || '').trim();
          // Wholly in the viewport, or the screenshot clip below is cut off at the fold.
          if (t.length > bestLen && n.parentElement && inView(n.parentElement)) { best = n; bestLen = t.length; }
        }
      }
      if (!best) return null;
      window.__selNode = best;
      const cs = getComputedStyle(best.parentElement);
      const p = best.parentElement.getBoundingClientRect();
      return { len: bestLen, segs: segs.length, userSelect: cs.userSelect || cs.webkitUserSelect, text: best.textContent.trim().slice(0, 60), para: { x: p.x, y: p.y, w: p.width, h: p.height } };
    });
    if (!target || target.len < 24) { fail(`no reading text found (got ${JSON.stringify(target)})`); await ctx.close(); continue; }
    if (target.userSelect === 'none') { fail(`the reading text is user-select:none — a reader cannot select it and this probe cannot measure it`); await ctx.close(); continue; }
    ok(`selection target: ${target.len} chars in ${target.segs} segments, "${target.text}…"`);

    // One capture per arm; both colours come out of the same image.
    const sample = async (select) => {
      const rect = await page.evaluate((doSelect) => {
        const sel = window.getSelection();
        sel.removeAllRanges();
        const node = window.__selNode;
        if (doSelect) {
          const r = document.createRange();
          const len = node.textContent.length;
          r.setStart(node, Math.min(4, len));
          r.setEnd(node, Math.min(4 + Math.max(14, Math.floor(len * 0.35)), len));
          sel.addRange(r);
          const b = r.getBoundingClientRect();
          window.__selRect = { x: b.x, y: b.y, w: b.width, h: b.height };
        }
        const p = node.parentElement.getBoundingClientRect();
        return { para: { x: p.x, y: p.y, w: p.width, h: p.height }, sel: window.__selRect, selLen: sel.toString().length, selArea: window.__selRect ? window.__selRect.w * window.__selRect.h : 0 };
      }, select);
      // Precondition at the site: a selection that did not take makes every reading below meaningless.
      if (select && (rect.selLen === 0 || rect.selArea <= 0)) { fail(`the Range did not select anything (chars ${rect.selLen}, rect area ${rect.selArea})`); return null; }
      await sleep(250);
      const clip = { x: Math.max(0, rect.para.x), y: Math.max(0, rect.para.y), width: Math.min(rect.para.w, VW), height: Math.min(rect.para.h, VH) };
      const b64 = await page.screenshot({ encoding: 'base64', clip });
      return page.evaluate(async ({ b64, clip, sel }) => {
        const img = new Image();
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = 'data:image/png;base64,' + b64; });
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
        const ctx2 = c.getContext('2d'); ctx2.drawImage(img, 0, 0);
        const d = ctx2.getImageData(0, 0, c.width, c.height).data;
        const scale = c.width / clip.width; // device px per CSS px
        const inRect = { x0: (sel.x - clip.x) * scale, x1: (sel.x - clip.x + sel.w) * scale, y0: (sel.y - clip.y) * scale, y1: (sel.y - clip.y + sel.h) * scale };
        const inside = new Map(), outside = new Map();
        for (let y = 0; y < c.height; y++) {
          for (let x = 0; x < c.width; x++) {
            const i = (y * c.width + x) * 4;
            const key = `${d[i]},${d[i + 1]},${d[i + 2]}`;
            const hit = x >= inRect.x0 && x < inRect.x1 && y >= inRect.y0 && y < inRect.y1;
            const m = hit ? inside : outside;
            m.set(key, (m.get(key) || 0) + 1);
          }
        }
        const mode = (m) => { let k = null, v = -1, tot = 0; for (const [kk, vv] of m) { tot += vv; if (vv > v) { v = vv; k = kk; } } return { rgb: k ? k.split(',').map(Number) : null, share: tot ? v / tot : 0, px: tot }; };
        const srgb = (u) => { const s = u / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
        const lum = (c3) => 0.2126 * srgb(c3[0]) + 0.7152 * srgb(c3[1]) + 0.0722 * srgb(c3[2]);
        const band = mode(inside), pageC = mode(outside);
        const cr = band.rgb && pageC.rgb ? (Math.max(lum(band.rgb), lum(pageC.rgb)) + 0.05) / (Math.min(lum(band.rgb), lum(pageC.rgb)) + 0.05) : null;
        return { band, page: pageC, contrast: cr === null ? null : +cr.toFixed(2) };
      }, { b64, clip, sel: rect.sel });
    };

    const selected = await sample(true);
    if (!selected) { await ctx.close(); continue; }
    const control = await sample(false);
    const row = { sha: SHA, probe: 'dp-selband v1', theme, viewport: `${VW}x${VH}@2`, ...selected, controlContrast: control.contrast, controlBand: control.band.rgb, pageRgb: selected.page.rgb };
    results.push(row);

    console.log(`  band rgb ${JSON.stringify(selected.band.rgb)} (${(selected.band.share * 100).toFixed(0)}% of ${selected.band.px} px)  page rgb ${JSON.stringify(selected.page.rgb)}`);
    if (control.contrast !== 1) fail(`CONTROL: with nothing selected the two samples must be one colour, read ${control.contrast}:1 (${JSON.stringify(control.band.rgb)} vs ${JSON.stringify(control.page.rgb)})`);
    else ok('control: no selection reads 1.00:1');
    if (selected.contrast === null) fail('no pixels sampled');
    else if (selected.contrast < FLOOR) fail(`band/page ${selected.contrast}:1 is under the ${FLOOR}:1 non-text floor`);
    else ok(`band/page ${selected.contrast}:1 clears ${FLOOR}:1`);
    if (OUT) writeFileSync(resolve(OUT, `selband-${SHA}-${theme}.json`), JSON.stringify(row, null, 2) + '\n');
    await ctx.close();
    } catch (e) { fail(`${theme} arm threw: ${e.message}`); }
  }
  // Precondition at the site: the two themes must have painted different pages.
  if (results.length === 2) {
    const same = JSON.stringify(results[0].pageRgb) === JSON.stringify(results[1].pageRgb);
    if (same) fail(`PRECONDITION: both themes painted the same page colour ${JSON.stringify(results[0].pageRgb)} — the theme never changed`);
    else ok(`precondition: dark page ${JSON.stringify(results[0].pageRgb)} vs light page ${JSON.stringify(results[1].pageRgb)}`);
  }
} finally {
  await browser.close();
  server.close();
}
if (OUT) writeFileSync(resolve(OUT, `selband-${SHA}.json`), JSON.stringify(results, null, 2) + '\n');
console.log(`\ndp-selband: ${failed} failing`);
process.exit(failed ? 1 : 0);
