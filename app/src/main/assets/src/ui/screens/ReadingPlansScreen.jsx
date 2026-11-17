/* ═══════════════════════════════════════════════════════════════════════
   ReadingPlansScreen — Library > Reading plans, the list (plans2, 2026-11-10)
   ═══════════════════════════════════════════════════════════════════════
   The hub's design (P2-plans-design.md 3.1, mock plans-sheet-2 right). The
   title sits in the top bar (PlansHub); the page has three parts:
   - Your plans: one row per running or paused plan, in start order: its
     ring and percent, its name and one state line led by the plan's status
     (planStatus, 2235: the same words as Home and the plan page): "On track
     · Today: Genesis 34-36 · 1 of 3", "Done today · tomorrow: 3 letters",
     "Starts Thu Nov 12", "Paused · Day 18 of 30", "3 days behind ·
     finishes Nov 14" with a Catch up button beside it. A tap opens the
     plan's own page. No plans yet: one sentence and Find a plan (U rule 15).
   - Past plans (2235): finished and stopped plans, kept for good, newest
     first; a tap opens the finish page, or a stopped plan's page with
     Continue and Start over.
   - Find a plan: Start here, The Scriptures, The Letters, Together, then
     Build your own plan. Each row says what it is and its minutes a day
     and days, computed from its items. A tap opens the preview; it never
     starts a plan.
   Free globals: React.
   ═══════════════════════════════════════════════════════════════════════ */

import { runRow, letterSource, shortDate, planStatus } from '../../utils/plan-runs-view.js';
import { runStatus, itemsLabel, itemsCount, dayNum } from '../../data/plan-engine.js';
import { PLAN_CATALOG, PLAN_GROUPS, catalogFacts, runName, bookTitle } from '../../data/plan-catalog.js';
import { PlanRing, PlanSec, CHEVRON, countOf } from '../components/PlanBits.jsx';

/**
 * A running plan's one state line, led by its status (planStatus). @param {any} run @param {Date} now
 * @returns {{ lead: string, rest: string, paused: boolean, behind: boolean }}
 */
export function planStateLine(run, now) {
  const st = runStatus(run, now);
  const status = planStatus(run, now, st);
  const line = (/** @type {string} */ lead, rest = '') => ({ lead, rest, paused: status.key === 'paused', behind: status.key === 'behind' });
  if (status.key === 'paused') return line('Paused', 'Day ' + (st.day + 1) + ' of ' + st.total);
  if (status.key === 'starts' || status.key === 'finished' || status.key === 'behind') return line(status.text);
  if (status.key === 'done') {
    const next = st.todayItems;
    const label = itemsLabel(next, bookTitle);
    return line('Done today', next.length ? 'tomorrow: ' + (label.length <= 24 ? label : itemsCount(next)) : '');
  }
  const row = runRow(run, now);
  const n = row.items.length;
  return line('On track', 'Today: ' + row.label + (n > 1 ? ' · ' + row.todayTicked + ' of ' + n : ''));
}

/** "Stopped Nov 10 · day 11 of 365" for a stopped run. @param {any} r @param {Date} now */
export function stoppedLine(r, now) {
  const st = runStatus(r, now);
  return planStatus(r, now, st).text + ' · day ' + Math.min(st.total, st.day + 1) + ' of ' + st.total.toLocaleString('en-US');
}

/** "8 days · finished Oct 30" for a finished run. @param {any} r */
export function finishedLine(r) {
  const a = dayNum(r.start), b = dayNum(r.finished);
  const n = a != null && b != null ? b - a + 1 : 0;
  return (n ? countOf(n, 'day') + ' · ' : '') + 'finished ' + shortDate(r.finished).replace(/, \d{4}$/, '');
}

/**
 * @param {{ runs: any[], finished: any[], now: Date, lettersReady: boolean,
 *   onOpenPlan: (id: string, opt?: { catchUp?: boolean, manage?: boolean }) => void, onOpenFinished: (id: string) => void, onPreview: (planId: string) => void,
 *   onBuild: () => void, findFocus?: number }} props
 *   finished: the past plans, finished and stopped (2235), newest first
 *   findFocus: bumped by "Find the next plan" (the finish page) to bring Find a plan into view
 */
