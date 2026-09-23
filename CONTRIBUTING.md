# Contributing to VOTReader

> Last updated 2026-09-22. Read README.md first; it has the quick start, the bundle map and the doc map. CLAUDE.md
> is the agent briefing (current state, product rules, permanent data rules); the data formats are in docs/DATA-FORMATS.md.

The order here is the order of a change: where you work, how you build and test, what the gates check, how a
commit lands, and how you stay out of the way of the other sessions working on the same repo.

---

## 1. Where to work

**`D:\VOTReader-studio` is the owner's own checkout.** Never edit files in it and never run a git command that
changes it (checkout, switch, stash, reset, pull, rebase). It may be dirty, and that work is the owner's.

Work in your own git worktree, on your own branch, cut from `origin/main`:

```sh
git -C D:/VOTReader-studio fetch origin
git -C D:/VOTReader-studio worktree add .claude/worktrees/<name> -b <branch> origin/main
```

- **Never check out `main` in a worktree.** Git lets one worktree hold a branch, so a worktree parked on `main`
  makes `git checkout main` fail everywhere else. You never need a local `main`: you land with
  `git push origin HEAD:main` (section 5).
- **Gradle needs `local.properties`** (gitignored, so a new worktree has none). Copy
  `D:\VOTReader-studio\local.properties`; it carries `sdk.dir` and `vot.buildDir`. The build directory is derived
  per checkout (`<vot.buildDir>/<checkout-name>/app`), so copies never share one. Typing a value by hand? Escape
  the drive colon (`vot.buildDir=D\:/VOTReader-build`), then re-run lint with `--rerun-tasks`, because
  `local.properties` is not a declared input of the lint task and a cached result will lie to you.
- **The hook path is shared by every worktree.** On this machine `core.hooksPath` is the absolute
  `D:\VOTReader-studio\.githooks`, so your commits run the primary checkout's copy of the hook. If you change
  `.githooks/pre-commit`, test your version directly with `sh .githooks/pre-commit`.

---

## 2. Build and preview

```sh
git config core.hooksPath || git config core.hooksPath .githooks   # the pre-commit gate: shows it, or turns it on
npm ci                        # Node 20+ (.nvmrc pins 24), exact lockfile, as CI does
npm run build
python tools/preview-server.py 8090 app/src/main/assets    # then open http://127.0.0.1:8090/
```

`npm run build` runs, in order: `tools/build.py` (bundle-a and the three corpus bundles), esbuild for bundles
b, c, d, e, f, g, h and the CSS (`--format=iife --target=chrome108 --minify`), `tools/sync-csp-hashes.js` (the CSP
`script-src` hashes of index.html's inline scripts) and `tools/sync-sw-version.js` (the service worker's
`CACHE_VERSION` and its `ASSET_INTEGRITY` hashes). The bundles in `dist/` are committed: CI rebuilds and fails if the
committed bytes differ from what the source builds.

- Preview only with `tools/preview-server.py` (no-store caching, 127.0.0.1 only). `python -m http.server` serves
  stale bundles after a rebuild. A dev server that can expose the tree on the LAN is a defect.
- The service worker caches aggressively. For a clean slate in the preview, run the snippet under "Preview
  clean-slate" in CLAUDE.md.
- `npm run e2e:read` and `npm run e2e:readalong` start their own servers on OS-assigned ports. Nothing needs to be
  running first. Never give an e2e harness a fixed port: a reused port once let a gate pass while serving another
  worktree's files.
- On Windows, run npm from Git Bash (PowerShell blocks `npm.ps1`).

**Rules that break the build in silence if you forget them:**

- `--target=chrome108` is the floor. esbuild lowers new syntax to it, but it cannot polyfill a runtime API newer
  than Chromium 108; such an API needs a feature-detected guard.
- Never hand-edit the `'sha256-…'` tokens in index.html. `npm run build` re-derives them; `npm run check:csp`
  verifies. A drifted hash is a black screen on the live PWA and in the WebView.
- `src/app.jsx` has an 800-line ceiling (`npm run check:app-size`). A new App()-level concern goes in a hook under
  `src/hooks/`.
- A new or renamed `window.__*` bridge goes into BRIDGES.md in the same commit.

---

## 3. The bundle map in practice

README.md has the table. What follows is what you do with it.

**Adding a screen that readers open on purpose** (it should cost nothing at boot):

1. Write it under `src/ui/screens/`, with a colocated `*.test.jsx`.
2. Import it in the lazy entry that fits (`src/ui/_entry-g.js` for Personal Study, `_entry-h.js` for the
   Listening Library, `_entry-e.js` for settings and search) and add it to that file's `Object.assign(window, {...})`.
3. Route it in `src/ui/screen-routes.jsx` through `_corpusView(window.__screensG, window.__loadScreensG, 'Loading…')`,
   which shows a loader until the bundle has defined the screen.
4. Read shared helpers as free globals from bundle-d, as the other lazy screens do. Never import an eager module
   into a lazy entry: esbuild would bundle a second copy, and two copies of a module are two states of one table.
