/* A letter's foot (mw7, v2-gaps 21 + 18's card; design dz23 1k/1l; main's LetterView related-section and LetterSongsCard):
   the groups in main's order and only where the letter has them, where each row goes (Answers and letters in the app, the
   rest outside it), the channel-as-video row dropped, the songs card and its keep button, and the two gate rows.
   Fixtures: Volume One Letters 1 and 2 as volume-one.js keeps them (their foot fields verbatim, the text cut). */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, cleanup, waitFor, act } from '@testing-library/react';
import { V2App } from '../App.jsx';
import { GATE_STATES } from '../gate.js';
import { LetterScreen } from './LetterScreen.jsx';
import { footGroups, hostOf, isChannel, songBytes, songClock, openRow, CHANNEL_URL } from './LetterFoot.jsx';
import './CollectionScreen.jsx';

const g = /** @type {any} */ (globalThis);
const html = document.documentElement;
const click = (el) => act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
const settle = (ms = 30) => act(() => new Promise((r) => { setTimeout(r, ms); }));
const texts = (root, sel) => [...root.querySelectorAll(sel)].map((n) => n.textContent);

const AQ = 'https://answersonlygodcangive.com/';
const LETTER_1 = {
  id: 'chosen-by-god', num: 1, title: 'Chosen by God', blocks: [{ type: 'p', text: 'Thus says The Lord to His servant.' }],
  relatedTopics: [{ label: 'Regarding Prophets (True)', url: AQ + 'Regarding_Prophets_(True)' }, { label: 'Regarding Faith', url: AQ + 'Regarding_Faith' }],
  audioUrl: 'https://thevolumesoftruth.bandcamp.com/track/chosen-by-god-4',
  soundcloudUrl: 'https://soundcloud.com/the-volumes-of-truth/v1-001_chosen-by-god?in=the-volumes-of-truth/sets/volume-one',
  videoVoiceUrl: 'https://www.youtube.com/watch?v=j-8yNPMN7cQ&list=PLE8FlkxQPQkNhyk7QOplwIcW788ErwTRh&index=2',
  videoMusicUrl: 'https://www.youtube.com/user/trumpetcallofgod',
};
const LETTER_2 = { id: 'honor-not-the-day-of-the-dead', num: 2, title: 'Honor Not the Day of the Dead... Honor God',
  blocks: [{ type: 'p', text: 'Honor Me!' }], relatedTopics: [{ label: 'God Speaks About Idolatry', url: AQ + 'God_Speaks_About_Idolatry' }] };
const LETTER_3 = { id: 'christmas', num: 3, title: 'Christmas', blocks: [{ type: 'p', text: 'x' }] };
const ONE = { volKey: 'one', label: 'Volume One', globalName: 'LETTERS_V1' };
const ANSWERS = { volKey: 'answers', label: 'Answers Only God Can Give', globalName: 'ANSWERS_TOPICS' };
const TOPICS = { 'regarding prophets true': 'regarding-prophets-true', 'regarding faith': 'regarding-faith' };

