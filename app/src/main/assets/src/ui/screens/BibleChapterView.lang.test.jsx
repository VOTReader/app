// @ts-nocheck — free-var globals stubbed per test; only render-affecting props passed
/* BibleChapterView — a Spanish edition's verses say they are Spanish (es1).
   The app is English (<html lang="en">). With the Reina-Valera 1960 chosen, each
   verse carries lang="es" from the registry (translationLang), so a screen reader
   speaks it in Spanish while the headings and menus around it stay English. Until
   the edition's script lands, translateVerse answers with the English NKJV, and
   those verses must not claim to be Spanish. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { LibraryNav } from '../components/LibraryNav.jsx';

vi.mock('../../utils/audio-text-edition.js', async (importOriginal) => {
  const real = /** @type {any} */ (await importOriginal());
  return { ...real, recordingTranslationFor: () => null };
});

import { BibleChapterView } from './BibleChapterView.jsx';

const STUBBED = [
  'ReactDOM', 'ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons', 'LibraryNav',
  'useMarkAsRead', 'useModalRegistry', 'OT_BOOK_IDS', 'HighlightableText', 'bibleHlKey',
  'LinkIcon', 'BookmarkIcon', 'TRANSLATION_OPTIONS', 'BIBLE_RVR',
];
let priorScrollIntoView;

beforeEach(() => {
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
    { id: 'rvr', label: 'RVR1960', lang: 'es', desc: 'x' },
  ];
  priorScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = () => {};
});
afterEach(() => {
  cleanup();
  STUBBED.forEach((k) => { delete globalThis[k]; });
  if (priorScrollIntoView === undefined) delete Element.prototype.scrollIntoView;
  else Element.prototype.scrollIntoView = priorScrollIntoView;
});

const JOHN = { id: 'john', title: 'John', chapters: [{ num: 3, title: 'Ch 3', sections: [{ heading: null, verses: [
  { n: 16, text: 'For God so loved the world (nkjv)' },
] }] }] };
const view = (translation) => (
  <BibleChapterView book={JOHN} chapter={JOHN.chapters[0]} translation={translation} theme="dark"
    markAsReadEnabled={false} onNavigate={() => {}} />
);

describe('BibleChapterView — lang on a Spanish edition\'s verses (es1)', () => {
  it('marks the Reina-Valera verses lang="es" once the edition is loaded', () => {
    globalThis.BIBLE_RVR = { john: { 3: [{ n: 16, text: 'Porque de tal manera amó Dios al mundo' }] } };
    const { container } = render(view('rvr'));
    const v = container.querySelector('#v-16');
    expect(v.textContent).toContain('Porque de tal manera amó Dios al mundo');
    expect(v.getAttribute('lang')).toBe('es');
  });
  it('does not mark the English stand-in while the edition is still downloading', () => {
    const { container } = render(view('rvr'));
    const v = container.querySelector('#v-16');
    expect(v.textContent).toContain('(nkjv)');
    expect(v.hasAttribute('lang')).toBe(false);
  });
  it('leaves English editions to the page\'s own language', () => {
    const { container } = render(view('nkjv'));
    expect(container.querySelector('#v-16').hasAttribute('lang')).toBe(false);
  });
});

/* search200 UX B1: navBack from a search hit — see LetterView.labels.test.jsx. A
   verse hit on a Bible chapter took two taps (chapter, then the book index's back). */
describe('BibleChapterView — the ‹ goes back to the results from a search hit (search200 UX B1)', () => {
  it('names the results and goes there, not to the book index', () => {
    const onIndex = vi.fn(), onResults = vi.fn();
    render(<BibleChapterView book={JOHN} chapter={JOHN.chapters[0]} translation="nkjv" theme="dark"
      markAsReadEnabled={false} onNavigate={() => {}} onIndex={onIndex} navBack={{ onBack: onResults, label: 'results' }} />);
    const back = document.querySelector('.nav-back-icon');
    expect(back.getAttribute('aria-label')).toBe('Back to results');
    fireEvent.click(back);
    expect(onResults).toHaveBeenCalledTimes(1);
    expect(onIndex).not.toHaveBeenCalled();
  });
});
