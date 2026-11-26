/* make-fresh.mjs: the FRESH 100 sampler — mirror-tree child-process tests.
   The script writes fresh-targets.json into its own dir, so the mirror keeps the
   real tri/ untouched; the packet goes to the argv path. No network, no model,
   no engine: the seeded shuffle is deterministic. */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from '../test-spawn.js'; // file stdio: no pipe another worker's child can hold
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const NODE = process.execPath;

// The 500 the sampler must not repeat: one verse (uk + sentence + verse keys),
// one unit (uk + unit keys), one sentence-only key.
const TAKEN = [
  { id: 't001', group: 'bible', style: 'crossover', variant: 'kjv', level: 'verse',
    uk: 'bible/isaiah:21:5', sentence: 'Prepare the table, set a watchman in the tower.',
    kjv: 'Prepare the table, watch in the watchtower.' },
  { id: 't002', group: 'letters', style: 'title', level: 'unit', uk: 'letters/one',
    title: 'One', blockText: 'First letter text.' },
  { id: 't003', group: 'bible', style: 'exact', level: 'verse', uk: 'bible/other:1:1',
    sentence: 'Shared sentence here.' },
];

const verse = (id, group, uk, sentence, extra = {}) => ({
  id, group, col: group, collection: group, style: 'exact', level: 'verse',
  uk, sentence, kjv: sentence + ' (kjv)', blockText: sentence + ' Around it.', ...extra,
});
const unit = (id, group, uk, title, extra = {}) => ({
  id, group, col: group, collection: group, style: 'title', level: 'unit',
  uk, title, blockText: title + ' body.', ...extra,
});

// bible: 10 exact/verse in one stratum — want 2, quota 2. Two are taken
// (p003 repeats t001's uk + sentence; p004 repeats t003's sentence under a new uk).
// letters: 5 title/unit in one stratum — want 1, quota 1. One is taken (p013 is t002's uk).
const POOL = {
  seed: 20261015,
  targets: [
    verse('p001', 'bible', 'bible/genesis:1:1', 'In the beginning God created the heaven and the earth.'),
    verse('p002', 'bible', 'bible/genesis:1:2', 'And the earth was without form, and void.'),
    verse('p003', 'bible', 'bible/isaiah:21:5', 'Prepare the table, set a watchman in the tower.'),
    verse('p004', 'bible', 'bible/genesis:9:9', 'Shared sentence here.'),
    verse('p005', 'bible', 'bible/exodus:3:14', 'I AM THAT I AM.'),
    verse('p006', 'bible', 'bible/psalms:23:1', 'The LORD is my shepherd; I shall not want.'),
    verse('p007', 'bible', 'bible/john:1:1', 'In the beginning was the Word.'),
    verse('p008', 'bible', 'bible/john:3:16', 'For God so loved the world.'),
    verse('p009', 'bible', 'bible/romans:8:28', 'And we know that all things work together for good.'),
    verse('p010', 'bible', 'bible/revelation:22:20', 'Even so, come, Lord Jesus.'),
    unit('p011', 'letters', 'letters/a', 'Letter A'),
    unit('p012', 'letters', 'letters/b', 'Letter B'),
    unit('p013', 'letters', 'letters/one', 'One'),
    unit('p014', 'letters', 'letters/c', 'Letter C'),
    unit('p015', 'letters', 'letters/d', 'Letter D'),
  ],
};

function makeMirror(taken = TAKEN, pool = POOL) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'make-fresh-'));
  for (const f of ['make-fresh.mjs', 'corpus.mjs']) fs.cpSync(path.join(HERE, f), path.join(dir, f));
  fs.writeFileSync(path.join(dir, 'targets.json'), JSON.stringify({ seed: 20261005, targets: taken }, null, 1));
  const poolPath = path.join(dir, 'pool.json');
  fs.writeFileSync(poolPath, JSON.stringify(pool, null, 1));
  const packetPath = path.join(dir, 'packet.json');
  return { dir, poolPath, packetPath };
}

function run(dir, poolPath, packetPath) {
  return spawnSync(NODE, ['make-fresh.mjs', poolPath, packetPath], { cwd: dir, encoding: 'utf8' });
}

const readFresh = (dir) => JSON.parse(fs.readFileSync(path.join(dir, 'fresh-targets.json'), 'utf8'));
const readPacket = (packetPath) => JSON.parse(fs.readFileSync(packetPath, 'utf8'));

