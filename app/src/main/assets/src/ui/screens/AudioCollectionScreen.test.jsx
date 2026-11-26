// @ts-nocheck -- drives the REAL AudioPlayer against fixture manifests, so the
// forward-only queue and the reader choice are proven as behavior, not wiring.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { _resetToasts } from '../../utils/toast.js';
import * as ReactDOM from 'react-dom';

import { AudioPlayer } from '../../utils/audio-player.js';
import { AudioCollectionScreen } from './AudioCollectionScreen.jsx';
import * as Shelf from '../components/AudioShelf.jsx';
import * as AudioTrack from '../../utils/audio-track.js';
import * as AudioCoverage from '../../utils/audio-coverage.js';
import { AudioSeekSlider } from '../components/AudioSeekSlider.jsx';
import { CoverageBadge } from '../components/CoverageBadge.jsx';
import { AudioLibraryStore } from '../../stores/audio-library-store.js';
import { resetSyncLoadersForTests } from '../../utils/sync-loaders.js';

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
  globalThis.ScreenLayout = ({ children, utility }) => <main>{utility ? <h1>{utility.title}</h1> : null}{children}</main>;
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
    'BIBLE_SYNC_PARTIAL', 'AudioPositionsStore', 'Audio']) delete globalThis[key];
  localStorage.removeItem('vot-audio-pos');
});

/* listen.html au-coll / au-rowmenu / au-dlcoll (W3-listen, 2026-11-11): the title in the bar, "N recordings · length",
   Play all and ONE Download for the whole collection, rows of play · title · "voice · length" · star · one menu. */
const metas = () => [...document.querySelectorAll('.listen-rec .ui-row-meta')].map((e) => e.textContent);
const openMenu = (name) => fireEvent.click(screen.getByRole('button', { name: 'More for ' + name }));
const sheetRows = () => [...document.querySelectorAll('.ui-sheet-action .ui-row-title')].map((e) => e.textContent);
const pick = (label) => fireEvent.click([...document.querySelectorAll('.ui-sheet-action')].find((b) => b.textContent.startsWith(label)));

describe('AudioCollectionScreen -- a VOT collection', () => {
  it('lists only letters with recordings, titled in the bar, and says plainly how many still await one', () => {
    renderScreen('one');
    expect(screen.getByRole('heading', { name: 'Volume One' })).toBeTruthy();
    expect(screen.getByText('2 recordings')).toBeTruthy();
    expect(screen.getByText('Letter A')).toBeTruthy();
    expect(screen.getByText('Letter C')).toBeTruthy();
    expect(screen.queryByText('Letter B (no audio)')).toBeNull();
    expect(screen.getByText('1 letter awaits recording.')).toBeTruthy();
    expect(screen.queryByText(/Listening Library/)).toBeNull();
  });

  it('a row starts the forward-only whole-source queue at that letter', () => {
    renderScreen('one');
    fireEvent.click(screen.getByRole('button', { name: 'Play Letter C' }));
    expect(queueUrls()).toEqual([URL_OF('idC1'), URL_OF('idC2')]);
    expect(AudioPlayer.getState().qi).toBe(0);
  });

  it('Play all queues the whole source from its first recording', () => {
    renderScreen('one');
    fireEvent.click(screen.getByRole('button', { name: /Play all/ }));
    expect(queueUrls()).toEqual([URL_OF('idA'), URL_OF('idC1'), URL_OF('idC2')]);
  });

  it('the row menu is a sheet: Play next, Add to the end of Up next, Save, the other voice, Open the letter', () => {
    renderScreen('one');
    openMenu('Letter C');
    expect(screen.getByRole('dialog', { name: 'Letter C' })).toBeTruthy();
    expect(document.querySelector('.ui-sheet-sub').textContent).toBe('Volume One · Letter 3 · Read by Timothy');
    expect(sheetRows()).toEqual(['Play next', 'Add to the end of Up next', 'Save', 'Play in another voice: Text-to-speech', 'Open the letter']);
    pick('Play in another voice');
    expect(queueUrls()).toEqual([URL_OF('idC1v'), URL_OF('idC2v')]);
    expect(screen.queryByRole('dialog')).toBeNull();
    // Letter A has one voice: no voice row.
    openMenu('Letter A');
    expect(sheetRows()).not.toContain('Play in another voice: Text-to-speech');
  });

  it('Open the letter hands the track key to the coordinator wiring', () => {
    const onOpenText = vi.fn();
    renderScreen('one', { onOpenText });
    openMenu('Letter A');
    pick('Open the letter');
    expect(onOpenText).toHaveBeenCalledWith({ key: 'one:letter-a' });
  });

  it('compilation chips play their section', () => {
    renderScreen('one');
    fireEvent.click(screen.getByRole('button', { name: /Part 1 · 1-2/ }));
    expect(AudioPlayer.getState().queue.length).toBeGreaterThan(0);
  });

  it('every row carries a Save star that stars the reading its Play plays', () => {
    globalThis.AudioLibraryStore = AudioLibraryStore;
    try {
      renderScreen('one');
      const star = screen.getByRole('button', { name: 'Save Letter A' });
      expect(star.getAttribute('aria-pressed')).toBe('false');
      fireEvent.click(star);
      expect(AudioLibraryStore.isSaved({ url: URL_OF('idA'), key: 'one:letter-a', title: 'Letter A' })).toBe(true);
      expect(screen.getByRole('button', { name: 'Remove Letter A from Saved' }).getAttribute('aria-pressed')).toBe('true');
      AudioLibraryStore.toggleSaved({ url: URL_OF('idA'), key: 'one:letter-a', title: 'Letter A' });
    } finally { delete globalThis.AudioLibraryStore; }
  });
});

