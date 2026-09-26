// @ts-nocheck — node built-ins and a DiagnosticLog stub on globalThis
/* backupWarn — backup warnings reach the in-app diagnostic log, and only safe parts do (v15-code-health-11). */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { backupWarn } from './backup-warn.js';

let log;
beforeEach(() => {
  log = { warn: vi.fn() };
  globalThis.DiagnosticLog = log;
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { delete globalThis.DiagnosticLog; vi.restoreAllMocks(); });

describe('backupWarn', () => {
  it('writes the console exactly as before', () => {
    const e = new Error('x');
    backupWarn('store import failed for', 'vot-notes', e);
    expect(console.warn).toHaveBeenCalledWith('store import failed for', 'vot-notes', e);
  });

  it('logs the message, names and an error NAME under the backup tag', () => {
    backupWarn('store import failed for', 'vot-notes', new TypeError('Unexpected token } in JSON at position 4 "my private note"'));
    expect(log.warn).toHaveBeenCalledWith('backup', 'store import failed for vot-notes TypeError');
    expect(log.warn.mock.calls[0][1]).not.toContain('private');
  });

  it('a violation list is logged as a count, never its contents', () => {
    backupWarn('skipping store with invalid payload:', 'vot-journal', ['entry 3: text is "secret"']);
    expect(log.warn).toHaveBeenCalledWith('backup', 'skipping store with invalid payload: vot-journal 1 problem');
    backupWarn('import envelope invalid:', ['a', 'b']);
    expect(log.warn).toHaveBeenLastCalledWith('backup', 'import envelope invalid: 2 problems');
  });

  it('numbers pass; plain objects without a name are dropped', () => {
    backupWarn('media past cap', 42, { some: 'thing' });
    expect(log.warn).toHaveBeenCalledWith('backup', 'media past cap 42');
  });

  it('no DiagnosticLog, or one that throws, still warns the console', () => {
    delete globalThis.DiagnosticLog;
    expect(() => backupWarn('x')).not.toThrow();
    globalThis.DiagnosticLog = { warn: () => { throw new Error('full'); } };
    expect(() => backupWarn('y')).not.toThrow();
    expect(console.warn).toHaveBeenCalledTimes(2);
  });

  it('backup.js and backup-flow.js warn through it (the three lines that log their own DiagnosticLog entry excepted)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(strip(readFileSync(join(here, 'backup.js'), 'utf8')).match(/console\.warn\(/g) || []).toEqual([]);
    const flow = strip(readFileSync(join(here, 'backup-flow.js'), 'utf8'));
    const left = flow.split('\n').filter((l) => l.includes('console.warn('));
    expect(left).toHaveLength(3);
    for (const l of left) expect(l).toMatch(/integrity check failed|non-critical database/);
  });
});
