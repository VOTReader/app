/* v2 downloads and offline (zv1, group 9): offline-facts.js reads main's OfflineAudio / NetStatus / AudioPlayer as main's
   rows do; the 4c-downloads gate picture (queue bar, four row states, the no-connection toast); a real boot over a fake
   store (states follow the store, Pause cancels what is still to come, Retry asks again, OK dismisses the toast); and
   9c's words for a Listen that cannot make sound. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App } from './App.jsx';
import { CollectionScreen as CollectionPage } from './screens/CollectionScreen.jsx';
import {
  rowItems, rowDownload, downloadQueue, queueWords, downloadWords, isOnline, offlineListenWords, gateDownloads,
  OFFLINE_LISTEN, OFFLINE_DOWNLOADS,
} from './offline-facts.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
/** the page rendered bare (the shell's other props unused here) */
const CollectionScreen = /** @type {any} */ (CollectionPage);
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });

const ONE = { volKey: 'one', readKey: 'volume-one', globalName: 'LETTERS_V1', prefaceGlobal: null, label: 'Volume One', kind: 'letter', indexScreen: 'vot-one-index' };
const TITLES = ['Chosen by God', 'Honor Not the Day of the Dead... Honor God', 'Christmas',
  'Wisdom Regarding Those Who Killed The Messiah, Who Is Called Christ', 'Humility and The Word of God',
  'God Is The Fosterer and Protector of Those Tossed Away in Bitter Ignorance', 'Belong to the Church Without Walls', 'Sex'];
const DATES = ['8/31/04', '10/6/04', '10/7/04', '10/16/04', '10/17/04', '10/20/04', '10/24/04', '10/28/04'];
const V1 = Array.from({ length: 29 }, (_x, i) => ({
  id: 'l' + (i + 1), title: TITLES[i] || 'Letter ' + (i + 1), date: DATES[i] || '1/2/05', blocks: [], num: i + 1,
}));

