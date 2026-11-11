/* ═══════════════════════════════════════════════════════════════════════
   PlanPreview — a plan before it starts (plans2, P2-plans-design.md 3.2)
   ═══════════════════════════════════════════════════════════════════════
   Mock plans-sheet-1 left. The group, the name and two sentences; three
   facts (minutes a day, days, chapters or letters); Your first week (the
   first three days still to read, with Whole schedule); Make it yours
   (Start: Today / Tomorrow / Pick a day, and Where I am for a letters plan
   partway read, saying what it skips; Length; the seven Days; Remind me on
   the Android app only; Already read "Count my N" when the reader has read
   some of it); one START PLAN with the finish under it. Starting is a
   decision: nothing starts until START PLAN.
   The facts, the first week and the finish are read off a draft run built
   from the choices, so what the page says is what the plan will do.
   Free globals: React.
   ═══════════════════════════════════════════════════════════════════════ */

import { startCatalogPlan, catalogResume, planDef, PLAN_GROUPS, LETTER_CHAIN, runFacts, bookTitle } from '../../data/plan-catalog.js';
import { schedule, itemsLabel, itemKinds, readCount, todayKey, dayNum, dateOf } from '../../data/plan-engine.js';
import { letterSource, saveRun, shortDate } from '../../utils/plan-runs-view.js';
import { supported as reminderSupported, askForReminders, isReminderTime } from '../../utils/plan-reminder.js';
import { PlanSec, PlanChips, PlanDays, PlanSwitch, PlanOptRow, dayDate, minText, countOf, clockTime, paceChoices } from '../components/PlanBits.jsx';

const ALL_WEEK = [true, true, true, true, true, true, true];
const REMIND_AT = '07:30';

/** The words for a plan's items in the third fact: "chapters", "letters", "readings". @param {any[]} items */
function itemsUnit(items) {
  const k = itemKinds(items);
  const n = k.chapters + k.letters + k.prefaces;
  if (k.chapters && (k.letters || k.prefaces)) return { n, unit: n === 1 ? 'reading' : 'readings' };
  if (k.chapters) return { n, unit: n === 1 ? 'chapter' : 'chapters' };
  return { n: k.letters || n, unit: (k.letters || n) === 1 ? 'letter' : 'letters' };
}

/**
 * The run the choices would start (null while its items are not loaded).
 * @param {string} planId @param {any} choice @param {(bid: string, cid: any) => boolean} isRead @param {Date} now
 */
export function draftRun(planId, choice, isRead, now) {
  const src = letterSource();
  const opt = /** @type {any} */ ({ volKey: choice.volKey, weekdays: choice.weekdays, pace: choice.pace || undefined });
  const today = /** @type {number} */ (dayNum(todayKey(now)));
  if (choice.start === 'tomorrow') opt.startOn = dateOf(today + 1);
  else if (choice.start === 'pick' && choice.on && (dayNum(choice.on) ?? 0) > today) opt.startOn = choice.on;
  if (choice.start === 'where' && choice.from) opt.from = choice.from;
  if (choice.credit) opt.credit = isRead;
  return startCatalogPlan(planId, src, now, opt);
}

/**
 * @param {{ planId: string, opt?: any, now: Date, lettersReady: boolean, isRead: (bid: string, cid: any) => boolean,
 *   onStarted: (runId: string) => void, onSchedule: (preview: any) => void }} props
 */
