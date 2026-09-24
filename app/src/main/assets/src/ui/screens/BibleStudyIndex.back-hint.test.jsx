// @ts-nocheck -- classic-global screen contract (ScreenLayout / LibraryNav are bundle globals).
/* A study's index opened from the Listening Library's Studies screen (item 4b,
   2026-09-24: a study with no recording yet opens to READ) carries the same
   "‹ Back to …" pill every other tap-through does (BibleChapterView,
   LetterView), so a listener is one tap from where they were. Android back
   matches it (use-android-back.test.js). */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { BibleStudyIndex } from './BibleStudyIndex.jsx';

const STUDY = { id: 'grace-and-law', slug: 'grace-and-law', title: 'Grace AND The Law', chapters: [{ id: 'grace-and-law-ch1', num: 1, title: 'One' }, { id: 'grace-and-law-ch2', num: 2, title: 'Two' }] };
const common = { study: STUDY, onSelect: vi.fn(), onBack: vi.fn(), onSearch: vi.fn(), onHistory: vi.fn(), onSettings: vi.fn(), theme: 'dark', onThemeChange: vi.fn(), isRead: () => false, readCount: () => 0, markAsReadEnabled: false };

beforeEach(() => {
  globalThis.ScreenLayout = ({ children }) => <main>{children}</main>;
  globalThis.LibraryNav = () => null;
});
afterEach(() => { cleanup(); delete globalThis.ScreenLayout; delete globalThis.LibraryNav; });

describe('BibleStudyIndex — the tap-through Back pill', () => {
  it('shows "Back to Studies" when it was opened as a tap-through, and the pill takes the reader back', () => {
    const onTapThroughBack = vi.fn();
    render(<BibleStudyIndex {...common} backHint={{ title: 'Studies' }} onTapThroughBack={onTapThroughBack} />);
    const pill = document.querySelector('.back-hint-pill');
    expect(pill).not.toBeNull();
    expect(pill.textContent.replace(/\s+/g, ' ').trim()).toBe('‹Back to Studies');
    fireEvent.click(pill);
    expect(onTapThroughBack).toHaveBeenCalledTimes(1);
  });

  it('control: an index reached the ordinary way shows no pill', () => {
    render(<BibleStudyIndex {...common} />);
    expect(document.querySelector('.back-hint-pill')).toBeNull();
  });
});
