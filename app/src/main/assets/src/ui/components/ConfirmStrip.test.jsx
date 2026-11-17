/* ConfirmStrip tests.
   ────────────────────
   The component is mechanical (no state, no effects, no store reads), so
   the test surface is small. What we DO want to lock down:

     A) The default yesLabel is exactly "Yes, delete". Every passthrough
        caller in Bucket A relies on the default being right; a typo
        here ("Yes delete" / "yes, delete") would silently regress 8+
        sites at once.

     B) Cancel and Confirm fire independently. The two buttons share the
        same parent .ui-confirm and the same .ui-btn.is-small
        base classes — a careless onClick swap during refactor would route
        the wrong handler to the wrong button without any visual cue.

     C) The wrapping div carries the .ui-confirm class (the kit's one
        confirm, app.css) and forwards className + style
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

  it('applies the .ui-confirm base class on the wrapping div', () => {
    const { container } = render(
      <ConfirmStrip question="Q?" onCancel={() => {}} onConfirm={() => {}} />
    );
    const root = /** @type {HTMLElement} */ (container.firstChild);
    expect(root.className).toBe('ui-confirm');
  });

  it('appends extra className when provided', () => {
    const { container } = render(
      <ConfirmStrip question="Q?" className="my-extra" onCancel={() => {}} onConfirm={() => {}} />
    );
    const root = /** @type {HTMLElement} */ (container.firstChild);
    expect(root.className).toBe('ui-confirm my-extra');
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

/* n185: opening the strip moves focus to Cancel, the safe answer, so a keyboard or screen-reader user
   lands on the question instead of on a button that has just disappeared. */
describe('ConfirmStrip focus (n185)', () => {
  it('focuses Cancel when it opens', () => {
    render(<ConfirmStrip question="Delete?" onCancel={() => {}} onConfirm={() => {}} />);
    expect(document.activeElement).toBe(screen.getByText('Cancel'));
  });
});

/* The kit's one confirm: the Downloads boxes (Cancel downloads, the Download ask, Remove all kept songs) use it as a card
   with lines, and keep the Back and focus they had (none). */
describe('ConfirmStrip as the one confirm', () => {
  it('draws Cancel as a text button and the act as danger, or primary for a go', () => {
    const { container, rerender } = render(<ConfirmStrip question="Q?" onCancel={() => {}} onConfirm={() => {}} />);
    const [cancel, yes] = Array.from(container.querySelectorAll('button'));
    expect(cancel.className).toBe('ui-btn is-small is-text ui-confirm-cancel');
    expect(yes.className).toBe('ui-btn is-small ui-confirm-yes is-danger');
    rerender(<ConfirmStrip question="Q?" act="go" onCancel={() => {}} onConfirm={() => {}} />);
    expect(container.querySelectorAll('button')[1].className).toBe('ui-btn is-small ui-confirm-yes is-primary');
  });

  it('card, label, lines (a warn line marked), cancelLabel and disabled', () => {
    const onConfirm = vi.fn();
    render(<ConfirmStrip card label="Download Volume Two" question="Download Volume Two?" act="go" disabled
      lines={['12 recordings · 80 MB', null, { text: 'Not enough room: free some space on the phone first.', warn: true }]}
      cancelLabel="Keep downloading" yesLabel="Download 80 MB" onCancel={() => {}} onConfirm={onConfirm} />);
    const group = screen.getByRole('group', { name: 'Download Volume Two' });
    expect(group.className).toBe('ui-confirm is-card');
    const lines = Array.from(group.querySelectorAll('.ui-confirm-line'));
    expect(lines.map((l) => l.textContent)).toEqual(['12 recordings · 80 MB', 'Not enough room: free some space on the phone first.']);
    expect(lines.map((l) => l.className)).toEqual(['ui-confirm-line', 'ui-confirm-line is-warn']);
    expect(screen.getByRole('button', { name: 'Keep downloading' })).toBeTruthy();
    const go = /** @type {HTMLButtonElement} */ (screen.getByRole('button', { name: 'Download 80 MB' }));
    expect(go.disabled).toBe(true);
  });

  it('no label: no group role', () => {
    const { container } = render(<ConfirmStrip question="Q?" onCancel={() => {}} onConfirm={() => {}} />);
    expect(/** @type {HTMLElement} */ (container.firstChild).getAttribute('role')).toBeNull();
  });

  it('focus={false} leaves focus where it was', () => {
    render(<ConfirmStrip question="Q?" focus={false} onCancel={() => {}} onConfirm={() => {}} />);
    expect(document.activeElement).toBe(document.body);
  });

  it('back: registered for Back by default, not with back={false}', () => {
    const reg = /** @type {any} */ (globalThis).modalRegistry;
    const before = reg.openIds().length;
    const a = render(<ConfirmStrip question="Q?" onCancel={() => {}} onConfirm={() => {}} />);
    expect(reg.openIds().length).toBe(before + 1);
    a.unmount();
    render(<ConfirmStrip question="Q?" back={false} onCancel={() => {}} onConfirm={() => {}} />);
    expect(reg.openIds().length).toBe(before);
  });
});
