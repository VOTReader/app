#!/bin/sh
# npm run test:hook - the pre-commit hook's vitest run (network ln1, 2026-10-05; audit-gates item 4).
#
# VOT_VITEST_FAST=1 runs the suite as two projects (vitest.config.js): vmThreads for nearly every file, the default pool
# for the files in vitest.isolated.txt. No coverage here: v8 coverage across VM contexts gave back most of the gain
# (measured under the same load: default pool + coverage 293 s, vmThreads + coverage 143-165 s, vmThreads alone 64 s).
# The coverage floors are enforced by CI's `npm run test:coverage`, which gates the deploy; a red main pages the lane
# (D:/Swarm/tools/main-ci-watch.py). Run `npm run test:coverage` yourself when you touch the covered tier's tests.
#
# A fast run that fails is re-run whole in the default pool: green there means a file that only fails in a VM context
# (the commit goes through, with a note to list it in vitest.isolated.txt); red there is a real failure.
# On this machine both runs go through D:/Swarm/tools/heavy.sh (the machine budget); elsewhere they run directly.
run() {
  if [ -f D:/Swarm/tools/heavy.sh ]; then bash D:/Swarm/tools/heavy.sh "$1"; else sh -c "$1"; fi
}
run "VOT_VITEST_FAST=1 npx vitest run" && exit 0
echo ""
echo "[test:hook] the fast run failed; re-running the whole suite in the default pool to tell a real failure from a"
echo "[test:hook] file that only fails in a VM context..."
run "npx vitest run" || exit 1
echo ""
echo "[test:hook] NOTE: green in the default pool, red in vmThreads. Add the file(s) the fast run named above to"
echo "[test:hook] vitest.isolated.txt so the next commit stays fast."
exit 0
