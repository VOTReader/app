# Google Play: where VOTReader stands

Corbin, 2026-10-05 01:5x: Timothy gave permission. "Just get it there", do not publish yet.
This page is the handover: what is built, how to build it, and what is left that only Corbin can do.

## What exists now

| Piece | State |
|---|---|
| Store build | `store` build type in `app/build.gradle.kts`: release's R8 + resource shrink, signed with the upload key. |
| App id | `com.votreader.app` (permanent once uploaded). The daily stays `com.votreader.sacredui` on the debug key, so the two install side by side. |
| Version code | The UTC build hour, `yyMMddHH` (e.g. `26100512`), so every upload is higher. Pin one with `-Pvot.versionCode=<n>`. versionName is the web build's `CACHE_VERSION`. |
| Upload key | `D:\VOTReader-keys\votreader-upload.jks` (PKCS12, alias `upload`, RSA 4096, valid to 2054). Copy: `%USERPROFILE%\OneDrive\Backups\VOTReader\votreader-upload.jks`. SHA-256 `E3:F7:43:E7:51:5E:17:C7:59:90:24:38:B5:5E:ED:9C:A5:1D:9F:C3:72:C5:4C:FF:46:44:96:F7:F1:F6:1C:5C`. |
| Key password | Stored in the DPAPI secret store `D:\AgentBackbone\secrets\secrets.xml` as `VOT_UPLOAD_PASSWORD`. Only Corbin's Windows account on this laptop can decrypt it. Not in git, not in any doc. |
| Privacy policy | https://votreader.github.io/app/privacy.html (`app/src/main/assets/privacy.html`, pp1). |
| Icon slots | The store build's adaptive icon has background, foreground and a monochrome (themed icon) layer (`app/src/store/res/`). The monochrome layer is a placeholder open book until the new icon is picked. |
| Already compliant | targetSdk/compileSdk 36 (Play's API 36 rule from 2026-08-31), edge-to-edge, predictive back, POST_NOTIFICATIONS asked in context, both media services typed `mediaPlayback`, no native libraries (16 KB pages fine), cleartext off, backup off. |

## Build the bundle

```powershell
.\tools\play-bundle.ps1            # -> D:\VOTReader-build\<checkout>\app\outputs\bundle\store\app-store.aab
```

It decrypts the password into its own process, runs `gradlew :app:bundleStore` (lintVital runs inside it), checks the bundle is
signed `CN=VOTReader`, and prints the path. Without the key, `bundleStore` stops with a message instead of making an unsigned bundle.
CI never builds `store`.

**Never install a store-signed build on Corbin's Pixel by hand.** The store app reaches his phone through a Play testing track.

## Data safety form (draft answers)

The phone app sends nothing since bc1 (992bf257): the Cloudflare visit count loads only on votreader.github.io.

- Does your app collect or share any of the required user data types? **No.**
  - Notes, highlights, journal (photos, voice memos), bookmarks, progress, history and settings stay on the device. Play does not count on-device processing as collection.
  - Backups are files the user saves where they choose; the weekly copy goes to Downloads/VOTReader on the phone.
  - Audio, songs and pictures are downloads from GitHub release files and the app's own relay (no logs); a download request is not user data collection.
- Is all user data encrypted in transit? **Yes** (HTTPS only; cleartext is off).
- Can users request deletion? Nothing is held off the device. Uninstall or Settings › Your data › Erase deletes it.
- Ads: **No.** Account creation: **None.** App access: everything works without login.
- Microphone: used only for journal voice notes, stored on the device.

## App content answers (draft)

- Foreground service: "Media playback the user started" for `AudioKeepAliveService` and `PlaybackService`. Play asks for a short screen recording: start a letter's audio, lock the phone, show the lock-screen controls.
- Content rating (IARC): no violence, sex, gambling, user interaction, location or purchases. Expect Everyone / PEGI 3.
- Target audience: 13 and over (keeps out of the Families policy).
- Advertising ID: not declared. Answer **No**.
- News app: No. Government app: No. Health: No. Financial features: No.

## What is left (Corbin)

1. **Developer account.** Create it at https://play.google.com/console (one-time US$25). Personal or organization? A personal account made after 2023-11-13 must run a closed test with **12 testers opted in for 14 days in a row** before production. An organization account (needs a D-U-N-S number) skips that.
2. **12 testers** (personal account only): their Gmail addresses for the closed-test list.
3. **Upload the first bundle** to Internal testing, enroll in **Play App Signing** with a Google-generated app key (the default). Then a lost upload key is reset by Google support, not fatal.
4. **Save the key password in Bitwarden too.** The DPAPI copy dies with this laptop's Windows profile. An agent can copy it in with `D:\AgentBackbone\secrets\Invoke-WithSecret.ps1` once the vault is unlocked (`Unlock-Bitwarden.ps1` asks for the master password).
5. **Icon.** Pick one of the flat gold-on-charcoal options (overhaul sheet 40). Then the foreground becomes a transparent vector inside the 66 dp safe zone, the monochrome layer its silhouette, and the 512 px store icon comes from the same art.
6. **Listing text.** Name `VOTReader`. Short description draft (68 of 80): "Read and listen to Scripture and The Volumes of Truth, fully offline." Full description (up to 4000), category Books & Reference, and a **public contact email** (required).
7. **Screenshots and feature graphic.** 4 to 8 phone shots (1080x1920 or larger, 9:16) and a 1024x500 feature graphic; tablet shots only for a large-screen listing. The design lane makes these after the redesign pick.
8. **Copyrighted content** (hub default, synthesis decision 6): the NKJV and NKJV-R text, Word of Promise audio and the Gospel of John film audio are not covered by Timothy's permission. Default: a store build without them, KJV with BRM audio, until licenses arrive in writing. Not built yet; say yes/no.

## Left for agents (after the account exists)

- **App links:** add the Play app-signing SHA-256 (Play Console › App integrity) and `com.votreader.app` to `.well-known/assetlinks.json` in `VOTReader/VOTReader.github.io`, so shared passage links open the store app.
- **Boot check:** bundletool universal APK from `app-store.aab`, booted on the `vot_api34` emulator and the S22 (never the Pixel): bridge keep rules, About screen, no `ClassNotFound` in logcat.
- **WebView floor:** a native "Update Android System WebView" screen below Chrome 108 (audit H4).
- **System font size:** seed the in-app Text Size from `Configuration.fontScale` on first run (audit H6).
- **Moving Corbin's data:** on the daily, Settings › Your data › Back up now, then Check that file; install the store app from the testing track; Restore; compare counts. Keep the daily installed. Never uninstall it unless Corbin says so.
- **Public debug APK** (`apk-2026-09-22` on VOTReader/app): take it down once a testing track exists (hub default yes).