5. Pin it in that bundle's membership test (`tools/bundle-g-membership.test.js`, `tools/bundle-h-membership.test.js`):
   the lazy bundle defines it and bundle-d only asks for it. These tests read the built bytes, so `npm run build`
   before you run them.
6. Re-measure: `npm run check:bundle-budget`. Raising a ceiling is a deliberate edit to
   `tools/check-bundle-budget.js`, justified in the commit.

**Adding a whole new lazy bundle** touches every place that knows the list (bundle-g's first commit is the worked
example: `git log --reverse -- app/src/main/assets/src/ui/_entry-g.js`):
an esbuild script in `package.json` plus a step in its `build` chain; a `__makeLazyLoader` call and the two window
slots in `index.html`; `ENTRY_FILES` in `tools/gen-eslint-globals.py`; the lazy preload in `tools/smoke.js`; the
precache list in `service-worker.js`; a row in `tools/check-bundle-budget.js`; the re-stage list in
`.githooks/pre-commit`; and a membership test.

**The corpora** load through `__loadBibleCorpus()`, `__loadMatthewCorpus()` and `__loadVotCorpus()`. Screens wait
on them through the same corpus objects. The contract and its one race class are in ARCHITECTURE.md, "Lazy corpora".

---

## 4. Tests

| What | Command |
|---|---|
| all JS tests | `npm run test` (vitest; jsdom, fake-indexeddb, Testing Library) |
| one file | `npx vitest run app/src/main/assets/src/stores/note-store.test.js` |
| with the coverage floors the hook enforces | `npm run test:coverage` |
| the gate scripts' own tests | `npx vitest run tools/` |
| types | `npm run typecheck` |
| lint | `npm run lint -- --max-warnings 0` (regenerates the cross-bundle globals, then eslint; this is CI's form) |
| Kotlin unit tests | `./gradlew :app:testDebugUnitTest` (JDK 21) |
| headless smoke walk | `npm run smoke:ci` |
| end-to-end read detectors | `npm run e2e:read`, `npm run e2e:readalong` |

- Tests sit next to their source as `*.test.js(x)`. Tests of gate scripts and of the built bundles live in `tools/`.
  React-as-global and the `window.__*` stubs are in `vitest.setup.js`.
- **RED first.** A fix lands with a test that fails on the pre-fix code and passes after it. Say so in the commit.
- **Never quote a number you did not just produce.** Test counts, bundle sizes and report totals drift with every
  landing, and a report directory another session also writes to holds whoever finished last. Run it yourself,
  then quote it.

---

## 5. Gates and landing

### The pre-commit hook

`.githooks/pre-commit` runs only what the staged files need, in this order:

1. data files: `check_balance.py`, `tools/validate-schemas.js --strict`, the read-along offset and Bible-timing
   checks, the audio manifest check;
2. source files: eslint on the staged files (after regenerating the globals), `tsc --noEmit`, then **the full vitest
   suite with coverage floors**; a staged `tools/` script runs `vitest run tools/`;
3. bundle sources, `index.html`, `app.css`, `manifest.json`, `offline.html`, `service-worker.js`:
   **`npm run build`, then re-stage** what it regenerated; then the type-scale, CSS-token, byte-budget,
   CORPUS_VERSION, search-index-version and runtime-asset gates;
4. always: the packaged-APK asset check and the `ASSET_INTEGRITY` check;
5. `.kt` or `app/build.gradle.kts`: the Kotlin unit tests.

A docs-only commit runs step 4 and nothing else.

**The order trap.** Step 2 (vitest) runs before step 3 (the rebuild). So when you edit `index.html`, or any file
the service worker hashes directly (`manifest.json`, `offline.html`), `service-worker.test.js` fails on the stale
`ASSET_INTEGRITY` hash (`'./'` is index.html) before the hook gets to rebuild it. Build and stage first:

```sh
npm run build
git add app/src/main/assets/index.html app/src/main/assets/service-worker.js app/src/main/assets/dist
git commit
```

`git commit --no-verify` skips all of this. CI runs the same gates on every push anyway, so skipping only moves
the failure to after your push, on `main`.

### CI and Deploy

- `.github/workflows/ci.yml` runs on every push: lint, the data validators, typecheck, vitest with coverage,
  build plus "committed bundles, SW version and CSP hashes match source", CORPUS_VERSION, ASSET_INTEGRITY, the
  budgets, the type scale, the smoke walk and the read detector; and a Kotlin job (unit tests, Android lint,
  the JaCoCo floor).
- `.github/workflows/deploy-web.yml` publishes every push to `main` to GitHub Pages, with no path filter.

### Landing a change

`main` is linear and there are no pull requests. You rebase, never merge, and push straight to `main`:

```sh
git fetch origin
git rebase origin/main            # linear history; never a merge commit
# if the rebase brought in source changes near yours: npm run build && npm run test
git push origin HEAD:main
```

1. The push prints `Bypassed rule violations ... Required status check "build + syntax-check" is expected`. You
   pushed past the required check, so the CI run after the push is the check. Watch **both** runs to the end:
   `gh run list --commit $(git rev-parse HEAD)`, then `gh run watch <run-id> --exit-status` for CI and for
   Deploy Web.
2. Confirm the deploy: `npm run check:live` compares the live service worker with HEAD and prints
   `LIVE AND CURRENT` when they match (`--wait` polls up to 10 minutes; `--strict` exits 1 unless HEAD is live).
   It also prints `(HEAD on <branch>)` and exits 0 on a wrong branch, so read the branch name.
3. Rejected because `main` moved? Fetch, rebase, re-run what the new commits could disturb, push again.
4. Commit subjects follow conventional commits: `feat(scope): …`, `fix(scope): …`, `test(…)`, `docs: …`,
   `chore(build): …`. One logical change per commit.

### Getting it onto the phone

A push does not reach the owner's phone: the owner tests the installed APK. Build and install it yourself:

```sh
npm run build
./gradlew :app:assembleDebug
adb install -r -d "D:/VOTReader-build/<checkout-name>/app/outputs/apk/debug/app-debug.apk"
```

The APK lands outside the repo, under `D:\VOTReader-build\<checkout-name>\` (from `vot.buildDir`). Install the
file your own build just wrote, never one from a remembered path: an APK another checkout built installs the wrong
code and still succeeds.

---

## 6. Editing corpus data

- After any edit to a file in `src/data/`: `python check_balance.py` (needs `pip install esprima`) catches the
  three black-screen classes (JS parse errors, smart quotes used as delimiters, non-ASCII dashes in verse ranges);
  `npm run validate:data` catches schema errors (missing fields, orphaned footnotes, broken prev/next chains).
- Bump `CORPUS_VERSION` in `app/src/main/assets/service-worker.js` on any corpus content change, or installed PWAs
  keep serving the old text. `npm run check:corpus` enforces it against `tools/corpus-version.lock`.
- Fix the source, not the renderer. Match the file's existing format (Volume Two uses unquoted keys, the other
  volumes quoted keys). Verse ranges use an ASCII hyphen. The full rules are in CLAUDE.md ("Permanent rules"),
  the data formats in `docs/DATA-FORMATS.md`.

---

## 7. Coordinating with parallel work

Several agent sessions work on this repo at once. Since 2026-09-20 they coordinate through **`D:\Swarm`**, a folder
of plain files. If you are new to this machine, read **`D:\AgentMemory\START-HERE.md`** first: twelve documents
in order, from the owner and the machine to this network and the live board. Before you claim, post or land
anything, read **`D:\Swarm\PROTOCOL.md`**: the claim, board and landing rules below are its rules.

| Where | What |
|---|---|
| `D:\Swarm\PROTOCOL.md` | the rules, one screen (33 of them) |
| `D:\Swarm\tiering.md` | which model and effort for which work, and how much checking a change needs: T1 gates only, T2 plus one device look, T3 plus one independent refuter |
| `D:\Swarm\BOARD.md` | the board, append-only, one line per event: `HH:MM <lane> -> <target>: <text>`. Its tail (`tail -60 D:/Swarm/BOARD.md`) is the last hour or so. Verbs: TODO, DONE, PASS, FAIL, NEEDS |
| `D:\Swarm\lanes\<lane>\` | one folder per lane: `brief.md` (its assignment), `state.md` (line 1 is `NOW:`; the lane's current truth), `inbox.md`, `out\` |
| `D:\Swarm\claims\` | open claims. `D:/Swarm/claim.sh <id>` takes a TODO atomically (one open claim per lane); `D:/Swarm/done.sh <id> "<result>"` finishes it and posts DONE |

- **The hub** is the one session the owner talks to; BOARD.md's header names it. It writes the lane briefs and
  posts loose work as TODO lines.
- **Post** with `D:/Swarm/post.sh <target> "<text>"`, or bash:
  `echo "$(date +%H:%M) <lane> -> all: <text>" >> D:/Swarm/BOARD.md`. Never edit or rewrite the board. PowerShell
  `Add-Content` is blocked: on this machine it loses lines when several processes append at once.
- **One lane, one worktree** (`.claude\worktrees\<lane>`). **One writer per output path**: a file another lane owns
  is not yours to edit, even for a one-line fix. Post a TODO for it.
- **Land your own work** (section 5), then post one DONE line with the commit hash.

The old coordination file is closed history: `docs/archive/PLAN.txt`.

---

## 8. Keeping the docs true

- **CLAUDE.md "Current state (date)"** is one screen. Rewrite it when the picture changes; never append a log to it.
  It loads into every agent session, so every line costs something.
- **HISTORY.md**: prepend a dated narrative entry for each landed piece of work, and add a one-liner to the
  Closed-phases index at the top of HISTORY.md.
- **BRIDGES.md**: same commit as any `window.__*` bridge change.
- **docs/**: subsystem docs. A finished plan or tracker moves to `docs/archive/` with a line in
  `docs/archive/README.md`.
- No counts in docs (tests, modules, bytes, lines). They drift, and a stale number reads as a fact. Name the command
  that measures it instead.
