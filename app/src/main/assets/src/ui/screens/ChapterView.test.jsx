// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)

/* ChapterView — the behaviour, not the labels.
   ─────────────────────────────────────────────────────────────────────
   C2-D [D6]. ChapterView.labels.test.jsx covers the C2-C mislabel fix and
   nothing else; this is the rest of the screen's contract.

   The two that matter most are both about the INERT CLONE. This screen
   renders its own neighbour chapter as a swipe peek — the real component,
   rendered inert — which means every effect and every global claim runs
   TWICE per swipe unless it is gated. `window.__onReadingComplete` is a
   single global slot: a peek that claims it would hand "reading complete"
   to the chapter the reader is swiping AWAY from. And the scripture sheet
   portals to <body>, so an ungated clone would put a second copy of a
   fixed-position sheet in the document.

   The rest: boundary navigation (the last chapter of a book must not
   dead-end), the surprise-anchor flash and its 4s fade, and the
   Escape/back registration for the sheet. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { ChapterView } from './ChapterView.jsx';

const GLOBALS = ['ScreenLayout', 'StickyChapterNav', 'LibraryNav', 'HomeBtn', 'NavButtons',
  'ChapterBookmarkBtn', 'HighlightableText', 'LinkIcon', 'BookmarkIcon', 'InlineEcho',
  'InlineNotes', 'ScriptureSheet', 'StudyPanels', 'studyHlKey', 'useMarkAsRead',
  'useModalRegistry', 'getNotesForVerse', 'getEchoesForVerse'];

/** What the screen handed each collaborator on the last render. */
let markReadCalls; let modalCalls; let sheetProps; let layoutProps;
/** jsdom's own scrollIntoView (absent today), restored after each test. */
let priorScrollIntoView;

beforeEach(() => {
  markReadCalls = []; modalCalls = []; sheetProps = null; layoutProps = null;
  globalThis.ScreenLayout = (props) => {
    layoutProps = props;
    return <div data-testid="screen">{props.navChildren}{props.children}</div>;
  };
  globalThis.StickyChapterNav = () => null;
  globalThis.LibraryNav = () => null;
  globalThis.HomeBtn = () => null;
  globalThis.NavButtons = () => null;
  globalThis.HighlightableText = ({ text }) => <span>{text}</span>;
  globalThis.LinkIcon = () => null;
  globalThis.BookmarkIcon = () => null;
  globalThis.InlineEcho = () => null;
  globalThis.InlineNotes = () => null;
  globalThis.StudyPanels = (p) => { globalThis.__panelProps = p; return <div data-testid="panels" />; };
  globalThis.ScriptureSheet = (p) => { sheetProps = p; return <div data-testid="sheet" />; };
  globalThis.studyHlKey = (id, n) => `study:${id}:${n}`;
  globalThis.useMarkAsRead = (enabled, cb, key) => { markReadCalls.push({ enabled, cb, key }); };
  globalThis.useModalRegistry = (reg) => { modalCalls.push(reg); };
  globalThis.getNotesForVerse = () => ({ scriptures: [], votNotes: [] });
  globalThis.getEchoesForVerse = () => ({ scriptures: [], votNotes: [] });
  // jsdom has no layout, so no scrollIntoView. The surprise-anchor effect
  // calls it on a real element; a no-op is enough to observe the call.
  // RESTORED in afterEach — a permanent prototype assignment would leak into
  // every later test file in the run (the leaked-stub class this repo has
  // already been bitten by once).
  priorScrollIntoView = Element.prototype.scrollIntoView;
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  GLOBALS.forEach((k) => delete globalThis[k]);
  delete globalThis.__panelProps;
  delete window.__closeSheet;
  if (priorScrollIntoView === undefined) delete Element.prototype.scrollIntoView;
  else Element.prototype.scrollIntoView = priorScrollIntoView;
  vi.useRealTimers();
});

const CH = (num) => ({
  num, title: `Ch ${num}`,
  verses: [{ n: 1, text: 'first verse' }, { n: 2, text: 'second verse' }],
  sections: [{ heading: null, verses: [{ n: 1, text: 'first verse' }] }],
});
const book = (over = {}) => ({ id: 'matthew', title: 'Matthew', chapters: [CH(1), CH(2), CH(3)], ...over });

