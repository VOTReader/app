/* What e2e-contrast prints when a stop fails (hub 11-20: a failure names its fix). Pure; the walk imports it. */
import { describe, it, expect } from 'vitest';
import { contrastFixes } from './e2e-contrast-lib.mjs';
import { FIX_TOKEN } from './e2e-walk-lib.mjs';

const item = (o) => ({ kind: 'text', ratio: 1.94, need: 4.5, sel: 'button.sw-btn > span', fg: 'rgb(196,164,105)', fga: 1, bg: 'rgb(58,43,70)', ...o });

describe('contrastFixes', () => {
  it('a faint reading under ancestor opacity names both cases: mid-fade or a translucent rest', () => {
    const f = contrastFixes({ stop: 'web-focus', theme: 'dark', fails: [item({ fga: 0.49 })], literal: [], fades: { settled: true, still: [] } });
    expect(f).toHaveLength(1);
    expect(f[0].startsWith(FIX_TOKEN)).toBe(true);
    expect(f[0]).toContain('opacity 0.49');
    expect(f[0]).toMatch(/mid-fade/);
    expect(f[0]).toMatch(/rests translucent/);
  });
  it('when the fade wait gave up, the fix says the walk read a fade and names the element', () => {
    const f = contrastFixes({ stop: 'web-focus', theme: 'dark', fails: [item({ fga: 0.49 })], literal: [], fades: { settled: false, still: ['button.sw-btn opacity'] } });
    expect(f[0]).toContain('button.sw-btn opacity');
  });
  it('a colour failure at full opacity names the element, the ratio and the need', () => {
    const f = contrastFixes({ stop: 'letter', theme: 'light', fails: [item({})], literal: [], fades: { settled: true, still: [] } });
    expect(f[0]).toContain('button.sw-btn > span');
    expect(f[0]).toContain('1.94:1');
    expect(f[0]).toContain('4.5:1');
    expect(f[0]).toContain('light');
  });
  it('a literal names the colour to swap for a token', () => {
    const f = contrastFixes({ stop: 'x', theme: 'light', fails: [], literal: [{ kind: 'light ink', value: 'rgb(233,238,239)', sel: 'span.pill' }], fades: { settled: true, still: [] } });
    expect(f[0]).toContain('span.pill');
    expect(f[0]).toMatch(/token/);
  });
  it('one line each, under 300 characters', () => {
    const f = contrastFixes({ stop: 'x'.repeat(100), theme: 'dark', fails: [item({ sel: 'y'.repeat(300) })], literal: [], fades: { settled: true, still: [] } });
    for (const l of f) { expect(l).not.toContain('\n'); expect(l.length).toBeLessThanOrEqual(300); }
  });
});
