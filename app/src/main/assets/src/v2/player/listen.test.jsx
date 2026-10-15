// @vitest-environment jsdom
/* listen.jsx (rv1 1b; 9c): a letter's Listen pill asks the one engine what a tap would do (Pause here, Resume part-way,
   Listen), and with no connection and the recording not on the phone it still says Listen, and a tap shows main's
   offline line as a toast and never starts the player. A gate boot reads gate.playing / gate.open and no engine. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, act, waitFor } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import {
  resumeText, pausedAt, listenPill, ListenPill, offlineToast, gateListenToast, startListening,
  ChapterListenPill, startChapter, chapterAudio, listenRowFor,
} from './listen.jsx';
import { OFFLINE_LISTEN } from '../offline-facts.js';
import { GATE_STATES } from '../gate.js';
import { V2App } from '../App.jsx';
import { LetterScreen, TOAST_MS } from '../screens/LetterScreen.jsx';
import { AUDIO_RESUME_MIN_SEC, AUDIO_RESUME_END_FRACTION } from '../../utils/audio-track.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const LETTER = { id: 'l1', title: 'Chosen by God' };
const PLAYING = { item: { collection: 'one', n: 1 }, reader: 'B', at: 231, length: 608, paused: false };

/**
 * main's AudioPlayer, as much of it as the pill reads: one queue, a status, and what Listen would do.
 * @param {{ cur?: string | null, chapter?: number, status?: string, time?: number, duration?: number, recorded?: boolean,
 *   playable?: boolean, resume?: { at: number, left: number } | null }} [o]
 */
function engine(o = {}) {
  const ls = new Set();
  let v = 0;
  const st = { queue: o.cur ? [{ key: o.cur, chapter: o.chapter }] : [], qi: 0, status: o.status || 'idle', time: o.time || 0,
    duration: o.duration || 0 };
  const A = {
    st,
    subscribe: (cb) => { ls.add(cb); return () => ls.delete(cb); },
    getVersion: () => v,
    getState: () => st,
    hasAudio: vi.fn(() => o.recorded !== false),
    playableNow: vi.fn(() => o.playable !== false),
    listenResume: vi.fn(() => o.resume || null),
    toggle: vi.fn(),
    playLetter: vi.fn(),
    playBibleBook: vi.fn(),
    /** main's: which chapter a Bible track is (here the test's own field) */
    bibleChapterOfTrack: vi.fn((t) => (t && t.chapter) || 0),
    /** The engine moved on: set fields and notify, as main's store does. */
    change: (next) => act(() => { Object.assign(st, next); v += 1; ls.forEach((cb) => cb()); }),
  };
  g.AudioPlayer = A;
  return A;
}

const pill = (props = {}) => render(
  <ListenPill gate={null} collection="one" n={1} volKey="one" letter={LETTER} collectionLabel="Volume One" {...props} />);

beforeEach(() => { g.ReactDOM = ReactDOM; });
afterEach(() => {
  cleanup();
  for (const k of ['AudioPlayer', 'ReactDOM', 'COL_BY_KEY', 'LETTERS_V1', 'StateStore', 'BIBLE_AUDIO_MANIFEST']) delete g[k];
  delete html.dataset.gate;
  vi.useRealTimers();
});

describe('resumeText', () => {
  it("is the nearest whole minute left, never 0, and plain Resume when the length was never learned", () => {
    expect(resumeText({ at: 60, left: 720 })).toBe('Resume · 12 min left');
    expect(resumeText({ at: 60, left: 20 })).toBe('Resume · 1 min left');
    expect(resumeText({ at: 60, left: 0 })).toBe('Resume');
  });
});

describe('pausedAt', () => {
  it('is where a paused track picks up, inside the resume window only', () => {
    expect(pausedAt({ status: 'paused', time: 100, duration: 600 })).toEqual({ at: 100, left: 500 });
    expect(pausedAt({ status: 'paused', time: 100, duration: 0 })).toEqual({ at: 100, left: 0 });
    expect(pausedAt({ status: 'playing', time: 100, duration: 600 })).toBe(null);
    expect(pausedAt({ status: 'paused', time: AUDIO_RESUME_MIN_SEC - 1, duration: 600 })).toBe(null);
    expect(pausedAt({ status: 'paused', time: 600 * AUDIO_RESUME_END_FRACTION, duration: 600 })).toBe(null);
    expect(pausedAt(null)).toBe(null);
  });
});

