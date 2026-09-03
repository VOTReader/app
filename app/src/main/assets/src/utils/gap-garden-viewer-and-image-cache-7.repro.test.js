import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const css = readFileSync('app/src/main/assets/app.css', 'utf8');

function rule(selector) {
  return css.match(new RegExp(`\\${selector}\\s*\\{([^}]*)\\}`))?.[1] || '';
}

describe('REPRO gap-garden-viewer-and-image-cache-7: cutout-safe Garden chrome', () => {
  it('keeps the top and bottom bars outside display cutouts and gesture insets', () => {
    expect(rule('.garden-top-bar')).toMatch(/padding-top:\s*calc\(var\(--inset-top/);
    expect(rule('.garden-bottom-bar')).toMatch(/padding-bottom:\s*calc\(var\(--inset-bottom/);
  });
});
