/**
 * search-data.js belongs to the search screen, not to every boot.
 * ─────────────────────────────────────────────────────────────────────
 * bundle-a is the first script in the document and nothing renders until
 * it has parsed. Its members earn that place: react, react-dom, and the
 * Bible audio manifest the Listen pill needs before any corpus loads.
 *
 * search-data.js did not. 42,753 bytes of stop words, synonym maps, book
 * abbreviations, named passages and slash-commands — read by
 * src/search/engine.js, ref-parser.js, index-builder.js and SearchScreen,
 * every one of which is reachable ONLY from _entry-e.js, which is lazy
 * behind __loadScreensE. So every reader parsed the search tables on
 * every cold start, and only a reader who opened Search ever used them.
 *
 * The tables now ride bundle-e, loaded by the same trigger as the screen
 * that reads them. `window.VotSearchData` is still how they are reached —
 * the file is a side-effect import, not an ES module — so nothing that
 * reads it had to change.
 *
 * THE MARKERS ARE STRING LITERALS. Identifiers are renamed by the
 * minifier and, worse, a free-global read leaves the identifier behind in
 * exactly the bundle the contract says should not hold the module. A
 * literal survives only where the source itself was bundled.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..', 'app', 'src', 'main', 'assets');
const DIST = resolve(ASSETS, 'dist');
const read = (p) => readFileSync(p, 'utf-8');

/* Three literals from three different tables in search-data.js, so the
   test cannot pass on a partial move. */
const MARKERS = ['/rebuild index', 'Clear search history', 'VotSearchData'];

describe('search-data.js rides bundle-e, not the boot path', () => {
  it('bundle-e carries the search tables', () => {
    const e = read(resolve(DIST, 'bundle-e.js'));
    for (const m of MARKERS) {
      expect(e.includes(m), `bundle-e.js lacks ${m}`).toBe(true);
    }
  });

  it('bundle-a has let them go', () => {
    const a = read(resolve(DIST, 'bundle-a.js'));
    for (const m of MARKERS) {
      expect(a.includes(m), `bundle-a.js still carries ${m}`).toBe(false);
    }
  });

  it('bundle-a keeps what the boot really needs', () => {
    const a = read(resolve(DIST, 'bundle-a.js'));
    // react-dom's own marker, and the Bible audio manifest that must be on
    // the page before any corpus loads (the Listen pill + boot resume).
    expect(a.includes('react-dom'), 'bundle-a.js lost react-dom').toBe(true);
    expect(a.includes('bible-'), 'bundle-a.js lost the Bible audio manifest').toBe(true);
  });

  it('no bundle ships the tables twice', () => {
    const copies = ['bundle-a.js', 'bundle-b.js', 'bundle-c.js', 'bundle-d.js',
      'bundle-e.js', 'bundle-f.js', 'bundle-g.js', 'bundle-h.js']
      .filter((f) => read(resolve(DIST, f)).includes('/rebuild index'));
    expect(copies).toEqual(['bundle-e.js']);
  });
});
