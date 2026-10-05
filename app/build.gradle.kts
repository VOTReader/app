import java.time.LocalDateTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    jacoco
}

// ── OneDrive build-lock workaround: relocate this module's build outputs ──
// This `app/` folder is reached by OneDrive through a legacy junction
// (C:\Users\…\OneDrive\Desktop\VOTReader-studio\app → D:\VOTReader-studio\app),
// so OneDrive follows the junction, syncs app/build, and stamps cloud/
// read-only attributes on the .class/.dex outputs. Gradle's Java file deleter
// then throws AccessDenied on the incremental-build cleanup step, breaking
// every rebuild in Android Studio. (Removing the junction is denied while
// OneDrive/Studio hold handles, and would lose the OneDrive source backup.)
//
// Fix: if local.properties defines `vot.buildDir`, put this module's build
// outputs there — OUTSIDE the OneDrive-synced tree — so they're never stamped.
// All later `layout.buildDirectory` references (JaCoCo paths below) follow
// automatically. The key is machine-local + gitignored, so CI (which has no
// such key) keeps the default app/build and is unaffected.
run {
    val localProps = rootProject.file("local.properties")
    if (localProps.exists()) {
        val props = Properties()
        localProps.inputStream().use { props.load(it) }
        val customBuildRoot = props.getProperty("vot.buildDir")?.trim()
        if (!customBuildRoot.isNullOrEmpty()) {
            // Per CHECKOUT, not just per machine. Every git worktree gets a copy of
            // the same gitignored local.properties (it has to -- Gradle fails with
            // "SDK location not found" without one), so a bare vot.buildDir pointed
            // every worktree on this machine at ONE build directory. Two agents
            // running :app:testDebugUnitTest in different worktrees then overwrote
            // each other's test XML and lint reports, and a count read back from
            // there was whoever finished last. That is not hypothetical: it put
            // wrong test totals in three of my commit messages on 2026-09-04.
            //
            // Derived from the checkout path rather than configured, so a COPIED
            // local.properties cannot collide however carelessly it is copied.
            val checkout = rootProject.projectDir.name
            layout.buildDirectory.set(file("$customBuildRoot/$checkout/app"))
        }
    }
}

