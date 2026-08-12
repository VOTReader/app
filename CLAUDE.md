# CLAUDE.md — VOTReader-studio briefing

![CI](https://github.com/VOTReader/app/actions/workflows/ci.yml/badge.svg)

What every agent needs in 30 seconds. For landed work history, see **HISTORY.md**. For deep system reference (annotation engine, COLLECTIONS registry, navigation, audit findings), see **ARCHITECTURE.md**.

**Working dir:** `D:\VOTReader-studio`. The C: OneDrive path is legacy — `C:\Users\corbi\OneDrive\Desktop\VOTReader-studio\app` is a Junction → `D:\VOTReader-studio\app`. Always edit D: files.

---

## Current state (2026-08-12)

**Current working follow-up (2026-08-12 s13, uncommitted):** **Scripture Web UX uplift.** The canonical graph now exposes only **Essential (votes >=20)** and **Famous (votes >=7, 63,418 links)**; the obsolete 300k “Complete” surface is gone. Dense crossings retain multiple tap candidates and open a chooser instead of silently selecting the wrong line; the picker is chunk-culled like the renderer. The location card names the book/chapter and visible verse range, **Go to** accepts book/chapter/verse references, **Nearby** provides a keyboard-friendly connection list, and canonical, personal, and visible corpus-underlay lines all have navigable detail paths. My Web underlay edges retain source records so corpus connections can open the originating study, letter, or entry. Hover is rAF-throttled, dialogs restore focus, controls expose state to assistive technology, and rotated phone overlays use logical landscape dimensions with a visible landscape hint when orientation locking is unavailable. Targeted Scripture Web coverage: 84 tests; final validation: 226 files / 4,185 tests, lint, typecheck, data, smoke, asset, CSP, CSS-token, type-scale, and corpus gates all pass. Detail in HISTORY.md.

**The app is feature-complete and shipping.** One JS codebase runs as the Android APK and as a desktop PWA (live + installable + full-offline at https://votreader.github.io/app/). Every quality/uplift phase and all three deep audits are closed; work is now owner-reported fixes + polish. Gates on every commit (pre-commit + CI): build, lint `--max-warnings 0`, typecheck, ~3,300+ vitest, Kotlin `testDebugUnitTest` + JaCoCo floor, headless smoke:ci, check_balance, schema-validate, corpus-version, CSP-hash, ≤800-line app.jsx canary. Counts drift — verify with the runners.

**HANDOFF PROTOCOL (changed 2026-07-24):** this section stays a SHORT summary — CLAUDE.md auto-loads into every session, so its size is paid every conversation. The detailed narrative entry for each landed session is **PREPENDED to HISTORY.md** (under "Detailed session log"); add a one-liner to the Closed-phases index below. Do not grow this section back into a log.

**Prior (2026-08-04 s4):** **one type scale** — 590 font-size declarations / 103 distinct values across 15 files snapped onto a 13-step ladder declared once in `app.css :root` (`--fs-10…--fs-48` rem, scaling with the single Text Size setting; `--fsc-*` px twins for pinned chrome), 10px floor, `em`/`clamp` exceptions documented, enforced by `tools/check-type-scale.js` in pre-commit + CI (ARCHITECTURE.md § Type scale). Plus: **history-tracking race fixed** (a lazy corpus landing after nav meant Bible/Matthew/study visits were never recorded — RED-proven, now retries via a recorded-key ref) and a gentle pulse on the Scriptures layout cycler. Gates: 3,355 vitest, lint 0, tsc, type-scale, smoke:ci ×2.

Same session, after an external read-only audit ("Luna", `VOTREADER-REVIEW-NOTES.md`): every finding re-verified from source, then **8 fixed / 2 dismissed with evidence** — `sectionIntro` was counted as `"[object Object]"` (15 items, +2,436 words); the detector now sees non-annotatable rendered prose via `data-read-seg`; Bible section headings ruled **chrome** (dropped from the counter — 2,732 headings / 11,638 words); first-page auto-scroll skipped its 4s floor; a DST day-skip in the progress bars (repro'd in `America/Denver`); translation/restored-names now part of `placeKey` so metrics can't describe the old text; `unmarkRead` clears its frontier; imported reading stats normalized at the trust boundary. Dismissed: the "1.5s" scroll-restore cap (it's 90 *frames*, and the pixel fallback re-applies every frame) and the "IDB warning flood" (zero in a full run). Gates: 3,364 vitest, e2e:read PASS.

Then **compound footnote refs**: an audit of every compound ref in the corpus found **35 of 66 lossy — 56 passages with no tap target** (comma tails that spelled out their own book were never parsed). Fixed in `splitCompoundRef` so all four surfaces inherit it; `lookupVersesFromBooks` now decomposes through the same splitter (it split on `;` only, so a comma compound showed the text of just its first passage); new `validate-schemas` gate is RED-proven (49 refs flagged with the fix reverted, 0 with it). Live: a 7-passage footnote now renders 7 "Go to Scripture" buttons.

**Latest landed (2026-08-11 s12):** **"updates don't push" — the cache was innocent.** The owner reported stale PWAs across desktop Chrome, Edge, the phone PWA and an Android browser. His real Chrome was **byte-current with the server**; `bundle-f.js` + `scripture-web-data.js` **404'd live** because the Scripture Web had never been pushed (10 commits on a local branch with **no remote ref**). The update chain was proven working under real Pages `max-age=600` headers. Root cause of the *recurring misdiagnosis*: **nothing reported a build identity**, so "stale cache" and "never deployed" looked identical and cache-clearing could never help. Landed: SW `GET_VERSION` + `utils/build-version.js` + Settings → Your Data → **"App version"** (running vs published, with Check); **"A new version is ready. Reload"** for a visible mid-session reader (deferred reload kept as fallback); **every push to main now deploys** (`paths:` filter deleted — owner directive); the **deploy-staging hole closed and gated** (`tools/list-runtime-src-assets.js` derives the runtime `src/` asset list from the loaders and `--check --site` fails the deploy on a miss — RED-proven; it silently dropped 2.6 MB of graph data); SW corpus routing generalized to `/src/data/[a-z0-9-]+\.js$/`; **`pre-commit` now stages `bundle-f.js`** (rebuilt but never staged, while CI gates `git diff dist/` — would have reddened every Scripture Web commit); `npm run check:live` reports LIVE vs COMMITTED vs LOCAL. **Do not reach for query-string cache-busting: Fastly strips the query from its cache key on Pages** (measured) — only content-hashed *paths* would work, which remains the open structural fix. Verified in production: a plain visit moved his Chrome `c30 → c32`, Scripture Web live with a healthy WebGL2 context. Gates: 4,176 vitest / **zero errors**, lint 0, tsc, all data/CSP/budget gates, CI green. Detail in HISTORY.md.

**Prior (2026-08-11 s11):** **The Scripture Web** — the famous cross-reference arc diagram rebuilt as an instrument, with real data under every thread. Vendored the **OpenBible.info / Treasury of Scripture Knowledge** dataset (**CC-BY — attribution is a licence obligation**, carried on the screen and About page 1) and resolved its 344,799 rows against the app's OWN canon (66/1,189/**31,102**; never inferred from the dataset) into **301,539 unique verse pairs** — plus the corpus's own **2,097 curated edges** (Matthew votNotes, letter footnotes, study refs, prophecy pairs). Ships as `src/data/scripture-web-data.js`, 885 KB gz, pre-sorted into a baked LOD contract (span bucket → density tier → x) then delta-encoded per tier run; stable corpus cache, **c30→c31**. Renders in **WebGL2**, one instanced ribbon per reference: **the height law lives once** (`utils/scripture-web/geometry.js`, inlined into the shader as GLSL) because the CPU hit test must trace the curve the GPU drew — true semicircles at overview, soft `tanh` ceiling when zoomed, so **every apex stays tappable at 3,000×**. Picking is analytic (implicit-ellipse distance, ~2 ms over all 301k, no GPU readback); hidden arcs are untappable. Hover brightens and names one thread without dimming the web; only a tap focuses (owner call). Tap → sheet with real verse text + "Open in reader". **My Web** is the same instrument on the reader's own links: dual-rail (canon below, Volumes above in READING_CHAIN order), Canvas2D, live on LinkStore, with the curated edges as a faint underlay. New lazy **bundle-f** (41.8 KB) + Library tile. Five real bugs found by RUNNING it: `drawArraysInstanced` has no base-instance param (every bucket drew from index 0 — blank screen); `setPointerCapture` throwing killed the gesture; a rAF requested while hidden froze the view permanently; the light palette lives on `body.light` not `:root` (light mode would have shipped a black canvas); phone labels overlapped. New `validateScriptureWeb` gate caught a Uint16 delta wrap the unit tests missed (286,134 corrupted arcs) — encoder and gate now share one `deltaRuns()`. Gates: 4,132 vitest / 222 files, lint 0, tsc, validate:data (304,659 items), corpus c31, CSP, type-scale, css-tokens, bundle-budget, apk-assets, smoke:ci + a new Scripture Web step. Live-verified desktop + 375 px + both themes; **APK install owed**. Detail in HISTORY.md.

**Prior (2026-08-10 s10):** **Campaign 2** — a post-s9 triple recon (audio residuals / reading-flow / technical) adjudicated into `FABLE5-BACKLOG.txt`'s **CAMPAIGN 2 QUEUE**, then worked in gated waves. **C2-A closed** ([A1]–[A9] + two owner directives): Bible queues scope to the **BOOK**, the voice picker sits at the top of the desk and a switch passes `noResume`; every Listening Library row + "Resume last" **rebuilds a real queue** from the live manifests by immutable URL (each was a queue of ONE, so a chapter dead-ended after 4 min); `recordPlayed` moved to the four user-initiated entry points (auto-advance had been flushing all 30 recent rows and repointing "Resume last"); **Bible listening earns credit** — per-track notify carrying the chapter, resolved into the `v1:<bookId>:<chapter>` space BibleChapterView already writes, so a listened chapter checks its card, scores its milestones and feeds the streak; Matthew got the Listen pill; per-chapter tracks are titled by chapter ("Psalms 117"); the 30s resume floor moved to the WRITE path + queue-replacement boundary writes + an honest "Resuming…" desk + a window that follows auto-advance; sleep chips show what's armed, Voice becomes a radiogroup, the media card names the EDITION; the collection screen gained chapter disclosure + the Text affordance a blanket `!bible` withheld; 'Heard to the End' gives the completions counter an achievement; a ConfirmStrip warns before a voice switch discards a hand-made queue. Then **C2-B truth-and-copy**: About page 2 no longer claims nothing is downloaded (audio streams; personal data still never leaves) and names the Listening Library; "whole-book audiobook" copy retired (all three editions are 1,189 per-chapter tracks); the scrollTop lease block reads FIVE writers; ARCHITECTURE gained **§23 Audio subsystem**; the two milestone tables became ONE engine (FEATURED_ACHIEVEMENTS returns the categories' own item objects; the persisted unlock ledger keys preserved so no toast re-fires); this file re-headed + its bundle sizes re-measured. **C2-C reading-path** ([C1]–[C10]): WTLB's scripture sheet joined the modal registry; the "Volume Two"/"Matthew" fallback labels became honest; WTLB back names its real destination; the scroll-notch interval only runs while the setting is on; History rows carry the resume chip (closes [26]); Matthew chapter cards show a commentary-weight chip ([29a], frozen table); a11y label batch; Bookmarks/Links dead sort modes wired as cycles. **C2-D safety nets** ([D1]–[D7] + the phantom `--border`): coverage floors enforced in pre-commit; `check-bundle-budget.js` (nine ceilings ≈+15% over measured); JaCoCo 2→5 classes per-class; the backup-parity test's new STORE_NAMES leg caught THREE stores backups silently dropped (vot-library-order/vot-note-default/vot-ann-hint-dismissed — now exported); vot-state's readItems ledger merges cross-tab base-aware (a stomped write was permanent read-mark loss; session fields stay LWW on purpose); `--border` declared — 13 hairlines that had NEVER drawn (Journal cards, Highlights chips) — and `check-css-tokens.js` now fails any var() to an undeclared property. **Campaign 2 CLOSED.** Gates at close: 4,022 vitest / 218 files, coverage floors 60/51/64/64 (measured ~87/78/88/93), lint 0, tsc, type-scale, css-tokens, bundle-budget, smoke:ci, Kotlin+lintDebug+JaCoCo, corpus c29. Detail in HISTORY.md.

**Prior (2026-08-10 s9):** **the audio campaign** — eight gated landings (plan-approved; Opus max agents in worktrees, coordinator-reviewed): BRM's 1,189 chapter boundaries silence-snapped + belt-verified and the 66 books CUT into real chapter tracks (`audio-brm-v1/v2`, c28, with a whole-book→per-chapter resume-snapshot migration RED-proven at 9,000s→ch37@27s); **WEB joins as the third voice** (ebible.org per-chapter, `audio-web-v1/v2`, c29); **durable per-track resume** (`vot-audio-positions` IDB v10, URL-keyed LRU, ✕ keeps memory, shelf rows show "2:10 left"/Finished, scrub is commit-on-release with preview bubble via one shared AudioSeekSlider); **transport semantics** (head-of-queue restart defect fixed, lone-recording Restart, "3 of 12" readouts, End-of-track sleep as an ended-hook flag, 1.75×, 44px desk chips, Media Session ∓15s/stop + no prev/next on single-track queues); **the desk grew up** (whole queue incl. played = the chapter picker, windowed ±40 for 1,189-chapter editions; **voice switching in the player** — rendition chips for letters, edition chips for Bible, switch = restart + Settings follows); **Phase-5 uplift** (Listening settings group, My Progress listening cells + a completions counter, History search + resume chips via the deduped ReadingMinChip, Milestones memo/filter/jumps/tests/smoke). Earlier same campaign: read-along governed (fifth scrollTop writer brought under the lease + off switches), hygiene (LS_SKIP_LIST, Your-Data parity gate + test, doc backfill). Gates at close: **3,772 vitest / 205 files**, lint 0, tsc, smoke:ci, corpus c29; APK on the Pixel. Pipeline + corpora inventory: `D:\BibleAudio\CORPUS-STATUS.md`. Detail in HISTORY.md.

**Prior (2026-08-09 s8):** **the Lamb of God illustrated + the system media card.** (1) The SEVEN narrative illustrations from the restored `THELAMBOFGODstudy.pdf` (OCR had undercounted at 5 — Crucifixion + Burial were never annotated) enter the study as `study-image` blocks in ch3/4/6/7/8/11/12, PDF-faithful placement, `study-lamb-*.jpg` ×7 SW-precached, corpus **c27**, live-verified in preview. Owner call — reverses no-figurative-art for this study only. (2) **Native media card**: the WebView's web MediaSession never surfaces a system card, so `AudioKeepAliveService` now owns a MediaSessionCompat + MediaStyle notification (androidx.media, still no media3) fed by `setAudioNowPlaying` from the player's `_syncNative()` (edge-driven, never the 1 Hz tick); transport returns via `commandSink` → `__votMediaCommand`. **Pause keeps the card alive** (keep-alive releases only on idle; paused notification detaches from the FGS so it's swipeable, swipe stops the service). **POST_NOTIFICATIONS now declared** — asked contextually on first playback, never at boot (owner call). Gates: 3,633 vitest, 250 Kotlin, lintDebug, eslint 0/0, tsc. **On-device VERIFIED** (lock-screen card + native transport loop + screen-off continuity; POST_NOTIFICATIONS pre-granted via adb). Same session: **the desk title jumps to the playing letter/chapter's text** — chevroned title button in AudioManagerSheet → `window.__openAudioText` → letters via the Library-Text wiring, Bible editions via `navigateToLink` (partLabel "Chapter N" → chapter); playback provably untouched (tests pin status/qi/loadCalls/src; live walk: clock counts through the nav). 3,650 vitest. **ASK BEFORE DRIVING THE PHONE** — the adb device is the owner's daily GrapheneOS Pixel (rule in project memory). Detail in HISTORY.md.

**Prior (2026-08-09 s7):** **external audit (Luna) round 2 adjudicated — 8 acted on / 3 no-action with reasons.** The real find: `lintDebug` had never been a gate and held **6 NewApi errors — one a genuine API 26–29 boot crash** (`MainActivity`'s frame-rate vote read `Context.getDisplay()`, API 30; `NoSuchMethodError` is an `Error` the `catch (Exception)` never stopped). Fixed + the three lint-blind-spot siblings (VOTReaderApp API-28 gate, AppInterface lazy→`@RequiresApi` fn, `@ChecksSdkIntAtLeast` on `usesTypedForeground`); **lintDebug now passes and runs in CI's kotlin job**. Export fail-clean: the contract defended (post-truncation delete destroys nothing extra), but the open-THROWS path deleted a never-touched document — `writeTextToUri` now opens outside the delete region, RED-proven, 247 Kotlin tests. Backup config: `data_extraction_rules.xml` + `full_backup_content.xml` close the Android 12+ D2D-transfer hole `allowBackup="false"` stopped covering (new-phone migration will NOT carry app data — export/import is the way, as designed). Also: js-yaml/nanoid dev-dep patches (audit 0), deploy gate + `check_balance` + `smoke-lite` (BLD3), 4 OCR audit scripts repointed off the dead OneDrive path, stray `kmath.js` deleted. No-action with reasons: v3 aggregate import cap (salvage-by-design), encryption at rest (NO-credentials policy; FBE covers it), maintainability items (tracked). Gates: lintDebug PASS, 247 Kotlin, 3,628 vitest, eslint 0/0, tsc, audit 0. Same session later: **the vitest suite runs silent** — all 9 jsdom "Not implemented" lines root-caused (canvas parity shims + download-anchor listener in vitest.setup.js; the last one was a REAL leaked-timer bug — SettingsScreen's import-success reload deferral outliving its test, fixed by a never-restored file-level location stub; `window._virtualConsole` stack-listener debugging tip recorded in the setup file) — and **`THELAMBOFGODstudy.pdf` restored** to `source-pdfs/` (sha256 matches the Aug-5 MANIFEST row for the missing file; the 5 held illustrations are extractable again). Detail in HISTORY.md.

**Prior (2026-08-09 s5+s6):** **the Bible audio gets chapters, then a second voice.** s5 — **chapter-level listen** on the whole-book BRM tracks: the recording is one MP3 per book, so "play chapter N" is a SEEK, not a track. `BIBLE_AUDIO_CHAPTERS` (`"volKey:bookId"` → `[sec,…]`, 1,189 rows) joins the generated manifest in bundle-a (~14 KB — must work before the a-bible corpus); `playBibleBook()` takes `chapterNum` and seeks on `loadedmetadata` (the boot-restore timing contract), `bibleChapterStart()` returns 0 for ch1/unknown book/uncovered row so an index gap degrades to the book start; BibleChapterView's pill starts at ITS chapter. **The timestamps were not trusted**: faster-whisper announcement scan → gap repair → EVERY boundary confirmed by an independent belt (announcement re-heard / KJV opening verse matched / human YouTube stamp — Jeremiah 46/46 within 3.3s); 205 probe failures arbitrated = 166 false negatives + **39 real errors fixed** (worst: a text-realign matching a neighbor chapter's tail). 1,189/1,189, strictly monotonic, 66 books. Corpus c25. s6 — **The Word of Promise** (Thomas Nelson dramatized NKJV, 600+ cast), 1,189 **per-chapter** MP3s (~5.5 GB) on **TWO tags** — `audio-wop-v1` (OT 929) + `audio-wop-v2` (NT 260), because a release caps at 1,000 assets; the testament digit already in the asset name (`wop1_`/`wop2_`) picks the tag. The trust boundary is now a frozen **`RELEASE_PREFIXES`** list (letters + audio-bible-v1 + both wop tags) instead of per-release special cases. Per-chapter editions expand one part per chapter from a ~1 KB **loop** in the generated manifest (not 1,189 written rows); `playBibleBook()` branches on SHAPE not edition id (`parts.length > 1` → `playCollection({ startPartIndex })`, the forward-only horizon now chapter-grained + clamped inside the book; whole-book → the s5 seek), so a third edition of either shape needs no player change. Settings picked the voice up from the registry with no edit. Prefetch warms wop chapter files, still never whole-book tracks. Corpus c26. Detail in HISTORY.md.

**Prior (2026-08-09 s4):** **the Listening Library campaign** — reader choice, forward-only queues, home card, browse-to-recordings. The manifest generator now retains every reader's complete rendition (**AUDIO_ALTERNATES**: 45 letters, 48 assets — all mirrored, audio-v1 at 793/1000, corpus c24); `AudioPlayer.renditionsFor()` + `startReader` play a chosen voice into a **forward-only** queue (startId slices — nothing behind the chosen letter; persisted horizon survives reboots). Listening Library moved to a **HOME card** ("Audio Readings"; Library/Volumes tiles retired — both order stores made merge-tolerant FIRST so no saved arrangement resets); the hub's Browse offers ONE doorway per source family (owner follow-up: the collections must not splay across the hub) — **audio-library-volumes** lists the 14 collections, Bible editions enter directly — into a new **audio-library-collection** screen (every recording in reading order, "N voices ▾" disclosure per multi-reading letter, WTLB chips, honest await-recording footer) and saved recordings became **audio-library-saved** (search lives there); recently-played collapses (choice remembered). Both new screens chain navOrigin through the hub. Honest play counting (plays++ only on user-initiated plays, not queue traversal). Type-scale gate now fails undeclared token references (12 phantom sizes found + fixed); the two overlapping audio-library CSS blocks consolidated to one. 28 new bar/sheet component tests surfaced + fixed 3 real defects (buffering Play/Pause lie, 100%-painted unknown-duration slider, invisible modal claiming Escape). Also landed: the prior session's interrupted ~630-line batch (rescued, verified, committed first). Gates: 3,574 vitest / 202 files, lint 0, tsc, type-scale, smoke:ci (new Listening Library step), Kotlin 246 + assembleDebug, live Puppeteer walk on every new surface, CI+Pages green, **APK installed to the test device**. Detail in HISTORY.md.

**Prior (2026-08-09 s3):** **whole-book Bible audiobooks** — the BRMinistries (Biblical Restoration Ministries) complete KJV, 66 one-file-per-book MP3s (~4.3 GB, corpus at `D:\BibleAudio\brministries-kjv\`), streamed from the NEW `votreader-assets` release tag **`audio-bible-v1`** (own tag on purpose: GitHub now enforces 1,000 assets/release and audio-v1 holds the ~729 letter tracks; hosting investigation verdict = keep GH Releases, R2 is the contingency). `audio-track.js` accepted exactly the two release prefixes at the time (**superseded by s6** — the boundary is now the frozen four-entry `RELEASE_PREFIXES` list); editions registry `BIBLE_AUDIO_EDITIONS`/`bibleAudioEdition()` (+ global for SettingsScreen); player routes `bible-*` volKeys to `BIBLE_AUDIO_MANIFEST` (rides bundle-a, ~4 KB — works on matthew-idx/Settings/boot-restore without a-bible), `playBibleBook()` queues the whole edition at the tapped book, prefetch never warms whole-book tracks; hero Listen pill on ChapterIndex (bible-idx + matthew-idx) + BibleChapterView; Settings → Reading → **Bible Audio** (editions + Off, default brm-kjv). Pipeline: `tools/gen-bible-audio-manifest.mjs` + `tools/mirror-bible-audio-release.py`. Corpus c23. Gates: 3,492 vitest/194 files, lint 0, tsc, smoke ×2, CI+Pages green, **live-verified on the deployed PWA** (Jeremiah playing, clock advancing). Future editions (research done, corpora downloading to `D:\BibleAudio\`): WEB (ebible.org, PD) + BSB (CC0) are the cleanest next voices; NKJV/LSV audio is licensing-walled; HNV audio doesn't exist. Detail in HISTORY.md.

**Prior (2026-08-09 s2):** **seven-front owner batch** — (1) chapter-bookmark flood killed at the store (getForKeyPrefix reverse clause removed — one chapter bookmark painted an icon on EVERY verse; John 3 now 0, header still highlights) + gold bookmark flag on chapter-index cards (`bookmarkKeyFor`); (2) Library grew Listening Library + Milestones tiles (6→8, order-store growth-tolerant); (3) **milestones fleshed out: 84 achievements / 17 categories** (`utils/achievements.js` pure builder + MilestonesScreen; chapters vs letters split on readItems key shape; AudioLibraryStore `plays` counter; My Progress links in); (4) a letter played to its end increments its read count (`__votAudioListened` bridge, last-part-only, markAsRead-gated); (5) **native foreground media service** (`AudioKeepAliveService`, mediaPlayback type, setAudioActive edge-wired; Kotlin 246 ✓; on-device checks owed); (6) **every study surface annotatable** — ProphecyCard para/poetry + Matthew StudyPanels/InlineNotes non-interactive prose carry data-hl-key/data-hl-dom/StaticSubtree (MTAM: 109 containers/21 cards live), captions too, word-count exclusion unchanged; (7) **study History fixed for real** — stale letterId shadowed the study branch (`else if (letterId)` ordering), RED-proven + gated on `COL_BY_LETTER_SC.get(screen)`. Gates: full vitest, lint 0 (500 globals), tsc, smoke:ci, Kotlin+assembleDebug. Detail in HISTORY.md.

**Prior (2026-08-08):** **Listening Library + expanded listening desk** — an external (ChatGPT) contribution reviewed line-by-line, 4 defects fixed, verified live, landed. Mini-player title now opens `AudioManagerSheet` (save/star, seek, ∓15s, speed presets, 15/30/60 sleep timer, editable Up-next queue — current track protected); new `audio-library` screen (VolumesHome tile): saved recordings + recent history + collection shelf, backed by `AudioLibraryStore` (IDB v9 `vot-audio-library`, in backup import/export, `normalizeAudioTrack` trust boundary — only immutable release-asset URLs persist). Persist schema v2 keeps user-edited queues across restarts. Review fixes: playbackRate applied AFTER src (the load algorithm resets it — speed was silently lost per track on device); Library "Text" nav now sets activeReadKey/lastRead like every other letter nav; `describeTab` audio-library entry (tab/History/title said "Home"); sleep countdown ticks while paused. Same-day follow-up (owner): hero Listen on a letter now queues the whole collection positioned at that letter (`playLetter`→`playCollection({startId})` via registry globals; bar prev/next walk neighboring letters, persists as mode 'collection'; single-letter fallback when registry absent), and the mini-player title carries an up-chevron disclosure cue (`.audio-bar-more`) marking the tap that opens the listening desk. 08-09: **gentle queue prefetch** — current track fully buffered + healthy connection ⇒ a detached never-playing element warms the next 2 queued tracks into the HTTP cache (sliding window; Save-Data/2g skip; measured 103ms vs ~750ms cold starts). Gates: 3,459 vitest/191 files, lint 0, tsc, smoke:ci both viewports. Detail in HISTORY.md.

**Prior (2026-08-05/06):** **streaming audio letters.** Every letter/preface + WTLB/Blessed/Holy-Days entry (729/729) has a spoken track (Benjamin's readings supersede other renditions, reader rank B>T>TTS>AI resolves duplicates, full-letter beats section splits). Hero "Listen" pill (LetterView + WtlbEntryView), "Play All" + WTLB Part/Section compilation chips on all 14 indexes (`colIdxProps`), bottom mini-player bar (`AudioPlayerBar` in AppShellOverlays) with queue prev/next, Media Session, offline toast. **Stream host is a GitHub release (`votreader-assets` `audio-v1`, assets `<driveId>.mp3`) — NOT Drive: drive.usercontent 403s every `Sec-Fetch-Site: cross-site` request (anti-hotlinking; curl passes only because it sends no sec-fetch headers). Never retarget back to Drive.** Pipeline: `tools/fetch-drive-audio.py` → `tools/gen-audio-manifest.mjs` → `src/data/audio-manifest.js` in bundle-a-vot (**c20**) → `tools/mirror-audio-release.py` (uploads with explicit audio/mpeg — the CDN is nosniff; additive re-run after new flock uploads). Native: `setAudioActive` bridge → `onPause()` keeps WebView alive while playing (screen-off listening); recording pauses playback; 20s cold-start stall watchdog. Proven on-device (APK, CDP-driven: playing, clock advancing). Same session: ✦ ornament now sits directly under a standalone final "Says The Lord." closing (owner report). Gates: 3,43x vitest, smoke ×2, Kotlin green. Detail in HISTORY.md.

**Prior (2026-08-04 s5):** **highlights survive a translation change.** Verse annotations are anchored by `bibleHlKey(book,ch,verse)` — translation-agnostic — while the record is character offsets, so switching translation painted the wrong words (measured: a highlight of "should not perish" in NKJV John 3:16 painted `him should not pe` in KJV and `who is believing ` in YLT; NKJV-R shifts by +6 per restored Name). New `src/renderer/anchor-resolve.js` re-anchors at RENDER by the `text` every annotation already stores — verify → exact → punctuation-insensitive — and returns null when the wording genuinely differs, in which case the mark is skipped rather than faked. The store is never rewritten, so switching back is byte-exact. Marks carrying a NOTE are kept whole-verse with blanked paint + a dotted hairline so the reader's own note never becomes unreachable. **Scope (verified):** `settings.restoredNames` is chrome-only (titles/headings) and link/bookmark icons are key-only — verse highlights/underlines/notes were the whole blast radius. Also fixed: `reading-stats-store` bumped its version on only 1 of 6 mutations, so My Progress and Settings showed stale numbers while open. Gates: 3,382 vitest / 189 files, smoke:ci ×2.

**Prior (2026-08-04 s3):** two owner-directed retirements — the boot **backup-freshness reminder** (hook + Settings toggle + `lastExportAt` stamp + CSS, all deleted) and the **frontier resume** jump (reading resumes at `use-scroll-memory`'s saved position again; frontier RECORDING stays, it just no longer moves the viewport). Gates: 3,352 vitest, lint 0, tsc, smoke:ci ×2, e2e:read PASS (proved live: reopen lands at the saved bottom, 2,697 px from the frontier block). Detail in HISTORY.md.

**Prior (2026-08-04 s2):** a review-of-the-review loop (`7db418e..7f4a903`) re-verified every claimed gate from scratch, **pushed the 11 unpushed commits the prior session left local** (live PWA was stale), merged the Actions SHA-pin Dependabot PR, and landed: typescript 7 + jsdom 30 (eslint 10 blocked upstream by eslint-plugin-react's `^9.7` peer cap — documented on PR #1); SearchScreen stale-query/unmount guards (out-of-order results, RED-proven) + picker capture-timer cleanup; fixes to the prior session's own a11y batch (bookmark halo tap-stealing at `-4px`, rail `aria-live` created-with-content, vacuous e2e frontier fallback, 7-stat `.prg-hero` hole, audio-slider `aria-valuemax=0`) plus sibling closures (AnnotationActionChip + both full-screen pickers get dialog+trap, four backdrops get `aria-hidden`); backlog [27] wpm-first autoscroll readout + [28] density-ranked Most Annotated. Gates: 3,360 vitest / 188 files, lint 0, tsc (TS7), Kotlin green, smoke:ci both viewports, e2e:read, 3,120 schema items, corpus c19, CSP. Full detail in HISTORY.md.

**Still owed (owner/device-side; nothing blocking):**
- Owner re-import of his own backup to confirm data lands (his device went offline mid-verify 2026-07-22). **Needs HIS backup file — not agent-doable.**
- Batch-4/5 on-device checks: recording pauses/resumes other audio (OEM-sensitive); a legacy `.votbak` import. *(splash→UI black flash + pre-paint white flash: **VERIFIED CLEAN 2026-07-30** by frame analysis of a real cold boot — see HISTORY.md. Edge glow is guaranteed by `overScrollMode = OVER_SCROLL_NEVER`, MainActivity.kt:573.)*
- Standing manual device walks: `tools/n1-smoke-walk.md` (U1/U7/U9, N2.2–N2.5, Garden zoom).
- Owner decisions pending: the 5 Lamb-of-God PDF illustrations absent from the app (source PDF gone). **[19] golden search suite needs the owner's real search vocabulary** (10–15 queries he actually uses), **[20] device-walk day needs his time**, and **[21] the skim indicator is explicitly held until he asks**.
- Optional tracks: measurement follow-ons [22]–[30] (translation facts [25] already shipped; [26] is partly shipped), W10 TalkBack depth, and restored-names phase 2 (OT YAHUWAH).

**Architecture quick-facts.** `function App()` in `src/app.jsx` (≤800-line canary gate — the one line count worth trusting, because it's enforced). ~200 ES modules spread across `hooks/`, `ui/components/`, `ui/screens/`, `ui/sheets/` — **don't trust an exact module/line/file count quoted in any doc; they drift every commit, so `ls`/`wc` the tree when you need a number** (CQ3). All 59 screens dispatch from `buildScreenRoutes(deps)` in `src/ui/screen-routes.jsx`. **8 bundles** in `dist/` (sizes re-measured 2026-08-10 — `ls -la dist/`, decimal KB; nothing gates them, so re-measure rather than quote): `bundle-a` 251 KB raw (react/react-dom + matthew-nkjv + the shared `search-data.js` index source — critical path; books-restored/matthew-plain moved to a-bible 2026-08-02, −353 KB); `bundle-a-bible` 5.0 MB / `bundle-a-matthew` 492 KB / `bundle-a-vot` 2.43 MB (lazy corpora via `__load*Corpus()`, minified); `bundle-b` 319 KB (stores/hooks/journal/scripture-resolution/platform-bridge/StorageHealth/SW/DiagnosticLog — +4 KB on 2026-08-10, the `utils/achievements.js` copy the unlock ledger now reads); `bundle-c` 19 KB (renderer); `bundle-d` 521 KB (most screens/sheets/utils incl. backup.js/App/AppShell); `bundle-e` 114 KB (lazy Settings/Search/Garden screens via `__loadScreensE()`, precached for offline). b/c/d/e + corpora minified; **`--target=chrome108` is mandatory** (Permanent Rule 6). Cold-boot blocking path (a+b+c+d) ≈ 1.11 MB of JS — plus **`dist/app.min.css` 253 KB, which is RENDER-BLOCKING** (a plain `<link rel="stylesheet">` in `index.html`'s head, index.html:93), so the true first-paint budget is ≈ 1.36 MB. Bundle growth is now WATCHED: `tools/check-bundle-budget.js` (pre-commit + CI, C2-D) holds nine per-file byte ceilings ≈15% over the 2026-08-10 measurements — re-baselining is a deliberate edit to the tool, not drift. MiniSearch (bundle-e, `window.VotSearchMini`) is THE search engine — Classic/FlexSearch retired 2026-07-02. `.screen-scroll`'s scrollTop has exactly **five sanctioned writers** (the finger, scroll-restore, the pager settle, the autoscroll transport, read-along's follow) and at most one may write at a time — read the lease block in `hooks/use-autoscroll.js`'s header before adding a sixth.

**Operational facts (load-bearing).**
- **Debug APK** at `D:\VOTReader-build\app\outputs\apk\debug\app-debug.apk` (relocated off the OneDrive junction via `vot.buildDir`; NOT `app/build/...`). **Never** `Remove-Item -Recurse` the C: junction — it follows into D: and deletes real files. The owner tests on the INSTALLED APK — a JS fix reaches his phone only via `npm run build` → `:app:assembleDebug` → `adb install -r -d`, not via git push.
- **CORPUS_VERSION** needs a manual bump on any `books.js` / `matthew.js` / VOT-corpus edit, or web PWAs keep stale cache (`tools/check-corpus-version.js` enforces).
- **CSP script-src is sha256-hash-locked** — after editing any inline `<script>` in index.html, `npm run build` (build:csp) re-hashes, or the pre-commit auto-fixes; NEVER hand-edit the `'sha256-…'` tokens (drift = black screen on the live PWA + WebView).
- **adb** at `C:/Users/corbi/AppData/Local/Android/Sdk/platform-tools/`; test device `51071FDAP000C8`; emulators: `vot_api34` (WebView 113) = the verification floor, `vot_api28` (WebView 69) black-screens BY DESIGN since the chrome108 lift. **gh** at `C:\Program Files\GitHub CLI\gh.exe` (authed as VOTReader).
- **Preview clean-slate** (load fresh bundles past the SW cache): `(async()=>{for(const r of await navigator.serviceWorker.getRegistrations())await r.unregister();for(const k of await caches.keys())await caches.delete(k);location.reload();})()`
- **`VOTReader/VOTReader-studio` is a redirect-only repo** (2026-06-19), NOT the code — it JS/meta-redirects every path to `votreader.github.io/app/` (reclaiming the old Pages URL consumed the rename-alias). The live code + Pages deploy is `VOTReader/app` only; local clone of the redirect repo: `D:\_votreader-studio-redirect` (disposable).

## Closed phases — full detail in HISTORY.md

Reverse-chronological; each landed CI-green + deployed.

- **Integrity-verified precache** (08-11 s12c) — `install()` hashes every CORE text asset and refuses a build whose bytes disagree with the generated `ASSET_INTEGRITY` map (written by `sync-sw-version.js` in the same loop as `CACHE_VERSION`, so they cannot describe different builds); on mismatch it refetches once then THROWS, so the old worker keeps serving and the browser retries — **failing the install is the feature**. Chosen over content-hashed filenames. A 25-agent pre-flight review caught the first draft leaving **`'./'` — the boot document — unverified** (it has no extension; a desktop visit to `/app/` was served unverified while the PWA's `./index.html` was checked); it now borrows index.html's hash, **measured** identical on live Pages down to the ETag. Also fixed: overclaiming scope comments (the ~10 MB corpus is NOT covered — that's `CORPUS_VERSION`'s job), double-reads, silently-dropped missing assets, duplicate markers, and a **vacuous test** that passed with verification disabled. New `tools/check-asset-integrity.js` re-derives hashes independently of whatever wrote the map — closing a hole `git diff` is structurally blind to — and `service-worker.js` finally triggers the pre-commit rebuild (it matched none before, so editing it ran no gates at all). Verified in production: 12/12 live assets match their published hashes.
- **Three stale-artifact gates** (08-11 s12b) — the APK/PWA divergence gate (`deploy-web.yml` re-diffs committed `dist/` against its own rebuild, so one SHA cannot ship two different codebases); `MS_INDEX_VERSION` enforced by `tools/check-search-index-version.js` (the ~21 MB MiniSearch index lives in IndexedDB, so a stale one survives a hard reload AND clearing Cache Storage); the 61 reading fonts folded into the corpus fingerprint (they were in NEITHER version). All RED-proven, wired into pre-commit + CI + deploy. Corpus lock **re-baselined at c32** (coverage grew, no byte changed) via the new `--rebaseline` path — never bump for coverage, it costs every client ~11 MB. **Content-hashed filenames deliberately NOT done:** measured that Pages purges its edge atomically on deploy (`age=0`/`MISS`/one ETag stamp), so the failure it guards does not reproduce; see HISTORY for the cheaper integrity-precache alternative if ever revisited.
- **"Updates don't push" — the cache was innocent** (08-11 s12) — the stale-PWA report root-caused to an unpushed branch (live 404s on bundle-f + the graph data) with the SW update chain proven healthy under real Pages headers; build identity surfaced (SW `GET_VERSION` → Settings "App version"), update-ready Reload affordance, `paths:` deploy filter deleted so every push publishes, deploy-staging hole derived+gated, SW corpus routing generalized, `pre-commit` stages `bundle-f.js`, `npm run check:live`; 73-agent audit (24/34 confirmed) established that query-string busting cannot work on Pages.
- **The Scripture Web** (08-11 s11 → s13 UX uplift) — OpenBible/TSK dataset vendored (CC-BY); runtime Famous is 63,418 links (votes >=7), Essential is votes >=20, plus 2,098 curated corpus edges; the obsolete Complete surface is gone. WebGL2 instanced renderer with the height law shared between shader and hit test; chunk-culled multi-candidate picking; density/colour modes; dual-rail My Web on LinkStore; lazy bundle-f + Library tile; Go to/Nearby/location context; navigable corpus underlay; focus/a11y and phone fallback polish; c33.
- **Campaign 2** (08-10 s10) — triple recon worked to zero in four gated waves: listening truth (book-scoped queues, real continuation queues, honest play counts, Bible listening earns credit, in-player voice picker + switch warning); truth-and-copy (About egress truth, ARCHITECTURE §23, one milestone engine); reading-path coherence (modal-registry sheet, honest fallback labels, History resume chips, commentary-weight chip, a11y batch, sort modes wired); safety nets (coverage floors in pre-commit, bundle byte-budget gate, JaCoCo widening, backup STORE_NAMES parity leg + 3 rescued stores, cross-tab readItems merge, phantom `--border` + css-tokens gate).
- **The audio campaign** (08-10 s9) — BRM chapters cut at verified boundaries (c28) + resume migration; WEB third voice (c29); per-track resume store (IDB v10) + scrub commit-on-release; transport semantics; desk whole-queue chapter picker + in-player voice switching; Listening settings group, My Progress listening cells, History search + chips, Milestones hygiene; read-along lease governance; hygiene/parity gate.
- **Lamb of God illustrations + system media card** (08-09 s8) — 7 PDF-restored illustrations as study-image blocks (c27, PDF-faithful placement, preview-verified); native MediaSessionCompat + MediaStyle card for streaming audio (edge-driven metadata mirror, pause keeps the card, contextual POST_NOTIFICATIONS); on-device verify owed.
- **External audit round 2** (08-09 s7) — 6 NewApi lint errors fixed (one real API 26-29 boot crash: `Context.getDisplay` in the frame-rate vote), lintDebug into CI's kotlin job; export open-throws delete hole closed (RED-proven); Android 12+ dataExtractionRules/fullBackupContent pair; dev-dep audit patches; deploy gate + check_balance/smoke-lite; OCR scripts repointed; 3 findings no-actioned with reasons (v3 aggregate cap, encryption at rest, maintainability).
- **Listening Library campaign** (08-09 s4) — reader-choice renditions (AUDIO_ALTERNATES, 45 letters/48 assets mirrored), forward-only queues with persisted horizon, home card (order stores merge-tolerant first), browse-to-recordings (audio-library-collection + audio-library-saved screens, navOrigin chaining), honest play counts, type-scale reference gate, bar/sheet test coverage + 3 defect fixes, interrupted-batch rescue; c24.
- **The Word of Promise edition** (08-09 s6) — dramatized NKJV, 1,189 per-chapter MP3s across TWO tags (`audio-wop-v1` OT / `audio-wop-v2` NT — 1,000-asset cap), testament digit in the asset name picks the tag; trust boundary generalized to a frozen `RELEASE_PREFIXES` list; per-chapter parts expanded by a ~1 KB manifest loop; `playBibleBook()` branches on edition SHAPE (startPartIndex horizon vs whole-book seek); c26.
- **Bible chapter-level listen** (08-09 s5) — `BIBLE_AUDIO_CHAPTERS` 1,189-row seek index into the whole-book BRM tracks (bundle-a, ~14 KB), `loadedmetadata` seek + zero-fallback for uncovered rows, per-chapter Listen pill; every timestamp cross-checked by an independent belt (39 real errors caught among 205 arbitrated probe failures); c25.
- **Whole-book Bible audiobooks** (08-09 s3) — BRM complete KJV, 66 book MP3s on the new `audio-bible-v1` release tag; two-prefix trust boundary (since generalized in s6) + editions registry; playBibleBook whole-edition queue; Listen pill on bible-idx/matthew-idx/BibleChapterView; Settings Bible Audio select; prefetch skips whole-book tracks; live-verified on the deployed PWA; c23.
- **Seven-front owner batch** (08-09 s2) — bookmark flood store fix + index flags, Library discoverability tiles, 84-achievement Milestones screen, listened-to-end read counts, native foreground media service, every study surface annotatable, study History branch-order fix.
- **Listening Library + listening desk** (08-08) — external contribution adjudicated: manager sheet (speed/sleep/queue editor), audio-library screen, AudioLibraryStore (IDB v9) in backup; 4 review fixes incl. the load-algorithm playbackRate reset; live-verified.
- **Streaming audio letters** (08-05/06) — 729/729 letters mapped (Benjamin-supersede + reader ranking), hero Listen pill + Play All + WTLB section chips + mini-player queue bar, Media Session, screen-off keep-alive bridge, offline toast; streams from the votreader-assets `audio-v1` GitHub release (Drive 403s cross-site sec-fetch — dead end, documented); manifest + mirror pipeline; ✦ ornament under standalone closings; corpus c20.
- **One type scale + history race** (08-04 s4) — 103 hand-picked font sizes → a 13-step ladder in one `:root` block driven by one setting, 10px floor, gated by `check-type-scale.js`; `useNavHistoryTracking` no longer drops visits whose lazy corpus arrives after navigation; Scriptures layout cycler pulses.
- **Owner retirements** (08-04 s3) — backup-freshness boot reminder deleted whole (hook, Settings toggle, `lastExportAt` stamp, CSS); frontier resume jump deleted so scroll-position resume owns reopening again (frontier data still recorded for the held skim indicator); e2e assertion inverted + made non-vacuous.
- **Review-of-the-review + toolchain lift** (08-04 s2, `7db418e..7f4a903`) — prior session's unpushed commits deployed; TS7 + jsdom 30; SearchScreen race guards; 5 verified defects in the prior a11y batch fixed + sibling dialog/trap closures; backlog [27]+[28]; eslint 10 documented blocked.
- **Adversarial handoff review + whole-app loop** (08-04, `e4c9f2a..b750a33`) — backup limit/restore-guard hardening; reading/frontier/compact-progress coherence; keyboard/modal coverage; 360px toolbar + dual-viewport smoke contract; delayed-scroll lifecycle fix; live mobile/desktop QA; 3,356 vitest + 237 Kotlin + full web/native gates.
- **Reading-measurement engine** (08-03 s2) — word-count module + corpus baseline gate, geometry-sweep read detector (3 vectors, hl-key-keyed), count-valued readItems, ReadingStatsStore (IDB v8) + frontier resume, My Progress words/pace/day-bars + index minute chips; 17-agent review → 12 findings fixed (detector rebuilt off IO); E2E-proven live; skim indicator held (BACKLOG [21]).
- **Desktop width model** (08-03, `5a8381e`) — 24 inner caps px→rem (root-tier-proportional; mobile byte-identical; ~constant reading measure), 1600+ shell 980→1040, smoke-ci 1920×1080 + overflow tripwire; Sol's rail/grid/4K items deferred as future strikes.
- **GPT 5.6 Sol uplift batch adjudicated** (08-02 s3, `63562d0`) — backup staging-store atomicity + cross-tab lock + salvage-mode v3 restore (owner: 99% > 0), native recording lifecycle lock, log redaction, Garden HTTPS-per-hop, a11y sweep; review caught 2 P1s (content-masking aria-labels, Clear-All mutex hole) + withdrew 1 false finding; 3,242 vitest / 237 Kotlin.
- **Recon-driven strike run** (08-02 s2) — Opus 5 recon ranked 5 strikes, coordinator verified (caught 2 recon errors) + executed: cold boot −27% / bundle-a −59% (c19), use-settings + JournalInsertSheet first coverage (46 tests), SW install 4-concurrency, mode-toggle column pin (cascade trap), App() 800→769, −2 KB dead CSS.
- **SheetHandle + desktop viewport + 300% text** (08-02) — one grabber module closes every sheet (bar + ‹ chevron, 9 sites, 3 CSS classes retired), `--col-max` desktop tiers w/ composed font boost, Text Size cap 300% + full spill sweep, 44px footnote pager; 4 review-confirmed defects fixed same-session.
- **Reading Font picker + Settings accordion** (07-31) — 25-font `READING_FONTS` registry, all vendored in-app (1.73 MB `fonts/reading/`, stable-cache SW route, scripture-first order, SelectField dropdown), `--font-body` var plumbing; Settings → 8 collapsed accordion groups, dependent rows unmount.
- **About page 2 terse rewrite** (07-31, `2b0593d`) — onboarding features page → two headed groups, ~60 words, ten-translation count fixed.
- **Six-item UX batch** (07-30/31, `5f3e8c7`) — LibraryNav becomes THE top-nav (19 navs → 3; the small-back-arrow report was two root causes: LetterView's `nav-volume` cascade loss + `_idxNav` never adopting the icon back); drilled notebook header split into two rows; back pill everywhere but History (`journalEntryId` as the 7th tracked field, `backHint`/`backActive` split for `silent` History entries, journal-viewer one-pill precedence, back-stack machine finally tested); shared `splitCompoundRef` makes compound refs tap through per-part + note-row per-segment taps; ScripturesHome layout-cycle button sharing Settings' state; autoscroll dwell stepper on the pill + a MEASURED wpm replacing the ×9 guess (the naive per-line map would have shipped ~2000 wpm on block-level letter paragraphs). 3,140 vitest.
- **External-review run** (07-30) — 3 review batches adjudicated + the last reachable backlog items, 10 commits. Edge auto-scroll runaway fixed (band re-probed per tick); SW `clients.claim()` **and** the first-load reload regression it caused (broke smoke:ci); import-integrity warnings widened + retimed; journal `{{ref:}}` retry no longer outlives the screen; `allowContentAccess` **dropped, proven on-device**; Actions SHA-pinned + Dependabot; deps patched (brace-expansion "high" = advisory false positive, do not chase); the pre-commit vitest flake root-caused (passive-effect race) after standing open since 07-22; note-source +25 tests; **[17] 200% zoom audit passes**; splash black-flash check verified clean.
- **Selection scrolling** (07-29) — owner-reported "highlight locks scroll": P1-15's premise disproved on-device (identical drag scrolled 192px with AND without a selection); real cause was a toolbar placed once and never moved. Toolbar now re-places on every scroll frame (1:1 verified), native handle-drag auto-scrolls at the edge bands (`computeEdgeAutoScroll`), ▲/▼ nudge row retired; also fixed the assist-scroll yanking the reader ~2000px back on release.
- **Backlog run** (07-28, session 2) — FABLE5-BACKLOG cleared in one gated run: [15] Backup Verify, [13] focus traps, [8] search chips+sort, [9] index-screen scope chip, [16] journal delete undo, [7] tab rename+pin, [11] notebook colors, [12] Holy Days Year view, [10] True Black (dark-modifier, not a 3rd theme), [14] app.jsx tsc + ScreenRouteDeps contract, [18] ARCHITECTURE addendum; ~45 tests; [17]/[19]/[20] skipped with reasons in the backlog.
- **Responsiveness session** (07-28) — input lag root-caused on-device (thumbnail renders landing on interactions): calm gate + scroll-stop capture retired (15.9s → 0.14s blocked per 2-min read); single-allocation PixelCopy screenshot; unscrollable center-modal fix; external review adjudicated (1 done / 2 discarded / 1 already shipped). Round 2: "choppy" = WebView surface at 60 Hz on the 120 Hz ARR panel — `requestedFrameRate` peak vote (API 35+) + backdrop-blur purge on scroll-covering chrome; blue search-cancel × suppressed; root cause was Battery Saver's 60 Hz cap (votes deliver 120 once it's off). Then FABLE5 [15] landed: Settings "Verify a Backup" read-only .votbak inspector (full read path + CRC, applies nothing).
- **Import-hang fix** (07-22) — the "Importing… please wait" freeze = a Wave-0 confirm-sheet fire-and-forget regression; the confirm is now fire-AND-AWAIT; `v3ImportVerify` size-bounded; root-caused + verified on-device.
- **Native batches 1–5 + APK asset purge** (07-22) — five adjudicated external native reviews: cookies off, splash app-ready handshake + liveness hatch, trim-memory + JS trim signal, Garden stream-to-disk + redirect SSRF guard, voice-memo fetch bridge, manifest-cap OOM fix, recording audio focus, pre-allocated import buffer, scale-restore, v3 backup CRC-32 integrity; ~38 MB dead APK assets excluded + the `check-apk-assets` recurrence gate (after the `<dir>src` pattern silently dropped 9 translations — corrected same-day).
- **REVIEW-FIX batch** (07-22) — external deep review, 13/13 adjudicated + closed (tracker `REVIEW-FIX-2026-07-22.txt`); per-keystroke persist debounced at the sink; use-tabs CRITICAL INVARIANT 1 pinned.
- **Auto-scroll transport** (07-21/22) — hands-free reading (lines/min speed, `.reading-end` sentinel target, the scrollTop lease) + round 2 (2/3-viewport reading-zone stop, 0–15 s dwell slider, settings collapse-not-disable) + the SettingsScreen test harness (73-global classic-script seam paid once).
- **Holy Days crash killed** (07-21) — the app's one mixed-format collection needed format-gated peeks (WtlbEntryView vs LetterView) + `_wrapVot` on 2 bare routes; peeks must gate on SHAPE, not just resolution.
- **Corpus faithfulness audits complete** (07-19/20) — header lines restored (c15), studies swept (c16), restored-name title re-audit (c17 — the "the very HaMashiach" stranded-article class structurally dead), full body phrase-coverage diff (c18): the letter/entry corpus is line-by-line audited faithful to the site.
- **Swipe engine v3 + atomic reveal** (07-19) — real cross-book/volume/WTLB-family peeks, native commit decision (real-flick/spring-back/50%), flushSync single-task commit kills the one-frame flash; the reading dot follows position immediately (dwell now gates only streaks).
- **Blank footnotes killed** (07-19) — chapter-only refs resolve whole chapters with gold verse sups; validate-schemas gained a corpus-wide Bible-ref resolution pass (1,466 refs proven; c14).
- **Five-item batch** (07-18) — reading streak (IDB v5), GardenPosStore (v6), boundary instantCommit, press-drag-parity swipe hardening (document-capture + zombie watchdog), PC thumbnail robustness (captureTargetEl).
- **UX batch sessions 1–5 + follow-ups** (07-12..20) — Go-to-Scripture on every ref sheet, link-picker overhaul (Search/Browse/Recent + full-text scope), journal editor redesign (grid autosize, per-entry scroll keys, insert-below-never-split), text-size slider (80–160 %, chrome pinned in px), unselectable chrome, icon-only back nav, reading dot rehomed into the nav, dual-theme tab thumbnails, honest Save on note/notebook sheets, dead-UI sweep.
- **Restored-name NT editions** (07-12) — NKJV-R + KJV-R sparse overlays via the deterministic generator `tools/gen-restored-nt.mjs` (never hand-edit outputs); tracker `RESTORED-NAMES-PLAN.txt`.
- **Selection-toolbar placement** (07-11) — near-top selections auto-scroll the exact deficit; pure `computeToolbarPlacement`.
- **Fleet session** (07-03) — the tabs-drag lock-up root-caused ON-DEVICE (capture-phase listeners + zombie self-heal; the CDP-over-adb workflow), journal block reorder, then all four drag surfaces rebased onto one shared `createPressDrag` engine; 6 backlog items (notes search + export, My Progress dashboard, backup reminder, smoke search assert).
- **Classic search retired** (07-02) — MiniSearch is THE engine (−96 KB off bundle-a's cold path); first-run annotation hint; `FABLE5-BACKLOG.txt` written.
- **UX/design passes 1–2** (07-02) — destructive-action separation + a full 40-route/15-sheet walk on the owner's real imported data; voice-memo discard confirm, bulk-tab-close confirm, external-link ↗ marker.
- **Word-snap line-break fix** (07-01) — `blockBoundaryOffsets` + `snapSelectionRange`; a highlight's word-snap can no longer leak across an on-screen line break.
- **Tab title memory + Matthew fixes** (06-21) — sticky per-tab titles survive corpus unloads; matthew-ch kicks the VOT corpus; sheets portal to `<body>` (transformed-ancestor containing-block fix).
- **Real-inert page peeks + scroll polish** (06-16..19) — the swipe peek IS the destination screen rendered inert (pixel-identical, annotations pre-painted), ViewPager2-style finger-follow pager, content-anchor scroll restore, scrollbar parity; MiniSearch engine built (BM25 + fuzzy + warm IDB cache).
- **Data-faithfulness restoration — occasion lines + full HTML↔app audit** (06-11) — owner caught a missing "(Regarding Thanksgiving)" header line; restored the parenthetical occasion `noteLine` to ~40 Format A letters (`9c00a35`, c9→c10), then ran a deterministic HTML↔app diff of all 354 letters (`tools/_audit-*`). Corpus proved faithful EXCEPT two losses, fixed (`83857c7`, c10→c11): the 14 blank Letters-from-Timothy headers (date/from/forLine + attributions + 2 addendums + The Shadow's orphaned attribution footnote) and volume-seven "Recompense"'s dropped opening "Dream of a Coming Storm" (restored as a `sectionIntro`) + spoken line. LetterView `noteLine`/`from` now accept string-or-segments so a header line can carry a footnote bubble. **Then audited Format B too** (`c955289`, c11→c12, 06-12): all 360 WTLB One/Two + The Blessed entries present + complete; the lone editorial clarification footnote on WTLB One "YAHUWAH Is One" included per owner call. **Every VOT letter + WTLB/Blessed entry is now audited faithful to the source HTML.** HISTORY.md landmark.
- **Backup v3 streaming + audits 2–3 fully resolved** (06-02..07) — GB-scale `.votbak` streaming container on both platforms (`BACKUP-STREAMING-PLAN.txt`); the 14-agent BLIND-AUDIT (59 items) and 16-agent FLEET-AUDIT (78 findings) each closed DONE-or-adjudicated (trackers in repo root, HANDOFF blocks at top).
- **WebView floor lift → chrome108 + R8 + W10-lite a11y** (06-03) — retired the chrome69 floor (boot polyfills removed, Permanent Rule 6 rewritten, verification floor → `vot_api34`/WV113); release R8 + `isShrinkResources` ON (closes N6; APK 27.7→19.98 MB); GitHub Actions → Node-24; W10-lite a11y — `prefers-reduced-motion`, a WCAG-AA contrast fix (light-theme link-blue), **a global Text Size control** (`--font-scale` root multiplier + px→rem in the injected-CSS screens, `da050c8`), forced-colors highlight preservation + a touch-target audit (`0cd9075`). HISTORY.md landmark.
- **AUDIT-PLAN — fully resolved (PILE B)** (06-03) — N4/N6/N7/N8 native robustness (emulator-verified) + PF3 dropped + UX9 adjudicated; every P0–P3 item now DONE or adjudicated-with-reason.
- **N2** (06-01) — 2nd native-review: proguard keep-rule fix + oversize-import message; 10 dispositioned.
- **U0–U22 UPLIFT** (06-01, Waves 1–5) — 7→8/10: import durability, export fail-loud, minify, search-load, App() re-render, html2canvas-lazy, Garden allowlist, CSP hash-lock, coverage/CI-smoke/contract/PWA. Canonical: **UPLIFT-PLAN.txt**.
- **Android 8/9 black-screen + SAF export** (06-01) — `--target=chrome69` + boot polyfills; SAF export on every device; emulator-verified.
- **index.html ghost-comment purge** (06-01) — 1001→522 lines.
- **Garden** (05-31) — CSS-transform zoom + native per-page disk cache (device-verified) + CSP redirect fix.
- **Storage forensics** (05-31) — search-cache leak (~215 MB freed) + two-tier Settings storage rows.
- **Overlap-precedence** (05-31) — most-recent visible annotation wins; note icon always survives.
- **Footnote gold-render** (05-31) — marker-less guessing stripped; data marked + `validateFootnoteMarkers` gate.
- **Annotation UX overhaul** (05-31) — note-ness decoupled from `kind`; native tap→chip; multi-verse notes; ConfirmStrip.
- **W8** (05-31) — ui/ tree in typecheck; scripture JSDoc; @layer retired (net-negative); !important 19→14.
- **W9** (05-28/29) — Format A/B/C/D/E + import-payload validators (pre-commit + CI); Hebrews restored; KJV regen.
- **W7** (05-29) — raw() freeze, versioned migrations, hlTick removal, JS DiagnosticLog; W7.5/W7.6 resolved-with-data.
- **W5 / W4 / W3** (05-28) — GitHub Pages deploy + dual CI + content-hash SW versioning; desktop polish; PWA shell.
- **W2 / W1** (05-27) — all data in IndexedDB (19 stores) + StorageHealth + pending/loaded/degraded state machine; PlatformBridge (APK + PWA) + back-nav.
- **Font toggle** (05-27) — Classic (system serif, default) / Modern (Cinzel + EB Garamond).
- **N1 / NK / Post-NK** (05-25/26) — MainActivity decomposed (JsBridge/MainViewModel/NativeAudioRecorder/StorageManager/AppInterface); Kotlin test stack (134 tests); JsEvent registry; haptic bridge.
- **Q8 / Q7 / Q6 / Q5 / Q4 / Q3** (05-24/25) — lazy corpora (bundle-a 11.7 MB → ~816 KB); useSyncExternalStore; CSS hardening; vitest safety net; JSDoc/tsc; 0/0 ESLint.
- **P6–P11** (05-24/25) — App() 2,815 → <800 lines; 28 hooks; ROUTES factory; AppShellOverlays/Sheets.

(Delete-confirm standardization, JSX conversion, Surprise button, and earlier modularization phases: see HISTORY.md.)

---
### Roadmap

**`FABLE5-BACKLOG.txt`** (repo root) is the CURRENT working queue — a 20-item prioritized menu written 2026-07-02 for the owner's remaining Fable 5 window (session protocol + constraints inside; add DONE-log one-liners as items land). **`PLAN.txt`** + **`UPLIFT-PLAN.txt`** are historical strategic memory. The W0–W9 PWA/quality sequence and U0–U22 uplift are all closed; the only other remaining tracks are optional **W10 deep accessibility** and the owed manual device walks (`tools/n1-smoke-walk.md`). **HISTORY.md** is the complete landed-work log; **ARCHITECTURE.md** is the deep system reference; CLAUDE.md is the 30-second briefing.

---

## User policies (durable directives, override defaults)

- **App name is "VOTReader"** (personal app; multi-user-shaped but no auth, no organization).
- **NO AI / NO API KEYS / NO LLM** — deferred indefinitely per user 2026-05-11: *"no ai no nothing, no api keys, etc, those are security risks anyway, we'll defer a.i feature."* The LiteLLM nim-proxy is decommissioned. Do not reintroduce.
- **NO credentials / login / auth anywhere.** All personal data stays local on device.
- **NO security risks** — anything that could leak personal data or LAN-expose a service is a defect, not a polish item.
- `android:allowBackup="false"` — Export/Import in Settings → "Your Data" is the only backup mechanism. JSON file, user-owned, no credentials.
- GitHub identity (**VOTReader** — renamed from corbinlythgoe on 2026-05-28; account email unchanged) and Garden image hosting on GitHub Releases (now `VOTReader/votreader-assets`) are fine for now. Repo went **public** 2026-05-28 for GitHub Pages hosting (W5).
- No Play Store thinking until everything else is done — would also require Timothy's permission first.

---

## File structure

Directories and their jobs. **Exact per-directory counts were deleted 2026-08-10** — they drifted every commit and were quietly wrong for months, which is precisely what the CQ3 disclaimer in Architecture quick-facts warns about. `ls`/`wc` the tree when you need a number.

```
D:/VOTReader-studio/
├── CLAUDE.md                          # this briefing
├── HISTORY.md                         # landed work log
├── ARCHITECTURE.md                    # system reference
├── PLAN.txt                           # live strategic working memory
├── UPLIFT-PLAN.txt                    # 7→8/10 remediation — canonical home (U0–U22, all closed)
├── package.json, package-lock.json    # esbuild + eslint + puppeteer (smoke-ci) deps
├── .githooks/pre-commit               # versioned; activate: git config core.hooksPath .githooks
├── tools/
│   ├── build.py                       # emits bundle-a.js
│   ├── preview-server.py              # serves with Cache-Control: no-store
│   ├── smoke.js                       # 12-screen render walk + annotation round-trips
│   ├── smoke-ci.js                    # U16 — runs smoke.js headless (puppeteer) as a CI gate
│   ├── validate-schemas.js            # Format A/B/C/D/E data validator + CLI runner
│   ├── sync-sw-version.js             # content-hash CACHE_VERSION (build:sw)
│   ├── check-corpus-version.js        # U3 — CORPUS_VERSION enforcement gate
│   ├── sync-csp-hashes.js             # U10 — CSP script-src sha256 sync (build:csp)
│   └── SMOKE.md                       # smoke harness docs
├── app/src/main/
│   ├── assets/
│   │   ├── index.html                 # boot infra + data constants + bundle load sequence (App() lives in src/app.jsx)
│   │   ├── app.css                    # static CSS (no template literal)
│   │   ├── manifest.json              # W3 PWA manifest (standalone, gold theme)
│   │   ├── service-worker.js          # W3 SW — core + corpus cache buckets
│   │   ├── offline.html               # W3 offline fallback page
│   │   ├── icons/                     # W3 PWA icons (512/192/180/32/16px)
│   │   ├── dist/                      # 8 bundles, regenerated by npm run build
│   │   └── src/
│   │       ├── app.jsx                # function App() — ≤800-line canary gate (P11)
│   │       ├── data/                  # scripture-resolution.js + the raw corpus files
│   │       ├── stores/                # CachedStore-backed stores + _entry-b.js
│   │       ├── renderer/              # annotation-engine, dom-links, dom-bookmarks, dom-journal-chip + _entry.js
│   │       ├── ui/
│   │       │   ├── screen-routes.jsx  # buildScreenRoutes factory — THE ROUTES table
│   │       │   ├── screens/           # reading + index + hub screens (incl. MatthewChapterView, BibleStudyChapterView)
│   │       │   ├── components/        # shared components (incl. AppShellOverlays, AppShellSheets, HolyDaysPlaylistHeader)
│   │       │   ├── sheets/            # sheets + pickers
│   │       │   └── _entry-d.js        # esbuild entry for bundle-d
│   │       ├── utils/                 # helper bundles (incl. backup.js U1, storage-health.js, sw-register.js, diagnostic-log.js)
│   │       ├── hooks/                 # App() hooks (P6 + P7a–k + P11 dom-annotation-sync/keyboard-inset)
│   │       ├── components/            # ExpandableText, ErrorBoundary
│   │       └── styles/                # journal-styles
│   └── java/com/votreader/sacredui/
│       ├── MainActivity.kt              # WebView shell + lifecycle + BridgeHost impl
│       ├── AppInterface.kt              # @JavascriptInterface methods (window.AndroidBridge; incl. v3 backup bridge)
│       ├── BridgeHost.kt                # Abstraction over Activity surface for AppInterface
│       ├── JsBridge.kt                  # Type-safe wrapper around evaluateJavascript
│       ├── JsEvent.kt                   # Sealed registry of native-to-JS callbacks
│       ├── MainViewModel.kt             # AndroidViewModel — recorder + storage + insets + recovery state
│       ├── VOTReaderApp.kt              # Application subclass — plants Timber DebugTree / BoundedLogTree
│       ├── BoundedLogTree.kt            # Release-build Timber tree — ring buffer of last 200 WARN+
│       ├── NativeAudioRecorder.kt       # MediaRecorder lifecycle for journal voice memos
│       └── StorageManager.kt            # File I/O: import readUriAsBase64 + SAF export writeTextToUri
└── _ocr_out/, check_balance.py, etc.  # OCR pipeline + data validators
```

**CRITICAL:** Only edit files in `app/src/main/`. Never touch `app/build/`. Always edit D: files, never the C: junction or the `app.OLD-*` backup.

---

## Working-directory health check (run after fresh clone)

```sh
# 1. activate the pre-commit hook
git config core.hooksPath .githooks
# 2. install Node deps (node_modules/ is gitignored)
npm install
# 3. verify the toolchain
node --version    # expect v20+
npx esbuild --version    # expect 0.28+
# 4. rebuild bundles from source (proves the build pipeline works)
npm run build
# 5. preview: serve via tools/preview-server.py (NOT plain python -m http.server)
#    .claude/launch.json already points the preview tool at it.
#    Open index.html, paste tools/smoke.js into preview_eval, call votSmoke()
#    expect PASS line: globals ok, data ok, screens 0 crashed,
#    letterAnn ok, wtlbAnn ok, console.error 0, resource404 0
```

If Node is missing on Windows: `winget install OpenJS.NodeJS.LTS`. Use bash/git-bash for npm commands (PowerShell execution policy blocks `npm.ps1`).

**Preview cache gotcha:** `tools/preview-server.py` sends `Cache-Control: no-store` so reloads always fetch fresh bundles. The plain `python -m http.server` caches `dist/bundle-*.js` heuristically and serves stale bundles after a rebuild — don't use it.

---

## Quick start: app failed to load? read this first

If the app shows a black screen, run the validator:

```bash
pip install esprima  # one-time
python D:/VOTReader-studio/check_balance.py
```

It checks every data file for:
1. **esprima JS parse errors** (authoritative — catches real syntax bugs)
2. **Non-ASCII dashes (en/em) in verse ranges** like `12:18–20` — breaks the renderer's parseRefRange regex, so Unicode superscripts render as **white inline text** instead of gold sup
3. **Smart quotes** (`" " ' '`) used as JSON delimiters instead of ASCII `" '`

These are the three classes of bugs that brace-counting alone misses and any of which causes a black-screen failure or wrong rendering.

### Black-screen failure modes seen in this project

| Symptom | Root cause | Example | How to detect |
|---|---|---|---|
| Black screen at app start | Unescaped `"` inside JSON string value | `"Psalm 50:7": ""Hear, O My people..."" ` | esprima parse error |
| Black screen at app start | Unicode smart quotes used as delimiters | `"t": "text",` | esprima / `check_balance.py` |
| Verse numbers render as **white inline text** instead of gold sup | En dash `–` instead of hyphen `-` in verse range | `Exodus 12:18–20` | `check_balance.py` dash check |
| Footnote sheet shows blank cite | Translation tag mismatch in `nkjv` dict key | `"John 14:6 (CJB)"` not in nkjv | manual verify |
| Tap-through to wrong letter | Letter-link `letterTitle` misattributed | linked to "Subject to No Man" but content is from "A Just God and A Savior" | `misattribution_check.py` |

---

## Permanent rules (never violate)

1. **Verse ranges always use ASCII hyphen `-`**, never en dash `–` or em dash `—`. Affects `chapter:verse-verse` strings in keys, refs, labels, cites — anywhere the renderer parses a verse range. The em dash is fine **only** as separator in compound nkjv values: `"Exodus 12:6 — verse text | Exodus 12:18-20 — verse text"`.

2. **All JSON-style delimiters are ASCII `"`** (or `'` if you must). Smart quotes go INSIDE string values only, where they're typographic content. If a string value contains a literal ASCII `"`, escape it: `\"`.

3. **Run `check_balance.py` after every batch edit.** Single-file edits via `Edit` tool generally don't introduce these, but agent-generated content frequently does (especially OCR-style transcription). The versioned pre-commit hook at `.githooks/pre-commit` does this automatically when any `app/src/main/assets/src/data/*.js` is staged, and runs `npm run build` to regenerate bundles when any bundle-source file is staged. Emergency bypass: `git commit --no-verify` (not recommended).

4. **Footnote NKJV text uses decimal verse markers** (`"19. text 20. text"`) for multi-verse refs, never Unicode superscripts (`¹⁹text ²⁰text`). The `verse-sup` gold inlay rendering only fires when the decimal or superscript-with-clean-range strategy succeeds. Mixed formats fall through to the white-text fallback.

5. **Blob consumption: never `readAsArrayBuffer()` for large data.** Use `URL.createObjectURL(blob)` for audio/video playback and image display. Use `blob.stream()` for streaming reads. Use `blob.slice()` for partial reads. NEVER use `FileReader.readAsArrayBuffer()` or `FileReader.readAsDataURL()` on blobs >1 MB — it loads the entire blob into heap and will OOM on budget devices (2-3 GB RAM). The only exception is the export path (W2.6), which processes blobs sequentially with explicit size guards.

6. **esbuild targets `--target=chrome108`** on build:b/c/d/e/css + the corpus/data minify (`tools/minify-bundle.mjs`). The WebView floor was raised **chrome69→chrome108 on 2026-06-03** (owner call): the app is personal — the APK is sideloaded to modern, auto-updating-WebView devices (Chrome 130+ in practice) and the PWA runs on evergreen browsers — so the Chromium-69 floor was a *theoretical* device imposing a real syntax/feature/velocity tax for no reachable user. At chrome108, `?.`/`??`/`??=`/`Array.at`/`replaceAll` ship raw, and every runtime API the app relies on (`Promise.allSettled` C76, `Promise.any` C85, `globalThis` C71, `structuredClone` C98, `Blob.arrayBuffer`/`.stream` C76) is native — the index.html boot polyfills were deleted with the lift. The floor is still a HARD contract, but for **runtime APIs**, not syntax: esbuild transpiles too-new *syntax* down to 108 automatically, but it can NOT polyfill a runtime API **newer than Chromium 108** — that needs a feature-detected guard (not a target bump) or a deliberate floor bump. One unguarded = a silent black screen on a sub-floor device (desktop + modern Android hide it). Verification floor moved too: the `vot_api28` (WebView 69) emulator now black-screens **by design** — verify boots on desktop Chrome (`smoke:ci`) or a modern-WebView emulator. (The chrome69 era + its polyfills live in git / HISTORY.md.)

---

## Editing principles

1. **Edit > Write.** Use the Edit tool for surgical changes. Reserve Write for new files.
2. **Read before Edit.** Always Read the target file region first.
3. **No regex at file scope.** User has been burned by this. Local string replacements only.
4. **Preserve other letters.** When editing letter N in a multi-letter file, only touch letter N.
5. **Verify after agent runs.** Diff or re-read the section. Trust but verify.
6. **No new Holy Days originals.** Holy Days is curated cross-references; do not author new content.
7. **Format-preserving.** Volume Two uses unquoted JS keys (`id: "..."`); old volumes use quoted JSON-style (`"id": "..."`). Match the file's existing format.
8. **No bandaid renderers.** If text is broken, fix the source data, not the renderer.
9. **Footnote audience:**
   - Volumes (Format A) → numbered gold bubbles → tap → bottom sheet w/ NKJV verse
   - WTLB / Blessed (Format B) → inline `(Book X:Y)` parenthetical cite → tap → bottom sheet w/ NKJV verse
   - Holy Days entries inherit Format A or B based on `entry.type`

### Anti-patterns (NOT to do)

- Run regex `sed`/`grep -E` at file scope to "patch" footnotes
- Add a CSS bandaid for white verse numbers — fix the data or renderer instead
- Author new Letters that don't exist on the live website
- Use Hidden Manna entries in any public index, search, or home tile
- Add `metaAddendum` fields to letters that don't have an "Also read" on the live site
- Change Volume Two's format (it's the gold standard)
- Mix numbered footnote bubbles with inline `(Ref)` cites in the same letter
- Skip the Read-before-Edit verification

---

## Data formats — collection-by-collection

### Format A: Rich JSON-style (Volumes 1-7, Lord's Rebuke, Letters to Flock, Letters from Timothy, Hidden Manna)

```js
{
  "id": "the-wide-path",                    // URL slug
  "num": 1,                                 // sequence in volume
  "title": "The Wide Path",
  "date": "3/28/05",
  "from": "From The Lord, Our God and Savior",
  "spoken": "The Word of The Lord Spoken to Timothy",
  "forLine": "For All Those Who Have Ears to Hear",
  "audioUrl": "https://thevolumesoftruth.bandcamp.com/...",
  "soundcloudUrl": "...",                   // V1, V3, Timothy only
  "videoVoiceUrl": "https://www.youtube.com/...",
  "videoMusicUrl": "https://www.youtube.com/...",
  "relatedTopics": [
    { "label": "Regarding X", "url": "https://answersonlygodcangive.com/Regarding_X" }
  ],
  "footnotes": {
    "1": { "type": "scripture", "ref": "Isaiah 13:11" },
    "2": { "type": "scripture", "ref": "Psalm 2:12", "seeAlso": { "collection": "Volume Three", "letterTitle": "Grafted In", "label": "Grafted In", "excerpt": "..." } },
    "3": { "type": "note", "text": "Also read: 'Grafted In'", "link": { "collection": "Volume Three", "letterTitle": "Grafted In" } },
    "4": { "type": "note", "text": "External resource", "url": "https://..." }
  },
  "nkjv": {
    "Isaiah 13:11": "I will punish the world for its evil...",
    "Psalm 2:12": "Kiss the Son, lest He be angry..."
  },
  "metaAddendum": "\"Other Letter Title\"",        // Optional (V2 has 2)
  "metaAddendumUrl": "https://...",                // Optional
  "metaAddendumLink": { "collection": "Volume One", "letterTitle": "Other Letter Title" },
  "metaAddendumInternal": "judgment-of-god",       // Same-volume id
  "blocks": [
    { "type": "para", "segments": [
      { "t": "bold-italic", "v": "Thus says The Lord:" },
      { "t": "text", "v": " Peoples of..." },
      { "t": "italic", "v": "I shall surely..." },
      { "t": "fn", "v": "1" }
    ]},
    { "type": "poetry", "lines": [
      [{ "t": "text", "v": "Therefore, turn from this" }],
      [{ "t": "stanza-break" }],
      [{ "t": "italic", "v": "For I AM HE!..." }, { "t": "fn", "v": "2" }]
    ]},
    { "type": "closing", "text": "Says The Lord." },
    { "type": "closing-fn", "segments": [...] },   // Closing with attached footnote
    { "type": "scripture", ... },                  // Quoted scripture block
    { "type": "note", "text": "..." }              // Editorial note block
  ],
  "prevLetter": { "id": "the-wide-path", "title": "..." } | null,
  "nextLetter": { "id": "the-seventh-day", "title": "..." } | null
}
```

**Block types:** `para`, `poetry`, `closing`, `closing-fn`, `note`, `scripture`
**Inline `t` types:** `text`, `italic`, `bold-italic`, `caps`, `fn`, `stanza-break`, `letter-link`

### Format B: Simple paragraph (WTLB One, WTLB Two, The Blessed)

```js
{
  "id": "matters-of-the-heart",
  "num": 11,
  "title": "Matters of the Heart",
  "paragraphs": [
    { "align": "center", "text": "The wailing of the penitent\nBrings forth healing;" },
    { "align": "justify", "text": "Plain prose with _italic_ and **bold** and {{ref:Matthew 4:4}} inline scripture refs and {{nav:esther:7}} bible-chapter nav links." }
  ],
  "scriptures": { "Matthew 4:4": "But He answered..." },   // Optional per-entry NKJV
  "prevEntry": { "id": "...", "title": "..." } | null,    // (used in HOLY_DAYS only)
  "nextEntry": { "id": "...", "title": "..." } | null
}
```

**Inline patterns inside `text`:**
- `_italic_` (single underscore)
- `**bold**` (double asterisk)
- `{{ref:Book Chapter:Verse}}` — tappable scripture popup
- `{{nav:bookId:chapter}}` — navigate to Bible chapter (e.g. `{{nav:esther:7}}`)
- `†` — section divider character (The Blessed)
- `~ [From "Letter Title" ~ Volume X]` — attribution at end of WTLB entry (tap-through wired)

### Format C: Bible book (books.js, books-restored.js, matthew.js, bible-*.js)

```js
{
  "id": "ephesians", "title": "Ephesians",
  "subtitle": "...",
  "chapters": [
    { "num": 1, "title": "...", "sections": [{ "heading": "...", "verses": [{ "n": 1, "text": "..." }] }] }
  ]
}
```

### Format D: Bible Studies (bible-studies.js)

Multi-part studies with chapters. Each study has `parts[].chapterIds[]` referencing chapter entries. Lazy-loaded — saves 4.3 MB from cold-boot.

---

## Letter counts — downloaded vs. live website

| Collection | Downloaded | Status |
|---|---|---|
| Volume One | 29 + preface ("A Word of Warning") | ✅ |
| Volume Two | 29 | ✅ |
| Volume Three | 30 | ✅ |
| Volume Four | 29 | ✅ |
| Volume Five | 29 | ✅ |
| Volume Six | 31 | ✅ |
| Volume Seven | 66 + preface ("The Indignation of The Lord") | ✅ |
| The Lord's Rebuke | 30 + preface ("A Warning") | ✅ |
| Letters to the Flock | 61 + preface ("Be My Examples") | ✅ |
| Letters from Timothy | 14 + preface ("Put All Your Trust in The Holy One") | ✅ |
| WTLB Part One | 149 + intro | ✅ |
| WTLB Part Two | 203 (incl. intro) | ✅ |
| The Blessed | 8 sections + intro | ✅ |
| Hidden Manna | 1 ("Woe to Dallas") | ✅ by design (not publicly indexed) |
| Holy Days | 16 ghost entries (cross-pulled) | ✅ |
| Bible Studies | 7 + Matthew Study Bible (separate file) | partial (see HISTORY §14.5/14.7) |

**Holy Days = ghost album.** Curated cross-references from across other volumes. Each entry has a `sourceLabel` (e.g. "Volume Two"). Audited once for structure/nav; defer content sync until after source sweeps are stable.

**Hidden Manna**: only reachable via Matthew study chain. Do NOT add to public index, search, or home tile.
