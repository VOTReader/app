// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* Leak gate for the READING screens (leak hunt, 2026-11-01).
   ─────────────────────────────────────────────────────────────────────
   Each reading screen mounted and unmounted 20 times in jsdom, with the real
   ScreenLayout and LibraryNav around it, and every window/document listener,
   timer, frame, observer, store subscription, channel, database connection and
   object URL it started must be gone after each unmount (ui/leak/leak-harness.js).
   Where a screen has a sheet or a find bar, a cycle opens it before the unmount,
   so the sheet's own timers and listeners are held to the same rule. Fixtures and
   globals mirror reading-screens.axe.test.jsx. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { installLeakHarness, expectNoLeaks } from '../leak/leak-harness.js';
import { ScreenLayout } from '../components/ScreenLayout.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';
import { Segments } from '../components/Segments.jsx';
import { ProphecyGroup } from '../components/ProphecyGroup.jsx';
import { ProphecyCard } from '../components/ProphecyCard.jsx';
import { ProphecyExpandToggle } from '../components/ProphecyExpandToggle.jsx';
import { FootnoteSheet } from '../components/FootnoteSheet.jsx';
import { FootnoteListSection } from '../components/FootnoteListSection.jsx';
import { ExpandableVerse } from '../components/ExpandableVerse.jsx';
import { InAppLinkButton } from '../components/InAppLinkButton.jsx';
import { AudioPlayer } from '../../utils/audio-player.js';
import { modalRegistry } from '../../hooks/use-modal-registry.js';
import { StudyPanels } from '../components/StudyPanels.jsx';
import { InlineNotes } from '../components/InlineNotes.jsx';
import { InlineEcho } from '../components/InlineEcho.jsx';
import { ScriptureSheet } from '../components/ScriptureSheet.jsx';
import { SheetHandle } from '../components/SheetHandle.jsx';
import { useFocusTrap } from '../../hooks/use-focus-trap.js';
import { useModalRegistry } from '../../hooks/use-modal-registry.js';
import { LetterView } from './LetterView.jsx';
import { WtlbEntryView } from './WtlbEntryView.jsx';
import { ChapterView } from './ChapterView.jsx';
import { ChapterIndex } from './ChapterIndex.jsx';
import { BibleChapterView } from './BibleChapterView.jsx';
import { MatthewChapterView } from './MatthewChapterView.jsx';
import { BibleStudyChapterView } from './BibleStudyChapterView.jsx';
import { BibleStudyIndex } from './BibleStudyIndex.jsx';
import { AnswersHome, resetAnswersLanding } from './AnswersHome.jsx';
import { AnswersShelf } from './AnswersShelf.jsx';
import { AnswersSaved } from './AnswersSaved.jsx';
import { AnswersMedia } from './AnswersMedia.jsx';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';

