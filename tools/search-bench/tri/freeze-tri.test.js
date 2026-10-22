// The tri bench's freeze (tri/freeze-tri.mjs) on made-up targets, replies and gates (search200, 2026-10-18).
import { describe, it, expect } from 'vitest';
import { freeze, parseJudgmentMd, parseSealedJudgment } from './freeze-tri.mjs';

const tg = (id, split, reserve, form, extra = {}) => ({ id, split, reserve, style: 'exact', tier: 'easy', form, col: 'v1', collection: 'Volume One',
  group: 'volumes', level: 'sentence', uk: 'v1/x-' + id, sentence: 'A sentence for ' + id + '.', remembered: 'A sentence for ' + id + '.', passage: 'Around it.', meta: { words: 4 }, packet: 'exact-easy-01', ...extra });
// open exact/easy: two cases, two reserves (the long-run reserve after the short-sentence one)
const TARGETS = [tg('e101', 'open', false, 'long-run'), tg('e102', 'open', false, 'short-sentence'), tg('e103', 'open', true, 'short-sentence'), tg('e104', 'open', true, 'long-run')];
const row = (id, q, extra = {}) => ({ id, q, src: 'exact-easy-01.json', v: 1, retired: [], dupId: false, ...extra });
const gate = (extra = {}) => ({ src: 'exact-easy-01.json', v: 1, A: 'pass', why: [], B: [], ...extra });
const split = (rows, ids, ran = true) => ({ rows, gates: { counts: { B: { ran } }, ids } });
const base = () => split([row('e101', 'query one'), row('e102', 'query two'), row('e103', 'query three'), row('e104', 'query four')],
  { e101: gate(), e102: gate(), e103: gate(), e104: gate() });
const codes = (r) => r.problems.map((p) => `${p.id} ${p.code}`);

describe('freeze: what stands', () => {
  it('cases with a Gate A pass and no flag stand, as the bench reads them', () => {
    const r = freeze({ targets: TARGETS, splits: { open: base() } });
    expect(r.problems).toEqual([]);
    expect(r.cases.map((c) => c.id)).toEqual(['e101', 'e102']);
    const c = r.cases[0];
    expect(c).toMatchObject({ q: 'query one', held: false, tier: 'easy', form: 'long-run', collection: 'Volume One', uk: 'v1/x-e101' });
    for (const k of ['passage', 'remembered', 'meta', 'packet', 'split', 'reserve']) expect(c).not.toHaveProperty(k);
  });
  it('a Gate B flag needs a verdict; keep lets it stand', () => {
    const s = base(); s.gates.ids.e102 = gate({ B: ['B-held'] });
    expect(codes(freeze({ targets: TARGETS, splits: { open: s } }))).toEqual(['e102 B-unjudged:B-held']);
    const r = freeze({ targets: TARGETS, splits: { open: s }, verdicts: [{ id: 'e102', v: 1, verdict: 'keep' }] });
    expect(r.problems).toEqual([]);
    expect(r.cases.map((c) => c.id)).toEqual(['e101', 'e102']);
  });
  it('drop: the first usable reserve of the stratum stands in, its own form first', () => {
    const r = freeze({ targets: TARGETS, splits: { open: base() }, verdicts: [{ id: 'e101', v: 1, verdict: 'drop' }] });
    expect(r.problems).toEqual([]);
    expect(r.cases.map((c) => [c.id, c.replaces])).toEqual([['e104', 'e101'], ['e102', undefined]]);
    expect(r.tally.open['exact/easy']).toMatchObject({ planned: 2, kept: 1, replaced: 1 });
  });
  it('a reserve that fails Gate A or carries an unjudged flag is passed over', () => {
    const s = base(); s.gates.ids.e104 = gate({ A: 'fail', why: ['words:16'] });
    const r = freeze({ targets: TARGETS, splits: { open: s }, verdicts: [{ id: 'e101', v: 1, verdict: 'drop' }] });
    expect(r.cases.map((c) => [c.id, c.replaces])).toEqual([['e103', 'e101'], ['e102', undefined]]);
  });
  it('a rewrite stands on its latest version, and the query it replaced is retired with its why', () => {
    const s = base();
    s.rows[0] = row('e101', 'query one again', { v: 2, src: 'rewrites/20261018T000000Z-c1-exact-easy.json', retired: [{ q: 'query one', why: 'another text holds it' }] });
    s.gates.ids.e101 = gate({ v: 2, src: 'rewrites/20261018T000000Z-c1-exact-easy.json' });
    const r = freeze({ targets: TARGETS, splits: { open: s }, verdicts: [{ id: 'e101', v: 1, verdict: 'rewrite' }] });
    expect(r.problems).toEqual([]);
    expect(r.cases[0]).toMatchObject({ id: 'e101', q: 'query one again', retired: [{ q: 'query one', why: 'another text holds it' }] });
  });
  it('held cases carry held: true; fresh cases go to their own file', () => {
    const T = [tg('e201', 'held', false, 'long-run'), tg('e301', 'fresh', false, 'long-run')];
    const r = freeze({ targets: T, splits: { held: split([row('e201', 'held one')], { e201: gate() }), fresh: split([row('e301', 'fresh one')], { e301: gate() }) } });
    expect(r.problems).toEqual([]);
    expect(r.cases).toMatchObject([{ id: 'e201', held: true }]);
    expect(r.fresh).toMatchObject([{ id: 'e301', q: 'fresh one' }]);
    expect(r.fresh[0]).not.toHaveProperty('held');
  });
});

