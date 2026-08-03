// @ts-nocheck — test installs the classic-script globals these components read
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Segments } from './Segments.jsx';
import { ProphecyCard } from './ProphecyCard.jsx';
import { LinkCard } from './LinkCard.jsx';
import { ConfirmStrip } from './ConfirmStrip.jsx';

beforeEach(() => {
  globalThis.resolveVerseText = () => '';
  globalThis.bookCategory = () => 'Scripture';
  globalThis.relativeDate = () => 'Today';
  globalThis.LinkStore = { remove: vi.fn() };
  globalThis.ConfirmStrip = ConfirmStrip;
  modalRegistry._reset();
});

afterEach(() => {
  cleanup();
  modalRegistry._reset();
  delete globalThis.resolveVerseText;
  delete globalThis.bookCategory;
  delete globalThis.relativeDate;
  delete globalThis.LinkStore;
  delete globalThis.ConfirmStrip;
});

describe('inline reading controls', () => {
  it('activates footnotes and in-app letter links from the keyboard', () => {
    const onFnClick = vi.fn();
    const onInAppLink = vi.fn();
    render(<Segments
      segments={[
        { t: 'fn', v: 3 },
        { t: 'letter-link', label: 'Linked letter', link: { collection: 'v1', letterTitle: 'A Letter' } },
      ]}
      onFnClick={onFnClick}
      onInAppLink={onInAppLink}
    />);

    fireEvent.keyDown(screen.getByRole('button', { name: 'Footnote 3' }), { key: 'Enter' });
    fireEvent.keyDown(screen.getByRole('button', { name: 'Footnote 3' }), { key: ' ' });
    expect(onFnClick).toHaveBeenCalledTimes(2);       // role=button: Enter AND Space
    expect(onFnClick).toHaveBeenCalledWith(3);
    // role=link matches native anchors: Enter activates, Space does NOT
    // (it must stay free to scroll the page).
    fireEvent.keyDown(screen.getByRole('link', { name: 'Linked letter' }), { key: ' ' });
    expect(onInAppLink).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole('link', { name: 'Linked letter' }), { key: 'Enter' });
    expect(onInAppLink).toHaveBeenCalledWith({ collection: 'v1', letterTitle: 'A Letter' });
  });

  it('uses a native disclosure button for prophecy cards', () => {
    render(<ProphecyCard type="warning" tag="Warning" blocks={[]} stateKey="p1" statesRef={{ current: {} }} />);
    const disclosure = screen.getByRole('button', { name: 'Warning' });
    expect(disclosure.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(disclosure);
    expect(disclosure.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('LinkCard controls', () => {
  it('separates keyboard navigation from destructive native buttons', () => {
    const onNavigate = vi.fn();
    const target = { key: 'bible:john:3:16', type: 'bible', bookId: 'john', verse: 16, label: 'John 3:16' };
    render(<LinkCard
      lnk={{ id: 'l1', source: { key: 'letter:one', label: 'Letter One' }, target }}
      hlKey="letter:one"
      onNavigate={onNavigate}
    />);

    const openLink = screen.getByRole('link', { name: 'Open linked passage John 3:16' });
    fireEvent.keyDown(openLink, { key: 'Enter' });
    expect(onNavigate).toHaveBeenCalledWith(target);
    fireEvent.click(screen.getByRole('button', { name: 'Remove link' }));
    expect(screen.getByText('Remove this link?')).toBeTruthy();
  });
});
