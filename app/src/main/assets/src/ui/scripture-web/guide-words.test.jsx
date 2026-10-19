// @ts-nocheck — reads app.css through node:fs (the typecheck has no node types)
/* "How to read this web" (digest items 22, 23; Q5; w3 panel step 2).
 * ═══════════════════════════════════════════════════════════════════════
 * The card a first visit opens. It is four or five short lines, and each one points at
 * something the screen has: pinch or scroll to zoom (and the drag that looks higher, and what an
 * arch's height means: the farther apart its verses, the taller; w3 review, C22), tap a
 * thread (its votes, said once in plain words), the gold ticks of the Volumes' citations,
 * the search that goes to a verse (only when the go-to is there), and Reset. It never names a
 * control the screen does not have: the "+" button and the ruler-and-bar it described were
 * retired (item 23). Its footer carries the OpenBible.info credit (Q5). The card is the web's
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

describe('How to read this web: four or five short lines about controls that exist', () => {
  it('four lines without the go-to, five with it; the search line comes only with the search', () => {
    const without = lines(guide());
    expect(without).toHaveLength(4);
    expect(without.join(' ')).not.toMatch(/search/i);
    cleanup();
    const withSearch = lines(guide({ canSearch: true }));
    expect(withSearch).toHaveLength(5);
    expect(withSearch.filter((s) => /search/i.test(s) && /verse/i.test(s))).toHaveLength(1);
  });

  it('each line is short (one or two sentences, under 110 characters)', () => {
    for (const s of lines(guide({ canSearch: true }))) {
      expect(s.length, s).toBeLessThan(110);
      expect((s.match(/[.!?](\s|$)/g) || []).length, s).toBeLessThanOrEqual(2);
    }
  });

  it('names what the screen has: pinch or scroll to zoom, tap a thread, the gold ticks, Reset', () => {
    const text = lines(guide()).join(' ');
    expect(text).toMatch(/pinch or scroll to zoom/i);
    expect(text).toMatch(/tap a thread/i);
    expect(text).toMatch(/gold ticks?\b[^.]*\bVolumes\b/i);
    expect(text).toMatch(/\bReset\b/);
  });

  it("says what an arch's height means, once: the farther apart its verses, the taller (C22, w3 review)", () => {
    const text = lines(guide()).join(' ');
    expect(text).toMatch(/farther apart[^.]*\btaller\b[^.]*\barch\b/i);
    expect(text.match(/\btaller\b/gi)).toHaveLength(1);
  });

  it('says what votes are, once, in plain words', () => {
    const text = lines(guide()).join(' ');
    expect(text).toMatch(/readers’ votes for how strong the link is/);
    expect(text.match(/\bvotes\b/g)).toHaveLength(2);
  });

  it('claims no control the screen lacks: no "+" to zoom, no ruler on the left, no bar to jump (item 23)', () => {
    const text = lines(guide({ canSearch: true })).join(' ');
    expect(text).not.toMatch(/\+/);
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

  it('the footer carries the OpenBible.info credit, the data\'s own line when it has one (Q5)', () => {
    let foot = guide().querySelector('.sw-guide-foot');
    expect(foot && foot.textContent).toBe(WEB_CREDIT);
    expect(WEB_CREDIT).toBe('Cross-reference data © OpenBible.info (CC-BY)');
    cleanup();
    foot = guide({ credit: 'Cross-reference data from OpenBible.info' }).querySelector('.sw-guide-foot');
    expect(foot.textContent).toBe('Cross-reference data from OpenBible.info');
  });
});

describe('the guide reads in browse mode (w4 quality hunt)', () => {
  // the screen's root is role="application": the card's words sit in a document inside the
  // dialog, so NVDA and JAWS read them with the virtual cursor
  it('its title, lines and credit sit in a role="document" region; Got it stays outside it', () => {
    const card = guide({ canSearch: true });
    const doc = card.querySelector('[role="document"]');
    expect(doc).not.toBeNull();
    expect(doc.querySelector('.sw-guide-title')).not.toBeNull();
    expect(doc.querySelectorAll('li').length).toBe(5);
    expect(doc.querySelector('.sw-guide-foot').textContent).toBe(WEB_CREDIT);
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
    expect(rule('.sw-guide-body strong')).toMatch(/color:\s*var\(--sw-gold\)/);
    expect(rule('.sw-guide-foot')).toMatch(/color:\s*var\(--sw-text-muted\)/);
  });

  it('reads at 13 px or more', () => {
    for (const sel of ['.sw-guide-title', '.sw-guide-body', '.sw-guide-foot']) {
      const m = /font-size:\s*var\(--fsc?-(\d+)\)/.exec(rule(sel));
      expect(m, sel).toBeTruthy();
      expect(Number(m[1]), sel).toBeGreaterThanOrEqual(13);
    }
  });
});
