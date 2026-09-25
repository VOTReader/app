/* us1: the app's anonymous usage counts - flags, the offline queue, sending, opt-out, guards. */
import { describe, it, expect, beforeEach } from 'vitest';
import { createUsageStats, usageGuarded, usagePlatform, USAGE_STORAGE_KEY, USAGE_ENABLED_KEY } from './usage-stats.js';
import { validateBatch } from './usage-schema.js';

function memStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), m };
}

let storage, clock, sent, status, beacons;
function make(over = {}) {
  return createUsageStats({
    storage,
    now: () => new Date(clock),
    fetch: async (url, init) => { sent.push(JSON.parse(init.body)); return { status: typeof status === 'function' ? status() : status }; },
    beacon: (url, blob) => { beacons.push(blob); return true; },
    guarded: false,
    plat: 'pwa',
    ...over,
  });
}
beforeEach(() => {
  storage = memStorage();
  clock = new Date(2026, 8, 25, 9, 0).getTime(); // Fri 25 Sep 2026, local time
  sent = [];
  status = 204;
  beacons = [];
});
const at = (y, mo, d, h = 9) => { clock = new Date(y, mo, d, h, 0).getTime(); };

describe('active-reader flags (no device id)', () => {
  it('the first use ever is d, w, m and first; a second use that day sends no flags', async () => {
    const s = make();
    await s.start({ cacheVersion: 'v1.0.2-x', corpusVersion: 'c61' });
    s.count('open', 'letter:v1:12');
    await s.flush('timer');
    expect(sent[0].act).toEqual({ d: 1, w: 1, m: 1, first: 1, iw: '2026-W39' });
    expect(sent[0]).toMatchObject({ ver: 'v1.0.2-x', cv: 'c61', plat: 'pwa', day: '2026-09-25' });
    expect(sent[1].act).toBeNull();
    expect(sent[1].c).toEqual({ 'open|letter:v1:12': 1 });
  });

  it('next day in the same week and month: d only; Monday: d + w; the 1st: d + m; install week kept', async () => {
    const s = make();
    await s.start();
    at(2026, 8, 26); await s.start();       // Saturday
    at(2026, 8, 28); await s.start();       // Monday, new ISO week
    at(2026, 9, 1); await s.start();        // Thursday 1 October, new month
    expect(sent.map((b) => b.act)).toEqual([
      { d: 1, w: 1, m: 1, first: 1, iw: '2026-W39' },
      { d: 1, w: 0, m: 0, first: 0, iw: '2026-W39' },
      { d: 1, w: 1, m: 0, first: 0, iw: '2026-W39' },
      { d: 1, w: 0, m: 1, first: 0, iw: '2026-W39' },
    ]);
  });

  it('local midnight splits the day even across a DST change', async () => {
    const s = make();
    at(2026, 9, 24, 23); await s.start();
    s.count('open', 'a');
    at(2026, 9, 25, 1); // 25 Oct 2026: clocks go back in Europe; still a new local day
    s.count('open', 'b');
    await s.flush('timer');
    // start sent 24 Oct's flags; the count before midnight stays on 24 Oct, the one after goes to 25 Oct.
    expect(sent.map((b) => [b.day, b.c])).toEqual([
      ['2026-10-24', {}],
      ['2026-10-24', { 'open|a': 1 }],
      ['2026-10-25', { 'open|b': 1 }],
    ]);
    expect(sent.filter((b) => b.day === '2026-10-25')[0].act).toMatchObject({ d: 1 });
  });
});

