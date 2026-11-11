import { describe, it, expect } from 'vitest';
import {
  buildTvot, buildBible, buildStudies, checkState, toggleNode, selectRange, initialWanted, planOf, roomShort, groupPicked,
  chapterRuns, countOf, formatLength, voiceSplit, byReaderWords, readerName, toggleReading, heldReaders, unitOnPhone,
  unitHeld, partsOnPhone,
} from './download-tree.js';

/** A store over a fixed table: url -> [status, bytes]. */
function fakeStore(/** @type {Record<string, [string, number]>} */ table) {
  return {
    statusOf: (/** @type {string} */ u) => (table[u] ? table[u][0] : 'none'),
    sizeOf: (/** @type {string} */ u) => (table[u] ? table[u][1] : null),
  };
}

const t = (/** @type {string} */ url, /** @type {string} */ partLabel = '') => ({ url, title: url, partLabel: partLabel || null });

/** Volume One: a letter, Christmas in two parts, a third letter; Volume Two: one letter. */
const player = {
  playbackTracks: (/** @type {string} */ volKey, /** @type {any} */ item) => {
    if (volKey === 'v1' && item.id === 'christmas') return [t('v1/xmas-1.mp3'), t('v1/xmas-2.mp3')];
    if (volKey === 'v1' && item.id === 'silent') return [];
    if (volKey === 'bible-kjv') {
      const n = item.id === 'ruth' ? 4 : item.id === 'jude' ? 1 : 0;
      return Array.from({ length: n }, (_, i) => t('kjv/' + item.id + '-' + (i + 1) + '.mp3', 'Chapter ' + (i + 1)));
    }
    return [t(volKey + '/' + item.id + '.mp3')];
  },
  // As the catalog answers: the primary first, nothing for a letter with no recording; Timothy also read every letter
  // but "Chosen by God" (a voice with a gap, for the fallback).
  renditionsFor: (/** @type {string} */ volKey, /** @type {any} */ item) => {
    const primary = player.playbackTracks(volKey, item);
    if (!primary.length) return [];
    const out = [{ reader: 'B', tracks: primary }];
    if (item.id !== 'chosen') out.push({ reader: 'T', tracks: [t(volKey + '/' + item.id + '-tim.mp3')] });
    return out;
  },
};
const collections = [{ volKey: 'v1', label: 'Volume One' }, { volKey: 'v2', label: 'Volume Two' }, { volKey: 'empty', label: 'Empty' }];
const items = /** @type {Record<string, any[]>} */ ({
  v1: [{ id: 'warning', title: 'A Word of Warning' }, { id: 'christmas', title: 'Christmas' }, { id: 'silent', title: 'Text only' }, { id: 'chosen', title: 'Chosen by God' }],
  v2: [{ id: 'one', title: 'One' }],
  empty: [{ id: 'none', title: 'None' }],
});
const tvot = () => buildTvot({ collections, itemsOf: (col) => (col.volKey === 'empty' ? [] : items[col.volKey]), player });

