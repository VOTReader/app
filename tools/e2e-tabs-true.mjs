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
 *   U1-U5 (TABS6) the upgrade case, tools/e2e-tabs-upgrade.mjs: old JPEG rows seeded, never drawn, cards drawn by
 *       themselves (skip with --no-upgrade).
 *
 * Run: node tools/e2e-tabs-true.mjs [--measure] [--shots DIR] [--json FILE]   (after npm run build; ~90 s)
 * --measure prints the numbers and exits 0; without it the limits below fail the run (exit 1).
 */
import puppeteer from 'puppeteer';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { serveOwnTree } from './e2e-read-serve.mjs';
import { runUpgrade } from './e2e-tabs-upgrade.mjs';

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
// A real recording for A1 (TABS4): `sec` seconds of a soft 220 Hz tone, 8 kHz mono 16-bit WAV.
const makeWav = (sec) => {
  const sr = 8000, n = sr * sec, b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8); b.write('fmt ', 12); b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(1500 * Math.sin(2 * Math.PI * 220 * i / sr)), 44 + i * 2);
  return b;
};

/* ── analysis page: decode images and compare them in a canvas (no image library in node_modules) ── */
const ANALYSIS = () => {
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const px = (img, w, h, sx = 0, sy = 0, sw = img.width, sh = img.height) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    return { c, d: g.getImageData(0, 0, w, h).data };
  };
  // TABS4: a pixel painted MASK (the fixed overlays the page slides under: mini player, voice pill, toast) in either
  // picture is left out of the comparison.
  const masked = (d, i) => d[i] > 200 && d[i + 1] < 70 && d[i + 2] > 200;
  const cmp = (a, b) => { let s = 0, n = 0, big = 0; for (let i = 0; i < a.length; i += 4) { if (masked(a, i) || masked(b, i)) continue; const m = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); s += (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3; n++; if (m > 48) big++; } return { mad: n ? +(s / n).toFixed(2) : 0, pct: n ? +(100 * big / n).toFixed(2) : 0 }; };
  const maskImg = (img, masks) => {
    if (!masks || !masks.length) return img;
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
    const g = c.getContext('2d'); g.drawImage(img, 0, 0); g.fillStyle = '#ff00ff';
    for (const m of masks) g.fillRect(Math.floor(m.x), Math.floor(m.y), Math.ceil(m.w) + 1, Math.ceil(m.h) + 1);
    return c;
  };
  const luma = (d) => { let s = 0; for (let i = 0; i < d.length; i += 4) s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; return +(s / (d.length / 4)).toFixed(1); };
  const ink = (d, bg) => { let k = 0; for (let i = 0; i < d.length; i += 4) if (!masked(d, i) && Math.abs(d[i] - bg[0]) + Math.abs(d[i + 1] - bg[1]) + Math.abs(d[i + 2] - bg[2]) > 90) k++; return k / (d.length / 4); };
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
    async swipe(frames, rect, dx, tRel, settleMs, masks) {
      const imgs = (await Promise.all(frames.map((f) => load(f.url)))).map((i) => maskImg(i, masks));
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
    // TABS3: the bars outside the reading area. Top bar: frames from release on against the settled frame (the
    // drag itself does not touch it). Bottom (mini player, tab bar): every frame against the first, the mini
    // player's moving progress line aside (a mad, not a pixel count, so a 1-px line stays far under 1).
    async bars(frames, rect, tRel, barY) {
      const imgs = await Promise.all(frames.map((f) => load(f.url)));
      const fin = imgs[imgs.length - 1];
      const W0 = fin.width; const top = Math.max(1, Math.round(rect.y)); const by = Math.round(barY || (rect.y + rect.h)); const bh = Math.max(1, fin.height - by);
      const T = (img) => px(img, W0, top, 0, 0, W0, top).d; const B = (img) => px(img, W0, bh, 0, by, W0, bh).d;
      let t = 0, ta = null, b = 0, ba = null;
      for (let i = 0; i < imgs.length; i++) {
        if (frames[i].t >= tRel + 0.36) { const c = cmp(T(imgs[i]), T(fin)).mad; if (c > t) { t = c; ta = Math.round((frames[i].t - tRel) * 1000); } }
        // TABS4: with a recording playing, the player's clock and progress line move on by themselves; a frame is still
        // if it is the first picture or the settled one (a bar that moves or flashes is neither)
        const bi = B(imgs[i]);
        const d = Math.min(cmp(bi, B(imgs[0])).mad, cmp(bi, B(fin)).mad); if (d > b) { b = d; ba = Math.round((frames[i].t - tRel) * 1000); }
      }
      return { top: +t.toFixed(2), topAt: ta, bottom: +b.toFixed(2), bottomAt: ba };
    },
  };
};

