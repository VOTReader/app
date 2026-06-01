# N1 + NK real-device smoke walk

The Kotlin tree's unit-test suite (NK1-NK6) covers what JVM-level
instrumentation can reach: pure-function escapes (JsBridge), file-I/O
state machines (StorageManager), bounded-buffer semantics
(BoundedLogTree), and Result sealed-class contracts. It cannot cover
the things only a real device exposes: actual WebView renderer crashes,
PixelCopy against hardware-accelerated surfaces, MediaRecorder capturing
real PCM, the keyboard slide animation's per-frame inset dispatch,
or whether DevTools actually attach on a debug APK.

This walk fills that gap. Run it once after a phase that touches the
native side; record the device/Android version/date at the bottom.

Prerequisites:
- Android phone with USB debugging enabled, connected.
- `adb` on PATH (Android Platform Tools).
- Both `debug` and `release` APKs built:
  ```sh
  ./gradlew :app:assembleDebug :app:assembleRelease
  ```
  Debug APK: `app/build/outputs/apk/debug/app-debug.apk`
  Release APK: `app/build/outputs/apk/release/app-release-unsigned.apk`
  (Release will need signing for install; a debug-key signed copy is
  fine for this walk — we're not shipping it.)

For every step, **STOP if the observation doesn't match expected**.
A failure here is real-device evidence that needs a fix commit, not
a footnote in the walk log.

---

## N1.1 — WebContents debugging gated on debug builds

Verifies the `BuildConfig.DEBUG` gate on
`WebView.setWebContentsDebuggingEnabled(true)`.

### Debug-APK side

1. Install debug build:
   ```sh
   adb install -r app/build/outputs/apk/debug/app-debug.apk
   ```
2. Launch the app on the device.
3. On the dev machine, open Chrome → `chrome://inspect/#devices`.
4. **Expected:** the device appears in the list with the VOTReader
   WebView selectable. Clicking "inspect" opens DevTools attached to
   the WebView.

### Release-APK side

5. Uninstall, then install the release build:
   ```sh
   adb uninstall com.votreader.sacredui
   adb install -r app/build/outputs/apk/release/app-release-unsigned.apk
   ```
6. Launch the app on the device.
7. Refresh `chrome://inspect/#devices`.
8. **Expected:** the device appears in the list but the VOTReader
   WebView does NOT. (Other Chrome processes — system WebView, the
   browser — may still show. Specifically, no entry for the
   `com.votreader.sacredui` package.)

---

## N1.3 — Renderer-crash recovery + crash-loop guard

Verifies that `onRenderProcessGone` rebuilds the WebView, and that the
60-second sliding-window guard kicks in after 3 crashes in a minute.

1. Install the debug build (`adb install -r ...debug.apk`).
2. Launch the app, navigate to any letter view.
3. Force a single renderer crash via DevTools:
   - Attach DevTools (per N1.1).
   - In the DevTools console: `chrome://crash` then hit Enter, OR
     evaluate `void location.assign('chrome://crash')`.
4. **Expected:** the WebView reloads automatically to index.html
   within ~1 second. The user sees a brief blank → splash → app re-render.
   No "Tap to reload" message.
5. Inspect Logcat:
   ```sh
   adb logcat -d -s VOTReader:* AndroidRuntime:E | tail -30
   ```
   **Expected:** a single `WebView renderer died (crashed=true). Recovering.`
   line.
6. Crash three more times within 60 seconds (repeat step 3 three times,
   no more than ~20s apart).
7. **Expected after the third crash:** a centered TextView appears
   reading "The page stopped responding. Tap to reload." Logcat
   shows `Renderer crashed 3 times in 60s. Showing retry view.`
8. Tap the retry text.
9. **Expected:** counters reset to 0; WebView attaches and loads
   index.html successfully.

---

## N1.5 — JsBridge is the only path to evaluateJavascript

Verifies that every cross-boundary call (except the documented
per-frame IME exception) routes through `JsBridge`. NK2b's `require()`
gate also fires on disallowed fn names.

1. Install + launch the debug build.
2. Enable verbose logging:
   ```sh
   adb logcat -c
   adb shell setprop log.tag.WebViewJS VERBOSE
   ```
3. Exercise:
   - Open a letter (triggers `injectInsets` → `setCssProperties`).
   - Import a file (triggers `__onImportFile` callback).
   - Tap a notebook icon (triggers `__onMicPermissionResult` flow
     only if voice memo is invoked; skip if no recording planned).
4. Capture Logcat for the run:
   ```sh
   adb logcat -d | grep -E '"VOTReader|WebViewJS|JsBridge"' | head -50
   ```
5. **Expected:** no log lines saying "evaluateJavascript" outside the
   intentional N1.8 per-frame IME path. No `IllegalArgumentException:
   JsBridge: fn must be a JS identifier` — that's the require() gate
   firing on a malformed fn name, which would mean a regression in the
   call sites (we've audited all three production callees as `\w+`).

---

## N1.6 + N1.7 — PixelCopy screenshot on hardware-accelerated content

Verifies the screenshot bridge captures real pixels (not a blank
white frame) including hardware-accelerated surfaces.

1. Install + launch the debug build.
2. Navigate to a letter with a **video iframe** embedded (Volume One
   often has voice-recording YouTube embeds). Wait for the video to
   load.
3. Open a tab thumbnail capture — go to home → "Tabs" → snapshot.
4. **Expected:** the thumbnail shows the actual letter content
   including the video poster frame. Before N1.6 (the WebView.draw
   path), the iframe area would be white/black; after, it shows
   the hardware-accelerated content.
5. Take a screenshot during an active scroll / animation. (Force this
   by holding the scroll mid-animation.)
6. **Expected:** capture completes without hang; thumbnail shows the
   mid-animation state, not a stale frame.
7. Stress timeout: open DevTools, set a breakpoint inside the
   WebView's render path (or simulate by toggling airplane mode while
   the capture is in flight). The `withTimeoutOrNull(2_000L)` should
   abort cleanly.
8. **Expected:** capture returns `""` (empty data URI), no native
   crash, no leaked bitmap (verifiable with Memory Profiler in Android
   Studio — bitmap allocation should drop after the timeout fires).

---

## N1.8 — Per-frame IME inset tracking

Verifies bottom-anchored UI tracks the keyboard slide smoothly at 60Hz
rather than jumping at start/end.

1. Install + launch the debug build.
2. Navigate to the Journal editor (or any sheet with a text input that
   triggers the soft keyboard).
3. Tap the input. **Expected:** the editor's UI moves UP smoothly
   alongside the keyboard slide animation — no visible "jump".
4. Tap outside to dismiss. **Expected:** UI moves DOWN smoothly.
5. Optional verification: enable GPU profiling in Developer Options
   → Profile GPU rendering → On screen as bars. Bars should stay
   below the 16ms line during the slide.

---

## N1.9 — Recorder + state survives orientation change

Verifies MainViewModel.audioRecorder is preserved across config
changes (which the manifest already prevents from full Activity
recreation, but the ViewModel is insurance).

1. Install + launch the debug build.
2. Open the Journal editor for a new entry, tap the voice-memo
   record button. Speak for ~5 seconds.
3. **DO NOT STOP RECORDING.** Rotate the device.
4. **Expected:** the recording continues. The waveform UI keeps
   updating. The recording timer keeps incrementing.
5. Stop recording.
6. **Expected:** preview plays back the full ~5-second clip
   including the recording-across-rotation period.
7. Save the entry. Re-open it.
8. **Expected:** the saved audio clip plays back cleanly.

---

## N1.10a + N1.10b — Storage safety: oversize import + Downloads export

Verifies the 50 MB cap on imports and the Q+ Downloads write path.

### Oversize-import rejection (N1.10b)

1. On the dev machine, create an oversized JSON file:
   ```sh
   dd if=/dev/zero of=/tmp/big.json bs=1M count=60
   # Make it a valid-ish JSON envelope so the picker mime hint accepts:
   printf '{"app":"VOTReader","exportVersion":1,"data":{"vot-x":"' > /tmp/big.json
   head -c 60000000 /dev/urandom | base64 >> /tmp/big.json
   printf '"}}' >> /tmp/big.json
   ```
   (Adjust the command for whatever shell is available — 60 MB is enough
   to exceed the 50 MB cap.)
2. Push to the device:
   ```sh
   adb push /tmp/big.json /sdcard/Download/
   ```
3. In the app: Settings → "Your Data" → Import. Pick `big.json`.
4. **Expected:** a generic "Import failed" alert (or similar — the JS
   side treats unknown-size + too-large as the same code path).
   Logcat shows `Import rejected: size=62914560 (limit=52428800)`
   from StorageManager.

### SAF export (saveToFile — replaces the old Downloads-collection path)

The export now goes through the SAF "create document" picker (the user
chooses folder + filename) instead of writing straight to Downloads.
This works on every supported API level — the old MediaStore.Downloads
writer hard-failed on Android 8/9 (minSdk 26), so this is also the fix
for "Export does nothing on a pre-Android-10 device." **Verify on a
genuine Android 8 or 9 device/emulator, not just a modern one** — that's
the case the change exists for.

5. On the device: Settings → "Your Data" → Export.
6. **Expected:** the system "Save to…" document picker appears with the
   filename `votreader-backup-YYYY-MM-DD.json` pre-filled. Pick any
   folder (Downloads, Documents, an SD card, a cloud provider — all are
   offered by SAF) and confirm.
7. **Expected:** toast "Backup saved." Then verify the file landed where
   you chose, e.g. for Downloads:
   ```sh
   adb shell ls -la /storage/emulated/0/Download/ | grep votreader-backup
   ```
   **Expected:** a `votreader-backup-YYYY-MM-DD.json` with non-zero size.
8. Pull and inspect:
   ```sh
   adb pull /storage/emulated/0/Download/votreader-backup-*.json /tmp/
   python -c "import json; d=json.load(open('/tmp/votreader-backup-...json')); print(list(d.keys()))"
   ```
   **Expected:** prints the payload keys including `app`, `exportVersion`,
   `exportDate`, `diagnosticLog`, `data`, `stores`, `media` — confirming
   the full v2 payload (structured stores + journal media) landed.
9. **Cancel path:** tap Export, then dismiss the picker with Back.
   **Expected:** no toast, no error, app unchanged (the "cancelled"
   branch of `__onExportComplete` stays silent).

---

## NK5 — BoundedLogTree captures + sanitizes on release

Verifies the release-build Timber tree accumulates warnings and the
Export JSON's `diagnosticLog` field carries them with content URIs +
absolute paths redacted.

1. Install the RELEASE build (`adb install -r ...release-...apk`).
2. Launch the app.
3. Trigger at least one WARN-level event:
   - Force a renderer crash (per N1.3) — logs "WebView renderer died".
   - OR force an import failure (per N1.10b) — logs "Import rejected".
4. Navigate to Settings → "Your Data".
5. **Expected:** the "Diagnostic Log" row reads
   `"<N> recent <entry|entries> captured (warnings and errors only,
   content URIs and file paths redacted). Included in your next
   Export. Last entry: <date>"` for N >= 1.
6. Tap Export. Pull the exported file (per N1.10b step 8).
7. Inspect the diagnosticLog field:
   ```sh
   python -c "
import json
d = json.load(open('/tmp/votreader-backup-...json'))
log = d.get('diagnosticLog', [])
print(f'entries: {len(log)}')
for e in log[:5]:
    print(f'  {e}')
"
   ```
   **Expected:**
   - At least one entry.
   - Each entry has keys `t`, `lvl`, `tag`, `msg`.
   - `lvl` is one of `W`, `E`, `A` (no `D`/`I`/`V`).
   - For the import-failure entry: `msg` contains `[uri]` or `[path]`
     where the redaction substituted, NOT the literal `content://` or
     `/storage/...` substring.
8. Sanitization probe: open Settings on the debug APK (not release),
   tap Diagnostic Log row should NOT exist (the conditional render
   keys on `getCrashLog` being a function, which it isn't on debug
   builds — debug plants DebugTree instead of BoundedLogTree).

---

## Sign-off

After completing the walk without skips or fails, append a line to
HISTORY.md under the most recent NK or N1 closure entry:

> **Real-device walk completed:** [device model] · Android [version] · [YYYY-MM-DD]

If any step failed, do NOT sign off — open a fix commit citing the
step number, then re-run from that step.
