"""Build script — concatenate Cluster A into a single classic-script bundle.

After G.2.1/G.2.2/G.2.3, Clusters B, C, and D are bundled by esbuild as
ES-module → IIFE bundles. This script now only emits bundle-a.js (vendor
+ raw corpus + search engine), which remains classic-script forever (no
benefit to converting third-party libs + ~1.5 MB of static data files to
ES modules).

CLUSTER OWNERSHIP:
  A — vendor + raw corpus + search engine                  (Python concat — this script)
  B — stores + components + hooks + journal + scripture    (esbuild → bundle-b.js)
  C — renderer (annotation engine + DOM bridges)           (esbuild → bundle-c.js)
  D — screens + sheets + components + utils + late stores  (esbuild → bundle-d.js)

The clusters are determined by the position of inline `<script>` blocks
in index.html. Inline blocks separate clusters because they declare
symbols used by following clusters AND reference symbols from prior
clusters; the load order between inlines and externals can't be
shuffled.

Run:
  python tools/build.py            # emits bundle-a.js only
  npm run build                    # full chain: this script + esbuild B/C/D

Output:
  app/src/main/assets/dist/bundle-a.js
"""
import os, sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

# Repo paths resolved relative to THIS script (tools/build.py) so the
# build runs identically on any machine and on CI — no hardcoded path.
_HERE = os.path.dirname(os.path.abspath(__file__))
REPO  = os.path.dirname(_HERE)
ROOT  = os.path.join(REPO, 'app', 'src', 'main', 'assets')
DIST  = os.path.join(ROOT, 'dist')

# Cluster A — vendor + small data + search engine (CRITICAL PATH).
# All corpus content is lazy-loaded:
#   - books.js (6.9 MB NKJV) → bundle-a-bible.js (Q8.1)
#   - matthew.js (618 KB Study Bible) → bundle-a-matthew.js (Q8.2)
#   - all VOT collections (7 volumes + letters families + WTLB + holy
#     days + hidden manna + blessed, ~3.0 MB) → bundle-a-vot.js (Q8.3)
# books-restored.js + matthew-plain.js + matthew-nkjv.js stay critical
# because they're cross-referenced by other paths (restored chrome
# overrides, BOOKS["matthew-plain"] for inline scripture refs).
# See BUNDLE-LAZY-LOAD-PLAN.md for the design rationale.
A = [
    'react.min.js', 'react-dom.min.js', 'html2canvas.min.js',
    'src/data/books-restored.js',
    'src/data/matthew-plain.js', 'src/data/matthew-nkjv.js',
    'flexsearch.min.js', 'search-data.js', 'search.js',
]

# Cluster A-bible — the 66-book NKJV corpus. Loaded ON DEMAND via
# window.__loadBibleCorpus() (see index.html ~line 67). Until this
# bundle loads, `BOOKS` is undefined; consumers (ScripturesHome,
# Bible-bound nav handlers, BibleChapterView, useReadingChainNav,
# useSurprise's Bible branch) either show skeleton state or await
# __loadBibleCorpus() before rendering / navigating.
A_BIBLE = [
    'src/data/books.js',
]

# Cluster A-matthew — the Matthew Study Bible. Loaded ON DEMAND via
# window.__loadMatthewCorpus() on first navigation to Matthew Study
# Bible content (Studies → Matthew Study Bible, or any chain
# navigation that crosses into Matthew). Until this bundle loads,
# `MATTHEW` is undefined; ALL_BOOKS, useBibleStudies' Matthew chain,
# useSurprise's matthew branch, MatthewChapterView all guard.
A_MATTHEW = [
    'src/data/matthew.js',
]

