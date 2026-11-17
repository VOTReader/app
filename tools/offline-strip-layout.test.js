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
  // banner trim (2026-11-17): the offline strip takes its top from the shared .sh-banner rule (it repeated it before).
  const strip = top(blocks('.sh-banner.offline-library-banner')[0]) || top(blocks('.sh-banner')[0]);

  it('sits flush under the nav: its 44px buttons + its padding (pinned in px), no border since the UI pass (W1)', () => {
    // The chrome-pin block at the end of app.css freezes the nav's padding in px at every text
    // size (last rule wins), so a rem term drifts from the nav as the reader's text size changes.
    const pin = blocks('.top-nav').pop();
    const m = /padding:\s*([\d.]+)px \S+ ([\d.]+)px/.exec(pin || '');
    expect(m, "the chrome-pin .top-nav rule no longer states its padding in px").toBeTruthy();
    const pad = Number(m && m[1]) + Number(m && m[2]);
    // n229: the strip and the arrows read the one token, --dock-nav-bottom (:root), instead of four
    // hand-copied calcs; the token is what must equal the nav's height.
    expect(strip).toBe('var(--dock-nav-bottom)');
    // The UI pass (W1, 2026-11-11): the bar has no bottom border (a scroll hairline is a box-shadow, outside the box),
    // so the token is the inset + --bar-h, and --bar-h must be the 44px row + the pinned padding.
    const token = (/--dock-nav-bottom:\s*([^;]+);/.exec(CSS) || [])[1];
    expect(token).toBe('calc(var(--inset-top, 0px) + var(--bar-h))');
    const barH = (/--bar-h:\s*([\d.]+)px;/.exec(CSS) || [])[1];
    expect(Number(barH)).toBe(44 + pad);
    const base = blocks('.top-nav')[0] || '';
    expect(base).toMatch(/border-bottom:\s*0;/);
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
    expect(moved).toBe('calc(' + strip + ' + var(--offline-strip-h, 0px))');
  });
});

/* b5c (2026-09-24) asked for real 44px controls on the strip: Retry was 53x25.6 px and the X's overlay reached into
   it. Both are the Notice's own kit parts now (banner trim, 2026-11-17): a small kit button (38px, its ::after takes the
   press to 44) and the 44px x. This pins that no private sizing comes back, and that the strip holds one height. */
describe("the offline-library strip's controls are the kit's (b5c, banner trim)", () => {
  const S = '.sh-banner.offline-library-banner';

  it('no private button or x sizing: the retired .sh-banner-btn / .sh-banner-actions rules stay gone', () => {
    expect(CSS).not.toMatch(/\.sh-banner-(btn|actions)\b/);
    expect(blocks(S + ' .ui-notice-x')).toEqual([]);
  });

  it("the kit's small button presses at 44px and the x is a 44px box", () => {
    expect(CSS).toMatch(/--tap:\s*44px/);
    expect(CSS).toMatch(/--btn-h-sm:\s*38px/);
    expect(blocks('.ui-btn.is-small::after')[0] || '').toMatch(/inset:\s*-3px 0/);
    expect(blocks('.ui-notice-x')[0] || '').toMatch(/width:\s*var\(--tap\);\s*height:\s*var\(--tap\)/);
  });

  it('the strip holds the height it has with Retry in every state (small button + notice padding + strip padding)', () => {
    expect(blocks(S)[0] || '').toMatch(/min-height:\s*calc\(var\(--btn-h-sm\) \+ 24px \+ 2 \* var\(--sp-2\)\)/);
  });
});

/* banner trim (2026-11-17): at text 2.0 on 360 px the inline notice kept Retry and the x on the title's row and
   squeezed 'Offline library incomplete' to a column Retry covered (title spilled 72 px). At large text its buttons wrap
   to their own row under the text; the x stays beside the title. */
describe('an inline notice at large text puts its buttons on their own row', () => {
  it('wraps, keeps the x on the first row and moves the buttons after it', () => {
    expect(blocks('.vot-large-text .ui-notice.is-inline')[0] || '').toMatch(/flex-wrap:\s*wrap/);
    expect(blocks('.vot-large-text .ui-notice.is-inline > .ui-notice-x')[0] || '').toMatch(/order:\s*1/);
    expect(blocks('.vot-large-text .ui-notice.is-inline > .ui-btn')[0] || '').toMatch(/order:\s*2/);
    expect(blocks('.vot-large-text .ui-notice.is-inline > .ui-notice-text')[0] || '').toMatch(/flex:\s*1 1 calc\(100% - /);
  });
});
