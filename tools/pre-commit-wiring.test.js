/**
 * The pre-commit hook's gates are only as good as the triggers that arm them.
 *
 * tests-gates-6: Step 5c (`node tools/check-apk-assets.js`) sat inside the
 * bundle-source branch, whose trigger is anchored to `app/src/main/assets/`.
 * The one file that gate reads is `app/build.gradle.kts`, which cannot match
 * that anchor — so editing `ignoreAssetsPatterns`, the exact change the gate
 * exists to police, armed nothing. Same shape on the Kotlin side: the trigger
 * matched `.kt` and the gradle files but not `AndroidManifest.xml` or
 * `app/src/main/res/`, both of which the Robolectric suite reads.
 *
 * The first version of this file asserted the gate's call sat at column 0, and
 * the Verifier broke it both ways in a minute: moving the call into a function
 * nobody invokes kept it at column 0 and the test passed while the gate could
 * never run, and wrapping it in `if true; then … fi` changed no behaviour and
 * the test failed. A formatting pin is not a wiring proof.
 *
 * So the APK-gate case RUNS THE HOOK. A private index (GIT_INDEX_FILE) stages a
 * file that arms nothing else, the hook runs against it, and the assertion is
 * that the gate's own output line appears. An unreachable call prints nothing
 * and fails; a reindented reachable call prints it and passes. The trigger cases
 * below stay as they were: they extract the hook's real `grep -E` pattern and
 * run real paths through it, which is behaviour, not formatting.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync } from 'fs';
import { execFileSync, spawnSync } from 'child_process';
import { resolve, dirname, join, delimiter } from 'path';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hook = readFileSync(resolve(root, '.githooks/pre-commit'), 'utf8');
const lines = hook.split('\n');

/** The regex a `<name>_changed=$(… grep -E '<re>' …)` assignment tests staged paths with. */
function triggerFor(name) {
  const line = lines.find((l) => l.startsWith(`${name}=`));
  expect(line, `no ${name} assignment in the hook`).toBeTruthy();
  const m = line.match(/grep -E '(.+?)'/);
  expect(m, `no grep -E pattern in ${name}`).toBeTruthy();
  return new RegExp(m[1]);
}

/**
 * Run the real hook with `paths` staged, against a PRIVATE index — the
 * developer's own staged work is never read and never touched. Returns the
 * hook's combined output.
 */
function runHookWithStaged(paths) {
  const idx = join(mkdtempSync(join(tmpdir(), 'vot-hook-')), 'index');
  // A private index at HEAD makes a developer's uncommitted work read as UNSTAGED,
  // which Step 0b (v12-04) refuses; these cases are about other gates.
  const env = { ...process.env, GIT_INDEX_FILE: idx, VOT_HOOK_TEST_NO_STAGE_GUARD: '1' };
  try {
    execFileSync('git', ['read-tree', 'HEAD'], { cwd: root, env });
    execFileSync('git', ['add', '--', ...paths], { cwd: root, env });
    const r = spawnSync('sh', ['.githooks/pre-commit'], { cwd: root, env, encoding: 'utf8' });
    return (r.stdout || '') + (r.stderr || '');
  } finally {
    try { unlinkSync(idx); } catch { /* the temp dir goes with the run */ }
  }
}

/**
 * Run the real hook with ONE path staged at `content` in a private index (HEAD
 * plus that blob) - the working tree is never touched, so what is on disk and
 * what is staged differ for that path by construction. `guard: false` sets the
 * test-only skip for Step 0b; `pathFirst` puts a directory at the front of PATH.
 * Returns the combined output and the exit status.
 */
function runHookWithBlob(path, content, { guard = true, pathFirst = null } = {}) {
  const idx = join(mkdtempSync(join(tmpdir(), 'vot-hook-')), 'index');
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  if (!guard) env.VOT_HOOK_TEST_NO_STAGE_GUARD = '1';
  if (pathFirst) {
    const key = Object.keys(env).find((k) => k.toUpperCase() === 'PATH') || 'PATH';   // Windows spells it Path
    env[key] = pathFirst + delimiter + (env[key] || '');
  }
  try {
    execFileSync('git', ['read-tree', 'HEAD'], { cwd: root, env });
    const blob = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: root, env, input: content, encoding: 'utf8' }).trim();
    execFileSync('git', ['update-index', '--add', '--cacheinfo', `100644,${blob},${path}`], { cwd: root, env });
    const r = spawnSync('sh', ['.githooks/pre-commit'], { cwd: root, env, encoding: 'utf8' });
    return { out: (r.stdout || '') + (r.stderr || ''), status: r.status };
  } finally {
    try { unlinkSync(idx); } catch { /* the temp dir goes with the run */ }
  }
}

