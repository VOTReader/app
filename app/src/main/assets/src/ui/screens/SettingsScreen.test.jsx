// @ts-nocheck — the harness installs free-var globals for this screen
/* SettingsScreen — the auto-scroll disclosure contract.
   ═══════════════════════════════════════════════════════════════════════
   Rendering this screen at all requires 73 runtime globals; ./settings-
   harness.jsx pays that cost once so assertions here stay cheap. The rows
   under test are the REAL SettingsRow / SelectField components, so this
   fails if their markup or wiring rots — not just if the gate does.

   WHAT IT PINS: auto-scroll's sub-settings are COLLAPSED (unmounted), not
   merely disabled, until the feature is on, and Auto-Continue Pause nests
   one level deeper under Auto-Continue. Unmounting is the load-bearing
   part of the owner's ask — a disabled row still occupies the page, still
   reads as maybe-usable, and is still in tab and screen-reader order.
   "Invisible and uninteractable" means GONE. */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { screen, cleanup, fireEvent, within, act } from '@testing-library/react';
import {
  setupSettingsGlobals, teardownSettingsGlobals, renderSettings, rowLabels, row,
  groupHeads, groupHead, groupRowLabels, fakeAudioLibrary,
} from './settings-harness.jsx';
import { classifyV3ImportBegin as realClassifyV3 } from '../../utils/backup-android.js';
import { showToast as realShowToast, hideToast as realHideToast, _resetToasts } from '../../utils/toast.js';

beforeEach(() => {
  setupSettingsGlobals();
  if (!window.matchMedia) {
    /** @type {any} */ (window).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  }
});
afterEach(() => { cleanup(); teardownSettingsGlobals(); vi.restoreAllMocks(); });

const slider = (label) => document.querySelector(`input[type="range"][aria-label*="${label}"]`);

