// @ts-nocheck
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

/** A bare rule's body, isolated from the rest of the stylesheet. */
function bareRule(sel) {
  const css = fs.readFileSync(CSS, 'utf8');
  /* The bare rule, not `.sw-root.sw-rotated .sw-controls` and not a media
     override: anchor on a line whose selector is exactly `<sel> {`. */
  const m = css.match(new RegExp('\\n\\s*\\' + sel + '\\s*\\{([^}]*)\\}'));
  if (!m) throw new Error(`no bare \`${sel} {\` rule found in app.css — this test is about a `
    + 'selector that no longer exists, which is a finding about the test, not a pass');
  return m[1];
}

/* BOTH panels, because there are two and they are the same treatment: .sw-topbar
   on the left, .sw-controls on the right. Testing one would have let the other
   ship, which is precisely what the scope I was handed would have done. */
const PANELS = ['.sw-topbar', '.sw-controls'];

describe('the Scripture Web controls float over the canvas, with no panel behind them', () => {
  it.each(PANELS)('%s exists and is the rule that lays its row out', (sel) => {
    /* THE HARNESS PRECONDITION, and it is also the anti-vacuity guard: if this
       goes red, every assertion below is about the wrong rule (or about no rule
       at all) whatever colour it shows. */
    const body = bareRule(sel);
    expect(body).toMatch(/position:\s*absolute/);
    expect(body).toMatch(/display:\s*flex/);
  });

  it.each(PANELS)('%s declares no background — the black box behind the buttons', (sel) => {
    expect(bareRule(sel)).not.toMatch(/background/);
  });

  it.each(PANELS)('%s declares no border and no radius — a rounded outline is the same box', (sel) => {
    const body = bareRule(sel);
    expect(body).not.toMatch(/border\s*:/);
    expect(body).not.toMatch(/border-radius/);
  });

  /* Round 3 (Corbin, 2026-09-11): the credit left the canvas — it printed over the book labels
     in landscape — and About carries the CC-BY line. Its rule goes with it: a rule for an
     element nothing renders is the dead CSS the css-tokens gate exists to keep out. */
  it('the canvas credit has no rule left in app.css (the attribution is About\'s)', () => {
    const raw = fs.readFileSync(CSS, 'utf8');
    const stripped = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    /* The stripper proven on the file that carries the hazard: a history comment still
       names `.sw-credit`, so raw must contain it and stripped must not — and stripped must
       still be the stylesheet (a stripper that ate the file would satisfy the absence). */
    expect(raw).toMatch(/\.sw-credit\b/);
    expect(stripped).toMatch(/\.sw-live\s*\{/);
    expect(stripped).not.toMatch(/\.sw-credit\b/);
  });

  /* The hide button hides the interactive chrome and KEEPS the legend: the one rule that hides
     under .sw-chrome-hidden names the topbar, the strip AND the context card (.sw-tip — the
     chapter/verse card floating over the canvas; Orchestrator on Corbin's "just hide the
     interactable UI for small screens", 2026-09-11: a card over the canvas is neither the web nor
     the legend, and on a phone it is exactly the space he wants back), and must not name the
     colour key. Anchored on the rule itself, with positives on the same rule, so a stylesheet
     that lost the rule cannot satisfy the absence. */
  it('the hidden state hides the topbar, the strip and the context card, not the legend', () => {
    const css = fs.readFileSync(CSS, 'utf8');
    const m = css.match(/\.sw-root\.sw-chrome-hidden\s*:is\(([^)]*)\)\s*\{\s*display:\s*none;?\s*\}/);
    expect(m, 'the .sw-root.sw-chrome-hidden :is(...) { display: none } rule').toBeTruthy();
    const hidden = m[1];
    expect(hidden).toMatch(/\.sw-topbar/);
    expect(hidden).toMatch(/\.sw-controls/);
    expect(hidden, 'the context card hides with the chrome (w-marker-icon extra)').toMatch(/\.sw-tip\b/);
    expect(hidden).not.toMatch(/\.sw-legend/);
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
