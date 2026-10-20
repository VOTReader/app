// @ts-nocheck — builds a stand-in meaning pack with node buffers (engine-meaning.test.js's pattern).
/* A QUOTE TYPED NEARLY RIGHT KEEPS ITS PLACE OVER AN UNSURE MEANING (search200 fix1, scope cause 5). Kept to a scope
   where the texts holding the typed run whole are hidden, the words' best passage in scope holds most of the quote
   (bestPassageFirst's held at or over ALIGN_HELD), and meaningFirst still lifted over it a text the model was not sure
   of (its first within MEANING_SURE of the next) holding fewer of the typed content words. The words' first goes back
   first when the meaning's is no sure pick, holds fewer typed content words and is not named; with the model sure, or
   the words holding little of the query, the meaning's order stands. Fixture texts only (no bench query). */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { VotSearchMini as E } from './engine.js';
import { configureSemantic, startSemantic, resetSemantic } from './semantic.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'and', 'is', 'my', 'a', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'will', 'your', 'now', 'before', 'who', 'me', 'shall', 'its', 'are', 'on', 'at', 'by', 'all']),
  SYNONYM_MAP: {}, BOOK_ABBREVS: {}, BOOK_DISPLAY: {}, NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [
    { id: 'v1', screen: 'vot-one-letter', dataVar: 'LETTERS_V1', prefaceVar: null, label: 'Volume One' },
    { id: 'v2', screen: 'vot-two-letter', dataVar: 'LETTERS_V2', prefaceVar: null, label: 'Volume Two' },
  ],
  OT_BOOK_IDS: [], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const QUERY = 'the cedar bends low under the morning wind says the lord';
const letter = (id, num, title, v) => ({ id, num, title, blocks: [{ segments: [{ v }] }] });
const GLOBALS = {
  BOOKS: {},
  LETTERS_V1: [
    // the words' find: most of the quote, its order not kept
    letter('near', 1, 'At First Light', 'Hear Me. At the rising of the morning wind the tall cedar bends to the ground and is low, says The Lord, and the valleys rest.'),
    // the model's unsure first, holding fewer of the typed words
    letter('meant', 2, 'The Courts of The House', 'The cedar stands green in the courts of the house, and its branches give shade to the birds of the air.'),
    // the model's second, a hair behind
    letter('other', 3, 'The Vine', 'The vine climbs over the wall of the house and its fruit hangs heavy in the late summer.'),
    ...Array.from({ length: 10 }, (_, k) => letter('day' + k, 10 + k, 'Days ' + k, 'The people went out to the fields at dawn and came home at dusk, and the seasons turned. '.repeat(3))),
  ],
  LETTERS_V2: [
    // the typed run, held whole outside the scope
    letter('held1', 1, 'The Wind', 'Hear this: the cedar bends low under the morning wind, says The Lord, and the hills sing.'),
    letter('held2', 2, 'The Hills', 'And again: the cedar bends low under the morning wind, says The Lord; the hills are glad.'),
  ],
};
const KEYS = ['v1/meant', 'v1/other', 'v2/held1', 'v2/held2'];
const UNITS = [[0, 'meant'], [1, 'other'], [2, 'held1'], [3, 'held2']];
/** What the stand-in model says the query means: {unit name: weight}. */
const said = { near: {} };
function meantVector() {
  const v = new Float32Array(UNITS.length);
  for (const [name, w] of Object.entries(said.near)) v[UNITS.findIndex((u) => u[1] === name)] = w;
  return v;
}
function standInModel() {
  const dim = UNITS.length;
  const q = new Int8Array(UNITS.flatMap((_, i) => UNITS.map((__, j) => (i === j ? 127 : 0))));
  const units = Buffer.concat([
    Buffer.from(q.buffer), Buffer.from(new Float32Array(UNITS.map(() => 1 / 127)).buffer),
    Buffer.from(new Uint32Array(UNITS.map((u) => u[0])).buffer), Buffer.from(new Int32Array(UNITS.map(() => 0)).buffer),
  ]);
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  const model = Buffer.from('stand-in');
  const man = { version: 1, model: 'm.onnx', modelSha256: sha(model), queryPrefix: '', dim, count: UNITS.length, units: 'u.bin', unitsSha256: sha(units), ort: 'ort/', files: [], keys: KEYS };
  const files = { 'semantic/manifest.json': Buffer.from(JSON.stringify(man)), 'semantic/vocab.txt': Buffer.from('[PAD]\n'), 'semantic/u.bin': units, 'semantic/m.onnx': model, 'semantic/ort/ort-wasm-simd-threaded.wasm': Buffer.from(''), 'semantic/ort/ort-wasm-simd-threaded.mjs': Buffer.from('') };
  const ort = {
    env: { wasm: {} },
    Tensor: class {},
    InferenceSession: { create: async () => ({ inputNames: ['input_ids'], outputNames: ['h'], run: async () => ({ h: { data: meantVector() } }) }) },
  };
  configureSemantic({
    url: (p) => 'mem:' + p,
    load: async (p) => { const b = files[p]; if (!b) throw new Error('missing ' + p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
    importModule: async () => ort,
  });
}
const ids = (r) => r.results.map((x) => x.doc.letterId);

describe('a quote typed nearly right keeps its place over an unsure meaning (search200 fix1 scope)', () => {
  let prev;
  beforeAll(async () => {
    prev = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
    resetSemantic();
    await E.init();
  }, 60000);
  afterAll(() => {
    window.VotSearchData = prev;
    for (const k of Object.keys(GLOBALS)) delete globalThis[k];
    resetSemantic();
  });
  beforeEach(async () => {
    standInModel();
    await startSemantic();
  });

  it('the model unsure between two texts: the words\' near-whole quote stays first in the scope', async () => {
    said.near = { meant: 1, other: 0.97 };
    expect(ids(await E.search(QUERY, { scope: { volumeId: 'v1' } }))[0]).toBe('near');
  });

  it('the model sure of its text: the meaning\'s first stands', async () => {
    said.near = { meant: 1, other: 0.5 };
    expect(ids(await E.search(QUERY, { scope: { volumeId: 'v1' } }))[0]).toBe('meant');
  });

  it('unscoped, a text holding the typed run whole leads', async () => {
    said.near = { meant: 1, other: 0.97 };
    expect(['held1', 'held2']).toContain(ids(await E.search(QUERY))[0]);
  });
});
