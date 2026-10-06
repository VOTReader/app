// @ts-nocheck — free-var globals installed on window, same shape as VolumesHome.counts.test.jsx
/* Read and Listen say the same thing about every collection (zones L4, 2026-10-05).
   ═══════════════════════════════════════════════════════════════════════
   The redesign critique (D:/Swarm/lanes/hub/out/critique-2026-10-05/report-synthesis.md item 10) found
   the two tabs disagreeing: Volume One 29 vs 30, Volume Seven 67 vs 68, Little Flock 61 vs 62, Timothy
   14 vs 15, Rebuke 30 vs 31, and "Little Flock" vs "Lord's Little Flock". The extra one was the preface:
   Listen's count line counted it as a letter ("All 30 letters have recordings") while the Read tile
   counts the letters ("29 Letters"). Both now read ONE list (colLetterArr, the preface apart via
   colPreface), and this gate holds them together for every collection, from the REAL registry: the
   Read tile's title is the collection's label, and its number and noun are the ones Listen states. */
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { VolumesHome } from './VolumesHome.jsx';
import { recordingsLine } from './AudioCollectionScreen.jsx';
import { COLLECTIONS } from '../../data/scripture-resolution.js';

const TILED = COLLECTIONS.filter((c) => c.cardId);
const GLOBALS = ['COL_BY_KEY', 'colLetterArr', 'ScreenLayout', 'LibraryNav', '__votCorpus', '__loadVotCorpus'];
// A distinct letter count per collection, so a tile reading a neighbour's list cannot pass.
const countOf = (col) => 20 + TILED.indexOf(col);
const lettersOf = (col) => Array.from({ length: countOf(col) }, (_, i) => ({ id: col.volKey + '-' + i }));
const prefaceOf = (col) => (col.prefaceGlobal ? { id: col.volKey + '-preface' } : null);

function install() {
  window.COL_BY_KEY = new Map(TILED.map((c) => [c.volKey, c]));
  const lists = new Map(TILED.map((c) => [c, lettersOf(c)]));
  window.colLetterArr = (col) => (col && lists.get(col)) || [];
  window.ScreenLayout = ({ children }) => <div>{children}</div>;
  window.LibraryNav = () => null;
  window.__votCorpus = { subscribe: () => () => {}, getVersion: () => 1, loaded: true };
  window.__loadVotCorpus = () => Promise.resolve();
  return lists;
}
afterEach(() => { cleanup(); for (const g of GLOBALS) delete window[g]; });

const noop = () => {};
function readTiles() {
  render(<VolumesHome onSelect={noop} onBack={noop} onSearch={noop} onHistory={noop} onSettings={noop} theme="dark" onThemeChange={noop} />);
  return [...document.querySelectorAll('.genre-tile')]
    .filter((t) => !/Return to The Garden/.test(t.textContent))
    .map((t) => {
      const title = t.querySelector('.genre-tile-title').textContent;
      const text = t.textContent.replace(title, ' ');
      const m = text.match(/(\d+) (Letters?|Entries|Entry|Chapters?)/);
      return { title, n: m && Number(m[1]), noun: m && m[2].toLowerCase() };
    });
}

describe('Read and Listen agree on every collection', () => {
  it('DERIVED: each Read tile is its collection by name, and states the letter count and noun Listen states', () => {
    const lists = install();
    const tiles = readTiles();
    expect(tiles.length, 'a tile per tiled collection').toBe(TILED.length);
    const wrong = [];
    for (const col of TILED) {
      const tile = tiles.find((t) => t.title === col.label);
      if (!tile) { wrong.push(`${col.label}: no Read tile carries this name`); continue; }
      const preface = prefaceOf(col);
      const items = preface ? [preface, ...lists.get(col)] : lists.get(col);
      const listen = recordingsLine(col, items, items, preface);
      const m = listen.match(/^All (\d+) (\w+)/);
      if (!m || Number(m[1]) !== tile.n || m[2] !== tile.noun) {
        wrong.push(`${col.label}: Read says ${tile.n} ${tile.noun}, Listen says "${listen}"`);
      }
      if (Number(m && m[1]) !== countOf(col)) wrong.push(`${col.label}: Listen counts ${m && m[1]}, the list holds ${countOf(col)}`);
    }
    expect(wrong).toEqual([]);
  });

  it('the preface is named on its own, never counted as a letter (Volume One: 29 letters + preface)', () => {
    const one = TILED.find((c) => c.volKey === 'one');
    const preface = { id: 'pref' };
    const letters = Array.from({ length: 29 }, (_, i) => ({ id: 'l' + i }));
    const items = [preface, ...letters];
    expect(recordingsLine(one, items, items, preface)).toBe('All 29 letters and the preface have recordings');
    expect(recordingsLine(one, items, letters.slice(0, 27), preface)).toBe('27 of 29 letters have recordings');
    expect(recordingsLine(one, items, [preface, ...letters.slice(0, 27)], preface)).toBe('27 of 29 letters and the preface have recordings');
  });

  it('CONTROL: a collection with no preface reads as before', () => {
    const two = TILED.find((c) => c.volKey === 'two');
    const letters = Array.from({ length: 29 }, (_, i) => ({ id: 'l' + i }));
    expect(recordingsLine(two, letters, letters, null)).toBe('All 29 letters have recordings');
  });
});
