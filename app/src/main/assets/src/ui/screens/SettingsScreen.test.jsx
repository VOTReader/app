// @ts-nocheck — the harness installs free-var globals for this screen
/* SettingsScreen — the auto-scroll disclosure contract.
   ═══════════════════════════════════════════════════════════════════════
   Rendering this screen at all requires 73 runtime globals; ./settings-
   harness.jsx pays that cost once so assertions here stay cheap. The rows
   under test are the REAL SettingsRow / SelectField components, so this
   fails if their markup or wiring rots — not just if the gate does.

   WHAT IT PINS: the screen's rows, their writes, the find, and the
   dependency gates that still unmount (Search's sub-settings, Restored
   names, Follow the voice). WS2 settings (st-auto): auto-scroll's rows
   are always shown now, so its old collapse contract is gone. */

import { OfflineAudio } from '../../utils/offline-audio.js';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import 'fake-indexeddb/auto';
import { screen, cleanup, fireEvent, within, act, waitFor } from '@testing-library/react';
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

describe('Mark as Read loads the studies it counts (mw17 A09.3)', () => {
  it('opening the group loads Matthew and the Bible studies, and the Studies rows fill in when they land', async () => {
    let landStudies;
    window.loadBibleStudies = vi.fn(() => new Promise((r) => { landStudies = r; }));
    window.__loadMatthewCorpus = vi.fn(() => Promise.resolve());
    const STUDIES = { id: 'studies', label: 'Studies', genres: [{ label: 'Bible Letter Studies', books: [{ id: 'bible-study-purity', label: 'Purity', total: 7 }] }] };
    window.buildProgressGroups = () => (window.BIBLE_STUDIES ? [STUDIES] : []);
    try {
      renderSettings({ markAsRead: true }, {}, { expandGroups: false });
      fireEvent.click(groupHead('Reading progress'));
      expect(window.loadBibleStudies).toHaveBeenCalledTimes(1);
      expect(window.__loadMatthewCorpus).toHaveBeenCalledTimes(1);
      const studiesSection = () => [...document.querySelectorAll('.progress-section-toggle')].find((t) => /Studies/.test(t.textContent));
      expect(studiesSection()).toBeUndefined();
      window.BIBLE_STUDIES = [{ slug: 'purity' }];
      await act(async () => { landStudies(); });
      await waitFor(() => expect(studiesSection().textContent).toMatch(/0 of 7/));
    } finally {
      delete window.loadBibleStudies;
      delete window.__loadMatthewCorpus;
      delete window.BIBLE_STUDIES;
    }
  });
});

/* WS2 settings (st-find): the find draws only the ROWS that match every typed word (by the start of a word), each
   with its place above its name; no group heads while finding. */
const foundPlaces = () => [...document.querySelectorAll('[data-found] .ws2-place')].map((p) => p.textContent);
const findSettings = (value) => fireEvent.change(screen.getByLabelText('Find settings'), { target: { value } });

