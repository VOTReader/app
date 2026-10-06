/**
 * tools/e2e-phone-fit.mjs - every screen a phone reader walks paints in the app's own fonts, fits a 360 px
 * screen, and gives a finger 48 px on the controls that had less (zones L1-L3, 2026-10-05).
 *
 * WHY. The redesign critique (D:/Swarm/lanes/hub/out/critique-2026-10-05/report-synthesis.md, items 7, 8, 24)
 * measured three bugs that were also live on main: the previous/next cards at the end of every letter painted
 * their titles in Arial (a <button> does not inherit the page's font-family, so Chrome gives it its own system
 * font), the highlight colour bar ran off a 360 px screen, and the bookmark, search clear, A-/A+ and seek bar
 * were 24-45 px. None of the gates could see a fallback font: getComputedStyle reports the font-family LIST,
 * not the face that painted, and a glyph the webfont lacks (a chevron, a vertical ellipsis) falls through to a
 * system font with a perfectly correct font-family.
 *
 * WHAT. The built app (its own tree, an OS-assigned port), a fresh profile at 360x800 (and 412x915 for the
 * highlight bar), walked through onboarding, Home, the volumes, a letter top and end, the More menu, History,
 * Open tabs, Search, Settings, Library, Listening, the Bible and a chapter end, and the highlight bar on a
 * selected passage. On each screen it asks Chrome (CDP CSS.getPlatformFontsForNode) which faces painted every
 * visible text run, and asserts:
 *   F1  every face is one the app ships (isCustomFont: a bundled @font-face), never a system fallback;
 *   W1  the highlight bar's swatches all sit inside the viewport at 360 and 412 (no sideways overflow);
 *   T1  the controls in TAP48 are at least 48 x 48 CSS px where they show (the hit box: rect, or the ::before
 *       ring the app uses to grow a small drawing).
 * A step that cannot reach its screen fails the run (a walk that checks nothing must not pass).
 *
 * Run: npm run e2e:phone (after npm run build; ~40 s). Exit 0 all pass, 1 any failure (each printed).
 * --shots <dir> saves one PNG per screen (before/after pictures for a review).
 */
import puppeteer from 'puppeteer';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { serveOwnTree } from './e2e-read-serve.mjs';

const shotsAt = process.argv.indexOf('--shots');
const SHOTS = shotsAt > 0 ? resolve(process.argv[shotsAt + 1]) : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });

// The controls the critique measured under 48 px, by selector. Each must be 48 x 48 wherever the walk finds it.
export const TAP48 = ['.nav-bookmark-btn', '.srch-clear-btn', '.more-menu-step button'];

// In the page: tag every visible element that owns a non-blank text run, so CDP can ask what painted it.
function markText() {
  var n = 0;
  var all = document.body.querySelectorAll('*');
  for (var i = 0; i < all.length; i++) {
    var el = all[i];
    if (el.closest('svg, script, style, noscript, [aria-hidden="true"]')) continue;
    var own = false;
    for (var c = el.firstChild; c; c = c.nextSibling) {
      if (c.nodeType === 3 && /\S/.test(c.nodeValue)) { own = true; break; }
    }
    if (!own) continue;
    var s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || +s.opacity === 0) continue;
    var r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0) || r.bottom < 0 || r.top > innerHeight) continue;
    el.setAttribute('data-fontprobe', String(n++));
  }
  return n;
}

// A face is a fallback unless the app ships it, or (System Serif only) it is the device serif the look asks for.
export function isFallback(font, deviceSerif) { return !font.isCustomFont && font.familyName !== deviceSerif; }

// The two looks use-settings.js can set: 'classic' (System Serif, the default) disables #custom-fonts, so
// 'EB Garamond' and 'Cinzel' resolve to the device serif ON PURPOSE; 'bundled' is every other Reading Font
// (the bundled faces on). Each screen is probed in both: classic allows the device serif and nothing else
// (a button's own sans, a symbol font), bundled allows only shipped faces.
function setLook(look) {
  var cf = document.getElementById('custom-fonts');
  if (cf) cf.disabled = look === 'classic';
  document.documentElement.style.setProperty('--font-body', "'EB Garamond', serif");
  return document.fonts.ready.then(function () { return true; });
}