function installCorpus() {
  g.COLLECTIONS = [ONE, ANSWERS];
  g.COL_BY_KEY = new Map([['one', ONE], ['answers', ANSWERS]]);
  g.LETTERS_V1 = [LETTER_1, LETTER_2, LETTER_3];
  // main's index (utils/answers-links.js publishes it), here by the URL's words
  g.__answersIdForUrl = (url) => TOPICS[decodeURIComponent(url.slice(AQ.length)).replace(/_/g, ' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()] || null;
}
/** The Answers corpus as bundle-d's loader publishes it: its topics appear once load resolves. */
function answersLoader() {
  g.__answersCorpus = { loaded: false, subscribe: () => () => {}, getVersion: () => 0 };
  g.__loadAnswersCorpus = vi.fn(() => Promise.resolve().then(() => {
    g.ANSWERS_TOPICS = [{ id: 'regarding-faith', num: 41, title: 'Regarding Faith' }, { id: 'regarding-prophets-true', num: 70, title: 'Regarding Prophets (True)' }];
    g.__answersCorpus.loaded = true;
  }));
}

afterEach(() => {
  cleanup();
  for (const k of ['COLLECTIONS', 'COL_BY_KEY', 'LETTERS_V1', 'ANSWERS_TOPICS', '__answersIdForUrl', '__answersCorpus',
    '__loadAnswersCorpus', 'SongCatalog', 'SongKeep', 'AudioPlayer', 'StateStore', 'NetStatus', 'matchMedia']) delete g[k];
  delete html.dataset.gate;
  vi.restoreAllMocks();
});

describe('footGroups (main\'s related-section, in its order)', () => {
  it('Letter 1: Related topics in the app; Audio with Bandcamp; Videos without the channel-as-video row, the channel last', () => {
    installCorpus();
    const { before, after } = footGroups(LETTER_1);
    expect(before.map((x) => x.label)).toEqual(['Related topics']);
    expect(before[0].rows).toEqual([
      { t: 'Regarding Prophets (True)', url: AQ + 'Regarding_Prophets_(True)', answers: 'regarding-prophets-true' },
      { t: 'Regarding Faith', url: AQ + 'Regarding_Faith', answers: 'regarding-faith' },
    ]);
    expect(after.map((x) => x.label)).toEqual(['Audio', 'Videos']);
    expect(after[0].rows.map((r) => [r.t, r.host || ''])).toEqual([['Audio recording', 'Bandcamp'], ['Listen on SoundCloud', '']]);
    expect(after[1].rows.map((r) => [r.t, r.host || '', r.url])).toEqual([
      ['Video (with voice over)', 'YouTube', LETTER_1.videoVoiceUrl], ['Official YouTube channel', '', CHANNEL_URL]]);
    expect(after.flatMap((x) => x.rows).every((r) => r.lead)).toBe(true);
  });

  it('the channel alone makes no Videos group (main\'s C5 rule, and the channel-as-video row is not a video)', () => {
    expect(footGroups({ videoMusicUrl: CHANNEL_URL + '/', videoVoiceUrl: 'http://youtube.com/user/trumpetcallofgod' }).after).toEqual([]);
    const both = footGroups({ videoVoiceUrl: 'https://www.youtube.com/watch?v=a', videoMusicUrl: 'https://www.youtube.com/watch?v=b' }).after[0];
    expect(both.rows.map((r) => r.t)).toEqual(['Video (with voice over)', 'Video (excerpts set to music)', 'Official YouTube channel']);
    expect(footGroups({ videoVoiceUrl: 'https://youtu.be/x', videoVoiceLabel: 'Four Part Video Series (with voice over)' }).after[0].rows[0])
      .toMatchObject({ t: 'Four Part Video Series (with voice over)', host: 'YouTube' });
  });

  it('a topic main\'s index cannot place leaves the app; a row with a link and Also read open letters in the app', () => {
    installCorpus();
    const { before } = footGroups({
      addendum: 'Grafted In', addendumLink: { collection: 'Volume Three', letterTitle: 'Grafted In' }, addendumUrl: 'https://x/Grafted_In',
      relatedTopics: [{ label: 'Not Here', url: AQ + 'Not_Here' }, { label: 'Elsewhere', url: 'https://example.org/a' }],
      bibleStudies: [{ label: 'The Trinity', url: 'https://t', link: { collection: 'The Trinity', letterTitle: 'The Trinity' } }],
    });
    expect(before.map((x) => x.label)).toEqual(['Also read', 'Related topics', 'Bible study']);
    expect(before[0].rows[0].link).toEqual({ collection: 'Volume Three', letterTitle: 'Grafted In' });
    expect(before[1].rows).toEqual([{ t: 'Not Here', url: AQ + 'Not_Here' }, { t: 'Elsewhere', url: 'https://example.org/a' }]);
    expect(before[2].rows[0].link).toBeTruthy();
  });

  it('a letter with none of it has no groups; without main\'s index every topic leaves the app', () => {
    expect(footGroups(LETTER_3)).toEqual({ before: [], after: [] });
    expect(footGroups(LETTER_1).before[0].rows.every((r) => !r.answers)).toBe(true);
  });

  it('hosts, the channel, main\'s sizes and clock', () => {
    expect([hostOf('https://thevolumesoftruth.bandcamp.com/t'), hostOf('https://www.dropbox.com/s/x'), hostOf('https://youtu.be/x'),
      hostOf('https://soundcloud.com/x'), hostOf('nonsense')]).toEqual(['Bandcamp', 'Dropbox', 'YouTube', '', '']);
    expect([isChannel(CHANNEL_URL), isChannel('https://www.youtube.com/watch?v=1'), isChannel(null)]).toEqual([true, false, false]);
    expect([songBytes(3021597), songBytes(12_400_000), songBytes(0), songBytes(2.5e9)]).toEqual(['3 MB', '12 MB', '0 MB', '2.5 GB']);
    expect([songClock(201.2), songClock(59.6), songClock(3725)]).toEqual(['3:21', '1:00', '1:02:05']);
  });
});

describe('the page', () => {
  it('Letter 1 ends: its groups after the footnotes, before the Next card; rows out of the app are plain links', async () => {
    installCorpus();
    const { container } = render(<LetterScreen collection="one" n={1} onGo={vi.fn()} onOpenLetter={vi.fn()} />);
    await settle();
    const body = container.querySelector('.body');
    const kids = [...body.children].map((n) => n.className);
    expect(kids.slice(-2)).toEqual(['lft', 'nextcard']);
    expect(texts(container, '.lfg > .label')).toEqual(['Related topics', 'Audio', 'Videos']);
    const out = [...container.querySelectorAll('a.lfr.out')];
    expect(out.map((a) => a.getAttribute('aria-label'))).toEqual(['Audio recording, opens outside the app',
      'Listen on SoundCloud, opens outside the app', 'Video (with voice over), opens outside the app', 'Official YouTube channel, opens outside the app']);
    expect(out.every((a) => a.getAttribute('target') === '_blank' && a.getAttribute('rel') === 'noopener noreferrer')).toBe(true);
    expect(out[0].getAttribute('href')).toBe(LETTER_1.audioUrl);
    expect(texts(container, 'a.lfr .host')).toEqual(['Bandcamp', 'YouTube']);
    expect(container.querySelectorAll('a.lfr .v2i.lead').length).toBe(4);
    expect(container.querySelectorAll('button.lfr').length).toBe(2);
  });

  it('a Related topics row opens its Answers topic in the app once that corpus is in', async () => {
    installCorpus();
    answersLoader();
    const go = vi.fn();
    const { container } = render(<LetterScreen collection="one" n={1} onGo={go} />);
    await settle();
    await click([...container.querySelectorAll('button.lfr')].find((b) => b.textContent === 'Regarding Faith'));
    await waitFor(() => expect(go).toHaveBeenCalledWith({ place: 'letter', collection: 'answers', n: 41 }));
    expect(g.__loadAnswersCorpus).toHaveBeenCalledTimes(1);
  });

  it('a row that cannot be placed after all goes to its address outside the app', async () => {
    installCorpus();
    const open = vi.fn();
    await openRow({ t: 'Gone', url: AQ + 'Gone', answers: 'gone' }, vi.fn(), { COL_BY_KEY: g.COL_BY_KEY, open, __loadAnswersCorpus: () => Promise.resolve() });
    expect(open).toHaveBeenCalledWith(AQ + 'Gone', '_blank', 'noopener');
  });

  it('a letter with nothing at its foot ends as before (the Next card after the text)', async () => {
    installCorpus();
    const { container } = render(<LetterScreen collection="one" n={3} />);
    await settle();
    expect(container.querySelector('.lft')).toBeNull();
  });
});

describe('Songs from this letter', () => {
  const HONOR = { id: '38d21b876868', f: 'fam-honor', t: 'Honor Me!', v: 'Dance · Cinematic', d: 201.2, b: 3021597 };
  /** main's SongCatalog global, loaded */
  function catalog(songs, versions = {}) {
    return {
      loaded: true, error: false, subscribe: () => () => {}, getVersion: () => 1, load: vi.fn(),
      songsForLetter: vi.fn((key, opts) => (key === 'one:honor-not-the-day-of-the-dead' && opts && opts.verbatim ? songs : [])),
      familyById: (f) => ({ id: f, t: (songs.find((s) => s.f === f) || {}).t }),
      versionsOf: (fam) => Array.from({ length: versions[fam.id] || 1 }, (_x, i) => ({ id: fam.id + i })),
      songById: (id) => songs.find((s) => s.id === id) || null,
      songThumbUrl: (s) => 'https://songs.example/thumbs/256/' + s.id + '.webp',
    };
  }
  /** main's SongKeep global: nothing kept */
  function keepStore(over = {}) {
    return { subscribe: () => () => {}, getVersion: () => 0, availability: () => 'ok', noteFor: () => null, keep: vi.fn(() => Promise.resolve()),
      cancel: vi.fn(), progressOf: (ids) => ({ kept: 0, total: ids.length, busy: false, bytes: 0, needBytes: 3021597 * ids.length }), ...over };
  }

  it('Letter 2 with Hear it sung on: one row (cover, title, style, length, Play) and Keep this song · 3 MB, above Audio', async () => {
    installCorpus();
    g.SongCatalog = catalog([HONOR]);
    g.SongKeep = keepStore();
    g.AudioPlayer = { playSongs: vi.fn(), toggle: vi.fn(), hasAudio: () => false, getState: () => ({ status: 'idle', queue: [], qi: 0 }),
      subscribe: () => () => {}, getVersion: () => 0 };
    const { container } = render(<LetterScreen collection="one" n={2} />);
    await settle();
    expect(texts(container, '.lfg > .label')).toEqual(['Related topics', 'Songs from this letter']);
    const row = container.querySelector('.lfg[data-foot="songs"] .row.song');
    expect(row.querySelector('img.sc').getAttribute('src')).toBe('https://songs.example/thumbs/256/38d21b876868.webp');
    expect([row.querySelector('.t').textContent, row.querySelector('.s').textContent, row.querySelector('.ln').textContent]).toEqual(['Honor Me!', 'Dance · Cinematic', '3:21']);
    await click(row.querySelector('.rp'));
    expect(g.AudioPlayer.playSongs).toHaveBeenCalledWith({ ids: ['38d21b876868'], startId: '38d21b876868', label: 'Honor Not the Day of the Dead... Honor God' });
    const keep = container.querySelector('button.lfk');
    expect(keep.textContent).toBe('Keep this song · 3 MB');
    await click(keep);
    expect(g.SongKeep.keep).toHaveBeenCalledWith(['38d21b876868'], 'keep-letter-one:honor-not-the-day-of-the-dead');
  });

  it('three rows at most, one per song; N versions in the line; the keep states in the button\'s place', async () => {
    installCorpus();
    const songs = ['a', 'b', 'c', 'd'].map((x) => ({ id: x + '00000000000', f: 'fam-' + x, t: 'Song ' + x, v: 'Rock', d: 60 }));
    g.SongCatalog = catalog([...songs, { ...songs[0], id: 'a00000000001' }], { 'fam-a': 3 });
    g.SongKeep = keepStore({ progressOf: (ids) => ({ kept: ids.length, total: ids.length, busy: false, bytes: 15_000_000, needBytes: 0 }) });
    const { container } = render(<LetterScreen collection="one" n={2} />);
    await settle();
    expect(texts(container, '.lfg .row.song .t')).toEqual(['Song a', 'Song b', 'Song c']);
    expect(container.querySelector('.lfg .row.song .s').textContent).toBe('3 versions');
    expect(container.querySelector('button.lfk')).toBeNull();
    expect(texts(container, '.lfk-line')).toEqual(['All 5 on this phone · 15 MB']);
  });

  it('busy: Keeping n of m with Cancel; offline: the button waits with Needs a connection', async () => {
    installCorpus();
    g.SongCatalog = catalog([HONOR]);
    g.SongKeep = keepStore({ progressOf: () => ({ kept: 0, total: 1, busy: true, bytes: 0, needBytes: 3021597 }) });
    const { container, unmount } = render(<LetterScreen collection="one" n={2} />);
    await settle();
    expect(container.querySelector('.lfk-line').textContent).toBe('Keeping 0 of 1...Cancel');
    await click(container.querySelector('.lfk-line .textbtn'));
    expect(g.SongKeep.cancel).toHaveBeenCalledWith(['38d21b876868']);
    unmount();
    g.SongKeep = keepStore();
    g.NetStatus = { isOffline: () => true, subscribe: () => () => {}, getVersion: () => 0 };
    const again = render(<LetterScreen collection="one" n={2} />);
    await settle();
    expect(again.container.querySelector('button.lfk').hasAttribute('disabled')).toBe(true);
    expect(texts(again.container, '.lfk-line')).toEqual(['Needs a connection']);
  });

  it('Hear it sung off: no card (main\'s showLetterSongs)', async () => {
    installCorpus();
    g.SongCatalog = catalog([HONOR]);
    g.StateStore = { isReady: () => true, get: () => ({ settings: { showLetterSongs: false } }) };
    const { container } = render(<LetterScreen collection="one" n={2} />);
    await settle();
    expect(container.querySelector('[data-foot="songs"]')).toBeNull();
    expect(g.SongCatalog.load).not.toHaveBeenCalled();
  });
});

describe('the gate rows (dz23)', () => {
  it('1k and 1l: Letters 1 and 2 at their end; 1l stands in for the catalog with the picture\'s song', () => {
    expect(GATE_STATES['1k-letter-foot']).toMatchObject({ scroll: 'end' });
    expect(GATE_STATES['1k-letter-foot'].stack[2]).toEqual({ place: 'letter', collection: 'one', n: 1 });
    expect(GATE_STATES['1l-letter-songs'].stack[2]).toEqual({ place: 'letter', collection: 'one', n: 2 });
    expect(GATE_STATES['1l-letter-songs'].open.songs[0]).toMatchObject({ id: '38d21b876868', t: 'Honor Me!', d: 201.2, b: 3021597 });
  });

  it('1l draws the card from the row, inert, and asks no catalog', async () => {
    installCorpus();
    g.SongCatalog = { loaded: false, error: false, subscribe: () => () => {}, getVersion: () => 0, load: vi.fn(), songsForLetter: vi.fn(),
      songThumbUrl: (s) => 'https://songs.example/' + s.id + '.webp' };
    g.AudioPlayer = { playSongs: vi.fn() };
    const { container } = render(<V2App gateId="1l-letter-songs" />);
    await waitFor(() => expect(html.dataset.gate).toBe('ready'));
    await settle();
    expect(texts(container, '.lfg > .label')).toEqual(['Related topics', 'Songs from this letter']);
    expect(texts(container, '.lfg .row.song .t')).toEqual(['Honor Me!']);
    expect(container.querySelector('button.lfk').textContent).toBe('Keep this song · 3 MB');
    await click(container.querySelector('.lfg .row.song .rp'));
    expect(g.AudioPlayer.playSongs).not.toHaveBeenCalled();
    expect(g.SongCatalog.load).not.toHaveBeenCalled();
    expect(g.SongCatalog.songsForLetter).not.toHaveBeenCalled();
  });
});
