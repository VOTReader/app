/* gate.js - the dev-only ?gate=<id> hook (mw4, spec: design's v2-step2/gate-refs/README.md + states.json).

   `<build>?gate=<id>` opens the app in the state of gate picture <id> with no taps, then sets <html data-gate="ready"> once
   that state is painted (fonts loaded, two frames), so tools/desk.py (PC) and the S22 shot wait for it instead of a timer.
   Rules: it seeds MEMORY only (never localStorage or IndexedDB: a gate run must leave the reader's data as it found it);
   it is inert on the live website; an id this build does not know yet sets data-gate="unknown" (the shooter then fails by
   name). Each entry below is the states.json row for that id, in the app's terms; add one per screen as it is built. */

import { gateMarks, gateNotebookMarks, GATE_NOTEBOOKS } from './notes-facts.js';
import { gateListening, gateData } from './settings-pages.js';
import { gateSpace } from './storage-facts.js';
import { gateReading } from './reading-settings.js';
import { gateDownloads } from './offline-facts.js';
import { gatePlans, gateToday } from './plans-facts.js';
import { gateShelf } from './downloads-facts.js';
import { gateSongsHub, gateSongPage } from './songs-gate.js';

/** The website readers use: the hook never acts there. */
export const LIVE_HOSTS = ['votreader.github.io'];

/** 'now' for relative dates in every gate picture (states.json "clock": a Wednesday). */
export const GATE_NOW = Date.UTC(2026, 9, 14, 12, 0, 0);
const DAY = 24 * 3600 * 1000;

/**
 * One gate state: `stack` is the history the hook fakes (its last entry is the place shown; the one before names Back),
 * `facts` what the screen would otherwise read from storage, `scroll` where the page sits (px, 'end' = scrolled as far
 * as it goes, or a selector whose element's top goes right under the top bar), `playing` the recording loaded (states.json's playing: item, reader code,
 * at/length in seconds, paused; the player reads it, agreed with readalong 10-14). rv1 adds optional playing.rate,
 * playing.sleep ({ minutes, left } in min / s, or 'end') and playing.saved (true = saved on this device), and `player`:
 * open ('now-playing', or a sheet: 'speed' | 'sleep' | 'up-next' | 'more'), full (full screen) and toast (the hint drawn).
 * playing.savedRecording: the recording is in the Listening Library's Saved (2f's Save; default not).
 * @typedef {{ place: string, collection?: string, n?: number, kind?: string, id?: string, book?: string, chapter?: number | string,
 *   verse?: number, match?: string[], study?: string, list?: string, family?: string, q?: string, st?: string, page?: number,
 *   key?: string, start?: number, end?: number, text?: string, groupId?: string | null, from?: Record<string, any> }} Route
 * @typedef {{ item: Record<string, any>, reader: string, at: number, length: number, paused: boolean } & Record<string, any>} GatePlaying
 * `open` names a sheet the screen opens on the gate boot ({ sheet: 'mark-paragraph', para, colour } on a letter; the
 * shell's { sheet: 'text-and-theme' }; 9c's { toast: 'offline-listen' }, the Listen pill's); `look` the text and page
 * shown (look.js: { scale, page, lines }; Slate otherwise).
 * @typedef {{ stack: Route[], facts?: Record<string, any>, scroll?: number | string | { to?: string, top?: number, gap?: number, deskGap?: number, phone?: boolean },
 *   playing?: GatePlaying | null, player?: Record<string, any>, open?: Record<string, any>,
 *   look?: { scale?: number, page?: string, lines?: string } }} GateState
 */

/** Letter 1 of Volume One open at its first paragraph (4b, 4d-4f). */
const LETTER_1 = [{ place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 1 }];
const PARA_1_UNDER_BAR = { to: '.body [data-hl-key$=":0"]', gap: 20 };
const LINKS_SCROLL = { top: 600, phone: true };
/** John 15:16 (NKJV), the verse 4d finds and 4f takes whole. */
const JOHN_15_16 = 'You did not choose Me, but I chose you and appointed you that you should go and bear fruit, and that your fruit '
  + 'should remain, that whatever you ask the Father in My name He may give you.';
/** Letter 1's links in main's records (states.json 4h, 4i): today to John 15:16; on Oct 9 from Letter 16's words. */
const LETTER_1_LINKS = [
  { id: 'gate-lnk-1', created: GATE_NOW - 60 * 1000,
    source: { type: 'letter', key: 'letter:chosen-by-god:0', letterId: 'chosen-by-god', collection: 'Volume One', label: 'Chosen by God' },
    target: { type: 'bible', key: 'bible:john:15:16', bookId: 'john', chapter: 15, verse: 16, label: 'John 15:16', preview: JOHN_15_16 } },
  { id: 'gate-lnk-2', created: new Date(2026, 9, 9, 12).getTime(),
    source: { type: 'letter', key: 'letter:run-from-the-forest-and-loose-all-that-binds-you:0:80-158',
      letterId: 'run-from-the-forest-and-loose-all-that-binds-you', collection: 'Volume One',
      label: 'Run from the Forest and Loose All That Binds You', start: 80, end: 158,
      text: 'the children of God must be cleansed and set apart for My glory, says The Lord.' },
    target: { type: 'letter', key: 'letter:chosen-by-god:0', letterId: 'chosen-by-god', collection: 'Volume One', label: 'Chosen by God' } },
];

/** Letter 1 of Volume One loaded at 3:51 of 10:08, read by Benjamin (states.json 0a, 0b, 2a, 1b). */
/** mw9 (dz20 3n): the journal entry "On being set apart" opened from Notes: its words, a letter card, John 15:16 as an
 * excerpt, and a voice memo (72 s; its waveform is design's laptop bars as main's 0..1 samples); the laptop's column
 * also holds a second paragraph, the divider and a picture (a gate-only file: src/ never ships, _gate never packs). */
