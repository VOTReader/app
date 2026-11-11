import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { LinkRowActionSheet } from './LinksScreen.jsx';

afterEach(() => {
  cleanup();
  modalRegistry._reset();
  delete /** @type {any} */ (globalThis).LinkStore;
});

describe('LinkRowActionSheet accessibility', () => {
  it('is a modal dialog and contains initial focus', () => {
    /** @type {any} */ (globalThis).LinkStore = { remove: vi.fn() };
    /** @type {any} */ (globalThis).ReactDOM = ReactDOM;
    render(
      <LinkRowActionSheet
        lnk={{ id: 'l1', source: { label: 'Chosen by God' }, target: { label: 'John 15:5' } }}
        onClose={() => {}}
        onNavigateSource={() => {}}
        onNavigateTarget={() => {}}
        onDelete={() => {}}
      />
    );
    const dialog = screen.getByRole('dialog', { name: /^Chosen by God .* John 15:5$/ });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
