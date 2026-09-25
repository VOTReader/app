// @ts-nocheck — drives a fake media element in jsdom
/* audio-player — Songs of the Letters on the one engine (2026-09-24).

   Songs ride the real singleton under `song:<id>` keys (README §6.3). Each test
   here fails on the lie it names: a finished song crediting a reading, a
   900-song shuffle bloating the boot snapshot, the reading speed warping a
   song (or not coming back), a restore that cannot rebuild the songs queue,
   repeat that does not replay or wrap, and a song URL outside the exact
   pattern playing. Same harness as audio-player.test.js: a FakeAudio element
   and a fresh module per test (vi.resetModules), with the catalog adopted
   into THAT module instance. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SONG_FIXTURE, bigSongCatalog } from './song-catalog.fixture.js';

class FakeAudio extends EventTarget {
  constructor() {
    super();
    FakeAudio.last = this;
    this._src = '';
    this.currentTime = 0;
    this.readyState = 0;
    this.duration = 0;
    this.paused = true;
    this.plays = 0;
    this.preload = '';
    this.error = null;
    this.defaultPlaybackRate = 1;
    this.playbackRate = 1;
  }
  get src() { return this._src; }
  set src(v) { this._src = v; this.currentTime = 0; this.readyState = 0; this.playbackRate = this.defaultPlaybackRate; }
  play() { this.plays++; this.paused = false; return Promise.resolve(); }
  pause() { if (!this.paused) { this.paused = true; this.dispatchEvent(new Event('pause')); } }
  load() {}
  removeAttribute(name) { if (name === 'src') this._src = ''; }
}

const LETTER_URL = (id) => 'https://github.com/VOTReader/votreader-assets/releases/download/audio-v1/' + id + '.mp3';
const SONG_URL = (sh, id) => 'https://votreader.github.io/songs-' + sh + '/' + id + '.mp3';

let AudioPlayer;
let Songs;
const el = () => FakeAudio.last;

/** A fresh player AND a fresh catalog module (the player's own instance). */
async function load(catalog = SONG_FIXTURE) {
  vi.resetModules();
  AudioPlayer = (await import('./audio-player.js')).AudioPlayer;
  Songs = await import('./song-catalog.js');
  if (catalog) Songs.adoptSongCatalog(catalog);
}

function ended() { el().dispatchEvent(new Event('ended')); }

/** A library bridge with a stored reading speed and spies on every counter. */
function library(rate = 1) {
  return {
    rate,
    getPlaybackRate() { return this.rate; },
    setPlaybackRate: vi.fn(function (r) { this.rate = r; return r; }),
    recordPlayed: vi.fn(),
    countPlay: vi.fn(),
    countCompletion: vi.fn(),
    recordSongPlayed: vi.fn(),
  };
}

const realFetch = globalThis.fetch;

beforeEach(async () => {
  // The boot rebuild asks the catalog loader, which is network-first: no test
  // may reach the real network, so the network is down and the catalog adopted
  // into the module instance stands.
  globalThis.fetch = vi.fn(() => Promise.reject(new TypeError('no network in tests')));
  FakeAudio.last = null;
  globalThis.Audio = FakeAudio;
  globalThis.AUDIO_MANIFEST = { 'vol1:letter-a': [['idA1', 'B']], 'vol1:letter-b': [['idB1', 'T']] };
  localStorage.removeItem('vot-audio-pos');
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => true });
  await load();
});

afterEach(() => {
  const arbiter = globalThis.__votAudioArbiter;
  if (typeof arbiter === 'function') document.removeEventListener('play', arbiter, true);
  for (const k of ['AUDIO_MANIFEST', 'AudioLibraryStore', 'AudioPositionsStore', '__votAudioListened', '__votAudioArbiter',
    'Audio', 'COLLECTIONS', 'COL_BY_KEY', 'colPreface', 'colLetterArr', 'MediaMetadata']) delete globalThis[k];
  delete window.navigator.mediaSession;
  delete window.AndroidBridge;
  globalThis.fetch = realFetch;
});

