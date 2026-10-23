// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* AboutScreen tests — Wave 0 MISC-SCREENS item (4).
   ──────────────────────────────────────
   The first-run final page CTA was a flat "Continue" — the last step of
   onboarding should be warm and action-oriented ("Begin Reading"). Page
   1 keeps "Continue" (it genuinely continues to page 2); only the final
   page changes.
*/

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, screen, act } from '@testing-library/react';
import { AboutScreen } from './AboutScreen.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';
import { NavButtons } from '../components/NavButtons.jsx';

const GLOBALS = ['ScreenLayout', 'HomeBtn', 'ThemeBtn', 'LibraryNav', 'NavButtons'];

function setupGlobals() {
  globalThis.ScreenLayout = ({ children, navChildren }) => (
    <div data-testid="screen-layout">{navChildren}{children}</div>
  );
  globalThis.HomeBtn = () => null;
  globalThis.ThemeBtn = () => null;
  globalThis.LibraryNav = LibraryNav;
  globalThis.NavButtons = NavButtons;
}

afterEach(() => {
  cleanup();
  GLOBALS.forEach((k) => { delete globalThis[k]; });
});

const renderAbout = (props = {}) => render(
  <AboutScreen
    onContinue={() => {}}
    onBack={() => {}}
    onSearch={() => {}}
    onHistory={() => {}}
    theme="dark"
    onThemeChange={() => {}}
    {...props}
  />
);

describe('AboutScreen — page-aware CTA', () => {
  it('says "Continue" on page 1 (it advances to page 2)', () => {
    setupGlobals();
    renderAbout();
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });

  it('says "Begin Reading" on the final page and fires onContinue', () => {
    setupGlobals();
    const onContinue = vi.fn();
    renderAbout({ onContinue });
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    const cta = screen.getByRole('button', { name: 'Begin Reading' });
    fireEvent.click(cta);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});

/* B1 (2026-08-10). Page 2 is the app's own account of itself, and it had gone
   stale in the one direction that matters: it promised "nothing is downloaded
   except the Garden images" months after every Listen began streaming an MP3
   from a GitHub release. The privacy promise underneath it (nothing of YOURS
   leaves the device) was always true and stays; the download claim is now the
   truth, and the Listening Library is named where the rest of the library is. */
describe('AboutScreen — page 2 describes the app that actually shipped', () => {
  const page2 = () => {
    setupGlobals();
    renderAbout();
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
    return document.querySelector('.about-features').textContent;
  };

  it('no longer claims the Garden images are the only thing fetched', () => {
    const text = page2();
    expect(text).not.toMatch(/nothing is downloaded/i);
    expect(text).toMatch(/Listen streams/i);
  });

  // Downloads brief 2026-10-23, section 7 item 21: it said only "Tapping Listen streams that recording".
  it('says a downloaded recording plays with no connection', () => {
    expect(page2()).toMatch(/download a recording and it plays with no connection/i);
  });

  it('still promises the reader that their own data stays on the device', () => {
    expect(page2()).toMatch(/your notes, highlights and journal never leave this device/i);
  });

  it('names the Listening Library among what the library holds', () => {
    expect(page2()).toMatch(/Listening Library/);
  });
});

describe('AboutScreen — the Songs of the Letters credit (L8)', () => {
  it('credits the songs and names the consented makers the catalog publishes, most songs first', async () => {
    const Songs = await import('../../utils/song-catalog.js');
    const { songMakers } = await import('./AboutScreen.jsx');
    Songs._resetSongCatalogForTests();
    /** @type {any} */ (globalThis).SongCatalog = Songs.SongCatalog;
    expect(songMakers()).toEqual([]);                      // before the catalog: no names, never a guess
    const song = (id, cr, hid = false) => ({ id, t: 'S', f: 'f' + id, v: '', st: [], dl: 'sung', lang: 'en', src: { k: 'none' }, d: 1, b: 1, sh: 1, cr, lyr: 0, rd: null, fs: '', hid, dup: null });
    Songs.adoptSongCatalog({ schema: 1, songs: [song('aaaaaaaaaaa1', 'Sky of Sapphire'), song('aaaaaaaaaaa2', 'hmarie777'), song('aaaaaaaaaaa3', 'hmarie777'), song('aaaaaaaaaaa4', 'Hidden One', true), song('aaaaaaaaaaa5', null)], families: [] });
    expect(songMakers()).toEqual(['hmarie777', 'Sky of Sapphire']);
    Songs._resetSongCatalogForTests();
    delete /** @type {any} */ (globalThis).SongCatalog;
  });

  it('asks for the catalog and names the makers when it lands while About is open (s18.4)', async () => {
    vi.useFakeTimers();
    const Songs = await import('../../utils/song-catalog.js');
    Songs._resetSongCatalogForTests();
    const load = vi.spyOn(Songs.SongCatalog, 'load').mockImplementation(() => Promise.resolve(true));
    try {
      setupGlobals();
      /** @type {any} */ (globalThis).SongCatalog = Songs.SongCatalog;
      renderAbout();                                      // a fresh install opens here, before Home asks for songs
      const credit = () => document.querySelector('.about-songs-credit').textContent;
      expect(credit()).not.toMatch(/With songs by/);
      act(() => { vi.advanceTimersByTime(2000); });
      expect(load).toHaveBeenCalled();
      const song = (id, cr) => ({ id, t: 'S', f: 'f' + id, v: '', st: [], dl: 'sung', lang: 'en', src: { k: 'none' }, d: 1, b: 1, sh: 1, cr, lyr: 0, rd: null, fs: '', hid: false, dup: null });
      act(() => { Songs.adoptSongCatalog({ schema: 1, songs: [song('aaaaaaaaaaa1', 'hmarie777')], families: [] }); });
      expect(credit()).toMatch(/With songs by hmarie777/);
    } finally {
      load.mockRestore();
      vi.useRealTimers();
      Songs._resetSongCatalogForTests();
      delete /** @type {any} */ (globalThis).SongCatalog;
    }
  });
});

/* The CC-BY obligation for the Scripture Web's cross-reference dataset (OpenBible.info). About
   carries it on its first page; since Q5 the web carries it too (the legend's tail, the panel's
   footer, the guide's footer), and none of those replaces this one. */
describe('AboutScreen — the OpenBible.info credit', () => {
  it('names the dataset, links it and states the licence on the first page', () => {
    setupGlobals();
    const { container } = renderAbout();
    const credit = [...container.querySelectorAll('.about-credit')].find((p) => /OpenBible/.test(p.textContent));
    expect(credit, 'the OpenBible.info credit line').toBeTruthy();
    expect(credit.textContent.replace(/\s+/g, ' ').trim()).toBe('Cross-reference data from OpenBible.info, used under CC-BY.');
    const link = credit.querySelector('a');
    expect(link.getAttribute('href')).toBe('https://www.openbible.info/labs/cross-references/');
    expect(link.getAttribute('rel')).toMatch(/noopener/);
  });
});
