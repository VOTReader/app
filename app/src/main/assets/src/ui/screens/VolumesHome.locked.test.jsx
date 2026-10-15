// @ts-nocheck — free-var globals installed on window, same shape as VolumesHome.counts.test.jsx
/* A "Coming Soon" tile is a disabled button, not a live one that does nothing (sweep v78, 2026-10-15).
   ═══════════════════════════════════════════════════════════════════════
   Once the corpus has loaded, a volume or collection with no letters shows "Coming Soon" and its
   click does nothing. The tile was still an enabled, focusable <button>: the CSS (pointer-events:none)
   stopped the mouse, but Tab landed on it, a screen reader announced it as an actionable button, and
   Enter did nothing at all. StudiesHome already marks the same state with `disabled`. A locked tile
   is now disabled (out of the tab order, announced as unavailable); an open tile, and every tile
   while the corpus is still loading, stays a live button. */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { VolumesHome } from './VolumesHome.jsx';

const VOLUME_KEYS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven'];
const COLLECTION_KEYS = ['rebuke', 'wtlb1', 'wtlb2', 'blessed', 'flock', 'timothy', 'holydays'];
const KEYS = [...VOLUME_KEYS, ...COLLECTION_KEYS];
const GLOBALS = ['COL_BY_KEY', 'colLetterArr', 'ScreenLayout', 'LibraryNav', '__votCorpus', '__loadVotCorpus'];

function install(countOf, loaded = true) {
  window.COL_BY_KEY = new Map(KEYS.map((k) => [k, { volKey: k }]));
  window.colLetterArr = (col) => new Array(col ? countOf(col.volKey) : 0).fill(0);
  window.ScreenLayout = ({ children }) => <div>{children}</div>;
  window.LibraryNav = () => null;
  window.__votCorpus = { subscribe: () => () => {}, getVersion: () => 1, loaded };
  window.__loadVotCorpus = () => Promise.resolve();
}
afterEach(() => { cleanup(); for (const g of GLOBALS) delete window[g]; });

const noop = () => {};
function renderTiles() {
  render(<VolumesHome onSelect={noop} onBack={noop} onSearch={noop} onHistory={noop} onSettings={noop} theme="dark" onThemeChange={noop} />);
  return [...document.querySelectorAll('.genre-tile')]
    .filter((t) => !/Return to The Garden/.test(t.textContent));
}
const titleOf = (t) => t.querySelector('.genre-tile-title').textContent;

describe('VolumesHome — a Coming Soon tile is disabled, not a silent no-op', () => {
  // One empty volume and one empty collection, everything else holds letters.
  const EMPTY = new Set(['four', 'timothy']);
  const count = (k) => (EMPTY.has(k) ? 0 : 12);

  it('a locked volume tile and a locked collection tile are disabled buttons', () => {
    install(count);
    const tiles = renderTiles();
    const locked = tiles.filter((t) => t.classList.contains('locked'));
    expect(locked.map(titleOf), 'the two empty tiles are the locked ones').toEqual(['Volume Four', 'Letters from Timothy']);
    for (const t of locked) {
      expect(t.tagName).toBe('BUTTON');
      expect(t.disabled, `${titleOf(t)} is disabled`).toBe(true);
    }
  });

  it('a keyboard user cannot land on a locked tile', () => {
    install(count);
    const tiles = renderTiles();
    const timothy = tiles.find((t) => titleOf(t) === 'Letters from Timothy');
    timothy.focus();
    expect(document.activeElement, 'focus does not rest on a Coming Soon tile').not.toBe(timothy);
  });

  it('CONTROL: every tile that holds letters stays a live, focusable button', () => {
    install(count);
    const open = renderTiles().filter((t) => !t.classList.contains('locked'));
    expect(open.length).toBe(KEYS.length - EMPTY.size);
    expect(open.filter((t) => t.disabled).map(titleOf), 'open tiles marked disabled').toEqual([]);
    open[0].focus();
    expect(document.activeElement).toBe(open[0]);
  });

  it('CONTROL: while the corpus is still loading no tile is locked, so none is disabled', () => {
    install(() => 0, false);
    const tiles = renderTiles();
    expect(tiles.length).toBe(KEYS.length);
    expect(tiles.filter((t) => t.disabled).map(titleOf)).toEqual([]);
  });
});
