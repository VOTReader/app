// @ts-nocheck -- classic-script chrome globals are stubbed per test, as in WtlbEntryView.peek.test.jsx
/* format-b-dom-text — the projection that lets WTLB paint clauses.
 *
 * Format B read-along painted whole paragraphs because nothing could say where
 * a corpus offset lands in the DOM: the renderer strips emphasis markers, drops
 * every soft line break, and rewrites each scripture reference into a footnote
 * number or a parenthesised cite depending on the route. This module replays
 * those rules — and, exactly like segment-dom-text.test.js, the contract is
 * asserted against a REAL render rather than a second copy of the rules.
 *
 * The corpus sweep at the bottom is the one that decides whether this ships.
 * 365 entries would go out on this projection in a single batch; a rule that is
 * right on hand-picked cases and wrong on a paragraph nobody thought of would
 * paint 365 items of confidently wrong highlight. So it runs every Format B
 * paragraph in the corpus through a live render, in BOTH footnote modes, and
 * demands exact equality. */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as ReactDOM from 'react-dom';
import { render, cleanup } from '@testing-library/react';
import { readFileSync } from 'fs';
import { runInNewContext } from 'vm';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { formatBDomText, formatBOffsetMap } from './format-b-dom-text.js';
import { WtlbEntryView } from '../ui/screens/WtlbEntryView.jsx';
import { wtlbHlKey } from './hl-keys.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = resolve(HERE, '..', 'data');

afterEach(cleanup);

/** The pre-scan WtlbEntryView does before rendering: which refs get numbers. */
function refAnalysis(paragraphs, footnotesMode) {
  const perParagraph = [];
  const refNumMap = {};
  let num = 0;
  paragraphs.forEach((p) => {
    const arr = [];
    const re = /\{\{ref:([^}]+)\}\}/g;
    let m;
    while ((m = re.exec(p.text)) !== null) {
      const ref = m[1].trim();
      const after = p.text.slice(m.index + m[0].length);
      const stripped = after.replace(/\{\{(?:ref|nav):[^}]+\}\}/g, '');
      const trailing = !/\w/.test(stripped) && !/\{\{(?:ref|nav):/.test(after);
      let n = null;
      if (footnotesMode && !trailing) {
        if (!(ref in refNumMap)) { num++; refNumMap[ref] = num; }
        n = refNumMap[ref];
      }
      arr.push({ ref, trailing, num: n });
    }
    perParagraph.push(arr);
  });
  return perParagraph;
}

/* WtlbEntryView reads its chrome as classic-script globals (ui/_entry-d.js
   publishes them), so the harness installs them the way WtlbEntryView.peek's
   does -- except ScreenLayout renders its CHILDREN here, because the paragraph
   markup is the entire point. */
beforeEach(() => {
  globalThis.ReactDOM = ReactDOM;
  globalThis.ScreenLayout = ({ children }) => React.createElement('div', null, children);
  globalThis.StickyChapterNav = () => null;
  globalThis.HomeBtn = () => null;
  globalThis.NavButtons = () => null;
  globalThis.LibraryNav = () => null;
  globalThis.useMarkAsRead = () => {};
  globalThis.useModalRegistry = () => {};
  globalThis.WTLB_PART_LABELS = {};
  globalThis.WTLB_SCRIPTURES = {};
  globalThis.COL_BY_KEY = new Map();
  globalThis.colPreface = () => null;
  globalThis.wtlbHlKey = wtlbHlKey;
  globalThis.ExpandableVerse = () => null;
  globalThis.GoToRefButton = () => null;
  globalThis.ScriptureVerseText = () => null;
  globalThis.lookupVersesFromBooks = () => null;
  globalThis.StaticSubtree = ({ children }) => React.createElement(React.Fragment, null, children);
  globalThis.AudioPlayer = { hasAudio: () => false, prewarm() {}, subscribe: () => () => {}, getVersion: () => 0, getState: () => ({ queue: [], qi: 0, status: 'idle', time: 0 }) };
  window.navHandoff = { peek: () => null, clear: () => {} };
});

/** Render a real entry and hand back each paragraph's live textContent. */
function renderedParagraphs(entry, footnotesMode) {
  const { container } = render(
    React.createElement(WtlbEntryView, {
      entry,
      volKey: 'wtlb1',
      footnotesMode,
      onInAppLink() {},
      onNavToChapter() {},
      onBack() {},
      onIndex() {},
      onSearch() {},
      onSettings() {},
      onHistory() {},
      onThemeChange() {},
      theme: 'dark',
    }),
  );
  return [...container.querySelectorAll('p[data-hl-key]')].map((el) => el.textContent);
}

