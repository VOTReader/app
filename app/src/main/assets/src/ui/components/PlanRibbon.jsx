/* ═══════════════════════════════════════════════════════════════════════
   PlanRibbon — the reading plan inside the reader (mw18 S8; plans2 3.5, 3.6)
   ═══════════════════════════════════════════════════════════════════════
   Inside a plan session (utils/plan-session.js: one sitting of one plan
   day, started from the plan page, the Read tab's row or a day sheet):
   - PlanSessionStrip, under the top bar: "Bible in a Year · Day 12" and
     "2 of 3 · 5 min left", one segment per item.
   - PlanRibbon at the end of the item: reaching it counts the item as read
     (no hidden timer inside a session; outside one the read detector's time
     rule decides, unchanged). Then "Genesis 35 read", NEXT · GENESIS 36
     (moves in place, the way back carried along) or FINISH DAY 12, a small
     "Last one for today · about 4 min", and Not read yet / Stop for now.
   - FINISH DAY shows Day done once: the tick, three facts, Tomorrow, a
     section finished or a quarter mark, DONE (back to where the session
     began), Write a note and Read ahead.
   Outside a session, a plan item shows one quiet line at its end:
   "Counts for Bible in a Year · Day 12 · 2 of 3" with Next.
   Free globals: React, ReactDOM, useModalRegistry, useFocusTrap (bundle-b's).
   ═══════════════════════════════════════════════════════════════════════ */

import { usePlanRuns, runRow, itemRef } from '../../utils/plan-runs-view.js';
import { runStatus, dayItems, itemsLabel, itemsWords, minutesFor, itemKinds, sections, streak } from '../../data/plan-engine.js';
import { bookTitle, runName } from '../../data/plan-catalog.js';
import { usePlanSession, sessionKeyOf, sessionReachedEnd, sessionNotRead, sessionNextKey, endPlanSession, planSessionHost, sessionRun, refOf } from '../../utils/plan-session.js';
import { useNow } from './TodayCard.jsx';
import { PlanTick } from './PlanBits.jsx';

/** One item's name, the way the plan says it ("Genesis 35", a letter's title). @param {any} run @param {string} k */
function itemName(run, k) {
  for (const t of (run && run.tracks) || []) { const it = t.items.find((x) => x.k === k); if (it) return itemsLabel([it], bookTitle); }
  const r = refOf(k);
  return (bookTitle(r.bid) || r.bid) + ' ' + r.cid;
}

/** The strip under the top bar while the open item is part of a session. @param {{ bid: string, cid: any, inert?: boolean }} props */
export function PlanSessionStrip({ bid, cid, inert }) {
  const s = usePlanSession();
  if (inert || !s) return null;
  const k = sessionKeyOf(bid, cid);
  const run = sessionRun();
  if (!k || !run) return null;
  const ticks = run.ticks || {};
  const items = dayItems(run, s.day);
  const left = items.filter((it) => !(it.k in ticks));
  const at = s.keys.indexOf(k);
  return (
    <div className="plan-strip" role="status" aria-label={s.name + ', day ' + (s.day + 1) + ': ' + (at + 1) + ' of ' + s.keys.length}>
      <div className="plan-strip-line">
        <span className="plan-strip-name">{s.name + ' · Day ' + (s.day + 1)}</span>
        <span className="plan-strip-left">{(at + 1) + ' of ' + s.keys.length + (left.length ? ' · ' + minutesFor(itemsWords(left)) + ' min left' : '')}</span>
      </div>
      <div className="plan-strip-segs" aria-hidden="true">
        {s.keys.map((x) => <span key={x} data-done={x in ticks ? '1' : undefined} data-now={x === k ? '1' : undefined} />)}
      </div>
    </div>
  );
}

/** "A quarter of the way" when the plan crossed a quarter mark with this day. @param {number} before @param {number} after */
function quarterLine(before, after) {
  if (after >= 100) return '';
  const q = Math.floor(after / 25);
  if (q <= Math.floor(before / 25) || q < 1) return '';
  return ['', 'A quarter of the way', 'Halfway', 'Three quarters of the way'][q] || '';
}

