"""Weekly flock-audio ingestion: new AI/Benjamin readings flow into the app.

Runs Sundays 19:30 via the Windows scheduled task 'vot-audio-app-sync'
(moved from 06:00 on 2026-08-10: the machine is off early mornings), 90
minutes after 'vot-weekly-sync' (FlockSync, 18:00) has mirrored the flock's
Drive folders. This stage is the APP side:

  1. tools/fetch-drive-audio.py      refresh the Drive audio listing
  2. tools/gen-audio-manifest.mjs    regenerate src/data/audio-manifest.js
     (reader ranking, Benjamin-supersede, alternates — all existing logic)
  3. If the manifest is byte-identical -> log "no new audio", exit 0.
  4. tools/mirror-audio-release.py --until-done   upload the new assets
  5. npm run build; bump CORPUS_VERSION + search cache version (the manifest
     rides bundle-a-vot, which IS corpus-gated)
  6. git commit through the full gates; push origin main.

FAIL-CLEAN CONTRACT (hardened 2026-08-10 after the 01:06 divergence failure):
any step failing aborts the run and writes the failure to the log +
FLOCK-SYNC-ATTENTION.txt (gitignored — the c30 run proved add -A swept it into
a commit). Cleanup is CONCURRENCY-SAFE: the repo is restored only when HEAD
still equals the commit this run started from — if another session committed
meanwhile, we restore ONLY the files this script touches and never reset, so
a concurrent session's work cannot be destroyed (the old reset --hard could).
Divergence policy: behind-only fast-forwards; local-ahead proceeds and pushes
the gated local commits along; true divergence rebases our commits on origin
and a conflicted rebase aborts cleanly to the attention file. Staging is by
EXPLICIT path list — never add -A. A gated commit that fails only its PUSH is
kept local (one pull --rebase retry), never thrown away. A real run that
gets through with nothing left unpushed REMOVES the attention file, so its
presence always means the latest run failed (before 2026-09-01 it lingered).

DIRTY CHECK (2026-09-01): "another session is mid-work" is judged on modified
TRACKED files outside .idea/. Android Studio rewrites IDE state there on its
own (deploymentTargetSelector.xml on every device pick), and that alone kept
the tree dirty from 08-11 and blocked the 08-16, 08-23 and 08-30 runs. The
churning file is untracked and ignored now; the pathspec keeps any sibling
from doing it again.

ALERT (2026-09-01): a failure also posts a one-line, signal-only alert to Corbin's
private Discord through D:/AgentBackbone/notify.py (one-way webhook, no content,
fails soft to AgentBackbone/reports/ when Discord is down). The attention file and
the log stay the record; the alert only says that there is something to read.
Manual run: python tools/flock-audio-sync.py [--dry-run]
"""
import datetime
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG = os.path.join(ROOT, "tools", "_flock-audio-sync.log")
ATTN = os.path.join(ROOT, "FLOCK-SYNC-ATTENTION.txt")
NOTIFY = "D:/AgentBackbone/notify.py"   # one-way Discord webhook: signals only, fails soft
MANIFEST = os.path.join(ROOT, "app", "src", "main", "assets", "src", "data", "audio-manifest.js")
SW = os.path.join(ROOT, "app", "src", "main", "assets", "service-worker.js")
CACHE = os.path.join(ROOT, "app", "src", "main", "assets", "src", "search", "cache.js")
GITBASH = r"C:\Program Files\Git\bin\bash.exe"


