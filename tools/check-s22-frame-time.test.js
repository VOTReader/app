// @ts-nocheck
/**
 * check-s22-frame-time: the Scripture Web's frame-time budget as a gate.
 * The check reads tools/perf/s22-frame-time.json and fails on a stale
 * source hash or a scene over budget; these cases build a throwaway repo
 * root so the real measurement is never touched.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { check, sourceHash, BUDGET, SCENES, JSON_PATH } from './check-s22-frame-time.js';

const SRC = 'app/src/main/assets/src/utils/scripture-web';
let root;
const write = (rel, text) => { mkdirSync(join(root, rel, '..'), { recursive: true }); writeFileSync(join(root, rel), text); };
const scene = (median, p90) => ({ frames: 170, median, p90, max: 40, fps: 57 });
const good = () => Object.fromEntries(SCENES.map((k) => [k, scene(16.7, 16.8)]));
const measurement = (hash, scenes = good()) => ({
  measured: '2026-09-22T08:00:00Z', sha: 'abcd1234', sourceHash: hash,
  device: { renderer: 'ANGLE (Qualcomm, Adreno (TM) 730, OpenGL ES 3.2)' }, scenes,
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 's22-budget-'));
  write(`${SRC}/geometry.js`, 'export const A = 1;\n');
  write(`${SRC}/geometry.test.js`, 'test\n');
  write('app/src/main/assets/src/ui/screens/ScriptureWebScreen.jsx', 'screen\n');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('the source hash', () => {
  it('covers the Scripture Web source and ignores its tests', () => {
    const h = sourceHash(root);
    write(`${SRC}/geometry.test.js`, 'a different test\n');
    expect(sourceHash(root)).toBe(h);
    write(`${SRC}/geometry.js`, 'export const A = 2;\n');
    expect(sourceHash(root)).not.toBe(h);
  });

  it('moves when the screen moves', () => {
    const h = sourceHash(root);
    write('app/src/main/assets/src/ui/screens/ScriptureWebScreen.jsx', 'a new screen\n');
    expect(sourceHash(root)).not.toBe(h);
  });
});

describe('the gate', () => {
  it('fails with no measurement, naming the command', () => {
    const r = check(root);
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toMatch(/measure:s22/);
  });

  it('passes a fresh, in-budget measurement', () => {
    write(JSON_PATH, JSON.stringify(measurement(sourceHash(root))));
    const r = check(root);
    expect(r.ok, r.lines.join('\n')).toBe(true);
    expect(r.lines.filter((l) => l.startsWith('ok ')).length).toBe(SCENES.length);
  });

  it('fails a STALE measurement once the source moves', () => {
    write(JSON_PATH, JSON.stringify(measurement(sourceHash(root))));
    write(`${SRC}/geometry.js`, 'export const A = 3;\n');
    const r = check(root);
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toMatch(/STALE/);
  });

  it('fails a scene over budget and names it', () => {
    const scenes = good();
    scenes.ceilingUp = scene(16.7, BUDGET.p90 + 13.4);
    write(JSON_PATH, JSON.stringify(measurement(sourceHash(root), scenes)));
    const r = check(root);
    expect(r.ok).toBe(false);
    expect(r.lines.join('\n')).toMatch(/OVER BUDGET ceilingUp: p90 33.4/);
  });

  it('fails a missing scene', () => {
    const scenes = good();
    delete scenes.mid;
    write(JSON_PATH, JSON.stringify(measurement(sourceHash(root), scenes)));
    expect(check(root).ok).toBe(false);
  });
});
