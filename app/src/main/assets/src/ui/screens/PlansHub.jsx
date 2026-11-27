/* ═══════════════════════════════════════════════════════════════════════
   PlansHub — the 'reading-plans' screen: Reading plans as a place (plans2)
   ═══════════════════════════════════════════════════════════════════════
   One app screen holding a small stack of views (utils/plan-nav.js): the
   list, a plan's preview, the plan's own page, its whole schedule, a
   finished plan, the builder. Back pops a view; at the list it leaves.
   The top bar is back, the view's title and one gear (U rule 11): on a
   plan's own page and its schedule (0430) "Manage" (the gear and the word,
   2235: Corbin 11-16 "a way to cancel the plan, change it"), which opens
   Manage plan; on every
   other view the app's gear (Quick settings, GEAR1), so a page never shows
   two gears. Stop and Start over are one tap each with Undo (a toast); a
   stopped plan is kept under Past plans, where its page offers Continue
   and Start over.
   History and theme stay off here. Each view gets a fresh scroll (the
   layout is keyed by the view), so nothing here writes scrollTop.
   The reading session itself (the reader's strip and end panel) is started
   through `onStartSession`, which screen-routes owns.
   Free globals: React, ScreenLayout, LibraryNav.
   ═══════════════════════════════════════════════════════════════════════ */

import { usePlanNav, planNavMounted, keepPlanNav, pushPlanView, replacePlanView, popPlanView, planNavToList } from '../../utils/plan-nav.js';
import { endPlanSession } from '../../utils/plan-session.js';
import { usePlanRuns, saveRun, runRow, continueRun, startOverRun, countOwnOnlyRun, finishDate } from '../../utils/plan-runs-view.js';
import { showUndoToast } from '../../utils/toast.js';
import { runStatus, newRun, dayNum, itemKinds, againPace, heldDay } from '../../data/plan-engine.js';
import { runName, planDef } from '../../data/plan-catalog.js';
import { useVolumesSeq, useNow } from '../components/TodayCard.jsx';
import { PlanBarTitle, GEAR, countOf } from '../components/PlanBits.jsx';
import { ReadingPlansScreen } from './ReadingPlansScreen.jsx';
import { PlanPreview, draftRun } from './PlanPreview.jsx';
import { PlanPage, PlanSettings } from './PlanPage.jsx';
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
      <p className="plan-daydone-sub">{'Started ' + finishDate(run.start, new Date()) + ' · finished ' + finishDate(run.finished, new Date())}</p>
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
 * A stopped plan's page (2235): what was read stays, and the two ways back: Continue where it stopped (the stopped
 * days become a pause, never missed) or Start over from day 1 (a new run; this one stays here).
 * @param {{ run: any, now: Date, onContinue: () => void, onStartOver: () => void, onDone: () => void }} props
 */
function PlanStopped({ run, now, onContinue, onStartOver, onDone }) {
  const st = runStatus(run, now);
  const row = runRow(run, now);
  return (
    <div className="root-screen plans-hub plan-finished plan-stopped">
      <h2 className="plan-daydone-title">{'You stopped ' + runName(run, null)}</h2>
      <p className="plan-daydone-sub">{(run.stopped ? 'Stopped ' + finishDate(run.stopped, new Date()) + ' · ' : '') + 'day ' + Math.min(st.total, heldDay(run, st) + 1) + ' of ' + st.total.toLocaleString('en-US')}</p>
      <p className="plan-daydone-sub">{row.counts + ' read'}</p>
      <button type="button" className="ui-btn is-primary is-wide" onClick={onContinue}>Continue where I stopped</button>
      <button type="button" className="ui-btn is-wide" onClick={onStartOver}>Start over from day 1</button>
      <div className="plan-links plan-links-center"><button type="button" className="plan-text-btn plan-link" onClick={onDone}>Done</button></div>
    </div>
  );
}

