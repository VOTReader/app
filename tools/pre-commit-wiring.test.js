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
import { readFileSync, unlinkSync, mkdtempSync } from 'fs';
import { execFileSync, spawnSync } from 'child_process';
import { resolve, dirname, join } from 'path';
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
  const env = { ...process.env, GIT_INDEX_FILE: idx };
  try {
    execFileSync('git', ['read-tree', 'HEAD'], { cwd: root, env });
    execFileSync('git', ['add', '--', ...paths], { cwd: root, env });
    const r = spawnSync('sh', ['.githooks/pre-commit'], { cwd: root, env, encoding: 'utf8' });
    return (r.stdout || '') + (r.stderr || '');
  } finally {
    try { unlinkSync(idx); } catch { /* the temp dir goes with the run */ }
  }
}

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
