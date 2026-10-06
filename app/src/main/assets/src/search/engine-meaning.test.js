// @ts-nocheck — reads the shipped model files and builds stand-in packs with node buffers.
/* MEANING FIRST (engine.js meaningFirst, path to 500 step 1, 2026-10-05): with the on-device
   model ready, a query that shares no telling word with the passage it describes finds it and
   opens on the passage the model matched; a quote typed nearly right stays the words' find; and
   with the model not ready, search is the words engine alone. The model is a stand-in here
   (semantic.test.js runs the shipped one); what it "means" is set per test. */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { VotSearchMini } from './engine.js';
import { configureSemantic, startSemantic, resetSemantic } from './semantic.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'and', 'is', 'my', 'a', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'will', 'your', 'now', 'before', 'who', 'me']),
  SYNONYM_MAP: {}, BOOK_ABBREVS: {}, BOOK_DISPLAY: {}, NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v1', screen: 'vot-one-letter', dataVar: 'LETTERS_V1', prefaceVar: null, label: 'Volume One' }],
  // (the Answers are read by index-builder from globalThis.ANSWERS)
  OT_BOOK_IDS: [], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const CREATOR = 'Hear Me, says The Lord. Remember now your Creator in the days of your youth, before the difficult days come.';
// a letter long enough for its runs to be counted, and an Answers topic that reprints it after its own opening
const VINEYARD = 'Thus says The Lord: I planted a vineyard on a fruitful hill, and I dug it and cleared out its stones, and I built a tower in the midst of it, and I looked for it to bring forth good grapes, but it brought forth wild grapes; therefore I will take away its hedge and break down its wall, and it shall be trampled, and I will lay it waste, and I will command the clouds that they rain no rain upon it, says The Lord of hosts.';
const TOPIC_OPEN = 'Many have asked about fruit and fields and what is owed for them. ';
// a letter the typed words find at its opening, whose described passage sits further down
const REST_OPEN = 'Everyone come, and everyone come again, says the keeper of the gate. ';
const REST = REST_OPEN + 'The walls are high and the towers are many in that city. '.repeat(8) + 'Lay down the load you carry, and I will give you peace.';
const GLOBALS = {
  BOOKS: {},
  LETTERS_V1: [
    { id: 'garment', num: 1, title: 'All Things Pass', blocks: [{ segments: [{ v: 'Hear Me. The earth will grow old like a garment, and all its works shall be burned up, and old age arrives for all.' }] }] },
    { id: 'creator', num: 2, title: 'In the Days of Your Youth', blocks: [{ segments: [{ v: CREATOR }] }] },
    { id: 'silver', num: 3, title: 'The Silver Cord', blocks: [{ segments: [{ v: 'Hear Me. The silver cord is loosed and the golden bowl is broken, says The Lord.' }] }] },
    { id: 'vineyard', num: 4, title: 'The Vineyard', blocks: [{ segments: [{ v: VINEYARD }] }] },
    { id: 'rest', num: 5, title: 'The Gate', blocks: [{ segments: [{ v: REST }] }] },
  ],
  ANSWERS: [{ id: 'fields', num: 1, title: 'Regarding Fields', paragraphs: [{ text: TOPIC_OPEN + VINEYARD }] }],
};
const STARTS = { garment: 0, creator: CREATOR.indexOf('Remember'), silver: 0, fields: TOPIC_OPEN.length, gate: 0, peace: REST.indexOf('Lay down') };
const KEYS = ['v1/garment', 'v1/creator', 'v1/silver', 'answers/fields', 'v1/rest'];
/** Each passage: its document (index in KEYS), where it starts, and the name a test calls it by. */
const UNITS = [[0, 'garment'], [1, 'creator'], [2, 'silver'], [3, 'fields'], [4, 'gate'], [4, 'peace']];
/** What the stand-in model says the query means: the unit (by letter id) it is nearest. */
const said = { near: 'creator' };

function standInModel() {
  const dim = UNITS.length;
  const vecs = UNITS.map((_, i) => UNITS.map((__, j) => (i === j ? 1 : 0)));
  const q = new Int8Array(vecs.flatMap((v) => v.map((x) => x * 127)));
  const units = Buffer.concat([
    Buffer.from(q.buffer), Buffer.from(new Float32Array(UNITS.map(() => 1 / 127)).buffer),
    Buffer.from(new Uint32Array(UNITS.map((u) => u[0])).buffer), Buffer.from(new Int32Array(UNITS.map((u) => STARTS[u[1]])).buffer),
  ]);
  const sha = (/** @type {Buffer} */ b) => crypto.createHash('sha256').update(b).digest('hex');
  const model = Buffer.from('stand-in');
  const man = { version: 1, model: 'm.onnx', modelSha256: sha(model), queryPrefix: '', dim, count: UNITS.length, units: 'u.bin', unitsSha256: sha(units), ort: 'ort/', files: [], keys: KEYS };
  /** @type {Record<string, Buffer>} */
  const files = { 'semantic/manifest.json': Buffer.from(JSON.stringify(man)), 'semantic/vocab.txt': Buffer.from('[PAD]\n'), 'semantic/u.bin': units, 'semantic/m.onnx': model, 'semantic/ort/ort-wasm-simd-threaded.wasm': Buffer.from('') };
  const ort = {
    env: { wasm: {} },
    Tensor: class {},
    InferenceSession: { create: async () => ({ inputNames: ['input_ids'], outputNames: ['h'], run: async () => ({ h: { data: Float32Array.from(vecs[UNITS.findIndex((u) => u[1] === said.near)]) } }) }) },
  };
  configureSemantic({
    url: (p) => 'mem:' + p,
    load: async (p) => { const b = files[p]; if (!b) throw new Error('missing ' + p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
    importModule: async () => ort,
  });
}

const first = async (/** @type {string} */ q) => (await VotSearchMini.search(q)).results[0];

describe('meaning first', () => {
  /** @type {any} */ let prev;
  beforeAll(async () => {
    prev = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) /** @type {any} */ (globalThis)[k] = /** @type {any} */ (GLOBALS)[k];
    resetSemantic();
    await VotSearchMini.init();
  });
  afterAll(() => {
    window.VotSearchData = prev;
    for (const k of Object.keys(GLOBALS)) delete /** @type {any} */ (globalThis)[k];
    resetSemantic();
  });

  it('without the model, search is the words engine alone', async () => {
    const r = await first('honour the one who made you while still a child');
    expect(r.doc.letterId).not.toBe('creator');
  });

  it('with it, the passage the query describes leads, and opens where the model matched', async () => {
    standInModel();
    expect(await startSemantic()).toBe(true);
    said.near = 'creator';
    const r = await first('honour the one who made you while still a child');
    expect(r.doc.letterId).toBe('creator');
    expect(r.placeStart).toBe(STARTS.creator);
  });

  it('a reprint the meaning found gives its place to the original its matched passage copies', async () => {
    said.near = 'fields';
    const r = await first('a farmer whose crop went sour and so he gave up on his land');
    expect(r.doc.letterId).toBe('vineyard');
  });

  it('a text the words found opens on the passage the query describes, when the model clearly prefers it', async () => {
    said.near = 'peace';
    const r = await first('everyone come here so weary souls find rest after long labor');
    expect(r.doc.letterId).toBe('rest');
    expect(r.placeStart).toBe(STARTS.peace);
  });

  it('a quote typed nearly word for word stays the words’ find', async () => {
    said.near = 'silver';
    const r = await first('remember now your creator in the days of your youth');
    expect(r.doc.letterId).toBe('creator');
    expect(r.placeStart).toBeUndefined();
  });
});
