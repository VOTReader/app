/* v05-01: journal marks still keyed by block POSITION move onto block IDS at
   boot - after the stores hydrate (the re-key reads them) and before the first
   render (nothing may paint a mark on its old key first). A re-key that throws
   must never keep the app behind the splash. */
import 'fake-indexeddb/auto';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { HydrationGate } from './HydrationGate.jsx';
import { _resetStoreRegistry } from '../stores/cached-store.js';

const G = /** @type {any} */ (globalThis);

afterEach(() => {
  cleanup();
  delete G.JournalStore;
  _resetStoreRegistry();
});

describe('HydrationGate runs the journal mark re-key before the app renders (v05-01)', () => {
  it('calls JournalStore.rekeyMarks() once, before the first child render', async () => {
    _resetStoreRegistry();
    const order = [];
    G.JournalStore = { rekeyMarks: vi.fn(() => { order.push('rekey'); return { moved: 0, left: 0 }; }) };
    function Child() { order.push('render'); return <div data-testid="child" />; }
    render(<HydrationGate><Child /></HydrationGate>);
    await waitFor(() => expect(screen.getByTestId('child')).toBeDefined());
    expect(G.JournalStore.rekeyMarks).toHaveBeenCalledTimes(1);
    expect(order[0]).toBe('rekey');
  });

  it('a re-key that throws never keeps the app behind the splash', async () => {
    _resetStoreRegistry();
    G.JournalStore = { rekeyMarks: () => { throw new Error('boom'); } };
    render(<HydrationGate><div data-testid="child" /></HydrationGate>);
    await waitFor(() => expect(screen.getByTestId('child')).toBeDefined());
  });
});
