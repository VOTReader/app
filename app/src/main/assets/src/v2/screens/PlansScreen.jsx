/* PlansScreen - Reading plans (zv1; picture 9a-plans): the plans running, each with today's portion, its progress line and
   Listen / Read / Catch up, then the plans not started with Start (the Volumes with its pace). Home's "Reading plans" row
   opens it. Plans are main's runs (ReadingPlanStore, plans-facts.js; mw18 port); Stop is in a sheet under the cards, so
   the cards stay as drawn. A gate boot shows the picture's plans and every control is inert. A running plan ticks its
   days whatever Mark as read says (main's call 3b), so the old "days don't tick" line is gone. */
import { Icon } from '../Icon.jsx';
import { definePlace } from '../places.js';
import { Sheet } from '../Sheet.jsx';
import { useVotCorpus } from '../corpus.js';
import {
  PACES, WEEKDAYS, runsPlansView, volumesLetterCount, startOptions, gatePlans, savedPlans, writePlans, liveIsRead,
  itemRoute, listenItem,
} from '../plans-facts.js';
import { usePlanRuns, saveRun, stopRun, letterSource } from '../../utils/plan-runs-view.js';
import { startCatalogPlan } from '../../data/plan-catalog.js';
import { useNow } from '../../ui/components/TodayCard.jsx';

/** A plan's month under its actions (9a, main's month): read days carry a gold tick, a missed day a ring, today a gold
 *  box; the days ahead and those outside the plan are dim. This month only, as main. @param {{ month: import('../plans-facts.js').MonthView }} props */
export function Month({ month }) {
  return (
    <div className="pmo" role="group" aria-label={month.name}>
      <div className="pmo-n">{month.name}</div>
      <div className="pmo-g">
        {WEEKDAYS.map((w, i) => <span key={'w' + i} className="pmo-w" aria-hidden="true">{w}</span>)}
        {Array.from({ length: month.lead }, (_x, i) => <span key={'b' + i} className="pmo-d none" />)}
        {month.days.map((d) => (
          <span key={d.date} className={'pmo-d ' + d.state} aria-label={d.label}>
            <span className="num">{d.date}</span>
            <span className="mk" aria-hidden="true">
              {d.done && d.state !== 'none' ? <Icon name="check" /> : d.state === 'missed' ? <span className="ring" /> : null}
            </span>
          </span>
        ))}
      </div>
    </div>
  );
}

/**
 * @param {{ view: import('../plans-facts.js').PlansView, pace: number, desktop?: boolean,
 *   onPace?: (n: number) => void, onStart?: (id: string) => void, onStop?: (id: string) => void,
 *   onRead?: (it: any) => void, onListen?: (it: any) => void }} props
 */
export function PlansScreen({ view, pace, desktop = false, onPace, onStart, onStop, onRead, onListen }) {
  const [stopping, setStopping] = React.useState(false);
  const call = (fn, ...a) => () => { if (fn) fn(...a); };
  return (
    <>
      <div className="page-head g">
        <h1 className="display">Reading plans</h1>
        <p className="lede">Your plans stay on this phone.</p>
      </div>
      <div className="g plans">
        {view.running.map((r) => (
          <section key={r.id} className="plan on" aria-label={r.name}>
            <span className="overline">{r.overline}</span>
            <div className="pt">{r.title}</div>
            <div className="ps">{r.sub}</div>
            <div className="dl-prog" aria-hidden="true"><i style={{ width: r.percent + '%' }} /></div>
            {r.next || r.catchUp ? (
              <div className="actions">
                {r.next ? <button type="button" className="pill sm" onClick={call(onListen, r.next)}><Icon name="play" size={18} />Listen</button> : null}
                {r.next ? <button type="button" className="btn2 sm" onClick={call(onRead, r.next)}>Read</button> : null}
                {r.catchUp ? <button type="button" className="textbtn sm" onClick={call(onRead, r.catchUp)}>Catch up</button> : null}
              </div>
            ) : null}
            {r.month ? <Month month={r.month} /> : null}
          </section>
        ))}
        {view.offers.map((o) => (
          <section key={o.id} className="plan" aria-label={o.name}>
            <div className="pt">{o.name}</div>
            <div className="ps">{o.sub}</div>
            {o.paces ? (
              <div className="chips pace" role="radiogroup" aria-label="Letters a day">
                {PACES.map((n) => (
                  <button key={n} type="button" role="radio" aria-checked={pace === n} className={'chip' + (pace === n ? ' on' : '')}
                    onClick={call(onPace, n)}>{n + ' a day'}</button>
                ))}
              </div>
            ) : null}
            <button type="button" className="btn2 sm start" aria-label={'Start ' + o.name} onClick={call(onStart, o.id)}>Start</button>
          </section>
        ))}
        {view.running.length ? (
          <button type="button" className="textbtn sm quiet stop" onClick={() => setStopping(true)}>Stop a plan</button>
        ) : null}
      </div>
      {stopping ? (
        <Sheet kind="pick" label="Stop a plan" onClose={() => setStopping(false)} desktop={desktop}>
          <div className="sh">Stop a plan</div>
          <p className="fine">Your reading stays marked.</p>
          <div className="opts">
            {view.running.map((r) => (
              <button key={r.id} type="button" className="srow opt" onClick={() => { setStopping(false); if (onStop) onStop(r.id); }}>
                <span className="tx"><span className="t">{'Stop ' + r.name}</span><span className="s">{r.overline.replace(/^Today · /, '')}</span></span>
              </button>
            ))}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}

/** The plans place: main's plan runs on a real boot (Start puts a run, Stop stops it; rp1's settings plans move in once),
 *  the picture's on a gate. */
function PlansPlace({ gate, desktop, go, onReady }) {
  const seeded = gate ? (gate.facts && gate.facts.plans) || gatePlans() : null;
  const runs = usePlanRuns(gate ? {} : { legacy: savedPlans(), isRead: liveIsRead(), onLegacyMoved: writePlans });
  const [pace, setPace] = React.useState(seeded ? seeded.pace : 1);
  const corpus = useVotCorpus();
  const now = useNow();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- corpus is the trigger: the count reads the globals its load fills
  const letters = React.useMemo(() => (gate ? 0 : volumesLetterCount()), [gate, corpus]);
  React.useEffect(() => { onReady(); }, [onReady]);
  if (seeded) return <PlansScreen view={seeded.view} pace={pace} desktop={desktop} onPace={setPace} />;

  const view = runsPlansView({ runs, now, pace, letters });
  const open = (it) => { const r = itemRoute(it); if (r) go(r); };
  const start = (id) => { const run = startCatalogPlan(id, letterSource(), new Date(), startOptions(id, pace)); if (run) saveRun(run); };
  const stop = (id) => { const run = runs.find((r) => r.id === id); if (run) stopRun(run, new Date()); };
  return (
    <PlansScreen view={view} pace={pace} desktop={desktop} onPace={setPace} onStart={start} onStop={stop}
      onRead={open} onListen={(it) => { if (!listenItem(it)) open(it); }} />
  );
}

definePlace('reading-plans', { Screen: PlansPlace, title: () => 'Reading plans' });
