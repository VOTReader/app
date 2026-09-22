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
const MARKERS = ['MyProgressScreen', 'NotesIndexScreen', 'LinksScreen', 'HighlightsScreen',
  'BookmarksScreen', 'MilestonesScreen', 'HistoryScreen'];
/* AboutScreen is NOT in that list on purpose: use-tabs.js opens a fresh
   install on it, so it is boot-path weight however on-purpose it looks. */
/* `name + ':'` alone is not enough, and landing 28 proved it: the minifier
   writes a guarded free-global read as a TERNARY — `typeof X=="function"?X:…`
   — and that colon reads exactly like a definition. A definition is a KEY in
   an object literal, so the character before it is `{` or `,`. */
const defines = (bundle, name) => new RegExp('[{,]\s*' + name + ':').test(bundle);

describe('bundle-g carries the Personal Study screens, and bundle-d no longer does', () => {
  it('the seven screens are defined in bundle-g', () => {
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

  it('the pieces the always-present shell mounts stay behind in bundle-d', () => {
    // BookmarksScreen was the one Personal Study screen that could not travel
    // in landing 21: its file also defined BookmarkPopover, which
    // AppShellSheets mounts in the app shell on EVERY screen, and the two
    // hlKey derivations that SelectionToolbar, JournalInsertSheet,
    // journal-helpers and HighlightsScreen read as free globals. A lazy
    // bundle-g copy of those would leave the shell reaching for a symbol that
    // may never have loaded. They now live in their own bundle-d modules, and
    // this pins that: the screen is lazy, the shell's pieces are not.
    const d = read(resolve(DIST, 'bundle-d.js'));
    const g = read(resolve(DIST, 'bundle-g.js'));
    for (const name of ['BookmarkPopover', '_bookmarkSourceLabel', '_bookmarkSourceEndpoint']) {
      expect(defines(d, name), `bundle-d.js no longer defines ${name} for the shell`).toBe(true);
      expect(defines(g, name), `bundle-g.js ships its own ${name} — the shell would get two`).toBe(false);
    }
    // The row and its action sheet have no reader outside the screen, so they
    // ride with it.
    expect(defines(g, 'BookmarkRow'), 'bundle-g.js lacks BookmarkRow').toBe(true);
  });

  it('bundle-g leans on bundle-d\'s globals rather than shipping a second copy of them', () => {
    // The helpers these screens used to IMPORT (achievements, on-idle,
    // excerpt-display) are shared with screens that stay in bundle-d, so
    // bundle-g must resolve them as free globals at call time — the same
    // cross-bundle contract bundle-e keeps. A duplicated copy would be two
    // module states of one law, and bytes paid twice.
    const g = read(resolve(DIST, 'bundle-g.js'));
    // The marker is a STRING LITERAL from achievements.js, not an identifier:
    // esbuild minifies the module's own names away, and since landing 23
    // MilestonesScreen READS ACHIEVEMENT_STORE_NAMES as a free global, so the
    // identifier appears in bundle-g exactly when the contract is being kept.
    // A literal only survives where the module itself was bundled.
    expect(g.includes('One million words read'), 'bundle-g.js ships its own copy of achievements.js').toBe(false);
    // Landing 23's two: reduced-motion's scroll law is imported by nine
    // reading-path modules that stay, and ReadingMinChip is rendered by
    // HistoryEntryCard / VolumeLetterIndex / ChapterIndex — so History and
    // Milestones read both across the boundary rather than carrying a copy.
    expect(/prefers-reduced-motion/.test(g), 'bundle-g.js ships its own copy of reduced-motion.js').toBe(false);
    expect(/readingChipWpm:|readingMinChip:/.test(g), 'bundle-g.js ships its own ReadingMinChip').toBe(false);
    const entryD = read(resolve(ASSETS, 'src', 'ui', '_entry-d.js'));
    for (const name of ['buildAchievements', 'collectAchievementSnapshot', 'onIdle', 'normalizeExcerptDisplay',
      'ACHIEVEMENT_STORE_NAMES', 'scrollBehavior', 'readingChipWpm', 'readingMinChip']) {
      expect(new RegExp('\\b' + name + '\\b').test(entryD), `_entry-d.js does not expose ${name} for bundle-g`).toBe(true);
    }
  });
});
