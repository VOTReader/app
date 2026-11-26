/* up1: the "What's new" list is built from a release's commits, in plain words (tools/whats-new.mjs). */
import { describe, it, expect } from 'vitest';
import { linesOf, releaseLinesOf, stripIds, buildItems, MAX_ITEMS } from './whats-new.mjs';

describe('linesOf: feat and fix only, internal scopes and review rounds left out', () => {
  it('keeps what a reader would notice', () => {
    expect(linesOf('feat(plans): build your own reading plan')).toEqual(['Build your own reading plan.']);
    expect(linesOf('fix(player): a step that cannot load keeps what was playing\n\nbody')).toEqual(['A step that cannot load keeps what was playing.']);
    expect(linesOf('fix: the share card names the letter')).toEqual(['The share card names the letter.']);
  });
  it('leaves out the rest', () => {
    for (const m of [
      'chore(build): rebuild generated files', 'ci(deploy): publish twice a day', 'test(sw): pin the wait',
      'docs: CONTRIBUTING', 'refactor(store): one lookup', 'style(plans): the month marks the days ahead',
      'fix(ci): the runner cache', 'feat(tools): a new walk', 'fix(e2e,gate): the walk waits',
      'fix(journal): ds5 B3/B4 refuter r1 - a newer edit voids the older', 'Merge branch main', '',
    ]) expect(linesOf(m), m).toEqual([]);
  });
  it('a scope that is partly the reader\'s is kept', () => {
    expect(linesOf('fix(ci,player): the bar keeps its place')).toEqual(['The bar keeps its place.']);
  });
  it('a commit may say it itself, or say none', () => {
    expect(linesOf("fix(store): ds5 B4 - LinkStore.getTouching\n\nWhat's new: Links show on every verse they touch.\nWhat's new: Notes keep their order."))
      .toEqual(['Links show on every verse they touch.', 'Notes keep their order.']);
    expect(linesOf("feat(picker): imports navItemPreview\n\nWhat's new: none")).toEqual([]);
    expect(linesOf("chore: a tidy-up\n\nWhat's new: the About screen names the reading plans")).toEqual(['The About screen names the reading plans.']);
  });
});

describe('stripIds', () => {
  it('drops the work id at the head and a bracketed id at the end', () => {
    expect(stripIds('up1 - a new build waits for the reader')).toBe('a new build waits for the reader');
    expect(stripIds('ds5 B3 - journal data gaps')).toBe('journal data gaps');
    expect(stripIds('mw18 C8/C9/C11 - a way in')).toBe('a way in');
    expect(stripIds('rp-s1 - the daily reminder (call 4A)')).toBe('the daily reminder');
    expect(stripIds('Wave 3 batch B3 - verse words in the link picker')).toBe('verse words in the link picker');
    expect(stripIds('the month marks the days ahead (mw18 C9)')).toBe('the month marks the days ahead');
  });
  it('keeps a dash or a bracket that is part of the sentence', () => {
    expect(stripIds("a copied passage is cited with its number - 'Volume One, Letter 1'")).toBe("a copied passage is cited with its number - 'Volume One, Letter 1'");
    expect(stripIds('the mini player steps aside (while typing)')).toBe('the mini player steps aside (while typing)');
    expect(stripIds('verses 1-3 - now one card')).toBe('now one card');   // a digit in a short head reads as an id: say it with What's new: instead
  });
});

describe('buildItems', () => {
  const range = [
    { t: 3000, message: 'feat(plans): mw18 C8 - a way in' },
    { t: 2000, message: 'chore(build): rebuild generated files' },
    { t: 1000, message: 'fix(player): up1 - the bar keeps its place' },
    { t: 4000, message: "fix(store): internal\n\nWhat's new: none" },
  ];
  it('newest first, the commit time on each', () => {
    expect(buildItems(range)).toEqual([{ t: 3000, text: 'A way in.' }, { t: 1000, text: 'The bar keeps its place.' }]);
  });
  it('adds to what is already published, the same words once (the newest copy kept)', () => {
    const prev = [{ t: 500, text: 'Build your own reading plan.' }, { t: 900, text: 'A way in.' }];
    expect(buildItems(range, prev)).toEqual([
      { t: 3000, text: 'A way in.' }, { t: 1000, text: 'The bar keeps its place.' }, { t: 500, text: 'Build your own reading plan.' },
    ]);
  });
  it('a release with nothing a reader would notice has no items', () => {
    expect(buildItems([{ t: 1, message: 'chore(build): x' }, { t: 2, message: 'test(sw): y' }])).toEqual([]);
  });
  it('keeps at most MAX_ITEMS and ignores broken previous items', () => {
    const many = Array.from({ length: MAX_ITEMS + 20 }, (_, i) => ({ t: i, message: `feat(x): change number ${i} here` }));
    expect(buildItems(many).length).toBe(MAX_ITEMS);
    expect(buildItems([], /** @type {any} */ ([null, { t: 'x', text: 'a' }, { t: 1 }, { t: 2, text: 'Kept.' }]))).toEqual([{ t: 2, text: 'Kept.' }]);
  });
});