describe('settings filter and lazy progress', () => {
  it('finds and expands backup settings, then restores the previous accordion state', () => {
    renderSettings({}, {}, { expandGroups: false });
    fireEvent.click(groupHead('Appearance'));
    fireEvent.change(screen.getByLabelText('Find settings'), { target: { value: 'backup' } });
    expect(groupHeads()).toHaveLength(1);
    expect(groupHead('Your Data').getAttribute('aria-expanded')).toBe('true');
    expect(row('Verify a Backup')).toBeTruthy();
    fireEvent.click(groupHead('Your Data'));
    expect(groupHead('Your Data').getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(groupHeads()).toHaveLength(10);   // nine plus the tour's Help group
    expect(groupHead('Appearance').getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(screen.getByLabelText('Find settings'));
  });

  it('finds the Help group by "tour", so a lost reader can get the tour back through the find box', () => {
    // RED on 47355cc1: matchesGroup('help') threw on SETTINGS_TOPICS['help'] for any query; the
    // defensive `|| []` would have hidden Help from every search instead.
    renderSettings({}, {}, { expandGroups: false });
    fireEvent.change(screen.getByLabelText('Find settings'), { target: { value: 'tour' } });
    expect(groupHeads()).toHaveLength(1);
    expect(groupHead('Help')).toBeTruthy();
    expect(screen.getAllByText(/Show me around/).length).toBeGreaterThanOrEqual(1);
  });

  it('handles hyphenated queries and explains no results', () => {
    renderSettings({}, {}, { expandGroups: false });
    const input = screen.getByLabelText('Find settings');
    fireEvent.change(input, { target: { value: 'read-along' } });
    expect(groupHead('Listening')).toBeTruthy();
    expect(groupHeads()).toHaveLength(1);
    fireEvent.change(input, { target: { value: 'nothing-matches-this' } });
    expect(groupHeads()).toHaveLength(0);
    expect(screen.getByRole('status').textContent).toContain('No matching settings');
  });

  it('does not load corpora for Appearance; opens them for Mark as Read', () => {
    window.__loadVotCorpus = vi.fn(() => Promise.resolve());
    window.__loadBibleCorpus = vi.fn(() => Promise.resolve());
    try {
      renderSettings({}, {}, { expandGroups: false });
      fireEvent.click(groupHead('Appearance'));
      expect(window.__loadVotCorpus).not.toHaveBeenCalled();
      expect(window.__loadBibleCorpus).not.toHaveBeenCalled();
      fireEvent.click(groupHead('Mark as Read'));
      expect(window.__loadVotCorpus).toHaveBeenCalledTimes(1);
      expect(window.__loadBibleCorpus).toHaveBeenCalledTimes(1);
    } finally {
      delete window.__loadVotCorpus;
      delete window.__loadBibleCorpus;
    }
  });
});

describe('harness', () => {
  it('renders the whole screen with the real row components', () => {
    renderSettings();
    expect(screen.getByTestId('screen-layout')).toBeTruthy();
    expect(rowLabels()).toContain('Auto-Scroll');
    expect(rowLabels().length).toBeGreaterThan(10);
  });
});

describe('settings preference folio', () => {
  it('summarizes the current visual reading choices', () => {
    renderSettings(
      { fontScale: '1.5', fontStyle: 'literata' },
      { theme: 'light' },
      { expandGroups: false }
    );
    const summary = document.querySelector('.settings-summary');
    expect(summary.textContent).toContain('Light');
    expect(summary.textContent).toContain('150%');
    expect(summary.textContent).toContain('Literata');
  });

  it('switches to the single-column large-type flow at 180% and above', () => {
    renderSettings({ fontScale: '1.75' }, {}, { expandGroups: false });
    expect(document.querySelector('.settings-screen').classList.contains('settings-large-type')).toBe(false);
    cleanup();
    renderSettings({ fontScale: '1.8' }, {}, { expandGroups: false });
    expect(document.querySelector('.settings-screen').classList.contains('settings-large-type')).toBe(true);
  });

  it('connects each expanded group header to its mounted body', () => {
    renderSettings({}, {}, { expandGroups: false });
    const head = groupHead('Appearance');
    fireEvent.click(head);
    const controlledId = head.getAttribute('aria-controls');
    expect(controlledId).toBe('settings-group-appearance');
    expect(document.getElementById(controlledId)).toBeTruthy();
  });
});

describe('auto-scroll settings disclosure', () => {
  const SUB_ROWS = ['Scroll Speed', 'Auto-Continue', 'Auto-Continue Pause'];

  it('COLLAPSES every sub-setting while auto-scroll is off', () => {
    renderSettings({ autoScroll: false });
    expect(rowLabels()).toContain('Auto-Scroll');
    for (const label of SUB_ROWS) expect(row(label)).toBeUndefined();
  });

  it('collapsed means UNMOUNTED, not disabled — nothing is left to interact with', () => {
    const { container } = renderSettings({ autoScroll: false });
    expect(container.querySelector('input[aria-label*="Auto-scroll speed"]')).toBeNull();
    expect(container.querySelector('input[aria-label*="Pause before continuing"]')).toBeNull();
    expect(screen.queryByText(/lines\/min/)).toBeNull();
  });

  it('reveals speed + auto-continue when auto-scroll is enabled', () => {
    renderSettings({ autoScroll: true });
    expect(row('Scroll Speed')).toBeTruthy();
    expect(row('Auto-Continue')).toBeTruthy();
    // …but the pause is meaningless until auto-continue is on.
    expect(row('Auto-Continue Pause')).toBeUndefined();
  });

  it('reveals the pause only when auto-continue is on', () => {
    renderSettings({ autoScroll: true, autoScrollNext: true });
    for (const label of SUB_ROWS) expect(row(label)).toBeTruthy();
  });

  it('never leaks the nested row when the parent feature is off', () => {
    // A profile imported with autoScrollNext:true must still collapse fully.
    renderSettings({ autoScroll: false, autoScrollNext: true });
    expect(row('Auto-Continue')).toBeUndefined();
    expect(row('Auto-Continue Pause')).toBeUndefined();
  });

  it('discloses progressively — each step adds rows, never removes one', () => {
    const seen = [];
    renderSettings({ autoScroll: false }); seen.push(rowLabels().length); cleanup();
    renderSettings({ autoScroll: true }); seen.push(rowLabels().length); cleanup();
    renderSettings({ autoScroll: true, autoScrollNext: true }); seen.push(rowLabels().length);
    expect(seen[1]).toBe(seen[0] + 2);  // speed + auto-continue
    expect(seen[2]).toBe(seen[1] + 1);  // + pause
  });
});

/* Read-along. Two keys, both default ON, and the SAME disclosure discipline:
   with no sentence wash there is nothing to follow, so the scroll row is
   unmounted rather than greyed. Behaviour lives in
   ui/components/ReadAlongHighlight.jsx (+ its own suite).
   These rows moved Reading → Listening (2026-08-09); the group-membership
   assertions live in the 'Listening group' block below. */
describe('read-along settings disclosure', () => {
  it('shows both rows checked when the settings have never been touched', () => {
    renderSettings();
    expect(row('Read-Along Highlight')).toBeTruthy();
    expect(row('Follow the Voice')).toBeTruthy();
    for (const label of ['Read-Along Highlight', 'Follow the Voice']) {
      expect(within(row(label)).getByRole('switch').getAttribute('aria-checked')).toBe('true');
    }
  });

  it('COLLAPSES the follow row while the wash is off — even if follow was saved on', () => {
    renderSettings({ readAlongHighlight: false, readAlongFollow: true });
    expect(row('Read-Along Highlight')).toBeTruthy();
    expect(row('Follow the Voice')).toBeUndefined();
  });

  it('keeps the wash while only the follow-scroll is switched off', () => {
    renderSettings({ readAlongHighlight: true, readAlongFollow: false });
    expect(within(row('Read-Along Highlight')).getByRole('switch').getAttribute('aria-checked')).toBe('true');
    expect(within(row('Follow the Voice')).getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });

  it('writes through the settings keys the reading views read', () => {
    const onToggle = vi.fn();
    renderSettings({}, { onToggle });
    fireEvent.click(within(row('Follow the Voice')).getByRole('switch'));
    expect(onToggle).toHaveBeenCalledWith('readAlongFollow');
    fireEvent.click(within(row('Read-Along Highlight')).getByRole('switch'));
    expect(onToggle).toHaveBeenCalledWith('readAlongHighlight');
  });
});

/* Listening (2026-08-09). Everything that shapes what you HEAR moved into
   one group between Reading and Auto-Scroll: the two voice pickers left
   Reading, and the read-along pair left the comment that promised this.
   Default Speed is the one row with no settings key — it reads and writes
   AudioLibraryStore.rate, the same preference the listening desk writes. */
describe('Listening group', () => {
  const LISTENING_ROWS = ['Bible Audio', 'Letter Voice', 'Default Speed',
    'Read-Along Highlight', 'Follow the Voice'];

  it('houses every listening row, and Reading houses none of them', () => {
    renderSettings();
    const listening = groupRowLabels('Listening');
    const reading = groupRowLabels('Reading');
    for (const label of LISTENING_ROWS) {
      expect(listening).toContain(label);
      expect(reading).not.toContain(label);
    }
    // Reading kept its own rows — this was a move, not a transplant of the group.
    expect(reading).toContain('Bible Translation');
    expect(reading).toContain('Chapter Titles');
  });

  it('sits between Reading and Auto-Scroll', () => {
    renderSettings({}, {}, { expandGroups: false });
    const labels = groupHeads().map((h) => h.querySelector('.settings-section-label').textContent.trim());
    expect(labels.indexOf('Listening')).toBe(labels.indexOf('Reading') + 1);
    expect(labels.indexOf('Auto-Scroll')).toBe(labels.indexOf('Listening') + 1);
  });

  it('keeps the read-along disclosure discipline inside its new group', () => {
    renderSettings({ readAlongHighlight: false });
    expect(groupRowLabels('Listening')).toContain('Read-Along Highlight');
    expect(groupRowLabels('Listening')).not.toContain('Follow the Voice');
  });

  it('shows the speed the listening library already holds — no settings key', () => {
    teardownSettingsGlobals();
    setupSettingsGlobals({ AudioLibraryStore: fakeAudioLibrary(1.5) });
    renderSettings();   // settings object carries NO audioRate — deliberately
    expect(within(row('Default Speed')).getByRole('button', { name: /1.5/ })).toBeTruthy();
  });

  it('writes the chosen speed THROUGH to the library store', () => {
    teardownSettingsGlobals();
    const library = fakeAudioLibrary(1);
    setupSettingsGlobals({ AudioLibraryStore: library });
    const onSetting = vi.fn();
    renderSettings({}, { onSetting });
    fireEvent.click(within(row('Default Speed')).getByRole('button', { name: /1×/ }));
    fireEvent.click(screen.getByText('1.25×'));
    expect(library.getPlaybackRate()).toBe(1.25);
    // The row re-reads the store it just wrote — one source of truth, live.
    expect(within(row('Default Speed')).getByRole('button', { name: /1.25/ })).toBeTruthy();
    // …and no parallel settings key was invented for it.
    expect(onSetting).not.toHaveBeenCalled();
  });

  it('prefers the player, which retimes live playback AND persists', () => {
    teardownSettingsGlobals();
    const library = fakeAudioLibrary(1);
    const applied = [];
    setupSettingsGlobals({
      AudioLibraryStore: library,
      // The real AudioPlayer.setPlaybackRate writes this same store; the stub
      // stands in for "the player is loaded", which is what the row branches on.
      AudioPlayer: { setPlaybackRate: (r) => { applied.push(r); library.setPlaybackRate(r); } },
    });
    renderSettings();
    fireEvent.click(within(row('Default Speed')).getByRole('button', { name: /1×/ }));
    fireEvent.click(screen.getByText('2×'));
    expect(applied).toEqual([2]);
    expect(library.getPlaybackRate()).toBe(2);
  });

  it('hides the speed row entirely when the library store is absent', () => {
    teardownSettingsGlobals();
    setupSettingsGlobals({ AudioLibraryStore: undefined });
    renderSettings();
    // Hidden, not a lying "1×": with no store there is nothing to read or write.
    expect(row('Default Speed')).toBeUndefined();
    expect(row('Bible Audio')).toBeTruthy();
  });
});

describe('mark-as-read section disclosure', () => {
  it('uses a keyboard-native disclosure button beside the separate Clear action', () => {
    teardownSettingsGlobals();
    setupSettingsGlobals({
      buildProgressGroups: () => [{
        id: 'scripture', label: 'Scriptures',
        genres: [{ label: 'Books', books: [{ id: 'genesis', label: 'Genesis', total: 50 }] }],
      }],
    });
    renderSettings({ markAsRead: true });

    const toggle = screen.getByRole('button', { name: /Scriptures\s*0 \/ 50/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText('Genesis')).toBeTruthy();
  });

  it('lets a partial-only reader clear saved positions even with zero read marks', () => {
    teardownSettingsGlobals();
    setupSettingsGlobals({
      buildProgressGroups: () => [{
        id: 'scripture', label: 'Scriptures',
        genres: [{ label: 'Books', books: [{ id: 'genesis', label: 'Genesis', total: 50 }] }],
      }],
      ReadingStatsStore: {
        subscribe: () => () => {}, getVersion: () => 0,
        get: () => ({ progress: { 'v1:genesis:1': { b: 3, c: [0], t: 1 } } }),
      },
    });
    const onClearBook = vi.fn();
    renderSettings({ markAsRead: true }, { onClearBook });
    fireEvent.click(screen.getByRole('button', { name: /Scriptures\s*0 \/ 50/ }));
    const clears = screen.getAllByRole('button', { name: 'Clear' });
    expect(clears.every((button) => !button.disabled)).toBe(true);
    fireEvent.click(clears[1]);
    expect(screen.getByText('Clear read marks and saved positions for “Genesis”?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Yes, clear' }));
    expect(onClearBook).toHaveBeenCalledWith('genesis');
  });
});

describe('auto-scroll controls', () => {
  it('the speed slider is bounded to the transport’s real range', () => {
    renderSettings({ autoScroll: true, autoScrollLpm: '16' });
    const s = slider('Auto-scroll speed');
    expect(s.min).toBe('4');
    expect(s.max).toBe('40');
    expect(s.value).toBe('16');
  });

  it('the dwell slider spans no-pause to a long sit, in half seconds', () => {
    renderSettings({ autoScroll: true, autoScrollNext: true, autoScrollEndMs: '2500' });
    const s = slider('Pause before continuing');
    expect(s.min).toBe('0');
    expect(s.max).toBe('15000');
    expect(s.step).toBe('500');
    expect(row('Auto-Continue Pause').querySelector('.settings-row-value').textContent).toBe('2.5s');
  });

  it('reads 0 as "None" rather than "0s"', () => {
    renderSettings({ autoScroll: true, autoScrollNext: true, autoScrollEndMs: '0' });
    expect(row('Auto-Continue Pause').querySelector('.settings-row-value').textContent).toBe('None');
  });

  it('still renders a legacy preset dwell value from before the slider', () => {
    renderSettings({ autoScroll: true, autoScrollNext: true, autoScrollEndMs: '6000' });
    expect(slider('Pause before continuing').value).toBe('6000');
    expect(row('Auto-Continue Pause').querySelector('.settings-row-value').textContent).toBe('6s');
  });

  it('clamps a corrupt persisted speed instead of rendering it', () => {
    renderSettings({ autoScroll: true, autoScrollLpm: '9999' });
    expect(slider('Auto-scroll speed').value).toBe('40');
  });

  it('writes speed changes back through onSetting', () => {
    const onSetting = vi.fn();
    renderSettings({ autoScroll: true, autoScrollLpm: '16' }, { onSetting });
    fireEvent.change(slider('Auto-scroll speed'), { target: { value: '24' } });
    expect(onSetting).toHaveBeenCalledWith('autoScrollLpm', '24');
  });

  it('writes dwell changes back through onSetting', () => {
    const onSetting = vi.fn();
    renderSettings({ autoScroll: true, autoScrollNext: true, autoScrollEndMs: '2500' }, { onSetting });
    fireEvent.change(slider('Pause before continuing'), { target: { value: '9000' } });
    expect(onSetting).toHaveBeenCalledWith('autoScrollEndMs', '9000');
  });

  it('toggling auto-scroll goes through onToggle so the key stays canonical', () => {
    const onToggle = vi.fn();
    renderSettings({ autoScroll: false }, { onToggle });
    fireEvent.click(row('Auto-Scroll').querySelector('.settings-toggle input[type="checkbox"]'));
    expect(onToggle).toHaveBeenCalledWith('autoScroll');
  });

  it('offers Reset only when the value has moved off standard', () => {
    renderSettings({ autoScroll: true, autoScrollLpm: '16' });
    expect(row('Scroll Speed').querySelector('.txtsize-reset').disabled).toBe(true);
    cleanup();
    renderSettings({ autoScroll: true, autoScrollLpm: '30' });
    expect(row('Scroll Speed').querySelector('.txtsize-reset').disabled).toBe(false);
  });
});

/* ───────────────────────────────────────────────────────────────────────
   Wave-0 Settings fixes — P1-9 toggle names, .votbak copy, native-dialog
   removal, wipe-dialog registry. modalRegistry is a real global (vitest
   .setup installs it); _reset() between tests because it's a singleton.
   window.location is replaced for the WHOLE FILE — jsdom's own
   location.reload is non-configurable, but window.location itself is
   (sw-register.test.js precedent).
   FILE-LEVEL, not per-test, and NEVER RESTORED (NOISE-1 fix, 2026-08-09):
   the import-success and clear-all flows schedule `setTimeout(reload,
   600)`, and the tests that drive them don't await the timer — so any
   restore (per-test afterEach OR a file-end afterAll) reinstates the
   REAL Location while a reload deferral is still pending, and the timer
   then fires jsdom's actual navigate() during a later test or the env
   teardown (stack-traced to SettingsScreen.jsx's import-success timer;
   the only symptom was jsdom's "Not implemented: navigation to another
   Document" notice). A fresh stub per test keeps the reload-called
   assertions exact; the real Location is deliberately never reinstated —
   the file's jsdom environment is discarded after the last test, nothing
   after it needs a live Location, and leaving the stub is the only state
   in which a straggler timer is provably silent. SettingsScreen touches
   location ONLY via reload() (verified by grep), so no test here needs
   the real Location object either.
   ─────────────────────────────────────────────────────────────────────── */
beforeEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: { reload: vi.fn() } });
});

