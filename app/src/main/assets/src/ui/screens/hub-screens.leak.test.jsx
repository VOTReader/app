// @ts-nocheck — free-var globals stubbed per test (bundle-d screen contract)
/* Leak gate for the HUB screens (leak hunt, 2026-11-01).
   ─────────────────────────────────────────────────────────────────────
   Home, Volumes, Scriptures, a genre, Studies, About, Reading plans, the Garden
   and Settings, each mounted and unmounted 20 times in jsdom with the real
   ScreenLayout, LibraryNav and NavButtons around it. Every listener, timer,
   frame, observer, store subscription, channel, database connection and object
   URL a mount starts must be gone after its unmount (ui/leak/leak-harness.js).
   Fixtures and globals mirror hub-screens.axe.test.jsx. The harness is installed
   after a test's globals, so it sees their subscribe() too. */
import 'fake-indexeddb/auto';
import { describe, it, beforeEach, afterEach } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import * as ReactDOM from 'react-dom';
import { installLeakHarness, expectNoLeaks } from '../leak/leak-harness.js';
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

const noop = () => {};
const INSTALLED = new Set();
function put(name, value) { INSTALLED.add(name); globalThis[name] = value; }
/** The real layout, without the Tabs button (a bundle-d global of its own). */
const Layout = (p) => <RealScreenLayout hideTabsBtn {...p} />;

/** A store's subscribe with real add/remove semantics, so the harness counts what stays subscribed. */
const corpus = () => { const l = new Set(); return { subscribe: (cb) => { l.add(cb); return () => { l.delete(cb); }; }, getVersion: () => 1, loaded: true }; };
let harness;
/** Mount → (interact) → unmount, 20 times; nothing it started may outlive it. */
const leakFree = (label, mount, interact) => {
  harness = harness || installLeakHarness();
  return expectNoLeaks(harness, mount, { label, interact, cycles: 20 });
};

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
  if (harness) { harness.restore(); harness = null; }
  cleanup();
  for (const k of INSTALLED) delete globalThis[k];
  INSTALLED.clear();
  ['__loadVotCorpus', '__loadBibleCorpus', '__loadMatthewCorpus', '__votCorpus', '__bibleCorpus', '__votOpenPlanItem', '__homeAnimShown'].forEach((k) => { delete window[k]; });
  localStorage.clear();
});


describe('leaks — Home', () => {
  const home = (props = {}) => render(
    <HomeScreen onSelect={noop} onSurprise={noop} showSurprise onSettings={noop} onSearch={noop} onHistory={noop}
      historyEnabled onAbout={noop} history={[]} theme="dark" onThemeChange={noop} translation="nkjv"
      onNotes={noop} onBookmarks={noop} onHighlights={noop} onScriptureWeb={noop} onContinue={noop} onStartHere={noop}
      readingPlans={[]} isRead={() => false} markAsReadEnabled onPlanRead={noop} onOpenPlans={noop} onPlansMoved={noop}
      {...props} />,
  );
  const globals = () => {
    put('HomeOrderStore', { get: () => ['volumes', 'scriptures', 'answers', 'studies', 'listening', 'songs', 'library', 'settings', 'history'], set: noop });
    put('createPressDrag', () => ({ start: noop, suppressed: () => false, destroy: noop, land: noop }));
    put('translationLabel', () => 'NKJV');
  };
  it('first run', async () => { globals(); await leakFree('HomeScreen', () => home()); });
  it('with a plan running and a place to continue', async () => {
    globals();
    ReadingPlanStore.put(startCatalogPlan('bible-year', null, new Date()));
    await leakFree('HomeScreen (plan)', () => home({ history: [{ type: 'chapter', bookTitle: 'Genesis', chapterNum: 3 }] }));
  });
});

