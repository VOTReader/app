// @ts-nocheck — free-var globals stubbed per test; only render-affecting props passed
/* MatthewChapterView + ChapterView's hero Listen pill (A5, 2026-08-10).
   ──────────────────────────────────────────────────────────────────────
   matthew-ch is a Bible chapter screen like any other — the audio manifest
   ships Matthew under every edition, and the listening desk's title jump can
   LAND the reader here — but it was the one chapter view with no way to start
   the recording. The pill mirrors BibleChapterView's exactly: same call, same
   book/chapter, same three conditions for being absent (Settings' Bible Audio
   off, an unknown edition, or an edition that does not ship this book).

   ChapterView is the component that owns the hero, so it is what renders the
   pill; MatthewChapterView's job is to carry `bibleAudio` down to it, and the
   route's job is to hand it the same `bibleAudioProp` bible-ch gets. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { AudioPlayer } from '../../utils/audio-player.js';
import { ChapterView } from './ChapterView.jsx';
import { MatthewChapterView } from './MatthewChapterView.jsx';

const STUBBED = [
  'ScreenLayout', 'StickyChapterNav', 'LibraryNav', 'HighlightableText',
  'LinkIcon', 'BookmarkIcon', 'InlineEcho', 'InlineNotes', 'ScriptureSheet',
  'StudyPanels', 'studyHlKey', 'useMarkAsRead', 'useModalRegistry',
  'MATTHEW', 'ChapterView', 'ModeToggle', 'studyShortTitle',
  'BIBLE_AUDIO_MANIFEST',
];

const CH = (num) => ({
  num,
  title: `Ch ${num}`,
  verses: [{ n: 1, text: 'The book of the genealogy' }],
  sections: [{ heading: null, verses: [{ n: 1, text: 'The book of the genealogy' }] }],
});
const MATTHEW_BOOK = { id: 'matthew', title: 'Matthew', chapters: [CH(1), CH(2), CH(3)] };

const EDITION = { volKey: 'bible-brm-kjv', label: 'KJV · Biblical Restoration Ministries' };

beforeEach(() => {
  globalThis.ScreenLayout = ({ children }) => <main>{children}</main>;
  globalThis.StickyChapterNav = () => null;
  globalThis.LibraryNav = () => null;
  globalThis.HighlightableText = ({ text }) => <span>{text}</span>;
  globalThis.LinkIcon = () => null;
  globalThis.BookmarkIcon = () => null;
  globalThis.InlineEcho = () => null;
  globalThis.InlineNotes = () => null;
  globalThis.ScriptureSheet = () => null;
  globalThis.StudyPanels = () => null;
  globalThis.studyHlKey = (id, n) => `study:${id}:${n}`;
  globalThis.useMarkAsRead = () => {};
  globalThis.useModalRegistry = () => {};
  globalThis.MATTHEW = MATTHEW_BOOK;
  globalThis.ModeToggle = () => null;
  globalThis.studyShortTitle = (t) => t;
  // Matthew is chapter-recorded by every shipped edition; hasAudio reads this.
  globalThis.BIBLE_AUDIO_MANIFEST = {
    'bible-brm-kjv:matthew': [
      ['brm2_matthew_001', '', 'Chapter 1'],
      ['brm2_matthew_002', '', 'Chapter 2'],
      ['brm2_matthew_003', '', 'Chapter 3'],
    ],
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  STUBBED.forEach((key) => { delete globalThis[key]; });
});

const renderChapter = (extra) => render(
  <ChapterView
    book={MATTHEW_BOOK}
    chapter={MATTHEW_BOOK.chapters[1]}   // chapter 2
    mode="pdf"
    theme="dark"
    markAsReadEnabled={false}
    onNavigate={() => {}}
    {...extra}
  />,
);

describe('ChapterView — the hero Listen pill (Matthew parity)', () => {
  it('starts the chosen edition at THIS chapter of THIS book', () => {
    const play = vi.spyOn(AudioPlayer, 'playBibleBook').mockImplementation(() => {});
    renderChapter({ bibleAudio: EDITION });

    const pill = screen.getByRole('button', { name: 'Listen' });
    fireEvent.click(pill);
    expect(play).toHaveBeenCalledExactlyOnceWith({
      volKey: 'bible-brm-kjv', bookId: 'matthew', label: EDITION.label, chapterNum: 2,
    });
  });

  it('is absent when Bible Audio is off (no edition prop at all)', () => {
    renderChapter({});
    expect(screen.queryByRole('button', { name: 'Listen' })).toBeNull();
  });

  it('is absent for an edition that has not recorded this book', () => {
    renderChapter({ bibleAudio: { volKey: 'bible-web', label: 'WEB · World English Bible' } });
    expect(screen.queryByRole('button', { name: 'Listen' })).toBeNull();
  });
});

describe('MatthewChapterView — threads the edition down to the hero', () => {
  it('hands ChapterView the bibleAudio the route gave it', () => {
    let captured = null;
    globalThis.ChapterView = (props) => { captured = props; return null; };
    render(
      <MatthewChapterView
        chapter={MATTHEW_BOOK.chapters[2]}
        chapterNum={3}
        settings={{ markAsRead: true }}
        bibleAudio={EDITION}
        prevChainEntry={() => null}
        nextChainEntry={() => null}
      />,
    );
    expect(captured).toBeTruthy();
    expect(captured.bibleAudio).toEqual(EDITION);
    expect(captured.book).toBe(MATTHEW_BOOK);
  });

  it('passes null through when Bible Audio is off', () => {
    let captured = null;
    globalThis.ChapterView = (props) => { captured = props; return null; };
    render(
      <MatthewChapterView
        chapter={MATTHEW_BOOK.chapters[0]}
        chapterNum={1}
        settings={{ markAsRead: true }}
        prevChainEntry={() => null}
        nextChainEntry={() => null}
      />,
    );
    expect(captured.bibleAudio).toBe(null);
  });
});
