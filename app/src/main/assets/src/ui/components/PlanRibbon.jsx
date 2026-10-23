/* ═══════════════════════════════════════════════════════════════════════
   PlanRibbon — the reading plan, at the end of what you are reading (mw18 S8)
   ═══════════════════════════════════════════════════════════════════════
   When the chapter or letter open is part of a plan's portion for today, a
   quiet line at its end says where the day stands and goes on: "Bible in a
   Year · Today 2 of 3 · Next: Genesis 3". The × hides it for the rest of
   the day. Next opens through screen-routes' plan opener
   (window.__votOpenPlanItem), as the Today card's Read does.
   ═══════════════════════════════════════════════════════════════════════ */

import { usePlanRuns, runRow, itemRef } from '../../utils/plan-runs-view.js';
import { todayKey } from '../../data/plan-engine.js';
import { useNow } from './TodayCard.jsx';

/** localStorage: the date the reader hid the ribbon on (it shows again the next day). */
const HIDDEN_KEY = 'vot-plan-ribbon-hidden';
const readHidden = () => { try { return localStorage.getItem(HIDDEN_KEY) || ''; } catch (_e) { return ''; } };

/**
 * @param {{ bid: string, cid: string | number, inert?: boolean }} props  the open item as the read record keys it
 */
export function PlanRibbon({ bid, cid, inert }) {
  const runs = usePlanRuns();
  const now = useNow();
  const [hiddenOn, setHiddenOn] = React.useState(readHidden);
  if (inert || !runs.length || hiddenOn === todayKey(now)) return null;
  const keys = bid === 'matthew' ? ['matthew:' + cid, 'matthew-plain:' + cid] : [bid + ':' + cid];
  let row = null;
  for (const run of runs) {
    const r = runRow(run, now);
    if (!r.finished && r.items.some((/** @type {any} */ it) => keys.includes(it.k))) { row = r; break; }
  }
  if (!row) return null;
  const done = row.items.filter((/** @type {any} */ it) => it.done).length;
  const nextItem = row.items.find((/** @type {any} */ it) => !it.done && !keys.includes(it.k)) || null;
  const open = /** @type {any} */ (globalThis).__votOpenPlanItem;
  const hide = () => {
    const day = todayKey(new Date());
    setHiddenOn(day);
    try { localStorage.setItem(HIDDEN_KEY, day); } catch (_e) { /* private window: hidden for this visit */ }
  };
  return (
    <aside className="plan-ribbon" aria-label="Reading plan">
      <span className="plan-ribbon-text">{row.name + ' · Today ' + done + ' of ' + row.items.length}</span>
      {nextItem && typeof open === 'function' ? (
        <button type="button" className="plan-ribbon-next" onClick={() => open(itemRef(nextItem.k))}>
          {'Next: ' + nextItem.label + ' ›'}
        </button>
      ) : !nextItem ? <span className="plan-ribbon-text">{row.done ? 'Done today' : 'The last one today'}</span> : null}
      <button type="button" className="plan-ribbon-hide" aria-label="Hide the plan line for today" onClick={hide}>×</button>
    </aside>
  );
}
