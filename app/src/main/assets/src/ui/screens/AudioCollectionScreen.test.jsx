// @ts-nocheck -- drives the REAL AudioPlayer against fixture manifests, so the
// forward-only queue and the reader choice are proven as behavior, not wiring.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { _resetToasts } from '../../utils/toast.js';
import * as ReactDOM from 'react-dom';

import { AudioPlayer } from '../../utils/audio-player.js';
import { AudioCollectionScreen } from './AudioCollectionScreen.jsx';
import * as Shelf from '../components/AudioShelf.jsx';
import * as AudioTrack from '../../utils/audio-track.js';
import * as AudioCoverage from '../../utils/audio-coverage.js';
import { AudioSeekSlider } from '../components/AudioSeekSlider.jsx';
import { CoverageBadge } from '../components/CoverageBadge.jsx';

/** The bits of HTMLAudioElement the player touches (audio-player.test.js pattern). */
class FakeAudio extends EventTarget {
  constructor() {
    super();
    this._src = '';
    this.currentTime = 0; this.duration = 0; this.paused = true; this.preload = ''; this.error = null;
    this.defaultPlaybackRate = 1; this.playbackRate = 1;
  }
  get src() { return this._src; }
  set src(v) { this._src = v; this.currentTime = 0; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
  load() {}
  removeAttribute(name) { if (name === 'src') this._src = ''; }
}

const URL_OF = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/' + id + '.mp3';
const BURL = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-bible-v1/' + id + '.mp3';

const LETTERS = [
  { id: 'letter-a', num: 1, title: 'Letter A' },
  { id: 'letter-b', num: 2, title: 'Letter B (no audio)' },
  { id: 'letter-c', num: 3, title: 'Letter C' },
];

function installGlobals() {
  globalThis.ScreenLayout = ({ children }) => <main>{children}</main>;
  globalThis.LibraryNav = () => null;
  /* The bundle-d slots these screens read across the bundle boundary since
     landing 24 (AudioShelf's rows and icons, the seek slider, the coverage
     badge, the audio tables). They are installed from THIS file's graph, not
     a shared setup: the vi.mock above only reaches modules imported here, and
     a shelf row bound to the real player would call straight past the fake. */
  Object.assign(globalThis, Shelf, AudioTrack, AudioCoverage, { AudioSeekSlider, CoverageBadge });
  // The screen reads the player from its window slot now (bundle-h reaches
  // across to bundle-d's one player); this is the same fake, installed there.
  globalThis.AudioPlayer = AudioPlayer;
  globalThis.COL_BY_KEY = new Map([['one', { volKey: 'one', label: 'Volume One', kind: 'letter', letterScreen: 'vot-one-letter' }]]);
  globalThis.colPreface = () => null;
  globalThis.colLetterArr = (col) => (col && col.volKey === 'one' ? LETTERS : []);
  globalThis.AUDIO_MANIFEST = {
    'one:letter-a': [['idA', 'B']],
    'one:letter-c': [['idC1', 'T', 'Part 1'], ['idC2', 'T', 'Part 2']],
  };
  globalThis.AUDIO_ALTERNATES = {
    'one:letter-c': [['V', [['idC1v', 'Part 1'], ['idC2v', 'Part 2']]]],
  };
  globalThis.AUDIO_SECTIONS = { one: [['Part 1 · 1-2', 'sec1', 'V'], ['Part 2 · 3', 'sec2', 'V']] };
  globalThis.BIBLE_AUDIO_BOOKS = [['genesis', 'Genesis'], ['exodus', 'Exodus'], ['psalms', 'Psalms']];
  globalThis.BIBLE_AUDIO_MANIFEST = {
    // Real whole-book ids: '<editionId>_<book>'. 'brm_gen' named no edition
    // and no stamp, so it was a shape no release could ship.
    'bible-brm-kjv:genesis': [['brm-kjv_genesis', '']],
    'bible-brm-kjv:exodus': [['brm-kjv_exodus', '']],
  };
}

function renderScreen(volKey, overrides = {}) {
  return render(
    <AudioCollectionScreen
      volKey={volKey}
      onBack={() => {}} onOpenText={() => {}}
      onSearch={() => {}} onHistory={() => {}} onSettings={() => {}}
      theme="dark" onThemeChange={() => {}}
      {...overrides}
    />
  );
}

const queueUrls = () => AudioPlayer.getState().queue.map((t) => t.url);

beforeEach(() => {
  globalThis.Audio = FakeAudio;
  installGlobals();
  localStorage.removeItem('vot-audio-pos');
});

afterEach(() => {
  AudioPlayer.stop();   // public reset — a second module instance would fork the singleton
  cleanup();
  delete globalThis.AudioPlayer;
  for (const key of ['ScreenLayout', 'LibraryNav', 'COL_BY_KEY', 'colPreface', 'colLetterArr',
    'AUDIO_MANIFEST', 'AUDIO_ALTERNATES', 'AUDIO_SECTIONS', 'BIBLE_AUDIO_BOOKS', 'BIBLE_AUDIO_MANIFEST',
    'AudioPositionsStore', 'Audio']) delete globalThis[key];
  localStorage.removeItem('vot-audio-pos');
});

describe('AudioCollectionScreen -- a VOT collection', () => {
  it('lists only letters with recordings and says plainly how many still await one', () => {
    renderScreen('one');
    expect(screen.getByRole('heading', { name: 'Volume One' })).toBeTruthy();
    expect(screen.getByText('2 of 3 letters have recordings')).toBeTruthy();
    expect(screen.getByText('Letter A')).toBeTruthy();
    expect(screen.getByText('Letter C')).toBeTruthy();
    expect(screen.queryByText('Letter B (no audio)')).toBeNull();
    expect(screen.getByText('1 letter awaits recording.')).toBeTruthy();
  });

  it('a row starts the forward-only whole-source queue at that letter', () => {
    renderScreen('one');
    fireEvent.click(screen.getByRole('button', { name: 'Play Letter C' }));
    // Letter A stays behind the horizon; C's two parts are the queue.
    expect(queueUrls()).toEqual([URL_OF('idC1'), URL_OF('idC2')]);
    expect(AudioPlayer.getState().qi).toBe(0);
  });

  it('Play all queues the whole source from its first recording', () => {
    renderScreen('one');
    fireEvent.click(screen.getByRole('button', { name: /Play all/ }));
    expect(queueUrls()).toEqual([URL_OF('idA'), URL_OF('idC1'), URL_OF('idC2')]);
  });

  it('a letter with a second reading discloses its voices and plays the chosen rendition', () => {
    renderScreen('one');
    // Letter A has one voice — no disclosure. Letter C has two.
    expect(screen.queryByRole('button', { name: /voices for Letter A/ })).toBeNull();
    const voices = screen.getByRole('button', { name: '2 voices for Letter C' });
    expect(voices.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(voices);
    expect(voices.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByRole('button', { name: 'Play Letter C — Read by Timothy' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Play Letter C — Text-to-speech' })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Play Letter C — Text-to-speech' }));
    // The chosen voice replaces Letter C's tracks; the queue stays forward-only.
    expect(queueUrls()).toEqual([URL_OF('idC1v'), URL_OF('idC2v')]);
    expect(AudioPlayer.getState().queue[0].readerCode).toBe('V');
  });

  it('compilation chips play their section', () => {
    renderScreen('one');
    fireEvent.click(screen.getByRole('button', { name: /Part 2 · 3/ }));
    expect(queueUrls()).toEqual([URL_OF('sec2')]);   // forward-only sections too
  });

  it('the playing letter highlights and its play button becomes a pause toggle', () => {
    renderScreen('one');
    fireEvent.click(screen.getByRole('button', { name: 'Play Letter A' }));
    expect(screen.getByRole('button', { name: 'Pause Letter A' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Pause Letter A' }));
    expect(AudioPlayer.getState().status).toBe('paused');
  });

  it('the Text affordance hands the track key to the coordinator wiring', () => {
    const onOpenText = vi.fn();
    renderScreen('one', { onOpenText });
    fireEvent.click(screen.getByRole('button', { name: 'Open text for Letter A' }));
    expect(onOpenText).toHaveBeenCalledWith({ key: 'one:letter-a' });
  });

  it('a row says how much of its recording is left, from the part the reader is in', () => {
    // Letter C is two parts and only its SECOND is remembered — which is the
    // whole point: a part heard to its end has its record deleted, so the
    // first surviving one is where the reader actually stands.
    globalThis.AudioPositionsStore = {
      subscribe: () => () => {}, getVersion: () => 0,
      getPosition: (track) => ((track && track.url) === URL_OF('idC2') ? { t: 300, d: 900 } : null),
    };
    renderScreen('one');
    expect(screen.getByText('10:00 left')).toBeTruthy();
    expect(screen.getAllByText(/left$/)).toHaveLength(1);   // Letter A stays unannotated
  });

  /* Played/unplayed marks: the SAME chip the shelf rows carry, from the same
     positions store, under the same rule — a row the store knows nothing about
     says nothing at all rather than claiming "unplayed". */
  it('marks a row Finished at the tail, and leaves an unknown recording unmarked', () => {
    globalThis.AudioPositionsStore = {
      subscribe: () => () => {}, getVersion: () => 0,
      getPosition: (track) => ((track && track.url) === URL_OF('idA') ? { t: 880, d: 900 } : null),
    };
    renderScreen('one');
    // 880 / 900 is past the 97% tail: a place to start again, not to return to.
    expect(screen.getByText('Finished')).toBeTruthy();
    expect(screen.queryByText(/left$/)).toBeNull();
    expect(document.querySelectorAll('.audio-library-remaining')).toHaveLength(1);
  });
});

describe('AudioCollectionScreen -- a Bible edition', () => {
  const OT = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-brm-v1/' + id + '.mp3';
  /** A per-chapter book, which is what every shipped edition actually is. */
  const perChapter = (book, n) => Array.from({ length: n }, (_v, i) =>
    ['brm1_' + book + '_' + String(i + 1).padStart(3, '0'), '', 'Chapter ' + (i + 1)]);

  it('lists the books its manifest ships and plays them forward-only', () => {
    renderScreen('bible-brm-kjv');
    expect(screen.getByRole('heading', { name: 'KJV · Biblical Restoration Ministries' })).toBeTruthy();
    expect(screen.getByText('Genesis')).toBeTruthy();
    expect(screen.getByText('Exodus')).toBeTruthy();
    expect(screen.queryByText('Psalms')).toBeNull();   // not in this edition's manifest

    fireEvent.click(screen.getByRole('button', { name: 'Play Exodus' }));
    expect(queueUrls()).toEqual([BURL('brm-kjv_exodus')]);    // Genesis stays behind the horizon
  });

  /* A8 (2026-08-10): the screen withheld the Text icon from every Bible row
     with a blanket `!bible`, though the desk's own title jump has opened Bible
     tracks since the day it shipped — hasTextDestination has always resolved
     them. The gate is now that one shared rule, applied per row. */
  it('offers the Text affordance on a Bible book, keyed like every other row', () => {
    const onOpenText = vi.fn();
    renderScreen('bible-brm-kjv', { onOpenText });
    fireEvent.click(screen.getByRole('button', { name: 'Open text for Genesis' }));
    expect(onOpenText).toHaveBeenCalledWith({ key: 'bible-brm-kjv:genesis' });
  });

  it('discloses a book’s chapters and starts the book AT the tapped one', () => {
    globalThis.BIBLE_AUDIO_MANIFEST = { 'bible-brm-kjv:jonah': perChapter('jonah', 4) };
    globalThis.BIBLE_AUDIO_BOOKS = [['jonah', 'Jonah']];
    renderScreen('bible-brm-kjv');

    // Closed by default: 66 books, and Psalms alone is 150 rows.
    expect(screen.queryByText('Chapter 3')).toBeNull();
    const disclosure = screen.getByRole('button', { name: '4 chapters of Jonah' });
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(disclosure);
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Chapter 3')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Play Jonah 3' }));
    // The book from that chapter forward — the same forward-only horizon the
    // reader's own Listen pill builds.
    expect(queueUrls()).toEqual([OT('brm1_jonah_003'), OT('brm1_jonah_004')]);

    fireEvent.click(disclosure);
    expect(screen.queryByText('Chapter 3')).toBeNull();
  });

  it('a book whose chapter is PLAYING opens its text at that chapter, not at chapter 1', () => {
    // The walker (myweb W2, 2026-09-22) played Nehemiah 10 from the row, tapped the
    // book's Text icon, and landed on Nehemiah 1: nothing lit, taps seeked nothing —
    // the reading under the clock was ten chapters away. The row's Open text hands
    // over the playing track (its "Chapter N" partLabel is what the opener reads)
    // whenever the player is inside this book.
    globalThis.BIBLE_AUDIO_MANIFEST = { 'bible-brm-kjv:jonah': perChapter('jonah', 4) };
    globalThis.BIBLE_AUDIO_BOOKS = [['jonah', 'Jonah']];
    const onOpenText = vi.fn();
    renderScreen('bible-brm-kjv', { onOpenText });
    fireEvent.click(screen.getByRole('button', { name: '4 chapters of Jonah' }));
    fireEvent.click(screen.getByRole('button', { name: 'Play Jonah 3' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open text for Jonah' }));
    expect(onOpenText).toHaveBeenCalledTimes(1);
    expect(onOpenText.mock.calls[0][0]).toMatchObject({ key: 'bible-brm-kjv:jonah', partLabel: 'Chapter 3' });
  });

  it('offers no chapter disclosure for a whole-book recording', () => {
    renderScreen('bible-brm-kjv');
    expect(screen.queryByRole('button', { name: /chapters of/ })).toBeNull();
  });

  /* B2 (2026-08-10): a Bible book's "parts" ARE its chapters, and the row's own
     disclosure already called them that — the meta line beside the title said
     "4 parts" one inch from a button reading "4 chapters of Jonah". */
  it('counts a book’s recordings as CHAPTERS, while a letter keeps its parts', () => {
    globalThis.BIBLE_AUDIO_MANIFEST = { 'bible-brm-kjv:jonah': perChapter('jonah', 4) };
    globalThis.BIBLE_AUDIO_BOOKS = [['jonah', 'Jonah']];
    renderScreen('bible-brm-kjv');
    // The row's meta line specifically — the disclosure button beside it has
    // said "4 chapters" since A8, which is exactly what made "4 parts" jar.
    expect(document.querySelector('.audio-library-row-copy small').textContent).toBe('4 chapters');
    expect(screen.queryByText('4 parts')).toBeNull();

    cleanup();
    installGlobals();
    renderScreen('one');   // Letter C is two PARTS of one recording, not chapters
    expect(screen.getByText('2 parts · Read by Timothy')).toBeTruthy();
  });
});

/* ra5 follow-up (2026-10-14): with a Letter Voice chosen, a row's Play plays that reader's reading where they recorded
   it (and its Download saves it), so the row names THAT reader, its parts and its time, never the primary's. */
describe('AudioCollectionScreen -- the row names the reading its Play plays', () => {
  afterEach(() => AudioPlayer.setPreferredReader('auto'));

  it('names the Letter Voice reader where that reader recorded the letter, the primary elsewhere', () => {
    AudioPlayer.setPreferredReader('V');
    renderScreen('one');
    const metas = [...document.querySelectorAll('.audio-library-row-copy small')].map((e) => e.textContent);
    expect(metas).toEqual(['Read by Benjamin', '2 parts · Text-to-speech']);
    fireEvent.click(screen.getByRole('button', { name: 'Play Letter C' }));
    expect(AudioPlayer.getState().queue[0].readerCode).toBe('V');   // what the row said
  });

  it('Automatic names the primary reading', () => {
    renderScreen('one');
    const metas = [...document.querySelectorAll('.audio-library-row-copy small')].map((e) => e.textContent);
    expect(metas).toEqual(['Read by Benjamin', '2 parts · Read by Timothy']);
  });
});

describe('AudioCollectionScreen -- defensive states', () => {
  it('an unknown volKey renders a way back instead of a blank screen', () => {
    renderScreen('nine');
    expect(screen.getByText(/This source has no recordings to show/)).toBeTruthy();
  });
});


/* Listening item 8: downloads to the phone, on the recordings screen (Codex mockup round 1, option 1). The screen reads
   the bundle-d store as a global (OfflineAudio); a plain stand-in drives it here. */
describe('a recordings screen in the phone app: downloads', () => {
  function fakeStore({ available = true } = {}) {
    const s = {
      subscribe: () => () => {}, getVersion: () => 0, available: () => available, refresh: () => {},
      statusOf: () => 'none', isSaved: () => false, sizeOf: () => null, progressOf: () => null, failureOf: () => null,
      items: () => [], totalBytes: () => 0, freeBytes: () => 5e9,
      requestSizes: vi.fn(), download: vi.fn(() => true), remove: vi.fn(), removeAll: vi.fn(), cancel: vi.fn(),
    };
    globalThis.OfflineAudio = s;
    return s;
  }
  function setOnline(v) { Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => v }); }
  beforeEach(() => { globalThis.ReactDOM = ReactDOM; });
  afterEach(() => { _resetToasts(); delete globalThis.ReactDOM; delete globalThis.OfflineAudio; setOnline(true); AudioPlayer.setPreferredReader('auto'); });

  /* D4 (picture 14): a row's Download moved into its ... menu; the line under it speaks only while a download is on
     its way or failed, and Download all sits beside Play all. */
  it('every recording row has a ... menu whose Download saves the reading its own Play plays', () => {
    const store = fakeStore();
    store.sizeOf = () => 5e6;
    AudioPlayer.setPreferredReader('V');
    renderScreen('one');
    const rows = [...document.querySelectorAll('.audio-collection-item')];
    expect(rows).toHaveLength(2);
    for (const row of rows) expect(row.querySelector('.offline-row')).toBeNull();
    expect(screen.getByRole('button', { name: /download all/i })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'More for Letter C' }));
    const menu = screen.getByRole('menu', { name: 'More for Letter C' });
    expect([...menu.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent)).toEqual(['Play next', 'Add to queue', 'Download · 10 MB', 'Open the letter']);
    // Letter C in the chosen reader V, both parts.
    fireEvent.click(screen.getByRole('menuitem', { name: 'Download · 10 MB' }));
    expect(store.download.mock.calls[0][0].map((t) => t.url)).toEqual([URL_OF('idC1v'), URL_OF('idC2v')]);
    expect(screen.queryByRole('menu')).toBeNull();
  });

  /* pl-l2 L3 (player brief 3c): Play next / Add to queue on every row that plays; the row's own reading, after what
     plays (Play next) or at the end (Add to queue), and a toast says so. */
  it('Play next and Add to queue line up the row\'s own reading, and say so', () => {
    fakeStore();
    AudioPlayer.setPreferredReader('V');
    AudioPlayer.playLetter({ volKey: 'one', letter: { id: 'letter-a', title: 'Letter A' }, collectionLabel: 'Volume One' });
    const before = AudioPlayer.getState().queue.length;
    renderScreen('one');
    fireEvent.click(screen.getByRole('button', { name: 'More for Letter C' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Add to queue' }));
    const q = AudioPlayer.getState().queue;
    expect(q.slice(before).map((t) => t.url)).toEqual([URL_OF('idC1v'), URL_OF('idC2v')]);
    expect(document.getElementById('vot-toast-audio').textContent).toBe('Added to Up next: Letter C');
  });

  it('a long-press on a row opens its menu, and Choose more… opens the Downloads tree at the collection', () => {
    fakeStore();
    window.__openDownloads = vi.fn();
    try {
      renderScreen('one');
      const row = document.querySelectorAll('.audio-collection-item')[0];
      // The phone's long-press is a contextmenu: the row's menu opens instead of the browser's (fireEvent: false = prevented).
      expect(fireEvent.contextMenu(row.querySelector('.audio-library-row-copy strong'))).toBe(false);
      fireEvent.click(screen.getByRole('menuitem', { name: 'Choose more…' }));
      expect(window.__openDownloads).toHaveBeenCalledWith({ tab: 'choose', focus: 'one' }, 'Volume One');
    } finally { delete window.__openDownloads; }
  });

  it('a row on the phone ends its line with a tick, its menu removes it with an Undo, and the header counts it', () => {
    vi.useFakeTimers();
    try {
      const store = fakeStore();
      const saved = new Set([URL_OF('idA')]);
      store.isSaved = (u) => saved.has(u);
      store.statusOf = (u) => (saved.has(u) ? 'saved' : 'none');
      store.sizeOf = () => 3e6;
      renderScreen('one');
      const rows = [...document.querySelectorAll('.audio-collection-item')];
      expect(rows[0].querySelector('small .offline-tick').getAttribute('aria-label')).toBe('On this phone');
      expect(rows[1].querySelector('.offline-tick')).toBeNull();
      expect(document.querySelector('.offline-mark').textContent).toBe('1 of 2 on this phone');
      expect(screen.getByRole('button', { name: /^Download the other 1 · 6 MB$/ })).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'More for Letter A' }));
      fireEvent.click(screen.getByRole('menuitem', { name: 'Remove · 3 MB' }));
      // It reads as gone at once; the file goes when the Undo toast does.
      expect(document.getElementById('vot-toast-offline-removed').textContent).toBe('Removed Letter A · 3 MBUndo');
      expect(rows[0].querySelector('.offline-tick')).toBeNull();
      expect(document.querySelector('.offline-mark')).toBeNull();
      expect(store.remove).not.toHaveBeenCalled();
      act(() => { vi.advanceTimersByTime(5100); });
      expect(store.remove).toHaveBeenCalledWith([URL_OF('idA')]);
    } finally { vi.useRealTimers(); }
  });

  it('a Bible edition offers a book at a time from its rows, never the whole edition', () => {
    fakeStore();
    renderScreen('bible-brm-kjv');
    expect(document.querySelectorAll('.audio-collection-item .row-menu-btn').length).toBe(2);
    expect(screen.queryByRole('button', { name: /download all/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More for Genesis' }));
    expect(screen.getByRole('menuitem', { name: /^Download/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: 'Open the book' })).toBeTruthy();
  });

  // Downloads brief 3a, picture 14: "Choose…" beside Play all opens the Downloads tree at this collection or edition.
  it('Choose… opens the Downloads tree at this collection, and at a Bible edition too', () => {
    fakeStore();
    window.__openDownloads = vi.fn();
    try {
      renderScreen('one');
      fireEvent.click(screen.getByRole('button', { name: 'Choose…' }));
      expect(window.__openDownloads).toHaveBeenCalledWith({ tab: 'choose', focus: 'one' }, expect.any(String));
      cleanup();
      renderScreen('bible-brm-kjv');
      fireEvent.click(screen.getByRole('button', { name: 'Choose…' }));
      expect(window.__openDownloads).toHaveBeenLastCalledWith({ tab: 'choose', focus: 'bible-brm-kjv' }, expect.any(String));
    } finally { delete window.__openDownloads; }
  });

  it('on the web none of it renders', () => {
    fakeStore({ available: false });
    renderScreen('one');
    expect(document.querySelector('.offline-row')).toBeNull();
    expect(screen.queryByRole('button', { name: /download all/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Choose…' })).toBeNull();
    // The compilations stay the plain chips they were.
    expect(document.querySelector('.audio-collection-compilation')).toBeNull();
    expect(screen.getByRole('button', { name: /Part 2 · 3/ })).toBeTruthy();
  });

  /* Codex critique of the built screens (2026-09-24, 1): with no signal, Play all plays only what is on the phone (the
     player passes over the rest), so the button says that instead of promising the whole collection. */
  it('with no signal, Play all names what is on the phone', () => {
    const store = fakeStore();
    let saved = [URL_OF('idA')];
    store.isSaved = (u) => saved.includes(u);
    store.statusOf = (u) => (saved.includes(u) ? 'saved' : 'none');
    setOnline(false);
    const view = renderScreen('one');
    expect(screen.getByRole('button', { name: /^Play the one on this phone$/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Play all$/ })).toBeNull();
    // Both parts of letter C on the phone too: two letters.
    saved = [URL_OF('idA'), URL_OF('idC1'), URL_OF('idC2')];
    view.rerender(
      <AudioCollectionScreen volKey="one" onBack={() => {}} onOpenText={() => {}} onSearch={() => {}}
        onHistory={() => {}} onSettings={() => {}} theme="dark" onThemeChange={() => {}} />
    );
    expect(screen.getByRole('button', { name: /^Play the 2 on this phone$/ })).toBeTruthy();
  });

  it('with no signal and nothing on the phone, and with a signal, it stays Play all', () => {
    fakeStore();
    setOnline(false);
    renderScreen('one');
    expect(screen.getByRole('button', { name: /^Play all$/ })).toBeTruthy();
    cleanup();
    setOnline(true);
    const store = fakeStore();
    store.isSaved = () => true;
    store.statusOf = () => 'saved';
    renderScreen('one');
    expect(screen.getByRole('button', { name: /^Play all$/ })).toBeTruthy();
  });

  /* A compilation is a recording too (Corbin 09-22: save per recording): each chip gets the rows' line. */
  it('each compilation says what the phone holds and downloads its own file', () => {
    const store = fakeStore();
    renderScreen('one');
    const comps = [...document.querySelectorAll('.audio-collection-compilation')];
    expect(comps).toHaveLength(2);
    for (const c of comps) expect(c.querySelector('.offline-row').textContent).toMatch(/^Download/);
    expect(store.requestSizes).toHaveBeenCalledWith([URL_OF('sec1')]);
    fireEvent.click(comps[1].querySelector('.offline-row-download'));
    // Named for the shelf with its collection: "Part 2 · 3" alone says nothing on "On this phone".
    expect(store.download.mock.calls[0][0]).toEqual([{ url: URL_OF('sec2'), key: '', title: 'Volume One · Part 2 · 3' }]);
    // Download all stays the letters (a compilation is the same words again, in one long file).
    const all = store.download.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: /download all/i }));
    fireEvent.click(document.querySelector('.offline-confirm-go'));
    expect(store.download.mock.calls[all][0].map((t) => t.url)).not.toContain(URL_OF('sec1'));
  });

  // That a saved compilation then PLAYS with no signal is the player's side (audio-player.test.js, item 8 describe).
  it('with no signal, a compilation not on the phone is marked unavailable, and one on the phone is not', () => {
    const store = fakeStore();
    store.statusOf = (u) => (u === URL_OF('sec2') ? 'saved' : 'none');
    store.isSaved = (u) => u === URL_OF('sec2');
    setOnline(false);
    renderScreen('one');
    const comps = [...document.querySelectorAll('.audio-collection-compilation')];
    expect(comps[0].classList.contains('is-unavailable')).toBe(true);
    expect(comps[0].querySelector('.offline-row').textContent).toMatch(/Needs a connection/);
    expect(comps[1].classList.contains('is-unavailable')).toBe(false);
    expect(comps[1].querySelector('.offline-row').textContent).toMatch(/On this phone/);
  });

  it('with no signal, a row not on the phone is marked unavailable', () => {
    fakeStore();
    setOnline(false);
    renderScreen('one');
    const rows = [...document.querySelectorAll('.audio-collection-item')];
    expect(rows.every((r) => r.classList.contains('is-unavailable'))).toBe(true);
    expect(rows[0].querySelector('small').textContent).toBe('Not on this phone');
    // Picture 17: the screen says it is showing what is on the phone, and a row's menu queues it for the signal.
    expect(screen.getByRole('status').textContent).toBe('You’re offline. Showing what’s on this phone.');
    fireEvent.click(screen.getByRole('button', { name: 'More for Letter A' }));
    expect(screen.getByRole('menuitem', { name: 'Download when online' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Download when online' })).toBeTruthy();
  });
});
