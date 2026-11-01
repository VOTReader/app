// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* axe over the HOME and HUB screens (a11y pass, 2026-11-01).
   ─────────────────────────────────────────────────────────────────────
   Each screen is drawn in jsdom the way bundle-d draws it — its free globals
   installed on window, the REAL ScreenLayout around it (one <nav>, one
   <main>) — in a populated state, and axe's serious/critical findings must
   be none. Colour contrast and target size need a layout, so they are
   measured in the browser (tools/smoke-ci.js), not here.

   Song page and Letters read with music are frames of the Songs desk: they
   are drawn by AudioSongsScreen with the player's state and the player's
   buttons, so they belong to the audio group, not this file. */
import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { seriousViolations } from '../a11y/axe-run.js';
import { ScreenLayout as RealScreenLayout } from '../components/ScreenLayout.jsx';
import { LibraryNav } from '../components/LibraryNav.jsx';
import { NavButtons } from '../components/NavButtons.jsx';
import { HomeScreen } from './HomeScreen.jsx';
import { VolumesHome } from './VolumesHome.jsx';
import { ScripturesHome } from './ScripturesHome.jsx';
import { ScriptureGenre } from './ScriptureGenre.jsx';
import { StudiesHome } from './StudiesHome.jsx';
import { AboutScreen } from './AboutScreen.jsx';
import { ReadingPlansScreen } from './ReadingPlansScreen.jsx';
import { GardenView } from './GardenView.jsx';
import { setupSettingsGlobals, teardownSettingsGlobals, renderSettings } from './settings-harness.jsx';
import { ReadingPlanStore } from '../../stores/reading-plan-store.js';
import { startCatalogPlan } from '../../data/plan-catalog.js';
import { tickItem, todayKey } from '../../data/plan-engine.js';
import { studyCoverage, studyCoverageDetail } from '../../utils/audio-coverage.js';
import { CoverageBadge } from '../components/CoverageBadge.jsx';
import { ModeToggle } from '../components/ModeToggle.jsx';
import { PlanRibbon } from '../components/PlanRibbon.jsx';
import { InstallCard, _resetInstallCardSession } from '../components/InstallCard.jsx';
import { WhatsNewSheet } from '../components/WhatsNewSheet.jsx';
import { SettingsRow } from '../components/SettingsRow.jsx';
import { SelectField } from '../components/SelectField.jsx';
import { FontPickerRow } from '../components/FontPickerRow.jsx';
import { READING_FONTS, readingFontById } from '../../utils/reading-fonts.js';
import { OPEN_EVENT } from '../../utils/whats-new.js';

const noop = () => {};
const INSTALLED = new Set();
function put(name, value) { INSTALLED.add(name); globalThis[name] = value; }
/** The real layout, without the Tabs button (a bundle-d global of its own). */
const Layout = (p) => <RealScreenLayout hideTabsBtn {...p} />;

/** axe's serious and critical findings over the document (portaled sheets included): none. */
async function check(root = document) {
  expect(await seriousViolations(root)).toEqual([]);
}

beforeEach(() => {
  put('ReactDOM', ReactDOM);
  put('__scrollEl', null);
  document.documentElement.lang = 'en';
  document.title = 'VOTReader';
  put('ScreenLayout', Layout);
  put('LibraryNav', LibraryNav);
  put('NavButtons', NavButtons);
  put('HomeBtn', () => null);
  put('ThemeBtn', () => null);
  localStorage.clear();
  ReadingPlanStore._resetForTests({ forceLoaded: true });
  put('ReadingPlanStore', ReadingPlanStore);
});
afterEach(() => {
  cleanup();
  for (const k of INSTALLED) delete globalThis[k];
  INSTALLED.clear();
  ['__loadVotCorpus', '__loadBibleCorpus', '__loadMatthewCorpus', '__votCorpus', '__bibleCorpus', '__votOpenPlanItem', '__homeAnimShown'].forEach((k) => { delete window[k]; });
  localStorage.clear();
});