const renderCh = (props = {}, chapterNum = 2, bk = book()) => render(
  <ChapterView
    book={bk}
    chapter={bk.chapters.find((c) => c.num === chapterNum)}
    mode="pdf" theme="dark" markAsReadEnabled={false}
    onNavigate={() => {}} onIndex={() => {}}
    {...props}
  />,
);

const navCards = () => [...document.querySelectorAll('.bottom-nav-card')];

/* ── the inert clone ──────────────────────────────────────────────── */

describe('ChapterView — the inert swipe clone claims nothing', () => {
  it('never claims the reading-complete bridge, even when asked to', () => {
    // The peek is the same component with markAsReadEnabled forced false, but
    // the gate lives HERE so a caller that forgets cannot hand "you finished
    // reading" to the chapter being swiped away from.
    renderCh({ inert: true, markAsReadEnabled: true, onMarkRead: () => {}, readTrackKey: 'v1:matthew:2' });
    expect(markReadCalls[0].enabled).toBe(false);
  });

  it('passes the enable flag straight through when it is NOT a clone', () => {
    const onMarkRead = () => {};
    renderCh({ markAsReadEnabled: true, onMarkRead, readTrackKey: 'v1:matthew:2' });
    expect(markReadCalls[0]).toMatchObject({ enabled: true, cb: onMarkRead, key: 'v1:matthew:2' });
  });

  it('does not mount a second scripture sheet into the document', () => {
    // ScriptureSheet portals to <body>; a clone's copy would be a duplicate
    // fixed-position sheet the reader could see through the peek.
    renderCh({ inert: true });
    expect(document.querySelector('[data-testid="sheet"]')).toBeNull();
    cleanup();
    renderCh();
    expect(document.querySelector('[data-testid="sheet"]')).not.toBeNull();
  });

  it('hands the pager to the layout only when it is not a clone', () => {
    renderCh({ inert: true });
    expect(layoutProps.pager).toBeUndefined();
    expect(layoutProps.inert).toBe(true);
    cleanup();
    renderCh();
    expect(typeof layoutProps.pager.onPrev).toBe('function');
  });
});

/* ── chapter + book boundaries ────────────────────────────────────── */

describe('ChapterView — the last chapter does not dead-end', () => {
  it('navigates within the book when a neighbouring chapter exists', () => {
    const onNavigate = vi.fn();
    renderCh({ onNavigate }, 2);
    const [prev, next] = navCards();
    fireEvent.click(prev); expect(onNavigate).toHaveBeenCalledWith(1);
    fireEvent.click(next); expect(onNavigate).toHaveBeenCalledWith(3);
  });

  it('falls through to the BOOK boundary at each end, naming the book it crosses to', () => {
    const onPrevBoundary = vi.fn(); const onNextBoundary = vi.fn();
    renderCh({ onPrevBoundary, onNextBoundary, prevBoundary: { title: 'Malachi' } }, 1);
    const [prev] = navCards();
    expect(prev.textContent).toContain('Malachi');
    fireEvent.click(prev);
    expect(onPrevBoundary).toHaveBeenCalled();
    cleanup();

    renderCh({ onNextBoundary, nextBoundary: { title: 'Mark' } }, 3);
    const next = navCards()[1];
    expect(next.textContent).toContain('Mark');
    fireEvent.click(next);
    expect(onNextBoundary).toHaveBeenCalled();
  });

  it('renders a dead placeholder — not a live button — with no chapter and no boundary', () => {
    renderCh({}, 1);
    const [prev] = navCards();
    expect(prev.className).toContain('placeholder');
    expect(prev.tagName).toBe('DIV');          // not a button: nothing to press
    expect(prev.textContent).toContain('—');
  });

  it('disables the sticky arrows at a true end and leaves them live at a boundary', () => {
    renderCh({}, 1);
    expect(layoutProps.stickyNav.props.prevDisabled).toBe(true);
    cleanup();
    renderCh({ prevBoundary: { title: 'Malachi' } }, 1);
    expect(layoutProps.stickyNav.props.prevDisabled).toBe(false);
  });

  it('peeks the neighbouring CHAPTER as a screen and the book edge as a card', () => {
    renderCh({ nextBoundary: { title: 'Mark', short: 'Mark' } }, 2);
    expect(layoutProps.pager.peek('next').kind).toBe('screen');
    cleanup();
    renderCh({ nextBoundary: { title: 'Mark', short: 'Mark' } }, 3);
    const edge = layoutProps.pager.peek('next');
    expect(edge.kind).toBe('boundary');
    expect(edge.title).toBe('Mark');
    expect(edge.eyebrow).toContain('Next');
  });
});

