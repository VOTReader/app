/**
 * e2e-contrast — is every screen readable in BOTH themes? (LIGHT1, 2026-11-11)
 *
 *   npm run e2e:contrast                         # dark + light, every stop; exit 1 on any failure
 *   node tools/e2e-contrast.mjs --theme light    # one theme
 *   node tools/e2e-contrast.mjs --only letter,sel-sheet --shots DIR --json out.json
 *
 * Serves its own tree (serveOwnTree), walks a fresh profile at phone size (412x915) through the
 * screen families once per theme (the theme rides vot-state, as a reader's setting does), and at each
 * stop measures what a reader sees:
 *   text         every element with its own text: its colour, faded by every ancestor's opacity, over
 *                the background really painted under it. The background is the stack under the text's
 *                first glyph box (document.elementsFromPoint, so a translucent sheet over a scrim over
 *                the page composes as painted, not just its ancestors). Where an image, a gradient or a
 *                canvas shows through, the text is hidden, the viewport is shot, and the ratio is taken
 *                against the real pixels under its box (10th-percentile worst pixel).
 *                4.5:1, or 3:1 for large text (24px, or 18.66px bold).
 *   icons        svg glyphs up to 48px: stroke (or fill) against what is under them, 3:1.
 *   placeholders an empty field's ::placeholder, 4.5:1.
 *   marks        underline / squiggle highlight lines (text-decoration-color) against the page, 3:1.
 *   literal      light theme only: an element whose text colour or fill does not change when body.light is
 *                taken off and put back, and that is drawn in dark-theme colours (light ink, a near-black
 *                fill). That is a colour written as a literal instead of a theme token.
 *   meta         the theme-color meta matches the page in both themes.
 * Text under a scrim, covered, clipped or disabled (WCAG 1.4.3 exempts inactive controls) is skipped.
 * A stop that could not be reached FAILS: a walk that never reached a screen has measured nothing there.
 * EXCEPTIONS below are the sites left on purpose, each with its reason; they print, they do not fail.
 */
import { resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { serveOwnTree } from './e2e-read-serve.mjs';
import { throughFirstRun, declineTourOffer } from './first-run.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const THEMES = arg('--theme', 'both') === 'both' ? ['dark', 'light'] : [arg('--theme')];
const SHOTS = arg('--shots', null);
const OUT = arg('--json', null);
const ONLY = arg('--only', null) ? new Set(arg('--only').split(',')) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

/* Left on purpose: [stop regex, selector regex, reason, kinds it covers (default: all)]. */
const EXCEPTIONS = [
  [/^web/, /^(canvas|div\.sw-(stage|canvas))/, 'Scripture Web draws its scene on a black canvas in both themes by design (sw-chrome-light)'],
  [/^web/, /sw-/, 'Scripture Web chrome floats over the black canvas and keeps the dark ink in both themes (sw-chrome-light.test.js)', ['light ink', 'dark fill']],
  [/^web-guide/, /^span > b$/, 'the How-to-read card is Scripture Web chrome over the black canvas: light ink in both themes, like the sw- chrome above', ['light ink']],
  [/^garden-page/, /./, 'the Garden viewer is a dark room in both themes (photographs on black); its own tokens are set dark (.garden-fullscreen)', ['light ink', 'dark fill']],
];
const excepted = (stop, sel, kind) => EXCEPTIONS.find(([s, e, , k]) => s.test(stop) && e.test(sel) && (!k || k.includes(kind)));

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { server, url: BASE } = await serveOwnTree();
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--renderer-process-limit=2', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });

/* ── in-page measurement ── */
function measureInPage(isLight) {
  const parse = (s) => { const m = s && s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const over = (top, under) => {
    const a = top.a + under.a * (1 - top.a);
    if (a <= 0) return { r: 0, g: 0, b: 0, a: 0 };
    const mix = (k) => (top[k] * top.a + under[k] * under.a * (1 - top.a)) / a;
    return { r: mix('r'), g: mix('g'), b: mix('b'), a };
  };
  const rgb = (c) => `rgb(${Math.round(c.r)},${Math.round(c.g)},${Math.round(c.b)})`;
  const W = innerWidth, H = innerHeight;
  const opa = (el) => { let o = 1; for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity); return o; };
  const selOf = (el) => {
    const cn = typeof el.className === 'string' ? el.className : (el.className && el.className.baseVal) || '';
    const own = el.tagName.toLowerCase() + (cn.trim() ? '.' + cn.trim().split(/\s+/).slice(0, 2).join('.') : '');
    const p = el.parentElement; const pc = p && typeof p.className === 'string' && p.className.trim() ? '.' + p.className.trim().split(/\s+/)[0] : '';
    return (p ? p.tagName.toLowerCase() + pc + ' > ' : '') + own;
  };
  // What is painted under point (x,y) beneath el: null when el is not there (clipped, hidden) or is covered.
  const under = (el, x, y) => {
    if (x < 0 || y < 0 || x >= W || y >= H) return null;
    const st = document.elementsFromPoint(x, y);
    let i = st.indexOf(el);
    if (i < 0) return null;
    // above el: anything painting over it (a scrim, a sheet) means it is not meant to be read now
    let cover = { r: 0, g: 0, b: 0, a: 0 };
    for (const n of st.slice(0, i)) {
      if (n.contains(el)) continue;
      if (/^(IMG|CANVAS|VIDEO)$/.test(n.tagName)) return null;
      const c = parse(getComputedStyle(n).backgroundColor);
      if (c && c.a > 0) cover = over(cover, { ...c, a: c.a * opa(n) });
    }
    if (cover.a > 0.25) return null;
    let s = { r: 0, g: 0, b: 0, a: 0 }; let complex = false;
    for (const n of st.slice(i)) {
      const cs = getComputedStyle(n);
      if (/^(IMG|CANVAS|VIDEO)$/.test(n.tagName) || (cs.backgroundImage && cs.backgroundImage !== 'none' && !/^url\(.*\.svg/.test(cs.backgroundImage))) { complex = true; break; }
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) s = over(s, { ...c, a: c.a * opa(n) });
      if (s.a >= 0.995) break;
    }
    if (!complex && s.a < 0.995) s = over(s, { r: 255, g: 255, b: 255, a: 1 });
    return { bg: { ...s, a: 1 }, complex };
  };
  const hasText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const firstBox = (el) => {
    for (const n of el.childNodes) {
      if (n.nodeType !== 3 || !n.textContent.trim()) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      const b = [...r.getClientRects()].find((q) => q.width > 1 && q.height > 1 && q.bottom > 0 && q.top < H && q.right > 0 && q.left < W);
      if (b) return b;
    }
    return null;
  };
  const items = []; let uid = 0;
  const push = (el, kind, fgc, box, need, extra) => {
    const x = Math.min(W - 1, Math.max(0, box.left + Math.min(box.width / 2, 6))), y = Math.min(H - 1, Math.max(0, box.top + box.height / 2));
    const u = under(el, x, y); if (!u) return;
    const fg = { ...fgc, a: fgc.a * opa(el) }; if (fg.a < 0.02) return;
    const it = { kind, sel: selOf(el), text: (extra && extra.text) || '', need, fg: rgb(fg), fga: Math.round(fg.a * 100) / 100 };
    if (u.complex) { el.setAttribute('data-ctx', String(++uid)); it.ctx = uid; it.box = [box.left, box.top, box.width, box.height]; it.fgc = fg; }
    else { const f = over(fg, u.bg); it.bg = rgb(u.bg); it.ratio = Math.round(ratio(f, u.bg) * 100) / 100; }
    items.push(it);
  };
  for (const el of document.querySelectorAll('body *')) {
    if (el.closest(':disabled, [aria-disabled="true"], [inert], .is-locked')) continue;   // inactive: WCAG 1.4.3 exempts it (a locked study card fades on purpose)
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (el.tagName === 'svg' || el instanceof SVGSVGElement) {
      const r = el.getBoundingClientRect();
      if (r.width < 10 || r.width > 48 || r.height > 48 || r.bottom <= 0 || r.top >= H) continue;
      const sh = el.querySelector('path,circle,rect,line,polyline,polygon,ellipse') || el;
      const scs = getComputedStyle(sh);
      const c = parse(scs.stroke !== 'none' && parseFloat(scs.strokeWidth) > 0 ? scs.stroke : scs.fill);
      if (c && c.a > 0) push(el, 'icon', c, r, 3);
      continue;
    }
    if ((el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') && el.placeholder && !el.value) {
      const c = parse(getComputedStyle(el, '::placeholder').color); const r = el.getBoundingClientRect();
      if (c && r.width > 0) push(el, 'placeholder', c, { left: r.left + 12, top: r.top, width: r.width - 24, height: r.height }, 4.5, { text: el.placeholder.slice(0, 28) });
    }
    if (/hl-(underline|squiggle)/.test(typeof el.className === 'string' ? el.className : '')) {
      const c = parse(cs.textDecorationColor); const b = firstBox(el);
      if (c && b) push(el, 'mark-line', c, b, 3, { text: el.textContent.trim().slice(0, 28) });
    }
    if (!hasText(el)) continue;
    const b = firstBox(el); if (!b) continue;
    const fg = parse(cs.webkitTextFillColor && cs.webkitTextFillColor !== cs.color ? cs.webkitTextFillColor : cs.color); if (!fg) continue;
    if (cs.backgroundClip === 'text' || cs.webkitBackgroundClip === 'text') continue;
    const size = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight, 10) >= 700;
    const large = size >= 24 || (bold && size >= 18.66);
    const glyph = /^[^\p{L}\p{N}]$/u.test(el.textContent.trim());   // a lone › − ✕: a control's graphic, 3:1 (WCAG 1.4.11)
    push(el, glyph ? 'glyph' : 'text', fg, b, large || glyph ? 3 : 4.5, { text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 28) });
  }
  // literal colours: what does not move when the theme does (light runs only)
  const literal = [];
  if (isLight) {
    const watch = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= H || r.right <= 0 || r.left >= W) continue;
      const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || opa(el) < 0.05) continue;
      const t = hasText(el) && firstBox(el) ? cs.color : null;
      const bgc = parse(cs.backgroundColor);
      const fill = bgc && bgc.a > 0.5 && r.width * r.height > 300 ? cs.backgroundColor : null;
      if (t || fill) watch.push([el, t, fill]);
    }
    document.body.classList.remove('light');
    const after = watch.map(([el]) => { const cs = getComputedStyle(el); return [cs.color, cs.backgroundColor]; });
    document.body.classList.add('light');
    watch.forEach(([el, t, fill], k) => {
      if (/^(IMG|CANVAS|VIDEO)$/.test(el.tagName)) return;
      if (t && after[k][0] === t) { const c = parse(t); if (c && c.a > 0.5 && lum(c) > 0.45) literal.push({ kind: 'light ink', sel: selOf(el), value: t, text: el.textContent.trim().slice(0, 28) }); }
      if (fill && after[k][1] === fill) { const c = parse(fill); if (c && lum(c) < 0.06) literal.push({ kind: 'dark fill', sel: selOf(el), value: fill, text: el.textContent.trim().slice(0, 28) }); }
    });
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  const page = parse(getComputedStyle(document.body).backgroundColor);
  const probe = document.createElement('i'); probe.style.color = meta ? meta.content : ''; document.body.appendChild(probe);
  const mc = parse(getComputedStyle(probe).color); probe.remove();
  const metaOk = !!(mc && page && Math.abs(lum(mc) - lum(page)) < 0.08);
  return { items, literal, meta: { ok: metaOk, value: meta && meta.content, page: page && rgb(page) }, light: document.body.classList.contains('light') };
}

