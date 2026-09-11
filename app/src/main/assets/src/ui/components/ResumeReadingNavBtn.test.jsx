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

  it('renders its own glyph named "Reading Position Marker" on an eligible screen (home) — not a bare dot', () => {
    const { container } = renderDot({ screen: 'home', enabled: true, onGo: vi.fn() });
    const btn = container.querySelector('.reading-dot-nav');
    expect(btn).not.toBe(null);
    // Corbin (2026-09-10): "Change the icon for the reading resume dot to
    // something that makes more sense, instead of just a dot". Lines of text
    // with a pointer at one say "your place in the reading"; a dot said nothing
    // (and the ribbon that followed it was the Bookmark button's icon —
    // marker-glyph.test.jsx keeps the two apart). The name is the one the
    // Settings row and the tour use for the same control (Orchestrator,
    // 2026-09-10): one control, one name in every place it is spoken of.
    expect(btn.getAttribute('aria-label')).toBe('Reading Position Marker');
    expect(btn.getAttribute('title')).toBe('Reading Position Marker');
    const glyph = btn.querySelector('svg.rdg-glyph');
    expect(glyph).not.toBe(null);
    expect(glyph.getAttribute('aria-hidden')).toBe('true');
    expect(glyph.querySelector('path')).not.toBe(null);
    expect(btn.querySelector('.rdg-inner')).toBe(null);
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

  it('tapping the marker calls onGo (continue reading)', () => {
    const onGo = vi.fn();
    const { container } = renderDot({ screen: 'volumes-home', enabled: true, onGo });
    fireEvent.click(container.querySelector('.reading-dot-nav'));
    expect(onGo).toHaveBeenCalledTimes(1);
  });
});
