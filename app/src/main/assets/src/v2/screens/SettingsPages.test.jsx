/* v2 Settings pages (zv1): the gate pictures 7a-listening, 7b-your-data and 7c-help (words as drawn, Back says Settings,
   Home lit), 4a's rows opening them, and real boots over fakes: a switch or a pick writes main's setting, the speed goes
   to the player, Your data runs main's backup flow (mocked here), Clear all waits for DELETE. A gate boot writes nothing. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, act, fireEvent } from '@testing-library/react';
import { V2App } from '../App.jsx';
import { ListeningPage, YourDataPage, HelpPage } from './SettingsPages.jsx';

/** main's backup flow, as the page builds it: its ctx kept, every operation a spy, the runners calling straight through */
const flow = vi.hoisted(() => ({ ctx: /** @type {any} */ (null), api: /** @type {any} */ (null) }));
vi.mock('../../utils/backup-flow.js', () => ({
  createBackupFlow: (ctx) => {
    flow.ctx = ctx;
    flow.api = {
      exportPersonalData: vi.fn(() => Promise.resolve()), importPersonalData: vi.fn(() => Promise.resolve()),
      verifyBackupFile: vi.fn(() => Promise.resolve()), clearAllPersonalData: vi.fn(() => Promise.resolve()),
      _runLockedBackupOperation: vi.fn((op) => op()), _runBackupOperation: vi.fn((op) => op()),
    };
    return flow.api;
  },
}));

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const texts = (root, sel) => [...root.querySelectorAll(sel)].map((n) => n.textContent);
const rowByTitle = (root, t) => [...root.querySelectorAll('.srow')].find((r) => r.querySelector('.t') && r.querySelector('.t').textContent === t);
const buttonByText = (root, t) => [...root.querySelectorAll('button')].find((b) => b.textContent === t);
const Listening = /** @type {any} */ (ListeningPage);
const YourData = /** @type {any} */ (YourDataPage);
const Help = /** @type {any} */ (HelpPage);
const EDITIONS = { 'brm-kjv': { label: 'KJV · Biblical Restoration Ministries' } };

afterEach(() => {
  cleanup();
  for (const k of ['StateStore', 'AudioPlayer', 'AudioLibraryStore', 'BIBLE_AUDIO_EDITIONS', 'DataSafety', 'getBuildVersion', 'PlatformBridge']) delete g[k];
  delete html.dataset.gate;
  flow.ctx = null;
  flow.api = null;
  vi.restoreAllMocks();
});

/** A ready StateStore holding `settings`; set() keeps what it was given. */
function fakeStore(settings = {}) {
  const store = { st: { settings }, isReady: () => true, get: () => store.st, set: vi.fn((s) => { store.st = s; }) };
  return store;
}

const bare = (Page, props = {}) => render(<Page gate={null} desktop={false} device="phone" onReady={() => {}} go={vi.fn()} {...props} />);

