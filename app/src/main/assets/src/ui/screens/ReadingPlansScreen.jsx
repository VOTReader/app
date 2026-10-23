/* ═══════════════════════════════════════════════════════════════════════
   ReadingPlansScreen — follow, start and stop reading plans (rp1, mw18)
   ═══════════════════════════════════════════════════════════════════════
   Cluster G (bundle-d since lz1), like the other personal-study screens.
   mw18 landing 1, built to Corbin's pick (lanes/myweb/out/mockups/mw18/
   r2-plans-list.png, 2026-10-22: "B for the reading plans screen"):
   - each running plan opens on today (C1): the portion, Read and Listen,
     today's chapters or letters as checks, this week, then the honest counts
     (C10: "41 of 1,189 chapters · on pace to finish Oct 21, 2027");
   - a day read through shows "Done today", tomorrow's portion, Read ahead and
     Read again (C2);
   - behind shows the new finish with Catch me up (the flexible engine);
   - Plan details opens the month and Stop, which asks first (C12);
   - Find a plan lists every catalog plan, one tap to start.
   Plans are runs in ReadingPlanStore (plan-runs-view.js). Nothing scores the
   reader: no streaks.
   Free globals: React, ScreenLayout, LibraryNav, ConfirmStrip.
   ═══════════════════════════════════════════════════════════════════════ */

import { useVolumesSeq, useNow } from '../components/TodayCard.jsx';
import { PlanBuilder } from './PlanBuilder.jsx';
import { usePlanRuns, runRow, saveRun, stopRun, letterSource, itemRef, shortDate } from '../../utils/plan-runs-view.js';
import { startCatalogPlan, planDef, PLAN_CATALOG, LETTER_CHAIN } from '../../data/plan-catalog.js';
import { monthCells, catchUp, spreadOut, spreadPreview, changePace, changeWeekdays, pauseRun, resumeRun, markDay, totalDays, todayKey } from '../../data/plan-engine.js';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const GROUPS = [['bible', 'The Bible'], ['letters', 'The Letters'], ['starter', 'Short starts']];

/** @param {{ done: boolean }} props */
function Check({ done }) {
  return (
    <span className="today-check" data-done={done ? '1' : '0'} aria-hidden="true">
      {done ? <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.4"><path d="M5 12.5l4.2 4.2L19 7" /></svg> : null}
    </span>
  );
}

/** A thin line icon per group: an open book, a page, a sprout. @param {{ group: string }} props */
function GroupIcon({ group }) {
  const d = group === 'bible' ? 'M3 5.5c3-1 6-1 9 1 3-2 6-2 9-1V19c-3-1-6-1-9 1-3-2-6-2-9-1zM12 6.5V20'
    : group === 'letters' ? 'M6 3h9l4 4v14H6zM15 3v4h4M9 11h7M9 14.5h7M9 18h5'
      : 'M12 21v-9M12 12c0-4 3-6 7-6 0 4-3 6-7 6zM12 14c0-3-2.5-5-6-5 0 3 2.5 5 6 5z';
  return <svg className="plans-row-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>;
}

/** The seven dates of this week (Sunday first) with the plan's state on each. @param {any} plan @param {Date} now */
function weekCells(plan, now) {
  /** @type {Record<string, any[]>} */
  const months = {};
  const out = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + i, 12);
    const key = d.getFullYear() + '-' + d.getMonth();
    if (!months[key]) months[key] = monthCells(plan, d.getFullYear(), d.getMonth(), now);
    const c = months[key][d.getDate() - 1];
    out.push({ date: d.getDate(), state: c ? c.state : 'none', read: !!(c && c.read) });
  }
  return out;
}

/** The calendar's day state, in the names the styles use (rp1 called a read day 'done'). @param {string} s */
const dayState = (s) => (s === 'read' ? 'done' : s);

/**
 * C3: a plan behind says so plainly and offers the two ways back: Catch me up (keep the daily amount, the
 * finish moves) and Spread it out (keep the finish, a little more each day).
 * @param {{ plan: any, row: any, now: Date }} props
 */
