/* The app map fix list (D:/AgentBackbone/reports/vot-app-map/FIXLIST.md), lane fix-ui-a: the CSS each fix rests on. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(here, '..', '..', 'app.css'), 'utf8');

/** The declaration block of the first rule whose selector text starts with `selector` (comments stripped). */
function ruleBlock(css, selector) {
  const bare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const idx = bare.indexOf(selector);
  if (idx === -1) return null;
  const open = bare.indexOf('{', idx);
  const close = bare.indexOf('}', open);
  if (open === -1 || close === -1) return null;
  return bare.slice(open + 1, close);
}

describe('fix list 10: Search\'s two-line rows keep their title whole', () => {
  it('a two-line row\'s title wraps to two lines instead of cutting "Answers Only God Can Give"', () => {
    const block = ruleBlock(CSS, '.srch-row.is-two .srch-row-t {');
    expect(block).not.toBeNull();
    expect(block).toMatch(/white-space:\s*normal/);
    expect(block).toMatch(/-webkit-line-clamp:\s*2/);
  });

  it('its second line wraps too, so "What does The Lord say about…" is not cut at large text', () => {
    const block = ruleBlock(CSS, '.srch-row.is-two .srch-row-m {');
    expect(block).not.toBeNull();
    expect(block).toMatch(/white-space:\s*normal/);
  });
});

describe('fix list 43: the Speed sheet\'s fine-tune row puts its label above the stepper at large text', () => {
  it('the speed row wraps and its label takes the whole first line, as Your own does', () => {
    const wrap = ruleBlock(CSS, '.vot-large-text :is(.np-custom, .audio-speed-row) {');
    expect(wrap).not.toBeNull();
    expect(wrap).toMatch(/flex-wrap:\s*wrap/);
    const label = ruleBlock(CSS, '.vot-large-text :is(.np-custom-label, .audio-speed-fine) {');
    expect(label).not.toBeNull();
    expect(label).toMatch(/flex-basis:\s*100%/);
  });
});

describe('fix list 20: Listen rows wrap their words instead of cutting them beside a value', () => {
  it('Listen root and the Downloads voice row let title and subtitle wrap, and the value give room', () => {
    const words = ruleBlock(CSS, '.listen-root :is(.root-row-title, .root-row-sub), .dl-voice-group .ui-row-title {');
    expect(words).not.toBeNull();
    expect(words).toMatch(/white-space:\s*normal/);
    const text = ruleBlock(CSS, '.listen-root .root-row-text, .dl-voice-group .ui-row-text {');
    expect(text).toMatch(/min-width:\s*50%/);
    const value = ruleBlock(CSS, '.listen-root .root-row-count, .dl-voice-group .ui-row-value {');
    expect(value).toMatch(/white-space:\s*normal/);
    expect(value).toMatch(/flex-shrink:\s*1/);
  });
});

describe('fix list 43: the Speed sheet\'s fine-tune row puts its label above the stepper at large text', () => {
  it('the speed row wraps and its label takes the whole first line, as Your own does', () => {
    const wrap = ruleBlock(CSS, '.vot-large-text :is(.np-custom, .audio-speed-row) {');
    expect(wrap).not.toBeNull();
    expect(wrap).toMatch(/flex-wrap:\s*wrap/);
    const label = ruleBlock(CSS, '.vot-large-text :is(.np-custom-label, .audio-speed-fine) {');
    expect(label).not.toBeNull();
    expect(label).toMatch(/flex-basis:\s*100%/);
  });
});
