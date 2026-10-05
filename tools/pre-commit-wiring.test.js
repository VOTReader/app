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
import { readFileSync, writeFileSync, unlinkSync, mkdtempSync, existsSync, mkdirSync } from 'fs';
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
  // GATE_SKIP: never wait on the machine's gates.lock (Step 0a) from inside the suite.
  const env = { ...process.env, GIT_INDEX_FILE: idx, VOT_HOOK_TEST_NO_STAGE_GUARD: '1', GATE_SKIP: '1' };
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
function runHookWithBlob(path, content, { guard = true, pathFirst = null, env: extra = {} } = {}) {
  const idx = join(mkdtempSync(join(tmpdir(), 'vot-hook-')), 'index');
  const env = { ...process.env, GIT_INDEX_FILE: idx, GATE_SKIP: '1', ...extra };
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

  it('guards every bundle source and index.html, but not the files the hook regenerates', () => {
    const guard = indentedTriggerFor('unstaged_sources');
    for (const p of ['app/src/main/assets/src/utils/backup.js', 'app/src/main/assets/src/ui/screens/SettingsScreen.jsx',
      'app/src/main/assets/src/data/books.js', 'app/src/main/assets/app.css', 'app/src/main/assets/manifest.json',
      'app/src/main/assets/index.html']) { // n7-10: an unstaged index.html edit was committed in silence
      expect(guard.test(p), `${p} must be guarded`).toBe(true);
    }
    for (const p of ['app/src/main/assets/service-worker.js',
      'app/src/main/assets/dist/bundle-b.js', 'tools/eslint-globals.generated.js', 'CONTRIBUTING.md']) {
      expect(guard.test(p), `${p} is rebuilt/re-staged by the hook (or is no bundle source)`).toBe(false);
    }
  });
});

describe('pre-commit: CRLF copies are rewritten before the build reads them (2026-10-05)', () => {
  it('turns a CRLF copy of an LF file under the build inputs into LF, and leaves the rest alone', () => {
    // the step's exact lines, run in a throwaway repo (never this one: hooks share one .git across worktrees)
    const step = hook.slice(hook.indexOf('crlf_copies=$(git ls-files --eol'), hook.indexOf('# ─── Step 0b2'));
    expect(step).toContain('sed -i');
    const dir = mkdtempSync(join(tmpdir(), 'vot-crlf-'));
    const g = (...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8' });
    g('init', '-q'); g('config', 'core.autocrlf', 'false');
    writeFileSync(join(dir, '.gitattributes'), '* text=auto eol=lf\n');
    mkdirSync(join(dir, 'app/src/main/assets'), { recursive: true });
    writeFileSync(join(dir, 'app/src/main/assets/app.css'), 'a{}\r\nb{}\r\n');   // as Python's text mode writes it
    writeFileSync(join(dir, 'notes.txt'), 'x\r\n');                              // outside the build inputs
    g('add', '-A'); g('-c', 'user.name=t', '-c', 'user.email=t@invalid', 'commit', '-qm', 'x');
    expect(g('status', '--porcelain'), 'git calls the CRLF copy clean').toBe('');
    const r = spawnSync('sh', ['-c', step], { cwd: dir, encoding: 'utf8' });
    expect(r.stdout + r.stderr).toContain('app/src/main/assets/app.css');
    expect(readFileSync(join(dir, 'app/src/main/assets/app.css'), 'utf8')).toBe('a{}\nb{}\n');
    expect(readFileSync(join(dir, 'notes.txt'), 'utf8')).toBe('x\r\n');
    expect(g('status', '--porcelain')).toBe('');
  });

  it('runs before the build', () => {
    expect(hook.indexOf('crlf_copies=$(git ls-files --eol')).toBeLessThan(lines.findIndex((l) => /^\s*npm run build\s*$/.test(l)) >= 0 ? hook.indexOf('\n  npm run build\n') : -1);
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
  it('runs `npm run build` exactly once; vitest and gradle are not in the commit hook (ln1 item 6: pre-push runs them)', () => {
    const builds = lines.map((l, i) => (/^\s*npm run build\s*$/.test(l) ? i : -1)).filter((i) => i >= 0);
    expect(builds.length, 'one build per commit').toBe(1);
    const code = lines.filter((l) => !l.trim().startsWith('#') && !/^\s*echo /.test(l));
    expect(code.filter((l) => /vitest|test:hook|test:coverage|gradlew|testDebugUnitTest/.test(l)), 'a heavy gate is back in pre-commit').toEqual([]);
  });
});

describe('pre-commit: one heavy gate run machine-wide (Step 0a, crash brief 2026-09-24)', () => {
  // The laptop bugchecked twice on 09-24 while a full vitest ran on 23 of 24 threads beside other lanes'
  // gates. D:/Swarm/tools/gate.sh (this machine only; CI never runs hooks) holds locks/gates.lock (the
  // lanes' mkdir + who-file lock) for the hook's run and caps VITEST_MAX_WORKERS at 8. A lock left by a dead
  // run is cleared, which is what these cases stage: a temp lock whose holder pid does not exist.
  const GATE_SH = 'D:/Swarm/tools/gate.sh';
  const deadLock = () => {
    const lock = join(mkdtempSync(join(tmpdir(), 'vot-gate-')), 'gates.lock').replace(/\\/g, '/');
    mkdirSync(lock);
    writeFileSync(lock + '/who', 'ghost pid=999999 since=2026-09-24T11:00:00 what=pre-commit\n');
    return lock;
  };
  const gateEnv = (lock) => ({ GATE_SKIP: '', GATE_HELD_BY: '', GATE_LOCK: lock });

  // ln1 items 6-7 (2026-10-05): only vitest and gradle hold the lock, and they run in .githooks/pre-push now.
  // Holding it for the whole hook queued every lane's lint, tsc and build behind one another.
  it.skipIf(!existsSync(GATE_SH))('a commit with no heavy step never takes the lock', () => {
    const lock = deadLock();
    const onDisk = readFileSync(resolve(root, '.gitignore'), 'utf8');
    const { out } = runHookWithBlob('.gitignore', onDisk + '\n# gate wiring\n', { env: gateEnv(lock) });
    expect(out).not.toContain('[gate]');
    expect(existsSync(lock), 'the lock is left as it was').toBe(true);
  }, 120_000);

  it('the commit hook takes no lock at all (vitest and gradle hold it in .githooks/pre-push)', () => {
    expect(lines.filter((l) => /gate_take|heavy_run/.test(l) && !l.trim().startsWith('#'))).toEqual([]);
  });

  it.skipIf(!existsSync(GATE_SH))('leaves the lock alone for a commit of docs only', () => {
    const lock = deadLock();
    const onDisk = readFileSync(resolve(root, 'AGENTS.md'), 'utf8');
    const { out } = runHookWithBlob('AGENTS.md', onDisk + '\n', { env: gateEnv(lock) });
    expect(out).not.toContain('[gate]');
    expect(existsSync(lock), 'a docs-only commit never touches the lock').toBe(true);
  }, 120_000);
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

  it('the Kotlin trigger (in .githooks/pre-push since ln1 item 6) matches every input the Robolectric suite reads', () => {
    const prePush = readFileSync(resolve(root, '.githooks/pre-push'), 'utf8');
    const kotlin = new RegExp(prePush.match(/^\s*kotlin_changed=.*grep -E '(.+?)'/m)[1]);
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