describe('listenPill', () => {
  it('hides with no recording; Pause while this letter plays; Resume part-way; Listen otherwise', () => {
    expect(listenPill({ recorded: false, here: false, playing: false, offline: false, resume: null }).show).toBe(false);
    expect(listenPill({ recorded: true, here: true, playing: true, offline: false, resume: null }))
      .toEqual({ show: true, text: 'Pause', playing: true, label: 'Pause the reading' });
    expect(listenPill({ recorded: true, here: false, playing: true, offline: false, resume: null }).text).toBe('Listen');
    expect(listenPill({ recorded: true, here: false, playing: false, offline: false, resume: { at: 60, left: 300 } }).text)
      .toBe('Resume · 5 min left');
  });

  it('offline never promises a resume: the pill says Listen', () => {
    expect(listenPill({ recorded: true, here: false, playing: false, offline: true, resume: { at: 60, left: 300 } }).text)
      .toBe('Listen');
  });
});

describe('ListenPill on a gate boot', () => {
  it('says Pause on the letter the gate plays and Listen elsewhere or paused, and touches no engine', () => {
    const A = engine();
    const here = pill({ gate: { playing: PLAYING } });
    const b = here.getByRole('button');
    expect(b.textContent).toBe('Pause');
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(b.querySelector('svg').getAttribute('width')).toBe('26');   // pause is sized like playBig, never width="false"
    click(b);
    expect(pill({ gate: { playing: { ...PLAYING, paused: true } } }).getAllByRole('button')[1].textContent).toBe('Listen');
    expect(pill({ gate: { playing: PLAYING }, n: 2 }).getAllByRole('button')[2].textContent).toBe('Listen');
    expect(A.hasAudio).not.toHaveBeenCalled();
    expect(A.toggle).not.toHaveBeenCalled();
    expect(A.playLetter).not.toHaveBeenCalled();
  });
});

describe('ListenPill over the engine', () => {
  it('Listen starts this letter through main; the pill turns to Pause when the engine says it plays here', () => {
    const A = engine();
    const { getByRole } = pill();
    const b = getByRole('button');
    expect(b.textContent).toBe('Listen');
    expect(b.className).toBe('pill play');
    click(b);
    expect(A.playLetter).toHaveBeenCalledWith({ volKey: 'one', letter: LETTER, collectionLabel: 'Volume One' });
    A.change({ queue: [{ key: 'one:l1' }], qi: 0, status: 'playing' });
    expect(b.textContent).toBe('Pause');
    click(b);
    expect(A.toggle).toHaveBeenCalledTimes(1);
    expect(A.playLetter).toHaveBeenCalledTimes(1);
  });

  it("another letter playing: Listen, and a tap plays this one rather than pausing that one", () => {
    const A = engine({ cur: 'one:other', status: 'playing' });
    const b = pill().getByRole('button');
    expect(b.textContent).toBe('Listen');
    click(b);
    expect(A.toggle).not.toHaveBeenCalled();
    expect(A.playLetter).toHaveBeenCalledTimes(1);
  });

  it("Resume · N min left is the player's own listenResume, and widens the pill", () => {
    const A = engine({ resume: { at: 90, left: 720 } });
    const b = pill().getByRole('button');
    expect(A.listenResume).toHaveBeenCalledWith({ volKey: 'one', letter: LETTER, collectionLabel: 'Volume One' });
    expect(b.textContent).toBe('Resume · 12 min left');
    expect(b.className).toBe('pill play wide');
  });

  it('paused here inside the resume window: Resume with the time left, and a tap toggles', () => {
    const A = engine({ cur: 'one:l1', status: 'paused', time: 120, duration: 600 });
    const b = pill().getByRole('button');
    expect(b.textContent).toBe('Resume · 8 min left');
    expect(A.listenResume).not.toHaveBeenCalled();
    click(b);
    expect(A.toggle).toHaveBeenCalledTimes(1);
  });

  it('no recording: no pill', () => {
    engine({ recorded: false });
    expect(pill().container.innerHTML).toBe('');
  });

  it('9c: offline and not on the phone, the pill still says Listen; a tap shows the toast and never starts the player', () => {
    const A = engine({ playable: false, resume: { at: 90, left: 720 } });
    const onToast = vi.fn();
    const b = pill({ onToast }).getByRole('button');
    expect(b.textContent).toBe('Listen');
    expect(b.hasAttribute('disabled')).toBe(false);
    click(b);
    expect(onToast).toHaveBeenCalledWith({ text: OFFLINE_LISTEN, icon: 'cloudOff' });
    expect(A.playLetter).not.toHaveBeenCalled();
  });
});

