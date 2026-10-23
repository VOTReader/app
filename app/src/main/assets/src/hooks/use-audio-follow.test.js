// @ts-nocheck — drives a fake player store through the hook
/* w-audio-continue — RED for the follower ("Turn the Page with the Audio"; design-audio-continue.md §d).

   When the playing track crosses a UNIT boundary (another letter, another Bible chapter or book), the screen
   moves to the new reading ONLY when the active tab shows the unit that just ended — the live-pane rule. A
   reader on the Journal, Home, another reading, or with a sheet open (other than the listening desk) is never
   moved; the navigation pushes no history entry (suppressNextHistoryPush, the hardware-back handshake); the
   row off keeps the audio going and the screen still (the desk's own "Open the reading" — window.__openAudioText,
   screen-routes — is the manual path, unchanged by this hook). */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('./use-history-sync.js', () => ({ suppressNextHistoryPush: vi.fn() }));
import { suppressNextHistoryPush } from './use-history-sync.js';
import { modalRegistry } from './use-modal-registry.js';
import { useAudioFollow } from './use-audio-follow.js';
import { useFromLetterStack } from './use-from-letter-stack.js';

const LETTER = (volKey, id, sub) => ({ key: volKey + ':' + id, title: id, sub, url: 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/' + id + '.mp3', readerCode: 'B', partLabel: null });
const CHAPTER = (bookId, n) => ({ key: 'bible-brm-kjv:' + bookId, title: bookId, sub: 'KJV', url: 'https://github.com/VOTReader/votreader-assets/releases/download/audio-brm-v1/brm1_' + bookId + '_00' + n + '.mp3', readerCode: '', partLabel: 'Chapter ' + n });

/** A fake of the two player calls the hook makes, plus a way to move the queue. */
function fakePlayer(queue, qi = 0) {
  const subs = new Set();
  const st = { queue, qi, status: 'playing' };
  return {
    subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); },
    getState: () => st,
    bibleChapterOfTrack: (t) => { const m = /Chapter (\d+)/.exec((t && t.partLabel) || ''); return m ? Number(m[1]) : 0; },
    advance: () => { st.qi++; subs.forEach((cb) => cb()); },
  };
}

