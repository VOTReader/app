/* tools/merge-generated.mjs (network ln1 item 5, 2026-10-05): service-worker.js and index.html merge without a conflict
   when two landings differ only in generated lines, and still conflict on a real hand-edit clash. The git case runs the
   driver through a real rebase in a temp repo, configured the way tools/install-merge-drivers.sh does it. */
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { mergeGenerated, maskLine } from './merge-generated.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const H = (c) => c.repeat(64);
const sw = ({ version = 'v1-aaa', bundle = H('a'), css = H('b'), install = '// install', fetch = '// fetch' } = {}) => [
  "const CACHE_VERSION = '" + version + "';",
  'const ASSET_INTEGRITY = {',
  "  './dist/bundle-a.js': '" + bundle + "',",
  "  './dist/app.min.css': '" + css + "',",
  '};',
  install,
  '// (git merges edits to adjacent lines as one conflict: keep the two hand-edited lines apart)',
  '//',
  fetch,
  '',
].join('\n');

describe('maskLine', () => {
  it('masks the cache version, an integrity hash and CSP hashes, nothing else', () => {
    expect(maskLine("const CACHE_VERSION = 'v1.0.2-abc';").key).toBe('CACHE_VERSION');
    expect(maskLine("  './dist/bundle-a.js': '" + H('f') + "',").masked).toContain('@GENERATED@');
    expect(maskLine("script-src 'self' 'sha256-AbC+/=' 'sha256-XyZ=';").masked).not.toMatch(/AbC|XyZ/);
    expect(maskLine('self.addEventListener("fetch", f);').key).toBeNull();
  });
});

describe('mergeGenerated', () => {
  it('two landings that each rebuilt: no conflict, ours generated values, both hand edits kept', () => {
    const base = sw();
    const ours = sw({ version: 'v1-ours', bundle: H('c'), install: '// install (ours)' });
    const theirs = sw({ version: 'v1-theirs', bundle: H('d'), css: H('e'), fetch: '// fetch (theirs)' });
    const { clean, text } = mergeGenerated(base, ours, theirs);
    expect(clean).toBe(true);
    expect(text).toContain("const CACHE_VERSION = 'v1-ours';");
    expect(text).toContain("'./dist/bundle-a.js': '" + H('c') + "'");
    expect(text).toContain('// install (ours)');
    expect(text).toContain('// fetch (theirs)');
    expect(text).not.toContain('@GENERATED@');
  });

  it('an entry only theirs has takes their value', () => {
    const base = sw();
    const theirs = sw().replace('};', "  './dist/bundle-z.js': '" + H('9') + "',\n};");
    const { clean, text } = mergeGenerated(base, sw({ version: 'v1-ours' }), theirs);
    expect(clean).toBe(true);
    expect(text).toContain("'./dist/bundle-z.js': '" + H('9') + "'");
  });

  it('a real hand-edit clash still conflicts', () => {
    const { clean, text } = mergeGenerated(sw(), sw({ install: '// ours' }), sw({ install: '// theirs' }));
    expect(clean).toBe(false);
    expect(text).toMatch(/<<<<<<< ours[\s\S]*\/\/ ours[\s\S]*=======[\s\S]*\/\/ theirs[\s\S]*>>>>>>> theirs/);
  });
});