describe('the offline toast', () => {
  it("gateListenToast is 9c's toast and nothing on any other gate", () => {
    expect(gateListenToast(GATE_STATES['9c-offline'])).toEqual(offlineToast(OFFLINE_LISTEN));
    expect(gateListenToast(GATE_STATES['4c-downloads'])).toBe(null);
    expect(gateListenToast(null)).toBe(null);
  });

  it('startListening plays when the recording can make sound, else only says why', () => {
    const A = engine();
    const onToast = vi.fn();
    startListening(A, { volKey: 'one', letter: LETTER }, onToast);
    expect(A.playLetter).toHaveBeenCalledWith({ volKey: 'one', letter: LETTER, collectionLabel: null });
    A.playableNow.mockReturnValue(false);
    startListening(A, { volKey: 'one', letter: LETTER }, onToast);
    expect(A.playLetter).toHaveBeenCalledTimes(1);
    expect(onToast).toHaveBeenCalledWith({ text: OFFLINE_LISTEN, icon: 'cloudOff' });
  });
});

describe('9c on the letter screen', () => {
  beforeEach(() => {
    g.COL_BY_KEY = new Map([['one', { volKey: 'one', label: 'Volume One', globalName: 'LETTERS_V1' }]]);
    g.LETTERS_V1 = [{ id: 'l1', num: 1, title: 'Chosen by God', blocks: [] }, { id: 'l2', num: 2, title: 'Honor God', blocks: [] }];
  });

  it('9c-offline: Letter 2 with the cloud toast in the layer at once; the player is never asked', async () => {
    const A = engine({ playable: false });
    const { container } = render(<V2App gateId="9c-offline" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    const toast = container.querySelector('.v2-layer .toast');
    expect(toast.textContent).toBe(OFFLINE_LISTEN);
    expect(toast.querySelector('.v2i')).not.toBe(null);
    expect(container.querySelector('.pill.play').textContent).toBe('Listen');
    for (const fn of [A.hasAudio, A.playableNow, A.playLetter, A.toggle]) expect(fn).not.toHaveBeenCalled();
  });

  it('a live offline tap: the toast with its cloud, gone after TOAST_MS, and the player never started', () => {
    vi.useFakeTimers();
    const A = engine({ playable: false });
    const { container, getByRole } = render(<LetterScreen collection="one" n={2} desktop />);
    click(getByRole('button', { name: 'Listen' }));
    const toast = container.querySelector('.toast');
    expect(toast.textContent).toBe(OFFLINE_LISTEN);
    expect(toast.querySelector('.v2i')).not.toBe(null);
    expect(A.playLetter).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(TOAST_MS); });
    expect(container.querySelector('.toast')).toBe(null);
  });
});

/* 2c: a Bible chapter's pill (John 3), the same decisions over main's chapter path (BibleChapterView's HeroListen). */
const JOHN3 = { item: { book: 'john', chapter: 3 }, reader: 'B', at: 19, length: 312, paused: false };
const WOP = 'bible-wop-nkjv';
const chapterPill = (props = {}) => render(
  <ChapterListenPill gate={null} book="john" chapter={3} volKey={WOP} label="NKJV" {...props} />);

