#!/usr/bin/env node
/* bridge-imports — retire the window-global bridge one bundle at a time (v15-code-health-04).
   ═══════════════════════════════════════════════════════════════════════
   Each bundle entry (ui/_entry-d.js …) imports its modules and then
   Object.assign(window, {...})s their exports, and the modules inside that
   same bundle still reach one another through those window globals: a bare
   `LinkStore` or `typeof formatBytes === 'function'` that tsc sees as `any`
   (tools/globals.generated.d.ts) and eslint as a readonly global. This tool
   finds every such SAME-BUNDLE bare reference and, with --write, turns it
   into an ES import, so the reference is typed and the bundler sees the edge.

   It adds an import only when all of these hold:
   - exactly one module of the bundle exports the name;
   - the referring module neither declares nor imports the name already;
   - every reference to it sits inside a function (a module-top-level read
     ran before the bridge existed: an import would change what it sees);
   - the new edge closes no import cycle (smoke-lite forbids cycles; the
     graph checked is every relative import reachable from the three roots
     smoke-lite walks plus this bundle's entry).
   Everything it skips is listed with the reason.

   The typeof guards stay: with the import they are always true, so they
   are dead but harmless, and removing them is a separate, reviewable step.

   usage: node tools/bridge-imports.mjs <entry> [--write] [--json] [--skip=a,b]
     e.g. node tools/bridge-imports.mjs app/src/main/assets/src/ui/_entry-d.js */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as espree from 'espree';
import * as eslintScope from 'eslint-scope';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'app/src/main/assets/src');
const PARSE = { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true }, range: true, loc: true };

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const JSON_OUT = args.includes('--json');
const skipArg = args.find((a) => a.startsWith('--skip='));
/** Names left on the bridge on purpose (their tests stub the global); see SKIP_REASON. */
const entryArg = args.find((a) => !a.startsWith('--'));
if (!entryArg) { console.error('usage: node tools/bridge-imports.mjs <entry> [--write] [--json] [--skip=a,b]'); process.exit(2); }
const ENTRY = path.resolve(ROOT, entryArg);
// tools/bridge-skip.json lists, per entry, the names kept on the bridge and why.
const SKIP_FILE = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/bridge-skip.json'), 'utf8'));
const SKIP_KEY = path.relative(SRC, ENTRY).split(path.sep).join('/');
const SKIP = new Set([
  ...Object.keys(SKIP_FILE[SKIP_KEY] || {}),
  ...(skipArg ? skipArg.slice('--skip='.length).split(',').filter(Boolean) : []),
]);

const rel = (p) => path.relative(ROOT, p).replace(/\\/g, '/');
const read = (p) => fs.readFileSync(p, 'utf8');

function resolveImport(fromFile, spec) {
  if (!spec.startsWith('.')) return null;
  const abs = path.resolve(path.dirname(fromFile), spec);
  for (const c of [abs, abs + '.js', abs + '.jsx', path.join(abs, 'index.js')]) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  }
  return null;
}

/** @param {string} file */
function parse(file) {
  const ast = espree.parse(read(file), PARSE);
  return ast;
}

/** Relative import specifiers of a module (static imports and re-exports). */
function importsOf(file) {
  const out = new Set();
  let ast;
  try { ast = parse(file); } catch { return out; }
  for (const n of ast.body) {
    if ((n.type === 'ImportDeclaration' || n.type === 'ExportNamedDeclaration' || n.type === 'ExportAllDeclaration') && n.source) {
      const r = resolveImport(file, n.source.value);
      if (r) out.add(r);
    }
  }
  return out;
}

/** Every relative import reachable from `roots`: the graph smoke-lite checks. */
function importGraph(roots) {
  const graph = new Map();
  const visit = (f) => {
    if (graph.has(f)) return;
    const deps = importsOf(f);
    graph.set(f, deps);
    for (const d of deps) visit(d);
  };
  roots.forEach(visit);
  return graph;
}

function reaches(graph, from, to) {
  const seen = new Set();
  const stack = [from];
  while (stack.length) {
    const n = stack.pop();
    if (n === to) return true;
    if (seen.has(n)) continue;
    seen.add(n);
    for (const d of graph.get(n) || []) stack.push(d);
  }
  return false;
}

/** Top-level exported names of a module. */
function exportsOf(ast) {
  const names = new Set();
  for (const n of ast.body) {
    if (n.type !== 'ExportNamedDeclaration') continue;
    if (n.declaration) {
      const d = n.declaration;
      if (d.id && d.id.name) names.add(d.id.name);
      if (d.declarations) for (const v of d.declarations) if (v.id && v.id.type === 'Identifier') names.add(v.id.name);
    }
    if (!n.source) for (const s of n.specifiers || []) names.add(s.exported.name);
  }
  return names;
}

