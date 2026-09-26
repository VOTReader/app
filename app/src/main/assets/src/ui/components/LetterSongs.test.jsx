// @ts-nocheck -- the FakeAudio pattern: a fake player, the real catalog module.
/* Songs of the Letters on a letter page (songs-U3, L4; picture final-05).
   README §7 L4's acceptance: a low-confidence song never shows on its letter;
   the pill plays in 1 tap; letters without songs show no pill. Plus W3-08:
   both pills show a playing state. */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const { player, setPlayerState, audio } = vi.hoisted(() => {
  let playerState;
  const audio = { has: true };
  const player = {
    subscribe: () => () => {},
    getVersion: () => 0,
    getState: () => playerState,
    hasAudio: vi.fn(() => audio.has),
    toggle: vi.fn(),
    playLetter: vi.fn(),
    playSongs: vi.fn(() => true),
  };
  return { player, setPlayerState: (next) => { playerState = next; }, audio };
});
vi.mock('../../utils/audio-player.js', () => ({ AudioPlayer: player }));

import { LetterListenRow, LetterSongsCard } from './LetterSongs.jsx';
import { adoptSongCatalog, _resetSongCatalogForTests } from '../../utils/song-catalog.js';
import { SONG_FIXTURE, VERBATIM_FIXTURE } from '../../utils/song-catalog.fixture.js';

const WTLB = { id: 'come-love-awaits-you', title: 'Come, Love Awaits You' };
const ONE = { id: 'the-letter', title: 'The Letter' };

function catalog(patch = {}) {
  return { ...SONG_FIXTURE, songs: SONG_FIXTURE.songs.map((s) => (patch[s.id] ? { ...s, ...patch[s.id] } : s)) };
}

beforeEach(() => {
  _resetSongCatalogForTests();
  adoptSongCatalog(SONG_FIXTURE);
  audio.has = true;
  setPlayerState({ queue: [], qi: 0, status: 'idle', time: 0, duration: 0 });
  for (const f of ['hasAudio', 'toggle', 'playLetter', 'playSongs']) player[f].mockClear();
  window.__openSongs = vi.fn();
});

afterEach(() => {
  cleanup();
  delete window.__openSongs;
  _resetSongCatalogForTests();
});

