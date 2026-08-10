/* ErrorBoundary tests — E4 crash-loop guard.
   ──────────────────────────────────────────
   Renders a throwing child so the boundary catches it, and drives the
   windowed sessionStorage crash counter that surfaces "Reset to Home" on a
   repeat crash. React is a test global (vitest.setup.js). React's own
   error logging is suppressed.
*/

import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary.jsx';

function Boom() { throw new Error('kaboom'); }

// NOISE-1 (2026-08-09): the Reset-to-Home / Reload-App handlers call
// location.reload(), which jsdom logs as "Not implemented: navigation to
// another Document". jsdom's own reload is non-configurable but the
// window.location PROPERTY is (sw-register.test.js precedent), so a
// whole-file stub keeps the click paths quiet AND lets the reset test
// assert the reload actually fires. afterAll restores the real object.
const REAL_LOCATION = window.location;

let errSpy;
beforeEach(() => {
  try { sessionStorage.clear(); } catch (_e) { /* jsdom always has it */ }
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  Object.defineProperty(window, 'location', { configurable: true, value: { reload: vi.fn() } });
});
afterEach(() => {
  cleanup();
  if (errSpy) errSpy.mockRestore();
});
afterAll(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: REAL_LOCATION });
});

describe('ErrorBoundary — E4 crash-loop guard', () => {
  it('renders children when there is no error', () => {
    const { getByText } = render(<ErrorBoundary><div>all good</div></ErrorBoundary>);
    expect(getByText('all good')).toBeTruthy();
  });

  it('first crash shows Reload App but NOT Reset to Home', () => {
    const { getByText, queryByText } = render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(getByText('Reload App')).toBeTruthy();
    expect(queryByText('Reset to Home')).toBeNull();
    expect(sessionStorage.getItem('vot-crash-count')).toBe('1');
  });

  it('a 2nd crash within the window surfaces Reset to Home', () => {
    // first crash, then unmount to mimic a reload
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    cleanup();
    // second crash with the counter persisted across the "reload"
    const { getByText } = render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(getByText('Reset to Home')).toBeTruthy();
    expect(sessionStorage.getItem('vot-crash-count')).toBe('2');
  });

  it('clicking Reset to Home sets the one-shot recover flag', () => {
    render(<ErrorBoundary><Boom /></ErrorBoundary>);
    cleanup();
    const { getByText } = render(<ErrorBoundary><Boom /></ErrorBoundary>);
    // sessionStorage.setItem runs before location.reload() in the handler;
    // with the file-level location stub, the reload itself is observable too.
    fireEvent.click(getByText('Reset to Home'));
    expect(sessionStorage.getItem('vot-crash-recover')).toBe('1');
    expect(window.location.reload).toHaveBeenCalledTimes(1);
  });
});

describe('ErrorBoundary — ERR3 custom fallback (AppShell chrome boundaries)', () => {
  it('fallback={null} renders nothing on a crash — no nuclear panel, but still logged', () => {
    const { container, queryByText } = render(<ErrorBoundary fallback={null}><Boom /></ErrorBoundary>);
    expect(queryByText('Something went wrong')).toBeNull(); // a crashed sheet/overlay must NOT replace the app
    expect(container.textContent).toBe('');                 // the crashed chrome subtree quietly vanishes
    expect(sessionStorage.getItem('vot-crash-count')).toBe('1'); // componentDidCatch still ran (logged + counted)
  });

  it('a custom fallback element renders in place of the crashed child', () => {
    const { getByText, queryByText } = render(
      <ErrorBoundary fallback={<span>chrome unavailable</span>}><Boom /></ErrorBoundary>,
    );
    expect(getByText('chrome unavailable')).toBeTruthy();
    expect(queryByText('Something went wrong')).toBeNull();
  });

  it('omitting fallback keeps the default panel (screen + root boundary unchanged)', () => {
    const { getByText } = render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(getByText('Something went wrong')).toBeTruthy();
  });
});

/* ERR3-ACK (Wave 0): the AppShellSheets chrome boundary passes onCatch so a
   crashed sheet acknowledges itself with a toast ("That panel hit a problem
   and closed — your data is safe.") instead of vanishing silently mid-task.
   The mechanism is pinned here; the wiring lives in AppShellSheets.jsx. */
describe('ErrorBoundary — ERR3-ACK onCatch callback', () => {
  it('onCatch fires once with the error while fallback={null} still renders nothing', () => {
    const onCatch = vi.fn();
    const { container, queryByText } = render(
      <ErrorBoundary fallback={null} onCatch={onCatch}><Boom /></ErrorBoundary>,
    );
    expect(onCatch).toHaveBeenCalledTimes(1);
    expect(String(onCatch.mock.calls[0][0])).toContain('kaboom');
    expect(queryByText('Something went wrong')).toBeNull(); // fallback unchanged
    expect(container.textContent).toBe('');                 // still a quiet vanish
  });

  it('a throwing onCatch cannot break the boundary (last line of defense holds)', () => {
    const onCatch = () => { throw new Error('bad callback'); };
    const { container } = render(<ErrorBoundary fallback={null} onCatch={onCatch}><Boom /></ErrorBoundary>);
    expect(container.textContent).toBe('');
    expect(sessionStorage.getItem('vot-crash-count')).toBe('1'); // still counted + logged
  });

  it('no onCatch — behavior is byte-identical to before (default panel path)', () => {
    const { getByText } = render(<ErrorBoundary><Boom /></ErrorBoundary>);
    expect(getByText('Something went wrong')).toBeTruthy();
  });
});
