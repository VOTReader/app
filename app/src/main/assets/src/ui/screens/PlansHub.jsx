/* ═══════════════════════════════════════════════════════════════════════
   PlansHub — the 'reading-plans' screen: Reading plans as a place (plans2)
   ═══════════════════════════════════════════════════════════════════════
   One app screen holding a small stack of views (utils/plan-nav.js): the
   list, a plan's preview, the plan's own page, its whole schedule, a
   finished plan, the builder. Back pops a view; at the list it leaves.
   The top bar is back, the view's title and at most the plan's gear (U
   rule 11): the app-wide Settings gear, History and theme stay off here so
   a plan page never shows two gears. Each view gets a fresh scroll (the
   layout is keyed by the view), so nothing here writes scrollTop.
   The reading session itself (the reader's strip and end panel) is started
   through `onStartSession`, which screen-routes owns.
   Free globals: React, ScreenLayout, LibraryNav.
   ═══════════════════════════════════════════════════════════════════════ */

import { usePlanNav, planNavMounted, keepPlanNav, pushPlanView, replacePlanView, popPlanView, planNavToList } from '../../utils/plan-nav.js';
import { endPlanSession } from '../../utils/plan-session.js';
import { usePlanRuns, saveRun, shortDate } from '../../utils/plan-runs-view.js';
import { runStatus, newRun, dayNum, itemKinds, againPace } from '../../data/plan-engine.js';
import { runName, planDef } from '../../data/plan-catalog.js';
import { useVolumesSeq, useNow } from '../components/TodayCard.jsx';
import { PlanBarTitle, GEAR, countOf } from '../components/PlanBits.jsx';
import { ReadingPlansScreen } from './ReadingPlansScreen.jsx';
import { PlanPreview, draftRun } from './PlanPreview.jsx';
import { PlanPage } from './PlanPage.jsx';
import { PlanSchedule, DaySheet } from './PlanSchedule.jsx';
import { PlanBuilder } from './PlanBuilder.jsx';

const _store = () => { const s = /** @type {any} */ (globalThis).ReadingPlanStore; return s && typeof s.get === 'function' ? s : null; };

/** A day's note (run.notes[day] = a Journal entry id) when the entry still exists. @param {any} run @param {number} day */
export function planNoteOf(run, day) {
  const id = run && run.notes && run.notes[String(day)];
  const journal = /** @type {any} */ (globalThis).JournalStore;
  return id && journal && typeof journal.get === 'function' && journal.get(id) ? id : null;
}

/**
 * Write a note for a plan day (S5): opens the day's note if it has one, else a new Journal entry titled with the
 * plan and the day, kept on the run. The editor's Back returns to Reading plans ('journalPlanReturn').
 * @param {any} run @param {number} day @param {(entryId: string) => void} openEditor
 */
export function writePlanNote(run, day, openEditor) {
  const journal = /** @type {any} */ (globalThis).JournalStore;
  if (!run || !journal || typeof journal.add !== 'function') return;
  const g = /** @type {any} */ (globalThis);
  const back = (/** @type {string} */ entryId) => { keepPlanNav(); if (g.navHandoff && typeof g.navHandoff.set === 'function') g.navHandoff.set('journalPlanReturn', entryId); };
  const have = planNoteOf(run, day);
  if (have) { back(have); openEditor(have); return; }
  const health = g.StorageHealth;
  if (health && typeof health.checkFirstDataCreation === 'function' && health.checkFirstDataCreation().shouldBlock) return;
  const e = journal.add({ title: runName(run, null) + ' · Day ' + (day + 1) });
  if (!e || !e.id) return;
  // The editor records a new entry's stats on its first save (the key useJournalMutations sets).
  try { localStorage.setItem('vot-journal-new-entry-stats', e.id); } catch (_e) { /* best-effort */ }
  saveRun({ ...run, notes: { ...(run.notes || {}), [String(day)]: e.id }, updated: Date.now() });
  back(e.id);
  openEditor(e.id);
}

/**
 * A finished plan's page (3.7): kept for good; opening it marks it seen (the Read tab's "You finished" row goes).
 * @param {{ run: any, onFind: () => void, onAgain: () => void, onDone: () => void }} props
 */
