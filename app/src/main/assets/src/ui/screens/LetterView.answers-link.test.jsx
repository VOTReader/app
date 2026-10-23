// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract), as LetterView.labels.test.jsx does
/* LetterView — a letter's answersonlygodcangive.com Related Topics row opens the topic in-app AT the
   section its URL names (aogcg 1b, brief C11). 224 of the letters' rows carry a #fragment
   ("…/Regarding_Pride#For_the_Sake_of_Pride"); before, every one opened its topic at the top. */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
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
  blocks: [], footnotes: {}, nkjv: {}, prevLetter: null, nextLetter: null,
  relatedTopics: [
    { label: 'Regarding Pride - For the Sake of Pride', url: 'https://answersonlygodcangive.com/Regarding_Pride#For_the_Sake_of_Pride' },
    { label: 'Regarding Pride', url: 'https://answersonlygodcangive.com/Regarding_Pride' },
    { label: 'Answers Only God Can Give', url: 'https://answersonlygodcangive.com/Main_Page#Discernment' },
  ],
};

const rows = () => [...document.querySelectorAll('.related-link')];

describe('LetterView — an Answers row opens the topic at the section its URL names', () => {
  it('hands the section landing to the jump; a row with no #fragment clears any landing', () => {
    const onNavigateToLink = vi.fn();
    render(<LetterView letter={LETTER} volKey="two" volumeLabel="Volume Two" theme="dark" markAsReadEnabled={false}
      onNavigate={() => {}} onHome={() => {}} onNavigateToLink={onNavigateToLink} />);
    const [withSection, plain, mainPage] = rows();
    // Still in-app links, never the website.
    expect(withSection.getAttribute('href')).toBe('#');
    expect(mainPage.getAttribute('href')).toBe('#');
    fireEvent.click(withSection);
    expect(onNavigateToLink.mock.calls[0][0]).toEqual({
      type: 'wtlb', screen: 'answers-entry', letterId: 'regarding-pride',
      surpriseAnchor: { type: 'section', letterId: 'regarding-pride', anchor: 'For_the_Sake_of_Pride' },
    });
    expect(onNavigateToLink.mock.calls[0][1]).toEqual({ sourceLetterTitle: 'The Wide Path', sourceVolumeLabel: 'Volume Two' });
    fireEvent.click(plain);
    expect(onNavigateToLink.mock.calls[1][0]).toEqual({ type: 'wtlb', screen: 'answers-entry', letterId: 'regarding-pride', surpriseAnchor: null });
    fireEvent.click(mainPage);
    expect(onNavigateToLink.mock.calls[2][0].letterId).toBe('answers-main-page');
    expect(onNavigateToLink.mock.calls[2][0].surpriseAnchor).toEqual({ type: 'section', letterId: 'answers-main-page', anchor: 'Discernment' });
  });
});
