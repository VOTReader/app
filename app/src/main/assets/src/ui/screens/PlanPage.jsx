/* ═══════════════════════════════════════════════════════════════════════
   PlanPage — a plan's own page (plans2, P2-plans-design.md 3.3 and 3.8)
   ═══════════════════════════════════════════════════════════════════════
   Mock plans-sheet-1 middle. Top to bottom:
   1. Progress: the ring and percent, "Day 12 of 365", "35 of 1,189 chapters
      read", then the plan's one status (planStatus, 2235: the same words as
      Home and the Plans list), "On track · finishes Nov 10, 2027", or
      "3 days behind · finishes Nov 14" and Catch up (read two days today,
      keep my daily amount, or finish on time).
   2. Today: the portion and the minutes left, each item with its tick (a
      tap reads it inside the plan), Start / Continue reading and Listen.
      Done today: tomorrow's portion, Read ahead (the next day's sheet),
      Write a note, Not read yet. Paused: Paused since and Resume, nothing
      else. Not started: the start date and Start today instead.
   3. This week: seven dates, filled when a day was completed, a ring on
      today, a dashed ring on a reading day that went unread (2235, Corbin
      11-16 "detect if day is missed"; muted, never red) and a faint date on
      a day the plan does not read on; "6 days in a row · 3 of 7 this week".
   4. The road: the plan's books or collections with a bar each, the current
      one first ("35 of 50"), later ones "from Nov 17", All N inline; a tap
      opens the schedule there. Plans with one section skip it.
   5. Coming up: the next three days and Whole schedule.
   Manage in the bar opens Manage plan: length and Finish by, days, the
   daily reminder (Android), this week's audio, pause or resume, start over,
   stop (2235: one tap, with Undo). Free globals: React.
   ═══════════════════════════════════════════════════════════════════════ */

import { runStatus, schedule, sections, streak, itemsLabel, itemsWords, minutesFor, itemKinds, dayItems, totalDays,
  catchUp, spreadOut, spreadPreview, changePace, changeWeekdays, pauseRun, resumeRun, markDay, startToday, firstRecutDate, canCountOwnOnly, heldDay } from '../../data/plan-engine.js';
import { planDef, bookTitle } from '../../data/plan-catalog.js';
import { saveRun, stopRun, itemRef, planStatus, finishDate } from '../../utils/plan-runs-view.js';
import { supported as reminderSupported, reminderStatus, askForReminders, openReminderSettings, isReminderTime, lastActive } from '../../utils/plan-reminder.js';
import { canTell } from '../../utils/download-gate.js';
import { OfflineCollectionAction, useOfflineAudio } from '../components/OfflineAudioControls.jsx';
import { PlanListen } from '../components/TodayCard.jsx';
import { PlanRing, PlanTick, PlanSheet, PlanSec, PlanChips, PlanDays, PlanSwitch, PlanOptRow, dayDate, monthDay, minText, countOf, paceChoices, WEEK_LETTERS, WEEK_NAMES } from '../components/PlanBits.jsx';

const REMIND_AT = '07:30';
const QUIET_ASKED = 'vot-plan-quiet-asked';

/**
 * rp-s1: a plan untouched for 7 days goes quiet (the reminder stops by itself); the page asks once per quiet stretch
 * whether to keep its reminder. @param {{ run: any }} props
 */
