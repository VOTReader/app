// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* AboutScreen tests: the first run's one-page welcome, and About's own pages. */

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

/* newcomer (Corbin 2026-11-27: "Make sure new users aren't bombarded with info, only what is essential to use the
   app"; mock 3-first-run-B, cleared by the hub): the welcome is one page. What the app is, what it holds, the two
   points that keep it from passing for the official source (word for word), Begin reading, the tour as a quiet link,
   Credits and privacy. The nine "What you can do" lines and "Yours stays yours" live in About. */
describe('AboutScreen — the one-page welcome', () => {
  it('is one page: Begin Reading fires onContinue; there is no Continue and no second page', () => {
    setupGlobals();
    const onContinue = vi.fn();
    const { container } = renderAbout({ onContinue });
    expect(screen.queryByRole('button', { name: 'Continue' })).toBeNull();
    expect(container.querySelector('.ws4-fr-dots')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Begin Reading' }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('says what the app is and what it holds, in a line each', () => {
    setupGlobals();
    const { container } = renderAbout();
    expect(container.querySelector('.ws4-fr-lead').textContent).toBe('The Volumes of Truth are the Word of The Lord, given through His servant Timothy.');
    expect(container.querySelector('.ws4-fr-holds').textContent).toBe('Every letter of The Volumes of Truth, the whole Bible in eleven translations, the studies, and the Letters and the Bible read aloud.');
  });

  it('keeps the two points that say it is not the official source, word for word, and nothing else', () => {
    setupGlobals();
    const { container } = renderAbout();
    expect([...container.querySelectorAll('.ws4-fr-point p')].map((p) => p.textContent)).toEqual([
      'Made for personal study. This reader was made by a disciple; it is not the canonical source.',
      'The source. For the canonical text, audio, video, and PDFs, visit thevolumesoftruth.com.',
    ]);
    expect(container.textContent).not.toMatch(/What you can do|Highlight, underline|Full-text search/);
  });

  it('offers the tour once, as a quiet link under Begin reading', () => {
    setupGlobals();
    const onTour = vi.fn();
    const { container } = renderAbout({ onTour });
    const foot = [...container.querySelectorAll('.ws4-fr-foot button')].map((b) => b.textContent);
    expect(foot[0]).toBe('Begin reading');
    expect(foot[1]).toMatch(/^Show me around first/);
    fireEvent.click(screen.getByRole('button', { name: /^Show me around first/ }));
    expect(onTour).toHaveBeenCalledTimes(1);
  });

  // WS4 (fr-1): Credits and privacy is a text button that opens its own page, privacy first.
  it('opens Credits and privacy as its own page, and Back returns to the welcome', () => {
    setupGlobals();
    const { container } = renderAbout();
    expect(container.querySelector('.about-credit')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Credits and privacy' }));
    expect(container.querySelector('.about-credit').textContent).toMatch(/CC-BY/);
    expect(container.querySelector('.about-songs-credit')).toBeTruthy();
    expect(container.querySelector('a[href$="privacy.html"]')).toBeTruthy();
    act(() => { window.__screenBack(); });
    expect(screen.getByRole('button', { name: 'Begin Reading' })).toBeTruthy();
  });
});

/* B1 (2026-08-10): the app's own account of itself, kept true. Since the one-page welcome (newcomer, 2026-11-27) it is
   About's "What you can do" page, its words unchanged, with "Yours stays yours" from the old welcome under it. */
describe('About — What you can do describes the app that actually shipped', () => {
  const features = () => {
    setupGlobals();
    renderAbout({ firstRun: false });
    fireEvent.click(screen.getByRole('button', { name: 'What you can do' }));
    return document.querySelector('.ws3-about').textContent;
  };

  it('no longer claims the Garden images are the only thing fetched', () => {
    const text = features();
    expect(text).not.toMatch(/nothing is downloaded/i);
    expect(text).toMatch(/Listening needs a connection/i);
  });

  // Downloads brief 2026-10-23, section 7 item 21: it said only "Tapping Listen streams that recording".
  it('says a downloaded recording plays with no connection', () => {
    expect(features()).toMatch(/needs a connection unless you download it/i);
  });

  it('still promises the reader that their own data stays on the device', () => {
    expect(features()).toMatch(/your notes never leave this device/i);
  });

  it('names listening among what the library holds', () => {
    expect(features()).toMatch(/The Letters and the Bible, read aloud/);
  });

  // A08.6 / s40.1: no build words, no marketing, and the offline line says what needs a connection.
  it('speaks plainly: no corpus, release files or feature suite; reading works offline', () => {
    const text = features();
    expect(text).not.toMatch(/corpus|release files|feature suite/i);
    expect(text).toMatch(/Reading works offline/);
  });

  // A08.6 / U02.3, moved with its words: the backup path Settings really has.
  it('carries "Yours stays yours" word for word, with the backup path Settings really has', () => {
    expect(features()).toContain('Yours stays yours. Your notes, journal, and highlights stay on this device. Back them up from Settings › Your data.');
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
      fireEvent.click(screen.getByRole('button', { name: 'Credits and privacy' }));
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
  it('names the dataset, links it and states the licence on the Credits and privacy page', () => {
    setupGlobals();
    const { container } = renderAbout();
    fireEvent.click(screen.getByRole('button', { name: 'Credits and privacy' }));   // WS4 (fr-1): one tap from page one
    const credit = [...container.querySelectorAll('.about-credit')].find((p) => /OpenBible/.test(p.textContent));
    expect(credit, 'the OpenBible.info credit line').toBeTruthy();
    expect(credit.querySelector('.ws3-credit-text').textContent).toBe('Cross-reference data, used under CC-BY.');
    const link = credit.querySelector('a');
    expect(link.getAttribute('href')).toBe('https://www.openbible.info/labs/cross-references/');
    expect(link.getAttribute('rel')).toMatch(/noopener/);
  });
});