/** The regex an indented `<name>=$(… grep -E '<re>' …)` assignment tests paths with. */
function indentedTriggerFor(name) {
  const line = lines.find((l) => l.trimStart().startsWith(`${name}=`));
  expect(line, `no ${name} assignment in the hook`).toBeTruthy();
  const m = line.match(/grep -E '(.+?)'/);
  expect(m, `no grep -E pattern in ${name}`).toBeTruthy();
  return new RegExp(m[1]);
}

describe('pre-commit: the commit is the index (v12-04, improvement sweep 2026-09-22)', () => {
  it('refuses a commit whose bundle source differs between the index and the disk, before any gate runs', () => {
    // The gates and the rebuild read the working tree; this staged content is NOT
    // what is on disk, so without the guard the hook would test and bundle code the
    // commit does not contain.
    const path = 'app/src/main/assets/src/utils/backup.js';
    const onDisk = readFileSync(resolve(root, path), 'utf8');
    const { out, status } = runHookWithBlob(path, onDisk + '\n// a line only the index has\n');
    expect(status, out.slice(-600)).toBe(1);
    expect(out).toContain('UNSTAGED');
    expect(out).toContain(path);
    expect(out, 'refused before lint / tsc / vitest').not.toContain('running lint-staged');
  }, 60_000);

  it('guards every bundle source, but not the files the hook re-stages whole', () => {
    const guard = indentedTriggerFor('unstaged_sources');
    for (const p of ['app/src/main/assets/src/utils/backup.js', 'app/src/main/assets/src/ui/screens/SettingsScreen.jsx',
      'app/src/main/assets/src/data/books.js', 'app/src/main/assets/app.css', 'app/src/main/assets/manifest.json']) {
      expect(guard.test(p), `${p} must be guarded`).toBe(true);
    }
    for (const p of ['app/src/main/assets/index.html', 'app/src/main/assets/service-worker.js',
      'app/src/main/assets/dist/bundle-b.js', 'tools/eslint-globals.generated.js', 'CONTRIBUTING.md']) {
      expect(guard.test(p), `${p} is rebuilt/re-staged by the hook (or is no bundle source)`).toBe(false);
    }
  });
});

describe('pre-commit: the S22 measurement is checked at commit time (v12-05)', () => {
  it('arms on Scripture Web source and on the measurement itself, not on other screens', () => {
    const s22 = indentedTriggerFor('s22_changed');
    for (const p of ['app/src/main/assets/src/ui/screens/ScriptureWebScreen.jsx',
      'app/src/main/assets/src/ui/scripture-web/gestures.js', 'app/src/main/assets/src/utils/scripture-web/pick.js',
      'tools/perf/s22-frame-time.json']) {
      expect(s22.test(p), `${p} should arm the S22 check`).toBe(true);
    }
    for (const p of ['app/src/main/assets/src/ui/screens/HomeScreen.jsx', 'app/src/main/assets/app.css',
      'app/src/main/assets/src/ui/scripture-web/sub/nested.js']) {
      expect(s22.test(p), `${p} is not in the hashed Scripture Web source`).toBe(false);
    }
  });

  it('runs the real check when the measurement is staged, and warns without blocking the commit', () => {
    const path = 'tools/perf/s22-frame-time.json';
    const onDisk = readFileSync(resolve(root, path), 'utf8');
    const { out } = runHookWithBlob(path, onDisk + '\n', { guard: false });
    expect(out).toContain('checking its S22 frame-time measurement');
    expect(out).toContain('[s22-frame-time]');
    expect(out, 'a stale measurement must not stop the rest of the hook').toContain('Checking packaged-APK assets');
  }, 120_000);
});

describe('pre-commit: the bundles are rebuilt before the tests read them (v12-03)', () => {
  it('runs `npm run build` exactly once, before vitest', () => {
    const builds = lines.map((l, i) => (/^\s*npm run build\s*$/.test(l) ? i : -1)).filter((i) => i >= 0);
    const vitest = lines.findIndex((l) => /^\s*npm run test:coverage\s*$/.test(l));
    expect(builds.length, 'one build per commit').toBe(1);
    expect(vitest).toBeGreaterThan(-1);
    expect(builds[0], 'the build must come before the tests that read dist/').toBeLessThan(vitest);
  });
});

