plugins {
    alias(libs.plugins.android.application)
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
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    // AGP 8.0+ disabled automatic BuildConfig generation; re-enable so
    // BuildConfig.DEBUG can gate developer-only paths (e.g.
    // WebView.setWebContentsDebuggingEnabled in onCreate).
    buildFeatures {
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
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

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.appcompat)
    implementation(libs.androidx.activity.ktx)
    implementation(libs.androidx.webkit)
    implementation(libs.androidx.core.splashscreen)
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
