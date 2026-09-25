/* VOTReader usage statistics - the Cloudflare Worker (us1).
   ─────────────────────────────────────────────────────────
   POST /v1/b   one device-day batch (text/plain JSON, the shape in
                app/src/main/assets/src/utils/usage-schema.js). Validated, clamped,
                stored once per batch id (a resend is ignored). Neither the IP nor
                the country is read or stored, and the receive time is kept to the day.
   GET  /dash   Corbin's phone page, behind a secret link (?k=DASH_KEY).
   cron         nightly rollup of the last 36 days into metrics / actives /
                cohorts; raw batches kept 90 days, rollups 25 months.
   Design: D:\AgentBackbone\reports\phone-audio-and-growth-2026-09-24\04-usage-statistics-design.md */

import { validateBatch, USAGE_LIMITS } from '../../app/src/main/assets/src/utils/usage-schema.js';
import { renderDash } from './dash.js';

export const ALLOWED_ORIGINS = ['https://votreader.github.io', 'https://appassets.androidplatform.net'];

const utcDay = (ms) => new Date(ms).toISOString().slice(0, 10);

function cors(origin) {
  return ALLOWED_ORIGINS.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' }
    : {};
}

async function reject(env, now, reason) {
  await env.DB.prepare(
    'INSERT INTO rejects (day, reason, n) VALUES (?1, ?2, 1) ON CONFLICT (day, reason) DO UPDATE SET n = n + 1',
  ).bind(utcDay(now), reason).run();
}

/** POST /v1/b. Returns [status, reason]. */
export async function ingest(request, env, now = Date.now()) {
  const origin = request.headers.get('Origin') || '';
  if (!ALLOWED_ORIGINS.includes(origin)) { await reject(env, now, 'origin'); return [403, 'origin']; }
  const type = (request.headers.get('Content-Type') || '').split(';')[0].trim();
  if (type !== 'text/plain') { await reject(env, now, 'type'); return [415, 'type']; }
  const text = await request.text();
  if (text.length > USAGE_LIMITS.maxBodyBytes) { await reject(env, now, 'size'); return [413, 'size']; }
  let raw;
  try { raw = JSON.parse(text); } catch { await reject(env, now, 'json'); return [400, 'json']; }
  const v = validateBatch(raw, utcDay(now));
  if (!v.ok) { await reject(env, now, `invalid:${v.error}`.slice(0, 40)); return [422, v.error]; }
  const b = v.batch;
  const a = b.act || {};
  const res = await env.DB.prepare(
    `INSERT OR IGNORE INTO batches (id, day, plat, ver, cv, rate, d, w, m, first, iw, country, dev, recv_at, body)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)`,
  ).bind(
    b.id, b.day, b.plat, b.ver, b.cv, b.rate,
    b.act ? a.d : null, b.act ? a.w : null, b.act ? a.m : null, b.act ? a.first : null, b.act ? a.iw : null,
    '', // no country: with the install week it could pick one device out of a small readership (us1 refutation)
    request.headers.get('X-Stats-Dev') === '1' ? 1 : 0,
    Math.floor(now / 86400000) * 86400000, // the receive DAY only: a queue flushed at once must not line up
    JSON.stringify(b.c),
  ).run();
  if (!res.meta || res.meta.changes === 0) { await reject(env, now, 'duplicate'); return [200, 'duplicate']; }
  return [204, 'stored'];
}

/** Recompute the rollups for every day from `since` on (YYYY-MM-DD), then trim old rows. */
export async function rollup(env, since, now = Date.now()) {
  const db = env.DB;
  await db.batch([
    db.prepare('DELETE FROM metrics WHERE day >= ?1').bind(since),
    db.prepare(
      `INSERT INTO metrics (day, name, key, plat, value)
       SELECT b.day, substr(j.key, 1, instr(j.key, '|') - 1), substr(j.key, instr(j.key, '|') + 1), b.plat, SUM(j.value / b.rate)
       FROM batches b, json_each(b.body) j
       WHERE b.day >= ?1 AND b.dev = 0
       GROUP BY 1, 2, 3, 4`,
    ).bind(since),
    db.prepare('DELETE FROM actives WHERE day >= ?1').bind(since),
    db.prepare(
      `INSERT INTO actives (day, plat, ver, d, w, m, first)
       SELECT day, plat, ver, SUM(d), SUM(w), SUM(m), SUM(first) FROM batches
       WHERE day >= ?1 AND dev = 0 AND d IS NOT NULL GROUP BY day, plat, ver`,
    ).bind(since),
    db.prepare('DELETE FROM cohorts WHERE day >= ?1').bind(since),
    db.prepare(
      `INSERT INTO cohorts (day, iw, plat, w)
       SELECT day, iw, plat, SUM(w) FROM batches
       WHERE day >= ?1 AND dev = 0 AND w = 1 GROUP BY day, iw, plat`,
    ).bind(since),
    db.prepare('DELETE FROM batches WHERE day < ?1').bind(utcDay(now - 90 * 86400000)),
    db.prepare('DELETE FROM metrics WHERE day < ?1').bind(utcDay(now - 761 * 86400000)),
    db.prepare('DELETE FROM actives WHERE day < ?1').bind(utcDay(now - 761 * 86400000)),
    db.prepare('DELETE FROM cohorts WHERE day < ?1').bind(utcDay(now - 761 * 86400000)),
    db.prepare('DELETE FROM rejects WHERE day < ?1').bind(utcDay(now - 90 * 86400000)),
  ]);
}

/** Constant-time string compare, so the dashboard key cannot be guessed by timing. */
function sameKey(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let x = 0;
  for (let i = 0; i < a.length; i++) x |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return x === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    if (url.pathname === '/v1/b') {
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
      if (request.method !== 'POST') return new Response('POST only', { status: 405 });
      const [status, reason] = await ingest(request, env);
      return new Response(status === 204 ? null : reason, { status, headers: cors(origin) });
    }
    if (url.pathname === '/dash') {
      if (!env.DASH_KEY || !sameKey(url.searchParams.get('k') || '', env.DASH_KEY)) return new Response('Not found', { status: 404 });
      const now = Date.now();
      await rollup(env, utcDay(now - 2 * 86400000), now); // today and the late stragglers, fresh
      const html = await renderDash(env.DB, now);
      return new Response(html, {
        headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' },
      });
    }
    return new Response('Not found', { status: 404 });
  },

  async scheduled(controller, env) {
    const now = controller.scheduledTime || Date.now();
    await rollup(env, utcDay(now - 36 * 86400000), now);
  },
};