function Behind({ plan, row, now }) {
  const spread = spreadPreview(plan, now);
  return (
    <div className="plans-behind">
      <h4 className="plans-behind-title">{row.behind + (row.behind === 1 ? ' day' : ' days') + ' behind'}</h4>
      <p className="plans-plan-sub">{'At this pace you finish ' + shortDate(row.projected) + ' (planned ' + shortDate(row.target) + ')'}</p>
      <button type="button" className="plans-option" onClick={() => saveRun(catchUp(plan, new Date()))}>
        <span className="plans-option-name">Catch me up</span>
        <span className="plans-option-sub">{'Pick up from today · the finish moves to ' + shortDate(row.projected)}</span>
      </button>
      {spread ? (
        <button type="button" className="plans-option" onClick={() => saveRun(spreadOut(plan, new Date()))}>
          <span className="plans-option-name">Spread it out</span>
          <span className="plans-option-sub">{'Keep ' + shortDate(row.target) + ' · about ' + spread.minutes + ' min a day from now'}</span>
        </button>
      ) : null}
    </div>
  );
}

const ALL_WEEK = [true, true, true, true, true, true, true];
const WORK_WEEK = [false, true, true, true, true, true, false];

/** The paces a plan offers (C6): the catalog's, else ones in the plan's own measure. @param {any} plan */
function paceOptions(plan) {
  const def = planDef(plan.plan);
  const label = (/** @type {any} */ p) => (p.mode === 'minutes' ? 'About ' + p.n + ' min a day'
    : p.mode === 'items' ? p.n + ' a day' : p.n === 365 ? '1 year' : p.n === 730 ? '2 years' : p.n + ' days');
  /** @type {any[]} */
  let list = def && def.paces ? def.paces.filter((/** @type {any} */ p) => p.mode !== 'by') : [];
  if (!list.length) {
    const mode = plan.pace ? plan.pace.mode : 'days';
    if (mode === 'minutes') list = [5, 10, 15, 20].map((n) => ({ mode, n }));
    else if (mode === 'items') list = [1, 2, 3].map((n) => ({ mode, n }));
    else { const t = totalDays(plan); list = [Math.max(1, Math.round(t / 2)), t, t * 2].map((n) => ({ mode: 'days', n })); }
  }
  return list.map((p) => ({ ...p, label: label(p) }));
}

/**
 * C6: change the pace or length of what is left, keeping everything read; finish by a date; weekdays only.
 * @param {{ plan: any, now: Date, onDone: () => void }} props
 */
function PaceChoices({ plan, now, onDone }) {
  const [by, setBy] = React.useState('');
  const cur = plan.pace || null;
  const workWeek = Array.isArray(plan.weekdays) && plan.weekdays.join() === WORK_WEEK.join();
  const set = (/** @type {any} */ pace) => { saveRun(changePace(plan, pace, new Date())); onDone(); };
  return (
    <div className="plans-pace-pick" role="group" aria-label="Change pace">
      <div className="plans-pick">
        {paceOptions(plan).map((p) => (
          <button key={p.mode + p.n} type="button" className="plans-chip" aria-pressed={!!cur && cur.mode === p.mode && cur.n === p.n}
            onClick={() => set({ mode: p.mode, n: p.n })}>{p.label}</button>
        ))}
      </div>
      <label className="plans-by">
        <span>Finish by</span>
        <input type="date" value={by} min={todayKey(now)} onChange={(e) => setBy(e.target.value)} />
        <button type="button" className="today-link" disabled={!by} onClick={() => set({ mode: 'by', date: by })}>Set</button>
      </label>
      <label className="plans-by">
        <input type="checkbox" checked={workWeek}
          onChange={() => { saveRun(changeWeekdays(plan, workWeek ? ALL_WEEK : WORK_WEEK, new Date())); onDone(); }} />
        <span>Weekdays only (Monday to Friday)</span>
      </label>
      <p className="plans-note">What you have read stays read.</p>
    </div>
  );
}

/**
 * C4: hold for about half a second to mark a day read or not read (reading in print, or elsewhere).
 * @param {() => void} onHold
 */