describe('P1-9 — every settings toggle has an accessible name', () => {
  it('all mounted toggle rows expose a switch whose name matches their row label', () => {
    renderSettings({ autoScroll: true, autoScrollNext: true }); // max rows mounted
    const switches = screen.getAllByRole('switch');
    const toggleInputs = [...document.querySelectorAll('.settings-toggle input')];
    // Every visual toggle is in the accessibility tree as a switch…
    expect(switches.length).toBe(toggleInputs.length);
    expect(switches.length).toBeGreaterThan(10); // the ~19 production rows
    // …and each one carries its row's label as its accessible name. Pre-fix
    // these announced as "checkbox, checked" with no name at all.
    for (const sw of switches) {
      // Row toggles carry .settings-row-label; the Top-Nav chips carry
      // .settings-chip-label — both must equal the switch's aria-label.
      const host = sw.closest('.settings-row, .settings-chip');
      const labelEl = host.querySelector('.settings-row-label, .settings-chip-label');
      const label = labelEl.textContent.trim();
      expect(label.length).toBeGreaterThan(0);
      expect(sw.getAttribute('aria-label')).toBe(label);
      expect(sw.getAttribute('aria-checked')).toMatch(/^(true|false)$/);
    }
  });
});

describe('export/import copy names the real .votbak artifact', () => {
  const descOf = (label) => {
    const r = row(label);
    fireEvent.click(within(r).getByLabelText('Show description for ' + label));
    return r.querySelector('.settings-row-desc').textContent;
  };

  it('Export no longer promises a "single JSON file" the user will never find', () => {
    renderSettings();
    const desc = descOf('Export Your Data');
    expect(desc).toContain('.votbak');
    expect(desc).not.toContain('single JSON');
  });

  it('Import tells the user to pick the .votbak backup', () => {
    renderSettings();
    const desc = descOf('Import from Backup');
    expect(desc).toContain('.votbak');
  });
});

