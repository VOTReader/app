/* v2 collection page (mw5; picture 2a-collection): the heading and count come from the corpus, each row's state is main's
   saved data re-shown read only (read marks, the player's saved place, the read tracker's frontier), listening and
   downloads go through main's one engine, and a gate boot draws the picture without touching either. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App } from './App.jsx';
import { CollectionScreen } from './screens/CollectionScreen.jsx';
import {
  collectionEntries, collectionLede, collectionHead, yearOf, rowWords, savedProgress, nowPlayingFromEngine, downloadList,
} from './collection-facts.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });

// Volume One as the corpus ships it (scripture-resolution's record; volume-one.js's first letters, preface without num)
const ONE = { volKey: 'one', readKey: 'volume-one', globalName: 'LETTERS_V1', prefaceGlobal: 'LETTERS_V1_PREFACE', label: 'Volume One', kind: 'letter', indexScreen: 'vot-one-index' };
const WTLB = { volKey: 'wtlb1', readKey: 'wtlb-one', globalName: 'WTLB_ONE', prefaceGlobal: null, label: 'Words To Live By: Part One', kind: 'wtlb', indexScreen: 'wtlb-one-index' };
const FIRST = [
  ['chosen-by-god', 'Chosen by God', '8/31/04'],
  ['honor-not-the-day-of-the-dead-honor-god', 'Honor Not the Day of the Dead... Honor God', '10/6/04'],
  ['christmas', 'Christmas', '10/7/04'],
  ['wisdom-regarding-those-who-killed-the-messiah-who-is-called-christ', 'Wisdom Regarding Those Who Killed The Messiah, Who Is Called Christ', '10/16/04'],
  ['humility-and-the-word-of-god', 'Humility and The Word of God', '10/17/04'],
];
const V1 = Array.from({ length: 29 }, (_x, i) => {
  const f = FIRST[i];
  return { id: f ? f[0] : 'v1-' + (i + 1), title: f ? f[1] : 'Letter ' + (i + 1), date: f ? f[2] : (1 + (i % 12)) + '/2/05', blocks: [], num: i + 1 };
});
const PREFACE = { id: 'a-word-of-warning', title: 'A Word of Warning', date: '', blocks: [] };

function installCorpus() {
  g.COLLECTIONS = [ONE, WTLB];
  g.COL_BY_KEY = new Map([['one', ONE], ['wtlb1', WTLB]]);
  g.COL_BY_INDEX_SC = new Map([['vot-one-index', ONE], ['wtlb-one-index', WTLB]]);
  g.LETTERS_V1 = V1;
  g.LETTERS_V1_PREFACE = PREFACE;
  g.WTLB_ONE = Array.from({ length: 149 }, (_x, i) => ({ id: 'w' + (i + 1), num: i + 1, title: 'Entry ' + (i + 1), paragraphs: [] }));
}

/** main's AudioPlayer, as far as a list uses it: Volume One loaded at Letter 1 (`status`), nothing else touched. */
function fakePlayer(status = 'playing') {
  const listeners = new Set();
  const p = {
    v: 0,
    state: { status, queue: [{ key: 'one:chosen-by-god', url: 'u1' }], qi: 0 },
    subscribe: vi.fn((cb) => { listeners.add(cb); return () => listeners.delete(cb); }),
    getVersion: () => p.v,
    getState: () => p.state,
    set(next) { p.state = next; p.v += 1; listeners.forEach((cb) => cb()); },
    collectionHasAudio: vi.fn(() => true),
    playCollection: vi.fn(),
    toggle: vi.fn(),
    listenResume: vi.fn(({ letter }) => (letter.id === 'christmas' ? { at: 120, left: 370 } : null)),
    playbackTracks: vi.fn((_vol, letter) => (letter.id === 'christmas'
      ? [{ url: 'c1', key: 'one:christmas', partLabel: 'Part 1' }, { url: 'c2', key: 'one:christmas', partLabel: 'Part 2' }]
      : [{ url: 'u-' + letter.id, key: 'one:' + letter.id }])),
  };
  return p;
}

