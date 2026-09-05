/* e2e-tour-device — the "Show me around" tour walked on an Android device with REAL taps.
 *
 * Why this exists beside e2e-tour.mjs: headless Chrome at 360x800 passed while the tour was
 * unusable on a 393x699 phone (2026-09-04): the card and Next were pushed off the bottom, the
 * player bar covered the ringed New Entry button, and the OS notification prompt landed on the
 * card. Real taps, real bytes, real viewport.
 *
 * Reads the page through the WebView's DevTools socket (debug build sets
 * setWebContentsDebuggingEnabled) only to find rects and read facts; every
 * press is `adb shell input tap` at device pixels, every shot is screencap.
 *
 * usage: node tools/e2e-tour-device.mjs --out <dir> [--scale 1.8] [--serial emulator-5554] [--grant-notifications]
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('--out', 'device-shots');
const SCALE = parseFloat(opt('--scale', '1'));
const SERIAL = opt('--serial', 'emulator-5554');
const PKG = 'com.votreader.sacredui';
const ACT = `${PKG}/.MainActivity`;
const PORT = 9333;
mkdirSync(OUT, { recursive: true });

const adb = (...a) => execFileSync('adb', ['-s', SERIAL, ...a], { encoding: 'utf8', maxBuffer: 64 << 20 });
const sh = (...a) => adb('shell', ...a).trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = [];
const say = (s) => { console.log(s); log.push(s); };
let failed = 0;
const ok = (s) => say('  ok   ' + s);
const fail = (s) => { failed++; say('  FAIL ' + s); };

function shot(name) {
  const png = execFileSync('adb', ['-s', SERIAL, 'exec-out', 'screencap', '-p'], { maxBuffer: 64 << 20 });
  writeFileSync(join(OUT, name + '.png'), png);
  say(`  shot ${name}.png`);
}

/** Minimal CDP client over the WebView's page socket — Runtime.evaluate is all the walk needs. */
class Page {
  constructor(ws) { this.ws = ws; this.id = 0; this.pending = new Map();
    ws.onmessage = (ev) => { const m = JSON.parse(ev.data); const p = this.pending.get(m.id); if (p) { this.pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); } }; }
  send(method, params = {}) { const id = ++this.id; return new Promise((resolve, reject) => { this.pending.set(id, { resolve, reject }); this.ws.send(JSON.stringify({ id, method, params })); }); }
  async evaluate(fn, ...args) {
    const expression = `(${fn.toString()})(${args.map((a) => JSON.stringify(a)).join(',')})`;
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('evaluate: ' + (r.exceptionDetails.exception && r.exceptionDetails.exception.description || r.exceptionDetails.text));
    return r.result.value;
  }
  async waitForFunction(fn, { timeout = 30000 } = {}) { const t0 = Date.now(); let last = null; while (Date.now() - t0 < timeout) { try { const r = await this.send('Runtime.evaluate', { expression: `!!((${fn.toString()})())`, returnByValue: true }); if (r.result && r.result.value === true) return; } catch (e) { last = e; } await sleep(300); } throw new Error('waitForFunction timeout' + (last ? ': ' + last.message : '')); }
  url() { return this._url; }
}
async function connect() {
  const pid = sh('pidof', PKG);
  if (!pid) throw new Error('app not running');
  try { adb('forward', '--remove', `tcp:${PORT}`); } catch (_e) {}
  adb('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`);
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json();
      const t = list.find((x) => x.type === 'page' && /index\.html/.test(x.url));
      if (t) {
        const ws = new WebSocket(t.webSocketDebuggerUrl);
        await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
        const page = new Page(ws); page._url = t.url;
        return { browser: { disconnect: () => ws.close() }, page };
      }
    } catch (_e) {}
    await sleep(500);
  }
  throw new Error('no app page');
}

let page, browser, dpr = 1;
async function refresh() { ({ browser, page } = await connect()); dpr = await page.evaluate(() => window.devicePixelRatio); }

