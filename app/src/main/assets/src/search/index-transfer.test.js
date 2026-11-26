/* The warm index handed over in parts (sr9, 2026-10-14): what the page assembles from the worker's parts
   is the index MiniSearch.loadJSON makes from the same JSON, and no part is large. */
import { describe, it, expect, vi } from 'vitest';
import MiniSearch from './vendor/minisearch.js';
import { postIndexParts, postIndexMaps, indexAssembler, indexJSONParts } from './index-transfer.js';

const OPTIONS = { fields: ['title', 'text'], storeFields: ['title', 'text', 'kind'], idField: 'id' };
const WORDS = ['grace', 'mercy', 'shepherd', 'still', 'waters', 'righteous', 'flourish', 'cedar', 'lebanon', 'love'];
const docs = Array.from({ length: 9000 }, (_, i) => ({
  id: 'd' + i,
  kind: i % 50 === 0 ? 'letter' : 'verse',
  title: i % 50 === 0 ? 'Letter ' + i : '',
  // a few long texts, as letters are, among many short ones
  text: Array.from({ length: i % 50 === 0 ? 4000 : 20 }, (_, k) => WORDS[(i * 3 + k * 7) % WORDS.length] + (k % 9 === 8 ? '.' : '')).join(' ') + ' w' + i,
}));

function handOver(json) {
  const msgs = [];
  postIndexParts(JSON.parse(json), (m) => msgs.push(m));
  let asm = null;
  for (const m of msgs) {
    if (m.head) asm = indexAssembler(MiniSearch, m.head, OPTIONS);
    else /** @type {any} */ (asm).add(m.part, m.entries);
  }
  return { ms: /** @type {any} */ (asm).ms, msgs };
}

describe('index-transfer', () => {
  const built = new MiniSearch(OPTIONS);
  built.addAll(docs);
  built.discard('d7'); // a discarded document: dirtCount and the maps' gaps travel too
  const json = JSON.stringify(built);

  it('assembles the index loadJSON makes', () => {
    const { ms } = handOver(json);
    const loaded = MiniSearch.loadJSON(json, OPTIONS);
    expect(JSON.stringify(ms)).toBe(JSON.stringify(loaded));
    for (const q of ['shepherd waters', 'cedar', 'letter 450', 'w8999']) {
      expect(ms.search(q).map((r) => r.id)).toEqual(loaded.search(q).map((r) => r.id));
    }
    expect(ms.getStoredFields('d50')).toEqual(loaded.getStoredFields('d50'));
  });

  it('posts parts small enough to receive in a short task', () => {
    const { msgs } = handOver(json);
    expect(msgs[0].head).toBeTruthy();
    expect(msgs.length).toBeGreaterThan(10);
    for (const m of msgs.slice(1)) expect(JSON.stringify(m).length, m.part).toBeLessThan(600000);
  });
});

/* A built index handed over as its own maps (search200 h8, 2026-11-04): what the page assembles from them, cloned as
   postMessage clones them, is the index a restore of its JSON makes, and no part is large. */
describe('postIndexMaps', () => {
  const built = new MiniSearch(OPTIONS);
  built.addAll(docs);
  built.discard('d7');

  it('assembles the index loadJSON makes of its JSON, in parts of the same sizes', () => {
    const msgs = /** @type {any[]} */ ([]);
    postIndexMaps(built, (m) => msgs.push(structuredClone(m)));
    expect(msgs[0].head.maps).toBe(true);
    let asm = /** @type {any} */ (null);
    for (const m of msgs) {
      if (m.head) asm = indexAssembler(MiniSearch, m.head, OPTIONS);
      else asm.add(m.part, m.entries);
    }
    const loaded = MiniSearch.loadJSON(JSON.stringify(built), OPTIONS);
    expect(JSON.stringify(asm.ms)).toBe(JSON.stringify(loaded));
    for (const q of ['shepherd waters', 'cedar', 'letter 450', 'w8999']) expect(asm.ms.search(q).map((/** @type {any} */ r) => r.id)).toEqual(loaded.search(q).map((r) => r.id));
    expect(msgs.length).toBeGreaterThan(10);
    for (const m of msgs.slice(1)) expect(JSON.stringify(m.part === 'index' ? m.entries.map((/** @type {any} */ [t, f]) => [t, [...f].map(([k, v]) => [k, [...v]])]) : m.entries).length, m.part).toBeLessThan(600000);
  });
});

/* The warm index written a slice at a time (measure:s22, 2026-10-29): JSON.stringify(ms) was one ~580 ms task on
   the S22 after a cold build. The parts, joined, are the JSON it writes, and a write another index overtook stops. */
