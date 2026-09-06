// @ts-nocheck -- drives the REAL AudioPlayer against fixture manifests, so the
// forward-only queue and the reader choice are proven as behavior, not wiring.
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { AudioPlayer } from '../../utils/audio-player.js';
import { AudioCollectionScreen } from './AudioCollectionScreen.jsx';

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

describe('AudioCollectionScreen -- defensive states', () => {
  it('an unknown volKey renders a way back instead of a blank screen', () => {
    renderScreen('nine');
    expect(screen.getByText(/This source has no recordings to show/)).toBeTruthy();
  });
});
