// @ts-nocheck - the screen's free globals, as LetterView.answers-link.test.jsx
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
  blocks: [], footnotes: {}, nkjv: {}, prevLetter: { id: 'a', title: 'Before' }, nextLetter: { id: 'b', title: 'After' },
  relatedTopics: [{ label: 'Regarding Pride', url: 'https://example.test/pride' }],
};
const view = (o) => render(<LetterView letter={LETTER} volKey="two" volumeLabel="Volume Two" theme="dark" markAsReadEnabled
  onNavigate={() => {}} onHome={() => {}} {...o} />);

/* U01.3: the order was text, footnotes, the install card, Previous/Next, then Related, Audio and Videos; reaching the
   next letter meant scrolling back up past them. The page now ends on Next letter. */
describe('LetterView: the end of a letter (UX wave 3)', () => {
  it('Related sits above Previous/Next, and nothing but the install line comes after Next', () => {
    const { container } = view({});
    const order = [...container.querySelectorAll('.related-section, .bottom-nav, .install-card-sentinel')].map((e) => e.className);
    expect(order).toEqual(['related-section', 'bottom-nav', 'install-card-sentinel']);
  });

  it('Mark as read marks it; once read it says Read and Undo takes it back (U01.1)', () => {
    const onMarkRead = vi.fn();
    const onUnmark = vi.fn();
    const v = view({ onMarkRead, onUnmark, isRead: () => false });
    fireEvent.click(v.getByRole('button', { name: 'Mark as read' }));
    expect(onMarkRead).toHaveBeenCalledTimes(1);
    expect(onMarkRead.mock.calls[0]).toEqual([]);            // a manual claim: no measured payload
    v.unmount();
    const r = view({ onMarkRead, onUnmark, isRead: (id) => id === 'the-wide-path' });
    expect(r.container.querySelector('.mark-read-done').textContent).toBe('✓ Read');
    fireEvent.click(r.getByRole('button', { name: 'Undo: mark as not read' }));
    expect(onUnmark).toHaveBeenCalledTimes(1);
  });

  it('no row with Mark as read switched off in Settings', () => {
    const { container } = view({ markAsReadEnabled: false, onMarkRead: vi.fn(), isRead: () => false });
    expect(container.querySelector('.mark-read-row')).toBeNull();
  });
});