describe('playSongs — a songs queue on the one engine', () => {
  it('queues catalog songs as song: tracks and starts the first', () => {
    expect(AudioPlayer.playSongs({ filter: { family: 'fam-a' } })).toBe(true);
    const s = AudioPlayer.getState();
    expect(s.sourceMode).toBe('songs');
    expect(s.queue.map((t) => t.key)).toEqual(['song:aaaaaaaaaaa1', 'song:aaaaaaaaaaa2']);   // featured first, hidden twin out
    expect(s.queue[0]).toMatchObject({ title: 'Come, Love Awaits You', partLabel: 'Country · hmarie777', readerCode: '' });
    expect(el().src).toBe(SONG_URL(1, 'aaaaaaaaaaa1'));
  });

  it('refuses without a catalog, and when nothing matches', async () => {
    await load(null);
    expect(AudioPlayer.playSongs({ filter: {} })).toBe(false);
    await load();
    expect(AudioPlayer.playSongs({ filter: { col: 'nowhere' } })).toBe(false);
    expect(AudioPlayer.getState().status).toBe('idle');
  });

  it('a song URL outside the exact pattern never plays', () => {
    AudioPlayer.playTrack({ key: 'song:aaaaaaaaaaa1', title: 'x', url: 'https://votreader.github.io/songs-1/../app/aaaaaaaaaaa1.mp3' });
    AudioPlayer.playTrack({ key: 'song:aaaaaaaaaaa1', title: 'x', url: 'https://votreader.github.io/songs/aaaaaaaaaaa1.mp3' });
    AudioPlayer.playTrack({ key: 'song:aaaaaaaaaaa1', title: 'x', url: 'https://github.com/VOTReader/votreader-songs/releases/download/songs-v1/aaaaaaaaaaa1.mp3' });
    expect(AudioPlayer.getState().status).toBe('idle');
    expect(el()).toBe(null);   // the element was never even made
    // …while the exact pattern does play, rebuilt as its family from that version on.
    AudioPlayer.playTrack({ key: 'song:aaaaaaaaaaa2', title: 'x', url: SONG_URL(1, 'aaaaaaaaaaa2') });
    expect(AudioPlayer.getState().queue.map((t) => t.key)).toEqual(['song:aaaaaaaaaaa2']);
    expect(AudioPlayer.getState().sourceMode).toBe('songs');
  });

  it('a saved row of a hidden duplicate plays its kept twin; a taken-down song does not play', async () => {
    AudioPlayer.playTrack({ key: 'song:aaaaaaaaaaa3', title: 'x', url: SONG_URL(1, 'aaaaaaaaaaa3') });
    expect(AudioPlayer.getState().queue[0].key).toBe('song:aaaaaaaaaaa2');
    await load({ ...SONG_FIXTURE, songs: SONG_FIXTURE.songs.map((s) => (s.id === 'bbbbbbbbbbb1' ? { ...s, hid: true } : s)) });
    AudioPlayer.playTrack({ key: 'song:bbbbbbbbbbb1', title: 'x', url: SONG_URL(2, 'bbbbbbbbbbb1') });
    expect(AudioPlayer.getState().status).toBe('idle');
  });
});

