// @ts-nocheck -- node:fs reads app.jsx, which the browser typecheck has no types for
/* TabSnapDrawer (TABS6): which tabs are drawn off screen, and the route deps they are drawn from. */
import { describe, it, expect, vi, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bgRouteDeps, canDrawInBackground, bgReading, BG_READERS } from './TabSnapDrawer.jsx';

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

/** The keys of App's real route deps, read from app.jsx (the `_routeDeps = { ... }` literal). */
function appRouteDepKeys() {
  const src = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app.jsx'), 'utf8');
  const m = /const _routeDeps = \{([\s\S]*?)\}; const ROUTES/.exec(src);
  if (!m) throw new Error('app.jsx: _routeDeps literal not found');
  const body = m[1].replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');
  return body.split(',').map((s) => s.trim().split(':')[0].trim()).filter(Boolean);
}

describe('heart-5: a drawing keeps only the readers, named one by one', () => {
  const keys = appRouteDepKeys();
  it('reads the real deps (a parse that found nothing would pass vacuously)', () => {
    expect(keys.length).toBeGreaterThan(100);
    expect(keys).toContain('setScreen');
    expect(keys).toContain('isRead');
  });
  it('every reader named is one of App\'s route deps', () => {
    for (const k of BG_READERS) expect(keys, k).toContain(k);
  });
  it('every other function dep, whatever its name, is a no-op in the drawing', () => {
    const deps = Object.fromEntries(keys.map((k) => [k, vi.fn(() => 'ran')]));
    const out = bgRouteDeps(deps, { screen: 'bible-ch', bookId: 'john', chapterNum: 3 });
    for (const k of keys) {
      if (typeof out[k] !== 'function') continue;   // a tab field, or a value the drawing sets itself
      if (BG_READERS.has(k)) expect(out[k], k).toBe(deps[k]);
      else expect(out[k](), k).not.toBe('ran');
    }
    expect(deps.setScreen).not.toHaveBeenCalled();
  });
  it('a dep App adds later is inert until named a reader', () => {
    const out = bgRouteDeps({ playEverything: vi.fn(() => 'ran'), screen: 'home' }, { screen: 'home' });
    expect(out.playEverything()).toBeUndefined();
  });
  it('the drawn page raises no back pill from the active tab\'s stack', () => {
    const backAt = vi.fn(() => ({ backHint: { title: 'X' }, backActive: true }));
    const out = bgRouteDeps({ backAt, screen: 'home' }, { screen: 'bible-ch' });
    expect(out.backAt({})).toEqual({ backHint: null, backActive: false });
    expect(backAt).not.toHaveBeenCalled();
  });
});