describe('v3 export manifest limit', () => {
  it('refuses to save a backup that no supported importer can restore', async () => {
    const build = vi.fn(async () => ({
      ok: true,
      manifest: { app: 'VOTReader', exportVersion: 3, stores: {}, media: [] },
      manifestBytes: 16 * 1024 * 1024 + 1,
      mediaEntries: [],
    }));
    const openExportSink = vi.fn(async () => ({ write: vi.fn(), close: vi.fn() }));
    const toast = vi.fn();
    teardownSettingsGlobals();
    setupSettingsGlobals({
      buildV3Manifest: build,
      showToast: toast,
      PlatformBridge: {
        isAndroid: false, setKeepScreenOn: () => {}, saveToFile: () => {},
        openFilePicker: () => {}, openExportSink, pickImportFile: () => null,
        clearGardenCache: () => {}, getCrashLog: () => '[]',
      },
    });
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));

    await vi.waitFor(() => expect(build).toHaveBeenCalledTimes(1));
    expect(openExportSink).not.toHaveBeenCalled();
    expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringMatching(/over the 16 MiB restore limit/),
    }));
  });

  /* storage-backup-2 follow-up: a store that could not save its newest change
     (failed IDB put, or hydration stuck at 'degraded') no longer blocks the
     export — the builder returns ok:true with that store on `problems`, and
     the backup goes out. The toast must caption it honestly rather than say a
     flat "Backup saved." The reader arrives here from StorageHealthBanner's
     "Export your data now", so an abort would have left them with nothing. */
  const exportWith = async (built) => {
    const build = vi.fn(async () => built);
    const toast = vi.fn();
    teardownSettingsGlobals();
    setupSettingsGlobals({
      buildV3Manifest: build,
      showToast: toast,
      PlatformBridge: {
        isAndroid: false, setKeepScreenOn: () => {}, saveToFile: () => {},
        openFilePicker: () => {}, openExportSink: vi.fn(async () => ({ write: vi.fn(), close: vi.fn() })),
        pickImportFile: () => null, clearGardenCache: () => {}, getCrashLog: () => '[]',
      },
    });
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    await vi.waitFor(() => expect(build).toHaveBeenCalledTimes(1));
    return toast;
  };
  const okManifest = (problems) => ({
    ok: true,
    manifest: { app: 'VOTReader', exportVersion: 3, stores: {}, media: [] },
    manifestBytes: 2048,
    mediaEntries: [],
    problems,
  });

  it('saves the backup and says what may be missing when a store could not save its newest change', async () => {
    const toast = await exportWith(okManifest(['vot-annotations']));
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringMatching(/Backup saved — 1 recent change may be missing/),
    })));
    expect(toast).not.toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringMatching(/Export aborted/),
    }));
  });

  it('plural when more than one store is behind', async () => {
    const toast = await exportWith(okManifest(['vot-annotations', 'vot-journal']));
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringMatching(/2 recent changes may be missing/),
    })));
  });

  it('stays a plain "Backup saved." when nothing is behind', async () => {
    const toast = await exportWith(okManifest([]));
    await vi.waitFor(() => expect(toast).toHaveBeenCalledWith(expect.objectContaining({
      text: 'Backup saved.',
    })));
  });
});

describe('wipe dialog — registered with the modal registry (Wave 0)', () => {
  beforeEach(() => modalRegistry._reset());

  const openWipeDialog = (props) => {
    renderSettings({}, props);
    fireEvent.click(screen.getByText('Clear All My Data'));
    expect(screen.getByText('Delete All Personal Data')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Delete All Personal Data' })).toBeTruthy();
  };

  it('registers while open and unregisters on Cancel', () => {
    openWipeDialog();
    expect(modalRegistry.peek() && modalRegistry.peek().id).toBe('settings-wipe-dialog');
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Delete All Personal Data')).toBeNull();
    expect(modalRegistry.isAnyOpen()).toBe(false);
  });

  it('the registry dismiss path (what Back/Escape calls) closes the dialog, not the screen', () => {
    const onBack = vi.fn();
    openWipeDialog({ onBack });
    // The dispatcher in use-android-back calls peek().dismiss() instead of
    // navigating when a modal is registered. Pre-fix the wipe dialog was in
    // NEITHER dismissal system, so Back navigated away underneath it.
    // (act(): the dismiss setState happens outside a React event.)
    act(() => { modalRegistry.peek().dismiss(); });
    expect(screen.queryByText('Delete All Personal Data')).toBeNull();
    expect(screen.getByTestId('screen-layout')).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('reports a completed clear via toast, never the native alert()', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const toastSpy = vi.fn();
    teardownSettingsGlobals();
    setupSettingsGlobals({ showToast: toastSpy });
    renderSettings();
    fireEvent.click(screen.getByText('Clear All My Data'));
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByText('Delete Everything'));
    await vi.waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'All personal data cleared. Reloading…' })
      );
    });
    expect(alertSpy).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(window.location.reload).toHaveBeenCalledTimes(1));
  });

  it('reports a blocked personal-data deletion as failure and does not reload', async () => {
    const toastSpy = vi.fn();
    const deleteSpy = vi.spyOn(indexedDB, 'deleteDatabase').mockImplementation((name) => {
      const req = {};
      queueMicrotask(() => {
        if (name === 'vot-journal-media') req.onblocked && req.onblocked();
        else req.onsuccess && req.onsuccess();
      });
      return req;
    });
    localStorage.setItem('vot-clear-probe', 'keep-until-critical-deletes-finish');
    try {
      teardownSettingsGlobals();
      setupSettingsGlobals({ showToast: toastSpy });
      renderSettings();
      fireEvent.click(screen.getByText('Clear All My Data'));
      fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } });
      fireEvent.click(screen.getByText('Delete Everything'));

      await vi.waitFor(() => {
        expect(toastSpy).toHaveBeenCalledWith(
          expect.objectContaining({ text: 'Clear did not finish. Please try again.' })
        );
      });
      expect(localStorage.getItem('vot-clear-probe')).toBe('keep-until-critical-deletes-finish');
      expect(window.location.reload).not.toHaveBeenCalled();
      expect(deleteSpy).toHaveBeenCalledWith('vot-journal-media');
    } finally {
      localStorage.removeItem('vot-clear-probe');
    }
  });

  it('storage-backup-4: a non-critical cache (vot-thumbs) failing to delete still completes the wipe, but is logged', async () => {
    const toastSpy = vi.fn();
    const diagWarnSpy = vi.fn();
    const deleteSpy = vi.spyOn(indexedDB, 'deleteDatabase').mockImplementation((name) => {
      const req = {};
      queueMicrotask(() => {
        // Only vot-thumbs fails (e.g. no onversionchange on an old cached
        // connection) — every user-data database and the other two caches
        // delete cleanly.
        if (name === 'vot-thumbs') req.onblocked && req.onblocked();
        else req.onsuccess && req.onsuccess();
      });
      return req;
    });
    teardownSettingsGlobals();
    setupSettingsGlobals({
      showToast: toastSpy,
      DiagnosticLog: { warn: diagWarnSpy, error: () => {}, all: () => [], clear: () => {} },
    });
    renderSettings();
    fireEvent.click(screen.getByText('Clear All My Data'));
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByText('Delete Everything'));

    // The wipe still succeeds — vot-thumbs is a regenerable cache, not user
    // data, so Clear All must not fail loud over it.
    await vi.waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'All personal data cleared. Reloading…' })
      );
    });
    expect(deleteSpy).toHaveBeenCalledWith('vot-thumbs');
    // But the silent survivor is no longer silent — it's visible in a
    // diagnostic export.
    expect(diagWarnSpy).toHaveBeenCalledWith('settings', expect.stringContaining('vot-thumbs'));
  });
});

