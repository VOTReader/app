// @ts-nocheck — test-only helper (vitest); never bundled.
/* axe-core in jsdom, for the per-screen accessibility gates (a11y pass, 2026-11-01).
   ─────────────────────────────────────────────────────────────────────
   seriousViolations(root) runs axe over the rendered tree and returns every
   SERIOUS or CRITICAL finding as "rule: target" strings, so a failing test
   names the rule and the element. Moderate/minor findings are not gated.

   jsdom has no layout, so the rules that need one are off: colour contrast and
   target size are measured in a real browser (tools/smoke-ci.js's Chromium),
   not here. `region` is off because a screen rendered alone in a test has no
   app shell around it; the shell's landmarks are pinned by
   ui/components/a11y-axe.test.jsx and ScreenLayout.landmark.test.jsx. */
import axe from 'axe-core';

const LAYOUT_BLIND = {
  'color-contrast': { enabled: false },
  'color-contrast-enhanced': { enabled: false },
  'target-size': { enabled: false },
  region: { enabled: false },
};

const GATED = new Set(['serious', 'critical']);

/** @param {Element|Document} [root] @param {object} [rules] @returns {Promise<string[]>} */
export async function seriousViolations(root = document, rules = {}) {
  const r = await axe.run(root, { resultTypes: ['violations'], rules: { ...LAYOUT_BLIND, ...rules } });
  return r.violations
    .filter((v) => GATED.has(v.impact))
    .flatMap((v) => v.nodes.map((n) => v.impact + ' ' + v.id + ': ' + n.target.join(' ') + ' — ' + n.html.slice(0, 120)));
}

/** Every violation at any impact, for an audit print (not gated). */
export async function allViolations(root = document, rules = {}) {
  const r = await axe.run(root, { resultTypes: ['violations'], rules: { ...LAYOUT_BLIND, ...rules } });
  return r.violations.flatMap((v) => v.nodes.map((n) => v.impact + ' ' + v.id + ': ' + n.target.join(' ') + ' — ' + n.html.slice(0, 120)));
}
