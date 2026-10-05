#!/usr/bin/env bash
# deploy-preview.sh - publish the `overhaul` branch's web build to the REVIEW origin (rv0, hub 2026-10-05;
# Corbin: "save the overhaul for my review"). Built, never shipped:
#
#   https://votreader-preview.pages.dev   Cloudflare Pages project `votreader-preview` on Corbin's account
#
# A SEPARATE origin on purpose: a browser keeps storage per origin, so the preview can never read, write or migrate
# a reader's data on votreader.github.io (and the live deploy, deploy-web.yml, only ever publishes main).
#
#   bash tools/deploy-preview.sh            from a clean checkout of `overhaul` at origin/overhaul's tip
#   bash tools/deploy-preview.sh --dry-run  stage _preview-site/ and stop (prints the file count)
#
# It publishes the committed build (the pre-commit hook and land.sh rebuild dist/ on every commit), staged exactly
# as deploy-web.yml stages _site/: assets/ minus src/, tests, d.ts and the build-only inputs, then the runtime src/
# files tools/list-runtime-src-assets.js names, plus build-sha.txt. wrangler is logged in on this PC (DECISIONS
# 09-27); first run creates the project with `overhaul` as its production branch.
# Exit 0 published (or dry run done), 2 bad start (wrong branch, dirty tree, not at origin/overhaul), 3 stage failed,
# 4 wrangler failed.
set -euo pipefail
DRY=
for a in "$@"; do case "$a" in --dry-run) DRY=1 ;; -h|--help) sed -n '2,20p' "$0"; exit 0 ;; *) echo "[preview] unknown argument: $a" >&2; exit 2 ;; esac; done

PROJECT="${PREVIEW_PROJECT:-votreader-preview}"
BRANCH="${PREVIEW_BRANCH:-overhaul}"
cd "$(git rev-parse --show-toplevel)"

[ "$(git rev-parse --abbrev-ref HEAD)" = "$BRANCH" ] || { echo "[preview] not on $BRANCH" >&2; exit 2; }
if ! git diff --quiet || ! git diff --cached --quiet; then echo "[preview] dirty tree: commit first" >&2; exit 2; fi
git fetch -q origin "$BRANCH" || true
if [ -z "$DRY" ] && [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$BRANCH" 2>/dev/null || echo none)" ]; then
  echo "[preview] HEAD is not origin/$BRANCH: land first (LAND_BRANCH=$BRANCH bash D:/Swarm/tools/land.sh)" >&2; exit 2
fi

SITE=_preview-site
python - "$SITE" <<'PY' || exit 3
import os, shutil, subprocess, sys
site = sys.argv[1]
src = os.path.join('app', 'src', 'main', 'assets')
if os.path.isdir(site):
    shutil.rmtree(site)
skip_top = {'src', 'app.css', 'react.min.js', 'react-dom.min.js', 'search-data.js'}
n = 0
for root, dirs, files in os.walk(src):
    rel = os.path.relpath(root, src)
    if rel == '.':
        dirs[:] = [d for d in dirs if d not in skip_top]
    for f in files:
        if rel == '.' and f in skip_top:
            continue
        if f.endswith(('.d.ts', '.lnk', '.test.js')):
            continue
        out = os.path.join(site, rel, f)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        shutil.copy2(os.path.join(root, f), out)
        n += 1
runtime = subprocess.run(['node', 'tools/list-runtime-src-assets.js'], capture_output=True, text=True, check=True).stdout.split()
for r in runtime:
    out = os.path.join(site, r)
    os.makedirs(os.path.dirname(out), exist_ok=True)
    shutil.copy2(os.path.join(src, r), out)
    n += 1
sha = subprocess.run(['git', 'rev-parse', 'HEAD'], capture_output=True, text=True, check=True).stdout.strip()
open(os.path.join(site, 'build-sha.txt'), 'w').write(sha + '\n')
print('[preview] staged %d files (%d runtime src) into %s' % (n, len(runtime), site))
PY
node tools/list-runtime-src-assets.js --check --site "$SITE" || exit 3
[ -n "$DRY" ] && { echo "[preview] dry run: $SITE ready, nothing published"; exit 0; }

WR="npx -y wrangler@4"
if ! $WR pages project list 2>/dev/null | grep -q "$PROJECT"; then
  $WR pages project create "$PROJECT" --production-branch "$BRANCH" || exit 4
fi
$WR pages deploy "$SITE" --project-name "$PROJECT" --branch "$BRANCH" \
  --commit-hash "$(git rev-parse HEAD)" --commit-message "$(git log -1 --format=%s | cut -c1-200)" --commit-dirty=false || exit 4
rm -rf "${SITE:?}"
echo "[preview] PUBLISHED $(git rev-parse --short HEAD) -> https://$PROJECT.pages.dev"
