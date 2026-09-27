import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { FootnoteListSection } from './FootnoteListSection.jsx';

afterEach(() => {
  cleanup();
  for (const key of ['lookupVersesFromBooks', 'ExpandableVerse', 'GoToRefButton', 'InAppLinkButton', '_fnTextRedundantWithLink']) {
    delete /** @type {any} */ (globalThis)[key];
  }
});

describe('FootnoteListSection keyboard routing', () => {
  it('does not trigger the parent jump when Enter activates a nested action', () => {
    const scrollIntoView = vi.fn();
    const bubble = document.createElement('span');
    bubble.className = 'fn-ref';
    bubble.dataset.fnNum = '1';
    bubble.scrollIntoView = scrollIntoView;
    document.body.appendChild(bubble);
    /** @type {any} */ (globalThis).lookupVersesFromBooks = () => 'Verse text';
    /** @type {any} */ (globalThis).ExpandableVerse = () => null;
    /** @type {any} */ (globalThis).GoToRefButton = ({ onGo }) => (
      <button
        onClick={onGo}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onGo();
        }}
      >
        Go to scripture
      </button>
    );
    /** @type {any} */ (globalThis).InAppLinkButton = () => null;
    /** @type {any} */ (globalThis)._fnTextRedundantWithLink = () => false;
    const onGo = vi.fn();
    const { getByRole } = render(
      <FootnoteListSection
        footnotes={{ 1: { type: 'scripture', ref: 'John 3:16' } }}
        nkjv={{}}
        onInAppLink={() => {}}
        onGoToRef={onGo}
      />
    );
    fireEvent.keyDown(getByRole('button', { name: 'Go to scripture' }), { key: 'Enter' });
    expect(onGo).toHaveBeenCalledTimes(1);
    expect(scrollIntoView).not.toHaveBeenCalled();
    bubble.remove();
  });
});

/* a11y (axe nested-interactive, 2026-09-27): the whole card was role=button
   with the Go to Scripture / Read more / link buttons inside it. A button's
   children are presentational to a screen reader, so TalkBack and VoiceOver
   flattened those inner buttons away. The jump-back control is the footnote
   number now; the card keeps its tap for pointers, and nothing on screen moved. */
describe('FootnoteListSection: no button inside a button', () => {
  const mount = (onGo = vi.fn()) => {
    /** @type {any} */ (globalThis).lookupVersesFromBooks = () => 'Verse text';
    /** @type {any} */ (globalThis).ExpandableVerse = () => <button type="button">Read more</button>;
    /** @type {any} */ (globalThis).GoToRefButton = ({ onGo: go }) => <button type="button" onClick={go}>Go to scripture</button>;
    /** @type {any} */ (globalThis).InAppLinkButton = () => null;
    /** @type {any} */ (globalThis)._fnTextRedundantWithLink = () => false;
    return render(
      <FootnoteListSection
        footnotes={{ 1: { type: 'scripture', ref: 'John 3:16' }, 2: { type: 'note', text: 'A note' } }}
        nkjv={{}}
        onInAppLink={() => {}}
        onGoToRef={onGo}
      />
    );
  };

  it('no interactive element contains another focusable element', () => {
    const { container } = mount();
    const interactive = container.querySelectorAll('button, [role="button"], a[href]');
    for (const el of interactive) {
      expect(el.querySelector('button, [role="button"], a[href], [tabindex]'), el.outerHTML.slice(0, 80)).toBeNull();
    }
  });

  it('the footnote number is the keyboard jump-back control, named for what it does', () => {
    const scrollIntoView = vi.fn();
    const bubble = document.createElement('span');
    bubble.className = 'fn-ref';
    bubble.dataset.fnNum = '1';
    bubble.scrollIntoView = scrollIntoView;
    document.body.appendChild(bubble);
    const { getByRole, getAllByRole } = mount();
    const jump = getByRole('button', { name: 'Jump back to footnote 1 in the body' });
    expect(jump.classList.contains('footnote-list-num')).toBe(true);
    expect(jump.tabIndex).toBe(0);
    fireEvent.keyDown(jump, { key: 'Enter' });
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(jump, { key: ' ' });
    expect(scrollIntoView).toHaveBeenCalledTimes(2);
    // the inner actions are real, reachable buttons in reading order after it
    const names = getAllByRole('button').map((b) => b.getAttribute('aria-label') || b.textContent);
    expect(names.slice(0, 3)).toEqual(['Jump back to footnote 1 in the body', 'Read more', 'Go to scripture']);
    bubble.remove();
  });

  it('a pointer tap anywhere on the card still jumps back, and the card keeps its tooltip', () => {
    const scrollIntoView = vi.fn();
    const bubble = document.createElement('span');
    bubble.className = 'fn-ref';
    bubble.dataset.fnNum = '2';
    bubble.scrollIntoView = scrollIntoView;
    document.body.appendChild(bubble);
    const { container } = mount();
    const card = container.querySelector('#fn-item-2');
    expect(card.getAttribute('role')).toBeNull();
    expect(card.getAttribute('title')).toBe('Jump back to footnote 2 in the body');
    fireEvent.click(card.querySelector('.footnote-list-note-text'));
    expect(scrollIntoView).toHaveBeenCalledTimes(1);
    bubble.remove();
  });
});
