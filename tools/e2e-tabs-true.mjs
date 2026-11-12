/**
 * tools/e2e-tabs-true.mjs - the Tabs screen's pictures are the tabs themselves, and a page swipe slides in the real
 * neighbour with no flash (TABS1, 2026-11-11).
 *
 * WHY. Corbin (11-11, phone): the tab pictures were squeezed, blurred, wrong-font copies (an html2canvas re-draw),
 * blank until a capture landed, and a swipe "produces a recreation and a flash and certain elements flicker or pop
 * into existence". This walk measures both on the built app at a phone's size and density (412 x 915, 3x):
 *   C1  every card against a real screenshot of its tab's reading area, scaled to the card (mean abs diff, 0-255);
 *   C2  every card has its picture in the first painted frame of the Tabs screen;
 *   C3  after a theme switch, every card is in the new theme without visiting the tabs (mean luma of the picture);
 *   C4  storage: bytes per tab in IndexedDB, and a closed tab's row goes;
 *   C5  after a restart (same profile), every restored card is there in the first frame and still true;
 *   S1  a swipe (CDP touch drag + screencast): the neighbour under the finger at release is the page it becomes;
 *   S2  nothing changes once the settle ends (no flash, no late element);
 *   S3  no drag frame shows a blank or half-built neighbour; S1-S3 again with the CPU slowed 4x;
 *   S4  (TABS2) the neighbour's markup and scroll place at release ARE the page's after the turn: the same elements,
 *       classes, text and boxes, the same scrollTop. A peek drawn with fewer props than the page (no mark-as-read, no
 *       Listen pill, no band) or put at another place fails here, first visits included.
 *
 * Run: node tools/e2e-tabs-true.mjs [--measure] [--shots DIR] [--json FILE]   (after npm run build; ~90 s)
 * --measure prints the numbers and exits 0; without it the limits below fail the run (exit 1).
 */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { serveOwnTree } from './e2e-read-serve.mjs';

const argv = process.argv.slice(2);
const MEASURE = argv.includes('--measure');
const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
const SHOTS = opt('--shots') ? resolve(opt('--shots')) : null;
const JSON_OUT = opt('--json') ? resolve(opt('--json')) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

// Limits: TABS1 measured cards 1.4-4.8, swipes 0.7-4.5, settle 0.8 at most; the html2canvas cards were 19-137.
// TABS2: the neighbour is drawn as the page it becomes, so release vs settled is held under 1 (PNG frames).
export const LIMITS = { cardMad: 8, dragMad: 1, settleJump: 1, inkRatio: 0.6, lightLuma: 150, darkLuma: 90 };

const W = 412, H = 915, DPR = 3;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const out = { cards: {}, firstFrame: {}, theme: {}, storage: {}, restart: {}, swipes: [] };
const fails = [];
const need = (ok, msg) => { if (!ok) fails.push(msg); };

