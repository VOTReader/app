/* HomeScreen - v2 Home, the Home tab's root (pictures 0a-home, 0b-home-more; Corbin 10-14 "three, drop duplicates").

   The display title, Continue reading (main's "you are here"), Recent (main's reading history), today's reading while a
   plan runs (TodayCard.jsx, pictures 9h and 9i), the seven volumes with
   their letter counts, then the Bible, Answers, Studies, plans, More letters and Listen and see. Settings is the gear in
   the top bar. Numbers and titles come from the corpus itself (corpus.js); the screen is ready once it has loaded. */
import { Icon } from '../Icon.jsx';
import { definePlace } from '../places.js';
import { useVotCorpus, useAnswersCorpusVersion, askAnswersCorpus, useAudioSyncSectionsVersion } from '../corpus.js';
import { VOLUMES, MORE_LETTERS, savedHome, describeItem, itemRoutes, letterCount, colOf, wantsAnswers } from '../home-facts.js';
import { noticeSeen } from '../garden-facts.js';
import { GardenNotice, noticeTier } from './GardenScreens.jsx';
import { TodayCard } from './TodayCard.jsx';
import { todayView, savedPlans, liveIsRead, liveSequence, gateIsRead, itemRoute, listenItem } from '../plans-facts.js';
import { savedSettings } from '../settings-pages.js';
import { useNow } from '../../ui/components/TodayCard.jsx';

/** Where a reader with nothing read yet starts. @type {import('../home-facts.js').HomeItem} */
const FIRST = { kind: 'letter', collection: 'one', n: 1 };

const ROWS = [
  { place: 'bible', t: 'The Scriptures of Truth', s: 'Genesis to Revelation · NKJV' },
  { place: 'answers', t: 'Answers Only God Can Give', s: 'The Lord sets the record straight' },
  { place: 'studies', t: 'Studies', s: 'Letter Studies · Matthew Study Bible' },
  { place: 'reading-plans', t: 'Reading plans', s: 'The Bible in a year, or the Volumes in order' },
];
const LISTEN_SEE = [
  { place: 'songs', t: 'Songs of the Letters', s: 'The letters set to music' },
  { place: 'garden', t: 'Return to the Garden', s: 'The Garden pages, full screen' },
  { place: 'scripture-web', t: 'The Scripture Web', s: 'Every cross-reference, drawn' },
];

/** The Bible row names the reader's translation. */
function bibleSub(facts) {
  const tr = facts && typeof facts.translation === 'string' ? facts.translation.toUpperCase() : 'NKJV';
  return 'Genesis to Revelation · ' + tr;
}

function Row({ t, s, onClick }) {
  return (
    <button type="button" className="row" onClick={onClick}>
      <span className="tx"><span className="t">{t}</span><span className="s">{s}</span></span>
      <span className="chev"><Icon name="chev" /></span>
    </button>
  );
}

function VolumeCells({ vol, last, count, onOpen }) {
  const col = colOf(vol.key);
  const label = col ? col.label : vol.key;
  return (
    <>
      <button type="button" className={'n' + (last ? ' last' : '')} tabIndex={-1} aria-hidden="true" onClick={onOpen}>{vol.n}</button>
      <button type="button" className={'c' + (last ? ' last' : '')} onClick={onOpen}>
        {label}{count != null && <span className="cnt">{count}</span>}
      </button>
    </>
  );
}