describe('formatBDomText — the renderer\'s four rules', () => {
  it('drops a soft line break, which is the corpus-wide dominant shift', () => {
    expect(formatBDomText('Two lines\nin one paragraph')).toBe('Two linesin one paragraph');
  });

  it('strips emphasis markers', () => {
    expect(formatBDomText('a **bold** and _quiet_ word')).toBe('a bold and quiet word');
  });

  it('renders a numbered footnote reference as its number', () => {
    const refs = [{ ref: 'Matthew 4:4', trailing: false, num: 7 }];
    expect(formatBDomText('It is written {{ref:Matthew 4:4}} plainly.', { refs, footnotesMode: true }))
      .toBe('It is written 7 plainly.');
  });

  it('renders the same reference as a cite when footnotes are off', () => {
    const refs = [{ ref: 'Matthew 4:4', trailing: false, num: 7 }];
    expect(formatBDomText('It is written {{ref:Matthew 4:4}} plainly.', { refs, footnotesMode: false }))
      .toBe('It is written (Matthew 4:4) plainly.');
  });

  it('renders a trailing reference as a cite even in footnotes mode', () => {
    const refs = [{ ref: 'Matthew 4:4', trailing: true, num: null }];
    expect(formatBDomText('So it is said. {{ref:Matthew 4:4}}', { refs, footnotesMode: true }))
      .toBe('So it is said. (Matthew 4:4)');
  });

  it('renders a nav link as the book title, which depends on load order', () => {
    const raw = 'see {{nav:songofsolomon:3}} for this';
    expect(formatBDomText(raw, { bookTitle: () => 'Songofsolomon' })).toBe('see [Songofsolomon 3] for this');
    expect(formatBDomText(raw, { bookTitle: () => 'Song of Solomon' })).toBe('see [Song of Solomon 3] for this');
  });

  it('copies an attribution verbatim', () => {
    const raw = 'A line.\n[From "The Wide Path" ~ Volume One]';
    expect(formatBDomText(raw)).toBe('A line.[From "The Wide Path" ~ Volume One]');
  });
});

describe('formatBOffsetMap — a corpus span lands on the same words in the DOM', () => {
  const check = (raw, opts, phrase) => {
    const { text, toDom } = formatBOffsetMap(raw, opts);
    const cs = raw.indexOf(phrase);
    expect(cs).toBeGreaterThanOrEqual(0);
    return text.slice(toDom(cs), toDom(cs + phrase.length, true));
  };

  it('carries a span across a dropped line break', () => {
    expect(check('First line\nsecond line here.', {}, 'second line here.')).toBe('second line here.');
  });

  it('carries a span across stripped emphasis markers', () => {
    expect(check('Hear **this** and live well.', {}, 'and live well.')).toBe('and live well.');
  });

  it('carries a span that CONTAINS emphasis', () => {
    expect(check('Hear **this** and live.', {}, '**this** and live.')).toBe('this and live.');
  });

  it('carries a span across a reference rewritten to a number', () => {
    const refs = [{ ref: 'Matthew 4:4', trailing: false, num: 3 }];
    const raw = 'As written {{ref:Matthew 4:4}} so it stands.';
    expect(check(raw, { refs, footnotesMode: true }, 'so it stands.')).toBe('so it stands.');
  });

  it('carries a span across a reference rewritten to a longer cite', () => {
    const refs = [{ ref: 'Matthew 4:4', trailing: false, num: 3 }];
    const raw = 'As written {{ref:Matthew 4:4}} so it stands.';
    expect(check(raw, { refs, footnotesMode: false }, 'so it stands.')).toBe('so it stands.');
  });

  it('holds for a span in a paragraph with several breaks and markers', () => {
    const raw = 'One line\n**two** words\nand _three_ more here.\nThe end.';
    expect(check(raw, {}, 'The end.')).toBe('The end.');
    expect(check(raw, {}, 'and _three_ more here.')).toBe('and three more here.');
  });
});

/* ─────────────────────────────────────────────────────────────────────────
   THE SWEEP. Every Format B paragraph, both modes, against a live render.
   ───────────────────────────────────────────────────────────────────────── */
describe('THE CONTRACT — the projection equals what WtlbEntryView renders', () => {
  const ctx = {};
  for (const f of ['wtlb-one.js', 'wtlb-two.js', 'the-blessed.js']) {
    runInNewContext(readFileSync(resolve(DATA, f), 'utf8'), ctx, { filename: f });
  }
  const entries = [...(ctx.WTLB_ONE || []), ...(ctx.WTLB_TWO || []), ...(ctx.THE_BLESSED || [])].filter(Boolean);

  it.each([true, false])('matches every paragraph with footnotesMode=%s', (footnotesMode) => {
    const bad = [];
    let paragraphs = 0;
    for (const entry of entries) {
      const refs = refAnalysis(entry.paragraphs || [], footnotesMode);
      let live;
      try { live = renderedParagraphs(entry, footnotesMode); } catch (e) {
        bad.push(`${entry.id}: render threw ${String(e).slice(0, 80)}`);
        cleanup();
        continue;
      }
      (entry.paragraphs || []).forEach((p, pi) => {
        if (live[pi] == null) return;                 // paragraph rendered no anchor
        paragraphs++;
        const want = formatBDomText(p.text, { refs: refs[pi], footnotesMode });
        if (live[pi] !== want) {
          bad.push(`${entry.id} p${pi}\n    rendered: ${JSON.stringify(live[pi].slice(0, 90))}\n    projected: ${JSON.stringify(want.slice(0, 90))}`);
        }
      });
      cleanup();
    }
    expect(paragraphs).toBeGreaterThan(1200);         // the corpus really loaded
    expect(bad.slice(0, 6)).toEqual([]);
    expect(bad.length).toBe(0);
  });
});
