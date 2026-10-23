// @ts-nocheck — builds a stand-in meaning pack with node buffers (engine-meaning.test.js's pattern).
/* A QUESTION'S FRAME IS NOT ITS SUBJECT (search200 sweep, 2026-10-22). A short query opening with a question word or
   an auxiliary is read by its position: the lead words while they are frame words ("why should we", "is it wrong
   to", "what happens when") are the frame, the words after them its subject. Counted as subject words, the frame
   closed the gates that turn the meaning model off: a subject of a word or two made a keyword search, and a first
   result holding the frame with the subject in a row was a quote found. The gates read the subject. A question some
   text holds word for word, whole, is a quote; a first result holding the subject's words in a row is a quote found.
   Fixture texts only (no bench query). */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { VotSearchMini as E } from './engine.js';
import { configureSemantic, startSemantic, resetSemantic } from './semantic.js';

const VOT_DATA = {
  STOP_WORDS: new Set(['the', 'of', 'and', 'is', 'my', 'a', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'your', 'we', 'do', 'who',
    'what', 'why', 'should', 'will', 'how', 'can', 'are', 'on', 'at', 'by', 'all', 'him', 'they', 'them', 'these', 'as', 'when']),
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'and', 'is', 'my', 'a', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'your', 'we', 'do',
    'are', 'on', 'at', 'by', 'him', 'they', 'them', 'these', 'as']),
  SYNONYM_MAP: {}, BOOK_ABBREVS: {}, BOOK_DISPLAY: {}, NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v1', screen: 'vot-one-letter', dataVar: 'LETTERS_V1', prefaceVar: null, label: 'Volume One' }],
  OT_BOOK_IDS: [], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const letter = (id, num, title, v) => ({ id, num, title, blocks: [{ segments: [{ v }] }] });
const GLOBALS = {
  BOOKS: {},
  LETTERS_V1: [
    // the subject: fasting, said twice
    letter('fasting', 1, 'Humble Yourselves', 'Fast in secret and humble your soul; and when you fast, look not sad as the hypocrites do.'),
    // the frame with the subject, one word between ("how do we not fast")
    letter('frame', 2, 'The Tower', 'How do we go up to the tower? How do we not fast, and how do we keep the feast?'),
    // both words of a two-word subject, thick
    letter('lanterns', 3, 'The Lanterns', 'Evil lanterns and evil masks, evil upon evil, they carry at samhain; samhain lanterns everywhere.'),
    // what the stand-in model says the question means
    letter('meant', 4, 'The Night of The Dead', 'On the night of samhain the nations honor the dead and not the living.'),
    // a question some text holds word for word
    letter('quote', 5, 'On The Road', 'And on the road He asked them, Who do men say that I am? And they answered Him.'),
    letter('men', 6, 'The City', 'Men say many things, and the men of the city say that the king is coming; men say so.'),
    // a subject typed as a text holds it in a row
    letter('feasts', 7, 'The Feast Days', 'Keep the feast days of the Lord, the feast days appointed, and rest in the feast days.'),
    ...Array.from({ length: 10 }, (_, k) => letter('day' + k, 10 + k, 'Days ' + k, 'The people went out to the fields at dawn and came home at dusk, and the seasons turned. '.repeat(3))),
  ],
};
const UNITS = [[0, 'fasting'], [1, 'frame'], [2, 'lanterns'], [3, 'meant'], [4, 'quote'], [5, 'men'], [6, 'feasts']];
const KEYS = UNITS.map((u) => 'v1/' + u[1]);
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

describe('a question\'s frame is not its subject (search200 sweep)', () => {
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

  it('"how do we fast": a first holding the frame with the subject is no quote found, and the model is read', async () => {
    said.near = { fasting: 1 };
    expect(ids(await E.search('how do we fast'))[0]).toBe('fasting');
  });

  it('a first holding the subject\'s words in a row is still a quote found: the words\' order stands', async () => {
    said.near = { men: 1 };
    expect(ids(await E.search('what are the feast days'))[0]).toBe('feasts');
  });

  it('a subject of two words asked as a question is read by the model too (no keyword search)', async () => {
    said.near = { meant: 1 };
    expect(ids(await E.search('is samhain evil'))[0]).toBe('meant');
  });

  it('the same two words typed bare stay a keyword search: the words\' order stands', async () => {
    said.near = { meant: 1 };
    expect(ids(await E.search('samhain evil'))[0]).toBe('lanterns');
  });

  it('a question some text holds word for word is that quote', async () => {
    said.near = { men: 1 };
    expect(ids(await E.search('who do men say that i am'))[0]).toBe('quote');
  });
});