const JE_WAVE = [5, 5, 8, 25, 17, 21, 12, 7, 18, 14, 28, 8, 11, 6, 22, 13, 25, 13, 7, 13, 16, 27, 11, 16, 5, 19, 10, 27, 13, 11,
  9, 16, 24, 15, 20, 6, 14, 6, 28, 12, 16, 5, 14, 21, 18, 22, 8, 8, 6, 28, 9, 21, 7, 11, 17, 21, 23, 12, 7, 7, 25, 6, 25, 8, 7, 12,
  22, 22, 16, 12, 7, 21, 8, 28, 7, 9, 8, 22, 20, 20, 15, 5, 16, 11, 29, 5, 14, 6, 19, 16, 24, 17, 9, 11, 12, 28, 9, 19, 5, 16, 12,
  26, 17, 13, 6, 13, 25, 12, 23, 5, 11, 8, 27, 15, 18, 7, 11, 21, 16, 25, 8, 5, 6, 26, 12, 22, 10, 8, 17, 18, 26, 11, 10, 6, 23, 9,
  26, 11, 6, 12, 19, 24, 15, 15, 6, 19, 5, 28, 10, 12].map((h) => (h - 5) / 23);
const L16 = 'run-from-the-forest-and-loose-all-that-binds-you';
const JE_BLOCKS = [
  { id: 'gb1', type: 'p', text: 'What “set apart for My glory” asks of me this week.' },
  { id: 'gb2', type: 'letter-card', volKey: 'one', letterId: L16 },
  { id: 'gb3', type: 'verse-block', ref: 'John 15:16', text: JOHN_15_16, partial: false, bookId: 'john', chapter: 15, verse: 16,
    verseEnd: null, isStudy: false, translation: 'nkjv' },
  { id: 'gb4', type: 'audio', mediaId: 'gate-memo', duration: 72, caption: 'A prayer for the week', samples: JE_WAVE },
];
const JOURNAL_ENTRY = { id: 'gate-je', title: 'On being set apart', created: Date.UTC(2026, 9, 15, 15), blocks: JE_BLOCKS };
const JOURNAL_FACTS = {
  journalEntry: JOURNAL_ENTRY,
  journalEntryDesktop: { ...JOURNAL_ENTRY, blocks: [...JE_BLOCKS,
    { id: 'gb5', type: 'p', text: 'Read it again with the family after dinner. Leave the phone in the other room.' },
    { id: 'gb6', type: 'divider' },
    { id: 'gb7', type: 'image', mediaId: 'gate-photo', caption: 'The kitchen table this morning' }] },
  journalMedia: { 'gate-photo': 'src/v2/_gate/journal-photo.jpg' },
  journalMemo: { at: 18 },
};
/** dz20's notebooks (3i-3l): main's three notebooks and the notes in them. */
const NOTEBOOK_FACTS = { notebooks: GATE_NOTEBOOKS, marks: gateNotebookMarks(GATE_NOW), now: GATE_NOW };
const NOTEBOOK_STACK = [{ place: 'notes', kind: 'note' }];
/** 3m/3q: Letter 5's note page (gnb1), opened from the letter. */
const NOTE_5_STACK = [{ place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 5 },
  { place: 'note', key: 'letter:humility-and-the-word-of-god:4', start: 0, end: 31, text: 'For I AM, and My Word the same.', groupId: 'gnb1' }];
const JOURNAL_ENTRY_STACK = [{ place: 'notes', kind: 'all' }, { place: 'journal-entry', id: 'gate-je' }];
/** 3p's live level as the picture draws it (its 40 bars' px over the recorder's 44 px top). */
const REC_LEVEL = [4, 5, 24, 24, 13, 33, 19, 6, 15, 40, 37, 9, 10, 16, 25, 6, 33, 28, 6, 9, 34, 41, 15, 13, 6, 23, 8, 30, 35, 13, 5, 27,
  42, 22, 13, 10, 17, 13, 25, 39].map((h) => h / 44);

const LETTER1_AT_351 = { item: { collection: 'one', n: 1 }, reader: 'B', at: 231, length: 608 };

/** Home's seeded saved data (states.json 0a/0b data): Continue is Letter 1; Recent is John 3, then Letter 2. */
const HOME_FACTS = {
  home: {
    continue: { kind: 'letter', collection: 'one', n: 1 },
    recent: [{ kind: 'chapter', book: 'john', bookTitle: 'John', chapter: 3 }, { kind: 'letter', collection: 'one', n: 2 }],
  },
};
const OVER_VOLUME_ONE = [{ place: 'home' }, { place: 'collection', collection: 'one' }];
/** Words To Live By, Part One, Entry 46 from its collection page (1d, 1e). */
const WTLB_46 = [{ place: 'home' }, { place: 'collection', collection: 'wtlb1' }, { place: 'letter', collection: 'wtlb1', n: 46 }];
// states.json 1h/1i (dz15): Words To Live By entry 76, "Elect and Precious", from Home
const WTLB_76 = [{ place: 'home' }, { place: 'collection', collection: 'wtlb1' }, { place: 'letter', collection: 'wtlb1', n: 76 }];
/** Volume One, Letter 9 (1f, 1g). */
const LETTER_9 = [{ place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 9 }];
/** YAHUSHUA More Than a Man's chapter 2 from Home > Studies > the study (5d, 5f). */
const STUDY_CH2 = [{ place: 'home' }, { place: 'studies' }, { place: 'study', study: 'more-than-a-man' },
  { place: 'study-chapter', study: 'more-than-a-man', chapter: 'more-than-a-man-ch2' }];
