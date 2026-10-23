/* CopyFallbackSheet (A15) — the passage a refused Copy or Share keeps on screen (n248).
   Pins: the title per verb, Try again's two outcomes (copied closes via onCopied; a second
   refusal turns the help into the manual "Still blocked" route), Close and the backdrop
   dismiss while a tap inside does not, and Escape / Android Back reach it through the
   modal registry. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';

vi.mock('../../utils/copy-share.js', () => ({ copyFromSelection: vi.fn() }));

import { copyFromSelection } from '../../utils/copy-share.js';
import { modalRegistry, useModalRegistry } from '../../hooks/use-modal-registry.js';
import { useFocusTrap } from '../../hooks/use-focus-trap.js';
import { CopyFallbackSheet } from './CopyFallbackSheet.jsx';

/** @type {any} */
const g = globalThis;

beforeEach(() => {
  // Free globals in bundle-d: the sheet reads them off the window.
  g.useModalRegistry = useModalRegistry;
  g.useFocusTrap = useFocusTrap;
  modalRegistry._reset();
  vi.mocked(copyFromSelection).mockReset();
});
afterEach(() => { cleanup(); modalRegistry._reset(); });

const renderSheet = (props = {}) => {
  const onClose = vi.fn();
  const onCopied = vi.fn();
  render(<CopyFallbackSheet text="In the beginning was the Word." onClose={onClose} onCopied={onCopied} {...props} />);
  return { onClose, onCopied };
};

describe('CopyFallbackSheet', () => {
  it('says "Couldn’t copy" by default and "Couldn’t share" for verb share', () => {
    renderSheet();
    expect(screen.getByRole('heading').textContent).toBe('Couldn’t copy');
    cleanup();
    renderSheet({ verb: 'share' });
    expect(screen.getByRole('heading').textContent).toBe('Couldn’t share');
  });

  it('shows the passage read-only and selected, with the first instruction', () => {
    renderSheet();
    const field = /** @type {HTMLTextAreaElement} */ (screen.getByLabelText('The passage'));
    expect(field.readOnly).toBe(true);
    expect(field.value).toBe('In the beginning was the Word.');
    expect(document.activeElement).toBe(field);
    expect(document.getElementById('copy-fallback-help').textContent).toBe('Copy the selected passage below, or try again.');
  });

  it('Try again that copies calls onCopied', async () => {
    vi.mocked(copyFromSelection).mockResolvedValue('copied');
    const { onCopied, onClose } = renderSheet();
    await act(async () => { fireEvent.click(screen.getByText('Try again')); });
    expect(copyFromSelection).toHaveBeenCalledWith(screen.getByLabelText('The passage'), 'In the beginning was the Word.');
    expect(onCopied).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('a second refusal switches to the manual "Still blocked" route, naming what', async () => {
    vi.mocked(copyFromSelection).mockResolvedValue('failed');
    const { onCopied } = renderSheet({ what: 'link' });
    expect(document.getElementById('copy-fallback-help').textContent).toBe('Copy the selected link below, or try again.');
    await act(async () => { fireEvent.click(screen.getByText('Try again')); });
    expect(document.getElementById('copy-fallback-help').textContent)
      .toBe('Still blocked. Press and hold the link, choose Select all, then Copy.');
    expect(onCopied).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeTruthy();   // the sheet stays up
  });

  it('Close dismisses', () => {
    const { onClose } = renderSheet();
    fireEvent.click(screen.getByText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('a backdrop tap dismisses; a tap inside the sheet does not', () => {
    const { onClose } = renderSheet();
    fireEvent.click(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(/** @type {Element} */ (document.querySelector('.copy-fallback-overlay')));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape / Android Back close it through the modal registry, and unmount unregisters', () => {
    const { onClose } = renderSheet();
    const top = modalRegistry.peek();
    expect(top && top.id).toBe('copy-fallback');
    act(() => { top.dismiss(); });
    expect(onClose).toHaveBeenCalledTimes(1);
    cleanup();
    expect(modalRegistry.isAnyOpen()).toBe(false);
  });
});
