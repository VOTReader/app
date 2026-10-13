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
import { readFileSync, existsSync } from 'node:fs';
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


/* THE VENDORED MIT NOTICES HAVE TO REACH THE SHIPPED BYTES.
   ─────────────────────────────────────────────────────────────────────
   MiniSearch is MIT (© Luca Ongaro), and MIT requires the copyright notice
   to travel with "all copies or substantial portions of the Software". The
   vendored source carried it in a plain `/* … *\/` banner, which is exactly
   the form esbuild's default `legal-comments=eof` does NOT keep — it keeps
   `/*!`, `//!`, `@license` and `@preserve` — so the notice was silently
   dropped from `dist/bundle-e.js` (bundle-d since lz1), and from the live site, for as long as
   search has shipped. Verified against the live bundle: zero hits for
   `Ongaro`, `@license` or `Copyright`.

   This is NOT a missing build flag. Nothing about the pipeline needed
   changing; the banner simply never qualified as a legal comment.

   The two assertions are deliberately split so a failure says WHICH half
   broke: the vendored file losing the notice (a bad regeneration) and the
   bundle losing it (a build change) are different repairs. A regeneration
   is exactly how it got here, so the recipe in the file header and in
   VENDORED-LIBS.md now spells the `/*!` form out. */
describe('vendored MIT notices survive into the shipped bundles', () => {
  it('the vendored MiniSearch source carries its MIT notice', () => {
    const src = readFileSync(resolve(HERE, '..', 'app', 'src', 'main', 'assets', 'src', 'search', 'vendor', 'minisearch.js'), 'utf-8');
    // Booleans, not toMatch: a failure must not dump a 64 KB file into the report.
    expect(/Luca Ongaro/.test(src), 'vendored minisearch.js lost its MIT notice').toBe(true);
    expect(/^\/\*!/.test(src), 'the banner is not in a form esbuild keeps (needs /*! or @license)').toBe(true);
  });

  it('...and it is still there in dist/bundle-d.js, which is what ships', () => {
    // bundle-d since lz1 (2026-10-13); search rode lazy bundle-e before.
    const built = readFileSync(resolve(DIST, 'bundle-d.js'), 'utf-8');
    expect(/Luca Ongaro/.test(built), 'dist/bundle-d.js ships without MiniSearch\'s MIT notice').toBe(true);
    // The control: bundle-d really is the minified artifact, so the assertion
    // above is not passing because someone pointed it at an unminified file.
    expect(built.length > 50000, 'bundle-d.js is smaller than expected — wrong file?').toBe(true);
    expect(/\n\s{2,}\S/.test(built.slice(0, 4000)), 'bundle-d.js head looks unminified').toBe(false);

    /* ...and ONLY the notice ships. The vendored file's maintenance notes sit in
       a plain comment that esbuild strips -- but only while they avoid NAMING the
       two conventional preservation markers, because esbuild keeps any comment
       that contains one. Measured on a fixture, not assumed: a plain comment
       merely talking about those markers survives minification, while a control
       mentioning neither is stripped. The first draft of those notes named both
       and shipped ~800 bytes of build instructions to every reader. This is the
       assertion that caught it. */
    expect(/Regenerate:/.test(built), 'bundle-d.js is shipping the vendor file build instructions').toBe(false);
  });
});


/* THE STUDIES SCREENS AND THE MATTHEW CHAPTER VIEW: ONE COPY, IN BUNDLE-D.
   ─────────────────────────────────────────────────────────────────────
   They rode lazy bundle-g from 2026-09-28 (docs/perf/lighthouse-2026-09.md
   item 5) until lz1 (2026-10-13) folded bundles e-h back into bundle-d
   (D:/AgentBackbone/reports/lazy-loading-2026-10-13/REPORT.md). This pins the
   BUILT bytes: bundle-d defines them and the screen bundles are gone.
   The marker is the Object.assign KEY after `{` or `,` (a definition). */
describe('the Studies screens and the Matthew chapter view ship in bundle-d (lz1)', () => {
  const STUDY = ['StudiesHome', 'BibleStudyIndex', 'BibleStudyChapterView', 'MatthewChapterView'];
  const defines = (bundle, name) => new RegExp('[{,]\\s*' + name + ':').test(bundle);
  const d = readFileSync(resolve(DIST, 'bundle-d.js'), 'utf-8');

  it('bundle-d defines them, and the reading path they share with it, once', () => {
    for (const name of [...STUDY, 'LetterView', 'ChapterView', 'ChapterIndex']) {
      expect(defines(d, name), `bundle-d.js lacks ${name}`).toBe(true);
    }
  });

  it('no lazy screen bundle is built any more', () => {
    for (const f of ['bundle-e.js', 'bundle-f.js', 'bundle-g.js', 'bundle-h.js']) {
      expect(existsSync(resolve(DIST, f)), `dist/${f} is back: lz1 folded it into bundle-d`).toBe(false);
    }
  });
});
