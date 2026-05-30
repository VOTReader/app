/* ConfirmStrip tests.
   ────────────────────
   The component is mechanical (no state, no effects, no store reads), so
   the test surface is small. What we DO want to lock down:

     A) The default yesLabel is exactly "Yes, delete". Every passthrough
        caller in Bucket A relies on the default being right; a typo
        here ("Yes delete" / "yes, delete") would silently regress 8+
        sites at once.

     B) Cancel and Confirm fire independently. The two buttons share the
        same parent .ann-chip-confirm and the same .ann-chip-confirm-btn
        base class — a careless onClick swap during refactor would route
        the wrong handler to the wrong button without any visual cue.

     C) The wrapping div carries the .ann-chip-confirm class (so the
        existing CSS continues to apply) and forwards className + style
        (so site-specific overrides like padding: 14px 12px on the
        BookmarkRowActionSheet, or bkm-create-edit-confirm on the edit
        sheet, keep working).
*/

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ConfirmStrip } from './ConfirmStrip.jsx';

// vitest-config doesn't set globals: true, so @testing-library/react's auto-
// cleanup doesn't engage. Without this, every test's DOM leaks into the next
// and getByText('Yes, delete') hits N matches across the accumulated rendered
// trees.
afterEach(cleanup);

describe('ConfirmStrip', () => {
  it('renders the question text', () => {
    render(<ConfirmStrip question="Delete this bookmark?" onCancel={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText('Delete this bookmark?')).toBeTruthy();
  });

  it('renders default "Yes, delete" when yesLabel omitted', () => {
    render(<ConfirmStrip question="Q?" onCancel={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText('Yes, delete')).toBeTruthy();
  });

  it('renders custom yesLabel when provided', () => {
    render(<ConfirmStrip question="Q?" yesLabel="Yes, remove" onCancel={() => {}} onConfirm={() => {}} />);
    expect(screen.getByText('Yes, remove')).toBeTruthy();
    expect(screen.queryByText('Yes, delete')).toBeNull();
  });

  it('fires onCancel when Cancel tapped', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmStrip question="Q?" onCancel={onCancel} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('fires onConfirm when Yes tapped', () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<ConfirmStrip question="Q?" onCancel={onCancel} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByText('Yes, delete'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('accepts a ReactNode for question', () => {
    render(
      <ConfirmStrip
        question={<>Delete <strong>My Notebook</strong>?</>}
        onCancel={() => {}}
        onConfirm={() => {}}
      />
    );
    expect(screen.getByText('My Notebook')).toBeTruthy();
  });

  it('applies .ann-chip-confirm base class on the wrapping div', () => {
    const { container } = render(
      <ConfirmStrip question="Q?" onCancel={() => {}} onConfirm={() => {}} />
    );
    const root = /** @type {HTMLElement} */ (container.firstChild);
    expect(root.className).toBe('ann-chip-confirm');
  });

  it('appends extra className when provided', () => {
    const { container } = render(
      <ConfirmStrip question="Q?" className="my-extra" onCancel={() => {}} onConfirm={() => {}} />
    );
    const root = /** @type {HTMLElement} */ (container.firstChild);
    expect(root.className).toContain('ann-chip-confirm');
    expect(root.className).toContain('my-extra');
  });

  it('passes through inline style', () => {
    const { container } = render(
      <ConfirmStrip question="Q?" style={{ padding: '14px 12px' }} onCancel={() => {}} onConfirm={() => {}} />
    );
    const root = /** @type {HTMLElement} */ (container.firstChild);
    expect(root.style.padding).toBe('14px 12px');
  });

  it('renders Cancel and Yes as <button> elements (keyboard + a11y)', () => {
    const { container } = render(
      <ConfirmStrip question="Q?" onCancel={() => {}} onConfirm={() => {}} />
    );
    const buttons = container.querySelectorAll('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0].textContent).toBe('Cancel');
    expect(buttons[1].textContent).toBe('Yes, delete');
  });
});
