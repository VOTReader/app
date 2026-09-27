/* VOTReader offline-audio relay (cf1, Corbin 2026-09-26: "set up cloudflare since it's a small job").

   GitHub's release downloads answer without CORS, so a web page cannot keep their bytes: the phone app
   downloads them natively, the PWA (and an iPhone on its Home Screen) could not. This Worker relays ONLY
   the votreader-assets release audio, so the PWA can save a recording for offline:

     GET|HEAD https://audio.votreader.workers.dev/<tag>/<file>.mp3
       -> https://github.com/VOTReader/votreader-assets/releases/download/<tag>/<file>.mp3

   - Nothing else is relayed: <tag> must be an audio-* release and <file> a plain .mp3 name; any other
     path, a query string or another method is refused (no open proxy).
   - Access-Control-Allow-Origin is the reader's origin only (https://votreader.github.io).
   - Range is passed through and the body is streamed, never buffered.
   - No logging and no analytics of its own (wrangler.toml turns observability off; nothing here writes
     a log line or a counter).
   Streaming playback never comes here: it stays direct from GitHub. */

export const ALLOW_ORIGIN = 'https://votreader.github.io';
export const UPSTREAM = 'https://github.com/VOTReader/votreader-assets/releases/download/';
const PATH = /^\/(audio-[a-z0-9-]{1,40})\/([A-Za-z0-9][A-Za-z0-9_.-]{0,159}\.mp3)$/;
const PASS = ['Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified'];

/** @param {Record<string, string>} [extra] */
function headers(extra) {
  return new Headers({
    'Access-Control-Allow-Origin': ALLOW_ORIGIN,
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, ETag',
    'Vary': 'Origin',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  });
}

/** @param {number} status */
function refuse(status) {
  return new Response(null, { status, headers: headers(status === 405 ? { Allow: 'GET, HEAD, OPTIONS' } : {}) });
}

/**
 * @param {Request} request
 * @param {typeof fetch} [upstreamFetch] tests only
 */
export async function relay(request, upstreamFetch = fetch) {
  const url = new URL(request.url);
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: headers({ 'Access-Control-Allow-Methods': 'GET, HEAD', 'Access-Control-Allow-Headers': 'Range', 'Access-Control-Max-Age': '86400' }),
    });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return refuse(405);
  const m = PATH.exec(url.pathname);
  if (!m || url.search) return refuse(404);
  /** @type {Record<string, string>} */
  const ask = {};
  const range = request.headers.get('Range');
  if (range) {
    if (!/^bytes=\d*-\d*$/.test(range)) return refuse(416);
    ask.Range = range;
  }
  let up;
  try {
    up = await upstreamFetch(UPSTREAM + m[1] + '/' + m[2], { method: request.method, headers: ask, redirect: 'follow' });
  } catch (_e) {
    return refuse(502);
  }
  if (up.status !== 200 && up.status !== 206 && up.status !== 416) {
    if (up.body) up.body.cancel().catch(() => {});
    return refuse(up.status === 404 ? 404 : 502);
  }
  const out = headers({ 'Content-Type': 'audio/mpeg', 'Cache-Control': 'public, max-age=86400' });
  for (const h of PASS) {
    const v = up.headers.get(h);
    if (v) out.set(h, v);
  }
  if (!out.has('Accept-Ranges')) out.set('Accept-Ranges', 'bytes');
  return new Response(request.method === 'HEAD' ? null : up.body, { status: up.status, headers: out });
}

export default { fetch: (/** @type {Request} */ request) => relay(request) };