/* ── the surprise anchor ──────────────────────────────────────────── */

describe('ChapterView — the Surprise anchor flashes a verse, then lets go', () => {
  it('marks the anchored verses and clears the flash after 4s', () => {
    vi.useFakeTimers();
    renderCh({ surpriseAnchor: { type: 'verse', verses: [2] } });
    expect(document.querySelector('#v-2').className).toContain('verse-surprise');
    expect(document.querySelector('#v-1').className).not.toContain('verse-surprise');
    act(() => { vi.advanceTimersByTime(4000); });
    expect(document.querySelector('#v-2').className).not.toContain('verse-surprise');
  });

  it('scrolls the first anchored verse into view once the DOM has settled', () => {
    vi.useFakeTimers();
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    renderCh({ surpriseAnchor: { type: 'verse', verses: [2] } });
    expect(scrollIntoView).not.toHaveBeenCalled();   // not synchronously
    act(() => { vi.advanceTimersByTime(150); });
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'center' });
  });

  it('ignores an anchor of another kind', () => {
    renderCh({ surpriseAnchor: { type: 'letter', letterId: 'x' } });
    expect(document.querySelector('.verse-surprise')).toBeNull();
  });
});

/* ── the scripture sheet ──────────────────────────────────────────── */

describe('ChapterView — the scripture sheet is dismissible by every route', () => {
  it('registers with the modal registry so Escape reaches it, but only while open', () => {
    renderCh({ showStudy: true });
    const reg = modalCalls[modalCalls.length - 1];
    expect(reg.id).toBe('scripture-sheet');
    expect(reg.active).toBe(false);         // no active ref yet
    act(() => { globalThis.__panelProps.onScriptureClick('John 3:16'); });
    const open = modalCalls[modalCalls.length - 1];
    expect(open.active).toBe(true);
    act(() => { open.dismiss(); });
    expect(modalCalls[modalCalls.length - 1].active).toBe(false);
  });

  it('claims window.__closeSheet only while a ref is open, and restores the prior owner', () => {
    const previousOwner = () => {};
    window.__closeSheet = previousOwner;
    renderCh({ showStudy: true });
    expect(window.__closeSheet).toBe(previousOwner);   // nothing open yet
    act(() => { globalThis.__panelProps.onScriptureClick('John 3:16'); });
    expect(window.__closeSheet).not.toBe(previousOwner);
    act(() => { window.__closeSheet(); });             // the hardware/back close
    expect(window.__closeSheet).toBe(previousOwner);
  });

  it('closes the sheet BEFORE navigating away on "Go to Scripture"', () => {
    // Leaving the sheet mounted across the navigation would strand a
    // fixed-position panel over the destination chapter.
    const onNavigateToLink = vi.fn();
    renderCh({ onNavigateToLink, showStudy: true });
    act(() => { globalThis.__panelProps.onScriptureClick('John 3:16'); });
    expect(sheetProps.activeRef).toBe('John 3:16');
    act(() => { sheetProps.onGoToRef({ type: 'bible', key: 'bible:john:3:16' }); });
    expect(sheetProps.activeRef).toBeNull();
    expect(onNavigateToLink).toHaveBeenCalledWith(
      { type: 'bible', key: 'bible:john:3:16' },
      { sourceLetterTitle: 'Matthew 2', sourceVolumeLabel: 'Study Bible' },
    );
  });

  it('offers no Go-to-Scripture at all when the host gave it nowhere to go', () => {
    renderCh({ onNavigateToLink: null });
    expect(sheetProps.onGoToRef).toBeNull();
  });
});
