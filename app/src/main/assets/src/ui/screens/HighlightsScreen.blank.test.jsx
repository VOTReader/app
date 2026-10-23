// @ts-nocheck — free-var globals stubbed per test (bundle-g screen contract)
/* A06.4 (idea sweep 2026-10-22): a note made with "No color (icon only)" marks no text. Its mark is a 'blank'
   highlight that shows only the note icon, yet Highlights & Underlines listed it as a yellow "Highlight" (the
   swatch's yellow fallback) and counted it. It is a note (Notes lists it), not a mark the text shows, so the
   list leaves it out and the count matches the text. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { normalizeExcerptDisplay } from '../../utils/excerpt-display.js';
import { HighlightsScreen, _collectMarks } from './HighlightsScreen.jsx';

const GLOBALS = ['ScreenLayout', 'LibraryNav', 'AnnotationStore', 'relativeDate', '_bookmarkSourceLabel', 'normalizeExcerptDisplay'];
const MARKS = {
  'bible:psalms:23:1': [{ id: 'a1', groupId: 'g1', kind: 'highlight', color: 'yellow', text: 'The Lord is my shepherd', created: 100 }],
  'bible:john:3:16': [{ id: 'a2', groupId: 'g2', kind: 'highlight', color: 'blank', text: 'For God so loved the world', created: 200 }],
};

beforeEach(() => {
  globalThis.ScreenLayout = ({ children, navChildren }) => <div>{navChildren}{children}</div>;
  globalThis.LibraryNav = () => null;
  globalThis.relativeDate = () => '';
  globalThis.normalizeExcerptDisplay = normalizeExcerptDisplay;
  globalThis._bookmarkSourceLabel = (hlKey) => hlKey;
  globalThis.AnnotationStore = { subscribe: () => () => {}, getVersion: () => 0, all: () => MARKS };
});
afterEach(() => { cleanup(); GLOBALS.forEach((k) => { delete globalThis[k]; }); });

describe('Highlights & Underlines — a note with no colour (A06.4)', () => {
  it('is no mark: the list and its count hold only what the text shows', () => {
    expect(_collectMarks().map((m) => m.groupId)).toEqual(['g1']);
    render(<HighlightsScreen onBack={() => {}} onNavigateToSource={() => {}} theme="dark" onThemeChange={() => {}} />);
    const rows = [...document.querySelectorAll('.hlx-row')];
    expect(rows.map((r) => r.querySelector('.hlx-text').textContent)).toEqual(['“The Lord is my shepherd”']);
    expect(document.querySelector('.study-head-count').textContent).toBe('1 mark');
  });
});
