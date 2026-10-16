/* player/source.js - where the v2 player's state comes from (rv1, 2026-10-14).

   v2 is a new view over main's ONE engine (Media3 on Android): the real source wraps the globals bundle-d publishes
   (AudioPlayer, OfflineAudio) and never imports utils/audio-player.js, which would bundle a second engine into
   bundle-v2. A ?gate=<id> boot gets an in-memory fake with the same surface, seeded from the gate row's `playing`
   (myweb's shape: { item: { collection, n } | { book, chapter }, reader, at, length, paused } plus rv1's optional rate,
   sleep, saved): no sound, no clock, no storage. */

import { BIBLE_AUDIO_EDITIONS, bibleAudioOffered } from '../../utils/audio-track.js';
import { readerLine } from './view.js';

/**
 * @typedef {{ status: string, queue: any[], qi: number, time: number, duration: number, rate: number,
 *   sleepEndsAt: number, sleepMinutes: number, sleepAtTrackEnd: boolean, sourceMode?: string }} PlayerState
 * @typedef {{ id: string, label: string, sub?: string, active: boolean, reader?: string | null }} VoiceChoice
 *   An edition reads on two lines (dz30 2m): main's label split at its first " · " (KJV / Biblical Restoration Ministries).
 * @typedef {{ kind: 'reader' | 'edition', choices: VoiceChoice[] }} Voices
 * @typedef {{ subscribe: (cb: () => void) => () => void, version: () => string, state: () => PlayerState,
 *   ready: () => boolean, isSaved: (url: string) => boolean, sleepLeft: () => number,
 *   toggle: () => void, prev: () => void, next: () => void, skip: (s: number) => void, seek: (s: number) => void,
 *   setRate: (r: number) => void, setSleep: (min: number) => void, sleepAtEnd: () => void, clearSleep: () => void,
 *   playAt: (i: number) => void, move: (from: number, to: number) => void, remove: (i: number) => void,
 *   insert: (i: number, track: any) => void, clearUpcoming: () => void, voices: () => Voices | null, pickVoice: (id: string) => void,
 *   voiceNeedsConfirm: () => boolean, recordingSaved: () => boolean, toggleRecordingSaved: () => void }} PlayerSource
 */

const IDLE = { status: 'idle', queue: [], qi: 0, time: 0, duration: 0, rate: 1, sleepEndsAt: 0, sleepMinutes: 0, sleepAtTrackEnd: false };

/** A track key's halves ("volKey:id"), or null (range compilations carry none). */
function splitKey(track) {
  const key = track && typeof track.key === 'string' ? track.key : '';
  const cut = key.indexOf(':');
  return cut < 1 || cut >= key.length - 1 ? null : { volKey: key.slice(0, cut), id: key.slice(cut + 1) };
}

/** A Bible track's chapter: its part label ("Chapter 3"); a whole-book recording starts at 1 (main's chapterOfTrack). */
function chapterOf(track) {
  const m = track && typeof track.partLabel === 'string' ? /^Chapter (\d+)$/.exec(track.partLabel) : null;
  return m ? Number(m[1]) : 1;
}

/**
 * The voices a playing track can be heard in, as main's AudioManagerSheet offers them (voiceChoices), or null when
 * there is only one: a letter's readers (AudioPlayer.renditionsFor), a Bible chapter's editions (offered ones that
 * ship this book). Reads the engine's lookups only, so a gate boot asks the real registry too.
 * @returns {Voices | null}
 */
export function voiceChoices(track, g = /** @type {any} */ (globalThis)) {
  const A = g.AudioPlayer;
  const split = splitKey(track);
  if (!A || !split) return null;
  if (split.volKey.lastIndexOf('bible-', 0) === 0) {
    if (typeof A.hasAudio !== 'function') return null;
    const eds = Object.entries(BIBLE_AUDIO_EDITIONS).filter(([, ed]) => bibleAudioOffered(ed) && A.hasAudio(ed.volKey, split.id));
    if (eds.length < 2) return null;
    return { kind: 'edition', choices: eds.map(([id, ed]) => {
      const cut = ed.label.indexOf(' · ');
      return { id, label: cut > 0 ? ed.label.slice(0, cut) : ed.label, sub: cut > 0 ? ed.label.slice(cut + 3) : undefined,
        active: ed.volKey === split.volKey };
    }) };
  }
  if (typeof A.renditionsFor !== 'function') return null;
  const rs = A.renditionsFor(split.volKey, { id: split.id, title: track.title }, track.sub) || [];
  if (rs.length < 2) return null;
  const label = (r) => (typeof A.readerLabel === 'function' && A.readerLabel(r)) || readerLine(r) || 'This reading';
  return {
    kind: 'reader',
    choices: rs.map((r) => ({ id: r.reader || 'primary', label: label(r.reader), active: r.reader === track.readerCode, reader: r.reader })),
  };
}