beforeEach(() => { installCorpus(); });
afterEach(() => {
  cleanup();
  for (const k of ['COLLECTIONS', 'COL_BY_KEY', 'COL_BY_INDEX_SC', 'LETTERS_V1', 'LETTERS_V1_PREFACE', 'WTLB_ONE', 'StateStore',
    'HistoryStore', 'AudioPlayer', 'OfflineAudio', 'ReadingStatsStore', 'countItemWords', 'readingMinutes', 'matchMedia']) delete g[k];
  delete html.dataset.gate;
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('what the page says', () => {
  it('the preface first as "P", then the letters by number; a volume is "The Volumes of Truth" / its name', () => {
    const e = collectionEntries(ONE);
    expect(e.length).toBe(30);
    expect(e[0]).toMatchObject({ key: 'one/P', no: 'P', title: 'A Word of Warning', preface: true, n: null });
    expect(e[1]).toMatchObject({ key: 'one/1', no: '1', id: 'chosen-by-god', date: '8/31/04', n: 1 });
    expect(collectionHead(ONE)).toEqual({ eyebrow: 'The Volumes of Truth', title: 'Volume One' });
    expect(collectionHead(WTLB)).toEqual({ title: 'Words To Live By', eyebrow: 'Part One · Words of Wisdom' });
  });

  it('the count leaves the preface out and names the years the letters span; undated entries just count', () => {
    expect(collectionLede(ONE, collectionEntries(ONE))).toBe('29 letters · 2004–2005');
    expect(collectionLede(ONE, collectionEntries(ONE).slice(0, 3))).toBe('2 letters · 2004');
    expect(collectionLede(WTLB, collectionEntries(WTLB))).toBe('149 entries');
    expect(yearOf('8/31/04')).toBe(2004);
    expect(yearOf('March 3, 2007')).toBe(2007);
    expect(yearOf('')).toBe(null);
  });

  it("a row's words: Preface, Playing/Paused, Finished, minutes left (which outrank Finished), else the date", () => {
    const [pre, l1] = collectionEntries(ONE);
    expect(rowWords(pre)).toBe('Preface');
    expect(rowWords(l1, { playing: true })).toBe('Playing · 8/31/04');
    expect(rowWords(l1, { playing: true, paused: true })).toBe('Paused · 8/31/04');
    expect(rowWords(l1, { progress: { finished: true } })).toBe('8/31/04 · Finished');
    expect(rowWords(l1, { progress: { leftMin: 6 } })).toBe('8/31/04 · 6 min left');
    expect(rowWords(l1, { progress: { finished: true, leftMin: 2 } })).toBe('8/31/04 · 2 min left');
    expect(rowWords(l1, { playing: true, progress: { finished: true } })).toBe('Playing · 8/31/04');
    expect(rowWords(l1)).toBe('8/31/04');
  });
});

describe("saved data, re-shown (read only)", () => {
  it("Finished is main's read mark; minutes left are the player's saved place, else the read tracker's frontier", () => {
    const state = Object.freeze({ readItems: Object.freeze({ 'v1:volume-one:honor-not-the-day-of-the-dead-honor-god': 2, 'v1:volume-one:christmas': 1 }) });
    g.StateStore = { isReady: () => true, get: vi.fn(() => state), update: vi.fn(), set: vi.fn() };
    g.AudioPlayer = fakePlayer();
    // Letter 4: the tracker saw 3 of 4 blocks, 300 of 1200 words left
    g.ReadingStatsStore = {
      measuredWpm: () => 150,
      getProgress: vi.fn((k) => (k === 'v1:volume-one:wisdom-regarding-those-who-killed-the-messiah-who-is-called-christ'
        ? { b: 4, c: [0, 1, 2], tw: 1200, w: 900 } : null)),
      recordProgress: vi.fn(), clearProgress: vi.fn(),
    };
    g.countItemWords = () => 1200;
    g.readingMinutes = (words, wpm) => Math.round(words / (wpm || 230));
    const p = savedProgress(ONE, collectionEntries(ONE));
    expect(p).toEqual({
      'one/2': { finished: true },
      'one/3': { finished: true, leftMin: 6 },
      'one/4': { leftMin: 2 },
    });
    expect(g.StateStore.update).not.toHaveBeenCalled();
    expect(g.StateStore.set).not.toHaveBeenCalled();
    expect(g.ReadingStatsStore.recordProgress).not.toHaveBeenCalled();
    expect(g.ReadingStatsStore.clearProgress).not.toHaveBeenCalled();
  });

  it('no stores (or stores not ready) means no states, never an error', () => {
    g.StateStore = { isReady: () => false, get: () => { throw new Error('not ready'); } };
    expect(savedProgress(ONE, collectionEntries(ONE))).toEqual({});
  });

  it("the loaded recording comes from the player's track key; idle is nothing", () => {
    expect(nowPlayingFromEngine({ status: 'paused', queue: [{ key: 'one:christmas' }], qi: 0 }))
      .toEqual({ collection: 'one', letterId: 'christmas', paused: true });
    expect(nowPlayingFromEngine({ status: 'idle', queue: [{ key: 'one:christmas' }], qi: 0 })).toBe(null);
    expect(nowPlayingFromEngine({ status: 'playing', queue: [{ key: null }], qi: 0 })).toBe(null);
  });

  it("Download hands over each row's recordings with main's titles (a part names itself)", () => {
    g.AudioPlayer = fakePlayer();
    const list = downloadList(ONE, collectionEntries(ONE).slice(0, 4));
    expect(list.slice(0, 2)).toEqual([
      { url: 'u-a-word-of-warning', key: 'one:a-word-of-warning', title: 'A Word of Warning' },
      { url: 'u-chosen-by-god', key: 'one:chosen-by-god', title: 'Chosen by God' },
    ]);
    expect(list.slice(3)).toEqual([
      { url: 'c1', key: 'one:christmas', title: 'Christmas · Part 1' },
      { url: 'c2', key: 'one:christmas', title: 'Christmas · Part 2' },
    ]);
  });
});

describe('2a-collection, the gate picture', () => {
  it('draws Volume One as the picture: Back Home, Play all + Download, P, Letter 1 playing, 2 finished, 3 six minutes left', async () => {
    g.AudioPlayer = fakePlayer('paused');
    g.OfflineAudio = { available: () => true, download: vi.fn(), subscribe: () => () => {}, getVersion: () => 0 };
    const { container } = render(<V2App gateId="2a-collection" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(container.querySelector('.tb .title').textContent).toBe('Home');
    expect(container.querySelector('.tab[aria-current="page"]').textContent).toBe('Home');
    expect(container.querySelector('.overline').textContent).toBe('The Volumes of Truth');
    expect(container.querySelector('h1.display').textContent).toBe('Volume One');
    expect(container.querySelector('.lede').textContent).toBe('29 letters · 2004–2005');
    expect([...container.querySelectorAll('.actions button')].map((b) => b.textContent)).toEqual(['Play all', 'Download']);
    const rows = [...container.querySelectorAll('.rows .num-row')];
    expect(rows.length).toBe(30);
    const words = rows.slice(0, 5).map((r) => [r.querySelector('.no').textContent, r.querySelector('.t').textContent, r.querySelector('.s').textContent]);
    expect(words).toEqual([
      ['P', 'A Word of Warning', 'Preface'],
      ['1', 'Chosen by God', 'Playing · 8/31/04'],
      ['2', 'Honor Not the Day of the Dead... Honor God', '10/6/04 · Finished'],
      ['3', 'Christmas', '10/7/04 · 6 min left'],
      ['4', 'Wisdom Regarding Those Who Killed The Messiah, Who Is Called Christ', '10/16/04'],
    ]);
    expect(rows[1].className).toBe('row num-row playing');
    expect(rows[1].querySelectorAll('.s .eq i').length).toBe(3);
    expect(rows[1].querySelector('.rp').className).toBe('rp on');
    expect(rows[1].querySelector('.rp').getAttribute('aria-label')).toBe('Pause Chosen by God');
    expect(rows[2].querySelector('.rp').getAttribute('aria-label')).toBe('Play Honor Not the Day of the Dead... Honor God');
    // the gate draws the page in memory: the engine on the page (paused at Letter 1) is neither read nor driven
    expect(g.AudioPlayer.subscribe).not.toHaveBeenCalled();
    click(rows[1].querySelector('.rp'));
    click(rows[3].querySelector('.rp'));
    click(container.querySelector('.actions .pill'));
    click(container.querySelector('.actions .btn2'));
    expect(g.AudioPlayer.toggle).not.toHaveBeenCalled();
    expect(g.AudioPlayer.playCollection).not.toHaveBeenCalled();
    expect(g.OfflineAudio.download).not.toHaveBeenCalled();
  });

  it('a row opens its letter (Back names Volume One); P opens the preface, whose next card is Letter 1', () => {
    const { container } = render(<V2App gateId="2a-collection" />);
    click(container.querySelectorAll('.rows .num-row button.tx')[3]);
    expect(container.querySelector('h1').textContent).toBe('Christmas');
    expect(container.querySelector('.tb .title').textContent).toBe('Volume One');
    click(container.querySelector('.tb button[aria-label="Back to Volume One"]'));
    click(container.querySelectorAll('.rows .num-row button.tx')[0]);
    expect(container.querySelector('.overline').textContent).toBe('Volume One · Preface');
    expect(container.querySelector('h1').textContent).toBe('A Word of Warning');
    expect(container.querySelector('.nextcard .k').textContent).toBe('Next · Letter 1');
    click(container.querySelector('.nextcard'));
    expect(container.querySelector('h1').textContent).toBe('Chosen by God');
    expect(container.querySelector('.tb .title').textContent).toBe('Volume One');
  });
});

describe('a real boot', () => {
  const route = { place: 'collection', collection: 'one' };

  it("lights the player's letter and follows it; Play all, a row's play and the playing row's pause drive main's engine", () => {
    const player = fakePlayer('playing');
    g.AudioPlayer = player;
    const { container } = render(<CollectionScreen route={route} facts={{}} gate={null} desktop={false} device="phone"
      go={vi.fn()} pop={vi.fn()} replace={vi.fn()} openTab={vi.fn()} onReady={vi.fn()} />);
    const row = (i) => container.querySelectorAll('.rows .num-row')[i];
    expect(row(1).className).toBe('row num-row playing');
    expect(row(3).querySelector('.s').textContent).toBe('10/7/04 · 6 min left');
    click(row(1).querySelector('.rp'));
    expect(player.toggle).toHaveBeenCalledTimes(1);
    click(row(3).querySelector('.rp'));
    const items = [PREFACE, ...V1];
    expect(player.playCollection).toHaveBeenLastCalledWith({ volKey: 'one', items, collectionLabel: 'Volume One', startId: 'christmas' });
    click(container.querySelector('.actions .pill'));
    expect(player.playCollection).toHaveBeenLastCalledWith({ volKey: 'one', items, collectionLabel: 'Volume One' });
    // the player moves to Christmas, paused: the light follows, the button offers Play again
    act(() => player.set({ status: 'paused', queue: [{ key: 'one:christmas', url: 'c1' }], qi: 0 }));
    expect(row(1).className).toBe('row num-row');
    expect(row(3).className).toBe('row num-row playing');
    expect(row(3).querySelector('.s').textContent).toBe('Paused · 10/7/04');
    expect(row(3).querySelector('.s .eq')).toBe(null);
    expect(row(3).querySelector('.rp').getAttribute('aria-label')).toBe('Play Christmas');
    click(row(3).querySelector('.rp'));
    expect(player.toggle).toHaveBeenCalledTimes(2);
  });

  it("Download shows where this device keeps recordings and hands main's downloads the whole collection", () => {
    g.AudioPlayer = fakePlayer('idle');
    g.OfflineAudio = { available: () => true, download: vi.fn(() => true), subscribe: () => () => {}, getVersion: () => 0 };
    const { container } = render(<CollectionScreen route={route} facts={{}} gate={null} desktop={false} device="phone"
      go={vi.fn()} pop={vi.fn()} replace={vi.fn()} openTab={vi.fn()} onReady={vi.fn()} />);
    expect(container.querySelector('.num-row.playing')).toBe(null);
    click(container.querySelector('.actions .btn2'));
    const list = g.OfflineAudio.download.mock.calls[0][0];
    expect(list.length).toBe(31);
    expect(list[0]).toEqual({ url: 'u-a-word-of-warning', key: 'one:a-word-of-warning', title: 'A Word of Warning' });
  });

  it('no Download where recordings cannot be kept; no actions at all for a collection with no recordings', () => {
    g.AudioPlayer = fakePlayer('idle');
    g.OfflineAudio = { available: () => false, download: vi.fn(), subscribe: () => () => {}, getVersion: () => 0 };
    const props = { facts: {}, gate: null, desktop: false, device: /** @type {'phone'} */ ('phone'), go: vi.fn(), pop: vi.fn(),
      replace: vi.fn(), openTab: vi.fn(), onReady: vi.fn() };
    const { container, unmount } = render(<CollectionScreen route={route} {...props} />);
    expect([...container.querySelectorAll('.actions button')].map((b) => b.textContent)).toEqual(['Play all']);
    unmount();
    g.AudioPlayer.collectionHasAudio = vi.fn(() => false);
    const again = render(<CollectionScreen route={route} {...props} />);
    expect(again.container.querySelector('.actions')).toBe(null);
    expect(again.container.querySelectorAll('.rows .num-row').length).toBe(30);
  });

  it('says ready once the letters are in; an unknown collection says so and is ready too', () => {
    const onReady = vi.fn();
    const props = { facts: {}, gate: null, desktop: false, device: /** @type {'phone'} */ ('phone'), go: vi.fn(), pop: vi.fn(),
      replace: vi.fn(), openTab: vi.fn(), onReady };
    render(<CollectionScreen route={route} {...props} />);
    expect(onReady).toHaveBeenCalled();
    cleanup();
    const ready2 = vi.fn();
    const { container } = render(<CollectionScreen route={{ place: 'collection', collection: 'nope' }} {...props} onReady={ready2} />);
    expect(container.querySelector('.empty .t').textContent).toBe('This collection could not be opened.');
    expect(ready2).toHaveBeenCalled();
  });
});
