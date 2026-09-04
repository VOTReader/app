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
