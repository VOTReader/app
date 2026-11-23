// Tests for the repo-root ESLint flat config (eslint.config.js).
//
// Placement: vitest.config.js `include` is app/... + tools/... (+ relay, votes),
// so a root eslint.config.test.js would never run. This file lives under tools/
// and imports the config by relative path instead. It asserts the config loads
// and carries the expected rules/ignores, nothing more.
import { describe, expect, it } from 'vitest';

import config from '../eslint.config.js';

const blockFor = (filesPattern) =>
  config.find((block) => (block.files ?? []).some((f) => f.includes(filesPattern)));

// The React Compiler shed in the src block: eslint-plugin-react-hooks@7's
// recommended set ships 16 rules; the canonical pair stay on, these 14 go off.
const compilerRulesOff = [
  'react-hooks/static-components',
  'react-hooks/use-memo',
  'react-hooks/preserve-manual-memoization',
  'react-hooks/incompatible-library',
  'react-hooks/immutability',
  'react-hooks/globals',
  'react-hooks/refs',
  'react-hooks/set-state-in-effect',
  'react-hooks/error-boundaries',
  'react-hooks/purity',
  'react-hooks/set-state-in-render',
  'react-hooks/unsupported-syntax',
  'react-hooks/config',
  'react-hooks/gating',
];

const unusedVarsWarn = ['warn', {
  argsIgnorePattern: '^_',
  varsIgnorePattern: '^_',
  caughtErrorsIgnorePattern: '^_',
}];

describe('eslint.config.js', () => {
  it('exports an array of four config objects', () => {
    expect(Array.isArray(config)).toBe(true);
    expect(config).toHaveLength(4);
  });

  it('ignores dist, minified, generated data, vendor and node_modules', () => {
    expect(config[0].ignores).toHaveLength(7);
    expect(config[0].ignores).toEqual(expect.arrayContaining([
      'app/src/main/assets/dist/**',
      'app/src/main/assets/*.min.js',
      'app/src/main/assets/search-data.js',
      'app/src/main/assets/src/data/**',
      'app/src/main/assets/src/search/vendor/**',
      'node_modules/**',
      'tools/eslint-globals.generated.js',
    ]));
  });

  it('src block: JSX modules on React 18.2 with the recommended sets', () => {
    const src = blockFor('app/src/main/assets/src/**');
    expect(src.languageOptions.ecmaVersion).toBe(2022);
    expect(src.languageOptions.sourceType).toBe('module');
    expect(src.languageOptions.parserOptions.ecmaFeatures.jsx).toBe(true);
    expect(src.settings.react.version).toBe('18.2');
    expect(src.plugins.react).toBeDefined();
    expect(src.plugins['react-hooks']).toBeDefined();
    // Recommended sets are spread in.
    expect(src.rules['no-undef']).toBe('error');
    expect(src.rules['react/jsx-uses-react']).toBe(2); // react recommended uses numeric severity here
    expect(src.rules['react-hooks/rules-of-hooks']).toBe('error');
    expect(src.rules['react-hooks/exhaustive-deps']).toBe('warn');
    // Generated globals are in scope, with the one writable override.
    expect(src.languageOptions.globals.window).toBeDefined();
    expect(src.languageOptions.globals.__scrollEl).toBe('writable');
  });

  it('src block: local tweaks', () => {
    const src = blockFor('app/src/main/assets/src/**');
    expect(src.rules['no-unused-vars']).toEqual(unusedVarsWarn);
    expect(src.rules['react/prop-types']).toBe('off');
    expect(src.rules['react/display-name']).toBe('off');
    expect(src.rules['react/jsx-no-undef']).toEqual(['error', { allowGlobals: true }]);
    expect(src.rules['no-empty']).toBe('warn');
    expect(src.rules['no-restricted-globals'][0]).toBe('error');
    expect(src.rules['no-restricted-globals'].slice(1).map((r) => r.name))
      .toEqual(['requestIdleCallback', 'cancelIdleCallback']);
    for (const rule of compilerRulesOff) {
      expect(src.rules[rule]).toBe('off');
    }
  });

  it('service-worker block: classic script with worker globals and base rules', () => {
    const sw = blockFor('service-worker.js');
    expect(sw.languageOptions.ecmaVersion).toBe(2022);
    expect(sw.languageOptions.sourceType).toBe('script');
    expect(sw.languageOptions.globals.caches).toBeDefined();
    expect(sw.languageOptions.globals.clients).toBeDefined();
    expect(sw.rules['no-undef']).toBe('error');
    expect(sw.rules['no-unused-vars']).toEqual(unusedVarsWarn);
    expect(sw.rules['no-empty']).toBe('warn');
  });

  it('tools block: Node + browser globals with base rules only', () => {
    const tools = blockFor('tools/**');
    expect(tools.languageOptions.ecmaVersion).toBe('latest');
    expect(tools.languageOptions.sourceType).toBe('module');
    expect(tools.languageOptions.globals.process).toBeDefined();
    expect(tools.languageOptions.globals.window).toBeDefined();
    expect(tools.rules['no-undef']).toBe('error');
    expect(tools.rules['no-unused-vars']).toEqual(unusedVarsWarn);
    expect(tools.rules['no-empty']).toBe('warn');
  });
});
