/**
 * bundle-g — the Personal Study screens leave the cold-boot bundle.
 * ─────────────────────────────────────────────────────────────────────
 * Lighthouse (lanes/myweb/out/perf-report-2026-09-22.md §6): 85 % of
 * bundle-d is unused at first paint, and four of its heaviest screens —
 * My Progress, Notes, Links, Highlights — are ones a reader opens ON
 * PURPOSE, never on boot. They follow the bundle-e/bundle-f contract:
 * split into their own lazy bundle, injected by the index.html
 * __makeLazyLoader('screens-g', …) on first navigation, with
 * screen-routes.jsx rendering _corpusView until the bundle defines them.
 *
 * This file pins the split in the BUILT BYTES, so a helpful re-import
 * back into bundle-d fails a test rather than quietly costing every
 * launch the parse again.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..', 'app', 'src', 'main', 'assets');
const DIST = resolve(ASSETS, 'dist');
const read = (p) => readFileSync(p, 'utf-8');

/* The marker is the Object.assign KEY (`MyProgressScreen:`), not the bare
   identifier: esbuild minifies each screen's function to a one-letter name, and
   the identifier itself still appears in bundle-d as the free-global guard
   screen-routes renders behind (`typeof MyProgressScreen !== 'undefined'`).
   The key is the definition; the bare name is only a question about it. */
const MARKERS = ['MyProgressScreen', 'NotesIndexScreen', 'LinksScreen', 'HighlightsScreen'];
const defines = (bundle, name) => bundle.includes(name + ':');

describe('bundle-g carries the Personal Study screens, and bundle-d no longer does', () => {
  it('the four screens are defined in bundle-g', () => {
    const g = read(resolve(DIST, 'bundle-g.js'));
    for (const name of MARKERS) {
      expect(defines(g, name), `bundle-g.js lacks ${name}`).toBe(true);
    }
    expect(g.length > 20000, 'bundle-g.js is smaller than expected — wrong file?').toBe(true);
  });

  it('bundle-d has let them go', () => {
    const d = read(resolve(DIST, 'bundle-d.js'));
    for (const name of MARKERS) {
      expect(defines(d, name), `bundle-d.js still defines ${name}`).toBe(false);
    }
    // …and it still ASKS for them, which is what makes the lazy route work.
    expect(d.includes('MyProgressScreen'), 'bundle-d.js lost its guard on MyProgressScreen').toBe(true);
  });

  it('the loader, the route and the precache all know the bundle', () => {
    const index = read(resolve(ASSETS, 'index.html'));
    expect(/__makeLazyLoader\('screens-g', 'dist\/bundle-g\.js'/.test(index), 'index.html has no screens-g loader').toBe(true);
    expect(/window\.__loadScreensG\s*=/.test(index), 'index.html does not expose __loadScreensG').toBe(true);
    const routes = read(resolve(ASSETS, 'src', 'ui', 'screen-routes.jsx'));
    expect(/window\.__screensG/.test(routes), 'screen-routes.jsx never waits for bundle-g').toBe(true);
    const sw = read(resolve(ASSETS, 'service-worker.js'));
    expect(/dist\/bundle-g\.js/.test(sw), 'service-worker.js does not precache bundle-g').toBe(true);
    const pkg = JSON.parse(read(resolve(HERE, '..', 'package.json')));
    expect(typeof pkg.scripts['build:g'], 'package.json has no build:g').toBe('string');
    expect(pkg.scripts.build.includes('build:g'), 'npm run build does not run build:g').toBe(true);
  });

  it('bundle-g leans on bundle-d\'s globals rather than shipping a second copy of them', () => {
    // The helpers these screens used to IMPORT (achievements, on-idle,
    // excerpt-display) are shared with screens that stay in bundle-d, so
    // bundle-g must resolve them as free globals at call time — the same
    // cross-bundle contract bundle-e keeps. A duplicated copy would be two
    // module states of one law, and bytes paid twice.
    const g = read(resolve(DIST, 'bundle-g.js'));
    expect(/FEATURED_UNLOCK_DEFS|ACHIEVEMENT_STORE_NAMES/.test(g), 'bundle-g.js ships its own copy of achievements.js').toBe(false);
    const entryD = read(resolve(ASSETS, 'src', 'ui', '_entry-d.js'));
    for (const name of ['buildAchievements', 'collectAchievementSnapshot', 'onIdle', 'normalizeExcerptDisplay']) {
      expect(new RegExp('\\b' + name + '\\b').test(entryD), `_entry-d.js does not expose ${name} for bundle-g`).toBe(true);
    }
  });
});
