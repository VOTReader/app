/* TabActionSheet — bulk closes are confirm-gated.
   ─────────────────────────────────────────────────────────────────
   "Close other tabs" / "Close tabs to the right" close SEVERAL tabs at once
   with no undo snapshot (the single × close gets an Undo toast; these did
   not), yet they fired instantly on tap. Both now swap to a ConfirmStrip in
   place; the destructive callback fires only on "Yes". The REAL ConfirmStrip
   renders so the gate is non-vacuous. */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TabActionSheet } from './TabActionSheet.jsx';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';

/** @type {any} */ (globalThis).ConfirmStrip = ConfirmStrip;

afterEach(cleanup);

function renderSheet(overrides = {}) {
  const props = {
    idx: 1, total: 4, tab: null,
    onCloseOthers: vi.fn(), onCloseToRight: vi.fn(), onDismiss: vi.fn(),
    onRename: vi.fn(), onTogglePin: vi.fn(),
    ...overrides,
  };
  render(<TabActionSheet {...props} />);
  return props;
}

describe('TabActionSheet bulk-close confirm gates', () => {
  it('is exposed as a labelled modal dialog', () => {
    renderSheet();
    const dialog = screen.getByRole('dialog', { name: 'Tab actions' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
  });

  it('"Close other tabs" asks first; the action fires only on Yes', () => {
    const p = renderSheet();
    fireEvent.click(screen.getByText('Close other tabs'));
    expect(p.onCloseOthers).not.toHaveBeenCalled();
    expect(screen.getByText('Close 3 other tabs?')).toBeTruthy();
    fireEvent.click(screen.getByText('Yes, close them'));
    expect(p.onCloseOthers).toHaveBeenCalled();
    expect(p.onDismiss).toHaveBeenCalled();
  });

  it('"Close tabs to the right" asks first and can be cancelled', () => {
    const p = renderSheet();
    fireEvent.click(screen.getByText('Close tabs to the right'));
    expect(screen.getByText('Close 2 tabs after this one?')).toBeTruthy();
    // The sheet's own bottom "Cancel" option is also on screen — target the
    // ConfirmStrip's Cancel by its class.
    fireEvent.click(document.querySelector('.ann-chip-confirm-cancel'));
    expect(p.onCloseToRight).not.toHaveBeenCalled();
    expect(p.onDismiss).not.toHaveBeenCalled();
    // The plain option is back
    expect(screen.getByText('Close tabs to the right')).toBeTruthy();
  });
});

/* W53: pinned tabs survive every bulk close (use-tab-actions), yet the sheet
   counted them: "Close 3 other tabs?" closed one, and with only pinned tabs
   left the option still offered to close them. Counts now skip pinned tabs,
   the option is off at zero, and the sheet says pinned tabs stay open. */
describe('TabActionSheet counts only the tabs a bulk close will close (W53)', () => {
  const T = (pinned = false) => ({ screen: 'home', pinned });

  it('"Close other tabs" counts the unpinned others and says pinned tabs stay open', () => {
    const p = renderSheet({ idx: 1, total: 4, tabs: [T(true), T(), T(), T(true)] });
    expect(screen.getByText(/1 other tab will be closed\. Pinned tabs stay open\./)).toBeTruthy();
    fireEvent.click(screen.getByText('Close other tabs'));
    expect(screen.getByText('Close 1 other tab?')).toBeTruthy();
    fireEvent.click(screen.getByText('Yes, close them'));
    expect(p.onCloseOthers).toHaveBeenCalledTimes(1);
  });

  it('"Close tabs to the right" skips a pinned tab to the right', () => {
    renderSheet({ idx: 1, total: 4, tabs: [T(), T(), T(), T(true)] });
    expect(screen.getByText(/Close 1 tab after this one\. Pinned tabs stay open\./)).toBeTruthy();
  });

  it('with only pinned tabs besides this one, both bulk closes are off', () => {
    renderSheet({ idx: 1, total: 3, tabs: [T(true), T(), T(true)] });
    const others = screen.getByText('Close other tabs').closest('button');
    const right = screen.getByText('Close tabs to the right').closest('button');
    expect(others.disabled).toBe(true);
    expect(right.disabled).toBe(true);
    expect(screen.getByText(/No other tabs to close: pinned tabs stay open\./)).toBeTruthy();
  });
});

/* n196: a keyboard and screen-reader path to reorder tabs (drag was the only one). */
describe('TabActionSheet Move earlier / Move later', () => {
  it('moves the tab either way, and is off at each end', () => {
    const onMove = vi.fn();
    renderSheet({ onMove });
    fireEvent.click(screen.getByRole('button', { name: 'Move earlier' }));
    fireEvent.click(screen.getByRole('button', { name: 'Move later' }));
    expect(onMove.mock.calls).toEqual([[-1], [1]]);
    cleanup();
    renderSheet({ onMove, idx: 0 });
    expect(/** @type {HTMLButtonElement} */ (screen.getByRole('button', { name: 'Move earlier' })).disabled).toBe(true);
    cleanup();
    renderSheet({ onMove, idx: 3 });
    expect(/** @type {HTMLButtonElement} */ (screen.getByRole('button', { name: 'Move later' })).disabled).toBe(true);
  });

  it('the pin description names the real buttons (n133)', () => {
    renderSheet();
    expect(document.body.textContent).toContain('keeps it open through Close other tabs and Clear All');
    expect(document.body.textContent).not.toContain('Close-others');
  });
});
