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
      scrollW: document.documentElement.scrollWidth, vw: window.innerWidth,
      fontScale: getComputedStyle(document.documentElement).getPropertyValue('--font-scale').trim(),
      player: !!document.querySelector('.audio-bar'),
      step: (() => { const tc = window.TourController; const st = tc && tc.getState(); return st && st.step ? st.step.id : null; })(),
      pressed: !!(window.TourController && window.TourController.getState().pressed),
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
  await page.waitForFunction(() => document.querySelector('.about-continue') || document.querySelector('.tour-prompt') || document.querySelector('.home-nav-item'), { timeout: 60000 });
}

async function setScale() {
  if (SCALE === 1) return;
  // Through the app's own state so it survives relaunch (the boot writer reads it). The store
  // hydrates from IDB after mount and a write that lands before that is overwritten, so write
  // until the store reads it back, and fail loudly rather than walk at 1 under a 1.8 label.
  for (let i = 0; i < 10; i++) {
    const got = await page.evaluate((sc) => {
      const S = window.StateStore; if (!S || !S.get || !S.set) return 'no store';
      const st = S.get();
      S.set({ ...st, settings: { ...(st.settings || {}), fontScale: String(sc) } });
      document.documentElement.style.setProperty('--font-scale', String(sc));
      return String((S.get().settings || {}).fontScale);
    }, SCALE);
    if (got === String(SCALE)) { await sleep(800); return; }
    await sleep(700);
  }
  throw new Error(`could not set --font-scale ${SCALE} through StateStore`);
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
  const helpRect = await page.evaluate(() => { const h = [...document.querySelectorAll('.settings-group-head')].find((h) => /Help/.test(h.textContent)); if (!h) return null; const r = h.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  tapRect(helpRect, 'Help group'); await sleep(500);
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
      if (f.active && f.step === id && sig === prev) break;
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
      shot(`${tag}-1${i}-${id}-pressed`);
      await sleep(1500);   // let the reader hear a line
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
