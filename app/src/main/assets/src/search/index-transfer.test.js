/* The warm index handed over in parts (sr9, 2026-10-14): what the page assembles from the worker's parts
   is the index MiniSearch.loadJSON makes from the same JSON, and no part is large. */
import { describe, it, expect } from 'vitest';
import MiniSearch from './vendor/minisearch.js';
import { postIndexParts, indexAssembler } from './index-transfer.js';

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
