// @ts-nocheck — reads app.css with node fs
/* The tab bar's CSS contract (the three tabs, 2026-11-10): what the hub asked for, pinned at the source.
   (12) phone edges: the bar's bottom padding is the gesture-bar inset, which env(safe-area-inset-bottom) feeds;
   (11) the keyboard: the bar steps aside while it is up (TabBar.test.jsx covers the class; this, the rule);
   (13) wide screens: at 1024 css px and up the tabs are a left rail and the dock stays at the page's foot. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const css = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app.css'), 'utf8');
const rule = (sel) => {
  const i = css.indexOf(sel + ' {');
  expect(i, sel).toBeGreaterThan(-1);
  return css.slice(i, css.indexOf('}', i));
};

describe('the tab bar CSS', () => {
  it('pads its foot with the gesture-bar inset, which is the safe-area inset (or the APK’s)', () => {
    expect(css).toMatch(/--dock-sys: max\(env\(safe-area-inset-bottom, 0px\), var\(--inset-bottom, 0px\)\);/);
    expect(rule('    .tabbar')).toMatch(/padding: 0 max\(0px, calc\(\(100vw - 36rem\) \/ 2\)\) min\(var\(--dock-sys\), 64px\);/);
    expect(css).toMatch(/--dock-tabbar: calc\(var\(--tabbar-h\) \+ var\(--dock-sys\)\);/);
    // Its buttons are a 44 px press at least, above that inset.
    expect(rule('    .tabbar-tab')).toMatch(/min-height: 44px/);
  });

  it('steps aside, with the mini player, while the keyboard is up', () => {
    expect(css).toContain('html.kb-up .tabbar { display: none; }');
    expect(css).toContain('html.kb-up .audio-bar { display: none; }');
  });

  it('rests the Downloads foot bar on the tab bar: a sticky bottom counts from the scroller padding, which clears the bar', () => {
    // Measured headless at 412x915 (W3a): with bottom = the bar's height the footer floated 76px over the bar and rows
    // showed under it. The padding is the bar + 16px, so the footer's own bottom takes the 16px back.
    expect(css).toContain('body.tabbar-on .screen-scroll { padding-bottom: calc(var(--dock-tabbar) + 16px); }');
    expect(css).toContain('body.tabbar-on .dl-footer { bottom: calc(var(--dock-player) - 16px); }');
  });

  it('is a left rail at 1024 css px and up, with the dock back at the page foot', () => {
    const i = css.indexOf('@media (min-width: 1024px) {\n      body.tabbar-on');
    expect(i).toBeGreaterThan(-1);
    const block = css.slice(i, css.indexOf('\n    }', i));
    expect(block).toMatch(/--dock-tabbar: 0px/);
    expect(block).toMatch(/width: var\(--tabbar-rail\)/);
    expect(block).toMatch(/\.screen-layout \{ padding-left: var\(--tabbar-rail\)/);
  });
});
