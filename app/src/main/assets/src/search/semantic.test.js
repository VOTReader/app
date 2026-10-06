// @ts-nocheck — reads the shipped model files and builds stand-in packs with node buffers.
/* The on-device meaning search (semantic.js, path to 500 step 1, 2026-10-05): the tokenizer
   matches the one the passage vectors were built with (tools/build-semantic.py, HF tokenizers),
   a small pack ranks by meaning and names where the passage starts, bad stored bytes are
   refused, and the shipped model finds a verse no typed word names. */
import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { wordPieceIds, configureSemantic, startSemantic, semanticDocs, semanticStatus, resetSemantic, docUnitKey } from './semantic.js';

const ASSETS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const vocabMap = new Map(fs.readFileSync(path.join(ASSETS, 'semantic/vocab.txt'), 'utf8').split('\n').filter(Boolean).map((w, i) => [w, i]));
const buf = (/** @type {Buffer|Uint8Array} */ b) => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
const sha = (/** @type {Buffer|Uint8Array} */ b) => crypto.createHash('sha256').update(b).digest('hex');

describe('wordPieceIds: the tokenizer the passage vectors were built with', () => {
  // ids from HF tokenizers' BertWordPieceTokenizer over semantic/vocab.txt (lowercase, accents off)
  const CASES = [
    ['Hearken unto Me, O Israel; begat YahuShua!', [2963, 7520, 19662, 2033, 1010, 1051, 3956, 1025, 11693, 4017, 8038, 9825, 14691, 999]],
    ['Café naïve — “quoted” words… and 144,000 sealed', [7668, 15743, 1517, 1523, 9339, 1524, 2616, 1529, 1998, 14748, 1010, 2199, 10203]],
    ['thou god seest me', [15223, 2643, 5927, 2102, 2033]],
    ['antidisestablishmentarianism'.repeat(5), [100]],
    ['the lord’s sabbath-day 中文 x', [1996, 2935, 1521, 1055, 19546, 1011, 2154, 1746, 1861, 1060]],
  ];
  for (const [text, ids] of CASES) it(JSON.stringify(text).slice(0, 40), () => expect(wordPieceIds(String(text), vocabMap)).toEqual(ids));
});

describe('docUnitKey: how the pack names a document', () => {
  it('a verse by its book, chapter and verse within its collection', () => expect(docUnitKey({ kind: 'verse', volumeId: 'bible', bookId: 'joel', chapterNum: 2, verseNum: 27 })).toBe('bible/joel:2:27'));
  it('a study chapter by its chapter id', () => expect(docUnitKey({ kind: 'bible-study', letterId: 'purity', studyChapterId: 'purity-ch1' })).toBe('bible-studies/purity-ch1'));
  it('a letter by its collection and id', () => expect(docUnitKey({ kind: 'letter', volumeId: 'v1', letterId: 'a-word' })).toBe('v1/a-word'));
});

/** A three-unit pack in 4 dimensions and a stand-in runtime whose "model" says what the test tells it to. */
function tinyPack(/** @type {{badUnits?: boolean}} */ o = {}) {
  const dim = 4;
  const vecs = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0.6, 0.8, 0]];
  const q = new Int8Array(vecs.flatMap((v) => v.map((x) => Math.round(x * 127))));
  const scale = new Float32Array(vecs.map(() => 1 / 127));
  const key = new Uint32Array([0, 1, 1]);
  const start = new Int32Array([0, 10, 42]);
  const units = Buffer.concat([Buffer.from(q.buffer), Buffer.from(scale.buffer), Buffer.from(key.buffer), Buffer.from(start.buffer)]);
  const model = Buffer.from('not a real model');
  const man = {
    version: 1, model: 'm.onnx', modelSha256: sha(model), queryPrefix: 'q: ', dim, count: 3, units: 'u.bin',
    unitsSha256: o.badUnits ? '0'.repeat(64) : sha(units), ort: 'ort/', files: [], keys: ['bible/joel:2:27', 'v1/letter'],
  };
  /** @type {Record<string, Buffer>} */
  const files = { 'semantic/manifest.json': Buffer.from(JSON.stringify(man)), 'semantic/vocab.txt': Buffer.from('[PAD]\n'), 'semantic/u.bin': units, 'semantic/m.onnx': model, 'semantic/ort/ort-wasm-simd-threaded.wasm': Buffer.from('') };
  const said = { vec: [0, 0, 1, 0] };
  const ort = {
    env: { wasm: {} },
    Tensor: class { constructor(/** @type {string} */ t, /** @type {any} */ d, /** @type {number[]} */ s) { Object.assign(this, { t, d, s }); } },
    InferenceSession: { create: async () => ({ inputNames: ['input_ids', 'attention_mask'], outputNames: ['h'], run: async () => ({ h: { data: Float32Array.from(said.vec) } }) }) },
  };
  configureSemantic({
    url: (p) => 'mem:' + p,
    load: async (p) => { if (!files[p]) throw new Error('missing ' + p); return buf(files[p]); },
    importModule: async () => ort,
  });
  return said;
}

describe('semanticDocs over a pack', () => {
  beforeEach(() => resetSemantic());
  it('answers null until the model is ready', async () => {
    tinyPack();
    expect(await semanticDocs('anything', (k) => k)).toBeNull();
  });
  it('ranks documents by their best passage and names where it starts', async () => {
    const said = tinyPack();
    expect(await startSemantic()).toBe(true);
    expect(semanticStatus().status).toBe('ready');
    said.vec = [0, 0, 1, 0]; // nearest the third unit: the letter's passage at 42
    let r = /** @type {any[]} */ (await semanticDocs('q', (k) => 'id:' + k));
    expect(r.map((x) => x.id)).toEqual(['id:v1/letter', 'id:bible/joel:2:27']);
    expect(r[0].start).toBe(42);
    said.vec = [1, 0, 0, 0];
    r = /** @type {any[]} */ (await semanticDocs('q', (k) => 'id:' + k));
    expect(r[0]).toMatchObject({ id: 'id:bible/joel:2:27', start: 0 });
    expect(r[0].score).toBeCloseTo(1, 2);
  });
  it('leaves out a document the index does not hold', async () => {
    tinyPack();
    await startSemantic();
    const r = /** @type {any[]} */ (await semanticDocs('q', (k) => (k === 'v1/letter' ? undefined : k)));
    expect(r.map((x) => x.id)).toEqual(['bible/joel:2:27']);
  });
  it('refuses stored bytes that are not the files the manifest names', async () => {
    tinyPack({ badUnits: true });
    expect(await startSemantic()).toBe(false);
    expect(semanticStatus()).toMatchObject({ status: 'failed' });
    expect(await semanticDocs('q', (k) => k)).toBeNull();
  });
  it('starts once', async () => {
    tinyPack();
    expect(startSemantic()).toBe(startSemantic());
  });
});

describe('the shipped model', () => {
  it('finds the verse a reader describes in other words', async () => {
    resetSemantic();
    configureSemantic({
      url: (p) => pathToFileURL(path.join(ASSETS, p)).href,
      load: async (p) => buf(fs.readFileSync(path.join(ASSETS, p))),
      importModule: (p) => import(pathToFileURL(path.join(ASSETS, p)).href),
    });
    expect(await startSemantic()).toBe(true);
    const r = /** @type {any[]} */ (await semanticDocs('god says he lives among israel and his people will never be ashamed', (k) => k, 5));
    expect(r[0].id).toBe('bible/joel:2:27');
  }, 30000);
});