describe('axe — Home', () => {
  const home = (props = {}) => {
    put('HomeOrderStore', { get: () => ['volumes', 'scriptures', 'answers', 'studies', 'listening', 'songs', 'library', 'settings', 'history'], set: noop });
    put('createPressDrag', () => ({ start: noop, suppressed: () => false, destroy: noop, land: noop }));
    put('translationLabel', () => 'NKJV');
    return render(
      <HomeScreen onSelect={noop} onSurprise={noop} showSurprise onSettings={noop} onSearch={noop} onHistory={noop}
        historyEnabled onAbout={noop} history={[]} theme="dark" onThemeChange={noop} translation="nkjv"
        onNotes={noop} onBookmarks={noop} onHighlights={noop} onScriptureWeb={noop} onContinue={noop} onStartHere={noop}
        readingPlans={[]} isRead={() => false} markAsReadEnabled onPlanRead={noop} onOpenPlans={noop} onPlansMoved={noop}
        {...props} />,
    );
  };

  it('with a plan running and a place to continue', async () => {
    ReadingPlanStore.put(startCatalogPlan('bible-year', null, new Date()));
    home({ history: [{ type: 'chapter', bookTitle: 'Genesis', chapterNum: 3 }] });
    await check();
  });

  it('first run: no history, the plan offer', async () => {
    home();
    await check();
  });
});

describe('axe — Volumes, Scriptures, a genre, Studies', () => {
  it('Volumes, loaded', async () => {
    const keys = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'rebuke', 'wtlb1', 'wtlb2', 'blessed', 'flock', 'timothy', 'holydays'];
    put('COL_BY_KEY', new Map(keys.map((k) => [k, { volKey: k }])));
    put('colLetterArr', (col) => new Array(col && col.volKey === 'seven' ? 0 : 12).fill(0));
    put('GARDEN_TOTAL', 209);
    window.__votCorpus = { subscribe: () => () => {}, getVersion: () => 1, loaded: true };
    window.__loadVotCorpus = () => Promise.resolve();
    render(<VolumesHome onSelect={noop} onBack={noop} onSearch={noop} onHistory={noop} onSettings={noop} theme="dark" onThemeChange={noop} />);
    await check();
  });

  const GENRES = {
    ot: [{ id: 'law', label: 'The Law', detail: 'Torah', books: [{ id: 'genesis', title: 'Genesis', detail: '50 Chapters' }, { id: 'exodus', title: 'Exodus', detail: '40 Chapters' }] }],
    nt: [{ id: 'gospels', label: 'The Gospels', detail: 'Good News', books: [{ id: 'matthew', title: 'Matthew', detail: '28 Chapters' }] }],
  };
  const bible = () => {
    put('SCRIPTURE_GENRES', GENRES);
    put('BOOKS', { genesis: { chapters: new Array(50) }, exodus: { chapters: new Array(40) }, matthew: { chapters: new Array(28) } });
    put('CANON_SUBTITLES', { genesis: 'In the Beginning' });
    put('SCRIPTURE_LAYOUT_OPTIONS', [{ id: 'genre', label: 'Genre Grid' }, { id: 'compact', label: 'Compact List' }, { id: 'grid', label: 'Book Grid' }, { id: 'canonical', label: 'Canonical Scroll' }]);
    put('TRANSLATION_OPTIONS', [{ id: 'nkjv', label: 'NKJV', desc: 'New King James Version' }, { id: 'kjv', label: 'KJV', desc: 'King James Version' }]);
    window.__bibleCorpus = { subscribe: () => () => {}, getVersion: () => 1, loaded: true };
    window.__loadBibleCorpus = () => Promise.resolve();
  };

  it.each(['genre', 'compact', 'grid', 'canonical'])('Scriptures, the %s layout', async (layout) => {
    bible();
    render(<ScripturesHome onSelect={noop} onGenre={noop} onBack={noop} onSearch={noop} onHistory={noop} onSettings={noop}
      theme="dark" onThemeChange={noop} onCycleLayout={noop} translation="nkjv" onTranslation={noop} layout={layout} />);
    await check();
  });

  it('Scriptures, the translation picker open', async () => {
    bible();
    const { getByRole } = render(<ScripturesHome onSelect={noop} onGenre={noop} onBack={noop} onSearch={noop} onHistory={noop} onSettings={noop}
      theme="dark" onThemeChange={noop} onCycleLayout={noop} translation="nkjv" onTranslation={noop} layout="genre" />);
    act(() => { fireEvent.click(getByRole('button', { name: /Bible translation/ })); });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await check();
  });

  it('a genre', async () => {
    bible();
    render(<ScriptureGenre genreId="law" onSelect={noop} onBack={noop} onSearch={noop} onHistory={noop} onSettings={noop} theme="dark" onThemeChange={noop} />);
    await check();
  });

  const studies = () => {
    put('studyCoverage', studyCoverage);
    put('studyCoverageDetail', studyCoverageDetail);
    put('CoverageBadge', CoverageBadge);
    put('AUDIO_MANIFEST', { 'study:purity-ch1': [['a', 'V']], 'study:lamb-of-god-ch1': [['c', 'V']] });
  };
  const STUDIES = [
    { id: 'purity', slug: 'purity', title: 'Purity', chapters: [{ id: 'purity-ch1' }] },
    { id: 'lamb-of-god', slug: 'lamb-of-god', title: 'Lamb of God', parts: [{ num: 1, chapterIds: ['lamb-of-god-ch1'] }, { num: 2, chapterIds: ['lamb-of-god-ch2'] }] },
    { id: 'trinity', slug: 'trinity', title: 'The Trinity', chapters: [{ id: 'trinity-ch1' }] },
    { id: 'later', slug: 'later', title: 'Later', locked: true },
  ];
  it('Studies, loaded', async () => {
    studies();
    render(<StudiesHome studies={STUDIES} studiesLoading={false} studiesError={null} onRetry={noop} onSelectStudy={noop} onOpenAnswers={noop}
      onBack={noop} onSearch={noop} onHistory={noop} onSettings={noop} theme="dark" onThemeChange={noop} />);
    await check();
  });
  it('Studies, loading and failed', async () => {
    studies();
    const loading = render(<StudiesHome studies={[]} studiesLoading studiesError={null} onRetry={noop} onSelectStudy={noop}
      onBack={noop} onSearch={noop} onHistory={noop} onSettings={noop} theme="dark" onThemeChange={noop} />);
    expect(loading.getByRole('status').textContent).toBe('Loading studies…');
    await check();
    cleanup();
    const failed = render(<StudiesHome studies={[]} studiesLoading={false} studiesError="x" onRetry={noop} onSelectStudy={noop}
      onBack={noop} onSearch={noop} onHistory={noop} onSettings={noop} theme="dark" onThemeChange={noop} />);
    expect(failed.getByRole('alert').textContent).toBe('Couldn’t load studies.');
    await check();
  });
});

