#!/bin/sh
# Installs the merge drivers .gitattributes names (network ln1 item 5, 2026-10-05). Run once per clone; every worktree
# shares the clone's config. Idempotent. CI never merges, so it needs none.
# votgen-sw falls back to a plain `git merge-file` in a tree that predates tools/merge-generated.mjs, so an old branch
# gets an ordinary text merge with conflict markers, never a silent "ours".
git config merge.votgen-ours.name "VOTReader generated output: keep ours, the next build rewrites it"
git config merge.votgen-ours.driver true
git config merge.votgen-sw.name "VOTReader service-worker.js / index.html: merge with the generated lines masked"
git config merge.votgen-sw.driver \
  "sh -c '[ -f tools/merge-generated.mjs ] && exec node tools/merge-generated.mjs \"\$1\" \"\$2\" \"\$3\"; exec git merge-file -L ours -L base -L theirs \"\$2\" \"\$1\" \"\$3\"' votgen %O %A %B"
echo "merge drivers installed: votgen-ours, votgen-sw"
