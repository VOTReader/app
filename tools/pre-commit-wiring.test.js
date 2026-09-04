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
 * These are wiring assertions, not behaviour assertions: they read the hook as
 * text and check that a gate is reachable from the change it polices.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const hook = readFileSync(resolve(root, '.githooks/pre-commit'), 'utf8');
const lines = hook.split('\n');

/** The regex a `<name>_changed=$(... grep -E '<re>' ...)` assignment tests staged paths with. */
function triggerFor(name) {
  const line = lines.find((l) => l.startsWith(`${name}=`));
  expect(line, `no ${name} assignment in the hook`).toBeTruthy();
  const m = line.match(/grep -E '(.+?)'/);
  expect(m, `no grep -E pattern in ${name}`).toBeTruthy();
  return new RegExp(m[1]);
}

describe('pre-commit gate wiring', () => {
  it('runs the APK asset gate unconditionally, not behind the bundle-source trigger', () => {
    const call = lines.findIndex((l) => l.trim() === 'node tools/check-apk-assets.js');
    expect(call, 'check-apk-assets.js is not called by the hook').toBeGreaterThan(-1);
    // Indented means nested in an `if`. Step 5d (asset-integrity) is the
    // pattern to match: column 0, outside every branch.
    expect(lines[call]).toBe('node tools/check-apk-assets.js');
  });

  it('the bundle-source trigger cannot arm a gate that reads app/build.gradle.kts', () => {
    // Not a regression to fix — it is why the gate must not live in there.
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

  it('the unconditional gates all sit at column 0', () => {
    for (const call of ['node tools/check-apk-assets.js', 'node tools/check-asset-integrity.js']) {
      expect(hook, `${call} missing`).toContain(call);
      expect(hook).toContain(`\n${call}\n`);
    }
  });
});