const MANAGE_TOAST = 'vot-toast-plan-manage';

/**
 * @param {{ readingPlans?: any, isRead: (bid: string, cid: any) => boolean, onPlansMoved?: (left: any[]) => void,
 *   onBack: () => void, backLabel?: string, onSearch?: () => void, onListen?: (refs: any[], name: string, runId?: string) => void,
 *   planTracks?: (refs: any[]) => any[], onNote?: (entryId: string) => void,
 *   onStartSession: (runId: string, day: number, k?: string, span?: number) => void }} props
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
  // 0130: "Manage ›" (Home, the list) opens the plan on its Manage sheet, once: coming back to this view from the
  // schedule leaves the sheet shut.
  const manageShown = React.useRef(/** @type {WeakSet<object>} */ (new WeakSet()));
  React.useEffect(() => { const m = !!(top && top.v === 'plan' && /** @type {any} */ (top).manage && !manageShown.current.has(top)); if (m) manageShown.current.add(top); setSettings(m); setDaySheet(top && top.v === 'plan' && typeof /** @type {any} */ (top).sheet === 'number' ? /** @type {any} */ (top).sheet : null); }, [top]);
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
  // 2235: Past plans, finished and stopped, newest first (a stopped plan was hidden for good before).
  const pastOn = (/** @type {any} */ r) => (r.status === 'finished' ? r.finished : r.stopped) || '';
  /** @type {any[]} */
  const finished = (store && typeof store.all === 'function' ? store.all() : [])
    .filter((/** @type {any} */ r) => (r.status === 'finished' && r.finished) || r.status === 'stopped')
    .sort((/** @type {any} */ a, /** @type {any} */ b) => (pastOn(a) < pastOn(b) ? 1 : pastOn(a) > pastOn(b) ? -1 : 0));
  const runOf = (/** @type {string} */ id) => (store ? store.get(id) : null);
  const back = () => { if (!popPlanView()) onBack(); };
  /** @param {any} run @param {number} day @param {string} [k] @param {number} [span] */
  const readDay = (run, day, k, span) => (span ? onStartSession(run.id, day, k, span) : onStartSession(run.id, day, k));
  const note = onNote ? (/** @type {any} */ run, /** @type {number} */ day) => writePlanNote(run, day, onNote) : null;
  // 2235: Stop and Start over are one tap each; the toast's Undo puts the plan back as it was.
  const stopped = (/** @type {any} */ prev) => {
    planNavToList();
    showUndoToast(MANAGE_TOAST, 'Stopped ' + runName(prev, null), () => saveRun(prev));
  };
  const startOver = (/** @type {any} */ prev) => {
    const [old, fresh] = startOverRun(prev, new Date());
    if (old !== prev) saveRun(old);
    saveRun(fresh);
    replacePlanView({ v: 'plan', id: fresh.id });
    showUndoToast(MANAGE_TOAST, 'Started over from day 1', () => {
      const s = _store();
      if (s && typeof s.remove === 'function') s.remove(fresh.id);
      saveRun(prev);
      replacePlanView({ v: prev.status === 'stopped' ? 'stopped' : 'plan', id: prev.id });
    });
  };

  // 0450: "Count only this plan's reading": a new run from today with the plan's own (dated) reading; the old one goes
  // to Past plans, and the toast's Undo removes the new one and puts the old back exactly as it was stored.
  const ownOnly = (/** @type {any} */ prev) => {
    const pair = countOwnOnlyRun(prev, new Date());
    if (!pair) return;
    saveRun(pair[0]);
    saveRun(pair[1]);
    replacePlanView({ v: 'plan', id: pair[1].id });
    showUndoToast(MANAGE_TOAST, 'Started again from today', () => {
      const s = _store();
      if (s && typeof s.remove === 'function') s.remove(pair[1].id);
      saveRun(prev);
      replacePlanView({ v: 'plan', id: prev.id });
    });
  };

  // 2310: a changed plan is a new run; the toast's Undo removes it and puts the plan back exactly as it was.
  // Only its name changed: the same run renamed, and Undo puts the old name back.
  const edited = (/** @type {any} */ prev, /** @type {any} */ fresh) => {
    const renamed = fresh.id === prev.id;
    showUndoToast(MANAGE_TOAST, (renamed ? 'Renamed ' : 'Changed ') + runName(fresh, null), () => {
      const s = _store();
      if (!renamed && s && typeof s.remove === 'function') s.remove(fresh.id);
      saveRun(prev);
      replacePlanView({ v: 'plan', id: prev.id });
    });
  };

  let title = 'Reading plans';
  let gear = false;
  let body = null;
  /** @type {any} */ let sheet = null;
  const v = /** @type {any} */ (top || { v: 'list' });
  const run = v.id ? runOf(v.id) : null;
  if ((v.v === 'plan' || v.v === 'schedule' || v.v === 'finished' || v.v === 'stopped') && !v.preview && !run) {
    body = null;   // a run stopped or removed meanwhile: the effect below goes back to the list (a preview's schedule has no run yet: 11-18)
  } else if (v.v === 'preview') {
    body = <PlanPreview key={v.plan + (v.opt ? ':' + v.opt.volKey : '')} planId={v.plan} opt={v.opt} now={now} lettersReady={lettersReady} isRead={isRead}
      onStarted={(id) => replacePlanView({ v: 'plan', id })} onSchedule={(preview) => pushPlanView({ v: 'schedule', id: '', preview })} />;
  } else if (v.v === 'schedule' && v.preview) {
    const draft = draftRun(v.preview.planId, v.preview.spec, now);
    title = (draft ? runName(draft, null) : 'Reading plans') + ' · Schedule';
    body = draft ? <PlanSchedule run={draft} now={now} preview onRead={() => {}} /> : null;
  } else if (v.v === 'schedule' && run) {
    title = runName(run, null) + ' · Schedule';
    body = <PlanSchedule run={run} now={now} tab={v.tab} at={v.at} onRead={(day, k) => readDay(run, day, k)} noteOf={(d) => planNoteOf(run, d)} />;
    // 0430: the plan page's own Manage here too (readers saw only the app's gear), the same sheet over the schedule;
    // what leaves the schedule (Start over, Change what's in it) goes from the plan page, so Back never lands on the old run.
    if (run.status !== 'stopped' && run.status !== 'finished' && !runStatus(run, now).finished) {
      gear = true;
      sheet = settings ? (
        <PlanSettings run={run} now={now} tracksOf={planTracks} onClose={() => setSettings(false)}
          onStartOver={() => { setSettings(false); popPlanView(); startOver(run); }}
          onEdit={run.plan === 'custom' ? () => { setSettings(false); popPlanView(); setBuildStep(1); pushPlanView({ v: 'build', edit: run.id }); } : undefined}
          onOwnOnly={() => { setSettings(false); popPlanView(); ownOnly(run); }}
          onStopped={(prev) => { setSettings(false); stopped(prev); }} />
      ) : null;
    }
  } else if ((v.v === 'plan' || v.v === 'finished') && run && (run.status === 'finished' || runStatus(run, now).finished)) {
    title = runName(run, null);
    body = <PlanFinished run={run} onFind={() => { planNavToList(); setFindFocus((n) => n + 1); }}
      onAgain={() => { const r = newRun({ plan: run.plan, name: run.name, tracks: run.tracks, share: run.share, pace: againPace(run), weekdays: run.weekdays }, new Date()); saveRun(r); replacePlanView({ v: 'plan', id: r.id }); }}
      onDone={back} />;
  } else if ((v.v === 'stopped' || v.v === 'plan') && run && run.status === 'stopped') {
    title = runName(run, null);
    body = <PlanStopped run={run} now={now} onDone={back}
      onContinue={() => { saveRun(continueRun(run, new Date())); replacePlanView({ v: 'plan', id: run.id }); }}
      onStartOver={() => startOver(run)} />;
  } else if (v.v === 'plan' && run) {
    title = runName(run, null);
    gear = true;
    body = (
      <PlanPage key={run.id} run={run} now={now} name={title} settingsOpen={settings} onSettings={setSettings} catchUpAtOpen={!!v.catchUp}
        onStartOver={() => { setSettings(false); startOver(run); }} onOwnOnly={() => { setSettings(false); ownOnly(run); }}
        onEdit={run.plan === 'custom' ? () => { setSettings(false); setBuildStep(1); pushPlanView({ v: 'build', edit: run.id }); } : undefined}
        onRead={(day, k, span) => readDay(run, day, k, span)} onListen={onListen} tracksOf={planTracks}
        onSchedule={(at) => pushPlanView({ v: 'schedule', id: run.id, at })} onDaySheet={setDaySheet}
        onNote={note ? (day) => note(run, day) : undefined} noteOf={(d) => planNoteOf(run, d)}
        onStopped={(prev) => stopped(prev)} />
    );
  } else if (v.v === 'build') {
    // 2310: the same builder changes a custom plan (v.edit, its run id); one with letters waits for the Volumes.
    const editing = v.edit ? runOf(v.edit) : null;
    const waits = !!editing && !lettersReady && editing.tracks.some((/** @type {any} */ t) => t.items.some((/** @type {any} */ it) => it.t));
    title = editing ? 'Change your plan' : 'Build a plan';
    body = waits ? <p className="plan-opt-note">Loading the Volumes…</p> : (
      <div className="plans-screen">
        <PlanBuilder key={v.edit || 'new'} step={buildStep} lettersReady={lettersReady} isRead={isRead} edit={editing || undefined}
          onEdited={(prev, fresh) => { started.current = fresh.id; edited(prev, fresh); }}
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
        onOpenPlan={(id, o) => pushPlanView({ v: 'plan', id, ...(o && o.catchUp ? { catchUp: true } : {}), ...(o && o.manage ? { manage: true } : {}) })}
        onOpenFinished={(id) => { const r = runOf(id); pushPlanView({ v: r && r.status === 'stopped' ? 'stopped' : 'finished', id }); }}
        onPreview={(plan) => pushPlanView({ v: 'preview', plan, opt: planDef(plan) && plan === 'collection' ? { volKey: 'one' } : undefined })}
        onBuild={() => { setBuildStep(1); pushPlanView({ v: 'build' }); }} />
    );
  }
  const missing = (v.v === 'plan' || v.v === 'schedule' || v.v === 'finished' || v.v === 'stopped') && !v.preview && !run;
  React.useEffect(() => { if (missing) planNavToList(); }, [missing]);
  const sheetRun = v.v === 'plan' && run ? run : null;
  return (
    <ScreenLayout key={v.v + ':' + stack.length} navChildren={LibraryNav({
      onBack: v.v === 'build' && buildStep === 2 ? () => setBuildStep(1) : back, backLabel: stack.length > 1 ? 'Reading plans' : backLabel, showHome: false,
      leftExtras: <PlanBarTitle title={title} />,
      onSearch, hide: ['history', 'theme'].concat(gear ? ['settings'] : [], stack.length > 1 || !onSearch ? ['search'] : []),
      rightExtras: gear ? <button type="button" className="plan-manage-btn" title="Manage plan" aria-label="Manage plan" onClick={() => setSettings(true)}>{GEAR}<span aria-hidden="true">Manage</span></button> : null,
    })}>
      {body}
      {sheet}
      {sheetRun && daySheet != null ? <DaySheet run={sheetRun} day={daySheet} now={now} onClose={() => setDaySheet(null)} onRead={(day, k) => readDay(sheetRun, day, k)} /> : null}
    </ScreenLayout>
  );
}
