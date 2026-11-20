/* e2e-contrast-lib — what tools/e2e-contrast.mjs prints when a stop fails, as pure helpers (hub 11-20: a gate failure
   names its fix). The walk launches a browser at import, so what a test reaches lives here. */
import { fixLine } from './e2e-walk-lib.mjs';

/**
 * One fix line per kind of failure at a stop.
 * @param {{stop: string, theme: string, fails: {kind: string, ratio: number, need: number, sel: string, fg: string, fga: number, bg: string}[],
 *   literal: {kind: string, value: string, sel: string}[], fades: {settled: boolean, still: string[]}}} r
 * @returns {string[]}
 */
export function contrastFixes(r) {
  const out = [];
  const faded = r.fails.filter((f) => f.fga < 1);
  const solid = r.fails.filter((f) => !(f.fga < 1));
  if (faded.length) {
    const f = faded.slice().sort((a, b) => a.ratio - b.ratio)[0];
    const lead = `${f.sel} at ${r.stop} (${r.theme}) read ${f.ratio.toFixed(2)}:1 through ancestor opacity ${f.fga.toFixed(2)}: `;
    out.push(fixLine(r.fades && !r.fades.settled
      ? lead + `the walk read it mid-fade (still moving after a ${Math.round((r.fades.waitedMs || 0) / 1000)} s wait: ${r.fades.still.slice(0, 2).join('; ')}); shorten that fade, or have the walk wait for it before this stop`
      : lead + 'if it passes on a rerun it was read mid-fade (a fade the wait could not see); if it rests translucent, raise that opacity or its ink until it reaches '
        + f.need + ':1'));
  }
  if (solid.length) {
    const f = solid.slice().sort((a, b) => a.ratio - b.ratio)[0];
    out.push(fixLine(`${f.sel} at ${r.stop} (${r.theme}) is ${f.ratio.toFixed(2)}:1 (${f.fg} on ${f.bg}), needs ${f.need}:1: give it a stronger ink token in ${r.theme}`
      + ' or a darker/lighter ground behind it' + (solid.length > 1 ? ` (${solid.length - 1} more listed above)` : '')));
  }
  if (r.literal && r.literal.length) {
    const l = r.literal[0];
    out.push(fixLine(`${l.sel} at ${r.stop} keeps ${l.value} (${l.kind}) when the theme changes: replace the literal colour with a theme token`
      + (r.literal.length > 1 ? ` (${r.literal.length - 1} more listed above)` : '')));
  }
  return out;
}
