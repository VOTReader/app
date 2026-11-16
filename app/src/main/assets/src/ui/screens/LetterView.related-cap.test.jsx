// @ts-nocheck - the screen's free globals, as LetterView.answers-link.test.jsx
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { LetterView } from './LetterView.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';
import { AudioPlayer } from '../../utils/audio-player.js';

const GLOBALS = ['ReactDOM', 'ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons',
  'LibraryNav', 'FootnoteSheet', 'useMarkAsRead', 'useModalRegistry', 'Segments',
  'ProphecyGroup', 'ProphecyExpandToggle', 'letterHlKey', 'StaticSubtree'];

let realAudio;
beforeEach(() => {
  realAudio = { hasAudio: AudioPlayer.hasAudio, playLetter: AudioPlayer.playLetter, prewarm: AudioPlayer.prewarm };
  globalThis.ReactDOM = ReactDOM;
  globalThis.ScreenLayout = ({ children, navChildren }) => <div>{navChildren}{children}</div>;
  globalThis.StickyChapterNav = () => null;
  globalThis.HomeBtn = () => null;
  globalThis.NavButtons = () => null;
  globalThis.LibraryNav = LibraryNav;
  globalThis.FootnoteSheet = () => null;
  globalThis.useMarkAsRead = () => {};
  globalThis.useModalRegistry = () => {};
  globalThis.Segments = () => null;
  globalThis.ProphecyGroup = () => null;
  globalThis.ProphecyExpandToggle = () => null;
  globalThis.StaticSubtree = ({ children }) => <>{children}</>;
  window.navHandoff = { peek: () => null, clear: () => {} };
  AudioPlayer.hasAudio = () => false;
  AudioPlayer.playLetter = () => {};
  AudioPlayer.prewarm = () => {};
});
afterEach(() => {
  cleanup();
  Object.assign(AudioPlayer, realAudio);
  GLOBALS.forEach((k) => { delete globalThis[k]; });
});

const LETTER = {
  id: 'the-wide-path', title: 'The Wide Path', num: 1,
  blocks: [], footnotes: {}, nkjv: {}, prevLetter: { id: 'a', title: 'Before' }, nextLetter: { id: 'b', title: 'After' },
  relatedTopics: [{ label: 'Regarding Pride', url: 'https://example.test/pride' }],
};
const view = (o) => render(<LetterView letter={LETTER} volKey="two" volumeLabel="Volume Two" theme="dark" markAsReadEnabled
  onNavigate={() => {}} onHome={() => {}} {...o} />);

const topics = (n) => Array.from({ length: n }, (_, i) => ({ label: 'Topic ' + (i + 1), url: 'https://example.test/t' + i }));
const rows = (c) => [...c.querySelectorAll('.related-link')].map((e) => e.textContent.trim());

/* vot-ui 11-15 (REMAINING letter-end): a letter with 23 related topics drew 23 rows above Next letter. Past 10 rows the
   group shows 6 and a 'Show all N topics' line; one tap draws the rest, and the next letter starts capped again. */
describe('LetterView: a long Related Topics list is capped', () => {
  it('10 rows draw whole, with no Show all line', () => {
    const { container, queryByRole } = view({ letter: { ...LETTER, relatedTopics: topics(10) } });
    expect(rows(container)).toHaveLength(10);
    expect(queryByRole('button', { name: /^Show all/ })).toBeNull();
  });

  it('23 rows: the first 6, then Show all 23 topics draws all 23 in order', () => {
    const { container, getByRole, queryByRole } = view({ letter: { ...LETTER, relatedTopics: topics(23) } });
    expect(rows(container)).toEqual(['Topic 1', 'Topic 2', 'Topic 3', 'Topic 4', 'Topic 5', 'Topic 6']);
    fireEvent.click(getByRole('button', { name: 'Show all 23 topics' }));
    expect(rows(container)).toEqual(topics(23).map((t) => t.label));
    expect(queryByRole('button', { name: /^Show all/ })).toBeNull();
  });

  it('the opened list belongs to its letter: the next letter starts capped', () => {
    const a = { ...LETTER, relatedTopics: topics(12) };
    const v = view({ letter: a });
    fireEvent.click(v.getByRole('button', { name: 'Show all 12 topics' }));
    expect(rows(v.container)).toHaveLength(12);
    v.rerender(<LetterView letter={{ ...a, id: 'another' }} volKey="two" volumeLabel="Volume Two" theme="dark" markAsReadEnabled
      onNavigate={() => {}} onHome={() => {}} />);
    expect(rows(v.container)).toHaveLength(6);
  });
});
