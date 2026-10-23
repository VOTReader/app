// @ts-check
/* auto-download (dl-d5, downloads brief 3k, call 5A): recordings the listener will want next, put on the phone by
   themselves, on Wi-Fi only.
   - Plan week: each running plan keeps its next 7 days on the phone, rolling (on by default; a switch on the plan,
     run.autoAudio === false turns it off).
   - Up next: "Keep the next 3 ready" (Settings > Listening, off by default) keeps the 3 recordings after the one
     playing on the phone.
   They go into the same download queue as a tap on Download, marked wifi: the phone app's queue and the browser's
   start them only on an unmetered network (with the app closed too), letting the listener's own go first. They are
   queued only on Wi-Fi, and on mobile data the ones still waiting are taken back out and come back on Wi-Fi (the
   one on its way finishes). Nothing is ever deleted here (call 6A), and a recording the listener removed is
   not downloaded again by itself. */

import { dayItems, totalDays } from '../data/plan-engine.js';
import { AudioPlayer } from './audio-player.js';
import { isSongUrl, isVotAudioUrl } from './audio-track.js';
import { networkType } from './download-gate.js';
import { OfflineAudio } from './offline-audio.js';
import { itemRef, runRow } from './plan-runs-view.js';

/** Days of a plan kept ahead, today's included. */
export const PLAN_DAYS_AHEAD = 7;
/** Recordings after the one playing kept ready. */
export const UP_NEXT_COUNT = 3;
/** The urls this module queued and has not yet seen land (so mobile data can take back only its own). */
const KEY = 'vot-auto-downloads';
/** Recordings the listener removed from the phone, or cancelled when this queued them: never downloaded again here. */
const GONE_KEY = 'vot-auto-gone';
const MAX_KEPT = 400;
const MAX_GONE = 2000;

/**
 * Each running plan's refs for its next [PLAN_DAYS_AHEAD] days, from the day it is on. A paused, finished or stopped
 * plan, or one whose switch is off, has none.
 * @param {any[]} runs @param {Date} now @returns {{ bid: string, cid: string | number }[]}
 */
export function planWeekRefs(runs, now) {
  const refs = [];
  for (const run of Array.isArray(runs) ? runs : []) {
    if (!run || run.status !== 'running' || run.autoAudio === false) continue;
    let from = 0;
    try { from = Math.max(0, runRow(run, now).day); } catch (_e) { continue; }
    const end = Math.min(from + PLAN_DAYS_AHEAD, totalDays(run));
    for (let d = from; d < end; d++) for (const it of dayItems(run, d)) refs.push(itemRef(it.k));
  }
  return refs;
}

/**
 * The [UP_NEXT_COUNT] recordings after the one playing.
 * @param {any} state the player's state ({ queue, qi }) @returns {any[]}
 */
export function upNextTracks(state) {
  const q = state && Array.isArray(state.queue) ? state.queue : [];
  const qi = state && Number.isInteger(state.qi) ? state.qi : 0;
  // Letters and chapters: songs are kept by their own shelf (Songs kept on this phone).
  return q.slice(qi + 1).filter((t) => t && typeof t.url === 'string' && !isSongUrl(t.url)).slice(0, UP_NEXT_COUNT);
}

/** @returns {boolean} the phone is on an unmetered network now (Wi-Fi); a browser that cannot tell says no */
export function unmeteredNow() {
  try {
    const b = typeof window !== 'undefined' ? /** @type {any} */ (window).AndroidBridge : null;
    if (b && typeof b.offlineAudioUnmetered === 'function') return b.offlineAudioUnmetered() === true;
  } catch (_e) { return false; }
  const t = networkType();
  return t === 'wifi' || t === 'ethernet';
}

/** @param {string} key @returns {Set<string>} */
function _read(key) {
  try {
    const list = JSON.parse(localStorage.getItem(key) || '[]');
    return new Set(Array.isArray(list) ? list.filter((u) => typeof u === 'string') : []);
  } catch (_e) { return new Set(); }
}

/** @param {string} key @param {Set<string>} set @param {number} max */
function _write(key, set, max) {
  try { localStorage.setItem(key, JSON.stringify([...set].slice(-max))); } catch (_e) { /* a full or blocked store: this visit only */ }
}
const _mine = () => _read(KEY);
/** @param {Set<string>} mine */
const _keep = (mine) => _write(KEY, mine, MAX_KEPT);

/** Urls queued this visit: one that failed is not asked for again until the app opens again. */
const _asked = new Set();
/** What was on the phone at the last pass: one missing now was removed (nothing here removes). */
/** @type {Set<string> | null} */
let _lastSaved = null;

/**
 * One pass: queue what is wanted and not on the phone (on Wi-Fi), or take back what this queued and is still
 * waiting (on mobile data). Cheap; run it on any change and once a minute.
 * @param {{ off: any, tracks: any[], unmetered: boolean }} p the download store (OfflineAudio), the wanted tracks
 * @returns {{ queued: number, withdrawn: number }}
 */
