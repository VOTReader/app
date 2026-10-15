/* PlansScreen - Reading plans (zv1; picture 9a-plans): the plans running, each with today's portion, its progress line and
   Listen / Read / Catch up, then the plans not started with Start (the Volumes with its pace). Home's "Reading plans" row
   opens it. Plans live where main keeps them (plans-facts.js); Stop is in a sheet under the cards, so the cards stay as
   drawn. A gate boot shows the picture's plans and every control is inert. */
import { Icon } from '../Icon.jsx';
import { definePlace } from '../places.js';
import { Sheet } from '../Sheet.jsx';
import { useVotCorpus } from '../corpus.js';
import { savedSettings } from '../settings-pages.js';
import {
  PACES, plansView, gatePlans, savedPlans, writePlans, liveIsRead, liveSequence, itemRoute, listenItem,
  startPlan, stopPlan,
} from '../plans-facts.js';

/**
 * @param {{ view: import('../plans-facts.js').PlansView, pace: number, markOff?: boolean, desktop?: boolean,
 *   onPace?: (n: number) => void, onStart?: (id: string) => void, onStop?: (id: string) => void,
 *   onRead?: (it: any) => void, onListen?: (it: any) => void }} props
 */
export function PlansScreen({ view, pace, markOff = false, desktop = false, onPace, onStart, onStop, onRead, onListen }) {
  const [stopping, setStopping] = React.useState(false);
  const call = (fn, ...a) => () => { if (fn) fn(...a); };
  return (
    <>
      <div className="page-head g">
        <h1 className="display">Reading plans</h1>
        <p className="lede">Your plans stay on this phone.</p>
        {markOff ? <p className="fine">Mark as read is off, so days don’t tick. Turn it on in Settings.</p> : null}
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

/** The plans place: main's plans and read record on a real boot (Start / Stop write main's key), the picture's on a gate. */
function PlansPlace({ gate, desktop, go, onReady }) {
  const seeded = gate ? (gate.facts && gate.facts.plans) || gatePlans() : null;
  const [plans, setPlans] = React.useState(() => (gate ? [] : savedPlans()));
  const [pace, setPace] = React.useState(seeded ? seeded.pace : 1);
  const corpus = useVotCorpus();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- corpus is the trigger: liveSequence() reads the globals its load fills
  const seq = React.useMemo(() => (gate ? [] : liveSequence()), [gate, corpus]);
  React.useEffect(() => { onReady(); }, [onReady]);
  if (seeded) return <PlansScreen view={seeded.view} pace={pace} desktop={desktop} onPace={setPace} />;

  const view = plansView({ plans, now: new Date(), isRead: liveIsRead(), seq, pace });
  const keep = (next) => { if (writePlans(next)) setPlans(next); };
  const open = (it) => { const r = itemRoute(it); if (r) go(r); };
  return (
    <PlansScreen view={view} pace={pace} desktop={desktop} markOff={savedSettings().markAsRead === false}
      onPace={setPace} onStart={(id) => keep(startPlan(plans, id, new Date(), pace))} onStop={(id) => keep(stopPlan(plans, id))}
      onRead={open} onListen={(it) => { if (!listenItem(it)) open(it); }} />
  );
}

definePlace('reading-plans', { Screen: PlansPlace, title: () => 'Reading plans' });
