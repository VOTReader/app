/* RED for the Scripture Web's chrome: no panel behind the controls, and no
 * light palette can reach this screen.
 * ═══════════════════════════════════════════════════════════════════════
 * Corbin, from a screenshot of the top chrome at desktop width: "get rid of the
 * black box around buttons, make dark mode the default, only dark mode, light
 * mode doesn't make sense for this".
 *
 * Both halves are asserted here because both fail on main today, and they fail
 * for unrelated reasons: the box is a CSS declaration on `.sw-controls`, and
 * the light palette arrives through `readChromeTokens()`, which consults
 * `document.body.classList` and reads the app's shared custom properties. One
 * of those is text and one is behaviour, so neither test would catch the other.
 */
import { describe, it, expect, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readChromeTokens } from '../../utils/scripture-web/palette.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CSS = path.join(HERE, '../../../app.css');

/** The `.sw-controls` rule body, isolated from the rest of the stylesheet. */
function controlsRule() {
  const css = fs.readFileSync(CSS, 'utf8');
  /* The bare rule, not `.sw-root.sw-rotated .sw-controls` and not a media
     override: anchor on a line whose selector is exactly `.sw-controls {`. */
  const m = css.match(/\n\s*\.sw-controls\s*\{([^}]*)\}/);
  if (!m) throw new Error('no bare `.sw-controls {` rule found in app.css — this test is about a '
    + 'selector that no longer exists, which is a finding about the test, not a pass');
  return m[1];
}

describe('the Scripture Web controls float over the canvas, with no panel behind them', () => {
  it('the .sw-controls rule exists and is the one that lays the row out', () => {
    /* THE HARNESS PRECONDITION, and it is also the anti-vacuity guard: if this
       goes red, every assertion below is about the wrong rule (or about no rule
       at all) whatever colour it shows. */
    const body = controlsRule();
    expect(body).toMatch(/position:\s*absolute/);
    expect(body).toMatch(/display:\s*flex/);
  });

  it('declares no background — the black box behind the buttons is the thing being removed', () => {
    expect(controlsRule()).not.toMatch(/background/);
  });

  it('declares no border and no radius — a rounded outline is the same box by another name', () => {
    const body = controlsRule();
    expect(body).not.toMatch(/border\s*:/);
    expect(body).not.toMatch(/border-radius/);
  });
});

describe('no light palette can reach the Scripture Web', () => {
  afterEach(() => { document.body.className = ''; });

  it('readChromeTokens reports dark even when the app is in light mode', () => {
    document.body.className = 'light';
    /* The precondition first: if the class does not stick, a dark answer below
       means nothing, because nothing asked for light in the first place. */
    expect(document.body.classList.contains('light')).toBe(true);
    expect(readChromeTokens().isLight).toBe(false);
  });

  it('paints the dark ground in light mode, not the parchment one', () => {
    document.body.className = 'light';
    const chrome = readChromeTokens();
    /* jsdom resolves no stylesheet, so `get()` falls through to its own
       defaults — which is exactly where the light branch lives, and exactly
       what has to go. #f7f2e8 is the light `--bg`. */
    expect(chrome.bg).not.toBe('#f7f2e8');
    expect(chrome.ink).not.toBe('#150a04');
    expect(chrome.gold).not.toBe('#7a5c10');
  });

  it('gives the same palette in light mode as in dark — not merely a dark-ish one', () => {
    document.body.className = '';
    const dark = readChromeTokens();
    document.body.className = 'light';
    const light = readChromeTokens();
    /* The strongest form: the screen has ONE palette. A test that only checked
       "not the light value" would pass on a third palette nobody designed. */
    expect(light).toEqual(dark);
  });
});
