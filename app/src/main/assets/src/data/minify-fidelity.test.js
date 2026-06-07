/**
 * BLD1 — prove the minified lazy-corpus bundles carry the EXACT source values.
 *
 * tools/build.py concatenates each lazy corpus (a-bible / a-matthew / a-vot)
 * from src/data/*.js and then esbuild-minifies the result in place (PF1). The
 * only downstream guards were a byte-emptiness floor (minify-bundle.mjs) and a
 * content-hash gate (check-corpus-version.js) — neither proves the minifier
 * preserved the DATA. The PF1 value-fidelity proof was a one-time manual vm
 * deep-equal; this test makes it a standing gate.
 *
 * Method: eval the concatenated SOURCE files and the shipped MINIFIED bundle in
 * two isolated vm contexts (each is a classic script that declares top-level
 * `var X = {...}` globals), then deep-compare every global. The only difference
 * between concat(sources) and the bundle is the minification + the per-file
 * comment headers (which minify strips), so any mismatch is a minify data bug.
 *
 * The bundle->sources lists mirror A_BIBLE / A_MATTHEW / A_VOT in tools/build.py.
 * Keep them in sync: CI rebuilds + `git diff --exit-code` catch a stale bundle,
 * and a file missing here is a coverage gap (never a false pass). The pure-data
 * bundle-a members (books-restored/matthew-plain/matthew-nkjv, PF2) are not
 * covered here — they ship inside bundle-a alongside the UMD vendors (which read
 * top-level `this` and can't load in a bare vm); their staleness is caught by
 * the CI rebuild + diff, their minify by this same esbuild path.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url)); // .../assets/src/data
const DATA = HERE;
const DIST = resolve(HERE, '..', '..', 'dist'); // .../assets/dist

// Mirror of tools/build.py A_BIBLE / A_MATTHEW / A_VOT.
const BUNDLES = [
  { dist: 'bundle-a-bible.js', sources: ['books.js'] },
  { dist: 'bundle-a-matthew.js', sources: ['matthew.js'] },
  {
    dist: 'bundle-a-vot.js',
    sources: [
      'volume-one.js', 'volume-two.js', 'volume-three.js',
      'volume-four.js', 'volume-five.js', 'volume-six.js',
      'volume-seven.js',
      'letters-timothy.js', 'letters-flock.js', 'lords-rebuke.js',
      'wtlb-one.js', 'wtlb-two.js', 'wtlb-scriptures.js',
      'the-blessed.js', 'holy-days.js', 'hidden-manna.js',
    ],
  },
];

/** Eval a classic script and return its top-level data globals as a sandbox. */
function evalGlobals(code, label) {
  // A minimal browser-ish sandbox: the data files are pure `var X = {...}`
  // declarations, but seed `window`/`globalThis` so an incidental reference
  // can't throw a ReferenceError before the declarations land.
  const sandbox = {};
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  try {
    runInNewContext(code, sandbox, { filename: label });
  } catch (e) {
    throw new Error(`eval failed for ${label}: ${e.message}`);
  }
  return sandbox;
}

/** Top-level data keys (drop the seeded stubs + any functions). */
function dataKeys(sandbox) {
  return Object.keys(sandbox)
    .filter((k) => k !== 'window' && k !== 'globalThis')
    .filter((k) => {
      const v = sandbox[k];
      return v != null && typeof v !== 'function';
    })
    .sort();
}

describe('BLD1 — minified corpus bundles preserve source values', () => {
  for (const b of BUNDLES) {
    it(`${b.dist} carries the exact source data`, () => {
      const srcCode = b.sources
        .map((f) => readFileSync(resolve(DATA, f), 'utf-8'))
        .join('\n;\n');
      const distCode = readFileSync(resolve(DIST, b.dist), 'utf-8');

      const src = evalGlobals(srcCode, `source:${b.dist}`);
      const dst = evalGlobals(distCode, b.dist);

      const srcKeys = dataKeys(src);
      const dstKeys = dataKeys(dst);

      // Every source global must survive minification (and no spurious extras).
      expect(dstKeys).toEqual(srcKeys);
      expect(srcKeys.length).toBeGreaterThan(0);

      // Each global's value must be structurally equal. Use toEqual (not
      // toStrictEqual): the two sandboxes are separate vm realms, so their
      // Object/Array prototypes differ — toStrictEqual would reject identical
      // data on a prototype-identity mismatch. toEqual compares structure only,
      // which is exactly the data-fidelity question here.
      for (const k of srcKeys) {
        expect(dst[k], `global ${k} drifted under minify`).toEqual(src[k]);
      }
    });
  }
});