/* pixel sampling for text over images / gradients / canvas */
async function sampleComplex(page, items) {
  const cx = items.filter((i) => i.ctx);
  if (!cx.length) return;
  await page.evaluate(() => { const s = document.createElement('style'); s.id = 'ctx-hide'; s.textContent = '[data-ctx]{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;text-decoration-color:transparent!important}svg[data-ctx]{visibility:hidden!important}'; document.head.appendChild(s); });
  await sleep(60);
  const png = await page.screenshot({ encoding: 'base64' });
  const res = await page.evaluate(async (png, cx) => {
    document.getElementById('ctx-hide').remove();
    for (const e of document.querySelectorAll('[data-ctx]')) e.removeAttribute('data-ctx');
    const blob = await (await fetch('data:image/png;base64,' + png)).blob();
    const bm = await createImageBitmap(blob); const cv = new OffscreenCanvas(bm.width, bm.height); const g = cv.getContext('2d'); g.drawImage(bm, 0, 0);
    const k = bm.width / innerWidth;
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    return cx.map((it) => {
      const [x, y, w, h] = it.box; const rs = [];
      const d = g.getImageData(Math.max(0, Math.floor(x * k)), Math.max(0, Math.floor(y * k)), Math.max(1, Math.ceil(w * k)), Math.max(1, Math.ceil(h * k)));
      const nx = Math.min(24, d.width), ny = Math.min(8, d.height); let sum = { r: 0, g: 0, b: 0 }; let n = 0;
      for (let a = 0; a < nx; a++) for (let b = 0; b < ny; b++) {
        const px = Math.floor((a + 0.5) * d.width / nx), py = Math.floor((b + 0.5) * d.height / ny); const o = (py * d.width + px) * 4;
        const bg = { r: d.data[o], g: d.data[o + 1], b: d.data[o + 2] }; const f = it.fgc;
        const fg = { r: f.r * f.a + bg.r * (1 - f.a), g: f.g * f.a + bg.g * (1 - f.a), b: f.b * f.a + bg.b * (1 - f.a) };
        const la = lum(fg), lb = lum(bg); rs.push((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05));
        sum = { r: sum.r + bg.r, g: sum.g + bg.g, b: sum.b + bg.b }; n++;
      }
      rs.sort((p, q) => p - q);
      return { ratio: Math.round(rs[Math.floor(rs.length * 0.1)] * 100) / 100, bg: `~rgb(${Math.round(sum.r / n)},${Math.round(sum.g / n)},${Math.round(sum.b / n)}) pixels` };
    });
  }, png, cx.map((i) => ({ box: i.box, fgc: i.fgc })));
  cx.forEach((it, k) => { it.ratio = res[k].ratio; it.bg = res[k].bg; delete it.fgc; delete it.box; delete it.ctx; });
}

