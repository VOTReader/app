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
            layout.buildDirectory.set(file("$customBuildRoot/app"))
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
        versionName = "1.0"
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

// Classes under coverage measurement: the two pure-JVM-tested classes.
// See the jacoco {} doc-comment above for why StorageManager isn't here.
// U17 (measured + reverted): GardenImageCache was tried here — it IS pure-JVM-
// tested so JaCoCo instruments it, but its LINE coverage is dominated by the
// HttpURLConnection fetch + cacheDir file-I/O + eviction-sweep paths that aren't
// exercisable without heavy network/FS mocking, so adding it dragged the bundle
// to 0.59 (< 0.85). Like StorageManager (Robolectric artifact), its real
// coverage is device-verified (the n1-smoke-walk), not the unit gate. Kept the
// gate to the two classes whose numbers are HONEST at the pure-JVM level.
val coveredClasses = listOf(
    "com/votreader/sacredui/JsBridge*.class",
    "com/votreader/sacredui/BoundedLogTree*.class"
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
        rule {
            limit {
                counter = "LINE"
                value = "COVEREDRATIO"
                // Locked just below the floor current tests achieve
                // (87.6% as of NK6 — JsBridge 27/39 + BoundedLogTree
                // 58/58 = 85/97). A 2-point buffer absorbs unrelated
                // refactor noise; a real test removal that drops one
                // of these two classes below ~80% will catch.
                // Re-run jacocoTestReport after adding tests, then
                // raise this value — never lower it silently.
                minimum = "0.85".toBigDecimal()
            }
        }
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
