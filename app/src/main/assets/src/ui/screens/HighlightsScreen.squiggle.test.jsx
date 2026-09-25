// @ts-nocheck — free-var globals stubbed per test (bundle-g screen contract)
/* v05-04 — a squiggle is a mark. Squiggle shipped as the toolbar's third style
   (6705374f), but Highlights & Underlines kept only highlight | underline, so a
   plain squiggle could be found only in the reading text. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { normalizeExcerptDisplay } from '../../utils/excerpt-display.js';
import { HighlightsScreen, _collectMarks } from './HighlightsScreen.jsx';

const GLOBALS = ['ScreenLayout', 'LibraryNav', 'AnnotationStore', 'relativeDate', '_bookmarkSourceLabel', 'normalizeExcerptDisplay'];
const MARKS = {
  'bible:psalms:23:1': [{ id: 'a1', groupId: 'g1', kind: 'highlight', color: 'yellow', text: 'The Lord is my shepherd', created: 100 }],
  'bible:john:3:16': [{ id: 'a2', groupId: 'g2', kind: 'underline', color: 'blue', text: 'For God so loved the world', created: 200 }],
  'bible:john:11:35': [{ id: 'a3', groupId: 'g3', kind: 'squiggle', color: 'green', text: 'Jesus wept', created: 300 }],
  'bible:john:1:1': [{ id: 'a4', groupId: 'g4', kind: 'note', color: 'yellow', text: 'In the beginning', created: 400 }],
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

const show = () => render(<HighlightsScreen onBack={() => {}} onNavigateToSource={() => {}} theme="dark" onThemeChange={() => {}} />);
const rows = () => [...document.querySelectorAll('.hlx-row')];

describe('Highlights & Underlines — squiggles (v05-04)', () => {
  it('collects a squiggle as a mark, and still not a note', () => {
    expect(_collectMarks().map((m) => m.kind).sort()).toEqual(['highlight', 'squiggle', 'underline']);
  });

  it('lists the squiggle with its own label and a wavy swatch in its colour', () => {
    show();
    const row = rows().find((r) => r.textContent.includes('Jesus wept'));
    expect(row).toBeTruthy();
    expect(row.querySelector('.hlx-kind').textContent).toBe('Squiggle');
    expect(row.querySelector('.hlx-swatch').className).toContain('is-squiggle');
  });

  it('a Squiggles type chip shows only the squiggles', () => {
    show();
    const chip = [...document.querySelectorAll('.hlx-type-chip')].find((b) => b.textContent === 'Squiggles');
    expect(chip).toBeTruthy();
    fireEvent.click(chip);
    expect(rows().map((r) => r.querySelector('.hlx-text').textContent)).toEqual(['“Jesus wept”']);
  });
});
