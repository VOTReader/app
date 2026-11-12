/* TabSnapDrawer (TABS6): which tabs are drawn off screen, and the route deps they are drawn from. */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { bgRouteDeps, canDrawInBackground, bgReading } from './TabSnapDrawer.jsx';

beforeAll(() => {
  /** @type {any} */ (globalThis).READING_SCREENS = new Set(['bible-ch', 'vot-one-letter', 'hm-letter', 'answers-entry', 'garden-view']);
  /** @type {any} */ (globalThis).COL_BY_LETTER_SC = new Map();
});

describe('canDrawInBackground', () => {
  it('draws the reading screens and the plain lists, never a screen with app-wide side effects', () => {
    for (const s of ['bible-ch', 'vot-one-letter', 'hm-letter', 'answers-entry', 'home', 'history', 'library']) expect(canDrawInBackground({ screen: s })).toBe(true);
    for (const s of ['settings', 'search', 'journal-editor', 'about', 'scripture-web', 'garden-view', 'audio-library']) expect(canDrawInBackground({ screen: s })).toBe(false);
    expect(bgReading('garden-view')).toBe(false);
  });
});

describe('bgRouteDeps', () => {
  it('takes the tab\'s fields, turns every action into a no-op and keeps the readers', () => {
    const setScreen = vi.fn(); const goHome = vi.fn(); const markRead = vi.fn();
    const isRead = vi.fn(() => true);
    const deps = { screen: 'home', bookId: null, chapterNum: null, letterId: 'x', setScreen, goHome, markRead, isRead,
      backHint: { label: 'Back' }, backActive: true, settings: { a: 1 }, bcvPrevBook: { id: 'gen' } };
    const out = bgRouteDeps(deps, { screen: 'bible-ch', bookId: 'john', chapterNum: 12, letterId: null });
    expect(out.screen).toBe('bible-ch'); expect(out.bookId).toBe('john'); expect(out.chapterNum).toBe(12); expect(out.letterId).toBeNull();
    out.setScreen('x'); out.goHome(); out.markRead('a', 'b');
    expect(setScreen).not.toHaveBeenCalled(); expect(goHome).not.toHaveBeenCalled(); expect(markRead).not.toHaveBeenCalled();
    expect(out.isRead).toBe(isRead);
    expect(out.settings).toBe(deps.settings);
    expect(out.backHint).toBeNull(); expect(out.backActive).toBe(false); expect(out.bcvPrevBook).toBeNull();
    expect(deps.screen).toBe('home');   // the app's own deps are untouched
  });
});