async function facts() {
  return page.evaluate(() => {
    const card = document.querySelector('.tour-card');
    const ring = document.querySelector('.tour-ring');
    const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; };
    const primary = card && card.querySelector('.tour-btn.primary');
    return {
      active: !!card, card: r(card), ring: r(ring),
      title: card ? (card.querySelector('.tour-title, h2, h1') || {}).textContent : null,
      eyebrow: card ? (card.querySelector('.tour-eyebrow') || {}).textContent : null,
      primary: primary ? primary.textContent.trim() : null,
      primaryRect: r(primary),
      skip: !!(card && [...card.querySelectorAll('button')].find((b) => /^Skip/.test(b.textContent.trim()))),
      prompt: !!document.querySelector('.tour-prompt'),
      tourDone: !!(window.TourDoneFlagStore && window.TourDoneFlagStore.is()),
      scrollW: document.documentElement.scrollWidth, vw: window.innerWidth, vh: window.innerHeight,
      fontScale: getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim(),
      player: !!document.querySelector('.audio-bar'),
      step: (() => { const tc = window.TourController; const st = tc && tc.getState(); return st && st.step ? st.step.id : null; })(),
      pressed: !!(window.TourController && window.TourController.getState().pressed),
      docked: !!(card && card.classList.contains('docked')),
      bar: r(document.querySelector('.audio-bar')),
      dimBoxes: [...document.querySelectorAll('.tour-dim')].map(r),
      scrollerTop: (() => { const c = document.querySelector('.letter-body, .chapter-body'); const s = c && c.closest('.screen-scroll'); return s ? Math.max(0, s.getBoundingClientRect().top) : 0; })(),
      // Read-along paints with the CSS Custom Highlight API ('vot-reading'): the lit words' box.
      lit: (() => { try { const h = window.CSS && CSS.highlights && CSS.highlights.get('vot-reading'); if (!h) return null; const rg = [...h][0]; return rg ? r(rg) : null; } catch (_e) { return null; } })(),
      // The lit range's FIRST line (a wrapped sentence at a large text size is several): the one the eye follows.
      litFirst: (() => { try { const h = window.CSS && CSS.highlights && CSS.highlights.get('vot-reading'); const rg = h && [...h][0]; const b = rg && rg.getClientRects()[0]; return b ? { x: b.x, y: b.y, w: b.width, h: b.height } : null; } catch (_e) { return null; } })(),
      litUnder: (() => { try { const h = window.CSS && CSS.highlights && CSS.highlights.get('vot-reading'); const rg = h && [...h][0]; if (!rg) return null; const b = rg.getClientRects()[0] || rg.getBoundingClientRect(); const at = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); if (!at) return 'nothing'; const o = at.closest('.tour-dim, .tour-card'); return o ? o.className : null; } catch (_e) { return 'error'; } })(),
      // What the docked card declared to the reading column (read-along's band is measured under it).
      scrollPad: (() => { const c = document.querySelector('.letter-body, .chapter-body'); const s = c && c.closest('.screen-scroll'); return s ? parseFloat(getComputedStyle(s).scrollPaddingBottom) || 0 : null; })(),
      audioTime: (() => { try { return window.AudioPlayer ? Number(window.AudioPlayer.getState().time) || 0 : null; } catch (_e) { return null; } })(),
      firstClause: (() => { try { const rows = window.AUDIO_SYNC && window.AUDIO_SYNC['one:chosen-by-god']; return rows ? rows[0][0] : null; } catch (_e) { return null; } })(),
      text: card ? (card.querySelector('.tour-text') || {}).textContent : null,
      ringCovered: (() => { if (!ring) return null; const b = ring.getBoundingClientRect(); const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
        const tc = window.TourController; const target = tc ? tc.findTarget(tc.getState().step) : null;
        const at = document.elementFromPoint(cx, cy); if (!at) return 'nothing';
        if (target && (at === target || target.contains(at))) return null;
        if (at.closest('.tour-ring, .tour-dim, .tour-card')) return null;
        return (at.className && String(at.className).slice(0, 40)) || at.tagName; })(),
      ringOffscreen: ring ? (() => { const b = ring.getBoundingClientRect(); return b.bottom > window.innerHeight || b.top < 0; })() : null,
      cardOffscreen: card ? (() => { const b = card.getBoundingClientRect(); return b.bottom > window.innerHeight + 1 || b.top < 0; })() : null,
    };
  });
}

/** Tap the centre of a CSS rect with a real adb tap. */
function tapRect(r, why) {
  if (!r) { fail(`no rect to tap for ${why}`); return; }
  const x = Math.round((r.x + r.w / 2) * dpr), y = Math.round((r.y + r.h / 2) * dpr);
  sh('input', 'tap', String(x), String(y));
  say(`  tap  ${why} @ ${x},${y} (css ${Math.round(r.x + r.w / 2)},${Math.round(r.y + r.h / 2)} · ${Math.round(r.w)}x${Math.round(r.h)})`);
}

