// @ts-nocheck — installs free-var globals; SettingsScreen takes no ES imports
/* SettingsScreen test harness — NOT a test file (no *.test.jsx suffix, so
   vitest does not collect it; import it from one that is).
   ═══════════════════════════════════════════════════════════════════════
   SettingsScreen is ~1400 lines with ZERO ES imports: every dependency is a
   free-var global resolved at runtime through the classic-script lexical
   environment — 73 of them. That cost is why the screen had no test at all,
   and why its render gates were verified only by hand in a browser.

   This module pays that cost ONCE. `setupSettingsGlobals()` installs the
   whole surface; `renderSettings()` mounts the screen with sane defaults.

   TWO DELIBERATE CHOICES:

   - The four ROW components are the REAL ones (SettingsRow, SelectField,
     ConfirmStrip, ClearProgressRow). A stubbed row would let a test stay
     green while the actual toggle markup, disabled handling, or label
     wiring rotted underneath it — and those are exactly what assertions
     read. Testing layered UI as an integration pair is the point.
   - Everything ELSE is stubbed at the FAR boundary: stores, the platform
     bridge, backup/import plumbing, corpus loaders, storage measurement.
     None of it participates in a render gate, and faking it deeply would
     only test the fakes.

   It deliberately does NOT import `vi`: keeping vitest out of this module
   is what lets it live outside the test-file glob. Callers pass their own
   spies as props to renderSettings. */

import { render, fireEvent } from '@testing-library/react';
import { SettingsScreen } from './SettingsScreen.jsx';
import { SettingsRow } from '../components/SettingsRow.jsx';
import { SelectField } from '../components/SelectField.jsx';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';
import { ClearProgressRow } from '../components/ClearProgressRow.jsx';
import { FontPickerRow } from '../components/FontPickerRow.jsx';
import { READING_FONTS, readingFontById } from '../../utils/reading-fonts.js';
import { LibraryNav } from '../components/LibraryNav.jsx';
import { NavButtons } from '../components/NavButtons.jsx';
import { clampLpm } from '../../hooks/use-autoscroll.js';
import { clampEndDwell } from '../components/ReadingChromeProvider.jsx';

const INSTALLED = [];
function put(name, value) { INSTALLED.push(name); globalThis[name] = value; }

/** A store stub satisfying the subscribe / version / count-shaped reads. */
function fakeStore(extra) {
  return {
    subscribe: () => () => {}, getVersion: () => 0, all: () => ({}), count: () => 0,
    get: () => null, set: () => {}, remove: () => {}, clear: () => {},
    // Destructive imports require every store to be fully hydrated.
    getState: () => 'loaded',
    ...extra,
  };
}

/**
 * Install every global SettingsScreen resolves at runtime.
 * @param {Record<string, any>} [overrides] replace any stub by name.
 */
