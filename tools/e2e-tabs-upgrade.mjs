/**
 * tools/e2e-tabs-upgrade.mjs - the Tabs screen on a phone that held an older build's tab pictures (TABS6, 2026-11-12).
 *
 * WHY. Corbin installed the overview build over the old one and opened Tabs: every card was a narrow strip between
 * bars, and a card taken in the dark theme showed a blue-white page between black bars in the light theme. The old
 * build had stored a JPEG per tab ({ dark, light }, one theme, `unknown`, ...); the new overview drew those for any tab
 * it had no new picture for, letterboxed, through an invert filter. Every earlier walk started from an empty app.
 *
 * This walk seeds that phone: open tabs of every page kind (letter, Bible chapter, Matthew chapter, study, Words To
 * Live By, an Answers topic, Hidden Manna, Home, History, Library, Settings) with the old build's JPEG rows in the
 * picture store, then opens the Tabs screen and checks:
 *   U1  no card draws an <img> or a CSS filter of its own, in either theme (the page copy's own images and
 *       filters are the page);
 *   U2  every tab whose page can be drawn off screen gets its true picture by itself (no visit), within a time limit;
 *       the rest wait on the page-coloured placeholder;
 *   U3  the old rows are gone from the picture store, and nothing else was written over;
 *   U4  a letter's and a Bible chapter's card against the live page in the current theme (mean abs diff, and the
 *       page colour), for a picture taken in dark shown in dark and in light, and one taken in light (at a larger
 *       text size) shown in light and in dark;
 *   U5  each card's picture fills its picture area (no bar at any side) at 360 and 412 wide and in a phone's
 *       landscape (915 x 412).
 *
 * Run: node tools/e2e-tabs-upgrade.mjs [--measure] [--shots DIR] [--json FILE] [--assets DIR] [--before]
 *   --assets serves another built tree (the before run: an older commit's app/src/main/assets); --before only takes
 *   the shots and counts (no limits). e2e-tabs-true.mjs runs this at its end (npm run e2e:tabs).
 */
import puppeteer from 'puppeteer';
import http from 'node:http';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, join, normalize, extname, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const LIMITS = { cardMad: 8, bgDiff: 4, fillPx: 1, drawMs: 30000 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.ico': 'image/x-icon' };

/** A static server for one tree on a port the OS picks (no-store, 127.0.0.1). */
function serve(root) {
  const server = http.createServer((req, res) => {
    let p = decodeURIComponent((req.url || '/').split('?')[0]);
    if (p.endsWith('/')) p += 'index.html';
    const f = normalize(join(root, p));
    if (!f.startsWith(normalize(root)) || !existsSync(f) || !statSync(f).isFile()) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(readFileSync(f));
  });
  return new Promise((ok) => server.listen(0, '127.0.0.1', () => ok({ server, url: `http://127.0.0.1:${server.address().port}/` })));
}

/* ── in-page analysis: decode two pictures and compare them ── */
const ANALYSIS = () => {
  const load = (src) => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const px = (img, w, h, sx = 0, sy = 0, sw = img.width, sh = img.height) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    return { c, d: g.getImageData(0, 0, w, h).data };
  };
  const mode = (d) => { const m = new Map(); let best = null, n = 0; for (let i = 0; i < d.length; i += 4) { const k = (d[i] >> 2) + ',' + (d[i + 1] >> 2) + ',' + (d[i + 2] >> 2); const v = (m.get(k) || 0) + 1; m.set(k, v); if (v > n) { n = v; best = [d[i], d[i + 1], d[i + 2]]; } } return best; };
  const cmp = (a, b) => { let s = 0, n = 0; for (let i = 0; i < a.length; i += 4) { s += (Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2])) / 3; n++; } return n ? +(s / n).toFixed(2) : 0; };
  window.__ana = {
    async card(refUrl, cardUrl) {
      const [ref, card] = await Promise.all([load(refUrl), load(cardUrl)]);
      const scale = card.width / ref.width;
      const srcH = Math.min(ref.height, Math.round(card.height / scale));
      const h = Math.round(srcH * scale);
      const a = px(ref, card.width, h, 0, 0, ref.width, srcH); const b = px(card, card.width, h, 0, 0, card.width, h);
      const pair = document.createElement('canvas'); pair.width = card.width * 2 + 12; pair.height = h;
      const g = pair.getContext('2d'); g.fillStyle = '#888'; g.fillRect(0, 0, pair.width, h); g.drawImage(a.c, 0, 0); g.drawImage(b.c, card.width + 12, 0);
      const bgRef = mode(a.d), bgCard = mode(b.d);
      return { mad: cmp(a.d, b.d), bgRef, bgCard, bgDiff: Math.max(...bgRef.map((v, i) => Math.abs(v - bgCard[i]))), pair: pair.toDataURL('image/png') };
    },
    // the edge strips of a card picture: their colour against the picture's own page colour (a bar is another colour)
    async edges(url) {
      const i = await load(url); const W = i.width, H = i.height;
      const all = px(i, W, H).d; const bg = mode(all);
      const strip = (x, y, w, h) => { const d = px(i, w, h, x, y, w, h).d; const m = mode(d); return Math.max(...m.map((v, k) => Math.abs(v - bg[k]))); };
      return { bg, left: strip(0, 0, 3, H), right: strip(W - 3, 0, 3, H), bottom: strip(0, H - 3, W, 3), top: strip(0, 0, W, 3) };
    },
  };
};