/** Its first prophecy group's cards as 5f draws them (main's card keys: '<chapter>:<block>:<kind>'). */
const CH2_CARDS = { 'more-than-a-man-ch2:0:nt': false, 'more-than-a-man-ch2:0:vot': false };
/** What the chapter's page reads on 5d / 5f: no recording (no Listen), its cards as drawn. */
const CH2_FACTS = { studies: { recorded: false, cards: CH2_CARDS } };
/** The Matthew Study Bible from Home > Studies (5h), and its chapter 5 from there (5i-5k). */
const MATTHEW_INDEX = [{ place: 'home' }, { place: 'studies' }, { place: 'study', study: 'matthew-study' }];
const MATTHEW_5 = [...MATTHEW_INDEX, { place: 'study-chapter', study: 'matthew-study', chapter: '5' }];
const LETTER_ONE_PLAYING = { item: { collection: 'one', n: 1 }, reader: 'B', at: 231, length: 608, paused: false, saved: true };

/** @type {Record<string, GateState>} */
export const GATE_STATES = {
  // states.json 0a-home: Home at the top, Home lit; Continue reading Letter 1, Recent John 3 + Letter 2; Letter 1 paused.
  '0a-home': {
    stack: [{ place: 'home' }],
    facts: HOME_FACTS,
    playing: { ...LETTER1_AT_351, paused: true },
  },
  // states.json 0b-home-more: Home scrolled 500 px (as the picture was drawn): Volume Four's row just under the top bar,
  // whose hairline shows.
  '0b-home-more': {
    stack: [{ place: 'home' }],
    facts: HOME_FACTS,
    scroll: 500,
    playing: { ...LETTER1_AT_351, paused: true },
  },
  // states.json 4a-settings: Settings from Home; one recording saved (48 MB), exported 2 days ago, Benjamin first, KJV
  // Bible audio, 1x, standard size, Slate, comfortable lines, NKJV.
  '4a-settings': {
    stack: [{ place: 'home' }, { place: 'settings' }],
    facts: {
      textSize: 'standard', page: 'slate', lines: 'comfortable',
      translation: 'nkjv', doubleTapFullscreen: true,
      reader: 'B', bibleAudio: 'brm-kjv', speed: 1,
      downloads: { count: 1, bytes: 48 * 1024 * 1024 },
      lastExportAt: GATE_NOW - 2 * DAY,
      now: GATE_NOW,
    },
  },
  // states.json 2a-collection: Volume One from Home, at the top; Letter 1 playing at 3:51, Letter 2 finished, Letter 3 with
  // 6 minutes left (progress keys are <collection>/<n>, collection-facts.js).
  '2a-collection': {
    stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }],
    facts: { progress: { 'one/2': { finished: true }, 'one/3': { leftMin: 6 } } },
    playing: { ...LETTER1_AT_351, paused: false },
  },
  // states.json 1a-letter: Volume One, Letter 1 (Chosen by God), top of the page, not playing; Back says Volume One.
  '1a-letter': {
    stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 1 }],
  },
  // states.json 5a-bible: The Bible from Home on the New Testament (the reader is reading John), at the top.
  '5a-bible': {
    stack: [{ place: 'home' }, { place: 'bible' }],
    facts: { bible: { reading: 'john' } },
  },
  // states.json 5b-book: Genesis from The Bible, chapters 1-11 read, 12 next (ringed); John 3 loaded, paused at 0:46 of
  // 6:24 (the mini player; the laptop's player bar).
  '5b-book': {
    stack: [{ place: 'home' }, { place: 'bible' }, { place: 'bible-book', book: 'genesis' }],
    facts: { bible: { read: { genesis: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }, place: { genesis: 12 } } },
    playing: { item: { book: 'john', chapter: 3 }, reader: 'B', at: 46, length: 384, paused: true },
  },
  // states.json 1b-letter-playing: Letter 1 playing, scrolled into the text with the bars stepped aside (reading-bars.js),
  // one clause lit, the mini player. The picture's 3:51 of 10:08 was drawn, not measured: Letter 1's recording runs 75 s
  // and 0:47 lights "For the years draw short, Timothy," (readalong 10-15; the app lights a clause, never the whole
  // sentence). Phone only: paragraph 1 starts 118 px above where the top bar ends before it steps aside (the shift keeps
  // lines still, whenever the phone's inset arrives), so it sits 35 px above the screen's top as drawn and line 2 sits
  // right under the status bar (measured against the picture with measure.py); the laptop stays at the top, bars shown.
  '1b-letter-playing': {
    stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 1 }],
    playing: { ...LETTER_ONE_PLAYING, at: 47, length: 75 },
    scroll: { to: '.body [data-hl-key$=":0"]', gap: -118, phone: true },
  },
  // states.json 2c-john3-playing: John 3 from Home > The Bible > John, at its top (bars shown: the head is in view),
  // playing with verse 2 lit; Back says John. The picture's 0:46 of 6:24 was drawn: the Word of Promise John 3 runs
  // 312 s and its timings light verse 2 from 15.0 to 24.0 s (at 46 the app lights verse 5; readalong 10-15).
  '2c-john3-playing': {
    stack: [{ place: 'home' }, { place: 'bible' }, { place: 'bible-book', book: 'john' }, { place: 'bible-chapter', book: 'john', chapter: 3 }],
    facts: { translation: 'nkjv' },
    playing: { item: { book: 'john', chapter: 3 }, reader: 'B', at: 19, length: 312, paused: false },
  },
  // states.json 1c-aa-sheet: Letter 1 at its top, Text and theme open: standard size (step 3 of 6), Slate, Comfortable.
  '1c-aa-sheet': {
    stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 1 }],
    open: { sheet: 'text-and-theme' },
    look: { scale: 1, page: 'slate', lines: 'comfortable' },
  },
  // states.json 4b-mark-paragraph: Letter 1's first paragraph tapped (its gold bar just under the top bar, the head
  // scrolled away), "Mark this paragraph" open with gold ringed; nothing playing. Letter 1 is recorded and timed: the
  // Listen row (dz16) says Read by Benjamin, with Repeat.
  '4b-mark-paragraph': {
    stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 1 }],
    scroll: { to: '.body [data-hl-key$=":0"]', gap: 20 },
    open: { sheet: 'mark-paragraph', para: 0, colour: 'gold', listen: 'B' },
  },
  // states.json 4d-link-picker (dz22, mw8, v2-gaps 24): 4b's paragraph, Link to another passage open: Linking from Letter
  // 1, Search on Titles and references, "John 15:16" typed, one place (main's reference hit, its verse in 2 lines).
  '4d-link-picker': {
    stack: LETTER_1, scroll: PARA_1_UNDER_BAR,
    open: { sheet: 'link-picker', para: 0, picker: { tab: 'search', q: 'John 15:16', scope: 'titles',
      places: [{ t: 'John 15:16', s: 'New Testament', v: JOHN_15_16 }] } },
  },
  // states.json 4e-link-browse: 4d on Browse, the library from the top.
  '4e-link-browse': { stack: LETTER_1, scroll: PARA_1_UNDER_BAR, open: { sheet: 'link-picker', para: 0, picker: { tab: 'browse' } } },
  // states.json 4f-link-verses: 4d a level deeper, John 15's words: verse 16 taken whole, the list from verse 14; the
  // footer says Link John 15:16.
  '4f-link-verses': {
    stack: LETTER_1, scroll: PARA_1_UNDER_BAR,
    open: { sheet: 'link-picker', para: 0, picker: {
      level: { kind: 'verses', item: { kind: 'bible-chapter', bookId: 'john', chapter: 15, label: 'John 15', title: 'John' },
        target: { type: 'bible', key: 'bible:john:15', bookId: 'john', chapter: 15, verse: null, label: 'John 15' } },
      pick: { v1: 16, whole: true }, scrollTo: 14 } },
  },
  // states.json 4h-link-made: Letter 1 600 px down (the laptop's whole letter fits: its top), its paragraph's end with
  // main's link icon (gold: it made a link; two links touch it); the toast "Linked to John 15:16" with Undo.
  '4h-link-made': { stack: LETTER_1, scroll: LINKS_SCROLL, facts: { links: LETTER_1_LINKS, now: GATE_NOW }, open: { toast: 'linked', linked: 'John 15:16' } },
  // states.json 4i-links: 4h with the icon tapped: Links, 2 links on Chosen by God, To John 15:16 (today) and From Letter
  // 16 (Oct 9), each with Remove.
  '4i-links': { stack: LETTER_1, scroll: LINKS_SCROLL, facts: { links: LETTER_1_LINKS, now: GATE_NOW }, open: { sheet: 'links', block: 'letter:chosen-by-god:0' } },
  // states.json 3n-journal-entry (dz20, mw9): the entry at its top, its memo playing at 0:18 of 1:12.
  '3n-journal-entry': { stack: JOURNAL_ENTRY_STACK, facts: JOURNAL_FACTS },
  // states.json 3o-journal-insert: 3n with "+ Insert" tapped: main's ten in four groups (the laptop's a dialog).
  '3o-journal-insert': { stack: JOURNAL_ENTRY_STACK, facts: JOURNAL_FACTS, open: { sheet: 'insert' } },
  // states.json 3p-journal-record: 3n with Insert > Voice memo recording, 0:42 in (4:18 left of main's 5 minutes).
  '3p-journal-record': { stack: JOURNAL_ENTRY_STACK, facts: JOURNAL_FACTS,
    open: { sheet: 'record', rec: { state: 'recording', at: 42, level: REC_LEVEL } } },
  // states.json 4g-excerpt-words (dz22): Insert > Excerpt > Volume One's Letter 16: its words open, "the children of God
  // ... says The Lord." chosen (the wash and its handles), the footer says Insert these words (phone only).
  '4g-excerpt-words': { stack: JOURNAL_ENTRY_STACK, facts: JOURNAL_FACTS, open: { sheet: 'link-picker', picker: {
    mode: 'excerpt',
    level: { kind: 'words', item: { kind: 'letter', volKey: 'one', letterId: L16, collection: 'Volume One', label: 'Run from the Forest and Loose All That Binds You' },
      target: { type: 'letter', key: 'letter:' + L16, letterId: L16, collection: 'Volume One', label: 'Run from the Forest and Loose All That Binds You' } },
    pick: { block: 'letter:' + L16 + ':0', start: 80, end: 159, text: 'the children of God must be cleansed and set apart for My glory, says The Lord.' } } } },
  // states.json 3c-notes (zv1): the Notes tab, All; a journal entry, a highlight and a note today/yesterday, a bookmark
  // Sunday, a link Oct 9.
  '3c-notes': { stack: [{ place: 'notes', kind: 'all' }], facts: { marks: gateMarks(GATE_NOW).slice(0, 5), now: GATE_NOW } },
  // states.json 3d-notes-journal: the same tab on Journal: 3c's marks plus two older entries; only the three entries show.
  '3d-notes-journal': { stack: [{ place: 'notes', kind: 'journal' }], facts: { marks: gateMarks(GATE_NOW), now: GATE_NOW } },
  // states.json 8c-notes-empty: nothing marked yet.
  '8c-notes-empty': { stack: [{ place: 'notes', kind: 'all' }], facts: { marks: [], now: GATE_NOW } },
  // states.json 3i-notes-notebooks (dz20, mw9d): the Notes chip: Notebooks (Uncategorized 2, Sabbath study 4, Prophecy 3,
  // For the family 1, + New notebook), then All notes, Sabbath study's four first.
  '3i-notes-notebooks': { stack: NOTEBOOK_STACK, facts: NOTEBOOK_FACTS },
  // states.json 3j-notebook: Sabbath study's page, newest first; 3k-notebook-more: its ... open.
  '3j-notebook': { stack: [...NOTEBOOK_STACK, { place: 'notebook', id: GATE_NOTEBOOKS[0].id }], facts: NOTEBOOK_FACTS },
  '3k-notebook-more': { stack: [...NOTEBOOK_STACK, { place: 'notebook', id: GATE_NOTEBOOKS[0].id }], facts: NOTEBOOK_FACTS,
    open: { sheet: 'more' } },
  // states.json 3l-notebook-new: 3i with + New notebook tapped: "Questions" typed, Plum (main's purple) chosen.
  '3l-notebook-new': { stack: NOTEBOOK_STACK, facts: NOTEBOOK_FACTS,
    open: { sheet: 'notebook-new', form: { name: 'Questions', color: 'purple' } } },
  // states.json 3m-note-notebooks (mw9e): Letter 5's "For I AM, and My Word the same." noted (gnb1: "Malachi 3:6 says the
  // same.", in Sabbath study and Prophecy), opened from the letter; Add to a notebook open over it.
  '3m-note-notebooks': { stack: NOTE_5_STACK, facts: NOTEBOOK_FACTS, open: { sheet: 'notebook-pick' } },
  // states.json 3q-note-more (dz26): the same note's ... open: Share, Delete note (the laptop: the menu under it).
  '3q-note-more': { stack: NOTE_5_STACK, facts: NOTEBOOK_FACTS, open: { sheet: 'more' } },
  // rv1 Listening (states.json 2b, 6a, 6b, 6c): Now playing opened over Volume One's page (Home > Volume One), Letter 1
  // read by Benjamin at 3:51 of 10:08, saved on this device; 6a-6c open a sheet over it.
  '2b-now-playing': { stack: OVER_VOLUME_ONE, playing: LETTER_ONE_PLAYING, player: { open: 'now-playing' } },
  '6a-speed': { stack: OVER_VOLUME_ONE, playing: { ...LETTER_ONE_PLAYING, rate: 1.25 }, player: { open: 'speed' } },
  '6b-sleep': { stack: OVER_VOLUME_ONE, playing: { ...LETTER_ONE_PLAYING, sleep: { minutes: 30, left: 24 * 60 } }, player: { open: 'sleep' } },
  '6c-up-next': { stack: OVER_VOLUME_ONE, playing: LETTER_ONE_PLAYING, player: { open: 'up-next' } },
  '2f-player-more': { stack: OVER_VOLUME_ONE, playing: LETTER_ONE_PLAYING, player: { open: 'more' } },
  // states.json 9b-full-screen: Letter 2 full screen (every bar hidden), paragraph 1 at the top, the hint showing.
  '9b-full-screen': {
    stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 2 }],
    player: { full: true, toast: 'Full screen. Double-tap to come back.' },
    scroll: '.body',
  },
  // states.json 3a-search: the Search tab before typing.
  '3a-search': { stack: [{ place: 'search' }], facts: { search: { query: '', scope: 'all', hits: [], marks: [] } } },
  // Search (zs26, design dz19): `rows` names the picture's engine rows in gate-data/search-rows.json (main's engine run on
  // the query by lanes/zones/out/zs26/gen-gate.mjs: parse, hits with their text, the engine's count), fetched at boot; v2's
  // code draws the five, the words, the places and the order from them. `songs`: main's songs row count for the query.
  // states.json 3b-search-results: 'chosen' typed, All, Relevance, the field focused: Go to (1 song), the count, Best matches.
  '3b-search-results': { stack: [{ place: 'search' }], facts: { search: { rows: '3b', query: 'chosen', focus: true, songs: 1 } } },
  // states.json 3e-search-book-order: a passage typed, Book order: the two closest matches, the rest behind one button.
  '3e-search-book-order': { stack: [{ place: 'search' }],
    facts: { search: { rows: '3e', query: 'from grace to grace from light to the light', focus: true, order: 'book' } } },
  // states.json 3f-search-corrected: a word misspelled, the results for the word main's engine corrected it to.
  '3f-search-corrected': { stack: [{ place: 'search' }], facts: { search: { rows: '3f', query: 'rightousness', focus: true } } },
  // states.json 3g-search-recent: the empty box, five recent searches above Try.
  '3g-search-recent': { stack: [{ place: 'search' }],
    facts: { search: { query: '', recent: ['from grace to grace', 'chosen', 'churches of men', 'Malachi 3:6', 'righteousness'] } } },
  // states.json 3h-search-scoped: Search opened from Volume Three's Letter 15, its chip on: 30 matches in Volume Three.
  '3h-search-scoped': { stack: [{ place: 'search', from: { place: 'letter', collection: 'three', n: 15 } }],
    facts: { search: { rows: '3h', query: 'churches of men', focus: true, scoped: true } } },
  // states.json 5c-search-match: John 3 (NKJV) opened from a search for 'born again', verse 3 a third of the way down with
  // the words underlined; Back says Search and Search stays lit.
  '5c-search-match': {
    stack: [{ place: 'search' }, { place: 'bible-chapter', book: 'john', chapter: 3, verse: 3, match: ['born again'] }],
    facts: { translation: 'nkjv' },
  },
  // states.json 7a-listening (zv1): Settings > Listening from Home; Benjamin, KJV Bible audio, 1x, every switch on.
  '7a-listening': { stack: [{ place: 'home' }, { place: 'settings' }, { place: 'settings/listening' }], facts: { listening: gateListening() } },
  // states.json 7b-your-data: exported 2 days ago, the newest snapshot today, 7 kept on this phone, the weekly copy off.
  '7b-your-data': { stack: [{ place: 'home' }, { place: 'settings' }, { place: 'settings/your-data' }], facts: { data: gateData(GATE_NOW) } },
  // states.json 7c-help: Help and about on the installed app (no Check); the version line is this build's own.
  '7c-help': { stack: [{ place: 'home' }, { place: 'settings' }, { place: 'settings/help' }], facts: { build: { android: true } } },
  // states.json 7h-your-data-storage (dz25, v2-gaps 34): Your data further down, the Storage label 54 px under the top bar:
  // Firefox, not installed, not yet protected (Protect now); 212.4 MB of 2.0 GB; Export about 1.4 MB; grown by 312.0 KB
  // since September 20 (the hook fakes main's StorageHealth report, measureUserData and the samples).
  '7h-your-data-storage': {
    stack: [{ place: 'home' }, { place: 'settings' }, { place: 'settings/your-data' }],
    facts: { data: gateData(GATE_NOW), space: gateSpace(GATE_NOW) }, scroll: { to: '.sec.stor', gap: 54 },
  },
  // states.json 7i-help-web (dz25): Help and about on the website: Check, and this build one behind the published one
  // (the hook fakes main's fetchServerBuildVersion).
  '7i-help-web': {
    stack: [{ place: 'home' }, { place: 'settings' }, { place: 'settings/help' }],
    facts: { build: { android: false, running: { cacheVersion: 'v1.0.2-27de477ee6', corpusVersion: 'c69' },
      server: { cacheVersion: 'v1.0.3-5b1c09e2a4', corpusVersion: 'c69' } } },
  },
  // states.json 7d-reading (mw7, v2-gaps 14): Settings > Reading from Home: NKJV, main's defaults (Auto-scroll and Highlight
  // the passage off, the rest on), 42 places in the reading history, the app link.
  '7d-reading': { stack: [{ place: 'home' }, { place: 'settings' }, { place: 'settings/reading' }], facts: { reading: gateReading() } },
  // states.json 7e-translation: Bible translation from Reading, NKJV chosen; main's eleven, English then Espanol.
  '7e-translation': {
    stack: [{ place: 'home' }, { place: 'settings' }, { place: 'settings/reading' }, { place: 'settings/translation' }],
    facts: { translation: 'nkjv' },
  },
  // states.json 7f-downloads (v2lis B1, dz16): Settings > Downloads from Home: Letters 1-3 of Volume One (Letter 3 with an
  // update) and John 1-3 as one row, 6 recordings · 40.4 MB, 2 more on their way; Wi-Fi only off; 2 songs kept; Standard.
  '7f-downloads': { stack: [{ place: 'home' }, { place: 'settings' }, { place: 'settings/downloads' }], facts: { shelf: gateShelf(GATE_NOW) } },
  // states.json 4c-downloads (zv1): Volume One from Home while it downloads with no connection: the queue bar (12 of 29)
  // stuck under the top bar with Letter 4 right below it (gap = the bar's 59 px), 4 on this phone, 5 at 64 %, 6 failed,
  // 7 waiting for Wi-Fi; the no-connection toast.
  '4c-downloads': {
    stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }],
    facts: { downloads: gateDownloads(), offline: true },
    scroll: { to: '.rows .row[data-key="one/4"]', gap: 59 },
  },
  // states.json 9c-offline: Letter 2 with no connection and nothing on this phone, Listen just tapped: its toast. The
  // toast is the Listen pill's (readalong's ListenPill, rv1 1b part 2), from offline-facts.js offlineListenWords.
  '9c-offline': {
    stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 2 }],
    facts: { offline: true },
    open: { toast: 'offline-listen' },
  },
  // states.json 9a-plans (zv1; redrawn dz24): Reading plans from Home; Bible in a Year on day 40 of 365 (Numbers 11-13, a
  // day to catch up, 10 % done) with October under its actions, the Volumes in Order not started with 2 a day chosen.
  '9a-plans': { stack: [{ place: 'home' }, { place: 'reading-plans' }], facts: { plans: gatePlans() } },
  // states.json 9h-home-today, 9i-home-today-two (dz24): Home with today's reading under Recent (one plan; then Bible in
  // a Year and the Volumes), scrolled so the card's top sits 129 px under the top bar. 9h keeps 0a's paused Letter 1.
  '9h-home-today': {
    stack: [{ place: 'home' }],
    facts: { ...HOME_FACTS, today: gateToday(1) },
    scroll: { to: '.tdy', gap: 129 },
    playing: { ...LETTER1_AT_351, paused: true },
  },
  '9i-home-today-two': { stack: [{ place: 'home' }], facts: { ...HOME_FACTS, today: gateToday(2) }, scroll: { to: '.tdy', gap: 129 } },
  // states.json 8a-welcome (zv1): the welcome a first visit opens on; no tab, no Back, no bars.
  '8a-welcome': { stack: [{ place: 'welcome' }] },
  // states.json 8b-install (zv1): Volume One from Home in a browser on the second visit, the offer open; this browser
  // handed over its install event, so the button is the browser's own Install.
  '8b-install': { stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }], open: { sheet: 'install' }, facts: { install: { flow: 'prompt' } } },
  // dz13 (myweb's v2-gaps 1-4). states.json 1d-wtlb-entry: Words To Live By, Part One, Entry 46 (Building the Gallows)
  // scrolled to its end: [Esther 7], (1 John 3:12) and (Genesis 4:8) in gold, the Next card; Back says Words To Live By.
  // The laptop's whole entry fits, so its end is its top.
  '1d-wtlb-entry': { stack: WTLB_46, scroll: 'end' },
  // states.json 1e-ref-sheet: 1d with (1 John 3:12) tapped: its sheet (the laptop's dialog), the cite washed.
  '1e-ref-sheet': { stack: WTLB_46, scroll: 'end', open: { sheet: 'ref', ref: '1 John 3:12' } },
  // states.json 1f-footnotes (dz23b): Volume One, Letter 9 (What's In a Name), its Footnotes list (two notes, then
  // Revelation 3:5) with its top hairline 88 px below the phone's screen top (the scroller starts under the 27 px status
  // bar and the 56 px top bar: 88 - 83) and 120 px below the laptop window's top (63 under its 57 px bar); under it
  // Letter 9's foot (Related topics).
  '1f-footnotes': { stack: LETTER_9, scroll: { to: '.body .fnl', gap: 5, deskGap: 63 } },
  // states.json 9f-data-missing (dz15, mw7, v2-gaps 33): Home as 0a (Letter 1 paused in the player), under the top bar
  // main's danger strip "Some of your data looks missing": the 2026-10-13 snapshot had 55 highlights, 6 notes and 627 read
  // marks, now 2 highlights and 41 read marks; Restore, Keep as is and the x (the hook fakes StorageHealth's report).
  '9f-data-missing': {
    stack: [{ place: 'home' }],
    facts: { ...HOME_FACTS, storage: { dataMissing: { name: 'auto', at: new Date(2026, 9, 13, 12).getTime(),
      then: { highlights: 55, notes: 6, readMarks: 627 }, now: { highlights: 2, readMarks: 41 } } } },
    playing: { ...LETTER1_AT_351, paused: true },
  },
  // states.json 9g-storage-low (dz15, mw7): Volume One, Letter 1 at its top under main's warn strip "Storage is running low"
  // (38 MB remaining) with Export data.
  '9g-storage-low': {
    stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 1 }],
    facts: { storage: { tier: 'warning', remaining: 38 * 1024 * 1024 } },
  },
  // states.json 9j-offline-incomplete (dz25, v2-gaps 34): Home as 9f, no storage strip, so main's offline library strip
  // takes the slot: 3 files did not download, Retry and the x (the hook fakes main's offline-library state).
  '9j-offline-incomplete': {
    stack: [{ place: 'home' }],
    facts: { ...HOME_FACTS, offline: { phase: 'incomplete', missing: 3 } },
    playing: { ...LETTER1_AT_351, paused: true },
  },
  // states.json 1k-letter-foot (dz23, mw7): Volume One, Letter 1 at its end: footnote 1, Related topics (2, opening Answers
  // in the app), Audio (Bandcamp, SoundCloud), Videos (the voice-over video, the channel; the channel-as-video row dropped),
  // then Next · Letter 2. No songs sing its words.
  '1k-letter-foot': {
    stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 1 }],
    scroll: 'end',
  },
  // states.json 1l-letter-songs (dz23, mw7): Letter 2 at its end, Hear it sung on: Related topics (6), Songs from this letter
  // (Honor Me!, one version, not kept: "Keep this song · 3 MB"), Audio, Videos, Next · Letter 3. The hook stands in for the
  // catalog with the picture's song (no catalog fetch on a gate).
  '1l-letter-songs': {
    stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 2 }],
    scroll: 'end',
    open: { songs: [{ id: '38d21b876868', t: 'Honor Me!', f: '38d21b876868', v: 'Dance · Cinematic', d: 201.2, b: 3021597, versions: 1 }] },
  },
  // states.json 1g-footnote-sheet (phone): Letter 9 with footnote 1 tapped, its number 190 px below the screen's top (the
  // scroller starts under the 27 px status bar and the 56 px top bar: 190 - 83), Footnote 1 of 3 open, the number ringed.
  '1g-footnote-sheet': {
    stack: LETTER_9,
    scroll: { to: '.body .fn-ref[data-fn-num="1"]', gap: 107, phone: true },
    open: { sheet: 'footnote', num: '1' },
  },
  // states.json 8d-safari-notice (phone): Letter 1 in a Safari tab, paragraph 1 tapped as in 4b: the first save of the
  // session waits on the 7-day notice (the hook draws it; no Safari, no StorageHealth needed).
  '8d-safari-notice': {
    stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 1 }],
    scroll: { to: '.body [data-hl-key$=":0"]', gap: 20 },
    open: { sheet: 'safari-7day', para: 0 },
  },
  // states.json 2d-studies: Studies from Home, at the top; coverage pinned, not live: the Matthew Study Bible and Purity
  // read along, Lamb of God reads along in 14 of its 16 chapters, the rest have no recording.
  '2d-studies': {
    stack: [{ place: 'home' }, { place: 'studies' }],
    facts: { studies: { coverage: {
      'matthew-study': { state: 'read-along' },
      purity: { state: 'read-along', recorded: 6, total: 6 },
      'lamb-of-god': { state: 'read-along', recorded: 14, total: 16 },
    } } },
  },
  // states.json 2e-study-index: YAHUSHUA More Than a Man from Studies, at the top: the Preface and Part 1's first chapter
  // read, Part 1 open, its chapter 2 the one you are on.
  '2e-study-index': {
    stack: [{ place: 'home' }, { place: 'studies' }, { place: 'study', study: 'more-than-a-man' }],
    facts: { studies: {
      place: { current: 'more-than-a-man-ch2', read: ['more-than-a-man-ch0', 'more-than-a-man-ch1'] },
      open: [1],
    } },
  },
  // states.json 1i-find (dz15, mw7): entry 76 at its top, Find open with "more" typed: 1 of 3, the first place current
  // (the hook draws the word and a caret; the field is not focused, so no keyboard opens).
  '1i-find': { stack: WTLB_76, open: { sheet: 'find', q: 'more' } },
  // states.json 1h-entry-more (dz15, mw7): entry 76 at its top, its ... open (the laptop: D6's menu under the ...). The
  // song catalog has 15 verbatim songs for it, so Hear it sung shows (the hook stands in: no catalog fetch on a gate).
  '1h-entry-more': { stack: WTLB_76, open: { sheet: 'more', songs: true } },
  // states.json 5g-chapter-more (dz15, dz21, mw7): John 3 (NKJV) at its top, its title under the h1, the ... open.
  '5g-chapter-more': {
    stack: [{ place: 'home' }, { place: 'bible' }, { place: 'bible-book', book: 'john' }, { place: 'bible-chapter', book: 'john', chapter: 3 }],
    facts: { translation: 'nkjv' },
    open: { sheet: 'more' },
  },
  // states.json 1j-auto-scroll (dz15, mw7): Letter 1 at its top, auto-scroll running at main's 16 lines/min with
  // Auto-continue (2.5 s): the hook freezes the run (nothing moves) and stops the fade, so the pill shows the time left.
  '1j-auto-scroll': {
    stack: [{ place: 'home' }, { place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 1 }],
    open: { sheet: 'auto-scroll' },
  },
  // states.json 5d-study-chapter: YAHUSHUA More Than a Man, chapter 2 (Section Two) from the study's page, at the top; no
  // recording, so no Listen. Its first group's cards as 5f (the laptop shows the first card).
  '5d-study-chapter': { stack: STUDY_CH2, facts: CH2_FACTS },
  // states.json 5f-prophecy-cards: the same chapter scrolled so the first group's label sits 92 px below the screen top
  // (the scroller starts under the 27 px status bar and the 56 px top bar: 92 - 83), the Old Testament card open, the
  // New Testament and Volumes of Truth cards closed (main opens every card; the gate closes these two).
  '5f-prophecy-cards': { stack: STUDY_CH2, facts: CH2_FACTS, scroll: { to: '.body .pgrp', gap: 9 } },
  // states.json 5h-matthew (dz18): the Matthew Study Bible from Studies, at the top: chapters 1 and 2 read, 3 the one you
  // are on (lit, so the S22 frame shows it); Matthew is recorded, so Listen shows.
  '5h-matthew': { stack: MATTHEW_INDEX, facts: { studies: { place: { current: '3', read: ['1', '2'] } } } },
  // states.json 5i-matthew-chapter: Matthew 5 from the index, at the top; Study notes on PDF (main's default for a new tab)
  '5i-matthew-chapter': { stack: MATTHEW_5, facts: { matthew: { notes: 'pdf' } } },
  // states.json 5j-matthew-notes: the same in PDF, scrolled so the Volumes of Truth notes section sits 330 px below the
  // screen top (the scroller starts 83 px down: the 27 px status bar and the 56 px top bar)
  '5j-matthew-notes': { stack: MATTHEW_5, facts: { matthew: { notes: 'pdf' } }, scroll: { to: '.spn .sp-vot', gap: 247, phone: true } },
  // states.json 5k-matthew-inline: the same in Inline, verse 3 100 px below the screen top
  '5k-matthew-inline': { stack: MATTHEW_5, facts: { matthew: { notes: 'inline' } }, scroll: { to: '#v-3', gap: 17, phone: true } },
  // states.json 6d-songs (dz14): Songs of the Letters from Home, at the top, nothing typed, All: the catalog design drew
  // (2026-10-06.1097, pinned in songs-gate.js), 3 saved, 12 recent, 2 kept (7.6 MB); the laptop too.
  '6d-songs': { stack: [{ place: 'home' }, { place: 'songs' }], facts: { songs: gateSongsHub() } },
  // states.json 6e-song-page: Elect and Precious (Words To Live By, Part One) from the hub, at the top; not saved, not kept.
  '6e-song-page': { stack: [{ place: 'home' }, { place: 'songs' }, { place: 'song', family: 'elect-and-precious' }], facts: { songs: gateSongPage() } },
  // states.json 9d-garden-notice: Home as 0b (500 px down, Letter 1 paused) with Return to the Garden tapped on a first
  // visit: main's notice, Standard picked.
  '9d-garden-notice': {
    stack: [{ place: 'home' }],
    facts: { ...HOME_FACTS, gardenTier: 'standard', gardenSeen: false },
    scroll: 500,
    playing: { ...LETTER1_AT_351, paused: true },
    open: { sheet: 'garden-notice' },
  },
  // states.json 9e-garden-page: the Garden at page 40 of 209, Standard, full screen (the laptop's too).
  '9e-garden-page': { stack: [{ place: 'home' }, { place: 'garden', page: 40 }], facts: { gardenTier: 'standard', gardenSeen: true } },
  // states.json 5e-scripture-web: main's web whole at its opening camera, Scripture, Famous, the guide seen (WebScreen
  // hands main's screen web-facts' GATE_WEB_SETTINGS); an upright phone gets it turned, as main; the laptop's fills the pane.
  '5e-scripture-web': { stack: [{ place: 'home' }, { place: 'scripture-web' }] },
};

