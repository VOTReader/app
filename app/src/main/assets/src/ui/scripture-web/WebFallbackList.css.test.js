// @ts-nocheck
/* Landing 34 follow-up (Codex's critique of the built list against its mockup,
   2026-09-24, lanes/myweb/out/mockups/critique-built-fallback.md): two things a
   reader felt on real data.
   1. A long verse card scrolled its "Verse N" heading away - John 3's verse 2
      has ten rows - so the rows below read without saying where they start.
      The heading now sticks to the top of the list while its card is on
      screen, opaque, so the rows pass under it.
   2. The status note wrapped its last word ("now.") onto a line of its own
      beside Try again. It balances its lines now.
   Pinned on the stylesheet: jsdom lays nothing out, and the 412 px look
   (lanes/myweb/out) is the picture. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const CSS = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../app.css'), 'utf8');

/** The declaration block of the FIRST rule whose selector list is exactly `sel`. */
function rule(sel) {
  const re = new RegExp('(^|[\\s}])' + sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}', 'm');
  const m = CSS.match(re);
  if (!m) throw new Error('no rule for ' + sel);
  return m[2];
}

describe('the Scripture Web list keeps its bearings (landing 34 follow-up)', () => {
  it('a verse card keeps its heading in view while its rows scroll under it', () => {
    const d = rule('.swf-card-head');
    expect(d).toMatch(/position\s*:\s*sticky/);
    expect(d).toMatch(/top\s*:\s*0/);
    expect(d).toMatch(/background\s*:\s*var\(--bg3\)/); // the card's own ground: rows pass under, not through
  });

  it('the status note balances its two lines instead of leaving one word alone', () => {
    expect(rule('.swf-note > span')).toMatch(/text-wrap\s*:\s*balance/);
  });
});
