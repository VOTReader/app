#!/usr/bin/env node
/* kt-events-check — every page function the Kotlin host calls has a receiver in the page (heart-7, audit 2026-11-23).
 * ═══════════════════════════════════════════════════════════════════════
 * JsBridge.callOptional renders `window.__x && window.__x(…)` (JsBridge.kt), so a JsEvent name the page never
 * defines is a silent no-op: the native side reports, nothing hears. Derived from the Kotlin source
 * (tools/bridge-scan.mjs): every JsEvent entry and every window.<name> a Kotlin string evaluates must be assigned
 * somewhere in the page's JS, or named there as a string (window[cbName] = …).
 * KNOWN_UNWIRED is the one door, each entry with its reason; an entry that turns live or leaves Kotlin is reported
 * so it can be dropped, never silently kept.
 * Run: node tools/kt-events-check.mjs (exit 1 on an unheard name). smoke-lite runs it too. */
import { fileURLToPath } from 'node:url';
import { kotlinEntryPoints, pageSources, stripComments, REPO_ROOT } from './bridge-scan.mjs';

/** Dispatches known to have no receiver, with the reason. */
export const KNOWN_UNWIRED = {
  // The legacy base64 import picker, dead since 2026-06-02 (the v3 streaming import replaced it). Audit
  // dead-code-docs-n1 removes it from AppInterface, BridgeHost, MainActivity and JsEvent.
  __onImportFile: 'dead legacy import picker; removal is dead-code-docs-n1',
};

/** @returns {{ issues: string[], notes: string[] }} */
export function checkKtEvents(root = REPO_ROOT, unwired = KNOWN_UNWIRED) {
  const issues = [];
  const notes = [];
  const kotlin = kotlinEntryPoints(root);
  const jsEvents = [...kotlin.values()].filter((v) => v.includes('JsEvent.')).length;
  if (jsEvents < 10) issues.push(`kt-events-check: found only ${jsEvents} JsEvent entries in the Kotlin source; the reader is broken`);
  const page = pageSources(root).map(({ text }) => stripComments(text)).join('\n');
  const heard = (name) => new RegExp('\\.' + name.replace(/\$/g, '\\$') + '\\s*=(?![=>])').test(page) || page.includes("'" + name + "'") || page.includes('"' + name + '"');
  for (const [name, at] of kotlin) {
    const live = heard(name);
    if (Object.prototype.hasOwnProperty.call(unwired, name)) {
      if (live) notes.push(`${name} has a receiver now: drop it from KNOWN_UNWIRED`);
      continue;
    }
    if (!live) issues.push(`${name} is called by the Kotlin host (${at}) but the page never defines it: the call is a silent no-op`);
  }
  for (const name of Object.keys(unwired)) if (!kotlin.has(name)) notes.push(`${name} is no longer called by Kotlin: drop it from KNOWN_UNWIRED`);
  return { issues, notes };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { issues, notes } = checkKtEvents();
  for (const n of notes) console.log('[kt-events] note: ' + n);
  if (issues.length) {
    console.error('[kt-events] FAIL:');
    for (const i of issues) console.error('  - ' + i);
    process.exit(1);
  }
  console.log('[kt-events] OK — every page function the Kotlin host calls has a receiver.');
}
