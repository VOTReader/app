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
   The container (Corbin 11-19): the strip is the sitting's header. Its back
   chevron goes to the day's previous reading (from the first: out, the way
   the reader came), its segments go to any reading of the day, its title
   opens the day's readings (DaySheet) and its close is Stop for now; the
   phone's Back takes the chevron's steps (window.__screenBack). Inside a
   sitting the reader's swipes and arrows stay in the day
   (usePlanSessionNav). A paused sitting shows, on a reader page outside
   the day, one line with Resume and the close.
   Outside a session, a plan item shows one quiet line at its end:
   "Counts for Bible in a Year · Day 12 · 2 of 3" with Next.
   Free globals: React, ReactDOM, useModalRegistry, useFocusTrap (bundle-b's).
   ═══════════════════════════════════════════════════════════════════════ */

import { usePlanRuns, runRow, itemRef } from '../../utils/plan-runs-view.js';
import { runStatus, dayItems, itemsLabel, itemsWords, minutesFor, itemKinds, sections, streak } from '../../data/plan-engine.js';
import { bookTitle, runName } from '../../data/plan-catalog.js';
import { usePlanSession, sessionKeyOf, sessionReachedEnd, sessionNotRead, sessionNextKey, endPlanSession, planSessionHost, sessionRun, refOf, sessionItems, sessionDaysLabel,
  sessionNeighbours, pausedPlanSession, resumePlanSession, sessionOpenKey } from '../../utils/plan-session.js';
import { DaySheet } from '../screens/PlanSchedule.jsx';
import { scrollBehavior } from '../../utils/reduced-motion.js';
import { useNow } from './TodayCard.jsx';
import { PlanTick } from './PlanBits.jsx';
import { UiIcon } from './UiIcon.jsx';

/** One item's name, the way the plan says it ("Genesis 35", a letter's title). @param {any} run @param {string} k */
function itemName(run, k) {
  for (const t of (run && run.tracks) || []) { const it = t.items.find((x) => x.k === k); if (it) return itemsLabel([it], bookTitle); }
  const r = refOf(k);
  return (bookTitle(r.bid) || r.bid) + ' ' + r.cid;
}

/**
 * The first section heading of the first Bible chapter among these items (Day done's Tomorrow, P2 3.6), when the
 * Bible corpus is loaded and the chapter has one. Letter items have no heading here (their label is their title).
 * @param {any[]} items @returns {string}
 */
export function firstHeading(items) {
  const B = /** @type {any} */ (globalThis).BOOKS;
  if (!B) return '';
  for (const it of items || []) {
    const m = /^([a-z0-9-]+):(\d+)$/.exec(String(it && it.k));
    const book = m && B[m[1]];
    const n = m ? Number(m[2]) : -1;
    const ch = book && Array.isArray(book.chapters) ? book.chapters.find((/** @type {any} */ c) => Number(c.num) === n) : null;
    const sec = ch && Array.isArray(ch.sections) ? ch.sections.find((/** @type {any} */ x) => x && x.heading) : null;
    if (sec) return String(sec.heading);
    if (m) return '';
  }
  return '';
}

const CHEV_BACK = <UiIcon name="back" />;
const CROSS = <UiIcon name="x" />;

/** "Bible in a Year · Day 12" (or "Days 12–13"). @param {any} s */
const stripName = (s) => { const d = sessionDaysLabel(s); return s.name + ' · ' + d.charAt(0).toUpperCase() + d.slice(1); };

/**
 * The plan's header in the reader, under the top bar: inside a sitting, back, the plan and day (opens the day's
 * readings), where the reader is, one segment per reading and the close; on a reader page outside a paused sitting,
 * one line with Resume and the close.
 * @param {{ bid: string, cid: any, inert?: boolean }} props
 */
export function PlanSessionStrip({ bid, cid, inert }) {
  const s = usePlanSession();
  const [sheet, setSheet] = React.useState(false);
  const k = !inert && s ? sessionKeyOf(bid, cid) : null;
  const host = planSessionHost();
  // The phone's Back takes the chevron's steps: the previous reading; from the first, the ordinary Back (out).
  React.useEffect(() => {
    if (!k) return undefined;
    const fn = () => {
      const prev = sessionNeighbours(k).prev;
      const h = planSessionHost();
      if (prev && h) { h.move(refOf(prev)); return true; }
      endPlanSession();
      return false;
    };
    /** @type {any} */ (window).__screenBack = fn;
    return () => { if (/** @type {any} */ (window).__screenBack === fn) /** @type {any} */ (window).__screenBack = null; };
  }, [k]);
  if (inert) return null;
  if (!k) {
    const p = s ? null : pausedPlanSession();
    const prun = p ? sessionRun(true) : null;
    if (!p || !prun) return null;
    const done = p.keys.filter((x) => prun.ticks && x in prun.ticks).length;
    const resume = () => { const at = resumePlanSession() ? sessionOpenKey() : null; if (at && host) host.open(refOf(at)); };
    return (
      <div className="plan-strip is-paused" role="group" aria-label="Reading plan">
        <div className="plan-strip-line">
          <span className="plan-strip-copy">
            <span className="plan-strip-name">{stripName(p)}</span>
            <span className="plan-strip-left">{done + ' of ' + p.keys.length + ' read'}</span>
          </span>
          <button type="button" className="plan-text-btn plan-link plan-strip-resume" onClick={resume}>Resume</button>
          <button type="button" className="plan-strip-btn" aria-label="Stop for now" onClick={() => endPlanSession()}>{CROSS}</button>
        </div>
      </div>
    );
  }
  const run = sessionRun();
  if (!s || !run) return null;
  const ticks = run.ticks || {};
  const items = sessionItems(run, s);
  const left = items.filter((it) => !(it.k in ticks));
  const at = s.keys.indexOf(k);
  const prev = sessionNeighbours(k).prev;
  const name = stripName(s);
  const go = (/** @type {string} */ x) => { if (x !== k && host) host.move(refOf(x)); };
  const back = () => { if (prev) go(prev); else { endPlanSession(); if (host) host.back(); } };
  return (
    <div className="plan-strip" role="group" aria-label="Reading plan">
      <div className="plan-strip-line">
        <button type="button" className="plan-strip-btn plan-strip-back" onClick={back}
          aria-label={prev ? 'Back to ' + itemName(run, prev) : 'Leave the plan'}>{CHEV_BACK}</button>
        <button type="button" className="plan-strip-title" onClick={() => setSheet(true)} aria-haspopup="dialog"
          aria-label={name + ": the day's readings"}>
          <span className="plan-strip-name">{name}</span>
          <span className="plan-strip-left">{(at + 1) + ' of ' + s.keys.length + (left.length ? ' · ' + minutesFor(itemsWords(left)) + ' min left' : '')}</span>
        </button>
        <button type="button" className="plan-strip-btn plan-strip-close" aria-label="Stop for now"
          onClick={() => { endPlanSession(); if (host) host.back(); }}>{CROSS}</button>
      </div>
      <div className="plan-strip-segs">
        {s.keys.map((x) => (
          <button type="button" key={x} data-done={x in ticks ? '1' : undefined} data-now={x === k ? '1' : undefined}
            aria-current={x === k ? 'true' : undefined} onClick={() => go(x)}
            aria-label={itemName(run, x) + (x in ticks ? ', read' : '') + (x === k ? ', open now' : '')}><span /></button>
        ))}
      </div>
      {sheet ? (
        <DaySheet run={run} day={s.day} now={new Date()} onClose={() => setSheet(false)}
          onRead={(/** @type {number} */ _d, /** @type {string | undefined} */ x) => go(x && s.keys.includes(x) ? x : (sessionOpenKey() || k))} />
      ) : null}
    </div>
  );
}

/**
 * Inside a sitting the reader's ways back and forward (swipe, arrows, the bottom bar) go between the day's readings:
 * never past either end, never out of the day (Corbin 11-19, the Holy Days album's way). null outside a sitting.
 * peek(side, real): the page that drags in; `real(ref)` draws the real page when the reader can, else a card names it.
 * @param {string} bid @param {any} cid @param {boolean} [inert]
 */
export function usePlanSessionNav(bid, cid, inert) {
  const s = usePlanSession();
  if (inert || !s) return null;
  const k = sessionKeyOf(bid, cid);
  const run = sessionRun();
  if (!k || !run) return null;
  const nb = sessionNeighbours(k);
  const host = planSessionHost();
  const label = stripName(s);
  const side = (/** @type {string | null} */ x) => (x ? { k: x, ref: refOf(x), title: itemName(run, x), eyebrow: label + ' · ' + (s.keys.indexOf(x) + 1) + ' of ' + s.keys.length } : null);
  const prev = side(nb.prev), next = side(nb.next);
  const toEnd = () => {
    const el = typeof document !== 'undefined' ? document.querySelector('.plan-end') : null;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
  };
  return {
    prev, next,
    goPrev: () => { if (prev && host) host.move(prev.ref); },
    goNext: () => { if (next && host) host.move(next.ref); else toEnd(); },
    /** @param {'prev' | 'next'} which @param {(ref: { bid: string, cid: any }) => any} [real] */
    peek: (which, real) => {
      const t = which === 'next' ? next : prev;
      if (!t) return null;
      return (real && real(t.ref)) || { kind: 'boundary', eyebrow: t.eyebrow, title: t.title };
    },
  };
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
            {firstHeading(next) ? <p className="plan-daydone-head">{firstHeading(next)}</p> : null}
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
  // A finished day opened again (s.again) walks its readings in order and ends on Done: no second Day done.
  const nextK = s.again ? sessionNeighbours(k).next : sessionNextKey(k);
  const left = s.keys.filter((x) => !(run.ticks && x in run.ticks) && x !== k);
  const lastOne = !s.again && nextK && left.length === 1;
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
      ) : s.again ? (
        <button type="button" className="ui-btn is-primary is-wide" onClick={() => { endPlanSession(); if (host) host.back(); }}>Done</button>
      ) : (
        <button type="button" className="ui-btn is-primary is-wide" onClick={() => { if (!ticked) sessionReachedEnd(k, true); finish(); }}>{'Finish ' + sessionDaysLabel(s)}</button>
      )}
      {lastOne ? <p className="plan-end-note">{'Last one for today · about ' + minutesFor(itemsWords(sessionItems(run, s).filter((it) => it.k === nextK))) + ' min'}</p> : null}
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
  const here = row.items.find((/** @type {any} */ it) => keys.includes(it.k));
  const nextItem = row.items.find((/** @type {any} */ it) => !it.done && !keys.includes(it.k)) || null;
  const open = /** @type {any} */ (globalThis).__votOpenPlanItem;
  return (
    <aside className="plan-ribbon" aria-label="Reading plan">
      <span className="plan-ribbon-copy">
        <span className="plan-ribbon-text">{'Counts for ' + runName(run, null) + ' · Day ' + (row.day + 1) + ' · ' + done + ' of ' + row.items.length}</span>
        {here && !here.done ? <span className="plan-ribbon-why">Ticks off after a little while reading here</span> : null}
      </span>
      {nextItem && typeof open === 'function' ? (
        <button type="button" className="plan-text-btn plan-link plan-ribbon-next" onClick={() => open(itemRef(nextItem.k))}>Next</button>
      ) : null}
    </aside>
  );
}
