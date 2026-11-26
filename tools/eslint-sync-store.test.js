/* hooks-2 (audit 2026-11-23): React.useSyncExternalStore(X.subscribe, ...) hands React the bare function, so a store
   whose subscribe uses `this` subscribes nothing (in the sloppy-mode bundle `this` is window), and the screen
   silently stops updating. The src block refuses a member expression as the subscribe argument; wrap it
   (useStoreVersion(store), or React.useCallback((cb) => X.subscribe(cb), [])). */
import { describe, expect, it } from 'vitest';
import { Linter } from 'eslint';

import config from '../eslint.config.js';

const src = config.find((block) => (block.files ?? []).some((f) => f.includes('app/src/main/assets/src/**')));
const lint = (code) => new Linter({ configType: 'flat' }).verify(code, [{
  files: ['**/*.jsx'],
  languageOptions: { ecmaVersion: 2022, sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
  rules: { 'no-restricted-syntax': src.rules['no-restricted-syntax'] },
}], { filename: 'x.jsx' }).map((m) => m.message);

describe('hooks-2: no X.subscribe member argument to useSyncExternalStore', () => {
  it('refuses React.useSyncExternalStore(X.subscribe, ...) and the bare useSyncExternalStore form', () => {
    expect(lint('React.useSyncExternalStore(Store.subscribe, Store.getVersion);')).toHaveLength(1);
    expect(lint('useSyncExternalStore(Store.subscribe, () => 0);')).toHaveLength(1);
    expect(lint('React.useSyncExternalStore(window.__c.subscribe, () => 0);')[0]).toMatch(/this/);
  });

  it('refuses the same bare member behind a guard (DownloadChooser, OfflineAudioControls)', () => {
    expect(lint('React.useSyncExternalStore(s ? s.subscribe : noop, s ? s.getVersion : zero);')).toHaveLength(1);
    expect(lint('React.useSyncExternalStore(s ? noop : s.subscribe, () => 0);')).toHaveLength(1);
    expect(lint('React.useSyncExternalStore(s && s.subscribe, () => 0);')).toHaveLength(1);
    expect(lint('useSyncExternalStore(l ? l.store.subscribe : noop, () => 0);')).toHaveLength(1);
  });

  it('lets a wrapped subscribe through', () => {
    expect(lint('React.useSyncExternalStore(React.useCallback((cb) => Store.subscribe(cb), []), () => Store.getVersion());')).toEqual([]);
    expect(lint('React.useSyncExternalStore(subscribe, getSnapshot);')).toEqual([]);
    expect(lint('React.useSyncExternalStore(s ? (cb) => s.subscribe(cb) : noop, () => 0);')).toEqual([]);
  });
});
