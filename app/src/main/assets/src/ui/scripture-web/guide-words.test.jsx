// @ts-nocheck — reads app.css through node:fs (the typecheck has no node types)
/* "How to read this web" (digest items 22, 23; Q5; w3 panel step 2).
 * ═══════════════════════════════════════════════════════════════════════
 * The card a first visit opens. It is four or five short lines, and each one points at
 * something the screen has: pinch or scroll to zoom (and the drag that looks higher, and what an
 * arch's height means: the farther apart its verses, the taller; w3 review, C22), tap a
 * thread (its votes, said once in plain words), the gold ticks of the Volumes' citations,
 * the Go to that jumps to a verse (only when the go-to is there), and Reset. It never names a
 * control the screen does not have: the "+" button and the ruler-and-bar it described were
 * retired (item 23). The credit is the legend's alone (Corbin, 2026-10-29). The card is the web's
 * own dark panel in both themes (Q4: panels pinned dark).
 */
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HowToReadGuide } from './panels.jsx';
import { WEB_CREDIT } from '../../utils/scripture-web/describe.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BARE = fs.readFileSync(path.join(HERE, '../../../app.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const rule = (selector) => {
  const esc = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = new RegExp('(?:^|[{}\\n])\\s*' + esc + '\\s*\\{([^}]*)\\}').exec(BARE);
  if (!m) throw new Error('no `' + selector + ' {` rule in app.css');
  return m[1];
};

const guide = (props = {}) => render(<HowToReadGuide onClose={() => {}} {...props} />).container.querySelector('.sw-guide');
const lines = (card) => [...card.querySelectorAll('li')].map((li) => li.textContent);

afterEach(cleanup);

describe('How to read this web: four short points about controls that exist', () => {
  /* w4 quality hunt: the line called the control "Search", which everywhere else is Go to. WA4: the
     v2 guide (w-guide) is four points, each an icon and its words; the Go to, Filters and List pills
     name themselves in the bottom bar, so no line explains them and no line calls one "search". */
  it('four points, each an icon and its words; no line for the go-to, and never "search"', () => {
    const card = guide();
    const pts = [...card.querySelectorAll('ul.sw-guide-list > li.sw-guide-pt')];
    expect(pts).toHaveLength(4);
    for (const li of pts) expect(li.querySelector('.sw-guide-ic'), li.textContent).not.toBeNull();
    expect(lines(card)).toHaveLength(4);
    expect(lines(card).join(' ')).not.toMatch(/go to|search/i);
  });

  it('each line is short (one or two sentences, under 110 characters)', () => {
    for (const s of lines(guide())) {
      expect(s.length, s).toBeLessThan(110);
      expect((s.match(/[.!?](\s|$)/g) || []).length, s).toBeLessThanOrEqual(2);
    }
  });

  // WA4: the zoom is the bottom bar's + and − (and pinch); Reset left the screen (Whole web is its own pill)
  it('names what the screen has: + and − or pinch to zoom, tap a thread, the gold ticks; no Reset', () => {
    const text = lines(guide()).join(' ');
    expect(text).toMatch(/zoom with \+ and −, or pinch/i);
    expect(text).toMatch(/tap a thread/i);
    expect(text).toMatch(/gold ticks?\b[^.]*\bVolumes\b/i);
    expect(text).not.toMatch(/\bReset\b/);
  });

  // ideas audit A10.1 (2026-10-23): the card left out what the numbers count, the bold names and the
  // zoom down to the words. WA4: Filters and My Web are pills and the title's switch now, named on
  // screen, so the card no longer points at them (and never at a "More" that holds them)
  it('says what a count number is, what bold names mark, that zoom reaches the words; never "in More"', () => {
    const text = lines(guide()).join(' ');
    expect(text).toMatch(/A number marks threads that meet: tap it to fan them out/);
    expect(text).toMatch(/Bold names are the major books/);
    expect(text).toMatch(/down to each verse’s words/);
    expect(text).toMatch(/drag down to look higher/i);
    expect(text).not.toMatch(/\bin More\b/);
  });

  it("says what an arch's height means, once: the farther apart its verses, the taller (C22, w3 review)", () => {
    const text = lines(guide()).join(' ');
    expect(text).toMatch(/farther apart[^.]*\btaller\b[^.]*\barch\b/i);
    expect(text.match(/\btaller\b/gi)).toHaveLength(1);
  });

  // WA4: the four-point card drops the votes line; it must not name votes without saying what they are
  it('names no votes it does not explain', () => {
    const text = lines(guide()).join(' ');
    expect(text).not.toMatch(/\bvotes?\b/i);
  });

  // WA4: the bottom bar has its zoom pair again, so "+ and −" is a control the screen has (the
  // retired ruler and jump bar still are not)
  it('claims no control the screen lacks: + only with its − pair, no ruler on the left, no bar to jump (item 23)', () => {
    const text = lines(guide()).join(' ');
    expect(text.match(/\+/g)).toHaveLength(1);
    expect(text).toMatch(/\+ and −/);
    expect(text).not.toMatch(/\bruler\b/i);
    expect(text).not.toMatch(/\bbar\b/i);
  });

  /* Digest item 46: a dialog that traps focus is modal and must say so. The docked panel is the
     other kind (aria-modal="false", no trap: web-panel.jsx); the guide traps Tab and takes Escape,
     so it is aria-modal="true". */
  it('says it is modal, because it traps focus (item 46)', () => {
    const card = guide();
    expect(card.getAttribute('role')).toBe('dialog');
    expect(card.getAttribute('aria-modal')).toBe('true');
  });

  // Corbin, 2026-10-29: "We don't need huge credit lines about OpenBible really anywhere except for
  // a small spot in sweb": the credit is the legend's tail alone, not the card's footer
  // WA4: the card has a foot again, but it holds the way back to it and Got it, never a credit
  it('carries no credit line of its own: the legend\'s small one is the web\'s', () => {
    const card = guide();
    const foot = card.querySelector('.sw-guide-foot');
    expect(foot).not.toBeNull();
    expect(foot.textContent).toBe('Find this again under ⋯Got it');
    expect(card.textContent).not.toContain(WEB_CREDIT);
    expect(card.textContent).not.toMatch(/OpenBible|CC-BY/);
  });

  // WA4 (w-menu): the ⋯ menu's About the data opens the same card in its `about` variant
  it('about: titled "About the data", names OpenBible.info and CC-BY, closes with Done', () => {
    const card = guide({ about: true });
    expect(card.querySelector('[role="document"] .sw-guide-title').textContent).toBe('About the data');
    expect(card.textContent).toMatch(/OpenBible\.info/);
    expect(card.textContent).toMatch(/CC-BY/);
    expect(card.querySelector('.sw-guide-close').textContent).toBe('Done');
    expect(card.querySelector('.sw-guide-again')).toBeNull();
  });
});

