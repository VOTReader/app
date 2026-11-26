/* check-tri.mjs: Gates A and B over the tri bench's writer outputs (search200, 2026-10-18).
   The script exports nothing and runs at import, so each case builds a throwaway folder with
   fixture targets and fixture writer replies and runs it as a child process, exactly as the
   _audit-dump-app precedent does. Fixtures only, never the real bench: the replies, the
   targets and the queries are invented, except the one dup-500 query, which is read from the
   repo's own search-bench/cases.json because dup-500 is defined as "in that file". Gate B
   loads the real corpus (it is the corpus, not the bench, that Gate B checks a query
   against); a probe measured one such run at ~2 s. Fully offline, deterministic. */

import { describe, it, expect, afterEach } from 'vitest';
import { spawnSync } from '../../test-spawn.js'; // file stdio: no pipe another worker's child can hold
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(HERE, 'check-tri.mjs');
const CASES = resolve(HERE, '..', 'cases.json');

const FOX = 'The quick brown fox jumps over the lazy dog and runs away today.';
const GEN11 = 'In the beginning God created the heaven and the earth';
const GETTYSBURG = 'Four score and seven years ago our fathers brought forth on this continent, a new nation, conceived in Liberty, and dedicated to the proposition that all men are created equal.';
const AUSTEN = 'It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.';
const MELVILLE = 'Call me Ishmael. Some years ago, never mind how long precisely, having little or no money in my purse, I thought I would sail about a little and see the watery part of the world.';

const tmpRoots = [];
afterEach(() => { for (const r of tmpRoots.splice(0)) rmSync(r, { recursive: true, force: true }); });

/** One invented target; only the fields check-tri and the gates read. */
function tg(id, style, tier, form, extra = {}) {
  return {
    id, split: 'open', reserve: false, style, tier, form,
    group: 'letters', col: 'v1', collection: 'Volume One', level: 'sentence',
    uk: 'v1/x-' + id, unit: 'x-' + id, title: 'The Bright Morning Star', num: 1, blockIdx: 0,
    sentence: 'A sentence.', remembered: FOX, passage: 'Around it.',
    meta: { words: 10 }, packet: 'p1', ...extra,
  };
}

/** A throwaway folder: fixture targets + packet files under writers/open. Packet names may
 * carry a subpath (rewrites/...) and are created with it. */
function fixture({ targets, packets = {} } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'vot-check-tri-'));
  tmpRoots.push(root);
  const dir = join(root, 'writers', 'open');
  mkdirSync(dir, { recursive: true });
  const targetsPath = join(root, 'targets.json');
  const targetsBytes = JSON.stringify({ seed: 'check-tri-test', targets }, null, 1) + '\n';
  writeFileSync(targetsPath, targetsBytes);
  for (const [name, rows] of Object.entries(packets)) {
    mkdirSync(join(dir, dirname(name)), { recursive: true });
    writeFileSync(join(dir, name), JSON.stringify(rows, null, 1) + '\n');
  }
  return { root, dir, targetsPath, targetsBytes };
}

function run(dir, targetsPath, args = []) {
  const r = spawnSync(process.execPath, [SCRIPT, dir, '--targets', targetsPath, ...args], {
    encoding: 'utf8', timeout: 150000,
  });
  return { status: r.status, stdout: r.stdout || '', stderr: r.stderr || '' };
}

function gates(dir) {
  return JSON.parse(readFileSync(join(dir, 'gates.json'), 'utf8'));
}

