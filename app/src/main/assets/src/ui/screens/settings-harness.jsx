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

import { render } from '@testing-library/react';
import { SettingsScreen } from './SettingsScreen.jsx';
import { SettingsRow } from '../components/SettingsRow.jsx';
import { SelectField } from '../components/SelectField.jsx';
import { ConfirmStrip } from '../components/ConfirmStrip.jsx';
import { ClearProgressRow } from '../components/ClearProgressRow.jsx';
import { clampLpm } from '../../hooks/use-autoscroll.js';
import { clampEndDwell } from '../components/ReadingChromeProvider.jsx';

const INSTALLED = [];
function put(name, value) { INSTALLED.push(name); globalThis[name] = value; }

/** A store stub satisfying the subscribe / version / count-shaped reads. */
function fakeStore(extra) {
  return {
    subscribe: () => () => {}, getVersion: () => 0, all: () => ({}), count: () => 0,
    get: () => null, set: () => {}, remove: () => {}, clear: () => {},
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

  // Chrome the screen renders around its cards.
  put('ScreenLayout', ({ children, navChildren }) => (
    <div data-testid="screen-layout">{navChildren}{children}</div>
  ));
  put('HomeBtn', () => null);
  put('ThemeBtn', () => null);

  // Select option tables (index.html globals in the real app).
  put('TRANSLATION_OPTIONS', [{ id: 'nkjv', label: 'NKJV', desc: '' }]);
  put('ARROW_LAYOUT_OPTIONS', [{ id: 'split', label: 'Split', desc: '' }]);
  put('SCRIPTURE_LAYOUT_OPTIONS', [{ id: 'genre', label: 'Genre', desc: '' }]);
  put('GARDEN_TIERS', [{ id: 'balanced', label: 'Balanced', desc: '' }]);
  put('GARDEN_DEFAULT_TIER', 'balanced');

  // Render-time helpers.
  put('useStorageInfo', () => ({ usage: 0, quota: 0, persisted: false }));
  put('useBackupReminder', () => {});
  put('buildProgressGroups', () => []);
  put('countReadFor', () => 0);
  put('measureUserData', () => Promise.resolve({ bytes: 0, counts: {} }));
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
    clearGardenCache: () => {}, getCrashLog: () => Promise.resolve(''),
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
    'JournalMediaStore', 'JournalNotebookStore', 'JournalStatsStore', 'ReadingStreakStore',
    'ProphecyCardsStore', 'RecentNavStore', 'HomeOrderStore', 'GardenPosStore',
    'WelcomedFlagStore', 'AboutSeenFlagStore', 'GardenWarningFlagStore']) put(s, fakeStore());

  // Backup/import plumbing — reachable only from buttons a render test never presses.
  for (const f of ['buildExportPayload', 'applyImportPayload', 'buildV3Manifest', 'applyV3',
    'writeContainer', 'readContainer', 'isContainerMagic', 'runV3AndroidExport',
    'classifyV3ImportBegin', 'v3AndroidImportEntries', 'validateImportEnvelope',
    'validateStorePayload', 'validateMediaRecord']) put(f, () => {});

  for (const [k, v] of Object.entries(overrides)) put(k, v);
}

/** Remove everything setupSettingsGlobals installed. Call in afterEach. */
export function teardownSettingsGlobals() {
  while (INSTALLED.length) delete globalThis[INSTALLED.pop()];
}

const DEFAULTS = { translation: 'nkjv', fontScale: '1', arrowLayout: 'split', scriptureLayout: 'genre' };

/**
 * Mount SettingsScreen with `settings` merged over sane defaults. Pass
 * `onSetting` / `onToggle` (your own spies) via `props` to assert writes.
 */
export function renderSettings(settings = {}, props = {}) {
  return render(
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
}

/** Labels of every settings row currently MOUNTED. */
export const rowLabels = () =>
  [...document.querySelectorAll('.settings-row-label')].map((l) => l.textContent.trim());

/** The row with this exact label, or undefined when it is unmounted. */
export const row = (label) => [...document.querySelectorAll('.settings-row')]
  .find((r) => { const l = r.querySelector('.settings-row-label'); return l && l.textContent.trim() === label; });