describe('indexJSONParts', () => {
  const built = new MiniSearch(OPTIONS);
  built.addAll(docs);
  built.discard('d7');

  it('writes, a slice at a time, the JSON JSON.stringify writes', async () => {
    let t = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => (t += 1));   // 1 ms a reading
    let turns = 0;
    try {
      const parts = /** @type {string[]} */ (await indexJSONParts(built, { sliceMs: 8, turn: async () => { turns++; } }));
      expect(parts.length).toBeGreaterThan(10);
      expect(turns).toBe(parts.length - 1);
      const json = parts.join('');
      expect(JSON.parse(json)).toEqual(JSON.parse(JSON.stringify(built)));
      const loaded = MiniSearch.loadJSON(json, OPTIONS);
      for (const q of ['shepherd waters', 'cedar', 'letter 450', 'w8999']) {
        expect(loaded.search(q).map((r) => r.id)).toEqual(built.search(q).map((r) => r.id));
      }
    } finally { clock.mockRestore(); }
  });

  it('is dropped when another index comes in', async () => {
    let t = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => (t += 1));
    try {
      expect(await indexJSONParts(built, { sliceMs: 8, turn: async () => {}, live: () => false })).toBeNull();
    } finally { clock.mockRestore(); }
  });
});

/* Edge cases (votreader-tests-7 item 5): empty indexes, stored fields without text, legacy v1 JSON,
   unknown parts, and indexJSONParts defaults / late drops. Small indexes throughout — the 9000-doc
   suites above already prove the part sizes. */