describe('freeze: what it refuses', () => {
  it('a Gate A fail with no drop', () => {
    const s = base(); s.gates.ids.e101 = gate({ A: 'fail', why: ['words:16'] });
    expect(codes(freeze({ targets: TARGETS, splits: { open: s } }))).toEqual(['e101 A-fail:words:16']);
  });
  it('a rewrite owed on the latest version', () => {
    expect(codes(freeze({ targets: TARGETS, splits: { open: base() }, verdicts: [{ id: 'e101', v: 1, verdict: 'rewrite' }] }))).toEqual(['e101 rewrite-owed']);
  });
  it('a gate on another version than the reply now has, or gates run without Gate B', () => {
    const s = base(); s.rows[1] = row('e102', 'query two again', { v: 2, src: 'rewrites/x.json', retired: [{ q: 'query two', why: 'r' }] });
    expect(codes(freeze({ targets: TARGETS, splits: { open: s } }))).toEqual(['e102 gate-stale']);
    const n = base(); n.gates.counts.B.ran = false;
    expect(codes(freeze({ targets: TARGETS, splits: { open: n } }))).toEqual(['open B-not-run']);
  });
  it('a drop with no usable reserve left (--partial counts it short)', () => {
    const v = [{ id: 'e101', v: 1, verdict: 'drop' }, { id: 'e102', v: 1, verdict: 'drop' }, { id: 'e103', v: 1, verdict: 'drop' }];
    expect(codes(freeze({ targets: TARGETS, splits: { open: base() }, verdicts: v }))).toEqual(['e102 dropped-no-reserve']);
    const r = freeze({ targets: TARGETS, splits: { open: base() }, verdicts: v, partial: true });
    expect(r.problems).toEqual([]);
    expect(r.tally.open['exact/easy']).toMatchObject({ replaced: 1, short: 1 });
  });
  it('no reply, or no folder for a split (--partial skips both)', () => {
    const s = split([row('e101', 'query one')], { e101: gate() });
    expect(codes(freeze({ targets: TARGETS, splits: { open: s } }))).toEqual(['e102 no-reply']);
    expect(freeze({ targets: TARGETS, splits: { open: s }, partial: true }).problems).toEqual([]);
    expect(codes(freeze({ targets: TARGETS.concat(tg('e201', 'held', false, 'long-run')), splits: { open: base() } }))).toEqual(['held split-missing']);
  });
  it('two cases with one query, a verdict for an unknown id or a version not written, two verdicts that disagree', () => {
    const s = base(); s.rows[1] = row('e102', 'Query  one');
    expect(codes(freeze({ targets: TARGETS, splits: { open: s } }))).toEqual(['e102 dup-q']);
    const v = [{ id: 'e999', v: 1, verdict: 'keep' }, { id: 'e101', v: 3, verdict: 'keep' }, { id: 'e102', v: 1, verdict: 'keep' }, { id: 'e102', v: 1, verdict: 'drop' }];
    expect(codes(freeze({ targets: TARGETS, splits: { open: base() }, verdicts: v })).sort()).toEqual(['e101 verdict-version@3', 'e102 verdict-conflict@1', 'e999 verdict-unknown-id']);
  });
  it('gates made against another targets file', () => {
    const s = base(); s.gates.targetsHash = 'aaaa';
    expect(codes(freeze({ targets: TARGETS, splits: { open: s }, targetsHash: 'bbbb' }))).toEqual(['open gates-other-targets']);
  });
});

describe('freeze: the verdict files', () => {
  it('judgment.md: list items and table rows, @v for a later version, prose ignored', () => {
    const md = ['# Gate C, open', 'The writers did well; e101 keep is not a verdict line in prose.', '- e101 keep: the holder is its own reprint',
      '| m022@2 | drop | still a paraphrase |', '* n130 — rewrite (the collection word is wrong)', 'e004: Keep'].join('\n');
    expect(parseJudgmentMd(md)).toEqual([{ id: 'e101', v: 1, verdict: 'keep' }, { id: 'm022', v: 2, verdict: 'drop' }, { id: 'n130', v: 1, verdict: 'rewrite' }, { id: 'e004', v: 1, verdict: 'keep' }]);
  });
  it('sealed-judgment.json: an array or a map, ids and codes only', () => {
    expect(parseSealedJudgment([{ id: 'e300', verdict: 'KEEP', code: 'C1' }, { id: 'm301', verdict: 'drop', v: 2 }])).toEqual([{ id: 'e300', v: 1, verdict: 'keep' }, { id: 'm301', v: 2, verdict: 'drop' }]);
    expect(parseSealedJudgment({ n302: 'rewrite', e303: { verdict: 'keep', v: 2 } })).toEqual([{ id: 'n302', v: 1, verdict: 'rewrite' }, { id: 'e303', v: 2, verdict: 'keep' }]);
  });
});
