/* W41 (sweep 2026-10-13): appWillBeReplaced() is the gate's own decision to remount
   App for stores that were not loaded when it opened. An App mount reads it at its
   first render (use-shared-passage-link.js keeps a shared link parked until a mount
   the gate will not replace has opened it). Refuter round 2: a store that loads
   between the gate's open and App's first render is still remounted for, so that
   first mount must read "will be replaced" even though every store is loaded by
   the time it renders. */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, waitFor, cleanup } from '@testing-library/react';
import { HydrationGate, appWillBeReplaced } from './HydrationGate.jsx';

const late = vi.hoisted(() => ({
  _state: 'pending',
  /** @type {Set<() => void>} */ subs: new Set(),
  getState() { return this._state; },
  subscribe(/** @type {() => void} */ cb) { this.subs.add(cb); return () => { this.subs.delete(cb); }; },
}));

vi.mock('../stores/cached-store.js', async (importOriginal) => ({
  ...(/** @type {any} */ (await importOriginal())),
  hydrateAllStores: () => Promise.resolve(),
  clearLegacyLs: () => {},
  // late when the gate opens; it lands right after, before App's first render
  storesNotLoaded: () => { const out = late._state === 'loaded' ? [] : [late]; late._state = 'loaded'; return out; },
}));
vi.mock('../utils/other-tabs.js', () => ({ watchOtherTabs: () => {} }));
vi.mock('../utils/data-safety.js', () => ({ DataSafety: { run: () => {}, freshDatabase: () => false } }));
vi.mock('../utils/storage-health.js', () => ({ StorageHealth: { start: () => {} } }));


afterEach(() => { cleanup(); });

describe('HydrationGate — W41: appWillBeReplaced is the gate’s own remount decision', () => {
  it('true for the mount made while it waits on a store (even one that lands before App renders), false for the remount', async () => {
    /** @type {boolean[]} */
    const mounts = [];
    function Probe() {
      const seen = /** @type {any} */ (globalThis).React.useRef(/** @type {boolean | null} */ (null));
      if (seen.current === null) { seen.current = appWillBeReplaced(); mounts.push(seen.current); }
      return null;
    }
    render(<HydrationGate><Probe /></HydrationGate>);
    await waitFor(() => { expect(mounts).toEqual([true, false]); }, { timeout: 2000 });
  });
});
