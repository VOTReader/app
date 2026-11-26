/* arch-11 (2026-11-26): facts the docs state about the build, checked against
   the tree so they cannot drift again.

   1. The "b/c/d/X" shorthand for the minified app bundles (CLAUDE.md,
      docs/FILE-STRUCTURE.md) names only bundles that package.json builds.
      lz1 (2026-10-13) folded bundle-e..h into bundle-d and the search worker
      became bundle-w, but the shorthand kept saying b/c/d/e for six weeks.
   2. Every sha256 and byte count in VENDORED-LIBS.md's table matches the file
      on disk, so editing a vendored file without re-pinning it fails here. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const ASSETS = resolve(ROOT, 'app', 'src', 'main', 'assets');
const read = (p) => readFileSync(p, 'utf-8');

describe('docs state the current build facts', () => {
  it('the b/c/d/X bundle shorthand names only bundles package.json builds', () => {
    const scripts = JSON.parse(read(resolve(ROOT, 'package.json'))).scripts;
    const docs = ['CLAUDE.md', 'docs/FILE-STRUCTURE.md'];
    let seen = 0;
    const bad = [];
    for (const doc of docs) {
      for (const m of read(resolve(ROOT, doc)).matchAll(/\bb\/c\/d\/([a-z])\b/g)) {
        seen++;
        if (!scripts['build:' + m[1]]) bad.push(doc + ': b/c/d/' + m[1]);
      }
    }
    expect(seen, 'no b/c/d/X shorthand found: the check is looking at nothing').toBeGreaterThan(1);
    expect(bad).toEqual([]);
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
});
