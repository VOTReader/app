/* The Scripture Web's waiting and failing states (digest items 18, 24; spec 4.1; w3 panel step 2).
 * ═══════════════════════════════════════════════════════════════════════
 *   - while the web is woven, Back is there (the loader is under the topbar)
 *   - a load that fails says so in plain words, keeps the raw detail small beneath them, and
 *     offers Try again AND a way back: the error panel replaced the whole screen, so before
 *     this the only way out was the system back (item 24)
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
  });

  it('the panel: the title, the plain words, the detail beneath them, Try again and Back', () => {
    const onRetry = vi.fn();
    const onBack = vi.fn();
    const { container } = render(loadErrorPanel(FETCH_FAILED, onRetry, onBack));
    const panel = container.querySelector('.sw-fallback');
    expect(panel.querySelector('.sw-fallback-title').textContent).toBe('The Scripture Web couldn’t load.');
    expect(panel.querySelector('.sw-fallback-body').textContent).toBe(loadErrorWords(FETCH_FAILED));
    expect(panel.querySelector('.sw-fallback-detail').textContent).toBe(FETCH_FAILED);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    const back = screen.getByRole('button', { name: 'Back' });
    expect(back.className).toMatch(/\bsw-fallback-back\b/);
    fireEvent.click(back);
    expect(onBack).toHaveBeenCalledTimes(1);
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
});
