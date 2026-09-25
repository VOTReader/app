/* Anonymous usage counts (us1) - the app side of stats.votreader.workers.dev.
   ─────────────────────────────────────────────────────────────────────────────
   Corbin 2026-09-24 22:4x: anonymous usage stats on Cloudflare, a first-run
   notice, the "no telemetry" line dropped. Design:
   D:\AgentBackbone\reports\phone-audio-and-growth-2026-09-24\04-usage-statistics-design.md

   What this does:
   - count(name, key, n) tallies into today's bucket, in memory and in one
     localStorage key; nothing leaves the device at count time.
   - A day's bucket becomes a sealed batch (a random id; never changed again, so
     a resend is byte-identical and the server keeps it once) when the day
     changes or on flush. Sealed batches queue offline: 30 batches / 64 KB, the
     oldest dropped first.
   - flush() sends the queue: sendBeacon when the app goes hidden, fetch
     keepalive otherwise (app start, back online, every 15 min). A batch leaves
     the queue on 2xx, is dropped on a 4xx, and waits on backoff otherwise.
   - Active readers are counted without an id: the first use of a day carries
     d / w / m / first flags (first that day / ISO week / month / ever), the way
     Brave's usage ping does. The flags travel in a batch of their own, with no
     counts, so the install week (the one per-device constant) never sits beside
     what was read; the server keeps neither the IP nor the country, and the
     receive time only to the day.
   - Nothing is sent until the first-run notice has been shown.

   What it never sends: a device id, the words searched, error messages,
   anything the reader wrote. The format is utils/usage-schema.js.

   Silent (no counting, no network) when the reader turned it off, under
   automation (navigator.webdriver), on localhost, or under vitest - so smoke
   runs, tests and the preview server never reach the real numbers.
   `?stats=force` in the URL lifts the automation/localhost guard. */

import { USAGE_VERSION, USAGE_EVENTS, USAGE_KEY_RE, USAGE_LIMITS, isoWeek } from './usage-schema.js';

export const USAGE_ENDPOINT = 'https://stats.votreader.workers.dev/v1/b';
export const USAGE_STORAGE_KEY = 'vot.usage.v1';
export const USAGE_ENABLED_KEY = 'vot.usage.enabled';
export const USAGE_NOTICE_KEY = 'vot.usage.noticed';
export const USAGE_NOTICE_TEXT = 'VOTReader sends anonymous counts (letters opened, minutes listened, errors) to help improve the app. No account, no device ID, nothing you write. Turn it off in Settings > Your Data.';

const MAX_SEALED = 30;
const MAX_QUEUE_BYTES = 64 * 1024;
const BACKOFF_MS = [60e3, 5 * 60e3, 30 * 60e3, 2 * 3600e3, 6 * 3600e3];
const SAVE_EVERY_MS = 60e3;

const pad = (n) => String(n).padStart(2, '0');
/** The device's LOCAL calendar day. */
export const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function uuid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const b = new Uint8Array(16);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/**
 * Automation, localhost and vitest stay silent; `?stats=force` lifts it.
 * @param {any} [win]
 */
export function usageGuarded(win = typeof window !== 'undefined' ? window : undefined) {
  try {
    if (win && /[?&]stats=force\b/.test(win.location?.search || '')) return false;
    const proc = /** @type {any} */ (globalThis).process;
    if (proc && proc.env && proc.env.VITEST) return true;
    if (win?.navigator?.webdriver) return true;
    const host = win?.location?.hostname || '';
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '';
  } catch (_e) {
    return true;
  }
}

/**
 * 'apk' inside the Android app, 'pwa' installed to the home screen, else 'web'.
 * @param {any} [win]
 */
export function usagePlatform(win = typeof window !== 'undefined' ? window : undefined) {
  try {
    if (win?.AndroidBridge || win?.location?.hostname === 'appassets.androidplatform.net') return 'apk';
    if (win?.matchMedia?.('(display-mode: standalone)').matches || win?.navigator?.standalone) return 'pwa';
  } catch (_e) { /* fall through */ }
  return 'web';
}

/**
 * The module, with every outside dependency injectable for tests.
 * @param {any} [o] storage, now, fetch, beacon, guarded, plat, endpoint
 */