describe('make-fresh.mjs', () => {
  it('usage: no args exits 2 and writes nothing', () => {
    const { dir } = makeMirror();
    const r = spawnSync(NODE, ['make-fresh.mjs'], { cwd: dir, encoding: 'utf8' });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('usage: make-fresh.mjs');
    expect(fs.existsSync(path.join(dir, 'fresh-targets.json'))).toBe(false);
  });

  it('missing pool file fails', () => {
    const { dir, packetPath } = makeMirror();
    const r = run(dir, path.join(dir, 'no-such-pool.json'), packetPath);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toMatch(/ENOENT|no-such-pool/);
  });

  it('samples one in five per group, skipping what the 500 has', () => {
    const { dir, poolPath, packetPath } = makeMirror();
    const r = run(dir, poolPath, packetPath);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('3 fresh targets');
    const fresh = readFresh(dir);
    expect(fresh.seed).toBe(POOL.seed);
    expect(fresh.targets).toHaveLength(3);
    expect(fresh.targets.map((t) => t.id)).toEqual(['f001', 'f002', 'f003']);
    const froms = fresh.targets.map((t) => t.from);
    expect(froms).not.toContain('p003');
    expect(froms).not.toContain('p004');
    expect(froms).not.toContain('p013');
    for (const t of fresh.targets) { expect(t.held).toBe(true); expect(t.set).toBe('fresh'); }
    const groups = fresh.targets.map((t) => t.group);
    expect(groups.filter((g) => g === 'bible')).toHaveLength(2);
    expect(groups.filter((g) => g === 'letters')).toHaveLength(1);
  });

  it('packet carries only what the writer gets, per level', () => {
    const { dir, poolPath, packetPath } = makeMirror();
    expect(run(dir, poolPath, packetPath).status).toBe(0);
    const fresh = readFresh(dir);
    const packet = readPacket(packetPath);
    expect(packet.map((p) => p.id)).toEqual(fresh.targets.map((t) => t.id));
    const byId = new Map(POOL.targets.map((t) => [t.id, t]));
    for (let i = 0; i < fresh.targets.length; i++) {
      const src = byId.get(fresh.targets[i].from);
      const p = packet[i];
      expect(p.style).toBe(src.style);
      expect(p.collection).toBe(src.collection);
      if (src.level === 'unit') {
        expect(p.title).toBe(src.title);
        expect(p.text).toBe(src.blockText);
        expect(p).not.toHaveProperty('remembered');
        expect(p).not.toHaveProperty('passage');
      } else {
        expect(p.remembered).toBe(src.sentence);
        expect(p.passage).toBe(src.blockText);
        expect(p.kjv).toBe(src.kjv);
      }
      if (src.variant === 'kjv' || src.variant === 'restored-names') expect(p.variant).toBe(src.variant);
      else expect(p).not.toHaveProperty('variant');
    }
  });

  it('variant kjv is carried into the packet', () => {
    const pool2 = { ...POOL, targets: POOL.targets.map((t) => ({ ...t, variant: 'kjv' })) };
    const { dir, poolPath, packetPath } = makeMirror(TAKEN, pool2);
    expect(run(dir, poolPath, packetPath).status).toBe(0);
    for (const p of readPacket(packetPath)) expect(p.variant).toBe('kjv');
  });

  it('deterministic: same seed, byte-identical outputs', () => {
    const a = makeMirror();
    const b = makeMirror();
    expect(run(a.dir, a.poolPath, a.packetPath).status).toBe(0);
    expect(run(b.dir, b.poolPath, b.packetPath).status).toBe(0);
    expect(fs.readFileSync(path.join(a.dir, 'fresh-targets.json'), 'utf8'))
      .toBe(fs.readFileSync(path.join(b.dir, 'fresh-targets.json'), 'utf8'));
    expect(fs.readFileSync(a.packetPath, 'utf8')).toBe(fs.readFileSync(b.packetPath, 'utf8'));
  });

  it('stratum with nothing fresh throws', () => {
    const solo = [1, 2, 3, 4, 5].map((i) => verse('s00' + i, 'solo', 'bible/solo:1:' + i, 'Solo sentence ' + i + '.'));
    const pool = { seed: 7, targets: solo };
    const taken = solo.map((t) => ({ id: 'x' + t.id, group: t.group, style: t.style, level: t.level, uk: t.uk, sentence: t.sentence }));
    const { dir, poolPath, packetPath } = makeMirror(taken, pool);
    const r = run(dir, poolPath, packetPath);
    expect(r.status).not.toBe(0);
    expect(r.stderr).toContain('stratum solo exact/: only 0 fresh targets');
    expect(fs.existsSync(path.join(dir, 'fresh-targets.json'))).toBe(false);
  });
});
