/* v2 Settings > Text and theme (mw11, design dz16 7g) and its Reading font list: the Aa sheet's controls as a page with
   main's preview sentence, the font row's words, main's 25 fonts in main's order each named in its own face, a pick kept
   in main's fontStyle (with its touched mark) and shown as --font-read; v2's EB Garamond while main's saved font is only
   its untouched 'classic' default; the 7g gate writing nothing. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App } from '../App.jsx';
import { defineStart } from '../places.js';
import { readingFontOf, fontCss, fontRowWords, fontRows, applyReadingFont, DEFAULT_FONT } from '../reading-font.js';
import { READING_FONTS } from '../../utils/reading-fonts.js';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });

function fakeStore(settings = {}) {
  const store = { st: { settings }, isReady: () => true, get: () => store.st, set: vi.fn((s) => { store.st = s; }) };
  return store;
}
const undo = [];
afterEach(() => {
  cleanup();
  while (undo.length) undo.pop()();
  delete html.dataset.gate;
  html.style.removeProperty('--font-read');
  html.style.removeProperty('--text-scale');
  delete g.StateStore;
});
const TEXT = [{ place: 'home' }, { place: 'settings' }, { place: 'settings/text' }];
const boot = (stack, settings) => {
  g.StateStore = fakeStore(settings);
  undo.push(defineStart(() => stack));
  return render(<V2App gateId={null} />);
};
const fontRow = (c) => [...c.querySelectorAll('.settings.aax .srow')].find((r) => r.querySelector('.t').textContent === 'Reading font');

describe('reading-font.js', () => {
  it("v2's EB Garamond unless the reader chose a font: main's untouched 'classic' default does not count", () => {
    expect(readingFontOf({})).toBe(DEFAULT_FONT);
    expect(readingFontOf({ fontStyle: 'classic' })).toBe('modern');
    expect(readingFontOf({ fontStyle: 'classic', touched: { fontStyle: true } })).toBe('classic');
    expect(readingFontOf({ fontStyle: 'cardo' })).toBe('cardo');
    expect(readingFontOf({ fontStyle: 'a-font-from-a-newer-app' })).toBe('modern');
    expect(fontCss('classic')).toBe('serif');
    expect(fontCss('cardo')).toBe("'Cardo', serif");
    expect(fontRowWords('modern')).toBe('EB Garamond · the app’s own');
    expect(fontRowWords('cardo')).toBe('Cardo');
  });

  it("main's 25 fonts in main's order; EB Garamond is the app's own", () => {
    const rows = fontRows();
    expect(rows.map((r) => r.id)).toEqual(READING_FONTS.map((f) => f.id));
    expect(rows.length).toBe(25);
    expect(rows.find((r) => r.id === 'modern').sub).toBe('The app’s own');
    applyReadingFont('lexend');
    expect(html.style.getPropertyValue('--font-read')).toBe("'Lexend', sans-serif");
    applyReadingFont('modern');
    expect(html.style.getPropertyValue('--font-read')).toBe('');
  });
});

describe('Settings > Text and theme', () => {
  it("the Aa sheet's controls as a page (no title row, no Done), main's preview under Text size, the font row", async () => {
    const { container } = boot(TEXT, {});
    await waitFor(() => expect(container.querySelector('.aa.pg')).not.toBe(null));
    expect(container.querySelector('h1').textContent).toBe('Text and theme');
    expect(container.querySelector('.tb .title').textContent).toBe('Settings');
    expect(container.querySelector('.aa.pg .sh')).toBe(null);
    expect(container.querySelector('.aa.pg .done')).toBe(null);
    expect([...container.querySelectorAll('.aa.pg .aa-k')].map((k) => k.textContent)).toEqual(['Text size', 'Page', 'Line spacing']);
    const pv = container.querySelector('.aa.pg .size + .aa-pv');
    expect(pv.textContent).toBe('“Your word is a lamp to my feet and a light to my path.”');
    expect(fontRow(container).querySelector('.s').textContent).toBe('EB Garamond · the app’s own');
    // a change shows at once and is kept, as the sheet's
    await click(container.querySelector('.sz-a.l'));
    expect(html.style.getPropertyValue('--text-scale')).toBe('1.3');
    await click([...container.querySelectorAll('.looks .look')].find((l) => l.textContent.includes('Paper')));
    expect(html.getAttribute('data-page')).toBe('paper');
    expect(g.StateStore.set).toHaveBeenCalled();
  });

  it("the font list: each name in its face; a pick keeps main's fontStyle (touched), shows at once, goes back", async () => {
    const { container } = boot(TEXT, { fontStyle: 'classic' });
    await waitFor(() => expect(fontRow(container)).not.toBe(undefined));
    expect(html.style.getPropertyValue('--font-read')).toBe('');
    await click(fontRow(container));
    await waitFor(() => expect(container.querySelector('.opts.fnt')).not.toBe(null));
    expect(container.querySelector('h1').textContent).toBe('Reading font');
    expect(container.querySelector('.tb .title').textContent).toBe('Text and theme');
    const rows = [...container.querySelectorAll('.opts.fnt .srow')];
    expect(rows.length).toBe(25);
    expect(rows.filter((r) => r.getAttribute('aria-checked') === 'true').map((r) => r.querySelector('.t').textContent)).toEqual(['EB Garamond']);
    const cardo = rows.find((r) => r.querySelector('.t').textContent === 'Cardo');
    expect(/** @type {HTMLElement} */ (cardo.querySelector('.t')).style.fontFamily).toBe('"Cardo", serif');
    await click(cardo);
    expect(g.StateStore.st.settings).toMatchObject({ fontStyle: 'cardo', touched: { fontStyle: true } });
    await waitFor(() => expect(container.querySelector('h1').textContent).toBe('Text and theme'));
    expect(fontRow(container).querySelector('.s').textContent).toBe('Cardo');
    expect(html.style.getPropertyValue('--font-read')).toBe("'Cardo', serif");
  });

  it("a reader who chose System Serif in main keeps it", async () => {
    const { container } = boot(TEXT, { fontStyle: 'classic', touched: { fontStyle: true } });
    await waitFor(() => expect(fontRow(container)).not.toBe(undefined));
    expect(fontRow(container).querySelector('.s').textContent).toBe('System Serif');
    expect(html.style.getPropertyValue('--font-read')).toBe('serif');
  });

  it('7g: the gate draws the page and writes nothing', async () => {
    g.StateStore = fakeStore({ fontStyle: 'cardo' });
    const { container } = render(<V2App gateId="7g-text-theme" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(fontRow(container).querySelector('.s').textContent).toBe('EB Garamond · the app’s own');
    expect(html.style.getPropertyValue('--font-read')).toBe('');
    await click(fontRow(container));
    await waitFor(() => expect(container.querySelector('.opts.fnt')).not.toBe(null));
    await click(container.querySelectorAll('.opts.fnt .srow')[3]);
    expect(g.StateStore.set).not.toHaveBeenCalled();
  });
});
