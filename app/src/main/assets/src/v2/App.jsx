/* V2App - the v2 app shell (mw4, 2026-10-14; Corbin 10-14 17:4x "three, drop duplicates": three tabs Home / Search / Notes).

   Built from scratch on branch v2 in the design lane's kit (kit.css + screens.css): a phone column (top bar, the page,
   the tab bar, inside the system bars' insets) below 1024 css px; on a wider window the desktop rules D1-D5 (screens.css
   dz8 block: a left rail, one centred 688 px column, the page scrolling in .main). Navigation is one history stack; its
   root is the lit tab, the entry under the top names Back. The dev-only ?gate=<id> hook (gate.js) opens any built state
   with no taps and marks <html data-gate="ready"> once it is painted. */
import { Icon } from './Icon.jsx';
import { readGateId, gateState, markGate, whenPainted } from './gate.js';
import { savedFacts } from './settings-facts.js';
import { bookTitle } from './home-facts.js';
import { placeFor } from './places.js';
import './screens/index.js';

const g = /** @type {any} */ (globalThis);
export const DESKTOP_QUERY = '(min-width: 1024px)';
export const TABS = [
  { id: 'home', label: 'Home', icon: 'tab.home' },
  { id: 'search', label: 'Search', icon: 'tab.search' },
  { id: 'notes', label: 'Notes', icon: 'tab.notes' },
];

/** True on a window 1024 css px or wider (the desktop rules). */
export function useDesktop() {
  const mq = React.useMemo(() => (typeof g.matchMedia === 'function' ? g.matchMedia(DESKTOP_QUERY) : null), []);
  const subscribe = React.useCallback((cb) => {
    if (!mq) return () => {};
    mq.addEventListener('change', cb);
    return () => mq.removeEventListener('change', cb);
  }, [mq]);
  return React.useSyncExternalStore(subscribe, () => !!(mq && mq.matches));
}

/** The names of places no screen file has registered yet (a registered place's title() wins). */
const PLACE_TITLES = {
  home: 'Home', search: 'Search', notes: 'Notes', settings: 'Settings',
  bible: 'The Bible', studies: 'Studies', 'reading-plans': 'Reading plans',
  songs: 'Songs of the Letters', garden: 'Return to the Garden', 'scripture-web': 'The Scripture Web',
  'settings/text': 'Text and theme', 'settings/reading': 'Reading', 'settings/listening': 'Listening',
  'settings/downloads': 'Downloads', 'settings/your-data': 'Your data', 'settings/help': 'Help and about',
};

/** What a route is called: its own title, and what Back says on the page above it. @param {import('./gate.js').Route & Record<string, any>} r */
export function routeTitle(r) {
  if (!r) return '';
  const def = placeFor(r.place);
  if (def && def.title) return def.title(r);
  if (Object.prototype.hasOwnProperty.call(PLACE_TITLES, r.place)) return PLACE_TITLES[r.place];
  if (r.place === 'bible-book') return bookTitle({ book: r.book });
  if (r.place === 'bible-chapter') return bookTitle({ book: r.book }) + ' ' + r.chapter;
  return '';
}

/**
 * Scrolls `el` so the gate's `scroll` holds: a number is px from the top; a selector puts that element's top right under
 * the top bar (the phone's bar sits above the scroller; the laptop's is sticky inside it).
 * @param {HTMLElement} el @param {number | string} scroll
 */
export function applyGateScroll(el, scroll) {
  if (typeof scroll === 'number') { el.scrollTop = scroll; return; }
  const target = /** @type {HTMLElement | null} */ (el.querySelector(scroll));
  if (!target) return;
  const bar = el.querySelector(':scope > .col > .tb');
  const top = bar ? bar.getBoundingClientRect().bottom : el.getBoundingClientRect().top;
  el.scrollTop += target.getBoundingClientRect().top - top;
}

function TopBar({ back, onBack, actions, scrolled }) {
  if (!back) {
    return <div className={'tb' + (scrolled ? ' scrolled' : '')}><span className="appname">VOTReader</span>{actions}</div>;
  }
  return (
    <div className={'tb has-back' + (scrolled ? ' scrolled' : '')}>
      <button type="button" className="ic" aria-label={'Back to ' + back} onClick={onBack}><Icon name="arrowL" /></button>
      <span className="title">{back}</span>
      {actions}
    </div>
  );
}

/** A place v2 has not built yet: says so plainly, keeps the shell usable. */
function NotYet({ title, onReady }) {
  React.useEffect(() => { if (onReady) onReady(); }, [onReady]);
  return (
    <div className="page-head g">
      <h1 className="display">{title}</h1>
      <p className="lede">Not built yet in v2.</p>
    </div>
  );
}

