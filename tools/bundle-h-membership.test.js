/**
 * bundle-h — the Listening Library goes lazy; the player does not.
 * ─────────────────────────────────────────────────────────────────────
 * The library hub and its three sub-screens are a place a reader goes to
 * CHOOSE something to listen to. Nobody passes through them on the way to
 * a chapter and the app shell does not mount them, so they are the same
 * cold-boot weight landings 21-23 moved out.
 *
 * The care in this one is the machinery underneath. AudioPlayerBar and
 * AudioManagerSheet live in the always-present shell and play on EVERY
 * screen, so audio-player.js, AudioShelf (rows, icons, the position
 * hook), AudioSeekSlider, CoverageBadge and the two audio tables all stay
 * in bundle-d, and the five screens read them as free globals. A second
 * bundled audio-player.js would be two players fighting over one
 * <audio> element — a silent, miserable bug. This file makes that
 * impossible to land by accident.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(HERE, '..', 'app', 'src', 'main', 'assets');
const DIST = resolve(ASSETS, 'dist');
const read = (p) => readFileSync(p, 'utf-8');

/* The marker is the Object.assign KEY (`AudioLibraryScreen:`), not the bare
   identifier: esbuild minifies each screen's function to a one-letter name, and
   the identifier still appears in bundle-d as the free-global guard
   screen-routes renders behind (`typeof AudioLibraryScreen !== 'undefined'`). */
const MARKERS = ['AudioLibraryScreen', 'AudioVolumesScreen', 'AudioCollectionScreen', 'AudioSavedScreen', 'AudioStudiesScreen', 'AudioOfflineScreen', 'AudioSongsScreen'];
/* `name + ':'` alone is not enough, and landing 28 proved it: the minifier
   writes a guarded free-global read as a TERNARY — `typeof X=="function"?X:…`
   — and that colon reads exactly like a definition. A definition is a KEY in
   an object literal, so the character before it is `{` or `,`. */
const defines = (bundle, name) => new RegExp('[{,]\s*' + name + ':').test(bundle);

describe('bundle-h carries the Listening Library, and bundle-d no longer does', () => {
  it('the six screens are defined in bundle-h', () => {
    const h = read(resolve(DIST, 'bundle-h.js'));
    for (const name of MARKERS) {
      expect(defines(h, name), `bundle-h.js lacks ${name}`).toBe(true);
    }
  });

  it('bundle-d has let them go, and still asks for them', () => {
    const d = read(resolve(DIST, 'bundle-d.js'));
    for (const name of MARKERS) {
      expect(defines(d, name), `bundle-d.js still defines ${name}`).toBe(false);
    }
    expect(d.includes('AudioLibraryScreen'), 'bundle-d.js lost its guard on AudioLibraryScreen').toBe(true);
  });

  // Item 8: the downloads store is ONE object, bundle-d's (the player's offline gate and the page's rows must see the
  // same state); bundle-h reads it as the OfflineAudio global. A bundled copy would install a second receiver.
  it('there is exactly one downloads store, and it is the shell\'s', () => {
    const h = read(resolve(DIST, 'bundle-h.js'));
    const d = read(resolve(DIST, 'bundle-d.js'));
    expect(h.includes('__votOfflineAudio'), 'bundle-h.js bundled its own offline-audio store').toBe(false);
    expect(d.includes('__votOfflineAudio'), 'bundle-d.js lost the offline-audio store').toBe(true);
    expect(defines(d, 'OfflineAudio'), 'bundle-d.js does not publish OfflineAudio').toBe(true);
  });

  it('there is exactly one player, and it is the shell\'s', () => {
    // String literals, not identifiers: the identifiers appear in bundle-h
    // precisely BECAUSE the free-global contract is kept (the lesson landing
    // 23 learned the hard way). A literal survives only where the module
    // itself was bundled.
    const d = read(resolve(DIST, 'bundle-d.js'));
    const h = read(resolve(DIST, 'bundle-h.js'));
    expect(d.includes('audio-snapshot'), 'bundle-d.js lost audio-player.js').toBe(true);
    expect(h.includes('audio-snapshot'), 'bundle-h.js ships a SECOND audio-player.js — two players, one <audio>').toBe(false);
    expect(d.includes('Untitled recording'), 'bundle-d.js lost AudioShelf').toBe(true);
    expect(h.includes('Untitled recording'), 'bundle-h.js ships a second AudioShelf').toBe(false);
    for (const name of ['AudioPlayerBar', 'AudioManagerSheet', 'AudioShelfRow', 'AudioSeekSlider', 'CoverageBadge']) {
      expect(defines(d, name), `bundle-d.js no longer defines ${name} for the shell`).toBe(true);
      expect(defines(h, name), `bundle-h.js ships its own ${name}`).toBe(false);
    }
    // Songs of the Letters (2026-09-25): ONE catalog store and one set of song pieces, the shell's (the bar and
    // the desk draw songs too). A literal of each survives only where the module was bundled.
    expect(d.includes('songs-catalog'), 'bundle-d.js lost song-catalog.js').toBe(true);
    expect(h.includes('songs-catalog'), 'bundle-h.js ships a SECOND song catalog').toBe(false);
    expect(d.includes('song-choice-'), 'bundle-d.js lost SongParts').toBe(true);
    expect(h.includes('song-choice-'), 'bundle-h.js ships its own SongParts').toBe(false);
    // A bundle-h that stayed small is the cheap proof of all of the above. The player alone is far over this;
    // 76,600 tracks check-bundle-budget's ceiling (76,500 since the Songs screen's song page and read-with-music frames, 2026-09-25).
    expect(h.length < 76600, `bundle-h.js is ${h.length} B — something big came along`).toBe(true);
  });

  it('the loader, the routes, the precache and the build all know the bundle', () => {
    const index = read(resolve(ASSETS, 'index.html'));
    expect(/__makeLazyLoader\('screens-h', 'dist\/bundle-h\.js'/.test(index), 'index.html has no screens-h loader').toBe(true);
    expect(/window\.__loadScreensH\s*=/.test(index), 'index.html does not expose __loadScreensH').toBe(true);
    const routes = read(resolve(ASSETS, 'src', 'ui', 'screen-routes.jsx'));
    expect(/window\.__screensH/.test(routes), 'screen-routes.jsx never waits for bundle-h').toBe(true);
    for (const name of MARKERS) {
      expect(new RegExp('typeof ' + name + " !== 'undefined'").test(routes), `${name}'s route has no free-global guard`).toBe(true);
    }
    const sw = read(resolve(ASSETS, 'service-worker.js'));
    expect(/dist\/bundle-h\.js/.test(sw), 'service-worker.js does not precache bundle-h').toBe(true);
    const pkg = JSON.parse(read(resolve(HERE, '..', 'package.json')));
    expect(typeof pkg.scripts['build:h'], 'package.json has no build:h').toBe('string');
    expect(pkg.scripts.build.includes('build:h'), 'npm run build does not run build:h').toBe(true);
    const gen = read(resolve(HERE, 'gen-eslint-globals.py'));
    expect(gen.includes('_entry-h.js'), 'the eslint-globals generator does not read _entry-h.js').toBe(true);
    const smoke = read(resolve(HERE, 'smoke.js'));
    expect(smoke.includes('__loadScreensH'), 'smoke.js does not load bundle-h before its screen walk').toBe(true);
  });
});