describe('axe — About', () => {
  it('both pages', async () => {
    const { getByRole } = render(<AboutScreen onContinue={noop} onBack={noop} onSearch={noop} onHistory={noop} theme="dark" onThemeChange={noop} />);
    await check();
    fireEvent.click(getByRole('button', { name: 'Continue' }));
    await check();
  });
});

describe('axe — Reading plans and the plan builder', () => {
  const daysAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); d.setHours(12); return d; };
  const plans = () => {
    put('ConfirmStrip', ({ question, yesLabel, onConfirm, onCancel }) => (
      <div><span>{question}</span><button type="button" onClick={onConfirm}>{yesLabel || 'Yes'}</button><button type="button" onClick={onCancel}>No</button></div>
    ));
    const COL = { volKey: 'seven', readKey: 'volume-seven', label: 'Volume Seven', letterScreen: 'seven-letter' };
    const LETTERS = Array.from({ length: 4 }, (_, i) => ({ id: 'seven-' + (i + 1), title: 'Letter ' + (i + 1), paragraphs: [{ text: 'word '.repeat(600) }] }));
    put('READING_CHAIN', ['seven']);
    put('COL_BY_KEY', new Map([['seven', COL]]));
    put('colLetterArr', () => LETTERS);
    put('colPreface', () => null);
  };
  const screenOf = () => render(<ReadingPlansScreen readingPlans={[]} isRead={() => false} markAsReadEnabled onPlansMoved={noop} onRead={noop} onBack={noop} />);

  it('no plan yet', async () => {
    plans();
    screenOf();
    await check();
  });

  it('a plan running behind, its details open', async () => {
    plans();
    let run = startCatalogPlan('bible-year', null, daysAgo(4));
    for (const it of run.tracks[0].items.slice(0, 3)) run = tickItem(run, it.k, todayKey(daysAgo(4)), 1);
    ReadingPlanStore.put(run);
    const { getByRole } = screenOf();
    await check();
    fireEvent.click(getByRole('button', { name: 'Plan details' }));
    await check();
    fireEvent.click(getByRole('button', { name: 'Previous month' }));   // the days before the plan began
    // a day that opens nothing is a named image, never a bare span whose aria-label nothing reads
    expect([...document.querySelectorAll('span.plans-day[aria-label]')].filter((d) => d.getAttribute('role') !== 'img')).toEqual([]);
    await check();
    fireEvent.click(getByRole('button', { name: 'Change pace' }));
    await check();
  });

  it('the builder, each step', async () => {
    plans();
    const { getByRole } = screenOf();
    fireEvent.click(getByRole('button', { name: /Build your own plan/ }));
    await check();
    fireEvent.click(getByRole('button', { name: 'Pick chapters of Genesis' }));
    for (const c of [1, 2, 3, 4]) fireEvent.click(getByRole('button', { name: 'Genesis ' + c }));
    await check();
    fireEvent.click(getByRole('button', { name: 'Next' }));
    await check();
  });
});

