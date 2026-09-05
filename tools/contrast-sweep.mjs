/**
 * contrast-sweep — what does one colour token actually measure, on the screens a reader meets?
 * (a11y-ux-2: the light-theme --gold-dim ratio sweep, recorded in HISTORY.)
 *
 *   node tools/contrast-sweep.mjs                              # --gold-dim, light theme
 *   node tools/contrast-sweep.mjs --token --gold-dim --theme dark
 *   node tools/contrast-sweep.mjs --out sweep.json             # every measured element
 *   node tools/contrast-sweep.mjs --min 4.5                    # FAIL when small text sits under it
 *   node tools/contrast-sweep.mjs --shots DIR                  # a screenshot per screen
 *
 * Serves its own tree on an ephemeral port (serveOwnTree), walks the same thirteen screens
 * as e2e-textzoom at 360x800, and on each one finds every rendered element whose computed
 * text colour IS the token's value, then computes its WCAG ratio against the first opaque
 * background behind it (semi-transparent layers blended in order). A ratio is only ever
 * computed from what Chrome resolved, never from a constant someone estimated.
 *
 * Reports per screen: elements, the minimum ratio, how many small-text elements (< 18.66 px,
 * or < 24 px when not bold) sit under 4.5:1 and under 3:1. With --min it exits 1 when any
 * small-text element measures under that ratio, and when the token coloured no rendered text at
 * all (a sweep of nothing is not a pass); without it, it measures and reports.
 */
import { resolve } from 'node:path';
import { writeFileSync, mkdirSync } from 'node:fs';
import puppeteer from 'puppeteer';
import { serveOwnTree } from './e2e-read-serve.mjs';

const argv = process.argv.slice(2);
const arg = (k, d) => (argv.includes(k) ? argv[argv.indexOf(k) + 1] : d);
const TOKEN = arg('--token', '--gold-dim');
const THEME = arg('--theme', 'light');
const OUT = arg('--out', null);
const MIN = argv.includes('--min') ? parseFloat(arg('--min', '4.5')) : null;
const SHOTS = arg('--shots', null);
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

