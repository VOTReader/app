// @ts-nocheck
/* song-votes — this device's 👍/👎, the outbox, and the tallies (sy4-3, DECISIONS 10-22 23:0x).
   👎 never leaves the device; a 👍 or its clearing goes to the outbox and is resent until the Worker takes it. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  SONG_VOTE_URL, SONG_TALLY_URL, SONG_VOTE_KEYS,
  loadSongVotes, voteOf, setSongVote, tapSongVote, voteToSend, downVotedIds, downNoteSeen, markDownNoteSeen,
  flushSongVotes, pendingSongVotes, postSongVote, normalizeSongTally, loadSongTally, popularSongIds, lovedSongIds,
  voteTraits, SongVotes, _resetSongVotesForTests,
} from './song-votes.js';

const A = 'aaaaaaaaaaaa';
const B = 'bbbbbbbbbbbb';
const C = 'cccccccccccc';

/** A meta store in memory, IDBAdapter's get/put shape. */
function fakeIdb(seed = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data,
    get: vi.fn(async (store, key) => (store === 'meta' ? data.get(key) : undefined)),
    put: vi.fn(async (store, key, value) => { if (store === 'meta') data.set(key, JSON.parse(JSON.stringify(value))); }),
  };
}

/** fetch answering the vote URL with `status` (or throwing when status is 'net'). */
function fakeFetch(status) {
  return vi.fn(async (url, init) => {
    if (status === 'net') throw new TypeError('Failed to fetch');
    return { status, ok: status >= 200 && status < 300, text: async () => '', url, init };
  });
}

const settle = () => new Promise((r) => setTimeout(r, 0));

let idb;
beforeEach(() => {
  _resetSongVotesForTests();
  idb = fakeIdb();
  globalThis.IDBAdapter = idb;
  globalThis.fetch = fakeFetch(204);
});
afterEach(() => {
  _resetSongVotesForTests();
  delete globalThis.IDBAdapter;
  delete globalThis.fetch;
  delete window.AndroidBridge;
});

describe('what a change of vote sends (👎 never leaves the device)', () => {
  it('sends 1 for a 👍, 0 when a 👍 is cleared or turned into 👎, nothing else', () => {
    expect(voteToSend(0, 1)).toBe(1);
    expect(voteToSend(-1, 1)).toBe(1);
    expect(voteToSend(1, 0)).toBe(0);
    expect(voteToSend(1, -1)).toBe(0);
    expect(voteToSend(0, -1)).toBe(null);
    expect(voteToSend(-1, 0)).toBe(null);
    expect(voteToSend(1, 1)).toBe(null);
  });

  it('a 👎 on a song with no vote puts nothing in the outbox and makes no request', async () => {
    await loadSongVotes();
    globalThis.fetch.mockClear();
    setSongVote(A, -1);
    await settle();
    expect(voteOf(A)).toBe(-1);
    expect(pendingSongVotes()).toEqual([]);
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(downVotedIds()).toEqual([A]);
  });
});

describe('the pair: one vote, changeable, the lit one clears', () => {
  it('tapping 👍 likes, tapping it again clears, 👎 replaces 👍', async () => {
    await loadSongVotes();
    expect(tapSongVote(A, 1)).toBe(1);
    expect(tapSongVote(A, 1)).toBe(0);
    expect(tapSongVote(A, 1)).toBe(1);
    expect(tapSongVote(A, -1)).toBe(-1);
    expect(voteOf(A)).toBe(-1);
    expect(tapSongVote(A, -1)).toBe(0);
  });

  it('votes are per version: another id is untouched', async () => {
    await loadSongVotes();
    tapSongVote(A, 1);
    expect(voteOf(B)).toBe(0);
  });

  it('refuses a non-song id and a value outside 1 / -1 / 0', () => {
    expect(setSongVote('nope', 1)).toBe(0);
    expect(setSongVote(A, 2)).toBe(0);
    expect(voteOf(A)).toBe(0);
  });

  it('saves the votes on the device and reads them back on the next launch', async () => {
    await loadSongVotes();
    setSongVote(A, 1, 1000);
    setSongVote(B, -1, 2000);
    await settle();
    const saved = idb.data.get(SONG_VOTE_KEYS.votes);
    expect(saved).toEqual({ [A]: { v: 1, at: 1000 }, [B]: { v: -1, at: 2000 } });
    _resetSongVotesForTests();
    globalThis.IDBAdapter = fakeIdb({ [SONG_VOTE_KEYS.votes]: saved });
    await loadSongVotes();
    expect(voteOf(A)).toBe(1);
    expect(voteOf(B)).toBe(-1);
  });

  it('notifies subscribers on a vote', async () => {
    await loadSongVotes();
    const cb = vi.fn();
    SongVotes.subscribe(cb);
    const v0 = SongVotes.getVersion();
    tapSongVote(A, 1);
    expect(cb).toHaveBeenCalled();
    expect(SongVotes.getVersion()).toBeGreaterThan(v0);
  });
});

