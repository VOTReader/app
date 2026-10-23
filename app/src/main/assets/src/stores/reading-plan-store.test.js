/* ReadingPlanStore (mw18): plan runs in their own store, ticked by the read record, merged per run. */

import { describe, it, expect, beforeEach } from 'vitest';
import { ReadingPlanStore } from './reading-plan-store.js';
import { mergePlanStore } from './store-merge.js';
import { newRun, runStatus } from '../data/plan-engine.js';

const at = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 9); };
const run = (items, plan = 'x') => newRun({ plan, tracks: [{ kind: 'bible', by: 'count', items: items.map((k) => ({ k, w: 600 })) }], pace: { mode: 'days', n: items.length } }, at('2026-10-22'));

beforeEach(() => {
  localStorage.clear();
  ReadingPlanStore._resetForTests({ forceLoaded: true });
});

describe('ReadingPlanStore', () => {
  it('puts, gets and lists runs; a malformed record never gets in', () => {
    const r = run(['genesis:1', 'genesis:2']);
    ReadingPlanStore.put(r);
    ReadingPlanStore.put(/** @type {any} */ ({ id: 'bad' }));
    expect(ReadingPlanStore.all().map((x) => x.id)).toEqual([r.id]);
    expect(ReadingPlanStore.get(r.id)).toEqual(r);
    expect(ReadingPlanStore.active().length).toBe(1);
  });

  it('noteRead ticks every running run that holds the chapter, dated today, and nothing else', () => {
    const a = run(['genesis:1', 'genesis:2']), b = run(['genesis:1', 'exodus:1']);
    ReadingPlanStore.put(a); ReadingPlanStore.put(b);
    ReadingPlanStore.noteRead('genesis', 1, at('2026-10-23'));
    expect(ReadingPlanStore.get(a.id).ticks).toEqual({ 'genesis:1': '2026-10-23' });
    expect(ReadingPlanStore.get(b.id).ticks).toEqual({ 'genesis:1': '2026-10-23' });
    ReadingPlanStore.noteRead('john', 3, at('2026-10-23'));
    expect(Object.keys(ReadingPlanStore.get(a.id).ticks)).toEqual(['genesis:1']);
  });

  it('a stopped or finished run is not ticked', () => {
    const a = { ...run(['genesis:1', 'genesis:2']), status: /** @type {'stopped'} */ ('stopped') };
    ReadingPlanStore.put(a);
    ReadingPlanStore.noteRead('genesis', 1, at('2026-10-23'));
    expect(ReadingPlanStore.get(a.id).ticks).toEqual({});
  });

  it('the Matthew Study Bible\'s "matthew" read ticks a Bible plan\'s "matthew-plain" chapter (bug 2)', () => {
    const a = run(['matthew-plain:5']);
    ReadingPlanStore.put(a);
    ReadingPlanStore.noteRead('matthew', 5, at('2026-10-23'));
    const got = /** @type {any} */ (ReadingPlanStore.get(a.id));
    expect(got.ticks['matthew-plain:5']).toBe('2026-10-23');
    expect(got.status).toBe('finished');
    expect(runStatus(got, at('2026-10-23')).finished).toBe(true);
  });

  it('replaceAll keeps only well-formed runs', () => {
    const a = run(['genesis:1']);
    ReadingPlanStore.replaceAll(/** @type {any} */ ([a, null, { id: 'x' }]));
    expect(ReadingPlanStore.all().map((x) => x.id)).toEqual([a.id]);
  });
});

describe('mergePlanStore', () => {
  it('two tabs that ticked different chapters of one run keep both ticks', () => {
    const base = run(['genesis:1', 'genesis:2', 'genesis:3']);
    const ours = { ...base, ticks: { 'genesis:1': '2026-10-22' }, updated: 5 };
    const theirs = { ...base, ticks: { 'genesis:2': '2026-10-22' }, updated: 6 };
    const out = mergePlanStore([base], [ours], [theirs]);
    expect(out.length).toBe(1);
    expect(Object.keys(out[0].ticks).sort()).toEqual(['genesis:1', 'genesis:2']);
  });
  it('a run removed in one tab stays removed; a run added in the other is kept', () => {
    const a = run(['genesis:1']), b = run(['exodus:1']);
    const out = mergePlanStore([a], [], [a, b]);
    expect(out.map((r) => r.id)).toEqual([b.id]);
  });
});
