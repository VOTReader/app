// @ts-nocheck — free-var globals stubbed per test; only render-affecting props passed
/* BibleChapterView — a swipe peek shows what the committed page will show (sweep v068).
   ──────────────────────────────────────────────────────────────────
   While a book's recording is loaded, that book's chapters show the recording's
   edition (utils/audio-text-edition.js). The pager peek is the real
   BibleChapterView rendered inert, and it used to be handed the RESOLVED
   translation (KJV, Genesis's recording) as its reader translation. A peek into
   the NEXT book (Exodus, no recording loaded) then stayed on KJV, and the moment
   the swipe settled the live Exodus page fell back to the reader's NKJV: the
   words changed under the reader. Each clone now gets the reader's own choice and
   works out its own recording match, so a same-book peek still shows the
   recording's edition (with its "to match the recording" line) and a next-book
   peek shows the reader's. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { LibraryNav } from '../components/LibraryNav.jsx';

// The BRM KJV recording of GENESIS is loaded; nothing for any other book.
const recordings = { genesis: 'kjv' };
vi.mock('../../utils/audio-text-edition.js', async (importOriginal) => {
  const real = /** @type {any} */ (await importOriginal());
  return { ...real, recordingTranslationFor: (_player, bookId) => recordings[bookId] || '' };
});
vi.mock('../../data/translations.js', async (importOriginal) => {
  const real = /** @type {any} */ (await importOriginal());
  return { ...real, loadTranslation: vi.fn(() => Promise.resolve()) };
});

import { BibleChapterView } from './BibleChapterView.jsx';
import { _translationLoaded } from '../../data/translations.js';

const STUBBED = [
  'ReactDOM', 'ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons', 'LibraryNav',
  'useMarkAsRead', 'useModalRegistry', 'OT_BOOK_IDS', 'HighlightableText', 'bibleHlKey',
  'LinkIcon', 'BookmarkIcon', 'TRANSLATION_OPTIONS', 'BIBLE_KJV',
];
let capturedPager;
let priorScrollIntoView;

beforeEach(() => {
  capturedPager = null;
  globalThis.ReactDOM = ReactDOM;
  // The live page hands ScreenLayout its pager; an inert clone hands it none.
  globalThis.ScreenLayout = ({ children, navChildren, pager }) => {
    if (pager) capturedPager = pager;
    return <div>{navChildren}{children}</div>;
  };
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
  globalThis.BIBLE_KJV = {
    genesis: { 49: [{ n: 1, text: 'And Jacob called unto his sons (kjv)' }], 50: [{ n: 1, text: 'And Joseph fell upon his father\'s face (kjv)' }] },
    exodus: { 1: [{ n: 1, text: 'Now these are the names (kjv)' }] },
  };
  _translationLoaded.kjv = true;
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

const CH = (num, text) => ({ num, title: `Ch ${num}`, sections: [{ heading: null, verses: [{ n: 1, text }] }] });
const GENESIS = { id: 'genesis', title: 'Genesis', chapters: [
  CH(49, 'Then Jacob called his sons (nkjv)'),
  CH(50, 'Then Joseph fell on his father\'s face (nkjv)'),
] };
const EXODUS = { id: 'exodus', title: 'Exodus', chapters: [CH(1, 'Now these are the names (nkjv)')] };

/** The reader's setting is NKJV throughout: only the recording changes what shows. */
const page = (book, chapter, extra = {}) => (
  <BibleChapterView book={book} chapter={chapter} translation="nkjv" theme="dark"
    markAsReadEnabled={false} onNavigate={() => {}} {...extra} />
);
/** What a page's verses and recording line read once the edition has landed. */
const shown = async (el) => {
  const { container, unmount } = render(el);
  await act(async () => { await Promise.resolve(); });
  const text = container.textContent;
  unmount();
  return text;
};

describe('BibleChapterView swipe peek under a loaded recording (sweep v068)', () => {
  it('a peek into the NEXT book shows the reader\'s NKJV, the text the committed page shows', async () => {
    render(page(GENESIS, GENESIS.chapters[1], { nextBook: EXODUS }));
    const desc = capturedPager.peek('next');
    expect(desc.kind).toBe('screen');
    expect(desc.el.props.book).toBe(EXODUS);

    const peek = await shown(desc.el);
    const committed = await shown(page(EXODUS, EXODUS.chapters[0]));

    expect(committed).toContain('Now these are the names (nkjv)');
    expect(peek).toContain('Now these are the names (nkjv)');      // was the KJV of Genesis's recording
    expect(peek).not.toContain('(kjv)');
  });

  it('a same-book peek still shows the recording\'s edition, line and all, as the committed page does', async () => {
    render(page(GENESIS, GENESIS.chapters[0]));
    const desc = capturedPager.peek('next');
    expect(desc.el.props.book).toBe(GENESIS);

    const peek = await shown(desc.el);
    const committed = await shown(page(GENESIS, GENESIS.chapters[1]));

    expect(committed).toContain('And Joseph fell upon his father\'s face (kjv)');
    expect(committed).toMatch(/KJV text, to match the recording/);
    expect(peek).toContain('And Joseph fell upon his father\'s face (kjv)');
    expect(peek).toMatch(/KJV text, to match the recording/);       // no line popping in after release
  });
});