/**
 * Day done, shown once after FINISH DAY. onClose(back): the session ends; back true (DONE, the phone's Back) returns to
 * where the session began, false leaves for Write a note or Read ahead.
 * @param {{ runId: string, day: number, name: string, onClose: (back: boolean) => void }} props
 */
export function DayDone({ runId, day, name, onClose }) {
  const onDone = () => onClose(true);
  // The phone's Back closes it and stays (the press is spent on the overlay); DONE closes it and goes back.
  useModalRegistry({ id: 'plan-day-done', dismiss: () => onClose(false) });
  const trapRef = useFocusTrap(true);
  const store = /** @type {any} */ (globalThis).ReadingPlanStore;
  const run = store && typeof store.get === 'function' ? store.get(runId) : null;
  const host = planSessionHost();
  if (!run) return null;
  const now = new Date();
  const st = runStatus(run, now);
  const items = dayItems(run, day);
  const kinds = itemKinds(items);
  const total = Math.max(1, st.itemsTotal);
  const before = Math.round(Math.max(0, st.itemsDone - items.length) * 100 / total);
  const inRow = streak(run, now).inRow;
  const finishedSecs = sections(run, bookTitle).filter((s) => s.lastDay === day && s.done >= s.count);
  const next = st.finished ? [] : dayItems(run, st.day);
  const quarter = quarterLine(before, st.percent);
  const unit = kinds.chapters && kinds.letters ? 'readings' : kinds.chapters ? (kinds.chapters === 1 ? 'chapter' : 'chapters') : (items.length === 1 ? 'letter' : 'letters');
  const node = (
    <div className="plan-daydone" ref={trapRef} role="dialog" aria-modal="true" aria-labelledby="plan-daydone-t">
      <div className="plan-daydone-inner">
        <span className="plan-daydone-tick" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M6 12.5l4 4L18 8" /></svg></span>
        <h2 className="plan-daydone-title" id="plan-daydone-t">{'Day ' + (day + 1) + ' done'}</h2>
        <p className="plan-daydone-sub">{itemsLabel(items, bookTitle) + ' · ' + name}</p>
        <div className="plan-facts">
          <div className="plan-fact"><b>{items.length}</b><span>{unit}</span></div>
          {inRow >= 2 ? <div className="plan-fact"><b>{inRow}</b><span>days in a row</span></div> : null}
          <div className="plan-fact"><b>{st.percent + '%'}</b><span>of the plan</span></div>
        </div>
        {finishedSecs.map((s) => <p key={s.key} className="plan-daydone-mark">{'◆ ' + s.name + ' finished · ' + s.count + (s.key.startsWith('b:') ? ' chapters' : ' readings')}</p>)}
        {quarter ? <p className="plan-daydone-mark">{'◆ ' + quarter}</p> : null}
        {next.length ? (
          <div className="ui-card plan-daydone-next">
            <p className="root-eyebrow">Tomorrow</p>
            <p className="plan-today-title">{itemsLabel(next, bookTitle)}</p>
            <p className="plan-today-sub">{'about ' + minutesFor(itemsWords(next)) + ' min'}</p>
          </div>
        ) : st.finished ? <p className="plan-daydone-sub">{'That was the last day. You finished ' + name + '.'}</p> : null}
        <button type="button" className="ui-btn is-primary is-wide" onClick={onDone}>Done</button>
        <div className="plan-links plan-links-center">
          {host ? <button type="button" className="plan-text-btn plan-link" onClick={() => { onClose(false); host.openNote(runId, day); }}>Write a note</button> : null}
          {host && next.length ? (
            <button type="button" className="plan-text-btn plan-link"
              onClick={() => { onClose(false); host.openPlans([{ v: 'list' }, { v: 'plan', id: runId, sheet: st.day }]); }}>Read ahead</button>
          ) : null}
        </div>
      </div>
    </div>
  );
  return typeof ReactDOM !== 'undefined' && typeof document !== 'undefined' && document.body ? ReactDOM.createPortal(node, document.body) : node;
}