/** main's OfflineAudio over a status map (url -> status), with the calls a page makes as spies. */
function fakeStore(status = {}, extra = {}) {
  const listeners = new Set();
  const off = {
    v: 0, status, sizes: {}, active: null, failures: {}, wait: false,
    available: () => true,
    subscribe: (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    getVersion: () => off.v,
    set(next) { off.status = next; off.v += 1; listeners.forEach((cb) => cb()); },
    statusOf: (u) => off.status[u] || 'none',
    sizeOf: (u) => off.sizes[u] || 0,
    progressOf: (u) => (off.active && off.active.url === u ? off.active : null),
    failureOf: (u) => off.failures[u] || null,
    waiting: () => off.wait,
    download: vi.fn(() => true),
    cancel: vi.fn(),
    ...extra,
  };
  return off;
}

function fakePlayer() {
  return {
    subscribe: () => () => {}, getVersion: () => 0, getState: () => ({ status: 'idle', queue: [], qi: 0 }),
    collectionHasAudio: () => true, playCollection: vi.fn(), toggle: vi.fn(), listenResume: () => null,
    playbackTracks: vi.fn((_vol, letter) => (letter.id === 'l3'
      ? [{ url: 'u-l3a', key: 'one:l3', partLabel: 'Part 1' }, { url: 'u-l3b', key: 'one:l3', partLabel: 'Part 2' }]
      : [{ url: 'u-' + letter.id, key: 'one:' + letter.id }])),
  };
}

beforeEach(() => {
  g.COLLECTIONS = [ONE];
  g.COL_BY_KEY = new Map([['one', ONE]]);
  g.COL_BY_INDEX_SC = new Map([['vot-one-index', ONE]]);
  g.LETTERS_V1 = V1;
});
afterEach(() => {
  cleanup();
  for (const k of ['COLLECTIONS', 'COL_BY_KEY', 'COL_BY_INDEX_SC', 'LETTERS_V1', 'AudioPlayer', 'OfflineAudio', 'NetStatus', 'StateStore']) delete g[k];
  delete html.dataset.gate;
  vi.restoreAllMocks();
});

describe('offline-facts', () => {
  it("a row's state: on the phone when every part is, else on its way, waiting, failed, or nothing asked", () => {
    const off = fakeStore({ a: 'saved', b: 'saved' });
    expect(rowDownload(off, ['a', 'b'])).toEqual({ kind: 'saved' });
    expect(rowDownload(off, [])).toBe(null);
    expect(rowDownload(null, ['a'])).toBe(null);
    expect(rowDownload({ available: () => true }, ['a'])).toBe(null);
    off.status = { a: 'queued' };
    expect(rowDownload(off, ['a'])).toEqual({ kind: 'queued' });
    off.wait = true;
    expect(rowDownload(off, ['a'])).toEqual({ kind: 'waiting' });
    off.status = { a: 'failed' };
    off.failures = { a: 'space' };
    expect(rowDownload(off, ['a'])).toEqual({ kind: 'failed', why: 'space' });
    off.failures = {};
    expect(rowDownload(off, ['a'])).toEqual({ kind: 'failed', why: 'network' });
    expect(rowDownload(fakeStore(), ['a'])).toBe(null);
  });

  it('a download on its way counts bytes where the sizes are known, else parts; never 100 before it is done', () => {
    const off = fakeStore({ a: 'saved', b: 'downloading' });
    off.sizes = { a: 30, b: 70 };
    off.active = { url: 'b', bytes: 35, total: 70 };
    expect(rowDownload(off, ['a', 'b'])).toEqual({ kind: 'downloading', percent: 65 });
    off.sizes = {};
    expect(rowDownload(off, ['a', 'b'])).toEqual({ kind: 'downloading', percent: 75 });
    off.status = { b: 'downloading' };
    off.active = { url: 'b', bytes: 70, total: 70 };
    expect(rowDownload(off, ['b'])).toEqual({ kind: 'downloading', percent: 99 });
  });

  it('the queue: shown while a row is on its way; done = rows on the phone of every row with a recording', () => {
    const rows = [{ kind: 'saved' }, { kind: 'saved' }, { kind: 'downloading', percent: 3 }, { kind: 'queued' }, null];
    expect(downloadQueue(/** @type {any} */ (rows))).toEqual({ done: 2, total: 5, percent: 40, waiting: false });
    expect(downloadQueue(/** @type {any} */ ([{ kind: 'saved' }, { kind: 'failed', why: 'network' }, null]))).toBe(null);
    const held = downloadQueue(/** @type {any} */ ([{ kind: 'saved' }, { kind: 'waiting' }]));
    expect(queueWords(/** @type {any} */ (held))).toBe('Waiting for Wi-Fi · 1 of 2');
    expect(queueWords(gateDownloads().queue)).toBe('Downloading 12 of 29');
  });

  it("a row's words: on its way or failed stand alone; on the phone and waiting follow the date; queued adds nothing", () => {
    expect(downloadWords({ kind: 'saved' })).toMatchObject({ text: 'On this phone', alone: false, bad: false });
    expect(downloadWords({ kind: 'downloading', percent: 64 })).toMatchObject({ text: 'Downloading · 64%', alone: true });
    expect(downloadWords({ kind: 'failed', why: 'network' })).toMatchObject({ text: 'Couldn’t download', alone: true, bad: true });
    expect(downloadWords({ kind: 'failed', why: 'space' }).text).toBe('Not enough room on this phone');
    expect(downloadWords({ kind: 'waiting' })).toMatchObject({ text: 'Waiting for Wi-Fi', alone: false });
    expect(downloadWords({ kind: 'queued' })).toBe(null);
    expect(downloadWords(null)).toBe(null);
  });

  it("a row's recordings are its own Play's tracks, titled like main's (a part names itself)", () => {
    const player = fakePlayer();
    const e = { key: 'one/3', title: 'Christmas', item: V1[2] };
    expect(rowItems(ONE, e, { AudioPlayer: player })).toEqual([
      { url: 'u-l3a', key: 'one:l3', title: 'Christmas · Part 1' }, { url: 'u-l3b', key: 'one:l3', title: 'Christmas · Part 2' },
    ]);
    expect(rowItems(ONE, e, {})).toEqual([]);
  });

  it("online is NetStatus's word, else navigator.onLine", () => {
    expect(isOnline({ NetStatus: { isOffline: () => true } })).toBe(false);
    expect(isOnline({ NetStatus: { isOffline: () => false } })).toBe(true);
    expect(isOnline({ navigator: { onLine: false } })).toBe(false);
    expect(isOnline({})).toBe(true);
  });

  it("9c: Listen's toast words when main says the letter cannot make sound now; null to play", () => {
    const playableNow = vi.fn(() => false);
    expect(offlineListenWords('one', 'l2', { AudioPlayer: { playableNow } })).toBe(OFFLINE_LISTEN);
    expect(playableNow).toHaveBeenCalledWith('one', 'l2');
    expect(offlineListenWords('one', 'l2', { AudioPlayer: { playableNow: () => true } })).toBe(null);
    expect(offlineListenWords('one', 'l2', {})).toBe(null);
    expect(OFFLINE_LISTEN).toBe('You’re offline. This recording isn’t on this phone.');
  });
});

describe('4c-downloads, the gate picture', () => {
  it('the queue bar, Letter 4 on this phone, 5 at 64 %, 6 failed with Retry, 7 waiting; the toast; nothing asked of the store', async () => {
    g.OfflineAudio = fakeStore();
    const { container } = render(<V2App gateId="4c-downloads" />);
    expect(container.querySelector('.tb .title').textContent).toBe('Home');
    expect(container.querySelector('.dl-head .dl-bar span').textContent).toBe('Downloading 12 of 29');
    expect(container.querySelector('.dl-head .dl-bar button').textContent).toBe('Pause');
    expect(/** @type {HTMLElement} */ (container.querySelector('.dl-prog i')).style.width).toBe('41%');
    const line = (k) => container.querySelector('.row[data-key="' + k + '"] .s').textContent;
    expect(line('one/4')).toBe('10/16/04 · On this phone');
    expect(line('one/5')).toBe('Downloading · 64%');
    expect(line('one/6')).toBe('Couldn’t download · Retry');
    expect(line('one/7')).toBe('10/24/04 · Waiting for Wi-Fi');
    expect(line('one/8')).toBe('10/28/04');
    expect(container.querySelector('.row[data-key="one/5"] svg.ring')).not.toBe(null);
    expect(container.querySelector('.row[data-key="one/6"] .st.bad .retry')).not.toBe(null);
    expect(container.querySelector('.row[data-key="one/6"] button .retry')).toBe(null);
    expect(container.querySelector('.toast').textContent).toBe(OFFLINE_DOWNLOADS + 'OK');
    await click(container.querySelector('.dl-bar button'));
    await click(container.querySelector('.row[data-key="one/6"] .retry'));
    expect(g.OfflineAudio.cancel).not.toHaveBeenCalled();
    expect(g.OfflineAudio.download).not.toHaveBeenCalled();
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
  });
});

describe('a real boot', () => {
  const page = () => render(<CollectionScreen route={{ place: 'collection', collection: 'one' }} gate={null} go={vi.fn()} onReady={() => {}} />);

  it('no queue bar or row states while nothing is asked; the bar comes as the store starts', async () => {
    g.AudioPlayer = fakePlayer();
    g.OfflineAudio = fakeStore();
    const { container } = page();
    expect(container.querySelector('.dl-head')).toBe(null);
    expect(container.querySelector('.row[data-key="one/4"] .s').textContent).toBe('10/16/04');
    const all = Object.fromEntries(V1.slice(0, 12).map((l) => ['u-' + l.id, 'saved']));
    act(() => g.OfflineAudio.set({ ...all, 'u-l3a': 'saved', 'u-l3b': 'saved', 'u-l13': 'downloading', 'u-l14': 'queued' }));
    expect(container.querySelector('.dl-bar span').textContent).toBe('Downloading 12 of 29');
    expect(container.querySelector('.row[data-key="one/3"] .s').textContent).toBe('10/7/04 · On this phone');
    expect(container.querySelector('.row[data-key="one/13"] .s').textContent).toBe('Downloading · 0%');
    expect(container.querySelector('.row[data-key="one/14"] .s').textContent).toBe('1/2/05');
  });

  it("Pause cancels every recording still to come on this page; Retry asks for that row's recordings again", async () => {
    g.AudioPlayer = fakePlayer();
    g.OfflineAudio = fakeStore({ 'u-l1': 'saved', 'u-l2': 'downloading', 'u-l3a': 'queued', 'u-l3b': 'saved', 'u-l4': 'failed' });
    const { container } = page();
    await click(container.querySelector('.dl-bar button'));
    expect(g.OfflineAudio.cancel).toHaveBeenCalledWith(['u-l2', 'u-l3a']);
    await click(container.querySelector('.row[data-key="one/4"] .retry'));
    expect(g.OfflineAudio.download).toHaveBeenCalledWith([{ url: 'u-l4', key: 'one:l4', title: V1[3].title }]);
  });

  it('a failed row opens its letter from the title; Retry does not open it', async () => {
    g.AudioPlayer = fakePlayer();
    g.OfflineAudio = fakeStore({ 'u-l4': 'failed' });
    const go = vi.fn();
    const { container } = render(<CollectionScreen route={{ place: 'collection', collection: 'one' }} gate={null} go={go} onReady={() => {}} />);
    await click(container.querySelector('.row[data-key="one/4"] .retry'));
    expect(go).not.toHaveBeenCalled();
    await click(container.querySelector('.row[data-key="one/4"] .tx-open'));
    expect(go).toHaveBeenCalledWith({ place: 'letter', collection: 'one', n: 4 });
  });

  it('no connection while downloads wait: the toast, until OK; none online', async () => {
    let offline = true;
    const subs = new Set();
    g.NetStatus = { isOffline: () => offline, subscribe: (cb) => { subs.add(cb); return () => subs.delete(cb); }, getVersion: () => (offline ? 1 : 0) };
    g.AudioPlayer = fakePlayer();
    g.OfflineAudio = fakeStore({ 'u-l2': 'queued' });
    const { container } = page();
    expect(container.querySelector('.toast').textContent).toBe(OFFLINE_DOWNLOADS + 'OK');
    await click(container.querySelector('.toast .act'));
    expect(container.querySelector('.toast')).toBe(null);
    cleanup();
    offline = false;
    const again = page();
    expect(again.container.querySelector('.dl-head')).not.toBe(null);
    expect(again.container.querySelector('.toast')).toBe(null);
  });
});