describe('settings filter and lazy progress', () => {
  it('finds backup settings as rows with their place, then the clear restores the root', () => {
    renderSettings({}, {}, { expandGroups: false });
    findSettings('backup');
    expect(groupHeads()).toHaveLength(0);
    expect(row('Check a backup file')).toBeTruthy();
    for (const place of foundPlaces()) expect(place).toMatch(/^Your data/);
    expect(screen.getByRole('status').textContent).toBe(foundPlaces().length + ' settings');
    // The Also section offers the backup itself, and the big backup card stays out of the found rows (WS5, mock st-find).
    expect(screen.getByRole('button', { name: /^Keep a backup/ })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Back up now' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(groupHeads()).toHaveLength(8);   // the root's eight group rows
    expect(groupHead('Appearance').getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(screen.getByLabelText('Find settings'));
  });

  it('"a" does not match every row; "keep" and "marker" find their rows', () => {
    renderSettings();
    const all = rowLabels().length;
    cleanup();
    renderSettings({}, {}, { expandGroups: false });
    findSettings('a');
    expect(rowLabels().length).toBeGreaterThan(0);
    expect(rowLabels().length).toBeLessThan(all);
    findSettings('keep');
    expect(row('Keep screen on while reading')).toBeTruthy();
    expect(row('Keep screen on while reading').querySelector('.ws2-place').textContent).toBe('Reading · The page');
    expect(row('Chapter titles')).toBeUndefined();
    findSettings('marker');
    expect(row('Reading position marker')).toBeTruthy();
    expect(row('Bible translation')).toBeUndefined();
  });

  it('finds the Show me around door by "tour", so a lost reader can get the tour back through the find box', () => {
    // RED on 47355cc1: matchesGroup('help') threw on SETTINGS_TOPICS['help'] for any query; the
    // defensive `|| []` would have hidden Help from every search instead.
    renderSettings({}, {}, { expandGroups: false });
    findSettings('tour');
    expect(groupHeads()).toHaveLength(0);
    expect(foundPlaces()).toEqual(['Help']);
    expect(screen.getByRole('button', { name: 'Show me around' })).toBeTruthy();
  });

  it('handles hyphenated queries and explains no results', () => {
    renderSettings({}, {}, { expandGroups: false });
    findSettings('read-along');
    expect(row('Highlight the words')).toBeTruthy();
    expect(row('Follow the voice')).toBeTruthy();
    for (const place of foundPlaces()) expect(place).toMatch(/^Listening · /);
    expect(foundPlaces().filter((p) => p === 'Listening · Read-along')).toHaveLength(3);
    findSettings('nothing-matches-this');
    expect(foundPlaces()).toHaveLength(0);
    expect(screen.getByRole('status').textContent).toContain('No matching settings');
  });

  it('offers to search the library for the typed words when the screen can', () => {
    const onSearchLibrary = vi.fn();
    renderSettings({}, { onSearchLibrary }, { expandGroups: false });
    findSettings('mercy');
    fireEvent.click(screen.getByRole('button', { name: /^Search the library for “mercy”/ }));
    expect(onSearchLibrary).toHaveBeenCalledWith('mercy');
  });

  it('does not load corpora for Appearance; opens them for Mark as Read', () => {
    window.__loadVotCorpus = vi.fn(() => Promise.resolve());
    window.__loadBibleCorpus = vi.fn(() => Promise.resolve());
    try {
      renderSettings({}, {}, { expandGroups: false });
      fireEvent.click(groupHead('Appearance'));
      expect(window.__loadVotCorpus).not.toHaveBeenCalled();
      expect(window.__loadBibleCorpus).not.toHaveBeenCalled();
      fireEvent.click(screen.getByRole('button', { name: 'Back to Settings' }));
      fireEvent.click(groupHead('Reading progress'));
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
    expect(rowLabels()).toContain('Auto-scroll pill on reading pages');
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
    // The header strip retired 2026-09-25: the Appearance group's line carries its current values.
    const summary = document.querySelector('[data-settings-group="appearance"] .settings-group-sub');
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
    fireEvent.click(groupHead('Appearance'));
    const controlledId = groupHead('Appearance').getAttribute('aria-controls');
    expect(controlledId).toBe('settings-group-appearance');
    expect(document.getElementById(controlledId)).toBeTruthy();
  });
});

/* WS2 settings (st-auto): the auto-scroll rows NO LONGER vanish while auto-scroll is off. The pill switch, the speed,
   Go on to the next page and Wait before going on are always shown, and each control writes its own key. */
describe('auto-scroll settings (every row always shown)', () => {
  const speedRow = () => document.querySelector('.ws2-speed');

  it('shows every auto-scroll row whatever the switches say', () => {
    for (const settings of [{ autoScroll: false }, { autoScroll: true }, { autoScroll: false, autoScrollNext: true }, { autoScroll: true, autoScrollNext: true }]) {
      renderSettings(settings);
      expect(row('Auto-scroll pill on reading pages')).toBeTruthy();
      expect(speedRow()).toBeTruthy();
      expect(row('Go on to the next page')).toBeTruthy();
      expect(row('Wait before going on')).toBeTruthy();
      cleanup();
    }
  });

  it('the row count does not change with the switches', () => {
    const seen = [];
    renderSettings({ autoScroll: false }); seen.push(rowLabels().length); cleanup();
    renderSettings({ autoScroll: true }); seen.push(rowLabels().length); cleanup();
    renderSettings({ autoScroll: true, autoScrollNext: true }); seen.push(rowLabels().length);
    expect(seen[1]).toBe(seen[0]);
    expect(seen[2]).toBe(seen[0]);
  });

  it('each control writes its own key, even with auto-scroll off', () => {
    const onToggle = vi.fn();
    const onSetting = vi.fn();
    renderSettings({ autoScroll: false, autoScrollLpm: '16', autoScrollEndMs: '2500' }, { onToggle, onSetting });
    fireEvent.click(within(row('Auto-scroll pill on reading pages')).getByRole('switch'));
    expect(onToggle).toHaveBeenCalledWith('autoScroll');
    fireEvent.click(within(row('Go on to the next page')).getByRole('switch'));
    expect(onToggle).toHaveBeenCalledWith('autoScrollNext');
    fireEvent.change(slider('Auto-scroll speed'), { target: { value: '24' } });
    expect(onSetting).toHaveBeenLastCalledWith('autoScrollLpm', '24');
    fireEvent.click(screen.getByRole('button', { name: 'Faster' }));
    expect(onSetting).toHaveBeenLastCalledWith('autoScrollLpm', '17');
    fireEvent.click(screen.getByRole('button', { name: 'Slower' }));
    expect(onSetting).toHaveBeenLastCalledWith('autoScrollLpm', '15');
    fireEvent.click(within(row('Wait before going on')).getByRole('button', { name: 'Longer wait' }));
    expect(onSetting).toHaveBeenLastCalledWith('autoScrollEndMs', '3000');
    fireEvent.click(within(row('Wait before going on')).getByRole('button', { name: 'Shorter wait' }));
    expect(onSetting).toHaveBeenLastCalledWith('autoScrollEndMs', '2000');
  });

  // Sweep low (mw10): the pause slider's name said "in seconds" while it announced 3000 (ms), and
  // Text Size announced 1.5 where the row shows 150%. The pause is a stepper now, showing seconds.
  it('the pause stepper and the text-size slider show what they hold', () => {
    const { container } = renderSettings({ autoScrollEndMs: '3000', fontScale: '1.5' });
    expect(row('Wait before going on').querySelector('.ws2-step-value').textContent).toBe('3 s');
    expect(container.querySelector('input[aria-label="Text size"]').getAttribute('aria-valuetext')).toBe('150 percent');
  });

  // Sweep low (mw10): the Tabs row promised 999 reading places; the cap is 50 (use-tab-actions MAX_TABS).
  it('the Tabs row states the real tab cap', () => {
    renderSettings({});
    expect(screen.queryByText(/up to 999/)).toBeNull();
    expect(row('Tabs').querySelector('.settings-row-desc').textContent).toMatch(/^Up to 50 reading places/);
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
    expect(row('Highlight the words')).toBeTruthy();
    expect(row('Follow the voice')).toBeTruthy();
    for (const label of ['Highlight the words', 'Follow the voice']) {
      expect(within(row(label)).getByRole('switch').getAttribute('aria-checked')).toBe('true');
    }
  });

  it('COLLAPSES the follow row while the wash is off — even if follow was saved on', () => {
    renderSettings({ readAlongHighlight: false, readAlongFollow: true });
    expect(row('Highlight the words')).toBeTruthy();
    expect(row('Follow the voice')).toBeUndefined();
  });

  it('keeps the wash while only the follow-scroll is switched off', () => {
    renderSettings({ readAlongHighlight: true, readAlongFollow: false });
    expect(within(row('Highlight the words')).getByRole('switch').getAttribute('aria-checked')).toBe('true');
    expect(within(row('Follow the voice')).getByRole('switch').getAttribute('aria-checked')).toBe('false');
  });

  it('writes through the settings keys the reading views read', () => {
    const onToggle = vi.fn();
    renderSettings({}, { onToggle });
    fireEvent.click(within(row('Follow the voice')).getByRole('switch'));
    expect(onToggle).toHaveBeenCalledWith('readAlongFollow');
    fireEvent.click(within(row('Highlight the words')).getByRole('switch'));
    expect(onToggle).toHaveBeenCalledWith('readAlongHighlight');
  });
});

/* Copy & Share (cp3, Corbin 2026-09-27): the Share link choice had to be reachable
   without a long press ("on PC and others"), and a website link that highlights the
   copied words is "an option, not the default". */
describe('Copy & Share group', () => {
  // WS2 settings (st-share): the link choice is an on-screen radiogroup, "Links I share point to", website first.
  const linkGroup = () => screen.getByRole('radiogroup', { name: 'Links I share point to' });

  it('holds Links I share point to (the website link by default, share-fn 2026-10-25) and Highlight the passage (off by default)', () => {
    renderSettings();
    const labels = groupRowLabels('Sharing');
    expect(labels).toEqual(expect.arrayContaining(['The website', 'The app', 'Highlight the passage']));
    const radios = within(linkGroup()).getAllByRole('radio');
    expect(radios.map((r) => r.querySelector('.settings-row-label').textContent)).toEqual(['The website', 'The app']);
    expect(within(linkGroup()).getByRole('radio', { name: /^The website/ }).getAttribute('aria-checked')).toBe('true');
    expect(within(linkGroup()).getByRole('radio', { name: /^The app/ }).getAttribute('aria-checked')).toBe('false');
    expect(within(row('Highlight the passage')).getByRole('switch').getAttribute('aria-checked')).toBe('false');
    expect(groupHead('Sharing').textContent).toContain('Links point to the website · Highlight off');
  });

  it('writes through the keys Copy and Share read', () => {
    const onToggle = vi.fn();
    const onSetting = vi.fn();
    renderSettings({ shareLink: 'site', linkHighlight: true }, { onToggle, onSetting });
    expect(groupHead('Sharing').textContent).toContain('Links point to the website · Highlight on');
    fireEvent.click(within(row('Highlight the passage')).getByRole('switch'));
    expect(onToggle).toHaveBeenCalledWith('linkHighlight');
    fireEvent.click(within(linkGroup()).getByRole('radio', { name: /^The app/ }));
    expect(onSetting).toHaveBeenCalledWith('shareLink', 'app');
  });

  // SHARE1 (Corbin 2026-11-12, "make it controllable"): When I copy and When I share each have From the
  // Scriptures and From the letters, and under each a preview drawn from the same function the real text is.
  it('previews what Copy and Share send, from the same function, for every choice and link setting', async () => {
    const { sharePreviewText } = await import('./SettingsScreen.jsx');
    const site = 'https://www.thevolumesoftruth.com/The_Wide_Path';
    const app = 'https://votreader.github.io/app/?p=letter%3Athe-wide-path%3A1';
    const cases = [
      [{}, 'copy', 'letter', '"The words you picked"\n\n' + site],
      [{ shareLink: 'app' }, 'share', 'letter', '"The words you picked"\n\n' + app],
      [{ shareLetters: 'title' }, 'share', 'letter', '"The words you picked"\n\nThe Wide Path\n' + site],
      [{ copyLetters: 'citation' }, 'copy', 'letter', '"The words you picked"\n\nVolume Two, Letter 1: The Wide Path · 3/28/05\n' + site],
      [{ shareLetters: 'none' }, 'share', 'letter', 'The words you picked'],
      [{ linkHighlight: true }, 'share', 'letter', '"The words you picked"\n\n' + site + '#:~:text=The%20words%20you%20picked'],
    ];
    for (const [settings, action, kind, want] of cases) {
      expect(sharePreviewText(/** @type {any} */ (action), /** @type {any} */ (kind), settings), JSON.stringify(settings)).toBe(want);
    }
    // Scripture: the reference by default, its translation, its link (the app's: the Bible has no page on the site), nothing.
    expect(sharePreviewText('copy', 'scripture', {})).toMatch(/^"For God so loved the world that He gave His only begotten Son"\n\n\S.* 3:16$/);
    expect(sharePreviewText('share', 'scripture', { shareScripture: 'translation' })).toMatch(/ 3:16 \([A-Z][A-Za-z-]*\)$/);
    expect(sharePreviewText('share', 'scripture', { shareScripture: 'link' })).toMatch(/ 3:16\nhttps:\/\/votreader\.github\.io\/app\/\?p=bible%3Ajohn%3A3%3A16$/);
    expect(sharePreviewText('copy', 'scripture', { copyScripture: 'none' })).toBe('For God so loved the world that He gave His only begotten Son');
    // The cards show exactly those texts: a copy card and a share card, each with both kinds.
    for (const settings of [{}, { copyScripture: 'link', shareLetters: 'citation', shareLink: 'app' }]) {
      cleanup();
      const { container } = renderSettings(settings);
      const cards = Array.from(container.querySelectorAll('.ws2-share-preview'));
      expect(cards.length).toBe(2);
      cards.forEach((card, i) => {
        const action = i === 0 ? 'copy' : 'share';
        const samples = Array.from(card.querySelectorAll('.ws2-share-sample')).map((el) =>
          Array.from(el.querySelectorAll('p')).map((p) => Array.from(p.childNodes).map((n) => n.textContent).join('\n')).join('\n\n'));
        expect(samples).toEqual([sharePreviewText(action, 'scripture', settings), sharePreviewText(action, 'letter', settings)]);
      });
    }
  });

  it('writes the four choices to their own keys', () => {
    const onSetting = vi.fn();
    renderSettings({}, { onSetting });
    const field = (/** @type {string} */ name) => screen.getAllByRole('button', { name: new RegExp('^' + name + ': ') });
    expect(field('From the Scriptures').map((b) => b.getAttribute('aria-label'))).toEqual(['From the Scriptures: Reference', 'From the Scriptures: Reference']);
    expect(field('From the letters').map((b) => b.getAttribute('aria-label'))).toEqual(['From the letters: Link', 'From the letters: Link']);
    fireEvent.click(field('From the Scriptures')[1]);
    fireEvent.click(screen.getByRole('radio', { name: /^Reference and translation/ }));
    expect(onSetting).toHaveBeenCalledWith('shareScripture', 'translation');
    fireEvent.click(field('From the letters')[0]);
    fireEvent.click(screen.getByRole('radio', { name: /^Full citation and link/ }));
    expect(onSetting).toHaveBeenCalledWith('copyLetters', 'citation');
  });

  it('is found by "copy", "reference" and "citation"', () => {
    renderSettings({}, {}, { expandGroups: false });
    for (const word of ['copy', 'reference', 'citation', 'version']) {
      findSettings(word);
      expect(foundPlaces(), word).toEqual(expect.arrayContaining([expect.stringMatching(/^Sharing · When I (copy|share)/)]));
    }
  });

  it('is found by "share", "link" and "highlight"', () => {
    renderSettings({}, {}, { expandGroups: false });
    for (const word of ['share', 'link', 'highlight']) {
      findSettings(word);
      expect(foundPlaces(), word).toEqual(expect.arrayContaining([expect.stringMatching(/^Sharing · /)]));
    }
  });
});

/* Listening (2026-08-09). Everything that shapes what you HEAR moved into
   one group between Reading and Auto-Scroll: the two voice pickers left
   Reading, and the read-along pair left the comment that promised this.
   Default Speed is the one row with no settings key — it reads and writes
   AudioLibraryStore.rate, the same preference the listening desk writes. */
describe('Listening group', () => {
  const LISTENING_ROWS = ['Bible audio', 'Letter voice', 'Speed',
    'Highlight the words', 'Follow the voice'];

  it('houses every listening row, and Reading houses none of them', () => {
    renderSettings();
    const listening = groupRowLabels('Listening');
    const reading = groupRowLabels('Reading');
    for (const label of LISTENING_ROWS) {
      expect(listening).toContain(label);
      expect(reading).not.toContain(label);
    }
    // Reading kept its own rows — this was a move, not a transplant of the group.
    expect(reading).toContain('Bible translation');
    expect(reading).toContain('Chapter titles');
  });

  it('sits between Reading and Buttons and tools', () => {
    renderSettings({}, {}, { expandGroups: false });
    const labels = groupHeads().map((h) => h.querySelector('.settings-section-label').textContent.trim());
    expect(labels.indexOf('Listening')).toBe(labels.indexOf('Reading') + 1);
    expect(labels.indexOf('Buttons and tools')).toBe(labels.indexOf('Listening') + 1);
  });

  it('keeps the read-along disclosure discipline inside its new group', () => {
    renderSettings({ readAlongHighlight: false });
    expect(groupRowLabels('Listening')).toContain('Highlight the words');
    expect(groupRowLabels('Listening')).not.toContain('Follow the voice');
  });

  it('Songs kept on this phone: how many and how big, and Manage opens the Kept list (K1)', () => {
    teardownSettingsGlobals();
    const keep = {
      subscribe: () => () => {}, getVersion: () => 0, availability: () => 'ok',
      keptIds: () => ['aaaaaaaaaaa1', 'aaaaaaaaaaa2', 'bbbbbbbbbbb1'], missing: () => [], bytesOf: (ids) => ids.length * 47e6,
    };
    setupSettingsGlobals({ SongKeep: keep, formatSongBytes: (n) => Math.round(n / 1e6) + ' MB' });
    window.__openSongs = vi.fn();
    try {
      renderSettings();
      expect(groupRowLabels('Listening')).toContain('Songs kept on this phone');
      const button = within(row('Songs kept on this phone')).getByRole('button');
      expect(button.textContent).toContain('3 · 141 MB · Manage');
      fireEvent.click(button);
      expect(window.__openSongs).toHaveBeenCalledWith([{ k: 'list', v: 'kept' }], 'Settings');
    } finally { delete window.__openSongs; }
  });

  it('(K3) the storage lines say where kept songs are counted: in the app data, not in Your data', async () => {
    teardownSettingsGlobals();
    setupSettingsGlobals({
      useStorageInfo: () => ({ status: 'ready', usage: 5e8, quota: 2e9, persisted: true }),
      measureUserData: () => Promise.resolve({ total: 2e6, structured: 2e6, media: 0, mediaCount: 0 }),
    });
    renderSettings();
    await act(async () => { await Promise.resolve(); });
    // WS3 settings (st-data2): the storage card counts kept songs; Your data's line does not claim them.
    expect(document.querySelector('.ws3-meter').textContent).toContain('songs kept on this phone');
    expect(row('Your data').querySelector('.settings-row-desc').textContent).not.toContain('songs');
  });

  it('the Protection row does not call an unbacked phone Saved: the APK has no persistence lever, so it says On this device', async () => {
    teardownSettingsGlobals();
    setupSettingsGlobals({
      useStorageInfo: () => ({ status: 'ready', usage: 5e8, quota: 2e9, persisted: false, persistDenied: false, persistable: false }),
      measureUserData: () => Promise.resolve({ total: 2e6, structured: 2e6, media: 0, mediaCount: 0 }),
    });
    renderSettings();
    await act(async () => { await Promise.resolve(); });
    const protection = row('Protection');
    expect(within(protection).queryByText('Saved', { exact: true })).toBeNull();
    expect(within(protection).getByText('On this device', { exact: true })).toBeTruthy();
  });

  // ra6 (Corbin 2026-10-14, brief design-10, the mock's place): under Songs kept on this phone, off by default.
  it('Download only on Wi-Fi sits under Songs kept on this phone, off by default, and toggles its own key', () => {
    window.AndroidBridge = { offlineAudioState: () => '{}', offlineAudioWifiOnly: vi.fn() };
    const onToggle = vi.fn();
    try {
      renderSettings({}, { onToggle });
      const labels = groupRowLabels('Listening');
      expect(labels).toContain('Download only on Wi-Fi');
      // WS2 settings (st-listen): in Songs and downloads, under the songs rows (no kept-songs store and no
      // Downloads screen in this harness, so those two rows are not drawn).
      expect(labels.indexOf('Download only on Wi-Fi')).toBe(labels.indexOf('Show songs on letter pages') + 1);
      const sw = within(row('Download only on Wi-Fi')).getByRole('switch');
      expect(sw.getAttribute('aria-checked')).toBe('false');
      fireEvent.click(sw);
      expect(onToggle).toHaveBeenCalledWith('downloadWifiOnly');
    } finally { delete window.AndroidBridge; }
  });

  // dl-d5 (call 5A): Keep the next 3 ready, under Download only on Wi-Fi, off by default; hidden where Wi-Fi can't be told.
  it('Keep the next 3 ready sits under Download only on Wi-Fi, off by default, and toggles its own key', () => {
    window.AndroidBridge = { offlineAudioState: () => '{}', offlineAudioWifiOnly: vi.fn() };
    const onToggle = vi.fn();
    try {
      renderSettings({}, { onToggle });
      const labels = groupRowLabels('Listening');
      expect(labels.indexOf('Keep the next 3 ready')).toBe(labels.indexOf('Download only on Wi-Fi') + 1);
      const sw = within(row('Keep the next 3 ready')).getByRole('switch');
      expect(sw.getAttribute('aria-checked')).toBe('false');
      fireEvent.click(sw);
      expect(onToggle).toHaveBeenCalledWith('keepNextReady');
    } finally { delete window.AndroidBridge; }
    cleanup();
    renderSettings();
    expect(groupRowLabels('Listening')).not.toContain('Keep the next 3 ready');
  });

  // player-1025 (Corbin 10-25): "Make the 15s forward/backward button 10s by default, adjustable in settings (typed
  // number, or incremented)". Under Default Speed; − and + move by 5, a typed number is kept to 5-60.
  it('Skip length: 10 s by default, a stepper and a typed number, writing its own key', () => {
    const onSetting = vi.fn();
    renderSettings({}, { onSetting });
    const labels = groupRowLabels('Listening');
    expect(labels.indexOf('Skip length')).toBe(labels.indexOf('Speed') + 1);
    const r = row('Skip length');
    const box = within(r).getByRole('spinbutton', { name: 'Skip seconds' });
    expect(box.value).toBe('10');
    fireEvent.click(within(r).getByRole('button', { name: 'Longer skip' }));
    expect(onSetting).toHaveBeenLastCalledWith('skipSeconds', 15);
    fireEvent.click(within(r).getByRole('button', { name: 'Shorter skip' }));
    expect(onSetting).toHaveBeenLastCalledWith('skipSeconds', 5);
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: '12' } });
    fireEvent.blur(box);
    expect(onSetting).toHaveBeenLastCalledWith('skipSeconds', 12);
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: '500' } });
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSetting).toHaveBeenLastCalledWith('skipSeconds', 60);
    cleanup();
    renderSettings({ skipSeconds: 60 });
    expect(within(row('Skip length')).getByRole('button', { name: 'Longer skip' }).disabled).toBe(true);
  });

  // Downloads brief section 7 item 10: where the browser cannot tell Wi-Fi from mobile data the switch did nothing.
  it('Download only on Wi-Fi: not offered where Wi-Fi cannot be told from mobile data, nor where nothing downloads', () => {
    window.AndroidBridge = { offlineAudioState: () => '{}' };   // a store, but no way to tell (as a desktop browser)
    try {
      renderSettings({ downloadWifiOnly: true });
      expect(groupRowLabels('Listening')).not.toContain('Download only on Wi-Fi');
    } finally { delete window.AndroidBridge; }
    cleanup();
    renderSettings();
    expect(groupRowLabels('Listening')).not.toContain('Download only on Wi-Fi');
  });

  // Downloads brief 3a, picture 18: the Downloads row, with what is on the phone, opens On this phone.
  it('Downloads says what is on the phone and opens On this phone', () => {
    window.AndroidBridge = { offlineAudioState: () => JSON.stringify({ items: [{ url: 'https://x.test/a.mp3', key: 'one:a', title: 'A', bytes: 251e6, savedAt: 1 }], totalBytes: 251e6, freeBytes: 10.7e9 }), offlineAudioWifiOnly: vi.fn() };
    window.__openDownloads = vi.fn();
    try {
      OfflineAudio._reset();
      renderSettings();
      const labels = groupRowLabels('Listening');
      expect(labels.indexOf('Downloads')).toBe(labels.indexOf('Download only on Wi-Fi') - 1);
      expect(row('Downloads').querySelector('.settings-row-desc').textContent).toBe('1 recording · 251 MB · 10.7 GB free');
      const btn = within(row('Downloads')).getByRole('button');
      fireEvent.click(btn);
      expect(window.__openDownloads).toHaveBeenCalledWith({ tab: 'phone' }, 'Settings');
    } finally { delete window.AndroidBridge; delete window.__openDownloads; }
  });

  it('no keep store on this browser, no Songs kept row', () => {
    renderSettings();
    expect(groupRowLabels('Listening')).not.toContain('Songs kept on this phone');
  });

  it('shows the speed the listening library already holds — no settings key', () => {
    teardownSettingsGlobals();
    setupSettingsGlobals({ AudioLibraryStore: fakeAudioLibrary(1.5) });
    renderSettings();   // settings object carries NO audioRate — deliberately
    expect(within(row('Speed')).getByRole('button', { name: /1.5/ })).toBeTruthy();
  });

  it('writes the chosen speed THROUGH to the library store', () => {
    teardownSettingsGlobals();
    const library = fakeAudioLibrary(1);
    setupSettingsGlobals({ AudioLibraryStore: library });
    const onSetting = vi.fn();
    renderSettings({}, { onSetting });
    fireEvent.click(within(row('Speed')).getByRole('button', { name: /1×/ }));
    fireEvent.click(screen.getByText('1.25×'));
    expect(library.getPlaybackRate()).toBe(1.25);
    // The row re-reads the store it just wrote — one source of truth, live.
    expect(within(row('Speed')).getByRole('button', { name: /1.25/ })).toBeTruthy();
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
    fireEvent.click(within(row('Speed')).getByRole('button', { name: /1×/ }));
    fireEvent.click(screen.getByText('2×'));
    expect(applied).toEqual([2]);
    expect(library.getPlaybackRate()).toBe(2);
  });

  it('shows a fine rate the desk left (1.37×) as the current choice beside the presets', () => {
    teardownSettingsGlobals();
    setupSettingsGlobals({ AudioLibraryStore: fakeAudioLibrary(1.37) });
    renderSettings();
    fireEvent.click(within(row('Speed')).getByRole('button', { name: /1\.37×/ }));
    // Presets still offered; the odd value is listed once, not lost or rounded away.
    expect(screen.getAllByText('1.37×').length).toBeGreaterThan(0);
    expect(screen.getByText('1.25×')).toBeTruthy();
  });

  it('hides the speed row entirely when the library store is absent', () => {
    teardownSettingsGlobals();
    setupSettingsGlobals({ AudioLibraryStore: undefined });
    renderSettings();
    // Hidden, not a lying "1×": with no store there is nothing to read or write.
    expect(row('Speed')).toBeUndefined();
    expect(row('Bible audio')).toBeTruthy();
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

    const toggle = screen.getByRole('button', { name: /Scriptures\s*0 of 50/ });
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
    fireEvent.click(screen.getByRole('button', { name: /Scriptures\s*0 of 50/ }));
    // Each Clear is named for what it clears (a11y pass 2026-11-01): the section's, then the book's.
    const clears = [screen.getByRole('button', { name: 'Clear Scriptures' }), screen.getByRole('button', { name: 'Clear Genesis' })];
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

  // WS2 settings (st-auto): the wait is a "− 2.5 s +" stepper, half a second a step, 0 to 15 s.
  const waitValue = () => row('Wait before going on').querySelector('.ws2-step-value').textContent;
  const waitBtn = (name) => within(row('Wait before going on')).getByRole('button', { name });

  it('the wait stepper spans no wait to a long sit, in half seconds', () => {
    const onSetting = vi.fn();
    renderSettings({ autoScroll: true, autoScrollNext: true, autoScrollEndMs: '2500' }, { onSetting });
    expect(waitValue()).toBe('2.5 s');
    fireEvent.click(waitBtn('Longer wait'));
    expect(onSetting).toHaveBeenLastCalledWith('autoScrollEndMs', '3000');
    cleanup();
    renderSettings({ autoScrollEndMs: '15000' });
    expect(waitBtn('Longer wait').disabled).toBe(true);
    expect(waitBtn('Shorter wait').disabled).toBe(false);
    cleanup();
    renderSettings({ autoScrollEndMs: '0' });
    expect(waitBtn('Shorter wait').disabled).toBe(true);
  });

  it('reads 0 as "None" rather than "0 s"', () => {
    renderSettings({ autoScroll: true, autoScrollNext: true, autoScrollEndMs: '0' });
    expect(waitValue()).toBe('None');
  });

  it('still renders a legacy preset dwell value from before the slider', () => {
    renderSettings({ autoScroll: true, autoScrollNext: true, autoScrollEndMs: '6000' });
    expect(waitValue()).toBe('6 s');
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
    renderSettings({ autoScroll: true, autoScrollNext: true, autoScrollEndMs: '9000' }, { onSetting });
    fireEvent.click(waitBtn('Shorter wait'));
    expect(onSetting).toHaveBeenCalledWith('autoScrollEndMs', '8500');
  });

  it('toggling auto-scroll goes through onToggle so the key stays canonical', () => {
    const onToggle = vi.fn();
    renderSettings({ autoScroll: false }, { onToggle });
    fireEvent.click(row('Auto-scroll pill on reading pages').querySelector('.settings-toggle input[type="checkbox"]'));
    expect(onToggle).toHaveBeenCalledWith('autoScroll');
  });

  // WS2 settings (st-auto): the speed row reads "16 lines a minute"; Reset appears only off 16.
  it('offers Reset only when the value has moved off standard', () => {
    const onSetting = vi.fn();
    renderSettings({ autoScroll: true, autoScrollLpm: '16' });
    expect(row('16 lines a minute')).toBeTruthy();
    expect(row('16 lines a minute').querySelector('.txtsize-reset')).toBeNull();
    cleanup();
    renderSettings({ autoScroll: true, autoScrollLpm: '30' }, { onSetting });
    const reset = row('30 lines a minute').querySelector('.txtsize-reset');
    expect(reset).toBeTruthy();
    fireEvent.click(reset);
    expect(onSetting).toHaveBeenCalledWith('autoScrollLpm', '16');
  });

  it('the − and + around the speed slider stop at the transport’s ends', () => {
    renderSettings({ autoScrollLpm: '40' });
    expect(screen.getByRole('button', { name: 'Faster' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Slower' }).disabled).toBe(false);
    cleanup();
    renderSettings({ autoScrollLpm: '4' });
    expect(screen.getByRole('button', { name: 'Slower' }).disabled).toBe(true);
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
    return r.querySelector('.settings-row-desc').textContent;
  };

  it('Export no longer promises a "single JSON file" the user will never find', () => {
    renderSettings();
    const desc = document.querySelector('.ws3-backup-line').textContent;
    expect(desc).toContain('.votbak');
    expect(desc).not.toContain('single JSON');
  });

  it('Import tells the user to pick the .votbak backup', () => {
    renderSettings();
    const desc = descOf('Restore from a backup');
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
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));

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
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'Delete all my data' }));
    expect(screen.getByText('Delete all your data?')).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Delete all your data?' })).toBeTruthy();
  };

  it('registers while open and unregisters on Cancel', () => {
    openWipeDialog();
    expect(modalRegistry.peek() && modalRegistry.peek().id).toBe('settings-wipe-dialog');
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Delete all your data?')).toBeNull();
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
    expect(screen.queryByText('Delete all your data?')).toBeNull();
    expect(screen.getByTestId('screen-layout')).toBeTruthy();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('reports a completed clear via toast, never the native alert()', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    const toastSpy = vi.fn();
    teardownSettingsGlobals();
    setupSettingsGlobals({ showToast: toastSpy });
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Delete all my data' }));
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByText('Delete everything'));
    await vi.waitFor(() => {
      expect(toastSpy).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'All personal data cleared. Reloading…' })
      );
    });
    expect(alertSpy).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(window.location.reload).toHaveBeenCalledTimes(1));
  });

  it('reports a failed personal-data deletion as failure and does not reload', async () => {
    // A failed delete (onerror). A blocked one is still running, not failed (sweep v033:
    // backup-flow.test.js). The library's own delete: when only the media's fails, the
    // library is already gone and the page reloads with its writers frozen (ds5 s33.1).
    const toastSpy = vi.fn();
    const deleteSpy = vi.spyOn(indexedDB, 'deleteDatabase').mockImplementation((name) => {
      const req = {};
      queueMicrotask(() => {
        if (name === 'votreader') req.onerror && req.onerror();
        else req.onsuccess && req.onsuccess();
      });
      return req;
    });
    localStorage.setItem('vot-clear-probe', 'keep-until-critical-deletes-finish');
    try {
      teardownSettingsGlobals();
      setupSettingsGlobals({ showToast: toastSpy });
      renderSettings();
      fireEvent.click(screen.getByRole('button', { name: 'Delete all my data' }));
      fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } });
      fireEvent.click(screen.getByText('Delete everything'));

      await vi.waitFor(() => {
        expect(toastSpy).toHaveBeenCalledWith(
          expect.objectContaining({ text: 'Clear did not finish. Please try again.' })
        );
      });
      expect(localStorage.getItem('vot-clear-probe')).toBe('keep-until-critical-deletes-finish');
      expect(window.location.reload).not.toHaveBeenCalled();
      expect(deleteSpy).toHaveBeenCalledWith('votreader');
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
    fireEvent.click(screen.getByRole('button', { name: 'Delete all my data' }));
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } });
    fireEvent.click(screen.getByText('Delete everything'));

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

