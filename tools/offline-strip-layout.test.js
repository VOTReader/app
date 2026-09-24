/**
 * b5l (2026-09-23): the offline-library strip takes layout space.
 * ─────────────────────────────────────────────────────────────────────
 * The strip (.sh-banner.offline-library-banner, B5) is position:fixed just
 * under the top nav and reserved no room. Measured in the real built app at
 * 390x844 (2026-09-23): it covered the top 44.2 px of every page, 74.3 px at
 * text size 1.3 (where its 1.4rem offset also left it 6.7 px below the nav),
 * and it sat on the chapter arrows' spot. OfflineLibraryBanner now declares
 * itself (body.offline-strip-open + --offline-strip-h); jsdom has no layout,
 * so this pins the CSS half: room under the nav, the arrows below the strip,
 * and a top that is the nav's real height at every text size.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(HERE, '..', 'app', 'src', 'main', 'assets', 'app.css'), 'utf-8');

/** Every declaration block whose rule starts a line with exactly `selector`, in file order. */
function blocks(selector) {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp('^\\s*' + esc + ' \\{([^}]*)\\}', 'gm');
  return [...CSS.matchAll(re)].map((m) => m[1]);
}
/** The value of `top:` in a block (not `padding-top:`). */
const top = (b) => (/(?:^|[\s;{])top:\s*([^;]+);/.exec(b || '') || [])[1];

describe('the offline-library strip takes layout space (b5l)', () => {
  const strip = top(blocks('.sh-banner.offline-library-banner')[0]);

  it('sits flush under the nav: its 44px buttons + its padding (pinned in px) + its 1px border', () => {
    // The chrome-pin block at the end of app.css freezes the nav's padding in px at every text
    // size (last rule wins), so a rem term drifts from the nav as the reader's text size changes.
    const pin = blocks('.top-nav').pop();
    const m = /padding:\s*([\d.]+)px \S+ ([\d.]+)px/.exec(pin || '');
    expect(m, "the chrome-pin .top-nav rule no longer states its padding in px").toBeTruthy();
    const pad = Number(m && m[1]) + Number(m && m[2]);
    expect(strip).toBe(`calc(var(--inset-top, 0px) + 44px + ${pad}px + 1px)`);
  });

  it('opens its own height of room under the page nav (not under the tabs overview, which covers it)', () => {
    const room = blocks('body.offline-strip-open :not(.tabs-overview-layer) > .screen-layout > .top-nav')[0];
    expect(room, 'the room rule is missing from app.css').toBeTruthy();
    expect(room).toMatch(/margin-bottom:\s*var\(--offline-strip-h, 0px\)/);
  });

  it('moves the chapter arrows below it (their home is the strip\'s spot)', () => {
    const arrows = blocks('.chapter-nav-sticky').map(top).filter(Boolean);
    expect(arrows).toEqual([strip]);
    const moved = top(blocks('body.offline-strip-open .chapter-nav-sticky')[0]);
    expect(moved).toBe(strip.replace(/\)$/, ' + var(--offline-strip-h, 0px))'));
  });
});

/* b5c (2026-09-24): Codex's critique of the built b5l strip (lanes/docs/out/b5l-codex-critique.md) measured
   Retry at 53x25.6 px and the X's 44x44 ::after overlay reaching 4.3 px into Retry. The strip's controls are
   real 44px boxes now; the real-browser measurement is in the commit message, this pins the CSS. */
describe("the offline-library strip's controls take a finger (b5c)", () => {
  const S = '.sh-banner.offline-library-banner';

  it('Retry is at least 44px tall', () => {
    expect(blocks(S + ' .sh-banner-btn')[0] || '').toMatch(/min-height:\s*44px/);
  });

  it('the X is a real 44x44 box, and its overlay (which reached into Retry) is off', () => {
    const x = blocks(S + ' .sh-banner-dismiss')[0] || '';
    expect(x).toMatch(/width:\s*44px/);
    expect(x).toMatch(/height:\s*44px/);
    expect(blocks(S + ' .sh-banner-dismiss::after')[0] || '').toMatch(/display:\s*none/);
  });

  it('the two sit at least 8px apart', () => {
    const gap = /gap:\s*(\d+)px/.exec(blocks(S + ' .sh-banner-actions')[0] || '');
    expect(gap && Number(gap[1])).toBeGreaterThanOrEqual(8);
  });

  it('the strip holds one height whether or not it shows controls (44px control + padding + border)', () => {
    expect(blocks(S)[0] || '').toMatch(/min-height:\s*calc\(44px \+ 1\.1rem \+ 1\.5px\)/);
  });
});
