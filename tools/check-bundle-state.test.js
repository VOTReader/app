/* tools/check-bundle-state.js — a module that holds state lives in one bundle (audit 2026-11-23 item 15:
   arch-2, arch-1, bundles-n1, bundles-n2). The detector's own cases, then the real b/c/d built from package.json. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from './test-spawn.js'; // file stdio: no pipe another worker's child can hold
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments, moduleState, optionsFromScript, ALLOWED } from './check-bundle-state.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(HERE, '..', 'app', 'src', 'main', 'assets', 'src');

describe('moduleState: what counts as module state', () => {
  it('a module-scope let or var, exported or not', () => {
    expect(moduleState('let a = 0;')).toEqual(['let a']);
    expect(moduleState('var b;')).toEqual(['var b']);
    expect(moduleState('export let c = null;')).toEqual(['let c']);
  });

  it('a let behind a type comment on the same line (the regex the audit prototype missed)', () => {
    expect(moduleState('/** @type {string | null} */ let _carried = null;')).toEqual(['let _carried']);
    expect(moduleState('const x = 1;\n/** @type {number} */ let n = 0;')).toEqual(['let n']);
  });

  it('a Map, Set or literal the module mutates; not one it only reads', () => {
    expect(moduleState('const m = new Map();\nexport function f(k) { m.set(k, 1); }')).toEqual(['mutated const m']);
    expect(moduleState('const s = new Set();\nfunction g(x) { s.add(x); }')).toEqual(['mutated const s']);
    expect(moduleState('const o = {};\nfunction h() { o.k = 2; }')).toEqual(['mutated const o']);
    expect(moduleState('const a = [];\nfunction p(x) { a[0] = x; }')).toEqual(['mutated const a']);
    expect(moduleState("const KEYS = new Set(['a', 'b']);\nexport const has = (k) => KEYS.has(k);")).toEqual([]);
    expect(moduleState('const o = { a: 1 };\nexport const eq = () => o.a === 1;')).toEqual([]);
  });

  it('declarations inside functions, comments and strings are not module state', () => {
    expect(moduleState('export function f() {\n  let x = 0;\n  return x;\n}')).toEqual([]);
    expect(moduleState('// let fake = 1;\n/* var gone; */\nexport const s = "let x = 1";')).toEqual([]);
  });

  it('state kept in sharedState is not module state', () => {
    expect(moduleState("import { sharedState } from './shared-state.js';\nconst _s = sharedState('x', () => ({ n: 0 }));\nexport function bump() { _s.n++; }")).toEqual([]);
  });

  it('the body of a top-level IIFE is module scope too: it runs once, and what it declares lives as long', () => {
    expect(moduleState('(function () {\n  let n = 0;\n  window.next = () => ++n;\n})();')).toEqual(['let n']);
    expect(moduleState('(() => {\n  const seen = new Set();\n  window.see = (k) => seen.add(k);\n})();')).toEqual(['mutated const seen']);
    expect(moduleState('!function () {\n    var q = [];\n}();')).toEqual(['var q']);
    expect(moduleState('(function () {\nlet flat = 1;\n})();')).toEqual(['let flat']);
  });

  it('inside an IIFE, only its own first level counts; a brace in a string does not end it', () => {
    expect(moduleState('(function () {\n  function f() {\n    let i = 0;\n  }\n  f();\n})();')).toEqual([]);
    expect(moduleState('(function () {\n  const css = `\n}\n`;\n  let late = 1;\n})();\nlet after = 2;')).toEqual(['let late', 'let after']);
    expect(moduleState('(function () {\n  const T = { a: 1 };\n  Object.freeze(T);\n})();')).toEqual([]);
    expect(moduleState('function plain() {\n  let local = 0;\n}')).toEqual([]);
  });

  it('a column-0 line inside a template literal is text, not a declaration', () => {
    expect(moduleState('export const glsl = `\nlet fake = 1;\nvoid main(){}\n`;')).toEqual([]);
  });

  it('stripComments keeps line breaks and string contents', () => {
    expect(stripComments('a /* x\ny */ b // c\n"//not a comment"')).toBe('a \n b \n"//not a comment"');
  });
});

describe('optionsFromScript reads the exact package.json esbuild commands', () => {
  const scripts = JSON.parse(readFileSync(resolve(HERE, '..', 'package.json'), 'utf-8')).scripts;

  it('every b/c/d command keeps --target=chrome108, iife and bundling (Permanent Rule 6)', () => {
    for (const b of ['b', 'c', 'd']) {
      const o = optionsFromScript(scripts['build:' + b]);
      expect(o.target, b).toBe('chrome108');
      expect(o.format, b).toBe('iife');
      expect(o.bundle, b).toBe(true);
      expect(o.entryPoints.length, b).toBe(1);
    }
    expect(optionsFromScript(scripts['build:d']).inject).toEqual(['app/src/main/assets/src/ui/jsx-inject.js']);
  });

  it('refuses a flag it does not know, so a new build flag cannot be silently dropped', () => {
    expect(() => optionsFromScript('esbuild x.js --bundle --splitting')).toThrow(/splitting/);
  });
});

describe('the real bundles', () => {
  // In a child node: vitest's jsdom setup breaks esbuild's TextEncoder check in-process.
  let verdict;
  const real = () => (verdict ||= JSON.parse(execFileSync(process.execPath, [resolve(HERE, 'check-bundle-state.js'), '--json'], { encoding: 'utf-8', maxBuffer: 16 << 20 })));

  it('no module shared across b/c/d holds state outside sharedState, except the ALLOWED few, and none of those is stale', () => {
    const { shared, offenders, stale } = real();
    expect(shared).toBeGreaterThan(10);
    expect(offenders).toEqual([]);
    expect(stale).toEqual([]);
  }, 60000);

  it('the three splits a reader saw are gone: one instance each', () => {
    const where = real().where;
    // arch-1: the history flag lives in bundle-b only; screen-routes calls b's global.
    expect(where['hooks/use-history-sync.js']).toEqual(['b']);
    // bundles-n1 and bundles-n2: both bundles carry the module, so its state must be in sharedState.
    for (const f of ['utils/answers-from-search.js', 'utils/toast.js']) {
      expect(where[f], f).toEqual(['b', 'd']);
      expect(moduleState(readFileSync(resolve(SRC, f), 'utf-8')), f).toEqual([]);
    }
  }, 60000);

  it('every ALLOWED entry gives its reason', () => {
    for (const [f, why] of Object.entries(ALLOWED)) expect(why.length, f).toBeGreaterThan(30);
  });
});