export function autoDownloadPass({ off, tracks, unmetered }) {
  const out = { queued: 0, withdrawn: 0 };
  if (!off || typeof off.download !== 'function' || typeof off.statusOf !== 'function') return out;
  const mine = _mine();
  const gone = _read(GONE_KEY);
  let changed = false;
  let goneMore = false;
  if (typeof off.items === 'function') {
    const now = new Set((off.items() || []).map((/** @type {any} */ i) => i && i.url).filter(Boolean));
    if (_lastSaved) for (const url of _lastSaved) if (!now.has(url) && !gone.has(url)) { gone.add(url); goneMore = true; }
    _lastSaved = now;
  }
  // What the listener cancelled from the queue (this module's own withdrawals are taken out below as they happen).
  const cancels = typeof off.takeCancels === 'function' ? off.takeCancels() : [];
  for (const url of cancels) if (mine.has(url) && !gone.has(url)) { gone.add(url); goneMore = true; }
  for (const url of [...mine]) {
    const st = off.statusOf(url);
    // On the phone, off the queue (cancelled, or failed with the app closed: tried again next visit) or failed.
    if (st === 'saved' || st === 'none' || st === 'failed') { mine.delete(url); changed = true; }
  }
  if (goneMore) _write(GONE_KEY, gone, MAX_GONE);
  if (!unmetered) {
    const back = [...mine].filter((url) => off.statusOf(url) === 'queued');
    if (back.length && typeof off.cancel === 'function') {
      off.cancel(back);
      if (typeof off.takeCancels === 'function') off.takeCancels();   // ours, not the listener's
      for (const url of back) { mine.delete(url); _asked.delete(url); }
      out.withdrawn = back.length;
      changed = true;
    }
    if (changed) _keep(mine);
    return out;
  }
  if (typeof off.paused === 'function' && off.paused()) { if (changed) _keep(mine); return out; }
  const seen = new Set();
  const go = [];
  for (const t of Array.isArray(tracks) ? tracks : []) {
    const url = t && typeof t.url === 'string' ? t.url : '';
    if (!url || seen.has(url) || !isVotAudioUrl(url)) continue;
    seen.add(url);
    if (off.statusOf(url) !== 'none' || gone.has(url) || _asked.has(url)) continue;   // on the phone or its way, or removed
    const bytes = typeof off.sizeOf === 'function' ? off.sizeOf(url) : null;
    const part = t.partLabel ? ' · ' + t.partLabel : '';
    go.push({ url, key: t.key || '', title: (t.title || '') + part, wifi: true, ...(typeof bytes === 'number' && bytes > 0 ? { bytes } : {}) });
  }
  if (go.length && off.download(go) !== false) {
    for (const it of go) { mine.add(it.url); _asked.add(it.url); }
    out.queued = go.length;
    changed = true;
  }
  if (changed) _keep(mine);
  return out;
}

/** A pass waits this long after a change, so a burst (download progress, a queue built) makes one. */
const SETTLE_MS = 2000;
/** The plan store, from the stores bundle (as plan-runs-view reads it: one store, never a second copy). */
const _plans = () => { const s = /** @type {any} */ (globalThis).ReadingPlanStore; return s && typeof s.all === 'function' ? s : null; };
const EVERY_MS = 60_000;

/** A plan's refs as the tracks Listen plays: screen-routes' planTracks, handed over at each build of the routes. */
/** @type {(refs: any[]) => any[]} */
let _tracksOf = () => [];
/** Settings' "Keep the next 3 ready". */
let _keepNext = false;
let _started = false;
/** @type {ReturnType<typeof setTimeout> | null} */
let _timer = null;
/** @type {null | (() => void)} */
let _offPlans = null;
let _playing = '';

/**
 * The app hands over what a pass needs as it renders (as it does Download only on Wi-Fi): a plan's tracks and the
 * Keep the next 3 ready switch. The first hand-over starts the watcher where downloads work: a pass after any change
 * to the plans, the download store, the track playing or the network, and once a minute.
 * @param {(refs: any[]) => any[]} tracksOf @param {boolean} keepNext
 */
export function setAutoDownloads(tracksOf, keepNext) {
  if (typeof tracksOf === 'function') _tracksOf = tracksOf;
  const flipped = keepNext !== _keepNext;
  _keepNext = keepNext === true;
  if (!_started) _start();
  else if (flipped) _soon();
}

function _run() {
  _timer = null;
  try {
    // The plan store's global can come after the first render: found at each pass, and heard once found.
    const plans = _plans();
    if (plans && !_offPlans) _offPlans = plans.subscribe(_soon);
    const tracks = [..._tracksOf(planWeekRefs(plans ? plans.all() : [], new Date()))];
    if (_keepNext) tracks.push(...upNextTracks(AudioPlayer.getState()));
    autoDownloadPass({ off: OfflineAudio, tracks, unmetered: unmeteredNow() });
  } catch (_e) { /* a pass that cannot run waits for the next */ }
}

function _soon() { if (!_timer) _timer = setTimeout(_run, SETTLE_MS); }

function _start() {
  if (typeof window === 'undefined' || !OfflineAudio.available()) return;
  _started = true;
  OfflineAudio.subscribe(_soon);
  AudioPlayer.subscribe(() => {
    const s = AudioPlayer.getState();
    const now = s.qi + '|' + ((s.queue[s.qi] || {}).url || '') + '|' + s.queue.length;
    if (now !== _playing) { _playing = now; if (_keepNext) _soon(); }
  });
  const conn = /** @type {any} */ (navigator).connection;
  if (conn && typeof conn.addEventListener === 'function') conn.addEventListener('change', _soon);
  setInterval(_soon, EVERY_MS);
  _soon();
}

/** Tests: forget this visit's asks. */
export function _resetAutoDownload() { _asked.clear(); _lastSaved = null; }
