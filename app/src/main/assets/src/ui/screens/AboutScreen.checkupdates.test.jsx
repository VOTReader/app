// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* WHAT IT PINS: Check for updates shows that it ran and what it found (vot-ui 11-15, hub: the tap fetched
   ./service-worker.js and nothing on screen changed at 0/1/3/8 s).

   - The press holds "Checking…" on the status line long enough to be seen, then the verdict says it is fresh.
   - "Up to date" is said only when the server answered this time; a failed fetch says it could not reach it.
   - A new worker already waiting (read with getRegistration, never asked for) reads as an update that is ready.
   - The check only looks: it never calls registration.update(), skipWaiting or a reload. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, act, fireEvent } from '@testing-library/react';
import { AboutScreen } from './AboutScreen.jsx';
import { versionWords } from '../components/about-parts.jsx';

const RUN = { cacheVersion: 'v1.0.2-d2f98765c6', corpusVersion: 'c77' };
const KEYS = ['ScreenLayout', 'PlatformBridge', 'getBuildVersion', 'fetchServerBuildVersion'];
let reg;

function setGlobals({ server = { ...RUN } } = {}) {
  globalThis.ScreenLayout = ({ children }) => <div data-testid="screen-layout">{children}</div>;
  globalThis.PlatformBridge = { isAndroid: false };
  globalThis.getBuildVersion = () => Promise.resolve({ ...RUN });
  globalThis.fetchServerBuildVersion = vi.fn(() => Promise.resolve(server));
}

beforeEach(() => {
  reg = { waiting: null, update: vi.fn(), unregister: vi.fn() };
  Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { getRegistration: vi.fn(() => Promise.resolve(reg)) } });
  setGlobals();
});
afterEach(() => { cleanup(); vi.useRealTimers(); KEYS.forEach((k) => { delete globalThis[k]; }); delete navigator.serviceWorker; });

const status = (c) => c.querySelector('.ws3-version [role="status"]').textContent;

describe('About: Check for updates', () => {
  it('holds Checking… for the press, then says the check is fresh, and only looks', async () => {
    const { container, getByText } = render(<AboutScreen firstRun={false} onBack={() => {}} onContinue={() => {}} />);
    await act(async () => {});
    expect(status(container)).toBe('Up to date with the published version');
    vi.useFakeTimers();
    fireEvent.click(getByText('Check for updates'));
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(status(container)).toBe('Checking…');
    await act(async () => { vi.advanceTimersByTime(300); });
    expect(status(container)).toBe('Checking…');
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(status(container)).toBe('Up to date with the published version · checked just now');
    expect(globalThis.fetchServerBuildVersion).toHaveBeenCalledTimes(2);
    expect(reg.update).not.toHaveBeenCalled();
  });

  it('says it could not reach the server when the fetch failed, never Up to date', () => {
    expect(versionWords({ state: 'ok', running: RUN, server: null, checkedAt: 1 }).line).toBe('Could not reach the server to compare · tried just now');
  });

  it('names a waiting worker as an update that is ready', async () => {
    reg.waiting = {};
    const { container } = render(<AboutScreen firstRun={false} onBack={() => {}} onContinue={() => {}} />);
    await act(async () => {});
    expect(status(container)).toBe('An update is ready. Reopen the app to apply it.');
  });

  it('a newer published build still reads as available', () => {
    expect(versionWords({ state: 'ok', running: RUN, server: { cacheVersion: 'v1.0.2-aaaaaaaaaa' }, checkedAt: 1 }).line)
      .toBe('An update is available. Reopen the app to apply it.');
  });
});