function QuietAsk({ run }) {
  const mark = run.id + '@' + lastActive(run);
  const [asked, setAsked] = React.useState(() => {
    try { const v = JSON.parse(localStorage.getItem(QUIET_ASKED) || '[]'); return Array.isArray(v) ? v : []; } catch (_e) { return []; }
  });
  const [status] = React.useState(() => reminderStatus());
  if (!reminderSupported() || !run.remind || !status || !Array.isArray(status.quiet) || !status.quiet.includes(run.id) || asked.includes(mark)) return null;
  const answer = (/** @type {boolean} */ keep) => {
    const next = [...asked, mark].slice(-20);
    setAsked(next);
    try { localStorage.setItem(QUIET_ASKED, JSON.stringify(next)); } catch (_e) { /* asked again next time */ }
    // Keeping it is a saved change, which wakes the reminder; Turn it off drops it.
    if (keep) saveRun({ ...run, updated: Date.now() }); else { const { remind: _off, ...rest } = run; saveRun({ ...rest, updated: Date.now() }); }
  };
  return (
    <div className="ui-card plan-quiet" role="group" aria-label="Daily reminder">
      <p className="plan-today-sub">Keep the daily reminder for this plan?</p>
      <div className="plan-links">
        <button type="button" className="plan-text-btn plan-link" onClick={() => answer(true)}>Keep it</button>
        <button type="button" className="plan-text-btn plan-link" onClick={() => answer(false)}>Turn it off</button>
      </div>
    </div>
  );
}

/** "chapters", "letters" or "readings" for a run's items. @param {any} run */
function unitWord(run) {
  const k = itemKinds(run.tracks.flatMap((/** @type {any} */ t) => t.items));
  return k.chapters && (k.letters || k.prefaces) ? 'readings' : k.chapters ? 'chapters' : 'letters';
}

/**
 * The recordings of the plan's next 7 days, saved to the phone (mw18 S6, from the old Plan details), with the
 * keep-next-7 switch. Only where downloads work. @param {{ plan: any, from: number, tracksOf: (refs: any[]) => any[] }} props
 */