const STUDY_CH = (id) => ({ key: 'study:' + id, title: id, sub: 'The Lamb of God', url: 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/' + id + '.mp3', readerCode: 'V', partLabel: null });

function mount(player, pane, enabled = true) {
  globalThis.AudioPlayer = player;
  const setters = { setLetterId: vi.fn(), setBookId: vi.fn(), setChapterNum: vi.fn(), setScreen: vi.fn(), setStudyId: vi.fn(), setStudyChapterId: vi.fn() };
  const hook = renderHook((p) => useAudioFollow(p), { initialProps: { enabled, ...pane, ...setters } });
  return { ...setters, hook };
}

beforeEach(() => {
  globalThis.COL_BY_KEY = new Map([
    ['one', { volKey: 'one', letterScreen: 'vot-one-letter', label: 'Volume One' }],
    ['two', { volKey: 'two', letterScreen: 'vot-two-letter', label: 'Volume Two' }],
  ]);
  suppressNextHistoryPush.mockClear();
});
afterEach(() => {
  delete globalThis.AudioPlayer;
  delete globalThis.COL_BY_KEY;
  for (const id of modalRegistry.openIds()) modalRegistry.unregister(id);
});

describe('the follower moves the live pane with the audio — and nothing else', () => {
  it('a letter boundary while the active tab shows the ended letter opens the next letter, without a history push', () => {
    const player = fakePlayer([LETTER('one', 'last', 'Volume One'), LETTER('two', 'first', 'Volume Two')]);
    const m = mount(player, { screen: 'vot-one-letter', letterId: 'last', bookId: null, chapterNum: null });
    act(() => player.advance());
    expect(m.setLetterId).toHaveBeenCalledWith('first');
    expect(m.setScreen).toHaveBeenCalledWith('vot-two-letter');
    expect(suppressNextHistoryPush, 'no history entry per reading the audio walks').toHaveBeenCalledTimes(1);
  });

  it.each([
    ['the Journal', { screen: 'journal-hub', letterId: null, bookId: null, chapterNum: null }],
    ['Home (the shelf listener who never opened the reading)', { screen: 'home', letterId: null, bookId: null, chapterNum: null }],
    ['ANOTHER letter', { screen: 'vot-one-letter', letterId: 'somewhere-else', bookId: null, chapterNum: null }],
  ])('a reader on %s is never moved: the audio continues, the screen stays', (_where, pane) => {
    const player = fakePlayer([LETTER('one', 'last', 'Volume One'), LETTER('two', 'first', 'Volume Two')]);
    const m = mount(player, pane);
    act(() => player.advance());
    expect(m.setLetterId).not.toHaveBeenCalled();
    expect(m.setScreen).not.toHaveBeenCalled();
    expect(suppressNextHistoryPush).not.toHaveBeenCalled();
  });

  it("Matthew (The Scriptures of Truth) lives on its OWN screen: the follower opens matthew-ch, never bible-ch", () => {
    // BibleChapterView renders chapter.sections; Matthew's chapters carry verses
    // directly, so landing Matthew on 'bible-ch' threw in render (React logged
    // "Cannot read properties of undefined (reading 'map')" every time a Bible
    // pane followed the clock into TSOT Matthew — read-along class look, 2026-09-22).
    const TSOT = (n) => ({ key: 'bible-tsot-matthew:matthew', title: 'Matthew ' + n, sub: 'The Scriptures of Truth', url: 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/1-HnSHH-1lZyFlXx-0hzmKo6qKAPSd3vT.mp3', readerCode: 'B', partLabel: 'Chapter ' + n });
    const player = fakePlayer([CHAPTER('psalms', 23), TSOT(5)]);
    const m = mount(player, { screen: 'bible-ch', letterId: null, bookId: 'psalms', chapterNum: 23 });
    act(() => player.advance());
    expect(m.setBookId).toHaveBeenCalledWith('matthew');
    expect(m.setChapterNum).toHaveBeenCalledWith(5);
    expect(m.setScreen).toHaveBeenCalledWith('matthew-ch');
    expect(m.setScreen).not.toHaveBeenCalledWith('bible-ch');
    // and a pane already on matthew-ch counts as showing the unit: chapter 5 -> 6 follows there
    const p2 = fakePlayer([TSOT(5), TSOT(6)]);
    const m2 = mount(p2, { screen: 'matthew-ch', letterId: null, bookId: 'matthew', chapterNum: 5 });
    act(() => p2.advance());
    expect(m2.setChapterNum).toHaveBeenCalledWith(6);
    expect(m2.setScreen).toHaveBeenCalledWith('matthew-ch');
  });

  it('a Bible chapter boundary inside a book follows too (today the wash goes dark there), and a book boundary lands on chapter 1', () => {
    const player = fakePlayer([CHAPTER('jonah', 4), CHAPTER('micah', 1)]);
    const m = mount(player, { screen: 'bible-ch', letterId: null, bookId: 'jonah', chapterNum: 4 });
    act(() => player.advance());
    expect(m.setBookId).toHaveBeenCalledWith('micah');
    expect(m.setChapterNum).toHaveBeenCalledWith(1);
    expect(m.setScreen).toHaveBeenCalledWith('bible-ch');
    // and inside a book: chapter 3 → 4 with the pane on 3
    const p2 = fakePlayer([CHAPTER('jonah', 3), CHAPTER('jonah', 4)]);
    const m2 = mount(p2, { screen: 'bible-ch', letterId: null, bookId: 'jonah', chapterNum: 3 });
    act(() => p2.advance());
    expect(m2.setChapterNum).toHaveBeenCalledWith(4);
  });

  it('with the row off the screen stays and no history is touched — the audio goes on', () => {
    const player = fakePlayer([LETTER('one', 'last', 'Volume One'), LETTER('two', 'first', 'Volume Two')]);
    const m = mount(player, { screen: 'vot-one-letter', letterId: 'last', bookId: null, chapterNum: null }, false);
    act(() => player.advance());
    expect(m.setScreen).not.toHaveBeenCalled();
    expect(m.setLetterId).not.toHaveBeenCalled();
    expect(suppressNextHistoryPush).not.toHaveBeenCalled();
  });

  it('an open sheet other than the listening desk blocks the follow; the desk alone does not', () => {
    const player = fakePlayer([LETTER('one', 'last', 'Volume One'), LETTER('two', 'first', 'Volume Two')]);
    const m = mount(player, { screen: 'vot-one-letter', letterId: 'last', bookId: null, chapterNum: null });
    modalRegistry.register({ id: 'note-sheet', dismiss: () => {} });
    act(() => player.advance());
    expect(m.setScreen, 'a page must not swap under a finger mid-note').not.toHaveBeenCalled();
    modalRegistry.unregister('note-sheet');
    const p2 = fakePlayer([LETTER('one', 'last', 'Volume One'), LETTER('two', 'first', 'Volume Two')]);
    const m2 = mount(p2, { screen: 'vot-one-letter', letterId: 'last', bookId: null, chapterNum: null });
    modalRegistry.register({ id: 'audio-manager-sheet', dismiss: () => {} });
    act(() => p2.advance());
    expect(m2.setScreen, 'the desk is the player\'s own UI').toHaveBeenCalledWith('vot-two-letter');
  });

  it('a follow a sheet held catches up the moment the sheet closes, once, with no history push (s02.2)', () => {
    const player = fakePlayer([LETTER('one', 'last', 'Volume One'), LETTER('two', 'first', 'Volume Two')]);
    const m = mount(player, { screen: 'vot-one-letter', letterId: 'last', bookId: null, chapterNum: null });
    modalRegistry.register({ id: 'note-sheet', dismiss: () => {} });
    act(() => player.advance());
    expect(m.setScreen).not.toHaveBeenCalled();
    act(() => modalRegistry.unregister('note-sheet'));
    expect(m.setLetterId).toHaveBeenCalledWith('first');
    expect(m.setScreen).toHaveBeenCalledWith('vot-two-letter');
    expect(suppressNextHistoryPush).toHaveBeenCalledTimes(1);
    // the hold is spent: another sheet opening and closing moves nothing
    act(() => { modalRegistry.register({ id: 'x-sheet', dismiss: () => {} }); modalRegistry.unregister('x-sheet'); });
    expect(m.setScreen).toHaveBeenCalledTimes(1);
  });

  it('under one sheet the audio walks two readings: closing it opens the one playing now; two sheets wait for both', () => {
    const player = fakePlayer([LETTER('one', 'last', 'Volume One'), LETTER('two', 'first', 'Volume Two'), LETTER('two', 'second', 'Volume Two')]);
    const m = mount(player, { screen: 'vot-one-letter', letterId: 'last', bookId: null, chapterNum: null });
    modalRegistry.register({ id: 'note-sheet', dismiss: () => {} });
    modalRegistry.register({ id: 'scripture-sheet', dismiss: () => {} });
    act(() => { player.advance(); player.advance(); });
    act(() => modalRegistry.unregister('scripture-sheet'));
    expect(m.setScreen, 'the note sheet still holds it').not.toHaveBeenCalled();
    act(() => modalRegistry.unregister('note-sheet'));
    expect(m.setLetterId).toHaveBeenCalledTimes(1);
    expect(m.setLetterId).toHaveBeenCalledWith('second');
  });

  it('a reader who went elsewhere while the sheet was open is not moved when it closes; nor when the audio came back', () => {
    const player = fakePlayer([LETTER('one', 'last', 'Volume One'), LETTER('two', 'first', 'Volume Two')]);
    const m = mount(player, { screen: 'vot-one-letter', letterId: 'last', bookId: null, chapterNum: null });
    modalRegistry.register({ id: 'note-sheet', dismiss: () => {} });
    act(() => player.advance());
    m.hook.rerender({ enabled: true, screen: 'home', letterId: null, bookId: null, chapterNum: null, ...m });
    act(() => modalRegistry.unregister('note-sheet'));
    expect(m.setScreen).not.toHaveBeenCalled();

    const p2 = fakePlayer([LETTER('one', 'last', 'Volume One'), LETTER('two', 'first', 'Volume Two')]);
    const m2 = mount(p2, { screen: 'vot-one-letter', letterId: 'last', bookId: null, chapterNum: null });
    modalRegistry.register({ id: 'note-sheet', dismiss: () => {} });
    act(() => p2.advance());
    act(() => { p2.getState().qi = -1; p2.advance(); });   // back to the page's own letter (a Previous)
    act(() => modalRegistry.unregister('note-sheet'));
    expect(m2.setScreen).not.toHaveBeenCalled();
    expect(suppressNextHistoryPush).not.toHaveBeenCalled();
  });

  it('a part boundary inside one letter is not a unit boundary: nothing moves', () => {
    const a1 = { ...LETTER('one', 'long', 'Volume One'), partLabel: 'Part 1' };
    const a2 = { ...LETTER('one', 'long', 'Volume One'), partLabel: 'Part 2', url: a1.url.replace('.mp3', '-2.mp3') };
    const player = fakePlayer([a1, a2]);
    const m = mount(player, { screen: 'vot-one-letter', letterId: 'long', bookId: null, chapterNum: null });
    act(() => player.advance());
    expect(m.setLetterId).not.toHaveBeenCalled();
    expect(m.setScreen).not.toHaveBeenCalled();
  });

  it('unmounting unsubscribes; a missing player is a no-op, never a throw', () => {
    const player = fakePlayer([LETTER('one', 'last', 'Volume One'), LETTER('two', 'first', 'Volume Two')]);
    const m = mount(player, { screen: 'vot-one-letter', letterId: 'last', bookId: null, chapterNum: null });
    m.hook.unmount();
    act(() => player.advance());
    expect(m.setScreen).not.toHaveBeenCalled();
    delete globalThis.AudioPlayer;
    expect(() => renderHook((p) => useAudioFollow(p), { initialProps: { enabled: true, screen: 'home', setScreen: vi.fn() } })).not.toThrow();
  });
});

/* STUDIES FOLLOW TOO (2026-09-20). A study chapter is a third unit kind: its
   track key is 'study:<chapterId>', its pane is 'bible-study-chapter' with that
   studyChapterId, and opening the next chapter needs the STUDY that owns it
   (BIBLE_STUDIES) as well as the chapter — the same live-pane rule throughout. */
describe('study chapters — a third unit kind', () => {
  beforeEach(() => {
    globalThis.BIBLE_STUDIES = [{ id: 'lamb', title: 'The Lamb of God', chapters: [{ id: 'lamb-ch1' }, { id: 'lamb-ch2' }] }];
  });
  afterEach(() => { delete globalThis.BIBLE_STUDIES; });

  it('a study boundary while the pane shows the ended chapter opens the next chapter of that study, in place', () => {
    const player = fakePlayer([STUDY_CH('lamb-ch1'), STUDY_CH('lamb-ch2')]);
    const m = mount(player, { screen: 'bible-study-chapter', studyId: 'lamb', studyChapterId: 'lamb-ch1', letterId: null, bookId: null, chapterNum: null });
    act(() => player.advance());
    expect(m.setStudyId).toHaveBeenCalledWith('lamb');
    expect(m.setStudyChapterId).toHaveBeenCalledWith('lamb-ch2');
    expect(m.setScreen).toHaveBeenCalledWith('bible-study-chapter');
    expect(suppressNextHistoryPush).toHaveBeenCalledTimes(1);
  });

  it('the live-pane rule holds: a reader on another study chapter, or on Home, is not moved', () => {
    const player = fakePlayer([STUDY_CH('lamb-ch1'), STUDY_CH('lamb-ch2')]);
    const m = mount(player, { screen: 'bible-study-chapter', studyId: 'lamb', studyChapterId: 'lamb-ch2', letterId: null, bookId: null, chapterNum: null });
    act(() => player.advance());
    expect(m.setStudyChapterId).not.toHaveBeenCalled();
    const player2 = fakePlayer([STUDY_CH('lamb-ch1'), STUDY_CH('lamb-ch2')]);
    const m2 = mount(player2, { screen: 'home', studyId: null, studyChapterId: null, letterId: null, bookId: null, chapterNum: null });
    act(() => player2.advance());
    expect(m2.setScreen).not.toHaveBeenCalled();
  });

  it('a letter following a study (site order) opens the letter; a study following a letter opens the study', () => {
    const player = fakePlayer([STUDY_CH('lamb-ch2'), LETTER('one', 'first', 'Volume One')]);
    const m = mount(player, { screen: 'bible-study-chapter', studyId: 'lamb', studyChapterId: 'lamb-ch2', letterId: null, bookId: null, chapterNum: null });
    act(() => player.advance());
    expect(m.setLetterId).toHaveBeenCalledWith('first');
    expect(m.setScreen).toHaveBeenCalledWith('vot-one-letter');
  });
});

/* A WTLB COMPILATION IS ONE TRACK WITH MANY LETTERS (2026-09-20): key null, and
   the letter under the clock is the player's answer (sectionLetterKeyAt). The
   follower asks it on every tick and treats the crossing like any letter
   boundary — same live-pane rule, same in-place navigation. */
describe('WTLB compilations — the letter comes from the clock', () => {
  function sectionPlayer(order) {
    const subs = new Set();
    const st = { queue: [{ key: null, title: 'Part 1 · Intro–19', sub: 'Words To Live By: Part One', url: 'https://x/1U0x.mp3' }], qi: 0, status: 'playing', time: 0 };
    return {
      subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); },
      getState: () => st,
      bibleChapterOfTrack: () => 0,
      sectionLetterKeyAt: (t, time) => { let cur = null; for (const [k, at] of order) { if (at > time) break; cur = k; } return cur; },
      tick: (time) => { st.time = time; subs.forEach((cb) => cb()); },
    };
  }
  const ORDER = [['wtlb1:introduction', 4.2], ['wtlb1:come-love-awaits-you', 61], ['wtlb1:crowning-glory', 118.5]];
  beforeEach(() => { globalThis.COL_BY_KEY.set('wtlb1', { volKey: 'wtlb1', letterScreen: 'wtlb-one-entry', label: 'Words To Live By: Part One' }); });

  it('the clock crossing into the next letter while the pane shows the current one opens the next entry, in place', () => {
    const player = sectionPlayer(ORDER);
    const m = mount(player, { screen: 'wtlb-one-entry', letterId: 'introduction', bookId: null, chapterNum: null });
    act(() => player.tick(10));                    // the intro is current; nothing to follow yet
    expect(m.setLetterId).not.toHaveBeenCalled();
    act(() => player.tick(61));
    expect(m.setLetterId).toHaveBeenCalledWith('come-love-awaits-you');
    expect(m.setScreen).toHaveBeenCalledWith('wtlb-one-entry');
    expect(suppressNextHistoryPush).toHaveBeenCalledTimes(1);
  });

  it('nothing navigates before the first row, and a reader elsewhere is never moved', () => {
    const player = sectionPlayer(ORDER);
    const m = mount(player, { screen: 'home', letterId: null, bookId: null, chapterNum: null });
    act(() => player.tick(2)); act(() => player.tick(10)); act(() => player.tick(61)); act(() => player.tick(120));
    expect(m.setScreen).not.toHaveBeenCalled();
  });
});

/* THE FOLLOW KEEPS THE WAY BACK (sweep v041, 2026-10-15). A reading reached by a
   tap-through (a note in My Notes, the desk's "Open the reading", a Library row)
   carries a back-stack entry whose destSnapshot names that reading. The follow
   moves the pane in place, and useFromLetterStack's prune effect evicts any top
   whose destSnapshot no longer matches the pane: before the fix the "Back to …"
   pill vanished at the first boundary, and hardware Back (which pops that stack)
   went to the collection index instead of where the reader came from. The
   header's promise is that one Back from the followed reading goes where one
   Back from the original would have gone. These mount the REAL stack hook beside
   the follower on one shared nav state, as App() does. */
describe("the follow carries the reader's way back to the new reading", () => {
  let prevHandoff;
  beforeEach(() => {
    prevHandoff = window.navHandoff;
    window.navHandoff = { clear: vi.fn() };
    globalThis.BIBLE_STUDIES = [{ id: 'lamb', title: 'The Lamb of God', chapters: [{ id: 'lamb-ch1' }, { id: 'lamb-ch2' }] }];
  });
  afterEach(() => { window.navHandoff = prevHandoff; delete globalThis.BIBLE_STUDIES; });

  const NOWHERE = { screen: 'home', bookId: null, chapterNum: null, letterId: null, studyId: null, studyChapterId: null, journalEntryId: null };

  /** App()'s wiring in miniature: one nav state, the tap-through stack, and the follower. */
  function mountApp(player, nav0, stack0) {
    globalThis.AudioPlayer = player;
    return renderHook(() => {
      const [nav, setNav] = React.useState({ ...NOWHERE, ...nav0 });
      const [stack, setStack] = React.useState(stack0);
      const set = (k) => (v) => setNav((n) => ({ ...n, [k]: typeof v === 'function' ? v(n[k]) : v }));
      const setters = {
        setScreen: set('screen'), setBookId: set('bookId'), setChapterNum: set('chapterNum'), setLetterId: set('letterId'),
        setStudyId: set('studyId'), setStudyChapterId: set('studyChapterId'), setJournalEntryId: set('journalEntryId'),
      };
      const tabField = (key) => { if (key === 'searchOrigin' || key === 'navOrigin') return [null, () => {}]; if (key !== 'fromLetterStack') throw new Error('unexpected tabField: ' + key); return [stack, setStack]; };
      const fls = useFromLetterStack({ tabField, ...nav, ...setters });
      useAudioFollow({ enabled: true, ...nav, ...setters, retargetTop: fls.retargetTop });
      return { nav, fls };
    });
  }

  it("the finding's repro: My Notes -> Volume Two letter 5, the audio turns to letter 6; the pill stays and Back returns to My Notes", () => {
    const player = fakePlayer([LETTER('two', 'letter-5', 'Volume Two'), LETTER('two', 'letter-6', 'Volume Two')]);
    // navigateToLink's entry for a note tapped in the Notes index (use-navigate-to-link.js backEntry).
    const fromNotes = {
      sourceScreen: 'notes-index', sourceBookId: null, sourceChapterNum: null, sourceLetterId: null,
      sourceStudyId: null, sourceStudyChapterId: null, sourceJournalEntryId: null,
      sourceLetterTitle: 'My Notes', sourceVolumeLabel: null, silent: false,
      destSnapshot: { screen: 'vot-two-letter', bookId: null, chapterNum: null, letterId: 'letter-5', studyId: null, studyChapterId: null },
    };
    const { result } = mountApp(player, { screen: 'vot-two-letter', letterId: 'letter-5' }, [fromNotes]);
    expect(result.current.fls.backHint).toEqual({ title: 'My Notes', volumeLabel: null });
    act(() => player.advance());
    expect(result.current.nav).toMatchObject({ screen: 'vot-two-letter', letterId: 'letter-6' });
    expect(result.current.fls.fromLetterStack, 'the prune effect must not evict the entry the follow carried').toHaveLength(1);
    expect(result.current.fls.backHint, 'the "Back to My Notes" pill is still there').toEqual({ title: 'My Notes', volumeLabel: null });
    expect(result.current.fls.backActive).toBe(true);
    act(() => result.current.fls.tapThroughBack());
    expect(result.current.nav.screen, 'one Back from the followed reading goes where one Back from the original would have').toBe('notes-index');
  });

  it.each([
    ['a Bible chapter (the desk\'s silent "Open the reading")',
      [CHAPTER('jonah', 4), CHAPTER('micah', 1)],
      { screen: 'bible-ch', bookId: 'jonah', chapterNum: 4 },
      { screen: 'bible-ch', bookId: 'jonah', chapterNum: 4, letterId: null, studyId: null, studyChapterId: null },
      { screen: 'bible-ch', bookId: 'micah', chapterNum: 1 }],
    ['a study chapter',
      [STUDY_CH('lamb-ch1'), STUDY_CH('lamb-ch2')],
      { screen: 'bible-study-chapter', studyId: 'lamb', studyChapterId: 'lamb-ch1' },
      { screen: 'bible-study-chapter', bookId: null, chapterNum: null, letterId: null, studyId: 'lamb', studyChapterId: 'lamb-ch1' },
      { screen: 'bible-study-chapter', studyId: 'lamb', studyChapterId: 'lamb-ch2' }],
    ['a letter into another volume (site order)',
      [LETTER('one', 'last', 'Volume One'), LETTER('two', 'first', 'Volume Two')],
      { screen: 'vot-one-letter', letterId: 'last' },
      { screen: 'vot-one-letter', letterId: 'last' },
      { screen: 'vot-two-letter', letterId: 'first' }],
  ])('%s: the live back target survives the follow, still silent, still pointing home', (_kind, queue, nav0, dest, landed) => {
    const player = fakePlayer(queue);
    const fromHome = { sourceScreen: 'home', sourceLetterTitle: 'Home', silent: true, destSnapshot: dest };
    const { result } = mountApp(player, nav0, [fromHome]);
    expect(result.current.fls.backActive).toBe(true);
    act(() => player.advance());
    expect(result.current.nav).toMatchObject(landed);
    expect(result.current.fls.backActive, 'hardware Back still returns to Home').toBe(true);
    expect(result.current.fls.backHint, 'a silent entry stays pill-less').toBeNull();
    expect(result.current.fls.fromLetterStack[0]).toMatchObject({ sourceScreen: 'home', sourceLetterTitle: 'Home', silent: true });
  });

  it('a top entry with no destSnapshot (the letter->letter chain) is left exactly as it was', () => {
    const player = fakePlayer([LETTER('one', 'last', 'Volume One'), LETTER('two', 'first', 'Volume Two')]);
    const legacy = { sourceScreen: 'vot-one-letter', sourceLetterId: 'other', sourceLetterTitle: 'Other' };
    const { result } = mountApp(player, { screen: 'vot-one-letter', letterId: 'last' }, [legacy]);
    act(() => player.advance());
    expect(result.current.nav).toMatchObject({ screen: 'vot-two-letter', letterId: 'first' });
    expect(result.current.fls.fromLetterStack).toEqual([legacy]);
  });

  it('with no back target at all the follow adds none', () => {
    const player = fakePlayer([LETTER('one', 'last', 'Volume One'), LETTER('two', 'first', 'Volume Two')]);
    const { result } = mountApp(player, { screen: 'vot-one-letter', letterId: 'last' }, []);
    act(() => player.advance());
    expect(result.current.nav.letterId).toBe('first');
    expect(result.current.fls.fromLetterStack).toEqual([]);
    expect(result.current.fls.backHint).toBeNull();
  });
});
