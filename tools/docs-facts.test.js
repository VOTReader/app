/* arch-11 (2026-11-26): facts the docs state about the build, checked against
   the tree so they cannot drift again.

   1. The "b/c/d/w" shorthand for the minified app bundles (CLAUDE.md,
      docs/FILE-STRUCTURE.md) is exactly the list of single-letter bundles
      package.json builds with --minify. lz1 (2026-10-13) folded bundle-e..h
      into bundle-d and sr9 (2026-10-14) put the search worker in bundle-w,
      but the shorthand kept saying b/c/d/e for six weeks.
   2. Every dist/bundle-*.js that the vendored MiniSearch header names exists
      and carries MiniSearch's license banner.
   3. Every sha256 and byte count in VENDORED-LIBS.md's table matches the file
      on disk, so editing a vendored file without re-pinning it fails here. */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const ASSETS = resolve(ROOT, 'app', 'src', 'main', 'assets');
const read = (p) => readFileSync(p, 'utf-8');

describe('docs state the current build facts', () => {
  it('the b/c/d/w bundle shorthand is exactly the minified bundles package.json builds', () => {
    const scripts = JSON.parse(read(resolve(ROOT, 'package.json'))).scripts;
    const want = Object.keys(scripts)
      .filter((k) => /^build:[a-z]$/.test(k) && /--minify\b/.test(scripts[k]))
      .map((k) => k.slice('build:'.length)).join('/');
    expect(want, 'package.json builds no minified single-letter bundle').toMatch(/^b\//);
    const docs = ['CLAUDE.md', 'docs/FILE-STRUCTURE.md'];
    let seen = 0;
    const bad = [];
    for (const doc of docs) {
      // The whole slash list, so a dropped bundle (b/c/d) or an extra one (b/c/d/w/e) fails too.
      for (const m of read(resolve(ROOT, doc)).matchAll(/(?<![\w/])b(?:\/[a-z](?![a-z]))+/g)) {
        seen++;
        if (m[0] !== want) bad.push(doc + ': ' + m[0] + ' (package.json: ' + want + ')');
      }
    }
    expect(seen, 'no b/c/d/X shorthand found: the check is looking at nothing').toBeGreaterThan(1);
    expect(bad).toEqual([]);
  });

  it('the MiniSearch header names only dist bundles that exist', () => {
    const head = read(resolve(ASSETS, 'src', 'search', 'vendor', 'minisearch.js')).slice(0, 3000);
    const named = [...head.matchAll(/dist\/(bundle-[a-z-]+\.js)/g)].map((m) => m[1]);
    expect(named.length, 'the header names no dist bundle').toBeGreaterThan(0);
    expect(named.filter((f) => !existsSync(resolve(ASSETS, 'dist', f)))).toEqual([]);
    for (const f of named) {
      expect(read(resolve(ASSETS, 'dist', f)), f + ' carries no MiniSearch banner').toMatch(/Luca Ongaro/);
    }
  });

  it('VENDORED-LIBS.md pins the sha256 and size of each vendored file as it is on disk', () => {
    const rows = [...read(resolve(ROOT, 'VENDORED-LIBS.md'))
      .matchAll(/^\| `([^`]+)` \| [^|]+ \| (\d+) \| [^|]+ \| `([0-9a-f]{64})` \|$/gm)];
    expect(rows.length).toBe(3);
    const off = [];
    for (const [, rel, bytes, sha] of rows) {
      const buf = readFileSync(resolve(ASSETS, rel));
      const got = createHash('sha256').update(buf).digest('hex');
      if (got !== sha || buf.length !== Number(bytes)) off.push(rel + ' is ' + buf.length + ' B ' + got);
    }
    expect(off).toEqual([]);
  });

  // pipeline-4 (2026-11-26): ten ARCHITECTURE.md paths still named .js files that had become .jsx.
  it('no doc cites a .js path that exists only as .jsx', () => {
    const docs = ['ARCHITECTURE.md', 'BRIDGES.md', 'CLAUDE.md', 'CONTRIBUTING.md', 'README.md',
      ...readdirSync(resolve(ROOT, 'docs')).filter((f) => f.endsWith('.md')).map((f) => 'docs/' + f)];
    const bad = [];
    for (const doc of docs) {
      read(resolve(ROOT, doc)).split('\n').forEach((line, i) => {
        for (const m of line.matchAll(/([\w./-]+?)\.js\b(?!x)/g)) {
          const rel = m[1] + '.js';
          const at = [resolve(ASSETS, rel), resolve(ASSETS, 'src', rel), resolve(ROOT, rel)];
          if (!at.some(existsSync) && at.some((p) => existsSync(p + 'x'))) bad.push(doc + ':' + (i + 1) + ' ' + rel);
        }
      });
    }
    expect(bad).toEqual([]);
  });

  // pipeline-4: deploys moved to two daily windows on 2026-10-23; README still said every push deploys.
  // A sentence that pairs a push with deploying, going live or publishing says a push deploys,
  // unless the same sentence names the release window, the 06:00/21:00 times or the schedule.
  const saysPushDeploys = (text) => text.split(/(?<=[.!?])\s+|\n\s*\n|\n(?=\s*[-*|] )/).filter((s) =>
    /\bpush(?:es|ed|ing)?\b/i.test(s)
    && /\b(?:deploy(?:s|ed|ing)?|go(?:es)? live|went live|publish(?:es|ed)?)\b/i.test(s)
    && !/release window|\b(?:06|21):00\b|schedul/i.test(s));

  it('README says no push deploys while deploy-web.yml publishes on a schedule', () => {
    for (const bad of ['Every push to `main` deploys to the PWA.', 'Pushes go live in a minute.',
      'A push to main is deployed by deploy-web.yml.', 'On each push the site publishes.']) {
      expect(saysPushDeploys(bad), bad).not.toEqual([]);
    }
    expect(saysPushDeploys('A push to `main` goes live at the next release window (06:00 or 21:00 Denver).')).toEqual([]);
    const wf = read(resolve(ROOT, '.github', 'workflows', 'deploy-web.yml'));
    expect(wf, 'deploy-web.yml no longer runs on a schedule: revisit this check').toMatch(/^\s+schedule:/m);
    expect(saysPushDeploys(read(resolve(ROOT, 'README.md')))).toEqual([]);
  });
});