/**
 * The gate id this page was opened with, or null (no ?gate=, or the live website).
 * @param {{ hostname: string, search?: string } | null} [loc]
 */
export function readGateId(loc = globalThis.location) {
  if (!loc || LIVE_HOSTS.includes(loc.hostname)) return null;
  const id = new URLSearchParams(loc.search || '').get('gate');
  return id ? id : null;
}

/** @param {string} id @returns {GateState | null} */
export function gateState(id) {
  return Object.prototype.hasOwnProperty.call(GATE_STATES, id) ? GATE_STATES[id] : null;
}

/** @param {'ready' | 'unknown' | 'waiting'} value */
export function markGate(value, doc = globalThis.document) {
  if (doc && doc.documentElement) doc.documentElement.dataset.gate = value;
}

/**
 * Resolves once the kit's faces are loaded and two frames have painted with them.
 * @param {any} [doc] @param {(cb: () => void) => any} [raf]
 */
export async function whenPainted(doc = globalThis.document, raf = globalThis.requestAnimationFrame) {
  const fonts = doc && /** @type {any} */ (doc).fonts;
  if (fonts) {
    try {
      await Promise.all([fonts.load('400 20px "EB Garamond"'), fonts.load('italic 400 20px "EB Garamond"'), fonts.load('italic 500 20px "EB Garamond"')]);
      await fonts.ready;
    } catch (_e) { /* a font that fails to load still paints the fallback: the gate's measure then fails by itself */ }
  }
  if (typeof raf === 'function') await new Promise((res) => raf(() => raf(() => res(undefined))));
}
