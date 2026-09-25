// @ts-nocheck -- drives the REAL AudioPlayer singleton through a fake media element.
/* Songs of the Letters on the bar and the desk (songs-U2: L3 + L5).
   The bar's song skin (picture final-08), the desk's song mode (final-04),
   the song → letter arm of textKeyOf, and the lyrics card. Same harness as
   AudioManagerSheet.test: the real player store, a FakeAudio element, the
   real catalog module with the test fixture adopted. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { AudioPlayer } from '../../utils/audio-player.js';
import { adoptSongCatalog, _resetSongCatalogForTests } from '../../utils/song-catalog.js';
import { SONG_FIXTURE } from '../../utils/song-catalog.fixture.js';
import { AudioPlayerBar } from './AudioPlayerBar.jsx';
import { textKeyOf, hasTextDestination } from './AudioShelf.jsx';
import { _resetSongLyricsForTests, lyricLineAt } from './SongParts.jsx';

class FakeAudio extends EventTarget {
  constructor() {
    super();
    FakeAudio.last = this;
    this._src = ''; this.currentTime = 0; this.duration = 0; this.paused = true; this.error = null;
    this.preload = ''; this.defaultPlaybackRate = 1; this.playbackRate = 1;
  }
  get src() { return this._src; }
  set src(v) { this._src = v; this.currentTime = 0; }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
  load() {}
  removeAttribute(name) { if (name === 'src') this._src = ''; }
}

const el = () => FakeAudio.last;
const emit = (type) => act(() => { el().dispatchEvent(new Event(type)); });
const at = (seconds) => act(() => { el().currentTime = seconds; el().dispatchEvent(new Event('timeupdate')); });

const LYRICS = {
  aaaaaaaaaaa1: { v: 1, id: 'aaaaaaaaaaa1', synced: true, lines: [{ t: 'Come, love awaits you', s: 10, e: 14 }, { t: 'The door is open wide', s: 15, e: 19 }] },
  aaaaaaaaaaa2: { v: 1, id: 'aaaaaaaaaaa2', synced: false, lines: [{ t: 'Plain words one', s: 10, e: 14 }, { t: 'Plain words two', s: 15, e: 19 }] },
};

function library() {
  const saved = new Set();
  const listeners = new Set();
  let version = 0;
  const notify = () => { version++; for (const cb of listeners) cb(); };
  return {
    subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getVersion: () => version,
    isSaved: (t) => !!t && saved.has(t.key),
    toggleSaved: vi.fn((t) => { if (saved.has(t.key)) saved.delete(t.key); else saved.add(t.key); notify(); }),
    getPlaybackRate: () => 1, setPlaybackRate: vi.fn(),
    recordPlayed: vi.fn(), recordSongPlayed: vi.fn(), countPlay: vi.fn(), countCompletion: vi.fn(),
  };
}

const realFetch = globalThis.fetch;

function catalog(patch = {}) {
  return { ...SONG_FIXTURE, songs: SONG_FIXTURE.songs.map((s) => (patch[s.id] ? { ...s, ...patch[s.id] } : s)) };
}

beforeEach(() => {
  globalThis.fetch = vi.fn((url) => {
    const m = String(url).match(/\/songs\/lyrics\/([0-9a-f]{12})\.json$/);
    const body = m && LYRICS[m[1]];
    return body ? Promise.resolve({ ok: true, json: () => Promise.resolve(body) }) : Promise.reject(new TypeError('offline'));
  });
  globalThis.Audio = FakeAudio;
  globalThis.ReactDOM = ReactDOM;
  globalThis.AudioLibraryStore = library();
  globalThis.COL_BY_KEY = new Map([['wtlb1', { volKey: 'wtlb1', label: 'Words to Live By, Part One', letterScreen: 'wtlb1-entry' }]]);
  globalThis.colLetterArr = () => [{ id: 'come-love-awaits-you', title: 'Come, Love Awaits You' }];
  globalThis.AUDIO_MANIFEST = { 'vol1:letter-a': [['idA', 'B']] };
  window.__openAudioText = vi.fn();
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
  _resetSongCatalogForTests();
  _resetSongLyricsForTests();
  adoptSongCatalog(catalog({ aaaaaaaaaaa2: { lyr: 1 } }));
  AudioPlayer.stop();
  AudioPlayer.setRepeat('off');
});

afterEach(() => {
  cleanup();
  AudioPlayer.stop();
  for (const k of ['Audio', 'AudioLibraryStore', 'COL_BY_KEY', 'colLetterArr', 'AUDIO_MANIFEST']) delete globalThis[k];
  delete window.__openAudioText;
  globalThis.fetch = realFetch;
  _resetSongCatalogForTests();
});

const playFamilyA = () => act(() => { AudioPlayer.playSongs({ filter: { family: 'fam-a' } }); });

describe('the mini-player song skin (final-08)', () => {
  it('shows the cover, the title, the version, a FILLED play/pause, next and close; no slider, a 3 px line instead', () => {
    playFamilyA();
    render(<AudioPlayerBar />);
    const bar = document.querySelector('.audio-bar');
    expect(bar.className).toContain('is-song');
    expect(bar.querySelector('.audio-bar-cover img').getAttribute('src')).toBe('https://votreader.github.io/songs/thumbs/256/aaaaaaaaaaa1.webp');
    expect(bar.querySelector('.audio-bar-title').textContent).toBe('Come, Love Awaits You');
    expect(bar.querySelector('.audio-bar-song-sub').textContent).toBe('Loading…');   // buffering
    emit('playing');
    expect(bar.querySelector('.audio-bar-song-sub').textContent).toBe('Country · hmarie777');
    expect(within(bar).getByRole('button', { name: 'Pause' }).className).toContain('audio-bar-song-play');
    expect(bar.querySelector('.audio-bar-seek')).toBeNull();
    expect(bar.querySelector('.audio-bar-line')).not.toBeNull();
    expect(bar.querySelector('.audio-bar-pull')).not.toBeNull();
    fireEvent.click(within(bar).getByRole('button', { name: 'Next song' }));
    expect(AudioPlayer.getState().qi).toBe(1);
    fireEvent.click(within(bar).getByRole('button', { name: 'Close player' }));
    expect(AudioPlayer.getState().status).toBe('idle');
  });

  it('offline and paused, a song says it is not on this phone and dims its play', () => {
    playFamilyA();
    emit('playing');
    act(() => { AudioPlayer.toggle(); });
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    render(<AudioPlayerBar />);
    expect(document.querySelector('.audio-bar-song-sub').textContent).toBe('Not on this phone');
    expect(document.querySelector('.audio-bar-song-play').className).toContain('is-unavailable');
  });

  it('the bar hears the signal go and come back by itself, with no player event (K2)', () => {
    playFamilyA();
    emit('playing');
    act(() => { AudioPlayer.toggle(); });
    render(<AudioPlayerBar />);
    expect(document.querySelector('.audio-bar-song-sub').textContent).toBe('Country · hmarie777');
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(document.querySelector('.audio-bar-song-sub').textContent).toBe('Not on this phone');
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
    act(() => { window.dispatchEvent(new Event('online')); });
    expect(document.querySelector('.audio-bar-song-sub').textContent).toBe('Country · hmarie777');
  });

  it('offline, a song KEPT on this phone never says it is not on it (K1)', async () => {
    const { SongKeep } = await import('../../utils/song-keep.js');
    globalThis.OfflineSongsStore = { all: async () => [{ id: 'aaaaaaaaaaa1', blob: new Blob([new Uint8Array(4)]), bytes: 4, sha256: '', keptAt: 1 }], get: async () => null, put: async () => {}, delete: async () => {} };
    if (!globalThis.indexedDB) globalThis.indexedDB = {};
    SongKeep._reset();
    await SongKeep.ready();
    try {
      playFamilyA();
      emit('playing');
      act(() => { AudioPlayer.toggle(); });
      Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
      render(<AudioPlayerBar />);
      expect(document.querySelector('.audio-bar-song-sub').textContent).toBe('Country · hmarie777');
      expect(document.querySelector('.audio-bar-song-play').className).not.toContain('is-unavailable');
    } finally { delete globalThis.OfflineSongsStore; SongKeep._reset(); }
  });

  it('a reading keeps the reading skin exactly: its round play, its slider', () => {
    act(() => { AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'The Wide Path' }, collectionLabel: 'Volume One' }); });
    render(<AudioPlayerBar />);
    const bar = document.querySelector('.audio-bar');
    expect(bar.className).not.toContain('is-song');
    expect(bar.querySelector('.audio-bar-seek')).not.toBeNull();
    expect(bar.querySelector('.audio-bar-play')).not.toBeNull();
  });

  it('the bar and desk buttons take the reading serif, and the journal button lifts over the bar (W3-07, W3-01)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const css = readFileSync(resolve(here, '../../../app.css'), 'utf-8');
    expect(css).toContain(':where(.audio-bar, .audio-manager-sheet) button { font-family: inherit; }');
    const journal = readFileSync(resolve(here, '../../styles/journal-styles.js'), 'utf-8');
    expect(journal).toContain('body.audio-bar-open .jrn-fab { bottom: calc(24px + 72px');
  });
});

describe('the listening desk in song mode (final-04)', () => {
  const openDesk = () => {
    render(<AudioPlayerBar />);
    fireEvent.click(document.querySelector('.audio-bar-song-summary'));
    return screen.getByRole('dialog');
  };

  it('heads with the cover, the version and Open the letter; no speed card', () => {
    playFamilyA();
    const desk = openDesk();
    expect(desk.querySelector('.song-desk-cover img')).not.toBeNull();
    expect(within(desk).getByRole('heading', { level: 2 }).textContent).toBe('Come, Love Awaits You');
    fireEvent.click(within(desk).getByRole('button', { name: /Open the letter — Come, Love Awaits You/ }));
    expect(window.__openAudioText).toHaveBeenCalledTimes(1);
    expect(Array.from(document.querySelectorAll('.audio-manager-tool-head span')).map((n) => n.textContent)).not.toContain('Speed');
  });

  it('the Versions card switches to another version from the start and keeps the queue after it', () => {
    playFamilyA();
    at(40);
    const desk = openDesk();
    expect(within(desk).getByText('Switches to another version of this song, from the start.')).toBeTruthy();
    fireEvent.click(within(desk).getByRole('radio', { name: 'Pop' }));
    const st = AudioPlayer.getState();
    expect(st.queue[st.qi].key).toBe('song:aaaaaaaaaaa2');
    expect(el().currentTime).toBe(0);
  });

  it('the transport is labelled Shuffle · Previous · Pause · Next · Repeat, and repeat cycles off → all → one', () => {
    playFamilyA();
    emit('playing');
    const desk = openDesk();
    const words = Array.from(desk.querySelectorAll('.song-desk-word')).map((n) => n.textContent);
    expect(words).toEqual(['Shuffle', 'Previous', 'Pause', 'Next', 'Repeat']);
    fireEvent.click(within(desk).getByRole('button', { name: 'Repeat: off' }));
    expect(AudioPlayer.getState().repeat).toBe('all');
    fireEvent.click(within(desk).getByRole('button', { name: 'Repeat: the queue' }));
    expect(AudioPlayer.getState().repeat).toBe('one');
    fireEvent.click(within(desk).getByRole('button', { name: 'Shuffle' }));
    expect(AudioPlayer.getState().shuffle).toBe(true);
  });

  it('synced lyrics wash the line being sung; Follow along can be turned off', async () => {
    playFamilyA();
    const desk = openDesk();
    expect(await within(desk).findByText('Come, love awaits you')).toBeTruthy();
    at(11);
    expect(desk.querySelector('.song-lyrics-line.is-now').textContent).toBe('Come, love awaits you');
    at(16);
    expect(desk.querySelector('.song-lyrics-line.is-now').textContent).toBe('The door is open wide');
    fireEvent.click(within(desk).getByRole('button', { name: 'Follow along' }));
    expect(within(desk).getByRole('button', { name: 'Follow along' }).getAttribute('aria-pressed')).toBe('false');
    expect(desk.querySelector('.song-lyrics-foot').textContent).toBe('Words from the letter “Come, Love Awaits You” · lyrics transcribed');
  });

  /* n3-10 (sweep 2): the player tells the page the time once a second, and the
     wash moved only then, up to a second late on a line. While a song plays, the
     card now reads the element's own clock each frame (getPreciseTime, as the
     read-along does). */
  it('(n3-10) the wash reaches the next line between the player’s once-a-second updates', async () => {
    const rafPrev = globalThis.requestAnimationFrame;
    const cafPrev = globalThis.cancelAnimationFrame;
    globalThis.requestAnimationFrame = (cb) => setTimeout(() => cb(Date.now()), 16);
    globalThis.cancelAnimationFrame = (id) => clearTimeout(id);
    try {
      playFamilyA();
      emit('playing');
      const desk = openDesk();
      expect(await within(desk).findByText('Come, love awaits you')).toBeTruthy();
      at(14);
      expect(desk.querySelector('.song-lyrics-line.is-now').textContent).toBe('Come, love awaits you');
      el().readyState = 4;                           // a playing element has its metadata (getPreciseTime reads it then)
      el().currentTime = 15.3;                       // no timeupdate yet: the page's clock still says 14
      await act(async () => { await new Promise((r) => setTimeout(r, 60)); });
      expect(desk.querySelector('.song-lyrics-line.is-now').textContent).toBe('The door is open wide');
    } finally {
      globalThis.requestAnimationFrame = rafPrev;
      globalThis.cancelAnimationFrame = cafPrev;
    }
  });

  it('a song whose lyrics are not synced never paints a line', async () => {
    act(() => { AudioPlayer.playSongs({ filter: { family: 'fam-a' }, startId: 'aaaaaaaaaaa2' }); });
    const desk = openDesk();
    expect(await within(desk).findByText('Plain words one')).toBeTruthy();
    at(11);
    expect(desk.querySelector('.song-lyrics-line.is-now')).toBeNull();
    expect(within(desk).queryByRole('button', { name: 'Follow along' })).toBeNull();
  });

  it('no lyrics hides the card; an instrumental says Instrumental', () => {
    act(() => { AudioPlayer.playSongs({ filter: { family: 'fam-b' } }); });
    let desk = openDesk();
    expect(desk.querySelector('.song-lyrics-card')).toBeNull();
    cleanup();
    AudioPlayer.stop();
    adoptSongCatalog(catalog({ bbbbbbbbbbb1: { dl: 'instrumental' } }));
    act(() => { AudioPlayer.playSongs({ filter: { family: 'fam-b' } }); });
    desk = openDesk();
    expect(desk.querySelector('.song-lyrics-card').textContent).toContain('Instrumental');
  });
});