describe('ChapterListenPill on a gate boot', () => {
  it('says Pause on the chapter the gate plays, Listen on another or paused, and touches no engine', () => {
    const A = engine();
    chapterPill({ gate: { playing: JOHN3 } });
    expect(document.querySelector('.pill.play').textContent).toBe('Pause');
    cleanup();
    chapterPill({ gate: { playing: JOHN3 }, chapter: 4 });
    expect(document.querySelector('.pill.play').textContent).toBe('Listen');
    cleanup();
    chapterPill({ gate: { playing: { ...JOHN3, paused: true } } });
    expect(document.querySelector('.pill.play').textContent).toBe('Listen');
    expect(A.hasAudio).not.toHaveBeenCalled();
  });
});

describe('ChapterListenPill over the engine', () => {
  it('Listen plays this chapter on through its book (playBibleBook); Pause once the engine plays it; a tap toggles', () => {
    const A = engine();
    chapterPill();
    const b = document.querySelector('.pill.play');
    expect(b.textContent).toBe('Listen');
    click(b);
    expect(A.playBibleBook).toHaveBeenCalledWith({ volKey: WOP, bookId: 'john', label: 'NKJV', chapterNum: 3 });
    A.change({ queue: [{ key: WOP + ':john', chapter: 3 }], qi: 0, status: 'playing' });
    expect(b.textContent).toBe('Pause');
    click(b);
    expect(A.toggle).toHaveBeenCalledTimes(1);
    expect(A.playBibleBook).toHaveBeenCalledTimes(1);
  });

  it('another chapter of the same book playing: Listen, and a tap plays this chapter', () => {
    const A = engine({ cur: WOP + ':john', chapter: 2, status: 'playing' });
    chapterPill();
    const b = document.querySelector('.pill.play');
    expect(b.textContent).toBe('Listen');
    click(b);
    expect(A.toggle).not.toHaveBeenCalled();
    expect(A.playBibleBook).toHaveBeenCalledTimes(1);
  });

  it("Resume · N min left is the player's own listenResume for this chapter", () => {
    const A = engine({ resume: { at: 120, left: 190 } });
    chapterPill();
    expect(A.listenResume).toHaveBeenCalledWith({ volKey: WOP, bookId: 'john', chapterNum: 3 });
    expect(document.querySelector('.pill.play').textContent).toBe('Resume · 3 min left');
  });

  it('offline and this chapter not on the phone: still Listen; a tap shows the toast and never plays', () => {
    const A = engine({ playable: false });
    const onToast = vi.fn();
    chapterPill({ onToast });
    const b = document.querySelector('.pill.play');
    expect(b.textContent).toBe('Listen');
    click(b);
    expect(A.playableNow).toHaveBeenCalledWith(WOP, 'john', 3);
    expect(onToast).toHaveBeenCalledWith(offlineToast(OFFLINE_LISTEN));
    expect(A.playBibleBook).not.toHaveBeenCalled();
  });

  it('no recording of the book, or no edition: no pill', () => {
    engine({ recorded: false });
    chapterPill();
    expect(document.querySelector('.pill.play')).toBe(null);
    cleanup();
    engine();
    chapterPill({ volKey: null });
    expect(document.querySelector('.pill.play')).toBe(null);
  });

  it('startChapter plays when the chapter can make sound, else only says why', () => {
    const A = engine();
    const onToast = vi.fn();
    startChapter(A, { volKey: WOP, book: 'john', chapter: 3, label: 'NKJV' }, onToast);
    expect(A.playBibleBook).toHaveBeenCalledTimes(1);
    const B = engine({ playable: false });
    startChapter(B, { volKey: WOP, book: 'john', chapter: 3, label: 'NKJV' }, onToast);
    expect(B.playBibleBook).not.toHaveBeenCalled();
    expect(onToast).toHaveBeenCalledWith(offlineToast(OFFLINE_LISTEN));
  });
});