describe('the offline queue', () => {
  it('keeps batches while the network is down, then sends them all on one flush', async () => {
    const s = make({ fetch: async () => { throw new Error('offline'); } });
    await s.start();
    for (const day of [26, 27, 28]) { at(2026, 8, day); s.count('open', `d${day}`); await s.flush('timer'); }
    expect(s.snapshot().queued.length).toBe(4);
    const online = make(); // a fresh session reads the stored queue
    clock += 7 * 3600e3;   // past every backoff step
    await online.flush('online');
    expect(sent.map((b) => b.day)).toEqual(['2026-09-25', '2026-09-26', '2026-09-27', '2026-09-28']);
    expect(online.snapshot().queued).toEqual([]);
  });

  it('a resend is the same batch, byte for byte (the server keeps it once)', async () => {
    let fail = true;
    const s = make({ fetch: async (u, init) => { sent.push(init.body); return { status: fail ? 503 : 204 }; } });
    await s.start();
    fail = false;
    clock += 2 * 60e3;
    await s.flush('timer');
    expect(sent.length).toBe(2);
    expect(sent[1]).toBe(sent[0]);
  });

  it('waits out the backoff after a failure, but a hidden-page beacon still goes', async () => {
    status = 503;
    const s = make();
    await s.start();
    expect(s.snapshot().queued.length).toBe(1);
    await s.flush('timer');
    expect(sent.length).toBe(1); // backing off: no second try yet
    await s.flush('hidden');
    expect(beacons.length).toBe(1);
    expect(s.snapshot().queued).toEqual([]);
  });

  it('drops a batch the server refuses (4xx) instead of retrying it forever', async () => {
    status = 422;
    const s = make();
    await s.start();
    expect(s.snapshot().queued).toEqual([]);
  });

  it('caps the queue at 30 batches, dropping the oldest', async () => {
    const s = make({ fetch: async () => { throw new Error('offline'); } });
    for (let i = 0; i < 40; i++) { at(2026, 8, 1 + i); s.count('open', 'x'); await s.flush('timer'); }
    const q = s.snapshot().queued;
    expect(q.length).toBe(30);
    expect(q[q.length - 1].day).toBe('2026-10-10');
  });

  it('every batch it builds passes the server\'s validator', async () => {
    const s = make();
    await s.start({ cacheVersion: 'v1.0.2-x', corpusVersion: 'c61' });
    s.count('open', 'Letter:V1:12'); s.count('search'); s.addSeconds('listen_s', 'bible:nkjv', 500); s.count('feat', 'what a reader typed!');
    await s.flush('timer');
    for (const b of sent) expect(validateBatch(b, '2026-09-25')).toMatchObject({ ok: true });
    expect(sent[1].c).toEqual({ 'open|letter:v1:12': 1, 'search|': 1, 'listen_s|bible:nkjv': 60, 'feat|other': 1 });
  });

  it('ignores event names outside the format', async () => {
    const s = make();
    s.count('keystroke', 'a');
    await s.flush('timer');
    expect(JSON.stringify(sent)).not.toContain('keystroke');
  });
});

describe('opt-out and guards', () => {
  it('switched off: the queue is cleared and nothing is counted or sent', async () => {
    const s = make({ fetch: async () => { throw new Error('offline'); } });
    await s.start(); s.count('open', 'x'); await s.flush('timer');
    s.setEnabled(false);
    expect(s.snapshot().queued).toEqual([]);
    expect(storage.getItem(USAGE_ENABLED_KEY)).toBe('0');
    const calls = [];
    const off = make({ fetch: async () => { calls.push(1); return { status: 204 }; }, beacon: () => { calls.push(1); return true; } });
    await off.start(); off.count('open', 'y'); await off.flush('timer'); await off.flush('hidden');
    expect(calls).toEqual([]);
    expect(JSON.parse(storage.getItem(USAGE_STORAGE_KEY)).sealed).toEqual([]);
  });

  it('guarded (automation, localhost, vitest): no counting and no network at all', async () => {
    const calls = [];
    const s = make({ guarded: true, fetch: async () => { calls.push(1); return { status: 204 }; }, beacon: () => { calls.push(1); return true; } });
    await s.start(); s.count('open', 'x'); await s.flush('timer'); await s.flush('hidden');
    expect(calls).toEqual([]);
    expect(storage.getItem(USAGE_STORAGE_KEY)).toBeNull();
  });

  it('the guard: webdriver, localhost and vitest are silent; ?stats=force lifts it', () => {
    /** @returns {any} */
    const win = (host, extra = {}) => ({ location: { hostname: host, search: extra.search || '' }, navigator: { webdriver: !!extra.webdriver } });
    expect(usageGuarded(win('votreader.github.io'))).toBe(true); // this test runs under vitest
    expect(usageGuarded(win('127.0.0.1', { search: '?stats=force' }))).toBe(false);
  });

  it('the platform: apk inside the Android app, pwa when installed, else web', () => {
    /** @type {any[]} */
    const wins = [
      { AndroidBridge: {}, location: { hostname: 'appassets.androidplatform.net' } },
      { location: { hostname: 'votreader.github.io' }, matchMedia: () => ({ matches: true }) },
      { location: { hostname: 'votreader.github.io' }, matchMedia: () => ({ matches: false }), navigator: {} },
    ];
    expect(wins.map((w) => usagePlatform(w))).toEqual(['apk', 'pwa', 'web']);
  });

  it('snapshot shows exactly what would be sent, and the notice shows once', async () => {
    const s = make({ fetch: async () => { throw new Error('offline'); } });
    await s.start(); s.count('open', 'x');
    const snap = s.snapshot();
    expect(snap.endpoint).toBe('https://stats.votreader.workers.dev/v1/b');
    expect(snap.queued[0].act).toMatchObject({ d: 1 });
    expect(snap.today.c).toEqual({ 'open|x': 1 });
    expect(s.needsNotice()).toBe(true);
    s.markNoticed();
    expect(s.needsNotice()).toBe(false);
  });
});