def log(msg):
    line = f"[{datetime.datetime.now():%Y-%m-%d %H:%M:%S}] {msg}"
    print(line, flush=True)
    with open(LOG, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def run(args, timeout=3600, shell_npm=False):
    if shell_npm:
        r = subprocess.run([GITBASH, "-lc", args], cwd=ROOT, capture_output=True,
                           text=True, timeout=timeout)
    else:
        r = subprocess.run(args, cwd=ROOT, capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError(f"{args if shell_npm else ' '.join(args)} -> {r.returncode}\n"
                           f"{(r.stderr or r.stdout)[-800:]}")
    return r.stdout


def git(*args):
    return run(["git"] + list(args))


def bump_corpus():
    # Every handle here is closed on the statement that opens it. This is the
    # unattended weekly job, and the write at the end of this function is
    # immediately followed by `git add` of the same two paths: on Windows a
    # handle still open at GC time is a shared-violation waiting for a slow
    # machine, and the failure would arrive as an unexplained commit error in a
    # job nobody is watching. CI 34021486271 surfaced it as a ResourceWarning.
    with open(SW, encoding="utf-8") as f:
        sw = f.read()
    m = re.search(r"const CORPUS_VERSION = 'c(\d+)';", sw)
    old, new = int(m.group(1)), int(m.group(1)) + 1
    stamp = f"c{old}->c{new} ({datetime.date.today()}): flock audio sync — new recordings joined audio-manifest."
    sw_out = sw.replace(f"const CORPUS_VERSION = 'c{old}'; //",
                        f"const CORPUS_VERSION = 'c{new}'; // {stamp} (", 1)
    with open(CACHE, encoding="utf-8") as f:
        cj = f.read()
    cj_out = cj.replace(f"CORPUS_CONTENT_VERSION = 'c{old}'",
                        f"CORPUS_CONTENT_VERSION = 'c{new}'")
    # str.replace returns its input UNCHANGED when the anchor misses, and this
    # one pins the exact single space before `//`. Reformat that line and the
    # bump becomes a silent no-op while this function still returns `new`; the
    # run then commits changed content under the old version, and the version
    # gate fails downstream saying "content changed but CORPUS_VERSION was not
    # bumped" — a correct gate naming the wrong cause, hours from here, in an
    # unattended weekly job. Re-anchoring on something looser leaves the same
    # defect one reformat away. Asserting the write happened does not.
    #
    # Both checks run BEFORE either write, so a missed anchor can never leave a
    # half-bumped tree: service-worker.js moved and cache.js not, which is the
    # one state the corpus-version gate cannot describe (CORPUS_CONTENT_VERSION
    # feeds the search-index cache signature, so a stale index would survive the
    # corpus swap).
    if sw_out == sw:
        raise RuntimeError(
            f"CORPUS_VERSION anchor missed in {SW}: expected "
            f"\"const CORPUS_VERSION = 'c{old}'; //\" verbatim, one space before the //. "
            "Nothing was written. Fix the anchor; do not re-run and hope.")
    if cj_out == cj:
        raise RuntimeError(
            f"CORPUS_CONTENT_VERSION anchor missed in {CACHE}: expected "
            f"\"CORPUS_CONTENT_VERSION = 'c{old}'\" verbatim. Nothing was written.")
    with open(SW, "w", encoding="utf-8", newline="\n") as f:
        f.write(sw_out)
    with open(CACHE, "w", encoding="utf-8", newline="\n") as f:
        f.write(cj_out)
    return new


# Every tracked path this run may modify. Staging and restore both use this
# list — nothing outside it is ever committed or rolled back.
OWN_PATHS = [
    "app/src/main/assets/src/data/audio-manifest.js",
    "app/src/main/assets/service-worker.js",
    "app/src/main/assets/src/search/cache.js",
    "app/src/main/assets/dist",
    "app/src/main/assets/index.html",          # build:csp re-hashes inline scripts
]

# What counts as "another session is mid-work": modified TRACKED files outside
# .idea/. IDE state there churns on its own and never means a human or agent is
# mid-commit (see DIRTY CHECK in the header).
DIRTY_PATHSPEC = ["--", ".", ":(exclude).idea/"]


def tracked_changes():
    """Porcelain lines for modified tracked files, IDE state excluded."""
    return git("status", "--porcelain", "-uno", *DIRTY_PATHSPEC).splitlines()


def clear_attention():
    """The attention file exists to say 'the latest run failed'. A run that got
    through makes that false, so remove it rather than leave a stale alarm."""
    if os.path.exists(ATTN):
        os.remove(ATTN)
        log("cleared FLOCK-SYNC-ATTENTION.txt left by an earlier failure")


def alert(title, body):
    """Tell Corbin a run failed, through AgentBackbone's one-way Discord webhook.
    Signal-only payload (what happened, never content), and it NEVER raises: a
    notifier outage must not change what this script does or reports."""
    try:
        if not os.path.exists(NOTIFY):
            log(f"alert skipped: {NOTIFY} not found")
            return
        r = subprocess.run([sys.executable, NOTIFY, "--title", title, "--body", body,
                            "--level", "alert"], capture_output=True, text=True, timeout=60)
        log("alert sent to Discord" if r.returncode == 0 else
            f"alert not delivered (notify.py exit {r.returncode}); queued in AgentBackbone/reports")
    except Exception as ex:   # fail-soft by contract
        log(f"alert failed softly: {ex}")


def reconcile_with_origin():
    """Fetch, then bring main up to date without ever discarding local commits.
    behind-only -> fast-forward; ahead-only -> proceed (push carries them);
    diverged -> rebase ours onto origin, aborting cleanly on conflict."""
    git("fetch", "origin", "main")
    counts = git("rev-list", "--left-right", "--count", "HEAD...origin/main").split()
    ahead, behind = int(counts[0]), int(counts[1])
    if behind and not ahead:
        git("merge", "--ff-only", "origin/main")
        log(f"fast-forwarded {behind} commit(s) from origin")
    elif ahead and behind:
        log(f"diverged (ahead {ahead}, behind {behind}) — rebasing local commits onto origin")
        try:
            git("rebase", "origin/main")
        except Exception:
            git("rebase", "--abort")
            raise RuntimeError(
                f"rebase of {ahead} local commit(s) onto origin/main conflicted — "
                "aborted cleanly; reconcile by hand")
    elif ahead:
        log(f"local main ahead by {ahead} gated commit(s) — they will ride this push")


def main():
    dry = "--dry-run" in sys.argv
    log(f"=== flock-audio-sync start (dry={dry}) ===")
    base = None
    committed = False
    try:
        if tracked_changes():   # tracked files only (our log is untracked); .idea/ excluded
            raise RuntimeError("repo dirty — another session is mid-work; refusing to run")
        reconcile_with_origin()
        base = git("rev-parse", "HEAD").strip()            # AFTER reconcile — the true pre-run point

        run([sys.executable, os.path.join("tools", "fetch-drive-audio.py")], timeout=1800)
        run(["node", os.path.join("tools", "gen-audio-manifest.mjs")])

        if not git("diff", "--name-only", "--", MANIFEST).strip():
            unpushed = int(git("rev-list", "--count", "origin/main..HEAD").strip() or 0)
            if unpushed:
                # No push happens without new audio, so anything local stays local
                # and an attention file saying "push it manually" is still true.
                log(f"no new audio — manifest unchanged; {unpushed} local commit(s) remain unpushed; done")
            else:
                log("no new audio — manifest unchanged; done")
                clear_attention()
            return 0
        added = git("diff", "--numstat", "--", MANIFEST).split("\t")[0]
        log(f"manifest changed (+{added} lines) — new recordings found")
        if dry:
            git("checkout", "--", *OWN_PATHS)   # scoped — never revert others' work
            log("dry-run: reverted, stopping before upload")
            return 0

        run([sys.executable, os.path.join("tools", "mirror-audio-release.py"), "--until-done"],
            timeout=7200)
        new_v = bump_corpus()
        run("npm run build", shell_npm=True, timeout=1800)
        # Explicit staging — never add -A: a concurrent session's stray files
        # (or our own attention note, as in c30) must not ride this commit.
        foreign = [ln for ln in tracked_changes()
                   if not any(ln[3:].startswith(p) for p in OWN_PATHS)]
        if foreign:
            raise RuntimeError("unexpected tracked changes outside OWN_PATHS: "
                               + "; ".join(ln.strip() for ln in foreign[:6]))
        git("add", "--", *OWN_PATHS)
        run(f'git commit -m "feat(audio): weekly flock sync — new recordings (c{new_v})" '
            f'-m "Automated: fetch-drive-audio -> gen-audio-manifest -> mirror-audio-release '
            f'--until-done -> gates. Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"',
            shell_npm=True, timeout=3600)   # pre-commit runs the full gate chain
        committed = True
        try:
            git("push", "origin", "main")
        except Exception:
            log("push refused — origin moved mid-run; one pull --rebase retry")
            git("pull", "--rebase", "origin", "main")
            git("push", "origin", "main")
        log(f"pushed c{new_v} — done")
        clear_attention()
        return 0
    except Exception as e:
        log(f"FAILED: {e}")
        cleanup = "no cleanup needed"
        try:
            if committed:
                # The commit passed the full gate chain — NEVER throw it away.
                cleanup = "gated commit kept LOCAL (push failed); push it manually"
            elif base and git("rev-parse", "HEAD").strip() == base:
                # Nobody else committed meanwhile — restoring only our paths is safe.
                git("checkout", "--", *OWN_PATHS)
                git("clean", "-fd", "--", "app/src/main/assets/dist")
                cleanup = f"own files restored to {base[:9]} (HEAD untouched)"
            elif base:
                # HEAD moved under us: a concurrent session committed. Touch NOTHING.
                cleanup = ("HEAD moved during the run (concurrent session) — repo left "
                           "as-is to protect their work; reconcile by hand")
        except Exception as e2:
            cleanup = f"cleanup itself failed: {e2}"
        log(f"cleanup: {cleanup}")
        with open(ATTN, "w", encoding="utf-8") as f:
            f.write(f"flock-audio-sync FAILED {datetime.datetime.now():%Y-%m-%d %H:%M}\n"
                    f"Cleanup: {cleanup}\nError:\n{e}\n"
                    f"Full log: tools/_flock-audio-sync.log\n")
        first = (str(e).splitlines() or [type(e).__name__])[0][:240]
        alert("flock-audio-sync FAILED",
              f"{datetime.datetime.now():%Y-%m-%d %H:%M}: {first}. Cleanup: {cleanup}. "
              "See FLOCK-SYNC-ATTENTION.txt in the VOTReader-studio repo root.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