function useHold(onHold) {
  const timer = React.useRef(/** @type {any} */ (null));
  const held = React.useRef(false);
  const clear = () => { if (timer.current) { clearTimeout(timer.current); timer.current = null; } };
  React.useEffect(() => clear, []);
  return {
    onPointerDown: () => { held.current = false; clear(); timer.current = setTimeout(() => { held.current = true; timer.current = null; onHold(); }, 550); },
    onPointerUp: clear, onPointerLeave: clear, onPointerCancel: clear,
    onContextMenu: (/** @type {any} */ e) => { if (held.current) e.preventDefault(); },
    /** A click that ends a hold is not a tap. @param {any} e */
    onClickCapture: (e) => { if (held.current) { held.current = false; e.stopPropagation(); e.preventDefault(); } },
  };
}

/** @param {{ children: any, onHold: () => void, className?: string }} props */
function Holdable({ children, onHold, className }) {
  return <div className={className} {...useHold(onHold)}>{children}</div>;
}

/**
 * @param {{ readingPlans: any, isRead: (bid: string, cid: any) => boolean, markAsReadEnabled?: boolean,
 *   onPlansMoved?: (left: any[]) => void, onRead: (next: any) => void, onListen?: (items: any[], name: string) => void,
 *   onBack: () => void, backLabel?: string,
 *   onSearch?: () => void, onHistory?: () => void, onSettings?: () => void, theme?: string, onThemeChange?: (t: string) => void }} props
 */