describe('leaks — Volumes, Scriptures, a genre, Studies', () => {
  it('Volumes', async () => {
    const keys = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'rebuke', 'wtlb1', 'wtlb2', 'blessed', 'flock', 'timothy', 'holydays'];
    put('COL_BY_KEY', new Map(keys.map((k) => [k, { volKey: k }])));
    put('colLetterArr', (col) => new Array(col && col.volKey === 'seven' ? 0 : 12).fill(0));
    put('GARDEN_TOTAL', 209);
    window.__votCorpus = corpus();
    window.__loadVotCorpus = () => Promise.resolve();
    await leakFree('VolumesHome', () => render(<VolumesHome onSelect={noop} onBack={noop} onSearch={noop} onHistory={noop} onSettings={noop} theme="dark" onThemeChange={noop} />));
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
    window.__bibleCorpus = corpus();
    window.__loadBibleCorpus = () => Promise.resolve();
  };
  const scriptures = (layout) => render(<ScripturesHome onSelect={noop} onGenre={noop} onBack={noop} onSearch={noop} onHistory={noop} onSettings={noop}
    theme="dark" onThemeChange={noop} onCycleLayout={noop} translation="nkjv" onTranslation={noop} layout={layout} />);
  it.each(['genre', 'canonical'])('Scriptures, the %s layout', async (layout) => {
    bible();
    await leakFree('ScripturesHome ' + layout, () => scriptures(layout));
  });
  it('Scriptures with the translation picker open at unmount', async () => {
    bible();
    await leakFree('ScripturesHome + picker', () => scriptures('genre'), (r) => { fireEvent.click(r.getByRole('button', { name: /Bible translation/ })); });
  });
  it('a genre', async () => {
    bible();
    await leakFree('ScriptureGenre', () => render(<ScriptureGenre genreId="law" onSelect={noop} onBack={noop} onSearch={noop} onHistory={noop} onSettings={noop} theme="dark" onThemeChange={noop} />));
  });
  it('Studies', async () => {
    put('studyCoverage', studyCoverage);
    put('studyCoverageDetail', studyCoverageDetail);
    put('CoverageBadge', CoverageBadge);
    put('AUDIO_MANIFEST', { 'study:purity-ch1': [['a', 'V']] });
    const STUDIES = [
      { id: 'purity', slug: 'purity', title: 'Purity', chapters: [{ id: 'purity-ch1' }] },
      { id: 'later', slug: 'later', title: 'Later', locked: true },
    ];
    await leakFree('StudiesHome', () => render(<StudiesHome studies={STUDIES} studiesLoading={false} studiesError={null} onRetry={noop} onSelectStudy={noop} onOpenAnswers={noop}
      onBack={noop} onSearch={noop} onHistory={noop} onSettings={noop} theme="dark" onThemeChange={noop} />));
  });
});

describe('leaks — About', () => {
  it('both pages', async () => {
    await leakFree('AboutScreen', () => render(<AboutScreen onContinue={noop} onBack={noop} onSearch={noop} onHistory={noop} theme="dark" onThemeChange={noop} />),
      (r) => { fireEvent.click(r.getByRole('button', { name: 'Continue' })); });
  });
});

describe('leaks — Reading plans', () => {
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
  it('a plan running, its details open', async () => {
    plans();
    let run = startCatalogPlan('bible-year', null, daysAgo(4));
    for (const it of run.tracks[0].items.slice(0, 3)) run = tickItem(run, it.k, todayKey(daysAgo(4)), 1);
    ReadingPlanStore.put(run);
    await leakFree('ReadingPlansScreen', screenOf, (r) => { fireEvent.click(r.getAllByRole('button', { name: 'Plan details' })[0]); });
  });
  it('the plan builder open', async () => {
    plans();
    await leakFree('PlanBuilder', screenOf, (r) => { fireEvent.click(r.getByRole('button', { name: /Build your own plan/ })); });
  });
});

describe('leaks — the Garden', () => {
  it('a page, the page picker open', async () => {
    put('PlatformBridge', { setImmersiveMode: noop, getNetworkInfo: () => ({ metered: false, slow: false }) });
    put('gardenTierLimits', () => ({ ahead: 0, lru: 5 }));
    put('gardenIsCached', () => true);
    put('gardenPreload', noop);
    put('gardenCrawled', new Set());
    put('gardenImageCache', {});
    put('gardenCacheKey', (p, t) => `${t}:${p}`);
    put('gardenUrl', (p) => `https://example.test/${p}.jpg`);
    put('GARDEN_TOTAL', 209);
    const l = new Set();
    put('GardenPosStore', { getState: () => 'loaded', get: () => 0, set: noop, subscribe: (cb) => { l.add(cb); return () => { l.delete(cb); }; } });
    await leakFree('GardenView', () => render(<GardenView page={3} onPageChange={noop} onBack={noop} theme="dark" onThemeChange={noop} tier="std" />),
      (r) => { fireEvent.click(r.getByRole('button', { name: /jump to a page/ })); });
  });
});

describe('leaks — Settings', () => {
  afterEach(() => teardownSettingsGlobals());
  it('Settings', async () => {
    setupSettingsGlobals({ ScreenLayout: Layout });
    await leakFree('SettingsScreen', () => renderSettings());
  });
  it('Settings with the Clear All My Data dialog open', async () => {
    setupSettingsGlobals({ ScreenLayout: Layout });
    // Each mount starts from the same stored state (the harness's group-expand clicks are remembered).
    await leakFree('SettingsScreen + dialog', () => { localStorage.clear(); return renderSettings(); }, (r) => { fireEvent.click(r.getByRole('button', { name: 'Clear All My Data' })); });
  });
});