describe('import overwrite confirm — in-app sheet, not window.confirm (Wave 0)', () => {
  beforeEach(() => modalRegistry._reset());

  // A minimal but schema-valid legacy (v2) backup: the envelope validator is
  // overridden to accept, so the flow runs straight to the confirm point.
  const LEGACY_BACKUP = JSON.stringify({
    app: 'VOTReader', exportVersion: 2, exportDate: '2026-01-01T00:00:00.000Z',
    data: {}, stores: {}, media: {},
  });
  const fakeFile = () => ({
    size: LEGACY_BACKUP.length,
    slice: () => ({ arrayBuffer: async () => new Uint8Array(8).buffer }),
    text: async () => LEGACY_BACKUP,
  });
  const setupImport = (overrides = {}) => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);
    const applySpy = vi.fn(async () => ({ importFailures: 0, writeFailures: 0, skippedStores: [], countMismatches: [] }));
    const pickImportFile = vi.fn(async () => fakeFile());
    teardownSettingsGlobals();
    setupSettingsGlobals({
      PlatformBridge: {
        isAndroid: false, setKeepScreenOn: () => {}, saveToFile: () => {},
        openFilePicker: () => {}, openExportSink: () => null,
        pickImportFile,
        clearGardenCache: () => {}, getCrashLog: () => '[]',
      },
      isContainerMagic: () => false,       // route the legacy-JSON path
      validateImportEnvelope: () => [],
      applyImportPayload: applySpy,
      ...overrides,
    });
    renderSettings();
    return { confirmSpy, applySpy, pickImportFile };
  };

  /* The sheet's TEXT lands at commit, but useModalRegistry registers in a
     PASSIVE effect — and the setState that opens the sheet runs in an async
     continuation (pickImportFile -> … -> setImportConfirm) outside act(), so
     React is free to flush that effect a tick after the DOM update. Asserting
     on modalRegistry straight after findByText therefore raced the
     registration and failed roughly 1 run in 5 ("expected null to be
     'settings-import-confirm'"). Wait for the registry entry itself, which is
     the thing these tests are actually about. Nothing is weakened: the id is
     still asserted, just not before it can exist. */
  const findImportSheet = async () => {
    await screen.findByText(/will OVERWRITE/);
    await vi.waitFor(() => {
      expect(modalRegistry.peek()).not.toBeNull();
    });
    return modalRegistry.peek();
  };

  it('asks via a registered sheet and applies NOTHING until Import is tapped', async () => {
    const { confirmSpy, applySpy } = setupImport();
    fireEvent.click(screen.getByText('Import'));
    const sheet = await findImportSheet();
    // The destructive semantics are intact — a real choice, in-app…
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(applySpy).not.toHaveBeenCalled();
    // …and Back/Escape would dismiss the sheet, not navigate underneath it.
    expect(sheet.id).toBe('settings-import-confirm');
    fireEvent.click(screen.getByText('Import & Overwrite'));
    await vi.waitFor(() => expect(applySpy).toHaveBeenCalledTimes(1));
  });

  it('dismissing the sheet (Cancel OR the Back/Escape registry path) applies nothing', async () => {
    const { applySpy } = setupImport();
    fireEvent.click(screen.getByText('Import'));
    await findImportSheet();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText(/will OVERWRITE/)).toBeNull();
    expect(applySpy).not.toHaveBeenCalled();

    // Re-open and take the registry dismiss route this time.
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Import' }).disabled).toBe(false));
    fireEvent.click(screen.getByText('Import'));
    const sheet = await findImportSheet();
    act(() => { sheet.dismiss(); });
    expect(screen.queryByText(/will OVERWRITE/)).toBeNull();
    expect(applySpy).not.toHaveBeenCalled();
  });

  it('locks all backup actions until the active picker and confirmation settle', async () => {
    const { pickImportFile } = setupImport();
    fireEvent.click(screen.getByText('Import'));
    await findImportSheet();

    for (const name of ['Export', 'Import', 'Verify']) {
      expect(screen.getByRole('button', { name }).disabled).toBe(true);
    }
    expect(screen.getByRole('button', { name: 'Clear All My Data' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Import' }));
    expect(pickImportFile).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Cancel'));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Import' }).disabled).toBe(false));
  });

  it('keeps destructive data actions locked after import until the scheduled reload', async () => {
    const { applySpy } = setupImport();
    fireEvent.click(screen.getByText('Import'));
    await findImportSheet();
    fireEvent.click(screen.getByText('Import & Overwrite'));
    await vi.waitFor(() => expect(applySpy).toHaveBeenCalledTimes(1));

    expect(screen.getByRole('button', { name: 'Import' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Clear All My Data' }).disabled).toBe(true);
  });

  it('brackets the apply with the restore-inflight marker (a crash mid-apply must warn at next boot)', async () => {
    localStorage.removeItem('vot-restore-inflight');
    let flagDuringApply = null;
    const applySpy = vi.fn(async () => {
      flagDuringApply = localStorage.getItem('vot-restore-inflight');
      return { importFailures: 0, writeFailures: 0, skippedStores: [], countMismatches: [] };
    });
    setupImport({ applyImportPayload: applySpy });
    fireEvent.click(screen.getByText('Import'));
    await findImportSheet();
    fireEvent.click(screen.getByText('Import & Overwrite'));

    await vi.waitFor(() => expect(applySpy).toHaveBeenCalledTimes(1));
    expect(flagDuringApply).not.toBeNull();   // set BEFORE the first mutation
    // Cleared only once the apply durably completed (useRestoreGuard's cue).
    await vi.waitFor(() => expect(localStorage.getItem('vot-restore-inflight')).toBeNull());
  });

  it('leaves the restore-inflight marker set when the apply throws (part-applied state)', async () => {
    localStorage.removeItem('vot-restore-inflight');
    const applySpy = vi.fn(async () => { throw new Error('corrupt payload'); });
    setupImport({ applyImportPayload: applySpy });
    fireEvent.click(screen.getByText('Import'));
    await findImportSheet();
    fireEvent.click(screen.getByText('Import & Overwrite'));

    await vi.waitFor(() => expect(applySpy).toHaveBeenCalledTimes(1));
    // The marker survives a handled failure — the boot guard must warn, because
    // a legacy apply may have part-landed before the throw.
    await vi.waitFor(() => expect(localStorage.getItem('vot-restore-inflight')).not.toBeNull());
    localStorage.removeItem('vot-restore-inflight');
  });

  it('does not erase another tab\'s restore marker when the import lock is busy', async () => {
    localStorage.setItem('vot-restore-inflight', 'active-tab-marker');
    setupImport({ applyImportPayload: vi.fn(async () => { throw new Error('another backup import is already in progress'); }) });
    fireEvent.click(screen.getByText('Import'));
    await findImportSheet();
    fireEvent.click(screen.getByText('Import & Overwrite'));

    await vi.waitFor(() => {
      expect(localStorage.getItem('vot-restore-inflight')).toBe('active-tab-marker');
    });
    localStorage.removeItem('vot-restore-inflight');
  });

  it('refuses import while any structured store is still pending hydration', async () => {
    const toastSpy = vi.fn();
    const pendingAnnotations = { ...globalThis.AnnotationStore, getState: () => 'pending' };
    const { applySpy } = setupImport({ AnnotationStore: pendingAnnotations, showToast: toastSpy });
    fireEvent.click(screen.getByText('Import'));
    await findImportSheet();
    fireEvent.click(screen.getByText('Import & Overwrite'));

    await vi.waitFor(() => expect(toastSpy).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Storage is temporarily unavailable. Please try again in a moment.' })
    ));
    expect(applySpy).not.toHaveBeenCalled();
  });
});

