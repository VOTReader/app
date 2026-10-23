/* The Scripture Web's waiting and failing states (digest items 18, 24; spec 4.1; w3 panel step 2).
 * ═══════════════════════════════════════════════════════════════════════
 *   - while the web is woven, Back is there (the loader is under the topbar)
 *   - a load that fails says so once, in plain words, and offers Try again AND a way back: the
 *     error panel replaced the whole screen, so before this the only way out was the system back
 *     (item 24). The raw message used to sit small beneath the words and only said them again
 *     ("Couldn’t fetch the cross-reference data." under "The cross-reference data didn’t
 *     arrive."), or said them in a programmer's words; w4 took it off the page (it stays on the
 *     panel's data-detail, for a bug report).
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import { ScriptureWebScreen } from './ScriptureWebScreen.jsx';
import { loadErrorPanel } from '../scripture-web/panels.jsx';
import { loadErrorWords } from '../../utils/scripture-web/describe.js';

const baseProps = () => ({
  navigateToLink: vi.fn(), onBack: vi.fn(),
  settings: { webDensity: 'famous', swGuideSeen: true }, updateSetting: vi.fn(),
});
const FETCH_FAILED = 'Couldn’t fetch the cross-reference data.';

describe('the load error (item 24)', () => {
  beforeEach(() => {
    vi.stubGlobal('matchMedia', vi.fn((q) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })));
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    delete window.SCRIPTURE_WEB_DATA;
  });

  it('a fetch that failed is told as the connection, in plain words', () => {
    expect(loadErrorWords(FETCH_FAILED)).toBe('The cross-reference data didn’t arrive. Check your connection, then try again.');
  });

  it('anything else is told plainly too, never as the raw message', () => {
    const raw = 'Cannot read properties of undefined (reading \'length\')';
    const words = loadErrorWords(raw);
    expect(words).toBe('Something went wrong while the web was being drawn. Try again, or go back and come in again.');
    expect(words).not.toContain(raw);
    const { container } = render(loadErrorPanel(raw, vi.fn(), vi.fn()));
    expect(container.textContent, 'no programmer’s words on the page').not.toContain(raw);
  });

  it('the panel says it once: the title, the plain words, Try again and Back (w4: no second line saying the first again)', () => {
    const onRetry = vi.fn();
    const onBack = vi.fn();
    const { container } = render(loadErrorPanel(FETCH_FAILED, onRetry, onBack));
    const panel = container.querySelector('.sw-fallback');
    expect(panel.querySelector('.sw-fallback-title').textContent).toBe('The Scripture Web couldn’t load.');
    expect(panel.querySelector('.sw-fallback-body').textContent).toBe(loadErrorWords(FETCH_FAILED));
    // the raw message is not on the page: it only said the plain words again
    expect(panel.querySelector('.sw-fallback-detail')).toBeNull();
    expect(panel.textContent).not.toContain(FETCH_FAILED);
    expect(panel.getAttribute('data-detail')).toBe(FETCH_FAILED);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back.className).toMatch(/\bsw-fallback-back\b/);
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  /* w4 review: on the phone the loader's Back is the compact topbar's 40 px, and the error page's
     was 44, so Back grew when the load failed: the error page carried no .sw-compact. */
  it('on a phone the error page is compact, and its Back is the 40 px the loader\'s Back is', () => {
    const { container } = render(loadErrorPanel(FETCH_FAILED, vi.fn(), vi.fn(), true));
    expect(container.querySelector('.sw-fallback').classList.contains('sw-compact')).toBe(true);
    cleanup();
    const pc = render(loadErrorPanel(FETCH_FAILED, vi.fn(), vi.fn()));
    expect(pc.container.querySelector('.sw-fallback').classList.contains('sw-compact')).toBe(false);
    // its 40 px: panel-css.test.js reads the rule
  });

  it('the screen: a failed load offers Back, and Back leaves the web', async () => {
    // truthy (ensureScriptureWebData's fast path) but undecodable: a real load failure
    window.SCRIPTURE_WEB_DATA = { count: 0 };
    const props = baseProps();
    render(<ScriptureWebScreen {...props} />);
    expect(await screen.findByText('The Scripture Web couldn’t load.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(props.onBack).toHaveBeenCalledTimes(1);
  });

  it('while the web is woven, Back is there with the loader', async () => {
    // no data and a script that never arrives: the screen waits on the loader
    const { container } = render(<ScriptureWebScreen {...baseProps()} />);
    await act(async () => { await Promise.resolve(); });
    expect(container.querySelector('.sw-loading'), 'the loader').toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });

  /* w4: on a first visit the how-to-read card opened over the loader and hid "Weaving the web…"
     (the s11 shot): a card about a web that is not there yet, over the one line saying it is
     coming. The card waits for the web; the loader and Back show alone until then. */
  it('on a first visit the guide waits for the web: the loader and Back show, the card does not', async () => {
    const { container } = render(<ScriptureWebScreen {...baseProps()} settings={{ webDensity: 'famous' }} />);
    await act(async () => { await Promise.resolve(); });
    expect(container.querySelector('.sw-loading'), 'the loader').toBeTruthy();
    expect(container.querySelector('.sw-guide'), 'no card over the loader').toBeNull();
    expect(screen.getByRole('button', { name: 'Back' })).toBeTruthy();
  });

  /* w4 review: with the card waiting for the web, a ? pressed during the load showed nothing, and
     once the web arrived the card opened late and unasked. The ? waits for the web as the card does. */
  it('while the web is woven there is no ? to press, so no card can open late and unasked', async () => {
    const { container } = render(<ScriptureWebScreen {...baseProps()} />);
    await act(async () => { await Promise.resolve(); });
    expect(container.querySelector('.sw-loading'), 'the loader').toBeTruthy();
    expect(screen.queryByRole('button', { name: /how to read this web/i })).toBeNull();
    expect(container.querySelector('.sw-guide-btn')).toBeNull();
  });

  it('while the web is woven there is no density control to name a count it does not have yet', async () => {
    render(<ScriptureWebScreen {...baseProps()} />);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByLabelText('Connection density')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Filters' }), 'the Filters entry waits for the web').toBeNull();
  });
});
