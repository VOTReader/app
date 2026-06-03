/* ErrorBoundary tests — E4 crash-loop guard.
   ──────────────────────────────────────────
   Renders a throwing child so the boundary catches it, and drives the
   windowed sessionStorage crash counter that surfaces "Reset to Home" on a
   repeat crash. React is a test global (vitest.setup.js). React's own
   error logging is suppressed.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { ErrorBoundary } from './ErrorBoundary.jsx';

function Boom() { throw new Error('kaboom'); }

let errSpy;
beforeEach(() => {
  try { sessionStorage.clear(); } catch (_e) { /* jsdom always has it */ }
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  if (errSpy) errSpy.mockRestore();
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
    // sessionStorage.setItem runs before location.reload() in the handler, so
    // the flag is observable even though jsdom's reload is a no-op.
    fireEvent.click(getByText('Reset to Home'));
    expect(sessionStorage.getItem('vot-crash-recover')).toBe('1');
  });
});
