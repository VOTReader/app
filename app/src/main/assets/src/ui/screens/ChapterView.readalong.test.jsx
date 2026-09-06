// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)

/* ChapterView — the read-along mount (Architect, readalong-corpus-model §5.2/§7).
   ─────────────────────────────────────────────────────────────────────────
   `bible-sync-brm-kjv.js` already ships "matthew" with all 28 chapters. The
   Matthew screen is MatthewChapterView → ChapterView, which has the Listen
   pill and NO ReadAlongHighlight — the mount lives only in BibleChapterView,
   and Matthew does not route through it. So BRM's Matthew plays over the
   Matthew text with the wash dead and the data already on disk. The cheapest
   read-along coverage in the corpus, zero GPU.

   THE TRAP, and it is why this file exists rather than one line in
   ChapterView.test.jsx: this screen keys its verses
   `studyHlKey(book.id + '-' + chapter.num, v.n)`, not
   `bibleHlKey(bookId, chapter, verse)`. A mount handed the Bible key fn
   resolves nothing, paints nothing, and looks EXACTLY like missing timings.
   So the agreement below is read off the DOM the screen rendered — never
   written out as a format, which would agree with itself and with nothing.

   And the stub matters. ChapterView.test.jsx renders HighlightableText as
   `({text}) => <span>{text}</span>`, dropping the hlKey entirely — the one
   attribute this whole file rests on. The stub here emits what
   annotation-engine.jsx:324 emits, and the first case proves it does before
   anything else is asserted.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';

/** Every ReadAlongHighlight the screen mounted, with the props it was given. */
let mounts;
vi.mock('../components/ReadAlongHighlight.jsx', () => ({
  ReadAlongHighlight: (props) => { mounts.push(props); return null; },
}));

import { ChapterView } from './ChapterView.jsx';

const VERSES = [
  { n: 1, text: 'The book of the generation of Jesus Christ.' },
  { n: 2, text: 'Abraham begat Isaac; and Isaac begat Jacob.' },
  { n: 3, text: 'And Judas begat Phares and Zara of Thamar.' },
];
const MATTHEW = {
  id: 'matthew', title: 'Matthew',
  chapters: [{ num: 1 }, { num: 2 }],   // ChapterView:61 walks these for prev/next
};
const CHAPTER = { num: 1, verses: VERSES, scriptures: [], votNotes: [] };
const BRM = { volKey: 'bible-brm-kjv', label: 'KJV · Biblical Restoration Ministries' };

beforeEach(() => {
  mounts = [];
  globalThis.ScreenLayout = (props) => <div>{props.navChildren}{props.children}</div>;
  globalThis.StickyChapterNav = () => null;
  globalThis.LibraryNav = () => null;
  globalThis.HomeBtn = () => null;
  globalThis.NavButtons = () => null;
  globalThis.ChapterBookmarkBtn = () => null;
  // What annotation-engine.jsx:324 really renders. The key IS the point here.
  globalThis.HighlightableText = ({ text, hlKey }) => <span data-hl-key={hlKey}>{text}</span>;
  globalThis.LinkIcon = () => null;
  globalThis.BookmarkIcon = () => null;
  globalThis.InlineEcho = () => null;
  globalThis.InlineNotes = () => null;
  globalThis.StudyPanels = () => null;
  globalThis.ScriptureSheet = () => null;
  globalThis.studyHlKey = (id, n) => `study:${id}:${n}`;
  globalThis.useMarkAsRead = () => {};
  globalThis.useModalRegistry = () => {};
  globalThis.getNotesForVerse = () => ({ scriptures: [], votNotes: [] });
  globalThis.getEchoesForVerse = () => ({ scriptures: [], votNotes: [] });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

const show = (props) => render(
  <ChapterView
    book={MATTHEW} chapter={CHAPTER} mode="pdf" showStudy={false} showEchoes={false}
    showChapterTitle bibleAudio={BRM} readAlongOn readAlongFollow
    {...props}
  />
);

describe('ChapterView — the read-along mount (§5.2)', () => {
  it('the harness renders the verse key it claims to (proves the stub, first)', () => {
    // Every assertion below reads a data-hl-key off the DOM. If the stub drops
    // it the way ChapterView.test.jsx's does, they all go vacuous together.
    const { container } = show();
    const keys = [...container.querySelectorAll('[data-hl-key]')]
      .map((el) => el.getAttribute('data-hl-key'));
    expect(keys.length, 'no keyed verses rendered').toBeGreaterThanOrEqual(VERSES.length);
    expect(keys).toContain('study:matthew-1:1');
  });

  it('mounts a read-along when a Bible edition is offered', () => {
    show();
    expect(mounts.length, 'no ReadAlongHighlight on the Matthew screen').toBe(1);
  });

  it('resolves the key the screen ACTUALLY rendered, not the Bible key shape', () => {
    // §7's correction, and the only case that catches a mount wired with
    // bibleHlKey — which would resolve 'bible:matthew:1:1' against a DOM that
    // only ever carries 'study:matthew-1:1', paint nothing, and read as
    // missing data. The expectation comes from the DOM, so it cannot drift
    // apart from the screen.
    const { container } = show();
    expect(mounts.length).toBe(1);
    const { hlKeyFn } = mounts[0];
    expect(typeof hlKeyFn, 'the mount was given no key fn').toBe('function');
    for (const v of VERSES) {
      const el = container.querySelector(`#v-${v.n} [data-hl-key]`)
        || container.querySelector(`[data-hl-key$=":${v.n}"]`);
      expect(el, `verse ${v.n} not rendered`).toBeTruthy();
      expect(hlKeyFn(MATTHEW.id, v.n), `verse ${v.n}`)
        .toBe(el.getAttribute('data-hl-key'));
    }
  });

  it('resolves the rendered key in INLINE mode too, which keys verses separately', () => {
    // ChapterView keys its verses in two places (pdf mode and inline mode).
    // One mount serves both, so both have to agree with it or the wash works
    // in one reading mode and is dead in the other.
    const { container } = show({ mode: 'inline' });
    expect(mounts.length).toBe(1);
    const { hlKeyFn } = mounts[0];
    const el = container.querySelector('[data-hl-key]');
    expect(el).toBeTruthy();
    expect(hlKeyFn(MATTHEW.id, 1)).toBe('study:matthew-1:1');
    expect(el.getAttribute('data-hl-key')).toBe('study:matthew-1:1');
  });

  it('hands the mount this book and this chapter', () => {
    show();
    expect(mounts[0].letterId, 'letterId must be the bookId the track carries').toBe('matthew');
    expect(mounts[0].chapter, 'the VIEWED chapter number').toBe(1);
    expect(mounts[0].volKey).toBe('bible-brm-kjv');
  });

  it('carries the reader\u2019s read-along settings rather than defaulting them on', () => {
    show({ readAlongOn: false, readAlongFollow: false });
    expect(mounts[0].readAlongOn).toBe(false);
    expect(mounts[0].readAlongFollow).toBe(false);
  });

  it('mounts nothing when Bible audio is off', () => {
    show({ bibleAudio: null });
    expect(mounts.length).toBe(0);
  });

  it('mounts nothing in the inert swipe clone', () => {
    // The peek renders a REAL ChapterView. Two live mounts fight over the
    // single global ::highlight(vot-reading) registration — the same contract
    // BibleChapterView and LetterView already keep.
    show({ inert: true });
    expect(mounts.length).toBe(0);
  });
});
