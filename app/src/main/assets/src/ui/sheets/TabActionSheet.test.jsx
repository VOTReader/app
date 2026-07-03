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
    idx: 1, total: 4,
    onCloseOthers: vi.fn(), onCloseToRight: vi.fn(), onDismiss: vi.fn(),
    ...overrides,
  };
  render(<TabActionSheet {...props} />);
  return props;
}

describe('TabActionSheet bulk-close confirm gates', () => {
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
