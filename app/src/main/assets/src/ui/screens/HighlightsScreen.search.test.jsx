// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* HighlightsScreen — the search box joins the other index searches (C2-C [C9]).
   ═══════════════════════════════════════════════════════════════════════
   Highlights once rendered its own `<input class="hlx-search" type="text">`: no platform clear
   affordance, no search keyboard, a private class, styled from a JS-injected stylesheet.
   Every library screen (Notes, Bookmarks, Links, History, Highlights) now draws the one
   search pill, ListSearch in LibraryList.jsx: a `.ui-field.lib-search` label around an
   `<input type="search">`. (The old shared .notes-index-search box and its rules are gone, arch-9.)

   These are also this screen's first tests (BACKLOG [D6] names the gap).
*/

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { normalizeExcerptDisplay } from '../../utils/excerpt-display.js';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { HighlightsScreen } from './HighlightsScreen.jsx';

const GLOBALS = ['ScreenLayout', 'LibraryNav', 'AnnotationStore', 'relativeDate',
  '_bookmarkSourceLabel'];

const MARKS = {
  'bible:psalms:23:1': [
    { id: 'a1', groupId: 'g1', kind: 'highlight', color: 'yellow', text: 'The Lord is my shepherd', created: 100, updated: 100 },
  ],
  'bible:john:3:16': [
    { id: 'a2', groupId: 'g2', kind: 'underline', color: 'blue', text: 'For God so loved the world', created: 200, updated: 200 },
  ],
};

beforeEach(() => {
  globalThis.ScreenLayout = ({ children, navChildren }) => (
    <div data-testid="screen-layout">{navChildren}{children}</div>
  );
  globalThis.LibraryNav = () => null;
  globalThis.relativeDate = () => '';
  // Cross-bundle: the screen ships in bundle-g (src/ui/_entry-g.js) and reads
  // this from the window slot bundle-d fills.
  globalThis.normalizeExcerptDisplay = normalizeExcerptDisplay;
  globalThis._bookmarkSourceLabel = (hlKey) => hlKey;
  globalThis.AnnotationStore = {
    subscribe: () => () => {}, getVersion: () => 0, all: () => MARKS,
  };
});

afterEach(() => {
  cleanup();
  GLOBALS.forEach((k) => { delete globalThis[k]; });
});

const show = () => render(
  <HighlightsScreen onBack={() => {}} onNavigateToSource={() => {}} theme="dark" onThemeChange={() => {}} />,
);

const box = () => document.querySelector('input[type="search"]');
const rows = () => [...document.querySelectorAll('.hlx-row .hlx-text')].map((el) => el.textContent);
const chip = (name) => [...document.querySelectorAll('.ui-chip')].find((b) => b.textContent === name);

/* The UI pass (mock v2 l-high): the shared search pill, the line "N highlights · Newest first", one chip row
   for the kinds by their one name each (Highlighter, Underline, Squiggle) and one for the colours in use. */
describe('HighlightsScreen — the list parts', () => {
  it('has the shared search pill, a real search field named by its words', () => {
    show();
    expect(box().getAttribute('type')).toBe('search');
    expect(box().getAttribute('aria-label')).toBe('Search highlights');
    expect(box().closest('.ui-field')).toBeTruthy();
  });

  it('still filters the marks it always filtered', () => {
    show();
    expect(rows()).toHaveLength(2);
    fireEvent.change(box(), { target: { value: 'shepherd' } });
    expect(rows()).toEqual(['The Lord is my shepherd']);
    expect(document.querySelector('.lib-qline-count').textContent).toBe('1 of 2 highlights');
    fireEvent.change(box(), { target: { value: '' } });
    expect(rows()).toHaveLength(2);
  });

  it('says its sort, and names the kinds and the colours in use', () => {
    show();
    expect(document.querySelector('.lib-qline .ui-tool').getAttribute('aria-label')).toBe('Sort: Newest first');
    const groups = [...document.querySelectorAll('.hlx-chips')].map((g) => [...g.querySelectorAll('.ui-chip')].map((c) => c.textContent));
    expect(groups).toEqual([['All', 'Highlighter', 'Underline', 'Squiggle'], ['Any colour', 'Yellow', 'Blue']]);
  });

  it('draws the words in their own mark', () => {
    show();
    const marks = [...document.querySelectorAll('.hlx-mark')];
    const byText = (t) => marks.find((m) => m.textContent === t);
    expect(byText('The Lord is my shepherd').style.background).toMatch(/rgba\(255, 215, 0, 0\.24\)/);
    expect(byText('For God so loved the world').style.textDecorationLine).toBe('underline');
  });

  it('injects no stylesheet of its own any more (its rules are in app.css)', () => {
    show();
    expect(document.getElementById('hlx-styles')).toBeNull();
  });
});

