// @ts-nocheck — reads the shipped model files and builds stand-in packs with node buffers.
/* MEANING FIRST (engine.js meaningFirst, path to 500 step 1, 2026-10-05): with the on-device
   model ready, a query that shares no telling word with the passage it describes finds it and
   opens on the passage the model matched; a quote typed nearly right stays the words' find; and
   with the model not ready, search is the words engine alone. The model is a stand-in here
   (semantic.test.js runs the shipped one); what it "means" is set per test. */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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
// a letter the typed words find at its opening, whose described passage opens on a sentence that holds none of them
const HARVEST_OPEN = 'Bring the wheat, bring the sheaves, bring the barn doors near, says the steward. ';
const HARVEST = HARVEST_OPEN + 'The towers are many in that city. '.repeat(6) + 'The season turns at last. Gather My sheaves before the rain. The year is old.';
// a letter's heading: every Answers excerpt opens with one, and a letter with a second word in it holds one in its text
const HEADING = 'From The Lord, Our God and Savior The Word of The Lord Spoken to Timothy For The Lord’s Little Flock, and For All Those Who Have Ears to Hear';
const OBEY = 'Hear Me, O children: honor your father and your mother in all things that are right. Says The Lord. 3/2/06 ' +
  HEADING.replace('The Lord, Our God', 'YahuShua HaMashiach, Our Lord') + ' Thus says The Lord: My sons and daughters, walk in My ways and live.';
// an Answers topic reprinting two letters: the typed words sit thickest in the first's short line, the model matched the second.
// The excerpts sit apart, as in the topics (search200 B4's alignment, on by default, read two lines run together as one
// passage holding the typed words)
const KEEPERS = 'Thus says The Lord: Blessed are those who keep My Sabbath and My Commandments, for they are Mine.';
const WISDOM = 'For those who love Me obey My Commandments, and those who remember My Sabbaths honor Me and shall know Wisdom.';
const SABBATH = 'Many have asked about the day of rest. ' + KEEPERS + ' ✦ ' + 'The fields lie still under the evening sky. '.repeat(3) + WISDOM + ' ✦';
const WATCH = 'Stay awake through the night and guard the door, for the master returns at an hour no one expects. ✦ 1/29/05 ' + HEADING + ' The towers of the proud shall fall.';
const GLOBALS = {
  BOOKS: {},
  LETTERS_V1: [
    { id: 'garment', num: 1, title: 'All Things Pass', blocks: [{ segments: [{ v: 'Hear Me. The earth will grow old like a garment, and all its works shall be burned up, and old age arrives for all.' }] }] },
    { id: 'creator', num: 2, title: 'In the Days of Your Youth', blocks: [{ segments: [{ v: CREATOR }] }] },
    { id: 'silver', num: 3, title: 'The Silver Cord', blocks: [{ segments: [{ v: 'Hear Me. The silver cord is loosed and the golden bowl is broken, says The Lord.' }] }] },
    { id: 'vineyard', num: 4, title: 'The Vineyard', blocks: [{ segments: [{ v: VINEYARD }] }] },
    { id: 'rest', num: 5, title: 'The Gate', blocks: [{ segments: [{ v: REST }] }] },
    { id: 'harvest', num: 6, title: 'The Steward', blocks: [{ segments: [{ v: HARVEST }] }] },
    { id: 'obey', num: 7, title: 'Obey God', blocks: [{ segments: [{ v: OBEY }] }] },
    { id: 'keepers', num: 8, title: 'The Keepers', blocks: [{ segments: [{ v: KEEPERS }] }] },
    { id: 'wisdom', num: 9, title: 'The Word of Wisdom', blocks: [{ segments: [{ v: 'The fields lie still under the evening sky. '.repeat(12) + WISDOM }] }] },
    // a title, and a sentence past the first ones saying a word of its collection's name
    { id: 'strayed', num: 10, title: 'The Fold', blocks: [{ segments: [{ v: 'Where does a shepherd spend his days? Pray in like manner. For the one who strays from the flock shall not be forsaken.' }] }] },
  ],
  ANSWERS: [
    { id: 'fields', num: 1, title: 'Regarding Fields', paragraphs: [{ text: TOPIC_OPEN + VINEYARD }] },
    { id: 'lamps', num: 2, title: 'Regarding Lamps', paragraphs: [{ text: 'Many have asked about lamps and oil and the hour of the night watch.' }] },
    { id: 'watch', num: 3, title: 'Regarding the Night Watch', paragraphs: [{ text: WATCH }] },
    { id: 'sabbath', num: 4, title: 'Regarding the Day of Rest', paragraphs: [{ text: SABBATH }] },
  ],
};
const STARTS = { garment: 0, creator: CREATOR.indexOf('Remember'), silver: 0, fields: TOPIC_OPEN.length, gate: 0, peace: REST.indexOf('Lay down'),
  steward: 0, season: HARVEST.indexOf('The season'), lamps: 0, obey: 0, watch: 0, keepers: 0, wisdom: 0, sabbath: SABBATH.indexOf(WISDOM) };