function WeekAudio({ plan, from, tracksOf }) {
  const off = useOfflineAudio();
  const end = Math.min(from + 7, totalDays(plan));
  const refs = [];
  for (let d = Math.max(0, from); d < end; d++) for (const it of dayItems(plan, d)) refs.push(itemRef(it.k));
  const refKey = refs.map((r) => r.bid + ':' + r.cid).join(',');
  const tracks = React.useMemo(() => {
    const seen = new Set();
    return (off ? tracksOf(refs) : []).filter((t) => t && typeof t.url === 'string' && !seen.has(t.url) && seen.add(t.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the refs' text: a new array each render must not rebuild
  }, [off, refKey, tracksOf]);
  const urlKey = tracks.map((t) => t.url).join('\n');
  React.useEffect(() => {
    if (off && tracks.length) off.requestSizes(tracks.map((t) => t.url));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the joined urls
  }, [off, urlKey]);
  if (!off || !tracks.length) return null;
  return (
    <PlanOptRow label="Audio">
      <OfflineCollectionAction units={tracks.map((t) => [t])} label={(end - from === 1 ? 'the last day' : 'the next ' + (end - from) + ' days') + ' of your plan'}
        action={'Download this week’s audio'} savedText={'This week’s audio is on this phone'} />
      {canTell() && plan.status === 'running' ? (
        <div className="plan-opt-line">
          <span className="plan-opt-text">Keep the next 7 days on this phone (on Wi-Fi)</span>
          <PlanSwitch on={plan.autoAudio !== false} label="Keep the next 7 days on this phone (on Wi-Fi)"
            onChange={(v) => saveRun({ ...plan, autoAudio: v, updated: Date.now() })} />
        </div>
      ) : null}
    </PlanOptRow>
  );
}

/**
 * A line of facts joined by ' · ', each fact kept whole on its line when it fits (11-18: 'finishes Nov 12, / 2027'
 * broke the date off its words). Each part is an inline-block, so one wider than the line still wraps inside itself.
 * @param {{ text: string }} props
 */
function Parts({ text }) {
  return String(text).split(' · ').map((t, i) => <React.Fragment key={i}>{i ? ' · ' : null}<span className="plan-part">{t}</span></React.Fragment>);
}

/**
 * Manage plan (the bar's Manage). Stop and Start over are one tap each: the toast that follows has Undo (PlansHub).
 * @param {{ run: any, now: Date, tracksOf?: (refs: any[]) => any[], onClose: () => void, onStopped: (prev: any) => void, onStartOver?: () => void,
 *   onEdit?: () => void, onOwnOnly?: () => void }} props
 *   onEdit (2310): a custom plan's "Change what's in it" (the builder on its picks; what is read stays read)
 *   onOwnOnly (0450): "Count only this plan's reading", shown when the plan counts reads from before it began
 */
export function PlanSettings({ run, now, tracksOf, onClose, onStopped, onStartOver, onEdit, onOwnOnly }) {
  const st = runStatus(run, now);
  const def = planDef(run.plan);
  const paces = paceChoices(def, run);
  const cur = run.pace && run.pace.mode !== 'by' ? run.pace.mode + ':' + run.pace.n : '';
  const [by, setBy] = React.useState(run.pace && run.pace.mode === 'by' ? run.pace.date || '' : '');
  const [notify, setNotify] = React.useState(() => reminderStatus());
  const remindable = reminderSupported() && !st.finished;
  return (
    <PlanSheet id="plan-settings" title="Manage plan" onClose={onClose} closeLabel="Done">
      {st.finished ? null : (
        <div className="plan-opts">
          {onEdit && run.plan === 'custom' ? (
            <PlanOptRow label="Readings">
              <div className="plan-opt-line">
                <span className="plan-opt-text">{st.itemsTotal.toLocaleString('en-US') + ' in the plan · ' + st.itemsDone.toLocaleString('en-US') + ' read'}</span>
                <button type="button" className="plan-text-btn" onClick={onEdit}>Change what’s in it</button>
              </div>
            </PlanOptRow>
          ) : null}
          <PlanOptRow label="Length">
            <PlanChips label="Length" value={cur} options={paces}
              onChange={(id) => { const p = paces.find((x) => x.id === id); if (p) saveRun(changePace(run, { mode: p.mode, n: p.n }, new Date())); }} />
            <div className="plan-opt-line">
              <span className="plan-opt-text">Finish by</span>
              <input type="date" className="plan-date" aria-label="Finish by" value={by} min={firstRecutDate(run, now)} onChange={(e) => setBy(e.target.value)} />
              <button type="button" className="plan-text-btn" disabled={!by} onClick={() => saveRun(changePace(run, { mode: 'by', date: by }, new Date()))}>Set</button>
            </div>
            <p className="plan-opt-note">{'Finishes ' + finishDate(st.projected, new Date()) + ' · what you have read stays read'}</p>
          </PlanOptRow>
          <PlanOptRow label="Days">
            <PlanDays value={Array.isArray(run.weekdays) && run.weekdays.length === 7 ? run.weekdays : [true, true, true, true, true, true, true]}
              onChange={(v) => saveRun(changeWeekdays(run, v, new Date()))} />
          </PlanOptRow>
          {remindable ? (
            <PlanOptRow label="Remind me">
              <input type="time" className="plan-time" aria-label="Reminder time" value={run.remind || REMIND_AT}
                onChange={(e) => { if (isReminderTime(e.target.value)) saveRun({ ...run, remind: e.target.value, updated: Date.now() }); }} />
              <PlanSwitch on={!!run.remind} label="Remind me each day" onChange={(v) => {
                if (v) { saveRun({ ...run, remind: run.remind || REMIND_AT, updated: Date.now() }); askForReminders(() => setNotify(reminderStatus())); }
                else { const { remind: _off, ...rest } = run; saveRun({ ...rest, updated: Date.now() }); }
              }} />
              {run.remind && notify && !notify.allowed ? (
                <p className="plan-opt-note">{'Notifications are off for this app, so the reminder can’t show. '}
                  <button type="button" className="plan-text-btn" onClick={() => openReminderSettings()}>Open settings</button></p>
              ) : null}
            </PlanOptRow>
          ) : null}
          {tracksOf ? <WeekAudio plan={run} from={st.day} tracksOf={tracksOf} /> : null}
          {/* 0450: what the tap does is said before it (hub: it starts again, keeps the plan's own reading, gives up being ahead) */}
          {onOwnOnly && canCountOwnOnly(run) ? (
            <PlanOptRow label="Read before">
              <p className="plan-opt-text plan-own-only-text">{countOf(run.credited, unitWord(run).replace(/s$/, '')) + ' you had read before this plan began count toward it.'}</p>
              <button type="button" className="ui-btn plan-own-only-btn" onClick={onOwnOnly}>Count only this plan’s reading</button>
              <p className="plan-opt-note">Starts the plan again from today. What you read for it stays ticked; you give up the days the earlier reading put you ahead.</p>
            </PlanOptRow>
          ) : null}
        </div>
      )}
      <div className="plan-sheet-actions">
        {st.finished ? null : st.paused
          ? <button type="button" className="ui-btn is-primary" onClick={() => saveRun(resumeRun(run, new Date()))}>Resume plan</button>
          : <button type="button" className="ui-btn" onClick={() => saveRun(pauseRun(run, new Date()))}>Pause plan</button>}
        {onStartOver ? <button type="button" className="ui-btn" onClick={onStartOver}>Start over</button> : null}
        <button type="button" className="ui-btn plan-stop-btn" onClick={() => { const prev = run; stopRun(run, new Date()); onStopped(prev); }}>Stop plan</button>
      </div>
      <p className="plan-opt-note">Your reading stays marked whatever you choose here.</p>
    </PlanSheet>
  );
}

/**
 * Catch up, when the plan is behind (2235): the status in the same words, then three ways forward in plain words:
 * read one more day's portion today, keep the daily amount (the finish moves), or finish on time (more each day).
 * @param {{ run: any, now: Date, onClose: () => void, onReadTwo: (day: number, span: number) => void }} props
 */
function CatchUpSheet({ run, now, onClose, onReadTwo }) {
  const st = runStatus(run, now);
  const spread = spreadPreview(run, now);
  // Today's portion and the next day's, or (today's already read) the next day's alone.
  const two = st.doneToday ? dayItems(run, st.day) : dayItems(run, st.day).concat(st.day + 1 < st.total ? dayItems(run, st.day + 1) : []);
  const canTwo = !st.finished && (st.doneToday ? two.length > 0 : st.day + 1 < st.total);
  return (
    <PlanSheet id="plan-adjust" title="Catch up" onClose={onClose}>
      <p className="plan-sheet-sub">{planStatus(run, now, st).text}</p>
      <ul className="root-list plan-choices">
        {canTwo ? (
          <li>
            <button type="button" className="root-row" onClick={() => { onClose(); onReadTwo(st.day, st.doneToday ? 1 : 2); }}>
              <span className="root-row-text">
                <span className="root-row-title">{st.doneToday ? 'Read one more day today' : 'Read two days today'}</span>
                <span className="root-row-sub"><Parts text={itemsLabel(two, bookTitle) + ' · about ' + minText(minutesFor(itemsWords(two))) + ' · one day closer'} /></span>
              </span>
            </button>
          </li>
        ) : null}
        <li>
          <button type="button" className="root-row" onClick={() => { saveRun(catchUp(run, new Date())); onClose(); }}>
            <span className="root-row-text">
              <span className="root-row-title">Keep my daily amount</span>
              <span className="root-row-sub"><Parts text={'Same reading each day · still finishes ' + finishDate(st.projected, new Date())} /></span>
            </span>
          </button>
        </li>
        {spread ? (
          <li>
            <button type="button" className="root-row" onClick={() => { saveRun(spreadOut(run, new Date())); onClose(); }}>
              <span className="root-row-text">
                <span className="root-row-title">Finish on time</span>
                <span className="root-row-sub"><Parts text={'About ' + minText(spread.minutes) + ' a day from now · finishes ' + finishDate(run.target, new Date())} /></span>
              </span>
            </button>
          </li>
        ) : null}
      </ul>
    </PlanSheet>
  );
}

/**
 * @param {{ run: any, now: Date, settingsOpen: boolean, onSettings: (open: boolean) => void, catchUpAtOpen?: boolean, onStartOver?: () => void,
 *   onRead: (day: number, k?: string, span?: number) => void, onListen?: (refs: any[], name: string) => void, tracksOf?: (refs: any[]) => any[],
 *   onSchedule: (at?: number) => void, onDaySheet: (day: number) => void, onNote?: (day: number) => void, noteOf?: (day: number) => string | null,
 *   onStopped: (prev: any) => void, name: string, onEdit?: () => void, onOwnOnly?: () => void }} props
 *   catchUpAtOpen: open on Catch up (Home's and the list's "N days behind")
 */
export function PlanPage({ run, now, settingsOpen, onSettings, catchUpAtOpen = false, onStartOver, onRead, onListen, tracksOf, onSchedule, onDaySheet, onNote, noteOf, onStopped, name, onEdit, onOwnOnly }) {
  const st = runStatus(run, now);
  const status = planStatus(run, now, st);
  const [adjust, setAdjust] = React.useState(() => catchUpAtOpen && status.key === 'behind');
  const [allRoad, setAllRoad] = React.useState(false);
  const days = schedule(run, now, bookTitle);
  const ticks = run.ticks || {};
  const unit = unitWord(run);
  const today = st.todayItems;
  const left = today.filter((it) => !(it.k in ticks));
  const leftMin = left.length ? minutesFor(itemsWords(left)) : 0;
  const week = streak(run, now);
  const road = sections(run, bookTitle);
  const curSec = road.findIndex((s) => s.done < s.count);
  const roadShown = allRoad ? road : road.slice(Math.max(0, curSec), Math.max(0, curSec) + 3);
  // The day the Today card shows (today's portion, tomorrow's once done, the first day not yet counted before the start) is not repeated here.
  const coming = days.filter((d) => !d.done && d.day > st.day).slice(0, 3);
  const listenRefs = left.map((it) => itemRef(it.k));
  const prevDay = st.doneToday ? st.lastDay : -1;   // the day just read (empty days of a spread-out plan are never read)
  const roadNoun = road.length && road.every((s) => s.key.startsWith('b:')) ? 'books' : 'parts';

  let todayCard;
  if (st.paused) {
    todayCard = (
      <div className="ui-card plan-today plan-today-paused">
        <p className="plan-today-head"><span className="root-eyebrow">Paused</span></p>
        <p className="plan-today-title">{run.paused ? 'Paused since ' + monthDay(run.paused) : 'Paused'}</p>
        <p className="plan-today-sub">{'Day ' + (heldDay(run, st) + 1) + ' is waiting for you · ' + itemsLabel(today, bookTitle)}</p>
        <button type="button" className="ui-btn is-primary" onClick={() => saveRun(resumeRun(run, new Date()))}>Resume</button>
      </div>
    );
  } else if (st.notStarted) {
    todayCard = (
      <div className="ui-card plan-today">
        <p className="plan-today-head"><span className="root-eyebrow">{'Starts ' + dayDate(run.start)}</span></p>
        <p className="plan-today-title">{itemsLabel(today, bookTitle)}</p>
        <p className="plan-today-sub">{'Day ' + (st.day + 1) + ' · about ' + minText(minutesFor(itemsWords(today)))}</p>
        <button type="button" className="plan-text-btn plan-link" onClick={() => saveRun(startToday(run, new Date()))}>Start today instead</button>
      </div>
    );
  } else if (st.doneToday) {
    todayCard = (
      <div className="ui-card plan-today plan-today-done">
        <p className="plan-today-head"><PlanTick on /><span className="plan-today-title">Done today</span></p>
        {today.length ? <p className="plan-today-sub">{(st.spreadOn ? dayDate(st.spreadOn) : 'Tomorrow') + ' · ' + itemsLabel(today, bookTitle) + ' · ' + minText(minutesFor(itemsWords(today)))}</p> : null}
        <div className="plan-links">
          {today.length ? <button type="button" className="plan-text-btn plan-link" onClick={() => onDaySheet(st.day)}>Read ahead</button> : null}
          {onNote ? <button type="button" className="plan-text-btn plan-link" onClick={() => onNote(prevDay)}>{noteOf && noteOf(prevDay) ? 'Your note' : 'Write a note'}</button> : null}
          {prevDay >= 0 ? <button type="button" className="plan-text-btn plan-link" onClick={() => saveRun(markDay(run, prevDay, false, new Date()))}>Not read yet</button> : null}
        </div>
      </div>
    );
  } else if (st.spreadOn && !st.finished) {
    // A spread-out plan's empty day: nothing is due today; the next reading keeps its day.
    todayCard = (
      <div className="ui-card plan-today plan-today-done">
        <p className="plan-today-head"><span className="plan-today-title">Nothing to read today</span></p>
        <p className="plan-today-sub">{dayDate(st.spreadOn) + ' · ' + itemsLabel(today, bookTitle) + ' · ' + minText(minutesFor(itemsWords(today)))}</p>
        <div className="plan-links">
          <button type="button" className="plan-text-btn plan-link" onClick={() => onDaySheet(st.day)}>Read ahead</button>
        </div>
      </div>
    );
  } else if (!st.finished) {
    todayCard = (
      <div className="ui-card plan-today">
        <p className="plan-today-head">
          <span className="root-eyebrow">{'Today · ' + itemsLabel(today, bookTitle)}</span>
          <span className="plan-today-left">{left.length ? minText(leftMin) + ' left' : ''}</span>
        </p>
        <ul className="plan-items" aria-label="Today">
          {today.map((it) => (
            <li key={it.k}>
              <button type="button" className="plan-item-row" onClick={() => onRead(st.day, it.k)}
                aria-label={'Read ' + itemsLabel([it], bookTitle) + (it.k in ticks ? ', read' : '')}>
                <PlanTick on={it.k in ticks} />
                <span className="plan-item-name">{itemsLabel([it], bookTitle)}</span>
                <span className="plan-item-meta">{it.k in ticks ? 'read' : minText((Number(it.w) || 0) / 200)}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="plan-actions">
          <button type="button" className="ui-btn is-primary" onClick={() => onRead(st.day)}>{st.todayTicked ? 'Continue reading' : 'Start reading'}</button>
          {onListen && listenRefs.length ? (
            <PlanListen refs={listenRefs} tracksOf={tracksOf} label={'Listen to today: ' + itemsLabel(left, bookTitle)}
              onListen={() => onListen(listenRefs, name)} />
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="root-screen plans-hub plan-page">
      <div className="ui-card plan-progress">
        <PlanRing percent={st.percent} size="big" />
        <div className="plan-progress-text">
          <p className="plan-progress-day">{st.notStarted ? countOf(st.total, 'day') : 'Day ' + Math.min(st.total, st.todayDay + 1) + ' of ' + st.total.toLocaleString('en-US')}</p>
          <p className="plan-progress-line">{st.itemsDone.toLocaleString('en-US') + ' of ' + st.itemsTotal.toLocaleString('en-US') + ' ' + unit + ' read'}</p>
          {/* 2235: the plan's one status, the same words as Home and the Plans list; behind leads to Catch up. */}
          <p className="plan-progress-line plan-status" data-status={status.key}>
            <b><Parts text={status.text} /></b>
            {status.key === 'behind' ? null : <>{' · '}<span className="plan-part">{(st.paused ? 'planned to finish ' : 'finishes ') + finishDate(st.projected, now)}</span></>}
          </p>
          {status.key === 'behind' ? (
            <button type="button" className="ui-btn is-small plan-catchup-btn" onClick={() => setAdjust(true)}>Catch up</button>
          ) : null}
        </div>
      </div>

      {todayCard}
      <QuietAsk run={run} />

      {st.paused ? null : (
        <div className="ui-card plan-week" role="group" aria-label="This week">
          <div className="plan-week-days">
            {week.week.map((d, i) => (
              <span key={d.date} className="plan-week-day" role="img"
                aria-label={WEEK_NAMES[i] + ' ' + d.n + (d.today ? ', today' : '') + (d.done ? ', read' : d.missed ? ', missed' : d.off ? ', no reading' : '')}>
                <span className="plan-week-letter" aria-hidden="true">{WEEK_LETTERS[i]}</span>
                <span className="plan-week-mark" data-done={d.done ? '1' : undefined} data-today={d.today ? '1' : undefined}
                  data-missed={d.missed ? '1' : undefined} data-off={d.off ? '1' : undefined} aria-hidden="true">{d.n}</span>
              </span>
            ))}
          </div>
          <p className="plan-week-line">{[week.inRow >= 2 ? week.inRow + ' days in a row' : '', week.weekDone + ' of ' + week.weekDays + ' this week',
            week.week.some((d) => d.missed) ? 'dashed: missed' : ''].filter(Boolean).join(' · ')}</p>
        </div>
      )}

      {road.length > 1 ? (
        <>
          <PlanSec title="The road" link={allRoad ? 'Fewer' : 'All ' + road.length + ' ' + roadNoun} onLink={() => setAllRoad(!allRoad)} />
          <ul className="root-list plan-road" aria-label="The road">
            {roadShown.map((s) => {
              const from = days[s.firstDay];
              const cur = s.done > 0 && s.done < s.count;
              return (
                <li key={s.key}>
                  <button type="button" className={'root-row plan-road-row' + (cur ? ' is-current' : '')} onClick={() => onSchedule(s.firstDay)}
                    aria-label={s.name + ': ' + s.done + ' of ' + s.count + ' read'}>
                    <span className="plan-road-name">{s.name}</span>
                    <span className="plan-road-bar" aria-hidden="true"><span style={{ width: Math.round(100 * s.done / Math.max(1, s.count)) + '%' }} /></span>
                    <span className="plan-road-meta">{s.done >= s.count ? 'Read' : s.done > 0 || !from || from.done ? s.done + ' of ' + s.count : 'from ' + monthDay(from.date)}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      ) : null}

      {coming.length && !st.paused ? (
        <>
          <PlanSec title="Coming up" link="Whole schedule" onLink={() => onSchedule()} />
          <ol className="root-list plan-days-list" aria-label="Coming up">
            {coming.map((d) => (
              <li key={d.day}>
                <button type="button" className="plan-day-row plan-day-btn" onClick={() => onDaySheet(d.day)}>
                  <span className="plan-day-when"><span className="plan-day-n">{'Day ' + (d.day + 1)}</span><span className="plan-day-date">{dayDate(d.date)}</span></span>
                  <span className="plan-day-portion">{itemsLabel(d.items, bookTitle)}</span>
                  <span className="plan-day-min">{minText(d.minutes)}</span>
                </button>
              </li>
            ))}
          </ol>
        </>
      ) : null}

      {adjust && !st.finished ? <CatchUpSheet run={run} now={now} onClose={() => setAdjust(false)} onReadTwo={(day, span) => onRead(day, undefined, span)} /> : null}
      {settingsOpen ? <PlanSettings run={run} now={now} tracksOf={tracksOf} onClose={() => onSettings(false)} onStartOver={onStartOver} onEdit={onEdit} onOwnOnly={onOwnOnly}
        onStopped={(prev) => { onSettings(false); onStopped(prev); }} /> : null}
    </div>
  );
}
