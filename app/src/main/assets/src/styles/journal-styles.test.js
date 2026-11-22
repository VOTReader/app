/* journal-styles.test.js — the journal's injected stylesheet.
   ─────────────────────────────────────────────────────────────────────
   journal-styles.js is a self-contained CSS injection: a global-scope
   IIFE, loaded via <script src> (and imported in stores/_entry-b.js),
   that builds 286 rules with R() and injects them as one
   <style id="jrn-styles"> into document.head.

   Two things are pinned here, and neither is string containment:
   1. The injection itself, run for real under the suite's jsdom env:
      one element, in the head, the guard making a second load a
      no-op, re-injection after removal.
   2. The injected sheet's contract, parsed into selector -> declaration
      maps (the app-css.test.js precedent: jsdom doesn't compute styles,
      so the text is what the UI depends on). Property-level assertions
      per feature area, plus the cascade-order and dead-keyframes
      findings the parse turned up (see LOG.md).

   The .jrn-fab rule is already pinned in app-css.test.js, so this file
   does not re-pin it. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const SRC = './journal-styles.js';

/* Split the injected sheet into top-level `selector { body }` rules.
   Brace-depth scan, so @keyframes (nested braces) stays one rule. */
function parseRules(css) {
  const rules = [];
  let depth = 0;
  let start = 0;
  let selector = '';
  let open = -1;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      if (depth === 0) {
        selector = css.slice(start, i).trim();
        open = i;
      }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        rules.push({ selector, body: css.slice(open + 1, i) });
        start = i + 1;
      }
    }
  }
  return rules;
}

/* Every rule with exactly this selector, in sheet order. */
function rulesFor(rules, selector) {
  return rules.filter((r) => r.selector === selector);
}

/* The value of `prop` in a rule body, or null. Splits on `;` first so
   `padding` never matches `padding-left`, `color` never matches
   `background-color`, and a `transition: opacity ...` value never
   matches `opacity`. */
function decl(body, prop) {
  for (const part of body.split(';')) {
    const colon = part.indexOf(':');
    if (colon === -1) continue;
    if (part.slice(0, colon).trim() === prop) return part.slice(colon + 1).trim();
  }
  return null;
}

/* Load the script fresh (removing any previous injection first) and
   return the injected element. The vi.resetModules + dynamic import
   pattern is in-repo (label-engine.test.js). */
async function injectFresh() {
  document.getElementById('jrn-styles')?.remove();
  vi.resetModules();
  await import(SRC);
  return document.getElementById('jrn-styles');
}

let el;
let css;
let rules;

beforeEach(async () => {
  el = await injectFresh();
  css = el.textContent;
  rules = parseRules(css);
});

describe('journal-styles — injection', () => {
  it('injects exactly one <style id="jrn-styles"> into document.head', () => {
    expect(document.querySelectorAll('#jrn-styles')).toHaveLength(1);
    expect(el.tagName).toBe('STYLE');
    expect(el.parentElement).toBe(document.head);
  });

  it('the sheet is 286 rules, one per line, with no blank lines', () => {
    const lines = css.split('\n');
    expect(lines).toHaveLength(286);
    expect(lines.every((l) => l.length > 0)).toBe(true);
  });

  it('a second load is a no-op: the guard keeps one element with the same text', async () => {
    const first = el;
    const text = first.textContent;
    vi.resetModules();
    await import(SRC);
    expect(document.querySelectorAll('#jrn-styles')).toHaveLength(1);
    expect(document.getElementById('jrn-styles')).toBe(first);
    expect(first.textContent).toBe(text);
  });

  it('removing the element and loading again re-injects it identically', async () => {
    const text = el.textContent;
    el.remove();
    expect(document.getElementById('jrn-styles')).toBeNull();
    vi.resetModules();
    await import(SRC);
    const again = document.getElementById('jrn-styles');
    expect(again).not.toBeNull();
    expect(again.textContent).toBe(text);
  });
});

