/* The data-integrity path type-checks with strictNullChecks (v15-code-health-10).
   tsconfig.json runs strict: false over the whole app. tsconfig.strict-data.json
   adds strictNullChecks over stores/ and utils/backup*.js (the readers' saved
   data and its only backup), where a null slipping through is lost data rather
   than a blank label. `npm run typecheck` (the pre-commit hook, CI and the
   deploy job all run it) checks both; ratchet the include outward from here. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

describe('strict data typecheck', () => {
  const cfg = JSON.parse(read('tsconfig.strict-data.json'));
  it('turns strictNullChecks on over the stores and the backup path', () => {
    expect(cfg.compilerOptions.strictNullChecks).toBe(true);
    expect(cfg.include).toEqual(expect.arrayContaining([
      'app/src/main/assets/src/stores/**/*.js',
      'app/src/main/assets/src/utils/backup*.js',
    ]));
  });
  it('is part of npm run typecheck', () => {
    const script = JSON.parse(read('package.json')).scripts.typecheck;
    expect(script).toContain('tsc --noEmit');
    expect(script).toContain('tsc -p tsconfig.strict-data.json --noEmit');
  });
});
