// @ts-nocheck — builds a stand-in meaning pack with node buffers (engine-meaning.test.js's pattern).
/* THE MODEL'S LEAD AGREES WITH THE RARE WORDS (search200 sweep, meaning-fusion). meaningFirst gave the model's first a
   fixed lead (MEANING_SURE_LEAD) when it led the model's next text by MEANING_SURE in cosine, and none below that. Two
   faults of one cause, the lead read apart from what the typed words say:
   - a clear first lacking the one rare typed word the words' first holds (a word few texts say, so a strong sign of
     the text meant), while the model itself rates that text nearly as high, still led;
   - a first that leads by a little less than MEANING_SURE, and holds a rare typed word, lost to the words' order of
     texts holding only the common words.
   Fixture texts only (no bench query). */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { VotSearchMini as E } from './engine.js';
import { configureSemantic, startSemantic, resetSemantic } from './semantic.js';

const VOT_DATA = {
  STOP_WORDS_TRIMMED: new Set(['the', 'of', 'and', 'is', 'my', 'a', 'to', 'in', 'he', 'that', 'his', 'for', 'i', 'you', 'it', 'not', 'will', 'your', 'now', 'before', 'who', 'me', 'shall', 'its', 'are', 'on', 'at', 'by', 'all', 'their', 'were', 'when', 'was', 'they', 'them', 'with', 'from', 'where', 'there']),
  SYNONYM_MAP: {}, BOOK_ABBREVS: {}, BOOK_DISPLAY: {}, NAMED_PASSAGES: [], NAMED_PASSAGE_INDEX: {}, COMMANDS: [], COMMAND_MAP: {},
  VOLUME_TOKEN_MAP: {},
  VOLUME_COLLECTIONS: [{ id: 'v1', screen: 'vot-one-letter', dataVar: 'LETTERS_V1', prefaceVar: null, label: 'Volume One' }],
  OT_BOOK_IDS: [], NT_BOOK_IDS: [], GENRE_GROUPS: {}, WORD_NUMS: {}, ROMAN_NUMS: {},
};
const letter = (id, num, title, v) => ({ id, num, title, blocks: [{ segments: [{ v }] }] });
// Common words: each said by many texts (the fillers), so none is a sign of one text.
const COMMON = ['fishermen', 'harbor', 'storm', 'boats', 'nets', 'village', 'mourned', 'brothers', 'sons'];
const fillers = Array.from({ length: 120 }, (_, k) => letter('fill' + k, 100 + k, 'Days ' + k,
  `The ${COMMON[k % 9]} and the ${COMMON[(k + 2) % 9]} were spoken of again, and the ${COMMON[(k + 4) % 9]} and the ${COMMON[(k + 6) % 9]} too, and the seasons turned over the hills. Day ${k}.`));
const GLOBALS = {
  BOOKS: {},
  LETTERS_V1: [
    // 1. the words' first: the one text saying the rare "capsized", beside a common word
    letter('capsized', 1, 'Gone Under', 'Hear Me: the small craft capsized beside the harbor wall in the night, and none could pull it up again.'),
    // the model's first, saying only common words of the query
    letter('fleet', 2, 'The Fleet', 'The fishermen went out in the storm and mourned what the sea took, says The Lord, for their labor was long.'),
    // the model's second
    letter('tide', 3, 'The Tide', 'The tide comes in and goes out, and the moon draws it, and the shore is washed.'),
    // 2. the words' first, and the model's second: common words of the query, many of them
    letter('kin', 4, 'Kin', 'His brothers and his sons left the village, and the nets lay idle, and the boats rotted on the sand, and they mourned.'),
    // the model's first, a little ahead: the rare "spurned" beside one common word, far down the words' order
    letter('spurned', 5, 'Spurned', 'My servant grieves, for his own brothers have spurned the words I gave him; yet I am with him, says The Lord.'),
    // a model's first saying no rare word: one common one
    letter('quiet', 6, 'Quiet Days', 'His sons grew up and the quiet days went by, and the old man kept his garden.'),
    // a rare word is said by a few texts (here 26 in all), not by one alone
    ...Array.from({ length: 25 }, (_, k) => letter('scorn' + k, 300 + k, 'Scorn ' + k, `The proud spurned the counsel of the wise in the year ${k}, and went their own way.`)),
    ...fillers,
  ],
};
// the stand-in model's passages: the texts above, and ten fillers (what it ranks below its top when told so)
const UNITS = [[0, 'capsized'], [1, 'fleet'], [2, 'tide'], [3, 'kin'], [4, 'spurned'], [5, 'quiet'], ...Array.from({ length: 10 }, (_, k) => [6 + k, 'fill' + k])];
const KEYS = UNITS.map((u) => 'v1/' + u[1]);
const FAR = Object.fromEntries(Array.from({ length: 10 }, (_, k) => ['fill' + k, 0.05]));
/** What the stand-in model says the query means: {unit name: weight} (the query vector, normalised by semantic.js). */
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
/** The cosine lead of the first named over the second, once semantic.js normalises the query vector. */
const lead = (w) => { const n = Math.hypot(...Object.values(w)); const [a, b] = Object.values(w); return (a - b) / n; };
const ids = (r) => r.results.map((x) => x.doc.letterId);

describe("the model's lead agrees with the rare typed words (search200 sweep, meaning-fusion)", () => {
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

  const Q1 = 'fishermen grieving when the boats capsized by the harbor';
  it("a clear first lacking the rare word the words' first holds, which the model rates nearly as high, does not lead", async () => {
    said.near = { fleet: 1, capsized: 0.93, tide: 0.5 };
    expect(lead(said.near)).toBeGreaterThan(0.04);
    expect(lead(said.near)).toBeLessThan(0.06);
    const r = ids(await E.search(Q1));
    expect(r[0]).toBe('capsized');
    expect(r).toContain('fleet');
  });

  it('...but the clear first leads when the model rates that text well below it', async () => {
    said.near = { fleet: 1, capsized: 0.88, tide: 0.5 };
    expect(lead(said.near)).toBeGreaterThan(0.06);
    expect(ids(await E.search(Q1))[0]).toBe('fleet');
    said.near = { fleet: 1, tide: 0.9, ...FAR };
    expect(ids(await E.search(Q1))[0]).toBe('fleet');
  });

  const Q2 = 'brothers and sons mourned because the village spurned the nets and boats';
  it('a first leading by a little less than MEANING_SURE, holding a rare typed word, leads', async () => {
    said.near = { spurned: 1, kin: 0.95 };
    const l = lead(said.near);
    expect(l).toBeGreaterThan(0.025);
    expect(l).toBeLessThan(0.04);
    expect(ids(await E.search(Q2))[0]).toBe('spurned');
  });

  it('...but one holding no rare typed word does not', async () => {
    said.near = { quiet: 1, kin: 0.95 };
    expect(ids(await E.search(Q2))[0]).toBe('kin');
  });

  it('...nor one leading by less than that', async () => {
    said.near = { spurned: 1, kin: 0.98 };
    expect(lead(said.near)).toBeLessThan(0.025);
    expect(ids(await E.search(Q2))[0]).toBe('kin');
  });
});