export function createUsageStats(o = {}) {
  const storage = o.storage !== undefined ? o.storage : (typeof localStorage !== 'undefined' ? localStorage : null);
  const now = o.now || (() => new Date());
  const fetchFn = o.fetch || (typeof fetch !== 'undefined' ? fetch.bind(globalThis) : null);
  const beacon = o.beacon || ((url, body) => (typeof navigator !== 'undefined' && navigator.sendBeacon ? navigator.sendBeacon(url, body) : false));
  const guarded = o.guarded !== undefined ? o.guarded : usageGuarded();
  const plat = o.plat || usagePlatform();
  const endpoint = o.endpoint || USAGE_ENDPOINT;
  let version = { ver: '', cv: '' };

  const read = (k) => { try { return storage ? storage.getItem(k) : null; } catch (_e) { return null; } };
  const write = (k, v) => { try { if (storage) storage.setItem(k, v); } catch (_e) { /* quota: counts are best-effort */ } };
  const remove = (k) => { try { if (storage) storage.removeItem(k); } catch (_e) { /* ignore */ } };

  /** { open: {day, act, c} | null, sealed: [], last: {day, week, month} | null, iw, retry: {at, n} } */
  let state;
  try { state = JSON.parse(read(USAGE_STORAGE_KEY) || 'null'); } catch (_e) { state = null; }
  if (!state || typeof state !== 'object' || !Array.isArray(state.sealed)) {
    state = { open: null, sealed: [], last: null, iw: null, retry: { at: 0, n: 0 } };
  }
  let dirty = false;
  let lastSave = 0;

  const enabled = () => !guarded && read(USAGE_ENABLED_KEY) !== '0';

  function save(force) {
    if (!dirty) return;
    const t = now().getTime();
    if (!force && t - lastSave < SAVE_EVERY_MS) return;
    write(USAGE_STORAGE_KEY, JSON.stringify(state));
    dirty = false;
    lastSave = t;
  }

  function seal() {
    const o = state.open;
    state.open = null;
    if (!o || (!o.act && !Object.keys(o.c).length)) return;
    // The day's active flags travel ALONE, with no counts, and the counts travel without
    // the flags: the one field that is the same for a device every day (its install week)
    // never sits beside what it read (us1 refutation).
    const base = { v: USAGE_VERSION, day: o.day, plat, ver: version.ver, cv: version.cv, rate: 1 };
    if (o.act) state.sealed.push({ ...base, id: uuid(), act: o.act, c: {} });
    if (Object.keys(o.c).length) state.sealed.push({ ...base, id: uuid(), act: null, c: o.c });
    while (state.sealed.length > MAX_SEALED || (state.sealed.length > 1 && JSON.stringify(state.sealed).length > MAX_QUEUE_BYTES)) {
      state.sealed.shift();
    }
    dirty = true;
  }

  /** Today's bucket; the day's first use carries the active flags. */
  function bucket() {
    const d = now();
    const day = localDay(d);
    if (state.open && state.open.day !== day) seal();
    if (!state.open) {
      const week = isoWeek(d);
      const month = day.slice(0, 7);
      const last = state.last;
      let act = null;
      if (!last || last.day !== day) {
        if (!state.iw) state.iw = week;
        act = { d: 1, w: !last || last.week !== week ? 1 : 0, m: !last || last.month !== month ? 1 : 0, first: last ? 0 : 1, iw: state.iw };
        state.last = { day, week, month };
      }
      state.open = { day, act, c: {} };
      dirty = true;
    }
    return state.open;
  }

  function add(name, key, n) {
    if (!enabled()) return;
    if (!Object.prototype.hasOwnProperty.call(USAGE_EVENTS, name)) return;
    let k = String(key == null ? '' : key).toLowerCase().replace(/\s+/g, '_').slice(0, 80);
    if (!USAGE_KEY_RE.test(k)) k = 'other';
    const b = bucket();
    let slot = `${name}|${k}`;
    // Room for one '<name>|other' per event name inside the server's key ceiling.
    const room = USAGE_LIMITS.maxKeys - Object.keys(USAGE_EVENTS).length;
    if (!(slot in b.c) && Object.keys(b.c).length >= room) slot = `${name}|other`;
    b.c[slot] = Math.min((b.c[slot] || 0) + n, USAGE_EVENTS[name]);
    dirty = true;
    save(false);
  }

  let sending = false;
  async function flush(reason = 'timer') {
    if (!enabled()) return;
    bucket(); // today's active flags exist even on a day with no counted event
    seal();
    save(true);
    // Nothing leaves before the reader has seen the first-run notice (us1 refutation).
    if (read(USAGE_NOTICE_KEY) !== '1') return;
    if (!state.sealed.length || sending) return;
    const t = now().getTime();
    if (reason !== 'hidden' && state.retry.at > t) return;
    sending = true;
    try {
      while (state.sealed.length) {
        const b = state.sealed[0];
        const body = JSON.stringify(b);
        let status = 0;
        if (reason === 'hidden') {
          // The last reliable moment: a beacon survives the page going away. No reply comes back.
          status = beacon(endpoint, new Blob([body], { type: 'text/plain' })) ? 204 : 0;
        } else if (fetchFn) {
          try {
            const res = await fetchFn(endpoint, { method: 'POST', body, keepalive: true, headers: { 'Content-Type': 'text/plain' }, credentials: 'omit' });
            status = res.status;
          } catch (_e) { status = 0; }
        }
        if (status >= 200 && status < 300) {
          state.sealed.shift();
          state.retry = { at: 0, n: 0 };
        } else if (status >= 400 && status < 500 && status !== 429) {
          state.sealed.shift(); // the server refused this batch: it never comes back
        } else {
          const n = Math.min(state.retry.n, BACKOFF_MS.length - 1);
          const jitter = 0.8 + Math.random() * 0.4;
          state.retry = { at: now().getTime() + BACKOFF_MS[n] * jitter, n: state.retry.n + 1 };
          break;
        }
        dirty = true;
      }
    } finally {
      sending = false;
      save(true);
    }
  }

  return {
    /** Count one or more of an event. */
    count(name, key, n = 1) { add(name, key, typeof n === 'number' && n > 0 ? n : 1); },
    /** Add seconds (listening), at most 60 per call so one bad tick cannot inflate a day. */
    addSeconds(name, key, s) { if (typeof s === 'number' && s > 0) add(name, key, Math.min(s, 60)); },
    flush,
    /** Start of a session: today's flags, then send what is queued. */
    start(v) {
      if (v) version = { ver: v.cacheVersion || v.ver || '', cv: v.corpusVersion || v.cv || '' };
      if (!enabled()) return Promise.resolve();
      bucket();
      return flush('start');
    },
    setVersion(v) { if (v) version = { ver: v.cacheVersion || '', cv: v.corpusVersion || '' }; },
    isEnabled: () => read(USAGE_ENABLED_KEY) !== '0',
    isGuarded: () => guarded,
    /** The Settings switch. Off clears everything queued and stops all network use. */
    setEnabled(on) {
      if (on) {
        remove(USAGE_ENABLED_KEY);
      } else {
        write(USAGE_ENABLED_KEY, '0');
        state = { open: null, sealed: [], last: state.last, iw: state.iw, retry: { at: 0, n: 0 } };
        dirty = true;
        save(true);
      }
    },
    /** What would be sent: the queued batches plus today's open bucket, exactly as JSON. */
    snapshot() {
      const open = state.open ? { v: USAGE_VERSION, id: '(assigned when sent)', day: state.open.day, plat, ver: version.ver, cv: version.cv, rate: 1, act: state.open.act, c: state.open.c } : null;
      return { endpoint, queued: state.sealed.slice(), today: open };
    },
    /** Clear All Personal Data: forget the queue and the day/install record (a wiped app is a new install); the switch stays. */
    reset() {
      state = { open: null, sealed: [], last: null, iw: null, retry: { at: 0, n: 0 } };
      dirty = true;
      save(true);
    },
    /** First-run notice: shown once, then remembered. */
    needsNotice: () => enabled() && read(USAGE_NOTICE_KEY) !== '1',
    markNoticed() { write(USAGE_NOTICE_KEY, '1'); },
    save: () => save(true),
  };
}

