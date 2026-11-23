/* clock-sweep — the durable clock-sensitivity sweep (votreader-tests-4 item 8).
   ─────────────────────────────────────────────────────────────────────────
   The Sunday failure, twice: ReadingPlansScreen.test.jsx `behind (2235)`
   passed Mon-Sat and went red on Sundays, because the plan under test was
   started 4 days ago on the REAL clock and the Sun-Sat week starts on the
   day the suite runs. tests-3 pinned it (211ca0ea7); tests-4 pinned the
   other five WEEKDAY files the sweep found. This script is the sweep made
   durable, so the next unpinned real-clock test is caught before it lands.

   Verdicts, per test file:
     SAFE    — the file pins the clock (vi.useFakeTimers / setSystemTime).
     BENIGN  — unpinned, but every clock hit is a fixed date, a relative
               timestamp (Date.now() - N), or explicit UTC: the result
               cannot depend on the weekday the suite happens to run on.
     WEEKDAY — unpinned and at least one hit does weekday / date-boundary
               arithmetic on the real clock: getDay, week start, streak,
               daysAgo / lateRun from new Date(), `today` part arithmetic.
     CLEAN   — no clock-pattern hit at all.

   How a hit line is judged (line-local, by design — see the limits below),
   plus one file-level rule:
     - a file is WEEKDAY when it talks streaks (or week starts) AND reads
       the live clock anywhere unpinned — the streak stores' shape, where
       the weekday dependence is the file's subject, not one line;
     - a line is FIXED when the clock value is pinned to a literal: a
       string or numeric argument to `new Date(...)`, `Date.UTC(...)`, or
       a `FIX.now` / `FIXED_` anchor on the line;
     - a line is WEEKDAY when it does weekday arithmetic AND is not fixed:
       getDay / daysAgo / lateRun / setDate / week-start / streak on the
       line, or getFullYear / getMonth / getDate together with a live clock
       read (a bare new Date(), Date.now(), or a today / now value) on the
       same line — a construction from a named fixed value (new Date(utc))
       is not a live read;
     - anything else (a bare new Date() or Date.now() with no weekday
       arithmetic on the line) is BENIGN — a relative timestamp, not a
       weekday dependence.

   Limits, stated plainly: the rule is line-local. A real-clock read whose
   weekday dependence lives on ANOTHER line — plan-runs-dc31d3e27 line 71,
   `runRow(r, new Date())` in an otherwise FIX.now file — reads BENIGN
   here and is caught only by the classified list
   (D:/MuseShared/queue/votreader-tests-4/clock-scan-classified.txt).
   The sweep is the tripwire for the known shapes, not a proof of purity.

   A file carrying `clock-sweep-ignore` on a line is skipped (reported
   IGNORED): the sweep's own test file does this, because its fixtures hold
   clock patterns as data, not as live clock reads.

   Usage: `node tools/clock-sweep.mjs [root]` (root defaults to the repo
   root, the parent of tools/). Exit 1 when any WEEKDAY file remains.
*/

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// The clock patterns the original scan (clock-scan.py) grepped for.
const CLOCK_PATTERNS = [
  /new Date\s*\(/,
  /Date\.now\s*\(/,
  /daysAgo\s*\(/,
  /lateRun\s*\(/,
];

// Weekday arithmetic that is weekday-sensitive on its own line.
const WEEKDAY_ALONE = [
  /getDay\s*\(/,
  /daysAgo\s*\(/,
  /lateRun\s*\(/,
  /setDate\s*\(/,
  /startOfWeek|weekStart/i,
  /streak/i,
];

// Date-part arithmetic: weekday-sensitive only with a live clock read on
// the same line (`new Date(today.getFullYear(), ...)`), not a bare accessor
// on a value fixed elsewhere (`expect(d.getFullYear()).toBe(2020)`), and
// not a construction from a fixed value (`new Date(utc)` — utc is a
// constant, so the line is fixed even though the argument is not a literal).
// A live read is a bare `new Date()`, `Date.now()`, or a today/now value.
const WEEKDAY_WITH_LIVE_CLOCK = [
  /getFullYear\s*\(/,
  /getMonth\s*\(/,
  /getDate\s*\(/,
];
const LIVE_CLOCK = /new Date\s*\(\s*\)|Date\.now\s*\(|\btoday\b|\bnow\b/;

// A fixed clock value on the line: a literal argument, explicit UTC, or a
// FIX.now / FIXED_ anchor (the repo's fixed-clock convention).
const FIXED_VALUE = /new Date\s*\(\s*(['"]|\d)|Date\.UTC\s*\(|FIX\.now|FIXED_/;

const PINNED = /useFakeTimers|setSystemTime/;
const IGNORE_MARKER = /clock-sweep-ignore/;
const TEST_FILE = /\.test\.(js|jsx|ts|tsx)$/;
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.claude', 'coverage', 'dist', '.vite', '.vitest-cache', '.vite-temp',
]);

function hitKind(line) {
  if (FIXED_VALUE.test(line)) return 'benign';
  if (WEEKDAY_ALONE.some((re) => re.test(line))) return 'weekday';
  if (WEEKDAY_WITH_LIVE_CLOCK.some((re) => re.test(line)) && LIVE_CLOCK.test(line)) return 'weekday';
  return 'benign';
}

/** Classify one test file's text. Returns { file, verdict, hits }. */
export function classifyFile(file, text) {
  const lines = text.split('\n');
  if (lines.some((l) => IGNORE_MARKER.test(l))) return { file, verdict: 'IGNORED', hits: [] };
  if (PINNED.test(text)) return { file, verdict: 'SAFE', hits: [] };
  const hits = [];
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line || line.startsWith('//')) return;
    if (!CLOCK_PATTERNS.some((re) => re.test(line))) return;
    hits.push({ line: i + 1, text: line.slice(0, 160), kind: hitKind(line) });
  });
  if (hits.length === 0) return { file, verdict: 'CLEAN', hits };
  if (hits.some((h) => h.kind === 'weekday')) return { file, verdict: 'WEEKDAY', hits };
  // File-level rule: streak / week-start arithmetic on a live clock read
  // anywhere in the file is weekday-sensitive even when no single hit line
  // carries both (reading-streak-store's shape).
  const liveClockHit = hits.some((h) => /new Date\s*\(\s*\)|Date\.now\s*\(/.test(h.text));
  if (liveClockHit && /streak|weekStart|startOfWeek/i.test(text)) {
    return { file, verdict: 'WEEKDAY', hits };
  }
  return { file, verdict: 'BENIGN', hits };
}

function walk(dir, out) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (TEST_FILE.test(entry)) out.push(full);
  }
  return out;
}

/** Scan every test file under root. Returns { files, counts }. */
export function scanTree(root) {
  const files = walk(root, []).sort();
  const results = [];
  const counts = { SAFE: 0, BENIGN: 0, WEEKDAY: 0, CLEAN: 0, IGNORED: 0 };
  for (const full of files) {
    let text;
    try {
      text = readFileSync(full, 'utf8');
    } catch {
      continue;
    }
    const r = classifyFile(relative(root, full).split(/\\/).join('/'), text);
    counts[r.verdict] += 1;
    results.push(r);
  }
  return { files: results, counts };
}

function main() {
  const root = process.argv[2]
    ? join(process.cwd(), process.argv[2])
    : dirname(fileURLToPath(import.meta.url));
  const repoRoot = root.endsWith('tools') ? dirname(root) : root;
  const { files, counts } = scanTree(repoRoot);
  for (const r of files) {
    if (r.verdict === 'WEEKDAY') {
      console.log(`[clock-sweep] WEEKDAY ${r.file}`);
      for (const h of r.hits.filter((x) => x.kind === 'weekday')) {
        console.log(`  line ${h.line}: ${h.text}`);
      }
    }
  }
  const total = files.length;
  const summary =
    `[clock-sweep] ${total} test files: ${counts.SAFE} SAFE, ${counts.BENIGN} BENIGN, ` +
    `${counts.WEEKDAY} WEEKDAY, ${counts.CLEAN} CLEAN, ${counts.IGNORED} IGNORED.`;
  if (counts.WEEKDAY > 0) {
    console.error(`${summary} ${counts.WEEKDAY} weekday-sensitive file(s) remain — pin the clock (vi.useFakeTimers) or fix the date.`);
    process.exit(1);
  }
  console.log(`${summary} OK.`);
}

// ESM main-module check: run the CLI only when executed, not imported.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