describe('the hero row: LISTEN and HEAR IT SUNG', () => {
  it('shows HEAR IT SUNG beside a filled LISTEN, and one tap plays the featured song then the rest', () => {
    render(<LetterListenRow volKey="wtlb1" letter={WTLB} collectionLabel="Part One" />);
    expect(screen.getByRole('button', { name: 'Listen' }).className).toContain('letter-listen-pill');
    fireEvent.click(screen.getByRole('button', { name: 'Hear it sung' }));
    expect(player.playSongs).toHaveBeenCalledWith({ ids: ['aaaaaaaaaaa1', 'aaaaaaaaaaa2'], startId: 'aaaaaaaaaaa1', label: 'Come, Love Awaits You' });
    fireEvent.click(screen.getByRole('button', { name: 'Listen' }));
    expect(player.playLetter).toHaveBeenCalledWith({ volKey: 'wtlb1', letter: WTLB, collectionLabel: 'Part One' });
  });

  it('a letter with only a LOW-confidence song shows no pill; a letter without songs shows only LISTEN', () => {
    adoptSongCatalog(catalog({ ccccccccccc2: { src: { k: 'letter', id: 'one:the-letter', c: 'l' } } }));
    render(<LetterListenRow volKey="one" letter={ONE} collectionLabel="Volume One" />);
    expect(screen.queryByRole('button', { name: 'Hear it sung' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Listen' })).toBeTruthy();
    cleanup();
    audio.has = false;
    const { container } = render(<LetterListenRow volKey="one" letter={ONE} collectionLabel="Volume One" />);
    expect(container.innerHTML).toBe('');                                     // nothing to hear, no row at all
  });

  it('a medium-confidence song still shows, and the setting turns the song pill off', () => {
    render(<LetterListenRow volKey="one" letter={ONE} collectionLabel="Volume One" />);
    expect(screen.getByRole('button', { name: 'Hear it sung' })).toBeTruthy();
    cleanup();
    render(<LetterListenRow volKey="one" letter={ONE} collectionLabel="Volume One" showSongs={false} />);
    expect(screen.queryByRole('button', { name: 'Hear it sung' })).toBeNull();
  });

  it('both pills show a playing state and pause on a second tap (W3-08)', () => {
    setPlayerState({ queue: [{ key: 'song:aaaaaaaaaaa2' }], qi: 0, status: 'playing' });
    render(<LetterListenRow volKey="wtlb1" letter={WTLB} collectionLabel="Part One" />);
    const sung = screen.getByRole('button', { name: 'Pause the song' });
    expect(sung.getAttribute('aria-pressed')).toBe('true');
    expect(sung.textContent).toBe('Pause song');
    fireEvent.click(sung);
    expect(player.toggle).toHaveBeenCalledTimes(1);
    expect(player.playSongs).not.toHaveBeenCalled();
    cleanup();

    setPlayerState({ queue: [{ key: 'wtlb1:come-love-awaits-you' }], qi: 0, status: 'playing' });
    render(<LetterListenRow volKey="wtlb1" letter={WTLB} collectionLabel="Part One" />);
    const listen = screen.getByRole('button', { name: 'Pause the reading' });
    expect(listen.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Hear it sung' }).getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(listen);
    expect(player.toggle).toHaveBeenCalledTimes(2);
    expect(player.playLetter).not.toHaveBeenCalled();
  });
});

describe('SONGS FROM THIS LETTER', () => {
  it('lists the letter\'s songs as in-app rows: a tap on the row plays (W-02), N versions opens its song', () => {
    render(<LetterSongsCard volKey="wtlb1" letterId={WTLB.id} letterTitle={WTLB.title} />);
    const card = document.querySelector('.letter-songs-card');
    expect(card.querySelector('.related-card-title').textContent).toBe('Songs from this letter');
    const row = card.querySelector('.songs-row');
    expect(row.textContent).toContain('2 versions');
    fireEvent.click(within(row).getByRole('button', { name: /Play Come, Love Awaits You/ }));
    expect(player.playSongs).toHaveBeenCalledWith(expect.objectContaining({ startId: 'aaaaaaaaaaa1' }));
    player.playSongs.mockClear();
    fireEvent.click(row.querySelector('.songs-row-hit'));                  // the row body: sound, not a page
    expect(player.playSongs).toHaveBeenCalledWith(expect.objectContaining({ startId: 'aaaaaaaaaaa1' }));
    expect(window.__openSongs).not.toHaveBeenCalled();
    fireEvent.click(within(row).getByRole('button', { name: 'All 2 versions of Come, Love Awaits You' }));
    expect(window.__openSongs).toHaveBeenCalledWith([{ k: 'song', v: 'fam-a' }], 'Come, Love Awaits You');
    expect(screen.queryByRole('button', { name: /All .* of this letter/ })).toBeNull();   // one song: no "All"
  });

  it('shows three songs, then "All N songs of this letter ›" to the letter\'s list', () => {
    const extra = ['e1', 'e2', 'e3'].map((f, i) => ({
      id: 'eeeeeeeeeee' + (i + 1), t: 'Extra ' + i, f, v: 'Pop', st: ['pop'], dl: 'sung', lang: 'en',
      src: { k: 'letter', id: 'wtlb1:come-love-awaits-you', c: 'h' }, d: 100, b: 1, sh: 1, cr: null, lyr: 0, rd: null, fs: '2025-09-21', hid: false, dup: null,
      vb: 0.9, vs: true,
    }));
    adoptSongCatalog({ ...SONG_FIXTURE, songs: SONG_FIXTURE.songs.concat(extra),
      families: SONG_FIXTURE.families.concat(extra.map((s) => ({ id: s.f, t: s.t, feat: s.id, n: 1, col: 'wtlb1', src: s.src, lb: '' }))) });
    render(<LetterSongsCard volKey="wtlb1" letterId={WTLB.id} letterTitle={WTLB.title} />);
    expect(document.querySelectorAll('.letter-songs-card .songs-row').length).toBe(3);
    fireEvent.click(screen.getByRole('button', { name: /All 4 songs of this letter/ }));
    expect(window.__openSongs).toHaveBeenCalledWith([{ k: 'list', v: 'sung:wtlb1:come-love-awaits-you' }], 'Come, Love Awaits You');
  });

  it('offers to keep this letter’s songs on the phone, every version, sized from the catalog (K1)', async () => {
    const { SongKeep } = await import('../../utils/song-keep.js');
    globalThis.OfflineSongsStore = { all: async () => [], get: async () => null, put: async () => {}, delete: async () => {} };
    if (!globalThis.indexedDB) globalThis.indexedDB = {};
    SongKeep._reset();
    try {
      render(<LetterSongsCard volKey="wtlb1" letterId={WTLB.id} letterTitle={WTLB.title} />);
      expect(screen.getByRole('button', { name: 'Keep these 2 songs · 6 MB' })).toBeTruthy();
    } finally { delete globalThis.OfflineSongsStore; SongKeep._reset(); }
  });

  it('renders nothing for a letter without songs, or with the setting off', () => {
    const { container } = render(<LetterSongsCard volKey="two" letterId="none" />);
    expect(container.innerHTML).toBe('');
    cleanup();
    const off = render(<LetterSongsCard volKey="wtlb1" letterId={WTLB.id} showSongs={false} />);
    expect(off.container.innerHTML).toBe('');
  });
});

/* The verbatim gate (Corbin 2026-09-25): "Hear it sung" and the letter's songs card offer ONLY songs that sing
   the letter's own words, never a musical interpretation. Golden: "Born Again" (Rock, hmarie777, 620080f78d26)
   sings wholly new lyrics (vb 0, vs false). */
describe('the verbatim gate', () => {
  const BORN_AGAIN = { id: 'born-again', title: 'Born Again' };
  const KINGDOM = { id: 'the-kingdom', title: 'The Kingdom' };
  beforeEach(() => { adoptSongCatalog(VERBATIM_FIXTURE); });

  it('(golden) the letter three:born-again shows NO Hear it sung and no card row', () => {
    render(<LetterListenRow volKey="three" letter={BORN_AGAIN} collectionLabel="Volume Three" />);
    expect(screen.queryByRole('button', { name: 'Hear it sung' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Listen' })).toBeTruthy();     // the reading stays
    cleanup();
    const card = render(<LetterSongsCard volKey="three" letterId="born-again" letterTitle="Born Again" />);
    expect(card.container.innerHTML).toBe('');
  });

  it('a verbatim song (Come, Love Awaits You, Country) keeps the pill and the card', () => {
    render(<LetterListenRow volKey="wtlb1" letter={WTLB} collectionLabel="Part One" />);
    fireEvent.click(screen.getByRole('button', { name: 'Hear it sung' }));
    expect(player.playSongs).toHaveBeenCalledWith({ ids: ['179aabfb6748'], startId: '179aabfb6748', label: 'Come, Love Awaits You' });
    cleanup();
    render(<LetterSongsCard volKey="wtlb1" letterId={WTLB.id} letterTitle={WTLB.title} />);
    expect(document.querySelectorAll('.letter-songs-card .songs-row').length).toBe(1);
  });

  it('a mixed family: the pill and the card play its verbatim vfeat, never the featured interpretation', () => {
    render(<LetterListenRow volKey="wtlb1" letter={KINGDOM} collectionLabel="Part One" />);
    fireEvent.click(screen.getByRole('button', { name: 'Hear it sung' }));
    expect(player.playSongs).toHaveBeenLastCalledWith({ ids: ['00000000cab2'], startId: '00000000cab2', label: 'The Kingdom' });
    cleanup();
    player.playSongs.mockClear();
    render(<LetterSongsCard volKey="wtlb1" letterId={KINGDOM.id} letterTitle={KINGDOM.title} />);
    fireEvent.click(document.querySelector('.letter-songs-card .songs-row-hit'));
    expect(player.playSongs).toHaveBeenLastCalledWith(expect.objectContaining({ ids: ['00000000cab2'], startId: '00000000cab2' }));
  });

  it('a catalog row with no vs field counts as false: no pill, no card', () => {
    render(<LetterListenRow volKey="one" letter={{ id: 'old-letter', title: 'Old Letter' }} collectionLabel="Volume One" />);
    expect(screen.queryByRole('button', { name: 'Hear it sung' })).toBeNull();
    cleanup();
    const card = render(<LetterSongsCard volKey="one" letterId="old-letter" />);
    expect(card.container.innerHTML).toBe('');
  });

  it('"All N songs of this letter" counts the verbatim families only', () => {
    const extra = ['v1', 'v2', 'v3', 'i1', 'i2'].map((f, i) => ({
      id: '00000000ee0' + (i + 1), t: 'Extra ' + f, f, v: 'Pop', st: ['pop'], dl: 'sung', lang: 'en',
      src: { k: 'letter', id: 'wtlb1:come-love-awaits-you', c: 'h' }, d: 100, b: 1, sh: 1, cr: null, lyr: 0, rd: null, fs: '2025-09-21', hid: false, dup: null,
      vb: f[0] === 'v' ? 0.9 : 0.1, vs: f[0] === 'v',
    }));
    adoptSongCatalog({ ...VERBATIM_FIXTURE, songs: VERBATIM_FIXTURE.songs.concat(extra),
      families: VERBATIM_FIXTURE.families.concat(extra.map((s) => ({ id: s.f, t: s.t, feat: s.id, n: 1, col: 'wtlb1', src: s.src, lb: '', vs: s.vs, vfeat: s.vs ? s.id : null, nvs: s.vs ? 1 : 0 }))) });
    render(<LetterSongsCard volKey="wtlb1" letterId={WTLB.id} letterTitle={WTLB.title} />);
    expect(Array.from(document.querySelectorAll('.letter-songs-card .songs-row strong')).map((n) => n.textContent)).not.toContain('Extra i1');
    expect(screen.getByRole('button', { name: /All 4 songs of this letter/ })).toBeTruthy();
  });
});