describe('songs are gated out of reading credit and counters', () => {
  it('a finished song does NOT call __votAudioListened, nor count a completion', () => {
    const listened = vi.fn();
    const lib = library();
    globalThis.__votAudioListened = listened;
    globalThis.AudioLibraryStore = lib;
    AudioPlayer.playSongs({ filter: { family: 'fam-a' } });
    ended();                                       // first song ends → advances
    ended();                                       // last song ends → queue ends
    expect(listened).not.toHaveBeenCalled();
    expect(lib.countCompletion).not.toHaveBeenCalled();
    // The control: the same bridge IS called for a reading, so the silence above is the gate.
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    ended();
    expect(listened).toHaveBeenCalledWith('vol1', 'letter-a', 0);
    expect(lib.countCompletion).toHaveBeenCalledTimes(1);
  });

  it('a song URL filed under a LETTER key still earns no credit (the key follows the URL)', () => {
    const listened = vi.fn();
    const lib = library();
    globalThis.__votAudioListened = listened;
    globalThis.AudioLibraryStore = lib;
    AudioPlayer.playTrack({ key: 'vol1:letter-a', title: 'Not a letter', url: SONG_URL(2, 'bbbbbbbbbbb1') });
    expect(AudioPlayer.getState().queue[0].key).toBe('song:bbbbbbbbbbb1');
    ended();
    expect(listened).not.toHaveBeenCalled();
    expect(lib.countCompletion).not.toHaveBeenCalled();
  });

  it('a song goes on the songs shelf by id — never the recordings shelf or the lifetime play count', () => {
    const lib = library();
    globalThis.AudioLibraryStore = lib;
    AudioPlayer.playSongs({ filter: {}, startId: 'bbbbbbbbbbb1' });
    expect(lib.recordSongPlayed).toHaveBeenCalledWith('bbbbbbbbbbb1');
    expect(lib.recordPlayed).not.toHaveBeenCalled();
    expect(lib.countPlay).not.toHaveBeenCalled();
  });

  it('songs keep no resume point and consult none — they start at 0', () => {
    const positions = { getPosition: vi.fn(() => ({ t: 120, d: 200 })), setPosition: vi.fn(), clearPosition: vi.fn() };
    globalThis.AudioPositionsStore = positions;
    AudioPlayer.playSongs({ filter: { family: 'fam-a' } });
    el().readyState = 1;
    el().currentTime = 95;
    el().dispatchEvent(new Event('timeupdate'));   // 95 s in: a reading would be remembered here
    AudioPlayer.next();                            // …and at this boundary
    AudioPlayer.stop();                            // …and at the ✕
    expect(positions.setPosition).not.toHaveBeenCalled();
    expect(positions.getPosition).not.toHaveBeenCalled();
    expect(el().currentTime).toBe(0);
  });

  it('the reading speed never warps a song, and comes back on the next reading', () => {
    const lib = library(1.5);
    globalThis.AudioLibraryStore = lib;
    AudioPlayer.playSongs({ filter: { family: 'fam-a' } });
    expect(el().playbackRate).toBe(1);
    expect(AudioPlayer.getState().rate).toBe(1);
    // Changing the speed during a song stores the READING speed and leaves the song alone.
    AudioPlayer.setPlaybackRate(1.75);
    expect(lib.setPlaybackRate).toHaveBeenCalledWith(1.75);
    expect(el().playbackRate).toBe(1);
    AudioPlayer.next();                            // still a song
    expect(el().playbackRate).toBe(1);
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    expect(el().playbackRate).toBe(1.75);
    expect(AudioPlayer.getState().rate).toBe(1.75);
  });

  it('a songs queue never continues into letters, even with the site order present', () => {
    globalThis.COLLECTIONS = [{ volKey: 'vol1', cardId: 'v1' }];
    globalThis.COL_BY_KEY = new Map([['vol1', { volKey: 'vol1' }]]);
    globalThis.colPreface = () => null;
    globalThis.colLetterArr = () => [{ id: 'letter-a', title: 'Letter A' }, { id: 'letter-b', title: 'Letter B' }];
    AudioPlayer.playSongs({ filter: { family: 'fam-a' } });
    AudioPlayer.next();                            // the last song starts: a letter queue would extend here
    expect(AudioPlayer.getState().queue.every((t) => t.key.startsWith('song:'))).toBe(true);
    ended();
    expect(AudioPlayer.getState().status).toBe('idle');
    expect(el().src).not.toBe(LETTER_URL('idA1'));
  });
});

