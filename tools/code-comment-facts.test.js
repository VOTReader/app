/* platform-5 (2026-11-26): comments that described the app wrongly, checked
   against the code they describe so they cannot drift back.

   1. index.html's CSP comment explains every connect-src host. The song-votes
      Worker was added to connect-src on 2026-10-23 with no word in the comment.
   2. service-worker.js's header said a new build "installs and WAITS" for a
      week after takeOver started calling skipWaiting (Corbin 2026-11-20).
   3. App JS said song votes go through native WorkManager; the APK has no
      androidx.work dependency, and SongVotes.kt schedules a JobScheduler job. */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = resolve(ROOT, 'app', 'src', 'main', 'assets');
const read = (p) => readFileSync(p, 'utf-8');

describe('code comments match the code', () => {
  it("index.html's CSP comment names every connect-src host", () => {
    const html = read(resolve(ASSETS, 'index.html'));
    const meta = html.indexOf('http-equiv="Content-Security-Policy"');
    expect(meta).toBeGreaterThan(0);
    const commentStart = html.lastIndexOf('<!--', meta);
    const comment = html.slice(commentStart, html.indexOf('-->', commentStart));
    const csp = html.slice(meta, html.indexOf('">', meta));
    const connect = (csp.match(/connect-src([^;]*);/) || [])[1] || '';
    const hosts = [...connect.matchAll(/https:\/\/([^\s;]+)/g)].map((m) => m[1]);
    expect(hosts.length, 'no https host in connect-src: the check reads nothing').toBeGreaterThan(1);
    expect(hosts.filter((h) => !comment.includes(h))).toEqual([]);
  });

  it("service-worker.js's header does not say a new build waits while takeOver skips waiting", () => {
    const sw = read(resolve(ASSETS, 'service-worker.js'));
    const takeOver = sw.slice(sw.indexOf('async function takeOver()'), sw.indexOf('async function takeOver()') + 200);
    expect(takeOver, 'takeOver() moved; update this check').toContain('skipWaiting');
    const header = sw.slice(0, sw.indexOf('*/'));
    expect(/installs and WAITS/.test(header)).toBe(false);
  });

  it('no app source credits WorkManager unless the APK depends on androidx.work', () => {
    const gradle = read(resolve(ROOT, 'app', 'build.gradle.kts'));
    if (/androidx\.work/.test(gradle)) return;
    const bad = [];
    (function walk(dir) {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) { if (e.name !== 'data') walk(p); continue; }
        if (/\.(js|jsx)$/.test(e.name) && /\bWorkManager\b/.test(read(p))) bad.push(p.slice(ASSETS.length + 1));
      }
    })(resolve(ASSETS, 'src'));
    expect(bad).toEqual([]);
  });
});
