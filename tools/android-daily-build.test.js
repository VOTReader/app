/* The owner's phone runs the `daily` build (ap1; improvement sweep v10-02; Corbin 2026-09-24 22:1x).
   ─────────────────────────────────────────────────────────────────────────────────────────────
   It is debug with debugging off. `adb install -r app-daily.apk` must upgrade his installed app in
   place, because the alternative is an uninstall and an uninstall wipes his journal. That holds only
   while daily starts from debug and changes nothing that decides the package or the signature.
   Proven on the built APK (2026-09-24): no android:debuggable in its manifest, the same V2 signer
   SHA-256 as the phone's install, firstInstallTime unchanged across debug -> daily -> debug on the
   vot_pixel9 emulator (a data marker survived both switches) and debug -> daily on the Pixel.

   A build script has no runtime to test here, so this reads its text, like gate-wiring does. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const code = readFileSync(resolve(ROOT, 'app', 'build.gradle.kts'), 'utf-8')
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

/** The body of `create("<name>") { ... }`, braces matched; null when there is none. */
function buildType(name) {
  const at = code.indexOf(`create("${name}")`);
  if (at < 0) return null;
  const open = code.indexOf('{', at);
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}' && --depth === 0) return code.slice(open + 1, i);
  }
  return null;
}

describe('the daily build type (ap1)', () => {
  const daily = buildType('daily');

  it('exists, starts from debug and turns debugging off', () => {
    expect(daily).toBeTruthy();
    expect(daily).toMatch(/initWith\(getByName\("debug"\)\)/);
    expect(daily).toMatch(/isDebuggable\s*=\s*false/);
  });

  it('keeps the package, the version and the debug signature, so it installs over debug in place', () => {
    for (const key of ['applicationId', 'applicationIdSuffix', 'versionCode', 'versionNameSuffix', 'signingConfig']) {
      expect(daily, `${key} in the daily block changes what decides an in-place upgrade`).not.toMatch(new RegExp(`\\b${key}\\b`));
    }
  });
});
