/**
 * tools/semantic-units.test.js — tests for tools/semantic-units.mjs.
 *
 * semanticUnits() and fingerprint() are exported, and the CLI is behind a
 * main-module guard, so the module imports cleanly into vitest. The units
 * are built from the repo's own corpus (read-only); the CLI's write path
 * is exercised by running the real script with an output file under a
 * throwaway directory, so nothing is written into the repo.
 */

import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { semanticUnits, fingerprint } from './semantic-units.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const SCRIPT = resolve(HERE, 'semantic-units.mjs');

const HEX16 = /^[0-9a-f]{16}$/;

describe('fingerprint', () => {
  const set = {
    keys: ['bible/genesis:1:1', 'vol1/letter-a'],
    units: [
      { k: 0, s: 0, t: 'In the beginning God created the heaven and the earth.' },
      { k: 1, s: -1, t: 'Letter A' },
      { k: 1, s: 0, t: 'First sentence here. Second sentence here. Third sentence here.' },
    ],
  };

  it('is a stable 16 hex chars', () => {
    expect(fingerprint(set)).toMatch(HEX16);
    expect(fingerprint(set)).toBe(fingerprint(set));
  });

  it('moves when a unit text moves', () => {
    const changed = { ...set, units: [{ ...set.units[0], t: 'In the beginning God created the heaven and the earth!' }] };
    expect(fingerprint(changed)).not.toBe(fingerprint(set));
  });

  it('moves when a key moves', () => {
    expect(fingerprint({ ...set, keys: ['bible/genesis:1:2', 'vol1/letter-a'] })).not.toBe(fingerprint(set));
  });

  it('moves when a unit start moves', () => {
    const changed = { ...set, units: set.units.map((u) => (u.s === 0 && u.k === 1 ? { ...u, s: 5 } : u)) };
    expect(fingerprint(changed)).not.toBe(fingerprint(set));
  });
});

describe('semanticUnits', () => {
  it('covers the corpus: unique keys, indexed units, trimmed texts', async () => {
    const set = await semanticUnits();
    expect(set.keys.length).toBeGreaterThan(1000);
    expect(new Set(set.keys).size).toBe(set.keys.length);
    expect(set.units.length).toBeGreaterThan(set.keys.length);
    for (const u of set.units) {
      expect(u.k).toBeGreaterThanOrEqual(0);
      expect(u.k).toBeLessThan(set.keys.length);
      expect(u.s).toBeGreaterThanOrEqual(-1);
      expect(u.t.length).toBeGreaterThan(0);
      expect(u.t).toBe(u.t.trim());
    }
  });

  it('is deterministic: the same corpus gives the same set and fingerprint', async () => {
    const a = await semanticUnits();
    const b = await semanticUnits();
    expect(b).toEqual(a);
    expect(fingerprint(b)).toBe(fingerprint(a));
  });

  it('a verse unit starts at 0 and holds the verse text', async () => {
    const set = await semanticUnits();
    const verseKey = set.keys.findIndex((k) => k === 'bible/genesis:1:1');
    expect(verseKey).toBeGreaterThanOrEqual(0);
    const verseUnits = set.units.filter((u) => u.k === verseKey);
    expect(verseUnits.length).toBe(1);
    expect(verseUnits[0].s).toBe(0);
    expect(verseUnits[0].t).toContain('In the beginning');
  });

  it('the CLI writes the same set to a file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'vot-semantic-units-'));
    try {
      const out = join(dir, 'units.json');
      const r = spawnSync(process.execPath, [SCRIPT, out], { encoding: 'utf8', cwd: ROOT });
      expect(r.status).toBe(0);
      expect(r.stdout).toContain('units over');
      const written = JSON.parse(readFileSync(out, 'utf8'));
      expect(written.fingerprint).toBe(fingerprint({ keys: written.keys, units: written.units }));
      const direct = await semanticUnits();
      expect(written.keys).toEqual(direct.keys);
      expect(written.units).toEqual(direct.units);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