// s19.5 + s19.1 (n91, n188): the filters announce their state; an empty filtered list names the filter and offers Show all.
describe('HighlightsScreen — filters', () => {
  it('chips carry aria-pressed, and an empty result names the filter with Show all', () => {
    show();
    expect(chip('All').getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(chip('Squiggle'));
    expect(chip('Squiggle').getAttribute('aria-pressed')).toBe('true');
    expect(chip('All').getAttribute('aria-pressed')).toBe('false');
    expect(document.querySelector('.hlx-none-text').textContent).toBe('Nothing matches squiggles.');
    fireEvent.click(document.querySelector('.hlx-show-all'));
    expect(rows().length).toBe(2);
    fireEvent.change(box(), { target: { value: 'zzz' } });
    expect(document.querySelector('.hlx-none-text').textContent).toBe('Nothing matches “zzz” in highlights.');
  });

  it('with nothing marked: says how, with Start reading', () => {
    globalThis.AnnotationStore = { subscribe: () => () => {}, getVersion: () => 0, all: () => ({}) };
    let started = 0;
    render(<HighlightsScreen onBack={() => {}} onNavigateToSource={() => {}} onStartReading={() => { started++; }} />);
    expect(document.querySelector('.ui-empty-title').textContent).toBe('No highlights yet');
    expect(box()).toBeNull();
    fireEvent.click([...document.querySelectorAll('button')].find((b) => b.textContent === 'Start reading'));
    expect(started).toBe(1);
  });
});

/* Sweep W69: _collectMarks() walked, grouped and sorted the whole AnnotationStore into a fresh
   array per render, so both memos keyed on it missed, and the search and every row resolved each
   source label again. Now one walk and one label per mark per store version. */
describe('HighlightsScreen — large libraries', () => {
  it('walks the store and resolves each source label once per version, not per keystroke', () => {
    let walks = 0, resolves = 0;
    const many = {};
    for (let i = 0; i < 40; i++) many['bible:john:3:' + (i + 1)] = [{ id: 'x' + i, groupId: 'gx' + i, kind: 'highlight', color: 'yellow', text: 'word ' + i, created: i, updated: i }];
    globalThis.AnnotationStore = { subscribe: () => () => {}, getVersion: () => 0, all: () => { walks++; return many; } };
    globalThis._bookmarkSourceLabel = (hlKey) => { resolves++; return hlKey; };
    show();
    for (const q of ['w', 'wo', 'wor', 'word']) fireEvent.change(box(), { target: { value: q } });
    expect(rows().length).toBe(40);
    expect(walks).toBe(1);
    expect(resolves).toBe(40);
  });
});

/* i18n-text-n4 (audit 2026-11-23): the box filtered with a plain toLowerCase().indexOf, so "unigenito" showed
   "0 of 3 highlights" and only "unigénito" found the mark. */
describe('HighlightsScreen — accents', () => {
  it('a word typed without its accent finds the accented mark', () => {
    globalThis.AnnotationStore = { subscribe: () => () => {}, getVersion: () => 0, all: () => ({
      ...MARKS,
      'bible:john:3:16': [{ id: 'a3', groupId: 'g3', kind: 'highlight', color: 'yellow', text: 'ha dado a su Hijo unigénito', created: 300, updated: 300 }],
    }) };
    show();
    fireEvent.change(box(), { target: { value: 'unigenito' } });
    expect(rows()).toEqual(['ha dado a su Hijo unigénito']);
    fireEvent.change(box(), { target: { value: 'UNIGÉNITO' } });
    expect(rows()).toEqual(['ha dado a su Hijo unigénito']);
  });
});