export function setupSettingsGlobals(overrides = {}) {
  // Real row components — the assertions read their markup.
  put('SettingsRow', SettingsRow);
  put('SelectField', SelectField);
  put('ConfirmStrip', ConfirmStrip);
  put('ClearProgressRow', ClearProgressRow);
  put('clampLpm', clampLpm);
  put('clampEndDwell', clampEndDwell);
  // Reading Font picker — real component + real registry (all fonts are
  // vendored + @font-face'd, so there is no loader boundary to stub).
  put('FontPickerRow', FontPickerRow);
  put('READING_FONTS', READING_FONTS);
  put('readingFontById', readingFontById);

  // Chrome the screen renders around its cards.
  put('ScreenLayout', ({ children, navChildren }) => (
    <div data-testid="screen-layout">{navChildren}{children}</div>
  ));
  put('HomeBtn', () => null);
  put('ThemeBtn', () => null);
  put('LibraryNav', LibraryNav);
  put('NavButtons', NavButtons);

  // Select option tables (index.html globals in the real app).
  put('TRANSLATION_OPTIONS', [{ id: 'nkjv', label: 'NKJV', desc: '' }]);
  put('ARROW_LAYOUT_OPTIONS', [{ id: 'split', label: 'Split', desc: '' }]);
  put('SCRIPTURE_LAYOUT_OPTIONS', [{ id: 'genre', label: 'Genre', desc: '' }]);
  put('GARDEN_TIERS', [{ id: 'balanced', label: 'Balanced', desc: '' }]);
  put('GARDEN_DEFAULT_TIER', 'balanced');

  // Render-time helpers.
  put('useStorageInfo', () => ({ usage: 0, quota: 0, persisted: false }));
  put('buildProgressGroups', () => []);
  put('countReadFor', () => 0);
  put('READ_VERSION_ID', 'v1');
  put('measureUserData', () => Promise.resolve({ bytes: 0, counts: {} }));
  put('recordUserDataSample', () => Promise.resolve([]));
  put('getUserDataSamples', () => Promise.resolve([]));
  put('formatBytes', (n) => `${n} B`);
  put('formatImportSpaceWarning', () => null);

  // Lazy corpora. The mount effect chains .catch() on the loaders, so they
  // must be thenable.
  put('__loadBibleCorpus', () => Promise.resolve());
  put('__loadVotCorpus', () => Promise.resolve());
  put('__bibleCorpus', { subscribe: () => () => {}, getVersion: () => 0 });
  put('__votCorpus', { subscribe: () => () => {}, getVersion: () => 0 });
  put('BOOKS', {});
  put('LETTERS', []);
  put('LETTERS_V1', []);

  // Platform + diagnostics.
  put('PlatformBridge', {
    isAndroid: false, setKeepScreenOn: () => {}, saveToFile: () => {},
    openFilePicker: () => {}, openExportSink: () => null, pickImportFile: () => null,
    clearGardenCache: () => {}, getCrashLog: () => '[]',
  });
  put('DiagnosticLog', { error: () => {}, all: () => [], clear: () => {} });
  put('StorageHealth', {
    subscribe: () => () => {}, getSnapshot: () => ({ tier: 'ok' }),
    onWriteFailure: () => () => {}, ensurePersistence: () => Promise.resolve(false),
    getPlatform: () => ({ name: 'web', persisted: false, privateMode: false }),
  });
  put('showToast', () => {});
  put('hideToast', () => {});
  put('IDBAdapter', { deleteDatabase: () => Promise.resolve(), open: () => Promise.resolve(null) });

  // Stores touched by handlers/effects, never by a render gate.
  for (const s of ['StateStore', 'AnnotationStore', 'NoteStore', 'BookmarkStore',
    'LinkStore', 'NotebookStore', 'HistoryStore', 'JournalStore', 'JournalIndexStore',
    'JournalMediaStore', 'JournalNotebookStore', 'JournalStatsStore', 'ReadingStreakStore', 'ReadingStatsStore',
    'ProphecyCardsStore', 'RecentNavStore', 'HomeOrderStore', 'GardenPosStore',
    'WelcomedFlagStore', 'AboutSeenFlagStore', 'GardenWarningFlagStore']) put(s, fakeStore());

  // Backup/import plumbing — reachable only from buttons a render test never presses.
  for (const f of ['buildExportPayload', 'applyImportPayload', 'buildV3Manifest', 'applyV3',
    'writeContainer', 'readContainer', 'isContainerMagic', 'runV3AndroidExport',
    'classifyV3ImportBegin', 'v3AndroidImportEntries', 'validateImportEnvelope',
    'validateStorePayload', 'validateMediaRecord']) put(f, () => {});
  // Pass-through (NOT a no-op): a stubbed lock must still run the operation,
  // or every Export/Verify/Clear press in a test would silently do nothing.
  put('withBackupLock', (op) => op());

  for (const [k, v] of Object.entries(overrides)) put(k, v);
}

/** Remove everything setupSettingsGlobals installed. Call in afterEach. */
export function teardownSettingsGlobals() {
  while (INSTALLED.length) delete globalThis[INSTALLED.pop()];
}

const DEFAULTS = { translation: 'nkjv', fontScale: '1', arrowLayout: 'split', scriptureLayout: 'genre' };

/** Every accordion group header currently rendered. */
export const groupHeads = () => [...document.querySelectorAll('.settings-group-head')];

/** The group header whose label matches, or undefined. */
export const groupHead = (label) => groupHeads()
  .find((h) => { const l = h.querySelector('.settings-section-label'); return l && l.textContent.trim() === label; });

/** Open every collapsed group (the redesign mounts group bodies lazily). */
export function expandAllGroups() {
  for (const head of groupHeads()) {
    if (head.getAttribute('aria-expanded') === 'false') fireEvent.click(head);
  }
}

/**
 * Mount SettingsScreen with `settings` merged over sane defaults. Pass
 * `onSetting` / `onToggle` (your own spies) via `props` to assert writes.
 * Groups default COLLAPSED in production (redesign 2026-07-31); this
 * helper expands them all post-render so row-level assertions keep
 * working — pass `{ expandGroups: false }` to test the collapsed state.
 */
export function renderSettings(settings = {}, props = {}, { expandGroups = true } = {}) {
  const result = render(
    <SettingsScreen
      settings={{ ...DEFAULTS, ...settings }}
      onToggle={() => {}}
      onSetting={() => {}}
      onBack={() => {}}
      onSearch={() => {}}
      onHistory={() => {}}
      theme="dark"
      onThemeChange={() => {}}
      readItems={{}}
      onClearBook={() => {}}
      onClearAll={() => {}}
      onClearHistory={() => {}}
      historyCount={0}
      {...props}
    />
  );
  if (expandGroups) expandAllGroups();
  return result;
}

/** Labels of every settings row currently MOUNTED. */
export const rowLabels = () =>
  [...document.querySelectorAll('.settings-row-label')].map((l) => l.textContent.trim());

/** The row with this exact label, or undefined when it is unmounted. */
export const row = (label) => [...document.querySelectorAll('.settings-row')]
  .find((r) => { const l = r.querySelector('.settings-row-label'); return l && l.textContent.trim() === label; });