describe('axe — the Garden', () => {
  it('a page', async () => {
    put('PlatformBridge', { setImmersiveMode: noop, getNetworkInfo: () => ({ metered: false, slow: false }) });
    put('gardenTierLimits', () => ({ ahead: 0, lru: 5 }));
    put('gardenIsCached', () => true);
    put('gardenPreload', noop);
    put('gardenCrawled', new Set());
    put('gardenImageCache', {});
    put('gardenCacheKey', (p, t) => `${t}:${p}`);
    put('gardenUrl', (p) => `https://example.test/${p}.jpg`);
    put('GARDEN_TOTAL', 209);
    put('GardenPosStore', { getState: () => 'loaded', get: () => 0, set: noop, subscribe: () => () => {} });
    const { getByRole } = render(<GardenView page={3} onPageChange={noop} onBack={noop} theme="dark" onThemeChange={noop} tier="std" />);
    await check();
    fireEvent.click(getByRole('button', { name: /jump to a page/ }));
    expect(getByRole('spinbutton', { name: 'Jump to page' })).toBeTruthy();
    await check();
  });

  it('a page that failed to load says so out loud', async () => {
    put('PlatformBridge', { setImmersiveMode: noop, getNetworkInfo: () => ({ metered: false, slow: false }) });
    put('gardenTierLimits', () => ({ ahead: 0, lru: 5 }));
    put('gardenIsCached', () => false);
    put('gardenPreload', noop);
    put('gardenCrawled', new Set());
    put('gardenImageCache', {});
    put('gardenCacheKey', (p, t) => `${t}:${p}`);
    put('gardenUrl', (p) => `https://example.test/${p}.jpg`);
    put('GARDEN_TOTAL', 209);
    put('GardenPosStore', { getState: () => 'loaded', get: () => 0, set: noop, subscribe: () => () => {} });
    const { container, getByRole } = render(<GardenView page={3} onPageChange={noop} onBack={noop} theme="dark" onThemeChange={noop} tier="std" />);
    fireEvent.error(container.querySelector('.garden-page-img'));
    expect(getByRole('alert').textContent).toMatch(/Failed to load|No connection/);
    await check();
  });
});

