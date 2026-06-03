/* TabsNavBtn tests — UX5 first-use coachmark.
   ──────────────────────────────────────────
   TabsNavBtn reads TabsContext as a free global (in production _entry-d.js
   Object.assigns it onto window). We provide a context object + its Provider
   and drive the localStorage-backed one-time hint. React is a test global
   (vitest.setup.js).
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { TabsNavBtn } from './TabsNavBtn.jsx';

const TabsContext = React.createContext(null);
/** @type {any} */ (globalThis).TabsContext = TabsContext;

function renderBtn(ctxValue) {
  return render(
    <TabsContext.Provider value={ctxValue}>
      <TabsNavBtn />
    </TabsContext.Provider>
  );
}

beforeEach(() => {
  try { localStorage.clear(); } catch (_e) { /* jsdom always has it */ }
});
afterEach(() => { cleanup(); });

describe('TabsNavBtn — UX5 first-use hint', () => {
  it('renders nothing when tabs are disabled', () => {
    const { container } = renderBtn({ enabled: false, count: 3, onOpen: vi.fn() });
    expect(container.querySelector('.tabs-nav-btn')).toBe(null);
    expect(container.querySelector('.tabs-hint')).toBe(null);
  });

  it('shows the hint when unseen and more than one tab is open', () => {
    const { container } = renderBtn({ enabled: true, count: 2, onOpen: vi.fn() });
    expect(container.querySelector('.tabs-nav-btn')).not.toBe(null);
    expect(container.querySelector('.tabs-hint')).not.toBe(null);
  });

  it('does not show the hint with a single tab (nothing to switch between)', () => {
    const { container } = renderBtn({ enabled: true, count: 1, onOpen: vi.fn() });
    expect(container.querySelector('.tabs-hint')).toBe(null);
  });

  it('does not show the hint once the seen-flag is set', () => {
    localStorage.setItem('vot-tabs-hint-seen', '1');
    const { container } = renderBtn({ enabled: true, count: 2, onOpen: vi.fn() });
    expect(container.querySelector('.tabs-hint')).toBe(null);
  });

  it('clicking the button opens the switcher and marks the hint seen', () => {
    const onOpen = vi.fn();
    const { container } = renderBtn({ enabled: true, count: 2, onOpen });
    fireEvent.click(container.querySelector('.tabs-nav-btn'));
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem('vot-tabs-hint-seen')).toBe('1');
    expect(container.querySelector('.tabs-hint')).toBe(null);
  });

  it('clicking the dismiss × hides the hint without opening the switcher', () => {
    const onOpen = vi.fn();
    const { container } = renderBtn({ enabled: true, count: 2, onOpen });
    fireEvent.click(container.querySelector('.tabs-hint-dismiss'));
    expect(onOpen).not.toHaveBeenCalled();
    expect(localStorage.getItem('vot-tabs-hint-seen')).toBe('1');
    expect(container.querySelector('.tabs-hint')).toBe(null);
  });
});