android {
    namespace = "com.votreader.sacredui"
    compileSdk {
        version = release(36) {
            minorApiLevel = 1
        }
    }

    defaultConfig {
        applicationId = "com.votreader.sacredui"
        minSdk = 26
        targetSdk = 36
        versionCode = 1
        // us1 (U5): the build's own version, not a fixed "1.0" - the service worker's CACHE_VERSION
        // (a content hash of the web build, e.g. v1.0.2-4c7f32a9b1), so Android's app info, the usage
        // counts and Settings' App version row all name the same build. versionCode stays 1: the
        // owner's phone updates in place (adb install -r), which a higher code would not need but a
        // lower one would refuse.
        versionName = providers.fileContents(layout.projectDirectory.file("src/main/assets/service-worker.js"))
            .asText.map { Regex("const CACHE_VERSION = '([^']+)'").find(it)?.groupValues?.get(1) ?: "1.0" }
            .getOrElse("1.0")
    }

    // ln5 (Play, Corbin 2026-10-05 01:5x "just get it there", do not publish): the Play UPLOAD key.
    // Play App Signing holds the real app-signing key, so a lost upload key is reset in the Play
    // Console, not fatal. The keystore lives outside git (D:/VOTReader-keys, a copy in OneDrive
    // Backups); its password is never in a file Gradle reads - tools/play-bundle.ps1 decrypts it from
    // the DPAPI store into VOT_UPLOAD_PASSWORD for one build. Without both, `upload` does not exist
    // and the store tasks refuse to run (below), so CI and every other build type are untouched.
    val uploadStore = file(providers.gradleProperty("vot.uploadStore")
        .orElse("D:/VOTReader-keys/votreader-upload.jks").get())
    val uploadPassword = providers.environmentVariable("VOT_UPLOAD_PASSWORD").orNull
    signingConfigs {
        if (uploadStore.isFile && !uploadPassword.isNullOrEmpty()) {
            create("upload") {
                storeFile = uploadStore
                storePassword = uploadPassword
                keyAlias = "upload"
                keyPassword = uploadPassword
            }
        }
    }

    buildTypes {
        release {
            // N2.1b: R8 code shrink + obfuscate + optimize. ACTIVATES the dormant
            // keep rules in proguard-rules.pro (AppInterface @JavascriptInterface
            // bridge, JsEvent sealed hierarchy, BoundedLogTree.LogEntry — N6).
            isMinifyEnabled = true
            // isShrinkResources strips unused res/ entries. R8's resource shrinker
            // runs in SAFE mode (resources reached via Resources.getIdentifier()/by
            // name are retained), and the app's dynamic UI is React-in-WebView (assets/,
            // never shrunk) — res/ is only the splash/icons/theme. Validated on the
            // vot_api34/WV113 emulator: minified+shrunk release boots, renders the
            // welcome + About, no missing-resource errors.
            isShrinkResources = true
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        // ap1 (improvement sweep v10-02; Corbin 2026-09-24 22:1x): the build for the owner's daily
        // phone. A copy of debug - same debug signing, applicationId and versionCode - with debugging
        // OFF: BuildConfig.DEBUG is false, so no WebView remote debugging (MainActivity) and the
        // redacting BoundedLogTree instead of DebugTree (VOTReaderApp). Same key and versionCode mean
        // `adb install -r app-daily.apk` upgrades an installed debug build in place and keeps its data.
        // Never move the phone to release signing in place: that needs an uninstall, which wipes the
        // journal. Test devices (S22, emulators) keep `debug`.
        create("daily") {
            initWith(getByName("debug"))
            isDebuggable = false
        }
        // ln5: the Play Store build - `./gradlew :app:bundleStore` (tools/play-bundle.ps1 wraps it).
        // release's R8 + shrink, signed with the upload key, and its own applicationId
        // (com.votreader.app, set in androidComponents below) so it installs BESIDE the daily
        // (com.votreader.sacredui, debug key): the owner moves his data with Export / Verify / Import
        // and never uninstalls. Never install a store-signed build on his Pixel by hand.
        // Its own res (src/store/res) carries the adaptive + monochrome icon slots.
        create("store") {
            initWith(getByName("release"))
            matchingFallbacks += listOf("release")
            signingConfig = signingConfigs.findByName("upload")
        }
    }

    // AGP 8.0+ disabled automatic BuildConfig generation; re-enable so
    // BuildConfig.DEBUG can gate developer-only paths (e.g.
    // WebView.setWebContentsDebuggingEnabled in onCreate).
    buildFeatures {
        buildConfig = true
    }

    // ── APK asset bloat fix: stop packaging dead weight from assets/ ──
    // The signed release APK shipped ~51 MB of assets nothing at runtime
    // reads: index.html only loads dist/ bundles (verified against the June
    // APK: 283 entries under assets/src/, 77 *.test.* files, unminified JSX).
    // assets/ is shared with the PWA, so the files STAY in the repo — this is
    // purely a packaging exclusion.
    //
    // NOT everything under assets/src/ is dead. `src/data/` holds TEN files
    // that are injected AT RUNTIME as <script src="src/data/…"> by
    // src/data/translations.js — the nine alternate Bible translations
    // (including the NKJV-R / KJV-R restored-name editions) and
    // bible-studies.js. They are ~36 MB, they are NOT in any dist/ bundle,
    // and there is no native loader path. Excluding the whole `src` tree
    // silently broke them in the APK: every non-NKJV translation fell back
    // to NKJV via the onerror handler, and Studies dead-ended on "Try
    // again". They must ship (Permanent policy: the app is self-contained
    // and offline). So the exclusions below name the DEAD files instead of
    // the whole tree — see SettingsScreen → Bible Translation.
    //
    // Excluded:
    //  - the bundle-only source dirs (components/hooks/renderer/search/
    //    stores/styles/ui) + app.jsx — all concatenated into dist/.
    //  - the src/data files that build.py concatenates into a bundle
    //    (books*, matthew*, the VOT corpora, and the ES modules).
    //  - *.lnk           Windows shortcut junk (one shipped in the June APK).
    //  - *.test.js       vitest files, incl. assets/service-worker.test.js.
    //  - the four dead root files already concatenated into dist/bundle-a.js
    //    (app.css → only dist/app.min.css is referenced; react.min.js,
    //    react-dom.min.js, search-data.js).
    //
    // KEPT ON PURPOSE (runtime-injected — do not add these):
    //    bible-asv/bsb/hnv/kjv/lsv/rkjv/rnkjv/web/ylt.js, bible-studies.js
    // tools/check-apk-assets.js enforces that; it fails the build if a
    // runtime-injected path ever lands in this ignore list.
    //
    // Patterns are aapt-syntax and match each file/dir's BASENAME
    // (case-insensitive), not the full path — verified against AGP 9.2.1's
    // PatternBasedFileFilter: "*suffix" / "prefix*" globs only, "<dir>"/
    // "<file>" restrict by kind, "!" just suppresses the ignore warning.
    // Basename matching makes these safe: "app.css" is an exact match and
    // cannot hit dist/app.min.css; "*.test.js" has no match under dist/.
    //
    // IMPORTANT: providing ANY pattern replaces aapt's built-in default set
    // (MergeSourceSetFolders only calls setIgnoredPatterns when the list is
    // non-empty, which swaps the whole filter), so the defaults are
    // re-declared first to keep dotfile / _dir / backup-file filtering.
    androidResources {
        ignoreAssetsPatterns += listOf(
            // aapt defaults (gDefaultIgnoreAssets), re-declared verbatim.
            "!.svn", "!.git", "!.ds_store", "!*.scc", ".*", "<dir>_*",
            "!CVS", "!thumbs.db", "!picasa.ini", "!*~",
            // VOT packaging exclusions (see comment block above).
            // Bundle-only source trees + entry.
            "<dir>components", "<dir>hooks", "<dir>renderer", "<dir>search",
            "<dir>stores", "<dir>styles", "<dir>ui",
            "app.jsx",
            // src/data files concatenated into dist/ bundles by build.py.
            "books.js", "books-restored.js",
            "matthew.js", "matthew-plain.js", "matthew-nkjv.js",
            "volume-one.js", "volume-two.js", "volume-three.js", "volume-four.js",
            "volume-five.js", "volume-six.js", "volume-seven.js",
            "letters-timothy.js", "letters-flock.js", "lords-rebuke.js",
            "wtlb-one.js", "wtlb-two.js", "wtlb-scriptures.js",
            "the-blessed.js", "holy-days.js", "hidden-manna.js",
            // audio-manifest.js rides bundle-a-vot too (2026-09-01). audio-sync.js is in
            // the same position but stays loose on purpose: the c41 lazy-load needs it.
            "audio-manifest.js",
            // src/data ES modules (bundled into dist/bundle-b / -d).
            "scripture-resolution.js", "translations.js",
            "journal-helpers.js", "letter-linking.js",
            // Junk + tests + root duplicates.
            "*.lnk",
            "*.test.js",
            "app.css",
            "react.min.js",
            "react-dom.min.js",
            "search-data.js",
        )
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    // NK1: Robolectric needs the parsed AndroidManifest + resources to
    // construct a working Application context. Without this flag, every
    // Robolectric-backed test (StorageManager, future WebView shadows)
    // gets a null context. JUnit Platform routes both engines:
    //  - jupiter  → JUnit 5 @Test annotations (pure-unit tests)
    //  - vintage  → JUnit 4 @RunWith(RobolectricTestRunner::class) bridge
    testOptions {
        unitTests.isIncludeAndroidResources = true
        unitTests.all {
            it.useJUnitPlatform()
        }
    }
}

// NK6: JaCoCo coverage gate.
// Kover 0.9.1 (Feb 2025) pre-dates AGP 9's variant-API stabilization
// and emits an empty report on this stack — switched to JaCoCo, which
// AGP has supported natively for years. Same gate, different tool.
//
// Scope: the pure-JVM classes whose tests JaCoCo can reliably
// instrument (JsBridge, BoundedLogTree). MainActivity / MainViewModel /
// NativeAudioRecorder / VOTReaderApp are excluded — they're
// framework-coupled and the real coverage of their happy paths lives
// in the n1-smoke-walk (NK7) against an actual device, not Robolectric.
//
// StorageManager is ALSO excluded from the gate, but for a different
// reason: its tests run under @RunWith(RobolectricTestRunner), and
// Robolectric loads production classes through its sandbox classloader,
// which bypasses JaCoCo's runtime bytecode-rewriting agent. The result
// is StorageManager appearing 0% in the JaCoCo report even though
// every method is exercised by StorageManagerTest. Including it would
// drag the aggregate to ~58% and the gate would be dominated by the
// instrumentation artifact rather than real coverage. The tests still
// run on every commit; the gate just measures the surface where its
// numbers are honest.
//
// Ratchet discipline (mirrors vitest.config.js): the floor only goes
// UP. If a refactor genuinely needs to drop coverage briefly, prove
// the new floor with the HTML report first, then lower the minimum
// here in the same commit — never silently relax.
// ln5: the store build's identity. applicationId is permanent once uploaded; versionCode must rise
// with every upload, so it is the UTC build hour (yyMMddHH, e.g. 26100512 - fits Play's 2100000000
// cap until 2100) unless -Pvot.versionCode=<n> pins one. The daily and debug builds keep code 1.
val storeVersionCode: Int = providers.gradleProperty("vot.versionCode").map(String::toInt).getOrElse(
    LocalDateTime.now(ZoneOffset.UTC).format(DateTimeFormatter.ofPattern("yyMMddHH")).toInt()
)
androidComponents {
    onVariants(selector().withBuildType("store")) { variant ->
        variant.applicationId.set("com.votreader.app")
        variant.outputs.forEach { it.versionCode.set(storeVersionCode) }
    }
}
// An unsigned store bundle is useless to Play: asked for one without the key, fail at the variant's first task, not
// after R8 and packaging. (A whole-project `assemble`/`build` still makes an unsigned store output, as it does for release.)
val storeSigned = android.signingConfigs.findByName("upload") != null
val storeAsked = gradle.startParameter.taskNames.any { it.substringAfterLast(':') in setOf("bundleStore", "assembleStore") }
tasks.matching { it.name == "preStoreBuild" && storeAsked }.configureEach {
    doFirst {
        if (!storeSigned) throw GradleException(
            "The store build needs the upload key: run tools/play-bundle.ps1 (it sets VOT_UPLOAD_PASSWORD; " +
            "keystore D:/VOTReader-keys/votreader-upload.jks or -Pvot.uploadStore=<path>). See docs/PLAY.md."
        )
    }
}

jacoco {
    toolVersion = libs.versions.jacoco.get()
}

// Tell AGP to attach the JaCoCo agent to debug unit tests so the
// :app:testDebugUnitTest task emits a .exec file.
android {
    buildTypes {
        getByName("debug") {
            enableUnitTestCoverage = true
        }
    }
}

// Classes under coverage measurement.
//
// C2-D [D5], 2026-08-10 — WIDENED 2 -> 5, and the single blended BUNDLE floor
// became one PER-CLASS floor each. The old gate measured JsBridge +
// BoundedLogTree only: 249 Kotlin tests ran on every commit and 11 of 13
// classes were ungated, so a suite could be deleted wholesale without the
// build noticing.
//
// The five here are exactly the classes whose JaCoCo numbers are HONEST —
// measured 2026-08-10 by pointing classDirectories at the whole package and
// reading jacocoTestReport.xml:
//
//   BoundedLogTree     73/73  100.0%   (incl. $Companion + $LogEntry)
//   MainActivityLogic  34/34  100.0%   (incl. $RecoveryDecision, $ScreenshotGeometry)
//   JsBridge           32/46   69.6%
//   AppInterface      135/232  58.2%
//   GardenImageCache   74/137  54.0%
//
// EXCLUDED, and why — every one of these HAS tests that run on every commit;
// they are excluded because JaCoCo cannot see them, not because they are
// untested. Their suites run under @RunWith(RobolectricTestRunner), and
// Robolectric loads production classes through its own sandbox classloader,
// which bypasses JaCoCo's bytecode-rewriting agent. Measured, they report:
//   StorageManager 0.4% · NativeAudioRecorder 0% · AudioKeepAliveService 0% ·
//   MainViewModel 0% · VOTReaderApp 0% (its $Companion, reached from a plain
//   JVM test, reports 100% — which is the artifact in one line).
// A 0% floor is a gate that measures nothing, so they stay out. MainActivity
// (0/289) has no unit suite at all by design: its testable logic was extracted
// to MainActivityLogic, which is gated here at 100%.
//
// U17's finding is now obsolete, not reverted: GardenImageCache was tried in
// the BLENDED bundle rule and dragged the aggregate to 0.59 (< 0.85), so it
// was pulled. Per-class floors are exactly the shape that objection asks for —
// its 54% is locked at 54% and cannot dilute anyone else's number.
val coveredClasses = listOf(
    "com/votreader/sacredui/JsBridge*.class",
    "com/votreader/sacredui/BoundedLogTree*.class",
    "com/votreader/sacredui/MainActivityLogic*.class",
    "com/votreader/sacredui/AppInterface*.class",
    "com/votreader/sacredui/GardenImageCache*.class",
    "com/votreader/sacredui/NativeAudioLogic*.class"
)

// Helper that returns the class tree filtered to the covered set.
// AGP 9 emits Kotlin .class files under
// `intermediates/built_in_kotlinc/debug/compileDebugKotlin/classes`
// (older AGPs used `tmp/kotlin-classes/debug`). The javac path covers
// the (currently empty) Java sources too.
val coveredClassFiles: () -> ConfigurableFileCollection = {
    files(
        fileTree(layout.buildDirectory.dir(
            "intermediates/built_in_kotlinc/debug/compileDebugKotlin/classes"
        )) {
            include(coveredClasses)
        },
        fileTree(layout.buildDirectory.dir("intermediates/javac/debug/classes")) {
            include(coveredClasses)
        }
    )
}

val testExecFile = layout.buildDirectory.file(
    "outputs/unit_test_code_coverage/debugUnitTest/testDebugUnitTest.exec"
)

tasks.register<JacocoReport>("jacocoTestReport") {
    group = "verification"
    description = "Aggregate JaCoCo HTML + XML report for the covered classes."
    dependsOn("testDebugUnitTest")
    executionData.setFrom(testExecFile)
    classDirectories.setFrom(coveredClassFiles())
    sourceDirectories.setFrom(files("src/main/java", "src/main/kotlin"))
    reports {
        xml.required.set(true)
        html.required.set(true)
    }
}

tasks.register<JacocoCoverageVerification>("jacocoTestCoverageVerification") {
    group = "verification"
    description = "Fail the build if line coverage on the covered classes drops below the locked floor."
    dependsOn("testDebugUnitTest")
    executionData.setFrom(testExecFile)
    classDirectories.setFrom(coveredClassFiles())
    sourceDirectories.setFrom(files("src/main/java", "src/main/kotlin"))
    // Guard against a SILENT zero-coverage pass: coveredClassFiles() points
    // at an AGP-internal path that can move between AGP versions (AGP 10 is
    // on the horizon). If it resolves to nothing, the rule below would pass
    // vacuously — measuring zero classes while reporting "OK". Fail loud
    // instead so a stale path is impossible to miss.
    doFirst {
        if (classDirectories.files.isEmpty()) {
            throw GradleException(
                "JaCoCo found no covered .class files — the AGP class path likely moved " +
                "(see `coveredClassFiles` in app/build.gradle.kts; AGP 9 uses " +
                "intermediates/built_in_kotlinc/...). Coverage was about to pass without " +
                "measuring anything. Fix the path before trusting this gate."
            )
        }
    }
    violationRules {
        // PER-CLASS floors ([D5]) — each a few points under what that class
        // measures today, so the rule only trips when a class LOSES its tests.
        // A blended bundle rule cannot do this: at 5 classes, BoundedLogTree's
        // 100% masks a total collapse of GardenImageCache. The NK6 bundle rule
        // (0.85 across 2 classes) is superseded, not relaxed — JsBridge is now
        // pinned at 0.65 and BoundedLogTree at 0.95 individually, which is
        // strictly tighter per class than the blend they used to hide inside.
        //
        // `element = "CLASS"` + an exact `includes` name matches ONLY that
        // class; Kotlin's nested/synthetic siblings carry a `$` and are not
        // matched (they stay in the report, they just aren't floored — a
        // 0/1 inlined comparator lambda must not fail a build).
        //
        // Ratchet discipline (mirrors vitest.config.js): raise after adding
        // tests; never lower one silently to make a build pass.
        fun classFloor(className: String, min: String) {
            rule {
                element = "CLASS"
                includes = listOf("com.votreader.sacredui.$className")
                limit {
                    counter = "LINE"
                    value = "COVEREDRATIO"
                    minimum = min.toBigDecimal()
                }
            }
        }
        classFloor("BoundedLogTree", "0.95")      // measured 100.0% (32/32)
        classFloor("MainActivityLogic", "0.95")   // measured 100.0% (26/26)
        classFloor("JsBridge", "0.65")            // measured  69.6% (32/46)
        classFloor("AppInterface", "0.52")        // measured  58.2% (135/232)
        classFloor("GardenImageCache", "0.48")    // measured  54.4% (74/136)
        classFloor("NativeAudioLogic", "0.95")    // m3, new: plain JVM, NativeAudioLogicTest
    }
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.webkit)
    implementation(libs.androidx.core.splashscreen)
    // System media card: MediaSessionCompat + MediaStyle notification for the
    // streaming audio letters (AudioKeepAliveService). androidx.media, not
    // media3 — see the version-catalog comment.
    implementation(libs.androidx.media)
    // m3: the native player (ExoPlayer in a Media3 MediaSessionService) behind the page's stand-in <audio>.
    implementation(libs.androidx.media3.exoplayer)
    implementation(libs.androidx.media3.session)
    implementation(libs.timber)
    implementation(libs.kotlinx.coroutines.android)
    implementation(libs.androidx.lifecycle.runtime.ktx)
    implementation(libs.androidx.lifecycle.viewmodel.ktx)

    // NK1: unit-test stack.
    //  - JUnit 5 Jupiter is the canonical engine.
    //  - junit-vintage runs Robolectric's JUnit 4 @RunWith tests on the
    //    same platform, so a single ./gradlew :app:testDebugUnitTest covers
    //    both styles.
    //  - junit4 is pulled in transitively but pinned explicitly to keep
    //    Robolectric's required version visible.
    //  - kotlin-test-junit5 gives the kotlin.test.assertEquals/assertTrue
    //    DSL (less verbose than org.junit.jupiter.api.Assertions.*).
    //  - Robolectric provides ContentResolver/Cursor/WebView shadows for
    //    StorageManager + future framework-coupled tests.
    //  - MockK is the Kotlin-native mocking library; reserved for cases
    //    where we need to verify behaviour rather than fully shadow it.
    testImplementation(libs.junit.jupiter)
    testImplementation(libs.junit.vintage.engine)
    testImplementation(libs.junit4)
    testImplementation(libs.kotlin.test.junit5)
    testImplementation(libs.robolectric)
    testImplementation(libs.mockk)
    testImplementation(libs.androidx.test.core)
    testImplementation(libs.androidx.test.ext.junit)
}
