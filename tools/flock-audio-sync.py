"""Weekly flock-audio ingestion: new AI/Benjamin readings flow into the app.

Runs Sundays 06:00 via the Windows scheduled task 'vot-audio-app-sync',
90 minutes after 'vot-weekly-sync' (FlockSync) has mirrored the flock's
Drive folders. This stage is the APP side:

  1. tools/fetch-drive-audio.py      refresh the Drive audio listing
  2. tools/gen-audio-manifest.mjs    regenerate src/data/audio-manifest.js
     (reader ranking, Benjamin-supersede, alternates — all existing logic)
  3. If the manifest is byte-identical -> log "no new audio", exit 0.
  4. tools/mirror-audio-release.py --until-done   upload the new assets
  5. npm run build; bump CORPUS_VERSION + search cache version (the manifest
     rides bundle-a-vot, which IS corpus-gated)
  6. git commit through the full gates; push origin main.

FAIL-CLEAN CONTRACT: any step failing aborts the run, resets the repo to the
pre-run commit (tracked files only), and writes the failure to the log +
FLOCK-SYNC-ATTENTION.txt in the repo root so the next agent session sees it.
The repo is never left mid-change; the push only happens after the pre-commit
gate chain passes. Manual run: python tools/flock-audio-sync.py [--dry-run]
"""
import datetime
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LOG = os.path.join(ROOT, "tools", "_flock-audio-sync.log")
ATTN = os.path.join(ROOT, "FLOCK-SYNC-ATTENTION.txt")
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
    sw = open(SW, encoding="utf-8").read()
    m = re.search(r"const CORPUS_VERSION = 'c(\d+)';", sw)
    old, new = int(m.group(1)), int(m.group(1)) + 1
    stamp = f"c{old}->c{new} ({datetime.date.today()}): flock audio sync — new recordings joined audio-manifest."
    sw = sw.replace(f"const CORPUS_VERSION = 'c{old}'; //",
                    f"const CORPUS_VERSION = 'c{new}'; // {stamp} (", 1)
    open(SW, "w", encoding="utf-8", newline="\n").write(sw)
    cj = open(CACHE, encoding="utf-8").read()
    open(CACHE, "w", encoding="utf-8", newline="\n").write(
        cj.replace(f"CORPUS_CONTENT_VERSION = 'c{old}'", f"CORPUS_CONTENT_VERSION = 'c{new}'"))
    return new


def main():
    dry = "--dry-run" in sys.argv
    log(f"=== flock-audio-sync start (dry={dry}) ===")
    base = git("rev-parse", "HEAD").strip()
    try:
        if git("status", "--porcelain", "-uno").strip():   # tracked files only — our own log is untracked
            raise RuntimeError("repo dirty — another session is mid-work; refusing to run")
        git("pull", "--ff-only", "origin", "main")

        run([sys.executable, os.path.join("tools", "fetch-drive-audio.py")], timeout=1800)
        run(["node", os.path.join("tools", "gen-audio-manifest.mjs")])

        if not git("diff", "--name-only", "--", MANIFEST).strip():
            log("no new audio — manifest unchanged; done")
            return 0
        added = git("diff", "--numstat", "--", MANIFEST).split("\t")[0]
        log(f"manifest changed (+{added} lines) — new recordings found")
        if dry:
            git("checkout", "--", ".")
            log("dry-run: reverted, stopping before upload")
            return 0

        run([sys.executable, os.path.join("tools", "mirror-audio-release.py"), "--until-done"],
            timeout=7200)
        new_v = bump_corpus()
        run("npm run build", shell_npm=True, timeout=1800)
        git("add", "-A")
        run(f'git commit -m "feat(audio): weekly flock sync — new recordings (c{new_v})" '
            f'-m "Automated: fetch-drive-audio -> gen-audio-manifest -> mirror-audio-release '
            f'--until-done -> gates. Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>"',
            shell_npm=True, timeout=3600)   # pre-commit runs the full gate chain
        git("push", "origin", "main")
        log(f"pushed c{new_v} — done")
        return 0
    except Exception as e:
        log(f"FAILED: {e}")
        try:
            git("reset", "--hard", base)
            git("clean", "-fd", "--", "app/src/main/assets/dist")
        except Exception as e2:
            log(f"reset also failed: {e2}")
        with open(ATTN, "w", encoding="utf-8") as f:
            f.write(f"flock-audio-sync FAILED {datetime.datetime.now():%Y-%m-%d %H:%M}\n"
                    f"Repo was reset to {base[:9]}.\nError:\n{e}\n"
                    f"Full log: tools/_flock-audio-sync.log\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