describe("a release that says it as a whole: What's new (release)", () => {
  const branch = [
    { t: 1000, message: 'fix(kit): kit chevrons' },
    { t: 2000, message: 'feat(search): result groups follow the order' },
    { t: 3000, message: "Merge main into the branch\n\nWhat's new: a line of its own" },
    { t: 4000, message: "feat(app): the release list\n\nWhat's new (release): a new look throughout\nWhat's new (release): settings you can find\n" },
  ];
  it('reads the release lines in plain sentences', () => {
    expect(releaseLinesOf(branch[3].message)).toEqual(['A new look throughout.', 'Settings you can find.']);
    expect(releaseLinesOf(branch[0].message)).toEqual([]);
    expect(linesOf(branch[3].message)).toEqual(['The release list.']);   // the plain rule never reads the release lines
  });
  it("its lines are the range's whole list, in the order written, and what was published stays", () => {
    const items = buildItems(branch, [{ t: 10, text: 'Published before.' }]);
    expect(items.map((i) => i.text)).toEqual(['A new look throughout.', 'Settings you can find.', 'Published before.']);
  });
  it('without one, every commit speaks for itself as before', () => {
    // 'Kit chevrons' names the design kit, a work word since pipeline-3, so it is left out
    expect(buildItems(branch.slice(0, 3)).map((i) => i.text)).toEqual(['A line of its own.', 'Result groups follow the order.']);
  });
});

/* pipeline-3 (audit 2026-11-23 #12): the live list read like test logs. Lines from the live whats-new.json, 11-23. */
describe('pipeline-3: test and tool words never reach a reader', () => {
  it('a clause naming a test, a store, a contrast ratio or a kit class is dropped; the rest of the line stays', () => {
    expect(linesOf('fix(settings): a Settings row summary wraps inside its card; e2e-tabs launches Chrome with CollectWebGPUSupportMetrics off'))
      .toEqual(['A Settings row summary wraps inside its card.']);
    expect(linesOf('fix(text): a raised selection sheet takes its taps; no contextmenu tells of the lift (iPhone Safari)'))
      .toEqual(['A raised selection sheet takes its taps.']);
  });
  it('a line whose lead clause is jargon goes whole', () => {
    for (const m of [
      "fix(toast): the toast's Undo reads 5.11:1 in light; e2e-tour follows Skip back to Settings",
      "fix(history): History's Remove reaches the app's own HistoryStore; e2e-undo-deletes walks all three Undos",
      'fix(kit): one confirm on the kit - ConfirmStrip draws .ui-confirm; the Downloads boxes use it',
      'fix(plans): the paused sitting survives the legacy localStorage sweep',
      "fix(read): reading-flow hunt - study footnotes' Back, Matthew's pills and notes",
      'feat(look): pass 3, part two: the pictures, the chart viewer, epigraphs',
      "fix(kit): the offline strip's Retry and x are the Notice's own kit parts; at large text its buttons get their own row",
      "fix(bookmarks): the bookmark popover's Cancel takes text-1",
    ]) expect(linesOf(m), m).toEqual([]);
  });
  it('names a reader knows are kept', () => {
    expect(linesOf('fix(text): the Copy button works on iPhone and iPad')).toEqual(['The Copy button works on iPhone and iPad.']);
    expect(linesOf('feat(listen): a YouTube link opens in VOTReader')).toEqual(['A YouTube link opens in VOTReader.']);
  });
  it('a question keeps its own mark, with no full stop after it', () => {
    expect(linesOf('fix(downloads): one kept song left: Remove this song (4.5 MB) from this phone?'))
      .toEqual(['One kept song left: Remove this song (4.5 MB) from this phone?']);
  });
  it('items already published are cleaned the same way', () => {
    const prev = [
      { t: 3, text: 'One kept song left: Remove this song (4.5 MB) from this phone?.' },
      { t: 2, text: "The toast's Undo reads 5.11:1 in light; e2e-tour follows Skip back to Settings." },
      { t: 1, text: 'A Settings row summary wraps inside its card; e2e-tabs launches Chrome with CollectWebGPUSupportMetrics off.' },
    ];
    expect(buildItems([], prev)).toEqual([
      { t: 3, text: 'One kept song left: Remove this song (4.5 MB) from this phone?' },
      { t: 1, text: 'A Settings row summary wraps inside its card.' },
    ]);
  });
});

/* release-pipeline-n2 (audit 2026-11-23 #12): the APK reads the newest 300 commits; one release commit there froze its list. */
describe("release-pipeline-n2: a release commit speaks for the commits before it, not after", () => {
  it('newer feat and fix commits after a release commit keep their own lines', () => {
    const history = [
      { t: 5000, message: 'fix(player): the bar keeps its place' },
      { t: 4500, message: 'chore(build): rebuild' },
      { t: 4000, message: "feat(tools): the release list\n\nWhat's new (release): a new look throughout" },
      { t: 3000, message: 'feat(search): result groups follow the order' },
    ];
    expect(buildItems(history).map((i) => i.text)).toEqual(['The bar keeps its place.', 'A new look throughout.']);
  });
  it('two releases: each keeps its lines, and only what came after the newest speaks for itself', () => {
    const history = [
      { t: 1000, message: "feat: one\n\nWhat's new (release): first release" },
      { t: 2000, message: 'feat(read): between the two' },
      { t: 3000, message: "feat: two\n\nWhat's new (release): second release" },
      { t: 4000, message: 'fix(read): after both' },
    ];
    expect(buildItems(history).map((i) => i.text)).toEqual(['After both.', 'Second release.', 'First release.']);
  });
});
