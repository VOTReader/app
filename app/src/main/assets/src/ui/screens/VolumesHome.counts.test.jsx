// @ts-nocheck — free-var globals installed on window, same shape as ScripturesHome.test.jsx
/* Every Volumes tile says how much it holds (catalogue row 17 / §2, 2026-09-12).
   ═══════════════════════════════════════════════════════════════════════
   "Every tile but one shows a count. The Lord's Rebuke · Correction & Warning has
   none; it holds 31 pieces." The count is never typed here — it is the
   collection's own letter list, read through colLetterArr — so the fixture gives
   every collection a different, non-zero length and asks each tile for its own.
   The one tile that is not a collection (A Return to The Garden) says "209 Pages"
   and is outside this gate. */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { VolumesHome } from './VolumesHome.jsx';

const KEYS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'rebuke', 'wtlb1', 'wtlb2', 'blessed', 'flock', 'timothy', 'holydays'];
const GLOBALS = ['COL_BY_KEY', 'colLetterArr', 'ScreenLayout', 'LibraryNav', '__votCorpus', '__loadVotCorpus'];

function install(countOf) {
  window.COL_BY_KEY = new Map(KEYS.map((k) => [k, { volKey: k }]));
  window.colLetterArr = (col) => new Array(col ? countOf(col.volKey) : 0).fill(0);
  window.ScreenLayout = ({ children }) => <div>{children}</div>;
  window.LibraryNav = () => null;
  window.__votCorpus = { subscribe: () => () => {}, getVersion: () => 1, loaded: true };
  window.__loadVotCorpus = () => Promise.resolve();
}
const noop = () => {};
const tiles = () => [...document.querySelectorAll('.genre-tile')]
  .filter((t) => !/Return to The Garden/.test(t.textContent))
  .map((t) => ({ title: t.querySelector('.genre-tile-title').textContent, sub: (t.querySelector('.genre-tile-sub') || {}).textContent || '' }));

beforeEach(() => install(() => 0));
afterEach(() => { cleanup(); for (const g of GLOBALS) delete window[g]; });

describe('VolumesHome — every collection tile shows its count', () => {
  it('the Rebuke says how many letters it holds, like every other tile (31 today)', () => {
    install((k) => (k === 'rebuke' ? 31 : 7));
    render(<VolumesHome onSelect={noop} onBack={noop} onSearch={noop} onHistory={noop} onSettings={noop} theme="dark" onThemeChange={noop} />);
    const rebuke = tiles().find((t) => t.title === "The Lord's Rebuke");
    expect(rebuke, 'the tile is on screen').toBeTruthy();
    expect(rebuke.sub).toBe('31 Letters · Correction & Warning');
  });

  it('DERIVED: with letters in every collection, every collection tile carries a number — and each its own', () => {
    // Distinct counts per key, so a tile reading a neighbour's list would show the wrong number.
    const count = (k) => 10 + KEYS.indexOf(k);
    install(count);
    render(<VolumesHome onSelect={noop} onBack={noop} onSearch={noop} onHistory={noop} theme="dark" onThemeChange={noop} onSettings={noop} />);
    const all = tiles();
    expect(all.length, 'fourteen collection tiles').toBe(KEYS.length);
    const numbers = all.map((t) => (t.sub.match(/^(\d+) /) || [])[1]);
    const missing = all.filter((_, i) => !numbers[i]).map((t) => t.title);
    expect(missing, 'tiles with no count').toEqual([]);
    // Fourteen distinct counts read back: no two tiles share one, so none reads another's list.
    expect(new Set(numbers).size).toBe(KEYS.length);
  });

  it('CONTROL: with no letters loaded yet, the Rebuke keeps its subtitle and no number', () => {
    render(<VolumesHome onSelect={noop} onBack={noop} onSearch={noop} onHistory={noop} onSettings={noop} theme="dark" onThemeChange={noop} />);
    const rebuke = tiles().find((t) => t.title === "The Lord's Rebuke");
    expect(rebuke.sub).toBe('Correction & Warning');
  });
});
