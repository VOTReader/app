/* player/source.js - where the v2 player's state comes from (rv1, 2026-10-14).

   v2 is a new view over main's ONE engine (Media3 on Android): the real source wraps the globals bundle-d publishes
   (AudioPlayer, OfflineAudio) and never imports utils/audio-player.js, which would bundle a second engine into
   bundle-v2. A ?gate=<id> boot gets an in-memory fake with the same surface, seeded from the gate row's `playing`
   (myweb's shape: { item: { collection, n } | { book, chapter }, reader, at, length, paused } plus rv1's optional rate,
   sleep, saved): no sound, no clock, no storage. */

/**
 * @typedef {{ status: string, queue: any[], qi: number, time: number, duration: number, rate: number,
 *   sleepEndsAt: number, sleepMinutes: number, sleepAtTrackEnd: boolean }} PlayerState
 * @typedef {{ subscribe: (cb: () => void) => () => void, version: () => string, state: () => PlayerState,
 *   ready: () => boolean, isSaved: (url: string) => boolean, sleepLeft: () => number,
 *   toggle: () => void, prev: () => void, next: () => void, skip: (s: number) => void, seek: (s: number) => void,
 *   setRate: (r: number) => void, setSleep: (min: number) => void, sleepAtEnd: () => void, clearSleep: () => void,
 *   playAt: (i: number) => void, move: (from: number, to: number) => void, remove: (i: number) => void,
 *   clearUpcoming: () => void }} PlayerSource
 */

const IDLE = { status: 'idle', queue: [], qi: 0, time: 0, duration: 0, rate: 1, sleepEndsAt: 0, sleepMinutes: 0, sleepAtTrackEnd: false };

/** The real engine, or null when bundle-d is not on the page. @returns {PlayerSource | null} */
export function realSource(g = /** @type {any} */ (globalThis)) {
  const A = g.AudioPlayer;
  if (!A || typeof A.subscribe !== 'function') return null;
  const O = () => g.OfflineAudio || null;
  return {
    subscribe(cb) {
      const off1 = A.subscribe(cb);
      const o = O();
      const off2 = o && typeof o.subscribe === 'function' ? o.subscribe(cb) : null;
      return () => { if (typeof off1 === 'function') off1(); if (typeof off2 === 'function') off2(); };
    },
    version: () => A.getVersion() + ':' + (O() && typeof O().getVersion === 'function' ? O().getVersion() : 0),
    state: () => A.getState() || IDLE,
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
    clearUpcoming: () => A.clearUpcoming(),
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
  const reader = (playing && playing.reader) || 'B';
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
  };
  let saved = /** @type {Set<string>} */ (new Set());
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
      const q = st.queue.slice(); const [t] = q.splice(from, 1); q.splice(to, 0, t); st.queue = q; bump();
    },
    remove(i) {
      if (i <= st.qi || i >= st.queue.length) return;
      st.queue = st.queue.slice(0, i).concat(st.queue.slice(i + 1)); bump();
    },
    clearUpcoming() { st.queue = st.queue.slice(0, st.qi + 1); bump(); },
  };
}

/** Nothing on the page plays: a gate row without `playing`, or a page without bundle-d. @returns {PlayerSource} */
export function silentSource() {
  return {
    subscribe: () => () => {}, version: () => '0', state: () => IDLE, ready: () => true, isSaved: () => false,
    sleepLeft: () => 0, toggle() {}, prev() {}, next() {}, skip() {}, seek() {}, setRate() {}, setSleep() {},
    sleepAtEnd() {}, clearSleep() {}, playAt() {}, move() {}, remove() {}, clearUpcoming() {},
  };
}