describe('chapterAudio', () => {
  it("is the edition the reader's settings name when it carries the book, else main's default, else none", () => {
    g.BIBLE_AUDIO_MANIFEST = { 'bible-brm-kjv:john': [['a', '', 'Chapter 1']], [WOP + ':john']: [['b', '', 'Chapter 1']] };
    g.StateStore = { isReady: () => true, get: () => ({ settings: { bibleAudio: 'wop-nkjv' } }) };
    expect(chapterAudio('john')).toMatchObject({ volKey: WOP });
    expect(chapterAudio('john').label).toContain('NKJV');
    g.StateStore = { isReady: () => true, get: () => ({ settings: {} }) };
    expect(chapterAudio('john')).toMatchObject({ volKey: 'bible-brm-kjv' });
    expect(chapterAudio('luke')).toBe(null);
  });

  it("a gate boot reads the row's facts, never the reader's storage", () => {
    g.BIBLE_AUDIO_MANIFEST = { 'bible-brm-kjv:john': [['a', '', 'Chapter 1']], [WOP + ':john']: [['b', '', 'Chapter 1']] };
    const get = vi.fn(() => ({ settings: { bibleAudio: 'brm-kjv' } }));
    g.StateStore = { isReady: () => true, get };
    expect(chapterAudio('john', { facts: { bibleAudio: 'wop-nkjv' } })).toMatchObject({ volKey: WOP });
    expect(chapterAudio('john', { facts: {} })).toMatchObject({ volKey: 'bible-brm-kjv' });
    expect(get).not.toHaveBeenCalled();
  });
});

describe("listenRowFor (4b: Mark this paragraph's Listen row)", () => {
  const KEY = 'letter:chosen-by-god:0';
  const what = { volKey: 'one', letter: { id: 'chosen-by-god' }, collectionLabel: 'Volume One' };
  const pane = (over = {}) => ({ has: vi.fn((k) => k === KEY), start: vi.fn(() => true), repeat: vi.fn(() => true), ...over });
  const engine = (over = {}) => ({
    getState: () => ({ status: 'idle', queue: [], qi: 0 }),
    playbackTracks: vi.fn(() => [{ key: 'one:chosen-by-god', readerCode: 'B' }]),
    ...over,
  });

  it("no row without main's pane (no recording), or when it does not hold the paragraph", () => {
    expect(listenRowFor(null, engine(), KEY, what)).toBe(null);
    expect(listenRowFor({ has: () => true }, engine(), KEY, what)).toBe(null);
    expect(listenRowFor(pane(), engine(), 'letter:chosen-by-god:9', what)).toBe(null);
    expect(listenRowFor(pane(), engine(), '', what)).toBe(null);
  });

  it('the reader its Listen would start (the favourite where they read it), with Repeat where the pane can loop', () => {
    const e = engine();
    expect(listenRowFor(pane(), e, KEY, what)).toEqual({ reader: 'Read by Benjamin', repeat: true });
    expect(e.playbackTracks).toHaveBeenCalledWith('one', what.letter, 'Volume One');
    expect(listenRowFor(pane({ repeat: undefined }), e, KEY, what)).toEqual({ reader: 'Read by Benjamin', repeat: false });
    const tim = engine({ playbackTracks: () => [{ key: 'one:chosen-by-god', readerCode: 'T' }] });
    expect(listenRowFor(pane(), tim, KEY, what).reader).toBe('Read by Timothy');
  });

  it('the playing reader when this letter is the loaded track; another letter loaded asks what Listen would start', () => {
    const playing = engine({ getState: () => ({ status: 'paused', qi: 1, queue: [{ key: 'one:x' }, { key: 'one:chosen-by-god', readerCode: 'V' }] }) });
    expect(listenRowFor(pane(), playing, KEY, what)).toEqual({ reader: 'Text-to-speech', repeat: true });
    expect(playing.playbackTracks).not.toHaveBeenCalled();
    const other = engine({ getState: () => ({ status: 'playing', qi: 0, queue: [{ key: 'one:honor-god', readerCode: 'T' }] }) });
    expect(listenRowFor(pane(), other, KEY, what).reader).toBe('Read by Benjamin');
  });

  it('no engine, an older one, or an unknown reader: the row without its reader line', () => {
    expect(listenRowFor(pane(), null, KEY, what)).toEqual({ reader: null, repeat: true });
    expect(listenRowFor(pane(), { getState: () => { throw new Error('old'); } }, KEY, what)).toEqual({ reader: null, repeat: true });
    expect(listenRowFor(pane(), engine({ playbackTracks: () => [] }), KEY, what).reader).toBe(null);
    expect(listenRowFor(pane(), engine({ playbackTracks: () => [{ readerCode: 'Z' }] }), KEY, what).reader).toBe(null);
  });
});