async function main() {
  const { server, url } = await serveOwnTree();
  const profile = join(tmpdir(), 'vot-tabs1-' + process.pid);
  rmSync(profile, { recursive: true, force: true });
  const launch = () => puppeteer.launch({ headless: true, userDataDir: profile, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--autoplay-policy=no-user-gesture-required'] });
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
    // A1 (TABS4): every media element the page makes, in or out of the DOM, so the walk can read the one that plays
    await page.evaluateOnNewDocument(() => {
      window.__medias = [];
      const A = window.Audio;
      if (typeof A === 'function') { const W = function (src) { const m = new A(src); window.__medias.push(m); return m; }; W.prototype = A.prototype; window.Audio = W; }
      const ce = Document.prototype.createElement;
      Document.prototype.createElement = function (t, o) { const el = ce.call(this, t, o); if (/^(audio|video)$/i.test(String(t))) window.__medias.push(el); return el; };
    });
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
  // PO2 item 26 (main 3526b4a9a): choosing Light or Dark closes the More menu itself. An Escape after it reached the
  // page and went Back (Genesis 1 -> its chapter list): press it only while the menu is still open.
  const closeMenu = async () => {
    for (let i = 0; i < 20 && await page.evaluate(() => !!document.querySelector('.more-menu[role="menu"]')); i++) await sleep(50);
    if (await page.evaluate(() => !!document.querySelector('.more-menu[role="menu"]'))) await page.keyboard.press('Escape');
  };
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
  /* TABS4: what is drawn over the reading area and does not slide with the page (the mini player, the voice pill, a
     toast): fixed elements outside the screen. S1-S3 leave them out (they are not the page); A1 holds the mini player
     still in every frame. A fixed box over half the reading area is a layer, not an overlay, and is not taken. */
  const overlays = (rc) => page.evaluate((r) => {
    const out = [];
    const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => (n.classList.contains('screen-layout') || n.classList.contains('tabs-overview-layer') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let el = tw.nextNode(); el; el = tw.nextNode()) {
      const cs = getComputedStyle(el);
      if (cs.position !== 'fixed' || cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) continue;
      const b = el.getBoundingClientRect();
      if (b.width < 2 || b.height < 2 || b.bottom <= r.y || b.top >= r.y + r.h || b.right <= r.x || b.left >= r.x + r.w) continue;
      if (b.width * b.height > 0.5 * r.w * r.h) continue;
      out.push({ x: b.left, y: b.top, w: b.width, h: b.height, c: (el.className && String(el.className).split(' ')[0]) || el.tagName });
    }
    return out;
  }, rc);
  const swipe = async (label, dir, throttle, bars = false, pre = null, atRel = null) => {
    if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
    const rect = await scrollerRect();
    const ov0 = await overlays(rect);
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
    // TABS4: `pre` acts right before the finger comes down (an arrow tap: a drag that starts before the neighbours
    // are drawn). Were they in the DOM at that moment, and how long did the touchstart take (they are drawn in it)?
    if (pre) await pre();
    const peeksAtTouch = await page.evaluate(() => document.querySelectorAll('.screen-layout > .pager-viewport > .pager-peek').length);
    const t0 = Date.now();
    await touch('touchStart', x0); log.push({ t: wall(), dx: 0 });
    const touchStartMs = Date.now() - t0;
    for (let i = 1; i <= 24; i++) { const d = Math.round(dx * i / 24); await touch('touchMove', x0 + d); log.push({ t: wall(), dx: d }); await sleep(16); }
    await sleep(250);   // hold still: the last frames before release show the finished drag
    const peekSig = await pageSig(`.screen-layout > .pager-viewport > .pager-peek-${dir} > .screen-scroll`);
    if (atRel) await atRel();   // TABS5: a look at the drawn neighbour with the finger still down
    const tRel = wall();
    await touch('touchEnd', x0 + dx);
    await sleep(1600);
    await cdp.send('Page.stopScreencast');
    cdp.off('Page.screencastFrame', onFrame);
    if (throttle > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    const liveSig = await pageSig('.screen-layout > .pager-viewport > .screen-scroll > .pager-track');
    const ov = [...ov0, ...(await overlays(rect))];
    const domDiff = sigDiff(peekSig, liveSig);
    if (domDiff && SHOTS) for (const [k, v] of [['peek', peekSig], ['page', liveSig]]) writeFileSync(join(SHOTS, `tabs2-dom-${label}-x${throttle}-${k}.txt`), v ? v.top + '\n' + v.lines.join('\n') : '-');
    // each frame's finger offset: the last move dispatched before it
    for (const f of frames) { let d = null; for (const l of log) if (l.t <= f.t) d = l.dx; f.dx = d; }
    const r = await ana.evaluate((fr, rc, d, t, s, m) => window.__ana.swipe(fr, rc, d, t, s, m), frames, rect, dx, tRel, 0.36, ov);
    r.label = label; r.throttle = throttle; r.dom = domDiff || 'same'; r.top = liveSig && liveSig.top;
    r.peeksAtTouch = peeksAtTouch; r.touchStartMs = touchStartMs;
    if (ov.length) r.overlays = [...new Set(ov.map((o) => o.c))];
    // TABS3: the top bar (its hairline included) and, with sound, the mini player and tab bar: every frame against the
    // settled one (A1 / T1). The top bar's line is drawn as the new page has it from the frame of release. TABS4: the
    // bottom strip starts at the mini player's top when it is drawn over the reading area.
    // The mini player can show the page through it as the page slides under it, so it is held by its box: the same
    // before the finger comes down and after the settle; the tab bar below the reading area by its pixels.
    const bar = (l) => l.filter((o) => o.c === 'audio-bar').map((o) => [o.x, o.y, o.w, o.h].map(Math.round).join(','))[0] || null;
    r.miniBox = [bar(ov0), bar(ov.slice(ov0.length))];
    r.bars = await ana.evaluate((fr, rc, t) => window.__ana.bars(fr, rc, t, null), frames, rect, tRel);
    if (bars) need(r.miniBox[0] === r.miniBox[1], `A1 ${label}: the mini player moved (${r.miniBox[0]} -> ${r.miniBox[1]})`);
    need(r.bars.top <= LIMITS.settleJump, `T1 ${label} x${throttle}: the top bar changed after release (mad ${r.bars.top} at +${r.bars.topAt} ms)`);
    if (bars) need(r.bars.bottom <= LIMITS.settleJump, `A1 ${label}: the mini player / tab bar moved during the swipe (mad ${r.bars.bottom} at +${r.bars.bottomAt} ms)`);
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
    await goHome(); await clickText(/^The Holy Bible/); await clickText(/^The Law/); await clickText(/^Genesis/); await clickText(/^The Creation\b.*Chapter 1\b/);
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
    await clickText(/^More$/, 'button'); await clickText(/^Light$/, 'button'); await closeMenu(); await sleep(600);
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
    // TABS4: the finger comes down the moment an arrow tap has turned the page (4x CPU), before the neighbours are drawn
    await swipe('arrow-then-drag', 'next', 4, false, () => page.evaluate(() => { const b = document.querySelector('.top-nav button[aria-label="Next chapter"]'); if (b) b.click(); }));
    need(out.swipes[out.swipes.length - 1].peeksAtTouch === 0, `S5 arrow-then-drag: the neighbours were already drawn when the finger came down (${out.swipes[out.swipes.length - 1].peeksAtTouch}); the case did not test a drag before them`);
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
    await closeTabs().catch(() => {});

    /* TABS3: the page kinds the swipes above do not reach, opened the way a listener does (the listening desk's title
       button, __openAudioText), the sound then stopped: book and volume edges, a cross-book swipe, Words To Live By,
       The Blessed, Holy Days, a study (letter-shaped and Matthew), a search landing. Then A1: a swipe while it plays. */
    const ids = await page.evaluate(async () => {
      await new Promise((done) => {
        if (typeof window.BIBLE_STUDIES !== 'undefined') { done(); return; }
        const s = document.createElement('script'); s.src = 'src/data/bible-studies.js'; s.onload = done; s.onerror = done; document.head.appendChild(s);
      });
      const arr = (n) => (Array.isArray(window[n]) ? window[n] : []);
      const hd = arr('HOLY_DAYS');
      let hdAt = -1;
      for (let i = 0; i + 1 < hd.length; i++) if (hd[i].paragraphs && hd[i + 1].paragraphs) { hdAt = i; break; }
      const v7 = arr('LETTERS_V7'); const w1 = arr('WTLB_ONE');
      const studies = [];
      for (const st of (window.BIBLE_STUDIES || [])) {
        const ch = (st.chapters || []).filter((c) => Array.isArray(c.blocks));
        if (ch.length >= 3) studies.push(ch[0].id, ch[1].id);
      }
      const study = studies;
      return { v7a: v7.length > 1 ? v7[v7.length - 2].id : null, v7p: v7.length > 2 ? v7[v7.length - 3].id : null, v1: arr('LETTERS_V1').length > 3 ? arr('LETTERS_V1')[3] : null,
        w1: w1[1] && w1[1].id, w1last: w1.length ? w1[w1.length - 1].id : null, bl: arr('THE_BLESSED')[1] && arr('THE_BLESSED')[1].id,
        hd: hdAt >= 0 ? hd[hdAt].id : null, study };
    });
    out.more = { ids: { ...ids, v1: ids.v1 && ids.v1.id } };
    const viaDesk = async (how, arg, keepPlaying) => {
      await page.evaluate(() => { if (window.__loadVotCorpus) window.__loadVotCorpus(); if (window.__loadBibleCorpus) window.__loadBibleCorpus(); });
      await page.waitForFunction("typeof window.__openAudioText === 'function' && window.__votCorpus && window.__votCorpus.loaded && window.__bibleCorpus && window.__bibleCorpus.loaded");
      const ok = await page.evaluate((h, a) => {
        if (h === 'bible') {
          window.__setBibleAudioEdition && window.__setBibleAudioEdition('brm-kjv');
          const ed = window.BIBLE_AUDIO_EDITIONS && window.BIBLE_AUDIO_EDITIONS['brm-kjv'];
          if (!ed) return false;
          AudioPlayer.playBibleBook({ volKey: ed.volKey, bookId: a[0], label: ed.label, chapterNum: a[1] });
        } else {
          let l = null;
          if (h === 'study') { for (const st of (window.BIBLE_STUDIES || [])) for (const c of (st.chapters || [])) if (c.id === a[1]) l = c; }
          else l = (Array.isArray(window[a[2]]) ? window[a[2]] : []).find((x) => x.id === a[1]);
          if (!l) return false;
          AudioPlayer.playLetter({ volKey: a[0], letter: l, collectionLabel: 'e2e' });
        }
        const st = AudioPlayer.getState(); const tr = st.queue[st.qi];
        if (!tr) return false;
        window.__openAudioText(tr);
        return true;
      }, how, arg);
      if (!ok) throw new Error(`walk: could not open ${how} ${JSON.stringify(arg)}`);
      await sleep(1500);
      if (!keepPlaying) { await page.evaluate(() => AudioPlayer.stop()); await sleep(800); }
    };
    const kinds = [
      ['bible', ['genesis', 49], 'genesis-49-to-last', 'next'],          // the peek is a last chapter: its Exodus end card
      [null, null, 'genesis-50-to-exodus', 'next'],                       // across books
      [null, null, 'exodus-1-back-to-genesis', 'prev'],
      ['bible', ['revelation', 21], 'revelation-21-to-last', 'next'],     // Revelation 22's Volume One bridge
      ['letter', ['seven', ids.v7a, 'LETTERS_V7'], 'v7-to-last-letter', 'next'],
      [null, null, 'v7-last-across-volumes', 'next'],
      ['letter', ['wtlb1', ids.w1, 'WTLB_ONE'], 'wtlb-next', 'next'],
      ['letter', ['wtlb1', ids.w1last, 'WTLB_ONE'], 'wtlb-part-one-to-two', 'next'],
      ['letter', ['blessed', ids.bl, 'THE_BLESSED'], 'blessed-next', 'next'],
      ['letter', ['holydays', ids.hd, 'HOLY_DAYS'], 'holydays-next', 'next'],
      ['study', ['study', ids.study], 'study-next', 'next'],
      ['bible', ['matthew', 27], 'matthew-27-to-last', 'next'],
    ];
    for (const [how, arg, label, dir] of kinds) {
      try {
        if (how) {
          if (arg.some((x) => x == null)) { fails.push(`walk: ${label}: no page to open (${JSON.stringify(arg)})`); continue; }
          if (how === 'study') {   // the first study chapter that has a recording
            let opened = false;
            for (const id of arg[1]) { try { await viaDesk(how, [arg[0], id], false); opened = true; out.more.ids.studyOpened = id; break; } catch { /* no recording */ } }
            if (!opened) throw new Error('no study chapter with a recording');
          } else await viaDesk(how, arg, false);
        }
        await swipe(label, dir, label === 'genesis-50-to-exodus' ? 4 : 1);
      } catch (e) { fails.push(`walk: ${label}: ${(e && e.message) || e}`); }
    }

    // P1 (TABS4, on a letter since TABS5: a Bible chapter draws no Mark as read row). With Mark as read off, a letter a
    // running plan holds keeps its row (plans2); the next letter, which no plan holds, has none, and the neighbour
    // drawn for it must not carry the plan letter's row, before release or after.
    try {
      // TABS5: Mark as read off the way a reader does it (Settings -> Progress), since the state lives in IndexedDB
      // and the running app writes its own over a hand edit (TABS4's localStorage write never reached the app)
      // GEAR1: the gear opens Quick settings; Settings is its last row.
      await page.evaluate(() => { if (!document.querySelector('[aria-label="Quick settings"]') && window.__goHome) window.__goHome(); });
      await page.waitForSelector('[aria-label="Quick settings"]', { timeout: 10000 });
      await page.evaluate(() => /** @type {HTMLElement} */ (document.querySelector('[aria-label="Quick settings"]')).click());
      await page.waitForSelector('.quick-settings-sheet [role="menuitem"]', { timeout: 5000 });
      await page.evaluate(() => /** @type {HTMLElement} */ ([...document.querySelectorAll('.quick-settings-sheet [role="menuitem"]')].find((b) => b.textContent.trim() === 'Settings')).click());
      const grp = 'section[data-settings-group="progress"]';
      await page.waitForSelector(`${grp} .settings-group-head`, { timeout: 10000 });
      if (!(await page.$eval(`${grp} .settings-group-head`, (b) => b.getAttribute('aria-expanded') === 'true'))) await page.click(`${grp} .settings-group-head`);
      await page.waitForSelector(`${grp} .settings-group-body`, { timeout: 5000 });
      const marOff = await page.evaluate((g) => {
        const row = [...document.querySelectorAll(`${g} .settings-row`)].find((r) => (r.querySelector('.settings-row-label') || {}).textContent === 'Mark as read');
        const inp = row && row.querySelector('.settings-toggle input');
        if (!inp) return null;
        if (inp.checked) /** @type {HTMLElement} */ (inp).click();
        return !inp.checked;
      }, grp);
      await sleep(400);
      if (!marOff) throw new Error(`Mark as read could not be switched off in Settings (${marOff})`);
      if (!ids.v7p || !ids.v7a) throw new Error('no Volume Seven letters to hold');
      const held = await page.evaluate((a, b) => {
        ReadingPlanStore.put({ id: 'e2e-tabs5', plan: 'e2e', start: '2026-11-11', status: 'running', segs: [], tracks: [{ items: [{ k: 'volume-seven:' + a }] }] });
        return ReadingPlanStore.holds('volume-seven', a) && !ReadingPlanStore.holds('volume-seven', b);
      }, ids.v7p, ids.v7a);
      if (!held) throw new Error('the plan run was not stored');
      await viaDesk('letter', ['seven', ids.v7p, 'LETTERS_V7'], false);
      // the row: in the live page, and in the drawn neighbour (where = live | next | prev)
      const mar = (where) => page.evaluate((w) => {
        const el = document.querySelector(w === 'live' ? '.screen-layout > .pager-viewport > .screen-scroll > .pager-track' : `.screen-layout > .pager-viewport > .pager-peek-${w}`);
        return el ? !!el.querySelector('.mark-read-row') : null;
      }, where);
      const armed = await mar('live');
      out.more.plan = { letter: ids.v7p, markAsReadOnPlanPage: armed };
      need(armed === true, `P1 the plan letter (${ids.v7p}) shows no Mark as read with the setting off (${armed}): the case is not armed`);
      await swipe('plan-letter-next', 'next', 1, false, null, async () => { out.more.plan.rowOnNextPeek = await mar('next'); });
      need(out.more.plan.rowOnNextPeek === false, `P1 the neighbour drawn for ${ids.v7a} (no plan holds it) carries a Mark as read row before release (${out.more.plan.rowOnNextPeek})`);
      out.more.plan.rowOnNext = await mar('live');
      need(out.more.plan.rowOnNext === false, `P1 ${ids.v7a} (no plan holds it) shows Mark as read`);
      await swipe('plan-letter-back', 'prev', 1, false, null, async () => { out.more.plan.rowOnPrevPeek = await mar('prev'); });
      need(out.more.plan.rowOnPrevPeek === true, `P1 the plan letter's neighbour lost its Mark as read row before release (${out.more.plan.rowOnPrevPeek})`);
      need(await mar('live') === true, 'P1 the plan letter lost its Mark as read row after the swipe back');
    } catch (e) { fails.push(`walk: plan letter: ${(e && e.message) || e}`); }

    // a search landing: the "Back to results" pill and the look's mark-as-read are that page's, not its neighbour's
    try {
      const title = ids.v1 && ids.v1.title;
      await page.evaluate(() => window.__goSearch && window.__goSearch()); await sleep(900);
      const inp = await page.waitForSelector('input[type="search"], input[type="text"]', { timeout: 8000 });
      await inp.type(title, { delay: 10 });
      // TABS4: tap the letter's own result card (TABS3 tapped the first element holding the title, which could be
      // something else on the results screen, and once landed on a page with no pager: "missing neighbour")
      await page.waitForFunction((t) => [...document.querySelectorAll('.srch-card')].some((c) => c.getClientRects().length && (c.textContent || '').includes(t)), { timeout: 20000 }, title);
      await page.evaluate((t) => { [...document.querySelectorAll('.srch-card')].find((c) => c.getClientRects().length && (c.textContent || '').includes(t)).click(); }, title);
      await page.waitForFunction((t) => { const tr = document.querySelector('.screen-layout > .pager-viewport > .screen-scroll > .pager-track'); return !!tr && (tr.textContent || '').includes(t); }, { timeout: 10000 }, title);
      // no settling time: the drag may start before the landing's neighbours are drawn (the race TABS3 hit once)
      await sleep(100);
      out.more.searchPill = await page.evaluate(() => /results/i.test((document.querySelector('.screen-layout') || document.body).textContent || ''));
      await swipe('search-landing-next', 'next', 1);
      await swipe('search-landing-back', 'prev', 1);
    } catch (e) { fails.push(`walk: search landing: ${(e && e.message) || e}`); }

    // A1: Genesis 2 playing; swipe to 3 and back. The sound runs on (same track, time only rises, no pause), the bars
    // above and below the reading area hold still in every frame, and the page that plays still has read-along on it.
    // TABS4: a real recording, served to the page (a 4-minute WAV in place of every release mp3, ranges honoured), so
    // the sound plays, the player is "playing" and read-along follows it; no network needed.
    const wav = makeWav(240);
    const served = [];
    const onReq = (rq) => {
      const u = rq.url();
      if (!/votreader-assets\/releases\/download\/|audio\.votreader\.workers\.dev/.test(u)) { rq.continue().catch(() => {}); return; }
      served.push(u.slice(-48));
      const m = /bytes=(\d+)-(\d*)/.exec(rq.headers().range || '');
      const hd = { 'Content-Type': 'audio/wav', 'Accept-Ranges': 'bytes', 'Access-Control-Allow-Origin': '*' };
      if (!m) { rq.respond({ status: 200, headers: hd, body: wav }).catch(() => {}); return; }
      const a = Math.min(+m[1], wav.length - 1); const b = m[2] ? Math.min(+m[2], wav.length - 1) : wav.length - 1;
      rq.respond({ status: 206, headers: { ...hd, 'Content-Range': `bytes ${a}-${b}/${wav.length}` }, body: wav.subarray(a, b + 1) }).catch(() => {});
    };
    try {
      await page.setBypassServiceWorker(true);
      await page.setRequestInterception(true);
      page.on('request', onReq);
      await viaDesk('bible', ['genesis', 2], true);
      await page.waitForFunction("AudioPlayer.getState().status === 'playing' && AudioPlayer.getState().time > 1", { timeout: 25000 });
      await sleep(1500);
      // the sound (player state + the media element that plays), and where read-along's wash (::highlight(vot-reading)) is
      const aud = () => page.evaluate(() => {
        const s = AudioPlayer.getState(); const t = s.queue[s.qi];
        const m = (window.__medias || []).find((x) => x.currentSrc && !x.paused) || null;
        const hl = window.CSS && CSS.highlights ? CSS.highlights.get('vot-reading') : null;
        const r = hl ? [...hl][0] : null;
        const track = document.querySelector('.screen-layout > .pager-viewport > .screen-scroll > .pager-track');
        const sc = track && track.closest('.screen-scroll');
        const blk = r && r.startContainer && (r.startContainer.nodeType === 1 ? r.startContainer : r.startContainer.parentElement);
        const kEl = blk && blk.closest('[data-hl-key]');
        const box = r && r.getBoundingClientRect(); const sb = sc && sc.getBoundingClientRect();
        return { key: t && (t.key || t.id || JSON.stringify(t).slice(0, 80)), status: s.status, time: +(+s.time).toFixed(2), media: m ? +m.currentTime.toFixed(2) : null,
          lit: kEl ? kEl.getAttribute('data-hl-key') : null, litLive: !!(r && track && track.contains(r.startContainer)),
          litOnScreen: !!(box && sb && box.height > 0 && box.bottom > sb.top && box.top < sb.bottom) };
      });
      const a0 = await aud();
      await page.evaluate(() => { window.__a1 = { pauses: 0, seeks: 0, plays: 0 }; for (const m of (window.__medias || [])) { m.__tabsL = 1; m.addEventListener('pause', () => window.__a1.pauses++); m.addEventListener('seeking', () => window.__a1.seeks++); m.addEventListener('play', () => window.__a1.plays++); } });
      await swipe('audio-next', 'next', 1, true);
      const a1 = await aud();
      await swipe('audio-back', 'prev', 1, true);
      const a2 = await aud();
      const ev = await page.evaluate(() => window.__a1);
      out.more.audio = { a0, a1, a2, events: ev, served: served.length };
      need(served.length > 0 && a0.status === 'playing' && a0.media != null, `A1 the served recording is not playing (${served.length} requests, ${JSON.stringify(a0)})`);
      need(a1.key === a0.key && a2.key === a0.key, `A1 the track changed during a swipe (${a0.key} -> ${a1.key} -> ${a2.key})`);
      need(a1.status === 'playing' && a2.status === 'playing' && a1.time > a0.time && a2.time > a1.time && a1.media > a0.media && a2.media > a1.media,
        `A1 the sound did not run on through the swipes (${a0.time}/${a0.media}, ${a1.time}/${a1.media}, ${a2.time}/${a2.media})`);
      need(ev.pauses === 0 && ev.seeks === 0 && ev.plays === 0, `A1 the audio paused, seeked or restarted during the swipes (${JSON.stringify(ev)})`);
      need(a0.lit && a0.litLive && a2.litLive && a2.litOnScreen, `A1 read-along's line is not on the playing page after the swipes (${JSON.stringify({ a0: [a0.lit, a0.litLive], a2: [a2.lit, a2.litLive, a2.litOnScreen] })})`);
      await page.evaluate(() => AudioPlayer.stop());
      await sleep(800);

      // A2 (TABS5): the same for a letter. A Volume Seven letter plays; swipe to the next letter and back. With the
      // finger down on the way back, the playing letter's neighbour already carries the wash (its clause, in the peek);
      // the sound runs on, and the wash is on the playing page after.
      if (!ids.v7p) throw new Error('A2: no Volume Seven letter');
      await viaDesk('letter', ['seven', ids.v7p, 'LETTERS_V7'], true);
      await page.waitForFunction("AudioPlayer.getState().status === 'playing' && AudioPlayer.getState().time > 1", { timeout: 25000 });
      // a letter's first timed clause comes after its spoken title (26.5 s on this one): go to its first minute
      await page.evaluate(() => AudioPlayer.seek(60));
      await page.waitForFunction("AudioPlayer.getState().status === 'playing' && AudioPlayer.getState().time > 60", { timeout: 15000 });
      await page.waitForFunction(() => { const h = window.CSS && CSS.highlights && CSS.highlights.get('vot-reading'); return !!(h && h.size); }, { timeout: 15000 });
      await sleep(1500);
      const peekLit = () => page.evaluate(() => {
        const hl = CSS.highlights.get('vot-reading'); const r = hl ? [...hl][0] : null;
        const n = r && r.startContainer; const el = n && (n.nodeType === 1 ? n : n.parentElement);
        const pk = el && el.closest('.pager-peek'); const k = el && el.closest('[data-hl-key]');
        return { inPeek: pk ? [...pk.classList].filter((c) => /pager-peek-/.test(c)).join(' ') : null, key: k ? k.getAttribute('data-hl-key') : null, len: r ? String(r).length : 0 };
      });
      const l0 = await aud();
      await page.evaluate(() => { window.__a1 = { pauses: 0, seeks: 0, plays: 0 }; for (const m of (window.__medias || [])) { if (m.__tabsL) continue; m.__tabsL = 1; m.addEventListener('pause', () => window.__a1.pauses++); m.addEventListener('seeking', () => window.__a1.seeks++); m.addEventListener('play', () => window.__a1.plays++); } });
      await swipe('audio-letter-next', 'next', 1, true);
      const l1 = await aud();
      // A letter's clauses run 2-4 s, so in the 1.6 s from release to the settled frame the voice can move on to the
      // next clause: a true change, not the swipe's. The way back starts at a long clause (6 s or more, within the next
      // 30 s, so it is on the page), the walk's own seek, made before the counters start again.
      const longAt = await page.evaluate(() => {
        const s = AudioPlayer.getState(); const t = s.queue[s.qi];
        const rows = (window.AUDIO_SYNC && t && window.AUDIO_SYNC[t.key]) || [];
        for (let i = 0; i + 1 < rows.length; i++) if (rows[i][0] > s.time + 1 && rows[i][0] < s.time + 30 && rows[i + 1][0] - rows[i][0] >= 6) return rows[i][0];
        return null;
      });
      if (longAt != null) {
        await page.evaluate((t) => AudioPlayer.seek(t + 0.3), longAt);
        await page.waitForFunction((t) => AudioPlayer.getState().time >= t + 0.3, { timeout: 10000 }, longAt);
        await sleep(300);
        await page.evaluate(() => { window.__a1 = { pauses: 0, seeks: 0, plays: 0 }; });
      }
      const l1b = longAt != null ? await aud() : l1;
      let atRel = null;
      await swipe('audio-letter-back', 'prev', 1, true, null, async () => { atRel = await peekLit(); });
      const l2 = await aud();
      const ev2 = await page.evaluate(() => window.__a1);
      out.more.audioLetter = { letter: ids.v7p, l0, l1, longAt, l1b, l2, atRelease: atRel, events: ev2 };
      need(l0.status === 'playing' && l0.lit && l0.litLive, `A2 the letter's recording is not playing with read-along on it (${JSON.stringify(l0)})`);
      need(l1.key === l0.key && l2.key === l0.key, `A2 the track changed during a swipe (${l0.key} -> ${l1.key} -> ${l2.key})`);
      need(l1.status === 'playing' && l2.status === 'playing' && l1.time > l0.time && l2.time > l1b.time && l1.media > l0.media && l2.media > l1b.media,
        `A2 the sound did not run on through the swipes (${l0.time}/${l0.media}, ${l1.time}/${l1.media}, ${l1b.time}/${l1b.media}, ${l2.time}/${l2.media})`);
      need(ev2.pauses === 0 && ev2.seeks === 0 && ev2.plays === 0, `A2 the audio paused, seeked or restarted during the swipes (${JSON.stringify(ev2)})`);
      need(atRel && atRel.inPeek === 'pager-peek-prev' && atRel.len > 0 && String(atRel.key).startsWith('letter:' + ids.v7p + ':'),
        `A2 the playing letter's neighbour has no wash before release (${JSON.stringify(atRel)})`);
      need(l2.litLive && l2.litOnScreen, `A2 read-along's line is not on the playing letter after the swipes (${JSON.stringify(l2)})`);
      await page.evaluate(() => AudioPlayer.stop());
    } catch (e) { fails.push(`walk: audio: ${(e && e.message) || e}`); } finally {
      page.off('request', onReq);
      await page.setRequestInterception(false).catch(() => {});
      await page.setBypassServiceWorker(false).catch(() => {});
    }

  } catch (e) {
    fails.push(`walk: ${(e && e.stack) || e}`);
  } finally {
    const anaB = out._anaBrowser; delete out._anaBrowser;
    await browser.close().catch(() => {});
    if (anaB) await anaB.close().catch(() => {});
    server.close();
    rmSync(profile, { recursive: true, force: true });
  }
  // TABS6: the upgrade case - a phone holding an older build's JPEG pictures (tools/e2e-tabs-upgrade.mjs)
  if (!argv.includes('--no-upgrade')) {
    const up = await runUpgrade({ shots: SHOTS, log: (m) => console.log('[upgrade] ' + m) });
    out.upgrade = { rounds: Object.fromEntries(Object.entries(up.out.rounds).map(([k, r]) => [k, { drawMs: r.drawMs, firstFrame: r.firstFrame, same: r.same, other: r.other }])), fit: up.out.fit };
    fails.push(...up.fails);
  }
  const summary = JSON.stringify(out, (k, v) => (k === 'keys' || k === 'sizes' ? undefined : v), 1);
  console.log(summary);
  if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify({ ...out, fails }, (k, v) => (k === 'keys' ? undefined : v), 1));
  if (fails.length) { console.log(`\n${fails.length} finding(s):`); for (const f of fails) console.log('  ' + f); }
  console.log(fails.length ? (MEASURE ? 'MEASURED (limits not enforced)' : 'FAIL') : 'PASS');
  process.exit(fails.length && !MEASURE ? 1 : 0);
}

main();