export function PlanPreview({ planId, opt, now, lettersReady, isRead, onStarted, onSchedule }) {
  const def = planDef(planId);
  const paces = React.useMemo(() => paceChoices(def, null), [def]);
  const defPace = def ? def.pace.mode + ':' + def.pace.n : '';
  const [choice, setChoice] = React.useState(() => ({
    start: 'today', on: '', from: '', volKey: (opt && opt.volKey) || 'one',
    paceId: defPace, weekdays: (def && def.weekdays) || ALL_WEEK, remind: reminderSupported(), at: REMIND_AT, credit: true,
  }));
  const [status, setStatus] = React.useState('');
  const set = (/** @type {any} */ patch) => setChoice((c) => ({ ...c, ...patch }));
  const pace = paces.find((p) => p.id === choice.paceId) || null;
  const src = lettersReady ? letterSource() : null;
  const tracks = React.useMemo(() => (def ? def.tracks(src, { volKey: choice.volKey }) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- src is rebuilt each render; lettersReady is what changes it
    [def, lettersReady, choice.volKey]);
  const read = React.useMemo(() => readCount(tracks, isRead), [tracks, isRead]);
  const resume = React.useMemo(() => (def && def.letters && src ? catalogResume(planId, src, isRead, { volKey: choice.volKey }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- as above
    [planId, lettersReady, choice.volKey, isRead]);
  const spec = { ...choice, pace: pace ? { mode: pace.mode, n: pace.n } : null, from: resume ? resume.k : '', credit: choice.credit && read > 0 && choice.start !== 'where' };
  const draft = React.useMemo(() => draftRun(planId, spec, isRead, now),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the choices, read as one key
    [planId, JSON.stringify(spec), lettersReady, now]);
  if (!def) return null;
  const group = (PLAN_GROUPS.find(([g]) => g === def.group) || [])[1] || '';
  const items = draft ? draft.tracks.flatMap((t) => t.items) : [];
  const facts = draft ? runFacts(draft) : null;
  const unit = itemsUnit(items);
  const first = draft ? schedule(draft, now, bookTitle).filter((d) => !d.done).slice(0, 3) : [];
  const collections = def.id === 'collection' && src ? LETTER_CHAIN.map((k) => src.colByKey.get(k)).filter((c) => c && c.letterScreen) : [];
  const startOpts = [{ id: 'today', label: 'Today' }, { id: 'tomorrow', label: 'Tomorrow' }, { id: 'pick', label: 'Pick a day' }];
  if (resume) startOpts.push({ id: 'where', label: 'Where I am' });
  const start = () => {
    const run = draftRun(planId, spec, isRead, new Date());
    if (!run) { setStatus('Loading the Volumes… try again in a moment.'); return; }
    if (choice.remind && reminderSupported() && isReminderTime(choice.at)) {
      run.remind = choice.at;
      askForReminders(() => {});
    }
    saveRun(run);
    onStarted(run.id);
  };
  const unitWord = unit.unit === 'chapter' || unit.unit === 'chapters' ? 'chapters' : unit.unit === 'readings' || unit.unit === 'reading' ? 'readings' : 'letters';
  return (
    <div className="root-screen plans-hub plan-preview">
      <p className="root-eyebrow plan-eyebrow">{group}</p>
      <h2 className="plan-hero-name">{def.id === 'collection' && draft && draft.name ? draft.name : def.name}</h2>
      <p className="plan-about">{def.about}</p>

      {collections.length ? (
        <PlanChips label="Collection" value={choice.volKey} onChange={(v) => set({ volKey: v, start: 'today' })}
          options={collections.map((c) => ({ id: c.volKey, label: c.short || c.label }))} />
      ) : null}

      {facts ? (
        <div className="plan-facts" role="list" aria-label="This plan">
          <div className="plan-fact" role="listitem"><b>{minText(facts.minutes)}</b><span>a day</span></div>
          <div className="plan-fact" role="listitem"><b>{facts.days.toLocaleString('en-US')}</b><span>{facts.days === 1 ? 'day' : 'days'}</span></div>
          <div className="plan-fact" role="listitem"><b>{unit.n.toLocaleString('en-US')}</b><span>{unit.unit}</span></div>
        </div>
      ) : (
        <p className="plan-loading" role="status">Loading the Volumes…</p>
      )}

      {first.length ? (
        <>
          <PlanSec title="Your first week" link="Whole schedule" onLink={() => onSchedule({ planId, spec })} />
          <ol className="root-list plan-days-list" aria-label="Your first week">
            {first.map((d) => (
              <li key={d.day} className="plan-day-row">
                <span className="plan-day-when"><span className="plan-day-n">{'Day ' + (d.day + 1)}</span><span className="plan-day-date">{dayDate(d.date)}</span></span>
                <span className="plan-day-portion">{itemsLabel(d.items, bookTitle)}</span>
                <span className="plan-day-min">{minText(d.minutes)}</span>
              </li>
            ))}
          </ol>
        </>
      ) : null}

      <PlanSec title="Make it yours" />
      <div className="ui-card plan-opts">
        <PlanOptRow label="Start">
          <PlanChips label="Start" value={choice.start} options={startOpts} onChange={(v) => set({ start: v })} />
          {choice.start === 'pick' ? (
            <input type="date" className="plan-date" aria-label="Start on" value={choice.on}
              min={dateOf(/** @type {number} */ (dayNum(todayKey(now))) + 1)} onChange={(e) => set({ on: e.target.value })} />
          ) : null}
          {choice.start === 'where' && resume ? (
            <p className="plan-opt-note">{'Starts at ' + resume.t + ' · skips ' + countOf(resume.skipped, 'earlier reading')}</p>
          ) : null}
        </PlanOptRow>
        {paces.length > 1 ? (
          <PlanOptRow label="Length">
            <PlanChips label="Length" value={choice.paceId} options={paces} onChange={(v) => set({ paceId: v })} />
          </PlanOptRow>
        ) : null}
        <PlanOptRow label="Days">
          <PlanDays value={choice.weekdays} onChange={(v) => set({ weekdays: v })} />
        </PlanOptRow>
        {reminderSupported() ? (
          <PlanOptRow label="Remind me">
            <input type="time" className="plan-time" aria-label="Reminder time" value={choice.at}
              onChange={(e) => { if (isReminderTime(e.target.value)) set({ at: e.target.value }); }} />
            <span className="plan-time-text" aria-hidden="true">{clockTime(choice.at)}</span>
            <PlanSwitch on={choice.remind} label="Remind me each day" onChange={(v) => set({ remind: v })} />
          </PlanOptRow>
        ) : null}
        {read > 0 && choice.start !== 'where' ? (
          <PlanOptRow label="Already read">
            <span className="plan-opt-text">{'Count my ' + countOf(read, unitWord === 'chapters' ? 'chapter' : unitWord === 'letters' ? 'letter' : 'reading')}</span>
            <PlanSwitch on={choice.credit} label={'Count my ' + read + ' read already'} onChange={(v) => set({ credit: v })} />
          </PlanOptRow>
        ) : null}
      </div>

      <div className="plan-start">
        <button type="button" className="ui-btn is-primary is-wide" disabled={!draft} onClick={start}>Start plan</button>
        {draft ? <p className="plan-start-note">{'Finishes ' + shortDate(draft.target) + ' · you can change any of this later'}</p> : null}
        <p className="plan-start-note" role="status">{status}</p>
      </div>
    </div>
  );
}