describe('the install id and the traits', () => {
  it('makes one random id per install, keeps it, and sends it with every vote', async () => {
    await loadSongVotes();
    const id = idb.data.get(SONG_VOTE_KEYS.install);
    expect(id).toMatch(/^[A-Za-z0-9_-]{16,64}$/);
    globalThis.fetch.mockClear();
    setSongVote(A, 1, Date.now());
    await flushSongVotes();
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.install).toBe(id);
    _resetSongVotesForTests();
    globalThis.IDBAdapter = idb;
    await loadSongVotes();
    expect(idb.data.get(SONG_VOTE_KEYS.install)).toBe(id);
  });

  it('the APK id (ANDROID_ID, hashed natively) wins over a stored random one', async () => {
    idb.data.set(SONG_VOTE_KEYS.install, 'storedrandomid_0000');
    window.AndroidBridge = { songVoteInstallId: () => 'apk-install-id-1234567890' };
    await loadSongVotes();
    setSongVote(A, 1, Date.now());
    expect(pendingSongVotes()[0].install).toBe('apk-install-id-1234567890');
  });

  it('a vote cast before the load speaks as the stored install', async () => {
    globalThis.fetch = fakeFetch('net');
    idb.data.set(SONG_VOTE_KEYS.install, 'storedrandomid_0000');
    setSongVote(A, 1, Date.now());
    await loadSongVotes();
    expect(pendingSongVotes()[0].install).toBe('storedrandomid_0000');
  });

  it('carries only screen size, pixel ratio and timezone', () => {
    const t = voteTraits();
    expect(Object.keys(t).sort()).toEqual(['dpr', 'h', 'tz', 'w']);
    expect(typeof t.tz).toBe('string');
  });
});

describe('the outbox', () => {
  it('posts the vote as the Worker reads it and empties on 204', async () => {
    await loadSongVotes();
    globalThis.fetch.mockClear();
    setSongVote(A, 1, 5000 + Date.now());
    await flushSongVotes();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = globalThis.fetch.mock.calls[0];
    expect(url).toBe(SONG_VOTE_URL);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ song: A, v: 1 });
    expect(Object.keys(body).sort()).toEqual(['at', 'install', 'song', 'traits', 'v']);
    expect(pendingSongVotes()).toEqual([]);
    expect(idb.data.get(SONG_VOTE_KEYS.outbox)).toEqual({});
  });

  it('keeps the vote with no network, and sends it when the link is back', async () => {
    globalThis.fetch = fakeFetch('net');
    await loadSongVotes();
    setSongVote(A, 1, Date.now());
    await flushSongVotes();
    expect(voteOf(A)).toBe(1);                        // shows at once, as any vote
    expect(pendingSongVotes()).toHaveLength(1);
    expect(Object.keys(idb.data.get(SONG_VOTE_KEYS.outbox))).toEqual([A]);
    globalThis.fetch = fakeFetch(204);
    window.dispatchEvent(new Event('online'));
    await settle();
    await flushSongVotes();
    expect(pendingSongVotes()).toEqual([]);
  });

  it('keeps on 429 and 5xx, drops on 400 (malformed: the Worker will never take it)', async () => {
    const at = Date.now();
    expect(await postSongVote({ install: 'x'.repeat(16), song: A, v: 1, at }, at)).toBe('sent');
    globalThis.fetch = fakeFetch(429);
    expect(await postSongVote({ install: 'x'.repeat(16), song: A, v: 1, at }, at)).toBe('keep');
    globalThis.fetch = fakeFetch(503);
    expect(await postSongVote({ install: 'x'.repeat(16), song: A, v: 1, at }, at)).toBe('keep');
    globalThis.fetch = fakeFetch(400);
    expect(await postSongVote({ install: 'x'.repeat(16), song: A, v: 1, at }, at)).toBe('drop');
  });

  it('drops a vote older than the Worker accepts instead of retrying it forever', async () => {
    const at = Date.now() - 95 * 24 * 3600 * 1000;
    expect(await postSongVote({ install: 'x'.repeat(16), song: A, v: 1, at })).toBe('drop');
  });

  it('holds only the latest state per song: like then clear offline sends one 0', async () => {
    globalThis.fetch = fakeFetch('net');
    await loadSongVotes();
    const t = Date.now();
    setSongVote(A, 1, t);
    setSongVote(A, 0, t + 10);
    await flushSongVotes();
    expect(pendingSongVotes()).toEqual([expect.objectContaining({ song: A, v: 0, at: t + 10 })]);
  });

  it('a 👍 turned into 👎 sends 0, never the 👎', async () => {
    await loadSongVotes();
    const t = Date.now();
    setSongVote(A, 1, t);
    await flushSongVotes();
    globalThis.fetch.mockClear();
    setSongVote(A, -1, t + 5);
    await flushSongVotes();
    const body = JSON.parse(globalThis.fetch.mock.calls[0][1].body);
    expect(body.v).toBe(0);
    expect(JSON.stringify(globalThis.fetch.mock.calls)).not.toContain('-1');
  });

  it('a newer vote cast while one is in flight is not lost', async () => {
    await loadSongVotes();
    let release;
    globalThis.fetch = vi.fn(() => new Promise((r) => { release = () => r({ status: 204, ok: true }); }));
    const t = Date.now();
    setSongVote(A, 1, t);
    await settle();
    setSongVote(A, 0, t + 1);          // while the like is on the wire
    release();
    await settle(); await settle();
    expect(pendingSongVotes()).toEqual([expect.objectContaining({ song: A, v: 0 })]);
  });

  it('asks the service worker for Background Sync when a send fails', async () => {
    const register = vi.fn(async () => {});
    Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve({ sync: { register } }) } });
    try {
      globalThis.fetch = fakeFetch('net');
      await loadSongVotes();
      setSongVote(A, 1, Date.now());
      await flushSongVotes();
      await settle();
      expect(register).toHaveBeenCalledWith('song-votes');
    } finally {
      delete navigator.serviceWorker;
    }
  });

  it('in the APK hands the votes to native WorkManager instead of posting them', async () => {
    const queued = [];
    window.AndroidBridge = { queueSongVote: (json) => { queued.push(JSON.parse(json)); return true; } };
    await loadSongVotes();
    globalThis.fetch.mockClear();
    setSongVote(A, 1, Date.now());
    await flushSongVotes();
    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(queued).toEqual([expect.objectContaining({ song: A, v: 1 })]);
    expect(pendingSongVotes()).toEqual([]);
  });

  it('resends what a closed app left in the outbox on the next launch', async () => {
    const at = Date.now();
    idb.data.set(SONG_VOTE_KEYS.outbox, { [B]: { install: 'storedrandomid_0000', song: B, v: 1, at } });
    idb.data.set(SONG_VOTE_KEYS.install, 'storedrandomid_0000');
    await loadSongVotes();
    await settle();
    await flushSongVotes();
    expect(globalThis.fetch).toHaveBeenCalled();
    expect(pendingSongVotes()).toEqual([]);
  });
});

