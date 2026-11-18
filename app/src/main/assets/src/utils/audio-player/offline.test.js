/* audio-player/offline — no signal: what can play offline, and what the
   player says when nothing can. core.js, toast.js, offline-audio.js,
   song-keep.js, catalog.js and net-status.js are mocked; audio-track.js is
   REAL — the tests pin the real song-id rule in _songKept. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  el: /** @type {any} */ (null),
  native: false,
  offline: false,
  netOffline: false,
  saved: /** @type {Set<string>} */ (new Set()),
  keptIds: /** @type {Set<string>} */ (new Set()),
  objectUrlFor: /** @type {any} */ ({}),
  sameRecording: false,
  renditions: /** @type {any[]} */ ([]),
  toast: vi.fn(),
  showToast: vi.fn((/** @type {any} */ opts) => {
    const div = document.createElement('div');
    div.id = opts.id;
    div.innerHTML = opts.html || '';
    document.body.appendChild(div);
  }),
  hideToast: vi.fn((/** @type {string} */ id) => {
    const el = document.getElementById(id);
    if (el) el.remove();
  }),
}));

vi.mock('../toast.js', () => ({ showToast: h.showToast, hideToast: h.hideToast }));

vi.mock('../offline-audio.js', () => ({
  OfflineAudio: {
    isSaved: (/** @type {string} */ url) => h.saved.has(url),
    webSrc: (/** @type {string} */ url) => 'web:' + url,
    webSameRecording: () => h.sameRecording,
  },
}));

vi.mock('../song-keep.js', () => ({
  SongKeep: {
    isKept: (/** @type {string} */ id) => h.keptIds.has(id),
    objectUrlFor: (/** @type {string} */ id) => h.objectUrlFor[id] || null,
  },
}));

vi.mock('./catalog.js', () => ({
  bibleChapterOfTrack: (/** @type {any} */ t) => t.chapter || 1,
  renditionsFor: vi.fn(() => h.renditions),
  _volKeyOf: (/** @type {string} */ key) => (key.includes(':') ? key.split(':')[0] : ''),
}));

vi.mock('../net-status.js', () => ({ NetStatus: { isOffline: () => h.netOffline } }));

vi.mock('./core.js', () => ({
  _isSong: (/** @type {any} */ t) => !!t && typeof t.key === 'string' && t.key.startsWith('song:'),
  get _native() { return h.native; },
  get _el() { return h.el; },
  _offline: () => h.offline,
  OFFLINE_MSG: 'OFFLINE',
  _toast: h.toast,
}));

/** @type {typeof import('./offline.js')} */
let O;

const letterTrack = {
  key: 'vol1:letter1', url: 'https://cdn.example/vol1/letter1.mp3', title: 'Letter 1', sub: 'subA', readerCode: '', partLabel: '',
};
const songTrack = {
  key: 'song:abcdef123456', url: 'https://cdn.example/songs/abcdef123456.mp3', title: 'Song', sub: '', readerCode: '', partLabel: '',
};
const savedUrl = 'https://cdn.example/vol1/saved.mp3';

beforeEach(async () => {
  vi.useFakeTimers();
  vi.resetModules();
  vi.clearAllMocks();
  O = await import('./offline.js');
  h.el = null;
  h.native = false;
  h.offline = false;
  h.netOffline = false;
  h.saved = new Set();
  h.keptIds = new Set();
  h.objectUrlFor = {};
  h.sameRecording = false;
  h.renditions = [];
  document.body.innerHTML = '';
  const w = /** @type {any} */ (window);
  delete w.__openSongs;
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
  const w = /** @type {any} */ (window);
  delete w.__openSongs;
});

