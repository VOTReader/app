/* Build targets (compat-floor-n1, audit 2026-11-23).
   Permanent Rule 6: every esbuild step targets chrome108, the runtime floor.
   The CSS also has a second floor: Safari / iOS 16.4 (the floor bundle-d's
   regex lookbehinds set; see CLAUDE.md beside Rule 6). With chrome108 alone,
   esbuild drops the -webkit- prefixes iOS 16.4-17.x still needs
   (-webkit-backdrop-filter, -webkit-hyphens), so the CSS step names all three. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const scripts = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')).scripts;
const esbuildSteps = Object.entries(scripts).filter(([k, v]) => /^build:/.test(k) && /^esbuild /.test(v));

describe('esbuild targets', () => {
  it('finds the esbuild build steps', () => {
    expect(esbuildSteps.map(([k]) => k)).toEqual(expect.arrayContaining(['build:b', 'build:c', 'build:d', 'build:w', 'build:css']));
  });
  it.each(esbuildSteps)('%s targets the chrome108 floor', (_k, cmd) => {
    const t = /--target=(\S+)/.exec(cmd);
    expect(t).not.toBeNull();
    expect(t[1].split(',')).toContain('chrome108');
  });
  it('build:css also targets Safari and iOS 16.4, so the -webkit- prefixes stay', () => {
    const t = /--target=(\S+)/.exec(scripts['build:css'])[1].split(',');
    expect(t).toEqual(expect.arrayContaining(['chrome108', 'safari16.4', 'ios16.4']));
  });
});