/** Find a visible button by label start, return its rect. */
async function rectOfLabel(label) {
  return page.evaluate((l) => {
    const b = [...document.querySelectorAll('button,[role=button]')].find((b) => (b.getAttribute('aria-label') || b.textContent.trim()).startsWith(l) && b.getBoundingClientRect().width > 0);
    if (!b) return null; let r = b.getBoundingClientRect();
    if (r.bottom > window.innerHeight || r.top < 0) { b.scrollIntoView({ block: 'center', behavior: 'instant' }); r = b.getBoundingClientRect(); }
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  }, label);
}
async function tapLabel(label) { tapRect(await rectOfLabel(label), label); await sleep(500); }

async function launchFresh() {
  sh('am', 'force-stop', PKG); sh('pm', 'clear', PKG);
  if (process.argv.includes('--grant-notifications')) { sh('pm', 'grant', PKG, 'android.permission.POST_NOTIFICATIONS'); say('  (POST_NOTIFICATIONS pre-granted: the first Listen would otherwise raise the OS prompt mid-tour, see s1-14)'); }
  sh('am', 'start', '-n', ACT); await sleep(4000);
  await refresh();
  await page.waitForFunction(() => document.querySelector('.about-continue') || document.querySelector('.tour-prompt') || document.querySelector('.home-nav-item'), { timeout: 60000 });
}
async function relaunch() {
  sh('am', 'force-stop', PKG); await sleep(800);
  sh('am', 'start', '-n', ACT); await sleep(4000);
  await refresh();
  await page.waitForFunction(() => document.querySelector('.about-continue') || document.querySelector('.tour-prompt') || document.querySelector('.home-nav-item') || document.querySelector('.settings-group-head'), { timeout: 60000 });
  // The app reopens on the screen it was killed on; the strip is a Home thing, so go Home if it
  // came back elsewhere (Settings, after the text size was set there).
  if (await page.evaluate(() => !!document.querySelector('.settings-group-head') && !document.querySelector('.home-nav-item'))) { await tapLabel('Home'); await sleep(700); }
}

