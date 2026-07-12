/* LinkPicker — SHEETS-UX 2026-07-12 redesign lock-down.
   ─────────────────────────────────────────────────────────────────
   Pins: (1) the source-context strip ("Linking from …") in link mode and
   its absence in card/excerpt journal mode; (2) the removal of the old
   red-×-beside-green-✓ header pair; (3) the success strip + separated Undo
   (removes the link, keeps the picker open); (4) close now KEEPS a created
   link instead of silently removing it (the app-consistent dismiss). Reads
   bare globals, so we stub them. */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { LinkPicker } from './LinkPicker.jsx';

function stubGlobals() {
  window.RecentNavStore = { list: () => [], add: vi.fn() };
  window.searchNavIndex = () => [];
  window.navItemToEndpoint = (item) => ({ type: 'bible', key: 'k', label: item.label });
  window.LinkStore = { remove: vi.fn() };
  window.buildSourceEndpoint = () => ({ key: 's', label: 'src' });
  window.persistLink = vi.fn(() => ({ id: 'lnk1', target: { label: 'Genesis 1:1' } }));
  window.COL_NAV_ICON = new Map();
}

afterEach(() => {
  cleanup();
  ['RecentNavStore', 'searchNavIndex', 'navItemToEndpoint', 'LinkStore', 'buildSourceEndpoint', 'persistLink', 'COL_NAV_ICON'].forEach(k => delete window[k]);
});

const baseProps = {
  sourceKey: 'bible:john:3:16', sourceLabel: 'John 3:16',
  sourceStart: undefined, sourceEnd: undefined, sourceText: '',
  onClose: () => {}, onRequestRefine: () => {},
  lastCreatedLink: null, onLinkCreated: () => {}, mode: null, onPickTarget: null,
};

describe('LinkPicker source context', () => {
  it('link mode shows the "Linking from" source strip', () => {
    stubGlobals();
    const { container } = render(<LinkPicker {...baseProps} />);
    expect(container.querySelector('.navpick-context')).toBeTruthy();
    expect(screen.getByText('Linking from')).toBeTruthy();
    expect(screen.getByText('John 3:16')).toBeTruthy();
  });

  it('card/excerpt journal mode (no source) shows NO context strip', () => {
    stubGlobals();
    const { container } = render(
      <LinkPicker {...baseProps} sourceKey={null} sourceLabel={null} mode="card" onPickTarget={() => {}} />
    );
    expect(container.querySelector('.navpick-context')).toBeNull();
  });
});

describe('LinkPicker header no longer pairs a destructive × with a confirm ✓', () => {
  it('renders neither the red undo-× nor the green ✓ in the header', () => {
    stubGlobals();
    const { container } = render(<LinkPicker {...baseProps} lastCreatedLink={{ id: 'lnk1', target: { label: 'Genesis 1:1' } }} />);
    expect(container.querySelector('.navpick-close-undo')).toBeNull();
    expect(container.querySelector('.navpick-confirm-green')).toBeNull();
    // a single neutral close remains
    expect(container.querySelector('.navpick-close')).toBeTruthy();
  });
});

describe('LinkPicker success strip + Undo', () => {
  it('shows the success strip with the created target label', () => {
    stubGlobals();
    render(<LinkPicker {...baseProps} lastCreatedLink={{ id: 'lnk1', target: { label: 'Genesis 1:1' } }} />);
    expect(screen.getByText(/Link created · Genesis 1:1/)).toBeTruthy();
  });

  it('Undo removes the link + clears state but does NOT close the picker', () => {
    stubGlobals();
    const onClose = vi.fn();
    const onLinkCreated = vi.fn();
    render(<LinkPicker {...baseProps} onClose={onClose} onLinkCreated={onLinkCreated} lastCreatedLink={{ id: 'lnk1', target: { label: 'Genesis 1:1' } }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Undo this link' }));
    expect(window.LinkStore.remove).toHaveBeenCalledWith('lnk1');
    expect(onLinkCreated).toHaveBeenCalledWith(null);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('LinkPicker close keeps the created link', () => {
  it('the close × calls onClose WITHOUT removing the last link (app-consistent dismiss)', () => {
    stubGlobals();
    const onClose = vi.fn();
    render(<LinkPicker {...baseProps} onClose={onClose} lastCreatedLink={{ id: 'lnk1', target: { label: 'Genesis 1:1' } }} />);
    // The close is aria-labelled "Done" once a link exists.
    fireEvent.click(screen.getByRole('button', { name: 'Done' }));
    expect(onClose).toHaveBeenCalled();
    expect(window.LinkStore.remove).not.toHaveBeenCalled();
  });
});
