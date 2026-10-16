/* StorageBanner - main's StorageHealthBanner in v2 (mw7, v2-gaps 33; design dz15 9f, 9g): one strip under the top bar on
   every screen, in the flow (it pushes the page down, so Back and the bar stay usable), the most serious message only, in
   main's order: saved by a newer version > changed in another tab > data looks missing > a save failed > private window >
   almost full > running low > slow to load. Main's words unchanged; the first sentence is the strip's head line.
   Two kinds (design): danger, data at risk now (newer version, another tab, data missing, save failed, almost full);
   warn, act soon (private window, running low, slow). Buttons: the kit's gold pill first, an outline second. Only "data
   looks missing" has the x; Restore and Keep as is are main's (DataSafety.restoreMissing / acceptCurrent). Export goes to
   Settings > Your data (main's goes to Settings). Reads bundle-b's StorageHealth report; a gate boot reads its row's
   facts.storage (a partial report), and its buttons do nothing.
   With no storage message the slot holds main's offline library strip (OfflineLibraryBanner, its fallback there too;
   dz25 9j): gold, information, on the website only (the APK ships its library, and main's check never runs there).
   Main's words and phases (utils/offline-library.js, bundle-d's OfflineLibrary): a check once per visit, 9 s after an
   active worker; Retry fetches only the missing files; Dismiss hides it for the visit. A gate reads facts.offline. */
import { Icon } from './Icon.jsx';
import { formatBytes } from '../utils/format-bytes.js';

const g = /** @type {any} */ (globalThis);
const NO_SUB = () => () => {};
const ZERO = () => 0;

/** main's StorageHealth.TIER values (utils/storage-health.js) */
export const TIER = { WARNING: 'warning', CRITICAL: 'critical', READONLY: 'readonly' };

/**
 * @typedef {'reload' | 'restore' | 'keep' | 'export'} BannerAct
 * @typedef {{ id: string, kind: 'danger' | 'warn', text: string, buttons: Array<{ label: string, act: BannerAct }>,
 *   dismissable: boolean }} Banner
 */

/** main's _snapDate: "October 13" in the reader's own words for dates. @param {number} at */
function snapDate(at) {
  try { return new Date(at).toLocaleDateString(undefined, { month: 'long', day: 'numeric' }); } catch (_e) { return 'an earlier day'; }
}

/** main's _what: "55 highlights, 6 notes, 627 read marks". @param {any} m */
function what(m) {
  const parts = [];
  const add = (n, one, many) => { if (n) parts.push(n + ' ' + (n === 1 ? one : many)); };
  const x = m || {};
  add(x.highlights, 'highlight', 'highlights');
  add(x.notes, 'note', 'notes');
  add(x.links, 'link', 'links');
  add(x.bookmarks, 'bookmark', 'bookmarks');
  add(x.journal, 'journal entry', 'journal entries');
  add(x.readMarks, 'read mark', 'read marks');
  return parts.length ? parts.join(', ') : 'nothing saved';
}

/**
 * The one strip a report calls for, or null (main's _pickScenario, its words and order).
 * @param {any} r a StorageHealthReport (or a gate's part of one)
 * @param {{ android?: boolean, dismissed?: (id: string) => boolean }} [env]
 * @returns {Banner | null}
 */
