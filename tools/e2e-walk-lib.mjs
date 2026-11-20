/* e2e-walk-lib — helpers shared by the update-reload / kill-cadence walks (pure; fake-clock testable).
   ─────────────────────────────────────────────────────────────────────────────
   settleRead(read, opts)       a position is a reading only once the scroller has been STILL.
                                update-walk-follow-sample-1: one sample taken while the read-along
                                follow was still moving read 887 against 900 and was classified as
                                "moved for no reason this walk can name"; the settled value was 698.
   classifyRestoredPages(urls, base)
                                kill-cadence-armd-sibling-1: a persistent profile restores the previous
                                session's tabs at relaunch, so a second document of the origin boots
                                the player beside the measured page. Count and name what the walk did
                                not open, so arm D can close it and the report can say it did.
   settleLine(r)                the one report sentence for a settleRead result. */

/**
 * Poll `read()` every `everyMs` until the value has not changed for `stillMs`, or `maxMs` has passed.
 * @param {() => any} read                       returns the current position (any value; compared with Object.is)
 * @param {{stillMs?:number, maxMs?:number, everyMs?:number, now?:() => number, sleep?:(ms:number) => Promise<void>}} [opts]
 * @returns {Promise<{y:any, settled:boolean, waitedMs:number, stillMs:number, samples:{t:number,y:any}[]}>}
 *   `samples` holds the first read and every CHANGE (not every poll), so a report can list the moves.
 */
export async function settleRead(read, opts = {}) {
  const stillMs = opts.stillMs ?? 250;
  const maxMs = opts.maxMs ?? 4000;
  const everyMs = opts.everyMs ?? 16;
  const now = opts.now || (() => performance.now());
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const t0 = now();
  let y = await read();
  let lastChangeAt = 0;
  const samples = [{ t: 0, y }];
  for (;;) {
    const t = now() - t0;
    const still = t - lastChangeAt;
    if (still >= stillMs) return { y, settled: true, waitedMs: t, stillMs: still, samples };
    if (t >= maxMs) return { y, settled: false, waitedMs: t, stillMs: still, samples };
    await sleep(everyMs);
    const v = await read();
    if (!Object.is(v, y)) {
      y = v;
      lastChangeAt = now() - t0;
      samples.push({ t: lastChangeAt, y });
    }
  }
}

/**
 * Partition the pages a browser has open at launch by whether they are the app's origin.
 * @param {string[]} urls   `(await browser.pages()).map((p) => p.url())`
 * @param {string} base     the walk's app URL; its origin is "the app"
 * @returns {{total:number, appTabs:number, appUrls:string[], others:string[]}}
 */
export function classifyRestoredPages(urls, base) {
  const origin = new URL(base).origin;
  const appUrls = [];
  const others = [];
  for (const u of urls) {
    let same = false;
    try { same = new URL(u).origin === origin; } catch { /* about:blank, chrome://, or junk: not the app */ }
    (same ? appUrls : others).push(u);
  }
  return { total: urls.length, appTabs: appUrls.length, appUrls, others };
}

/** @param {{y:any, settled:boolean, waitedMs:number, stillMs:number, samples:{t:number,y:any}[]}} r */
export function settleLine(r) {
  const moves = r.samples.length - 1;
  const path = moves ? ` after moving ${moves}x (${r.samples.map((s) => s.y).join(' -> ')})` : '';
  return r.settled
    ? `still at ${r.y} for ${Math.round(r.stillMs)} ms, read at +${Math.round(r.waitedMs)} ms${path}`
    : `NOT still: ${r.y} at +${Math.round(r.waitedMs)} ms, last move ${Math.round(r.stillMs)} ms ago${path}`;
}

/* ── Failures that name their fix (hub 11-20; Corbin: "make the gate failures name the fix") ────────────────────
   A failing check prints where it stopped and ONE line holding FIX_TOKEN: what to change. The gate's summary
   (run-gates.sh), CI and a local run all show that line, so the fix lives in the check. The token is built here, once:
   node and vitest print the source line of a throw, and a walk whose own source held the token would print a second,
   garbage fix line from that frame. A fix states only what the walk can know; where the honest answer is two cases,
   it names both and how to tell them apart.
     fixLine(text)               the one fix line
     walkSite(stack)             'tools/<walk>.mjs:<line>': the walk's own frame in a stack
     noControl / waitTimedOut / stopUnreached({...})   the three shapes every walk shares, as a WalkFailure
     describeError(err)          {head, fix} for any error, puppeteer's timeouts included (fix null when unknown)
     failureReport(err, name)    '[name] FAILED at <site>: <message>' + its fix line
     installFailureReport(name)  the same for an error the walk did not catch, instead of node's source-line dump */

export const FIX_TOKEN = ['FIX', ' '].join(':');

