/* settings-pages.js - what v2's Settings pages say and change (zv1; pictures 7a-listening, 7b-your-data, 7c-help).

   The pages re-show main's own settings and write them the way main does (rule 5: same keys, same shape, no migration):
   a setting goes into vot-state's settings through StateStore with its `touched` mark (main's updateSetting), the starting
   speed through the player or AudioLibraryStore (main's Default Speed), the weekly copy through DataSafety. Every writer
   takes the global object, so tests hand it fakes; a gate boot never calls one. */

const g = /** @type {any} */ (globalThis);
const DAY = 24 * 3600 * 1000;

/** Main's reader codes (utils/audio-track.js AUDIO_READERS), in plain words: the picker's rows and the page's line. */
export const READERS = [
  { id: 'auto', label: 'Automatic', s: 'Each recording’s own first reading', line: 'Automatic · each recording’s own first reading' },
  { id: 'B', label: 'Benjamin', s: 'Wherever he has recorded', line: 'Benjamin, wherever he has recorded' },
  { id: 'T', label: 'Timothy', s: 'Wherever he has recorded', line: 'Timothy, wherever he has recorded' },
  { id: 'V', label: 'Spoken voice', s: 'Text-to-speech, wherever there is one', line: 'Spoken voice, wherever there is one' },
  { id: 'M', label: 'With music', s: 'Wherever a reading with music exists', line: 'With music, wherever there is one' },
];

/** Main's speed presets (AUDIO_PLAYBACK_RATES) when the registry is not loaded. */
const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];

/** The switches under "While it plays" and "Songs" (main's keys; each defaults on, as in hooks/use-settings.js). */
export const PLAY_SWITCHES = [
  { key: 'readAlongHighlight', t: 'Light the line being read', s: 'Read-along highlight' },
  { key: 'readAlongFollow', t: 'Follow the voice', s: 'Keeps that line mid-screen', needs: 'readAlongHighlight' },
  { key: 'audioTurnPage', t: 'Turn the page with the audio', s: 'The reading moves with the audio' },
];
export const SONG_SWITCH = { key: 'showLetterSongs', t: 'Hear it sung', s: 'On letters a song sings word for word' };

/**
 * @typedef {{ reader: string, bibleAudio: string, rate: number, readAlongHighlight: boolean, readAlongFollow: boolean,
 *   audioTurnPage: boolean, showLetterSongs: boolean }} ListeningFacts
 * @typedef {{ lastExportAt: number | null, snapshots: { count: number, newestAt: number | null, where: string } | null,
 *   weekly: boolean | null, now: number }} DataFacts
 */

/** The reader's saved settings (vot-state.settings), read only: {} when the store has not loaded. */
export function savedSettings(gl = g) {
  try {
    const store = gl.StateStore;
    if (store && typeof store.isReady === 'function' && store.isReady()) return (store.get() || {}).settings || {};
  } catch (_e) { /* the defaults */ }
  return {};
}

/** The Listening page's facts from saved settings and the library's speed. @returns {ListeningFacts} */
export function listeningFacts(s = {}, rate = 1) {
  return {
    reader: typeof s.letterReader === 'string' ? s.letterReader : 'auto',
    bibleAudio: typeof s.bibleAudio === 'string' ? s.bibleAudio : 'brm-kjv',
    rate: typeof rate === 'number' && rate > 0 ? rate : 1,
    readAlongHighlight: s.readAlongHighlight !== false,
    readAlongFollow: s.readAlongFollow !== false,
    audioTurnPage: s.audioTurnPage !== false,
    showLetterSongs: s.showLetterSongs !== false,
  };
}

/** Listening facts for a real boot. */
export function liveListening(gl = g) {
  let rate = 1;
  try {
    const lib = gl.AudioLibraryStore;
    if (lib && typeof lib.getPlaybackRate === 'function') rate = Number(lib.getPlaybackRate()) || 1;
  } catch (_e) { /* 1x */ }
  return listeningFacts(savedSettings(gl), rate);
}