/** @param {import('../places.js').PlaceProps} props */
export function HomeScreen({ gate, facts, go, onReady, desktop, device }) {
  const corpus = useVotCorpus();
  const answers = useAnswersCorpusVersion();
  const sections = useAudioSyncSectionsVersion();
  const home = React.useMemo(
    () => (gate ? (gate.facts && gate.facts.home) || { continue: null, recent: [] } : savedHome()),
    // the corpus landing turns letter ids into numbers and titles; the compilations' timings (the player asks for them
    // when a played one is read) turn a Words To Live By compilation into its first entry
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [gate, corpus, answers, sections],
  );
  // an Answers topic in Continue or Recent asks for its own corpus (a gate boot's facts never hold one)
  React.useEffect(() => {
    if (!gate && wantsAnswers(home)) askAnswersCorpus().catch(() => { /* the loader flags the error; the topic stays out */ });
  }, [gate, home]);
  React.useEffect(() => { if (corpus !== 'loading') onReady(); }, [corpus, onReady]);
  // Today's reading (9h, 9i): the plans in settings and main's read record, read again each time Home draws (it comes
  // back to the top of the stack after a reading); the date turns over at midnight and on coming back to the front
  const seeded = gate ? (gate.facts && gate.facts.today) || null : null;
  const plans = gate ? (seeded ? seeded.plans : []) : savedPlans();
  const wantsVolumes = plans.some((p) => p.id === 'volumes');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- corpus is the trigger: liveSequence() reads the globals its load fills
  const seq = React.useMemo(() => (wantsVolumes ? liveSequence() : []), [wantsVolumes, corpus]);
  const now = useNow();
  const today = todayView({ plans, now: seeded ? new Date(seeded.now) : now, isRead: gate ? gateIsRead(plans, seq) : liveIsRead(), seq });
  const openPlanItem = (it) => { const r = itemRoute(it); if (r) go(r); };

  const contDesc = home.continue ? describeItem(home.continue) : null;
  const target = contDesc ? home.continue : FIRST;
  const targetDesc = contDesc || describeItem(FIRST);
  const recent = (home.recent || []).map((it) => ({ it, d: describeItem(it) })).filter((x) => x.d);
  const open = (it) => () => go(...itemRoutes(it));
  const openCol = (key) => () => go({ place: 'collection', collection: key });
  // Return to the Garden: main's notice first, until the reader has opened the Garden past it (vot-garden-warning-acked)
  const [notice, setNotice] = React.useState(() => !!(gate && gate.open && gate.open.sheet === 'garden-notice'));
  const openPlace = (place) => () => {
    if (place === 'garden' && !(gate ? gate.facts && gate.facts.gardenSeen : noticeSeen())) setNotice(true);
    else go({ place });
  };
  const left = VOLUMES.slice(0, 4);
  const right = VOLUMES.slice(4);

  return (
    <>
      <div className="page-head g tabroot home">
        <h1 className="display xl">The Volumes<br />of Truth</h1>
        <p className="subtitle fit">Letters from The Lord, Our God and Savior</p>
        <button type="button" className="pill block" onClick={open(target)}>
          {contDesc ? 'Continue reading' : 'Start reading'} <Icon name="arrowR" />
        </button>
        {targetDesc && <div className="cont-where">{targetDesc.title} · {targetDesc.where}</div>}
        {recent.length > 0 && (
          <div className="recent">
            <span className="label">Recent</span>
            {recent.map(({ it, d }, i) => <button key={i} type="button" className="chip" onClick={open(it)}>{d.chip}</button>)}
          </div>
        )}
        <TodayCard view={today} markOff={!gate && savedSettings().markAsRead === false}
          onPlans={() => go({ place: 'reading-plans' })} onRead={openPlanItem}
          onListen={(it) => { if (!listenItem(it)) openPlanItem(it); }} />
      </div>
      <div className="sec g"><span className="label">The Volumes of Truth</span></div>
      <div className="g">
        <div className="grid2 vols">
          {[left, right].map((vols, ci) => (
            <div className="col" key={ci}>
              {vols.map((v, i) => <VolumeCells key={v.key} vol={v} last={i === vols.length - 1} count={letterCount(v.key)} onOpen={openCol(v.key)} />)}
            </div>
          ))}
        </div>
      </div>
      <div className="rows home-rows">
        {ROWS.map((r) => (
          <Row key={r.t} t={r.t} s={r.place === 'bible' ? bibleSub(facts) : r.s}
            onClick={() => go(r.collection ? { place: r.place, collection: r.collection } : { place: r.place })} />
        ))}
      </div>
      <div className="sec g"><span className="label">More letters</span></div>
      <div className="rows">
        {MORE_LETTERS.map((key) => {
          const col = colOf(key);
          const n = letterCount(key);
          return <Row key={key} t={col ? col.label : key} s={n != null ? n + ' letters' : ''} onClick={openCol(key)} />;
        })}
      </div>
      <div className="sec g"><span className="label">Listen and see</span></div>
      <div className="rows end">
        {LISTEN_SEE.map((r) => <Row key={r.place} t={r.t} s={r.s} onClick={openPlace(r.place)} />)}
      </div>
      {notice && (
        <GardenNotice tier={noticeTier(gate)} gate={gate} device={device || 'phone'} desktop={!!desktop}
          onClose={() => setNotice(false)} onOpen={() => { setNotice(false); go({ place: 'garden' }); }} />
      )}
    </>
  );
}

/** The gear: Settings, from Home's top bar. */
function HomeActions({ go }) {
  return <button type="button" className="ic" aria-label="Settings" onClick={() => go({ place: 'settings' })}><Icon name="gear" /></button>;
}

definePlace('home', {
  Screen: HomeScreen,
  title: () => 'Home',
  actions: ({ go }) => <HomeActions go={go} />,
});