describe('journal-styles — the injected sheet parses', () => {
  it('parses into 286 top-level rules, each with at least one declaration', () => {
    expect(rules).toHaveLength(286);
    for (const r of rules) {
      expect(r.selector.length, r.selector).toBeGreaterThan(0);
      expect(r.body, r.selector).toContain(':');
    }
    // Braces balance: the depth scan would have merged or split rules
    // otherwise, and the keyframes rule keeps its nested braces.
    expect(css.split('{').length).toBe(css.split('}').length);
  });

  it('every selector is journal-scoped: it mentions jrn', () => {
    const unscoped = rules.filter((r) => !r.selector.includes('jrn'));
    expect(unscoped).toEqual([]);
  });

  it('defines no custom properties: the tokens are inherited, not redefined', () => {
    // Header: "Inherits color/font tokens (--gold, --cream-dim, --bg,
    // --font-cinzel, etc.) from the main stylesheet — does NOT redefine them."
    const defs = rules.filter((r) => /--[a-z0-9-]+\s*:/.test(r.body));
    expect(defs).toEqual([]);
  });

  it('exactly two selectors repeat, and both are complementary, not conflicting', () => {
    const counts = new Map();
    for (const r of rules) counts.set(r.selector, (counts.get(r.selector) || 0) + 1);
    const dups = [...counts.entries()].filter(([, n]) => n > 1).map(([s]) => s).sort();
    expect(dups).toEqual(['.jrn-editor-meta', '.jrn-expand-toggle']);
  });
});

describe('journal-styles — hub and cards', () => {
  it('the hub leaves room for the bottom bar', () => {
    expect(decl(rulesFor(rules, '.jrn-hub')[0].body, 'padding-bottom')).toBe('96px');
  });

  it('the list is a column flex with the standard gap', () => {
    const body = rulesFor(rules, '.jrn-list')[0].body;
    expect(decl(body, 'display')).toBe('flex');
    expect(decl(body, 'flex-direction')).toBe('column');
    expect(decl(body, 'gap')).toBe('var(--sp-2)');
  });

  it('a card is positioned and reads as clickable', () => {
    const body = rulesFor(rules, '.jrn-card')[0].body;
    expect(decl(body, 'position')).toBe('relative');
    expect(decl(body, 'cursor')).toBe('pointer');
  });
});

describe('journal-styles — editor meta cascade', () => {
  it('the W2c rule overrides the editor rule, so the 44px gutter alignment never applies', () => {
    const metas = rulesFor(rules, '.jrn-editor-meta');
    expect(metas).toHaveLength(2);
    // Editor screen: the meta lines up with the drag gutter.
    expect(decl(metas[0].body, 'padding')).toBe('18px 22px 4px 44px');
    // W2c entry head: same selector, later in the sheet, wins the cascade.
    expect(decl(metas[1].body, 'padding')).toBe('14px 22px 4px');
    expect(rules.indexOf(metas[1])).toBeGreaterThan(rules.indexOf(metas[0]));
  });
});

describe('journal-styles — delete and drag', () => {
  it('the delete button is a subtle 26px circle with a 44px tap target', () => {
    const body = rulesFor(rules, '.jrn-block-del-btn')[0].body;
    expect(decl(body, 'width')).toBe('26px');
    expect(decl(body, 'height')).toBe('26px');
    expect(decl(body, 'opacity')).toBe('0.62');
    // WL4: the ::after hit area extends the 26px visual to the 44px floor.
    const after = rulesFor(rules, '.jrn-block-del-btn::after')[0].body;
    expect(decl(after, 'inset')).toBe('-9px');
  });

  it('text blocks whisper their delete until the block is being written', () => {
    const quiet = rulesFor(rules, '.jrn-block-edit.is-text .jrn-block-del-btn')[0].body;
    expect(decl(quiet, 'opacity')).toBe('0');
    expect(decl(quiet, 'pointer-events')).toBe('none');
    const engaged = rulesFor(rules, '.jrn-block-edit.is-text:focus-within .jrn-block-del-btn')[0].body;
    expect(decl(engaged, 'opacity')).toBe('0.8');
    expect(decl(engaged, 'pointer-events')).toBe('auto');
  });

  it('quote blocks carry the gold left border inside the editor card', () => {
    const body = rulesFor(rules, '.jrn-block-edit .jrn-block-quote')[0].body;
    expect(decl(body, 'border-left')).toBe('3px solid var(--gold)');
  });

  it('the drag grip lives in a left gutter, opposite the delete', () => {
    const grip = rulesFor(rules, '.jrn-block-drag-btn')[0].body;
    expect(decl(grip, 'left')).toBe('-38px');
    expect(decl(grip, 'touch-action')).toBe('none');
    expect(decl(grip, 'cursor')).toBe('grab');
    expect(decl(rulesFor(rules, '.jrn-block-drag-btn:active')[0].body, 'cursor')).toBe('grabbing');
    expect(decl(rulesFor(rules, '.jrn-editor .jrn-blocks')[0].body, 'padding-left')).toBe('44px');
  });

  it('a dragged block dims in place and flies as a framed card', () => {
    expect(decl(rulesFor(rules, '.jrn-block.dragging')[0].body, 'opacity')).toBe('0.25');
    const flying = rulesFor(rules, '.jrn-block.drag-flying')[0].body;
    expect(decl(flying, 'position')).toBe('fixed');
    expect(decl(flying, 'z-index')).toBe('9999');
    expect(decl(flying, 'pointer-events')).toBe('none');
  });
});