/** The reader row's line ("Benjamin, wherever he has recorded"). */
export function readerLine(id) {
  const r = READERS.find((x) => x.id === id) || READERS[0];
  return r.line;
}

/** The Bible audio choices main offers (released editions, then Off): { id, label, s }. */
export function editionOptions(gl = g) {
  const reg = gl.BIBLE_AUDIO_EDITIONS || {};
  const offered = typeof gl.bibleAudioOffered === 'function' ? gl.bibleAudioOffered : (ed) => !!ed && !ed.unreleased;
  const eds = Object.entries(reg).filter(([, ed]) => offered(ed))
    .map(([id, ed]) => ({ id, label: String(ed.label || id), s: String(ed.description || 'Read along, a chapter at a time') }));
  return eds.concat([{ id: 'off', label: 'Off', s: 'No Listen button on Bible chapters' }]);
}

/** The Bible audio row's line: the edition's own label ("KJV · Biblical Restoration Ministries"). */
export function editionLine(id, gl = g) {
  if (!id || id === 'off') return 'Off · no Listen button on Bible chapters';
  const ed = (gl.BIBLE_AUDIO_EDITIONS || {})[id];
  return ed && ed.label ? String(ed.label) : String(id).toUpperCase();
}

/** "1×", "1.25×" */
export function rateLabel(rate) {
  return String(Math.round((Number(rate) || 1) * 100) / 100) + '×';
}

/** The speed choices: main's presets, plus the current speed when the player left it between them. */
export function rateOptions(current, gl = g) {
  const rates = Array.isArray(gl.AUDIO_PLAYBACK_RATES) && gl.AUDIO_PLAYBACK_RATES.length ? gl.AUDIO_PLAYBACK_RATES : RATES;
  const listed = rates.some((r) => Math.abs(r - current) < 0.005) ? rates.slice() : rates.concat([current]).sort((a, b) => a - b);
  return listed.map((r) => ({ id: String(r), label: rateLabel(r), s: r === 1 ? 'As recorded' : r < 1 ? 'Slower than recorded' : 'Faster than recorded' }));
}

/**
 * Writes one setting as main's updateSetting does: vot-state.settings[key] = val, the key marked touched. false when the
 * store has not loaded (nothing written).
 * @param {string} key @param {any} val
 */
export function writeSetting(key, val, gl = g) {
  const store = gl.StateStore;
  if (!store || typeof store.isReady !== 'function' || !store.isReady() || typeof store.set !== 'function') return false;
  const st = store.get() || {};
  const prev = st.settings || {};
  store.set({ ...st, settings: { ...prev, [key]: val, touched: { ...(prev.touched || {}), [key]: true } } });
  if (key === 'letterReader' || key === 'downloadWifiOnly') pushListening(gl);
  return true;
}

/**
 * Hands bundle-d the saved settings its plain-module stores act on: the favourite reader (AudioPlayer) and Download only
 * on Wi-Fi (download-gate.js, through its DownloadGate global). Main's App pushed both as it rendered (screen-routes);
 * v2 never renders that App, so the player pushes them once a real boot has read the saved settings, and writeSetting
 * again on each change. Nothing is said before the store has loaded.
 */
export function pushListening(gl = g) {
  const store = gl.StateStore;
  if (!store || typeof store.isReady !== 'function' || !store.isReady()) return;
  const s = savedSettings(gl);
  try {
    if (gl.AudioPlayer && typeof gl.AudioPlayer.setPreferredReader === 'function') gl.AudioPlayer.setPreferredReader(s.letterReader);
    if (gl.DownloadGate && typeof gl.DownloadGate.setWifiOnly === 'function') gl.DownloadGate.setWifiOnly(s.downloadWifiOnly === true);
  } catch (_e) { /* an older bundle-d: its own defaults */ }
}

/** The starting speed, as main's Default Speed sets it (the player when there is one, else the library). */
export function writeRate(rate, gl = g) {
  const player = gl.AudioPlayer;
  if (player && typeof player.setPlaybackRate === 'function') { player.setPlaybackRate(rate); return true; }
  const lib = gl.AudioLibraryStore;
  if (lib && typeof lib.setPlaybackRate === 'function') { lib.setPlaybackRate(rate); return true; }
  return false;
}