describe('audio-player offline', () => {
  it('_unreachable is false online, whatever the track', () => {
    expect(O._unreachable(null)).toBe(false);
    expect(O._unreachable(letterTrack)).toBe(false);
  });

  it('_unreachable is false offline when the recording is saved', () => {
    h.offline = true;
    h.saved.add(letterTrack.url);
    expect(O._unreachable(letterTrack)).toBe(false);
  });

  it('_unreachable is false offline for a kept song', () => {
    h.offline = true;
    h.keptIds.add('abcdef123456');
    expect(O._unreachable(songTrack)).toBe(false);
  });

  it('_unreachable is true offline with nothing on the phone', () => {
    h.offline = true;
    expect(O._unreachable(letterTrack)).toBe(true);
    expect(O._unreachable(null)).toBe(true);
    expect(O._unreachable(/** @type {any} */ ({ key: 'vol1:x' }))).toBe(true);
  });

  it('_songKept needs a song that is kept', () => {
    h.keptIds.add('abcdef123456');
    expect(O._songKept(songTrack)).toBe(true);
    expect(O._songKept(letterTrack)).toBe(false);
    expect(O._songKept(null)).toBe(false);
    h.keptIds.clear();
    expect(O._songKept(songTrack)).toBe(false);
  });

  it('_srcFor hands native the track url outright', () => {
    h.native = true;
    expect(O._srcFor(songTrack)).toBe(songTrack.url);
    expect(O._srcFor(letterTrack)).toBe(letterTrack.url);
  });

  it('_srcFor answers a reading from the saved copy, or the stream', () => {
    h.el = { src: 'https://cdn.example/current.mp3', error: null };
    expect(O._srcFor(letterTrack)).toBe('web:' + letterTrack.url);
    h.el = null;
    expect(O._srcFor(letterTrack)).toBe('web:' + letterTrack.url);
  });

  it('_srcFor answers a kept song from its object URL, else its own URL', () => {
    h.objectUrlFor = { abcdef123456: 'blob:kept-song' };
    expect(O._srcFor(songTrack)).toBe('blob:kept-song');
    h.objectUrlFor = {};
    expect(O._srcFor(songTrack)).toBe(songTrack.url);
  });

  it('_holdsOtherForm needs a live unfailed element holding the other form', () => {
    h.sameRecording = true;
    h.el = { src: 'https://cdn.example/other.mp3', error: null };
    expect(O._holdsOtherForm(letterTrack)).toBe(true);
    h.el = { src: 'https://cdn.example/other.mp3', error: 'boom' };
    expect(O._holdsOtherForm(letterTrack)).toBe(false);
    h.el = null;
    expect(O._holdsOtherForm(letterTrack)).toBe(false);
    h.native = true;
    h.el = { src: 'https://cdn.example/other.mp3', error: null };
    expect(O._holdsOtherForm(letterTrack)).toBe(false);
  });

  it('_offlineRefuses is false online', () => {
    expect(O._offlineRefuses([{ url: letterTrack.url }])).toBe(false);
  });

  it('_offlineRefuses is false offline when one track is reachable', () => {
    h.offline = true;
    h.saved.add(letterTrack.url);
    expect(O._offlineRefuses([{ url: letterTrack.url }, { url: 'https://cdn.example/other.mp3' }])).toBe(false);
  });

  it('_offlineRefuses is true offline when nothing is on the phone', () => {
    h.offline = true;
    expect(O._offlineRefuses([{ url: letterTrack.url }, { url: 'https://cdn.example/other.mp3' }])).toBe(true);
  });

  it('_offlineRefuses is false offline when a downloaded reading saves the queue', () => {
    h.offline = true;
    h.saved.add(savedUrl);
    h.renditions = [{ tracks: [{ key: 'vol1:letter1', url: savedUrl }] }];
    expect(O._offlineRefuses([letterTrack])).toBe(false);
  });

  it('_downloadedReading returns null without a volume key', () => {
    expect(O._downloadedReading(/** @type {any} */ ({ key: 'plainkey', url: letterTrack.url }))).toBeNull();
    expect(O._downloadedReading(null)).toBeNull();
  });

  it('_downloadedReading returns the reading that is fully on the phone', async () => {
    const renditions = await import('./catalog.js');
    h.offline = true;
    h.saved.add(savedUrl);
    const good = { tracks: [{ key: 'vol1:letter1', url: savedUrl }] };
    const bad = { tracks: [{ key: 'vol1:letter1', url: 'https://cdn.example/unsaved.mp3' }] };
    h.renditions = [bad, good];
    expect(O._downloadedReading(letterTrack)).toBe(good);
    expect(renditions.renditionsFor).toHaveBeenCalledWith(
      'vol1', { id: 'letter1', title: 'Letter 1' }, 'subA',
    );
  });

  it('_downloadedReading returns null when no reading is fully on the phone', () => {
    h.offline = true;
    h.renditions = [{ tracks: [{ key: 'vol1:letter1', url: 'https://cdn.example/unsaved.mp3' }] }];
    expect(O._downloadedReading(letterTrack)).toBeNull();
  });

  it('playableNow is true online without asking the catalog', async () => {
    const catalog = await import('./catalog.js');
    expect(O.playableNow('vol1', 'letter1')).toBe(true);
    expect(catalog.renditionsFor).not.toHaveBeenCalled();
  });

  it('playableNow offline needs a saved or kept recording', () => {
    h.netOffline = true;
    h.renditions = [{ tracks: [{ key: 'vol1:letter1', url: savedUrl }] }];
    expect(O.playableNow('vol1', 'letter1')).toBe(false);
    h.saved.add(savedUrl);
    expect(O.playableNow('vol1', 'letter1')).toBe(true);
  });

  it('playableNow with a chapter asks only for that chapter', () => {
    h.netOffline = true;
    const ch1 = { key: 'bible-kjv:gen1', url: 'https://cdn.example/gen1.mp3', chapter: 1 };
    const ch2 = { key: 'bible-kjv:gen2', url: 'https://cdn.example/gen2.mp3', chapter: 2 };
    h.renditions = [{ tracks: [ch1, ch2] }];
    h.saved.add(ch2.url);
    expect(O.playableNow('bible-kjv', 'gen', 2)).toBe(true);
    expect(O.playableNow('bible-kjv', 'gen', 1)).toBe(false);
  });

  it('_offlineNotice keeps the readings notice for a reading', () => {
    O._offlineNotice(letterTrack);
    expect(h.toast).toHaveBeenCalledWith('OFFLINE');
    expect(h.showToast).not.toHaveBeenCalled();
  });

  it('_offlineNotice raises the kept-songs toast for a song and wires its button', () => {
    const openSongs = vi.fn();
    /** @type {any} */ (window).__openSongs = openSongs;
    O._offlineNotice(songTrack);
    expect(h.showToast).toHaveBeenCalledWith(expect.objectContaining({
      id: 'vot-toast-song-offline', durationMs: 6000,
    }));
    const btn = document.querySelector('#vot-toast-song-offline button');
    expect(btn).not.toBeNull();
    /** @type {any} */ (btn).click();
    expect(h.hideToast).toHaveBeenCalledWith('vot-toast-song-offline');
    expect(openSongs).toHaveBeenCalledWith([{ k: 'list', v: 'kept' }], '');
  });

  it('_offlineNotice button click without __openSongs still hides the toast', () => {
    O._offlineNotice(songTrack);
    const btn = document.querySelector('#vot-toast-song-offline button');
    expect(() => /** @type {any} */ (btn).click()).not.toThrow();
    expect(h.hideToast).toHaveBeenCalledWith('vot-toast-song-offline');
  });

  it('SONG_OFFLINE_TOAST_ID is the toast the notice raises', () => {
    expect(O.SONG_OFFLINE_TOAST_ID).toBe('vot-toast-song-offline');
  });
});
