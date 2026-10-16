/* RecentSheet - Recent, all of it (rv5; design dz30 0c): Home's Recent label opens every place read or heard, newest
   first, Continue's too. A tap picks up there as Continue does (a heard one plays on through main's playTrack, which
   resumes where it stopped; a read one opens at that place); x takes one out and Clear recent empties the list, each at
   once with Undo (Home owns the toast). A real boot edits main's own stores: the reading history (HistoryStore), the
   recordings played (AudioLibraryStore) and an open page in vot-state, which turns into a Home page as main's last tab
   does (its tab count and active tab stay put); a gate boot edits its list in memory. A sheet on the phone, a dialog
   on the laptop (D4). */
import { Icon } from '../Icon.jsx';
import { Sheet } from '../Sheet.jsx';
import { describeItem, recentLine, sameKeys, itemFromHistory, itemFromTrack, itemFromTab } from '../home-facts.js';

const g = /** @type {any} */ (globalThis);

/** What the emptied list says. */
export const RECENT_EMPTY = 'Nothing yet. What you read or hear shows up here.';

/** An open page closed to Home, in place (main resets its last tab the same way). */
const homeTab = (t) => ({ ...t, screen: 'home', bookId: null, chapterNum: null, letterId: null, studyId: null, studyChapterId: null });

/** vot-state, once StateStore has loaded and can be written (look.js writes it the same way), else null. */
function stateStore(gl) {
  const S = gl.StateStore;
  if (!S || typeof S.get !== 'function' || typeof S.set !== 'function') return null;
  return typeof S.isReady === 'function' && !S.isReady() ? null : S;
}

/** Closes main's open pages whose place `match`es; returns their Undo (each page back in its slot if still Home). */
function closePages(match, gl) {
  const S = stateStore(gl);
  if (!S) return () => {};
  const cur = S.get() || {};
  const tabs = Array.isArray(cur.tabs) ? cur.tabs : [];
  /** @type {Array<[number, any]>} */
  const gone = [];
  const next = tabs.map((t, i) => {
    const it = itemFromTab(t, gl);
    if (!it || !match(it)) return t;
    gone.push([i, t]);
    return homeTab(t);
  });
  if (!gone.length) return () => {};
  S.set({ ...cur, tabs: next });
  return () => {
    const now = S.get() || {};
    const list = Array.isArray(now.tabs) ? now.tabs.slice() : [];
    gone.forEach(([i, t]) => { if (list[i] && list[i].screen === 'home') list[i] = t; });
    S.set({ ...now, tabs: list });
  };
}

/** History entries newest first, as HistoryStore keeps them. */
const newestFirst = (list) => list.slice().sort((a, b) => (Number(b && b.ts) || 0) - (Number(a && a.ts) || 0));

/**
 * Takes one row's place out of Recent in main's stores: every history visit to it, every time it was played, an open
 * page showing it. @param {import('../home-facts.js').RecentRow} row @returns {() => void} its Undo
 */
export function forgetPlace(row, gl = g) {
  const keys = new Set(sameKeys(row.it, gl));
  const match = (it) => !!it && sameKeys(it, gl).some((k) => keys.has(k));
  const H = gl.HistoryStore;
  const L = gl.AudioLibraryStore;
  const entries = H && typeof H.list === 'function' ? H.list() || [] : [];
  const visits = entries.filter((e) => match(itemFromHistory(e, gl)));
  if (visits.length && typeof H.setAll === 'function') H.setAll(entries.filter((e) => !visits.includes(e)));
  const played = L && typeof L.recent === 'function' ? L.recent() || [] : [];
  const plays = played.filter((t) => match(itemFromTrack(t, gl)));
  if (typeof (L && L.removeRecent) === 'function') plays.forEach((t) => L.removeRecent(t.url));
  const pagesBack = closePages(match, gl);
  return () => {
    if (visits.length && typeof H.setAll === 'function') H.setAll(newestFirst((H.list() || []).concat(visits)));
    if (plays.length && typeof L.restoreRecent === 'function') L.restoreRecent(plays);
    pagesBack();
  };
}

/** Empties Recent in main's stores (main's Clear history, and the recordings played). @returns {() => void} its Undo */
export function forgetAll(gl = g) {
  const H = gl.HistoryStore;
  const L = gl.AudioLibraryStore;
  const entries = H && typeof H.list === 'function' ? (H.list() || []).slice() : [];
  const played = L && typeof L.recent === 'function' ? L.recent() || [] : [];
  if (H && typeof H.clear === 'function') H.clear();
  if (L && typeof L.clearRecent === 'function') L.clearRecent();
  const pagesBack = closePages(() => true, gl);
  return () => {
    if (entries.length && H && typeof H.setAll === 'function') H.setAll(newestFirst((H.list() || []).concat(entries)));
    if (played.length && L && typeof L.restoreRecent === 'function') L.restoreRecent(played);
    pagesBack();
  };
}

/**
 * @param {{ rows: import('../home-facts.js').RecentRow[], now: number, desktop: boolean, onClose: () => void,
 *   onPick: (row: any) => void, onRemove: (row: any, title: string) => void, onClear: () => void }} props
 */
export function RecentSheet({ rows, now, desktop, onClose, onPick, onRemove, onClear }) {
  const shown = rows.map((r) => ({ r, d: describeItem(r.it) })).filter((x) => x.d);
  return (
    <Sheet kind="rct" label="Recent" desktop={desktop} onClose={onClose}>
      <div className="upn-h">
        <div className="sh">Recent</div>
        <button type="button" className="textbtn sm" disabled={!shown.length} onClick={onClear}>Clear recent</button>
      </div>
      {shown.length ? (
        <div className="rows">
          {shown.map(({ r, d }) => {
            const line = recentLine(r, now);
            const verb = !r.heard ? 'Open' : line.endsWith('Finished') ? 'Play again' : 'Play on';
            return (
              <div key={sameKeys(r.it)[0]} className="row rcr" data-heard={r.heard ? '1' : '0'}>
                <span className="lead"><Icon name={r.heard ? 'tab.listen' : 'book'} /></span>
                <div className="tx" role="button" tabIndex={0} aria-label={verb + ': ' + d.title} onClick={() => onPick(r)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(r); } }}>
                  <div className="t">{d.title}</div>
                  <div className="s">{line}</div>
                </div>
                <button type="button" className="ic rx" aria-label={'Remove ' + d.title + ' from Recent'} onClick={() => onRemove(r, d.title)}>
                  <Icon name="close" />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="empty-t">{RECENT_EMPTY}</p>
      )}
    </Sheet>
  );
}
