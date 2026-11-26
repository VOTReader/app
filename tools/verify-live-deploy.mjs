/**
 * After a publish: is the live site the build we just deployed, byte for byte? (audit 2026-11-23 pipeline-7)
 *
 * Since 11-20 a new build takes over every open reader the moment it installs, and nothing checked that the site
 * boots after a deploy. CI smokes the bytes it built; this reads what Pages serves: build-sha.txt must name the
 * deployed commit (polled, Pages takes a minute or two), then every file in the live service worker's
 * ASSET_INTEGRITY must hash to its entry, the same check the service worker makes before it installs a build (CR
 * stripped, sha256; one refetch on a mismatch, for the instant around a CDN purge). A failure turns the deploy run
 * red; it rolls nothing back (CONTRIBUTING §5, "Rolling back").
 *
 * Usage (deploy-web.yml's verify job): EXPECT_SHA=<sha> [BASE=https://votreader.github.io/app/] node tools/verify-live-deploy.mjs
 */

import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const BASE = 'https://votreader.github.io/app/';

/**
 * The ASSET_INTEGRITY entries of a service-worker.js text.
 * @param {string} swText @returns {Record<string, string>}
 */
export function integrityOf(swText) {
  const block = /const ASSET_INTEGRITY = \{([\s\S]*?)\n\};/.exec(String(swText || ''));
  /** @type {Record<string, string>} */
  const out = {};
  if (!block) return out;
  for (const m of block[1].matchAll(/'([^']+)':\s*'([0-9a-f]{64})'/g)) out[m[1]] = m[2];
  return out;
}

/** sha256 hex of the bytes with every CR removed (service-worker.js sha256Stripped). @param {Uint8Array} bytes */
export function sha256Stripped(bytes) {
  const b = Buffer.from(bytes);
  return createHash('sha256').update(b.includes(0x0d) ? b.filter((x) => x !== 0x0d) : b).digest('hex');
}

/**
 * @param {{ expectSha: string, base?: string, fetchImpl?: typeof fetch, sleep?: (ms: number) => Promise<void>,
 *   waitMs?: number, pollMs?: number }} p
 * @returns {Promise<{ ok: boolean, problems: string[], checked: number }>}
 */
export async function verifyLive(p) {
  const base = p.base || BASE;
  const get = p.fetchImpl || fetch;
  const sleep = p.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const waitMs = p.waitMs ?? 10 * 60 * 1000, pollMs = p.pollMs ?? 20 * 1000;
  const fresh = (/** @type {string} */ url) => get(url, { cache: 'no-store', headers: { 'Cache-Control': 'no-cache' } });
  /** @type {string[]} */
  const problems = [];
  let live = '';
  for (let waited = 0; ; waited += pollMs) {
    try {
      const r = await fresh(new URL('build-sha.txt', base).href);
      live = r.ok ? (await r.text()).trim() : `HTTP ${r.status}`;
    } catch (e) { live = String((e && /** @type {any} */ (e).message) || e); }
    if (live === p.expectSha) break;
    if (waited >= waitMs) {
      problems.push(`build-sha.txt says ${live || '(empty)'} after ${Math.round(waitMs / 60000)} min, not ${p.expectSha}`);
      return { ok: false, problems, checked: 0 };
    }
    await sleep(pollMs);
  }
  const swRes = await fresh(new URL('service-worker.js', base).href);
  if (!swRes.ok) return { ok: false, problems: [`service-worker.js: HTTP ${swRes.status}`], checked: 0 };
  const map = integrityOf(await swRes.text());
  const entries = Object.entries(map);
  if (!entries.length) return { ok: false, problems: ['the live service worker names no ASSET_INTEGRITY'], checked: 0 };
  for (const [path, want] of entries) {
    const url = new URL(path, base).href;
    let got = '';
    for (let attempt = 0; attempt < 2 && got !== want; attempt++) {
      if (attempt) await sleep(5000);
      const r = await fresh(url);
      got = r.ok ? sha256Stripped(new Uint8Array(await r.arrayBuffer())) : `HTTP ${r.status}`;
    }
    if (got !== want) problems.push(`${path}: expected ${want.slice(0, 12)}, got ${got.slice(0, 12)}`);
  }
  return { ok: !problems.length, problems, checked: entries.length };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const expectSha = (process.env.EXPECT_SHA || '').trim();
  if (!expectSha) { console.error('verify-live-deploy: EXPECT_SHA is needed'); process.exit(2); }
  const r = await verifyLive({ expectSha, base: process.env.BASE || BASE });
  if (r.ok) console.log(`verify-live-deploy: ${expectSha.slice(0, 9)} is live, ${r.checked} core files match ASSET_INTEGRITY`);
  else { for (const x of r.problems) console.error('verify-live-deploy: ' + x); process.exit(1); }
}