/** @param {string} text @returns {string} */
export function fixLine(text) {
  const one = String(text).replace(/\s+/g, ' ').trim();
  const max = 300 - FIX_TOKEN.length;
  return FIX_TOKEN + (one.length > max ? one.slice(0, max - 1) + '…' : one);
}

/**
 * A stack frame inside the repo's tools/ that is a walk: not this lib, not first-run.mjs (a shared helper: its caller
 * is the walk's step), not node_modules. `skip` passes over that many walk frames first: a shape built inside a walk's
 * own helper (clickText) names the step that called the helper, not the helper's throw line.
 * @param {string | undefined} stack @param {number} [skip] @returns {string | null}
 */
export function walkSite(stack, skip = 0) {
  const sites = [];
  for (const line of String(stack || '').split('\n')) {
    if (!/^\s+at /.test(line) || /node_modules|node:/.test(line)) continue;
    const m = /[\\/](tools[\\/][^\\/:()]+\.(?:mjs|js|cjs)):(\d+):\d+/.exec(line);
    if (m && !/(e2e-walk-lib|first-run)\.mjs$/.test(m[1])) sites.push(m[1].replace(/\\/g, '/') + ':' + m[2]);
  }
  return sites[Math.min(skip, sites.length - 1)] || null;
}

export class WalkFailure extends Error {
  /**
   * @param {string} message
   * @param {{fix?: string|null|((at: string|null) => string), step?: string|null, at?: string|null, helper?: boolean}} [o]
   *   helper: built inside a walk's own helper, so the site is the frame that called it
   */
  constructor(message, o = {}) {
    super(message);
    this.name = 'WalkFailure';
    this.step = o.step || null;
    this.at = o.at || walkSite(this.stack, o.helper ? 1 : 0);
    this.fix = typeof o.fix === 'function' ? o.fix(this.at) : (o.fix || null);
  }
}

const quoted = (seen) => (seen || []).slice(0, 12).map((s) => JSON.stringify(String(s).slice(0, 40))).join(', ')
  + ((seen || []).length > 12 ? ` (+${seen.length - 12} more)` : '');

const NO_CONTROL_FIX = (wording, at) => `if the app renamed or removed the control, change the wording ${wording} at ${at || 'this step'}`
  + ' to its new label (\'on screen\' lists what is there); if \'on screen\' is the screen before, the step before did not land: fix that step';

/** @param {{wording: string, step?: string, seen?: string[], at?: string}} o */
export function noControl({ wording, step, seen, at }) {
  const msg = `no control matching ${wording}` + (seen ? `; on screen: ${quoted(seen) || '(nothing)'}` : '');
  return new WalkFailure(msg, { step, at, helper: true, fix: (site) => NO_CONTROL_FIX(wording, site) });
}

const TIMED_OUT_FIX = (what, ms, at) => `${what} did not happen within ${ms} ms at ${at || 'this step'}: if the walk fails alone too,`
  + ' the app no longer reaches it (the last step that worked is above); if it passes alone, the machine was busy: rerun it alone';

/** @param {{what: string, ms: number, step?: string, at?: string}} o */
export function waitTimedOut({ what, ms, step, at }) {
  return new WalkFailure(`waited ${ms} ms for ${what}`, { step, at, helper: true, fix: (site) => TIMED_OUT_FIX(what, ms, site) });
}

/** @param {{stop: string, how: string, at?: string}} o */
export function stopUnreached({ stop, how, at }) {
  return new WalkFailure(`stop "${stop}" not reached: ${how}`, {
    step: null, at,
    fix: `make the walk reach "${stop}" again at ${at || 'its step'} (${how}): the control or route it opens by changed;`
      + ' if the app dropped that screen on purpose, take the stop out of the walk',
  });
}

/**
 * @param {any} err
 * @returns {{head: string, fix: string|null, at: string|null, step: string|null}}
 */
export function describeError(err) {
  const e = err || {};
  const msg = String(e.message || e);
  const at = e.at || walkSite(e.stack);
  const head = (e.name && e.name !== 'WalkFailure' ? e.name + ': ' : '') + msg.split('\n')[0];
  const out = (fix) => ({ head, fix, at, step: e.step || null });
  if (e.fix) return out(e.fix);
  let m;
  if ((m = /Navigation timeout of (\d+) ms exceeded/.exec(msg))) {
    return out(`the app's page did not load in ${m[1]} ms at ${at || 'page.goto'}: if the walk fails alone too, the build or`
      + ' its server is broken (npm run build, then the walk alone); if it passes alone, the machine was busy');
  }
  if ((m = /Waiting for selector `([^`]+)` failed/.exec(msg))) {
    return out(`\`${m[1]}\` never appeared at ${at || 'this step'}: if the app renamed or dropped that selector, change it there;`
      + ' if not, the screen before it did not open: the step before is the fault');
  }
  if ((m = /Waiting failed: (\d+)\s*ms exceeded/.exec(msg))) {
    return out(`the condition the walk waits on at ${at || 'this step'} did not hold within ${m[1]} ms: if it fails alone too, the app`
      + ' no longer reaches that state; if it passes alone, the machine was busy');
  }
  if ((m = /no control (?:matching )?(\S+?)[;,]?(?:\s|$)/.exec(msg))) return out(NO_CONTROL_FIX(m[1], at));
  return out(null);
}

