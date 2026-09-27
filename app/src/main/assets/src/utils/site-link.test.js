// @ts-nocheck — reads the REAL shipped corpus and the site snapshot.
/* site-link (cp2): a copy from a letter links to it on thevolumesoftruth.com.
   The address is built from the title, so this is the proof it is real:
   every letter, preface, Words To Live By / Blessed / Holy Days entry,
   Letter Study and Answers source line resolves against tools/site-pages.json,
   the site's own page list and section anchors. A new letter whose title the
   site spells differently fails here: add it to SITE_ALIASES. When the site
   gains pages, refresh the snapshot (py -3 tools/fetch-site-pages.py). */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { COLLECTIONS } from '../data/scripture-resolution.js';
import {
  SITE_URL, SITE_ALIASES, SECTION_ALIASES, COMPILATION_PAGES, HUB_PAGES, MATTHEW_STUDY_PAGE,
  siteTarget, sourceTarget, pageTarget, wikiPath, wikiAnchor, textFragment, siteUrl, collectionName,
} from './site-link.js';
import { answersSource, passageSource } from './answers-contents.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..', '..', '..', '..', '..');
const SITE = JSON.parse(readFileSync(join(ROOT, 'tools', 'site-pages.json'), 'utf8'));
const PAGES = new Set(SITE.pages);

/** Each collection's data file (a new collection must say where its letters are). */
const FILES = {
  one: 'volume-one', two: 'volume-two', three: 'volume-three', four: 'volume-four', five: 'volume-five',
  six: 'volume-six', seven: 'volume-seven', timothy: 'letters-timothy', flock: 'letters-flock',
  rebuke: 'lords-rebuke', wtlb1: 'wtlb-one', wtlb2: 'wtlb-two', blessed: 'the-blessed',
  holydays: 'holy-days', answers: 'answers', hm: 'hidden-manna',
};
const corpus = {};
for (const f of [...Object.values(FILES), 'bible-studies']) runInNewContext(readFileSync(join(HERE, '..', 'data', f + '.js'), 'utf8'), corpus);

/** Why a target is not a real place on the site, or null. */
function problem(target) {
  if (!target || !target.page) return 'no page';
  if (!PAGES.has(target.page)) return SITE.redirects[target.page] ? 'a redirect to "' + SITE.redirects[target.page] + '" (alias it)' : 'no such page';
  if (target.anchor && !(SITE.sections[target.page] || []).includes(target.anchor)) return 'no section #' + target.anchor;
  return null;
}

describe('site-link — every copy links to a page the site has', () => {
  it('knows where every collection keeps its letters', () => {
    expect(COLLECTIONS.map((c) => c.volKey).filter((k) => !FILES[k])).toEqual([]);
  });

  it('every letter, preface and entry resolves to a real page (and section)', () => {
    const misses = [];
    let checked = 0;
    for (const col of COLLECTIONS) {
      if (col.volKey === 'answers') continue;               // its passages link to their letters (below)
      const entries = [...(corpus[col.globalName] || [])];
      if (col.prefaceGlobal && corpus[col.prefaceGlobal]) entries.push(corpus[col.prefaceGlobal]);
      expect(entries.length, col.volKey).toBeGreaterThan(0);
      for (const entry of entries) {
        // The context findEntryContext hands passage-copy for this entry.
        const why = problem(siteTarget({ kind: col.kind, screen: col.letterScreen, collection: col.label, title: entry.title, entry }));
        checked++;
        if (why) misses.push(col.volKey + ' / ' + entry.title + ': ' + why);
      }
    }
    expect(checked).toBeGreaterThan(700);
    expect(misses).toEqual([]);
  });

  it('every Letter Study resolves to its page', () => {
    const misses = [];
    for (const study of corpus.BIBLE_STUDIES) {
      for (const ch of study.chapters || []) {
        const why = problem(siteTarget({ kind: 'study-letter', screen: 'bible-study-chapter', collection: study.title, title: ch.title, entry: ch }));
        if (why) misses.push(study.id + ' / ' + ch.title + ': ' + why);
      }
    }
    expect(corpus.BIBLE_STUDIES.length).toBeGreaterThan(5);
    expect(misses).toEqual([]);
  });

  it('every Answers source line names a letter (or a section) the site has', () => {
    const misses = [];
    let lines = 0;
    for (const topic of corpus.ANSWERS) {
      for (const p of topic.paragraphs || []) {
        const src = answersSource(p.text);
        if (!src) continue;
        lines++;
        const why = problem(sourceTarget(src.title, src.collection));
        if (why) misses.push(topic.id + ': "' + src.title + '" ~ ' + src.collection + ': ' + why);
      }
    }
    expect(lines).toBeGreaterThan(1500);
    expect(misses).toEqual([]);
  });

  it('the aliases, compilations and hubs name pages that exist', () => {
    for (const page of [...Object.values(SITE_ALIASES), ...Object.values(COMPILATION_PAGES), ...HUB_PAGES, MATTHEW_STUDY_PAGE]) {
      expect(PAGES.has(page), page).toBe(true);
    }
    const anchors = Object.values(COMPILATION_PAGES).flatMap((p) => SITE.sections[p] || []);
    for (const heading of Object.values(SECTION_ALIASES)) expect(anchors, heading).toContain(wikiAnchor(heading));
  });
});