describe('gate pictures', () => {
  it('7a-listening: who reads, while it plays, songs; every switch on; Back says Settings, Home lit', async () => {
    g.BIBLE_AUDIO_EDITIONS = EDITIONS;
    const { container } = render(<V2App gateId="7a-listening" />);
    expect(container.querySelector('h1.display').textContent).toBe('Listening');
    expect(texts(container, '.settings .label')).toEqual(['Who reads', 'While it plays', 'Songs']);
    expect(texts(container, '.settings .srow .s')).toEqual([
      'Benjamin, wherever he has recorded', 'KJV · Biblical Restoration Ministries', '1×',
      'Read-along highlight', 'Keeps that line mid-screen', 'The reading moves with the audio', 'On letters a song sings word for word',
    ]);
    expect(texts(container, '[role="switch"] .t')).toEqual(['Light the line being read', 'Follow the voice', 'Turn the page with the audio', 'Hear it sung']);
    expect(texts(container, '[role="switch"]').length).toBe(container.querySelectorAll('[role="switch"][aria-checked="true"]').length);
    expect(container.querySelector('.tb .title').textContent).toBe('Settings');
    expect(container.querySelector('.tab[aria-current="page"]').textContent).toBe('Home');
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
  });

  it('7b-your-data: exported 2 days ago, newest snapshot today, 7 kept, weekly off; nothing runs from a gate boot', async () => {
    g.DataSafety = { setWeeklyOn: vi.fn() };
    const { container } = render(<V2App gateId="7b-your-data" />);
    expect(container.querySelector('h1.display').textContent).toBe('Your data');
    expect(container.querySelector('.lede').textContent).toBe('Your notes, journal and highlights stay on this phone.');
    expect(container.querySelector('.safe .t').textContent).toBe('Exported 2 days ago');
    expect(container.querySelector('.safe .s').textContent).toBe('Newest snapshot today · 7 kept on this phone');
    expect(texts(container, '.stack button')).toEqual(['Export a backup', 'Import a backup']);
    expect(rowByTitle(container, 'Weekly copy').querySelector('.s').textContent).toBe('Off · once a week, the last 4 kept');
    expect(rowByTitle(container, 'Weekly copy').getAttribute('aria-checked')).toBe('false');
    expect(rowByTitle(container, 'Check a backup file').querySelector('.s').textContent).toBe('Without importing it');
    expect(container.querySelector('.danger-t').textContent).toBe('Clear all personal data…');
    await click(buttonByText(container, 'Export a backup'));
    await click(rowByTitle(container, 'Weekly copy'));
    await click(container.querySelector('.danger-t'));
    expect(flow.api._runLockedBackupOperation).not.toHaveBeenCalled();
    expect(g.DataSafety.setWeeklyOn).not.toHaveBeenCalled();
    expect(document.querySelector('[role="dialog"]')).toBe(null);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
  });

  it('7c-help: the three rows, the note, this build\'s version; ready once the version is read', async () => {
    g.getBuildVersion = () => Promise.resolve({ cacheVersion: 'v1.0.2-27de477ee6', corpusVersion: 'c69' });
    g.PlatformBridge = { isAndroid: true };
    const { container } = render(<V2App gateId="7c-help" />);
    expect(container.querySelector('h1.display.long').textContent).toBe('Help and about');
    expect(texts(container, '.settings .srow .t')).toEqual(['Show me around', 'Privacy', 'Credits']);
    expect(texts(container, '.settings .srow .s')).toEqual(['A short tour that points at the real buttons', 'Nothing you write leaves this phone', 'OpenBible.info, and the songs of the flock']);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    expect(texts(container, '.ver > div')).toEqual(['1.0.2-27de477ee6 · corpus c69', 'Installed app build: updates come as a new app']);
  });

  it('4a\'s Listening, Your data and Help rows open these pages; Back returns to Settings', async () => {
    const { container } = render(<V2App gateId="4a-settings" />);
    for (const [row, h1] of [['Listening', 'Listening'], ['Your data', 'Your data'], ['Help and about', 'Help and about']]) {
      await click(rowByTitle(container, row));
      expect(container.querySelector('h1.display').textContent).toBe(h1);
      expect(container.querySelector('.tb .title').textContent).toBe('Settings');
      await click(container.querySelector('.tb .ic[aria-label="Back to Settings"]'));
      expect(container.querySelector('h1.display').textContent).toBe('Settings');
    }
  });
});

describe('Listening, real boot', () => {
  it('a switch writes main\'s key with its touched mark and flips; Follow the voice goes when the highlight is off', async () => {
    g.StateStore = fakeStore({});
    const { container } = bare(Listening);
    expect(rowByTitle(container, 'Follow the voice')).toBeTruthy();
    await click(rowByTitle(container, 'Light the line being read'));
    expect(g.StateStore.st.settings).toEqual({ readAlongHighlight: false, touched: { readAlongHighlight: true } });
    expect(rowByTitle(container, 'Light the line being read').getAttribute('aria-checked')).toBe('false');
    expect(rowByTitle(container, 'Follow the voice')).toBe(undefined);
    await click(rowByTitle(container, 'Hear it sung'));
    expect(g.StateStore.st.settings.showLetterSongs).toBe(false);
  });

  it('the reader sheet lists the five, checks the current one and writes the pick (the player told too)', async () => {
    g.StateStore = fakeStore({ letterReader: 'B' });
    g.AudioPlayer = { setPreferredReader: vi.fn(), setPlaybackRate: vi.fn() };
    const { container } = bare(Listening);
    await click(rowByTitle(container, 'Favourite reader'));
    const sheet = /** @type {HTMLElement} */ (container.querySelector('.sheet.pick[role="dialog"]'));
    expect(sheet.getAttribute('aria-label')).toBe('Favourite reader');
    expect(texts(sheet, '.srow.opt .t')).toEqual(['Automatic', 'Benjamin', 'Timothy', 'Spoken voice', 'With music']);
    expect(texts(sheet, '.srow.opt.on .t')).toEqual(['Benjamin']);
    await click(rowByTitle(sheet, 'Timothy'));
    expect(container.querySelector('.sheet')).toBe(null);
    expect(g.StateStore.st.settings.letterReader).toBe('T');
    expect(g.AudioPlayer.setPreferredReader).toHaveBeenCalledWith('T');
    expect(rowByTitle(container, 'Favourite reader').querySelector('.s').textContent).toBe('Timothy, wherever he has recorded');
  });

  it('the speed sheet sets the player\'s speed; the scrim closes a sheet with nothing written', async () => {
    g.StateStore = fakeStore({});
    let rate = 1;
    g.AudioPlayer = { setPlaybackRate: vi.fn((r) => { rate = r; }) };
    g.AudioLibraryStore = { getPlaybackRate: () => rate };
    const { container } = bare(Listening);
    await click(rowByTitle(container, 'Starting speed'));
    await click(rowByTitle(container.querySelector('.sheet'), '1.5×'));
    expect(g.AudioPlayer.setPlaybackRate).toHaveBeenCalledWith(1.5);
    expect(rowByTitle(container, 'Starting speed').querySelector('.s').textContent).toBe('1.5×');
    await click(rowByTitle(container, 'Bible audio'));
    await click(container.querySelector('.scrim'));
    expect(container.querySelector('.sheet')).toBe(null);
    expect(g.StateStore.set).not.toHaveBeenCalled();
  });
});

