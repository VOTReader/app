/* v2 Text and theme (mw5 1c; picture 1c-aa-sheet, design dz12): six text steps over main's fontScale (nearest by ratio),
   Slate / Paper / Black over main's theme (+ trueBlack), Relaxed lines, shown on <html> at once and kept in main's
   vot-state; the gate boot draws the sheet and writes nothing. */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup, waitFor, act, fireEvent } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { V2App } from './App.jsx';
import { TEXT_STEPS, stepOf, lookOf, stateFor, sizeWord, applyLook, saveLook } from './look.js';
import { readFacts, settingsRows } from './settings-facts.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });

const LETTERS = [
  { id: 'chosen-by-god', num: 1, title: 'Chosen by God', date: '8/31/04',
    blocks: [{ type: 'para', segments: [{ t: 'text', v: 'Many things.' }] }] },
];

beforeEach(() => {
  g.COL_BY_KEY = new Map([['one', { volKey: 'one', label: 'Volume One', globalName: 'LETTERS_V1' }]]);
  g.LETTERS_V1 = LETTERS;
  g.ReactDOM = ReactDOM;
  const meta = document.createElement('meta');
  meta.name = 'theme-color';
  meta.content = '#172022';
  document.head.appendChild(meta);
});
afterEach(() => {
  cleanup();
  for (const k of ['COL_BY_KEY', 'LETTERS_V1', 'ReactDOM', 'StateStore', 'PlatformBridge']) delete g[k];
  delete html.dataset.gate;
  html.removeAttribute('data-page');
  html.removeAttribute('data-lines');
  html.style.removeProperty('--text-scale');
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('look.js', () => {
  it("a stored size shows on the nearest step by ratio; main's '1 = standard' read as is", () => {
    expect(TEXT_STEPS).toEqual([0.8, 0.9, 1, 1.3, 1.75, 2.4]);
    expect(TEXT_STEPS.map(stepOf)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(stepOf('1.15')).toBe(3);    // ln(1.3/1.15) .123 < ln(1.15/1) .140
    expect(stepOf(1.12)).toBe(2);
    expect(stepOf(3)).toBe(5);         // main's 300 % cap -> the top dot
    expect(stepOf(0.5)).toBe(0);
    expect(stepOf(undefined)).toBe(2);
    expect(stepOf('x')).toBe(2);
    expect(sizeWord(1)).toBe('standard');
    expect(sizeWord(0.9)).toBe('smaller');
    expect(sizeWord(1.75)).toBe('larger');
  });

  it("the page and lines main's state says: light = Paper, dark + trueBlack = Black, else Slate; lineSpacing 'relaxed'", () => {
    expect(lookOf(null)).toEqual({ scale: 1, page: 'slate', lines: 'comfortable' });
    expect(lookOf({ theme: 'light', settings: { fontScale: '1.3', trueBlack: true } })).toEqual({ scale: 1.3, page: 'paper', lines: 'comfortable' });
    expect(lookOf({ theme: 'dark', settings: { trueBlack: true, lineSpacing: 'relaxed' } })).toEqual({ scale: 1, page: 'black', lines: 'relaxed' });
    expect(stateFor({ scale: 1.75, page: 'black', lines: 'relaxed' }))
      .toEqual({ theme: 'dark', settings: { fontScale: '1.75', trueBlack: true, lineSpacing: 'relaxed' } });
    expect(stateFor({ scale: 1, page: 'paper', lines: 'comfortable' }).theme).toBe('light');
  });

  it("keeps a look in main's vot-state: the whole state kept, fontScale as main's string, changed keys touched", () => {
    const state = { theme: 'dark', tabs: [{ id: 't1' }], readItems: { a: 1 },
      settings: { fontScale: '1.15', translation: 'kjv', touched: { translation: true } } };
    const store = { isReady: () => true, get: () => state, set: vi.fn() };
    expect(saveLook({ scale: 1.15, page: 'slate', lines: 'comfortable' }, { StateStore: store })).toBe(true);   // the new keys only
    store.set.mockClear();
    state.settings.trueBlack = false;
    state.settings.lineSpacing = 'comfortable';
    expect(saveLook({ scale: 1.15, page: 'slate', lines: 'comfortable' }, { StateStore: store })).toBe(false);   // nothing changed
    expect(store.set).not.toHaveBeenCalled();
    expect(saveLook({ scale: 1.3, page: 'paper', lines: 'relaxed' }, { StateStore: store })).toBe(true);
    expect(store.set).toHaveBeenCalledWith({ theme: 'light', tabs: [{ id: 't1' }], readItems: { a: 1 },
      settings: { fontScale: '1.3', translation: 'kjv', trueBlack: false, lineSpacing: 'relaxed',
        touched: { translation: true, fontScale: true, lineSpacing: true } } });
    expect(saveLook({ scale: 1, page: 'slate', lines: 'comfortable' }, { StateStore: { ...store, isReady: () => false } })).toBe(false);
    expect(saveLook({ scale: 1, page: 'slate', lines: 'comfortable' }, {})).toBe(false);
  });

  it('shows a look on <html>: data-page, data-lines, --text-scale (the step), the window colour, and the bar icons on Android', () => {
    const bridge = { setLightStatusBar: vi.fn() };
    applyLook({ scale: 1.2, page: 'paper', lines: 'relaxed' }, { bridge });
    expect(html.getAttribute('data-page')).toBe('paper');
    expect(html.getAttribute('data-lines')).toBe('relaxed');
    expect(html.style.getPropertyValue('--text-scale')).toBe('1.3');
    expect(document.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe('#F2EDE2');
    expect(bridge.setLightStatusBar).toHaveBeenCalledWith(true);
    expect(document.body.classList.contains('light')).toBe(true);
    applyLook({ scale: 1, page: 'slate', lines: 'comfortable' }, { bridge: null });
    expect(html.hasAttribute('data-page')).toBe(false);
    expect(html.hasAttribute('data-lines')).toBe(false);
    expect(html.style.getPropertyValue('--text-scale')).toBe('');
    expect(document.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe('#172022');
    expect(document.body.classList.contains('light')).toBe(false);
  });
});

describe('the Text and theme sheet', () => {
  it('1c-aa-sheet: the letter at its top, the sheet open: step 3 of 6, Slate, Comfortable; then data-gate=ready', async () => {
    const { container, getByRole } = render(<V2App gateId="1c-aa-sheet" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    const sheet = getByRole('dialog', { name: 'Text and theme' });
    expect(sheet.className).toBe('sheet aa');
    expect(sheet.parentElement.className).toBe('v2-layer');
    expect([...sheet.querySelectorAll('.steps i')].map((i) => i.className)).toEqual(['lit', 'lit', 'on', '', '', '']);
    expect(sheet.querySelector('.look.on').textContent).toBe('AaSlate');   // the swatch's Aa, then the name
    expect(sheet.querySelector('.seg .on').textContent).toBe('Comfortable');
    expect(container.querySelector('h1').textContent).toBe('Chosen by God');
    expect(html.hasAttribute('data-page')).toBe(false);
  });

  it("a real boot shows the reader's saved page, lines and size from the first paint; Settings says them", () => {
    g.StateStore = { isReady: () => true, get: () => ({ theme: 'dark', settings: { trueBlack: true, lineSpacing: 'relaxed', fontScale: '2' } }), set: vi.fn() };
    render(<V2App gateId={null} />);
    expect(html.getAttribute('data-page')).toBe('black');
    expect(html.getAttribute('data-lines')).toBe('relaxed');
    expect(html.style.getPropertyValue('--text-scale')).toBe('1.75');
    expect(document.querySelector('meta[name="theme-color"]').getAttribute('content')).toBe('#000000');
    expect(g.StateStore.set).not.toHaveBeenCalled();
    const facts = readFacts({ trueBlack: true, lineSpacing: 'relaxed', fontScale: '2' }, { theme: 'dark' });
    expect(settingsRows(facts)[0].sub).toBe('Larger size · Black · relaxed lines');
    expect(settingsRows(readFacts({}, { theme: 'light' }))[0].sub).toBe('Standard size · Paper · comfortable lines');
  });

  it('a gate boot shows each change and writes nothing; Done closes', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    g.StateStore = { isReady: () => true, get: vi.fn(() => ({})), update: vi.fn(), set: vi.fn() };
    const { getByRole, container } = render(<V2App gateId="1c-aa-sheet" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    const sheet = getByRole('dialog');
    click([...sheet.querySelectorAll('.look')].find((l) => l.textContent === 'AaBlack'));
    expect(html.getAttribute('data-page')).toBe('black');
    click(sheet.querySelector('.sz-a.l'));
    expect(html.style.getPropertyValue('--text-scale')).toBe('1.3');
    expect(setItem).not.toHaveBeenCalled();
    expect(g.StateStore.update).not.toHaveBeenCalled();
    expect(g.StateStore.set).not.toHaveBeenCalled();
    click(sheet.querySelector('.done'));
    expect(container.querySelector('[role="dialog"]')).toBe(null);
  });

  it("the letter's Aa opens it; Escape and Android Back close it before the page goes", async () => {
    const { container } = render(<V2App gateId="1a-letter" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    click(container.querySelector('.tb button[aria-label="Text and theme"]'));
    expect(container.ownerDocument.querySelector('[role="dialog"][aria-label="Text and theme"]')).not.toBe(null);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(container.ownerDocument.querySelector('[role="dialog"]')).toBe(null);
    click(container.querySelector('.tb button[aria-label="Text and theme"]'));
    let r;
    act(() => { r = g.handleAndroidBack(); });
    expect(r).toBe('true');
    expect(container.ownerDocument.querySelector('[role="dialog"]')).toBe(null);
    expect(container.querySelector('h1').textContent).toBe('Chosen by God');
  });

  it('the size: A- and A+ step, the track takes the nearest dot, the ends stop; keys move it', async () => {
    const { getByRole } = render(<V2App gateId="1c-aa-sheet" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    const sheet = getByRole('dialog');
    const steps = sheet.querySelector('.steps');
    vi.spyOn(steps, 'getBoundingClientRect').mockReturnValue(/** @type {any} */ ({ left: 100, width: 250, top: 0, height: 24 }));
    act(() => { fireEvent.click(steps, { clientX: 100 + 250 * 0.82 }); });   // nearest of 0..5 at 4.1 -> dot 5 (index 4)
    expect(steps.getAttribute('aria-valuenow')).toBe('5');
    expect(html.style.getPropertyValue('--text-scale')).toBe('1.75');
    click(sheet.querySelector('.sz-a.l'));
    expect(steps.getAttribute('aria-valuenow')).toBe('6');
    expect(/** @type {HTMLButtonElement} */ (sheet.querySelector('.sz-a.l')).disabled).toBe(true);
    fireEvent.keyDown(steps, { key: 'ArrowLeft' });
    fireEvent.keyDown(steps, { key: 'ArrowLeft' });
    expect(steps.getAttribute('aria-valuenow')).toBe('4');
    expect(html.style.getPropertyValue('--text-scale')).toBe('1.3');
  });
});