function PlanFinished({ run, onFind, onAgain, onDone }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- once per finished run opened; the save itself changes `run`
  React.useEffect(() => { if (!run.seen) saveRun({ ...run, seen: true }); }, [run.id]);
  const a = dayNum(run.start), b = dayNum(run.finished);
  const days = a != null && b != null ? b - a + 1 : 0;
  const k = itemKinds(run.tracks.flatMap((/** @type {any} */ t) => t.items));
  const parts = [k.chapters ? countOf(k.chapters, 'chapter') : '', k.letters ? countOf(k.letters, 'letter') : ''].filter(Boolean);
  return (
    <div className="root-screen plans-hub plan-finished">
      <span className="plan-daydone-tick" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M6 12.5l4 4L18 8" /></svg></span>
      <h2 className="plan-daydone-title">{'You finished ' + runName(run, null)}</h2>
      <p className="plan-daydone-sub">{'Started ' + shortDate(run.start) + ' · finished ' + shortDate(run.finished)}</p>
      <div className="plan-facts">
        <div className="plan-fact"><b>{days.toLocaleString('en-US')}</b><span>{days === 1 ? 'day' : 'days'}</span></div>
        {parts.map((p) => { const [n, ...w] = p.split(' '); return <div key={p} className="plan-fact"><b>{n}</b><span>{w.join(' ')}</span></div>; })}
      </div>
      <button type="button" className="ui-btn is-primary is-wide" onClick={onFind}>Find the next plan</button>
      <button type="button" className="ui-btn is-wide" onClick={onAgain}>Run it again</button>
      <div className="plan-links plan-links-center"><button type="button" className="plan-text-btn plan-link" onClick={onDone}>Done</button></div>
    </div>
  );
}

/**
 * @param {{ readingPlans?: any, isRead: (bid: string, cid: any) => boolean, onPlansMoved?: (left: any[]) => void,
 *   onBack: () => void, backLabel?: string, onSearch?: () => void, onListen?: (refs: any[], name: string) => void,
 *   planTracks?: (refs: any[]) => any[], onNote?: (entryId: string) => void,
 *   onStartSession: (runId: string, day: number, k?: string) => void }} props
 */
