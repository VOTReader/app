/* ═══════════════════════════════════════════════════════════════════════
   LibraryNav — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

export function LibraryNav(opts) {
  opts = opts || {};
  return (
    <>
      <button
        className="nav-home nav-back-icon"
        onClick={opts.onBack}
        title={opts.backTitle || "Back"}
        aria-label={opts.backTitle || "Back"}
      >
        {"‹"}
      </button>
      <HomeBtn />
      {opts.leftExtras || null}
      <NavButtons
        onSettings={opts.onSettings}
        onHistory={opts.onHistory}
        onSearch={opts.onSearch}
        theme={opts.theme}
        onThemeChange={opts.onThemeChange}
      />
      {opts.rightExtras || null}
    </>
  );
}
