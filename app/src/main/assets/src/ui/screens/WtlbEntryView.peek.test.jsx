// @ts-nocheck — free-var globals stubbed per test; only render-affecting props passed
/* WtlbEntryView — pager peek FORMAT GATE (regression, 2026-07-21).
   ──────────────────────────────────────────────────────────────────
   Holy Days is a MIXED collection: its ghost entries carry type 'wtlb'
   (Format B, `paragraphs`) or 'letter' (Format A, `blocks`), and the
   holy-days-entry route branches on that to pick WtlbEntryView vs
   LetterView. The swipe peek did NOT branch — it only checked that the
   neighbor RESOLVED — so an adjacent Format A entry was rendered through
   WtlbEntryView, whose paragraph memo threw immediately:

     TypeError: Cannot read properties of undefined (reading 'forEach')

   Peeks are computed on every render of a reading screen, so this fired
   on ARRIVAL, not on swipe: the screen wedged behind an ErrorBoundary,
   which also meant the lazy-corpus kick never ran and the crash survived
   reloads. Latent since the swipe-engine v3 peeks landed (b95358d).

   Live example: Holy Days "Consider My Love" (wtlb) sits directly before
   "Walking in the Footsteps of The Messiah's Passion" (letter). */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { WtlbEntryView } from './WtlbEntryView.jsx';

let capturedPager;

beforeEach(() => {
  capturedPager = null;
  globalThis.ReactDOM = ReactDOM;
  globalThis.ScreenLayout = (props) => { capturedPager = props.pager; return <div data-testid="sl" />; };
  globalThis.StickyChapterNav = () => null;
  globalThis.HomeBtn = () => null;
  globalThis.NavButtons = () => null;
  globalThis.useMarkAsRead = () => {};
  globalThis.useModalRegistry = () => {};
  globalThis.WTLB_PART_LABELS = { holydays: 'Regarding The Holy Days' };
  globalThis.COL_BY_KEY = new Map([
    ['holydays', { volKey: 'holydays', kind: 'wtlb', label: 'Regarding The Holy Days', letterScreen: 'holy-days-entry' }],
  ]);
  globalThis.colPreface = () => null;
  globalThis.wtlbHlKey = (vol, id, i) => `${vol}:${id}:${i}`;
  globalThis.ExpandableVerse = () => null;
  globalThis.GoToRefButton = () => null;
  globalThis.ScriptureVerseText = () => null;
  globalThis.lookupVersesFromBooks = () => null;
  globalThis.StaticSubtree = ({ children }) => <>{children}</>;
  window.navHandoff = { peek: () => null, clear: () => {} };
});
afterEach(() => {
  cleanup();
  for (const k of ['ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons',
    'useMarkAsRead', 'useModalRegistry', 'WTLB_PART_LABELS', 'COL_BY_KEY', 'colLetterArr', 'colPreface',
    'wtlbHlKey', 'ExpandableVerse', 'GoToRefButton', 'ScriptureVerseText', 'lookupVersesFromBooks', 'StaticSubtree']) {
    delete globalThis[k];
  }
});

// The live shape: a Format B ghost entry whose next sibling is Format A.
const ENTRY = {
  id: 'consider-my-love', title: 'Consider My Love', num: 4, type: 'wtlb',
  paragraphs: [{ align: 'justify', text: 'Consider My love…' }],
  prevEntry: null,
  nextEntry: { id: 'walking-in-the-footsteps', title: "Walking in the Footsteps of The Messiah's Passion" },
};

const renderEntry = (extra) => render(
  <WtlbEntryView
    entry={ENTRY}
    volKey="holydays"
    partLabel="Regarding The Holy Days"
    theme="dark"
    showProgressBar={false}
    markAsReadEnabled={false}
    footnotesMode={true}
    onNavigate={() => {}}
    {...extra}
  />,
);

describe('WtlbEntryView pager.peek format gate', () => {
  it('degrades to a boundary card when the neighbor is Format A (the crash)', () => {
    // Pre-fix: kind:'screen' wrapping a blocks-only letter → the paragraph
    // memo threw on render and the whole screen died behind the boundary.
    globalThis.colLetterArr = () => ([{
      id: 'walking-in-the-footsteps', title: "Walking in the Footsteps of The Messiah's Passion",
      num: 5, type: 'letter', blocks: [], footnotes: {}, nkjv: {},
    }]);
    renderEntry();
    const desc = capturedPager.peek('next');
    expect(desc.kind).toBe('boundary');
    expect(desc.title).toBe("Walking in the Footsteps of The Messiah's Passion");
  });

  it('still peeks a real screen when the neighbor IS Format B', () => {
    const formatB = {
      id: 'walking-in-the-footsteps', title: 'A Sibling Entry', num: 5, type: 'wtlb',
      paragraphs: [{ align: 'justify', text: 'Real Format B content.' }],
    };
    globalThis.colLetterArr = () => [formatB];
    renderEntry();
    const desc = capturedPager.peek('next');
    expect(desc.kind).toBe('screen');
    expect(desc.el.props.entry).toBe(formatB);
    expect(desc.el.props.inert).toBe(true);
  });

  it('renders the live entry without throwing when its neighbor is cross-format', () => {
    globalThis.colLetterArr = () => ([{ id: 'walking-in-the-footsteps', title: 'X', blocks: [] }]);
    expect(() => renderEntry()).not.toThrow();
  });
});