export function pickBanner(r, { android = false, dismissed = () => false } = {}) {
  if (!r) return null;
  if (r.versionTooNew) {
    return {
      id: 'newer-version', kind: 'danger', dismissable: false,
      text: android
        ? "Your library was saved by a newer version of VOTReader, so this version can't open it. Nothing on this device has been lost: install the latest version. Changes you make here won't be saved."
        : "Your library was saved by a newer version of VOTReader, so this version can't open it. Nothing on this device has been lost: reload VOTReader to get the latest version. Changes you make here won't be saved.",
      buttons: android ? [] : [{ label: 'Reload', act: 'reload' }],
    };
  }
  if (r.libraryElsewhere) {
    return {
      id: 'library-elsewhere', kind: 'danger', dismissable: false,
      text: r.libraryElsewhere === 'changing'
        ? "Your library is being changed in another tab (a backup restore or Clear All). Changes you make here won't be saved. Reload this tab when it's done."
        : "Your library was changed in another tab. Reload to see it. Changes you make here won't be saved.",
      buttons: [{ label: 'Reload', act: 'reload' }],
    };
  }
  if (r.dataMissing && !dismissed('data-missing')) {
    const m = r.dataMissing;
    return {
      id: 'data-missing', kind: 'danger', dismissable: true,
      text: 'Some of your data looks missing. On ' + snapDate(m.at) + ' you had ' + what(m.then) + '; now ' + what(m.now)
        + '. Restore adds back what is missing and keeps everything you have made since.',
      buttons: [{ label: 'Restore', act: 'restore' }, { label: 'Keep as is', act: 'keep' }],
    };
  }
  if (r.tier === TIER.READONLY && r.writeFailedThisSession) {
    return {
      id: 'write-failed', kind: 'danger', dismissable: false,
      text: "Your last change couldn't be saved — storage is full. Your work is still on screen but won't be kept if you close the app. Export your data now.",
      buttons: [{ label: 'Export now', act: 'export' }],
    };
  }
  if (r.privateModeLikely) {
    return { id: 'private-mode', kind: 'warn', dismissable: false, buttons: [],
      text: "You're in a private window. Nothing you save here will be kept when you close it." };
  }
  if (r.tier === TIER.CRITICAL) {
    return {
      id: 'critical', kind: 'danger', dismissable: false,
      text: 'Storage is almost full — ' + (r.remaining != null ? formatBytes(r.remaining) : 'very little') + ' remaining. Your data may not save. Export now to avoid losing it.',
      buttons: [{ label: 'Export now', act: 'export' }],
    };
  }
  if (r.tier === TIER.WARNING) {
    return {
      id: 'warning', kind: 'warn', dismissable: false,
      text: 'Storage is running low — ' + (r.remaining != null ? formatBytes(r.remaining) : 'limited space') + ' remaining. New notes and recordings may not save.',
      buttons: [{ label: 'Export data', act: 'export' }],
    };
  }
  if (r.storesDegraded) {
    return { id: 'storage-slow', kind: 'warn', dismissable: false, buttons: [],
      text: 'Storage is slow to load. Your saved library will appear once it catches up; your place and settings changed before then may not be kept.' };
  }
  return null;
}

/** The first sentence (the strip's head line) and the rest. @param {string} text @returns {[string, string]} */
export function splitHead(text) {
  const m = /^(.+?[.!?])\s+(\S[\s\S]*)$/.exec(text);
  return m ? [m[1], m[2]] : [text, ''];
}

/** bundle-b's StorageHealth report, re-read when it changes; a gate's row facts instead. */
function useReport(gate) {
  const H = gate ? null : g.StorageHealth;
  const live = !!(H && typeof H.subscribe === 'function' && typeof H.getVersion === 'function');
  React.useSyncExternalStore(live ? H.subscribe : NO_SUB, live ? H.getVersion : ZERO);
  if (gate) return gate.facts && gate.facts.storage ? gate.facts.storage : null;
  try { return H && typeof H.getReport === 'function' ? H.getReport() : null; } catch (_e) { return null; }
}

/** @param {number} n @param {string} one @param {string} many */
const count = (n, one, many) => (n === 1 ? '1 ' + one : n + ' ' + many);

/**
 * Main's OfflineLibraryBanner for one OfflineLibrary state: its words, Retry, and the x; null when nothing shows
 * (unknown, complete, dismissed).
 * @param {null | { phase: string, missing: number }} st
 * @returns {null | { lead: string, detail: string, retry: boolean, close: boolean }}
 */
