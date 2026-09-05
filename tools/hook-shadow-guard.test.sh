#!/bin/sh
# RED proof for Step 0 of .githooks/pre-commit — the fossil-hook shadow guard.
#
# Runs the guard's EXACT bytes (extracted by marker from .githooks/pre-commit,
# not retyped) inside a throwaway `git init` repo. That isolation is the point:
# this machine runs six-plus worktrees off ONE .git, so `git rev-parse
# --git-common-dir` from any of them resolves to the shared hooks directory.
# Dropping a test fossil there would arm it for every other session's commits.
#
# Four cases plus a CONTROL. The control runs every case against an EMPTY guard
# and requires all four to pass, so a case that would pass without the guard
# cannot be mistaken for the guard working.
#
# Usage:  sh tools/hook-shadow-guard.test.sh
set -u

repo=$(git rev-parse --show-toplevel)
hook="$repo/.githooks/pre-commit"
[ -f "$hook" ] || { echo "FAIL: $hook not found"; exit 1; }

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM

# The guard's exact bytes, marker to marker. If either marker moves the
# extraction is empty and every case fails loudly rather than silently passing.
sed -n '/# --- Step 0: no fossil hook is shadowing this one/,/^done$/p' "$hook" > "$work/guard.sh"
if [ ! -s "$work/guard.sh" ]; then
  echo "FAIL: extracted an empty guard — the markers in .githooks/pre-commit moved"
  exit 1
fi

fail=0

# run_case <label> <guard-file> <want-exit> <setup-commands...>
run_case() {
  label=$1; guard=$2; want=$3; shift 3
  sandbox="$work/sandbox"
  rm -rf "$sandbox"
  mkdir -p "$sandbox"
  ( cd "$sandbox" && git init -q . && mkdir -p .githooks && printf '#!/bin/sh\n' > .githooks/pre-commit )
  ( cd "$sandbox" && "$@" ) || { echo "FAIL: $label — setup failed"; fail=1; return; }

  printf '#!/bin/sh\n' > "$sandbox/under-test.sh"
  cat "$guard" >> "$sandbox/under-test.sh"
  chmod +x "$sandbox/under-test.sh"

  out=$( cd "$sandbox" && sh ./under-test.sh 2>&1 ); got=$?
  if [ "$got" -eq "$want" ]; then
    echo "  OK   $label — exit $got (wanted $want)"
  else
    echo "  FAIL $label — exit $got, wanted $want"
    echo "$out" | sed 's/^/         /'
    fail=1
  fi
}

drop_fossil()      { mkdir -p .git/hooks && printf '#!/bin/sh\nexit 0\n' > .git/hooks/pre-commit; }
drop_sample_only() { mkdir -p .git/hooks && printf '#!/bin/sh\nexit 0\n' > .git/hooks/pre-commit.sample; }
add_push_pair()    { printf '#!/bin/sh\n' > .githooks/pre-push; mkdir -p .git/hooks && printf '#!/bin/sh\nexit 0\n' > .git/hooks/pre-push; }
noop()             { :; }

echo "GUARD — the four cases:"
run_case "1  honest tree, nothing shadowing            " "$work/guard.sh" 0 noop
run_case "2  fossil .git/hooks/pre-commit present      " "$work/guard.sh" 1 drop_fossil
run_case "3  fossil pre-PUSH, guard must generalise    " "$work/guard.sh" 1 add_push_pair
run_case "4  only pre-commit.sample, no false positive " "$work/guard.sh" 0 drop_sample_only

# CONTROL: the same four against no guard at all. Every one must pass, which is
# what makes cases 2 and 3 evidence about the guard rather than about the setup.
: > "$work/empty.sh"
echo "CONTROL — same cases with the guard removed (all must exit 0):"
run_case "1  honest tree                                " "$work/empty.sh" 0 noop
run_case "2  fossil present, nothing to catch it        " "$work/empty.sh" 0 drop_fossil
run_case "3  fossil pre-push, nothing to catch it       " "$work/empty.sh" 0 add_push_pair
run_case "4  sample only                                " "$work/empty.sh" 0 drop_sample_only

if [ "$fail" -eq 0 ]; then
  echo "PASS — the guard catches both shadow shapes, ignores .sample, and neither"
  echo "       shape is caught without it."
  exit 0
fi
echo "FAIL — see above"
exit 1
