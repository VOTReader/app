/* Every `new Function` in the LINTED scope carries its directive, paired site by
   site — the gate this branch needed and did not have.
   ─────────────────────────────────────────────────────────────────────────────
   Turning `no-new-func` on makes this branch's correctness depend on a COUNT IN
   FILES IT DOES NOT OWN, and that count has gone stale three times as main moved:

     d1b02128   1 site    the branch said "exactly one directive is added"
     98de630f   2 sites   a gate-owns-its-data fix added one, and its dead
                          directive was correctly dropped while the rule was off
     e97112e6   3 sites   c48's own manifest evaluation (06a39577)

   Every one of those readings was true when it was taken. A COST IS A CLAIM ABOUT
   A BASE AND IT EXPIRES WHEN MAIN MOVES — so the check belongs in the suite, where
   the next landing underneath tells us, rather than in a comment nobody re-reads
   or in CI, which tells us after the branch is already red.

   PAIRED PER SITE, NOT COUNTED. Matching totals survive one site losing its
   directive while another gains a spurious one, which is the same reason a "nothing
   dropped" proof is a set difference and never a count. And pairing enforces the
   second rule this file family keeps re-learning for free: the directive must be
   the LAST comment line before the statement, because `eslint-disable-next-line`
   applies to the very next line and prose written under it targets a comment. */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The scope `npm run lint` actually lints. DERIVED — a hand-typed path is how a
 *  census ends up measuring a different tree from the linter. */
function lintScope() {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const m = /eslint\s+([^\s"]+)/.exec(pkg.scripts.lint || '');
  return m ? m[1] : null;
}

/** Both forms `no-new-func` reports. Counting only `new Function` reads 0 on a
 *  tree that violates the rule through a bare `Function(...)` call. */
const CALL = /(^|[^.\w$])(new\s+Function\s*\(|Function\s*\()/;
const DIRECTIVE = /^\s*\/\/\s*eslint-disable-next-line\s+no-new-func\s*$/;
const COMMENT_LINE = /^\s*(\/\/|\*|\/\*)/;

function jsFilesUnder(rel) {
  const abs = join(ROOT, rel);
  return readdirSync(abs, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile() && /\.(js|jsx)$/.test(d.name))
    .map((d) => join(d.parentPath || d.path, d.name));
}

describe('eslint — no-new-func directives are paired with their sites', () => {
  const scope = lintScope();

  it('CONTROL: the two patterns are alive, on strings that are known to match and not match', () => {
    /* A dead regex reports zero sites, which reads exactly like a clean tree —
       the failure this whole file exists to prevent, one level down. */
    expect(CALL.test("  new Function('g', SRC)(box);")).toBe(true);
    expect(CALL.test('  Function("return 1")();')).toBe(true);
    expect(CALL.test('  const x = myFunction(1);')).toBe(false);
    expect(CALL.test('  obj.Function(1);')).toBe(false);
    expect(DIRECTIVE.test('  // eslint-disable-next-line no-new-func')).toBe(true);
    expect(DIRECTIVE.test('  // eslint-disable-next-line no-eval')).toBe(false);
    expect(COMMENT_LINE.test('  // a comment mentioning new Function')).toBe(true);
  });

  it('CONTROL: the derived scope is the linter\'s and holds a real tree', () => {
    expect(scope).toBe('app/src/main/assets/src');
    expect(jsFilesUnder(scope).length).toBeGreaterThan(100);
  });

  it('the rule is ENABLED, or every directive below is an unused disable', () => {
    /* Both directions are red under `--max-warnings 0`: a missing directive is an
       error, and a surplus one is an unused disable. The pairing below only means
       something while the rule is on. */
    const cfg = readFileSync(join(ROOT, 'eslint.config.js'), 'utf8');
    expect(cfg).toContain("'no-new-func': 'error'");
  });

  it('every site has the directive IMMEDIATELY above it, and every directive has a site', () => {
    const sites = [];
    const orphanDirectives = [];
    for (const file of jsFilesUnder(scope)) {
      const lines = readFileSync(file, 'utf8').split(/\r?\n/);
      const rel = file.slice(join(ROOT, scope).length + 1).replace(/\\/g, '/');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (DIRECTIVE.test(line)) {
          const next = lines[i + 1] || '';
          if (!CALL.test(next) || COMMENT_LINE.test(next)) orphanDirectives.push(rel + ':' + (i + 1));
          continue;
        }
        if (COMMENT_LINE.test(line) || !CALL.test(line)) continue;
        sites.push({ at: rel + ':' + (i + 1), covered: DIRECTIVE.test(lines[i - 1] || '') });
      }
    }
    // Not a floor dressed up as a count: this is the whole set, and it is named.
    expect(sites.length).toBeGreaterThan(0);
    expect(sites.filter((s) => !s.covered).map((s) => s.at)).toEqual([]);
    expect(orphanDirectives).toEqual([]);
  });
});