describe('the first-👎 note shows once per install', () => {
  it('is unseen until marked, and stays seen after a relaunch', async () => {
    await loadSongVotes();
    expect(downNoteSeen()).toBe(false);
    markDownNoteSeen();
    expect(downNoteSeen()).toBe(true);
    await settle();
    _resetSongVotesForTests();
    globalThis.IDBAdapter = idb;
    await loadSongVotes();
    expect(downNoteSeen()).toBe(true);
  });
});

describe('the tallies (votes.json)', () => {
  const tally = { v: 1, min: 3, songs: { [A]: [5, 3], [B]: [9, 0] }, popular: [A], loved: [B, A] };
  const answer = (status, body) => vi.fn(async (url) => ({ status, ok: status === 200, url, text: async () => JSON.stringify(body) }));

  it('reads popular and loved in their published order', async () => {
    globalThis.fetch = answer(200, tally);
    await loadSongTally();
    expect(globalThis.fetch.mock.calls[0][0]).toBe(SONG_TALLY_URL);
    expect(popularSongIds()).toEqual([A]);
    expect(lovedSongIds()).toEqual([B, A]);
    expect(SongVotes.tallyLoaded).toBe(true);
    expect(idb.data.get(SONG_VOTE_KEYS.tally)).toEqual(tally);
  });

  it('a 404 (nothing published yet) is "no votes yet", loaded and empty', async () => {
    globalThis.fetch = answer(404, {});
    await loadSongTally();
    expect(SongVotes.tallyLoaded).toBe(true);
    expect(popularSongIds()).toEqual([]);
    expect(lovedSongIds()).toEqual([]);
  });

  it('offline, the last good copy answers', async () => {
    idb.data.set(SONG_VOTE_KEYS.tally, tally);
    globalThis.fetch = fakeFetch('net');
    await loadSongTally();
    expect(popularSongIds()).toEqual([A]);
  });

  it('refuses a file of another version and drops ids that are not songs', () => {
    expect(normalizeSongTally({ v: 2, popular: [A] })).toBe(null);
    expect(normalizeSongTally(null)).toBe(null);
    expect(normalizeSongTally({ v: 1, popular: [A, 'x', 3, C], loved: 'no' })).toEqual({ min: 3, songs: {}, popular: [A, C], loved: [] });
  });
});
