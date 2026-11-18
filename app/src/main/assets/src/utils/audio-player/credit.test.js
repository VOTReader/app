/* audio-player/credit — what listening earns: a recording heard to its end
   and a listening decision. core.js, catalog.js, offline.js and sections.js
   are mocked; audio-track.js is REAL — the tests pin the real song-id rule
   in _recordSongStart. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  state: /** @type {any} */ ({ status: 'playing', queue: [], qi: 0 }),
  g: /** @type {any} */ ({}),
  library: /** @type {any} */ (null),
  unreachable: false,
  secKey: /** @type {any} */ (null),
  sectionTable: /** @type {any} */ (null),
  creditSectionLetter: vi.fn(),
  secHeard: vi.fn(() => true),
}));

vi.mock('./catalog.js', () => ({
  _chapterOfTrack: (/** @type {any} */ t) => t.chapter || 1,
}));

vi.mock('./core.js', () => ({
  _g: () => h.g,
  _isBibleVol: (/** @type {string} */ v) => v.startsWith('bible-'),
  _isSong: (/** @type {any} */ t) => !!t && typeof t.key === 'string' && t.key.startsWith('song:'),
  _library: () => h.library,
  get _state() { return h.state; },
}));

vi.mock('./offline.js', () => ({ _unreachable: () => h.unreachable }));

vi.mock('./sections.js', () => ({
  _creditSectionLetter: h.creditSectionLetter,
  _secHeard: h.secHeard,
  get _secKey() { return h.secKey; },
  _sectionTableFor: () => h.sectionTable,
}));

/** @type {typeof import('./credit.js')} */
let C;

const letterTrack = { key: 'vol1:letter1', url: 'https://cdn.example/vol1.mp3', title: 'Letter 1' };
const bibleTrack = { key: 'bible-kjv:gen1', url: 'https://cdn.example/gen1.mp3', title: 'Genesis 1', chapter: 3 };
const songTrack = { key: 'song:abcdef123456', url: 'https://cdn.example/songs/abcdef123456.mp3', title: 'Song' };

