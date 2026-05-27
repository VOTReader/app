/* HydrationGate component tests.
   ────────────────────────────────
   Verifies the gate renders the loading splash until
   hydrateAllStores() resolves, then renders children.

   Uses @testing-library/react to mount the component. IDBAdapter is
   mocked so the test controls resolution timing.
*/

import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import { HydrationGate } from './HydrationGate.jsx';
import { CachedStore, _resetStoreRegistry } from '../stores/cached-store.js';
import { IDBAdapter } from '../stores/idb-adapter.js';

beforeEach(() => {
  localStorage.clear?.();
  _resetStoreRegistry();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('HydrationGate', () => {
  it('renders children immediately when no IDB stores are registered', async () => {
    render(
      <HydrationGate>
        <div data-testid="child">app content</div>
      </HydrationGate>
    );
    // useEffect → setHydrated(true) flushes on next tick.
    await waitFor(() => {
      expect(screen.getByTestId('child')).toBeDefined();
    });
  });

  it('renders the loading splash before hydration settles', async () => {
    // Register an IDB store whose hydration hangs.
    vi.spyOn(IDBAdapter, 'get').mockReturnValue(new Promise(() => {}));
    CachedStore('vot-test-gate-pending', [], { idb: true });

    render(
      <HydrationGate>
        <div data-testid="child">app content</div>
      </HydrationGate>
    );
    // Should NOT render children — still waiting on hydration.
    // Splash uses class 'hydration-loading-text' with "VOTReader" content.
    expect(screen.queryByTestId('child')).toBeNull();
    const splash = document.querySelector('.hydration-loading-text');
    expect(splash).not.toBeNull();
    expect(splash.textContent).toBe('VOTReader');
  });

  it('flips to children when hydration completes', async () => {
    vi.spyOn(IDBAdapter, 'get').mockResolvedValue([]);
    vi.spyOn(IDBAdapter, 'put').mockResolvedValue(undefined);
    CachedStore('vot-test-gate-loads', [], { idb: true });

    render(
      <HydrationGate>
        <div data-testid="child">app content</div>
      </HydrationGate>
    );

    await waitFor(() => {
      expect(screen.getByTestId('child')).toBeDefined();
    });
    expect(document.querySelector('.hydration-loading-text')).toBeNull();
  });

  it('flips to children even if hydration fails (gate must not deadlock)', async () => {
    vi.spyOn(IDBAdapter, 'get').mockRejectedValue(new Error('corrupted'));
    vi.spyOn(IDBAdapter, 'put').mockRejectedValue(new Error('corrupted'));
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    CachedStore('vot-test-gate-fails', [], { idb: true });

    render(
      <HydrationGate>
        <div data-testid="child">app content</div>
      </HydrationGate>
    );

    await waitFor(() => {
      expect(screen.getByTestId('child')).toBeDefined();
    });
    consoleSpy.mockRestore();
  });

  it('has role=status on the splash for screen readers', async () => {
    vi.spyOn(IDBAdapter, 'get').mockReturnValue(new Promise(() => {}));
    CachedStore('vot-test-gate-a11y', [], { idb: true });

    render(
      <HydrationGate>
        <div data-testid="child">app content</div>
      </HydrationGate>
    );
    const status = document.querySelector('[role="status"]');
    expect(status).not.toBeNull();
    expect(status.getAttribute('aria-live')).toBe('polite');
  });
});
