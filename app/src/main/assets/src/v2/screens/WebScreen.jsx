/* WebScreen - The Scripture Web in v2 (zones v2p8 to design's dz14 5e).

   Main's ScriptureWebScreen (bundle-d, on window) hosted whole: its canvas, geometry, gestures, panels and its upright-
   phone turn are main's; v2 gives it main's props. settings: the reader's saved settings, kept current as the screen
   writes them (updateSetting is main's setting write); navigateToLink: the passage opens in v2's own place (web-facts);
   onBack: v2's Back. Android's Back sends main's screen an Escape, so main's own rule runs: the top panel closes first,
   else the web leaves. It is a bare place: on the phone it covers the window as main's does; the laptop keeps its rail
   and the web fills the pane beside it (scripture-web.css). Main loads both corpora as the web opens (the Bible's for
   the verse previews, the letters' for My web), here too. A gate boot (5e) hands it the picture's settings, writes and
   loads nothing more, and is ready once the web has drawn.
   A door (mw13: a reference's or footnote's "Show in Scripture Web", a page's ... row) opens it with route.start, main's
   start prop ({ verse }, { book, chapter? }, { letterKey }). Main reads a start once per mount and a start wins over its
   resume point, so it is spent once per route OBJECT: Back from a verse the web opened remounts the web with the same
   route, and it then resumes where the reader was, as main's spent navHandoff 'webStart' does. */
import { definePlace } from '../places.js';
import { pushBackStep } from '../Sheet.jsx';
import { savedSettings, writeSetting } from '../settings-pages.js';
import { webRoute, GATE_WEB_SETTINGS } from '../web-facts.js';

const g = /** @type {any} */ (globalThis);

/** The routes whose start the web has had. */
const spent = new WeakSet();

/** A route's start the first time the web mounts with it, else undefined. @param {any} route */
export function takeStart(route) {
  if (!route || !route.start || typeof route.start !== 'object' || spent.has(route)) return undefined;
  spent.add(route);
  return route.start;
}

/** @param {import('../places.js').PlaceProps} props */
export function WebScreen({ route, gate, go, pop, onReady }) {
  const Main = g.ScriptureWebScreen;
  const [start] = React.useState(() => takeStart(route));
  const hostRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const [settings, setSettings] = React.useState(() => (gate ? { ...GATE_WEB_SETTINGS } : savedSettings()));

  React.useEffect(() => {
    if (gate) return;
    if (typeof g.__loadBibleCorpus === 'function') g.__loadBibleCorpus();
    if (typeof g.__loadVotCorpus === 'function') g.__loadVotCorpus();
  }, [gate]);

  const updateSetting = React.useCallback((key, val) => {
    setSettings((s) => ({ ...s, [key]: val }));
    if (!gate) writeSetting(key, val);
  }, [gate]);

  const navigateToLink = React.useCallback((endpoint) => {
    if (gate) return;
    const route = webRoute(endpoint);
    if (route) go(route);
  }, [gate, go]);

  // Android's Back: main's Escape (closes the top panel, else onBack); without the web's root (main's no-WebGL list) Back
  // leaves
  React.useEffect(() => pushBackStep(() => {
    const root = hostRef.current && hostRef.current.querySelector('.sw-root');
    if (root) root.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    else pop();
  }), [pop]);

  // ready once the web has drawn: main's "Weaving the web…" gone (or its no-WebGL list up), then two frames; with no main
  // screen (bundle-d absent) there is nothing to wait for
  React.useEffect(() => {
    const host = hostRef.current;
    if (!gate || !host || typeof Main !== 'function') { onReady(); return undefined; }
    let live = true;
    let raf = 0;
    const drawn = () => !host.querySelector('.sw-loading') && !!host.querySelector('.sw-root, .sw-fallback-list, .sw-fallback');
    const settle = () => { raf = requestAnimationFrame(() => { raf = requestAnimationFrame(() => { if (live) onReady(); }); }); };
    if (drawn()) { settle(); return () => { live = false; cancelAnimationFrame(raf); }; }
    const mo = new MutationObserver(() => { if (drawn()) { mo.disconnect(); settle(); } });
    mo.observe(host, { childList: true, subtree: true });
    return () => { live = false; mo.disconnect(); cancelAnimationFrame(raf); };
  }, [gate, onReady, Main]);

  if (typeof Main !== 'function') return <div className="sw-host" ref={hostRef} />;
  return (
    <div className="sw-host" ref={hostRef}>
      <Main navigateToLink={navigateToLink} onBack={pop} settings={settings} updateSetting={updateSetting} start={start} />
    </div>
  );
}

// bare: main's screen covers the phone's window (no top bar, player or tabs); `rail`: the laptop keeps its rail
definePlace('scripture-web', { Screen: WebScreen, bare: true, rail: true, contentClass: 'content web', title: () => 'The Scripture Web' });