/* r3 review: the screen's compilation chips go through useSyncedSections (AudioCollectionScreen.jsx), so while the
   timings are on their way a chip shows its file's name only, never the hand range they will correct. Rendering the
   raw sectionsFor list fails this. */
describe('AudioCollectionScreen -- compilations while the timings load', () => {
  afterEach(() => { resetSyncLoadersForTests(); delete globalThis.__makeLazyLoader; });

  it('names each compilation without its hand range until the timings land', () => {
    globalThis.__makeLazyLoader = vi.fn((name, path) => ({
      name, path, load: () => new Promise(() => {}),
      corpus: { loaded: false, error: false, subscribe: () => () => {}, getVersion: () => 0 },
    }));
    renderScreen('one');
    expect(screen.getByRole('button', { name: /^Part 1/ }).textContent).not.toContain('1-2');
    expect(document.body.textContent).not.toContain('Part 1 · 1-2');
    expect(document.body.textContent).toContain('Part 2');
  });
});

describe('AudioCollectionScreen -- recording lengths', () => {
  afterEach(() => { delete globalThis.AUDIO_LENGTHS; });
  it('each row carries its reading\'s length, and the summary the whole collection\'s', () => {
    globalThis.AUDIO_LENGTHS = { idA: [1e6, 141], idC1: [1e6, 1800], idC2: [1e6, 1860] };
    renderScreen('one');
    expect(metas()[0]).toContain('2:21');
    expect(metas()[1]).toContain('61:00');
    expect(screen.getByText('2 recordings · 1 h 3 min')).toBeTruthy();
  });
  it('no length is guessed while one is unknown', () => {
    globalThis.AUDIO_LENGTHS = { idA: [1e6, 141] };
    renderScreen('one');
    expect(screen.getByText('2 recordings')).toBeTruthy();
  });
});