/* ── analysis page: decode images and compare them in a canvas (no image library in node_modules) ── */
const ANALYSIS = () => {
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const px = (img, w, h, sx = 0, sy = 0, sw = img.width, sh = img.height) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    return { c, d: g.getImageData(0, 0, w, h).data };
  };
  const cmp = (a, b) => { let s = 0, n = 0, big = 0; for (let i = 0; i < a.length; i += 4) { const m = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); s += (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3; n++; if (m > 48) big++; } return { mad: +(s / n).toFixed(2), pct: +(100 * big / n).toFixed(2) }; };
  const luma = (d) => { let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; return +(s / (d.length / 4)).toFixed(1); };
  const ink = (d, bg) => { let k = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 90) k++; return k / (d.length / 4); };
  window.__ana = {
    // card picture (an element shot) against the tab's reading area shot, scaled to the card's width, top-aligned
    async card(refUrl, cardUrl) {
      const [ref, card] = await Promise.all([load(refUrl), load(cardUrl)]);
      const scale = card.width / ref.width;
      const srcH = Math.min(ref.height, Math.round(card.height / scale));
      const h = Math.round(srcH * scale);
      const a = px(ref, card.width, h, 0, 0, ref.width, srcH); const b = px(card, card.width, h, 0, 0, card.width, h);
      const pair = document.createElement('canvas'); pair.width = card.width * 2 + 12; pair.height = h;
      const g = pair.getContext('2d'); g.fillStyle = '#888'; g.fillRect(0, 0, pair.width, h); g.drawImage(a.c, 0, 0); g.drawImage(b.c, card.width + 12, 0);
      return { ...cmp(a.d, b.d), luma: luma(b.d), pair: pair.toDataURL('image/png') };
    },
    async luma(url) { const i = await load(url); return luma(px(i, 64, 64).d); },
    // swipe frames (CSS-px sized screencast jpegs): rect = the scroller's box
    async swipe(frames, rect, dx, tRel, settleMs) {
      const imgs = await Promise.all(frames.map((f) => load(f.url)));
      const R = (img, x, w) => px(img, Math.max(1, Math.round(w)), Math.round(rect.h), x, rect.y, w, rect.h).d;
      const fin = imgs[imgs.length - 1];
      const bgd = px(fin, 1, 1, rect.x + 2, rect.y + rect.h - 3, 1, 1).d; const bg = [bgd[0], bgd[1], bgd[2]];
      const adx = Math.abs(dx);
      let rel = -1; for (let i = 0; i < frames.length; i++) if (frames[i].t < tRel) rel = i;
      const r = { frames: frames.length, release: rel };
      if (rel >= 0) {
        // S1: the strip the neighbour fills at release == that part of the settled page
        const strip = dx < 0 ? R(imgs[rel], rect.x + rect.w - adx, adx) : R(imgs[rel], rect.x, adx);
        const want = dx < 0 ? R(fin, rect.x, adx) : R(fin, rect.x + rect.w - adx, adx);
        r.drag = cmp(strip, want);
        // S3: the incoming strip carries ink like the real page's (blank / half-built neighbours do not)
        const finInk = ink(R(fin, rect.x, rect.w), bg);
        let minRatio = Infinity;
        for (let i = 0; i <= rel; i++) {
          if (frames[i].dx == null || Math.abs(frames[i].dx) < 80) continue;
          const w = Math.abs(frames[i].dx);
          const s = frames[i].dx < 0 ? R(imgs[i], rect.x + rect.w - w, w) : R(imgs[i], rect.x, w);
          const f = frames[i].dx < 0 ? R(fin, rect.x, w) : R(fin, rect.x + rect.w - w, w);
          const ratio = ink(f, bg) > 0.004 ? ink(s, bg) / ink(f, bg) : 1;
          if (ratio < minRatio) minRatio = ratio;
        }
        r.inkRatio = minRatio === Infinity ? null : +minRatio.toFixed(2);
        r.finInk = +finInk.toFixed(3);
      }
      // S2: every frame from the end of the settle on is the final picture
      let jump = 0, at = null;
      for (let i = 0; i < frames.length - 1; i++) {
        if (frames[i].t < tRel + settleMs) continue;
        const c = cmp(R(imgs[i], rect.x, rect.w), R(fin, rect.x, rect.w)).mad;
        if (c > jump) { jump = c; at = Math.round((frames[i].t - tRel) * 1000); }
      }
      r.settleJump = +jump.toFixed(2); r.settleJumpAtMs = at;
      return r;
    },
  };
};