function makeLibrary() {
  return {
    recordPlayed: vi.fn(),
    countPlay: vi.fn(),
    countCompletion: vi.fn(),
    recordSongPlayed: vi.fn(),
  };
}

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.clearAllMocks();
  C = await import('./credit.js');
  h.state = { status: 'playing', queue: [letterTrack], qi: 0 };
  h.g = { __votAudioListened: vi.fn() };
  h.library = makeLibrary();
  h.unreachable = false;
  h.secKey = null;
  h.sectionTable = null;
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('audio-player credit', () => {
  it('_notifyListened marks no reading for a finished song', () => {
    h.state.queue = [songTrack];
    C._notifyListened();
    expect(h.library.countCompletion).not.toHaveBeenCalled();
    expect(h.g.__votAudioListened).not.toHaveBeenCalled();
  });

  it('_notifyListened credits a compilation end through its last letter', () => {
    h.state.queue = [{ key: null, url: 'https://cdn.example/comp.mp3', title: 'Compilation' }];
    h.sectionTable = { rows: [] };
    h.secKey = 'sec-1';
    C._notifyListened();
    expect(h.creditSectionLetter).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Compilation' }), 'sec-1', h.secHeard,
    );
    expect(h.library.countCompletion).toHaveBeenCalledTimes(1);
    expect(h.g.__votAudioListened).not.toHaveBeenCalled();
  });

  it('_notifyListened credits a compilation end without a section key', () => {
    h.state.queue = [{ key: null, url: 'https://cdn.example/comp.mp3', title: 'Compilation' }];
    h.sectionTable = { rows: [] };
    h.secKey = null;
    C._notifyListened();
    expect(h.creditSectionLetter).not.toHaveBeenCalled();
    expect(h.library.countCompletion).toHaveBeenCalledTimes(1);
  });

  it('_notifyListened does nothing for a key-null track with no section table', () => {
    h.state.queue = [{ key: null, url: 'https://cdn.example/comp.mp3' }];
    h.sectionTable = null;
    C._notifyListened();
    expect(h.library.countCompletion).not.toHaveBeenCalled();
  });

  it('_notifyListened does nothing with no track or a key without a divider', () => {
    h.state.queue = [];
    C._notifyListened();
    h.state.queue = [{ key: 'vol1letter1', url: 'https://cdn.example/x.mp3' }];
    C._notifyListened();
    expect(h.library.countCompletion).not.toHaveBeenCalled();
    expect(h.g.__votAudioListened).not.toHaveBeenCalled();
  });

  it('_notifyListened waits for the last part of a letter', () => {
    h.state.queue = [letterTrack, { ...letterTrack }];
    C._notifyListened();
    expect(h.library.countCompletion).not.toHaveBeenCalled();
    expect(h.g.__votAudioListened).not.toHaveBeenCalled();
  });

  it('_notifyListened counts a finished letter and tells the bridge', () => {
    C._notifyListened();
    expect(h.library.countCompletion).toHaveBeenCalledTimes(1);
    expect(h.g.__votAudioListened).toHaveBeenCalledWith('vol1', 'letter1', 0);
  });

  it('_notifyListened counts a Bible chapter per track, even mid-book', () => {
    h.state.queue = [bibleTrack, { ...bibleTrack }];
    C._notifyListened();
    expect(h.library.countCompletion).toHaveBeenCalledTimes(1);
    expect(h.g.__votAudioListened).toHaveBeenCalledWith('bible-kjv', 'gen1', 3);
  });

  it('_notifyListened counts even when the bridge is not mounted', () => {
    h.g = {};
    C._notifyListened();
    expect(h.library.countCompletion).toHaveBeenCalledTimes(1);
  });

  it('_notifyListened swallows a throwing bridge', () => {
    h.g.__votAudioListened.mockImplementationOnce(() => { throw new Error('bridge down'); });
    expect(() => C._notifyListened()).not.toThrow();
    expect(h.library.countCompletion).toHaveBeenCalledTimes(1);
  });

  it('_countPlay does nothing without a library', () => {
    h.library = null;
    expect(() => C._countPlay()).not.toThrow();
  });

  it('_countPlay defers a song to its first real play', () => {
    h.state.queue = [songTrack];
    C._countPlay();
    expect(h.library.recordPlayed).not.toHaveBeenCalled();
    expect(h.library.countPlay).not.toHaveBeenCalled();
    C._recordSongStart();
    expect(h.library.recordSongPlayed).toHaveBeenCalledWith('abcdef123456');
  });

  it('_countPlay defers an unreachable letter to its first real play', () => {
    h.unreachable = true;
    C._countPlay();
    expect(h.library.recordPlayed).not.toHaveBeenCalled();
    expect(h.library.countPlay).not.toHaveBeenCalled();
    C._recordSongStart();
    expect(h.library.recordPlayed).toHaveBeenCalledWith(letterTrack);
    expect(h.library.countPlay).toHaveBeenCalledTimes(1);
  });

  it('_countPlay records a reachable letter at once', () => {
    C._countPlay();
    expect(h.library.recordPlayed).toHaveBeenCalledWith(letterTrack);
    expect(h.library.countPlay).toHaveBeenCalledTimes(1);
  });

  it('_countPlay isolates the shelf write from the play counter', () => {
    h.library.recordPlayed.mockImplementationOnce(() => { throw new Error('shelf down'); });
    expect(() => C._countPlay()).not.toThrow();
    expect(h.library.countPlay).toHaveBeenCalledTimes(1);
    h.library.countPlay.mockImplementationOnce(() => { throw new Error('counter down'); });
    expect(() => C._countPlay()).not.toThrow();
    expect(h.library.recordPlayed).toHaveBeenCalledTimes(2);
  });

  it('_recordSongStart records a pending song once', () => {
    h.state.queue = [songTrack];
    C._countPlay();
    C._recordSongStart();
    expect(h.library.recordSongPlayed).toHaveBeenCalledTimes(1);
    expect(h.library.recordSongPlayed).toHaveBeenCalledWith('abcdef123456');
    C._recordSongStart();
    expect(h.library.recordSongPlayed).toHaveBeenCalledTimes(1);
  });

  it('_recordSongStart does nothing when nothing is pending', () => {
    C._recordSongStart();
    expect(h.library.recordSongPlayed).not.toHaveBeenCalled();
    expect(h.library.recordPlayed).not.toHaveBeenCalled();
  });

  it('_recordSongStart skips a non-song under a song pending, and the flag survives', () => {
    h.state.queue = [songTrack];
    C._countPlay();
    h.state.queue = [letterTrack];
    C._recordSongStart();
    expect(h.library.recordSongPlayed).not.toHaveBeenCalled();
    h.state.queue = [songTrack];
    C._recordSongStart();
    expect(h.library.recordSongPlayed).toHaveBeenCalledWith('abcdef123456');
  });

  it('_setSongRecordPending arms both shelves, letter first then song', () => {
    C._setSongRecordPending(true);
    h.state.queue = [letterTrack];
    C._recordSongStart();
    expect(h.library.recordPlayed).toHaveBeenCalledWith(letterTrack);
    h.state.queue = [songTrack];
    C._recordSongStart();
    expect(h.library.recordSongPlayed).toHaveBeenCalledWith('abcdef123456');
  });
});