// The face this device paints for the generic serif (what System Serif means here).
async function measureDeviceSerif(page, cdp) {
  await page.evaluate(() => {
    const s = document.createElement('span');
    s.id = 'fontprobe-serif'; s.textContent = 'Serif'; s.style.cssText = 'font-family: serif; position: fixed; left: 0; top: 0';
    document.body.appendChild(s);
  });
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeId } = await cdp.send('DOM.querySelector', { nodeId: root.nodeId, selector: '#fontprobe-serif' });
  const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
  await page.evaluate(() => document.getElementById('fontprobe-serif').remove());
  return fonts[0] && fonts[0].familyName;
}

async function probeFonts(page, cdp, screen, look, deviceSerif) {
  await page.evaluate(setLook, look);
  await new Promise((r) => setTimeout(r, 150));
  await page.evaluate(() => document.fonts.ready);
  const marked = await page.evaluate(markText);
  const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
  const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector: '[data-fontprobe]' });
  const offenders = [];
  for (const nodeId of nodeIds) {
    let fonts;
    try { ({ fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId })); } catch { continue; }
    const bad = fonts.filter((f) => isFallback(f, look === 'classic' ? deviceSerif : null));
    if (!bad.length) continue;
    const { outerHTML } = await cdp.send('DOM.getOuterHTML', { nodeId });
    const head = outerHTML.slice(0, outerHTML.indexOf('>') + 1).replace(/ data-fontprobe="\d+"/, '').slice(0, 90);
    const text = await page.evaluate((h) => {
      const el = document.querySelector(`[data-fontprobe="${h}"]`);
      return el ? [...el.childNodes].filter((c) => c.nodeType === 3).map((c) => c.nodeValue).join('').trim().slice(0, 40) : '';
    }, String(nodeIds.indexOf(nodeId)));
    offenders.push({ screen: `${screen} (${look})`, el: head, text, faces: bad.map((f) => `${f.familyName} x${f.glyphCount}`).join(', ') });
  }
  await page.evaluate(() => document.querySelectorAll('[data-fontprobe]').forEach((e) => e.removeAttribute('data-fontprobe')));
  return { marked, offenders };
}

// In the page: select the first line of the letter so the highlight bar rises (SelectionToolbar listens for
// selectionchange), and report every swatch that does not show whole: past the screen's edge, or clipped by
// a scrolling row (the old row scrolled sideways, so 3 of 10 colours sat out of sight at 360).
function selectFirstLine() {
  var el = document.querySelector('[data-hl-key]');
  if (!el) return false;
  var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  var t = walker.nextNode();
  while (t && t.nodeValue.trim().length < 8) t = walker.nextNode();
  if (!t) return false;
  el.scrollIntoView({ block: 'center' });
  var r = document.createRange();
  r.setStart(t, 0); r.setEnd(t, Math.min(t.nodeValue.length, 20));
  var sel = getSelection(); sel.removeAllRanges(); sel.addRange(r);
  return true;
}
function probeSwatches() {
  var bar = document.querySelector('.sel-toolbar');
  if (!bar) return { error: 'the highlight bar did not rise' };
  var out = { n: 0, cut: [] };
  bar.querySelectorAll('.sel-color-btn').forEach(function (b) {
    var r = b.getBoundingClientRect();
    out.n++;
    var clip = b.parentElement.getBoundingClientRect();
    if (r.left < 0 || r.right > innerWidth || r.left < clip.left - 0.5 || r.right > clip.right + 0.5) {
      out.cut.push((b.getAttribute('data-color') || b.getAttribute('aria-label') || 'swatch') + ' ' + Math.round(r.left) + '-' + Math.round(r.right));
    }
  });
  return out;
}

// In the page: every visible control in the reading top bar sits inside the bar and clear of its neighbours.
function probeTopBar() {
  var nav = document.querySelector('.top-nav');
  if (!nav) return { error: 'no top bar' };
  var b = nav.getBoundingClientRect();
  var items = Array.prototype.filter.call(nav.children, function (el) {
    var s = getComputedStyle(el), r = el.getBoundingClientRect();
    return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 0 && r.height > 0;
  }).map(function (el) { var r = el.getBoundingClientRect(); return { k: el.getAttribute('aria-label') || el.className, l: r.left, r: r.right }; });
  var bad = [];
  items.forEach(function (it, i) {
    if (it.l < b.left - 1 || it.r > b.right + 1) bad.push(it.k + ' leaves the bar');
    if (i && it.l < items[i - 1].r - 1) bad.push(it.k + ' overlaps ' + items[i - 1].k);
  });
  // free width: the bar's inner width minus its controls (how much a wider control can still take)
  var used = items.reduce(function (a, it) { return a + (it.r - it.l); }, 0);
  return { n: items.length, bad: bad, slack: Math.round(b.width - used) };
}

