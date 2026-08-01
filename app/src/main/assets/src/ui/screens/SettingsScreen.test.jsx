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
import { screen, cleanup, fireEvent, within, act } from '@testing-library/react';
import {
  setupSettingsGlobals, teardownSettingsGlobals, renderSettings, rowLabels, row,
  groupHeads, groupHead,
} from './settings-harness.jsx';
import { classifyV3ImportBegin as realClassifyV3 } from '../../utils/backup-android.js';

beforeEach(() => {
  setupSettingsGlobals();
  if (!window.matchMedia) {
    /** @type {any} */ (window).matchMedia = () => ({ matches: false, addListener() {}, removeListener() {} });
  }
});
afterEach(() => { cleanup(); teardownSettingsGlobals(); vi.restoreAllMocks(); });

const slider = (label) => document.querySelector(`input[type="range"][aria-label*="${label}"]`);

describe('harness', () => {
  it('renders the whole screen with the real row components', () => {
    renderSettings();
    expect(screen.getByTestId('screen-layout')).toBeTruthy();
    expect(rowLabels()).toContain('Auto-Scroll');
    expect(rowLabels().length).toBeGreaterThan(10);
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
   window.location is replaced per-test where a flow ends in reload —
   jsdom's own location.reload is non-configurable (sw-register.test.js
   precedent).
   ─────────────────────────────────────────────────────────────────────── */
const REAL_LOCATION = window.location;
const stubLocationReload = () => {
  Object.defineProperty(window, 'location', { configurable: true, value: { reload: vi.fn() } });
};
const restoreLocation = () => {
  Object.defineProperty(window, 'location', { configurable: true, value: REAL_LOCATION });
};

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
    fireEvent.click(within(r).getByLabelText('Show description'));
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

describe('wipe dialog — registered with the modal registry (Wave 0)', () => {
  beforeEach(() => modalRegistry._reset());

  const openWipeDialog = (props) => {
    renderSettings({}, props);
    fireEvent.click(screen.getByText('Clear All My Data'));
    expect(screen.getByText('Delete All Personal Data')).toBeTruthy();
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
    stubLocationReload();
    try {
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
    } finally {
      restoreLocation();
    }
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
  const setupImport = () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockImplementation(() => true);
    const applySpy = vi.fn(async () => ({ importFailures: 0, writeFailures: 0, skippedStores: [], countMismatches: [] }));
    stubLocationReload();
    teardownSettingsGlobals();
    setupSettingsGlobals({
      PlatformBridge: {
        isAndroid: false, setKeepScreenOn: () => {}, saveToFile: () => {},
        openFilePicker: () => {}, openExportSink: () => null,
        pickImportFile: async () => fakeFile(),
        clearGardenCache: () => {}, getCrashLog: () => Promise.resolve(''),
      },
      isContainerMagic: () => false,       // route the legacy-JSON path
      validateImportEnvelope: () => [],
      applyImportPayload: applySpy,
    });
    renderSettings();
    return { confirmSpy, applySpy };
  };
  afterEach(restoreLocation);

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
    fireEvent.click(screen.getByText('Import'));
    const sheet = await findImportSheet();
    act(() => { sheet.dismiss(); });
    expect(screen.queryByText(/will OVERWRITE/)).toBeNull();
    expect(applySpy).not.toHaveBeenCalled();
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
  afterEach(restoreLocation);

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
    stubLocationReload();
    teardownSettingsGlobals();
    setupSettingsGlobals({
      PlatformBridge: {
        isAndroid: true, setKeepScreenOn: () => {}, saveToFile: () => {},
        openFilePicker: () => {}, openExportSink: () => null,
        clearGardenCache: () => {}, getCrashLog: () => Promise.resolve(''),
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
  const GROUPS = ['Appearance', 'Reading', 'Auto-Scroll', 'Top-Nav Buttons',
    'Search, Tabs & History', 'A Return to The Garden', 'Your Data', 'Mark as Read'];

  it('renders all 8 group headers, every one collapsed on entry', () => {
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

/* Reading Font picker — integration through the real SettingsScreen wiring
   (component-level behavior is FontPickerRow.test.jsx). */
describe('Reading Font picker wiring', () => {
  it('replaces the old Modern Fonts toggle inside Appearance', () => {
    renderSettings();
    expect(row('Modern Fonts')).toBeUndefined();
    expect(row('Reading Font')).toBeTruthy();
  });

  it('selecting a built-in font writes settings.fontStyle through onSetting', async () => {
    const onSetting = vi.fn();
    renderSettings({ fontStyle: 'classic' }, { onSetting });
    fireEvent.click(within(row('Reading Font')).getByRole('button', { name: /Reading Font/ }));
    const chips = [...document.querySelectorAll('.font-chip')];
    expect(chips.length).toBeGreaterThan(10);
    const eb = chips.find((c) => c.querySelector('.font-chip-name').textContent === 'EB Garamond');
    fireEvent.click(eb);
    await vi.waitFor(() => expect(onSetting).toHaveBeenCalledWith('fontStyle', 'modern'));
  });
});

/* [10] True Black — an OLED modifier on the DARK theme; the row collapses
   (unmounts) in the light theme, same disclosure discipline as auto-scroll. */
describe('True Black (OLED) disclosure', () => {
  it('renders in the dark theme and toggles settings.trueBlack', () => {
    const onToggle = vi.fn();
    renderSettings({}, { theme: 'dark', onToggle });
    expect(row('True Black (OLED)')).toBeTruthy();
  });

  it('is UNMOUNTED in the light theme', () => {
    renderSettings({}, { theme: 'light' });
    expect(row('True Black (OLED)')).toBeUndefined();
  });
});