/** A collection's items in play order, preface first (main's collectionItems); null before its volume is loaded. */
function collectionItems(volKey, g) {
  const col = g.COL_BY_KEY && typeof g.COL_BY_KEY.get === 'function' ? g.COL_BY_KEY.get(volKey) : null;
  if (!col || typeof g.colLetterArr !== 'function') return null;
  const preface = typeof g.colPreface === 'function' ? g.colPreface(col) : null;
  const letters = g.colLetterArr(col) || [];
  return preface ? [preface].concat(letters) : letters;
}

/**
 * Plays the track again in the chosen voice, as main's sheet does: the letter restarts in that reader with the rest of
 * its collection behind it (playLetter alone when the collection is not loaded); a chapter restarts in that edition,
 * which becomes the Bible audio setting (every Listen pill reads it).
 */
function playVoice(track, choice, kind, g) {
  const A = g.AudioPlayer;
  const split = splitKey(track);
  if (!A || !split) return;
  if (kind === 'edition') {
    const ed = BIBLE_AUDIO_EDITIONS[/** @type {keyof typeof BIBLE_AUDIO_EDITIONS} */ (choice.id)];
    if (!ed) return;
    A.playBibleBook({ volKey: ed.volKey, bookId: split.id, chapterNum: chapterOf(track), label: ed.label, noResume: true });
    if (typeof g.__setBibleAudioEdition === 'function') g.__setBibleAudioEdition(choice.id);
    return;
  }
  const items = collectionItems(split.volKey, g);
  if (items && items.some((it) => it && it.id === split.id)) {
    A.playCollection({ volKey: split.volKey, items, collectionLabel: track.sub, startId: split.id, startReader: choice.reader, noResume: true });
    return;
  }
  A.playLetter({ volKey: split.volKey, letter: { id: split.id, title: track.title }, collectionLabel: track.sub,
    reader: choice.reader, noResume: true });
}

/** The real engine, or null when bundle-d is not on the page. @returns {PlayerSource | null} */
export function realSource(g = /** @type {any} */ (globalThis)) {
  const A = g.AudioPlayer;
  if (!A || typeof A.subscribe !== 'function') return null;
  const O = () => g.OfflineAudio || null;
  // Saved recordings are bundle-b's AudioLibraryStore (main's sheet reads it at render time too).
  const L = () => g.AudioLibraryStore || null;
  const state = () => A.getState() || IDLE;
  const current = () => { const st = state(); return st.status !== 'idle' ? st.queue[st.qi] || null : null; };
  const versionOf = (s) => (s && typeof s.getVersion === 'function' ? s.getVersion() : 0);
  return {
    subscribe(cb) {
      const offs = [A.subscribe(cb)];
      [O(), L()].forEach((s) => { if (s && typeof s.subscribe === 'function') offs.push(s.subscribe(cb)); });
      return () => { offs.forEach((off) => { if (typeof off === 'function') off(); }); };
    },
    version: () => A.getVersion() + ':' + versionOf(O()) + ':' + versionOf(L()),
    state,
    ready: () => true,
    isSaved: (url) => { const o = O(); return !!(url && o && typeof o.isSaved === 'function' && o.isSaved(url)); },
    sleepLeft: () => Number(A.getSleepRemainingSeconds()) || 0,
    toggle: () => A.toggle(),
    prev: () => A.prev(),
    next: () => A.next(),
    skip: (s) => A.skip(s),
    seek: (s) => A.seek(s),
    setRate: (r) => A.setPlaybackRate(r),
    setSleep: (min) => A.setSleepTimer(min),
    sleepAtEnd: () => A.setSleepAtTrackEnd(),
    clearSleep: () => A.clearSleepTimer(),
    playAt: (i) => A.playAt(i),
    move: (from, to) => A.moveUpcoming(from, to),
    remove: (i) => A.removeUpcoming(i),
    insert: (i, t) => { if (typeof A.insertUpcoming === 'function') A.insertUpcoming(i, t); },
    clearUpcoming: () => A.clearUpcoming(),
    voices: () => voiceChoices(current(), g),
    pickVoice(id) {
      const track = current();
      const v = voiceChoices(track, g);
      const choice = v && v.choices.find((c) => c.id === id);
      if (v && choice) playVoice(track, choice, v.kind, g);
    },
    voiceNeedsConfirm: () => state().sourceMode === 'custom',
    recordingSaved() { const l = L(); const t = current(); return !!(t && l && typeof l.isSaved === 'function' && l.isSaved(t)); },
    toggleRecordingSaved() { const l = L(); const t = current(); if (t && l && typeof l.toggleSaved === 'function') l.toggleSaved(t); },
  };
}

