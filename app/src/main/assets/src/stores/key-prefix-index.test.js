/* getForKeyPrefix through the key-prefix index (sweep W69).
   ─────────────────────────────────────────────────────────────────
   The reading view asks LinkStore and BookmarkStore for every paragraph's
   marks on each page turn; a whole-store filter per paragraph was a hitch
   in a library of thousands. The index must answer exactly what the old
   filters answered (same records, same order, each once), follow every
   write, and read each record once per store version, not once per call. */

import { describe, it, expect, beforeEach } from 'vitest';
import { LinkStore } from './link-store.js';
import { BookmarkStore } from './bookmark-store.js';
import { colonPrefixes } from './key-prefix-index.js';

beforeEach(() => {
  localStorage.clear();
  LinkStore._resetForTests({ forceLoaded: true });
  BookmarkStore._resetForTests({ forceLoaded: true });
});

/** Partial records (no labels or types) are all these tests need. @param {any} x @returns {any} */
const any = (x) => x;

// The filters getForKeyPrefix ran before the index, verbatim in meaning.
/** @param {any[]} all @param {string} prefix */
const oldLinks = (all, prefix) => all.filter((lnk) => {
  if (!lnk.source || !lnk.source.key || !lnk.target || !lnk.target.key) return false;
  const srcMatch = lnk.source.key === prefix || lnk.source.key.startsWith(prefix + ':') || prefix.startsWith(lnk.source.key + ':');
  const tgtMatch = lnk.target.key === prefix || lnk.target.key.startsWith(prefix + ':') || prefix.startsWith(lnk.target.key + ':');
  return srcMatch || tgtMatch;
});
/** @param {any[]} all @param {string} prefix */
const oldBookmarks = (all, prefix) => all.filter((b) => b && typeof b === 'object' && !!b.id && typeof b.hlKey === 'string' && b.hlKey !== '' && (b.hlKey === prefix || b.hlKey.indexOf(prefix + ':') === 0));

// A small deterministic generator, so a failure names a reproducible case.
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
const SEGS = [['letter', 'bible', 'journal'], ['a', 'b', 'genesis'], ['0', '1', '2'], ['3', '10-40', '12-20']];
/** @param {() => number} r */
function key(r) {
  const depth = 1 + Math.floor(r() * 4);
  const parts = [];
  for (let d = 0; d < depth; d++) parts.push(SEGS[d][Math.floor(r() * SEGS[d].length)]);
  return parts.join(':');
}
/** @param {() => number} r */
function prefixes(r) {
  const out = ['', 'letter:a:1:3:x', 'lett', 'letter:'];
  for (let i = 0; i < 60; i++) out.push(key(r));
  return out;
}

describe('colonPrefixes', () => {
  it('lists every colon-boundary prefix, shortest first, the key itself last', () => {
    expect(colonPrefixes('letter:the-wide-path:2:10-40')).toEqual(['letter', 'letter:the-wide-path', 'letter:the-wide-path:2', 'letter:the-wide-path:2:10-40']);
    expect(colonPrefixes('bible')).toEqual(['bible']);
    expect(colonPrefixes(':a')).toEqual(['', ':a']);
  });
});

describe('LinkStore.getForKeyPrefix answers what the whole-store filter answered', () => {
  it('same links, same order, each once, over 300 random links and 64 prefixes', () => {
    const r = rng(69);
    const links = [];
    for (let i = 0; i < 300; i++) {
      // A sprinkling of malformed endpoints the filter skipped, and links whose two ends share a block.
      const s = key(r), t = r() < 0.2 ? s + ':1-5' : key(r);
      links.push(r() < 0.05 ? { id: 'bad' + i, source: { key: s }, target: {} } : { id: 'l' + i, source: { key: s }, target: { key: t }, created: i });
    }
    LinkStore.replaceAll(links);
    const all = LinkStore.all();
    for (const p of prefixes(r)) {
      expect(LinkStore.getForKeyPrefix(p).map((l) => l.id), p).toEqual(oldLinks(all, p).map((l) => l.id));
    }
  });

  it('follows every write: add, remove, replaceAll', () => {
    LinkStore.add(any({ id: 'x1', source: { key: 'letter:a:2:10-40' }, target: { key: 'bible:genesis:1:3' }, created: 1 }));
    expect(LinkStore.getForKeyPrefix('letter:a:2').map((l) => l.id)).toEqual(['x1']);
    expect(LinkStore.getForKeyPrefix('bible:genesis:1:3:0-4').map((l) => l.id)).toEqual(['x1']);
    LinkStore.add(any({ id: 'x2', source: { key: 'letter:a' }, target: { key: 'journal:j1:0' }, created: 2 }));
    expect(LinkStore.getForKeyPrefix('letter:a:2').map((l) => l.id)).toEqual(['x1', 'x2']);
    LinkStore.remove('x1');
    expect(LinkStore.getForKeyPrefix('letter:a:2').map((l) => l.id)).toEqual(['x2']);
    LinkStore.replaceAll([]);
    expect(LinkStore.getForKeyPrefix('letter:a:2')).toEqual([]);
  });

  it('reads each link once per store version, not once per paragraph', () => {
    let reads = 0;
    const links = [];
    for (let i = 0; i < 200; i++) {
      const src = { key: 'letter:a:' + (i % 40) + ':1-9' }, tgt = { key: 'bible:genesis:1:' + i };
      links.push({ id: 'c' + i, created: i, get source() { reads++; return src; }, get target() { return tgt; } });
    }
    LinkStore._cache = links;
    for (let p = 0; p < 40; p++) LinkStore.getForKeyPrefix('letter:a:' + p);
    // The filter read every link's source 3+ times per paragraph (40 x 200 x 3 = 24,000).
    expect(reads).toBeLessThanOrEqual(2 * links.length);
    expect(LinkStore.getForKeyPrefix('letter:a:7').map((l) => l.id)).toEqual(['c7', 'c47', 'c87', 'c127', 'c167']);
  });
});

describe('BookmarkStore.getForKeyPrefix answers what the whole-store filter answered', () => {
  it('exact or finer keys only, same order, over 300 random bookmarks and 64 prefixes', () => {
    const r = rng(70);
    const bms = [];
    for (let i = 0; i < 300; i++) bms.push({ id: 'b' + i, hlKey: key(r), label: '', thought: '', created: i, updated: i });
    BookmarkStore.replaceAll(bms);
    const all = BookmarkStore.all();
    for (const p of prefixes(r)) {
      expect(BookmarkStore.getForKeyPrefix(p).map((b) => b.id), p).toEqual(oldBookmarks(all, p).map((b) => b.id));
    }
  });

  it('follows add and remove, and a coarse bookmark never floods the verses under it', () => {
    BookmarkStore.add({ id: 'k1', hlKey: 'bible:genesis:1', label: 'Gen 1', thought: '', created: 1, updated: 1 });
    BookmarkStore.add({ id: 'k2', hlKey: 'bible:genesis:1:3:0-4', label: 'In the', thought: '', created: 2, updated: 2 });
    expect(BookmarkStore.getForKeyPrefix('bible:genesis:1:3').map((b) => b.id)).toEqual(['k2']);
    expect(BookmarkStore.getForKeyPrefix('bible:genesis:1').map((b) => b.id)).toEqual(['k1', 'k2']);
    BookmarkStore.remove('k2');
    expect(BookmarkStore.getForKeyPrefix('bible:genesis:1:3')).toEqual([]);
  });
});