describe('the boot snapshot of a songs queue', () => {
  it('a 900-song shuffle serializes under 2 KB — a descriptor, never a queue', async () => {
    await load(bigSongCatalog(900));
    AudioPlayer.playSongs({ filter: {}, shuffle: true, seed: 12345, label: 'Shuffle all songs' });
    expect(AudioPlayer.getState().queue).toHaveLength(900);
    AudioPlayer.next();
    AudioPlayer.toggle();                          // pause → the snapshot is written
    const raw = localStorage.getItem('vot-audio-pos');
    expect(raw).toBeTruthy();
    expect(raw.length).toBeLessThan(2048);
    const snap = JSON.parse(raw);
    expect(snap).toMatchObject({ mode: 'songs', seed: 12345, shuffle: true, qi: 1 });
    expect(snap.customQueue).toBeUndefined();
  });

  it('an edited songs queue stays a small descriptor (ids), not a custom queue', async () => {
    await load(bigSongCatalog(900));
    AudioPlayer.playSongs({ filter: {}, shuffle: true, seed: 5 });
    expect(AudioPlayer.removeUpcoming(3)).toBe(true);
    AudioPlayer.toggle();
    const raw = localStorage.getItem('vot-audio-pos');
    expect(raw.length).toBeLessThan(2048);
    const snap = JSON.parse(raw);
    expect(snap.mode).toBe('songs');
    expect(snap.customQueue).toBeUndefined();
    expect(snap.ids).toHaveLength(50);              // the window from the playing song forward
    expect(snap.ids[0]).toBe(AudioPlayer.getState().queue[0].key.slice(5));
  });

  it('a restore rebuilds the songs queue from the descriptor, at the saved song', async () => {
    await load(bigSongCatalog(120));
    AudioPlayer.playSongs({ filter: {}, shuffle: true, seed: 777 });
    const original = AudioPlayer.getState().queue.map((t) => t.url);
    AudioPlayer.next(); AudioPlayer.next(); AudioPlayer.next();
    AudioPlayer.setRepeat('all');
    AudioPlayer.toggle();                          // paused at the 4th song; snapshot written

    await load(bigSongCatalog(120));               // a new session: fresh player, catalog available
    const restored = AudioPlayer.getState();
    expect(restored.restoring).toBe(true);
    expect(restored.queue).toHaveLength(1);        // the placeholder bar
    expect(restored.shuffle).toBe(true);
    expect(restored.repeat).toBe('all');
    AudioPlayer.toggle();                          // the first tap rebuilds
    await vi.waitFor(() => expect(AudioPlayer.getState().sourceMode).toBe('songs'));
    const s = AudioPlayer.getState();
    expect(s.restoring).toBe(false);
    expect(s.sourceMode).toBe('songs');
    expect(s.queue.map((t) => t.url)).toEqual(original);
    expect(s.qi).toBe(3);
    expect(el().src).toBe(original[3]);
    expect(s.repeat).toBe('all');
  });

  it('a restored songs bar still plays at 1× over a stored 1.5 reading speed', async () => {
    AudioPlayer.playSongs({ filter: { family: 'fam-a' } });
    AudioPlayer.toggle();
    globalThis.AudioLibraryStore = library(1.5);
    await load();
    expect(AudioPlayer.getState().rate).toBe(1);
  });
});