/** The end panel inside a session. @param {{ k: string }} props */
function SessionEnd({ k }) {
  const s = usePlanSession();
  const ref = React.useRef(/** @type {HTMLElement | null} */ (null));
  const [done, setDone] = React.useState(/** @type {{ runId: string, day: number, name: string } | null} */ (null));
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver !== 'function') { sessionReachedEnd(k); return undefined; }
    const io = new IntersectionObserver((entries) => { if (entries.some((e) => e.isIntersecting)) sessionReachedEnd(k); }, { threshold: 0.6 });
    io.observe(el);
    return () => io.disconnect();
  }, [k]);
  const run = sessionRun();
  const host = planSessionHost();
  if (!s || !run) return null;
  const ticked = !!(run.ticks && k in run.ticks);
  const nextK = sessionNextKey(k);
  const left = s.keys.filter((x) => !(run.ticks && x in run.ticks) && x !== k);
  const lastOne = nextK && left.length === 1;
  // The session ends when Day done closes (it lives inside this panel, which shows only while the session does).
  const finish = () => setDone({ runId: s.runId, day: s.day, name: s.name });
  // Back runs once the overlay has unmounted (its registry entry gone), else the Back would only close it again.
  const closeDone = (/** @type {boolean} */ back) => { setDone(null); endPlanSession(); if (back && host) setTimeout(() => host.back(), 0); };
  return (
    <aside className="ui-card plan-end" ref={(el) => { ref.current = el; }} aria-label="Reading plan">
      <p className="plan-end-read">{ticked ? <><PlanTick on />{' ' + itemName(run, k) + ' read'}</> : itemName(run, k)}</p>
      {nextK ? (
        <button type="button" className="ui-btn is-primary is-wide" onClick={() => { if (!ticked) sessionReachedEnd(k, true); if (host) host.move(itemRef(nextK)); }}>
          {'Next · ' + itemName(run, nextK) + ' →'}
        </button>
      ) : (
        <button type="button" className="ui-btn is-primary is-wide" onClick={() => { if (!ticked) sessionReachedEnd(k, true); finish(); }}>{'Finish day ' + (s.day + 1)}</button>
      )}
      {lastOne ? <p className="plan-end-note">{'Last one for today · about ' + minutesFor(itemsWords(dayItems(run, s.day).filter((it) => it.k === nextK))) + ' min'}</p> : null}
      <div className="plan-links plan-links-center">
        {ticked ? <button type="button" className="plan-text-btn plan-link" onClick={() => sessionNotRead(k)}>Not read yet</button> : null}
        <button type="button" className="plan-text-btn plan-link" onClick={() => { endPlanSession(); if (host) host.back(); }}>Stop for now</button>
      </div>
      {done ? <DayDone {...done} onClose={closeDone} /> : null}
    </aside>
  );
}

/**
 * The plan at the end of what is open: the session's end panel, or outside a session the one quiet line.
 * @param {{ bid: string, cid: string | number, inert?: boolean }} props  the open item as the read record keys it
 */
export function PlanRibbon({ bid, cid, inert }) {
  const s = usePlanSession();
  const runs = usePlanRuns();
  const now = useNow();
  if (inert) return null;
  const sk = s ? sessionKeyOf(bid, cid) : null;
  if (sk) return <SessionEnd key={sk} k={sk} />;
  if (!runs.length) return null;
  const keys = bid === 'matthew' ? ['matthew:' + cid, 'matthew-plain:' + cid] : [bid + ':' + cid];
  let row = null, run = null;
  for (const r of runs) {
    const rr = runRow(r, now);
    if (!rr.finished && !rr.paused && !rr.notStarted && rr.items.some((/** @type {any} */ it) => keys.includes(it.k))) { row = rr; run = r; break; }
  }
  if (!row || !run) return null;
  const done = row.items.filter((/** @type {any} */ it) => it.done).length;
  const nextItem = row.items.find((/** @type {any} */ it) => !it.done && !keys.includes(it.k)) || null;
  const open = /** @type {any} */ (globalThis).__votOpenPlanItem;
  return (
    <aside className="plan-ribbon" aria-label="Reading plan">
      <span className="plan-ribbon-text">{'Counts for ' + runName(run, null) + ' · Day ' + (row.day + 1) + ' · ' + done + ' of ' + row.items.length}</span>
      {nextItem && typeof open === 'function' ? (
        <button type="button" className="plan-text-btn plan-link plan-ribbon-next" onClick={() => open(itemRef(nextItem.k))}>Next</button>
      ) : null}
    </aside>
  );
}
