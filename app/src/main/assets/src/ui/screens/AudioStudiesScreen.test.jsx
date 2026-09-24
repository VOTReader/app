// @ts-nocheck -- classic-global screen contract, as AudioLibraryScreen.test.jsx.
/* THE STUDIES GET A DOORWAY IN THE LISTENING LIBRARY (listening item 4, 2026-09-22).
   The Bible/Letter Studies have recordings (Lamb of God 14 of 16 chapters, Purity 6 of 6, and Tim is recording
   the rest), but the Listening Library's Browse shelf had no way in: the 2026-09-22 walk looked for one and found
   COL_BY_KEY.get('study') false. The hub now carries one "Bible/Letter Studies" row (only once a study has a
   recording), the Studies screen lists every study in its reading order with an honest count and badge, and a
   study opens the same recordings screen a collection does, playing the study's chapters as one queue. */
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const { player } = vi.hoisted(() => {
  const player = {
    subscribe: () => () => {},
    getVersion: () => 0,
    getState: () => ({ status: 'idle', queue: [], qi: 0, time: 0, duration: 0, rate: 1 }),
    collectionHasAudio: vi.fn(() => true),
    hasAudio: vi.fn((volKey, id) => !!(globalThis.AUDIO_MANIFEST && globalThis.AUDIO_MANIFEST[volKey + ':' + id])),
    renditionsFor: vi.fn((volKey, item) => [{ reader: 'B', tracks: [{ key: volKey + ':' + item.id, url: 'u-' + item.id }] }]),
    sectionsFor: vi.fn(() => null),
    readerLabel: () => 'Read by Benjamin',
    playCollection: vi.fn(),
    playTrack: vi.fn(),
    toggle: vi.fn(),
  };
  return { player };
});
vi.mock('../../utils/audio-player.js', () => ({ AudioPlayer: player }));

import { AudioLibraryScreen } from './AudioLibraryScreen.jsx';
import { AudioStudiesScreen } from './AudioStudiesScreen.jsx';
import { AudioCollectionScreen } from './AudioCollectionScreen.jsx';
import * as Shelf from '../components/AudioShelf.jsx';
import * as AudioTrack from '../../utils/audio-track.js';
import * as AudioCoverage from '../../utils/audio-coverage.js';
import { AudioSeekSlider } from '../components/AudioSeekSlider.jsx';
import { CoverageBadge } from '../components/CoverageBadge.jsx';

const ch = (study, n, title) => ({ id: study + '-ch' + n, num: n, title });
const STUDIES = [
  { id: 'more-than-a-man', title: 'YAHUSHUA More Than a Man', chapters: [ch('more-than-a-man', 1, 'One'), ch('more-than-a-man', 2, 'Two'), ch('more-than-a-man', 3, 'Three')] },
  { id: 'lamb-of-god', title: 'YahuShua The Messiah, The Lamb of God', chapters: [ch('lamb-of-god', 0, 'Preface'), ch('lamb-of-god', 1, 'I Am The Passover'), ch('lamb-of-god', 2, 'Anointing')] },
  { id: 'purity', title: 'Purity - Bible/Letter Study', chapters: [ch('purity', 1, 'Purity One'), ch('purity', 2, 'Purity Two')] },
];
const MANIFEST = {
  'one:wide-path': [['idWide', 'B']],
  'study:lamb-of-god-ch1': [['l1', 'B']], 'study:lamb-of-god-ch2': [['l2', 'B']],
  'study:purity-ch1': [['p1', 'B']], 'study:purity-ch2': [['p2', 'B']],
};

function installGlobals({ manifest = MANIFEST, studies = STUDIES } = {}) {
  globalThis.ScreenLayout = ({ children }) => <main>{children}</main>;
  globalThis.LibraryNav = () => null;
  Object.assign(globalThis, Shelf, AudioTrack, AudioCoverage, { AudioSeekSlider, CoverageBadge });
  globalThis.AudioPlayer = player;
  globalThis.COLLECTIONS = [{ volKey: 'one', cardId: 'vot-one-index', label: 'Volume One' }];
  globalThis.COL_BY_KEY = new Map([['one', { letterScreen: 'vot-one-letter' }]]);
  globalThis.AUDIO_MANIFEST = manifest;
  globalThis.BIBLE_AUDIO_MANIFEST = {};
  globalThis.BIBLE_STUDIES = studies;
  globalThis.AudioLibraryStore = {
    subscribe: () => () => {}, getVersion: () => 0, saved: () => [], recent: () => [],
    isSaved: () => false, toggleSaved: vi.fn(), clearRecent: vi.fn(), removeRecent: vi.fn(),
  };
}
const noop = () => {};
const common = { onSearch: noop, onHistory: noop, onSettings: noop, theme: 'dark', onThemeChange: noop };

beforeEach(() => { installGlobals(); player.playCollection.mockClear(); });
afterEach(() => {
  cleanup();
  for (const k of ['ScreenLayout', 'LibraryNav', 'AudioPlayer', 'COLLECTIONS', 'COL_BY_KEY', 'AUDIO_MANIFEST', 'BIBLE_AUDIO_MANIFEST', 'BIBLE_STUDIES', 'AudioLibraryStore']) delete globalThis[k];
});