/* ── driving ── */
async function runTheme(theme) {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e.message || e).slice(0, 160)));
  await page.setViewport({ width: 412, height: 915, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await page.setBypassCSP(true);   // the pixel sampler decodes its own screenshot from a data: URL
  await page.setRequestInterception(true);
  page.on('request', (r) => { if (/votreader-assets|audio\.votreader|\.mp3(\?|$)|cloudflareinsights/.test(r.url())) r.respond({ status: 404, body: '' }); else r.continue(); });
  await page.evaluateOnNewDocument((theme) => { try { if (!localStorage.getItem('vot-state')) localStorage.setItem('vot-state', JSON.stringify({ theme })); } catch (_e) { /* fresh partition */ } }, theme);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#root') && document.querySelector('#root').children.length > 0, { timeout: 30000 });
  await sleep(1500);

  const tap = async (src, root = '') => {
    const r = await page.evaluate((src, root) => {
      const re = new RegExp(src, 'i');
      const els = [...document.querySelectorAll(`${root} :is(button,[role="button"],a,.ui-row,.ui-row-press,.root-row,.tabbar-tab,[role="tab"],[role="switch"])`)].filter((e) => { const q = e.getBoundingClientRect(); return q.width > 0 && q.height > 0; });
      const lab = (e) => (e.textContent || '').replace(/\s+/g, ' ').trim();
      const el = els.find((e) => re.test(lab(e))) || els.find((e) => re.test(e.getAttribute('aria-label') || ''));
      if (!el) return 'NOT FOUND ' + src + ' among: ' + els.slice(0, 30).map((e) => (e.getAttribute('aria-label') || lab(e)).slice(0, 24)).join(' | ');
      el.scrollIntoView({ block: 'center' }); el.click(); return null;
    }, src, root);
    if (r) throw new Error(r);
    await sleep(900);
  };
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  const esc = async (n = 1) => { for (let i = 0; i < n; i++) { await page.keyboard.press('Escape'); await sleep(350); } };
  const top = () => ev(() => { const s = document.querySelector('.screen-scroll'); if (s) s.scrollTop = 0; });
  const tab = async (l) => {
    await esc(2);
    for (let i = 0; i < 4 && !(await ev(() => [...document.querySelectorAll('.tabbar-tab')].some((b) => b.getBoundingClientRect().width > 0))); i++) {
      await ev(() => { const b = [...document.querySelectorAll('button')].find((x) => /^(go back|back)/i.test((x.getAttribute('aria-label') || '').trim()) && x.getBoundingClientRect().width > 0); if (b) b.click(); else history.back(); }); await sleep(900);
    }
    await ev((l) => { const b = [...document.querySelectorAll('.tabbar-tab')].find((x) => x.textContent.trim().startsWith(l)); if (b) b.click(); }, l); await sleep(900); await ev((l) => { const b = [...document.querySelectorAll('.tabbar-tab')].find((x) => x.textContent.trim().startsWith(l)); if (b) b.click(); }, l); await sleep(700); await top(); await sleep(200); };
  const typeIn = async (sel, text) => { await ev((sel) => { const e = document.querySelector(sel); if (e) e.focus(); }, sel); await page.keyboard.type(text, { delay: 20 }); await sleep(900); };

  const results = [];
  const stop = async (name) => {
    if (ONLY && !ONLY.has(name)) return;
    await sleep(500);
    const isLight = theme === 'light';
    await ev(() => { const s = document.createElement('style'); s.id = 'ctx-pe'; s.textContent = '*{pointer-events:auto!important;transition:none!important;animation-play-state:paused!important}'; document.head.appendChild(s); });
    const m = await page.evaluate(measureInPage, isLight);
    await sampleComplex(page, m.items);
    await ev(() => { const s = document.getElementById('ctx-pe'); if (s) s.remove(); });
    if (SHOTS) await page.screenshot({ path: resolve(SHOTS, `${theme}-${name}.png`) });
    const fails = m.items.filter((i) => i.ratio < i.need);
    const res = { stop: name, theme, measured: m.items.length, fails: [], excepted: [], literal: [], meta: m.meta, themeOk: m.light === isLight };
    for (const f of fails) (excepted(name, f.sel, f.kind) ? res.excepted : res.fails).push(f);
    for (const l of m.literal) (excepted(name, l.sel, l.kind) ? res.excepted : res.literal).push(l);
    results.push(res);
    const worst = res.fails.slice().sort((a, b) => a.ratio - b.ratio);
    console.log(`${theme.padEnd(5)} ${name.padEnd(18)} measured=${String(res.measured).padStart(4)} fail=${res.fails.length} literal=${res.literal.length}${res.excepted.length ? ` excepted=${res.excepted.length}` : ''}${m.meta.ok ? '' : ` META(${m.meta.value} vs ${m.meta.page})`}${res.themeOk ? '' : ' THEME-NOT-APPLIED'}`);
    const seen = new Set();
    for (const f of worst) { const k = f.kind + f.sel + f.fg + f.bg; if (seen.has(k)) continue; seen.add(k); if (seen.size > 8) break; console.log(`    ${f.kind.padEnd(11)} ${f.ratio.toFixed(2)}<${f.need} ${f.sel.slice(0, 70)} fg ${f.fg}${f.fga < 1 ? '@' + f.fga : ''} on ${f.bg} "${f.text}"`); }
    const ls = new Set();
    for (const l of res.literal) { const k = l.kind + l.sel + l.value; if (ls.has(k)) continue; ls.add(k); if (ls.size > 5) break; console.log(`    literal    ${l.kind} ${l.value} ${l.sel.slice(0, 70)} "${l.text}"`); }
  };
  const step = async (name, fn) => {
    try { await fn(); } catch (e) { results.push({ stop: name, theme, unreached: String(e.message || e).slice(0, 400) }); console.log(`${theme.padEnd(5)} ${name.padEnd(18)} UNREACHED ${String(e.message || e).slice(0, 400)}`); await esc(3); }
  };
  const want = (...names) => !ONLY || names.some((n) => ONLY.has(n));

  // first run and the tour
  await step('firstrun', async () => { await stop('firstrun-1'); await tap('^continue$'); await stop('firstrun-2'); });
  await throughFirstRun(page).catch((e) => results.push({ stop: 'first-run', theme, unreached: e.message }));
  await sleep(800);
  if (want('tour-offer', 'tour')) await step('tour', async () => {
    await tab('Read');
    await ev(() => { const s = document.querySelector('.screen-scroll'); if (s) s.scrollTop = s.scrollHeight; }); await sleep(600);
    await stop('tour-offer');
    await tap('^show me around'); await sleep(1200); await stop('tour');
    // the stops after the first card (LIGHT2): the primary button walks on; a stop that waits on its target is pressed for it
    const primary = () => ev(() => { const b = document.querySelector('.tour-card .tour-btn.primary'); if (!b) return null; const t = b.textContent.trim(); b.click(); return t; });
    for (let k = 2; k <= 16; k++) {
      const before = await ev(() => { const e = document.querySelector('.tour-card'); return e ? e.textContent.slice(0, 80) : null; });
      if (!before) break;
      const pressed = await primary(); await sleep(1200);
      let after = await ev(() => { const e = document.querySelector('.tour-card'); return e ? e.textContent.slice(0, 80) : null; });
      if (after && after === before) { await ev(() => { try { window.TourController && window.TourController.targetPressed(); } catch (_e) { /* */ } }); await sleep(1200); after = await ev(() => { const e = document.querySelector('.tour-card'); return e ? e.textContent.slice(0, 80) : null; }); }
      if (!after) break;
      await stop(`tour-${k}`);
      if (pressed && /^(done|finish|end)/i.test(pressed)) break;
    }
    await esc(2); await ev(() => { const b = [...document.querySelectorAll('button')].find((x) => /^(end|stop|close|skip|done)/i.test((x.getAttribute('aria-label') || x.textContent).trim())); if (b) b.click(); });
  });
  await declineTourOffer(page); await sleep(300);

  // the three roots
  await step('roots', async () => { await tab('Read'); await stop('read-root'); await tab('Listen'); await stop('listen-root'); await tab('Library'); await stop('library-root'); });

  // a letter, its menu, selection, note, highlight marks in every colour and style, tabs
  await step('letter', async () => {
    await tab('Read'); await tap('volumes of truth'); await stop('volumes');
    await tap('^volume two'); await stop('volume-index');
    await tap('the seventh day'); await sleep(1500); await top(); await stop('letter');
    await tap('^more$'); await stop('reader-menu'); await esc();
    await ev(() => {
      const ps = [...document.querySelectorAll('p.letter-para')].filter((p) => p.offsetParent && p.textContent.trim().length > 120).slice(0, 4);
      const cols = ['yellow', 'green', 'pink', 'red', 'orange', 'blue', 'purple', 'teal', 'brown', 'gray'];
      ps.forEach((p, k) => {
        const style = ['', 'hl-underline', 'hl-squiggle', ''][k];
        const words = p.textContent.trim().split(/\s+/);
        p.setAttribute('data-ctx-orig', p.innerHTML);
        p.innerHTML = cols.map((c, j) => `<mark class="hl-mark hl-${c} ${style}">${words[j] || 'word'}</mark>`).join(' ') + ' ' + words.slice(10).join(' ');
      });
      if (ps[0]) ps[0].scrollIntoView({ block: 'start' });
    });
    await stop('letter-marks');
    await ev(() => { for (const p of document.querySelectorAll('[data-ctx-orig]')) { p.innerHTML = p.getAttribute('data-ctx-orig'); p.removeAttribute('data-ctx-orig'); } });
    await top();
    await ev(() => {
      const p = [...document.querySelectorAll('p.letter-para')].find((q) => q.offsetParent && q.textContent.trim().length > 80); if (!p) return;
      const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); let tn = w.nextNode(); while (tn && tn.textContent.trim().length < 20) tn = w.nextNode(); if (!tn) return;
      const r = document.createRange(); const lead = tn.textContent.length - tn.textContent.trimStart().length; r.setStart(tn, lead); r.setEnd(tn, Math.min(lead + 40, tn.length));
      tn.parentElement.scrollIntoView({ block: 'center' }); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new Event('selectionchange'));
      const b = r.getBoundingClientRect(); const o = { bubbles: true, cancelable: true, clientX: b.x + 20, clientY: b.y + 8 };
      p.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'touch', isPrimary: true, ...o })); p.dispatchEvent(new MouseEvent('mouseup', o));
    });
    await sleep(1200); await stop('sel-sheet');
    await tap('^note$'); await sleep(600); await stop('note-sheet'); await esc(2);
    await ev(() => { if (window.__hideSelectionToolbar) window.__hideSelectionToolbar(); getSelection().removeAllRanges(); });
    await tap('^open tabs'); await stop('tabs-sheet'); await esc();
  });

  // the Bible, a study
  await step('bible', async () => {
    await tab('Read'); await tap('^(the )?(holy bible|bible|scriptures)'); await stop('bible-landing');
    await tap('^the law'); await tap('^genesis'); await sleep(600); await stop('bible-book');
    await ev(() => { const b = [...document.querySelectorAll('.screen-scroll button, .screen-scroll [role="button"]')].find((x) => /^(chapter )?1$/i.test((x.getAttribute('aria-label') || x.textContent).trim())); if (!b) throw new Error('no chapter 1'); b.click(); }); await sleep(1500); await top(); await stop('bible-chapter');
  });
  await step('study', async () => { await tab('Read'); await tap('^(bible )?stud(y|ies)'); await stop('studies'); await ev(() => { const r = document.querySelectorAll('.ui-row-press, .ui-row'); if (r[0]) r[0].click(); }); await sleep(1500); await top(); await stop('study'); });

  // Search, Answers, Scripture Web, Reading plans
  await step('search', async () => { await tab('Read'); await tap('^search'); await stop('search-empty'); await typeIn('input', 'faith'); await page.keyboard.press('Enter'); await sleep(1500); await stop('search-results'); });
  await step('answers', async () => { await tab('Read'); await tap('^topics & doctrines'); await sleep(1500); await stop('answers'); await ev(() => { const s = document.querySelector('.screen-scroll'); if (s) s.scrollTop = 1250; }); await stop('answers-2'); });
  await step('web', async () => {
    await tab('Read'); await ev(() => window.__openScriptureWeb({ book: 'genesis' })); await sleep(3000); await stop('web-guide');
    await ev(() => { const e = [...document.querySelectorAll('.sw-guide-close')].find((b) => /^got it$/i.test(b.textContent.trim())); if (e) e.click(); }); await sleep(800);
    await ev(() => { const e = [...document.querySelectorAll('.sw-whole')].find((b) => /^whole web$/i.test(b.textContent.trim())); if (e) e.click(); }); await sleep(1500); await stop('web-main');
    await ev(() => { const e = document.querySelector('.sw-goto-btn'); if (e) e.click(); }); await sleep(800); await stop('web-goto');
    // LIGHT2: with SwiftShader WebGL the web draws, so its sheets and cards open too (geometry: the web lies a quarter turn clockwise at 412x915)
    const swClick = (re) => ev((re) => { const b = [...document.querySelectorAll('button, [role="button"]')].find((x) => x.getBoundingClientRect().width > 0 && new RegExp(re, 'i').test((x.getAttribute('aria-label') || x.textContent).replace(/\s+/g, ' ').trim())); if (b) b.click(); return !!b; }, re);
    if (await ev(() => { const i = [...document.querySelectorAll('input')].find((x) => x.getBoundingClientRect().width > 0); if (i) i.focus(); return !!i; })) {
      await page.keyboard.type('John 3', { delay: 20 }); await page.keyboard.press('Enter'); await sleep(1500); await page.keyboard.press('Escape'); await sleep(900); await stop('web-focus');
      await page.mouse.click(170, 330); await sleep(1200); await stop('web-chooser');
      if (await ev(() => { const r = document.querySelector('.sw-choice-list button, .sw-choice-list [role="button"], .sw-choice-list > *'); if (r) r.click(); return !!r; })) { await sleep(1200); await stop('web-card'); }
    }
    await esc(2);
    if (await swClick('^filter')) { await sleep(900); await stop('web-filters'); await esc(); }
    if (await swClick('^list')) { await sleep(900); await stop('web-list'); await esc(); }
    if (await swClick('^(more|menu|options|web menu|⋮)')) { await sleep(900); await stop('web-menu'); await esc(); }
    await esc(2);
    await ev(() => window.__screenBack && window.__screenBack()); await sleep(800);
  });
  await step('plans', async () => { await tab('Library'); await tap('^reading plans'); await sleep(800); await stop('plans'); });

  // Settings, its sheets, About, a dialog
  await step('settings', async () => {
    await tab('Read'); await tap('^quick settings$'); await tap('^settings$'); await stop('settings');   // GEAR1: the gear opens Quick settings
    await tap('^appearance'); await stop('settings-look'); await tap('^reading font'); await stop('settings-font'); await esc(); await tap('^back to settings'); await top();
    await tap('^your data'); await stop('settings-data'); await tap('^back to settings'); await top();
    await ev(() => { const s = document.querySelector('.screen-scroll'); if (s) s.scrollTop = s.scrollHeight; }); await sleep(400);
    await tap('^about votreader'); await stop('about');
  });
  await step('dialog', async () => {
    await tab('Read'); await tap('^quick settings$'); await tap('^settings$'); await tap('^your data'); await tap('^(erase|delete|wipe|clear|reset)'); await sleep(600); await stop('dialog'); await esc(2);
  });

  // the Garden
  await step('garden', async () => { await tab('Read'); await tap('volumes of truth'); await tap('a return to the garden'); await stop('garden-gate'); await tap('^open the garden'); await sleep(2000); await stop('garden-page'); await esc(2); await ev(() => window.__screenBack && window.__screenBack()); });

  // toasts
  await step('toast', async () => { await tab('Read'); await ev(() => window.showToast && window.showToast({ id: 'vot-toast-ctx', className: 'vot-toast', text: 'Saved to your notes', durationMs: 20000 })); await sleep(700); await stop('toast'); });

  // the players
  await step('player', async () => {
    await tab('Listen'); await tap('^the volumes of truth'); await tap('^volume two'); await stop('listen-volume');
    await ev(() => { const b = document.querySelector('.ui-row-lead.is-play'); if (b) b.click(); }); await sleep(2500);
    await tab('Read'); await stop('mini-player');
    await ev(() => { const b = document.querySelector('.audio-bar-summary'); if (b) b.click(); }); await sleep(1500); await stop('player');
    await ev(() => { const b = [...document.querySelectorAll('.np-tool')].find((x) => /speed/i.test(x.textContent)); if (b) b.click(); }); await sleep(900); await stop('player-speed');
    await esc(3);
  });

  /* ── LIGHT2: real data in the profile, then the screens that only show with it ── */
  const click = (sel, t, nth = 0) => ev((sel, t, nth) => {
    const els = [...document.querySelectorAll(sel)].filter((x) => x.getBoundingClientRect().width > 0 && (!t || new RegExp(t, 'i').test((x.getAttribute('aria-label') || x.textContent).replace(/\s+/g, ' ').trim())));
    const b = els[nth]; if (!b) return false; b.scrollIntoView({ block: 'center' }); b.click(); return true;
  }, sel, t, nth);
  const must = async (p, what) => { if (!(await p)) throw new Error('no ' + what); await sleep(900); };
  const scrollTo = (y) => ev((y) => { const s = [...document.querySelectorAll('.screen-scroll')].filter((e) => e.getBoundingClientRect().width > 0).pop(); if (s) s.scrollTop = y === 'end' ? s.scrollHeight : y; }, y);
  const select = (i, k, n) => ev((i, k, n) => {
    const p = [...document.querySelectorAll('p.letter-para')].filter((q) => q.offsetParent && q.textContent.trim().length > 80)[i]; if (!p) return false;
    const w = document.createTreeWalker(p, NodeFilter.SHOW_TEXT); let tn = w.nextNode(); let seen = 0;
    while (tn) { if (tn.textContent.trim().length >= 20) { if (seen === k) break; seen++; } tn = w.nextNode(); }
    if (!tn) return false;
    const r = document.createRange(); const lead = tn.textContent.length - tn.textContent.trimStart().length; r.setStart(tn, lead); r.setEnd(tn, Math.min(lead + n, tn.length));
    (tn.parentElement || p).scrollIntoView({ block: 'center' }); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.dispatchEvent(new Event('selectionchange'));
    const b = r.getBoundingClientRect(); const o = { bubbles: true, cancelable: true, clientX: b.x + 20, clientY: b.y + 8 };
    p.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, pointerType: 'touch', isPrimary: true, ...o })); p.dispatchEvent(new MouseEvent('mouseup', o)); return true;
  }, i, k, n);
  const soft = async (what, fn) => { try { await fn(); } catch (e) { console.log(`${theme.padEnd(5)} seed: ${what} skipped (${String(e.message || e).slice(0, 160)})`); await esc(2); } };

  if (want('lib-notes', 'lib-highlights', 'lib-bookmarks', 'lib-links', 'lib-journal', 'lib-notebooks', 'lib-history', 'lib-progress', 'note-edit', 'journal-view', 'journal-edit', 'journal-insert')) await step('seed', async () => {
    await tab('Read'); await tap('volumes of truth'); await tap('^volume two'); await tap('the seventh day'); await sleep(1500); await top();
    await soft('highlight', async () => { await must(select(0, 0, 34), 'selection'); await sleep(1200); await tap('^yellow highlight'); await sleep(900); });
    await soft('note', async () => {
      await must(select(0, 1, 72), 'selection'); await sleep(1200); await tap('^note$'); await sleep(900);
      await typeIn('textarea', 'Be steadfast. He strengthens the weak.'); await tap('^save$'); await sleep(900);
    });
    await soft('link', async () => {
      await must(select(1, 0, 40), 'selection'); await sleep(1200); await tap('^link$'); await sleep(900); await tap('^browse$'); await tap('^search$');
      await typeIn('input[type="search"], input', 'John 15'); await sleep(2000); await tap('john 15new testament'); await sleep(1500);
      await tap('^select verse 5$'); await tap('^link to john 15'); await sleep(900); await tap('^done$');
    });
    await soft('bookmark', async () => { await ev(() => { if (window.__hideSelectionToolbar) window.__hideSelectionToolbar(); getSelection().removeAllRanges(); }); await tap('^bookmark this chapter'); await sleep(900); await tap('^save bookmark$'); });
    // every colour in every mark style, as rows the Highlights list draws (copies of the real highlight's place)
    await ev(() => {
      const AS = window.AnnotationStore; if (!AS) return;
      const all = AS.all(); const key = Object.keys(all).find((k) => (all[k] || []).some((a) => a.kind === 'highlight')) || Object.keys(all)[0]; if (!key) return;
      const cols = ['yellow', 'green', 'pink', 'red', 'orange', 'blue', 'purple', 'teal', 'brown', 'gray'];
      ['highlight', 'underline', 'squiggle'].forEach((kind, ki) => cols.forEach((color, ci) => {
        if (kind === 'highlight' && color === 'yellow') return;
        const id = `ctx-${kind}-${color}`; const s = 40 + (ki * 10 + ci) * 3;
        AS.add(key, { id, groupId: id, kind, color, start: s, end: s + 2, text: `${color} ${kind}` });
      }));
    });
    // a notebook, a journal entry with a photo and a voice memo
    await ev(async () => {
      try { if (window.NotebookStore) window.NotebookStore.add('Steadfast'); } catch (_e) { /* */ }
      const blocks = [{ type: 'p', text: 'Grace and peace to you from the Lord.' }];
      try {
        const JM = window.JournalMediaStore;
        const cv = document.createElement('canvas'); cv.width = 320; cv.height = 200; const g = cv.getContext('2d');
        const gr = g.createLinearGradient(0, 0, 320, 200); gr.addColorStop(0, '#6a8caf'); gr.addColorStop(1, '#e8d8b0'); g.fillStyle = gr; g.fillRect(0, 0, 320, 200);
        const img = await new Promise((r) => cv.toBlob(r, 'image/png'));
        const pid = await JM.put({ type: 'image', blob: img, mime: 'image/png', width: 320, height: 200 });
        blocks.push({ type: 'image', mediaId: pid });
        const aid = await JM.put({ type: 'audio', blob: new Blob([new Uint8Array(2048)], { type: 'audio/webm' }), mime: 'audio/webm', duration: 12 });
        blocks.push({ type: 'audio', mediaId: aid, duration: 12, samples: null });
      } catch (_e) { blocks.push({ type: 'divider' }); }
      blocks.push({ type: 'quote', text: 'Be steadfast.' });
      if (window.JournalStore) window.JournalStore.add({ title: 'Morning reading', blocks });
    });
    await sleep(800);
  });

  // the Library's lists and each list's row sheet
  const LISTS = [['notes', '^notes'], ['highlights', '^highlights'], ['bookmarks', '^bookmarks'], ['links', '^links'], ['journal', '^journal'], ['history', '^(history|see all)'], ['progress', '^progress']];
  for (const [id, re] of LISTS) {
    if (!want(`lib-${id}`, `lib-${id}-menu`)) continue;
    await step(`lib-${id}`, async () => {
      await tab('Library'); await tap(re); await sleep(900); await top(); await stop(`lib-${id}`);
      if (id === 'progress') { await scrollTo('end'); await stop('lib-progress-2'); return; }
      if (await click('.screen-scroll .ui-row-menu, .screen-scroll [aria-label$="options"], .screen-scroll [aria-label^="More"]')) { await sleep(900); await stop(`lib-${id}-menu`); await esc(); }
      if (id === 'highlights' && await click('[aria-label="Colour"]')) { await sleep(900); await stop('lib-highlights-colour'); await esc(); }
      if (id === 'notes') {   // with a notebook, Notes opens on Notebooks: a notebook, then All notes
        if (await click('.screen-scroll .ui-row-press, .screen-scroll .ui-row-main, .screen-scroll .ui-row', 'steadfast')) { await sleep(900); await top(); await stop('lib-notebook'); await esc(); await sleep(400); }
        if (await click('button, [role="tab"]', '^all notes')) { await sleep(900); await top(); await stop('lib-notes-all'); }
        if (await click('.screen-scroll .ui-row-menu, .screen-scroll [aria-label*="option" i], .screen-scroll [aria-label^="More" i]')) { await sleep(900); await stop('lib-notes-all-menu'); await esc(); }
      }
    });
  }
  // the note editor and the journal: viewer, editor, insert sheet
  await step('editors', async () => {
    await tab('Library'); await tap('^notes'); await sleep(600); await click('button, [role="tab"]', '^all notes'); await sleep(900);
    await must(click('.screen-scroll .ui-row-menu, .screen-scroll [aria-label*="option" i], .screen-scroll [aria-label^="More" i]'), 'a note menu'); await sleep(900);
    await tap('^edit note'); await sleep(1200); await stop('note-edit'); await esc(2);
    await tab('Library'); await tap('^journal'); await tap('^morning reading'); await sleep(1200); await stop('journal-view');
    await tap('^edit$'); await sleep(1200); await stop('journal-edit');
    await tap('^insert$'); await sleep(900); await stop('journal-insert'); await esc();
    await tap('^done$'); await esc(2);
  });

  // a reading plan: preview, started, its schedule, a finished day
  await step('plan', async () => {
    await tab('Library'); await tap('^reading plans'); await tap('^bible in a year'); await sleep(900); await top(); await stop('plan-preview');
    await tap('^(start|begin)'); await sleep(1200); await top(); await stop('plan-page');
    await scrollTo('end'); await stop('plan-page-2'); await top();
    await tap('^whole schedule$'); await sleep(900); await top(); await stop('plan-schedule'); await esc();
    await tap('^(continue|start) reading'); await sleep(1800); await stop('plan-session');
    for (let i = 0; i < 5 && !(await ev(() => [...document.querySelectorAll('button')].some((b) => /^finish day/i.test(b.textContent.trim())))); i++) { await tap('^next'); await sleep(1500); }
    await ev(() => { const e = document.querySelector('.plan-end'); if (e) e.scrollIntoView({ block: 'start' }); }); await sleep(800);
    await tap('^finish day'); await sleep(1200); await stop('plan-daydone'); await tap('^done$');
  });

  // songs, a song page, the song player and its lyrics; Downloads and its pickers
  await step('songs', async () => {
    await tab('Listen'); await tap('^songs of the letters');
    await page.waitForFunction(() => !!document.querySelector('.songs-chips'), { timeout: 30000 }); await sleep(2000); await top(); await stop('songs');
    await must(click('.ui-chip', '^worship'), 'Worship chip'); await sleep(1200); await top();
    await must(click('.songs-row .ui-row-menu', null, 2), 'song menu'); await stop('song-menu');
    await click('.ui-sheet-action', '^(save|keep)'); await sleep(700);
    await must(click('.songs-row .ui-row-menu', null, 2), 'song menu'); await must(click('.ui-sheet-action', '^song page'), 'song page action'); await sleep(1200); await top(); await stop('song-page');
    await ev(() => { const b = document.querySelector('.bar-back, [aria-label^="Back to"]'); if (b) b.click(); }); await sleep(900);
    await must(click('.songs-row .ui-row-main', null, 2), 'song row'); await sleep(2500);
    await tab('Read'); await must(click('.audio-bar-summary'), 'audio bar'); await sleep(1500); await stop('song-player');
    await must(click('.np-tool', '^lyrics'), 'lyrics tool'); await sleep(1500); await stop('song-lyrics'); await esc(3);
  });
  await step('downloads', async () => {
    await tab('Listen'); await tap('^downloads'); await sleep(900); await stop('downloads');
    await must(click('.dl-tab', '^choose'), 'Choose tab'); await sleep(900); await top(); await stop('dl-choose');
    await click('.dl-row-main', '^volume two'); await sleep(500); await click('.dl-box', 'volume two'); await sleep(600); await stop('dl-pick');
    await tap('^voice to download'); await sleep(700); await stop('dl-voice'); await esc();
  });

  // Answers' sheets: more, a command tablet, media, saved, a topic, its share card, on this page
  await step('answers-sheets', async () => {
    await tab('Read'); await tap('^topics & doctrines'); await sleep(1500);
    await must(click('.ans-chip.is-more'), 'more chip'); await stop('ans-more'); await esc();
    if (await click('.ans-tablet', null, 3)) { await stop('ans-cmd'); await esc(); }
    if (await click('.ans-tile-btn', 'chart')) { await sleep(900); await stop('ans-media'); await click('[aria-label="Back to Answers"]'); await sleep(900); }
    if (await click('.ans-tile-btn', 'saved')) { await sleep(900); await stop('ans-saved'); await click('[aria-label="Back to Answers"]'); await sleep(900); }
    await ev(() => { const h = document.querySelector('.ans-hero-c'); if (h) h.closest('.screen-scroll').scrollTop = 0; });
    await tap('the sabbath.$'); await sleep(1200); await stop('ans-topic');
    // the landing has no card door since Answer of the day went (492955f64): a topic's ⋯ menu opens it
    await tap('^more$'); await must(click('button, [role="menuitem"]', '^share as a card$'), 'share card'); await stop('ans-share'); await esc();
    await ev(() => { const h = document.querySelector('.ans-hero'); if (h) h.closest('.screen-scroll').scrollTop = 1800; }); await sleep(600);
    await must(click('.ans-runhead'), 'running head'); await stop('ans-onpage'); await esc(2);
  });

  // every Settings page and its sheets
  await step('settings-all', async () => {
    const back = async () => { await tap('^back to settings'); await top(); };
    await tab('Read'); await tap('^quick settings$'); await tap('^settings$');   // GEAR1: the gear opens Quick settings
    await ev(() => { const i = document.getElementById('settings-find-input'); if (!i) return; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'keep'); i.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(1000); await stop('st-find');
    await ev(() => { const i = document.getElementById('settings-find-input'); if (!i) return; Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ''); i.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(600);
    await tap('^reading'); await stop('st-reading'); await scrollTo('end'); await stop('st-reading-2'); await top();
    await tap('^more$'); await stop('st-restored'); await esc();
    await tap('^previous and next arrows'); await stop('st-arrows'); await esc();
    await tap('^auto-scroll'); await stop('st-auto'); await tap('^back to reading'); await back();
    await tap('^a return to the garden'); await stop('st-garden-quality'); await esc();
    await tap('^listening'); await stop('st-listening'); await back();
    await tap('^buttons and tools'); await stop('st-tools'); await back();
    await tap('^sharing'); await stop('st-sharing'); await back();
    await tap('^your data'); await scrollTo('end'); await stop('st-data-2'); await back();
    await scrollTo('end'); await tap('^about votreader'); await sleep(900);
    await tap('^what.s new'); await sleep(900); await stop('about-new'); await esc();
    await tap('^credits and privacy'); await stop('about-credits');
  });

  // Search with results by section, the Tabs sheet with tabs open
  await step('search-more', async () => {
    await tab('Read'); await tap('^search'); await typeIn('input', 'steadfast'); await page.keyboard.press('Enter'); await sleep(1500); await stop('search-results-2');
    await scrollTo(900); await stop('search-results-3');
  });

  if (errors.length) results.push({ stop: 'page-errors', theme, unreached: errors.slice(0, 3).join(' | ') });
  await ctx.close();
  return results;
}

let all = [];
try { for (const t of THEMES) all = all.concat(await runTheme(t)); } finally { await browser.close(); server.close(); }

const reached = all.filter((r) => !r.unreached);
const unreached = all.filter((r) => r.unreached && r.stop !== 'page-errors');
const fails = reached.reduce((n, r) => n + r.fails.length, 0), lits = reached.reduce((n, r) => n + r.literal.length, 0);
const metaBad = reached.filter((r) => !r.meta.ok || !r.themeOk);
console.log('');
for (const t of THEMES) {
  const rs = reached.filter((r) => r.theme === t);
  console.log(`${t}: ${rs.length} stops, ${rs.reduce((n, r) => n + r.measured, 0)} measured, ${rs.reduce((n, r) => n + r.fails.length, 0)} contrast failures on ${rs.filter((r) => r.fails.length).length} stops, ${rs.reduce((n, r) => n + r.literal.length, 0)} literal colours, ${rs.reduce((n, r) => n + r.excepted.length, 0)} excepted`);
}
for (const u of all.filter((r) => r.unreached)) console.log(`UNREACHED ${u.theme} ${u.stop}: ${u.unreached.slice(0, 200)}`);
if (OUT) { writeFileSync(resolve(OUT), JSON.stringify(all, null, 1) + '\n'); console.log(`wrote ${OUT}`); }
if (fails || lits || unreached.length || metaBad.length) { console.log(`\ne2e-contrast FAILED (${fails} contrast, ${lits} literal, ${unreached.length} unreached, ${metaBad.length} meta/theme)`); process.exit(1); }
console.log('\ne2e-contrast passed');
