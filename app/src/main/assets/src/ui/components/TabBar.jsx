/* ═══════════════════════════════════════════════════════════════════════
   TabBar — the four tabs at the bottom: Home / Read / Listen / Library
   (rs1, overhaul review build, 2026-10-05). Cluster D (bundle-d.js).
   ═══════════════════════════════════════════════════════════════════════
   The look is Corbin's reference (lanes/hub/out/overhaul-2026-10-05/ref):
   the page's own color, a hairline on top, a 26px line icon over a serif
   label; the lit tab's icon is FILLED and it and its label are gold.

   State lives in BottomTabs (utils/bottom-tabs.js, bundle-b, a window
   global here): which tab is lit and each tab's saved stack. A tap on the
   lit tab pops it to its root.

   Hidden in the immersive views (the Garden, the Scripture Web) and in
   browser fullscreen (app.css). While it shows, body:has(.tabbar) sets
   --tabbar-h and the bottom dock stands on it (app.css BOTTOM DOCK).
   ═══════════════════════════════════════════════════════════════════════ */

const IMMERSIVE = new Set(['garden-view', 'scripture-web']);

const ICONS = {
  home: (on) => (
    <>
      <path d="M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill={on ? 'currentColor' : 'none'} />
      <path d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" stroke={on ? 'var(--bg)' : 'currentColor'} />
    </>
  ),
  read: (on) => (
    <>
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" fill={on ? 'currentColor' : 'none'} />
      <path d="M12 7v14" stroke={on ? 'var(--bg)' : 'currentColor'} />
    </>
  ),
  listen: (on) => (
    <>
      <path d="M3 14v-2a9 9 0 0 1 18 0v2" />
      <path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill={on ? 'currentColor' : 'none'} />
      <path d="M21 14h-3a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2z" fill={on ? 'currentColor' : 'none'} />
    </>
  ),
  library: (on) => (on ? (
    <>
      <rect x="3" y="3.5" width="3" height="17" rx="0.75" fill="currentColor" />
      <rect x="7.5" y="7.5" width="3" height="13" rx="0.75" fill="currentColor" />
      <rect x="12" y="5.5" width="3" height="15" rx="0.75" fill="currentColor" />
      <path d="m16.5 6.5 3.5 13.5" strokeWidth="3" />
    </>
  ) : (
    <>
      <path d="M4 4v16" /><path d="M8.5 8v12" /><path d="M13 6v14" /><path d="m16.5 6 4 14" />
    </>
  )),
};

// BottomTabs is bundle-b's window global; without it (a test page) there is no bar.
export function TabBar(props) {
  return typeof BottomTabs === 'undefined' ? null : <TabBarInner {...props} />;
}

function TabBarInner({ screen }) {
  const [active, setActive] = React.useState(() => BottomTabs.active());
  React.useEffect(() => BottomTabs.subscribe(() => setActive(BottomTabs.active())), []);
  // A tab's root has no back arrow (Back still leaves it for Home): app.css reads body[data-tab-root].
  const atRoot = screen === BottomTabs.rootOf(active);
  React.useEffect(() => {
    if (atRoot) document.body.setAttribute('data-tab-root', active); else document.body.removeAttribute('data-tab-root');
  }, [atRoot, active]);
  React.useEffect(() => () => document.body.removeAttribute('data-tab-root'), []);
  if (IMMERSIVE.has(screen)) return null;
  return (
    <nav className="tabbar" aria-label="Main">
      {BOTTOM_TABS.map((t) => {
        const on = t.id === active;
        return (
          <button
            key={t.id}
            type="button"
            className={'tabbar-tab' + (on ? ' is-active' : '')}
            aria-current={on ? 'page' : undefined}
            onClick={() => BottomTabs.select(t.id)}
          >
            <svg className="tabbar-icon" viewBox="0 0 24 24" width="26" height="26" aria-hidden="true"
              fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              {ICONS[t.id](on)}
            </svg>
            <span className="tabbar-label">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
