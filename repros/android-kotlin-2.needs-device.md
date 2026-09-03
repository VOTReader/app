# android-kotlin-2

Verdict: needs device.

The finding requires exercising Android `WebView.restoreState()` with a
failed/null restore result and observing whether the fallback URL loads. The
only ADB target available during this run was a physical Pixel 9 Pro over TLS
ADB; `emulator` is not installed and no headless AVD is available. No device
was driven.
