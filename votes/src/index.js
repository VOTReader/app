/* VOTReader song votes (sync sy4, Corbin 2026-10-22 23:0x: "a voting system for songs ... Thumbs up or thumbs down,
   popular songs more likely to get show under a 'popular' tab"; DECISIONS 10-22).

   Only a thumbs-up ever reaches here. A thumbs-down is private: it lowers the song in that device's own shuffle and
   is never sent ("Thumbs down private, yes"); switching a 👍 to 👎, or clearing it, sends a clear (v 0).

     POST /v1/vote     {install, song, v: 1|0, at, traits?: {w, h, dpr, tz}}   -> 204 (idempotent upsert)
     GET  /v1/tallies  -> {generated, songs: {<id>: [liked, liked in the last 30 days]}}  (read by songs_publish.py)

   - A vote is keyed by (install, song) with the device's own timestamp: a retry or an older vote arriving late never
     changes the count, so the offline outbox can resend freely.
   - Soft same-device cap: the same salted IP hash + trait hash liking the same song from a different install within
     30 days counts once (the latest wins). The hashes are nulled after 30 days (the daily cron), the rate rows after 2.
   - Rate limit per IP hash: RATE_PER_HOUR votes an hour.
   - No play counts, no logs or analytics of its own (wrangler.toml observability off; Corbin 09-25: no usage stats).
   - CORS for the reader's two origins only: the web app and the APK's WebView. */

export const ORIGINS = ['https://votreader.github.io', 'https://appassets.androidplatform.net'];
export const RATE_PER_HOUR = 120;
export const WINDOW_MS = 30 * 24 * 3600 * 1000;
const SONG = /^[0-9a-f]{12}$/;
const INSTALL = /^[A-Za-z0-9_-]{16,64}$/;

/** @param {Request} req @param {Record<string, string>} [extra] */
function headers(req, extra) {
  const o = req.headers.get('Origin');
  return new Headers({
    ...(o && ORIGINS.includes(o) ? { 'Access-Control-Allow-Origin': o } : {}),
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  });
}

/** @param {string} salt @param {string} text */
async function hash(salt, text) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + '|' + text));
  return [...new Uint8Array(d).slice(0, 16)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** The few coarse traits a vote may carry, in a fixed shape, so nothing else can ride along. */
export function traitKey(t) {
  if (!t || typeof t !== 'object') return '';
  const n = (x) => (Number.isFinite(x) ? Math.round(x * 100) / 100 : '');
  const tz = typeof t.tz === 'string' ? t.tz.slice(0, 40) : '';
  return [n(t.w), n(t.h), n(t.dpr), tz].join(',');
}

/**
 * @param {Request} req
 * @param {{DB: any, SALT: string}} env
 * @param {number} [now] tests only
 */
export async function handle(req, env, now = Date.now()) {
  const url = new URL(req.url);
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: headers(req, {
      'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400' }) });
  }
  if (url.pathname === '/v1/tallies' && req.method === 'GET') return tallies(req, env, now);
  if (url.pathname !== '/v1/vote') return new Response(null, { status: 404, headers: headers(req) });
  if (req.method !== 'POST') return new Response(null, { status: 405, headers: headers(req, { Allow: 'POST, OPTIONS' }) });

  let b;
  try { b = await req.json(); } catch { return new Response(null, { status: 400, headers: headers(req) }); }
  let at = Number(b && b.at);
  if (!b || !INSTALL.test(b.install) || !SONG.test(b.song) || (b.v !== 1 && b.v !== 0)
      || !Number.isFinite(at) || at < now - 90 * 24 * 3600 * 1000) {
    return new Response(null, { status: 400, headers: headers(req) });
  }
  // a phone whose clock runs ahead still counts: its vote takes the server's time (the outbox sends only each
  // song's latest state, so this cannot reorder one install's votes)
  if (at > now) at = now;
  const iph = await hash(env.SALT, req.headers.get('CF-Connecting-IP') || '');
  const hour = Math.floor(now / 3600e3);
  const used = await env.DB.prepare(
    'INSERT INTO rate (iph, hour, n) VALUES (?1, ?2, 1) ON CONFLICT (iph, hour) DO UPDATE SET n = n + 1 RETURNING n',
  ).bind(iph, hour).first();
  if (used && used.n > RATE_PER_HOUR) {
    return new Response(null, { status: 429, headers: headers(req, { 'Retry-After': '3600' }) });
  }
  const trh = await hash(env.SALT, traitKey(b.traits));
  // newer than what this install already said about this song, or nothing changes (idempotent, order-proof)
  const w = await env.DB.prepare(
    `INSERT INTO votes (install, song, v, at, iph, trh, counted) VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1)
     ON CONFLICT (install, song) DO UPDATE SET v = ?3, at = ?4, iph = ?5, trh = ?6, counted = 1 WHERE excluded.at > votes.at`,
  ).bind(b.install, b.song, b.v, at, iph, trh).run();
  if (b.v === 1 && w.meta && w.meta.changes) {
    // the same device (same network + traits) under another install: count it once, the latest wins
    await env.DB.prepare(
      `UPDATE votes SET counted = 0 WHERE song = ?1 AND install != ?2 AND iph = ?3 AND trh = ?4 AND at > ?5 AND at <= ?6`,
    ).bind(b.song, b.install, iph, trh, at - WINDOW_MS, at).run();
    // and if this like arrived late (another install's like from the same device is newer), this one steps aside
    await env.DB.prepare(
      `UPDATE votes SET counted = 0 WHERE install = ?2 AND song = ?1 AND EXISTS (SELECT 1 FROM votes o WHERE o.song = ?1
       AND o.install != ?2 AND o.iph = ?3 AND o.trh = ?4 AND o.v = 1 AND o.counted = 1 AND o.at > ?5 AND o.at < ?6)`,
    ).bind(b.song, b.install, iph, trh, at, at + WINDOW_MS).run();
  }
  return new Response(null, { status: 204, headers: headers(req) });
}

/** @param {Request} req @param {{DB: any}} env @param {number} now */
async function tallies(req, env, now) {
  const { results } = await env.DB.prepare(
    `SELECT song, SUM(v = 1 AND counted = 1) AS liked, SUM(v = 1 AND counted = 1 AND at > ?1) AS recent
     FROM votes GROUP BY song HAVING liked > 0`,
  ).bind(now - WINDOW_MS).all();
  /** @type {Record<string, [number, number]>} */
  const songs = {};
  for (const r of results) songs[r.song] = [r.liked, r.recent];
  return new Response(JSON.stringify({ generated: new Date(now).toISOString(), songs }), {
    headers: headers(req, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300' }),
  });
}

/** Daily: forget the hashes after 30 days and the rate rows after 2. @param {{DB: any}} env @param {number} [now] */
export async function sweep(env, now = Date.now()) {
  await env.DB.prepare('UPDATE votes SET iph = NULL, trh = NULL WHERE at < ?1 AND iph IS NOT NULL').bind(now - WINDOW_MS).run();
  await env.DB.prepare('DELETE FROM rate WHERE hour < ?1').bind(Math.floor(now / 3600e3) - 48).run();
}

export default {
  /** @param {Request} req @param {any} env */
  fetch: (req, env) => handle(req, env),
  /** @param {any} _event @param {any} env @param {any} ctx */
  scheduled: (_event, env, ctx) => ctx.waitUntil(sweep(env)),
};
