// @ts-nocheck — builds a stand-in meaning model with node buffers, as engine-meaning.test.js does.
/* A TITLE ADMITTED KEEPS ITS PLACE AMONG THE TEXTS HOLDING THE QUOTE (search200 R4, 2026-10-18). With the meaning model
   on, the texts B4 holds the quote in (its tier B) keep their own order against the model's: each takes back a slot one
   of them stood in. A title typed whole whose own text holds the quote too was one of those slots, and went back to
   its place in B4's order, below the lines holding the typed words more closely: the title the reader named came up
   fourth. What the admission placed keeps its place, as the slot loop's own note says. Fixture texts only (no bench
   query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { VotSearchMini as E } from './engine.js';
import { configureSemantic, startSemantic, resetSemantic } from './semantic.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'and', 'is', 'my', 'a', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'will', 'your', 'now', 'before', 'who', 'me', 'be', 'with', 'all']),
  SYNONYM_MAP: {}, BOOK_ABBREVS: {}, BOOK_DISPLAY: {}, NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v1', screen: 'vot-one-letter', dataVar: 'LETTERS_V1', prefaceVar: null, label: 'Volume One' }],
  OT_BOOK_IDS: [], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const filler = (n) => 'The Lord speaks to His people of many things, of the field and of the vineyard, of the sea and of the dry land. '.repeat(n);
const seg = (v) => [{ segments: [{ v }] }];
const GLOBALS = {
  BOOKS: {},
  LETTERS_V1: [
    // the title, its words typed in another order, and its own line holding fewer of them than the lines below
    { id: 'bread-title', num: 1, title: 'The Bread of the Hungry', blocks: seg(filler(3) + 'The hungry eat the good bread I give them. ' + filler(3)) },
    // lines holding the typed words in the typed order, a word of their own between two of them
    ...[2, 3, 4].map((num) => ({ id: 'city-' + num, num, title: 'Of the Cities ' + num, blocks: seg('Give to the hungry of the city the bread you have baked, says The Lord. ' + filler(1)) })),
    // texts holding none of the typed content words, so the small words weigh as little as they do in the volumes
    ...Array.from({ length: 12 }, (_, k) => ({ id: 'words-' + k, num: 10 + k, title: 'Words ' + k, blocks: seg(filler(2)) })),
    // the text the stand-in model means
    { id: 'garment', num: 5, title: 'All Things Pass', blocks: seg('Hear Me. The earth will grow old like a garment, and all its works shall be burned up.') },
  ],
};
const KEYS = ['v1/garment'];

function standInModel() {
  const units = Buffer.concat([
    Buffer.from(new Int8Array([127]).buffer), Buffer.from(new Float32Array([1 / 127]).buffer),
    Buffer.from(new Uint32Array([0]).buffer), Buffer.from(new Int32Array([0]).buffer),
  ]);
  const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
  const model = Buffer.from('stand-in');
  const man = { version: 1, model: 'm.onnx', modelSha256: sha(model), queryPrefix: '', dim: 1, count: 1, units: 'u.bin', unitsSha256: sha(units), ort: 'ort/', files: [], keys: KEYS };
  const files = { 'semantic/manifest.json': Buffer.from(JSON.stringify(man)), 'semantic/vocab.txt': Buffer.from('[PAD]\n'), 'semantic/u.bin': units, 'semantic/m.onnx': model, 'semantic/ort/ort-wasm-simd-threaded.wasm': Buffer.from(''), 'semantic/ort/ort-wasm-simd-threaded.mjs': Buffer.from('') };
  const ort = {
    env: { wasm: {} },
    Tensor: class {},
    InferenceSession: { create: async () => ({ inputNames: ['input_ids'], outputNames: ['h'], run: async () => ({ h: { data: new Float32Array([1]) } }) }) },
  };
  configureSemantic({
    url: (p) => 'mem:' + p,
    load: async (p) => { const b = files[p]; if (!b) throw new Error('missing ' + p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); },
    importModule: async () => ort,
  });
}
const ids = (r) => r.results.map((x) => x.doc.letterId || x.doc.ref);

describe('a title admitted keeps its place among the texts holding the quote (R4)', () => {
  let prev;
  beforeAll(async () => {
    prev = window.VotSearchData;
    window.VotSearchData = VOT_DATA;
    for (const k of Object.keys(GLOBALS)) globalThis[k] = GLOBALS[k];
    resetSemantic();
    await E.init();
    standInModel();
    await startSemantic();
  }, 60000);
  afterAll(() => {
    window.VotSearchData = prev;
    for (const k of Object.keys(GLOBALS)) delete globalThis[k];
    resetSemantic();
  });

  it('a title typed in another order, its own line holding the quote too, leads with the model on', async () => {
    const top = ids(await E.search('the hungry of the bread'));
    expect(top[0]).toBe('bread-title');
    expect(top.slice(1, 4).sort()).toEqual(['city-2', 'city-3', 'city-4']);
  });
});