function probeTap48(sels) {
  var out = [];
  sels.forEach(function (sel) {
    document.querySelectorAll(sel).forEach(function (el) {
      var r = el.getBoundingClientRect();
      if (!(r.width > 0 && r.height > 0)) return;
      var w = r.width, h = r.height;
      var b = getComputedStyle(el, '::before');
      if (b.content && b.content !== 'none' && b.position === 'absolute') {
        // the ring: inset values grow the box outward when negative
        var px = function (v) { return parseFloat(v) || 0; };
        w = Math.max(w, r.width - px(b.left) - px(b.right));
        h = Math.max(h, r.height - px(b.top) - px(b.bottom));
      }
      out.push({ sel: sel, w: Math.round(w), h: Math.round(h) });
    });
  });
  return out;
}

async function main() {
  const { server, url } = await serveOwnTree();
  const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'] });
  const fails = [];
  const seen = { fonts: 0, screens: 0, tap: 0, swatches: 0, bars: 0, slack: [] };
  try {
    const page = await browser.newPage();
    page.setDefaultTimeout(30000);
    await page.setViewport({ width: 360, height: 800 });
    const cdp = await page.createCDPSession();
    await cdp.send('DOM.enable');
    await cdp.send('CSS.enable');
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const clickText = async (re, sel = 'button, [role="button"], a') => {
      for (let i = 0; i < 60; i++) {
        const ok = await page.evaluate((src, s) => {
          const rx = new RegExp(src, 'i');
          const el = [...document.querySelectorAll(s)].find((b) => b.offsetParent !== null
            && (rx.test((b.textContent || '').trim()) || rx.test((b.getAttribute('aria-label') || '').trim())));
          if (!el) return false;
          el.click();
          return true;
        }, re.source, sel);
        if (ok) { await sleep(600); return; }
        await sleep(250);
      }
      const have = await page.evaluate((s) => [...document.querySelectorAll(s)].filter((b) => b.offsetParent !== null)
        .map((b) => (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 24)).slice(0, 14).join(' | '), sel);
      throw new Error(`walk: no control matching ${re} (have: ${have})`);
    };
    const goHome = async () => {
      for (let i = 0; i < 6; i++) {
        if (await page.evaluate(() => !!document.querySelector('.home-shortcuts'))) return;
        await page.evaluate(() => {
          const b = document.querySelector('button[title="Home"]')
            || [...document.querySelectorAll('button')].find((x) => /back/i.test(x.getAttribute('aria-label') || ''));
          if (b) b.click(); else history.back();
        });
        await sleep(600);
      }
      throw new Error('walk: could not return Home');
    };
    // To the end of the reading: the previous/next cards (where the critique saw Arial), else the last line.
    const toEnd = () => page.evaluate(() => {
      const end = document.querySelector('.bottom-nav') || [...document.querySelectorAll('[data-hl-key]')].pop();
      if (!end) return false;
      end.scrollIntoView({ block: 'end' });
      return true;
    });
    let deviceSerif = null;
    const check = async (screen) => {
      await sleep(400);
      if (!deviceSerif) seen.serif = deviceSerif = await measureDeviceSerif(page, cdp);
      seen.screens++;
      for (const look of ['bundled', 'classic']) {   // classic last: the fresh profile's own look stays on
        const f = await probeFonts(page, cdp, screen, look, deviceSerif);
        seen.fonts += f.marked;
        if (!f.marked) fails.push(`${screen}: no text found (walk did not reach it)`);
        for (const o of f.offenders) fails.push(`F1 ${o.screen}: ${o.faces} paints "${o.text}" in ${o.el}`);
      }
      const t = await page.evaluate(probeTap48, TAP48);
      for (const o of t) {
        seen.tap++;
        if (o.w < 48 || o.h < 48) fails.push(`T1 ${screen}: ${o.sel} is ${o.w}x${o.h} (< 48x48)`);
      }
      if (SHOTS) await page.screenshot({ path: resolve(SHOTS, `${String(seen.screens).padStart(2, '0')}-${screen}.png`) });
    };
    const step = async (name, fn) => {
      try { await fn(); } catch (e) { fails.push(`${name}: ${(e && e.message) || e}`); }
    };

    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => { const r = document.getElementById('root'); return !!r && r.children.length > 0; });
    await page.evaluate(async () => {
      const loaders = ['__loadBibleCorpus', '__loadMatthewCorpus', '__loadVotCorpus', '__loadAnswersCorpus'];
      await Promise.all(loaders.map((n) => (typeof window[n] === 'function' ? window[n]() : null)));
    });

    await step('onboarding', async () => {
      await clickText(/^Continue$/); await check('onboarding');
      await clickText(/Begin Reading/); await check('home-tour');
      await clickText(/^Maybe later$/);
    });
    await step('home', async () => { await goHome(); await check('home'); });
    await step('more-menu', async () => {
      await clickText(/^More$/, 'button'); await check('more-menu');
      await page.keyboard.press('Escape'); await sleep(300);
    });
    await step('letter', async () => {
      await goHome();
      await clickText(/Prophetic Letters/); await check('volumes');
      await clickText(/^Volume One/); await check('volume-one');
      await clickText(/A Word of Warning/); await check('letter-top');
      // W2: the reading top bar as shipped (default settings) fits 360 and 412. (With every optional top-bar
      // button switched on - History, theme, gear, nav arrows - it already overflowed on main before L3.)
      for (const w of [360, 412]) {
        await page.setViewport({ width: w, height: w === 360 ? 800 : 915 });
        await sleep(300);
        const tb = await page.evaluate(probeTopBar);
        if (tb.error) fails.push(`W2 ${w}: ${tb.error}`);
        else { seen.bars++; seen.slack.push(`${w}:${tb.slack}px`); for (const m of tb.bad) fails.push(`W2 ${w} top bar: ${m}`); }
      }
      // W1: the highlight bar's swatches all show at 360 and 412.
      for (const w of [360, 412]) {
        await page.setViewport({ width: w, height: w === 360 ? 800 : 915 });
        await sleep(300);
        if (!(await page.evaluate(selectFirstLine))) throw new Error('no text to select');
        await page.waitForSelector('.sel-toolbar', { timeout: 5000 }).catch(() => {});
        await sleep(500);
        const sw = await page.evaluate(probeSwatches);
        if (SHOTS) await page.screenshot({ path: resolve(SHOTS, `hl-bar-${w}.png`) });
        if (sw.error) fails.push(`W1 ${w}: ${sw.error}`);
        else if (!sw.n) fails.push(`W1 ${w}: no swatches in the highlight bar`);
        else { seen.swatches += sw.n; for (const c of sw.cut) fails.push(`W1 ${w}: highlight swatch ${c} is cut off`); }
        await page.evaluate(() => getSelection().removeAllRanges());
        await sleep(300);
      }
      await page.setViewport({ width: 360, height: 800 });
      if (!(await toEnd())) throw new Error('no end of text'); await sleep(700); await toEnd(); await check('letter-end');
    });
    await step('history', async () => { await goHome(); await clickText(/^Recently VisitedHistory/); await check('history'); });
    await step('tabs', async () => { await clickText(/Open tabs/, 'button'); await check('open-tabs'); await page.keyboard.press('Escape'); });
    await step('search', async () => {
      await goHome(); await clickText(/^Search library/);
      await page.evaluate(() => {
        const box = document.querySelector('input[type="search"], .srch-input, input');
        const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
        set.call(box, 'love one another');
        box.dispatchEvent(new Event('input', { bubbles: true }));
      });
      await page.waitForSelector('.srch-sort-btn', { timeout: 30000 });
      await check('search');
    });
    await step('settings', async () => { await goHome(); await clickText(/^App ConfigurationSettings/); await check('settings'); });
    await step('library', async () => { await goHome(); await clickText(/^Personal StudyLibrary/); await check('library'); });
    await step('listening', async () => { await goHome(); await clickText(/^Audio ReadingsListening Library/); await check('listening'); });
    await step('bible', async () => {
      await goHome(); await clickText(/^The Holy Bible/); await check('bible');
      await clickText(/^The Law/); await clickText(/Genesis$/); await check('genesis');
      await clickText(/^1\D/); await check('chapter-top');
      if (!(await toEnd())) throw new Error('no end of text'); await sleep(700); await toEnd(); await check('chapter-end');
    });
  } finally {
    await browser.close();
    server.close();
  }
  for (const f of fails) console.error('[e2e:phone] ' + f);
  console.log(`[e2e:phone] ${fails.length ? 'FAIL' : 'PASS'}: ${seen.screens} screens x 2 looks (device serif: ${seen.serif}), ${seen.fonts} text runs, ${seen.tap} sized controls, ${seen.swatches} swatches, ${seen.bars} top bars (free ${seen.slack.join(' ')}), ${fails.length} failures`);
  process.exit(fails.length ? 1 : 0);
}

const invokedDirectly = !!process.argv[1]
  && resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (invokedDirectly) main();