describe('repeat and shuffle', () => {
  it("repeat 'one' replays the song that ended", () => {
    AudioPlayer.playSongs({ filter: { family: 'fam-a' } });
    expect(AudioPlayer.setRepeat('one')).toBe('one');
    const plays = el().plays;
    el().currentTime = 180;
    ended();
    const s = AudioPlayer.getState();
    expect(s.qi).toBe(0);
    expect(s.queue[0].key).toBe('song:aaaaaaaaaaa1');
    expect(el().plays).toBe(plays + 1);
    expect(el().currentTime).toBe(0);
    // A tap on next still moves on: repeat-one governs the song's END only.
    AudioPlayer.next();
    expect(AudioPlayer.getState().qi).toBe(1);
  });

  it("repeat 'all' wraps at the end of the queue; 'off' ends it", () => {
    AudioPlayer.playSongs({ filter: { family: 'fam-a' } });
    AudioPlayer.setRepeat('all');
    AudioPlayer.next();
    ended();                                       // the last song ends
    expect(AudioPlayer.getState().qi).toBe(0);
    expect(AudioPlayer.getState().status).not.toBe('idle');
    expect(el().src).toBe(SONG_URL(1, 'aaaaaaaaaaa1'));
    AudioPlayer.setRepeat('off');
    AudioPlayer.next();
    ended();
    expect(AudioPlayer.getState().status).toBe('idle');
  });

  it('a reading never inherits repeat: a letter after a repeating song plays through', () => {
    const listened = vi.fn();
    globalThis.__votAudioListened = listened;
    AudioPlayer.playSongs({ filter: { family: 'fam-a' } });
    AudioPlayer.setRepeat('one');
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    expect(AudioPlayer.getState().repeat).toBe('off');
    ended();
    expect(AudioPlayer.getState().status).toBe('idle');   // a lone letter ended; nothing looped
  });

  it('shuffle on keeps the playing song and shuffles the rest; off returns to catalog order', async () => {
    await load(bigSongCatalog(40));
    AudioPlayer.playSongs({ filter: {} });
    AudioPlayer.next(); AudioPlayer.next();
    const playing = AudioPlayer.getState().queue[2];
    const srcBefore = el().src;
    expect(AudioPlayer.setShuffle(true)).toBe(true);
    let s = AudioPlayer.getState();
    expect(s.shuffle).toBe(true);
    expect(s.queue[0]).toEqual(playing);
    expect(s.qi).toBe(0);
    expect(s.queue).toHaveLength(40);
    expect(el().src).toBe(srcBefore);              // the song never stopped
    expect(AudioPlayer.setShuffle(false)).toBe(true);
    s = AudioPlayer.getState();
    expect(s.shuffle).toBe(false);
    // Off is catalog order turned to begin at the playing song: ALL 40 still there (sweep n3-01: it cut to the
    // songs after the playing one's catalog place, about half on average).
    expect(s.queue).toHaveLength(40);
    const catalog = Songs.songQueue({ filter: {} }).map((x) => 'song:' + x.id);
    const at = catalog.indexOf(playing.key);
    expect(s.queue.map((t) => t.key)).toEqual(catalog.slice(at).concat(catalog.slice(0, at)));
    // Not a songs queue: shuffle does nothing.
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    expect(AudioPlayer.setShuffle(true)).toBe(false);
    expect(AudioPlayer.getState().shuffle).toBe(false);
  });

  it('shuffle reorders and never drops: every version on a song page stays in the queue', () => {
    AudioPlayer.playSongs({ filter: { family: 'fam-a' } });   // a1, a2
    expect(AudioPlayer.setShuffle(true)).toBe(true);
    const keys = AudioPlayer.getState().queue.map((t) => t.key);
    expect(keys[0]).toBe('song:aaaaaaaaaaa1');
    expect(keys.slice().sort()).toEqual(['song:aaaaaaaaaaa1', 'song:aaaaaaaaaaa2']);
  });

  it('"Shuffle all songs" is one version per family, and stays so when shuffle is turned off', () => {
    AudioPlayer.playSongs({ filter: {}, shuffle: true, seed: 11 });
    let s = AudioPlayer.getState();
    expect(s.queue).toHaveLength(3);                          // fam-a, fam-b, fam-c: one take each
    expect(new Set(s.queue.map((t) => Songs.songById(t.key.slice(5)).f)).size).toBe(3);
    const playing = s.queue[0];
    expect(AudioPlayer.setShuffle(false)).toBe(true);
    s = AudioPlayer.getState();
    expect(s.shuffle).toBe(false);
    expect(s.queue[0]).toEqual(playing);
    expect(s.queue.every((t, i, q) => q.findIndex((u) => Songs.songById(u.key.slice(5)).f === Songs.songById(t.key.slice(5)).f) === i)).toBe(true);
    AudioPlayer.toggle();                                     // the snapshot carries the rule
    expect(JSON.parse(localStorage.getItem('vot-audio-pos'))).toMatchObject({ mode: 'songs', one: true });
  });
});