describe('journal-styles — confirm and triple-delete', () => {
  it('the block confirm flips to the top as a warm-red banner', () => {
    const body = rulesFor(rules, '.jrn-block-confirm')[0].body;
    expect(decl(body, 'order')).toBe('-1');
    expect(decl(body, 'background')).toBe('rgba(199, 92, 74, 0.14)');
    expect(decl(rulesFor(rules, '.jrn-block-confirm .ui-confirm-q')[0].body, 'color')).toBe('var(--tone-danger)');
  });

  it('the triple-delete final button is solid red, faded and inert when disabled', () => {
    const final = rulesFor(rules, '.jrn-tripledel-final')[0].body;
    expect(decl(final, 'background')).toBe('#c75c4a');
    expect(decl(final, 'color')).toBe('white');
    const disabled = rulesFor(rules, '.jrn-tripledel-final:disabled')[0].body;
    expect(decl(disabled, 'background')).toBe('rgba(199, 92, 74, 0.25)');
    expect(decl(disabled, 'cursor')).toBe('not-allowed');
    expect(decl(rulesFor(rules, '.jrn-tripledel-final:hover:not(:disabled)')[0].body, 'background')).toBe('#b04d3d');
  });
});

describe('journal-styles — recording', () => {
  it('the waveform is a 64px flex row of 3px bars', () => {
    const wave = rulesFor(rules, '.jrn-rec-waveform')[0].body;
    expect(decl(wave, 'display')).toBe('flex');
    expect(decl(wave, 'height')).toBe('64px');
    const bar = rulesFor(rules, '.jrn-rec-waveform .bar')[0].body;
    expect(decl(bar, 'width')).toBe('3px');
    expect(decl(bar, 'min-height')).toBe('6px');
  });

  it('the status and the error read in the danger tone', () => {
    expect(decl(rulesFor(rules, '.jrn-rec-status')[0].body, 'color')).toBe('var(--tone-danger)');
    expect(decl(rulesFor(rules, '.jrn-rec-error')[0].body, 'color')).toBe('var(--tone-danger)');
  });

  it('the pulse keyframes exist but nothing applies them', () => {
    const kf = rulesFor(rules, '@keyframes jrnPulseRec');
    expect(kf).toHaveLength(1);
    expect(kf[0].body).toMatch(/0%,100%\s*\{\s*opacity:\s*1/);
    expect(kf[0].body).toMatch(/50%\s*\{\s*opacity:\s*0\.4/);
    // No rule in the sheet sets an animation to jrnPulseRec; the only
    // `animation:` declarations are the two `none` overrides, and there
    // is no base .jrn-rec-status::before rule at all — the recording
    // dot has no base styling and never pulses (see LOG.md).
    const animated = rules.filter((r) => /animation\s*:[^;]*jrnPulseRec/.test(r.body));
    expect(animated).toEqual([]);
    const animations = rules.flatMap((r) => {
      const m = /animation\s*:\s*([^;]+)/.exec(r.body);
      return m ? [m[1].trim()] : [];
    });
    expect(animations).toEqual(['none', 'none']);
    expect(rulesFor(rules, '.jrn-rec-status::before')).toEqual([]);
  });
});

describe('journal-styles — FAB, expand toggle, light overrides', () => {
  it('the new-entry pill is a wide pill, not a round FAB', () => {
    const body = rulesFor(rules, '.jrn-fab-newentry')[0].body;
    expect(decl(body, 'min-width')).toBe('56px');
    expect(decl(body, 'border-radius')).toBe('var(--r-pill)');
  });

  it('the expand toggle keeps a 44px hit area without moving the text', () => {
    // n183: the ::after hit area, positioned by the second rule.
    const toggles = rulesFor(rules, '.jrn-expand-toggle');
    expect(toggles).toHaveLength(2);
    expect(decl(toggles[0].body, 'color')).toBe('var(--gold)');
    expect(decl(toggles[1].body, 'position')).toBe('relative');
    const after = rulesFor(rules, '.jrn-expand-toggle::after')[0].body;
    expect(decl(after, 'height')).toBe('44px');
  });

  it('the light theme turns the triple-delete question and rename input dark-on-light', () => {
    expect(decl(rulesFor(rules, 'body.light .jrn-tripledel-question')[0].body, 'color')).toBe('#2a2520');
    const rename = rulesFor(rules, 'body.light .jrn-rename-input')[0].body;
    expect(decl(rename, 'background')).toBe('white');
    expect(decl(rename, 'color')).toBe('#2a2520');
  });
});