/**
 * The edition a gate row plays a Bible chapter in: the row's `edition` (a BIBLE_AUDIO_EDITIONS id), else the Word of
 * Promise NKJV the pictures name. Its volKey: the queue's key and the timings the still wash reads.
 * @returns {string}
 */
export function gateBibleVolKey(playing, g = /** @type {any} */ (globalThis)) {
  const eds = g.BIBLE_AUDIO_EDITIONS || {};
  const ed = eds[(playing && playing.edition) || 'wop-nkjv'];
  return (ed && ed.volKey) || 'bible-wop-nkjv';
}

/**
 * The gate's queue for a playing item: the collection's numbered letters in order, or the book's chapters.
 * Null until the item's corpus is on the page.
 */
export function gateQueue(playing, g = /** @type {any} */ (globalThis)) {
  const item = (playing && playing.item) || {};
  // a row may say reader: null (an Audio Bible edition names no reader: 2m)
  const reader = playing && 'reader' in playing ? playing.reader : 'B';
  if (item.book) {
    const books = Array.isArray(g.BIBLE_AUDIO_BOOKS) ? g.BIBLE_AUDIO_BOOKS : null;
    const book = books ? books.find((b) => b && b[0] === item.book) : null;
    if (!book) return null;
    const volKey = gateBibleVolKey(playing, g);
    const parts = g.BIBLE_AUDIO_MANIFEST && g.BIBLE_AUDIO_MANIFEST[volKey + ':' + item.book];
    const count = Array.isArray(parts) && parts.length ? parts.length : item.chapter;
    const queue = [];
    for (let c = 1; c <= count; c += 1) {
      queue.push({ key: volKey + ':' + item.book, title: book[1] + ' ' + c, sub: 'The Scriptures of Truth',
        url: 'gate:' + item.book + '/' + c, readerCode: reader, partLabel: 'Chapter ' + c });
    }
    return { queue, qi: Math.max(0, Math.min(count, item.chapter || 1) - 1) };
  }
  const col = g.COL_BY_KEY && typeof g.COL_BY_KEY.get === 'function' ? g.COL_BY_KEY.get(item.collection) : null;
  const list = col && Array.isArray(g[col.globalName]) ? g[col.globalName] : null;
  if (!list) return null;
  const letters = list.filter((l) => l && typeof l.num === 'number');
  const queue = letters.map((l) => ({ key: col.volKey + ':' + l.id, title: l.title, sub: col.label,
    url: 'gate:' + col.volKey + '/' + l.num, readerCode: reader, partLabel: null }));
  return { queue, qi: Math.max(0, letters.findIndex((l) => l.num === item.n)) };
}

/**
 * The gate's engine: memory only. Its controls change its own state (the tests drive them); time never moves.
 * @returns {PlayerSource}
 */