/* w4 quality hunt: My Web opened the canon's card, which told of votes and gold ticks My Web does
   not draw. My Web's card speaks of what My Web has: the two rails, the reader's links and
   Timothy's notes (the legend's words), a tap on a line, and the rails' own Reset buttons. */
describe('the guide in My Web speaks of My Web', () => {
  const mine = () => lines(guide({ mode: 'personal' }));
  it('four short lines: the two rails, the two families of lines, a tap, the Reset buttons', () => {
    const text = mine();
    expect(text).toHaveLength(4);
    for (const s of text) {
      expect(s.length, s).toBeLessThan(110);
      expect((s.match(/[.!?](\s|$)/g) || []).length, s).toBeLessThanOrEqual(2);
    }
    const all = text.join(' ');
    expect(all).toMatch(/Volumes[^.]*\btop\b[^.]*Bible[^.]*\bbottom\b/);
    expect(all).toContain('your links');
    expect(all).toContain('Timothy’s notes');
    expect(all).toMatch(/\bTap a line\b/);
    expect(all).toMatch(/Reset Volumes/);
    expect(all).toMatch(/Reset Bible/);
  });
  it('names nothing My Web lacks: no votes, no gold ticks, no Go to, no arch heights', () => {
    const all = mine().join(' ');
    expect(all).not.toMatch(/votes?|tick|Go to|search|arch/i);
  });
  it('keeps the browse-mode document, and no credit line of its own', () => {
    const card = guide({ mode: 'personal' });
    expect(card.querySelector('[role="document"] .sw-guide-title')).not.toBeNull();
    expect(card.textContent).not.toContain(WEB_CREDIT);
  });
});

describe('the guide reads in browse mode (w4 quality hunt)', () => {
  // the screen's root is role="application": the card's words sit in a document inside the
  // dialog, so NVDA and JAWS read them with the virtual cursor
  it('its title and lines sit in a role="document" region; Got it stays outside it', () => {
    const card = guide();
    const doc = card.querySelector('[role="document"]');
    expect(doc).not.toBeNull();
    expect(doc.querySelector('.sw-guide-title')).not.toBeNull();
    expect(doc.querySelectorAll('li').length).toBe(4); // WA4: four points
    expect(doc.contains(card.querySelector('.sw-guide-close'))).toBe(false);
  });
});

describe('the guide card is the web\'s dark panel in both themes (Q4)', () => {
  it('paints the panel ink and face, never the theme\'s card', () => {
    const card = rule('.sw-guide');
    expect(card).toMatch(/background:\s*var\(--sw-panel\)/);
    expect(card).toMatch(/border:\s*1px solid var\(--sw-panel-edge\)/);
    expect(card).toMatch(/font-family:\s*var\(--sw-font\)/);
    expect(card).toMatch(/color:\s*var\(--sw-text-body\)/);
    expect(card).not.toMatch(/var\(--(bg\d?|cream|gold)[-)]/);
    expect(rule('.sw-guide-title')).toMatch(/color:\s*var\(--sw-title\)/);
    // WA4: the points' bold leads are the panel's title ink, their icons the web's gold
    expect(rule('.sw-guide-pt b')).toMatch(/color:\s*var\(--sw-title\)/);
    expect(rule('.sw-guide-ic')).toMatch(/color:\s*var\(--sw-gold\)/);
    expect(rule('.sw-guide-pt')).toMatch(/color:\s*var\(--sw-text-body\)/);
  });

  it('reads at 13 px or more', () => {
    // WA4: the points are .sw-guide-pt; the foot's "Find this again under ⋯" too
    for (const sel of ['.sw-guide-title', '.sw-guide-pt', '.sw-guide-again']) {
      const m = /font-size:\s*var\(--fsc?-(\d+)\)/.exec(rule(sel));
      expect(m, sel).toBeTruthy();
      expect(Number(m[1]), sel).toBeGreaterThanOrEqual(13);
    }
  });
});
