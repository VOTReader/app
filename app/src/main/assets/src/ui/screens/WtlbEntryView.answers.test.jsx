// @ts-nocheck — free-var globals stubbed per test, as WtlbEntryView.modal.test.jsx does
/* An Answers topic in WtlbEntryView (AOGCG Topic stage):
   - U5: exactly one Back. The "‹ Back to …" pill is folded into the nav ‹, which goes where the pill
     went and names it; with no pill the ‹ goes to Answers.
   - O2 / U6: a cite opens the kit scripture sheet with the site's own translation note where refMeta
     has one ("On the site this reference opens the HCSB"), and the page draws no footnote bubbles. */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { WtlbEntryView } from './WtlbEntryView.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';

vi.mock('../../data/scripture-resolution.js', async (importOriginal) => { const real = /** @type {any} */ (await importOriginal()); return { ...real, get COL_BY_KEY() { return /** @type {any} */ (globalThis).COL_BY_KEY; } }; });
vi.mock('../components/ReadAlongHighlight.jsx', () => ({ ReadAlongHighlight: () => null }));

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', 'data');
const ctx = {};
runInNewContext(readFileSync(resolve(DATA, 'answers.js'), 'utf8'), ctx);
runInNewContext(readFileSync(resolve(DATA, 'answers-meta.js'), 'utf8'), ctx);
const A = ctx.ANSWERS, M = ctx.ANSWERS_META;
const TINO = A.find((e) => e.id === 'there-is-no-other');

const GLOBALS = ['ReactDOM', 'ScreenLayout', 'StickyChapterNav', 'HomeBtn', 'NavButtons', 'LibraryNav', 'useMarkAsRead', 'WTLB_SCRIPTURES', 'COL_BY_KEY',
  'colLetterArr', 'colPreface', 'ExpandableVerse', 'GoToRefButton', 'ScriptureVerseText', 'lookupVersesFromBooks', 'StaticSubtree',
  'SheetHandle', 'useFocusTrap', 'useModalRegistry', 'useRailMode'];
/** The app's focus trap, reduced to the ref it hands back (the trap has its own tests). */
function useFocusTrapStub() { return React.useRef(null); }

beforeEach(() => {
  globalThis.ReactDOM = ReactDOM;
  globalThis.ScreenLayout = ({ children, navChildren }) => <div>{navChildren}{children}</div>;
  globalThis.StickyChapterNav = () => null;
  globalThis.HomeBtn = () => null;
  globalThis.NavButtons = () => null;
  globalThis.LibraryNav = LibraryNav;
  globalThis.useMarkAsRead = () => {};
  globalThis.WTLB_SCRIPTURES = { 'Deuteronomy 32:39': 'Now see that I, even I, am He' };
  globalThis.COL_BY_KEY = new Map();
  globalThis.colLetterArr = () => [];
  globalThis.colPreface = () => null;
  globalThis.ExpandableVerse = () => null;
  globalThis.GoToRefButton = () => null;
  globalThis.ScriptureVerseText = ({ text }) => <span>{text}</span>;
  globalThis.lookupVersesFromBooks = () => null;
  globalThis.StaticSubtree = ({ children }) => <>{children}</>;
  if (!globalThis.SheetHandle) globalThis.SheetHandle = ({ onClose }) => <button type="button" className="sheet-handle-back" onClick={onClose}>close</button>;
  if (!globalThis.useFocusTrap) globalThis.useFocusTrap = useFocusTrapStub;
  if (!globalThis.useModalRegistry) globalThis.useModalRegistry = () => {};
  if (!globalThis.useRailMode) globalThis.useRailMode = () => false;
  window.navHandoff = { peek: () => null, clear: () => {} };
  window.ANSWERS_META = M;
  Element.prototype.scrollIntoView = function () {};
});
afterEach(() => { cleanup(); GLOBALS.forEach((k) => { delete globalThis[k]; }); delete window.ANSWERS_META; delete Element.prototype.scrollIntoView; });

const topic = (props = {}) => render(
  <WtlbEntryView entry={TINO} volKey="answers" partLabel="Answers" theme="dark" markAsReadEnabled={false} footnotesMode={false}
    onNavigate={() => {}} onHome={() => {}} answers={{ entries: A, isRead: () => false, pathOn: true }} {...props} />,
);
const backs = () => [...document.querySelectorAll('button, a')].filter((b) => /^Back to /.test(b.getAttribute('aria-label') || ''));

describe('WtlbEntryView — an Answers topic has one Back (U5)', () => {
  it('folds the "Back to …" pill into the nav ‹: one control, named for and going where the pill went', () => {
    const onBack = vi.fn(); const onHome = vi.fn();
    topic({ backHint: { title: 'A Bruised Reed', volumeLabel: 'Volume Five' }, onBack, onHome });
    expect(document.querySelector('.back-hint-pill')).toBeNull();
    expect(backs().length).toBe(1);
    expect(backs()[0].getAttribute('aria-label')).toBe('Back to Volume Five · A Bruised Reed');
    fireEvent.click(backs()[0]);
    expect(onBack).toHaveBeenCalled();
    expect(onHome).not.toHaveBeenCalled();
  });

  it('with no pill the ‹ goes to Answers', () => {
    const onHome = vi.fn();
    topic({ onHome });
    expect(backs().map((b) => b.getAttribute('aria-label'))).toEqual(['Back to Answers']);
    fireEvent.click(backs()[0]);
    expect(onHome).toHaveBeenCalled();
  });
});

describe('WtlbEntryView — an Answers cite and its translation note (O2, U6)', () => {
  it('draws cites inline only, and the sheet names the translation the site opens', () => {
    topic();
    expect(document.querySelector('.fn-ref')).toBeNull();
    const cite = document.querySelector('[data-hl-key="wtlb:there-is-no-other:42"] .wtlb-cite[data-n="2"]');
    expect(cite.textContent).toBe('(Deuteronomy 32:39)');
    act(() => { fireEvent.click(cite); });
    const sheet = document.querySelector('.fn-sheet.open');
    expect(sheet.querySelector('.sc-sheet-cite').textContent).toBe('Deuteronomy 32:39');
    expect(sheet.querySelector('.ans-sc-note .ans-note').textContent.split(String.fromCharCode(160)).join(' ')).toBe('On the site this reference opens the HCSB. Shown here: NKJV.');
    const link = sheet.querySelector('.ans-sc-note a');
    expect(link.textContent).toBe('Open the HCSB on Bible Gateway');
    expect(link.getAttribute('href')).toBe(M['there-is-no-other'].refMeta['42'][1].siteUrl);
  });
});