describe('the Listening Library hub: one doorway for the studies', () => {
  it('shows a Bible/Letter Studies row with the honest count, and it opens the studies', () => {
    const onOpenStudies = vi.fn();
    render(<AudioLibraryScreen onBack={noop} onOpenCollection={noop} onOpenVolumes={noop} onOpenSaved={noop} onOpenTrack={noop} onOpenStudies={onOpenStudies} {...common} />);
    const row = screen.getByText('Bible/Letter Studies').closest('button');
    // '2 recorded' read as two CHAPTERS (Codex critique 3): it counts studies with audio.
    expect(row.textContent).toContain('3 studies · 2 with audio');
    fireEvent.click(row);
    expect(onOpenStudies).toHaveBeenCalledTimes(1);
  });

  it('shows no studies row while no study has a recording (a doorway to nothing to hear)', () => {
    installGlobals({ manifest: { 'one:wide-path': [['idWide', 'B']] } });
    render(<AudioLibraryScreen onBack={noop} onOpenCollection={noop} onOpenVolumes={noop} onOpenSaved={noop} onOpenTrack={noop} onOpenStudies={noop} {...common} />);
    expect(screen.queryByText('Bible/Letter Studies')).toBeNull();
  });
});

describe('the Studies screen', () => {
  it('lists every study in reading order, recorded ones read-along, the rest honest', () => {
    const onOpenStudy = vi.fn();
    render(<AudioStudiesScreen onBack={noop} onOpenStudy={onOpenStudy} onReadStudy={noop} {...common} />);
    const rows = [...document.querySelectorAll('.audio-library-shelf-row')];
    expect(rows.map((r) => r.querySelector('strong').textContent)).toEqual(STUDIES.map((s) => s.title));
    expect(rows[1].textContent).toContain('3 chapters · 2 recorded');
    expect(rows[1].textContent).toContain('Read-along');
    expect(rows[2].textContent).toContain('2 chapters · all recorded');
    fireEvent.click(rows[1]);
    expect(onOpenStudy).toHaveBeenCalledWith('lamb-of-god');
  });

  // Codex's critique of the built screen (out/mockups/studies/critique.md, 2026-09-23), items 1, 2 and 5.
  it('a study with no recording yet opens to READ, says so once, and never opens an empty recordings page', () => {
    const onOpenStudy = vi.fn();
    const onReadStudy = vi.fn();
    render(<AudioStudiesScreen onBack={noop} onOpenStudy={onOpenStudy} onReadStudy={onReadStudy} {...common} />);
    const silent = document.querySelectorAll('.audio-library-shelf-row')[0];
    const line = silent.querySelector('small').textContent;
    expect(line).toBe('3 chapters');                      // the badge carries availability; no 'not yet recorded' twice
    expect(silent.querySelector('.coverage-badge').textContent).toBe('Read study');
    expect(silent.textContent).not.toContain('No recording');
    fireEvent.click(silent);
    expect(onReadStudy).toHaveBeenCalledWith('more-than-a-man');
    expect(onOpenStudy).not.toHaveBeenCalled();
  });

  it('sets the right expectation: the intro invites listening AND reading, the head counts both', () => {
    render(<AudioStudiesScreen onBack={noop} onOpenStudy={noop} onReadStudy={noop} {...common} />);
    const intro = document.querySelector('.audio-library-intro').textContent;
    expect(intro).toMatch(/listen/i);
    expect(intro).toMatch(/read/i);
    expect(document.querySelector('.audio-studies-split').textContent).toBe('2 with audio · 1 to read');
  });
});

describe('a study in the recordings screen', () => {
  it('lists the recorded chapters, counts the rest, and plays the study as one queue', () => {
    const onOpenText = vi.fn();
    render(<AudioCollectionScreen volKey="study:lamb-of-god" onBack={noop} onOpenText={onOpenText} {...common} />);
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('YahuShua The Messiah, The Lamb of God');
    expect(document.querySelector('.audio-library-intro').textContent).toBe('2 of 3 chapters have recordings');
    // Codex critique 4: the count names what a listener will skip, and each name opens its text.
    const skip = document.querySelector('.audio-collection-text-only');
    expect(skip.textContent).toBe('Text only: Preface');
    fireEvent.click(skip.querySelector('button'));
    expect(onOpenText).toHaveBeenCalledWith(expect.objectContaining({ key: 'study:lamb-of-god-ch0' }));
    // Each row: the chapter's number badge, then its title (the letters' shape).
    const rows = [...document.querySelectorAll('.audio-collection-item strong')];
    expect(rows.map((n) => n.querySelector('.audio-collection-num').textContent)).toEqual(['1', '2']);
    expect(rows.map((n) => n.lastChild.textContent)).toEqual(['I Am The Passover', 'Anointing']);
    fireEvent.click(screen.getByText('Play all').closest('button'));
    expect(player.playCollection).toHaveBeenCalledWith(expect.objectContaining({ volKey: 'study', items: STUDIES[1].chapters, collectionLabel: STUDIES[1].title }));
  });
});

describe('a study in the recordings screen: many text-only chapters', () => {
  it('counts them instead of naming them past three', () => {
    const big = { id: 'big', title: 'Big Study', chapters: [1, 2, 3, 4, 5, 6].map((n) => ch('big', n, 'Ch ' + n)) };
    installGlobals({ studies: [...STUDIES, big], manifest: { ...MANIFEST, 'study:big-ch1': [['b1', 'B']], 'study:big-ch2': [['b2', 'B']] } });
    render(<AudioCollectionScreen volKey="study:big" onBack={noop} onOpenText={noop} {...common} />);
    expect(document.querySelector('.audio-collection-text-only').textContent).toBe('4 chapters are text only');
  });
});
