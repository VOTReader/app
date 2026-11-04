// @ts-nocheck — test-only helper (vitest); never bundled.
/* Leak harness: counts what a screen leaves running after it unmounts (leak hunt, 2026-11-01).
   ─────────────────────────────────────────────────────────────────────
   Readers keep the app open for hours and move between screens and reader tabs all
   day, so anything a screen starts and never stops piles up. installLeakHarness()
   wraps the APIs a screen can start things with and keeps one live record per thing:

     listener   addEventListener on a target that outlives the screen: window,
                document, <html>, <body>, a MediaQueryList, visualViewport, or any
                element still connected to the document (the shared scroller, a
                portal host). Listeners on nodes that left the document go with them.
     interval   setInterval not yet cleared
     timeout    setTimeout not yet fired or cleared
     raf        requestAnimationFrame not yet fired or cancelled (a loop that
                re-arms itself stays at 1 forever)
     observer   ResizeObserver / IntersectionObserver / MutationObserver observing
     sub        a store subscription (any `subscribe` on a global object, plus the
                objects passed in `stores`) whose unsubscribe was never called
     broadcast  BroadcastChannel not closed
     idb        IndexedDB connection not closed
     objecturl  URL.createObjectURL not revoked

   expectNoLeaks(mount, { cycles }) mounts and unmounts `mount()` that many times
   and requires every count to come back to its baseline after each unmount. The
   baseline is taken after one warm-up cycle, so module-level singletons a screen
   creates once per app (a store opening its database, a lazy cache) are not leaks;
   anything that grows per mount is. Each record keeps the stack that created it,
   so a failure names the line to fix; every record names a site, the nearest library or
   runner frame when no app frame exists. Only a record whose creation stack holds an app
   frame (src/, a test file, the setup) is counted against the screen: one with none (a
   library's own continuation landing mid-cycle, the CI flake of 2026-11-01) is returned as a
   stray, and two or more of them alive at once still fail, since that is something piling
   up. After an unmount the harness waits LINGER_MS
   (real time) before counting: a zero-delay deferral may finish, but a timer, a
   frame loop or an observer still going after that is still going. */

import { appendFileSync } from 'node:fs';
import { vi } from 'vitest';
import { cleanup, act } from '@testing-library/react';

export const LINGER_MS = 40;

/* A leak check counts what a screen leaves running; it is not a latency test. Its 20 cycles wait in real time
   (LINGER_MS twice a cycle, plus the renders), so on a loaded machine (the full suite beside other lanes' runs at
   ~95 % CPU, 2026-11-04) one test ran past vitest's 20 s default and failed while every count was clean; and a
   timed-out test's loop goes on in the background, calling cleanup() under the next tests in its file (their
   "Unable to fire a change event" and missing-button failures that night). Every file that uses the harness
   imports this module, so the ceiling is set here, once, for those files only. A real hang still fails. */
export const LEAK_TEST_TIMEOUT_MS = 180000;
vi.setConfig({ testTimeout: LEAK_TEST_TIMEOUT_MS });

const realSetTimeout = globalThis.setTimeout.bind(globalThis);
const sleep = (ms) => new Promise((r) => realSetTimeout(r, ms));

/**
 * Where a record was created: the app's own frames when there are any (src/, the test file,
 * the setup), else the nearest frames of any kind (a library, the runner), so a record always
 * names a site. `own` says whether any frame is the app's.
 * @returns {{ stack: string, own: boolean }}
 */
