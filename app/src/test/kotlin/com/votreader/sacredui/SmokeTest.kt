package com.votreader.sacredui

import org.junit.jupiter.api.Test
import kotlin.test.assertEquals
import kotlin.test.assertTrue

/**
 * NK1 — pipeline smoke test. Exists solely to prove the JUnit 5 +
 * kotlin-test + Gradle plumbing resolves cleanly before NK2 lands the
 * first real assertions. Mirrors Q5.1's role on the JS side (the empty
 * vitest harness that locked the gate before Q5.2's _validateTabState
 * suite). If this file ever fails, the test infrastructure itself is
 * broken — not the production code under test.
 */
class SmokeTest {

    @Test
    fun `pipeline runs`() {
        assertTrue(true, "JUnit 5 platform reached")
    }

    @Test
    fun `kotlin-test DSL is wired`() {
        assertEquals(4, 2 + 2)
    }
}