describe('the driver in a real rebase', () => {
  // HERMETIC: inside the pre-commit hook git exports GIT_DIR / GIT_INDEX_FILE, and a child git inherits them; this
  // file's fixtures once rewrote the REAL repo's config that way (core.bare=true, user t, 2026-10-05 04:07).
  // vitest.setup.js now strips GIT_* for every test; here, on top of that, every process gets an env without GIT_*,
  // git runs with -C <temp>, and init() refuses a repo whose git dir is not inside its temp dir.
  const env = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('GIT_')));
  const git = (cwd, ...a) => execFileSync('git', ['-C', cwd, ...a], { cwd, env, encoding: 'utf8' }).trim();
  const run = (cwd, cmd, args) => spawnSync(cmd, args, { cwd, env, encoding: 'utf8' });
  const slash = (p) => p.split('\\').join('/').toLowerCase();
  const init = (prefix) => {
    const dir = mkdtempSync(join(tmpdir(), prefix));
    git(dir, 'init', '-q', '-b', 'main');
    const gitDir = slash(git(dir, 'rev-parse', '--absolute-git-dir'));
    if (!gitDir.startsWith(slash(dir))) throw new Error(`refusing: git dir ${gitDir} is not inside ${dir}`);
    return dir;
  };

  it('rebases two landings that both rebuilt the SW and dist without stopping', () => {
    const dir = init('votgen-');
    git(dir, 'config', 'user.email', 't@t'); git(dir, 'config', 'user.name', 't');
    git(dir, 'config', 'core.autocrlf', 'false');
    mkdirSync(join(dir, 'tools')); mkdirSync(join(dir, 'app/src/main/assets/dist'), { recursive: true });
    copyFileSync(join(HERE, 'merge-generated.mjs'), join(dir, 'tools/merge-generated.mjs'));
    copyFileSync(join(HERE, 'install-merge-drivers.sh'), join(dir, 'tools/install-merge-drivers.sh'));
    writeFileSync(join(dir, '.gitattributes'), [
      'app/src/main/assets/dist/** merge=votgen-ours',
      'app/src/main/assets/service-worker.js merge=votgen-sw',
      '',
    ].join('\n'));
    run(dir, 'sh', ['tools/install-merge-drivers.sh']);
    const SW = join(dir, 'app/src/main/assets/service-worker.js');
    const DIST = join(dir, 'app/src/main/assets/dist/bundle-a.js');
    writeFileSync(SW, sw()); writeFileSync(DIST, 'base();');
    git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'base');
    git(dir, 'checkout', '-q', '-b', 'lane');
    writeFileSync(SW, sw({ version: 'v1-lane', bundle: H('c'), install: '// install (lane)' }));
    writeFileSync(DIST, 'lane();');
    git(dir, 'commit', '-q', '-am', 'lane landing');
    git(dir, 'checkout', '-q', 'main');
    writeFileSync(SW, sw({ version: 'v1-main', bundle: H('d'), fetch: '// fetch (main)' }));
    writeFileSync(DIST, 'main();');
    git(dir, 'commit', '-q', '-am', 'another landing');
    git(dir, 'checkout', '-q', 'lane');
    const r = run(dir, 'git', ['rebase', 'main']);
    expect(r.status, r.stdout + r.stderr).toBe(0);
    const merged = readFileSync(SW, 'utf8');
    expect(merged).toContain('// install (lane)');
    expect(merged).toContain('// fetch (main)');
    expect(merged).not.toContain('<<<<<<<');
    expect(readFileSync(DIST, 'utf8')).toBe('main();');   // ours during a rebase = the branch being rebuilt onto
  }, 30_000);

  it('a tree without the driver script gets a plain text merge with conflict markers, never a silent ours', () => {
    const dir = init('votgen-old-');
    git(dir, 'config', 'user.email', 't@t'); git(dir, 'config', 'user.name', 't');
    git(dir, 'config', 'core.autocrlf', 'false');
    run(dir, 'sh', [slash(join(HERE, 'install-merge-drivers.sh'))]);
    writeFileSync(join(dir, '.gitattributes'), 'sw.js merge=votgen-sw\n');
    writeFileSync(join(dir, 'sw.js'), sw());
    git(dir, 'add', '-A'); git(dir, 'commit', '-q', '-m', 'base');
    git(dir, 'checkout', '-q', '-b', 'lane');
    writeFileSync(join(dir, 'sw.js'), sw({ version: 'v1-lane' }));
    git(dir, 'commit', '-q', '-am', 'lane');
    git(dir, 'checkout', '-q', 'main');
    writeFileSync(join(dir, 'sw.js'), sw({ version: 'v1-main' }));
    git(dir, 'commit', '-q', '-am', 'main');
    git(dir, 'checkout', '-q', 'lane');
    const r = run(dir, 'git', ['rebase', 'main']);
    expect(r.status).not.toBe(0);
    expect(readFileSync(join(dir, 'sw.js'), 'utf8')).toMatch(/<<<<<<< ours[\s\S]*v1-main[\s\S]*v1-lane[\s\S]*>>>>>>> theirs/);
    run(dir, 'git', ['rebase', '--abort']);
  }, 30_000);
});
