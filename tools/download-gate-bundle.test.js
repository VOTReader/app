/* The Wi-Fi-only switch (download-gate's _wifiOnly and its listeners) must live in one bundle. Bundles b and d are
   separate esbuild entries, so a module both import gets two copies with two states; Settings (d) would flip one
   while a download path in the other read its own. Bundle b needs only the stateless "is this link metered" check
   (sw-register's launch-time meaning download), which lives in metered-link.js, so b never bundles download-gate.
   esbuild runs in a child node: vitest's jsdom breaks it in-process. */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { execPath } from 'node:process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** @param {string} entry @returns {string[]} the source files esbuild bundles for this entry */
function inputsOf(entry) {
  const script = `require('esbuild').build({ entryPoints: [${JSON.stringify(entry)}], bundle: true, write: false,
    metafile: true, format: 'iife', target: 'chrome108', logLevel: 'silent' })
    .then((r) => process.stdout.write(JSON.stringify(Object.keys(r.metafile.inputs))))`;
  const r = spawnSync(execPath, ['-e', script], { cwd: ROOT, encoding: 'utf-8' });
  if (r.status !== 0) throw new Error('esbuild failed: ' + r.stderr);
  return JSON.parse(r.stdout).map((/** @type {string} */ k) => k.split('\\').join('/'));
}

describe('download-gate stays in one bundle', () => {
  it('bundle b does not bundle download-gate (its state lives in d only)', () => {
    const b = inputsOf('app/src/main/assets/src/stores/_entry-b.js');
    expect(b.some((k) => k.endsWith('utils/sw-register.js'))).toBe(true);
    expect(b.filter((k) => k.endsWith('utils/download-gate.js'))).toEqual([]);
  }, 60000);
});
