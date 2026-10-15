// @ts-nocheck — reads app.jsx source (node fs), like use-tabs.journal-app.test.js.
/* Sweep 2026-10-14, v093: goHome clears every return breadcrumb only if App() hands useNav the
   setters. App() has no render harness, so this pins the wiring; use-nav.test.js pins what goHome
   does with them. A setter left out here would make goHome's typeof guard skip it in silence. */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

describe('App() useNav wiring (v093)', () => {
  it('passes every breadcrumb setter goHome clears', () => {
    const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../app.jsx'), 'utf8');
    const call = src.match(/\buseNav\(\{([\s\S]*?)\}\);/);
    expect(call).not.toBeNull();
    const passed = new Set(call[1].split(/[\s,]+/).filter(Boolean));
    for (const setter of ['setFromSearch', 'setFromWtlb', 'setFromLetterStack', 'setFromSurprise', 'setFromStudies', 'setFromMatthewCh']) {
      expect(passed, setter).toContain(setter);
    }
  });
});