describe('AudioCollectionScreen -- a Bible edition', () => {
  const OT = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-brm-v1/' + id + '.mp3';
  const perChapter = (book, n) => Array.from({ length: n }, (_v, i) =>
    ['brm1_' + book + '_' + String(i + 1).padStart(3, '0'), '', 'Chapter ' + (i + 1)]);
  afterEach(() => { delete globalThis.AUDIO_LENGTHS; });

  it('lists the books its manifest ships and plays them forward-only', () => {
    renderScreen('bible-brm-kjv');
    // listen.html au-books: the bar says "KJV", the line under it the reading and the books.
    expect(screen.getByRole('heading', { name: 'KJV' })).toBeTruthy();
    expect(document.querySelector('.listen-sum').textContent).toMatch(/^Biblical Restoration Ministries · \d+ books/);
    expect(screen.getByText('Genesis')).toBeTruthy();
    expect(screen.queryByText('Psalms')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Play Exodus' }));
    expect(queueUrls()).toEqual([BURL('brm-kjv_exodus')]);
  });

  it('a book opens its chapters from its menu and starts AT the tapped one; its length is in hours and minutes', () => {
    globalThis.BIBLE_AUDIO_MANIFEST = { 'bible-brm-kjv:jonah': perChapter('jonah', 4) };
    globalThis.BIBLE_AUDIO_BOOKS = [['jonah', 'Jonah']];
    globalThis.AUDIO_LENGTHS = Object.fromEntries(perChapter('jonah', 4).map(([id]) => [id, [1e6, 3240]]));
    renderScreen('bible-brm-kjv');
    expect(metas()[0]).toBe('4 chapters · 3 h 36 min');
    expect(screen.queryByText(/Chapter 3/)).toBeNull();
    openMenu('Jonah');
    pick('Show the 4 chapters');
    expect(screen.getByText('Chapter 3')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Play Jonah 3' }));
    expect(queueUrls()).toEqual([OT('brm1_jonah_003'), OT('brm1_jonah_004')]);
  });

  it('a book row opens its chapters under it (au-chapters): number, length, the first seven then Show all', () => {
    globalThis.BIBLE_AUDIO_MANIFEST = { 'bible-brm-kjv:jonah': perChapter('jonah', 9) };
    globalThis.BIBLE_AUDIO_BOOKS = [['jonah', 'Jonah']];
    renderScreen('bible-brm-kjv');
    expect(screen.queryByRole('button', { name: /Save Jonah/ })).toBeNull();          // the mock's book row: no star
    fireEvent.click(screen.getByRole('button', { name: 'Show the chapters of Jonah' }));
    expect(screen.getByText('Chapter 7')).toBeTruthy();
    expect(screen.queryByText('Chapter 8')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Show all 9 chapters' }));
    expect(screen.getByText('Chapter 9')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Hide the chapters of Jonah' }));
    expect(screen.queryByText('Chapter 1')).toBeNull();
  });

  it('switches between the Old and New Testament, each counting its books (au-books)', () => {
    globalThis.BIBLE_AUDIO_MANIFEST = { 'bible-brm-kjv:jonah': perChapter('jonah', 2), 'bible-brm-kjv:mark': perChapter('mark', 2) };
    globalThis.BIBLE_AUDIO_BOOKS = [...Array.from({ length: 38 }, (_v, i) => ['ot' + i, 'OT ' + i]), ['jonah', 'Jonah'], ['mark', 'Mark']];
    renderScreen('bible-brm-kjv');
    expect(screen.getByText('Jonah')).toBeTruthy();
    expect(screen.queryByText('Mark')).toBeNull();
    fireEvent.click(screen.getByRole('radio', { name: 'New Testament · 1' }));
    expect(screen.getByText('Mark')).toBeTruthy();
    expect(screen.queryByText('Jonah')).toBeNull();
  });

  it('offers Open the book on a Bible book, keyed like every other row', () => {
    const onOpenText = vi.fn();
    renderScreen('bible-brm-kjv', { onOpenText });
    openMenu('Genesis');
    pick('Open the book');
    expect(onOpenText).toHaveBeenCalledWith({ key: 'bible-brm-kjv:genesis' });
  });
});

describe('AudioCollectionScreen -- the row names the reading its Play plays', () => {
  afterEach(() => AudioPlayer.setPreferredReader('auto'));
  it('names the Letter Voice reader where that reader recorded the letter, the primary elsewhere', () => {
    AudioPlayer.setPreferredReader('V');
    renderScreen('one');
    expect(metas()).toEqual(['Read by Benjamin', '2 parts · Text-to-speech']);
    fireEvent.click(screen.getByRole('button', { name: 'Play Letter C' }));
    expect(AudioPlayer.getState().queue[0].readerCode).toBe('V');
  });
  it('Automatic names the primary reading', () => {
    renderScreen('one');
    expect(metas()).toEqual(['Read by Benjamin', '2 parts · Read by Timothy']);
  });
});

describe('AudioCollectionScreen -- defensive states', () => {
  it('an unknown volKey renders a way back instead of a blank screen', () => {
    const onBack = vi.fn();
    renderScreen('nine', { onBack });
    expect(screen.getByText('No recordings to show')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Listen' }));
    expect(onBack).toHaveBeenCalled();
  });
});

/* Corbin 11-11: "if the downloads screen and all its screens are properly designed, we won't need an individual
   download button on every letter". One Download for the collection, a short sheet, then "On this phone". */
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
  afterEach(() => { _resetToasts(); delete globalThis.ReactDOM; delete globalThis.OfflineAudio; delete window.__openDownloads; setOnline(true); AudioPlayer.setPreferredReader('auto'); });

  it('no row and no row menu offers a download; the one Download asks in a sheet and saves every reading', () => {
    const store = fakeStore();
    store.sizeOf = () => 5e6;
    renderScreen('one');
    expect(document.querySelector('.offline-row')).toBeNull();
    openMenu('Letter C');
    expect(sheetRows().some((t) => /download/i.test(t))).toBe(false);
    fireEvent.click(document.querySelector('.select-sheet-backdrop'));
    fireEvent.click(screen.getByRole('button', { name: 'Download Volume One' }));
    const sheet = screen.getByRole('dialog', { name: 'Download Volume One' });
    expect(sheet.textContent).toContain('2 recordings');
    expect(sheet.textContent).toContain('15 MB');
    expect(sheet.textContent).toContain('The one Listen plays');
    expect(sheet.textContent).toContain('Free on this phone');
    fireEvent.click(screen.getByRole('button', { name: 'Download 15 MB' }));
    expect(store.download.mock.calls[0][0].map((t) => t.url)).toEqual([URL_OF('idA'), URL_OF('idC1'), URL_OF('idC2')]);
  });

  it('the sheet\'s Voice picks the reading to download, and Open Downloads opens the tree at the collection', () => {
    const store = fakeStore();
    store.sizeOf = () => 5e6;
    window.__openDownloads = vi.fn();
    renderScreen('one');
    fireEvent.click(screen.getByRole('button', { name: 'Download Volume One' }));
    fireEvent.click(screen.getByRole('button', { name: /^Voice/ }));
    fireEvent.click(screen.getByRole('radio', { name: /Text-to-speech/ }));
    expect(screen.getByRole('dialog', { name: 'Download Volume One' }).textContent).toContain('Text-to-speech');
    // PL-LISTEN (REVIEW-listen 9): sizes were asked only for the voice the sheet opened with, so another voice's
    // files had none: no size on the button and no room check.
    expect(store.requestSizes).toHaveBeenLastCalledWith([URL_OF('idA'), URL_OF('idC1v'), URL_OF('idC2v')]);
    fireEvent.click(screen.getByRole('button', { name: 'Download 15 MB' }));
    expect(store.download.mock.calls[0][0].map((t) => t.url)).toEqual([URL_OF('idA'), URL_OF('idC1v'), URL_OF('idC2v')]);
    fireEvent.click(screen.getByRole('button', { name: 'Download Volume One' }));
    fireEvent.click(screen.getByRole('button', { name: 'Open Downloads' }));
    expect(window.__openDownloads).toHaveBeenCalledWith({ tab: 'choose', focus: 'one' }, 'Volume One');
  });

  it('once all of it is kept the button reads On this phone, and each kept row carries the tick', () => {
    const store = fakeStore();
    store.isSaved = () => true;
    store.statusOf = () => 'saved';
    store.sizeOf = () => 3e6;
    renderScreen('one');
    expect(screen.getByRole('button', { name: 'On this phone: Volume One' })).toBeTruthy();
    expect(document.querySelectorAll('.listen-rec .ui-row-mark.is-tick')).toHaveLength(2);
  });

  it('a Bible edition has no collection Download (it downloads from Downloads by edition or book)', () => {
    fakeStore();
    renderScreen('bible-brm-kjv');
    expect(screen.queryByRole('button', { name: /^Download/ })).toBeNull();
  });

  it('on the web without the store none of it renders', () => {
    renderScreen('one');
    expect(screen.queryByRole('button', { name: 'Download Volume One' })).toBeNull();
  });

  it('with no signal a row not on the phone says so, and Play all names what is on the phone', () => {
    const store = fakeStore();
    const saved = new Set([URL_OF('idA')]);
    store.isSaved = (u) => saved.has(u);
    store.statusOf = (u) => (saved.has(u) ? 'saved' : 'none');
    setOnline(false);
    renderScreen('one');
    expect(metas()[1]).toBe('Not on this phone');
    expect(screen.getByRole('button', { name: /Play the one on this phone/ })).toBeTruthy();
  });
});
