/* ═══════════════════════════════════════════════════════════════════════
   LibraryNav — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   THE shared top-nav for every screen that renders through ScreenLayout.
   Before 2026-07-30 there were 19 hand-rolled navs across 54 routes; the
   back arrow was only enlarged on the ones that happened to spell the
   class list right. This module owns the left slot (back + Home), the
   optional reading arrows, and the right icon cluster (NavButtons).

   Called as a plain FUNCTION returning a fragment — `LibraryNav({…})`, not
   `<LibraryNav …/>`. Every call site and several test stubs depend on that
   opts-object convention, so it must never hold hooks.

   ScreenLayout appends ResumeReadingNavBtn + TabsNavBtn itself — this
   module must never render either, or every screen gets duplicates.

   Load-bearing details, do not "clean up":
   - the back button keeps BOTH classes: `nav-home` (the right-cluster
     margin-right:auto anchor, app.css:318-319) and `nav-back-icon` (the
     2.1rem glyph, app.css:544 + the px pin at the end of app.css).
   - HomeBtn's title="Home" is the anchor selector on screens that have it.
   - NavButtons' title strings ("Settings"/"History"/"Search") are what the
     Settings visibility toggles select on (app.css:320-338).

   Options (all optional):
     onBack, backLabel   destination NAME → title "← X", aria "Back to X"
     backTitle           legacy raw string for title+aria (backLabel wins)
     hideBack            omit the back button entirely (home screen)
     showHome            default true; false omits HomeBtn (hub landings)
     onHomeBefore        HomeBtn beforeGo (overlay hosts dismiss first)
     leftExtras / rightExtras   free JSX either side of the cluster
     arrows              { onPrev, onNext, prevDisabled, nextDisabled,
                           prevTitle, nextTitle, prevLabel, nextLabel }
     reading             NavButtons reading flag (history btn accent)
     chapterBookmark     { hlKey, label } → ChapterBookmarkBtn
     hide                ['settings'|'history'|'search'|'theme']
     onSettings / onHistory / onSearch / theme / onThemeChange
   ═══════════════════════════════════════════════════════════════════════ */

export function LibraryNav(opts) {
  opts = opts || {};
  // Two historical conventions reconciled: backLabel names the DESTINATION
  // ("← Volumes" / "Back to Volumes"), backTitle is the raw legacy string
  // ("Back", "Done"). backLabel wins when both are given.
  const raw = opts.backTitle || "Back";
  const backTitle = opts.backLabel ? "← " + opts.backLabel : raw;
  const backAria = opts.backLabel ? "Back to " + opts.backLabel : raw;
  const arrows = opts.arrows;
  return (
    <>
      {opts.hideBack ? null : (
        <button
          className="nav-home nav-back-icon"
          onClick={opts.onBack}
          title={backTitle}
          aria-label={backAria}
        >
          {"‹"}
        </button>
      )}
      {opts.showHome === false ? null : <HomeBtn beforeGo={opts.onHomeBefore || null} />}
      {opts.leftExtras || null}
      {arrows ? (
        <div className="nav-arrows">
          <button
            className="nav-arrow-btn"
            disabled={!!arrows.prevDisabled}
            onClick={arrows.onPrev}
            title={arrows.prevTitle || "Previous"}
            aria-label={arrows.prevLabel || arrows.prevTitle || "Previous"}
          >{"‹"}</button>
          <button
            className="nav-arrow-btn"
            disabled={!!arrows.nextDisabled}
            onClick={arrows.onNext}
            title={arrows.nextTitle || "Next"}
            aria-label={arrows.nextLabel || arrows.nextTitle || "Next"}
          >{"›"}</button>
        </div>
      ) : null}
      <NavButtons
        onSettings={opts.onSettings}
        onHistory={opts.onHistory}
        onSearch={opts.onSearch}
        theme={opts.theme}
        onThemeChange={opts.onThemeChange}
        reading={opts.reading}
        chapterBookmark={opts.chapterBookmark}
        hide={opts.hide}
      />
      {opts.rightExtras || null}
    </>
  );
}
