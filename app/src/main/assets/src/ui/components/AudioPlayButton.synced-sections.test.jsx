// @ts-nocheck -- drives the real loader through a fake __makeLazyLoader installed on globalThis.
/* useSyncedSections: no chip flash (reader-behaviour-n4 follow-up). Until the compilation timings land, a chip shows
   its file's name only, never the hand range the timings will correct (WTLB Part Two read two entries behind). */
import { describe, it, expect, vi, afterEach } from 'vitest';
import React from 'react';
import { render, cleanup, act } from '@testing-library/react';
import { useSyncedSections } from './AudioPlayButton.jsx';
import { resetSyncLoadersForTests, audioSyncSectionsSettled } from '../../utils/sync-loaders.js';
import { neutralSections } from '../../utils/section-labels.js';

const SECS = [['Section 1 · Intro–28', 'a1', 'r'], ['Section 2 · 29–56', 'a2', 'r']];
let loader;
function installFactory() {
  globalThis.__makeLazyLoader = vi.fn((name, path) => {
    const listeners = new Set();
    let version = 0;
    const corpus = {
      loaded: false, error: false,
      subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); },
      getVersion() { return version; },
      notify() { this.loaded = true; version += 1; listeners.forEach((cb) => cb()); },
      fail() { this.error = true; version += 1; listeners.forEach((cb) => cb()); },
    };
    loader = { name, path, corpus, load: vi.fn(() => new Promise(() => {})) };
    return loader;
  });
}
function Chips() {
  const s = useSyncedSections(SECS);
  return <div>{s.map((x) => <span key={x[1]} className="chip">{x[0]}</span>)}</div>;
}
const chips = () => [...document.querySelectorAll('.chip')].map((c) => c.textContent);

afterEach(() => { cleanup(); resetSyncLoadersForTests(); delete globalThis.__makeLazyLoader; delete globalThis.AUDIO_SYNC_SECTIONS; vi.restoreAllMocks(); });

describe('useSyncedSections: no chip flash while the timings load', () => {
  it('shows names only until the timings land, never the hand range', () => {
    installFactory();
    render(<Chips />);
    expect(chips()).toEqual(['Section 1', 'Section 2']);
  });

  it('a failed load falls back to the hand labels', () => {
    installFactory();
    render(<Chips />);
    act(() => { loader.corpus.fail(); });
    expect(chips()).toEqual(['Section 1 · Intro–28', 'Section 2 · 29–56']);
  });

  it('with no loader on the page (nothing to wait for) the hand labels show', () => {
    render(<Chips />);
    expect(audioSyncSectionsSettled()).toBe(true);
    expect(chips()).toEqual(['Section 1 · Intro–28', 'Section 2 · 29–56']);
  });

  // reader-behaviour-n4: once the timings land, a chip names the entries its file reads (the hook is wired to them).
  it('once the timings land, each chip names the entries its file reads', () => {
    const entries = [{ id: 'introduction', num: 1 }, ...Array.from({ length: 60 }, (_, i) => ({ id: 'e' + (i + 2), num: i + 2 }))];
    globalThis.COL_BY_KEY = new Map([['wtlb2', { key: 'wtlb2' }]]);
    globalThis.colLetterArr = () => entries;
    globalThis.AUDIO_SYNC_SECTIONS = { a1: { 'wtlb2:introduction': 1, 'wtlb2:e30': 1 }, a2: { 'wtlb2:e31': 1, 'wtlb2:e58': 1 } };
    try {
      render(<Chips />);
      expect(chips()).toEqual(['Section 1 · Intro–30', 'Section 2 · 31–58']);
    } finally { delete globalThis.COL_BY_KEY; delete globalThis.colLetterArr; }
  });

  // Timings in, WTLB corpus not yet: the entries a range is read from are missing, so names only, never the hand range.
  it('timings in but the corpus not yet: names only, then the synced ranges once the corpus lands', () => {
    const entries = [{ id: 'introduction', num: 1 }, ...Array.from({ length: 60 }, (_, i) => ({ id: 'e' + (i + 2), num: i + 2 }))];
    const listeners = new Set();
    let version = 0;
    const vot = { loaded: false, error: false, subscribe(cb) { listeners.add(cb); return () => listeners.delete(cb); }, getVersion() { return version; } };
    let have = false;
    globalThis.__votCorpus = vot;
    globalThis.__loadVotCorpus = vi.fn(() => Promise.resolve());
    globalThis.COL_BY_KEY = new Map([['wtlb2', { key: 'wtlb2' }]]);
    globalThis.colLetterArr = () => (have ? entries : null);
    globalThis.AUDIO_SYNC_SECTIONS = { a1: { 'wtlb2:introduction': 1, 'wtlb2:e30': 1 }, a2: { 'wtlb2:e31': 1, 'wtlb2:e58': 1 } };
    try {
      render(<Chips />);
      expect(chips()).toEqual(['Section 1', 'Section 2']);
      expect(globalThis.__loadVotCorpus).not.toHaveBeenCalled();   // the screen loads the corpus; the chips only wait
      act(() => { have = true; vot.loaded = true; version += 1; listeners.forEach((cb) => cb()); });
      expect(chips()).toEqual(['Section 1 · Intro–30', 'Section 2 · 31–58']);
    } finally { delete globalThis.__votCorpus; delete globalThis.__loadVotCorpus; delete globalThis.COL_BY_KEY; delete globalThis.colLetterArr; }
  });

  it('timings in and the corpus failed: the hand labels show', () => {
    globalThis.__votCorpus = { loaded: false, error: true, subscribe: () => () => {}, getVersion: () => 1 };
    globalThis.AUDIO_SYNC_SECTIONS = { a1: { 'wtlb2:introduction': 1 }, a2: { 'wtlb2:e31': 1 } };
    try {
      render(<Chips />);
      expect(chips()).toEqual(['Section 1 · Intro–28', 'Section 2 · 29–56']);
    } finally { delete globalThis.__votCorpus; }
  });

  it('neutralSections keeps the name and the rest of each row', () => {
    expect(neutralSections(SECS)).toEqual([['Section 1', 'a1', 'r'], ['Section 2', 'a2', 'r']]);
  });
});
