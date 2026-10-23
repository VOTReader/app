/* search200 idea A (2026-10-22, PICKS.md A): a verse its KJV wording found (the engine's kjvWording) shows on its
   card in the KJV words it matched, badged KJV, once the KJV is in memory; until then its own words. */
import { it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { SrchCard } from './SrchCard.jsx';
import { SrchSnippet } from './SrchSnippet.jsx';
import { snippet, snippetAt, highlightSpans } from '../../search/snippet.js';

beforeEach(() => {
  /** @type {any} */ (globalThis).SRCH_KIND_LABEL = { verse: { label: 'Verse', cls: '' } };
  /** @type {any} */ (globalThis).SrchSnippet = SrchSnippet;
  /** @type {any} */ (globalThis).VotSearchMini = { snippet, snippetAt, highlightSpans };
  /** @type {any} */ (globalThis).TRANSLATION_OPTIONS = [{ id: 'nkjv', label: 'NKJV' }, { id: 'kjv', label: 'KJV' }];
});
afterEach(() => {
  cleanup();
  delete (/** @type {any} */ (globalThis)).TRANSLATION_OPTIONS;
  delete (/** @type {any} */ (globalThis)).BIBLE_KJV;
});

const entry = (extra = {}) => ({ score: 1, doc: { kind: 'verse', ref: 'Exodus 20:13', bookId: 'exodus', chapterNum: 20, verseNum: 13, translation: 'nkjv', text: 'You shall not murder.' }, ...extra });
const marks = (/** @type {HTMLElement} */ c) => [...c.querySelectorAll('mark')].map((m) => m.textContent);
const badges = (/** @type {HTMLElement} */ c) => [...c.querySelectorAll('.srch-card-badge')].map((b) => b.textContent);

it('shows the KJV words it matched, marked, with a KJV badge', () => {
  /** @type {any} */ (globalThis).BIBLE_KJV = { exodus: { 20: [{ n: 13, text: 'Thou shalt not kill.' }] } };
  const { container } = render(<SrchCard entry={entry({ kjvWording: true })} terms={['thou', 'shalt', 'kill']} onSelect={() => {}} isDirect={false} />);
  expect(container.querySelector('.srch-card-snippet').textContent).toContain('Thou shalt not kill.');
  expect(marks(container)).toContain('kill');
  expect(badges(container)).toContain('KJV');
});

it('its own words until the KJV is in memory, and for a verse its own wording found', () => {
  const { container, unmount } = render(<SrchCard entry={entry({ kjvWording: true })} terms={['kill']} onSelect={() => {}} isDirect={false} />);
  expect(container.querySelector('.srch-card-snippet').textContent).toContain('You shall not murder.');
  expect(badges(container)).not.toContain('KJV');
  unmount();
  /** @type {any} */ (globalThis).BIBLE_KJV = { exodus: { 20: [{ n: 13, text: 'Thou shalt not kill.' }] } };
  const own = render(<SrchCard entry={entry()} terms={['murder']} onSelect={() => {}} isDirect={false} />);
  expect(own.container.querySelector('.srch-card-snippet').textContent).toContain('You shall not murder.');
});
