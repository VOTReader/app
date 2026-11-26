// @ts-nocheck
/* test-spawn: the file-stdio spawnSync/execFileSync behaves like node's for what the tests use. */
import { describe, it, expect } from 'vitest';
import * as cp from 'node:child_process';
import { spawnSync, execFileSync } from './test-spawn.js';

const NODE = process.execPath;
const PRINT = "process.stdout.write('out:' + require('fs').readFileSync(0, 'utf8')); process.stderr.write('err'); process.exitCode = +process.argv[1]";

describe('test-spawn', () => {
  it('spawnSync gives the same status, stdout and stderr as node\'s, input included', () => {
    for (const code of ['0', '3']) {
      const a = spawnSync(NODE, ['-e', PRINT, code], { encoding: 'utf8', input: 'hi' });
      const b = cp.spawnSync(NODE, ['-e', PRINT, code], { encoding: 'utf8', input: 'hi' });
      expect([a.status, a.stdout, a.stderr]).toEqual([b.status, b.stdout, b.stderr]);
      expect([a.status, a.stdout, a.stderr]).toEqual([+code, 'out:hi', 'err']);
    }
  });

  it('spawnSync without input gives an empty stdin and Buffers without encoding', () => {
    const r = spawnSync(NODE, ['-e', PRINT, '0']);
    expect(Buffer.isBuffer(r.stdout)).toBe(true);
    expect(r.stdout.toString()).toBe('out:');
  });

  it('execFileSync returns stdout and throws with status and output on a non-zero exit', () => {
    expect(execFileSync(NODE, ['-e', PRINT, '0'], { encoding: 'utf8' })).toBe('out:');
    let e;
    try { execFileSync(NODE, ['-e', PRINT, '2'], { encoding: 'utf8', input: 'x' }); } catch (err) { e = err; }
    expect([e.status, e.stdout, e.stderr]).toEqual([2, 'out:x', 'err']);
  });

  it('a timeout still kills the child', () => {
    const r = spawnSync(NODE, ['-e', 'setTimeout(() => {}, 60000)'], { timeout: 300 });
    expect(r.status).toBe(null);
    expect(r.signal).toBe('SIGTERM');
  });

  it('a call with its own stdio goes to node\'s', () => {
    expect(spawnSync(NODE, ['-e', '0'], { stdio: 'ignore' }).status).toBe(0);
  });
});