export function PlansHub({ readingPlans, isRead, onPlansMoved, onBack, backLabel = 'Library', onSearch, onListen, planTracks, onNote, onStartSession }) {
  // Before the first read of the stack: an entry from outside starts at the list; a session or a note coming back keeps it.
  React.useState(() => { planNavMounted(); endPlanSession(); return 0; });
  const stack = usePlanNav();
  const top = stack[stack.length - 1];
  const runs = usePlanRuns({ legacy: readingPlans, isRead, onLegacyMoved: onPlansMoved });
  const lettersReady = useVolumesSeq(true).length > 0;
  const now = useNow();
  const [settings, setSettings] = React.useState(false);
  const [findFocus, setFindFocus] = React.useState(0);
  const [daySheet, setDaySheet] = React.useState(/** @type {number | null} */ (top && top.v === 'plan' && typeof /** @type {any} */ (top).sheet === 'number' ? /** @type {any} */ (top).sheet : null));
  const [buildStep, setBuildStep] = React.useState(/** @type {1 | 2} */ (1));
  const started = React.useRef(/** @type {string | null} */ (null));
  React.useEffect(() => { setSettings(false); setDaySheet(top && top.v === 'plan' && typeof /** @type {any} */ (top).sheet === 'number' ? /** @type {any} */ (top).sheet : null); }, [top]);
  // The phone's Back (and Escape) pops a view before it leaves Reading plans: the screen's own back level
  // (window.__screenBack, as Notes' notebooks do; a sheet open on top is the modal registry's and closes first).
  // The builder holds its own steps.
  React.useEffect(() => {
    if (stack.length <= 1 || (top && top.v === 'build')) return undefined;
    const fn = () => popPlanView();
    window.__screenBack = fn;
    return () => { if (window.__screenBack === fn) window.__screenBack = null; };
  }, [stack.length, top]);
  const store = _store();
  /** @type {any[]} */
  const finished = (store && typeof store.all === 'function' ? store.all() : [])
    .filter((/** @type {any} */ r) => r.status === 'finished' && r.finished)
    .sort((/** @type {any} */ a, /** @type {any} */ b) => (a.finished < b.finished ? 1 : a.finished > b.finished ? -1 : 0));
  const runOf = (/** @type {string} */ id) => (store ? store.get(id) : null);
  const back = () => { if (!popPlanView()) onBack(); };
  /** @param {any} run @param {number} day @param {string} [k] */
  const readDay = (run, day, k) => onStartSession(run.id, day, k);
  const note = onNote ? (/** @type {any} */ run, /** @type {number} */ day) => writePlanNote(run, day, onNote) : null;

  let title = 'Reading plans';
  let gear = false;
  let body = null;
  const v = /** @type {any} */ (top || { v: 'list' });
  const run = v.id ? runOf(v.id) : null;
  if ((v.v === 'plan' || v.v === 'schedule' || v.v === 'finished') && !run) {
    body = null;   // a run stopped or removed meanwhile: the effect below goes back to the list
  } else if (v.v === 'preview') {
    body = <PlanPreview key={v.plan + (v.opt ? ':' + v.opt.volKey : '')} planId={v.plan} opt={v.opt} now={now} lettersReady={lettersReady} isRead={isRead}
      onStarted={(id) => replacePlanView({ v: 'plan', id })} onSchedule={(preview) => pushPlanView({ v: 'schedule', id: '', preview })} />;
  } else if (v.v === 'schedule' && v.preview) {
    const draft = draftRun(v.preview.planId, v.preview.spec, isRead, now);
    title = (draft ? runName(draft, null) : 'Reading plans') + ' · Schedule';
    body = draft ? <PlanSchedule run={draft} now={now} preview onRead={() => {}} /> : null;
  } else if (v.v === 'schedule' && run) {
    title = runName(run, null) + ' · Schedule';
    body = <PlanSchedule run={run} now={now} tab={v.tab} at={v.at} onRead={(day, k) => readDay(run, day, k)} noteOf={(d) => planNoteOf(run, d)} />;
  } else if ((v.v === 'plan' || v.v === 'finished') && run && (run.status === 'finished' || runStatus(run, now).finished)) {
    title = runName(run, null);
    body = <PlanFinished run={run} onFind={() => { planNavToList(); setFindFocus((n) => n + 1); }}
      onAgain={() => { const r = newRun({ plan: run.plan, name: run.name, tracks: run.tracks, share: run.share, pace: againPace(run), weekdays: run.weekdays }, new Date()); saveRun(r); replacePlanView({ v: 'plan', id: r.id }); }}
      onDone={back} />;
  } else if (v.v === 'plan' && run) {
    title = runName(run, null);
    gear = true;
    body = (
      <PlanPage run={run} now={now} name={title} settingsOpen={settings} onSettings={setSettings}
        onRead={(day, k) => readDay(run, day, k)} onListen={onListen} tracksOf={planTracks}
        onSchedule={(at) => pushPlanView({ v: 'schedule', id: run.id, at })} onDaySheet={setDaySheet}
        onNote={note ? (day) => note(run, day) : undefined} noteOf={(d) => planNoteOf(run, d)}
        onStopped={() => planNavToList()} />
    );
  } else if (v.v === 'build') {
    title = 'Build a plan';
    body = (
      <div className="plans-screen">
        <PlanBuilder step={buildStep} lettersReady={lettersReady} isRead={isRead}
          onStarted={(r) => { started.current = r.id; }}
          onStep={(s) => {
            if (s) { setBuildStep(s); return; }
            const id = started.current; started.current = null; setBuildStep(1);
            if (id) replacePlanView({ v: 'plan', id }); else popPlanView();
          }} />
      </div>
    );
  } else {
    body = (
      <ReadingPlansScreen runs={runs} finished={finished} now={now} lettersReady={lettersReady} findFocus={findFocus}
        onOpenPlan={(id) => pushPlanView({ v: 'plan', id })} onOpenFinished={(id) => pushPlanView({ v: 'finished', id })}
        onPreview={(plan) => pushPlanView({ v: 'preview', plan, opt: planDef(plan) && plan === 'collection' ? { volKey: 'one' } : undefined })}
        onBuild={() => { setBuildStep(1); pushPlanView({ v: 'build' }); }} />
    );
  }
  const missing = (v.v === 'plan' || v.v === 'schedule' || v.v === 'finished') && !v.preview && !run;
  React.useEffect(() => { if (missing) planNavToList(); }, [missing]);
  const sheetRun = v.v === 'plan' && run ? run : null;
  return (
    <ScreenLayout key={v.v + ':' + stack.length} navChildren={LibraryNav({
      onBack: v.v === 'build' && buildStep === 2 ? () => setBuildStep(1) : back, backLabel: stack.length > 1 ? 'Reading plans' : backLabel, showHome: false,
      leftExtras: <PlanBarTitle title={title} />,
      onSearch, hide: stack.length > 1 || !onSearch ? ['settings', 'history', 'theme', 'search'] : ['settings', 'history', 'theme'],
      rightExtras: gear ? <button type="button" className="root-gear-btn plan-gear" title="Plan settings" aria-label="Plan settings" onClick={() => setSettings(true)}>{GEAR}</button> : null,
    })}>
      {body}
      {sheetRun && daySheet != null ? <DaySheet run={sheetRun} day={daySheet} now={now} onClose={() => setDaySheet(null)} onRead={(day, k) => readDay(sheetRun, day, k)} /> : null}
    </ScreenLayout>
  );
}