function creationSite() {
  // Deep enough that the caller is still in the trace under a coverage run's extra frames.
  const prior = Error.stackTraceLimit;
  Error.stackTraceLimit = 40;
  let raw;
  try { raw = new Error().stack || ''; } finally { Error.stackTraceLimit = prior; }
  const frames = raw.split('\n').slice(1).map((l) => l.trim()).filter((l) => l.startsWith('at ') && !/leak-harness\.js/.test(l));
  const short = (l) => l.replace(/\(?(?:file:\/\/)?\/[^\s]*?\/assets\/src\//g, '(').replace(/\(?(?:file:\/\/)?\/[^\s]*?\/node_modules\//g, '(node_modules/');
  const own = frames.filter((l) => !/node_modules|[( ]node:/.test(l));   // node:internal, node:async_hooks, …
  const pick = own.length ? own : frames;
  return {
    stack: pick.length ? pick.slice(0, 5).map(short).join(' | ') : '(no stack frames: started outside any JS call site)',
    own: own.length > 0,
  };
}
const shortStack = () => creationSite().stack;

/**
 * Wrap the APIs. Returns { counts, live, restore }.
 * @param {{ stores?: Record<string, any> }} [opts]
 */
export function installLeakHarness(opts = {}) {
  const w = window;
  let seq = 0;
  const live = new Map();
  const undo = [];
  const add = (kind, desc, extra) => { const id = ++seq; const site = creationSite(); live.set(id, { kind, desc, stack: site.stack, own: site.own, ...extra }); return id; };
  // A callback a mounted screen scheduled that runs after the screen is gone: recorded
  // while `watch` is set (from the unmount until the count), whatever its delay.
  let watch = null; // { from, to } — ids created by the cycle that just unmounted
  const late = [];
  const ran = (id) => {
    if (!watch || !id || id <= watch.from || id > watch.to) return;
    const v = live.get(id);
    // A zero-delay timeout is a deferral (the same turn's follow-up, e.g. a focus handler's),
    // not something the screen left running; whether it lands before or after an immediate
    // unmount is scheduling luck. Frames and any real delay still count.
    if (v && v.kind === 'timeout' && v.zero) return;
    if (v) late.push({ id, kind: v.kind, desc: v.desc + ', ran after the unmount', stack: v.stack, own: v.own });
  };
  const drop = (id) => { if (id) live.delete(id); };
  const patch = (obj, key, value) => {
    const had = Object.prototype.hasOwnProperty.call(obj, key);
    const prior = obj[key];
    obj[key] = value;
    undo.push(() => { if (had) obj[key] = prior; else delete obj[key]; });
  };

  // ── listeners ──
  // EventTarget.prototype for every node; window's own copies too (vitest hands the
  // jsdom window's methods to globalThis as own properties, past the prototype).
  const ET = w.EventTarget.prototype;
  const protoAdd = ET.addEventListener, protoRemove = ET.removeEventListener;
  const listenerIds = new WeakMap(); // target -> Map(key -> Map(fn -> id))
  const capOf = (o) => (typeof o === 'boolean' ? o : !!(o && o.capture));
  const track = (target, type, fn, o, realAdd) => {
    if (!fn) return;
    let m = listenerIds.get(target);
    if (!m) { m = new Map(); listenerIds.set(target, m); }
    const key = type + '|' + capOf(o);
    let byFn = m.get(key);
    if (!byFn) { byFn = new Map(); m.set(key, byFn); }
    if (byFn.has(fn)) return;
    byFn.set(fn, add('listener', describeTarget(target) + ':' + type, { target }));
    const forget = () => { drop(byFn.get(fn)); byFn.delete(fn); };
    if (o && typeof o === 'object' && o.signal && typeof o.signal.addEventListener === 'function') o.signal.addEventListener('abort', forget);
    if (o && typeof o === 'object' && o.once) realAdd.call(target, type, forget, { once: true, capture: capOf(o) });
  };
  const untrack = (target, type, fn, o) => {
    const m = listenerIds.get(target);
    const byFn = m && m.get(type + '|' + capOf(o));
    if (byFn && byFn.has(fn)) { drop(byFn.get(fn)); byFn.delete(fn); }
  };
  patch(ET, 'addEventListener', function (type, fn, o) { track(this, type, fn, o, protoAdd); return protoAdd.call(this, type, fn, o); });
  patch(ET, 'removeEventListener', function (type, fn, o) { untrack(this, type, fn, o); return protoRemove.call(this, type, fn, o); });
  if (Object.prototype.hasOwnProperty.call(w, 'addEventListener')) {
    const winAdd = w.addEventListener, winRemove = w.removeEventListener;
    patch(w, 'addEventListener', function (type, fn, o) { track(w, type, fn, o, winAdd); return winAdd.call(w, type, fn, o); });
    patch(w, 'removeEventListener', function (type, fn, o) { untrack(w, type, fn, o); return winRemove.call(w, type, fn, o); });
  }

  // ── timers and frames ──
  const realSI = w.setInterval, realCI = w.clearInterval, realST = w.setTimeout, realCT = w.clearTimeout;
  const timerIds = new Map();
  const rel = (h) => { const k = h && typeof h === 'object' && h[Symbol.toPrimitive] ? +h : h; return k; };
  patch(w, 'setInterval', function (fn, ms, ...args) {
    const h = realSI.call(w, fn, ms, ...args);
    timerIds.set(rel(h), add('interval', 'every ' + (ms | 0) + ' ms'));
    return h;
  });
  patch(w, 'clearInterval', function (h) { const k = rel(h); drop(timerIds.get(k)); timerIds.delete(k); return realCI.call(w, h); });
  patch(w, 'setTimeout', function (fn, ms, ...args) {
    let h;
    const run = typeof fn === 'function'
      ? function () { const k = rel(h); const id = timerIds.get(k); ran(id); drop(id); timerIds.delete(k); return fn.apply(this, args); }
      : fn;
    h = realST.call(w, run, ms);
    timerIds.set(rel(h), add('timeout', 'after ' + (ms | 0) + ' ms', { zero: (ms | 0) <= 0 }));
    return h;
  });
  patch(w, 'clearTimeout', function (h) { const k = rel(h); drop(timerIds.get(k)); timerIds.delete(k); return realCT.call(w, h); });
  if (typeof w.requestAnimationFrame === 'function') {
    const realRAF = w.requestAnimationFrame, realCAF = w.cancelAnimationFrame;
    const rafIds = new Map();
    patch(w, 'requestAnimationFrame', function (fn) {
      let h;
      h = realRAF.call(w, (t) => { const id = rafIds.get(h); ran(id); drop(id); rafIds.delete(h); fn(t); });
      rafIds.set(h, add('raf', 'frame'));
      return h;
    });
    patch(w, 'cancelAnimationFrame', function (h) { drop(rafIds.get(h)); rafIds.delete(h); return realCAF.call(w, h); });
  }
  // The same functions on globalThis, which a module may reach without `window.`.
  for (const k of ['setInterval', 'clearInterval', 'setTimeout', 'clearTimeout', 'requestAnimationFrame', 'cancelAnimationFrame']) {
    if (globalThis !== w && typeof w[k] === 'function') patch(globalThis, k, w[k]);
  }

  // ── observers ──
  for (const name of ['ResizeObserver', 'IntersectionObserver', 'MutationObserver']) {
    if (typeof w[name] !== 'function') {
      // jsdom has no layout observers: an inert stand-in that still keeps the books.
      const Fake = class { constructor(cb) { this.cb = cb; } observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
      patch(w, name, Fake);
      if (globalThis !== w) patch(globalThis, name, Fake);
    }
    const P = w[name].prototype;
    const st = new WeakMap();
    const realObs = P.observe, realDis = P.disconnect, realUn = P.unobserve;
    patch(P, 'observe', function (t, o) {
      let s = st.get(this);
      if (!s) { s = { id: 0, targets: new Set() }; st.set(this, s); }
      s.targets.add(t);
      if (!s.id) s.id = add('observer', name);
      return realObs.call(this, t, o);
    });
    patch(P, 'disconnect', function () { const s = st.get(this); if (s) { drop(s.id); s.id = 0; s.targets.clear(); } return realDis.call(this); });
    if (realUn) patch(P, 'unobserve', function (t) { const s = st.get(this); if (s) { s.targets.delete(t); if (!s.targets.size) { drop(s.id); s.id = 0; } } return realUn.call(this, t); });
  }

  // ── BroadcastChannel ──
  if (typeof w.BroadcastChannel === 'function') {
    const P = w.BroadcastChannel.prototype;
    const ids = new WeakMap();
    const RealBC = w.BroadcastChannel;
    const Wrapped = function (n) { const b = new RealBC(n); ids.set(b, add('broadcast', 'channel ' + n)); return b; };
    Wrapped.prototype = P;
    patch(w, 'BroadcastChannel', Wrapped);
    const realClose = P.close;
    patch(P, 'close', function () { drop(ids.get(this)); ids.delete(this); return realClose.call(this); });
  }

  // ── IndexedDB ──
  if (w.indexedDB && typeof w.indexedDB.open === 'function') {
    const idb = w.indexedDB;
    const realOpen = idb.open;
    const dbIds = new WeakMap();
    patch(idb, 'open', function (name, ...rest) {
      const req = realOpen.call(idb, name, ...rest);
      const stack = shortStack();
      req.addEventListener('success', () => {
        const db = req.result;
        if (!db || dbIds.has(db)) return;
        const id = ++seq;
        live.set(id, { kind: 'idb', desc: 'database ' + name, stack });
        dbIds.set(db, id);
        const realClose = db.close;
        db.close = function () { drop(dbIds.get(db)); return realClose.call(db); };
      });
      return req;
    });
  }

  // ── object URLs ──
  const U = w.URL;
  const urlIds = new Map();
  const realCreate = typeof U.createObjectURL === 'function' ? U.createObjectURL : (() => { let n = 0; return () => 'blob:leak-harness/' + (++n); })();
  const realRevoke = typeof U.revokeObjectURL === 'function' ? U.revokeObjectURL : () => {};
  patch(U, 'createObjectURL', function (b) { const u = realCreate.call(U, b); urlIds.set(u, add('objecturl', 'url for ' + ((b && b.type) || 'blob'))); return u; });
  patch(U, 'revokeObjectURL', function (u) { drop(urlIds.get(u)); urlIds.delete(u); return realRevoke.call(U, u); });

  // ── store subscriptions ──
  const subTargets = new Map();
  for (const k of Object.getOwnPropertyNames(globalThis)) {
    let o;
    try { o = globalThis[k]; } catch (_e) { continue; }
    if (o && (typeof o === 'object' || typeof o === 'function') && typeof o.subscribe === 'function' && k !== 'window') subTargets.set(o, k);
  }
  for (const [k, o] of Object.entries(opts.stores || {})) if (o && typeof o.subscribe === 'function') subTargets.set(o, k);
  const wrapSub = (o, name) => {
    const realSub = o.subscribe;
    if (realSub.__leakWrapped) return;
    const wrapped = function (...args) {
      const un = realSub.apply(this, args);
      if (typeof un !== 'function') return un;
      const id = add('sub', name + '.subscribe');
      let done = false;
      return function (...a) { if (!done) { done = true; drop(id); } return un.apply(this, a); };
    };
    wrapped.__leakWrapped = true;
    try { patch(o, 'subscribe', wrapped); } catch (_e) { /* frozen: not counted */ }
  };
  for (const [o, name] of subTargets) wrapSub(o, name);

  const counted = (v) => {
    if (v.kind !== 'listener') return true;
    const t = v.target;
    if (!t) return true;
    if (t === w || t === document || (w.visualViewport && t === w.visualViewport)) return true;
    if (typeof t.nodeType === 'number') return t.isConnected; // a node that left the document takes its listeners along
    // A MediaQueryList is held by the document's media list; a request, an <audio> or a
    // reader made for one job goes with its owner, so it is not counted.
    const n = t.constructor && t.constructor.name;
    return n === 'MediaQueryList' || n === 'BroadcastChannel';
  };

  return {
    /** counts by kind */
    counts() {
      const c = {};
      live.forEach((v) => { if (counted(v) && v.own !== false) c[v.kind] = (c[v.kind] || 0) + 1; });
      return c;
    },
    /** live records, for a failure message */
    live() { const out = []; live.forEach((v, id) => { if (counted(v)) out.push({ id, kind: v.kind, desc: v.desc, stack: v.stack, own: v.own !== false }); }); return out; },
    /** the id of the newest record */
    seq() { return seq; },
    /** Watch for callbacks created in (from, to] running from now on; `stop()` returns them. */
    watchLate(from, to) { late.length = 0; watch = { from, to }; },
    stopWatch() { watch = null; return late.splice(0); },
    /** Wrap one more store's subscribe (a store reached by import rather than as a global). */
    trackStore(name, o) { if (o && typeof o.subscribe === 'function') wrapSub(o, name); },
    restore() { while (undo.length) undo.pop()(); live.clear(); },
  };
}

function describeTarget(t) {
  if (t === window) return 'window';
  if (t === document) return 'document';
  if (t && t.nodeType === 1) return t.tagName.toLowerCase() + (t.className && typeof t.className === 'string' ? '.' + t.className.trim().split(/\s+/)[0] : '');
  return (t && t.constructor && t.constructor.name) || 'target';
}

/** Let effects, microtasks and zero-delay deferrals run. */
export async function settle(ms = LINGER_MS) {
  await act(async () => { await sleep(ms); });
}

/**
 * Mount `mount()` and unmount it `cycles` times (one warm-up first); every count must be back at the
 * baseline after each unmount. Returns { baseline, cycles: [{ counts, extra }] } and throws on a leak.
 * @param {ReturnType<typeof installLeakHarness>} h
 * @param {() => any} mount renders the screen (Testing Library's render); may return { unmount }
 * @param {{ cycles?: number, interact?: (r: any) => any, unmountAt?: 'interact', label?: string, allowLate?: RegExp[] }} [o]
 */
export async function expectNoLeaks(h, mount, o = {}) {
  const cycles = o.cycles == null ? 20 : o.cycles;
  const once = async () => {
    const from = h.seq();
    // Not wrapped in act: render() and fireEvent act for themselves, and a mount
    // helper that clicks after rendering must see each click land before the next.
    const r = mount();
    await settle();
    // unmountAt: 'interact' unmounts in the same task as the interaction, before
    // anything it scheduled could run: the reader who taps and leaves at once.
    if (o.interact) { await o.interact(r); if (o.unmountAt !== 'interact') await settle(); }
    h.watchLate(from, h.seq());
    await act(async () => { if (r && typeof r.unmount === 'function') r.unmount(); cleanup(); });
    await settle();
    return h.stopWatch();
  };
  await once(); // warm-up: once-per-app singletons start here, and are not counted
  const baseline = h.counts();
  const foreignBefore = new Set(h.live().filter((x) => !x.own).map((x) => x.id));
  /** Unattributed records: no app frame in their creation stack (a library's or the runner's own). */
  const strays = [];
  for (let i = 0; i < cycles; i++) {
    const mark = h.seq();
    const ranLate = await once();
    // Anything this cycle started that is still alive after its unmount is a leak,
    // whatever else came and went meanwhile; so is a timer or frame of the screen's
    // that ran after the unmount (a short one is gone by the count, but it ran
    // against a screen that was not there any more).
    const fresh = [...h.live().filter((x) => x.id > mark), ...ranLate.filter((x) => (o.allowLate || []).every((re) => !re.test(x.stack)))];
    // Only a record the app's code started is the screen's (a library call the screen made
    // synchronously still has the screen's frame under it). One with no app frame at all is
    // reported, not failed: a single one is the runner's or a library's own business landing
    // mid-cycle. Two or more alive at once means something is piling up, and that fails.
    const extra = fresh.filter((x) => x.own !== false);
    for (const x of fresh) if (x.own === false && !strays.some((s) => s.id === x.id)) strays.push(x);
    const foreignAlive = h.live().filter((x) => !x.own && !foreignBefore.has(x.id));
    if (foreignAlive.length >= 2) extra.push(...foreignAlive);
    if (extra.length) {
      const by = {};
      for (const x of extra) by[x.kind] = (by[x.kind] || 0) + 1;
      const lines = extra.slice(0, 12).map((x) => `  ${x.kind} ${x.desc} @ ${x.stack}`).join('\n');
      throw new Error(`${o.label || 'screen'}: after unmount ${i + 1} of ${cycles}, still running: ${Object.entries(by).map(([k, n]) => `${k} +${n}`).join(', ')}\n${lines}`);
    }
    const now = h.counts();
    const grew = Object.keys(now).filter((k) => (now[k] || 0) > (baseline[k] || 0));
    if (grew.length) throw new Error(`${o.label || 'screen'}: after unmount ${i + 1} of ${cycles}, ${grew.map((k) => `${k} ${baseline[k] || 0} -> ${now[k]}`).join(', ')} above the baseline:\n` + h.live().filter((x) => x.own).map((x) => `  ${x.kind} ${x.desc} @ ${x.stack}`).slice(0, 12).join('\n'));
  }
  // LEAK_STRAYS_LOG=<file>: append each stray (label, kind, site) there, for a soak run's tally.
  const env = /** @type {any} */ (globalThis).process && /** @type {any} */ (globalThis).process.env;
  const log = env && env.LEAK_STRAYS_LOG;
  if (log && strays.length) {
    try { appendFileSync(log, strays.map((x) => `${o.label || 'screen'}\t${x.kind} ${x.desc}\t${x.stack}\n`).join('')); } catch (_e) { /* a tally, never a verdict */ }
  }
  return { baseline, strays };
}
