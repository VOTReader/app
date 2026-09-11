#!/usr/bin/env node
/* check-bridge-crosslist — two lists that each compare to THEMSELVES are not a
 * contract between them.
 * ═══════════════════════════════════════════════════════════════════════
 * WHY THIS GATE EXISTS
 * `BridgeContractTest.kt` reflects the live `@JavascriptInterface` set and
 * asserts it equals ITS OWN map. `platform-bridge.test.js` asserts the keys of
 * `androidImpl` equal ITS OWN list. Both are good tests. Neither one reads the
 * other side's file, so **a verb that exists on one side only is green on both
 * suites** — and the Kotlin file's own header claims the opposite:
 *
 *     "Add / rename / remove a bridge method => this test fails until you
 *      update BOTH this map AND platform-bridge.js's androidImpl.
 *      (The JS side's existence is pinned by platform-bridge.test.js's method
 *      asserts; together the two sides can't drift unnoticed.)"
 *
 * They can. Measured: the JS half of journal-3 2b spliced onto main — JS has
 * `nativeListRecordings`, Kotlin does not — ran 168 passed, rc=0, GREEN. The
 * failure this guards is a runtime `undefined is not a function`, on device
 * only, which is the worst place to find it.
 *
 * THE RULE, and it is ASYMMETRIC because androidImpl is not a pure mirror:
 *
 *   Kotlin -> JS   every `@JavascriptInterface` verb is CALLED by androidImpl,
 *                  except the verbs in DIRECT_CALL_ONLY. This half catches a
 *                  bridge method that nothing mirrors.
 *   JS -> Kotlin   every `window.AndroidBridge.X(` inside androidImpl has `X`
 *                  as an `@JavascriptInterface`. This is the `undefined is not
 *                  a function` half.
 *
 * Both key on what androidImpl actually CALLS, never on its property names.
 * Three of its keys reach no bridge verb at all and are right not to —
 * `takeThemedScreenshot` delegates to the web screenshot path, and
 * `openExportSink` / `pickImportFile` deliberately reject on Android because
 * the v3 chunked bridge replaces them. A name-keyed rule reports all three as
 * missing on the Kotlin side: three false reds on the first run, which is how a
 * gate teaches people to ignore it.
 *
 * ─── ON THE EXCEPTIONS ───────────────────────────────────────────────────
 * Two verbs are deliberately unmirrored, and the reason is the contract file's,
 * not mine — quoted from `BridgeContractTest.kt`:
 *
 *     "setAudioActive is called DIRECTLY (guarded window.AndroidBridge) by
 *      src/utils/audio-player.js, not via platform-bridge.js — PlatformBridge
 *      module state must not be duplicated into bundle-d. So androidImpl
 *      intentionally has no mirror for it."
 *     "Same direct-call pattern as setAudioActive — audio-player.js only, no
 *      platform-bridge mirror."
 *
 * An allowance is only an allowance while the file still says so, so the gate
 * REQUIRES that sentence to still be present. If someone deletes the rationale,
 * the exception stops being a stated decision and this gate stops honouring it.
 * And an exception excuses a MISSING MIRROR only — an exception verb that has
 * vanished from the Kotlin side is still a failure, because "JS need not mirror
 * it" is not "it need not exist".
 *
 * ─── ON DEAD EXTRACTORS ──────────────────────────────────────────────────
 * The failure mode that would make this gate worthless is an extraction that
 * returns nothing: TWO EMPTY LISTS COMPARE EQUAL, and the vacuous case lands on
 * the reassuring side. So each extraction must return a plausible number or the
 * gate REFUSES rather than reporting agreement. It also cross-checks the JS side
 * two independent ways — the object's keys and the `window.AndroidBridge.<verb>`
 * calls — because those are written on the same line and a regex that has
 * stopped matching will usually break only one of them.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const KT = path.join(ROOT, 'app/src/main/java/com/votreader/sacredui/AppInterface.kt');
const JS = path.join(ROOT, 'app/src/main/assets/src/utils/platform-bridge.js');
const CONTRACT = path.join(ROOT, 'app/src/test/kotlin/com/votreader/sacredui/BridgeContractTest.kt');

/* Verbs called directly from audio-player.js rather than through androidImpl.
   The RATIONALE lives in BridgeContractTest.kt and is asserted below; this list
   is only the names. */