describe('site-link — addresses as the site writes them', () => {
  it('a page is its title with underscores, punctuation as MediaWiki keeps it', () => {
    expect(wikiPath('The Wide Path')).toBe('The_Wide_Path');
    expect(wikiPath('Words To Live By: Part One')).toBe('Words_To_Live_By:_Part_One');
    expect(wikiPath('Embrace The Cornerstone, Wherein Flows Springs of Living Water')).toBe('Embrace_The_Cornerstone,_Wherein_Flows_Springs_of_Living_Water');
    // The site's own links, as the letters carry them (volume-two.js).
    expect(wikiPath(SITE_ALIASES['YahuShua The Messiah, The Lamb of God']))
      .toBe('YahuShua..._The_Lamb_of_God:_The_TRUE_Chronology_of_The_Messiah%E2%80%99s_Crucifixion_and_Resurrection');
    expect(wikiPath("I Am The Lord's")).toBe('I_Am_The_Lord%27s');
  });

  it('a section anchor is MediaWiki 1.32\'s legacy id, as the snapshot lists them', () => {
    expect(wikiAnchor('Come, Love Awaits You')).toBe('Come.2C_Love_Awaits_You');
    expect(wikiAnchor("I Am The Lord's")).toBe('I_Am_The_Lord.27s');
    expect(wikiAnchor('YAHUWAH Is One; And His Word, One')).toBe('YAHUWAH_Is_One.3B_And_His_Word.2C_One');
    expect(SITE.sections['Words To Live By: Part One']).toContain('Come.2C_Love_Awaits_You');
  });

  it('a text fragment quotes the first and last few words, or a short passage whole', () => {
    expect(textFragment([['Obey', 'God!']])).toBe(':~:text=Obey%20God!');
    expect(textFragment([['Thus', 'says', 'The', 'Lord:', 'Peoples', 'of', 'the', 'earth,', 'why', 'do'], ['as', 'the', 'sun', 'sets', 'upon', 'this', 'age', 'of', 'men.']]))
      .toBe(':~:text=Thus%20says%20The%20Lord%3A,this%20age%20of%20men.');
    expect(textFragment([['well-being', 'and', 'peace,', 'for', 'you']])).toBe(':~:text=well%2Dbeing%20and%20peace%2C%20for%20you');
    expect(textFragment([[], []])).toBe('');
  });

  it('the link: page, section, quote; a hub page quotes nothing; no closing mark left for a chat app to drop', () => {
    expect(siteUrl({ page: 'The Wide Path' }, [['Thus', 'says', 'The', 'Lord:']])).toBe(SITE_URL + 'The_Wide_Path#:~:text=Thus%20says%20The%20Lord%3A');
    expect(siteUrl(sourceTarget('Come, Love Awaits You', 'Words To Live By: Part One'), [['Come', 'to', 'Me']]))
      .toBe(SITE_URL + 'Words_To_Live_By:_Part_One#Come.2C_Love_Awaits_You:~:text=Come%20to%20Me');
    expect(siteUrl({ page: MATTHEW_STUDY_PAGE, hub: true }, [['Blessed', 'are', 'the', 'poor']]))
      .toBe(SITE_URL + 'The_Volumes_of_Truth_New_Testament_Study_Bible_-_The_Book_of_Matthew');
    expect(siteUrl(pageTarget('Grace AND The Law (Bible/Letter Study)'))).toBe(SITE_URL + 'Grace_AND_The_Law_(Bible/Letter_Study%29');
    expect(siteUrl(null)).toBe('');
  });

  it('an entry taken from a compilation links to its section there (Holy Days)', () => {
    const t = siteTarget({ kind: 'holy-days', collection: 'Regarding The Holy Days', title: 'Embracing The Gift', entry: { type: 'wtlb', sourceLabel: 'Words To Live By: Part One' } });
    expect(t).toEqual({ page: 'Words To Live By: Part One', anchor: 'Embracing_The_Gift' });
    expect(siteTarget({ kind: 'letter', screen: 'answers-entry', collection: 'Answers Only God Can Give', title: 'Regarding Pride' })).toBeNull();
  });

  it('an Answers source line names its collection the app\'s way', () => {
    expect(collectionName('Volume 7')).toBe('Volume Seven');
    expect(collectionName("The Lord's Rebuke")).toBe("The Lord's Rebuke");
  });
});

describe('answers passageSource — which letter a copied run of a topic quotes', () => {
  const paras = [
    { align: 'justify', text: 'WOE TO THOSE WHO HARM THE LITTLE ONES!' },
    { align: 'justify', text: 'Therefore, thus says The Lord: The murder of the innocent…' },
    { align: 'right', text: '~ [From “Abortion: Murder of the Innocent” ~ Volume 2]' },
    { align: 'center', text: '✦' },
    { align: 'justify', text: 'Another passage.' },
    { align: 'right', text: '~ [From “Pentecost” ~ Volume 6]' },
    { align: 'center', text: '**A Section**' },
    { align: 'justify', text: 'Words no source line claims.' },
    { align: 'center', text: '**Another Section**' },
    { align: 'justify', text: 'A third passage.' },
    { align: 'right', text: '~ [From “Come, Love Awaits You” ~ Words To Live By: Part One]' },
  ];
  it('a passage (its source line included or not) is its letter', () => {
    expect(passageSource(paras, 0, 1)).toEqual({ title: 'Abortion: Murder of the Innocent', collection: 'Volume 2' });
    expect(passageSource(paras, 1, 2)).toEqual({ title: 'Abortion: Murder of the Innocent', collection: 'Volume 2' });
    expect(passageSource(paras, 4, 4)).toEqual({ title: 'Pentecost', collection: 'Volume 6' });
    expect(passageSource(paras, 9, 10)).toEqual({ title: 'Come, Love Awaits You', collection: 'Words To Live By: Part One' });
  });
  it('a run across passages, or words no source line closes, names none', () => {
    expect(passageSource(paras, 1, 4)).toBeNull();
    expect(passageSource(paras, 7, 7)).toBeNull();
  });
});