/** A JPEG data URL like the old build stored (a 1440-wide page picture, q 0.9): dark or light page with text bars. */
const OLD_JPEG = (theme, w, h) => {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = theme === 'dark' ? '#0b0a08' : '#f6f1e7'; g.fillRect(0, 0, w, h);
  g.fillStyle = theme === 'dark' ? '#d8d0c0' : '#2a2620';
  for (let y = 120; y < h - 60; y += 46) {
    const lw = w * (0.55 + 0.35 * Math.abs(Math.sin(y)));
    for (let x = 90; x < lw; x += 18 + (x % 7)) g.fillRect(x, y, 8 + (x % 11), 22);
  }
  return c.toDataURL('image/jpeg', 0.9);
};

/**
 * @param {{ assets?: string, shots?: string|null, before?: boolean, measure?: boolean, log?: (s: string) => void }} o
 */
export async function runUpgrade(o = {}) {
  const ASSETS = o.assets ? resolve(o.assets) : resolve(HERE, '..', 'app', 'src', 'main', 'assets');
  const SHOTS = o.shots || null;
  const BEFORE = !!o.before;
  const log = o.log || ((s) => console.log(s));
  if (SHOTS) mkdirSync(SHOTS, { recursive: true });
  const out = { rounds: {}, fit: [], storage: {} };
  const fails = [];
  const need = (ok, msg) => { if (!ok) fails.push(msg); };
  const { server, url } = await serve(ASSETS);
  const profile = join(tmpdir(), 'vot-tabs6-' + process.pid);
  rmSync(profile, { recursive: true, force: true });
  const args = ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'];
  let browser = null, page = null;
  const anaBrowser = await puppeteer.launch({ headless: true, args });
  const ana = await anaBrowser.newPage();
  await ana.evaluate(ANALYSIS);
  const W = 412, H = 915;
  const launch = async (vw = W, vh = H) => {
    if (browser) await browser.close().catch(() => {});
    browser = await puppeteer.launch({ headless: true, userDataDir: profile, args });
    page = (await browser.pages())[0] || await browser.newPage();
    page.setDefaultTimeout(30000);
    await page.setViewport({ width: vw, height: vh, deviceScaleFactor: 3, isMobile: vw < 900 || vh < 500, hasTouch: true });
  };
  const boot = async () => {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 });   // the load is not what this measures (ans4)
    await page.waitForFunction(() => { const r = document.getElementById('root'); return !!r && r.children.length > 0; }, { timeout: 90000 });
    await page.evaluate(async () => { for (const n of ['__loadBibleCorpus', '__loadVotCorpus', '__loadAnswersCorpus']) if (typeof window[n] === 'function') { try { await window[n](); } catch (_e) { /* the app retries */ } } });
    await sleep(1500);
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
  const shot = async (name) => { if (SHOTS) await page.screenshot({ path: join(SHOTS, name) }); };

  /* ── the seed: the app's own record, its tabs replaced by one of each kind; the old build's JPEG rows ── */
  let seedTabs = null;   // [{ tab, key, kind }]
  const firstRun = async () => {
    await launch();
    await boot();
    await clickText(/^Continue$/).catch(() => {}); await clickText(/Begin Reading/).catch(() => {});
    await clickText(/^Maybe later$/).catch(() => {});
    await sleep(1500);
    await page.evaluate(() => typeof window.__flushPersistState === 'function' && window.__flushPersistState());
    await sleep(1500);
    seedTabs = await page.evaluate(async () => {
      await new Promise((done) => { if (typeof window.BIBLE_STUDIES !== 'undefined') { done(); return; } const s = document.createElement('script'); s.src = 'src/data/bible-studies.js'; s.onload = done; s.onerror = done; document.head.appendChild(s); });
      const arr = (n) => (Array.isArray(window[n]) ? window[n] : []);
      const st = (window.BIBLE_STUDIES || []).find((x) => (x.chapters || []).filter((c) => Array.isArray(c.blocks)).length >= 2);
      const stCh = st ? st.chapters.filter((c) => Array.isArray(c.blocks))[1] : null;
      const ans = arr('ANSWERS').find((a) => a && a.id && Array.isArray(a.paragraphs) && a.paragraphs.length > 6);
      const base = (StateStore.get().tabs || [])[0] || {};
      const mk = (over) => ({ ...base, screen: 'home', bookId: null, chapterNum: null, letterId: null, studyId: null, studyChapterId: null,
        journalEntryId: null, genreId: null, audioColKey: null, surpriseAnchor: null, fromLetterStack: [], navOrigin: null, searchLanding: null,
        fromSearch: false, fromSurprise: false, fromSearchIndex: false, fromWtlb: null, title: null, subtitle: null, scrollPositions: {}, pinned: false, customTitle: null, ...over });
      const v1 = arr('LETTERS_V1')[3];
      const list = [
        ['home', mk({})],
        ['letter', mk({ screen: 'vot-one-letter', letterId: v1 && v1.id, scrollPositions: v1 ? { ['letter-' + v1.id]: 900 } : {} })],
        ['bible', mk({ screen: 'bible-ch', bookId: 'john', chapterNum: 12 })],
        ['matthew', mk({ screen: 'matthew-ch', bookId: 'matthew', chapterNum: 5 })],
        ['study', mk({ screen: 'bible-study-chapter', studyId: st && st.id, studyChapterId: stCh && stCh.id })],
        ['wtlb', mk({ screen: 'wtlb-one-entry', letterId: arr('WTLB_ONE')[1] && arr('WTLB_ONE')[1].id })],
        ['answers', mk({ screen: 'answers-entry', letterId: ans && ans.id })],
        ['hm', mk({ screen: 'hm-letter', letterId: arr('HIDDEN_MANNA')[0] && arr('HIDDEN_MANNA')[0].id })],
        ['history', mk({ screen: 'history' })],
        ['library', mk({ screen: 'library' })],
        ['settings', mk({ screen: 'settings' })],
      ];
      return list.map(([kind, tab]) => ({ kind, tab, key: tabContentKey(tab) }));
    });
    out.seed = seedTabs.map((s) => ({ kind: s.kind, screen: s.tab.screen, letterId: s.tab.letterId, key: s.key }));
    await browser.close(); browser = null;
  };
  const OLD_KINDS = [(d, l) => ({ dark: d, light: l }), (d) => ({ dark: d }), (d, l) => ({ light: l }), (d) => ({ unknown: d }), (d) => ({ url: d, theme: 'dark' }), (d) => d];
  const seed = async (theme, fontScale) => {
    await launch();
    await page.setBypassCSP(true);   // offline.html allows no script; the seed runs there so the app cannot write over it
    await page.goto(url + 'offline.html', { waitUntil: 'domcontentloaded' });
    const r = await page.evaluate(async (tabs, theme, fontScale, OLD, kinds) => {
      const req = (r) => new Promise((ok, no) => { r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
      const db = await req(indexedDB.open('votreader'));
      const tx = db.transaction('vot-state', 'readwrite'); const store = tx.objectStore('vot-state');
      const keys = await req(store.getAllKeys());
      let patched = 0;
      for (const k of keys) {
        const rec = await req(store.get(k));
        const holder = rec && rec.tabs ? rec : rec && rec.value && rec.value.tabs ? rec.value : rec && rec.data && rec.data.tabs ? rec.data : null;
        if (!holder) continue;
        holder.tabs = tabs.map((t) => t.tab); holder.activeTabIdx = 0; holder.theme = theme;
        holder.settings = { ...(holder.settings || {}), fontScale: String(fontScale) };
        await req(store.put(rec, k)); patched++;
      }
      db.close();
      try { localStorage.setItem('vot-state', JSON.stringify({ theme, settings: { fontScale: String(fontScale) } })); } catch (_e) { /* boot shim */ }
      const mkJ = new Function('return (' + OLD + ')')();
      const dj = mkJ('dark', 1440, 2560), lj = mkJ('light', 1440, 2560);
      const fns = kinds.map((s) => new Function('return (' + s + ')')());
      const tdb = await new Promise((ok, no) => { const o = indexedDB.open('vot-thumbs', 2); o.onupgradeneeded = () => { if (!o.result.objectStoreNames.contains('thumbs')) o.result.createObjectStore('thumbs'); }; o.onsuccess = () => ok(o.result); o.onerror = () => no(o.error); });
      const ttx = tdb.transaction('thumbs', 'readwrite'); const ts = ttx.objectStore('thumbs');
      await req(ts.clear());
      tabs.forEach((t, i) => { ts.put(fns[i % fns.length](dj, lj), t.key); });
      await new Promise((ok) => { ttx.oncomplete = ok; ttx.onerror = ok; });
      tdb.close();
      return { patched, jpegBytes: dj.length + lj.length };
    }, seedTabs, theme, fontScale, OLD_JPEG.toString(), OLD_KINDS.map((f) => f.toString()));
    if (!r.patched) throw new Error('walk: no vot-state record holds tabs');
    return r;
  };
  const storage = () => page.evaluate(() => new Promise((res) => {
    const rq = indexedDB.open('vot-thumbs');
    rq.onsuccess = () => {
      const db = rq.result; const tx = db.transaction('thumbs', 'readonly'); const st = tx.objectStore('thumbs');
      const k = st.getAllKeys(); const v = st.getAll();
      tx.oncomplete = () => {
        const rows = k.result.map((key, i) => { const x = v.result[i]; return { key: String(key), kind: x && typeof x === 'object' && x.snap ? 'snap' : 'old', bytes: (typeof x === 'string' ? x.length : JSON.stringify(x).length) }; });
        db.close(); res(rows);
      };
    };
    rq.onerror = () => res([]);
  }));
  /** The state of every card: what its picture area holds, and any filter on it. */
  const cards = () => page.evaluate(() => [...document.querySelectorAll('.tabs-overview .tab-card:not(.tab-card-new)')].map((c) => {
    const wrap = c.querySelector('.tab-card-thumb-wrap');
    let filter = null;
    // a filter of the card's own (an old picture drawn through one); a page's own filter inside its copy is the page
    // (a study's white title plate is drawn light-on-dark through invert(1) in a dark theme), as its images are below
    for (const el of [wrap, ...wrap.querySelectorAll('*')]) { if (el.parentElement && el.parentElement.closest('.tab-snap-page')) continue; const f = getComputedStyle(el).filter; if (f && f !== 'none') { filter = f; break; } }
    // an old picture is an <img> of the card's own (a page's own images inside its copy are the page)
    const img = [...wrap.querySelectorAll('img')].find((x) => !x.closest('.tab-snap-page')) || null;
    const pg = wrap.querySelector('.tab-snap-page');
    // a snapshot past the sixth card paints as the list brings it near (SnapBox lazy): it is there, not missing
    const held = !!wrap.querySelector('.tab-snap:not(.tab-snap-wait)');
    let fill = null;
    if (pg && pg.childElementCount) {
      const w = wrap.getBoundingClientRect(); const p = pg.getBoundingClientRect();
      const sc = pg.querySelector('.screen-scroll'); const s = sc ? sc.getBoundingClientRect() : p;
      fill = { left: +(p.left - w.left).toFixed(2), right: +(w.right - p.right).toFixed(2), bottom: +(w.bottom - Math.min(p.bottom, s.bottom)).toFixed(2), boxW: Math.round(w.width), boxH: Math.round(w.height) };
    }
    return { state: img ? 'img' : (pg && pg.childElementCount) || held ? 'snap' : wrap.querySelector('.tab-snap-wait') ? 'wait' : wrap.querySelector('.tab-card-thumb-sigil') ? 'sigil' : 'blank', filter, fill, img: img ? { w: img.naturalWidth, h: img.naturalHeight, cls: img.className } : null };
  }));
  const openTabs = async () => {
    await page.evaluate(() => {
      window.__ff = null;
      const mo = new MutationObserver(() => {
        if (!document.querySelector('.tabs-overview-layer .tab-card')) return;
        mo.disconnect();
        requestAnimationFrame(() => { window.__ff = [...document.querySelectorAll('.tabs-overview .tab-card:not(.tab-card-new) .tab-card-thumb-wrap')].map((w) => (w.querySelector('img.tab-card-thumb, :scope > img') ? 'img' : w.querySelector('.tab-snap:not(.tab-snap-wait)') ? 'snap' : w.querySelector('.tab-snap-wait') ? 'wait' : 'other')); });
      });
      mo.observe(document.body, { childList: true, subtree: true });
    });
    await clickText(/^Open tabs/, 'button');
    await sleep(300);
    return page.evaluate(() => window.__ff);
  };
  const closeTabs = async () => { await page.keyboard.press('Escape'); await sleep(500); };
  // PO2 item 26 (main 3526b4a9a): choosing Light or Dark closes the More menu itself. An Escape after it reached the
  // page and went Back (Genesis 1 -> its chapter list): press it only while the menu is still open.
  const closeMenu = async () => {
    for (let i = 0; i < 20 && await page.evaluate(() => !!document.querySelector('.more-menu[role="menu"]')); i++) await sleep(50);
    if (await page.evaluate(() => !!document.querySelector('.more-menu[role="menu"]'))) await page.keyboard.press('Escape');
  };
  const pickTab = async (i) => { await page.evaluate((n) => document.querySelectorAll('.tabs-overview .tab-card-open')[n].click(), i); await sleep(1500); };
  const drawable = (k) => !['settings'].includes(k);
  // U4 spot check (hub, 11-12: usage): a letter and a Bible chapter, not every kind
  const SPOT = ['letter', 'bible'];
  /** Wait until every drawable card holds its picture (or the limit passes); returns ms taken and the card states. */
  const waitDrawn = async () => {
    const t0 = Date.now(); let cs = await cards();
    while (Date.now() - t0 < LIMITS.drawMs) {
      if (seedTabs.every((s, i) => !drawable(s.kind) || (cs[i] && cs[i].state === 'snap'))) break;
      await sleep(250); cs = await cards();
    }
    return { ms: Date.now() - t0, cs };
  };
  const scrollerRect = () => page.evaluate(() => {
    const el = [...document.querySelectorAll('.screen-layout > .pager-viewport > .screen-scroll, .screen-layout > .screen-scroll')]
      .find((e) => !e.closest('.tabs-overview-layer, .tab-bg-draw') && e.getClientRects().length);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left, y: r.top, w: el.clientWidth, h: el.clientHeight };
  });
  const cardShots = async () => {
    await page.evaluate(() => document.querySelectorAll('.tabs-overview .tab-card-menu').forEach((b) => { b.style.visibility = 'hidden'; }));
    const els = await page.$$('.tabs-overview .tab-card:not(.tab-card-new) .tab-card-thumb-wrap');
    const urls = [];
    for (const e of els) { await e.scrollIntoView(); await sleep(120); urls.push('data:image/png;base64,' + await e.screenshot({ encoding: 'base64' })); }
    await page.evaluate(() => document.querySelectorAll('.tabs-overview .tab-card-menu').forEach((b) => { b.style.visibility = ''; }));
    return urls;
  };
  const tabsShots = async (name) => {
    await page.evaluate(() => { const s = document.querySelector('.tabs-overview-layer .screen-scroll'); if (s) s.scrollTop = 0; });
    await sleep(200); await shot(name + '-top.png');
    await page.evaluate(() => { const s = document.querySelector('.tabs-overview-layer .screen-scroll'); if (s) s.scrollTop = s.scrollHeight; });
    await sleep(300); await shot(name + '-end.png');
    await page.evaluate(() => { const s = document.querySelector('.tabs-overview-layer .screen-scroll'); if (s) s.scrollTop = 0; });
  };
  const setTheme = async (theme) => {
    await pickTab(2);   // John 12, a reader with the More menu
    await clickText(/^More$/, 'button'); await clickText(new RegExp('^' + (theme === 'light' ? 'Light' : 'Dark') + '$'), 'button');
    await closeMenu(); await sleep(800);
  };
  /** U4: every card against its live page, visited after the cards are shot (the visit retakes the card). */
  const compare = async (label, shots) => {
    const res = [];
    for (let i = 0; i < seedTabs.length; i++) {
      const s = seedTabs[i];
      if (!SPOT.includes(s.kind)) { res.push(null); continue; }
      await pickTab(i);
      const r = await scrollerRect();
      const ref = 'data:image/png;base64,' + await page.screenshot({ encoding: 'base64', clip: { x: r.x, y: r.y, width: r.w, height: r.h } });
      const c = await ana.evaluate((a, b) => window.__ana.card(a, b), ref, shots[i]);
      res.push({ kind: s.kind, mad: c.mad, bgRef: c.bgRef, bgCard: c.bgCard, bgDiff: c.bgDiff });
      if (SHOTS) writeFileSync(join(SHOTS, `tabs6-pair-${label}-${s.kind}.png`), Buffer.from(c.pair.split(',')[1], 'base64'));
      if (!BEFORE) {
        need(c.mad <= LIMITS.cardMad, `U4 ${label} ${s.kind}: the card differs from its page (mad ${c.mad})`);
        need(c.bgDiff <= LIMITS.bgDiff, `U4 ${label} ${s.kind}: page colour ${c.bgCard} on the card vs ${c.bgRef} live`);
      }
      await openTabs(); await sleep(400);
    }
    return res;
  };

  /* One round: seed in `theme`, boot, open Tabs (the cards are drawn in it), measure; switch theme, measure again. */
  const round = async (label, theme, other, fontScale) => {
    const sd = await seed(theme, fontScale);
    await boot();
    const R = { seed: sd, theme, fontScale };
    R.firstFrame = await openTabs();
    const w = await waitDrawn();
    R.drawMs = w.ms; R.cards = w.cs.map((c) => ({ state: c.state, filter: c.filter, img: c.img, fill: c.fill }));
    await tabsShots(`tabs6-${BEFORE ? 'before' : 'after'}-${label}-${theme}`);
    R.storage = await storage();
    log(`${label} ${theme}: first frame ${JSON.stringify(R.firstFrame)}; after ${w.ms} ms ${JSON.stringify(w.cs.map((c) => c.state))}`);
    for (const [i, c] of w.cs.entries()) {
      if (BEFORE) continue;
      need(c.state !== 'img' && !c.img, `U1 ${label} ${theme} ${seedTabs[i].kind}: the card draws an <img> (${JSON.stringify(c.img)})`);
      need(!c.filter, `U1 ${label} ${theme} ${seedTabs[i].kind}: a filter on the card (${c.filter})`);
      if (drawable(seedTabs[i].kind)) need(c.state === 'snap', `U2 ${label} ${theme} ${seedTabs[i].kind}: no picture after ${w.ms} ms (${c.state})`);
      else need(c.state === 'wait', `U2 ${label} ${theme} ${seedTabs[i].kind}: not drawn and not the page placeholder (${c.state})`);
      if (c.fill) need(c.fill.left <= LIMITS.fillPx && c.fill.right <= LIMITS.fillPx && c.fill.bottom <= LIMITS.fillPx, `U5 ${label} ${seedTabs[i].kind}: picture does not fill its box ${JSON.stringify(c.fill)}`);
    }
    if (!BEFORE) {
      const old = R.storage.filter((r) => r.kind === 'old');
      need(old.length === 0, `U3 ${label}: old JPEG rows left in the picture store: ${old.map((r) => r.key).join(', ')}`);
    }
    const s1 = await cardShots();
    R.same = await compare(`${label}-${theme}`, s1);
    // the other theme: the same pictures, not drawn again
    await setTheme(other);
    await openTabs(); await sleep(600);
    const c2 = await cards();
    R.otherCards = c2.map((c) => c.state);
    await tabsShots(`tabs6-${BEFORE ? 'before' : 'after'}-${label}-${other}`);
    if (!BEFORE) for (const [i, c] of c2.entries()) need(!c.img && !c.filter, `U1 ${label} ${other} ${seedTabs[i].kind}: img or filter after the switch`);
    const s2 = await cardShots();
    R.other = await compare(`${label}-${theme}-shown-${other}`, s2);
    await closeTabs();
    return R;
  };

  try {
    await firstRun();
    out.rounds.dark = await round('A', 'dark', 'light', 1);
    if (!BEFORE) out.rounds.light = await round('B', 'light', 'dark', 1.4);
    if (!BEFORE) {
      // U5 fit: the same profile at other sizes (the cards hold the pictures already drawn)
      for (const [vw, vh] of [[360, 780], [412, 915], [915, 412]]) {
        // pictures drawn at this size (the drawer takes the tabs with none)
        await launch(vw, vh);
        await page.setBypassCSP(true);
        await page.goto(url + 'offline.html', { waitUntil: 'domcontentloaded' });
        await page.evaluate(() => new Promise((ok) => { const o = indexedDB.open('vot-thumbs', 2); o.onsuccess = () => { const t = o.result.transaction('thumbs', 'readwrite'); t.objectStore('thumbs').clear(); t.oncomplete = () => { o.result.close(); ok(); }; }; o.onerror = ok; }));
        await boot();
        await openTabs(); await waitDrawn();
        const cs = await cards();
        const fills = cs.filter((c) => c.fill).map((c) => c.fill);
        const shots = await cardShots();
        const edges = [];
        for (const [i, c] of cs.entries()) if (c.fill) edges.push(await ana.evaluate((u) => window.__ana.edges(u), shots[i]));
        out.fit.push({ vw, vh, cards: fills.length, worst: fills.reduce((m, f) => Math.max(m, f.left, f.right, f.bottom), 0), box: fills[0] ? [fills[0].boxW, fills[0].boxH] : null, edges: edges.map((e) => [e.left, e.right, e.bottom]) });
        await tabsShots(`tabs6-after-fit-${vw}x${vh}`);
        for (const f of fills) need(f.left <= LIMITS.fillPx && f.right <= LIMITS.fillPx && f.bottom <= LIMITS.fillPx, `U5 ${vw}x${vh}: a picture does not fill its box ${JSON.stringify(f)}`);
        await closeTabs();
      }
    }
  } catch (e) {
    fails.push(`walk: ${(e && e.stack) || e}`);
  } finally {
    if (browser) await browser.close().catch(() => {});
    await anaBrowser.close().catch(() => {});
    server.close();
    rmSync(profile, { recursive: true, force: true });
  }
  return { out, fails };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const opt = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : null; };
  const MEASURE = argv.includes('--measure');
  const { out, fails } = await runUpgrade({ assets: opt('--assets'), shots: opt('--shots') ? resolve(opt('--shots')) : null, before: argv.includes('--before') });
  console.log(JSON.stringify(out, (k, v) => (k === 'storage' && Array.isArray(v) ? v.map((r) => `${r.kind}:${r.bytes}`) : v), 1));
  if (opt('--json')) writeFileSync(resolve(opt('--json')), JSON.stringify({ ...out, fails }, null, 1));
  if (fails.length) { console.log(`\n${fails.length} finding(s):`); for (const f of fails) console.log('  ' + f); }
  console.log(fails.length ? (MEASURE || argv.includes('--before') ? 'MEASURED (limits not enforced)' : 'FAIL') : 'PASS');
  process.exit(fails.length && !MEASURE && !argv.includes('--before') ? 1 : 0);
}