const DIRECT_CALL_ONLY = ['setAudioActive', 'setAudioNowPlaying'];
const RATIONALE_PHRASE = 'no platform-bridge mirror';

/* A floor, not a count: these numbers exist so a regex that has stopped
   matching cannot be mistaken for two sides that agree. They are deliberately
   far below the real figures (37 and 35 at the time of writing) so that adding
   or removing a verb never touches this file. */
const MIN_KOTLIN = 20;
const MIN_JS = 20;

function read(p, label) {
  if (!fs.existsSync(p)) die(`${label} is missing at ${path.relative(ROOT, p)} — this gate cannot `
    + 'compare two lists when it cannot find one of them, and "not found" must never read as "they agree".');
  return fs.readFileSync(p, 'utf8');
}

function die(msg) {
  console.error('[bridge-crosslist] REFUSING: ' + msg);
  process.exit(2);
}

// ── the Kotlin side: the live @JavascriptInterface surface ─────────────────
const ktSrc = read(KT, 'AppInterface.kt');
const kotlin = new Set();
{
  const re = /@JavascriptInterface\s+(?:@\w+(?:\([^)]*\))?\s+)*fun\s+([A-Za-z0-9_]+)/g;
  let m;
  while ((m = re.exec(ktSrc)) !== null) kotlin.add(m[1]);
}

// ── the JS side, read TWO independent ways off the same object ─────────────
const jsSrc = read(JS, 'platform-bridge.js');
const start = jsSrc.indexOf('const androidImpl = {');
if (start === -1) die('`const androidImpl = {` is not in platform-bridge.js. The object was renamed or '
  + 'restructured; fix this gate deliberately rather than letting it find nothing and report agreement.');
/* The object ends at the first line that is exactly `};` — every property line
   is indented, so this cannot stop early. */
const rest = jsSrc.slice(start);
const end = rest.search(/\n\};/);
if (end === -1) die('could not find the end of the androidImpl object literal.');
const block = rest.slice(0, end);

