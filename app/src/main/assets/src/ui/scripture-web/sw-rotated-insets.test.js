// @ts-nocheck — node:fs source scan; the Q4 typecheck scope has no node types
/* A portrait phone draws the web in a CSS-rotated root (.sw-rotated, use-forced-landscape.js),
   but env(safe-area-inset-*) still names the PORTRAIT glass's edges. On the S22 the portrait
   cutout (27 px of safe-area-inset-top) is the landscape frame's LEFT edge, yet it pushed the
   landscape topbar down 27 px, onto My Web's Volumes rail (w4 device check, d19-myweb-land).
   rotate(90deg) translateY(-100%) about the top-left lays the frame's top on the glass's right
   edge, its left on the glass's top, its bottom on the glass's left and its right on the
   glass's bottom, so the four insets are read through those edges. The web's chrome reads its
   insets from one set of tokens (--sw-safe-*), which the rotated root remaps; jsdom lays
   nothing out, so this is pinned on the stylesheet's text. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../app.css'), 'utf-8');
const RULES = [];
{
  const re = /([^{}]+)\{([^{}]*)\}/g;
  let m;
  while ((m = re.exec(CSS))) {
    RULES.push({ sels: m[1].replace(/\/\*[\s\S]*?\*\//g, '').split(',').map((s) => s.trim()), body: m[2].replace(/\/\*[\s\S]*?\*\//g, '') });
  }
}
const declsFor = (sel) => RULES.filter((r) => r.sels.includes(sel)).map((r) => r.body).join(';');
const prop = (sel, name) => {
  const m = new RegExp(`${name.replace(/-/g, '\\-')}:\\s*([^;]+)`).exec(declsFor(sel));
  return m ? m[1].trim() : null;
};

describe("the rotated root reads the glass's insets through the edges they land on", () => {
  it('.sw-root names each landscape edge from its own inset', () => {
    expect(prop('.sw-root', '--sw-safe-top')).toMatch(/env\(safe-area-inset-top/);
    expect(prop('.sw-root', '--sw-safe-right')).toMatch(/env\(safe-area-inset-right/);
    expect(prop('.sw-root', '--sw-safe-bottom')).toMatch(/env\(safe-area-inset-bottom/);
    expect(prop('.sw-root', '--sw-safe-left')).toMatch(/env\(safe-area-inset-left/);
  });

  it('.sw-root.sw-rotated: top from the right, right from the bottom, bottom from the left, left from the top', () => {
    const R = '.sw-root.sw-rotated';
    expect(prop(R, '--sw-safe-top')).toMatch(/env\(safe-area-inset-right/);
    expect(prop(R, '--sw-safe-right')).toMatch(/env\(safe-area-inset-bottom/);
    expect(prop(R, '--sw-safe-bottom')).toMatch(/env\(safe-area-inset-left/);
    expect(prop(R, '--sw-safe-left')).toMatch(/env\(safe-area-inset-top/);
    // the portrait cutout no longer pushes the landscape topbar down
    expect(prop(R, '--sw-safe-top')).not.toMatch(/inset-top/);
    expect(prop(R, '--sw-chrome-top')).toMatch(/var\(--sw-safe-top\)/);
  });

  it("no other web rule reads a raw env(safe-area-inset-*): the tokens are the one place", () => {
    const TOKENS = new Set(['.sw-root', '.sw-root.sw-rotated', ':root']);
    const offenders = RULES
      .filter((r) => r.sels.some((s) => /\.sw-/.test(s)) && !r.sels.every((s) => TOKENS.has(s)) && /env\(safe-area-inset/.test(r.body))
      .map((r) => r.sels.join(', '));
    expect(offenders).toEqual([]);
  });
});
