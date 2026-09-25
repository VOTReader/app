/* The stats Worker (us1): ingest, dedupe, CORS, rollups and the dashboard, on real SQL. */
import { describe, it, expect, beforeEach } from 'vitest';
import worker, { ingest, rollup, ALLOWED_ORIGINS } from '../src/index.js';
import { makeD1 } from './d1-sqlite.js';

const NOW = Date.parse('2026-09-25T12:00:00Z');
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

function batch(n, over = {}) {
  return {
    v: 1, id: uuid(n), day: '2026-09-25', plat: 'apk', ver: 'v1.0.2-abc', cv: 'c61', rate: 1,
    act: { d: 1, w: 1, m: 1, first: 0, iw: '2026-W39' },
    c: { 'open|letter:v1:12': 2, 'listen_s|bible:nkjv': 300 },
    ...over,
  };
}

function post(body, { origin = ALLOWED_ORIGINS[0], type = 'text/plain;charset=UTF-8', country = 'NZ', dev = false } = {}) {
  const headers = { 'Content-Type': type };
  if (origin) headers.Origin = origin;
  if (dev) headers['X-Stats-Dev'] = '1';
  const req = new Request('https://stats.votreader.workers.dev/v1/b', {
    method: 'POST', headers, body: typeof body === 'string' ? body : JSON.stringify(body),
  });
  Object.defineProperty(req, 'cf', { value: { country } });
  return req;
}

let env;
beforeEach(() => { env = { DB: makeD1(), DASH_KEY: 'k'.repeat(32) }; });
const rows = (sql, ...a) => env.DB.raw.prepare(sql).all(...a);

describe('POST /v1/b', () => {
  it('stores a valid batch once; a resend is ignored and counted as a duplicate', async () => {
    expect(await ingest(post(batch(1)), env, NOW)).toEqual([204, 'stored']);
    expect(await ingest(post(batch(1)), env, NOW)).toEqual([200, 'duplicate']);
    expect(rows('SELECT id, country, d FROM batches')).toEqual([{ id: uuid(1), country: 'NZ', d: 1 }]);
    expect(rows('SELECT reason, n FROM rejects')).toEqual([{ reason: 'duplicate', n: 1 }]);
  });

  it('keeps no IP and no device id: the table has no column that could hold one', () => {
    const cols = rows('PRAGMA table_info(batches)').map((c) => c.name);
    expect(cols).not.toContain('ip');
    expect(cols.filter((c) => /ip|device|user|ua/i.test(c))).toEqual([]);
  });

  it('refuses a foreign origin, a non-text/plain body, an oversize body, bad JSON and an invalid batch', async () => {
    expect((await ingest(post(batch(2), { origin: 'https://evil.example' }), env, NOW))[0]).toBe(403);
    expect((await ingest(post(batch(3), { origin: '' }), env, NOW))[0]).toBe(403);
    expect((await ingest(post(batch(4), { type: 'application/json' }), env, NOW))[0]).toBe(415);
    expect((await ingest(post('x'.repeat(40000)), env, NOW))[0]).toBe(413);
    expect((await ingest(post('{not json'), env, NOW))[0]).toBe(400);
    expect((await ingest(post(batch(5, { c: { 'steal|x': 1 } })), env, NOW))[0]).toBe(422);
    expect((await ingest(post(batch(6, { day: '2026-01-01' })), env, NOW))[0]).toBe(422);
    expect(rows('SELECT COUNT(*) AS n FROM batches')[0].n).toBe(0);
    expect(rows('SELECT SUM(n) AS n FROM rejects')[0].n).toBe(7);
  });

  it('clamps a buggy client\'s huge numbers', async () => {
    await ingest(post(batch(7, { c: { 'listen_s|bible:nkjv': 9e9, 'open|x': 1e6 } })), env, NOW);
    expect(JSON.parse(rows('SELECT body FROM batches')[0].body)).toEqual({ 'listen_s|bible:nkjv': 86400, 'open|x': 5000 });
  });

  it('answers CORS for the two app origins only', async () => {
    const opt = (origin) => worker.fetch(new Request('https://s/v1/b', { method: 'OPTIONS', headers: { Origin: origin } }), env);
    expect((await opt('https://appassets.androidplatform.net')).headers.get('Access-Control-Allow-Origin')).toBe('https://appassets.androidplatform.net');
    expect((await opt('https://votreader.github.io')).headers.get('Access-Control-Allow-Origin')).toBe('https://votreader.github.io');
    expect((await opt('https://evil.example')).headers.get('Access-Control-Allow-Origin')).toBeNull();
  });
});

