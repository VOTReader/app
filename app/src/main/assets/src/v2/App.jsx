/* V2App - the v2 app shell (mw4, 2026-10-14; Corbin 10-14 17:4x "three, drop duplicates": three tabs Home / Search / Notes).

   Built from scratch on branch v2 in the design lane's kit (kit.css + screens.css): a phone column (top bar, the page,
   the tab bar, inside the system bars' insets) below 1024 css px; on a wider window the desktop rules D1-D5 (screens.css
   dz8 block: a left rail, one centred 688 px column, the page scrolling in .main). Navigation is one history stack; its
   root is the lit tab, the entry under the top names Back. The dev-only ?gate=<id> hook (gate.js) opens any built state
   with no taps and marks <html data-gate="ready"> once it is painted. */
import { Icon } from './Icon.jsx';
import { readGateId, gateState, markGate, whenPainted } from './gate.js';
import { savedFacts } from './settings-facts.js';
import { subscribeSettings, settingsVersion } from './settings-pages.js';
import { bookTitle } from './home-facts.js';
import { placeFor, startStack, OVERLAYS } from './places.js';
import { usePlayer, MiniPlayer, NowPlaying, PlayerSheet, PlayerBar } from './player/Player.jsx';
import { useFullScreen, FullScreenToast } from './player/full-screen.jsx';
import { SheetLayer, closeTopSheet } from './Sheet.jsx';
import { AaSheet } from './screens/AaSheet.jsx';
import { FindStrip } from './FindStrip.jsx';
import { AutoScrollPill } from './AutoScrollPill.jsx';
import { StorageBanner } from './StorageBanner.jsx';
import { applyLook, savedLook, saveLook, gateLook, sizeWord } from './look.js';
import { useReadingRecord } from './reading-record.js';
import { useReadingBars, READING_PLACES } from './reading-bars.js';
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
 * the top bar (the phone's bar sits above the scroller; the laptop's is sticky inside it); { to, gap } leaves `gap` px
 * between the bar and the element (`deskGap` on the laptop, when its picture puts it elsewhere); `phone: true` scrolls the
 * phone only (the laptop's picture sits at the top).
 * @param {HTMLElement} el @param {number | string | { to: string, gap?: number, deskGap?: number, phone?: boolean }} scroll
 * @param {boolean} [desktop]
 */
export function applyGateScroll(el, scroll, desktop = false) {
  if (typeof scroll === 'number') { el.scrollTop = scroll; return; }
  if (scroll === 'end') { el.scrollTop = el.scrollHeight; return; }
  if (typeof scroll === 'object' && scroll.phone && desktop) return;
  const sel = typeof scroll === 'string' ? scroll : scroll.to;
  const gap = typeof scroll === 'string' ? 0 : desktop && scroll.deskGap != null ? scroll.deskGap : scroll.gap || 0;
  const target = /** @type {HTMLElement | null} */ (el.querySelector(sel));
  if (!target) return;
  const bar = el.querySelector(':scope > .col > .tb');
  const top = bar ? bar.getBoundingClientRect().bottom : el.getBoundingClientRect().top;
  el.scrollTop += target.getBoundingClientRect().top - top - gap;
}

/**
 * applyGateScroll, kept true while the gate's page lives: 'end' stays the end when the scroller or its page changes size
 * after it (the APK sets --inset-top / --inset-bottom when the page has loaded, on the S22 after the gate's scroll; the
 * shell's padding then shrinks the scroller and a page left at the old scrollTop stops ~80 px short). `after` runs after
 * each placing. Returns the stop.
 * @param {HTMLElement} el @param {Parameters<typeof applyGateScroll>[1]} scroll @param {boolean} desktop
 * @param {() => void} after
 */
export function holdGateScroll(el, scroll, desktop, after) {
  const place = () => { applyGateScroll(el, scroll, desktop); after(); };
  place();
  if (scroll !== 'end' || typeof ResizeObserver === 'undefined') return () => {};
  const ro = new ResizeObserver(() => { if (el.scrollTop + el.clientHeight < el.scrollHeight - 1) place(); });
  ro.observe(el);
  for (const child of Array.from(el.children)) ro.observe(child);
  return () => ro.disconnect();
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

/**
 * The page tool a gate state opens with (1i: Find with its word typed; 1j: auto-scroll running), on the gate's own page.
 * @param {import('./gate.js').GateState | null} gate
 * @returns {({ kind: string, route: any } & Record<string, any>) | null}
 */
function gateTool(gate) {
  const o = gate && gate.open;
  const route = gate ? gate.stack[gate.stack.length - 1] : null;
  if (o && o.sheet === 'find') return { kind: 'find', q: o.q || '', route };
  if (o && o.sheet === 'auto-scroll') return { kind: 'auto-scroll', run: true, route };
  return null;
}

/** A page's identity for auto-scroll (a page the reader turned to by hand stops it, as main's). @param {Record<string, any>} r */
function placeKeyOf(r) {
  return [r.place, r.collection, r.n, r.book, r.chapter, r.preface ? 'preface' : ''].join(':');
}

/** @param {{ gateId?: string | null }} props */
export function V2App({ gateId = readGateId() }) {
  const gate = gateId ? gateState(gateId) : null;
  // a real boot opens where a registered start says (places.js: the welcome on a first visit), else Home
  const [stack, setStack] = React.useState(() => (gate ? gate.stack.slice() : startStack() || [{ place: 'home' }]));
  const [savedFactsAtBoot] = React.useState(() => (gate && gate.facts ? gate.facts : savedFacts()));
  // read again each time a Settings page changes one of main's settings (a gate boot keeps its picture's)
  const settingsVer = React.useSyncExternalStore(subscribeSettings, settingsVersion);
  // The reader's text and page (look.js): shown on <html> at once, kept in main's vot-state (never on a gate boot).
  const [look, setLook] = React.useState(() => (gate ? gateLook(gate) : savedLook()));
  const [shellSheet, setShellSheet] = React.useState(() => (gate && gate.open && gate.open.sheet === 'text-and-theme' ? 'text-and-theme' : null));
  // A page tool the ... opens over the page it was opened on (1i Find, 1j auto-scroll): it goes with that page; auto-scroll
  // goes on to the page its Next card turns to (main's pill stays across a turn).
  const [tool, setTool] = React.useState(() => gateTool(gate));
  React.useLayoutEffect(() => { applyLook(look, gate ? { bridge: null } : undefined); }, [look, gate]);
  const changeLook = React.useCallback((next) => { setLook(next); if (!gate) saveLook(next); }, [gate]);
  const facts = React.useMemo(() => (gate ? savedFactsAtBoot
    : { ...(settingsVer ? savedFacts() : savedFactsAtBoot), textSize: sizeWord(look.scale), page: look.page, lines: look.lines }),
  [gate, savedFactsAtBoot, look, settingsVer]);
  // main's Keep the screen on (Settings > Reading; main's use-settings effect): the app holds the screen awake while open
  React.useEffect(() => {
    const pb = gate ? null : g.PlatformBridge;
    if (pb && typeof pb.setKeepScreenOn === 'function') pb.setKeepScreenOn(facts.keepScreenOn !== false);
  }, [gate, facts.keepScreenOn]);
  const [ready, setReady] = React.useState(false);
  const [scrolled, setScrolled] = React.useState(false);
  const [layer, setLayer] = React.useState(/** @type {HTMLElement | null} */ (null));
  const desktop = useDesktop();
  const scrollRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const route = stack[stack.length - 1];
  const tab = stack[0].place;
  const stackRef = React.useRef(stack);
  stackRef.current = stack;
  const pageTool = tool && tool.route === route ? tool : null;
  /** The shell's own sheet (Aa's Text and theme) or a page tool on this page ('find', with { q, near } from a landing). */
  const openShell = React.useCallback((/** @type {string} */ name, /** @type {Record<string, any>} */ opts = {}) => {
    if (name === 'find') setTool({ ...opts, kind: 'find', route });
    else if (name === 'auto-scroll') setTool({ kind: 'auto-scroll', run: true, route });
    else setShellSheet(name);
  }, [route]);
  const back = stack.length > 1 ? routeTitle(stack[stack.length - 2]) : null;
  // The player is shell chrome (rv1): the mini player / player bar, Now playing, its sheets, and full screen.
  const player = usePlayer(gate);
  const fs = useFullScreen({ enabled: !desktop && route.place === 'letter' && facts.doubleTapFullscreen !== false, gate });
  // The phone's bars step aside while a recording plays on a reading page scrolled into its text (reading-bars.js).
  const bars = useReadingBars({ scrollRef, on: !desktop && !fs.full && READING_PLACES.includes(route.place) && !!player.playing, page: route });
  const barsRef = React.useRef(bars);
  barsRef.current = bars;

  // Back returns to where a page was left (a letter after its note, a list after a letter): each page's scroll is kept
  // while a page above it is open.
  const kept = React.useRef(/** @type {number[]} */ ([]));
  const popped = React.useRef(false);
  const onReady = React.useCallback(() => setReady(true), []);
  const go = React.useCallback((...routes) => {
    setReady(false);
    // auto-scroll stops on a page the reader leaves: back on it, its pill waits paused
    setTool((t) => (t && t.kind === 'auto-scroll' && t.run ? { ...t, run: false } : t));
    setStack((s) => { kept.current[s.length - 1] = scrollRef.current ? scrollRef.current.scrollTop : 0; return s.concat(routes); });
  }, []);
  const pop = React.useCallback(() => { setReady(false); popped.current = true; setStack((s) => (s.length > 1 ? s.slice(0, -1) : s)); }, []);
  const openTab = React.useCallback((id) => { setReady(false); kept.current = []; setStack([{ place: id }]); }, []);
  const replace = React.useCallback((r) => {
    setReady(false);
    const was = stackRef.current[stackRef.current.length - 1];
    setTool((t) => (t && t.kind === 'auto-scroll' && t.route === was ? { ...t, route: r } : t));
    setStack((s) => s.slice(0, -1).concat(r));
  }, []);

  // The gate: an unknown id says so at once; a known one is ready once its screen has said so and that is painted.
  React.useEffect(() => {
    if (!gateId) return undefined;
    if (!gate) { markGate('unknown'); return undefined; }
    if (!ready || !player.ready) { markGate('waiting'); return undefined; }
    const el = scrollRef.current;
    const stop = el && gate.scroll != null
      ? holdGateScroll(el, gate.scroll, desktop, () => { setScrolled(el.scrollTop > 0); barsRef.current.check(); })
      : () => {};
    let live = true;
    whenPainted().then(() => { if (live) markGate('ready'); });
    return () => { live = false; stop(); };
  }, [gateId, gate, ready, player.ready, desktop]);

  // Android's back (MainActivity calls window.handleAndroidBack): close an open sheet, else pop the stack, or let Android
  // leave at a root.
  const chromeRef = React.useRef({ player, fs, pageTool });
  chromeRef.current = { player, fs, pageTool };
  React.useEffect(() => {
    g.handleAndroidBack = () => {
      if (closeTopSheet()) return 'true';
      if (chromeRef.current.pageTool) { setTool(null); return 'true'; }
      if (chromeRef.current.player.back() || chromeRef.current.fs.exit()) return 'true';
      if (stackRef.current.length > 1) { pop(); return 'true'; }
      return 'false';
    };
    return () => { delete g.handleAndroidBack; };
  }, [pop]);

  // A new page starts at its top, a page Back returns to where it was left; the top bar draws its hairline once the page
  // has scrolled under it.
  React.useEffect(() => {
    const depth = stackRef.current.length - 1;
    const at = popped.current ? kept.current[depth] || 0 : 0;
    popped.current = false;
    kept.current.length = Math.min(kept.current.length, depth);
    if (scrollRef.current) scrollRef.current.scrollTop = at;
    setScrolled(!!scrollRef.current && scrollRef.current.scrollTop > 0);
  }, [route]);
  const onScroll = React.useCallback((e) => {
    const s = e.currentTarget.scrollTop > 0;
    setScrolled((was) => (was === s ? was : s));
    barsRef.current.check();
  }, []);

  // What the reader reads is kept as main keeps it (reading-record.js): history, place, read marks. Never on a gate boot.
  useReadingRecord({ route, ready, scrollRef, live: !gate });

  let screen;
  let contentClass = 'content';
  let actions = null;
  const device = desktop ? 'computer' : 'phone';
  const def = placeFor(route.place);
  const bare = !!(def && def.bare);
  if (def) {
    const Screen = def.Screen;
    contentClass = def.contentClass || 'content';
    actions = def.actions ? def.actions({ route, go, desktop, device, open: openShell, gate, facts }) : null;
    screen = <Screen route={route} facts={facts} gate={gate} desktop={desktop} device={device}
      go={go} pop={pop} replace={replace} openTab={openTab} onReady={onReady} open={openShell} />;
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
  // main's storage health strip (9f, 9g): under the top bar, in the flow, on every screen; nothing while all is well
  const banner = <StorageBanner gate={gate} go={go} />;
  const noun = def && def.find ? def.find(route) : '';
  const findStrip = pageTool && pageTool.kind === 'find' && noun
    ? <FindStrip key={stack.length + ':' + (pageTool.near ? 'l' : 'm')} rootRef={scrollRef} noun={noun} start={{ q: pageTool.q, near: pageTool.near, nearOff: pageTool.nearOff, terms: pageTool.terms }}
        gate={gate} onClose={() => setTool(null)} />
    : null;
  // auto-scroll (1j): opened by the ...; with main's Auto-scroll setting on it waits on every reading page; Stop closes it
  const autoOn = !bare && !fs.full && (pageTool ? pageTool.kind === 'auto-scroll'
    : !!facts.autoScroll && READING_PLACES.includes(route.place));
  const autoPill = autoOn
    ? <AutoScrollPill scrollRef={scrollRef} placeKey={placeKeyOf(route)} ready={ready} run={!!(pageTool && pageTool.run)} gate={gate}
        onClose={() => setTool({ kind: 'closed', route })} />
    : null;

  // the layer sheets and dialogs portal into (Sheet.jsx): over the whole window, outside the scrolling page; the shell's
  // own sheet (Text and theme, from a reading page's Aa) goes there too
  const layerHost = (
    <>
      <div className="v2-layer" ref={setLayer} />
      {Object.keys(OVERLAYS).map((id) => {
        const Overlay = OVERLAYS[id];
        return <Overlay key={id} route={route} gate={gate} desktop={desktop} go={go} openTab={openTab} />;
      })}
      {shellSheet === 'text-and-theme' && <AaSheet look={look} desktop={desktop} onChange={changeLook} onClose={() => setShellSheet(null)} />}
    </>
  );

  if (desktop) {
    return (
      <SheetLayer.Provider value={layer}>
        <div className={'v2 dk' + (bare ? ' bare' : '')}>
          {!bare && <nav className="rail" data-zone="rail" aria-label="Places">{tabs}</nav>}
          <div className="pane">
            <div className="main" ref={scrollRef} onScroll={onScroll} data-scroller="">
              <div className="col anc" data-zone="col">
                {!bare && bar}
                {!bare && banner}
                {!bare && findStrip}
                <div className={contentClass}>{screen}</div>
              </div>
            </div>
            {!bare && <PlayerBar player={player} />}
            {autoPill}
            <NowPlaying player={player} desktop go={go} />
          </div>
          <PlayerSheet player={player} desktop />
          {layerHost}
        </div>
      </SheetLayer.Provider>
    );
  }
  return (
    <SheetLayer.Provider value={layer}>
      <div className={'v2 v2-phone' + (fs.full ? ' full' : '') + (bare ? ' bare' : '') + (bars.hidden ? ' bars-off' : '')}>
        {!fs.full && !bare && !bars.hidden && bar}
        {!fs.full && !bare && banner}
        {!fs.full && !bare && findStrip}
        <div className={contentClass + (fs.full ? ' full' : '')} ref={scrollRef} onScroll={onScroll} data-scroller="">{screen}<FullScreenToast text={fs.full ? fs.toast : null} /></div>
        {!fs.full && !bare && <MiniPlayer player={player} />}
        {autoPill}
        {!fs.full && !bare && !bars.hidden && <nav className="tabbar" aria-label="Places">{tabs}</nav>}
        <NowPlaying player={player} desktop={false} go={go} />
        <PlayerSheet player={player} desktop={false} />
        {layerHost}
      </div>
    </SheetLayer.Provider>
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