describe('textKeyOf: a song\'s text is the letter it came from', () => {
  it('only at medium or high confidence, never the song key itself', () => {
    expect(textKeyOf({ key: 'song:aaaaaaaaaaa1' })).toBe('wtlb1:come-love-awaits-you');
    expect(hasTextDestination({ key: 'song:aaaaaaaaaaa1' })).toBe(true);
    expect(textKeyOf({ key: 'song:ccccccccccc1' })).toBeNull();   // a low link
    expect(textKeyOf({ key: 'song:bbbbbbbbbbb1' })).toBeNull();   // no letter
    expect(hasTextDestination({ key: 'song:bbbbbbbbbbb1' })).toBe(false);
    expect(textKeyOf({ key: 'song:ffffffffffff' })).toBeNull();   // not in the catalog
  });
});

describe('lyricLineAt', () => {
  const lines = [{ s: 10, e: 14 }, { s: 15, e: 19 }, { s: 40, e: 44 }];
  it('finds the line being sung, and none before the first or in a long gap', () => {
    expect(lyricLineAt(lines, 5)).toBe(-1);
    expect(lyricLineAt(lines, 12)).toBe(0);
    expect(lyricLineAt(lines, 14.5)).toBe(0);    // a breath between lines keeps the last one
    expect(lyricLineAt(lines, 16)).toBe(1);
    expect(lyricLineAt(lines, 30)).toBe(-1);     // an instrumental break
    expect(lyricLineAt(lines, 41)).toBe(2);
  });
});
