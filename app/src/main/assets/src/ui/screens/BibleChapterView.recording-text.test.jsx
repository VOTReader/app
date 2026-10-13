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
const banner = () => screen.queryByText(/to match the recording/);
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