export function ReadingPlansScreen({ runs, finished, now, lettersReady, onOpenPlan, onOpenFinished, onPreview, onBuild, findFocus = 0 }) {
  const [allFinished, setAllFinished] = React.useState(false);
  const findRef = React.useRef(/** @type {HTMLElement | null} */ (null));
  const goFind = () => { const el = findRef.current; if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'start' }); if (el) el.focus({ preventScroll: true }); };
  React.useEffect(() => { if (findFocus) goFind(); }, [findFocus]);
  const facts = React.useMemo(() => {
    const src = lettersReady ? letterSource() : null;
    /** @type {Record<string, any>} */ const out = {};
    const at = new Date();
    for (const p of PLAN_CATALOG) out[p.id] = catalogFacts(p.id, src, at, { volKey: 'one' });
    return out;
  }, [lettersReady]);
  const shownFinished = allFinished ? finished : finished.slice(0, 2);
  return (
    <div className="root-screen plans-hub plans-list-screen">
      <PlanSec title="Your plans" />
      {runs.length ? (
        <ul className="root-list plan-list" aria-label="Your plans">
          {runs.map((run) => {
            const line = planStateLine(run, now);
            const name = runName(run, null);
            return (
              <li key={run.id} className={line.behind ? 'plan-run-li is-behind' : 'plan-run-li'}>
                <button type="button" className="root-row plan-run-row" onClick={() => onOpenPlan(run.id)}
                  aria-label={name + ': ' + [line.lead, line.rest].filter(Boolean).join(' · ')}>
                  <PlanRing percent={runStatus(run, now).percent} />
                  <span className="root-row-text">
                    <span className="root-row-title">{name}</span>
                    <span className="root-row-sub plan-state" data-status={line.paused ? 'paused' : line.behind ? 'behind' : undefined}>{line.lead ? <b>{line.lead}</b> : null}{line.lead && line.rest ? ' · ' : ''}{line.rest}</span>
                  </span>
                </button>
                {line.behind ? (
                  <button type="button" className="ui-btn is-small plan-catchup-btn" aria-label={'Catch up: ' + name}
                    onClick={() => onOpenPlan(run.id, { catchUp: true })}>Catch up</button>
                ) : null}
                {/* 0130: the way to change, pause or stop it, in a word (readers could not tell from a bare chevron);
                    0430: a paused plan too (its sheet holds Resume). */}
                <button type="button" className="plan-manage-link" aria-label={'Manage ' + name} onClick={() => onOpenPlan(run.id, { manage: true })}>Manage<span aria-hidden="true">{' ›'}</span></button>
              </li>
            );
          })}
        </ul>
      ) : (
        <div className="ui-card plan-empty">
          <p className="plan-empty-text">Pick a plan below and today’s reading shows here and on the Read tab.</p>
          <button type="button" className="ui-btn is-primary" onClick={goFind}>Find a plan</button>
        </div>
      )}

      {finished.length ? (
        <>
          <PlanSec title="Past plans" link={finished.length > 2 ? (allFinished ? 'Fewer' : 'All ' + finished.length) : undefined}
            onLink={() => setAllFinished(!allFinished)} />
          <ul className="root-list plan-list" aria-label="Past plans">
            {shownFinished.map((r) => (
              <li key={r.id}>
                <button type="button" className="root-row" onClick={() => onOpenFinished(r.id)}>
                  <span className="root-row-text">
                    <span className="root-row-title">{runName(r, null)}</span>
                    <span className="root-row-sub">{r.status === 'stopped' ? stoppedLine(r, now) : finishedLine(r)}</span>
                  </span>
                  {CHEVRON}
                </button>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      <h2 className="root-section plan-find-title" tabIndex={-1} ref={(el) => { findRef.current = el; }}>Find a plan</h2>
      {PLAN_GROUPS.map(([g, title]) => (
        <section key={g} className="plan-group" aria-label={title}>
          <h3 className="plan-group-title">{title}</h3>
          <ul className="root-list plan-list">
            {PLAN_CATALOG.filter((p) => p.group === g).map((p) => {
              const f = facts[p.id];
              const meta = f ? (p.id === 'collection' ? [f.minutes + ' min a day'] : [f.minutes + ' min a day', countOf(f.days, 'day')]) : [];
              return (
                <li key={p.id}>
                  <button type="button" className="root-row plan-find-row" onClick={() => onPreview(p.id)}
                    aria-label={p.name + ': ' + p.sub + (meta.length ? ', ' + meta.join(', ') : '')}>
                    <span className="root-row-text">
                      <span className="root-row-title">{p.name}</span>
                      <span className="root-row-sub">{p.sub}</span>
                    </span>
                    {meta.length ? <span className="plan-find-meta" aria-hidden="true">{meta.map((m) => <span key={m}>{m}</span>)}</span> : null}
                    {CHEVRON}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      <ul className="root-list plan-list plan-build-list">
        <li>
          <button type="button" className="root-row plan-build-row" onClick={onBuild}>
            <span className="root-row-text">
              <span className="root-row-title">Build your own plan</span>
              <span className="root-row-sub">Pick any books and letters</span>
            </span>
            {CHEVRON}
          </button>
        </li>
      </ul>
      <p className="plan-foot-note">A chapter or letter counts when you read it to the end or listen to it all. Your plans stay on this phone.</p>
    </div>
  );
}