/* ───────────────────────────────────────────────────────────────────────
   A backup that was CUT is not a backup that failed a checksum.
   ─────────────────────────────────────────────────────────────────────
   Two import toasts named the wrong defect for integrity 'truncated'. The
   web one has said "this backup failed its integrity check — some data may
   be corrupted" since storage-backup-1 made readContainer produce that value;
   backup-android-1 made the same sentence reachable on Android. A cut file
   did not fail a checksum, and telling the owner it did sends them looking
   for corruption in data that is intact — the same distinction
   formatVerifyReport draws three times over.

   THESE TOASTS HAD NO TEST AT ALL. The Native Builder said so rather than let
   4,536 green tests imply coverage they did not have, which is why this exists
   instead of a note. Both assertions check BOTH directions: the cut wording
   appears, and the checksum wording does not — because a fix that merely adds
   a branch, or one that deletes the true warning along with the false one,
   would each pass half of this.
   ─────────────────────────────────────────────────────────────────────── */
describe('a truncated backup is reported as cut, not as failing its checksum', () => {
  beforeEach(() => modalRegistry._reset());

  const MANIFEST = { app: 'VOTReader', exportVersion: 3, exportDate: '2026-01-01T00:00:00.000Z', stores: {}, media: [] };
  // fakeFile() lives in another describe's scope; the container path only needs
  // a size and eight bytes to sniff, and isContainerMagic is stubbed true.
  const containerFile = () => ({
    size: 4096,
    slice: () => ({ arrayBuffer: async () => new Uint8Array(8).buffer }),
    text: async () => '',
  });
  const CUT = /cut short/;
  const CHECKSUM = /failed its integrity check/;
  const textsOf = (spy) => spy.mock.calls.map((c) => (c[0] && c[0].text) || '').join(' | ');

  it('web: readContainer returning truncated warns that the file was cut', async () => {
    const toastSpy = vi.fn();
    teardownSettingsGlobals();
    setupSettingsGlobals({
      PlatformBridge: {
        isAndroid: false, setKeepScreenOn: () => {}, saveToFile: () => {},
        openFilePicker: () => {}, openExportSink: () => null,
        clearGardenCache: () => {}, getCrashLog: () => '[]',
        pickImportFile: async () => containerFile(),
      },
      isContainerMagic: () => true,
      readContainer: async () => ({ manifest: MANIFEST, entries: [], integrity: 'truncated' }),
      validateImportEnvelope: () => [],
      applyV3: vi.fn(async () => ({ importFailures: 0, writeFailures: 0, skippedStores: [], countMismatches: [] })),
      showToast: toastSpy,
    });
    renderSettings();

    fireEvent.click(screen.getByText('Import'));
    await vi.waitFor(() => expect(textsOf(toastSpy)).toMatch(CUT));
    expect(textsOf(toastSpy)).not.toMatch(CHECKSUM);
  });

  it('web: a real checksum MISMATCH still says the integrity check failed', async () => {
    // The other half. A fix that stopped saying "failed its integrity check"
    // at all would pass the case above and lose a true warning.
    const toastSpy = vi.fn();
    teardownSettingsGlobals();
    setupSettingsGlobals({
      PlatformBridge: {
        isAndroid: false, setKeepScreenOn: () => {}, saveToFile: () => {},
        openFilePicker: () => {}, openExportSink: () => null,
        clearGardenCache: () => {}, getCrashLog: () => '[]',
        pickImportFile: async () => containerFile(),
      },
      isContainerMagic: () => true,
      readContainer: async () => ({ manifest: MANIFEST, entries: [], integrity: 'mismatch' }),
      validateImportEnvelope: () => [],
      applyV3: vi.fn(async () => ({ importFailures: 0, writeFailures: 0, skippedStores: [], countMismatches: [] })),
      showToast: toastSpy,
    });
    renderSettings();

    fireEvent.click(screen.getByText('Import'));
    await vi.waitFor(() => expect(textsOf(toastSpy)).toMatch(CHECKSUM));
    expect(textsOf(toastSpy)).not.toMatch(CUT);
  });

  it('android: onDone("truncated") reports a cut file in the completion toast', async () => {
    const toastSpy = vi.fn();
    teardownSettingsGlobals();
    setupSettingsGlobals({
      PlatformBridge: {
        isAndroid: true, setKeepScreenOn: () => {}, saveToFile: () => {},
        openFilePicker: () => {}, openExportSink: () => null,
        clearGardenCache: () => {}, getCrashLog: () => '[]',
        v3ImportOpen: () => { setTimeout(() => { if (window.__onV3ImportReady) window.__onV3ImportReady('ok'); }, 0); },
        v3ImportBegin: () => 'v3:' + JSON.stringify(MANIFEST),
        v3ImportClose: () => {},
      },
      classifyV3ImportBegin: realClassifyV3,
      validateImportEnvelope: () => [],
      v3AndroidImportEntries: (args) => (async function* () { yield* []; if (args.onDone) args.onDone('truncated'); })(),
      applyV3: vi.fn(async (_m, entries) => {
        for await (const _e of entries) { void _e; }
        return { importFailures: 0, writeFailures: 0, skippedStores: [], countMismatches: [] };
      }),
      showToast: toastSpy,
    });
    renderSettings();

    fireEvent.click(screen.getByText('Import'));
    await screen.findByText(/will OVERWRITE/);
    fireEvent.click(screen.getByText('Import & Overwrite'));

    await vi.waitFor(() => expect(textsOf(toastSpy)).toMatch(CUT));
    expect(textsOf(toastSpy)).not.toMatch(CHECKSUM);
  });
});

/* ───────────────────────────────────────────────────────────────────────
   Android v3 import — the native stream must stay OPEN across the confirm.
   Regression: the fire-and-forget confirm sheet (after the blocking
   window.confirm was retired in Wave 0) let _importV3Android's
   `finally { v3ImportClose() }` run the instant the dialog appeared —
   66 ms after v3ImportBegin, long before the user tapped Import. That
   nulled the live native import stream, so the post-confirm applyV3 hit
   "no_session" and hung forever on "Importing… please wait." The confirm
   is now fire-AND-AWAIT, so the caller's cleanup brackets the WHOLE import.
   ─────────────────────────────────────────────────────────────────────── */
