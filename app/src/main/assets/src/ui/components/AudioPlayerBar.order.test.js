// @ts-nocheck - reads app source through node:fs
/* Sweep W66 (2026-10-13): the mini player rendered inside AppShellOverlays, which app.jsx mounts BEFORE the screen,
   so on every screen Tab and a screen reader met the player's controls before the page's own back button, heading
   and text. Its place on screen is fixed (position: fixed, its own z-index 150, the only one), so where it sits in
   the DOM changes only the order it is met in: after the screen. Nothing renders the whole App in a unit test, so
   this pins the order in app.jsx's own JSX. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
/** The source with its comments out: a comment naming the bar is not the bar. */
const code = (/** @type {string} */ rel) => readFileSync(resolve(here, rel), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('the audio player bar comes after the screen in Tab and reading order (sweep W66)', () => {
  it('app.jsx renders it after the screen slot, and AppShellOverlays (mounted before the screen) does not', () => {
    const app = code('../../app.jsx');
    const slot = app.indexOf('ROUTES[screen]');
    const overlays = app.indexOf('<AppShellOverlays');
    const bar = app.indexOf('<AudioPlayerBar');
    expect(slot).toBeGreaterThan(0);
    expect(overlays).toBeGreaterThan(0);
    expect(overlays).toBeLessThan(slot);
    expect(bar, 'app.jsx renders <AudioPlayerBar />').toBeGreaterThan(0);
    expect(bar, 'after the screen slot').toBeGreaterThan(slot);
    expect(code('./AppShellOverlays.jsx')).not.toMatch(/<AudioPlayerBar\b/);
  });
});
