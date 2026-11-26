#!/usr/bin/env node
/* check-bridges — BRIDGES.md lists every window.__* bridge, and only live ones (heart-7 + arch-10, audit 2026-11-23).
 * ═══════════════════════════════════════════════════════════════════════
 * Bridges have no compiler check, and BRIDGES.md had drifted both ways: about 30 live bridges were missing (seven
 * of them Kotlin entry points), dead ones were still listed (__bumpHlTick, __homeAnimShown), and Setter lines
 * pointed at .js files that had become .jsx. Derived, never hand-listed (tools/bridge-scan.mjs):
 *   1. every window.__* the page assigns is named in BRIDGES.md;
 *   2. every page function the Kotlin host calls is named in BRIDGES.md;
 *   3. every `### \`__x\`` entry is still live: the page sets it, Kotlin calls it, or a tool sets it;
 *   4. every path on a Setter / Stackers line names a file.
 * Refuses to pass vacuously: a scan that finds under 20 setters or 20 entries is a broken scan.
 * Run: node tools/check-bridges.mjs (exit 1 on drift). smoke-lite runs it too. */
import { fileURLToPath } from 'node:url';
import { jsBridgeSetters, kotlinEntryPoints, readRegistry, pathExists, toolMentions, REPO_ROOT } from './bridge-scan.mjs';

/** @returns {string[]} issues (empty = in step) */
export function checkBridges(root = REPO_ROOT) {
  const issues = [];
  const reg = readRegistry(root);
  if (!reg) return ['check-bridges: BRIDGES.md not found'];
  const setters = jsBridgeSetters(root);
  const kotlin = kotlinEntryPoints(root);
  if (setters.size < 20) issues.push(`check-bridges: the scan found only ${setters.size} window.__* setters; the scan is broken, not the app`);
  if (reg.headings.length < 20) issues.push(`check-bridges: BRIDGES.md has only ${reg.headings.length} \`### \`__x\`\` entries; the reader is broken`);
  for (const [name, at] of setters) {
    if (!reg.mentioned.has(name)) issues.push(`${name} is set at ${at[0]} but BRIDGES.md does not list it`);
  }
  for (const [name, at] of kotlin) {
    if (!reg.mentioned.has(name)) issues.push(`${name} is called by the Kotlin host (${at}) but BRIDGES.md does not list it`);
  }
  for (const { name, line } of reg.headings) {
    if (setters.has(name) || kotlin.has(name) || toolMentions(root, name)) continue;
    issues.push(`BRIDGES.md:${line} lists ${name}, which nothing sets or calls any more: delete the entry`);
  }
  for (const { path, line } of reg.setterPaths) {
    if (!pathExists(root, path)) issues.push(`BRIDGES.md:${line} names ${path}, which does not exist`);
  }
  return issues;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const issues = checkBridges();
  if (issues.length) {
    console.error('[check-bridges] FAIL — BRIDGES.md is out of step with the code:');
    for (const i of issues) console.error('  - ' + i);
    process.exit(1);
  }
  console.log('[check-bridges] OK — BRIDGES.md lists every bridge, and every entry is live.');
}
