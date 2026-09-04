/**
 * Bundle membership (c43, boot-performance-2): matthew-nkjv.js — the Matthew
 * Study ref->text dict, 54 KB raw — sat in bundle-a and was parsed before first
 * paint on every launch, although its three consumers (InlineNotes,
 * ScriptureSheet, StudyPanels) mount only inside ChapterView, which
 * screen-routes.jsx renders only once MATTHEW exists — i.e. after
 * bundle-a-matthew executed. Pins the move in tools/build.py AND in the built
 * output, so a "helpful" move back to the cold-boot path fails a test.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const DIST = resolve(HERE, '..', 'app', 'src', 'main', 'assets', 'dist');
const build = readFileSync(resolve(HERE, 'build.py'), 'utf-8');

/** Quoted members of a top-level `NAME = [ ... ]` / `NAME = { ... }` block, comments stripped. */
function members(name) {
  const m = build.match(new RegExp(`^${name} = [\\[{]([\\s\\S]*?)^[\\]}]`, 'm'));
  if (!m) throw new Error(`${name} not found in build.py`);
  const body = m[1].split('\n').filter((l) => !l.trim().startsWith('#')).join('\n');
  return [...body.matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

describe('matthew-nkjv.js rides the lazy Matthew bundle, not the cold-boot bundle-a', () => {
  it('tools/build.py lists it under A_MATTHEW and nowhere on the critical path', () => {
    expect(members('A_MATTHEW')).toContain('src/data/matthew-nkjv.js');
    expect(members('A')).not.toContain('src/data/matthew-nkjv.js');
    expect(members('MINIFY_A')).not.toContain('src/data/matthew-nkjv.js');
    expect(members('A')).toContain('react.min.js'); // the parser read the right block
  });

  it('the built bundles agree with the lists', () => {
    const a = readFileSync(resolve(DIST, 'bundle-a.js'), 'utf-8');
    const am = readFileSync(resolve(DIST, 'bundle-a-matthew.js'), 'utf-8');
    // Booleans, not toMatch: a failure must not dump a 250 KB bundle into the
    // report. `NAME=` rather than `var NAME`: bundle-a-matthew is minified in
    // place and esbuild merges its concatenated files' top-level declarations
    // into a single `var MATTHEW={…},MATTHEW_NKJV={…}`.
    expect(/\bMATTHEW_NKJV\s*=/.test(a), 'bundle-a.js still carries MATTHEW_NKJV').toBe(false);
    expect(/\bMATTHEW_NKJV\s*=/.test(am), 'bundle-a-matthew.js lacks MATTHEW_NKJV').toBe(true);
    expect(/\bMATTHEW\s*=/.test(am), 'bundle-a-matthew.js lacks MATTHEW').toBe(true);
  });
});