# Cluster A-vot — all VOT collections (7 volumes + letters families +
# WTLB + Holy Days + Hidden Manna + The Blessed). Loaded ON DEMAND
# via window.__loadVotCorpus() on first navigation to ANY VOT-side
# content (VolumesHome, any letter index, any letter view, any WTLB
# entry). Until this bundle loads, the corresponding LETTERS_X /
# WTLB_X / HOLY_DAYS / etc. globals are undefined; consumers route
# through colLetterArr / colPreface (which use typeof window[name]
# guards) and render empty / loading state cleanly. __finishVotInit
# re-runs linkWtlbEntries + linkPreface + rebuilds VOT_LETTER_REGISTRY
# so cross-corpus tap-through works once the corpus is in.
A_VOT = [
    'src/data/volume-one.js', 'src/data/volume-two.js', 'src/data/volume-three.js',
    'src/data/volume-four.js', 'src/data/volume-five.js', 'src/data/volume-six.js',
    'src/data/volume-seven.js',
    'src/data/letters-timothy.js', 'src/data/letters-flock.js', 'src/data/lords-rebuke.js',
    'src/data/wtlb-one.js', 'src/data/wtlb-two.js', 'src/data/wtlb-scriptures.js',
    'src/data/the-blessed.js', 'src/data/holy-days.js', 'src/data/hidden-manna.js',
]

# Cluster B — stores + components + hooks + journal subsystem + scripture-resolution
# (NOW BUNDLED VIA ESBUILD as of G.2.2).
# This list is kept empty; the source files use ES `export` syntax now.
# See package.json `build:b` for the esbuild invocation.
B = []  # intentionally empty; esbuild owns bundle-b.js

# Cluster C — renderer (NOW BUNDLED VIA ESBUILD as of G.2.1).
# This list is kept for reference; tools/build.py no longer emits bundle-c.js.
# See tools/build-esbuild.sh (or package.json `build:c`) for the esbuild
# invocation. The classic-script concat is dead for this cluster — the
# source files use ES `export` syntax now.
C = []  # intentionally empty; esbuild owns bundle-c.js

# Cluster D — screens + sheets + components + utils + late stores
# (NOW BUNDLED VIA ESBUILD as of G.2.3).
# This list is kept empty; the source files use ES `export` syntax now.
# See package.json `build:d` for the esbuild invocation (entry point:
# src/ui/_entry-d.js).
D = []  # intentionally empty; esbuild owns bundle-d.js


def bundle(name, files):
    out_path = os.path.join(DIST, 'bundle-' + name + '.js')
    parts = []
    parts.append('/* ' + '=' * 67 + '\n')
    parts.append('   G.1 BUNDLE ' + name.upper() + ' — ' + str(len(files)) + ' files concatenated\n')
    parts.append('   Generated by tools/build.py. DO NOT EDIT BY HAND — edit src/* files.\n')
    parts.append('   ' + '=' * 67 + ' */\n\n')
    total = 0
    for rel in files:
        path = os.path.join(ROOT, rel.replace('/', os.sep))
        if not os.path.isfile(path):
            print('FATAL: file not found:', rel)
            sys.exit(1)
        with open(path, 'r', encoding='utf-8', newline='') as f:
            content = f.read()
        parts.append('\n/* ' + '-' * 60 + '\n')
        parts.append(' * ' + rel + '\n')
        parts.append(' * ' + '-' * 60 + ' */\n')
        parts.append(content)
        if not content.endswith('\n'):
            parts.append('\n')
        total += len(content)
    os.makedirs(DIST, exist_ok=True)
    with open(out_path, 'w', encoding='utf-8', newline='') as f:
        out = ''.join(parts)
        f.write(out)
    print('OK: ' + name + ' = ' + str(len(files)) + ' files, ' + str(total) + ' raw bytes, ' + str(len(out)) + ' bundle bytes')


def main():
    print('Building 4 classic-script bundles --> ' + DIST)
    print('  (clusters B, C, D are bundled by esbuild; run `npm run build` for the full chain)')
    bundle('a', A)
    bundle('a-bible', A_BIBLE)
    bundle('a-matthew', A_MATTHEW)
    bundle('a-vot', A_VOT)
    print('Done. (bundle-b.js, bundle-c.js, bundle-d.js belong to esbuild now.)')


if __name__ == '__main__':
    main()
