// @ts-nocheck — reads app.jsx as text with node APIs, as HydrationGate.boot-splash.test.jsx
/* RouteSlot — a screen route's body runs inside the screen's ErrorBoundary (sweep mw12).
   App used to call ROUTES[screen]() in its OWN render and hand only the returned element to the
   keyed screen boundary, so a throw while a route built its props (bibleAudioFor, getStudyById,
   lastReadChapters[...] on a malformed backup) reached the ROOT boundary: the whole app replaced,
   no way to navigate off the bad screen. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ErrorBoundary } from './ErrorBoundary.jsx';
import { RouteSlot } from './RouteSlot.jsx';

const HERE = dirname(fileURLToPath(import.meta.url));
let errSpy;
beforeEach(() => { sessionStorage.clear(); errSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); });
afterEach(() => { cleanup(); errSpy.mockRestore(); });

const badRoute = () => { throw new Error('route body threw while building props'); };

describe('RouteSlot', () => {
  it('renders what the route returns', () => {
    const { getByText } = render(<RouteSlot route={() => <p>the screen</p>} />);
    expect(getByText('the screen')).toBeTruthy();
  });

  it('a route that returns nothing renders nothing', () => {
    const { container } = render(<RouteSlot route={() => undefined} />);
    expect(container.textContent).toBe('');
  });

  it('a throw in the route body is caught by the screen boundary, not the one above it', () => {
    const { getByText, queryByText } = render(
      <ErrorBoundary fallback={<p>root fallback</p>}>
        <header>chrome stays</header>
        <ErrorBoundary key="bible-ch"><RouteSlot route={badRoute} /></ErrorBoundary>
      </ErrorBoundary>
    );
    expect(getByText('Something went wrong')).toBeTruthy(); // the screen boundary's panel
    expect(getByText('chrome stays')).toBeTruthy();         // the app around it survives
    expect(queryByText('root fallback')).toBeNull();
  });

  it('App renders the route through RouteSlot inside the keyed screen boundary', () => {
    const app = readFileSync(resolve(HERE, '..', 'app.jsx'), 'utf-8');
    expect(app).toMatch(/<ErrorBoundary key=\{screen\}><RouteSlot route=\{ROUTES\[screen\] \|\| ROUTES\.home\} \/><\/ErrorBoundary>/);
    expect(app).not.toMatch(/\(ROUTES\[screen\] \|\| ROUTES\.home\)\?\.\(\)/); // the route is never called in App's own render
  });
});