describe('download-tree: the tree', () => {
  it('a letter in parts is one unit, a letter with no recording and an empty collection are left out', () => {
    const tree = tvot();
    expect(tree.children.map((c) => c.title)).toEqual(['Volume One', 'Volume Two']);
    const v1 = tree.children[0];
    expect(v1.units.map((u) => u.id)).toEqual(['v1:warning', 'v1:christmas', 'v1:chosen']);
    expect(v1.units[1].tracks).toHaveLength(2);
    expect(v1.units[1].readings.map((r) => r.reader)).toEqual(['B', 'T']);
    expect(tree.units).toHaveLength(4);
  });
  it('a voice swaps in that reader where it read the letter', () => {
    const tree = buildTvot({ collections, itemsOf: (col) => (col.volKey === 'empty' ? [] : items[col.volKey]), player, voice: 'T' });
    expect(tree.children[0].units[1].tracks.map((x) => x.url)).toEqual(['v1/christmas-tim.mp3']);
    expect(tree.children[0].units[1].reader).toBe('T');
    expect(tree.children[0].units[1].fallback).toBe(false);
  });
  // dl-rework C (defects 1, 4): a voice with no reading of a letter downloaded the default silently.
  it('a letter the voice did not read keeps its default reading and says so; "only" leaves it out', () => {
    const tree = buildTvot({ collections, itemsOf: (col) => (col.volKey === 'empty' ? [] : items[col.volKey]), player, voice: 'T' });
    const chosen = tree.units.find((u) => u.id === 'v1:chosen');
    expect(chosen && chosen.reader).toBe('B');
    expect(chosen && chosen.fallback).toBe(true);
    expect(chosen && chosen.tracks.map((x) => x.url)).toEqual(['v1/chosen.mp3']);
    const only = buildTvot({ collections, itemsOf: (col) => (col.volKey === 'empty' ? [] : items[col.volKey]), player, voice: 'T', only: true });
    expect(only.units.map((u) => u.id)).toEqual(['v1:warning', 'v1:christmas', 'v2:one']);
  });
  it('the split counts come from the data: how many the voice reads, the rest by their default reader', () => {
    const tree = buildTvot({ collections, itemsOf: (col) => (col.volKey === 'empty' ? [] : items[col.volKey]), player, voice: 'T' });
    const s = voiceSplit(tree.units, 'T');
    expect(s).toEqual({ voice: 3, other: 1, byReader: [['B', 1]], total: 4 });
    expect(byReaderWords([['T', 67], ['V', 642]])).toBe('67 Timothy, 642 text-to-speech');
    expect(voiceSplit(tvot().units, '')).toEqual({ voice: 0, other: 4, byReader: [['B', 4]], total: 4 });
  });
  it('reader names are one set everywhere', () => {
    expect(['B', 'T', 'V', 'M', '', 'X'].map(readerName)).toEqual(['Benjamin', 'Timothy', 'Text-to-speech', 'With music', '', '']);
  });
  it('the Bible splits at Malachi: the first 39 books are the Old Testament', () => {
    const books = /** @type {Array<[string, string]>} */ (Array.from({ length: 39 }, (_, i) => ['b' + i, 'B' + i]));
    books[7] = ['ruth', 'Ruth'];
    books.push(['jude', 'Jude']);
    const bible = buildBible({ edition: { volKey: 'bible-kjv', short: 'KJV · BRM' }, books, player });
    expect(bible.children.map((c) => c.title)).toEqual(['Old Testament', 'New Testament']);
    expect(bible.children[0].children.map((b) => b.title)).toEqual(['Ruth']);
    const ruth = bible.children[0].children[0];
    expect(ruth.units.map((u) => u.chapter)).toEqual([1, 2, 3, 4]);
    expect(ruth.noun).toBe('chapter');
    expect(bible.units).toHaveLength(5);
  });
});

describe('download-tree: Studies (brief 3b)', () => {
  it('each study with a recording, its recorded chapters as units; a study with none is left out', () => {
    const studyPlayer = { playbackTracks: (/** @type {string} */ volKey, /** @type {any} */ ch) => (volKey === 'study' && ch.id !== 'quiet' ? [t('study/' + ch.id + '.mp3')] : []) };
    const tree = buildStudies({
      studies: [
        { id: 'lamb', title: 'The Lamb', chapters: [{ id: 'supper', title: 'The Supper' }, { id: 'quiet', title: 'Text only' }, { id: 'thorns', title: 'Thorns' }] },
        { id: 'empty', title: 'Empty', chapters: [{ id: 'quiet', title: 'Text only' }] },
      ],
      player: studyPlayer,
    });
    expect(tree.children.map((c) => [c.id, c.title])).toEqual([['study:lamb', 'The Lamb']]);
    expect(tree.units.map((u) => u.id)).toEqual(['study:supper', 'study:thorns']);
    expect(tree.units[0].name).toBe('The Supper');
  });
});