const KEYS = ['v1/garment', 'v1/creator', 'v1/silver', 'answers/fields', 'v1/rest', 'v1/harvest', 'answers/lamps', 'v1/obey', 'answers/watch', 'v1/keepers', 'v1/wisdom', 'answers/sabbath'];
/** Each passage: its document (index in KEYS), where it starts, and the name a test calls it by. */
const UNITS = [[0, 'garment'], [1, 'creator'], [2, 'silver'], [3, 'fields'], [4, 'gate'], [4, 'peace'], [5, 'steward'], [5, 'season'], [6, 'lamps'], [7, 'obey'], [8, 'watch'], [9, 'keepers'], [10, 'wisdom'], [11, 'sabbath']];
/** What the stand-in model says the query means: the unit (by name) it is nearest, or how near it is to several ({name: weight}). */
/** @type {{near: string|Record<string, number>}} */
const said = { near: 'creator' };

/** The stand-in's query vector: one unit's, or a weighted mix (semantic.js scales it to unit length). */
function meantVector() {
  const v = new Float32Array(UNITS.length);
  const mix = typeof said.near === 'string' ? { [said.near]: 1 } : said.near;
  for (const [name, w] of Object.entries(mix)) v[UNITS.findIndex((u) => u[1] === name)] = w;
  return v;
}

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
  // Every test starts with the stand-in model ready (startSemantic is idempotent), so none leans on an earlier one
  // having started it: the file passes in any order (nw27, --sequence.shuffle).
  beforeEach(async () => {
    standInModel();
    await startSemantic();
  });

  it('without the model, search is the words engine alone', async () => {
    resetSemantic();
    const r = await first('honour the one who made you while still a child');
    expect(r.doc.letterId).not.toBe('creator');
  });

  it('with it, the passage the query describes leads, and opens where the model matched', async () => {
    resetSemantic();
    standInModel();
    expect(await startSemantic()).toBe(true);
    said.near = 'creator';
    const r = await first('honour the one who made you while still a child');
    expect(r.doc.letterId).toBe('creator');
    expect(r.placeStart).toBe(STARTS.creator);
  });

  /* THE MODEL CAN ARRIVE AFTER THE FIRST SEARCH (sr11 S22 look, 2026-10-15). The model starts once the page is idle,
     so a search typed in a session's first seconds runs on the words alone; the screen kept that list until the query
     changed ('stay alert because nobody knows when the lord will come back' led with an unrelated letter on the S22,
     the engine asked again led with "Keep Watch"). Such a search says the meaning comes later, and the screen can
     wait for the model without starting it. */
  it('a text search run before the model is ready says the meaning comes later; the wait for it starts nothing', async () => {
    resetSemantic();
    standInModel();
    said.near = 'creator';
    const q = 'honour the one who made you while still a child';
    const before = await VotSearchMini.search(q);
    expect(before.meaningLater).toBe(true);
    expect(before.results[0].doc.letterId).not.toBe('creator');
    let ready = false;
    const wait = VotSearchMini.whenMeaningReady().then((ok) => { ready = ok; });
    await new Promise((res) => setTimeout(res, 0));
    expect(ready).toBe(false);
    expect(VotSearchMini.meaningStatus().status).toBe('off');
    expect(await startSemantic()).toBe(true);
    await wait;
    expect(ready).toBe(true);
    const after = await VotSearchMini.search(q);
    expect(after.meaningLater).toBe(false);
    expect(after.results[0].doc.letterId).toBe('creator');
    // a quote the words find by themselves never waits on the model
    resetSemantic();
    expect((await VotSearchMini.search('"made you"')).meaningLater).toBe(false);
  });

  it('a reprint the meaning found gives its place to the original its matched passage copies', async () => {
    said.near = 'fields';
    const r = await first('a farmer whose crop went sour and so he gave up on his land');
    expect(r.doc.letterId).toBe('vineyard');
  });

  /* A LETTER'S HEADING IS NO ONE'S WORDS (sr11, 2026-10-15). The passage the model matched in an Answers topic ran on
     into the next excerpt's heading, and a letter holding a heading in its text (Volume Four's "Obey God") took the
     topic's place as its "original": it led searches about other things (benchmark t320, t401). */
  it("a reprint's passage that runs into the next excerpt's heading names no letter by that heading", async () => {
    said.near = 'watch';
    const r = await first('stay awake on guard before dawn');
    expect(r.doc.title).toBe('Regarding the Night Watch');
  });

  /* THE ORIGINAL OF THE SENTENCE THE MODEL MATCHED (sr11 t324, 2026-10-15). An Answers topic the model found was
     read for its original at the words' excerpt: the shortest stretch thickest with typed words. That was a line of
     another letter the topic also quotes ("who keep My Commandments and remember My Sabbath"), and that letter led,
     while the sentence the model matched holds more of the query and names the letter the reader meant. */
  it("a reprint the model found is read for its original where it matched, when that sentence holds more of the query", async () => {
    said.near = 'sabbath';
    const r = await first('those who keep the sabbath and obey the commandments will know wisdom');
    expect(r.doc.letterId).toBe('wisdom');
  });

  /* An Answers topic gives its place to a study or letter just below that holds the query as well; one holding none
     of it is no measure: any text below "held as much" (sr11, 2026-10-15). */
  it('an Answers topic the model found holding no typed word keeps its place over the text below it', async () => {
    said.near = 'watch';
    const r = await first('a sentry who never dozes off before dawn');
    expect(r.doc.title).toBe('Regarding the Night Watch');
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
    // it opens on the words typed (search200 B3: the run's own sentence), never on the passage the model preferred
    expect(r.placeStart).toBe(STARTS.creator);
  });

  /* THE MODEL SURE, UNSURE, AND WHERE IT LANDS (search sr10, 2026-10-14). Its clear first leads even
     when no typed word reaches it ("god says he lives among israel and his people will never be ashamed"
     came 3rd behind letters holding its words; the model had Joel 2:27 first by 0.056); two texts it
     can hardly tell apart (within 0.012) go original first, as a reprint gives way to its original;
     and a text opened on the passage the model matched opens on the sentence of it that holds the
     reader's words, not on the passage's first sentence. */
  it("the model's clear first leads the words' partial find", async () => {
    said.near = { creator: 1, silver: 0.5 };
    const r = await first('a cord loosed and a bowl broken when a young one forgets his maker');
    expect(r.doc.letterId).toBe('creator');
  });

  it('two texts the model can hardly tell apart: the original kind leads', async () => {
    said.near = { lamps: 1.01, garment: 1 };
    const r = await first('lamps and oil for quokkas juggling xylophones');
    expect(r.doc.letterId).toBe('garment');
  });

  it('a text opened on the passage the model matched opens on the sentence holding the typed words', async () => {
    said.near = 'season';
    const r = await first('bring sheaves into the barn before rain comes');
    expect(r.doc.letterId).toBe('harvest');
    expect(r.placeStart).toBe(HARVEST.indexOf('Gather My sheaves'));
  });

  /* A TEXT FOUND BY ITS TITLE OPENS AT THE TITLE, THE MODEL ON (search200 R1, the S22 look, 2026-10-18). A title typed
     with its collection's name led and opened at its top (B5), and the meaning's landing then moved every opened text to
     the sentence holding the most typed words: the reader landed a few lines down, on a body sentence that says one of
     the words typed, and the card quoted that sentence. */
  it('a text found by its title and collection opens at its top, not on a sentence saying a word typed', async () => {
    said.near = 'garment';
    const r = await first('the fold volume one');
    expect(r.doc.letterId).toBe('strayed');
    expect(r.placeStart).toBe(0);
  });

  /* THE READER'S FILTERS HOLD FOR WHAT THE MEANING ADDS (sweep W1, 2026-10-13). The model's best
     texts joined the top 30 straight from the index, past the collection, the scope, the -word and
     the +word the reader set. Each case would show the creator letter, which the model prefers. */
  const QUERY = 'honour the one who made you while still a child';
  const ids = async (/** @type {string} */ q, /** @type {any} */ opts) => (await VotSearchMini.search(q, opts)).results.map((r) => r.doc.letterId);

  it('the meaning keeps to the collection asked for', async () => {
    said.near = 'creator';
    expect(await ids(QUERY)).toContain('creator'); // the model does add it, with nothing set
    const r = (await VotSearchMini.search(QUERY, { corpus: 'scriptures' })).results;
    expect(r.filter((e) => e.doc.corpus !== 'scriptures')).toEqual([]);
  });

  it('the meaning keeps to a volume scope', async () => {
    said.near = 'creator';
    const r = (await VotSearchMini.search(QUERY + ' fields', { scope: { volumeId: 'answers' } })).results;
    expect(r.length).toBeGreaterThan(0);
    expect(r.filter((e) => e.doc.volumeId !== 'answers')).toEqual([]);
  });

  it('a text holding a -word the reader ruled out is not added, nor one missing a +word', async () => {
    said.near = 'creator';
    expect(await ids(QUERY + ' -youth')).not.toContain('creator');
    expect(await ids(QUERY + ' +garment')).not.toContain('creator');
  });

  it("a collection's cap holds for what the meaning adds", async () => {
    said.near = 'creator';
    const r = (await VotSearchMini.search(QUERY, { perVolume: 1 })).results;
    expect(r.filter((e) => e.doc.volumeId === 'v1').length).toBeLessThanOrEqual(1);
  });
});
