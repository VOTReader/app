// @ts-nocheck
// The web's filters (Corbin, 2026-10-22: "tap the prophecy full filled legend que and filter out
// everything else"), over the shipped graph.
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { fileURLToPath } from 'node:url';
import { resolve, dirname } from 'node:path';
import * as dec from './decode.js';
import { spanT } from './geometry.js';
import { prophecySet } from './frame-set.js';
import * as F from './filters.js';

const here = dirname(fileURLToPath(import.meta.url));
const g = dec.decodeGraph(runInNewContext(readFileSync(resolve(here, '../../data/scripture-web-data.js'), 'utf8') + ';SCRIPTURE_WEB_DATA', {}));
const pairs = prophecySet(g);
const nt = F.newTestamentStart(g);
const book = (title) => g.books.findIndex((b) => b.title === title);
const bookOf = (v) => g.chapters[g.chapterOfVerse[v]][0];
const masks = (over) => F.filterMasks(g, { ...F.NO_FILTERS, ...over }, pairs);
const keptIds = (m) => { const out = []; for (let i = 0; i < m.threads.length; i++) if (m.threads[i]) out.push(i); return out; };

afterEach(() => F.setFilterMasks(g, null));

describe('filters: what each keeps', () => {
  it('nothing on keeps everything and makes no masks', () => {
    expect(F.filtersOn(F.NO_FILTERS)).toBe(false);
    expect(F.filterMasks(g, F.NO_FILTERS, pairs)).toBeNull();
    expect(F.kept(g, 0)).toBe(true);
  });

  it('prophecy fulfilled keeps the prophecy pairs only, every one of them', () => {
    const m = masks({ prophecy: true });
    expect(m.kept).toBe(0);
    expect(m.keptPairs).toBe(pairs.count);
  });

  it('cited in the Volumes keeps a thread with a foot on a cited verse', () => {
    const m = masks({ cited: true });
    const cited = F.citedVerses(g);
    expect(m.kept).toBeGreaterThan(0);
    expect(m.kept).toBeLessThan(g.count);
    for (const i of keptIds(m).slice(0, 500)) expect(cited[g.from[i]] || cited[g.to[i]]).toBe(1);
  });

  it('the distance bands split the threads in about thirds, and each kept one sits in its band', () => {
    const counts = ['near', 'middle', 'far'].map((d) => masks({ distance: d }).kept);
    for (const c of counts) expect(c / g.count).toBeGreaterThan(0.28);
    const m = masks({ distance: 'far' });
    for (const i of keptIds(m).slice(0, 500)) expect(spanT(g.to[i] - g.from[i], g.total)).toBeGreaterThanOrEqual(F.DISTANCE_BANDS.far[0]);
  });

  it('the testaments: Old to New crosses Matthew, the other two stay on their side', () => {
    const on = masks({ testament: 'on' }), oo = masks({ testament: 'oo' }), nn = masks({ testament: 'nn' });
    expect(on.kept + oo.kept + nn.kept).toBe(g.count);
    for (const i of keptIds(on).slice(0, 300)) expect(Math.min(g.from[i], g.to[i]) < nt && Math.max(g.from[i], g.to[i]) >= nt).toBe(true);
    for (const i of keptIds(nn).slice(0, 300)) expect(Math.min(g.from[i], g.to[i])).toBeGreaterThanOrEqual(nt);
  });

  it('a book keeps its own threads; two books keep the ones between them', () => {
    const isa = book('Isaiah'), mat = book('Matthew');
    const one = masks({ fromBook: isa });
    for (const i of keptIds(one).slice(0, 300)) expect([bookOf(g.from[i]), bookOf(g.to[i])]).toContain(isa);
    const two = masks({ fromBook: isa, toBook: mat });
    expect(two.kept).toBeGreaterThan(0);
    expect(two.kept).toBeLessThan(one.kept);
    for (const i of keptIds(two)) expect([bookOf(g.from[i]), bookOf(g.to[i])].sort()).toEqual([isa, mat].sort());
  });

  it('strength keeps 50 votes and more, or 100 and more', () => {
    expect(masks({ strength: 'strong' }).kept).toBe(Array.from(g.votes).filter((v) => v >= 50).length);
    expect(masks({ strength: 'strongest' }).kept).toBe(Array.from(g.votes).filter((v) => v >= 100).length);
  });

  it('filters combine: each one narrows', () => {
    const a = masks({ testament: 'on' }).kept, b = masks({ testament: 'on', strength: 'strong' }).kept;
    expect(b).toBeLessThan(a);
    expect(b).toBeGreaterThan(0);
  });
});

describe('filters: the masks in force, and their names', () => {
  it('kept and pairKept read the masks put in force for the graph', () => {
    const m = masks({ strength: 'strongest' });
    F.setFilterMasks(g, m);
    const i = keptIds(m)[0];
    const out = m.threads.indexOf(0);
    expect(F.kept(g, i)).toBe(true);
    expect(F.kept(g, out)).toBe(false);
    F.setFilterMasks(g, null);
    expect(F.kept(g, out)).toBe(true);
  });

  it('the pill names what is on, in the sheet’s order', () => {
    const isa = book('Isaiah');
    expect(F.filterLabels(g, { ...F.NO_FILTERS, prophecy: true, fromBook: isa, distance: 'far' }).map((l) => l.label))
      .toEqual(['Prophecy fulfilled', 'Far', 'Isaiah']);
  });
});