async function main() {
  const { server, url } = await serveOwnTree();
  const profile = join(tmpdir(), 'vot-tabs1-' + process.pid);
  rmSync(profile, { recursive: true, force: true });
  const launch = () => puppeteer.launch({ headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  let browser = await launch();
  let page, cdp;
  const anaBrowser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  out._anaBrowser = anaBrowser;
  const ana = await anaBrowser.newPage();
  await ana.evaluate(ANALYSIS);

  const open = async () => {
    page = (await browser.pages())[0] || await browser.newPage();
    page.setDefaultTimeout(30000);
    await page.setViewport({ width: W, height: H, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
    cdp = await page.createCDPSession();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const r = document.getElementById('root'); return !!r && r.children.length > 0; });
    await page.evaluate(async () => {
      for (const n of ['__loadBibleCorpus', '__loadVotCorpus']) if (typeof window[n] === 'function') await window[n]();
    });
  };
  const clickText = async (re, sel = 'button, [role="button"], a') => {
    for (let i = 0; i < 60; i++) {
      const ok = await page.evaluate((src, s) => {
        const rx = new RegExp(src, 'i');
        const el = [...document.querySelectorAll(s)].find((b) => b.getClientRects().length > 0 && getComputedStyle(b).visibility !== 'hidden'
          && (rx.test((b.textContent || '').trim()) || rx.test((b.getAttribute('aria-label') || '').trim())));
        if (!el) return false;
        el.click(); return true;
      }, re.source, sel);
      if (ok) { await sleep(600); return; }
      await sleep(250);
    }
    throw new Error(`walk: no control matching ${re}`);
  };
  const goHome = async () => {
    for (let i = 0; i < 6; i++) {
      if (await page.evaluate(() => !!document.querySelector('.home-root'))) return;
      await page.evaluate(() => {
        const b = [...document.querySelectorAll('.tabbar-tab')].find((x) => (x.textContent || '').trim() === 'Read')
          || document.querySelector('button[title="Home"]')
          || [...document.querySelectorAll('button')].find((x) => /back/i.test(x.getAttribute('aria-label') || ''));
        if (b) b.click(); else history.back();
      });
      await sleep(600);
    }
    throw new Error('walk: could not return Home');
  };
  const scrollerRect = () => page.evaluate(() => {
    const el = [...document.querySelectorAll('.screen-layout > .pager-viewport > .screen-scroll, .screen-layout > .screen-scroll')]
      .find((e) => !e.closest('.tabs-overview-layer') && e.getClientRects().length);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: el.clientWidth, h: el.clientHeight };
  });
  const scrollTo = async (y) => {
    await page.evaluate((v) => { const el = document.querySelector('.screen-layout > .pager-viewport > .screen-scroll, .screen-layout > .screen-scroll'); if (el) el.scrollTop = v; }, y);
    await sleep(900);
  };
  // the reading area as it stands, at 3x: the reference a card must equal
  const refShot = async () => {
    const r = await scrollerRect();
    return 'data:image/png;base64,' + await page.screenshot({ encoding: 'base64', clip: { x: r.x, y: r.y, width: r.w, height: r.h } });
  };
  const openTabs = async () => {
    await page.evaluate(() => {
      window.__ff = null;
      const mo = new MutationObserver(() => {
        if (!document.querySelector('.tabs-overview-layer .tab-card')) return;
        mo.disconnect();
        requestAnimationFrame(() => {
          window.__ff = [...document.querySelectorAll('.tabs-overview .tab-card:not(.tab-card-new)')].map((card) => {
            const img = card.querySelector('img.tab-card-thumb');
            const snap = card.querySelector('.tab-snap-page');
            if (img) return img.complete && img.naturalWidth > 0 ? 'img' : 'img-loading';
            return snap && snap.childElementCount ? 'snap' : 'blank';
          });
        });
      });
      mo.observe(document.body, { childList: true, subtree: true });
    });
    await clickText(/^Open tabs/, 'button');
    await sleep(300);
    return page.evaluate(() => window.__ff);
  };
  const cardShots = async () => {
    // the picture alone: the card's own corner chip (Tab actions) is not part of the tab
    await page.evaluate(() => document.querySelectorAll('.tabs-overview .tab-card-menu').forEach((b) => { b.style.visibility = 'hidden'; }));
    const els = await page.$$('.tabs-overview .tab-card:not(.tab-card-new) .tab-card-thumb-wrap');
    const urls = [];
    for (const e of els) urls.push('data:image/png;base64,' + await e.screenshot({ encoding: 'base64' }));
    await page.evaluate(() => document.querySelectorAll('.tabs-overview .tab-card-menu').forEach((b) => { b.style.visibility = ''; }));
    return urls;
  };
  const closeTabs = async () => { await page.keyboard.press('Escape'); await sleep(500); };
  const pickTab = async (i) => { await page.evaluate((n) => document.querySelectorAll('.tabs-overview .tab-card-open')[n].click(), i); await sleep(1200); };
  const savePair = (name, dataUrl) => { if (SHOTS && dataUrl) writeFileSync(join(SHOTS, name), Buffer.from(dataUrl.split(',')[1], 'base64')); };
  const storage = () => page.evaluate(() => new Promise((res) => {
    const rq = indexedDB.open('vot-thumbs');
    rq.onerror = () => res({ err: 'open' });
    rq.onsuccess = () => {
      const db = rq.result;
      if (!db.objectStoreNames.contains('thumbs')) { db.close(); res({ rows: 0, bytes: 0, keys: [] }); return; }
      const tx = db.transaction('thumbs', 'readonly'); const st = tx.objectStore('thumbs');
      const k = st.getAllKeys(); const v = st.getAll();
      tx.oncomplete = () => {
        const sizes = v.result.map((x) => (typeof x === 'string' ? x.length : JSON.stringify(x).length));
        db.close();
        res({ rows: k.result.length, bytes: sizes.reduce((a, b) => a + b, 0), keys: k.result.map(String), sizes });
      };
    };
  }));

  /* S4: a page's markup as seen by the eye: every element's tag, classes, visibility, box height and leaf text, and
     the column's scrollTop. The neighbour at release (.pager-peek-<dir>'s column) against the live page after. */
  const pageSig = (sel) => page.evaluate((s) => {
    const root = document.querySelector(s);
    if (!root) return null;
    const out = [];
    const walk = (el, d) => {
      for (const c of el.children) {
        if (c.classList.contains('pager-peek')) continue;
        const cs = getComputedStyle(c);
        const vis = cs.display === 'none' ? '-' : cs.visibility === 'hidden' ? 'h' : '';
        const t = c.children.length ? '' : (c.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40);
        out.push(d + ' ' + c.tagName + '.' + [...c.classList].sort().join('.') + vis + ' ' + Math.round(c.getBoundingClientRect().height) + ' ' + t);
        walk(c, d + 1);
      }
    };
    walk(root, 0);
    const sc = root.closest('.screen-scroll') || root;
    return { lines: out, top: Math.round(sc.scrollTop) };
  }, sel);
  const sigDiff = (a, b) => {
    if (!a || !b) return 'missing ' + (!a ? 'neighbour' : 'page');
    if (Math.abs(a.top - b.top) > 1) return `scrollTop ${a.top} vs ${b.top}`;
    const n = Math.max(a.lines.length, b.lines.length);
    for (let i = 0; i < n; i++) if (a.lines[i] !== b.lines[i]) return `line ${i}: "${a.lines[i] || ''}" vs "${b.lines[i] || ''}"`;
    return null;
  };

  /* ── a swipe: CDP touch drag on the reading area, screencast frames, then the numbers ── */
  const swipe = async (label, dir, throttle) => {
    if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    const rect = await scrollerRect();
    const frames = [];
    const onFrame = async (f) => {
      frames.push({ t: f.metadata.timestamp, url: 'data:image/png;base64,' + f.data });
      try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch { /* stopped */ }
    };
    cdp.on('Page.screencastFrame', onFrame);
    await cdp.send('Page.startScreencast', { format: 'png', maxWidth: W, maxHeight: H, everyNthFrame: 1 });
    await sleep(300);
    const y = Math.round(rect.y + rect.h * 0.55);
    const x0 = dir === 'next' ? 360 : 52; const dx = dir === 'next' ? -290 : 290;
    const log = [];
    const touch = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    const wall = () => Date.now() / 1000;
    await touch('touchStart', x0); log.push({ t: wall(), dx: 0 });
    for (let i = 1; i <= 24; i++) { const d = Math.round(dx * i / 24); await touch('touchMove', x0 + d); log.push({ t: wall(), dx: d }); await sleep(16); }
    await sleep(250);   // hold still: the last frames before release show the finished drag
    const peekSig = await pageSig(`.screen-layout > .pager-viewport > .pager-peek-${dir} > .screen-scroll`);
    const tRel = wall();
    await touch('touchEnd', x0 + dx);
    await sleep(1600);
    await cdp.send('Page.stopScreencast');
    cdp.off('Page.screencastFrame', onFrame);
    if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const liveSig = await pageSig('.screen-layout > .pager-viewport > .screen-scroll > .pager-track');
    const domDiff = sigDiff(peekSig, liveSig);
    if (domDiff && SHOTS) for (const [k, v] of [['peek', peekSig], ['page', liveSig]]) writeFileSync(join(SHOTS, `tabs2-dom-${label}-x${throttle}-${k}.txt`), v ? v.top + '\n' + v.lines.join('\n') : '-');
    // each frame's finger offset: the last move dispatched before it
    for (const f of frames) { let d = null; for (const l of log) if (l.t <= f.t) d = l.dx; f.dx = d; }
    const r = await ana.evaluate((fr, rc, d, t, s) => window.__ana.swipe(fr, rc, d, t, s), frames, rect, dx, tRel, 0.36);
    r.label = label; r.throttle = throttle; r.dom = domDiff || 'same'; r.top = liveSig && liveSig.top;
    out.swipes.push(r);
    if (SHOTS && r.release >= 0) {
      savePair(`tabs2-swipe-${label}-x${throttle}-release.png`, frames[r.release].url);
      savePair(`tabs2-swipe-${label}-x${throttle}-settled.png`, frames[frames.length - 1].url);
    }
    need(r.release >= 0 && r.drag && r.drag.mad <= LIMITS.dragMad, `S1 ${label} x${throttle}: neighbour at release differs from the page it becomes (mad ${r.drag && r.drag.mad})`);
    need(r.settleJump <= LIMITS.settleJump, `S2 ${label} x${throttle}: the picture changed after the settle (mad ${r.settleJump} at +${r.settleJumpAtMs} ms)`);
    need(r.inkRatio == null || r.inkRatio >= LIMITS.inkRatio, `S3 ${label} x${throttle}: a drag frame showed a blank or half-built neighbour (ink ratio ${r.inkRatio})`);
    need(!domDiff, `S4 ${label} x${throttle}: the neighbour at release is not the page it becomes (${domDiff})`);
    await sleep(600);
  };

  try {
    await open();
    // onboarding, then tab 1 = a letter scrolled into its text
    await clickText(/^Continue$/); await clickText(/Begin Reading/); await goHome();
    await clickText(/^Maybe later$/).catch(() => {});
    await goHome(); await clickText(/Prophetic Letters/); await clickText(/^Volume One/); await clickText(/A Word of Warning/);
    await scrollTo(900);
    const refs = { dark: [], light: [] };
    refs.dark[0] = await refShot();
    // tab 2 = Genesis 1 scrolled
    await openTabs(); await clickText(/^New tab$/, 'button'); await sleep(800);
    await goHome(); await clickText(/^The Holy Bible/); await clickText(/^The Law/); await clickText(/^Genesis/); await clickText(/^1\D/);
    await scrollTo(600);
    refs.dark[1] = await refShot();
    // tab 3 = Home
    await openTabs(); await clickText(/^New tab$/, 'button'); await sleep(800); await goHome();
    refs.dark[2] = await refShot();

    // C1 + C2, dark
    out.firstFrame.dark = await openTabs();
    await sleep(1500);
    let shots = await cardShots();
    for (let i = 0; i < 3; i++) {
      const c = await ana.evaluate((a, b) => window.__ana.card(a, b), refs.dark[i], shots[i]);
      out.cards[`dark${i}`] = { mad: c.mad, pct: c.pct, luma: c.luma };
      if (i === 1) savePair('tabs1-card-dark.png', c.pair);
      need(c.mad <= LIMITS.cardMad, `C1 dark card ${i}: differs from its tab (mad ${c.mad}, ${c.pct}% px)`);
    }
    need((out.firstFrame.dark || []).every((s) => s === 'snap' || s === 'img'), `C2 dark: first frame cards ${JSON.stringify(out.firstFrame.dark)}`);
    out.storage.three = await storage();

    // C3: switch to light from Genesis' reader menu, then open Tabs without visiting the other tabs
    await pickTab(1);
    await clickText(/^More$/, 'button'); await clickText(/^Light$/, 'button'); await page.keyboard.press('Escape'); await sleep(600);
    out.firstFrame.light = await openTabs();
    await sleep(400);
    const lightShots = await cardShots();
    out.theme.lumaAfterSwitch = [];
    for (const s of lightShots) out.theme.lumaAfterSwitch.push(await ana.evaluate((u) => window.__ana.luma(u), s));
    for (const [i, l] of out.theme.lumaAfterSwitch.entries()) need(l >= LIMITS.lightLuma, `C3 card ${i} is not in the light theme after the switch (luma ${l})`);
    need((out.firstFrame.light || []).every((s) => s === 'snap' || s === 'img'), `C2 light: first frame cards ${JSON.stringify(out.firstFrame.light)}`);
    // light references: visit each tab (scroll restore puts it back where it was), then compare the cards shot above
    for (let i = 0; i < 3; i++) { await pickTab(i); refs.light[i] = await refShot(); await openTabs(); await sleep(300); }
    for (let i = 0; i < 3; i++) {
      const c = await ana.evaluate((a, b) => window.__ana.card(a, b), refs.light[i], lightShots[i]);
      out.cards[`light${i}`] = { mad: c.mad, pct: c.pct, luma: c.luma };
      if (i === 1) savePair('tabs1-card-light.png', c.pair);
      need(c.mad <= LIMITS.cardMad, `C1 light card ${i}: differs from its tab (mad ${c.mad}, ${c.pct}% px)`);
    }

    // swipes on Genesis (Bible chapter) and the letter, at 1x and 4x
    await pickTab(1);
    await swipe('genesis-next', 'next', 1);          // Genesis 2, never opened: a first visit
    await scrollTo(700);
    await swipe('genesis-back', 'prev', 1);          // Genesis 1 again, at its saved place
    await swipe('genesis-next', 'next', 4);
    await swipe('genesis-first-next', 'next', 4);    // Genesis 3, a first visit with the CPU slowed
    await scrollTo(1200);
    await page.evaluate(() => { const b = document.querySelector('.top-nav button[aria-label="Next chapter"]'); if (b) b.click(); });
    await sleep(1200);
    await swipe('genesis-arrow-back', 'prev', 1);    // Genesis 3, left by the arrow (no swipe), back at its place
    await openTabs(); await pickTab(0);
    await swipe('letter-next', 'next', 1);           // a letter never opened
    await swipe('letter-back', 'prev', 4);
    await swipe('letter-again-next', 'next', 1);     // the letter swiped to first, again
    await swipe('letter-first-next', 'next', 4);     // the one after it: a first visit with the CPU slowed

    // C4: storage per tab, and closing a tab frees its row
    await openTabs(); await sleep(300);
    out.storage.before = await storage();
    await page.evaluate(() => document.querySelectorAll('.tabs-overview .tab-card-close')[2].click());
    await sleep(3200);
    out.storage.afterClose = await storage();
    need(out.storage.afterClose.rows < out.storage.before.rows || out.storage.before.rows === 0, `C4 closing a tab left its row (${out.storage.before.rows} -> ${out.storage.afterClose.rows})`);
    const pre = await cardShots();   // C5 compares the restored cards with these (the swipes moved the tabs on)
    await closeTabs();
    await sleep(1500);

    // C5: restart on the same profile; the cards must be there in the first frame of the first open
    await browser.close();
    browser = await launch();
    await open();
    await sleep(1200);
    out.restart.firstFrame = await openTabs();
    await sleep(800);
    const rs = await cardShots();
    out.restart.cards = [];
    for (let i = 0; i < rs.length && i < 2; i++) {
      const c = await ana.evaluate((a, b) => window.__ana.card(a, b), pre[i], rs[i]);
      out.restart.cards.push({ mad: c.mad, pct: c.pct });
      if (i === 0) savePair('tabs1-card-restart.png', c.pair);
      need(c.mad <= LIMITS.cardMad, `C5 restored card ${i}: differs from its tab (mad ${c.mad})`);
    }
    need((out.restart.firstFrame || []).every((s) => s === 'snap' || s === 'img'), `C5 first frame after restart: ${JSON.stringify(out.restart.firstFrame)}`);
    // a restored tab never opened in this session: the letter (tab 0) if Genesis is active, else Genesis
    const activeIdx = await page.evaluate(() => [...document.querySelectorAll('.tabs-overview .tab-card')].findIndex((c) => c.classList.contains('active')));
    await pickTab(activeIdx === 0 ? 1 : 0);
    await swipe('restored-next', 'next', 1);
  } catch (e) {
    fails.push(`walk: ${(e && e.stack) || e}`);
  } finally {
    const anaB = out._anaBrowser; delete out._anaBrowser;
    await browser.close().catch(() => {});
    if (anaB) await anaB.close().catch(() => {});
    server.close();
    rmSync(profile, { recursive: true, force: true });
  }
  const summary = JSON.stringify(out, (k, v) => (k === 'keys' || k === 'sizes' ? undefined : v), 1);
  console.log(summary);
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ ...out, fails }, (k, v) => (k === 'keys' ? undefined : v), 1));
  if (fails.length) { console.log(`\n${fails.length} finding(s):`); for (const f of fails) console.log('  ' + f); }
  console.log(fails.length ? (MEASURE ? 'MEASURED (limits not enforced)' : 'FAIL') : 'PASS');
  process.exit(fails.length && !MEASURE ? 1 : 0);
}

main();
