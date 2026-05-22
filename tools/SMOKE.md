# Phase-0 Smoke Harness (`tools/smoke.js`)

A modularization safety net. **Not loaded by the app** (lives in `tools/`,
outside the shipped `app/src/main/assets` path). Run it *in the running
app's page* before and after every extraction step.

## Why

No automated tests, no build step — modules are plain `<script src>`
files sharing one global scope. The dominant modularization regression is
a module that fails to load or loads in the wrong order, leaving a global
`undefined` and white-screening the app, or a screen that silently stops
rendering because a symbol moved. The globals audit + screen walk catches
nearly all of that in seconds, deterministically.

## How to run

**Desktop (preview / DevTools console):**
1. Serve the app (`python -m http.server 8090 --directory app/src/main/assets`
   or the preview tool).
2. Open it, then paste the entire contents of `tools/smoke.js` into the
   console (or `preview_eval` it).
3. `votSmoke().then(r => console.log(JSON.stringify(r, null, 2)))`

**Android (real device):**
`chrome://inspect` → inspect the WebView → console → same two steps.

## Options

- `votSmoke()` — full run (globals + data wiring + screen walk +
  annotation round-trip). ~15–25 s.
- `votSmoke({ walk:false })` — globals + data + console only. ~1 s.
  Fast inner-loop check while editing.
- `votSmoke({ mutating:false })` — skips the annotation round-trip
  (pure read-only; no localStorage touched at all).
- `votSmoke({ tabsOn:true })` — adds the multi-tab round-trip: enables
  Tabs, opens two tabs, runs the 12-screen walk in one, switches back,
  asserts per-tab isolation. ~35–40 s total.
  **DESTRUCTIVE — mutates the live app.** It enables the Tabs setting,
  opens two extra tabs, and walks the active tab through all 12 screens.
  `vot-state` is snapshotted + restored, so a page **reload** returns to
  the pre-test state — but the un-reloaded session stays visibly mutated.
  Always reload after running. Never run the `tabsOn` variant against a
  real user's live session for a casual check without warning them first.

## Reading the result

`report.ok === true` means safe to proceed. Key fields:

- `globals.missing` — **the #1 modularization tell.** Any entry here =
  a module didn't load or loaded before its dependency. Format
  `group:Name`.
- `dataWiring.emptyCollections` — a data `<script src>` is missing or
  mis-ordered (validated via `COLLECTIONS`, so no hardcoded data names).
- `screens[]` — per screen: `crashed:true` = ErrorBoundary tripped
  (real regression); `reached:false` (not crashed) = the harness
  couldn't find the entry button (usually a label change, not a bug —
  eyeball it).
- `annotation.ok` — marks render and next→prev doesn't crash (guards
  the class of bug fixed in `2db70f5`). It snapshots and **always
  restores** `vot-annotations`/`vot-notes` in-session, so it never
  corrupts real data — never add a page reload to that section.
- `tabs.ok` — the multi-tab round-trip (only when `tabsOn:true`). Sub-
  fields: `tabXLanded` / `tabYFreshHome` / `tabXHeldAfterWalk` (the
  per-tab isolation assertion) and `walkInTabY.crashed` (screens that
  tripped ErrorBoundary during the in-tab walk). Snapshots + restores
  `vot-state`; see the **DESTRUCTIVE** note under Options.
- `console.errorsSeen` — uncaught `console.error` during the run.

## Discipline

1. Establish a **green baseline** on a known-good build first. If the
   harness flags something on a build you *know* works, the
   `EXPECTED_GLOBALS` list in `smoke.js` is wrong — fix the list, not
   the app.
2. Run `votSmoke()` **before** an extraction (record the green) and
   **after** (diff). Any new `missing` / `crashed` / `console.error`
   = stop and fix before the next step.
3. Keep `EXPECTED_GLOBALS` curated to genuine top-level globals.
   Symbols inside `App()`'s closure are intentionally excluded.
