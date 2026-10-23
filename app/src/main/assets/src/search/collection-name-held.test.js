// @ts-nocheck — builds a stand-in meaning model with node buffers, as engine-meaning.test.js does.
/* A COLLECTION'S NAME TYPED BESIDE A TITLE NAMES THE COLLECTION (main CI, 2026-10-22). A reader types a topic's title
   with its collection's name ("regarding israel answers only god can give"). The admission names the topic, typed
   whole. The collection's own front page is titled with that name and opens on it, so it held five of the seven typed
   words in a row, and B4 read it as the quote remembered with its slips. Kept as a quote found, it stood beside the
   title the reader named, and a meaning model sure of the front page put it first. The collection's words name the
   collection: a text holding the typed words only by them holds no quote. Fixture texts only (no bench query). */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { VotSearchMini as E } from './engine.js';
import { configureSemantic, startSemantic, resetSemantic } from './semantic.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'and', 'is', 'my', 'a', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'will', 'your', 'now', 'before', 'who', 'me', 'be', 'with', 'all', 'can']),
  SYNONYM_MAP: {}, BOOK_ABBREVS: {}, BOOK_DISPLAY: {}, NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v1', screen: 'vot-one-letter', dataVar: 'LETTERS_V1', prefaceVar: null, label: 'Volume One' }],
  OT_BOOK_IDS: [], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const filler = (n) => 'The Lord speaks to His people of many things, of the field and of the vineyard, of the sea and of the dry land. '.repeat(n);
// the Answers pages say their own words, so no letter reads as the text a topic reprints; each opens on its own line
const asked = (n) => 'Many have asked about this matter, and here is what was written. '.repeat(n);
const seg = (v) => [{ segments: [{ v }] }];
const GLOBALS = {
  BOOKS: {},
  LETTERS_V1: [
    // texts holding none of the typed words, so they weigh as they do in the volumes
    ...Array.from({ length: 12 }, (_, k) => ({ id: 'words-' + k, num: 10 + k, title: 'Words ' + k, blocks: seg(filler(2)) })),
  ],
  ANSWERS: [
    // the collection's own front page: titled with its name, and opening on it
    { id: 'front', num: 0, title: 'Answers Only God Can Give', paragraphs: [{ text: 'Answers Only God Can Give • The Lord sets the record straight concerning a variety of topics. ' + asked(3) }] },
    { id: 'regarding-israel', num: 1, title: 'Regarding Israel', paragraphs: [{ text: 'Who is Israel? Those who obey Me are My people Israel. ' + asked(4) }] },
    { id: 'regarding-divorce', num: 2, title: 'Regarding Divorce', paragraphs: [{ text: 'What God has joined, let no man separate. ' + asked(4) }] },
    { id: 'regarding-obedience', num: 3, title: 'Regarding Obedience', paragraphs: [{ text: 'Only obey, and give your heart to Me. ' + asked(4) }] },
  ],
};
// the model means the front page, and is sure of it
const KEYS = ['answers/front'];

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

describe("a collection's name typed beside a title names the collection", () => {
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

  it("a topic's title typed with its collection's name leads the collection's front page, the model sure of the page", async () => {
    expect(ids(await E.search('regarding israel answers only god can give'))[0]).toBe('regarding-israel');
    expect(ids(await E.search('regarding divorce answers only god can give'))[0]).toBe('regarding-divorce');
  });

  it("the collection's name typed alone still opens its front page", async () => {
    expect(ids(await E.search('answers only god can give'))[0]).toBe('front');
  });
});