describe('rollup', () => {
  async function seed() {
    // Two devices on Mon 09-21 (one new install), one again on Tue 09-22 (not first that week), one on Mon 09-28.
    const days = [
      ['2026-09-21', { d: 1, w: 1, m: 0, first: 1, iw: '2026-W39' }, 'apk'],
      ['2026-09-21', { d: 1, w: 1, m: 1, first: 0, iw: '2026-W38' }, 'pwa'],
      ['2026-09-22', { d: 1, w: 0, m: 0, first: 0, iw: '2026-W39' }, 'apk'],
      ['2026-09-28', { d: 1, w: 1, m: 0, first: 0, iw: '2026-W39' }, 'apk'],
    ];
    let n = 100;
    for (const [day, act, plat] of days) {
      await ingest(post(batch(n++, { day, act, plat })), env, Date.parse(day + 'T20:00:00Z'));
    }
    await ingest(post(batch(n++, { day: '2026-09-22' }), { dev: true }), env, NOW); // test traffic
  }

  it('counts readers per day, first-that-week and installs, and leaves test traffic out', async () => {
    await seed();
    await rollup(env, '2026-09-01', Date.parse('2026-09-29T03:17:00Z'));
    expect(rows('SELECT day, SUM(d) d, SUM(w) w, SUM(first) f FROM actives GROUP BY day ORDER BY day')).toEqual([
      { day: '2026-09-21', d: 2, w: 2, f: 1 },
      { day: '2026-09-22', d: 1, w: 0, f: 0 },
      { day: '2026-09-28', d: 1, w: 1, f: 0 },
    ]);
    // listen_s summed across the three apk days + one pwa day (the dev batch excluded).
    expect(rows("SELECT SUM(value) v FROM metrics WHERE name = 'listen_s'")[0].v).toBe(1200);
    expect(rows("SELECT iw, SUM(w) w FROM cohorts GROUP BY iw ORDER BY iw")).toEqual([
      { iw: '2026-W38', w: 1 }, { iw: '2026-W39', w: 2 },
    ]);
  });

  it('is idempotent: a second rollup of the same days gives the same numbers', async () => {
    await seed();
    await rollup(env, '2026-09-01', NOW);
    const once = rows('SELECT * FROM metrics ORDER BY day, name, key, plat');
    await rollup(env, '2026-09-01', NOW);
    expect(rows('SELECT * FROM metrics ORDER BY day, name, key, plat')).toEqual(once);
  });

  it('drops raw batches after 90 days and keeps the rollups', async () => {
    await ingest(post(batch(200, { day: '2026-09-20' })), env, Date.parse('2026-09-20T12:00:00Z'));
    await rollup(env, '2026-09-01', Date.parse('2026-09-21T03:17:00Z'));
    await rollup(env, '2026-12-01', Date.parse('2026-12-25T03:17:00Z'));
    expect(rows('SELECT COUNT(*) n FROM batches')[0].n).toBe(0);
    expect(rows("SELECT COUNT(*) n FROM metrics WHERE day = '2026-09-20'")[0].n).toBeGreaterThan(0);
  });
});

describe('GET /dash', () => {
  it('is a 404 without the secret key, and the page with it', async () => {
    const get = (q) => worker.fetch(new Request(`https://s/dash${q}`), env);
    expect((await get('')).status).toBe(404);
    expect((await get('?k=wrong')).status).toBe(404);
    await ingest(post(batch(300, { day: new Date().toISOString().slice(0, 10) })), env);
    const res = await get(`?k=${'k'.repeat(32)}`);
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    const html = await res.text();
    expect(html).toContain('readers today');
    expect(html).toMatch(/letter:v1:12/);
    expect(html).not.toMatch(/<script/i);
  });
});