describe('download-tree: ticks', () => {
  it('a parent with mixed children is "some"; all ticked is "all"; none is "none"', () => {
    const v1 = tvot().children[0];
    expect(checkState(v1, new Set())).toBe('none');
    expect(checkState(v1, new Set(['v1:warning']))).toBe('some');
    expect(checkState(v1, new Set(['v1:warning', 'v1:christmas', 'v1:chosen']))).toBe('all');
  });
  it('a tap on a dash selects everything under it; a tap on a tick clears it', () => {
    const tree = tvot();
    const some = new Set(['v1:warning', 'v2:one']);
    const all = toggleNode(tree.children[0], some);
    expect(checkState(tree.children[0], all)).toBe('all');
    expect(all.has('v2:one')).toBe(true);
    const none = toggleNode(tree.children[0], all);
    expect(checkState(tree.children[0], none)).toBe('none');
    expect(none.has('v2:one')).toBe(true);
  });
  it('a range ticks every chapter between its ends, in either order, and keeps what was ticked', () => {
    const units = Array.from({ length: 12 }, (_, i) => ({ id: 'c' + (i + 1), title: '', name: '', tracks: [], chapter: i + 1 }));
    const r = selectRange(units, 'c11', 'c1', new Set(['c12']));
    expect([...r].sort()).toEqual(['c1', 'c10', 'c11', 'c12', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'].sort());
    expect(selectRange(units, 'c1', 'nope', new Set()).size).toBe(0);
  });
  it('the screen opens with what is on the phone or on its way ticked; a letter with one part saved is not', () => {
    const off = fakeStore({ 'v1/warning.mp3': ['saved', 3e6], 'v1/xmas-1.mp3': ['saved', 5e6], 'v2/one.mp3': ['queued', 7e6] });
    expect([...initialWanted(off, tvot().units)]).toEqual(['v1:warning', 'v1:warning@B', 'v2:one', 'v2:one@B']);
  });
  // dl-rework D: the store keeps a failure to try again by itself; the letter is still on its way, not unticked.
  it('one on the store\'s will-try-again list stays ticked', () => {
    const off = fakeStore({ 'v2/one.mp3': ['failed', 7e6] });
    expect(initialWanted(off, tvot().units).has('v2:one')).toBe(true);
  });
  // dl-rework A (defect 21): a letter with part of it on the phone said nothing.
  it('part of a letter on the phone reads "k of n parts"', () => {
    const off = fakeStore({ 'v1/xmas-1.mp3': ['saved', 5e6] });
    const xmas = tvot().units[1];
    expect(partsOnPhone(off, xmas)).toEqual({ k: 1, n: 2 });
    expect(unitOnPhone(off, xmas)).toBe(false);
  });
  it('a unit on its way is not added again; unticked, it is removed (its saved parts freed, none counted twice)', () => {
    const off = fakeStore({ 'v1/xmas-1.mp3': ['saved', 5e6], 'v1/xmas-2.mp3': ['downloading', 6e6], 'v2/one.mp3': ['queued', 7e6] });
    const units = tvot().units;
    const kept = planOf(off, units, new Set(['v1:christmas', 'v2:one']));
    expect(kept.add).toHaveLength(0);
    const dropped = planOf(off, units, new Set());
    expect(dropped.remove.map((u) => u.id)).toEqual(['v1:christmas', 'v2:one']);
    expect(dropped.removeBytes).toBe(5e6);
  });
});

// dl-rework A (defects 2, 3, 6): a reading is a thing of its own; what is on the phone never depends on the voice.
describe('download-tree: readings', () => {
  const tim = () => buildTvot({ collections, itemsOf: (col) => (col.volKey === 'empty' ? [] : items[col.volKey]), player, voice: 'T' });
  it('a letter saved in one voice is on the phone under any voice, and says which reader', () => {
    const off = fakeStore({ 'v1/xmas-1.mp3': ['saved', 5e6], 'v1/xmas-2.mp3': ['saved', 6e6] });
    const xmas = tim().units[1];
    expect(xmas.reader).toBe('T');
    expect(unitOnPhone(off, xmas)).toBe(true);
    expect(unitHeld(off, xmas)).toBe(true);
    expect(heldReaders(off, xmas)).toEqual(['B']);
    // Choosing Timothy adds nothing and removes nothing for it.
    const units = tim().units;
    const p = planOf(off, units, initialWanted(off, units), undefined, 'T');
    expect(p.add).toHaveLength(0);
    expect(p.remove).toHaveLength(0);
  });
  it('one reading can be added beside another, and removed by itself', () => {
    const off = fakeStore({ 'v1/xmas-1.mp3': ['saved', 5e6], 'v1/xmas-2.mp3': ['saved', 6e6], 'v1/christmas-tim.mp3': ['none', 4e6] });
    const units = tim().units;
    const xmas = units[1];
    let wanted = initialWanted(off, units);
    wanted = toggleReading(xmas, 'T', wanted);
    let p = planOf(off, units, wanted, undefined, 'T');
    expect(p.add.map((u) => [u.id, u.reader])).toEqual([['v1:christmas', 'T']]);
    expect(p.addBytes).toBe(4e6);
    expect(p.remove).toHaveLength(0);
    wanted = toggleReading(xmas, 'B', wanted);   // Benjamin's off, Timothy's on: only Benjamin's goes
    p = planOf(off, units, wanted, undefined, 'T');
    expect(p.remove.map((u) => [u.id, u.reader])).toEqual([['v1:christmas', 'B']]);
    expect(p.removeBytes).toBe(11e6);
    expect(wanted.has('v1:christmas')).toBe(true);
    wanted = toggleReading(xmas, 'T', wanted);   // the last reading off: the letter is unticked
    expect(wanted.has('v1:christmas')).toBe(false);
  });
  it('a tap on another reading of a letter ticked for its fetched one adds to it; a tap on the fetched one unticks it', () => {
    const units = tim().units;
    const xmas = units[1];
    const ticked = new Set(['v1:christmas']);   // fetches Timothy's
    const both = toggleReading(xmas, 'B', ticked);
    expect(planOf(fakeStore({}), units, both, undefined, 'T').add.map((u) => u.reader)).toEqual(['B', 'T']);
    expect(toggleReading(xmas, 'T', ticked).has('v1:christmas')).toBe(false);
  });
  it('a ticked letter with no reading ticked fetches the chosen voice, or its default where the voice has none', () => {
    const units = tim().units;
    const p = planOf(fakeStore({}), units, new Set(['v1:christmas', 'v1:chosen']), undefined, 'T');
    expect(p.add.map((u) => [u.id, u.reader, u.fallback])).toEqual([['v1:christmas', 'T', false], ['v1:chosen', 'B', true]]);
  });
  it('unticking a letter takes every reading of it away', () => {
    const off = fakeStore({ 'v1/xmas-1.mp3': ['saved', 5e6], 'v1/xmas-2.mp3': ['saved', 6e6], 'v1/christmas-tim.mp3': ['saved', 4e6] });
    const units = tim().units;
    const wanted = toggleNode({ units: [units[1]] }, initialWanted(off, units));
    expect([...wanted].some((id) => id.startsWith('v1:christmas'))).toBe(false);
    expect(planOf(off, units, wanted).remove.map((u) => u.reader)).toEqual(['B', 'T']);
  });
  it('the confirm sheet keeps each reading it was given', () => {
    const units = tim().units;
    const both = [{ ...units[1], reader: 'B' }, { ...units[1], reader: 'T' }];
    const g = groupPicked([{ id: 'v1', title: 'Volume One', noun: /** @type {'recording'} */ ('recording'), units }], both);
    expect(g[0].units.map((u) => u.reader)).toEqual(['B', 'T']);
  });
  // dl-rework F: no stored id changes. What a phone saved before (keyed by URL, `key` = the letter) is found again.
  it('recordings saved before the readings rework are recognised as they were: ticked, on the phone, by reader', () => {
    const before = fakeStore({ 'v1/warning.mp3': ['saved', 3e6], 'v1/christmas-tim.mp3': ['saved', 4e6] });
    const units = buildTvot({ collections, itemsOf: (col) => (col.volKey === 'empty' ? [] : items[col.volKey]), player, voice: '' }).units;
    const w = initialWanted(before, units);
    expect([...w]).toEqual(['v1:warning', 'v1:warning@B', 'v1:christmas', 'v1:christmas@T']);
    expect(heldReaders(before, units[1])).toEqual(['T']);
    expect(planOf(before, units, w).add).toHaveLength(0);
  });
});

describe('download-tree: the plan', () => {
  const off = fakeStore({
    'v1/warning.mp3': ['saved', 3e6], 'v1/xmas-1.mp3': ['saved', 5e6], 'v1/xmas-2.mp3': ['none', 6e6],
    'v1/chosen.mp3': ['saved', 10e6], 'v2/one.mp3': ['none', 7e6],
  });
  const secs = (/** @type {string} */ u) => ({ 'v1/xmas-1.mp3': 400, 'v1/xmas-2.mp3': 440, 'v2/one.mp3': 300 })[u] ?? null;
  it('adds the ticked units not on the phone (only their missing parts cost bytes) and removes the unticked ones', () => {
    const units = tvot().units;
    const wanted = new Set(['v1:warning', 'v1:christmas', 'v2:one']);
    const p = planOf(off, units, wanted, secs);
    expect(p.add.map((u) => u.id)).toEqual(['v1:christmas', 'v2:one']);
    expect(p.addBytes).toBe(13e6);
    expect(p.addSeconds).toBe(1140);
    expect(p.remove.map((u) => u.id)).toEqual(['v1:chosen']);
    expect(p.removeBytes).toBe(10e6);
  });
  it('an unknown size leaves the total open; an untimed one leaves the length out', () => {
    const p = planOf(fakeStore({}), tvot().units, new Set(['v2:one']), () => null);
    expect(p.addBytes).toBeNull();
    expect(p.addKnown).toBe(0);
    expect(p.addSeconds).toBeNull();
  });
  it('nothing changed adds and removes nothing', () => {
    const units = tvot().units;
    const p = planOf(off, units, initialWanted(off, units));
    expect(p.add).toHaveLength(0);
    expect(p.remove).toHaveLength(0);
  });
  it('room: removals free space first, the margin is kept, unknown free space never blocks', () => {
    expect(roomShort(1000, 900, 0, 200)).toBe(100);
    expect(roomShort(1000, 900, 100, 200)).toBe(0);
    expect(roomShort(-1, 9e9, 0, 200)).toBe(0);
  });
  it('the confirm sheet names a whole group by its name and part of a book by its chapter runs', () => {
    const units = Array.from({ length: 30 }, (_, i) => ({ id: 'g' + (i + 1), title: '', name: '', tracks: [], chapter: i + 1 }));
    const genesis = { id: 'gen', title: 'Genesis', noun: /** @type {'chapter'} */ ('chapter'), units };
    const v3 = { id: 'v3', title: 'Volume Three', noun: /** @type {'recording'} */ ('recording'), units: [{ id: 'x', title: '', name: '', tracks: [] }] };
    const picked = [...units.slice(12, 24), v3.units[0]];
    expect(groupPicked([v3, genesis], picked).map((g) => g.label)).toEqual(['Volume Three', 'Genesis 13-24']);
    expect(groupPicked([genesis], units).map((g) => g.label)).toEqual(['Genesis']);
    expect(groupPicked([{ ...genesis, suffix: 'KJV · BRM' }], units.slice(0, 2)).map((g) => g.label)).toEqual(['Genesis 1-2 · KJV · BRM']);
  });
});

describe('download-tree: words', () => {
  it('chapter runs, counts and lengths', () => {
    expect(chapterRuns([3, 1, 2, 7, 9, 10])).toBe('1-3, 7, 9-10');
    expect(countOf(1, 'recording')).toBe('1 recording');
    expect(countOf(1189, 'chapter')).toBe('1,189 chapters');
    expect(formatLength(22200)).toBe('6 h 10 min');
    expect(formatLength(3300)).toBe('55 min');
    expect(formatLength(7200)).toBe('2 h');
    expect(formatLength(20)).toBe('under a minute');
    expect(formatLength(null)).toBe('');
  });
});