/* ── the bundle ──────────────────────────────────────────────────────── */
const entryAst = parse(ENTRY);
/** @type {string[]} modules the entry imports directly: the bundle's members */
const members = [];
for (const n of entryAst.body) {
  if (n.type === 'ImportDeclaration') {
    const r = resolveImport(ENTRY, n.source.value);
    if (r && !members.includes(r)) members.push(r);
  }
}
/** name -> modules exporting it */
const exporters = new Map();
const astOf = new Map();
for (const m of members) {
  let ast;
  try { ast = parse(m); } catch (e) { console.error(`parse failed: ${rel(m)}: ${e.message}`); continue; }
  astOf.set(m, ast);
  for (const name of exportsOf(ast)) {
    if (!exporters.has(name)) exporters.set(name, []);
    exporters.get(name).push(m);
  }
}

const graph = importGraph([
  path.join(SRC, 'stores/_entry-b.js'), path.join(SRC, 'renderer/_entry.js'), path.join(SRC, 'ui/_entry-d.js'), ENTRY,
]);

/** Walk up to the nearest function scope: true when a reference runs only when called. */
function insideFunction(scope) {
  for (let s = scope; s; s = s.upper) {
    if (s.type === 'function') return true;
    if (s.type === 'module' || s.type === 'global') return false;
  }
  return false;
}

const plan = [];     // { file, name, from }
const skipped = [];  // { file, name, why }

for (const file of members) {
  const ast = astOf.get(file);
  if (!ast) continue;
  const scopes = eslintScope.analyze(ast, { ecmaVersion: 2022, sourceType: 'module', childVisitorKeys: espree.VisitorKeys });
  const moduleScope = scopes.scopes.find((s) => s.type === 'module');
  // Free references: those that resolve to no binding in the module.
  const free = new Map();
  for (const ref of scopes.globalScope.through) {
    const name = ref.identifier.name;
    if (!free.has(name)) free.set(name, []);
    free.get(name).push(ref);
  }
  const declared = new Set(moduleScope ? moduleScope.variables.map((v) => v.name) : []);
  for (const [name, refs] of free) {
    const from = exporters.get(name);
    if (!from) continue;                               // not this bundle's
    if (from.includes(file)) continue;                 // its own export
    if (declared.has(name)) continue;
    if (SKIP.has(name)) { skipped.push({ file, name, why: 'kept: ' + ((SKIP_FILE[SKIP_KEY] || {})[name] || '--skip') }); continue; }
    if (from.length > 1) { skipped.push({ file, name, why: 'exported by ' + from.map(rel).join(', ') }); continue; }
    const target = from[0];
    if (refs.some((r) => !insideFunction(r.from))) { skipped.push({ file, name, why: 'read at module top level' }); continue; }
    if (refs.some((r) => r.isWrite())) { skipped.push({ file, name, why: 'assigned to' }); continue; }
    if (reaches(graph, target, file)) { skipped.push({ file, name, why: 'cycle: ' + rel(target) + ' already reaches ' + rel(file) }); continue; }
    plan.push({ file, name, from: target });
    // Commit the edge so the next decision sees it.
    if (!graph.has(file)) graph.set(file, new Set());
    graph.get(file).add(target);
  }
}

/* ── output ──────────────────────────────────────────────────────────── */
if (JSON_OUT) {
  console.log(JSON.stringify({
    entry: rel(ENTRY), members: members.length,
    plan: plan.map((p) => ({ file: rel(p.file), name: p.name, from: rel(p.from) })),
    skipped: skipped.map((s) => ({ file: rel(s.file), name: s.name, why: s.why })),
  }, null, 2));
} else {
  const byFile = new Map();
  for (const p of plan) { if (!byFile.has(p.file)) byFile.set(p.file, []); byFile.get(p.file).push(p); }
  console.log(`${rel(ENTRY)}: ${members.length} modules; ${plan.length} bare references become imports in ${byFile.size} files; ${skipped.length} skipped`);
  for (const s of skipped) console.log(`  skip ${rel(s.file)} ${s.name}: ${s.why}`);
}

if (WRITE) {
  const byFile = new Map();
  for (const p of plan) { if (!byFile.has(p.file)) byFile.set(p.file, new Map()); const m = byFile.get(p.file); if (!m.has(p.from)) m.set(p.from, []); m.get(p.from).push(p.name); }
  for (const [file, groups] of byFile) {
    const text = read(file);
    const ast = astOf.get(file);
    const lines = [...groups].map(([from, names]) => {
      let spec = path.relative(path.dirname(file), from).replace(/\\/g, '/');
      if (!spec.startsWith('.')) spec = './' + spec;
      return `import { ${names.sort().join(', ')} } from '${spec}';`;
    }).sort();
    // After the last existing import, else at the top (after a leading comment block).
    const imports = ast.body.filter((n) => n.type === 'ImportDeclaration');
    let at;
    if (imports.length) at = imports[imports.length - 1].range[1];
    else {
      const m = /^(?:\s*(?:\/\*[\s\S]*?\*\/|\/\/[^\n]*))*\s*/.exec(text);
      at = m ? m[0].length : 0;
    }
    const block = (imports.length ? '\n' : '') + lines.join('\n') + (imports.length ? '' : '\n\n');
    fs.writeFileSync(file, text.slice(0, at) + block + text.slice(at));
  }
  console.log(`wrote ${byFile.size} files`);
}