/* PL-SEARCH 6 (REVIEW-data 5): "Back up first" runs inside the dialog. A Delete tap while it ran closed the
   dialog and deleted nothing (the busy lock dropped it without a word), and the dialog never said whether the
   backup was made, so a cancelled or failed one could be followed by a wipe. */
describe('wipe dialog — Back up first (PL-SEARCH 6)', () => {
  const okBuilt = { ok: true, manifest: { app: 'VOTReader', exportVersion: 3, stores: {}, media: [] }, manifestBytes: 2048, mediaEntries: [], problems: [] };
  const openWith = (openExportSink) => {
    teardownSettingsGlobals();
    setupSettingsGlobals({
      buildV3Manifest: vi.fn(async () => okBuilt),
      showToast: vi.fn(),
      PlatformBridge: {
        isAndroid: false, setKeepScreenOn: () => {}, saveToFile: () => {},
        openFilePicker: () => {}, openExportSink,
        pickImportFile: () => null, clearGardenCache: () => {}, getCrashLog: () => '[]',
      },
    });
    renderSettings();
    fireEvent.click(screen.getByRole('button', { name: 'Delete all my data' }));
    fireEvent.change(screen.getByLabelText('Type DELETE to confirm'), { target: { value: 'DELETE' } });
  };
  const del = () => screen.getByText('Delete everything').closest('button');
  const said = () => (document.querySelector('.ws3-dialog [role="status"]') || { textContent: '' }).textContent;

  it('Delete waits while the backup runs, and the dialog says when it is saved', async () => {
    let settle;
    openWith(vi.fn(() => new Promise((res) => { settle = res; })));
    expect(del().disabled).toBe(false);
    expect(said()).toBe('');
    fireEvent.click(screen.getByRole('button', { name: 'Back up first' }));
    await vi.waitFor(() => expect(typeof settle).toBe('function'));
    expect(del().disabled).toBe(true);
    expect(said()).toMatch(/Saving the backup/);
    // a tap (or Enter) meanwhile neither closes the dialog nor is lost
    fireEvent.click(del());
    fireEvent.keyDown(screen.getByLabelText('Type DELETE to confirm'), { key: 'Enter' });
    expect(screen.getByText('Delete all your data?')).toBeTruthy();
    await act(async () => { settle({ write: vi.fn(), close: vi.fn() }); });
    await vi.waitFor(() => expect(said()).toMatch(/^Backup saved/));
    expect(del().disabled).toBe(false);
    expect(screen.getByText('Delete all your data?')).toBeTruthy();
  });

  it('says so when no backup was made (the save was cancelled)', async () => {
    openWith(vi.fn(async () => null));
    fireEvent.click(screen.getByRole('button', { name: 'Back up first' }));
    await vi.waitFor(() => expect(said()).toMatch(/^No backup was made/));
    expect(del().disabled).toBe(false);
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
    fireEvent.click(screen.getByRole('button', { name: 'Restore from a backup' }));
    const sheet = await findImportSheet();
    // The destructive semantics are intact — a real choice, in-app…
    expect(confirmSpy).not.toHaveBeenCalled();
    expect(applySpy).not.toHaveBeenCalled();
    // …and Back/Escape would dismiss the sheet, not navigate underneath it.
    expect(sheet.id).toBe('settings-import-confirm');
    fireEvent.click(screen.getByText('Restore and overwrite'));
    await vi.waitFor(() => expect(applySpy).toHaveBeenCalledTimes(1));
  });

  it('dismissing the sheet (Cancel OR the Back/Escape registry path) applies nothing', async () => {
    const { applySpy } = setupImport();
    fireEvent.click(screen.getByRole('button', { name: 'Restore from a backup' }));
    await findImportSheet();
    fireEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText(/will OVERWRITE/)).toBeNull();
    expect(applySpy).not.toHaveBeenCalled();

    // Re-open and take the registry dismiss route this time.
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Restore from a backup' }).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Restore from a backup' }));
    const sheet = await findImportSheet();
    act(() => { sheet.dismiss(); });
    expect(screen.queryByText(/will OVERWRITE/)).toBeNull();
    expect(applySpy).not.toHaveBeenCalled();
  });

  it('locks all backup actions until the active picker and confirmation settle', async () => {
    const { pickImportFile } = setupImport();
    fireEvent.click(screen.getByRole('button', { name: 'Restore from a backup' }));
    await findImportSheet();

    for (const name of ['Back up now', 'Restore from a backup', 'Check a backup file']) {
      expect(screen.getByRole('button', { name }).disabled).toBe(true);
    }
    expect(screen.getByRole('button', { name: 'Delete all my data' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Restore from a backup' }));
    expect(pickImportFile).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Cancel'));
    await vi.waitFor(() => expect(screen.getByRole('button', { name: 'Restore from a backup' }).disabled).toBe(false));
  });

  it('keeps destructive data actions locked after import until the scheduled reload', async () => {
    const { applySpy } = setupImport();
    fireEvent.click(screen.getByRole('button', { name: 'Restore from a backup' }));
    await findImportSheet();
    fireEvent.click(screen.getByText('Restore and overwrite'));
    await vi.waitFor(() => expect(applySpy).toHaveBeenCalledTimes(1));

    expect(screen.getByRole('button', { name: 'Restore from a backup' }).disabled).toBe(true);
    expect(screen.getByRole('button', { name: 'Delete all my data' }).disabled).toBe(true);
  });

  it('brackets the apply with the restore-inflight marker (a crash mid-apply must warn at next boot)', async () => {
    localStorage.removeItem('vot-restore-inflight');
    let flagDuringApply = null;
    const applySpy = vi.fn(async () => {
      flagDuringApply = localStorage.getItem('vot-restore-inflight');
      return { importFailures: 0, writeFailures: 0, skippedStores: [], countMismatches: [] };
    });
    setupImport({ applyImportPayload: applySpy });
    fireEvent.click(screen.getByRole('button', { name: 'Restore from a backup' }));
    await findImportSheet();
    fireEvent.click(screen.getByText('Restore and overwrite'));

    await vi.waitFor(() => expect(applySpy).toHaveBeenCalledTimes(1));
    expect(flagDuringApply).not.toBeNull();   // set BEFORE the first mutation
    // Cleared only once the apply durably completed (useRestoreGuard's cue).
    await vi.waitFor(() => expect(localStorage.getItem('vot-restore-inflight')).toBeNull());
  });

  it('leaves the restore-inflight marker set when the apply throws (part-applied state)', async () => {
    localStorage.removeItem('vot-restore-inflight');
    const applySpy = vi.fn(async () => { throw new Error('corrupt payload'); });
    setupImport({ applyImportPayload: applySpy });
    fireEvent.click(screen.getByRole('button', { name: 'Restore from a backup' }));
    await findImportSheet();
    fireEvent.click(screen.getByText('Restore and overwrite'));

    await vi.waitFor(() => expect(applySpy).toHaveBeenCalledTimes(1));
    // The marker survives a handled failure — the boot guard must warn, because
    // a legacy apply may have part-landed before the throw.
    await vi.waitFor(() => expect(localStorage.getItem('vot-restore-inflight')).not.toBeNull());
    localStorage.removeItem('vot-restore-inflight');
  });

  it('does not erase another tab\'s restore marker when the import lock is busy', async () => {
    localStorage.setItem('vot-restore-inflight', 'active-tab-marker');
    setupImport({ applyImportPayload: vi.fn(async () => { throw new Error('another backup import is already in progress'); }) });
    fireEvent.click(screen.getByRole('button', { name: 'Restore from a backup' }));
    await findImportSheet();
    fireEvent.click(screen.getByText('Restore and overwrite'));

    await vi.waitFor(() => {
      expect(localStorage.getItem('vot-restore-inflight')).toBe('active-tab-marker');
    });
    localStorage.removeItem('vot-restore-inflight');
  });

  it('refuses import while any structured store is still pending hydration', async () => {
    const toastSpy = vi.fn();
    const pendingAnnotations = { ...globalThis.AnnotationStore, getState: () => 'pending' };
    const { applySpy } = setupImport({ AnnotationStore: pendingAnnotations, showToast: toastSpy });
    fireEvent.click(screen.getByRole('button', { name: 'Restore from a backup' }));
    await findImportSheet();
    fireEvent.click(screen.getByText('Restore and overwrite'));

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

    fireEvent.click(screen.getByRole('button', { name: 'Restore from a backup' }));
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

    fireEvent.click(screen.getByRole('button', { name: 'Restore from a backup' }));
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

    fireEvent.click(screen.getByRole('button', { name: 'Restore from a backup' }));
    await screen.findByText(/will OVERWRITE/);
    fireEvent.click(screen.getByText('Restore and overwrite'));

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
    fireEvent.click(screen.getByRole('button', { name: 'Restore from a backup' }));
    await screen.findByText(/will OVERWRITE/);
    // THE REGRESSION: pre-fix the finally fired here, before the user chose.
    expect(closeSpy).not.toHaveBeenCalled();
    expect(applySpy).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('Restore and overwrite'));
    await vi.waitFor(() => expect(applySpy).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(closeSpy).toHaveBeenCalled()); // closed only after apply consumed the stream
  });

  it('cancelling still closes the native stream and applies nothing', async () => {
    const { closeSpy, applySpy } = setupAndroidImport();
    fireEvent.click(screen.getByRole('button', { name: 'Restore from a backup' }));
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
describe('settings groups — each group is its own screen (WS1 st-root)', () => {
  const GROUPS = ['Appearance', 'Reading', 'Listening', 'Buttons and tools', 'Sharing', 'A Return to The Garden',
    'Your data', 'Reading progress'];
  const back = () => fireEvent.click(screen.getByRole('button', { name: 'Back to Settings' }));

  it('the root shows the eight groups as rows, then Show me around and About as rows of their own', () => {
    renderSettings({}, { onAbout: () => {} }, { expandGroups: false });
    expect(groupHeads().map((h) => h.querySelector('.settings-section-label').textContent)).toEqual(GROUPS);
    for (const label of GROUPS) expect(groupHead(label).getAttribute('aria-expanded')).toBe('false');
    expect(screen.getByRole('button', { name: /^Show me around/ })).toBeTruthy();
    expect(screen.getByRole('button', { name: /^About VOTReader/ })).toBeTruthy();
    // The root mounts no setting rows.
    expect(rowLabels().length).toBe(0);
    expect(document.querySelectorAll('.settings-card').length).toBe(0);
  });

  it('a row opens its group as a screen; Back returns to the root', () => {
    renderSettings({}, {}, { expandGroups: false });
    fireEvent.click(groupHead('Appearance'));
    expect(screen.getByRole('radio', { name: 'Light' })).toBeTruthy();
    expect(groupHead('Reading')).toBeUndefined();
    expect(row('Reading position marker')).toBeUndefined();
    expect(screen.queryByLabelText('Find settings')).toBeNull();
    back();
    expect(groupHeads()).toHaveLength(GROUPS.length);
    expect(screen.queryByRole('radio', { name: 'Light' })).toBeNull();
  });

  it('Theme is Dark | Light and writes through onThemeChange', () => {
    const onThemeChange = vi.fn();
    renderSettings({}, { onThemeChange }, { expandGroups: false });
    fireEvent.click(groupHead('Appearance'));
    expect(screen.getByRole('radio', { name: 'Dark' }).getAttribute('aria-checked')).toBe('true');
    fireEvent.click(screen.getByRole('radio', { name: 'Light' }));
    expect(onThemeChange).toHaveBeenCalledWith('light');
  });

  it('Auto-scroll is a screen inside Reading, and Back goes to Reading', () => {
    renderSettings({ autoScroll: true, autoScrollNext: true }, {}, { expandGroups: false });
    fireEvent.click(groupHead('Reading'));
    fireEvent.click(screen.getByRole('button', { name: /^Auto-scroll/ }));
    expect(row('Auto-scroll pill on reading pages')).toBeTruthy();
    expect(row('16 lines a minute')).toBeTruthy();
    expect(row('Wait before going on')).toBeTruthy();
    expect(row('Chapter titles')).toBeUndefined();
    fireEvent.click(screen.getByRole('button', { name: 'Back to Reading' }));
    expect(row('Chapter titles')).toBeTruthy();
  });
});

describe('settings folio summary', () => {
  it('surfaces the active theme, text scale, and reading typeface', () => {
    renderSettings({ fontScale: '1.5', fontStyle: 'literata' }, { theme: 'light' }, { expandGroups: false });
    const summary = document.querySelector('[data-settings-group="appearance"] .settings-group-sub');
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
    // s23.4: closed, the body is not mounted, so the header points at nothing.
    expect(groupHead('Appearance').hasAttribute('aria-controls')).toBe(false);
    fireEvent.click(groupHead('Appearance'));
    expect(groupHead('Appearance').getAttribute('aria-controls')).toBe('settings-group-appearance');
    expect(document.getElementById('settings-group-appearance')).toBeTruthy();
  });
});

/* Redesign: settings whose DEPENDENCY is off are unmounted, not greyed —
   the auto-scroll discipline applied screen-wide. */
describe('dependency-gated rows unmount with their dependency', () => {
  it('search sub-settings vanish while Search is off', () => {
    renderSettings({ searchEnabled: false });
    expect(row('Search')).toBeTruthy();
    expect(row('Synonym search')).toBeUndefined();
    expect(row('Leave out filler words')).toBeUndefined();
    cleanup();
    renderSettings({ searchEnabled: true });
    expect(row('Synonym search')).toBeTruthy();
    expect(row('Leave out filler words')).toBeTruthy();
  });

  it('Restored names vanishes only when BOTH title surfaces are off', () => {
    renderSettings({ showChapterTitle: false, showSectionHeadings: false });
    expect(row('Restored names')).toBeUndefined();
    cleanup();
    renderSettings({ showChapterTitle: false, showSectionHeadings: true });
    expect(row('Restored names')).toBeTruthy();
    cleanup();
    renderSettings({});
    expect(row('Restored names')).toBeTruthy();
  });

  // The three tabs (2026-11-10): one top bar everywhere, so the Compact | Icons choice and the gear, History and theme
  // chips changed nothing and left Settings (their stored keys stay); the bookmark is the one icon left to choose.
  it('Buttons and tools holds the reading page’s bookmark switch and nothing that does nothing', () => {
    const onToggle = vi.fn();
    renderSettings({}, { onToggle });
    expect(screen.queryByRole('radiogroup', { name: 'Top Bar' })).toBeNull();
    for (const name of ['Settings Gear', 'Theme', 'Compact Top Bar']) expect(screen.queryByRole('switch', { name })).toBeNull();
    expect(screen.getAllByRole('switch', { name: 'History' }).length).toBe(1);   // the feature row only
    fireEvent.click(screen.getByRole('switch', { name: 'Bookmark button' }));
    expect(onToggle).toHaveBeenCalledWith('showBookmarkNav');
  });
});

describe('fullscreen gesture setting', () => {
  it('keeps the fullscreen shortcut enabled by default and wires its switch to the canonical key', () => {
    const onToggle = vi.fn();
    renderSettings({}, { onToggle });
    const fullscreen = row('Double-tap for full screen');
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
    expect(row('Reading font')).toBeTruthy();
  });

  it('is a dropdown: the trigger opens the standard select sheet with all fonts', () => {
    renderSettings({ fontStyle: 'classic' });
    expect(document.querySelector('.select-sheet')).toBeNull();
    fireEvent.click(within(row('Reading font')).getByText('System Serif'));
    expect(document.querySelector('.select-sheet')).toBeTruthy();
    expect(document.querySelectorAll('.select-sheet-option').length).toBeGreaterThan(10);
  });

  it('selecting a built-in font writes settings.fontStyle through onSetting', async () => {
    const onSetting = vi.fn();
    renderSettings({ fontStyle: 'classic' }, { onSetting });
    fireEvent.click(within(row('Reading font')).getByText('System Serif'));
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
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));
    return { build, captured };
  };

  afterEach(() => { _resetToasts(); });

  it('offers "Save the file the usual way" as a real, tappable control', async () => {
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
    fireEvent.click(screen.getByRole('button', { name: 'Back up now' }));

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
    expect(btn.textContent).toBe('Save the file the usual way');
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

describe('Your Data: the last backup and the automatic snapshots (datasafe 10-05)', () => {
  afterEach(() => { delete /** @type {any} */ (globalThis).DataSafety; localStorage.removeItem('vot-last-export'); });

  it('says when this device last exported, or that it has not', () => {
    localStorage.removeItem('vot-last-export');      // an earlier case's export stamped it
    renderSettings();
    expect(document.body.textContent).toContain('Not backed up from this phone yet');
    cleanup();
    localStorage.setItem('vot-last-export', String(Date.now()));
    renderSettings();
    expect(document.body.textContent).toContain('Backed up today');
  });

  it('shows the newest automatic snapshot and where it is kept', async () => {
    /** @type {any} */ (globalThis).DataSafety = { status: async () => ({ where: 'phone', count: 3, newestAt: Date.now() }) };
    renderSettings();
    await waitFor(() => expect(document.body.textContent).toContain('Newest today · 3 kept on this phone'));
  });

  it('shows the weekly copy in Downloads with a calm off switch (dl-weekly)', async () => {
    let on = true;
    /** @type {any} */ (globalThis).DataSafety = {
      status: async () => ({ where: 'phone', count: 1, newestAt: Date.now() }),
      weeklyStatus: () => ({ supported: true, on, count: 2, newestAt: Date.now() }),
      setWeeklyOn: vi.fn((v) => { on = v; }),
    };
    renderSettings();
    await waitFor(() => expect(document.body.textContent).toContain('Newest today · in Downloads/VOTReader, the last 4 kept'));
    const btn = [...document.querySelectorAll('button')].find((b) => b.textContent === 'Turn off');
    fireEvent.click(btn);
    expect(globalThis.DataSafety.setWeeklyOn).toHaveBeenCalledWith(false);
    await waitFor(() => expect([...document.querySelectorAll('button')].some((b) => b.textContent === 'Turn on')).toBe(true));
  });

  // id-datasafe 159: a failed weekly copy said nothing.
  it('says when the weekly copy could not be saved, and why', async () => {
    let failure = { at: Date.now(), reason: 'failed' };
    /** @type {any} */ (globalThis).DataSafety = {
      status: async () => ({ where: 'phone', count: 1, newestAt: Date.now() }),
      weeklyStatus: () => ({ supported: true, on: true, count: 2, newestAt: Date.now() - 8 * 86400000, failure }),
      setWeeklyOn: vi.fn(),
    };
    const { unmount } = renderSettings();
    await waitFor(() => expect(document.body.textContent).toContain('The last copy could not be saved (today). The app tries again a day later'));
    unmount();
    failure = { at: Date.now(), reason: 'too-big' };
    renderSettings();
    await waitFor(() => expect(document.body.textContent).toContain('Paused: your library is too big for this copy'));
  });

  it('shows no weekly line where it cannot be kept (the web app, Android 9)', async () => {
    /** @type {any} */ (globalThis).DataSafety = {
      status: async () => ({ where: 'browser', count: 1, newestAt: Date.now() }),
      weeklyStatus: () => ({ supported: false, on: false, count: 0, newestAt: 0 }),
    };
    renderSettings();
    await waitFor(() => expect(document.body.textContent).toContain('kept in this browser'));
    expect(document.body.textContent).not.toContain('Weekly copy');
  });
});
