// @ts-nocheck — free-var globals stubbed per test; only render-affecting props passed
/* BibleChapterView — the words match the voice, and say so only when they do (W25).
   ──────────────────────────────────────────────────────────────────
   While a book's recording is loaded the chapter shows the recording's edition
   (utils/audio-text-edition.js) under a "KJV text, to match the recording" line.
   Sweep 2026-10-13, W25: the line showed before the edition had loaded (and for
   good when the download failed), over NKJV text; and the sweep the reader's own
   translation switch runs (use-translation-loader -> releaseTranslationsExcept)
   could free the edition under the mounted chapter. The chapter now holds the
   edition while it shows it, and the line waits for the text. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act, screen } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { LibraryNav } from '../components/LibraryNav.jsx';

let recording = 'kjv';
let resolveLoad;
vi.mock('../../utils/audio-text-edition.js', async (importOriginal) => {
  const real = /** @type {any} */ (await importOriginal());
  return { ...real, recordingTranslationFor: () => recording };
});
vi.mock('../../data/translations.js', async (importOriginal) => {
  const real = /** @type {any} */ (await importOriginal());
  return { ...real, loadTranslation: vi.fn(() => new Promise((r) => { resolveLoad = r; })) };
});

import { BibleChapterView } from './BibleChapterView.jsx';
import { releaseTranslationsExcept, _translationLoaded } from '../../data/translations.js';

const STUBBED = [
  'ReactDOM', 'ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons', 'LibraryNav',
  'useMarkAsRead', 'useModalRegistry', 'OT_BOOK_IDS', 'HighlightableText', 'bibleHlKey',
  'LinkIcon', 'BookmarkIcon', 'TRANSLATION_OPTIONS', 'BIBLE_KJV',
];
let priorScrollIntoView;

beforeEach(() => {
  recording = 'kjv';
  globalThis.ReactDOM = ReactDOM;
  globalThis.ScreenLayout = ({ children, navChildren }) => <div>{navChildren}{children}</div>;
  globalThis.StickyChapterNav = () => null;
  globalThis.HomeBtn = () => null;
  globalThis.NavButtons = () => null;
  globalThis.LibraryNav = LibraryNav;
  globalThis.useMarkAsRead = () => {};
  globalThis.useModalRegistry = () => {};
  globalThis.OT_BOOK_IDS = new Set();
  globalThis.HighlightableText = ({ text }) => <span>{text}</span>;
  globalThis.bibleHlKey = (bid, ch, n) => `bible:${bid}:${ch}:${n}`;
  globalThis.LinkIcon = () => null;
  globalThis.BookmarkIcon = () => null;
  globalThis.TRANSLATION_OPTIONS = [
    { id: 'nkjv', label: 'NKJV', desc: 'x' },
    { id: 'kjv', label: 'KJV', desc: 'x' },
  ];
  priorScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  const toastEl = document.getElementById('vot-toast-audio');
  if (toastEl) toastEl.remove();
  delete _translationLoaded.kjv;
  STUBBED.forEach((k) => { delete globalThis[k]; });
  if (priorScrollIntoView === undefined) delete Element.prototype.scrollIntoView;
  else Element.prototype.scrollIntoView = priorScrollIntoView;
});

const JOHN = { id: 'john', title: 'John', chapters: [{ num: 3, title: 'Ch 3', sections: [{ heading: null, verses: [
  { n: 16, text: 'For God so loved (nkjv)' },
] }] }] };
const view = () => (
  <BibleChapterView book={JOHN} chapter={JOHN.chapters[0]} translation="nkjv" theme="dark"
    markAsReadEnabled={false} onNavigate={() => {}} />
);
const banner = () => document.querySelector('.hero-audio-text');   // the hero line (the RC.12 toast says it too)
const landKjv = async () => {
  globalThis.BIBLE_KJV = { john: { 3: [{ n: 16, text: 'For God so loved (kjv)' }] } };
  _translationLoaded.kjv = true;
  await act(async () => { resolveLoad(); await Promise.resolve(); });
};

describe('BibleChapterView — the recording\'s edition (W25)', () => {
  it('says "KJV text, to match the recording" only once the KJV text is there', async () => {
    render(view());
    expect(banner()).toBeNull();                       // still downloading: the page reads NKJV
    await landKjv();
    expect(banner()).not.toBeNull();
    expect(screen.getByText('For God so loved (kjv)')).toBeTruthy();
  });

  it('a download that failed never claims the KJV text', async () => {
    render(view());
    await act(async () => { resolveLoad(); await Promise.resolve(); });   // onerror resolves too
    expect(banner()).toBeNull();
  });

  it('the chapter body names the edition its words are in, for a copied reference (rs1)', async () => {
    const { container } = render(view());
    const shown = () => container.querySelector('.chapter-body').getAttribute('data-translation');
    expect(shown()).toBe('nkjv');                      // still downloading: the words are NKJV
    await landKjv();
    expect(shown()).toBe('kjv');
  });

  it('the reader\'s own translation switch cannot free the edition under the mounted chapter', async () => {
    const { unmount } = render(view());
    await landKjv();
    releaseTranslationsExcept('nkjv');                 // what use-translation-loader runs on a switch
    expect(globalThis.BIBLE_KJV).toBeTruthy();
    expect(banner()).not.toBeNull();
    unmount();
    releaseTranslationsExcept('nkjv');                 // nobody shows it now: freed
    expect(globalThis.BIBLE_KJV).toBeUndefined();
  });
});

/* RC.12 (UX sweep 2026-10-22): the hero line is the only sign of the switch, and a Listen started mid-chapter has it
   off-screen. Each switch says so once in a polite toast: KJV on, and the reader's own edition back on Close. */
describe('BibleChapterView — the edition switch is announced (RC.12)', () => {
  const toast = () => {
    const el = document.getElementById('vot-toast-audio');
    return el && el.classList.contains('show') ? el.textContent : null;
  };
  it('toasts as the KJV text arrives, and again when the recording closes', async () => {
    const { rerender } = render(view());
    expect(toast()).toBeNull();                        // still downloading: nothing switched yet
    await landKjv();
    expect(toast()).toBe('Showing the KJV text, to match the recording.');
    document.getElementById('vot-toast-audio').classList.remove('show');
    recording = '';                                    // Close: the player is idle
    rerender(view());
    expect(toast()).toBe('Back to the NKJV text.');
  });

  it('a chapter that opens already in KJV leaves it to the hero line', () => {
    globalThis.BIBLE_KJV = { john: { 3: [{ n: 16, text: 'For God so loved (kjv)' }] } };
    _translationLoaded.kjv = true;
    render(view());
    expect(banner()).not.toBeNull();
    expect(toast()).toBeNull();
  });

  it('a swipe peek never speaks', async () => {
    render(
      <BibleChapterView book={JOHN} chapter={JOHN.chapters[0]} translation="nkjv" theme="dark"
        markAsReadEnabled={false} inert={true} />,
    );
    await landKjv();
    expect(toast()).toBeNull();
  });
});
