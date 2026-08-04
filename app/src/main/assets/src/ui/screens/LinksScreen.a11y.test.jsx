import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { LinkRowActionSheet } from './LinksScreen.jsx';

afterEach(() => {
  cleanup();
  modalRegistry._reset();
  delete /** @type {any} */ (globalThis).LinkStore;
});

describe('LinkRowActionSheet accessibility', () => {
  it('is a modal dialog and contains initial focus', () => {
    /** @type {any} */ (globalThis).LinkStore = { remove: vi.fn() };
    render(
      <LinkRowActionSheet
        lnk={{ id: 'l1' }}
        onClose={() => {}}
        onNavigateSource={() => {}}
        onNavigateTarget={() => {}}
        onDelete={() => {}}
      />
    );
    const dialog = screen.getByRole('dialog', { name: 'Link actions' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.contains(document.activeElement)).toBe(true);
  });
});
