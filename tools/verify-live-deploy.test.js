/* pipeline-7 (audit 2026-11-23): after a publish, the live build-sha.txt names the deployed commit and every core file
   hashes to the live service worker's ASSET_INTEGRITY (tools/verify-live-deploy.mjs). Fetch is faked. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { integrityOf, sha256Stripped, verifyLive } from './verify-live-deploy.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const sha = (s) => createHash('sha256').update(s).digest('hex');
const SW = (map) => 'const X = 1;\nconst ASSET_INTEGRITY = {\n'
  + Object.entries(map).map(([k, v]) => `  '${k}': '${v}',`).join('\n') + '\n};\n';
const BASE = 'https://example.test/app/';

/** A fake Pages: path -> body (string) or a status number; build-sha.txt may answer from a list, call by call. */
function site(files, shas = []) {
  /** @type {string[]} */
  const calls = [];
  const fetchImpl = async (url) => {
    const path = url.slice(BASE.length);
    calls.push(path);
    const body = path === 'build-sha.txt' && shas.length ? shas.shift() : files[path];
    if (typeof body !== 'string') {
      const status = typeof body === 'number' ? body : 404;
      return { ok: false, status, text: async () => '', arrayBuffer: async () => new ArrayBuffer(0) };
    }
    const bytes = new TextEncoder().encode(body);
    return { ok: true, status: 200, text: async () => body, arrayBuffer: async () => bytes.buffer };
  };
  return { fetchImpl: /** @type {any} */ (fetchImpl), calls };
}
const noSleep = async () => {};

describe('integrityOf', () => {
  it("reads the repo's own service worker", () => {
    const map = integrityOf(readFileSync(join(ROOT, 'app/src/main/assets/service-worker.js'), 'utf8'));
    expect(Object.keys(map)).toContain('./dist/bundle-a.js');
    expect(Object.keys(map).length).toBeGreaterThan(8);
    for (const v of Object.values(map)) expect(v).toMatch(/^[0-9a-f]{64}$/);
  });
  it('nothing when the block is missing', () => {
    expect(integrityOf('const A = {};')).toEqual({});
  });
});

describe('sha256Stripped matches the service worker: CR dropped', () => {
  it('CRLF and LF hash the same', () => {
    expect(sha256Stripped(new TextEncoder().encode('a\r\nb\r\n'))).toBe(sha('a\nb\n'));
  });
});

describe('verifyLive', () => {
  const files = { 'index.html': '<html>', 'dist/bundle-a.js': 'code' };
  const sw = SW({ './index.html': sha('<html>'), './dist/bundle-a.js': sha('code') });
  it('waits for build-sha.txt to name the deployed commit, then checks every core file', async () => {
    const s = site({ ...files, 'service-worker.js': sw }, ['old\n', 'old\n', 'abc123\n']);
    const r = await verifyLive({ expectSha: 'abc123', base: BASE, fetchImpl: s.fetchImpl, sleep: noSleep, pollMs: 1, waitMs: 10 });
    expect(r).toEqual({ ok: true, problems: [], checked: 2 });
    expect(s.calls.filter((c) => c === 'build-sha.txt').length).toBe(3);
  });
  it('a file whose bytes differ is named, after one refetch', async () => {
    const s = site({ ...files, 'dist/bundle-a.js': 'truncated', 'service-worker.js': sw, 'build-sha.txt': 'abc123' });
    const r = await verifyLive({ expectSha: 'abc123', base: BASE, fetchImpl: s.fetchImpl, sleep: noSleep });
    expect(r.ok).toBe(false);
    expect(r.problems).toEqual([`./dist/bundle-a.js: expected ${sha('code').slice(0, 12)}, got ${sha('truncated').slice(0, 12)}`]);
    expect(s.calls.filter((c) => c === 'dist/bundle-a.js').length).toBe(2);
  });
  it('a missing file is named', async () => {
    const s = site({ 'index.html': '<html>', 'service-worker.js': sw, 'build-sha.txt': 'abc123' });
    const r = await verifyLive({ expectSha: 'abc123', base: BASE, fetchImpl: s.fetchImpl, sleep: noSleep });
    expect(r.problems).toEqual([`./dist/bundle-a.js: expected ${sha('code').slice(0, 12)}, got HTTP 404`]);
  });
  it('the site never shows the deployed commit: fails with what it does show', async () => {
    const s = site({ ...files, 'service-worker.js': sw, 'build-sha.txt': 'old' });
    const r = await verifyLive({ expectSha: 'abc123', base: BASE, fetchImpl: s.fetchImpl, sleep: noSleep, pollMs: 1, waitMs: 3 });
    expect(r.ok).toBe(false);
    expect(r.problems[0]).toMatch(/build-sha\.txt says old after 0 min, not abc123/);
  });
  it('a service worker with no integrity map fails', async () => {
    const s = site({ 'service-worker.js': 'const A = 1;', 'build-sha.txt': 'abc123' });
    const r = await verifyLive({ expectSha: 'abc123', base: BASE, fetchImpl: s.fetchImpl, sleep: noSleep });
    expect(r.problems).toEqual(['the live service worker names no ASSET_INTEGRITY']);
  });
});
