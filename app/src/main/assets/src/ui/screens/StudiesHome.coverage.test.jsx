// @ts-nocheck — free-var globals installed on window, same shape as VolumesHome.counts.test.jsx
/* Every study row says whether it can be read along with (hub order 2026-09-22).
   ═══════════════════════════════════════════════════════════════════════
   The census (lanes/align/out/coverage-2026-09-22.md) counted 52 study chapters
   with no recording at all and 20 with one. Until now the Studies list said
   nothing about it: a listener had to open a study, press Listen and find out.
   The badge answers before the tap, and the count is read from AUDIO_MANIFEST,
   never typed here. */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, cleanup, screen } from '@testing-library/react';
import { StudiesHome } from './StudiesHome.jsx';

const GLOBALS = ['ScreenLayout', 'LibraryNav', 'AUDIO_MANIFEST', 'BIBLE_AUDIO_MANIFEST'];

const STUDIES = [
  // recorded whole (6 of 6, the way Purity ships)
  { id: 'purity', slug: 'purity', title: 'Purity', chapters: [{ id: 'purity-ch1' }, { id: 'purity-ch2' }] },
  // recorded in part (Lamb of God: 14 of 16)
  { id: 'lamb-of-god', slug: 'lamb-of-god', title: 'Lamb of God', prefaceId: 'lamb-of-god-ch0', parts: [{ num: 1, chapterIds: ['lamb-of-god-ch1'] }] },
  // no recording (More Than a Man, Odds Chart, State of the Dead, Grace, Trinity)
  { id: 'trinity', slug: 'trinity', title: 'The Trinity', chapters: [{ id: 'trinity-ch1' }] },
];

beforeEach(() => {
  window.ScreenLayout = ({ children }) => <div>{children}</div>;
  window.LibraryNav = () => null;
  window.AUDIO_MANIFEST = {
    'study:purity-ch1': [['a', 'V']],
    'study:purity-ch2': [['b', 'V']],
    'study:lamb-of-god-ch1': [['c', 'V']],
  };
});

afterEach(() => {
  cleanup();
  for (const key of GLOBALS) delete window[key];
});

const noop = () => {};
function renderHome() {
  return render(<StudiesHome studies={STUDIES} studiesLoading={false} studiesError={null} onRetry={noop} onSelectStudy={noop} onBack={noop} onSearch={noop} onHistory={noop} onSettings={noop} theme="dark" onThemeChange={noop} />);
}
/** The badge inside the row whose title is `title`. */
function badgeOf(title) {
  const card = [...document.querySelectorAll('.chapter-card-btn')].find((b) => b.textContent.includes(title));
  return card ? card.querySelector('.coverage-badge') : null;
}

describe('StudiesHome -- the read-along badge', () => {
  it('marks a fully recorded study read-along, with no count', () => {
    renderHome();
    const badge = badgeOf('Purity');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe('Read-along');
    expect(badge.className).toContain('coverage-badge-read-along');
    expect(badge.parentElement.textContent).not.toMatch(/of 2 parts/);
  });

  it('marks a partly recorded study read-along AND says how much of it is recorded', () => {
    renderHome();
    const card = [...document.querySelectorAll('.chapter-card-btn')].find((b) => b.textContent.includes('Lamb of God'));
    expect(card.querySelector('.coverage-badge').textContent).toBe('Read-along');
    // n6-12: a study in parts counts its recorded CHAPTERS - the row already
    // says "1 Part", and "1 of 2 parts" beside it contradicted it
    expect(card.textContent).toContain('1 Part');
    expect(card.textContent).toContain('1 of 2 chapters');
  });

  it('(n6-12) a study with no parts keeps "parts", which agrees with its row', () => {
    window.AUDIO_MANIFEST = { 'study:trinity-ch1': [['t', 'V']] };
    const two = [{ id: 'grace', slug: 'grace', title: 'Grace', chapters: [{ id: 'grace-ch1' }, { id: 'grace-ch2' }] }];
    window.AUDIO_MANIFEST['study:grace-ch1'] = [['g', 'V']];
    render(<StudiesHome studies={two} studiesLoading={false} studiesError={null} onRetry={noop} onSelectStudy={noop} onBack={noop} onSearch={noop} onHistory={noop} onSettings={noop} theme="dark" onThemeChange={noop} />);
    const card = [...document.querySelectorAll('.chapter-card-btn')].find((b) => b.textContent.includes('Grace'));
    expect(card.textContent).toContain('2 Parts');
    expect(card.textContent).toContain('1 of 2 parts');
  });

  it('marks a study with no recording, so a listener knows before tapping', () => {
    renderHome();
    const badge = badgeOf('The Trinity');
    expect(badge.textContent).toBe('No recording');
    expect(badge.className).toContain('coverage-badge-no-recording');
  });

  it('gives the badge a sentence a screen reader can reach, not colour alone', () => {
    renderHome();
    const badge = badgeOf('Purity');
    expect(badge.getAttribute('title')).toMatch(/light/i);
    expect(screen.getAllByText('Read-along').length).toBe(2);
  });

  it('marks the Matthew Study Bible read-along -- its recording is a Bible edition', () => {
    window.BIBLE_AUDIO_MANIFEST = { 'bible-tsot-matthew:matthew': [['m', 'B']] };
    render(<StudiesHome studies={[{ id: 'matthew-study', slug: 'matthew-study', title: 'Matthew Study Bible', isMatthewStudy: true, chapters: [{ id: 'mt-1' }] }]} studiesLoading={false} studiesError={null} onRetry={noop} onSelectStudy={noop} onBack={noop} onSearch={noop} onHistory={noop} onSettings={noop} theme="dark" onThemeChange={noop} />);
    expect(badgeOf('Matthew Study Bible').textContent).toBe('Read-along');
    delete window.BIBLE_AUDIO_MANIFEST;
  });

  it('says no recording rather than throwing when the manifest has not landed', () => {
    delete window.AUDIO_MANIFEST;
    renderHome();
    expect(badgeOf('Purity').textContent).toBe('No recording');
  });
});
