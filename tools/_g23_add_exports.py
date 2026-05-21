"""G.2.3 — mechanical `export` keyword adder for Cluster D source files.

Adds `export ` before every top-level `function`/`const`/`let`/`var`/`class`
declaration (column 0, no leading whitespace) in each file in the D list.

This is a pure syntactic transformation. It does NOT:
  - Touch nested declarations (always indented)
  - Re-add `export` to lines that already have it (idempotent)
  - Reorder, restructure, or otherwise modify the file
  - Add imports — those come in _entry-d.js

Run:
  python tools/_g23_add_exports.py            # apply
  python tools/_g23_add_exports.py --dry-run  # report what WOULD change
"""
import os, re, sys

REPO = 'D:/VOTReader-studio'
ROOT = REPO + '/app/src/main/assets'

# Same list as tools/build.py's D[], minus the bundle-A entries.
D_FILES = [
    # ── ui/screens ────────────────────────────────────────────────────────
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
    'src/ui/screens/BibleStudyIndex.js',
    'src/ui/screens/ChapterIndex.js',
    'src/ui/screens/GardenView.js',
    'src/ui/screens/ScriptureGenre.js',
    'src/ui/screens/ScripturesHome.js',
    'src/ui/screens/LinksScreen.js',
    'src/ui/screens/BookmarksScreen.js',
    'src/ui/screens/HighlightsScreen.js',
    # ── ui/components ─────────────────────────────────────────────────────
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
    'src/ui/components/ClearProgressRow.js',
    'src/ui/components/SrchCard.js',
    'src/ui/components/SrchSnippet.js',
    'src/ui/components/SrchGroup.js',
    'src/ui/components/SettingsRow.js',
    'src/ui/components/SelectField.js',
    'src/ui/components/VolumeLetterIndex.js',
    'src/ui/components/HistoryEntryCard.js',
    'src/ui/components/NoteRow.js',
    'src/ui/components/LinkCard.js',
    'src/ui/components/LinkIcon.js',
    # ── ui/sheets ─────────────────────────────────────────────────────────
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
    'src/ui/sheets/BookmarkCreateSheet.js',
    'src/ui/sheets/NotebookManagerSheet.js',
    # ── utils ─────────────────────────────────────────────────────────────
    'src/utils/hl-keys.js',
    'src/utils/dates.js',
    'src/utils/garden.js',
    'src/utils/tabs.js',
    'src/utils/nav-index.js',
    'src/utils/note-source.js',
    'src/utils/book-category.js',
    'src/utils/scripture-parse.js',
    'src/utils/highlight.js',
    'src/utils/render-text.js',
    'src/utils/search.js',
    # ── stores ────────────────────────────────────────────────────────────
    'src/stores/thumb-store.js',
    # ── data ──────────────────────────────────────────────────────────────
    'src/data/translations.js',
]

# Match column-0 declarations.  `async function` covered too.  Lookahead
# (?!export) is implicit — the patterns explicitly don't match a leading
# `export` since they require `function`/`const`/etc to be the FIRST word.
DECL_RE = re.compile(
    r'^(async\s+function|function|const|let|var|class)\s',
    re.MULTILINE,
)


def transform(content):
    """Return (new_content, count_of_exports_added)."""
    n_added = [0]

    def add_export(m):
        n_added[0] += 1
        return 'export ' + m.group(0)

    new_content = DECL_RE.sub(add_export, content)
    return new_content, n_added[0]


def main():
    dry_run = '--dry-run' in sys.argv
    total_added = 0
    total_files_changed = 0
    for rel in D_FILES:
        path = os.path.join(ROOT, rel.replace('/', os.sep))
        if not os.path.isfile(path):
            print('SKIP (not found):', rel)
            continue
        with open(path, 'r', encoding='utf-8', newline='') as f:
            content = f.read()
        # Idempotency guard: if the file already has any `export ` at column
        # 0, assume it's been converted already and skip.
        if re.search(r'^export\s+(function|const|let|var|class|async)', content, re.MULTILINE):
            print('SKIP (already has exports):', rel)
            continue
        new_content, n = transform(content)
        if n == 0:
            print('SKIP (no top-level decls?):', rel)
            continue
        total_added += n
        total_files_changed += 1
        if dry_run:
            print(f'WOULD CHANGE: {rel} (+{n} exports)')
        else:
            with open(path, 'w', encoding='utf-8', newline='') as f:
                f.write(new_content)
            print(f'OK: {rel} (+{n} exports)')
    suffix = ' (dry run)' if dry_run else ''
    print(f'---{suffix}\n{total_files_changed} files, {total_added} exports added{suffix}')


if __name__ == '__main__':
    main()
