/* V2App - the v2 app shell (mw4, 2026-10-14; Corbin 10-14 17:4x "three, drop duplicates": three tabs Home / Search / Notes).

   Built from scratch on branch v2 in the design lane's kit (kit.css + screens.css): a phone column (top bar, the page,
   the tab bar, inside the system bars' insets) below 1024 css px; on a wider window the desktop rules D1-D5 (screens.css
   dz8 block: a left rail, one centred 688 px column, the page scrolling in .main). Navigation is one history stack; its
   root is the lit tab, the entry under the top names Back. The dev-only ?gate=<id> hook (gate.js) opens any built state
   with no taps and marks <html data-gate="ready"> once it is painted. */
import { Icon } from './Icon.jsx';
import { readGateId, gateState, markGate, whenPainted } from './gate.js';
import { savedFacts } from './settings-facts.js';
import { SettingsScreen } from './screens/SettingsScreen.jsx';
import { LetterScreen, collectionOf, letterAt } from './screens/LetterScreen.jsx';

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

/** What a route is called: its own title, and what Back says on the page above it. @param {import('./gate.js').Route} r */
export function routeTitle(r) {
  if (!r) return '';
  if (r.place === 'home') return 'Home';
  if (r.place === 'settings') return 'Settings';
  if (r.place === 'search') return 'Search';
  if (r.place === 'notes') return 'Notes';
  if (r.place === 'collection' || r.place === 'letter') {
    const col = collectionOf(r.collection);
    if (r.place === 'collection') return col ? col.label : '';
    const list = col && Array.isArray(g[col.globalName]) ? g[col.globalName] : null;
    const letter = list ? letterAt(list, r.n) : null;
    return letter ? letter.title : (col ? col.label : '');
  }
  return '';
}

function TopBar({ back, onBack, actions }) {
  if (!back) {
    return <div className="tb"><span className="appname">VOTReader</span>{actions}</div>;
  }
  return (
    <div className="tb has-back">
      <button type="button" className="ic" aria-label={'Back to ' + back} onClick={onBack}><Icon name="arrowL" /></button>
      <span className="title">{back}</span>
      {actions}
    </div>
  );
}

const LETTER_ACTIONS = (
  <>
    <button type="button" className="ic" aria-label="Bookmark"><Icon name="bookmark" /></button>
    <button type="button" className="ic" aria-label="Text and theme"><Icon name="aa" /></button>
    <button type="button" className="ic" aria-label="More"><Icon name="more" /></button>
  </>
);

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

function HomeScreen({ go, onReady }) {
  React.useEffect(() => { if (onReady) onReady(); }, [onReady]);
  return (
    <>
      <div className="page-head g"><h1 className="display">Home</h1><p className="lede">The v2 build: Home is next.</p></div>
      <div className="rows end">
        <button type="button" className="row" onClick={() => go({ place: 'collection', collection: 'one' }, { place: 'letter', collection: 'one', n: 1 })}>
          <span className="tx"><span className="t">Chosen by God</span><span className="s">Volume One · Letter 1</span></span>
          <span className="chev"><Icon name="chev" /></span>
        </button>
        <button type="button" className="row" onClick={() => go({ place: 'settings' })}>
          <span className="tx"><span className="t">Settings</span><span className="s">Text, reading, listening, your data</span></span>
          <span className="chev"><Icon name="chev" /></span>
        </button>
      </div>
    </>
  );
}

/** @param {{ gateId?: string | null }} props */
export function V2App({ gateId = readGateId() }) {
  const gate = gateId ? gateState(gateId) : null;
  const [stack, setStack] = React.useState(() => (gate ? gate.stack.slice() : [{ place: 'home' }]));
  const [facts] = React.useState(() => (gate && gate.facts ? gate.facts : savedFacts()));
  const [ready, setReady] = React.useState(false);
  const desktop = useDesktop();
  const scrollRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const route = stack[stack.length - 1];
  const tab = stack[0].place;
  const back = stack.length > 1 ? routeTitle(stack[stack.length - 2]) : null;

  const onReady = React.useCallback(() => setReady(true), []);
  const go = React.useCallback((...routes) => { setReady(false); setStack((s) => s.concat(routes)); }, []);
  const pop = React.useCallback(() => { setReady(false); setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)); }, []);
  const openTab = React.useCallback((id) => { setReady(false); setStack([{ place: id }]); }, []);

  // The gate: an unknown id says so at once; a known one is ready once its screen has said so and that is painted.
  React.useEffect(() => {
    if (!gateId) return undefined;
    if (!gate) { markGate('unknown'); return undefined; }
    if (!ready) { markGate('waiting'); return undefined; }
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

  // A new page starts at its top.
  React.useEffect(() => { if (scrollRef.current) scrollRef.current.scrollTop = 0; }, [route]);

  let screen;
  let contentClass = 'content';
  let actions = null;
  if (route.place === 'settings') {
    screen = <SettingsScreen facts={facts} device={desktop ? 'computer' : 'phone'} onReady={onReady} />;
  } else if (route.place === 'letter') {
    contentClass = 'content reader';
    actions = LETTER_ACTIONS;
    const openLetter = (n) => { setReady(false); setStack((s) => s.slice(0, -1).concat({ place: 'letter', collection: route.collection, n })); };
    screen = <LetterScreen key={route.collection + '/' + route.n} collection={route.collection} n={route.n} onReady={onReady} onOpenLetter={openLetter} />;
  } else if (route.place === 'home') {
    screen = <HomeScreen go={go} onReady={onReady} />;
  } else {
    screen = <NotYet title={routeTitle(route)} onReady={onReady} />;
  }

  const tabs = TABS.map((t) => (
    <button key={t.id} type="button" className={'tab' + (t.id === tab ? ' on' : '')} aria-current={t.id === tab ? 'page' : undefined}
      onClick={() => openTab(t.id)}>
      <Icon name={t.icon} on={t.id === tab} />{t.label}
    </button>
  ));
  const bar = <TopBar back={back} onBack={pop} actions={actions} />;

  if (desktop) {
    return (
      <div className="v2 dk">
        <nav className="rail" data-zone="rail" aria-label="Places">{tabs}</nav>
        <div className="pane">
          <div className="main" ref={scrollRef}>
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
      <div className={contentClass} ref={scrollRef}>{screen}</div>
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