async function setScale() {
  if (SCALE === 1) return;
  // Text Size as the reader sets it: the Settings slider, so the change goes through React and
  // usePersistedState writes it (a direct StateStore.set is written back over by the hook's next
  // effect tick: e2e-tour walked at 1 under a 1.8 label until 2026-09-04). Verified in the store and
  // in the CSS var here, and again after the relaunch below.
  // The Settings tile scrolled to the top of Home first: the tour strip sits over the bottom of the
  // tiles on a phone, and a tap at the tile's centre landed on the strip.
  await page.evaluate(() => { const b = [...document.querySelectorAll('button,[role=button]')].find((b) => (b.getAttribute('aria-label') || b.textContent.trim()).startsWith('App Configuration')); b && b.scrollIntoView({ block: 'start', behavior: 'instant' }); });
  await sleep(400);
  await tapLabel('App Configuration');
  await page.waitForFunction(() => /Settings/.test(document.title), { timeout: 8000 }).catch(async () => { throw new Error(`Settings did not open for the text size (on "${await page.evaluate(() => document.title)}")`); });
  await sleep(500);
  // A real tap opens the Appearance group (a synthetic click() did not toggle it in the WebView).
  for (let i = 0; i < 4; i++) {
    const appearance = await page.evaluate(() => { const h = [...document.querySelectorAll('.settings-group-head')].find((h) => /Appearance/.test(h.textContent)); if (!h || h.getAttribute('aria-expanded') === 'true') return null; h.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = h.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
    if (!appearance) break;
    await sleep(300);                                   // let the scroll settle before the tap lands
    tapRect(appearance, 'Appearance group'); await sleep(800);
  }
  const slid = await page.evaluate((sc) => {
      const head = [...document.querySelectorAll('.settings-group-head')].find((h) => /Appearance/.test(h.textContent));
      const el = document.querySelector('.txtsize-slider'); if (!el) return 'no slider (Appearance group ' + (head ? head.getAttribute('aria-expanded') : 'missing') + '; on "' + document.title + '", heads: ' + [...document.querySelectorAll('.settings-group-head')].map((h) => h.textContent.trim().slice(0, 20)).join(' | ') + ')';
      el.scrollIntoView({ block: 'center' });
      const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      set.call(el, String(sc)); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
      return 'ok';
    }, SCALE);
  await sleep(800);
  const got = await page.evaluate(() => ({ store: String((window.StateStore.get().settings || {}).fontScale), css: getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim() }));
  if (slid !== 'ok' || got.store !== String(SCALE) || got.css !== String(SCALE)) throw new Error(`text size ${SCALE} did not take (${slid}; store ${got.store}, --font-scale ${got.css || 'unset'})`);
  say(`  text size ${SCALE}x through the slider (store ${got.store}, --font-scale ${got.css})`);
  await tapLabel('Home'); await sleep(700);
}

(async () => {
  const tag = SCALE === 1 ? 's1' : 's' + String(SCALE).replace('.', '');
  say(`device ${SERIAL} · ${sh('wm', 'size')} · ${sh('wm', 'density')} · sdk ${sh('getprop', 'ro.build.version.sdk')} · system font_scale ${sh('settings', 'get', 'system', 'font_scale')} · app --font-scale ${SCALE}`);
  await launchFresh();
  say(`dpr ${dpr}`);
  shot(`${tag}-00-first-screen`);
  // About → Home.
  await tapLabel('Continue'); await tapLabel('Begin Reading');
  await page.waitForFunction(() => document.querySelector('.tour-prompt') || document.querySelector('.home-nav-item'), { timeout: 30000 });
  await setScale();
  let f = await facts();
  if (!f.prompt) fail('the strip is not on Home after About'); else ok('strip on Home after About');
  shot(`${tag}-01-home-strip`);

  // Maybe later hides for the launch.
  await tapLabel('Maybe later'); f = await facts();
  if (f.prompt) fail('Maybe later did not hide the strip'); else ok('Maybe later hides the strip');
  await relaunch();
  await page.waitForFunction(() => document.querySelector('.tour-prompt') || document.querySelector('.home-nav-item'), { timeout: 30000 });
  await sleep(800); f = await facts();
  if (!f.prompt) fail('the strip did not return after a relaunch following Maybe later'); else ok('Maybe later is one launch only');
  say(`  --font-scale after relaunch: ${f.fontScale}`);
  if (String(parseFloat(f.fontScale)) !== String(SCALE)) throw new Error(`the walk would run at --font-scale ${f.fontScale}, not ${SCALE}: the size did not survive the relaunch`);

  // Don't show this again survives a kill.
  await tapLabel('Don'); f = await facts();
  if (f.prompt) fail("Don't show this again did not hide the strip");
  await sleep(1200);
  await relaunch(); await sleep(1500); f = await facts();
  if (f.prompt || !f.tourDone) fail(`Don't show this again did not survive a kill (prompt ${f.prompt}, flag ${f.tourDone})`); else ok("Don't show this again survives force-stop + relaunch");
  shot(`${tag}-02-home-after-never`);

  // Settings › Help › Show me around.
  await tapLabel('App Configuration'); await sleep(600);
  await page.evaluate(() => { const h = [...document.querySelectorAll('.settings-group-head')].find((h) => /Help/.test(h.textContent)); h && h.scrollIntoView({ block: 'center' }); });
  await sleep(300);
  // Only open Help when it is closed: a tap on an open group closes it (and the group's state can
  // outlive a run), and then "Show me around" is not on the screen to tap.
  const helpRect = await page.evaluate(() => { const h = [...document.querySelectorAll('.settings-group-head')].find((h) => /Help/.test(h.textContent)); if (!h || h.getAttribute('aria-expanded') === 'true') return null; const r = h.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  if (helpRect) { tapRect(helpRect, 'Help group'); await sleep(500); }
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((b) => /Show me around/.test(b.textContent)); b && b.scrollIntoView({ block: 'center' }); });
  await sleep(300);
  shot(`${tag}-03-settings-help`);
  await tapLabel('Show me around');
  await page.waitForFunction(() => document.querySelector('.tour-card'), { timeout: 20000 });

  const expected = ['welcome', 'letters', 'listen', 'bible', 'journal', 'backup', 'done'];
  let lastTitle = null;
  for (let i = 0; i < expected.length; i++) {
    const id = expected[i];
    // Settle: the title has changed AND the ring/card rects read the same twice 500 ms apart.
    let prev = null;
    for (let t = 0; t < 24; t++) {
      await sleep(500); f = await facts();
      const sig = JSON.stringify([f.step, f.ring, f.card]);
      // A ringed stop has not arrived until its control is found: the Bible chapter mounts after its
      // lazy corpus lands, and a card that is steady for a second before the ring is not a stop yet.
      if (f.active && f.step === id && sig === prev && (f.ring || i === 0 || i === 6)) break;
      prev = sig;
    }
    lastTitle = f.title;
    if (!f.active) { fail(`${id}: no card`); break; }
    say(`  stop ${i} ${id}: "${(f.title || '').trim()}" · primary ${f.primary} · ring ${f.ring ? Math.round(f.ring.w) + 'x' + Math.round(f.ring.h) : 'none'} · card ${Math.round(f.card.w)}x${Math.round(f.card.h)} @y${Math.round(f.card.y)}`);
    if (f.player) say(`  note ${id}: mini player is up`);
    if (f.ringCovered) fail(`${id}: the ringed control is covered by "${f.ringCovered}"`);
    if (f.ringOffscreen) fail(`${id}: the ring is off screen`);
    if (f.cardOffscreen) fail(`${id}: the card is off screen (y ${Math.round(f.card.y)}, h ${Math.round(f.card.h)}, viewport ${f.vw}x${await page.evaluate(() => window.innerHeight)})`);
    if (!f.skip) fail(`${id}: Skip is not on the card`);
    if (f.scrollW > f.vw) fail(`${id}: sideways scroll ${f.scrollW} > ${f.vw}`);
    if (i > 0 && i < 6 && !f.ring) fail(`${id}: no ring`);
    if (f.ring && f.card) {
      const overlap = !(f.card.y >= f.ring.y + f.ring.h || f.card.y + f.card.h <= f.ring.y || f.card.x >= f.ring.x + f.ring.w || f.card.x + f.card.w <= f.ring.x);
      if (overlap) fail(`${id}: the card covers the ring`);
    }
    if (f.card && f.card.y + f.card.h > f.vw * 800 / 360 + 1 && false) fail(`${id}: card off the bottom`);
    shot(`${tag}-1${i}-${id}`);
    if (f.step !== id) fail(`${id}: the tour is at ${f.step}`);
    tapRect(f.primaryRect, `${f.primary} on ${id}`);
    if (id === 'listen' || id === 'bible') {
      // A Listen stop stays after the press, with the words to look for; the second Next moves on.
      let g = null;
      for (let t = 0; t < 12; t++) { await sleep(500); g = await facts(); if (g.pressed) break; }
      if (!g || g.step !== id || !g.pressed) fail(`${id}: the tour did not stay after pressing Listen`);
      else if (!/Hear it\?/.test(g.text || '')) fail(`${id}: after the press the card does not say what to look for`);
      else ok(`${id}: pressed Listen and stayed`);
      if (g && g.player) say(`  note ${id}: player bar up after the press (expected)`);
      if (g && g.cardOffscreen) fail(`${id}: the card is off screen after the press`);
      // Corbin's walk (2026-09-04): the lit sentence sat under the card and under the dim, and on the
      // letter nothing lit for 26 s. Now: the card docks above the bar, no ring, the column is open,
      // and within a few seconds a line is lit, on screen, under no pane, with the letter's playback
      // already past the recording's lead-in.
      if (g && !g.docked) fail(`${id}: the card is not docked after the press`);
      if (g && g.ring) fail(`${id}: a ring is still drawn after the press`);
      let lit = null;
      for (let t = 0; t < 16; t++) { await sleep(500); lit = await facts(); if (lit.lit && lit.lit.w > 0 && (id !== 'listen' || (lit.firstClause != null && lit.audioTime >= lit.firstClause))) break; }
      // Read-along glides the lit line into its band over GLIDE_MS (260 ms): measure where it landed.
      if (lit && lit.lit && lit.lit.w > 0) { await sleep(700); lit = await facts(); }
      if (!lit || !lit.lit || !(lit.lit.w > 0)) fail(`${id}: no line lit up within 8 s of the press (time ${lit && lit.audioTime}, first clause ${lit && lit.firstClause})`);
      else {
        // The whole lit sentence sits in the open column when it can (its height within the 65 % of
        // the column below the band's 35 % aim point); a sentence taller than that shows its first
        // line in the column, under nothing, and the rest is what the reader scrolls for.
        const b = lit.lit, f = lit.litFirst || b, ct = lit.card ? lit.card.y : lit.vh;
        const open = ct - lit.scrollerTop, fits = b.h <= open * 0.65;
        const vh = lit.vh;
        // The docked card's contract (TourOverlay DOCK_OPEN_FRAC): its top at or below 55 % of the screen.
        if (lit.card && ct < vh * 0.55 - 1) fail(`${id}: the card's top at ${Math.round(ct)} leaves ${Math.round(100 * ct / vh)} % of the screen open above it, expected 55 %`);
        if (lit.card && Math.abs((lit.scrollPad || 0) - (vh - ct)) > 2) fail(`${id}: the scroller's scroll-padding-bottom is ${lit.scrollPad}, the docked card covers ${Math.round(vh - ct)}`);
        if (f.y < lit.scrollerTop - 1 || f.y + f.h > ct + 1) fail(`${id}: the lit line's first row at ${Math.round(f.y)}..${Math.round(f.y + f.h)} is not in the open column ${Math.round(lit.scrollerTop)}..${Math.round(ct)}`);
        else if (fits && b.y + b.h > ct + 1) fail(`${id}: the lit sentence at ${Math.round(b.y)}..${Math.round(b.y + b.h)} (${Math.round(b.h)} px) fits the open column (${Math.round(open)} px) but runs under the card at ${Math.round(ct)}`);
        else if (lit.litUnder) fail(`${id}: the lit line sits under ${lit.litUnder}`);
        else ok(`${id}: lit at ${Math.round(b.y)}..${Math.round(b.y + b.h)}${fits ? '' : ` (${Math.round(b.h)} px, taller than the ${Math.round(open)} px column can hold: first row shown)`}, column open ${Math.round(lit.scrollerTop)}..${Math.round(ct)} (${Math.round(100 * open / (vh - lit.scrollerTop))} %), scroll-padding ${Math.round(lit.scrollPad || 0)}${id === 'listen' ? `, audio at ${lit.audioTime.toFixed(1)} s past the ${lit.firstClause} s lead-in` : ''}`);
        if (id === 'listen' && !(lit.audioTime >= lit.firstClause)) fail(`listen: audio at ${lit.audioTime} s, the first clause lights at ${lit.firstClause} s`);
        const covered = lit.dimBoxes.filter((d) => d.w > 0 && d.h > 0 && lit.card && d.y < lit.card.y - 1 && d.y + d.h > lit.scrollerTop + 1);
        if (covered.length) fail(`${id}: a dim pane covers the column between ${Math.round(lit.scrollerTop)} and the card`);
        void vh;
      }
      shot(`${tag}-1${i}-${id}-pressed`);
      await sleep(1000);   // let the reader hear a line
      g = await facts(); tapRect(g.primaryRect, `Next on ${id} (pressed)`);
    }
  }
  await sleep(1200); f = await facts();
  if (f.active) fail('the tour is still active after Done'); else ok('Done ends the tour');
  if (!f.tourDone) fail('Done did not record the flag');
  if (f.prompt) fail('the strip came back after Done'); else ok('strip stays away after Done');
  shot(`${tag}-20-after-done`);

  // Android Back means Skip.
  await tapLabel('App Configuration'); await sleep(600);
  await page.evaluate(() => { const h = [...document.querySelectorAll('.settings-group-head')].find((h) => /Help/.test(h.textContent)); h && h.scrollIntoView({ block: 'center' }); });
  await sleep(300);
  const help2 = await page.evaluate(() => { const h = [...document.querySelectorAll('.settings-group-head')].find((h) => /Help/.test(h.textContent)); if (!h || h.getAttribute('aria-expanded') === 'true') return null; const r = h.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  if (help2) { tapRect(help2, 'Help group'); await sleep(500); }
  await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find((b) => /Show me around/.test(b.textContent)); b && b.scrollIntoView({ block: 'center' }); });
  await sleep(300);
  await tapLabel('Show me around');
  await page.waitForFunction(() => document.querySelector('.tour-card'), { timeout: 20000 });
  await sleep(600); f = await facts(); tapRect(f.primaryRect, 'Start'); await sleep(900);
  shot(`${tag}-21-before-back`);
  sh('input', 'keyevent', 'KEYCODE_BACK'); await sleep(900); f = await facts();
  if (f.active) fail('Android Back did not skip the tour'); else ok('Android Back means Skip');
  shot(`${tag}-22-after-back`);

  say(failed ? `device-tour FAIL (${failed})` : 'device-tour PASS');
  writeFileSync(join(OUT, `${tag}-log.txt`), log.join('\n') + '\n');
  try { adb('forward', '--remove', `tcp:${PORT}`); } catch (_e) {}
  browser.disconnect();
  process.exit(failed ? 1 : 0);
})().catch((e) => { say('ERROR ' + (e && e.stack || e)); writeFileSync(join(OUT, 'error-log.txt'), log.join('\n') + '\n'); process.exit(2); });