describe('Your data, real boot', () => {
  it('Export runs main\'s export under its lock; Import runs unlocked; Check clears the last answer first', async () => {
    const { container } = bare(YourData);
    await click(buttonByText(container, 'Export a backup'));
    expect(flow.api._runLockedBackupOperation).toHaveBeenCalledWith(flow.api.exportPersonalData);
    await click(buttonByText(container, 'Import a backup'));
    expect(flow.api._runBackupOperation).toHaveBeenCalledWith(flow.api.importPersonalData);
    act(() => flow.ctx.setVerifyReport({ message: 'Backup looks good: 12 notes.', level: 'ok' }));
    expect(container.querySelector('.report.ok .fine').textContent).toBe('Backup looks good: 12 notes.');
    await click(rowByTitle(container, 'Check a backup file'));
    expect(flow.api._runLockedBackupOperation).toHaveBeenCalledWith(flow.api.verifyBackupFile);
    expect(container.querySelector('.report')).toBe(null);
  });

  it('main\'s overwrite question is a sheet; its answer settles the import, the scrim answers no', async () => {
    const { container } = bare(YourData);
    let yes;
    act(() => { yes = flow.ctx.confirmImport('Replace 3 notes with the backup?'); });
    expect(container.querySelector('.sheet.ask .fine').textContent).toBe('Replace 3 notes with the backup?');
    await click(buttonByText(container, 'Import and replace'));
    expect(await yes).toBe(true);
    expect(container.querySelector('.sheet')).toBe(null);
    let no;
    act(() => { no = flow.ctx.confirmImport('Again?'); });
    await click(container.querySelector('.scrim'));
    expect(await no).toBe(false);
  });

  it('Clear all waits for DELETE typed, then runs main\'s clear under its lock', async () => {
    const { container } = bare(YourData);
    await click(container.querySelector('.danger-t'));
    const del = buttonByText(container, 'Delete everything');
    expect(del.disabled).toBe(true);
    const box = /** @type {HTMLInputElement} */ (container.querySelector('input.wipe'));
    fireEvent.change(box, { target: { value: 'delet' } });
    expect(buttonByText(container, 'Delete everything').disabled).toBe(true);
    fireEvent.change(box, { target: { value: ' delete ' } });
    expect(buttonByText(container, 'Delete everything').disabled).toBe(false);
    await click(buttonByText(container, 'Delete everything'));
    expect(flow.api._runLockedBackupOperation).toHaveBeenCalledWith(flow.api.clearAllPersonalData);
    expect(container.querySelector('.sheet')).toBe(null);
  });

  it('the weekly copy flips through DataSafety and re-reads it', async () => {
    let on = false;
    g.DataSafety = { status: () => null, weeklyStatus: () => ({ on }), setWeeklyOn: vi.fn((v) => { on = v; return Promise.resolve(); }) };
    const { container } = bare(YourData);
    await click(rowByTitle(container, 'Weekly copy'));
    expect(g.DataSafety.setWeeklyOn).toHaveBeenCalledWith(true);
    await waitFor(() => expect(rowByTitle(container, 'Weekly copy').getAttribute('aria-checked')).toBe('true'));
  });
});

describe('Help and about, real boot', () => {
  it('Show me around goes Home for the tour; Credits opens its page; an unknown build says so', async () => {
    g.getBuildVersion = () => Promise.resolve(null);
    const go = vi.fn();
    const openTab = vi.fn();
    const { container } = bare(Help, { go, openTab });
    await click(rowByTitle(container, 'Show me around'));
    expect(openTab).toHaveBeenCalledWith('home');
    await click(rowByTitle(container, 'Credits'));
    expect(go).toHaveBeenCalledWith({ place: 'settings/credits' });
    await waitFor(() => expect(container.querySelector('.ver > div').textContent).toBe('Not known on this phone'));
  });
});
