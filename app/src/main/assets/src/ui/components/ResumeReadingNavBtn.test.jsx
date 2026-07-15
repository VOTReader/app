/* ResumeReadingNavBtn tests — the resume-reading dot in the top nav.
   ──────────────────────────────────────────────────────────────────
   The dot moved from an App-level position:fixed float (drew over index-
   screen content; had to be visibility-hidden during thumbnail captures →
   the on-screen blink) into the top nav via ReadingDotContext. These pin:
   the context gate, the screen-eligibility list (owned by the component),
   and the tap → onGo wiring. LETTER_SCREEN_SET is a cross-bundle global in
   production (scripture-resolution.js); stubbed here like use-android-back
   .test.js does. React is a test global (vitest.setup.js).
*/

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { ReadingDotContext, ResumeReadingNavBtn } from './ResumeReadingNavBtn.jsx';

beforeEach(() => {
  /** @type {any} */ (globalThis).LETTER_SCREEN_SET = new Set(['vot-letter', 'wtlb-entry']);
});
afterEach(() => {
  cleanup();
  delete (/** @type {any} */ (globalThis).LETTER_SCREEN_SET);
});

function renderDot(ctxValue) {
  return render(
    <ReadingDotContext.Provider value={ctxValue}>
      <ResumeReadingNavBtn />
    </ReadingDotContext.Provider>
  );
}

describe('ResumeReadingNavBtn — nav-bar resume dot', () => {
  it('renders nothing without a provider (bare hosts need no stubs)', () => {
    const { container } = render(<ResumeReadingNavBtn />);
    expect(container.querySelector('.reading-dot-nav')).toBe(null);
  });

  it('renders nothing when disabled (setting off or no reading position)', () => {
    const { container } = renderDot({ screen: 'home', enabled: false, onGo: vi.fn() });
    expect(container.querySelector('.reading-dot-nav')).toBe(null);
  });

  it('renders the pulsing dot on an eligible screen (home)', () => {
    const { container } = renderDot({ screen: 'home', enabled: true, onGo: vi.fn() });
    const btn = container.querySelector('.reading-dot-nav');
    expect(btn).not.toBe(null);
    expect(btn.getAttribute('aria-label')).toBe('Resume reading');
    expect(btn.querySelector('.rdg-inner')).not.toBe(null);
  });

  it('hides on reading screens (you are already reading there)', () => {
    for (const screen of ['bible-ch', 'matthew-ch', 'vot-letter', 'wtlb-entry']) {
      const { container, unmount } = renderDot({ screen, enabled: true, onGo: vi.fn() });
      expect(container.querySelector('.reading-dot-nav'), screen).toBe(null);
      unmount();
    }
  });

  it('hides on utility screens (settings, journal, library indexes)', () => {
    for (const screen of ['settings', 'journal-home', 'notes-index', 'about']) {
      const { container, unmount } = renderDot({ screen, enabled: true, onGo: vi.fn() });
      expect(container.querySelector('.reading-dot-nav'), screen).toBe(null);
      unmount();
    }
  });

  it('tapping the dot calls onGo (resume reading)', () => {
    const onGo = vi.fn();
    const { container } = renderDot({ screen: 'volumes-home', enabled: true, onGo });
    fireEvent.click(container.querySelector('.reading-dot-nav'));
    expect(onGo).toHaveBeenCalledTimes(1);
  });
});