/**
 * The app's one instance, wired to the page lifecycle: flush when hidden (the
 * last reliable moment), when back online, and every 15 minutes in the foreground.
 * showNotice(text) puts the one-time first-run notice on screen (Corbin 09-24:
 * a first-run notice); it is marked seen once shown.
 * @param {any} [win]
 * @param {() => Promise<any>} [getVersion]
 * @param {(text: string) => void} [showNotice]
 */
export function installUsageStats(win = typeof window !== 'undefined' ? window : undefined, getVersion, showNotice) {
  const stats = createUsageStats();
  if (!win || stats.isGuarded()) return stats;
  const run = (fn) => { try { fn(); } catch (_e) { /* stats never break the app */ } };
  win.document?.addEventListener?.('visibilitychange', () => {
    run(() => { if (win.document.visibilityState === 'hidden') stats.flush('hidden'); });
  });
  win.addEventListener?.('online', () => run(() => stats.flush('online')));
  // The browser's own install signals (the PWA); the app's install reminder counts its own.
  win.addEventListener?.('beforeinstallprompt', () => run(() => stats.count('install', 'prompt_available')));
  win.addEventListener?.('appinstalled', () => run(() => stats.count('install', 'appinstalled')));
  win.setInterval?.(() => run(() => { if (win.document?.visibilityState !== 'hidden') stats.flush('timer'); }), 15 * 60e3);
  const begin = async () => {
    let v = null;
    try { v = getVersion ? await getVersion() : null; } catch (_e) { v = null; }
    // The notice first: nothing is sent until it has been shown.
    run(() => {
      if (showNotice && stats.needsNotice()) {
        showNotice(USAGE_NOTICE_TEXT);
        stats.markNoticed();
      }
    });
    run(() => stats.start(v));
  };
  if (typeof win.requestIdleCallback === 'function') win.requestIdleCallback(() => begin(), { timeout: 10000 });
  else win.setTimeout?.(begin, 3000);
  return stats;
}
