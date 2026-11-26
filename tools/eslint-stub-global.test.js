/* sleep-test (2026-11-26): vi.stubGlobal('document', ...) threw "Cannot redefine property: document" in the vmThreads
   pool (the pre-commit hook's fast run) and passed in the default pool, so a test went red on the first run and green
   on the second. The test-file blocks of eslint.config.js refuse vi.stubGlobal on document, window, location and top.
   Linted through the real eslint.config.js as test files, so deleting the rule, or a later block turning it off,
   fails here; so does the test block dropping the src block's hooks-2 selector (a later no-restricted-syntax
   replaces the earlier options). */
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const eslint = new ESLint({ cwd: ROOT });
/** The no-restricted-syntax messages for code linted as the given repo path. @param {string} code @param {string} path */
const lint = async (code, path = 'app/src/main/assets/src/utils/x.test.js') => {
  const [res] = await eslint.lintText(code, { filePath: resolve(ROOT, path) });
  return res.messages.filter((m) => m.ruleId === 'no-restricted-syntax').map((m) => m.message);
};

describe('sleep-test: no vi.stubGlobal on jsdom\'s unforgeable globals in tests', () => {
  it.each(['document', 'window', 'location', 'top'])('refuses vi.stubGlobal(%j, ...) in a src test file', async (name) => {
    const msgs = await lint(`vi.stubGlobal('${name}', { visibilityState: 'hidden' });`);
    expect(msgs).toHaveLength(1);
    expect(msgs[0]).toMatch(/vmThreads/);
    expect(msgs[0]).toMatch(/Object\.defineProperty\(document, 'visibilityState'/);
  }, 30000);

  it('refuses the double-quoted and template-literal spellings, and in a .jsx test and a tools test', async () => {
    expect(await lint('vi.stubGlobal("document", {});')).toHaveLength(1);
    expect(await lint('vi.stubGlobal(`window`, {});')).toHaveLength(1);
    expect(await lint("vi.stubGlobal('location', {});", 'app/src/main/assets/src/ui/X.test.jsx')).toHaveLength(1);
    expect(await lint("vi.stubGlobal('document', {});", 'tools/x.test.js')).toHaveLength(1);
  }, 30000);

  it('lets through the globals that stub fine in both pools, and the getter pattern', async () => {
    for (const code of [
      "vi.stubGlobal('self', {});",
      "vi.stubGlobal('navigator', { onLine: false });",
      "vi.stubGlobal('fetch', () => {});",
      "vi.stubGlobal('documentation', {});",
      "Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });",
    ]) expect(await lint(code), code).toEqual([]);
  }, 30000);

  it('a src test file keeps the hooks-2 selector', async () => {
    expect(await lint('React.useSyncExternalStore(Store.subscribe, Store.getVersion);')).toHaveLength(1);
  }, 30000);
});
