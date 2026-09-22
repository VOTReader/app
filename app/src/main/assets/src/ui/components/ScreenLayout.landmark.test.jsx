// @ts-nocheck — free-var globals stubbed per test (bundle-d component contract)
/* ScreenLayout — the app has ONE <main>, and it is the scroll container.
   ═══════════════════════════════════════════════════════════════════════
   THE DEFECT (Lighthouse on the live site, 2026-09-22, a11y 85):
   "Document does not have a main landmark" — on the FIRST PAINT of a fresh
   install, which use-tabs.js opens on the About screen. A screen reader user
   arriving at votreader.github.io had no "skip to the content" target at all:
   every screen was <div> all the way down, and the two reading screens that
   did carry a <main> (LetterView, WtlbEntryView) were the exception, not the
   law — ChapterView and BibleChapterView wrapped the same reading text in a
   plain div.chapter-body.

   THE LAW. ScreenLayout wraps EVERY screen's content, so its live
   `.screen-scroll` is the one place the landmark belongs: one <main> per
   document, on every screen, with no screen having to remember. The two inner
   <main className="letter-body"> become divs — nested mains are the same axe
   failure wearing the other face (landmark-no-duplicate-main).

   TWO CLONES MUST NOT COUNT. The inert pager peek renders its own
   `.screen-scroll` (a throwaway visual copy of the neighbor page). It stays a
   <div>: PagerPeek marks it aria-hidden + inert so axe ignores it, but the
   document should not contain a second main element for a swipe preview
   either — the clone owns none of the live screen's singletons, and the
   landmark is one of them.
*/

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ScreenLayout } from './ScreenLayout.jsx';

const SL = /** @type {any} */ (ScreenLayout);
const HERE = dirname(fileURLToPath(import.meta.url));
const UI = resolve(HERE, '..');

// `__scrollEl` is a lexical global declared in index.html (ScreenLayout's ref
// assigns it by bare name); jsdom needs it to exist before the ref fires.
beforeEach(() => { /** @type {any} */ (globalThis).__scrollEl = null; });
afterEach(() => cleanup());

/** Every product .jsx under src/ui (tests excluded), as [relative path, source]. */
function uiSources(dir = UI, rel = '') {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + entry.name : entry.name;
    if (entry.isDirectory()) { out.push(...uiSources(join(dir, entry.name), r)); continue; }
    if (!entry.name.endsWith('.jsx')) continue;
    if (entry.name.includes('.test.')) continue;
    out.push([r, readFileSync(join(dir, entry.name), 'utf-8')]);
  }
  return out;
}

describe('ScreenLayout — the one main landmark', () => {
  it('renders exactly one <main>, and it is the live scroll container', () => {
    const { container } = render(<SL hideTabsBtn navChildren={null}>body</SL>);
    const mains = container.querySelectorAll('main');
    expect(mains.length).toBe(1);
    expect(mains[0].classList.contains('screen-scroll')).toBe(true);
  });

  it('renders the same one <main> on a reading screen (the pager branch)', () => {
    const pager = { peek: () => null };
    const { container } = render(<SL hideTabsBtn navChildren={null} pager={pager}>body</SL>);
    const mains = container.querySelectorAll('main');
    expect(mains.length).toBe(1);
    expect(mains[0].classList.contains('screen-scroll')).toBe(true);
    // The pager branch still nests its track inside that container.
    expect(mains[0].querySelector('.pager-track')).toBeTruthy();
  });

  it('gives the inert peek clone NO main — a swipe preview is not the content', () => {
    const { container } = render(<SL inert>neighbor</SL>);
    expect(container.querySelectorAll('main').length).toBe(0);
    expect(container.querySelector('.screen-scroll')).toBeTruthy();
  });

  it('is the ONLY product component in src/ui that writes a <main> element', () => {
    const offenders = uiSources()
      .filter(([, src]) => /<main[\s>]/.test(src))
      .map(([rel]) => rel);
    expect(offenders).toEqual(['components/ScreenLayout.jsx']);
  });
});