/** @param {any} err @param {string} name @returns {string} */
export function failureReport(err, name) {
  const d = describeError(err);
  const where = d.at ? ` at ${d.at}` : '';
  const step = d.step ? ` (step "${d.step}")` : '';
  const rest = String((err && err.message) || '').split('\n').slice(1).filter(Boolean);
  return [`[${name}] FAILED${where}${step}: ${d.head}`, ...rest, ...(d.fix ? [fixLine(d.fix)] : [])].join('\n');
}

/**
 * Print failureReport for an error the walk did not catch, then exit 1 (puppeteer closes its browsers on exit).
 * @param {string} name
 */
export function installFailureReport(name) {
  const onFail = (err) => {
    console.error(failureReport(err, name));
    if (err && err.stack) console.error(err.stack.split('\n').slice(1, 8).join('\n'));
    process.exit(1);
  };
  process.on('uncaughtException', onFail);
  process.on('unhandledRejection', onFail);
}

/* ── Fades: a reading waits until nothing it reads is mid-fade (hub 11-20, CI 44681552243) ───────────────────── */

/**
 * Does this running animation or transition change what a contrast or picture reading sees? Infinite ones (spinners,
 * pulses) never block, or a stop would never read; moves that change no colour (transform, width) do not either.
 * Self-contained: it also runs inside the page.
 * @param {{playState: string, iterations: number, props: string[]}} a
 */
export function isFadeBlocking(a) {
  if (!a || a.playState !== 'running' || !(a.iterations < Infinity)) return false;
  return (a.props || []).some((p) => /^(opacity|color|background(-color)?|fill|stroke|filter|visibility|border(-\w+)?-color|all)$/.test(p));
}

/** In the page: what is still fading, as 'tag.class property' strings. */
function fadesInPage(blocking) {
  const kebab = (k) => k.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase());
  const name = (el) => !el || !el.tagName ? '?' : el.tagName.toLowerCase()
    + (typeof el.className === 'string' && el.className.trim() ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '');
  const out = [];
  for (const a of document.getAnimations()) {
    const ef = a.effect;
    const el = ef && ef.target;
    if (!el || !el.isConnected) continue;
    let props = [];
    if (a.transitionProperty) props = [a.transitionProperty];
    else if (ef.getKeyframes) props = [...new Set(ef.getKeyframes().flatMap((k) => Object.keys(k)))].filter((k) => !/^(offset|easing|composite|computedOffset)$/.test(k)).map(kebab);
    const t = ef.getComputedTiming ? ef.getComputedTiming() : {};
    if (blocking({ playState: a.playState, iterations: t.iterations, props })) out.push(name(el) + ' ' + props.join(','));
  }
  return out;
}

/**
 * Wait until no finite fade is running in the page, at most `maxMs`.
 * @param {{evaluate: (fn: string) => Promise<string[]>}} page
 * @param {{maxMs?: number, everyMs?: number, now?: () => number, sleep?: (ms: number) => Promise<void>}} [opts]
 * @returns {Promise<{settled: boolean, waitedMs: number, still: string[]}>}  still: what was moving at the cap
 */
export async function waitForFades(page, opts = {}) {
  const maxMs = opts.maxMs ?? 3000;
  const everyMs = opts.everyMs ?? 50;
  const now = opts.now || (() => performance.now());
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const src = `(${fadesInPage})(${isFadeBlocking})`;
  const t0 = now();
  for (;;) {
    const still = await page.evaluate(src);
    const waitedMs = Math.round(now() - t0);
    if (!still.length) return { settled: true, waitedMs, still: [] };
    if (waitedMs >= maxMs) return { settled: false, waitedMs, still };
    await sleep(everyMs);
  }
}

/**
 * A walk's own table of findings and their fixes: the first row whose pattern matches. A row's fix is a string, or a
 * function of the match. null when none matches: the walk does not invent a fix.
 * @param {string} text @param {[RegExp, string | ((m: RegExpExecArray) => string)][]} table @returns {string | null}
 */
export function fixFor(text, table) {
  for (const [re, fix] of table) {
    const m = re.exec(String(text));
    if (m) return typeof fix === 'function' ? fix(m) : fix;
  }
  return null;
}