describe('pre-commit gate wiring', () => {
  it('actually runs the APK asset gate on a commit that arms nothing else', () => {
    // AGENTS.md is a doc: it matches no trigger in the hook. If the APK gate is
    // reachable at all it must still run, because tests-gates-6 made it
    // unconditional. This is the assertion the column-0 version only pretended
    // to make — an unreachable call prints none of this.
    const out = runHookWithStaged(['AGENTS.md']);
    expect(out).toContain('Checking packaged-APK assets vs runtime injections');
    expect(out).toContain('[apk-assets]');
  }, 120_000);

  it('the bundle-source trigger cannot arm a gate that reads app/build.gradle.kts', () => {
    // Not a regression to fix — it is WHY the gate must not live in that branch.
    expect(triggerFor('bundle_source_changed').test('app/build.gradle.kts')).toBe(false);
  });

  it('Step 5 re-stages every dist/ file the build writes (pc1)', () => {
    // bundle-g and bundle-h (2026-09-22) were added to the build chain but not to
    // this list, so a source change that landed in g or h committed a STALE bundle
    // unless someone staged it by hand, and CI's bundle-match failed after the push.
    // The list is held to what exists: every tracked dist/ file and every esbuild
    // --outfile in package.json must be in the hook's `git add`, so a bundle-i
    // fails here the day it is added.
    const start = lines.findIndex((l) => /^\s*git add app\/src\/main\/assets\/dist\//.test(l));
    expect(start, 'no `git add app/src/main/assets/dist/...` in the hook').toBeGreaterThan(-1);
    const staged = [];
    for (let i = start; i < lines.length; i++) {
      staged.push(...lines[i].replace(/^\s*git add\s+/, '').replace(/\\\s*$/, '').trim().split(/\s+/).filter(Boolean));
      if (!/\\\s*$/.test(lines[i])) break;
    }
    const tracked = execFileSync('git', ['ls-files', 'app/src/main/assets/dist/'], { cwd: root, encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter(Boolean);
    expect(tracked.length).toBeGreaterThan(10);
    const scripts = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8')).scripts;
    const outfiles = Object.values(scripts).flatMap((s) => [...String(s).matchAll(/--outfile=(\S+)/g)].map((m) => m[1]));
    expect(outfiles.length).toBeGreaterThan(5);
    for (const f of new Set([...tracked, ...outfiles])) {
      expect(staged, `${f} is built and tracked but Step 5 never re-stages it`).toContain(f);
    }
  });

  it('the Kotlin trigger matches every input the Robolectric suite reads', () => {
    const kotlin = triggerFor('kotlin_changed');
    for (const p of [
      'app/src/main/java/com/votreader/sacredui/MainActivity.kt',
      'app/src/test/java/com/votreader/sacredui/StorageManagerTest.kt',
      'app/src/main/AndroidManifest.xml',
      'app/src/main/res/values/strings.xml',
      'app/build.gradle.kts',
      'gradle/libs.versions.toml',
    ]) {
      expect(kotlin.test(p), `${p} should arm the Kotlin gate`).toBe(true);
    }
    // Still narrow: a web-only change must not cold-start Gradle.
    expect(kotlin.test('app/src/main/assets/index.html')).toBe(false);
  });
});

/* v12-06 (improvement sweep 2026-09-22): the hook called a bare `python`, and on this
   machine the first one on PATH is the Hermes agent's venv (3.11), not the Python 3.13 that
   requirements-dev.txt was measured on. So the data gate and the unittest suites ran on
   whichever interpreter an unrelated tool had put first. A fake `python` at the front of
   PATH proves no step reaches it. It needs the py launcher with 3.13, which this Windows
   machine has; CI's Linux runners have neither, and there `python` is the pinned one. */
const hasPy313 = spawnSync('py', ['-3.13', '-c', ''], { encoding: 'utf8' }).status === 0;
describe('pre-commit: Python steps run the pinned 3.13, not the first python on PATH (v12-06)', () => {
  it.skipIf(!hasPy313)('the data-gate and pin self-tests never reach a python earlier on PATH', () => {
    const fake = mkdtempSync(join(tmpdir(), 'vot-fakepy-'));
    writeFileSync(join(fake, 'python'), '#!/bin/sh\necho "FAKE-PYTHON-RAN $*"\nexit 3\n', { mode: 0o755 });
    const path = 'test_check_balance.py';   // arms Step 1c (the gate's self-test) and the pin check, nothing heavier
    const onDisk = readFileSync(resolve(root, path), 'utf8');
    const { out, status } = runHookWithBlob(path, onDisk + '\n', { guard: false, pathFirst: fake });
    expect(out).toContain('running test_check_balance.py');
    expect(out).not.toContain('FAKE-PYTHON-RAN');
    expect(status, out.slice(-800)).toBe(0);
  }, 120_000);
});