export function offlineView(st) {
  const n = st ? st.missing : 0;
  switch (st && st.phase) {
    case 'incomplete':
      return { lead: 'Offline library incomplete.', detail: count(n, 'file did not download.', 'files did not download.'), retry: true, close: true };
    case 'retrying':
      return { lead: 'Downloading ' + count(n, 'missing file', 'missing files') + '…', detail: '', retry: false, close: true };
    case 'fixed':
      return { lead: 'Offline library complete.', detail: '', retry: false, close: false };
    case 'still':
      return { lead: 'Offline library incomplete.', detail: count(n, 'file is still missing.', 'files are still missing.')
        + ' Connect to the internet, then retry.', retry: true, close: true };
    default:
      return null;
  }
}

/** bundle-d's OfflineLibrary state, its once-per-visit check started (main's banner does it on mount); a gate's facts. */
function useOffline(gate) {
  const L = gate ? null : g.OfflineLibrary;
  const live = !!(L && typeof L.subscribe === 'function' && typeof L.getVersion === 'function');
  React.useSyncExternalStore(live ? L.subscribe : NO_SUB, live ? L.getVersion : ZERO);
  React.useEffect(() => { if (live && typeof L.start === 'function') L.start(); }, [live, L]);
  if (gate) return gate.facts && gate.facts.offline ? gate.facts.offline : null;
  try { return live && typeof L.getState === 'function' ? L.getState() : null; } catch (_e) { return null; }
}

/** The offline library strip (9j), in the storage strip's slot when that has nothing to say. @param {{ gate: any }} props */
function OfflineStrip({ gate }) {
  const v = offlineView(useOffline(gate));
  if (!v) return null;
  const L = gate ? null : g.OfflineLibrary;
  return (
    <div className={'shb gold' + (v.close ? ' dis' : '')} role="status" data-banner="offline">
      <Icon name="downCircle" />
      <div className="shb-t"><span className="shb-h">{v.lead}</span>{v.detail ? ' ' + v.detail : null}</div>
      {v.retry && (
        <div className="shb-a">
          <button type="button" className="pill" onClick={() => { if (L && typeof L.retry === 'function') L.retry(); }}>Retry</button>
        </div>
      )}
      {v.close && (
        <button type="button" className="ic x" aria-label="Dismiss" onClick={() => { if (L && typeof L.dismiss === 'function') L.dismiss(); }}>
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}

/** @param {{ gate: any, go: (route: any) => void }} props */
export function StorageBanner({ gate, go }) {
  const report = useReport(gate);
  const H = gate ? null : g.StorageHealth;
  const b = pickBanner(report, {
    android: !gate && !!(g.PlatformBridge && g.PlatformBridge.isAndroid),
    dismissed: (id) => !!(H && typeof H.isDismissed === 'function' && H.isDismissed(id)),
  });
  if (!b) return <OfflineStrip gate={gate} />;
  const run = (/** @type {BannerAct} */ act) => {
    if (gate) return;
    const DS = g.DataSafety;
    if (act === 'reload') { try { g.location.reload(); } catch (_e) { /* nothing more to do */ } }
    else if (act === 'restore' && DS && DS.restoreMissing) Promise.resolve(DS.restoreMissing()).catch(() => {});
    else if (act === 'keep' && DS && DS.acceptCurrent) Promise.resolve(DS.acceptCurrent()).catch(() => {});
    else if (act === 'export') go({ place: 'settings/your-data' });
  };
  const [head, rest] = splitHead(b.text);
  return (
    <div className={'shb ' + b.kind + (b.dismissable ? ' dis' : '')} role="alert" data-banner={b.id}>
      <Icon name="alert" />
      <div className="shb-t"><span className="shb-h">{head}</span>{rest ? ' ' + rest : null}</div>
      {b.buttons.length > 0 && (
        <div className="shb-a">
          {b.buttons.map((btn, i) => (
            <button key={btn.act} type="button" className={i === 0 ? 'pill' : 'btn2'} onClick={() => run(btn.act)}>{btn.label}</button>
          ))}
        </div>
      )}
      {b.dismissable && (
        <button type="button" className="ic x" aria-label="Dismiss"
          onClick={() => { if (H && typeof H.dismissScenario === 'function') H.dismissScenario(b.id); }}>
          <Icon name="close" />
        </button>
      )}
    </div>
  );
}