// The code under test imports these; the test stubs them as globals (bridge-imports, as WtlbEntryView.modal.test.jsx).
vi.mock('../../data/scripture-resolution.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get COL_BY_KEY() { return /** @type {any} */ (globalThis).COL_BY_KEY; } }; });
vi.mock('../../utils/audio-text-edition.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, recordingTranslationFor: () => null }; });

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const ctx = {};
runInNewContext(readFileSync(resolve(DATA, 'answers.js'), 'utf8') + ';this.SITE=ANSWERS_SITE_META;', ctx);
runInNewContext(readFileSync(resolve(DATA, 'answers-meta.js'), 'utf8') + ';this.META=ANSWERS_META;', ctx);
const ANSWERS = ctx.ANSWERS;
const SITE = ctx.SITE;

const LONG = 'And I saw a new heaven and a new earth, for the first heaven and the first earth had passed away. Also there was no more sea. Then I, John, saw the holy city, New Jerusalem, coming down out of heaven from God, prepared as a bride adorned for her husband.';

/** Every global a test below installs; each one's prior value is put back after it. */
const GLOBALS = ['ReactDOM', 'ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons', 'LibraryNav',
  'FootnoteSheet', 'FootnoteListSection', 'ExpandableVerse', 'InAppLinkButton', 'GoToRefButton',
  'Segments', 'ProphecyGroup', 'ProphecyCard', 'ProphecyExpandToggle', 'StaticSubtree', '_extends',
  'TabsNavBtn', 'useMarkAsRead', 'ScriptureVerseText', 'VerseWithNumbers', 'lookupVersesFromBooks', '__scrollEl',
  'SheetHandle', 'useFocusTrap', 'useModalRegistry', 'useRailMode', 'COL_BY_KEY', 'COL_BY_LETTER_SC',
  'WTLB_SCRIPTURES', 'colLetterArr', 'colPreface', 'wtlbHlKey',
  'StudyPanels', 'InlineNotes', 'InlineEcho', 'ScriptureSheet', 'MATTHEW_NKJV', 'MATTHEW', 'ModeToggle',
  'HighlightableText', 'LinkIcon', 'BookmarkIcon', 'studyHlKey', 'bibleHlKey', 'getNotesForVerse', 'getEchoesForVerse',
  'OT_BOOK_IDS', 'TRANSLATION_OPTIONS', 'LetterView', 'ChapterView', 'studyShortTitle', 'ANSWERS_META', 'AnnotationStore', 'NoteStore'];
let saved;
let harness;
/** A store's subscribe with real add/remove semantics, so the harness can count what stays subscribed. */
const subs = () => { const l = new Set(); return { subscribe: (cb) => { l.add(cb); return () => { l.delete(cb); }; } }; };
let realAudio;
let priorScrollIntoView;

beforeEach(() => {
  saved = Object.fromEntries(GLOBALS.map((k) => [k, Object.getOwnPropertyDescriptor(globalThis, k)]));
  realAudio = { hasAudio: AudioPlayer.hasAudio, playLetter: AudioPlayer.playLetter, prewarm: AudioPlayer.prewarm };
  modalRegistry._reset();
  document.documentElement.lang = 'en';
  document.title = 'VOTReader';
  Object.assign(globalThis, {
    ReactDOM, ScreenLayout, LibraryNav, Segments, ProphecyGroup, ProphecyCard, ProphecyExpandToggle,
    FootnoteSheet, FootnoteListSection, ExpandableVerse, InAppLinkButton, __scrollEl: null,
    StickyChapterNav: () => null,
    HomeBtn: () => null,
    TabsNavBtn: () => null,
    NavButtons: () => null,
    GoToRefButton: ({ refStr, onGo }) => <button type="button" className="go-to-ref-btn" onClick={() => onGo({ type: 'bible', ref: refStr })}>Go to Scripture</button>,
    StaticSubtree: ({ children }) => <>{children}</>,
    _extends: (a, b) => ({ ...a, ...b }),
    useMarkAsRead: () => {},
    ScriptureVerseText: ({ text }) => <span>{text}</span>,
    VerseWithNumbers: ({ text }) => <span>{text}</span>,
    lookupVersesFromBooks: () => null,
    SheetHandle, useFocusTrap, useModalRegistry, useRailMode: () => false,
    COL_BY_KEY: new Map(), COL_BY_LETTER_SC: new Map(),
    WTLB_SCRIPTURES: { 'Matthew 4:4': 'But He answered and said, It is written.', 'John 3:16': LONG },
    colLetterArr: () => [], colPreface: () => null, wtlbHlKey: (id, i) => 'wtlb:' + id + ':' + i,
    StudyPanels, InlineNotes, InlineEcho, ScriptureSheet,
    MATTHEW_NKJV: { 'Isaiah 7:14': 'Behold, the virgin shall conceive.', 'Micah 5:2': 'But you, Bethlehem.' },
    ModeToggle: () => null,
    HighlightableText: ({ text }) => <span>{text}</span>,
    LinkIcon: () => null, BookmarkIcon: () => null,
    studyHlKey: (id, n) => 'study:' + id + ':' + n,
    bibleHlKey: (b, c, n) => 'bible:' + b + ':' + c + ':' + n,
    getNotesForVerse: (ch, n) => (n === 1 ? { scriptures: ch.scriptures || [], votNotes: [] } : { scriptures: [], votNotes: [] }),
    getEchoesForVerse: () => ({ scriptures: [], votNotes: [] }),
    OT_BOOK_IDS: new Set(),
    TRANSLATION_OPTIONS: [{ id: 'nkjv', label: 'NKJV', desc: 'x' }, { id: 'kjv', label: 'KJV', desc: 'x' }],
    LetterView,
    studyShortTitle: (t) => t,
    ANSWERS_META: ctx.META,
    AnnotationStore: { all: () => ({}), get: () => [], ...subs(), getVersion: () => 1 },
    NoteStore: { get: () => null, ...subs(), getVersion: () => 1 },
  });
  harness = installLeakHarness();
  resetAnswersLanding();
  try { localStorage.clear(); } catch (_e) { /* */ }
  window.navHandoff = { peek: () => null, clear: () => {} };
  AudioPlayer.hasAudio = () => true;
  AudioPlayer.playLetter = () => {};
  AudioPlayer.prewarm = () => {};
  priorScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = () => {};
});

afterEach(() => {
  harness.restore();
  cleanup();
  modalRegistry._reset();
  Object.assign(AudioPlayer, realAudio);
  for (const k of GLOBALS) {
    if (saved[k]) Object.defineProperty(globalThis, k, saved[k]);
    else delete globalThis[k];
  }
  delete window.navHandoff;
  delete window.__closeSheet;
  if (priorScrollIntoView === undefined) delete Element.prototype.scrollIntoView;
  else Element.prototype.scrollIntoView = priorScrollIntoView;
});

const LETTER = {
  id: 'the-wide-path', title: 'The Wide Path', subtitle: 'A Letter', num: 3,
  date: 'March 3, 2005', from: 'From The Lord, our God and Savior', spoken: 'Spoken to Timothy', forLine: 'For all',
  blocks: [
    { type: 'intro', segments: [{ t: 'text', v: 'Hear, My people.' }] },
    { type: 'heading', text: 'The Way', level: 2 },
    { type: 'para', segments: [{ t: 'text', v: 'Enter by the narrow gate' }, { t: 'fn', v: '1' }, { t: 'text', v: ' and see {{ref:Matthew 7:14}}.' }] },
    { type: 'para', segments: [{ t: 'text', v: 'Read also' }, { t: 'fn', v: '2' }, { t: 'text', v: ' and ' }, { t: 'letter-link', label: 'The Narrow Gate', letterId: 'x', screen: 'vot-letter' }] },
    { type: 'poetry', lines: [[{ t: 'text', v: 'Line one,' }], [{ t: 'italic', v: 'line two.' }]] },
    { type: 'prophecy-group', label: 'The Branch',
      intro: [{ type: 'para', segments: [{ t: 'text', v: 'Intro words.' }] }],
      ot: { label: 'Isaiah', blocks: [{ type: 'para', segments: [{ t: 'text', v: 'A Rod from Jesse.' }] }] },
      nt: { label: 'Luke', blocks: [{ type: 'para', segments: [{ t: 'text', v: 'Fulfilled.' }] }] } },
    { type: 'closing', text: 'Says The Lord.' },
  ],
  footnotes: {
    1: { type: 'scripture', ref: 'Matthew 7:13' },
    2: { type: 'link', text: 'See the letter', url: 'https://example.org/letter' },
  },
  nkjv: { 'Matthew 7:13': LONG, 'Matthew 7:14': 'Because narrow is the gate.' },
  relatedTopics: [{ label: 'The Narrow Way', url: 'https://example.org/topic' }],
  videos: [{ label: 'Reading', url: 'https://youtube.com/watch?v=a' }],
  prevLetter: { id: 'p', title: 'Before' }, nextLetter: { id: 'n', title: 'After' },
};

const renderLetter = (props = {}, letter = LETTER) => render(
  <LetterView letter={letter} volKey="two" volumeLabel="Volume Two" theme="dark" markAsReadEnabled={false}
    onNavigate={() => {}} onHome={() => {}} onNavigateToLink={() => {}} onInAppLink={() => {}} {...props} />,
);
const click = (sel) => { const el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (el) fireEvent.click(el); return !!el; };
const leakFree = (label, mount, interact, more = {}) => expectNoLeaks(harness, mount, { label, interact, cycles: 20, ...more });

describe('leaks — LetterView', () => {
  it('mount/unmount 20x leaves nothing running', async () => {
    await leakFree('LetterView', () => renderLetter());
  });
  it('with a footnote sheet open at unmount', async () => {
    await leakFree('LetterView + FootnoteSheet', () => renderLetter(), () => { expect(click('.fn-ref[data-fn-num="1"]')).toBe(true); });
  });
  it('with the inline scripture sheet open at unmount', async () => {
    await leakFree('LetterView + scripture sheet', () => renderLetter(), () => { expect(click('.inline-scrip-ref')).toBe(true); });
  });
});

const ENTRY = {
  id: 'matters-of-the-heart', title: 'Matters of the Heart', num: 11,
  paragraphs: [
    { align: 'justify', text: 'Man lives not by bread alone {{ref:Matthew 4:4}} but by every word.' },
    { align: 'center', text: '_For God so loved the world_\n**that He gave** {{ref:John 3:16}}' },
    { align: 'justify', text: 'The end.' },
  ],
  prevEntry: { id: 'a', title: 'Before' }, nextEntry: { id: 'b', title: 'After' },
};
const renderEntry = (props = {}) => render(
  <WtlbEntryView entry={ENTRY} volKey="wtlb2" partLabel="Part Two" theme="dark" markAsReadEnabled={false}
    footnotesMode={false} onNavigate={() => {}} onHome={() => {}} onNavigateToLink={() => {}} {...props} />,
);

describe('leaks — WtlbEntryView', () => {
  it('inline cites', async () => { await leakFree('WtlbEntryView', () => renderEntry()); });
  it('footnotes mode, sheet open at unmount', async () => {
    await leakFree('WtlbEntryView + sheet', () => renderEntry({ footnotesMode: true }), () => { expect(click('.fn-ref')).toBe(true); });
  });
  it('the scripture sheet open from a cite at unmount', async () => {
    await leakFree('WtlbEntryView + cite sheet', () => renderEntry(), () => { expect(click('a.wtlb-cite')).toBe(true); });
  });
  it('an Answers topic', async () => {
    const tino = ANSWERS.find((e) => e.id === 'there-is-no-other');
    await leakFree('WtlbEntryView (Answers topic)', () => render(
      <WtlbEntryView entry={tino} volKey="answers" partLabel="Answers" theme="dark" markAsReadEnabled={false} footnotesMode={false}
        onNavigate={() => {}} onHome={() => {}} answers={{ entries: ANSWERS, isRead: () => false, pathOn: true }} />,
    ));
  });
});

const MCH = (num) => ({
  num, title: 'The Birth of Jesus ' + num,
  verses: [{ n: 1, text: 'The book of the genealogy of Jesus Christ.' }, { n: 2, text: 'Abraham begot Isaac.' }],
  sections: [{ heading: 'The Genealogy', verses: [{ n: 1, text: 'The book of the genealogy of Jesus Christ.' }, { n: 2, text: 'Abraham begot Isaac.' }] }],
  scriptures: [{ ref: '1:1', cite: 'Isaiah 7:14' }, { ref: '1:2', cite: 'Micah 5:2' }, { ref: '1:2', cite: 'Genesis 21:3' }],
  votNotes: [],
  links: [{ label: 'Further reading', url: 'https://example.org/further' }],
});
const MATT = { id: 'matthew', title: 'Matthew', subtitle: 'The Gospel', chapters: [MCH(1), MCH(2), MCH(3)] };

describe('leaks — Matthew Study Bible', () => {
  const renderCh = (props = {}) => render(
    <ChapterView book={MATT} chapter={MATT.chapters[1]} mode="pdf" showStudy theme="dark" markAsReadEnabled={false}
      showChapterTitle onNavigate={() => {}} onIndex={() => {}} onNavigateToLink={() => {}} {...props} />,
  );
  it('ChapterView, PDF mode', async () => { await leakFree('ChapterView pdf', () => renderCh()); });
  it('ChapterView, inline mode', async () => { await leakFree('ChapterView inline', () => renderCh({ mode: 'inline' })); });
  it('ChapterView with the ScriptureSheet open at unmount', async () => {
    await leakFree('ChapterView + ScriptureSheet', () => renderCh(), () => { expect(click('button.scripture-ref')).toBe(true); });
  });
  it('MatthewChapterView', async () => {
    globalThis.MATTHEW = MATT;
    globalThis.ChapterView = ChapterView;
    const noop = () => {};
    await leakFree('MatthewChapterView', () => render(
      <MatthewChapterView chapter={MATT.chapters[0]} chapterNum={1} mode="pdf" showStudy fromStudies={false} settings={{}}
        prevChainEntry={() => null} nextChainEntry={() => null} goToChainEntryFirst={() => noop} goToChainEntryLast={() => noop}
        setSurpriseAnchor={noop} setFromStudies={noop} setMode={noop} setShowStudy={noop} markRead={noop} selectMatthewCh={noop}
        goMatthewIdx={noop} theme="dark" setTheme={noop} markAsReadEnabled={false} />,
    ));
  });
});

describe('leaks — Bible', () => {
  const BOOK = { id: 'psalms', title: 'Psalms', subtitle: '150 Chapters', chapters: [
    { num: 1, title: 'Blessed Is the Man' }, { num: 2, title: 'The Reign of the Anointed' }, { num: 3, title: '' }] };
  it('ChapterIndex', async () => {
    await leakFree('ChapterIndex', () => render(
      <ChapterIndex book={BOOK} onSelect={() => {}} onBack={() => {}} currentChapter={2} isRead={(n) => n === 1} readCount={(n) => (n === 1 ? 2 : 0)}
        markAsReadEnabled hasBookmark={(n) => n === 3} theme="dark" onThemeChange={() => {}} />,
    ));
  });
  const JOHN = { id: 'john', title: 'John', chapters: [
    { num: 2, title: 'Water to Wine', sections: [{ heading: null, verses: [{ n: 1, text: 'On the third day.' }] }] },
    { num: 3, title: 'The New Birth', sections: [
      { heading: 'The New Birth', verses: [{ n: 1, text: 'There was a man of the Pharisees.' }, { n: 2, text: 'This man came to Jesus by night.' }] },
      { heading: 'God So Loved', verses: [{ n: 16, text: 'For God so loved the world.' }] },
    ] },
    { num: 4, title: 'A Samaritan Woman', sections: [{ heading: null, verses: [{ n: 1, text: 'Therefore, when the Lord knew.' }] }] },
  ] };
  it('BibleChapterView', async () => {
    await leakFree('BibleChapterView', () => render(
      <BibleChapterView book={JOHN} chapter={JOHN.chapters[1]} translation="nkjv" theme="dark" markAsReadEnabled={false}
        showChapterTitle showSectionHeadings onNavigate={() => {}} onStudyNotes={() => {}} />,
    ));
  });
});

const STUDY = {
  id: 's1', slug: 's1', title: 'Purity', subtitle: 'A Bible/Letter Study', locked: false,
  prefaceId: 'pre',
  parts: [
    { num: 1, title: 'The Call', chapterIds: ['ch1', 'ch2'] },
    { num: 2, title: 'The Answer', subtitle: 'One section', chapterIds: ['ch3'] },
  ],
  chapters: [
    { id: 'pre', num: 0, title: 'Preface', blocks: [{ type: 'para', segments: [{ t: 'text', v: 'Before.' }] }] },
    { id: 'ch1', num: 1, title: 'One', part: 1, blocks: [{ type: 'heading', text: 'Heading', level: 2 }, { type: 'para', segments: [{ t: 'text', v: 'Study words' }, { t: 'fn', v: '1' }] }], footnotes: { 1: { type: 'scripture', ref: 'Matthew 5:8' } }, nkjv: { 'Matthew 5:8': 'Blessed are the pure in heart.' } },
    { id: 'ch2', num: 2, title: 'Two', part: 1, blocks: [{ type: 'para', segments: [{ t: 'text', v: 'More.' }] }] },
    { id: 'ch3', num: 3, title: '', part: 2, blocks: [{ type: 'para', segments: [{ t: 'text', v: 'Last.' }] }] },
  ],
};

describe('leaks — Bible/Letter studies', () => {
  it('BibleStudyIndex', async () => {
    await leakFree('BibleStudyIndex', () => render(
      <BibleStudyIndex study={STUDY} onSelect={() => {}} onBack={() => {}} theme="dark" onThemeChange={() => {}}
        isRead={(id) => id === 'ch1'} readCount={() => 1} markAsReadEnabled currentChapter="ch1" backHint={{ title: 'Studies' }} onTapThroughBack={() => {}} />,
    ));
  });
  it('BibleStudyChapterView with its footnote sheet open at unmount', async () => {
    const noop = () => {};
    window.__loadVotCorpus = vi.fn(() => Promise.resolve());
    try {
      await leakFree('BibleStudyChapterView', () => render(
        <BibleStudyChapterView studyId="s1" studyChapterId="ch1" getStudyById={() => STUDY}
          getStudyChapter={(s, id) => s.chapters.find((c) => c.id === id)} studiesLoading={false}
          prevChainEntry={() => null} nextChainEntry={() => null} goToChainEntryFirst={() => noop} goToChainEntryLast={() => noop}
          setStudyChapterId={noop} setScreen={noop} setBookId={noop} setChapterNum={noop} setFromStudies={noop} setLetterId={noop}
          setActiveReadKey={noop} setSurpriseAnchor={noop} markRead={noop} unmarkRead={noop} isRead={() => false}
          studyReadKey={(s) => 'study-' + s} prophecyCardStatesRef={{ current: {} }} saveProphecyCardStates={noop}
          selectStudy={noop} selectStudyChapter={noop} goStudiesHome={noop} sharedViewProps={{ theme: 'dark' }} />,
      ), () => { expect(click('.fn-ref')).toBe(true); });
    } finally { delete window.__loadVotCorpus; }
  });
});

describe('leaks — an Answers topic\'s Contents jump', () => {
  // A section picked in the Contents sheet lands two frames after the sheet closes; an unmount in
  // between let that landing (a state update and a scroll) run against a topic that was gone.
  it('a section picked, then the topic left at once, runs nothing after it', async () => {
    const tino = ANSWERS.find((e) => e.id === 'there-is-no-other');
    await leakFree('AnswersTopic contents jump', () => render(
      <WtlbEntryView entry={tino} volKey="answers" partLabel="Answers" theme="dark" markAsReadEnabled={false} footnotesMode={false}
        onNavigate={() => {}} onHome={() => {}} answers={{ entries: ANSWERS, isRead: () => false, pathOn: true }} />,
    ), async () => {
      await act(async () => { await new Promise((r) => setTimeout(r, 350)); });   // the body paints (sidecar or 300 ms)
      expect(click('button.ans-contents-line')).toBe(true);
      const row = document.querySelector('[role="dialog"] .ans-toc-sec, [role="dialog"] a.ans-row');
      expect(row, 'a section row in the Contents sheet').toBeTruthy();
      fireEvent.click(row);
    }, { unmountAt: 'interact' });
  });
});

describe('leaks — Answers browse screens', () => {
  const noop = () => {};
  const READ = new Set(['god-speaks-about-the-sabbath', 'regarding-patience']);
  const base = { entries: ANSWERS, site: SITE, isRead: (id) => READ.has(id), pathOn: true, pathLast: 'regarding-patience',
    onBack: noop, onSearch: noop, onHistory: noop, onSettings: noop, theme: 'dark', onThemeChange: noop, onOpenTopic: noop,
    onOpenGroup: noop, onOpenMedia: noop, onOpenSaved: noop, onSearchLibrary: noop, onGoToRef: noop, now: new Date(2026, 4, 17, 12) };
  it('AnswersHome', async () => { await leakFree('AnswersHome', () => render(<AnswersHome {...base} />)); });
  it('AnswersHome with a search typed (debounce pending at unmount)', async () => {
    await leakFree('AnswersHome + typed search', () => render(<AnswersHome {...base} />), () => {
      fireEvent.change(document.querySelector('input[aria-label="Search Answers"]'), { target: { value: 'sabbath' } });
    });
  });
  it('AnswersHome with the More questions sheet open', async () => {
    await leakFree('AnswersHome + sheet', () => render(<AnswersHome {...base} />), () => {
      expect(click([...document.querySelectorAll('button')].find((b) => b.textContent.startsWith('More questions')))).toBe(true);
    });
  });
  it('AnswersShelf', async () => { await leakFree('AnswersShelf', () => render(<AnswersShelf {...base} groupKey="5" />)); });
  it('AnswersSaved', async () => { await leakFree('AnswersSaved', () => render(<AnswersSaved {...base} />)); });
  it('AnswersMedia with a chart open', async () => {
    await leakFree('AnswersMedia', () => render(<AnswersMedia {...base} />), () => { click('.ans-thumb'); });
  });
});