const jsKeys = new Set();
{
  const re = /^\s{2}([A-Za-z0-9_]+)\s*:/gm;
  let m;
  while ((m = re.exec(block)) !== null) jsKeys.add(m[1]);
}
const jsCalls = new Set();
{
  const re = /AndroidBridge\.([A-Za-z0-9_]+)\s*\(/g;
  let m;
  while ((m = re.exec(block)) !== null) jsCalls.add(m[1]);
}

// ── instrument controls, BEFORE any comparison ────────────────────────────
if (kotlin.size < MIN_KOTLIN) die(`only ${kotlin.size} @JavascriptInterface verbs were extracted from `
  + `AppInterface.kt (floor ${MIN_KOTLIN}). An extraction this small is a broken regex, not a small bridge, `
  + 'and two short lists compare equal just as happily as two right ones.');
if (jsKeys.size < MIN_JS) die(`only ${jsKeys.size} androidImpl keys were extracted (floor ${MIN_JS}). Same `
  + 'reason: a dead extractor makes a comparison AGREE, not disagree.');

/* A CALL WITH NO KEY is still an instrument failure: every bridge call in this
   block lives inside a property, so one that belongs to no key means the key
   regex has stopped seeing the file. The converse is NOT a failure — a key may
   legitimately reach no bridge verb (see the header), and treating that as one
   is what produced three false reds on the first run. */
const callOnly = [...jsCalls].filter((k) => !jsKeys.has(k));
if (callOnly.length) {
  die('androidImpl contains AndroidBridge calls that belong to no extracted key '
    + `(${callOnly.join(', ')}), so the key regex has stopped seeing the file. Until the two readings `
    + 'are consistent, nothing this gate says about the two SIDES means anything.');
}
if (jsCalls.size < MIN_JS) die(`only ${jsCalls.size} window.AndroidBridge calls were extracted from `
  + `androidImpl (floor ${MIN_JS}) — and the calls, not the keys, are what both comparisons below use. `
  + 'A dead call extractor makes both directions agree.');

/* An allowance is an allowance only while the file still states it. */
const contractSrc = read(CONTRACT, 'BridgeContractTest.kt');
if (!contractSrc.includes(RATIONALE_PHRASE)) {
  die(`BridgeContractTest.kt no longer contains ${JSON.stringify(RATIONALE_PHRASE)}, which is the stated `
    + `reason ${DIRECT_CALL_ONLY.join(' and ')} are allowed to have no androidImpl mirror. An exception `
    + 'whose rationale has been deleted is not a decision any more; re-state it there, or drop the verbs '
    + 'from DIRECT_CALL_ONLY in this gate.');
}
for (const verb of DIRECT_CALL_ONLY) {
  if (!contractSrc.includes(verb)) {
    die(`${verb} is in this gate's DIRECT_CALL_ONLY list but is not named in BridgeContractTest.kt at all. `
      + 'The exception list has drifted from the file it claims to quote.');
  }
}

// ── the comparison ─────────────────────────────────────────────────────────
const exempt = new Set(DIRECT_CALL_ONLY);
/* An exception excuses a missing MIRROR, never a missing verb: a DIRECT_CALL_ONLY
   name absent from Kotlin is still a failure, because audio-player.js calls it. */
const missingFromJs = [...kotlin].filter((v) => !jsCalls.has(v) && !exempt.has(v)).sort();
const missingFromKotlin = [...jsCalls].filter((v) => !kotlin.has(v)).sort();
const exemptGone = DIRECT_CALL_ONLY.filter((v) => !kotlin.has(v)).sort();

const fails = [];
for (const v of missingFromJs) {
  fails.push(`${v} — Kotlin declares it @JavascriptInterface, and no androidImpl property calls `
    + `window.AndroidBridge.${v}(). THE JS SIDE LACKS IT, and both existing suites pass in this state.`);
}
for (const v of missingFromKotlin) {
  fails.push(`${v} — androidImpl calls window.AndroidBridge.${v}(), and AppInterface.kt declares no such `
    + '@JavascriptInterface. THE KOTLIN SIDE LACKS IT: this is `undefined is not a function`, on device only.');
}
for (const v of exemptGone) {
  fails.push(`${v} — named in DIRECT_CALL_ONLY, but AppInterface.kt no longer declares it. The exception `
    + 'says the JS mirror is unnecessary; it does not say the verb is. audio-player.js still calls it.');
}

if (fails.length) {
  console.error(`[bridge-crosslist] ${fails.length} verb${fails.length === 1 ? '' : 's'} on ONE SIDE ONLY `
    + `(Kotlin ${kotlin.size}, androidImpl ${jsKeys.size}, ${DIRECT_CALL_ONLY.length} stated exceptions):`);
  for (const f of fails) console.error('\n  ' + f);
  console.error('');
  console.error('  Each side\'s own suite compares it to its own list, so neither can see this.');
  console.error('  Fix by landing both halves together: the @JavascriptInterface method, its');
  console.error('  BridgeContractTest.kt map entry, the androidImpl mirror, and the');
  console.error('  platform-bridge.test.js key.');
  process.exit(1);
}

console.log(`[bridge-crosslist] OK — ${kotlin.size} @JavascriptInterface verbs and ${jsCalls.size} androidImpl `
  + `bridge calls agree in both directions, with ${DIRECT_CALL_ONLY.length} stated direct-call exceptions `
  + `(${DIRECT_CALL_ONLY.join(', ')}); ${jsKeys.size} androidImpl keys in total, the rest web-implemented.`);
