/* plan-own: the Counting switch stays beside its words at large text (shots: D:/Swarm/lanes/vot-ui/out/plan-own/). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const here = dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(resolve(here, '..', '..', 'app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const block = (sel) => { const m = CSS.match(new RegExp('(^|[}\\s])' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}')); return m ? m[2].replace(/\s+/g, ' ').trim() : null; };

describe('the Counting line (plan-own)', () => {
  it('does not wrap the switch onto its own line; the words take the room left and wrap', () => {
    expect(block('.plan-count-line')).toBe('flex-wrap: nowrap;');
    expect(block('.plan-count-line > .plan-opt-text')).toBe('flex: 1 1 0; min-width: 0;');
  });
  it('the note under it uses the UI font in the custom builder too (no --pl-ui there)', () => {
    expect(block('.plan-opt-note')).toContain('font-family: var(--pl-ui, var(--font-ui));');
  });
  it("the switch's words and the other lines of the card ('Finish by', 'Keep the next 7 days') use the UI font, as Start, Length and Days do", () => {
    expect(block('.plan-opt-text')).toBe('flex: 1 1 auto; color: var(--cream); font-family: var(--pl-ui, var(--font-ui)); font-size: var(--fs-16);');
  });
});