/** "today", "yesterday", "3 days ago" (whole days, like main's Your Data). */
export function daysAgo(at, now) {
  const days = Math.max(0, Math.floor((now - at) / DAY));
  return days === 0 ? 'today' : days === 1 ? 'yesterday' : days + ' days ago';
}

/** Your data's facts for a real boot: the last export (main's vot-last-export), the snapshots, the weekly copy. @returns {DataFacts} */
export function liveData(gl = g) {
  let lastExportAt = null;
  try {
    const n = Number(gl.localStorage && gl.localStorage.getItem('vot-last-export'));
    if (n > 0) lastExportAt = n;
  } catch (_e) { /* never exported, as far as this page can tell */ }
  const DS = gl.DataSafety;
  let snapshots = null;
  let weekly = null;
  try { if (DS && typeof DS.status === 'function') snapshots = DS.status() || null; } catch (_e) { /* none shown */ }
  try { if (DS && typeof DS.weeklyStatus === 'function') weekly = !!(DS.weeklyStatus() || {}).on; } catch (_e) { /* row hidden */ }
  return { lastExportAt, snapshots, weekly, now: Date.now() };
}

/** "this phone", "this computer" */
export const here = (device) => 'this ' + (device === 'computer' ? 'computer' : 'phone');

/** The safety card: { t, s } ("Exported 2 days ago", "Newest snapshot today · 7 kept on this phone"). */
export function safeCard(f, device) {
  const t = typeof f.lastExportAt === 'number' ? 'Exported ' + daysAgo(f.lastExportAt, f.now) : 'Not exported from ' + here(device) + ' yet';
  const sn = f.snapshots;
  const where = sn && sn.where === 'browser' ? 'in this browser' : 'on ' + here(device);
  const s = sn && sn.count > 0
    ? (typeof sn.newestAt === 'number' ? 'Newest snapshot ' + daysAgo(sn.newestAt, f.now) + ' · ' : '') + sn.count + ' kept ' + where
    : 'Snapshots are kept ' + where + ' as you go';
  return { t, s };
}

/** "Off · once a week, the last 4 kept" */
export function weeklyLine(on) {
  return (on ? 'On' : 'Off') + ' · once a week, the last 4 kept';
}

/** The version line: "1.0.2-993990dd61 · corpus c69", or null when it cannot be read. */
export function versionLine(v) {
  if (!v || !v.cacheVersion) return null;
  return String(v.cacheVersion).replace(/^v/, '') + ' · corpus ' + (v.corpusVersion || '?');
}

/**
 * The build this page runs: the service worker's answer, else (Android, where the APK's own service-worker.js is the
 * installed build) the file read directly, as main's Settings does. Resolves null when neither answers.
 */
export async function readVersion(gl = g) {
  try {
    const sw = typeof gl.getBuildVersion === 'function' ? await gl.getBuildVersion() : null;
    if (sw && sw.cacheVersion) return sw;
    const android = !!(gl.PlatformBridge && gl.PlatformBridge.isAndroid);
    if (android && typeof gl.fetchServerBuildVersion === 'function') return await gl.fetchServerBuildVersion();
  } catch (_e) { /* no version line */ }
  return null;
}

/** What updates mean on this platform (the line under the version). */
export function updateLine(gl = g) {
  return gl.PlatformBridge && gl.PlatformBridge.isAndroid ? 'Installed app build: updates come as a new app'
    : 'Website build: a new version arrives when the app reopens';
}

/** The 7a-7c pictures' facts (states.json): Benjamin, KJV BRM, 1x, every switch on; exported 2 days ago, newest snapshot
 *  today, 7 kept, weekly off. */
export function gateListening() {
  return listeningFacts({ letterReader: 'B', bibleAudio: 'brm-kjv' }, 1);
}
/** @param {number} now @returns {DataFacts} */
export function gateData(now) {
  return { lastExportAt: now - 2 * DAY, snapshots: { count: 7, newestAt: now - 3600 * 1000, where: 'phone' }, weekly: false, now };
}
