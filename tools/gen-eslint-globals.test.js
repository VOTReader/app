/* gen-eslint-globals.py — the globals it emits are real bindings (v15-code-health-03).
   ═══════════════════════════════════════════════════════════════════════
   Every name the generator emits becomes an app-wide `readonly` global for
   eslint and an `any` for tsc, so a wrong one does not fail anything: it
   silences no-undef for a name nothing binds. Two leaks did exactly that
   until 2026-09-26: the section-label comments inside the entry files'
   Object.assign(window, {...}) blocks ("// Stores", "// Late stores + data")
   were read as exports, and src/data/*.test.js constants (HERE, DIST, BUNDLES,
   DATA, DOORWAYS) were read as corpus globals. */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const HERE = dirname(fileURLToPath(import.meta.url));
const GENERATED = readFileSync(join(HERE, 'eslint-globals.generated.js'), 'utf8');
const emitted = new Set([...GENERATED.matchAll(/^ {2}([A-Za-z_$][\w$]*): "readonly",$/gm)].map((m) => m[1]));

/** Run one of the generator's functions on `input`, in the generator's own Python. */
function py(fn, input) {
  const code = [
    'import importlib.util, json, sys',
    "spec = importlib.util.spec_from_file_location('g', sys.argv[1])",
    'g = importlib.util.module_from_spec(spec); spec.loader.exec_module(g)',
    'text = sys.stdin.read()',
    `r = g.${fn}(text) if '${fn}' == 'strip_js_comments' else sorted(g.${fn}(text, None))`,
    'print(json.dumps(r))',
  ].join('\n');
  for (const exe of ['python', 'python3']) {
    const res = spawnSync(exe, ['-c', code, join(HERE, 'gen-eslint-globals.py')], { input, encoding: 'utf8' });
    if (!res.error && res.status === 0) return JSON.parse(res.stdout);
  }
  throw new Error('gen-eslint-globals.test: no python on PATH could run the generator');
}

describe('gen-eslint-globals', () => {
  it('the checked-in list parsed (a dead matcher would pass every case below)', () => {
    expect(emitted.size).toBeGreaterThan(500);
    expect(emitted.has('React')).toBe(true);
    expect(emitted.has('AnnotationStore')).toBe(true);
    // index.html's top-level `const root = ReactDOM.createRoot(...)` IS a
    // script-scope binding every later classic script sees: it stays.
    expect(emitted.has('root')).toBe(true);
  });

  it('emits no section-label word and no test-file constant', () => {
    for (const name of ['Stores', 'Components', 'Hooks', 'Data', 'data', 'Renderer', 'Utilities', 'Screens', 'Sheets',
      'HERE', 'DIST', 'BUNDLES', 'DATA', 'DOORWAYS']) {
      expect(emitted.has(name), `${name} is emitted as a global`).toBe(false);
    }
  });

  it('tsc gets React and ReactDOM typed, not any (v15-code-health-02)', () => {
    const dts = readFileSync(join(HERE, 'globals.generated.d.ts'), 'utf8');
    expect(dts).toContain("declare const React: typeof import('react');");
    expect(dts).toContain("declare const ReactDOM: typeof import('react-dom') & typeof import('react-dom/client');");
  });

  it('tsc gets each hook typed from its module, and the strict pass gets it as any (v15-code-health-09)', () => {
    const dts = readFileSync(join(HERE, 'globals.generated.d.ts'), 'utf8');
    const typed = readFileSync(join(HERE, 'hook-globals.generated.d.ts'), 'utf8');
    const loose = readFileSync(join(HERE, 'hook-globals.any.generated.d.ts'), 'utf8');
    expect(typed).toContain("declare const useNav: typeof import('../app/src/main/assets/src/hooks/use-nav.js').useNav;");
    expect(typed).toContain("declare const useTabs: typeof import('../app/src/main/assets/src/hooks/use-tabs.js').useTabs;");
    expect(loose).toContain('declare const useNav: any;');
    expect(dts).not.toMatch(/declare const useNav\b/);   // declared twice is a tsc error
    const names = (t) => [...t.matchAll(/^declare const (\w+):/gm)].map((m) => m[1]);
    expect(names(loose)).toEqual(names(typed));
    for (const [cfg, file] of [['tsconfig.json', 'tools/hook-globals.generated.d.ts'], ['tsconfig.strict-data.json', 'tools/hook-globals.any.generated.d.ts']]) {
      expect(JSON.parse(readFileSync(join(HERE, '..', cfg), 'utf8')).include).toContain(file);
    }
  });

  it('an export block reads identifiers, never its comments', () => {
    const entry = [
      'Object.assign(window, {',
      '  // Stores',
      '  AnnotationStore, NoteStore,',
      '  /* Late stores + data */',
      '  ThumbStore, // trailing words here',
      '});',
    ].join('\n');
    expect(py('extract_object_assign_idents', entry)).toEqual(['AnnotationStore', 'NoteStore', 'ThumbStore']);
  });

  it('the comment stripper leaves strings whole and keeps every line', () => {
    const src = "a // x\nb /* y\nz */ c 'http://q' \"//\" `/*` d 'it\\'s // no'";
    const out = py('strip_js_comments', src);
    expect(out.split('\n')).toHaveLength(3);
    expect(out).toContain("'http://q'");
    expect(out).toContain('"//"');
    expect(out).toContain('`/*`');
    expect(out).toContain("'it\\'s // no'");
    expect(out).not.toMatch(/\bx\b|\by\b|\bz\b/);
  });
});