describe('Android v3 import — native stream not closed until the confirm settles', () => {
  beforeEach(() => modalRegistry._reset());

  const MANIFEST = { app: 'VOTReader', exportVersion: 3, exportDate: '2026-01-01T00:00:00.000Z', stores: {}, media: [] };

  const setupAndroidImport = () => {
    const closeSpy = vi.fn();
    // applyV3 faithfully consumes the entries generator — this is exactly where
    // v3ImportNextBlob would run on-device, and where a prematurely-closed
    // native stream returned no_session.
    const applySpy = vi.fn(async (_manifest, entries) => {
      for await (const _e of entries) { void _e; /* no media in this manifest */ }
      return { importFailures: 0, writeFailures: 0, skippedStores: [], countMismatches: [] };
    });
    teardownSettingsGlobals();
    setupSettingsGlobals({
      PlatformBridge: {
        isAndroid: true, setKeepScreenOn: () => {}, saveToFile: () => {},
        openFilePicker: () => {}, openExportSink: () => null,
        clearGardenCache: () => {}, getCrashLog: () => '[]',
        v3ImportOpen: () => { setTimeout(() => { if (window.__onV3ImportReady) window.__onV3ImportReady('ok'); }, 0); },
        v3ImportBegin: () => 'v3:' + JSON.stringify(MANIFEST),
        v3ImportClose: closeSpy,
      },
      classifyV3ImportBegin: realClassifyV3,
      validateImportEnvelope: () => [],
      v3AndroidImportEntries: (args) => (async function* () { yield* []; if (args.onDone) args.onDone('absent'); })(),
      applyV3: applySpy,
    });
    renderSettings();
    return { closeSpy, applySpy };
  };

  it('holds v3ImportClose until AFTER apply — never while the sheet is up', async () => {
    const { closeSpy, applySpy } = setupAndroidImport();
    fireEvent.click(screen.getByText('Import'));
    await screen.findByText(/will OVERWRITE/);
    // THE REGRESSION: pre-fix the finally fired here, before the user chose.
    expect(closeSpy).not.toHaveBeenCalled();
    expect(applySpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Import & Overwrite'));
    await vi.waitFor(() => expect(applySpy).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled()); // closed only after apply consumed the stream
  });

  it('cancelling still closes the native stream and applies nothing', async () => {
    const { closeSpy, applySpy } = setupAndroidImport();
    fireEvent.click(screen.getByText('Import'));
    await screen.findByText(/will OVERWRITE/);
    expect(closeSpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Cancel'));
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled());
    expect(applySpy).not.toHaveBeenCalled();
  });
});

/* ───────────────────────────────────────────────────────────────────────
   Settings redesign (2026-07-31) — the accordion group contract.
   Groups are COLLAPSED on entry (the screen reads as a table of contents);
   a closed group's body is UNMOUNTED, not hidden — out of tab order and
   screen-reader order, same discipline as the auto-scroll disclosure.
   ─────────────────────────────────────────────────────────────────────── */
describe('settings groups — collapsible accordion', () => {
  const GROUPS = ['Appearance', 'Reading', 'Listening', 'Auto-Scroll', 'Top-Nav Buttons',
    'Search, Tabs & History', 'A Return to The Garden', 'Your Data', 'Mark as Read', 'Help'];

  it('renders all 10 group headers, every one collapsed on entry', () => {
    renderSettings({}, {}, { expandGroups: false });
    expect(groupHeads().length).toBe(GROUPS.length);
    for (const label of GROUPS) {
      const head = groupHead(label);
      expect(head).toBeTruthy();
      expect(head.getAttribute('aria-expanded')).toBe('false');
    }
    // Collapsed means UNMOUNTED — zero setting rows exist yet.
    expect(rowLabels().length).toBe(0);
    expect(document.querySelectorAll('.settings-card').length).toBe(0);
  });

  it('opening a group mounts its rows; closing unmounts them again', () => {
    renderSettings({}, {}, { expandGroups: false });
    fireEvent.click(groupHead('Appearance'));
    expect(groupHead('Appearance').getAttribute('aria-expanded')).toBe('true');
    expect(row('Light Theme')).toBeTruthy();
    expect(row('Reading Position Dot')).toBeUndefined(); // other groups stay closed
    fireEvent.click(groupHead('Appearance'));
    expect(row('Light Theme')).toBeUndefined();
  });

  it('groups open independently', () => {
    renderSettings({}, {}, { expandGroups: false });
    fireEvent.click(groupHead('Reading'));
    fireEvent.click(groupHead('Your Data'));
    expect(row('Chapter Titles')).toBeTruthy();
    expect(row('Export Your Data')).toBeTruthy();
    expect(row('Light Theme')).toBeUndefined();
  });

  it('Auto-Scroll lives in its own group and keeps its nested disclosure', () => {
    renderSettings({ autoScroll: true, autoScrollNext: true }, {}, { expandGroups: false });
    fireEvent.click(groupHead('Auto-Scroll'));
    expect(row('Auto-Scroll')).toBeTruthy();
    expect(row('Scroll Speed')).toBeTruthy();
    expect(row('Auto-Continue Pause')).toBeTruthy();
  });
});

describe('settings folio summary', () => {
  it('surfaces the active theme, text scale, and reading typeface', () => {
    renderSettings({ fontScale: '1.5', fontStyle: 'literata' }, { theme: 'light' }, { expandGroups: false });
    const summary = document.querySelector('.settings-summary');
    expect(summary).toBeTruthy();
    expect(summary.textContent).toContain('Light');
    expect(summary.textContent).toContain('150%');
    expect(summary.textContent).toContain('Literata');
  });

  it('switches to the large-type layout at the accessibility threshold', () => {
    const { container } = renderSettings({ fontScale: '1.75' }, {}, { expandGroups: false });
    expect(container.querySelector('.settings-screen').classList.contains('settings-large-type')).toBe(false);
    cleanup();
    const large = renderSettings({ fontScale: '1.8' }, {}, { expandGroups: false });
    expect(large.container.querySelector('.settings-screen').classList.contains('settings-large-type')).toBe(true);
  });

  it('links each accordion header to its mounted body', () => {
    renderSettings({}, {}, { expandGroups: false });
    const appearance = groupHead('Appearance');
    expect(appearance.getAttribute('aria-controls')).toBe('settings-group-appearance');
    fireEvent.click(appearance);
    expect(document.getElementById('settings-group-appearance')).toBeTruthy();
  });
});

/* Redesign: settings whose DEPENDENCY is off are unmounted, not greyed —
   the auto-scroll discipline applied screen-wide. */
describe('dependency-gated rows unmount with their dependency', () => {
  it('search sub-settings vanish while Search is off', () => {
    renderSettings({ searchEnabled: false });
    expect(row('Search')).toBeTruthy();
    expect(row('Synonym Search')).toBeUndefined();
    expect(row('Filter Stop Words in Search')).toBeUndefined();
    cleanup();
    renderSettings({ searchEnabled: true });
    expect(row('Synonym Search')).toBeTruthy();
    expect(row('Filter Stop Words in Search')).toBeTruthy();
  });

  it('Restored Names vanishes only when BOTH title surfaces are off', () => {
    renderSettings({ showChapterTitle: false, showSectionHeadings: false });
    expect(row('Restored Names')).toBeUndefined();
    cleanup();
    renderSettings({ showChapterTitle: false, showSectionHeadings: true });
    expect(row('Restored Names')).toBeTruthy();
    cleanup();
    renderSettings({});
    expect(row('Restored Names')).toBeTruthy();
  });

  it('the History nav chip vanishes while History itself is off', () => {
    renderSettings({ historyEnabled: false });
    // Only the feature row remains under the "History" name…
    expect(screen.getAllByRole('switch', { name: 'History' }).length).toBe(1);
    cleanup();
    renderSettings({});
    // …with History on, the Top-Nav chip joins it.
    expect(screen.getAllByRole('switch', { name: 'History' }).length).toBe(2);
  });
});

describe('fullscreen gesture setting', () => {
  it('keeps the fullscreen shortcut enabled by default and wires its switch to the canonical key', () => {
    const onToggle = vi.fn();
    renderSettings({}, { onToggle });
    const fullscreen = row('Double-Tap / Click Fullscreen');
    expect(fullscreen).toBeTruthy();
    expect(fullscreen.querySelector('input[role="switch"]').checked).toBe(true);
    fireEvent.click(fullscreen.querySelector('input[role="switch"]'));
    expect(onToggle).toHaveBeenCalledWith('doubleTapFullscreen');
  });
});

/* Reading Font picker — integration through the real SettingsScreen wiring
   (component-level behavior is FontPickerRow.test.jsx). */
describe('Reading Font picker wiring', () => {
  it('replaces the old Modern Fonts toggle inside Appearance', () => {
    renderSettings();
    expect(row('Modern Fonts')).toBeUndefined();
    expect(row('Reading Font')).toBeTruthy();
  });

  it('is a dropdown: the trigger opens the standard select sheet with all fonts', () => {
    renderSettings({ fontStyle: 'classic' });
    expect(document.querySelector('.select-sheet')).toBeNull();
    fireEvent.click(within(row('Reading Font')).getByText('System Serif'));
    expect(document.querySelector('.select-sheet')).toBeTruthy();
    expect(document.querySelectorAll('.select-sheet-option').length).toBeGreaterThan(10);
  });

  it('selecting a built-in font writes settings.fontStyle through onSetting', async () => {
    const onSetting = vi.fn();
    renderSettings({ fontStyle: 'classic' }, { onSetting });
    fireEvent.click(within(row('Reading Font')).getByText('System Serif'));
    const eb = [...document.querySelectorAll('.select-sheet-option')]
      .find((o) => o.querySelector('.select-sheet-option-label').textContent === 'EB Garamond');
    fireEvent.click(eb);
    await vi.waitFor(() => expect(onSetting).toHaveBeenCalledWith('fontStyle', 'modern'));
  });
});

/* [10] True Black toggle RETIRED 2026-08-03 (owner: default now — pure-black
   surfaces are the dark theme's own tokens). The row must stay gone. */
describe('True Black (OLED) — retired', () => {
  it('TOMBSTONE: no True Black row in any theme', () => {
    renderSettings({}, { theme: 'dark' });
    expect(row('True Black (OLED)')).toBeUndefined();
  });
});


/* THE SAVE PICKER THAT NEVER SETTLES (export-escape)
   ═══════════════════════════════════════════════════════════════════════
   Measured by the Verifier on a fresh headless-Chromium profile:
   `showSaveFilePicker` exists, opens a dialog that can never be shown, and its
   promise never settles — 30 s under a synthetic click and 30 s under a real
   trusted page.mouse.click(). The reader was left on the export screen with no
   error, no retry and nothing to press.

   The bridge owns WHICH path writes the file and when the offer is made
   (platform-bridge.test.js pins the four-second point, the single claim, and
   the case where the picker settles after the escape). What THESE cases pin is
   the half the bridge cannot: that the offer reaches the reader as something
   they can actually tap, and that it comes down again afterwards.

   They use the REAL toast primitive rather than a spy, deliberately. A spy
   would let me assert the html string and prove nothing about whether the
   markup yields a button, whether the click listener is attached to it, or
   whether `.vot-toast-action` is even the element that gets the class. The
   whole finding is a reader with nothing to press; a test that never presses
   anything is not a test of it. */
describe('export escape — the save picker that never settles', () => {
  const okManifest = () => ({
    ok: true,
    manifest: { app: 'VOTReader', exportVersion: 3, stores: {}, media: [] },
    manifestBytes: 2048,
    mediaEntries: [],
    problems: [],
  });

  // Returns the captured escape callback plus the promise the screen is
  // awaiting, so each case decides who claims the export and in what order.
  const exportWithSlowPicker = () => {
    const build = vi.fn(async () => okManifest());
    const captured = { settle: null, opened: null, escapeTaken: false };
    const openExportSink = vi.fn((name, opts) => new Promise((res) => {
      captured.opened = name;
      captured.settle = res;
      // Stand-in for the bridge's PICKER_SLOW_MS timer. The timing itself is
      // the bridge's, and pinned there; here the offer simply arrives. The
      // escape handed over is never taken in this case — the point is what
      // happens to the offer when the OTHER path settles.
      opts.onSlow(() => { captured.escapeTaken = true; });
    }));
    teardownSettingsGlobals();
    setupSettingsGlobals({
      buildV3Manifest: build,
      showToast: realShowToast,
      hideToast: realHideToast,
      writeContainer: vi.fn(async () => {}),
      PlatformBridge: {
        isAndroid: false, setKeepScreenOn: () => {}, saveToFile: () => {},
        openFilePicker: () => {}, openExportSink, pickImportFile: () => null,
        clearGardenCache: () => {}, getCrashLog: () => '[]',
      },
    });
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));
    return { build, captured };
  };

  afterEach(() => { _resetToasts(); });

  it('offers "Save the usual way" as a real, tappable control', async () => {
    let took = false;
    const build = vi.fn(async () => okManifest());
    const openExportSink = vi.fn((name, opts) => new Promise((res) => {
      opts.onSlow(() => { took = true; res({ write: vi.fn(async () => {}), close: vi.fn(async () => {}) }); });
    }));
    teardownSettingsGlobals();
    setupSettingsGlobals({
      buildV3Manifest: build,
      showToast: realShowToast,
      hideToast: realHideToast,
      writeContainer: vi.fn(async () => {}),
      PlatformBridge: {
        isAndroid: false, setKeepScreenOn: () => {}, saveToFile: () => {},
        openFilePicker: () => {}, openExportSink, pickImportFile: () => null,
        clearGardenCache: () => {}, getCrashLog: () => '[]',
      },
    });
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Export' }));

    const el = await vi.waitFor(() => {
      const found = document.getElementById('vot-toast-export-escape');
      expect(found).toBeTruthy();
      return found;
    });
    // Visible, and pointer-events:auto via the class — the base .vot-toast is
    // pointer-events:none, so an action toast that forgot the class would be
    // on screen and untappable, which is the bug wearing a disguise.
    expect(el.classList.contains('show')).toBe(true);
    expect(el.className).toContain('vot-toast-action');

    const btn = el.querySelector('.vot-escape-btn');
    expect(btn).toBeTruthy();
    expect(btn.textContent).toBe('Save the usual way');
    // It does not tell the reader the dialog failed to open: from here nobody
    // knows whether it opened and the reader is still reading it.
    expect(el.textContent).toContain('Still waiting for the save dialog');

    expect(took).toBe(false);
    fireEvent.click(btn);
    expect(took).toBe(true);

    // The offer is stale the moment the export is claimed.
    await vi.waitFor(() => expect(el.classList.contains('show')).toBe(false));
  });

  /* Cancel is the case that would leave litter. The reader dismisses the real
     dialog while the offer is already up; the sink resolves null and the export
     ends quietly — but a stuck offer would invite a tap that the bridge then
     (correctly) ignores, which reads as a dead button. */
  it('takes the offer down when the reader cancels the picker instead', async () => {
    const { captured } = exportWithSlowPicker();
    const el = await vi.waitFor(() => {
      const found = document.getElementById('vot-toast-export-escape');
      expect(found).toBeTruthy();
      return found;
    });
    expect(el.classList.contains('show')).toBe(true);
    captured.settle(null);                       // AbortError → cancelled
    await vi.waitFor(() => expect(el.classList.contains('show')).toBe(false));
    expect(captured.escapeTaken).toBe(false);    // it came down, it was not pressed
  });
});