describe('check-tri: Gate A via the CLI (--no-b)', () => {
  it('exact start passes, a query that is no run fails', () => {
    const f = fixture({
      targets: [tg('a1', 'exact', 'medium', 'start'), tg('a2', 'exact', 'medium', 'start')],
      packets: { 'p1.json': [
        { id: 'a1', q: 'the quick brown fox jumps' },
        { id: 'a2', q: 'totally different words here now' },
      ] },
    });
    const r = run(f.dir, f.targetsPath, ['--no-b']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('CHECK-DONE A 1/2 pass');
    const g = gates(f.dir);
    expect(g.ids.a1).toMatchObject({ A: 'pass', why: [] });
    expect(g.ids.a2).toMatchObject({ A: 'fail', why: ['not-run'] });
    expect(g.counts.A).toEqual({ pass: 1, fail: 1 });
    expect(g.counts.B).toEqual({ flagged: 0, ran: false });
  });

  it('title word-dropped passes, the whole title fails', () => {
    const f = fixture({
      targets: [tg('t1', 'title', 'medium', 'word-dropped'), tg('t2', 'title', 'medium', 'word-dropped')],
      packets: { 'p1.json': [
        { id: 't1', q: 'bright morning star' },
        { id: 't2', q: 'the bright morning star' },
      ] },
    });
    expect(run(f.dir, f.targetsPath, ['--no-b']).status).toBe(0);
    const g = gates(f.dir);
    expect(g.ids.t1).toMatchObject({ A: 'pass', why: [] });
    expect(g.ids.t2).toMatchObject({ A: 'fail', why: ['whole-title'] });
  });

  it('misremembered one-slip passes', () => {
    const remembered = 'There are more things in heaven and earth, Horatio, than are dreamt of in your philosophy.';
    const f = fixture({
      targets: [tg('m1', 'misremembered', 'easy', 'one-slip', { remembered })],
      packets: { 'p1.json': [{ id: 'm1', q: 'than are dreamt of in our philosophy', from: 'than are dreamt of in your philosophy' }] },
    });
    expect(run(f.dir, f.targetsPath, ['--no-b']).status).toBe(0);
    expect(gates(f.dir).ids.m1).toMatchObject({ A: 'pass', why: [] });
  });

  it('dup-tri: the second id with one query is flagged, the first is not', () => {
    const f = fixture({
      targets: [tg('d1', 'exact', 'medium', 'start'), tg('d2', 'exact', 'medium', 'start')],
      packets: { 'p1.json': [
        { id: 'd1', q: 'the quick brown fox jumps' },
        { id: 'd2', q: 'the quick brown fox jumps' },
      ] },
    });
    expect(run(f.dir, f.targetsPath, ['--no-b']).status).toBe(0);
    const g = gates(f.dir);
    expect(g.ids.d1.why).toEqual([]);
    expect(g.ids.d2.why).toContain('dup-tri');
    expect(g.counts.codesA['dup-tri']).toBe(1);
  });

  it('dup-id: the same id in a second packet is flagged', () => {
    const f = fixture({
      targets: [tg('u1', 'exact', 'medium', 'start')],
      packets: {
        'p1.json': [{ id: 'u1', q: 'the quick brown fox jumps' }],
        'p2.json': [{ id: 'u1', q: 'the quick brown fox jumps over' }],
      },
    });
    expect(run(f.dir, f.targetsPath, ['--no-b']).status).toBe(0);
    const g = gates(f.dir);
    expect(g.counts.queries).toBe(2);
    expect(g.counts.files).toBe(2);
    expect(g.ids.u1.why).toEqual(['dup-id']);
  });

  it('unknown-id: a reply with no target is flagged and seals the run', () => {
    const f = fixture({
      targets: [tg('a1', 'exact', 'medium', 'start')],
      packets: { 'p1.json': [
        { id: 'a1', q: 'the quick brown fox jumps' },
        { id: 'zzz-no-such', q: 'zebra quixotic unknown query here' },
      ] },
    });
    const r = run(f.dir, f.targetsPath, ['--no-b']);
    expect(r.status).toBe(0);
    const g = gates(f.dir);
    expect(g.ids['zzz-no-such']).toMatchObject({ A: 'fail', why: ['unknown-id'], split: null });
    expect(g.counts.unknown).toBe(1);
    expect(g.sealed).toBe(true);
    expect(r.stdout).not.toContain('zebra');
  });

  it('missing: a target in a replied packet with no reply is listed', () => {
    const f = fixture({
      targets: [tg('a1', 'exact', 'medium', 'start'), tg('m1', 'exact', 'medium', 'start')],
      packets: { 'p1.json': [{ id: 'a1', q: 'the quick brown fox jumps' }] },
    });
    expect(run(f.dir, f.targetsPath, ['--no-b']).status).toBe(0);
    const g = gates(f.dir);
    expect(g.missing).toEqual(['m1']);
    expect(g.counts.missing).toBe(1);
  });

  it('longrun-start-excess: only the excess long-runs starting at the first word are flagged', () => {
    const first10 = (s) => s.replace(/[^A-Za-z ]/g, '').split(/\s+/).slice(0, 10).join(' ');
    const f = fixture({
      targets: [
        tg('lr1', 'exact', 'easy', 'long-run', { remembered: GETTYSBURG }),
        tg('lr2', 'exact', 'easy', 'long-run', { remembered: AUSTEN }),
        tg('lr3', 'exact', 'easy', 'long-run', { remembered: MELVILLE }),
      ],
      packets: { 'p1.json': [
        { id: 'lr1', q: first10(GETTYSBURG) },
        { id: 'lr2', q: first10(AUSTEN) },
        { id: 'lr3', q: first10(MELVILLE) },
      ] },
    });
    expect(run(f.dir, f.targetsPath, ['--no-b']).status).toBe(0);
    const g = gates(f.dir);
    expect(g.ids.lr1.why).toEqual([]);
    expect(g.ids.lr2.why).toContain('longrun-start-excess');
    expect(g.ids.lr3.why).toContain('longrun-start-excess');
    expect(g.counts.codesA['longrun-start-excess']).toBe(2);
  });

  it('rewrites: the latest version is gated, v counts it', () => {
    const f = fixture({
      targets: [tg('r1', 'exact', 'medium', 'start')],
      packets: {
        'p1.json': [{ id: 'r1', q: 'totally different words here now' }],
        'rewrites/20261018T000000Z-c1-p1.json': [{ id: 'r1', q: 'the quick brown fox jumps', why: 'another text holds it' }],
      },
    });
    expect(run(f.dir, f.targetsPath, ['--no-b']).status).toBe(0);
    const g = gates(f.dir);
    expect(g.counts.queries).toBe(1);
    expect(g.counts.files).toBe(2);
    expect(g.ids.r1).toMatchObject({ A: 'pass', why: [], v: 2, src: 'rewrites/20261018T000000Z-c1-p1.json' });
  });

  it('dup-500: a query from the 500 bench is flagged and its text withheld', () => {
    const cases = JSON.parse(readFileSync(CASES, 'utf8')).cases;
    const q = cases.map((c) => c.q).find((s) => typeof s === 'string' && s.trim().split(/\s+/).length >= 5 && s.trim().split(/\s+/).length <= 8);
    expect(q).toBeTruthy();
    const f = fixture({
      targets: [tg('d500', 'exact', 'medium', 'start', { remembered: q + ' and then the sentence carries on further' })],
      packets: { 'p1.json': [{ id: 'd500', q }] },
    });
    const r = run(f.dir, f.targetsPath, ['--no-b']);
    expect(r.status).toBe(0);
    const g = gates(f.dir);
    expect(g.ids.d500.A).toBe('fail');
    expect(g.ids.d500.why).toContain('dup-500');
    expect(r.stdout).toContain('(q withheld: dup-500)');
    expect(r.stdout).not.toContain(q);
  });
});

describe('check-tri: out and exit codes', () => {
  it('gates.json: hash, counts and sorted ids', () => {
    const f = fixture({
      targets: [tg('a1', 'exact', 'medium', 'start'), tg('a2', 'exact', 'medium', 'start')],
      packets: { 'p1.json': [
        { id: 'a1', q: 'the quick brown fox jumps' },
        { id: 'a2', q: 'totally different words here now' },
      ] },
    });
    expect(run(f.dir, f.targetsPath, ['--no-b']).status).toBe(0);
    const g = gates(f.dir);
    expect(g.targetsHash).toBe(crypto.createHash('sha256').update(f.targetsBytes).digest('hex').slice(0, 16));
    expect(g.counts).toMatchObject({ queries: 2, files: 1, missing: 0, unknown: 0 });
    expect(g.counts.A).toEqual({ pass: 1, fail: 1 });
    expect(g.counts.codesA).toEqual({ 'not-run': 1 });
    expect(g.counts.strata['open/exact/medium']).toEqual({ n: 2, A: 1, B: 0 });
    expect(Object.keys(g.ids)).toEqual(['a1', 'a2']);
    expect(g.folder).toBe(resolve(f.dir));
    expect(g.targets).toBe(resolve(f.targetsPath));
    expect(g.sealed).toBe(false);
    expect(typeof g.made).toBe('string');
  });

  it('--strict exits 1 when Gate A fails, 0 when it passes; without it a fail still exits 0', () => {
    const fail = fixture({
      targets: [tg('a1', 'exact', 'medium', 'start')],
      packets: { 'p1.json': [{ id: 'a1', q: 'totally different words here now' }] },
    });
    expect(run(fail.dir, fail.targetsPath, ['--no-b', '--strict']).status).toBe(1);
    expect(run(fail.dir, fail.targetsPath, ['--no-b']).status).toBe(0);
    const pass = fixture({
      targets: [tg('a1', 'exact', 'medium', 'start')],
      packets: { 'p1.json': [{ id: 'a1', q: 'the quick brown fox jumps' }] },
    });
    expect(run(pass.dir, pass.targetsPath, ['--no-b', '--strict']).status).toBe(0);
  });

  it('--sealed: ids and codes only, no query text on the console', () => {
    const f = fixture({
      targets: [tg('a1', 'exact', 'medium', 'start')],
      packets: { 'p1.json': [{ id: 'a1', q: 'the quick brown fox jumps' }] },
    });
    const r = run(f.dir, f.targetsPath, ['--no-b', '--sealed']);
    expect(r.status).toBe(0);
    expect(gates(f.dir).sealed).toBe(true);
    expect(r.stdout).toContain('(SEALED: ids and codes only)');
    expect(r.stdout).not.toContain('the quick brown fox jumps');
  });

  it('usage: no folder, and a folder with no replies, both exit 2', () => {
    const noFolder = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8', timeout: 150000 });
    expect(noFolder.status).toBe(2);
    expect(noFolder.stderr).toContain('usage: check-tri.mjs');
    const empty = fixture({ targets: [tg('a1', 'exact', 'medium', 'start')] });
    const r = run(empty.dir, empty.targetsPath, ['--no-b']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('no writer replies');
  });

  it('a packet that is not JSON exits 2 naming the file, never its content', () => {
    const f = fixture({ targets: [tg('a1', 'exact', 'medium', 'start')] });
    writeFileSync(join(f.dir, 'p1.json'), 'not json\n');
    const r = run(f.dir, f.targetsPath, ['--no-b']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('not JSON:');
    expect(r.stderr).toContain('p1.json');
    expect(r.stderr).not.toContain('not json');
  });
});

describe('check-tri: Gate B (real corpus, fixture replies)', () => {
  /** One fixture run through all four Gate B paths: exact held, title verse, title twin, from held. */
  function gateBFixture() {
    return fixture({
      targets: [
        tg('x-ex', 'exact', 'medium', 'middle'),
        tg('x-tv', 'title', 'medium', 'word-dropped', { title: 'In the Beginning God Created' }),
        tg('x-ti', 'title', 'medium', 'word-dropped'),
        tg('x-mr', 'misremembered', 'easy', 'one-slip'),
      ],
      packets: { 'p1.json': [
        { id: 'x-ex', q: GEN11 },
        { id: 'x-tv', q: 'in the beginning god created' },
        { id: 'x-ti', q: 'i search the hearts and minds' },
        { id: 'x-mr', q: 'in the beginning god made the heaven and earth', from: GEN11 },
      ] },
    });
  }

  it('exact held, title verse, title twin, window and from', () => {
    const f = gateBFixture();
    const r = run(f.dir, f.targetsPath);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain(GEN11); // an open run prints the query next to its codes
    const g = gates(f.dir);
    expect(g.counts.B).toMatchObject({ flagged: 4, ran: true });
    expect(g.ids['x-ex'].B).toEqual(['B-held']);
    expect(g.ids['x-ex'].score).toEqual({ outside: 1 });
    expect(g.ids['x-ex'].competitors[0]).toMatchObject({ key: 'bible/genesis:1:1', how: 'verbatim' });
    expect(g.ids['x-tv'].B).toContain('B-verse');
    expect(g.ids['x-ti'].B).toContain('B-title');
    expect(g.ids['x-ti'].competitors[0]).toMatchObject({ key: 'v4/i-search-the-hearts-and-minds', score: 1 });
    expect(g.ids['x-mr'].B).toEqual(expect.arrayContaining(['B-window', 'B-from']));
  });

  it('--sealed strips competitors to key, how and score (no label or snippet)', () => {
    const f = gateBFixture();
    const r = run(f.dir, f.targetsPath, ['--sealed']);
    expect(r.status).toBe(0);
    expect(r.stdout).not.toContain(GEN11);
    const g = gates(f.dir);
    expect(g.sealed).toBe(true);
    for (const c of g.ids['x-ex'].competitors) {
      expect(c).not.toHaveProperty('label');
      expect(c).not.toHaveProperty('snippet');
      expect(c).toHaveProperty('key');
      expect(c).toHaveProperty('how');
    }
  });
});
