/* hooks-2 (audit 2026-11-23): React.useSyncExternalStore(X.subscribe, ...) hands React the bare function, so a store
   whose subscribe uses `this` subscribes nothing (in the sloppy-mode bundle `this` is window), and the screen
   silently stops updating. The src block refuses a subscribe argument that can evaluate to a bare member; wrap it
   (useStoreVersion(store), or React.useCallback((cb) => X.subscribe(cb), [])).
   Linted through the real eslint.config.js as a src file, so deleting the rule, or a later block turning it off
   for src, fails here. */
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const eslint = new ESLint({ cwd: ROOT });
/** The rule's messages for code linted as a file under app/src/main/assets/src. @param {string} code */
const lint = async (code) => {
  const [res] = await eslint.lintText(code, { filePath: resolve(ROOT, 'app/src/main/assets/src/x.jsx') });
  return res.messages.filter((m) => m.ruleId === 'no-restricted-syntax').map((m) => m.message);
};

describe('hooks-2: no bare X.subscribe as useSyncExternalStore\'s subscribe', () => {
  it('the real config refuses it in a src file', async () => {
    expect(await lint('React.useSyncExternalStore(Store.subscribe, Store.getVersion);')).toHaveLength(1);
    expect(await lint('useSyncExternalStore(Store.subscribe, () => 0);')).toHaveLength(1);
    expect((await lint('React.useSyncExternalStore(window.__c.subscribe, () => 0);'))[0]).toMatch(/this/);
  }, 30000);

  it.each([
    ['a ternary branch', 'React.useSyncExternalStore(s ? s.subscribe : noop, s ? s.getVersion : zero);'],
    ['the other ternary branch', 'React.useSyncExternalStore(s ? noop : s.subscribe, () => 0);'],
    ['the right of &&', 'React.useSyncExternalStore(s && s.subscribe, () => 0);'],
    ['a deeper member in a branch', 'useSyncExternalStore(l ? l.store.subscribe : noop, () => 0);'],
    ['optional chaining', 'React.useSyncExternalStore(s?.subscribe, () => 0);'],
    ['optional chaining with ??', 'React.useSyncExternalStore(s?.subscribe ?? noop, () => 0);'],
    ['the left of ||', 'React.useSyncExternalStore(S.subscribe || noop, () => 0);'],
    ['the left of ??', 'React.useSyncExternalStore(S.subscribe ?? noop, () => 0);'],
    ['the left of &&', 'React.useSyncExternalStore(S.subscribe && noop, () => 0);'],
    ['a nested ternary', 'React.useSyncExternalStore(a ? (b ? S.subscribe : noop) : noop, () => 0);'],
    ['a ternary three deep', 'React.useSyncExternalStore(a ? noop : b ? noop : c ? s?.subscribe : noop, () => 0);'],
    ['the comma form', 'React.useSyncExternalStore((0, S.subscribe), () => 0);'],
    ['an assignment', 'React.useSyncExternalStore((sub = S.subscribe), () => 0);'],
  ])('refuses %s, once', async (_what, code) => {
    expect(await lint(code)).toHaveLength(1);
  }, 30000);

  it('lets a wrapped or bound subscribe through', async () => {
    for (const code of [
      'React.useSyncExternalStore(React.useCallback((cb) => Store.subscribe(cb), []), () => Store.getVersion());',
      'React.useSyncExternalStore(subscribe, getSnapshot);',
      'React.useSyncExternalStore(s ? (cb) => s.subscribe(cb) : noop, () => 0);',
      'React.useSyncExternalStore(s?.subscribe.bind(s) ?? noop, () => 0);',
      'React.useSyncExternalStore(S.subscribe.bind(S), () => 0);',
    ]) expect(await lint(code), code).toEqual([]);
  }, 30000);
});
