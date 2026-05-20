"""G.1 build script — concatenate the 4 external-script clusters into
4 bundle files. Pure Python. No Node, no esbuild yet (that's G.2).

The output is BYTE-EQUIVALENT to today's classic-script load: same files
in the same order, just emitted as one larger file per cluster. Each
file's content is wrapped only with a tiny separator comment for
debugging — no transformation, no minification.

CLUSTERS:
  A — vendor + raw corpus + search engine (loads before inline-2)
  B — stores + components + hooks + journal (loads before inline-3)
  C — renderer (loads before inline-4 — the big App() block)
  D — extracted screens / sheets / utils / etc. (loads after App)

The clusters are determined by the position of inline `<script>` blocks
in index.html. Inline blocks separate clusters because they declare
symbols used by following clusters AND reference symbols from prior
clusters; the load order between inlines and externals can't be
shuffled.

Run:
  python tools/build.py

Output:
  app/src/main/assets/dist/bundle-a.js
  app/src/main/assets/dist/bundle-b.js
  app/src/main/assets/dist/bundle-c.js
  app/src/main/assets/dist/bundle-d.js
"""
import os, sys

sys.stdout.reconfigure(encoding='utf-8', errors='replace')

REPO  = 'D:/VOTReader-studio'
ROOT  = REPO + '/app/src/main/assets'
DIST  = ROOT + '/dist'

# Cluster A — vendor + raw corpus + search engine
A = [
    'react.min.js', 'react-dom.min.js', 'html2canvas.min.js',
    'src/data/books.js', 'src/data/books-restored.js',
    'src/data/matthew.js', 'src/data/matthew-plain.js', 'src/data/matthew-nkjv.js',
    'src/data/volume-one.js', 'src/data/volume-two.js', 'src/data/volume-three.js',
    'src/data/volume-four.js', 'src/data/volume-five.js', 'src/data/volume-six.js',
    'src/data/volume-seven.js',
    'src/data/letters-timothy.js', 'src/data/letters-flock.js', 'src/data/lords-rebuke.js',
    'src/data/wtlb-one.js', 'src/data/wtlb-two.js', 'src/data/wtlb-scriptures.js',
    'src/data/the-blessed.js', 'src/data/holy-days.js', 'src/data/hidden-manna.js',
    'flexsearch.min.js', 'search-data.js', 'search.js',
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

# Cluster D — extracted screens/sheets/components/utils (loads after App)
D = [
    'src/ui/screens/LetterView.js',
    'src/ui/screens/WtlbEntryView.js',
    'src/ui/screens/BibleChapterView.js',
    'src/ui/screens/ChapterView.js',
    'src/ui/screens/LibraryScreen.js',
    'src/ui/screens/NotesIndexScreen.js',
    'src/ui/screens/VolumesHome.js',
    'src/ui/screens/StudiesHome.js',
    'src/ui/screens/HistoryScreen.js',
    'src/ui/screens/AboutScreen.js',
    'src/ui/screens/SettingsScreen.js',
    'src/ui/screens/HomeScreen.js',
    'src/ui/screens/SearchScreen.js',
    'src/ui/components/Segments.js',
    'src/ui/components/ProphecyCard.js',
    'src/ui/components/ProphecyGroup.js',
    'src/ui/components/VerseWithNumbers.js',
    'src/ui/components/InAppLinkButton.js',
    'src/ui/components/FootnoteSheet.js',
    'src/ui/components/ScriptureVerseText.js',
    'src/ui/components/ScriptureSheet.js',
    'src/ui/components/ExpandableVerse.js',
    'src/ui/components/ThemeBtn.js',
    'src/ui/components/ScreenLayout.js',
    'src/ui/components/ModeToggle.js',
    'src/ui/components/InlineNotes.js',
    'src/ui/components/InlineEcho.js',
    'src/ui/components/StudyPanels.js',
    'src/ui/components/ChapterBookmarkBtn.js',
    'src/ui/components/NavButtons.js',
    'src/ui/components/ProphecyExpandToggle.js',
    'src/ui/components/HomeBtn.js',
    'src/ui/components/TabsNavBtn.js',
    'src/ui/components/LibraryNav.js',
    'src/ui/components/FootnoteListSection.js',
    'src/ui/components/StickyChapterNav.js',
    'src/ui/sheets/TabsOverview.js',
    'src/ui/sheets/TabActionSheet.js',
    'src/ui/sheets/MultiNotePopover.js',
    'src/ui/sheets/NotebookPickerSheet.js',
    'src/ui/sheets/NoteSheet.js',
    'src/ui/sheets/LetterExcerptPickerScreen.js',
    'src/ui/sheets/VersePickerScreen.js',
    'src/ui/sheets/LinkPicker.js',
    'src/ui/sheets/LinkSidebar.js',
    'src/ui/sheets/SelectionToolbar.js',
    'src/ui/sheets/AnnotationActionChip.js',
    'src/ui/components/ClearProgressRow.js',
    'src/ui/components/SrchCard.js',
    'src/ui/components/SrchSnippet.js',
    'src/ui/components/SettingsRow.js',
    'src/ui/components/SelectField.js',
    'src/ui/components/VolumeLetterIndex.js',
    'src/ui/components/HistoryEntryCard.js',
    'src/ui/screens/BibleStudyIndex.js',
    'src/ui/screens/ChapterIndex.js',
    'src/ui/screens/GardenView.js',
    'src/ui/screens/ScriptureGenre.js',
    'src/ui/screens/ScripturesHome.js',
    'src/ui/components/NoteRow.js',
    'src/ui/sheets/NotebookManagerSheet.js',
    'src/ui/components/LinkCard.js',
    'src/ui/components/LinkIcon.js',
    'src/utils/hl-keys.js',
    'src/utils/dates.js',
    'src/utils/garden.js',
    'src/utils/tabs.js',
    'src/stores/thumb-store.js',
    'src/data/translations.js',
    'src/utils/nav-index.js',
    'src/utils/note-source.js',
    'src/utils/book-category.js',
    'src/utils/scripture-parse.js',
    'src/utils/highlight.js',
    'src/utils/render-text.js',
    'src/utils/search.js',
    'src/ui/components/SrchGroup.js',
    'src/ui/screens/LinksScreen.js',
    'src/ui/screens/BookmarksScreen.js',
    'src/ui/screens/HighlightsScreen.js',
    'src/ui/sheets/BookmarkCreateSheet.js',
]


def bundle(name, files):
    out_path = DIST + '/bundle-' + name + '.js'
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
    print('Building 2 classic-script bundles --> ' + DIST)
    print('  (clusters B and C are bundled by esbuild; run `npm run build:b build:c` separately)')
    bundle('a', A)
    bundle('d', D)
    print('Done. (bundle-b.js and bundle-c.js belong to esbuild now.)')


if __name__ == '__main__':
    main()