describe('songs - the sweep n3 paths', () => {
  it('shuffle on then off, from a song late in the catalog, keeps every song (n3-01)', async () => {
    await load(bigSongCatalog(30));
    AudioPlayer.playSongs({ filter: {}, shuffle: true, seed: 5 });
    for (let i = 0; i < 7; i++) AudioPlayer.next();
    expect(AudioPlayer.setShuffle(false)).toBe(true);
    let s = AudioPlayer.getState();
    expect(s.queue).toHaveLength(30);
    expect(new Set(s.queue.map((t) => t.key)).size).toBe(30);
    // and the rebuild after a restart agrees (the descriptor carries the rule)
    AudioPlayer.toggle();
    const saved = JSON.parse(localStorage.getItem('vot-audio-pos'));
    expect(saved).toMatchObject({ mode: 'songs', wrap: true });
    const order = s.queue.map((t) => t.key);
    await load(bigSongCatalog(30));
    AudioPlayer.toggle();
    await vi.waitFor(() => expect(AudioPlayer.getState().queue.length).toBe(30));
    s = AudioPlayer.getState();
    expect(s.queue.map((t) => t.key)).toEqual(order);
  });

  it('a version switch plays the other take in its place: queue, place, label, shuffle kept (n3-02)', () => {
    AudioPlayer.playSongs({ filter: {}, shuffle: true, seed: 3, label: 'My mix' });
    let s = AudioPlayer.getState();
    const famA = s.queue.findIndex((t) => Songs.songById(t.key.slice(5)).f === 'fam-a');
    while (AudioPlayer.getState().qi < famA) AudioPlayer.next();
    const before = AudioPlayer.getState();
    const other = before.queue[before.qi].key === 'song:aaaaaaaaaaa1' ? 'aaaaaaaaaaa2' : 'aaaaaaaaaaa1';
    expect(AudioPlayer.switchSongVersion(other)).toBe(true);
    s = AudioPlayer.getState();
    expect(s.queue).toHaveLength(before.queue.length);
    expect(s.qi).toBe(before.qi);
    expect(s.queue[s.qi].key).toBe('song:' + other);
    expect(s.queue.filter((_t, i) => i !== s.qi)).toEqual(before.queue.filter((_t, i) => i !== before.qi));
    expect(s.shuffle).toBe(true);
    expect(el().src).toBe(SONG_URL(1, other));
    // A restart replays the switch: the rebuild puts the chosen take in the same place.
    AudioPlayer.toggle();
    const saved = JSON.parse(localStorage.getItem('vot-audio-pos'));
    expect(saved).toMatchObject({ mode: 'songs', label: 'My mix', shuffle: true, key: 'song:' + other });
    expect(Object.values(saved.swaps)).toEqual([other]);
    // Not another version of the same song, or nothing songs playing: refused.
    expect(AudioPlayer.switchSongVersion('bbbbbbbbbbb1')).toBe(false);
    expect(AudioPlayer.switchSongVersion('not-an-id')).toBe(false);
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    expect(AudioPlayer.switchSongVersion(other)).toBe(false);
  });

  it('switching back to the catalog take forgets the swap; an explicit list swaps the id', () => {
    AudioPlayer.playSongs({ filter: { family: 'fam-c' }, onePerFamily: true });   // c2 featured
    expect(AudioPlayer.getState().queue[0].key).toBe('song:ccccccccccc2');
    expect(AudioPlayer.switchSongVersion('ccccccccccc1')).toBe(true);
    expect(AudioPlayer.switchSongVersion('ccccccccccc2')).toBe(true);
    AudioPlayer.toggle();
    expect(JSON.parse(localStorage.getItem('vot-audio-pos')).swaps).toBeUndefined();
    AudioPlayer.playSongs({ ids: ['aaaaaaaaaaa1', 'bbbbbbbbbbb1'], label: 'Two' });
    expect(AudioPlayer.switchSongVersion('aaaaaaaaaaa2')).toBe(true);
    const s = AudioPlayer.getState();
    expect(s.queue.map((t) => t.key)).toEqual(['song:aaaaaaaaaaa2', 'song:bbbbbbbbbbb1']);
    AudioPlayer.toggle();
    expect(JSON.parse(localStorage.getItem('vot-audio-pos')).ids).toEqual(['aaaaaaaaaaa2', 'bbbbbbbbbbb1']);
  });

  it('a song that will not load is passed over; three in a row pause; one that plays resets the count (n3-03)', async () => {
    await load(bigSongCatalog(10));
    AudioPlayer.playSongs({ filter: {} });
    el().dispatchEvent(new Event('error'));            // loading, nothing heard: passed over
    expect(AudioPlayer.getState().qi).toBe(1);
    expect(AudioPlayer.getState().status).toBe('loading');
    el().dispatchEvent(new Event('playing'));          // it played: the count starts again
    AudioPlayer.next();
    expect(AudioPlayer.getState().qi).toBe(2);
    el().dispatchEvent(new Event('error'));
    el().dispatchEvent(new Event('error'));
    el().dispatchEvent(new Event('error'));
    expect(AudioPlayer.getState().qi).toBe(5);          // three passed over
    el().dispatchEvent(new Event('error'));            // the fourth in a row: the network, not the song
    expect(AudioPlayer.getState().status).toBe('paused');
    expect(AudioPlayer.getState().qi).toBe(5);
  });

  it('a drop partway through a song pauses at its place; the last song failing pauses too (s2r S1 S2)', async () => {
    await load(bigSongCatalog(4));
    AudioPlayer.playSongs({ filter: {} });
    el().dispatchEvent(new Event('playing'));
    el().currentTime = 95;
    el().dispatchEvent(new Event('timeupdate'));
    el().dispatchEvent(new Event('error'));            // a tunnel, online: not the file
    expect(AudioPlayer.getState().qi).toBe(0);
    expect(AudioPlayer.getState().status).toBe('paused');
    AudioPlayer.playSongs({ filter: {}, startId: Songs.songQueue({ filter: {} })[3].id });
    expect(AudioPlayer.getState().queue).toHaveLength(1);
    el().dispatchEvent(new Event('error'));            // the last (only) song: nothing to skip to
    expect(AudioPlayer.getState().status).toBe('paused');
    expect(AudioPlayer.getState().queue).toHaveLength(1);   // the bar stays, Play tries again
  });

  it('a song page queue (every take): switching takes keeps one copy, and a restart rebuilds it exactly (s2r M1 M2)', async () => {
    AudioPlayer.playSongs({ filter: { family: 'fam-a' }, startId: 'aaaaaaaaaaa1', label: 'Come' });
    expect(AudioPlayer.getState().queue.map((t) => t.key)).toEqual(['song:aaaaaaaaaaa1', 'song:aaaaaaaaaaa2']);
    AudioPlayer.switchSongVersion('aaaaaaaaaaa2');
    expect(AudioPlayer.getState().queue.map((t) => t.key)).toEqual(['song:aaaaaaaaaaa2']);
    AudioPlayer.playSongs({ filter: { family: 'fam-a' }, startId: 'aaaaaaaaaaa1', label: 'Come' });
    AudioPlayer.next();
    expect(AudioPlayer.switchSongVersion('aaaaaaaaaaa1')).toBe(true);
    const live = AudioPlayer.getState();
    expect(live.queue.map((t) => t.key)).toEqual(['song:aaaaaaaaaaa1']);
    AudioPlayer.toggle();
    await load();
    AudioPlayer.toggle();
    await vi.waitFor(() => expect(AudioPlayer.getState().status).not.toBe('idle'));
    await vi.waitFor(() => expect(AudioPlayer.getState().queue.map((t) => t.key)).toEqual(live.queue.map((t) => t.key)));
    expect(AudioPlayer.getState().qi).toBe(live.qi);
  });

  it('offline, a failed song pauses with the offline notice instead of walking the queue', () => {
    AudioPlayer.playSongs({ filter: {} });
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    el().dispatchEvent(new Event('error'));
    expect(AudioPlayer.getState().qi).toBe(0);
    expect(AudioPlayer.getState().status).toBe('paused');
  });
});