export function ReadingPlansScreen({ readingPlans, isRead, markAsReadEnabled: _markAsReadEnabled, onPlansMoved, onRead, onListen, onBack, backLabel = 'Library',
  onSearch, onHistory, onSettings, theme, onThemeChange }) {
  const plans = usePlanRuns({ legacy: readingPlans, isRead, onLegacyMoved: onPlansMoved });
  const seq = useVolumesSeq(true);
  const now = useNow();
  const [stopping, setStopping] = React.useState(/** @type {string | null} */ (null));
  const [open, setOpen] = React.useState(/** @type {string | null} */ (null));
  const [picking, setPicking] = React.useState(false);
  const [pacing, setPacing] = React.useState(/** @type {string | null} */ (null));
  const [building, setBuilding] = React.useState(/** @type {0 | 1 | 2} */ (0));
  const [status, setStatus] = React.useState('');
  const rows = plans.map((r) => runRow(r, now));
  const running = new Set(plans.map((p) => p.plan));
  const lettersIn = seq.length > 0;
  /** @param {string} id @param {any} [opt] */
  const start = (id, opt) => {
    const r = startCatalogPlan(id, letterSource(), new Date(), opt);
    if (r) { saveRun(r); setStatus(''); setPicking(false); } else setStatus('Loading the Volumes… try again in a moment.');
  };
  const src = lettersIn ? letterSource() : null;
  const collections = src ? LETTER_CHAIN.map((k) => src.colByKey.get(k)).filter(Boolean) : [];

  if (building) {
    return (
      <ScreenLayout navChildren={LibraryNav({ onBack: () => setBuilding(building === 2 ? 1 : 0), backLabel: 'Reading plans', showHome: false, onSearch, onHistory, onSettings, theme, onThemeChange })}>
        <div className="plans-screen">
          <PlanBuilder step={building} onStep={setBuilding} lettersReady={lettersIn} />
        </div>
      </ScreenLayout>
    );
  }

  return (
    <ScreenLayout navChildren={LibraryNav({ onBack, backLabel, showHome: false, onSearch, onHistory, onSettings, theme, onThemeChange })}>
      <div className="plans-screen">
        <header className="study-head">
          <h1 className="study-head-title">Reading plans</h1>
          <p className="study-head-sub">Your plans stay on this phone.</p>
        </header>

        {plans.map((plan) => {
          const row = rows.find((r) => r.id === plan.id);
          if (!row) return null;
          const week = weekCells(plan, now);
          const details = open === plan.id;
          const days = details ? monthCells(plan, now.getFullYear(), now.getMonth(), now) : [];
          const lead = days.length ? days[0].weekday : 0;
          // C4: reading in print or elsewhere: the day's items ticked today (a hold on the chapters does the same).
          const markToday = () => saveRun(markDay(plan, row.day, true, new Date()));
          return (
            <section key={plan.id} className="plans-plan" aria-label={row.name}>
              <span className="today-eyebrow">{plans.length > 1 ? row.name : 'Today'}</span>
              {row.finished ? (
                <h3 className="plans-plan-title">Plan complete</h3>
              ) : row.done ? (
                <>
                  <div className="plans-done"><Check done /><h3 className="plans-plan-title">Done today</h3></div>
                  <p className="plans-plan-sub">{'Tomorrow: ' + row.tomorrow}</p>
                  <div className="plans-links">
                    {row.next ? <button type="button" className="today-link" onClick={() => onRead(row.next)}>Read ahead</button> : null}
                    {row.again ? <button type="button" className="today-link" onClick={() => onRead(row.again)}>Read again</button> : null}
                    <button type="button" className="today-link" onClick={() => saveRun(markDay(plan, row.day, false, new Date()))}>Not read yet</button>
                  </div>
                </>
              ) : (
                <>
                  <h3 className="plans-plan-title">{row.label}</h3>
                  <p className="plans-plan-sub">{'Day ' + (row.day + 1) + ' of ' + row.totalDays + (row.minutes ? ' · about ' + row.minutes + ' min' : '')}</p>
                  <div className="today-actions plans-actions">
                    <button type="button" className="today-btn" aria-label={'Read today: ' + row.label} disabled={!row.next}
                      onClick={() => { if (row.next) onRead(row.next); }}>Read</button>
                    {onListen ? (
                      <button type="button" className="today-btn" aria-label={'Listen to today: ' + row.label} disabled={!row.listen.length}
                        onClick={() => onListen(row.listen, row.name)}>Listen</button>
                    ) : null}
                  </div>
                  {row.items.length > 1 ? (
                    <Holdable className="plans-hold" onHold={markToday}>
                      <ol className="plans-items">
                        {row.items.map((it) => (
                          <li key={it.k}>
                            <button type="button" className="plans-item" aria-label={'Read ' + it.short + (it.done ? ', read' : '')}
                              onClick={() => onRead(itemRef(it.k))}>
                              <Check done={it.done} /><span className="plans-item-label">{it.short}</span>
                            </button>
                          </li>
                        ))}
                      </ol>
                      <p className="plans-items-count">{row.todayTicked + ' of ' + row.todayCount + ' today'}</p>
                    </Holdable>
                  ) : null}
                  <button type="button" className="today-link plans-mark" onClick={markToday}
                    title="Or hold the chapters for a moment">Mark today as read</button>
                </>
              )}
              <div className="plans-week" role="group" aria-label="This week">
                {week.map((d, i) => (
                  <span key={i} className="plans-day" data-state={dayState(d.state)} data-read={d.read || (d.state === 'today' && row.done) ? '1' : undefined}
                    aria-label={WEEKDAYS[i] + ' ' + d.date + (d.state === 'none' ? '' : ', ' + (d.state === 'today' ? (row.done || d.read ? 'today, read' : 'today') : d.state))}>
                    <span className="plans-weekday" aria-hidden="true">{WEEKDAYS[i]}</span>
                    <span className="plans-day-mark" aria-hidden="true" />
                  </span>
                ))}
              </div>
              {row.paused ? (
                <div className="plans-catchup">
                  <span>{plan.paused ? 'Paused since ' + shortDate(plan.paused) : 'Paused'}</span>
                  <button type="button" className="today-btn" onClick={() => saveRun(resumeRun(plan, new Date()))}>Resume</button>
                </div>
              ) : row.behind > 0 ? (
                <div className="plans-catchup">
                  <span>{row.pace}</span>
                  <button type="button" className="today-link" aria-expanded={details} onClick={() => setOpen(plan.id)}>Catch up</button>
                </div>
              ) : null}
              <div className="plans-foot">
                <span className="plans-counts">{row.counts + (row.behind > 0 || !row.pace ? '' : ' · ' + row.pace)}</span>
                <button type="button" className="today-link" aria-expanded={details} onClick={() => setOpen(details ? null : plan.id)}>Plan details</button>
              </div>
              {details ? (
                <div className="plans-details">
                  <div className="plans-month" role="group" aria-label={MONTHS[now.getMonth()]}>
                    <div className="plans-month-name">{MONTHS[now.getMonth()]}</div>
                    <div className="plans-grid">
                      {WEEKDAYS.map((w, i) => <span key={'w' + i} className="plans-weekday" aria-hidden="true">{w}</span>)}
                      {Array.from({ length: lead }, (_, i) => <span key={'b' + i} className="plans-day-blank" />)}
                      {days.map((d) => (
                        <span key={d.date} className="plans-day" data-state={dayState(d.state)} data-read={d.read ? '1' : undefined}
                          aria-label={d.date + (d.state === 'none' ? '' : ', ' + d.state)}>
                          <span className="plans-day-num">{d.date}</span>
                          <span className="plans-day-mark" aria-hidden="true" />
                        </span>
                      ))}
                    </div>
                    <p className="plans-legend"><span className="plans-key" data-state="done" />read <span className="plans-key" data-state="missed" />missed</p>
                  </div>
                  {row.behind > 0 && !row.paused ? <Behind plan={plan} row={row} now={now} /> : null}
                  {pacing === plan.id ? <PaceChoices plan={plan} now={now} onDone={() => setPacing(null)} /> : null}
                  {stopping === plan.id ? (
                    <ConfirmStrip question={'Stop ' + row.name + '? Your reading stays marked.'} yesLabel="Yes, stop"
                      onCancel={() => setStopping(null)}
                      onConfirm={() => { setStopping(null); stopRun(plan, new Date()); }} />
                  ) : (
                    <div className="plans-detail-links">
                      {row.finished ? null : (
                        <button type="button" className="today-link" aria-expanded={pacing === plan.id}
                          onClick={() => setPacing(pacing === plan.id ? null : plan.id)}>Change pace</button>
                      )}
                      {row.finished ? null : row.paused ? (
                        <button type="button" className="today-link" onClick={() => saveRun(resumeRun(plan, new Date()))}>Resume plan</button>
                      ) : (
                        <button type="button" className="today-link" onClick={() => saveRun(pauseRun(plan, new Date()))}>Pause plan</button>
                      )}
                      <button type="button" className="today-link plans-stop" aria-label={'Stop ' + row.name} onClick={() => setStopping(plan.id)}>Stop plan</button>
                    </div>
                  )}
                </div>
              ) : null}
            </section>
          );
        })}

        <h2 className="plans-eyebrow">Find a plan</h2>
        {GROUPS.map(([g, title]) => (
          <section key={g} className="plans-group" aria-label={title}>
            <h3 className="plans-group-title">{title}</h3>
            <ul className="plans-list">
              {PLAN_CATALOG.filter((p) => p.group === g).map((p) => {
                const on = running.has(p.id) && p.id !== 'collection';
                return (
                  <li key={p.id}>
                    <button type="button" className="plans-row" disabled={on} aria-label={on ? p.name + ', following' : 'Start ' + p.name}
                      aria-expanded={p.id === 'collection' ? picking : undefined}
                      onClick={() => (p.id === 'collection' ? setPicking(!picking) : start(p.id))}>
                      <GroupIcon group={g} />
                      <span className="plans-row-text">
                        <span className="plans-row-name">{p.name}</span>
                        <span className="plans-row-sub">{on ? 'Following' : p.sub}</span>
                      </span>
                      <svg className="plans-row-chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
                    </button>
                    {p.id === 'collection' && picking ? (
                      <div className="plans-pick" role="group" aria-label="Pick a collection">
                        {collections.length ? collections.map((c) => (
                          <button key={c.volKey} type="button" className="plans-chip" onClick={() => start('collection', { volKey: c.volKey })}>{c.label}</button>
                        )) : <span className="plans-note">Loading the Volumes…</span>}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        <button type="button" className="plans-row plans-build-row" onClick={() => setBuilding(1)}>
          <svg className="plans-row-icon" viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="1.3" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 8v8M8 12h8" /></svg>
          <span className="plans-row-text">
            <span className="plans-row-name">Build your own plan</span>
            <span className="plans-row-sub">Pick any books and letters</span>
          </span>
          <svg className="plans-row-chev" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M9 6l6 6-6 6" /></svg>
        </button>
        <p className="plans-note">A day ticks when you read it through or listen to the end.</p>
        <p className="plans-note" role="status">{status}</p>
      </div>
    </ScreenLayout>
  );
}