const { server, url: BASE } = await serveOwnTree();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-gpu'] });
const all = [];
let failed = false;
try {
  const ctx = await browser.createBrowserContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.setViewport({ width: 360, height: 800, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await page.setRequestInterception(true);
  page.on('request', (r) => { if (/github\.com\/VOTReader\/votreader-assets|\.mp3(\?|$)/.test(r.url())) r.respond({ status: 404, body: '' }); else r.continue(); });
  // The theme rides the boot shim: index.html reads vot-state.theme before the bundle.
  await page.evaluateOnNewDocument((theme) => { try { localStorage.setItem('vot-state', JSON.stringify({ theme })); } catch (_e) { /* fresh partition */ } }, THEME);
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('#root') && document.querySelector('#root').children.length > 0, { timeout: 30000 });
  await sleep(700);
  const click = async (l) => { await page.evaluate((l) => { const b = [...document.querySelectorAll('button,[role=button]')].find((b) => (b.getAttribute('aria-label') || b.textContent.trim().replace(/\s+/g, ' ')).startsWith(l) && b.getBoundingClientRect().width > 0); if (b) b.click(); }, l); await sleep(700); };

  const measure = (name) => page.evaluate((name, token) => {
    const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(',').map((x) => parseFloat(x)); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
    // The token's own declared value, not a probe's inherited colour: `color: var(--nope)` is invalid
    // and inherits, which would measure the body text and call it the token.
    const declared = getComputedStyle(document.body).getPropertyValue(token).trim();
    const probe = document.createElement('span'); probe.style.color = declared; document.body.appendChild(probe);
    const target = declared ? parse(getComputedStyle(probe).color) : null; probe.remove();
    if (!target) return { screen: name, theme: document.body.classList.contains('light') ? 'light' : 'dark', token, tokenRgb: null, rows: [] };
    const same = (c) => c && Math.abs(c.r - target.r) < 1 && Math.abs(c.g - target.g) < 1 && Math.abs(c.b - target.b) < 1 && c.a > 0.99;
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
    const ratio = (a, b) => { const la = lum(a), lb = lum(b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
    const blend = (top, under) => ({ r: top.r * top.a + under.r * (1 - top.a), g: top.g * top.a + under.g * (1 - top.a), b: top.b * top.a + under.b * (1 - top.a), a: 1 });
    // The background behind an element: walk up, blending every translucent layer, until an
    // opaque one; the html/body ground closes it. Images and gradients are not colours and
    // are skipped, which is the one estimate in here, named.
    const behind = (el) => {
      const layers = [];
      for (let n = el; n; n = n.parentElement) {
        const cs = getComputedStyle(n); const c = parse(cs.backgroundColor);
        if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
      }
      let bg = { r: 255, g: 255, b: 255, a: 1 };
      for (let i = layers.length - 1; i >= 0; i--) bg = layers[i].a >= 1 ? layers[i] : blend(layers[i], bg);
      return bg;
    };
    const hasText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    const rows = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!hasText(el)) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || parseFloat(cs.opacity) === 0) continue;
      const r = el.getBoundingClientRect(); if (r.width <= 0 || r.height <= 0) continue;
      const col = parse(cs.color); if (!same(col)) continue;
      const bg = behind(el);
      const size = parseFloat(cs.fontSize); const bold = parseInt(cs.fontWeight, 10) >= 700;
      const large = size >= 24 || (bold && size >= 18.66);
      const sel = el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
      rows.push({ sel, text: el.textContent.trim().replace(/\s+/g, ' ').slice(0, 28), size: Math.round(size * 10) / 10, bold, large, bg: `rgb(${Math.round(bg.r)},${Math.round(bg.g)},${Math.round(bg.b)})`, ratio: Math.round(ratio(col, bg) * 100) / 100 });
    }
    return { screen: name, theme: document.body.classList.contains('light') ? 'light' : 'dark', token, tokenRgb: `rgb(${target.r},${target.g},${target.b})`, rows };
  }, name, TOKEN);

  const stop = async (name) => {
    await sleep(200);
    const m = await measure(name);
    all.push(m);
    const small = m.rows.filter((r) => !r.large);
    const min = m.rows.length ? Math.min(...m.rows.map((r) => r.ratio)) : null;
    const u45 = small.filter((r) => r.ratio < 4.5).length, u3 = small.filter((r) => r.ratio < 3).length;
    console.log(`${m.theme.padEnd(5)} ${name.padEnd(13)} elements=${String(m.rows.length).padStart(3)} min=${min == null ? '-' : min.toFixed(2)} small<4.5=${u45} small<3=${u3}`);
    if (SHOTS) await page.screenshot({ path: resolve(SHOTS, `${m.theme}-${name}.png`) });
    if (MIN != null && small.some((r) => r.ratio < MIN)) { failed = true; console.log(`FAIL ${name}: ` + small.filter((r) => r.ratio < MIN).slice(0, 4).map((r) => `${r.sel} "${r.text}" ${r.size}px ${r.ratio}:1 on ${r.bg}`).join(' | ')); }
  };

  await stop('about');
  await click('Continue'); await click('Begin Reading');
  await stop('home');
  await click('Prophetic Letters'); await stop('volumes');
  await click('Volume One'); await stop('volume-index');
  await page.evaluate(() => { const b = [...document.querySelectorAll('.chapter-card-btn')][1]; b && b.click(); }); await sleep(900);
  await stop('letter');
  await click('Home'); await click('The Holy Bible'); await stop('scriptures');
  await click('Gospels'); await stop('gospels');
  await page.evaluate(() => { const b = [...document.querySelectorAll('.chapter-card-btn')][0]; b && b.click(); }); await sleep(600);
  await page.evaluate(() => { const b = [...document.querySelectorAll('.chapter-card-btn')][0]; b && b.click(); }); await sleep(900);
  await stop('bible-chapter');
  await click('Home'); await click('Personal Study'); await stop('library');
  await page.evaluate(() => { const t = [...document.querySelectorAll('.library-tile')].find((t) => /My Notes/.test(t.textContent)); t && t.click(); }); await sleep(700);
  await stop('notes-index');
  await click('Back'); await page.evaluate(() => { const t = [...document.querySelectorAll('.library-tile')].find((t) => /My Journal/.test(t.textContent)); t && t.click(); }); await sleep(700);
  await stop('journal');
  await click('Home'); await click('App Configuration'); await sleep(300);
  await page.evaluate(() => { for (const h of document.querySelectorAll('.settings-group-head')) if (/Appearance|Your Data/.test(h.textContent)) h.click(); }); await sleep(500);
  await stop('settings');
  await click('Search'); await stop('search');
  if (errors.length) { failed = true; console.log(`FAIL page errors: ${errors.slice(0, 3).join(' | ')}`); }
  await ctx.close();
} finally { await browser.close(); server.close(); }

const rows = all.flatMap((m) => m.rows.map((r) => ({ screen: m.screen, ...r })));
const small = rows.filter((r) => !r.large);
const byKey = new Map();
for (const r of small) { const k = `${r.sel}|${r.size}|${r.bg}`; const cur = byKey.get(k); if (!cur || r.ratio < cur.ratio) byKey.set(k, r); }
const worst = [...byKey.values()].sort((a, b) => a.ratio - b.ratio);
console.log(`\n${THEME} ${TOKEN} = ${all.find((m) => m.tokenRgb)?.tokenRgb || 'unresolved'}: ${rows.length} text elements on ${all.length} screens; small text ${small.length}, under 4.5:1 ${small.filter((r) => r.ratio < 4.5).length}, under 3:1 ${small.filter((r) => r.ratio < 3).length}; distinct small-text sites ${byKey.size}`);
console.log('worst distinct sites (selector, px, ratio, background, screen):');
for (const r of worst.slice(0, 12)) console.log(`  ${r.sel.padEnd(40)} ${String(r.size).padStart(5)}px ${r.ratio.toFixed(2)}:1 on ${r.bg} ${r.screen} "${r.text}"`);
if (OUT) { writeFileSync(resolve(OUT), JSON.stringify({ token: TOKEN, theme: THEME, screens: all }, null, 2) + '\n'); console.log(`wrote ${OUT}`); }
// A gate that finds nothing has measured nothing: with --min, a token that did not resolve or a walk
// that met zero elements in its colour is a vacuous pass and fails as such.
if (MIN != null && rows.length === 0) { failed = true; console.log(`FAIL vacuous: ${TOKEN} coloured no rendered text on ${all.length} screens (token ${all.some((m) => m.tokenRgb) ? 'resolved' : 'did not resolve'})`); }
if (failed) { console.log('\ncontrast-sweep FAILED'); process.exit(1); }
console.log('\ncontrast-sweep done');