describe('songs kept on this phone (K1)', () => {
  /** Mark songs kept on the web: the offline-songs store holds them, song-keep reads them. */
  async function keptOnWeb(ids) {
    globalThis.OfflineSongsStore = {
      all: async () => ids.map((id) => ({ id, blob: new Blob([new Uint8Array(4)]), bytes: 4, sha256: '', keptAt: 1 })),
      get: async () => null, put: async () => {}, delete: async () => {},
    };
    if (!globalThis.indexedDB) globalThis.indexedDB = {};
    await load();
    const { SongKeep } = await import('./song-keep.js');
    await SongKeep.ready();
    return SongKeep;
  }
  let made;
  beforeEach(() => {
    made = [];
    URL.createObjectURL = vi.fn(() => { const u = 'blob:kept-' + made.length; made.push(u); return u; });
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => { delete globalThis.OfflineSongsStore; vi.useRealTimers(); });

  it('a kept song plays from its stored bytes (an object URL), online too; the next song streams', async () => {
    await keptOnWeb(['aaaaaaaaaaa1']);
    AudioPlayer.playSongs({ filter: { family: 'fam-a' } });
    expect(el().src).toBe('blob:kept-0');
    AudioPlayer.next();
    expect(el().src).toBe(SONG_URL(1, 'aaaaaaaaaaa2'));
    expect(made).toHaveLength(1);
  });

  it('offline, a kept song plays; one not kept says so on the bar, then the next kept song plays', async () => {
    vi.useFakeTimers();
    await keptOnWeb(['aaaaaaaaaaa2']);
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    expect(AudioPlayer.playSongs({ filter: { family: 'fam-a' } })).toBe(true);   // a1 is not kept, a2 is
    expect(AudioPlayer.getState().qi).toBe(0);
    expect(AudioPlayer.getState().status).toBe('paused');   // the bar: "Not on this phone"
    vi.advanceTimersByTime(3000);
    expect(AudioPlayer.getState().qi).toBe(1);
    expect(el().src).toBe('blob:kept-0');
    expect(AudioPlayer.getState().status).toBe('loading');
  });

  it('offline with nothing kept, a songs queue is refused with the offline notice', async () => {
    await keptOnWeb([]);
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    expect(AudioPlayer.playSongs({ filter: { family: 'fam-a' } })).toBe(false);
    expect(AudioPlayer.getState().status).toBe('idle');
  });

  it('a stop before the skip lands cancels it', async () => {
    vi.useFakeTimers();
    await keptOnWeb(['aaaaaaaaaaa2']);
    Object.defineProperty(window.navigator, 'onLine', { configurable: true, get: () => false });
    AudioPlayer.playSongs({ filter: { family: 'fam-a' } });
    AudioPlayer.stop();
    vi.advanceTimersByTime(5000);
    expect(AudioPlayer.getState().status).toBe('idle');
  });
});

describe('the media card for a song', () => {
  it('artist names the shelf and the version; the web card carries the cover', () => {
    const session = { setActionHandler() {}, setPositionState() {}, metadata: null, playbackState: 'none' };
    Object.defineProperty(window.navigator, 'mediaSession', { configurable: true, value: session });
    globalThis.MediaMetadata = class { constructor(o) { Object.assign(this, o); } };
    const bridge = { setAudioActive: vi.fn(), setAudioNowPlaying: vi.fn() };
    window.AndroidBridge = bridge;
    AudioPlayer.playSongs({ filter: { family: 'fam-a' } });
    expect(session.metadata).toMatchObject({
      title: 'Come, Love Awaits You',
      artist: 'Songs of the Letters · Country · hmarie777',
      artwork: [{ src: 'https://votreader.github.io/songs/thumbs/512/aaaaaaaaaaa1.webp', sizes: '512x512', type: 'image/webp' }],
    });
    const last = bridge.setAudioNowPlaying.mock.calls.at(-1);
    expect(last[0]).toBe('Come, Love Awaits You');
    expect(last[1]).toBe('Songs of the Letters · Country · hmarie777');
    // A reading's card carries no artwork.
    AudioPlayer.playLetter({ volKey: 'vol1', letter: { id: 'letter-a', title: 'Letter A' } });
    expect(session.metadata.artwork).toBeUndefined();
  });
});
