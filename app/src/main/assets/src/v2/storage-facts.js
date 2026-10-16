/* storage-facts - Your data's Storage group (dz25 7h, v2-gaps 34): main's Settings rows Protection, Total app data, Your
   data, Growth, Platform and Diagnostic Log (SettingsScreen.jsx 734-790, 1426-1498) in design's words. Rows open nothing.
   The facts are bundle-b's StorageHealth report (quota, usage, persisted, risks; main's useStorageInfo reads the same),
   measureUserData (what Export saves), the growth samples main records once per Settings visit, the platform, and on the
   APK the diagnostic log's length (PlatformBridge.getCrashLog). A gate boot reads its row's facts.space instead. */
import { formatBytes } from '../utils/format-bytes.js';

/**
 * @typedef {{ lastAssessedAt?: number, quota?: number | null, usage?: number | null, persisted?: boolean | null,
 *   risks?: string[] }} SpaceReport
 * @typedef {{ total: number, mediaCount?: number }} UserData
 * @typedef {{ report: SpaceReport | null, platform: string, userData: UserData | null,
 *   samples: Array<{ d: string, b: number }>, denied: boolean, log: number, android: boolean }} SpaceFacts
 * @typedef {{ id: string, t: string, s: string, protect?: boolean }} SpaceRow
 */

/** main's useStorageInfo status: 'loading' until StorageHealth's first look, 'unavailable' with no storage API. */
export function spaceStatus(/** @type {SpaceReport | null} */ r) {
  if (!r || !r.lastAssessedAt) return 'loading';
  return r.quota == null && r.usage == null ? 'unavailable' : 'ready';
}

/**
 * Protection (main's protectionDisplayText). Protect now only where the reader can do something: a browser that asks
 * (Firefox), not yet protected and not yet refused; Chromium decides silently and the APK is always protected.
 * @param {SpaceReport | null} r @param {boolean} denied @param {string} where "this phone" / "this computer"
 * @returns {{ s: string, protect: boolean }}
 */
export function protectionLine(r, denied, where) {
  const st = spaceStatus(r);
  if (st === 'loading') return { s: 'Checking…', protect: false };
  if (st === 'unavailable' || !r) return { s: "This browser can't protect it. Export a backup now and then.", protect: false };
  if (r.persisted) return { s: "Active: the browser won't clear it on its own", protect: false };
  if (denied) return { s: 'The browser said no. Export a backup now and then.', protect: false };
  if (Array.isArray(r.risks) && r.risks.indexOf('not-persisted') !== -1) {
    return { s: 'Not active: the browser may clear it to free space', protect: true };
  }
  return { s: 'Saved on ' + where + '. Export a backup now and then.', protect: false };
}

/** Space used (main's Total app data): everything the app keeps on the device. @param {SpaceReport | null} r */
export function spaceLine(r) {
  const st = spaceStatus(r);
  if (st === 'loading') return 'Checking…';
  if (st === 'unavailable' || !r || r.usage == null) return "This browser doesn't say.";
  return 'About ' + formatBytes(r.usage) + (r.quota != null ? ' of ' + formatBytes(r.quota) : '')
    + ', the offline library, kept songs and Garden pages included';
}

const SAVED = 'highlights, notes, journal, bookmarks, links, progress and history';

/** What Export saves (main's Your data): the reader's own data, journal pictures and recordings counted. @param {UserData | null} u */
export function exportLine(u) {
  if (!u) return 'Measuring…';
  const n = u.mediaCount || 0;
  return 'About ' + formatBytes(u.total) + (n > 0 ? ', ' + n + ' journal ' + (n === 1 ? 'item' : 'items') + ' among them' : '')
    + ': ' + SAVED;
}

/** "September 20" from a sample's local day ("2026-09-20"). @param {string} d */
function dayWords(d) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || ''));
  if (!m) return String(d || '');
  try {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(undefined, { month: 'long', day: 'numeric' });
  } catch (_e) { return d; }
}

/**
 * Growth (main's StorageTrendValue, one sample per day of a Settings visit), or null before the first.
 * @param {Array<{ d: string, b: number }>} samples oldest first
 */
export function growthLine(samples) {
  if (!Array.isArray(samples) || !samples.length) return null;
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (samples.length === 1) return 'First measured today · ' + formatBytes(last.b);
  const since = ' since ' + dayWords(first.d);
  const delta = last.b - first.b;
  if (!delta) return 'No change' + since + ' · ' + formatBytes(last.b);
  return (delta > 0 ? 'Grown by ' : 'Shrunk by ') + formatBytes(Math.abs(delta)) + since + ' · now ' + formatBytes(last.b);
}

/** main's _platformLabel, in design's words. */
const BROWSERS = /** @type {Record<string, string>} */ ({
  'android-webview': 'Installed app', 'safari-tab': 'Safari', 'safari-pwa': 'Safari, from the Home Screen',
  firefox: 'Firefox', chrome: 'Chrome', edge: 'Edge',
});
export const browserLine = (/** @type {string} */ platform) => BROWSERS[platform] || 'Web browser';

/** The diagnostic log (APK only, when it holds entries): what goes into the next export. @param {number} n */
export function logLine(n) {
  return (n === 1 ? '1 entry' : n + ' entries') + ': warnings, errors and timings, file paths left out. It goes into your next export.';
}

/**
 * The Storage rows in design's order: Protection, Space used, What Export saves, Growth (once measured), Browser, and the
 * diagnostic log last (the APK, when it has entries).
 * @param {SpaceFacts} f @param {string} where @returns {SpaceRow[]}
 */
export function spaceRows(f, where) {
  const p = protectionLine(f.report, f.denied, where);
  const rows = /** @type {SpaceRow[]} */ ([
    { id: 'protection', t: 'Protection', s: p.s, protect: p.protect },
    { id: 'space', t: 'Space used', s: spaceLine(f.report) },
    { id: 'export', t: 'What Export saves', s: exportLine(f.userData) },
  ]);
  const growth = growthLine(f.samples);
  if (growth) rows.push({ id: 'growth', t: 'Growth', s: growth });
  rows.push({ id: 'browser', t: 'Browser', s: browserLine(f.platform) });
  if (f.android && f.log > 0) rows.push({ id: 'log', t: 'Diagnostic log', s: logLine(f.log) });
  return rows;
}

/**
 * states.json 7h-your-data-storage: Firefox, not installed, not yet protected; 212.4 MB of 2.0 GB; Export about 1.4 MB;
 * 12 samples since September 20, grown by 312.0 KB.
 * @param {number} now @returns {SpaceFacts}
 */
export function gateSpace(now) {
  const total = 1468006;
  const firstB = total - 319488;
  const samples = [];
  for (let i = 0; i < 12; i += 1) {
    const day = new Date(2026, 8, 20 + i * 2);
    const mm = day.getMonth() + 1;
    const dd = day.getDate();
    samples.push({ d: day.getFullYear() + '-' + (mm < 10 ? '0' : '') + mm + '-' + (dd < 10 ? '0' : '') + dd,
      b: i === 11 ? total : Math.round(firstB + (319488 * i) / 11) });
  }
  return {
    report: { lastAssessedAt: now, quota: 2147483648, usage: 222717542, persisted: false, risks: ['not-persisted'] },
    platform: 'firefox', userData: { total, mediaCount: 0 }, samples, denied: false, log: 0, android: false,
  };
}