export function fakeSource(playing, g = /** @type {any} */ (globalThis)) {
  const p = playing || {};
  const listeners = new Set();
  let version = 0;
  const sleep = p.sleep;
  let sleepLeft = sleep && typeof sleep === 'object' ? Number(sleep.left) || 0 : 0;
  /** @type {PlayerState} */
  const st = {
    status: p.paused ? 'paused' : 'playing', queue: [], qi: 0,
    time: Number(p.at) || 0, duration: Number(p.length) || 0, rate: Number(p.rate) || 1,
    sleepEndsAt: sleepLeft > 0 ? 1 : 0, sleepMinutes: sleep && typeof sleep === 'object' ? Number(sleep.minutes) || 0 : 0,
    sleepAtTrackEnd: sleep === 'end',
    // playing.edited: Up next was changed by hand (2m asks before a switch)
    sourceMode: p.edited ? 'custom' : '',
  };
  let saved = /** @type {Set<string>} */ (new Set());
  // playing.saved is "downloaded" (On this phone); playing.savedRecording is the Listening Library's Save.
  let savedRecording = !!p.savedRecording;
  const bump = () => { version += 1; listeners.forEach((cb) => cb()); };
  const build = () => {
    if (st.queue.length) return true;
    const q = gateQueue(p, g);
    if (!q || !q.queue.length) return false;
    st.queue = q.queue;
    st.qi = q.qi;
    if (p.saved) saved = new Set([q.queue[q.qi].url]);
    return true;
  };
  const go = (i) => {
    if (i < 0 || i >= st.queue.length) return;
    st.qi = i; st.time = 0; st.status = 'playing';
  };
  return {
    subscribe(cb) { listeners.add(cb); return () => { listeners.delete(cb); }; },
    version: () => (build() ? 'q' : '-') + version,
    state: () => { build(); return st; },
    ready: () => build(),
    isSaved: (url) => saved.has(url),
    sleepLeft: () => sleepLeft,
    toggle() { st.status = st.status === 'playing' ? 'paused' : 'playing'; bump(); },
    prev() { if (st.time > 3 || st.qi === 0) st.time = 0; else go(st.qi - 1); bump(); },
    next() { go(st.qi + 1); bump(); },
    skip(s) { st.time = Math.max(0, Math.min(st.duration, st.time + s)); bump(); },
    seek(s) { st.time = Math.max(0, Math.min(st.duration, s)); bump(); },
    setRate(r) { st.rate = r; bump(); },
    setSleep(min) { st.sleepMinutes = min; st.sleepAtTrackEnd = false; sleepLeft = min * 60; st.sleepEndsAt = 1; bump(); },
    sleepAtEnd() { st.sleepAtTrackEnd = true; st.sleepMinutes = 0; sleepLeft = 0; st.sleepEndsAt = 0; bump(); },
    clearSleep() { st.sleepAtTrackEnd = false; st.sleepMinutes = 0; sleepLeft = 0; st.sleepEndsAt = 0; bump(); },
    playAt(i) { go(i); bump(); },
    move(from, to) {
      if (from <= st.qi || to <= st.qi || from >= st.queue.length || to >= st.queue.length || from === to) return;
      const q = st.queue.slice(); const [t] = q.splice(from, 1); q.splice(to, 0, t); st.queue = q; st.sourceMode = 'custom'; bump();
    },
    remove(i) {
      if (i <= st.qi || i >= st.queue.length) return;
      st.queue = st.queue.slice(0, i).concat(st.queue.slice(i + 1)); st.sourceMode = 'custom'; bump();
    },
    insert(i, t) {
      if (!t || i <= st.qi || i > st.queue.length) return;
      st.queue = st.queue.slice(0, i).concat([t], st.queue.slice(i)); st.sourceMode = 'custom'; bump();
    },
    clearUpcoming() { if (st.queue.length > st.qi + 1) st.sourceMode = 'custom'; st.queue = st.queue.slice(0, st.qi + 1); bump(); },
    voices: () => (build() ? voiceChoices(st.queue[st.qi], g) : null),
    // A voice rebuilds the queue in that voice around the playing item and starts it again (main's engine); that
    // reading is not the one on this phone.
    pickVoice(id) {
      if (!build()) return;
      const track = st.queue[st.qi];
      const v = voiceChoices(track, g);
      const choice = v && v.choices.find((c) => c.id === id);
      if (!v || !choice) return;
      const q = gateQueue(v.kind === 'edition' ? { ...p, edition: id } : { ...p, reader: choice.reader || p.reader }, g);
      if (!q) return;
      const at = q.queue.findIndex((t) => t.url === track.url);
      st.queue = q.queue; st.qi = at >= 0 ? at : q.qi; st.time = 0; st.status = 'playing'; st.sourceMode = '';
      saved = new Set();
      bump();
    },
    voiceNeedsConfirm: () => st.sourceMode === 'custom',
    recordingSaved: () => savedRecording,
    toggleRecordingSaved() { savedRecording = !savedRecording; bump(); },
  };
}

/** Nothing on the page plays: a gate row without `playing`, or a page without bundle-d. @returns {PlayerSource} */
export function silentSource() {
  return {
    subscribe: () => () => {}, version: () => '0', state: () => IDLE, ready: () => true, isSaved: () => false,
    sleepLeft: () => 0, toggle() {}, prev() {}, next() {}, skip() {}, seek() {}, setRate() {}, setSleep() {},
    sleepAtEnd() {}, clearSleep() {}, playAt() {}, move() {}, remove() {}, insert() {}, clearUpcoming() {},
    voices: () => null, pickVoice() {}, voiceNeedsConfirm: () => false, recordingSaved: () => false, toggleRecordingSaved() {},
  };
}