describe('axe — Settings', () => {
  afterEach(() => teardownSettingsGlobals());
  const GROUPS = [
    { id: 'volumes', label: 'The Volumes of Truth', genres: [{ label: 'The Seven Volumes', books: [{ id: 'volume-one', label: 'Volume One', total: 10 }] }] },
    { id: 'studies', label: 'Studies', genres: [{ label: 'Studies', books: [{ id: 'matthew', label: 'Matthew Study', total: 28 }] }] },
  ];
  it('every group open, with reading progress and a section open', async () => {
    setupSettingsGlobals({ ScreenLayout: Layout, buildProgressGroups: () => GROUPS, countReadFor: () => 1 });
    const { getAllByRole } = renderSettings({ markAsRead: true }, { readItems: { 'v1:volume-one:1': 1 }, historyCount: 3, onAbout: noop });
    await act(async () => { await Promise.resolve(); });
    expect(document.querySelectorAll('.settings-group-body').length).toBeGreaterThan(5);
    fireEvent.click(getAllByRole('button', { name: /The Volumes of Truth/ }).find((b) => b.classList.contains('progress-section-toggle')));
    await check();
  });

  it('the Clear All My Data dialog', async () => {
    setupSettingsGlobals({ ScreenLayout: Layout });
    const { getByRole } = renderSettings();
    act(() => { fireEvent.click(getByRole('button', { name: 'Clear All My Data' })); });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await check();
  });

  it('filtered by the find box', async () => {
    setupSettingsGlobals({ ScreenLayout: Layout });
    const { getByLabelText } = renderSettings({}, {}, { expandGroups: false });
    fireEvent.change(getByLabelText('Find settings'), { target: { value: 'font' } });
    await check();
  });
});

describe('axe — the hub components on their own', () => {
  it('ModeToggle, PlanRibbon, CoverageBadge', async () => {
    ReadingPlanStore.put(tickItem(startCatalogPlan('bible-year', null, new Date()), 'genesis:1', todayKey(new Date()), 1));
    window.__votOpenPlanItem = noop;
    render(<main>
      <ModeToggle mode="pdf" onChange={noop} showStudy onShowStudyChange={noop} />
      <PlanRibbon bid="genesis" cid={1} />
      <CoverageBadge state="read-along" detail="1 of 2 parts" />
      <CoverageBadge state="no-recording" />
    </main>);
    expect(document.querySelector('.plan-ribbon')).not.toBeNull();
    await check();
  });

  it('InstallCard and its steps sheet', async () => {
    Object.defineProperty(window.navigator, 'userAgent', { configurable: true, get: () => 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1' });
    put('StateStore', { get: () => ({ readItems: { 'v1:genesis:1': 1 } }), subscribe: () => () => {}, getVersion: () => 1 });
    put('StorageHealth', { _isStandalone: () => false });
    put('PlatformBridge', { isAndroid: false });
    _resetInstallCardSession();
    const { getByRole } = render(<main><InstallCard unitKey="genesis:1" /></main>);
    expect(document.querySelector('.install-card')).not.toBeNull();
    await check();
    act(() => { fireEvent.click(getByRole('button', { name: 'Show me how' })); });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await check();
  });

  it("What's new, with changes and empty", async () => {
    render(<main><WhatsNewSheet /></main>);
    act(() => { window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { items: [{ t: Date.now(), text: 'Build your own reading plan.' }] } })); });
    await check();
    act(() => { window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: { items: [] } })); });
    await check();
  });

  it('SettingsRow, SelectField (open) and FontPickerRow', async () => {
    put('READING_FONTS', READING_FONTS);
    put('readingFontById', readingFontById);
    put('SelectField', SelectField);
    const { getByRole } = render(<main>
      <SettingsRow label="Mark as read" desc="Ticks a chapter when you finish it." checked onToggle={noop} />
      <SettingsRow label="Keep screen on" checked={false} onToggle={noop} disabled disabledReason="Only in the app." />
      <SelectField label="Bible Translation" desc="The default edition." value="nkjv" options={[{ id: 'nkjv', label: 'NKJV', desc: 'New King James' }, { id: 'kjv', label: 'KJV' }]} onChange={noop} />
      <FontPickerRow value="classic" onSelect={noop} />
    </main>);
    fireEvent.click(getByRole('button', { name: 'Show description for Mark as read' }));
    await check();
    act(() => { fireEvent.click(getByRole('button', { name: /^Bible Translation:/ })); });
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    await check();
  });
});
