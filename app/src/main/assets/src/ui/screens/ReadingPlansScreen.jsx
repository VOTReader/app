/* ═══════════════════════════════════════════════════════════════════════
   ReadingPlansScreen — start, follow and stop a reading plan (rp1)
   ═══════════════════════════════════════════════════════════════════════
   Cluster G (lazy bundle-g), like the other personal-study screens. Built to
   the round-2 mockup (lanes/myweb/out/mockups/rp1/r2-plans.png): the plans
   not started as cards with Start (the Volumes with a pace), then each plan
   that runs: its day, a thin progress line, this month's days (done, missed,
   today, ahead) and, when days are behind, Catch up from the first missed.
   Plans live in settings.readingPlans (utils/reading-plan-view.js); done-ness
   is the app's own read record. Nothing scores the reader: no streaks.
   Free globals: React, ScreenLayout, LibraryNav, ConfirmStrip.
   ═══════════════════════════════════════════════════════════════════════ */

import { readingPlansOf, todayRows, startPlan, stopPlan, monthDays, planPortion, PLAN_NAMES } from '../../utils/reading-plan-view.js';
import { BIBLE_CHAPTER_COUNT } from '../../data/reading-plans.js';
import { useVolumesSeq, useNow } from '../components/TodayCard.jsx';

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const PACES = [1, 2, 3];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/**
 * @param {{ readingPlans: any, isRead: (bid: string, cid: any) => boolean, markAsReadEnabled?: boolean,
 *   onChangePlans: (plans: any[]) => void, onRead: (next: any) => void, onBack: () => void, backLabel?: string,
 *   onSearch?: () => void, onHistory?: () => void, onSettings?: () => void, theme?: string, onThemeChange?: (t: string) => void }} props
 */
export function ReadingPlansScreen({ readingPlans, isRead, markAsReadEnabled, onChangePlans, onRead, onBack, backLabel = 'Library',
  onSearch, onHistory, onSettings, theme, onThemeChange }) {
  const plans = readingPlansOf({ readingPlans });
  const seq = useVolumesSeq(true);
  const now = useNow();
  const [pace, setPace] = React.useState(1);
  const [stopping, setStopping] = React.useState(/** @type {string | null} */ (null));
  const rows = todayRows(plans, now, isRead, seq);
  const running = new Set(plans.map((p) => p.id));
  const volumesCount = seq.length;

  /** @param {any} plan @param {number} day */
  const firstUnread = (plan, day) => {
    const items = planPortion(plan, day, seq).items;
    return items.find((it) => !isRead(it.bid, it.cid)) || items[0] || null;
  };

  return (
    <ScreenLayout navChildren={LibraryNav({ onBack, backLabel, showHome: false, onSearch, onHistory, onSettings, theme, onThemeChange })}>
      <div className="plans-screen">
        <header className="study-head">
          <h1 className="study-head-title">Reading plans</h1>
          <p className="study-head-sub">Your plans stay on this phone.</p>
        </header>

        {markAsReadEnabled === false ? (
          <p className="plans-note">Mark as read is off, so days don’t tick. Turn it on in Settings.</p>
        ) : null}

        {!running.has('bible-year') || !running.has('volumes') ? (
          <div className="plans-offer">
            {!running.has('bible-year') ? (
              <section className="plans-offer-card" aria-label={PLAN_NAMES['bible-year']}>
                <h2 className="plans-offer-title">{PLAN_NAMES['bible-year']}</h2>
                <p className="plans-offer-sub">{BIBLE_CHAPTER_COUNT.toLocaleString('en-US') + ' chapters · 365 days'}</p>
                <button type="button" className="today-btn plans-start" aria-label={'Start ' + PLAN_NAMES['bible-year']}
                  onClick={() => onChangePlans(startPlan(plans, 'bible-year', now))}>Start</button>
              </section>
            ) : null}
            {!running.has('volumes') ? (
              <section className="plans-offer-card" aria-label={PLAN_NAMES.volumes}>
                <h2 className="plans-offer-title">{PLAN_NAMES.volumes}</h2>
                <p className="plans-offer-sub">
                  {'Every letter in site order' + (volumesCount ? ' · ' + Math.ceil(volumesCount / pace) + ' days' : '')}
                </p>
                <div className="plans-pace" role="radiogroup" aria-label="Letters a day">
                  {PACES.map((n) => (
                    <button key={n} type="button" role="radio" aria-checked={pace === n} className={pace === n ? 'on' : ''}
                      onClick={() => setPace(n)}>{n + ' a day'}</button>
                  ))}
                </div>
                <button type="button" className="today-btn plans-start" aria-label={'Start ' + PLAN_NAMES.volumes}
                  onClick={() => onChangePlans(startPlan(plans, 'volumes', now, pace))}>Start</button>
              </section>
            ) : null}
          </div>
        ) : null}

        {plans.length ? <h2 className="plans-eyebrow">Your plans</h2> : null}
        {plans.map((plan) => {
          const row = rows.find((r) => r.id === plan.id);
          if (!row) return null;
          const days = row.loading ? [] : monthDays(plan, now, isRead, seq);
          const lead = days.length ? days[0].weekday : 0;
          return (
            <section key={plan.id} className="plans-plan" aria-label={row.name}>
              <h3 className="plans-plan-title">{row.name}</h3>
              {row.loading ? <p className="plans-plan-sub">Loading the Volumes…</p> : (
                <>
                  <p className="plans-plan-sub">{row.finished ? 'Plan complete' : 'Day ' + (row.day + 1) + ' of ' + row.totalDays + ' · ' + row.percent + ' %'}</p>
                  <span className="today-progress" aria-hidden="true"><span style={{ width: Math.max(0, Math.min(100, row.percent)) + '%' }} /></span>
                  <div className="plans-month" role="group" aria-label={MONTHS[now.getMonth()]}>
                    <div className="plans-month-name">{MONTHS[now.getMonth()]}</div>
                    <div className="plans-grid">
                      {WEEKDAYS.map((w, i) => <span key={'w' + i} className="plans-weekday" aria-hidden="true">{w}</span>)}
                      {Array.from({ length: lead }, (_, i) => <span key={'b' + i} className="plans-day-blank" />)}
                      {days.map((d) => (
                        <span key={d.date} className="plans-day" data-state={d.state}
                          aria-label={d.date + (d.state === 'none' ? '' : ', ' + (d.state === 'today' ? (d.done ? 'today, done' : 'today') : d.state))}>
                          <span className="plans-day-num">{d.date}</span>
                          <span className="plans-day-mark" aria-hidden="true" />
                        </span>
                      ))}
                    </div>
                  </div>
                  {row.behind > 0 && row.catchUpDay >= 0 ? (
                    <div className="plans-catchup">
                      <span>{row.behind + (row.behind === 1 ? ' day' : ' days') + ' to catch up'}</span>
                      <button type="button" className="today-btn" onClick={() => { const n = firstUnread(plan, row.catchUpDay); if (n) onRead(n); }}>Catch up</button>
                    </div>
                  ) : null}
                </>
              )}
              {stopping === plan.id ? (
                <ConfirmStrip question={'Stop ' + row.name + '? Your reading stays marked.'}
                  onCancel={() => setStopping(null)}
                  onConfirm={() => { setStopping(null); onChangePlans(stopPlan(plans, plan.id)); }} />
              ) : (
                <button type="button" className="today-link plans-stop" aria-label={'Stop ' + row.name} onClick={() => setStopping(plan.id)}>Stop this plan</button>
              )}
            </section>
          );
        })}
      </div>
    </ScreenLayout>
  );
}