/** @param {{ gateId?: string | null }} props */
export function V2App({ gateId = readGateId() }) {
  const gate = gateId ? gateState(gateId) : null;
  const [stack, setStack] = React.useState(() => (gate ? gate.stack.slice() : [{ place: 'home' }]));
  const [facts] = React.useState(() => (gate && gate.facts ? gate.facts : savedFacts()));
  const [ready, setReady] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const desktop = useDesktop();
  const scrollRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const route = stack[stack.length - 1];
  const tab = stack[0].place;
  const back = stack.length > 1 ? routeTitle(stack[stack.length - 2]) : null;

  const onReady = React.useCallback(() => setReady(true), []);
  const go = React.useCallback((...routes) => { setReady(false); setStack((s) => s.concat(routes)); }, []);
  const pop = React.useCallback(() => { setReady(false); setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)); }, []);
  const openTab = React.useCallback((id) => { setReady(false); setStack([{ place: id }]); }, []);
  const replace = React.useCallback((r) => { setReady(false); setStack((s) => s.slice(0, -1).concat(r)); }, []);

  // The gate: an unknown id says so at once; a known one is ready once its screen has said so and that is painted.
  React.useEffect(() => {
    if (!gateId) return undefined;
    if (!gate) { markGate('unknown'); return undefined; }
    if (!ready) { markGate('waiting'); return undefined; }
    const el = scrollRef.current;
    if (el && gate.scroll != null) { applyGateScroll(el, gate.scroll); setScrolled(el.scrollTop > 0); }
    let live = true;
    whenPainted().then(() => { if (live) markGate('ready'); });
    return () => { live = false; };
  }, [gateId, gate, ready]);

  // Android's back (MainActivity calls window.handleAndroidBack): pop the stack, or let Android leave at a root.
  const stackRef = React.useRef(stack);
  stackRef.current = stack;
  React.useEffect(() => {
    g.handleAndroidBack = () => {
      if (stackRef.current.length > 1) { pop(); return 'true'; }
      return 'false';
    };
    return () => { delete g.handleAndroidBack; };
  }, [pop]);

  // A new page starts at its top; the top bar draws its hairline once the page has scrolled under it.
  React.useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; setScrolled(false); }, [route]);
  const onScroll = React.useCallback((e) => {
    const s = e.currentTarget.scrollTop > 0;
    setScrolled((was) => (was === s ? was : s));
  }, []);

  let screen;
  let contentClass = 'content';
  let actions = null;
  const device = desktop ? 'computer' : 'phone';
  const def = placeFor(route.place);
  if (def) {
    const Screen = def.Screen;
    contentClass = def.contentClass || 'content';
    actions = def.actions ? def.actions({ route, go, desktop, device }) : null;
    screen = <Screen route={route} facts={facts} gate={gate} desktop={desktop} device={device}
      go={go} pop={pop} replace={replace} openTab={openTab} onReady={onReady} />;
  } else {
    screen = <NotYet title={routeTitle(route)} onReady={onReady} />;
  }

  const tabs = TABS.map((t) => (
    <button key={t.id} type="button" className={'tab' + (t.id === tab ? ' on' : '')} aria-current={t.id === tab ? 'page' : undefined}
      onClick={() => openTab(t.id)}>
      <Icon name={t.icon} on={t.id === tab} />{t.label}
    </button>
  ));
  const bar = <TopBar back={back} onBack={pop} actions={actions} scrolled={scrolled} />;

  if (desktop) {
    return (
      <div className="v2 dk">
        <nav className="rail" data-zone="rail" aria-label="Places">{tabs}</nav>
        <div className="pane">
          <div className="main" ref={scrollRef} onScroll={onScroll}>
            <div className="col" data-zone="col">
              {bar}
              <div className={contentClass}>{screen}</div>
            </div>
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="v2 v2-phone">
      {bar}
      <div className={contentClass} ref={scrollRef} onScroll={onScroll}>{screen}</div>
      <nav className="tabbar" aria-label="Places">{tabs}</nav>
    </div>
  );
}

/**
 * The root index.html mounts. A real boot waits for HydrationGate (bundle-b's global: the stores load, the data-safety pass
 * and the late-load remount run exactly as on main), so every screen reads the reader's saved data. A ?gate=<id> boot
 * skips it: the state is seeded in memory and nothing may touch the reader's storage.
 * @param {{ gateId?: string | null }} props
 */
export function V2Root({ gateId = readGateId() }) {
  const Gate = g.HydrationGate;
  if (gateId || typeof Gate !== 'function') return <V2App gateId={gateId} />;
  return <Gate><V2App gateId={null} /></Gate>;
}