describe('index-transfer edges', () => {
  const smallDocs = [
    { id: 'a', kind: 'verse', title: '', text: 'grace and mercy' },
    { id: 'b', kind: 'verse', title: '', text: 'still waters' },
    { id: 'c', kind: 'letter', title: 'Letter c', text: 'cedar of lebanon' },
  ];

  function smallIndex() {
    const ms = new MiniSearch(OPTIONS);
    ms.addAll(smallDocs);
    return ms;
  }

  it('hands over an empty index as the head alone (JSON parts)', () => {
    const empty = new MiniSearch(OPTIONS);
    const json = JSON.stringify(empty);
    const msgs = /** @type {any[]} */ ([]);
    postIndexParts(JSON.parse(json), (m) => msgs.push(m));
    expect(msgs).toHaveLength(1);
    const asm = indexAssembler(MiniSearch, msgs[0].head, OPTIONS);
    expect(JSON.stringify(asm.ms)).toBe(JSON.stringify(MiniSearch.loadJSON(json, OPTIONS)));
  });

  it('hands over an empty index as the head alone (maps)', () => {
    const empty = new MiniSearch(OPTIONS);
    const msgs = /** @type {any[]} */ ([]);
    postIndexMaps(empty, (m) => msgs.push(structuredClone(m)));
    expect(msgs).toHaveLength(1);
    const asm = indexAssembler(MiniSearch, msgs[0].head, OPTIONS);
    expect(JSON.stringify(asm.ms)).toBe(JSON.stringify(MiniSearch.loadJSON(JSON.stringify(empty), OPTIONS)));
  });

  it('posts stored fields that carry no text (JSON parts)', () => {
    const js = JSON.parse(JSON.stringify(smallIndex()));
    delete js.storedFields['0'].text;
    js.storedFields['1'].text = 42;
    js.storedFields['2'] = null;
    const msgs = /** @type {any[]} */ ([]);
    postIndexParts(js, (m) => msgs.push(m));
    let asm = /** @type {any} */ (null);
    for (const m of msgs) {
      if (m.head) asm = indexAssembler(MiniSearch, m.head, OPTIONS);
      else asm.add(m.part, m.entries);
    }
    expect(JSON.stringify(asm.ms)).toBe(JSON.stringify(MiniSearch.loadJS(js, OPTIONS)));
  });

  it('posts stored fields that carry no text (maps)', () => {
    const noText = { fields: ['title', 'text'], storeFields: ['title', 'kind'], idField: 'id' };
    const ms = new MiniSearch(noText);
    ms.addAll(smallDocs);
    const msgs = /** @type {any[]} */ ([]);
    postIndexMaps(ms, (m) => msgs.push(structuredClone(m)));
    let asm = /** @type {any} */ (null);
    for (const m of msgs) {
      if (m.head) asm = indexAssembler(MiniSearch, m.head, noText);
      else asm.add(m.part, m.entries);
    }
    expect(JSON.stringify(asm.ms)).toBe(JSON.stringify(MiniSearch.loadJSON(JSON.stringify(ms), noText)));
  });

  it('assembles a legacy version-1 index', () => {
    const js = JSON.parse(JSON.stringify(smallIndex()));
    js.serializationVersion = 1;
    js.index = js.index.map(([term, data]) => [term, Object.fromEntries(Object.entries(data).map(([f, freqs]) => [f, { ds: freqs }]))]);
    const msgs = /** @type {any[]} */ ([]);
    postIndexParts(js, (m) => msgs.push(m));
    let asm = /** @type {any} */ (null);
    for (const m of msgs) {
      if (m.head) asm = indexAssembler(MiniSearch, m.head, OPTIONS);
      else asm.add(m.part, m.entries);
    }
    const loaded = MiniSearch.loadJS(js, OPTIONS);
    expect(JSON.stringify(asm.ms)).toBe(JSON.stringify(loaded));
    expect(asm.ms.search('cedar').map((/** @type {any} */ r) => r.id)).toEqual(['c']);
  });

  it('refuses an unknown part in either mode', () => {
    const jsonMsgs = /** @type {any[]} */ ([]);
    postIndexParts(JSON.parse(JSON.stringify(smallIndex())), (m) => jsonMsgs.push(m));
    const jsonAsm = indexAssembler(MiniSearch, jsonMsgs[0].head, OPTIONS);
    expect(() => jsonAsm.add('bogus', [])).toThrow('index-transfer: unknown part bogus');
    const mapMsgs = /** @type {any[]} */ ([]);
    postIndexMaps(smallIndex(), (m) => mapMsgs.push(m));
    const mapsAsm = indexAssembler(MiniSearch, mapMsgs[0].head, OPTIONS);
    expect(() => mapsAsm.add('bogus', [])).toThrow('index-transfer: unknown part bogus');
  });

  it('writes JSON with the default live, slice and turn', async () => {
    const ms = smallIndex();
    const parts = /** @type {string[]} */ (await indexJSONParts(ms));
    expect(JSON.parse(parts.join(''))).toEqual(JSON.parse(JSON.stringify(ms)));
  });

  it('turns with the default timer when no turn is given', async () => {
    const fake = {
      _documentCount: 200,
      _nextId: 200,
      _documentIds: new Map(Array.from({ length: 200 }, (_, i) => [i, 'd' + i])),
      _fieldIds: { title: 0, text: 1 },
      _fieldLength: new Map(),
      _avgFieldLength: [1, 2],
      _storedFields: new Map(),
      _dirtCount: 0,
      _index: new Map(),
    };
    let t = 0;
    const clock = vi.spyOn(performance, 'now').mockImplementation(() => (t += 1));
    try {
      const parts = /** @type {string[]} */ (await indexJSONParts(fake, { sliceMs: 1 }));
      expect(parts.length).toBeGreaterThan(1);
      expect(JSON.parse(parts.join('')).documentCount).toBe(200);
    } finally { clock.mockRestore(); }
  });

  it('leaves out a member JSON leaves out (undefined)', async () => {
    const fake = {
      _documentCount: 2,
      _nextId: 2,
      _documentIds: new Map([[0, 'd0'], [1, undefined]]),
      _fieldIds: { title: 0, text: 1 },
      _fieldLength: new Map([[0, [1, 3]], [1, [0, 2]]]),
      _avgFieldLength: [0.5, 2.5],
      _storedFields: new Map([[0, { title: '', text: 'grace' }], [1, undefined]]),
      _dirtCount: 0,
      _index: new Map([['grace', new Map([[1, new Map([[0, 1]])]])]]),
    };
    const parts = /** @type {string[]} */ (await indexJSONParts(fake, { sliceMs: 8, turn: async () => {} }));
    const parsed = JSON.parse(parts.join(''));
    expect(parsed.documentIds).toEqual({ 0: 'd0' });
    expect(parsed.storedFields).toEqual({ 0: { title: '', text: 'grace' } });
  });

  it('is dropped in each later phase, not only the first', async () => {
    const entries = (/** @type {(i: number) => any} */ make) => new Map(Array.from({ length: 200 }, (_, i) => [i, make(i)]));
    const fake = {
      _documentCount: 200,
      _nextId: 200,
      _documentIds: entries((i) => 'd' + i),
      _fieldIds: { title: 0, text: 1 },
      _fieldLength: entries(() => [1, 2]),
      _avgFieldLength: [1, 2],
      _storedFields: entries((i) => ({ title: '', text: 't' + i })),
      _dirtCount: 0,
      _index: new Map(Array.from({ length: 200 }, (_, i) => ['w' + i, new Map([[1, new Map([[i, 1]])]])])),
    };
    // 1 ms a clock reading, 1 ms slices: a turn (and a live check) every 64 entries.
    // documentIds turns are live calls 1-3, fieldLength 4-6, storedFields 7-9, index 10-12.
    for (const failAt of [5, 8, 11]) {
      let t = 0;
      let calls = 0;
      const clock = vi.spyOn(performance, 'now').mockImplementation(() => (t += 1));
      try {
        const parts = await indexJSONParts(fake, { sliceMs: 1, turn: async () => {}, live: () => ++calls < failAt });
        expect(parts, `failAt ${failAt}`).toBeNull();
        expect(calls).toBe(failAt);
      } finally { clock.mockRestore(); }
    }
  });
});
