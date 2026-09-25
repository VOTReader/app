/* us1 (U5): the APK's versionName is the web build's CACHE_VERSION, not a fixed "1.0".
   Read as text (the Gradle script has no runtime here); the real value was checked with
   aapt dump badging on an assembleDaily build when this landed. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const gradle = readFileSync(join(ROOT, 'app/build.gradle.kts'), 'utf8');
const sw = readFileSync(join(ROOT, 'app/src/main/assets/service-worker.js'), 'utf8');

describe('the APK version name', () => {
  it('is read from service-worker.js CACHE_VERSION, with "1.0" only as the fallback', () => {
    expect(gradle).not.toMatch(/versionName = "1\.0"/);
    expect(gradle).toContain('providers.fileContents(layout.projectDirectory.file("src/main/assets/service-worker.js"))');
    expect(gradle).toContain(`Regex("const CACHE_VERSION = '([^']+)'")`);
  });

  it('the pattern Gradle reads still matches the service worker', () => {
    expect(sw).toMatch(/const CACHE_VERSION = '([^']+)'/);
  });

  it('versionCode stays 1, so the owner\'s phone keeps updating in place', () => {
    expect(gradle).toMatch(/versionCode = 1\n/);
  });
});
