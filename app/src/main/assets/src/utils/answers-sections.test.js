// @ts-nocheck — reads the corpus files the way the app's own gates do
/* answers-sections — a site link's #fragment lands on the section it names (aogcg 1b, brief 7.2,
   C10/C11). The paragraph a fragment lands on comes from the converter's sections sidecar when
   answers-meta.js is loaded, else from the topic's own headings; both must agree on every link
   the letters carry, and both must land on the heading the site shows for that anchor. */
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import {
  answersAnchorKey, answersMetaFor, answersSections, answersAnchorPara, answersSectionOf, answersSectionAnchor,
} from './answers-sections.js';
import { answersIdForUrl } from './answers-links.js';
import { answersContents } from './answers-contents.js';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const ctx = {};
runInNewContext(readFileSync(resolve(DATA, 'answers.js'), 'utf8'), ctx);
runInNewContext(readFileSync(resolve(DATA, 'answers-meta.js'), 'utf8'), ctx);
const A = ctx.ANSWERS, M = ctx.ANSWERS_META;
const byId = new Map(A.map((e) => [e.id, e]));

/* Letter -> #section links, and the heading the site's parse API names for each anchor
   (sections[].line, captured from answersonlygodcangive.com with the converter's cache,
   2026-10). The paragraph a link lands on must be that heading, bold and centred. */
const CACHE_SAMPLES = [
  ['https://answersonlygodcangive.com/The_Name_of_The_Lord#Immanu_El', 'Immanu El'],
  ['https://answersonlygodcangive.com/Main_Page#Setting_All_These_Crooked_Paths_Straight', 'Setting All These Crooked Paths Straight'],
  ['https://answersonlygodcangive.com/Regarding_The_Holy_Days_of_God#Pentecost', 'Pentecost'],
  ['https://answersonlygodcangive.com/The_Volumes_of_Truth#Amos_3:7', 'Amos 3:7'],
  ['https://answersonlygodcangive.com/Regarding_the_Holidays_of_Men#Man.27s_Holidays_vs._God.27s_Holy_Days_.28comparison.29', 'Man\'s Holidays vs. God\'s Holy Days (comparison)'],
  ['https://answersonlygodcangive.com/Regarding_Spiritual_Gifts#-_Charity', '- Charity'],
  ['https://answersonlygodcangive.com/God_Speaks_Regarding_Those_Who_Take_His_Name_in_Vain#.22In_My_Name.22', '"In My Name"'],
  ['https://answersonlygodcangive.com/Woe_to_Those_Who...#Woe_to_Those_Who_Bear_False_Witness_in_The_Lord.E2.80.99s_Name', 'Woe to Those Who Bear False Witness in The Lord’s Name'],
  ['https://answersonlygodcangive.com/The_One_Who_Stays,_Lets#The_One_Who_Stays.2C_Lets', 'The One Who Stays, Lets'],
  ['https://answersonlygodcangive.com/Main_Page#My_Word_Is_Fire', 'My Word Is Fire'],
  ['https://answersonlygodcangive.com/The_Way,_The_Truth,_The_Life#The_ONLY_Way.2C_The_ONLY_Truth.2C_The_ONLY_Life', 'The ONLY Way, The ONLY Truth, The ONLY Life'],
];

/* Links the site left stale (its headings changed after the letters linked them): each lands on
   the heading it plainly means rather than the top of the topic. */
const STALE_LINKS = [
  ['https://answersonlygodcangive.com/Regarding_The_True_Church#Section_2_-_The_True_Bride', 'The True Bride'],
  ['https://answersonlygodcangive.com/Woe_to_Those_Who...#Woe_to_Those_Who_Celebrate_Pagan-laced_Holidays', 'Woe to Those Who Celebrate Pagan-Laced Holidays'],
  ['https://answersonlygodcangive.com/God_Speaks_Regarding_Those_Who_Take_His_Name_in_Vain#Polluting_the_Name_of_The_Lord', 'Polluting the Name of The Lord (Section One)'],
  ['https://answersonlygodcangive.com/I_Am_Calling_You_Out#Come_Out_of_the_Churches_of_Men', 'Come Out of the Churches of Men - Section One'],
  ['https://answersonlygodcangive.com/False_Doctrines_Within_the_Churches_of_Men_Regarding...#More_False_Doctrines_-_The_Catholic_Church', 'The Catholic Church'],
];

/** Where a site URL lands: [id, paragraph with the sidecar, paragraph from the text alone]. */
function land(url) {
  const r = answersIdForUrl(url);
  expect(r, url).toBeTruthy();
  const e = byId.get(r.id);
  expect(e, r.id).toBeTruthy();
  return [r.id, answersAnchorPara(e, r.anchor, M[r.id]), answersAnchorPara(e, r.anchor, null)];
}

describe('answersAnchorKey', () => {
  it('decodes the MediaWiki dot escapes and percent escapes, and drops case and punctuation', () => {
    expect(answersAnchorKey('.22In_My_Name.22')).toBe('in my name');
    expect(answersAnchorKey('%22In_My_Name%22')).toBe('in my name');
    expect(answersAnchorKey('#The_One_Who_Stays.2C_Lets')).toBe('the one who stays lets');
    expect(answersAnchorKey('Man.27s_Holidays_vs._God.27s_Holy_Days_.28comparison.29')).toBe('man s holidays vs god s holy days comparison');
    expect(answersAnchorKey('Amos_3:7')).toBe('amos 3 7');
  });

  it('gives an anchor and the heading it was made from one key', () => {
    expect(answersAnchorKey('Woe_to_Those_Who_Bear_False_Witness_in_The_Lord.E2.80.99s_Name'))
      .toBe(answersAnchorKey('Woe to Those Who Bear False Witness in The Lord’s Name'));
    expect(answersAnchorKey('Woe_to_Those_Who_Celebrate_Pagan-laced_Holidays'))
      .toBe(answersAnchorKey('Woe to Those Who Celebrate Pagan-Laced Holidays'));
  });

  it('is empty for no anchor, and keeps a stray % as written', () => {
    expect(answersAnchorKey(null)).toBe('');
    expect(answersAnchorKey(undefined)).toBe('');
    expect(answersAnchorKey('#')).toBe('');
    expect(answersAnchorKey('100%_Sure')).toBe('100 sure');
  });
});

describe('answersAnchorPara — sampled letter links land on the heading the site shows', () => {
  it.each(CACHE_SAMPLES)('%s', (url, heading) => {
    const [id, withMeta, fromText] = land(url);
    expect(withMeta, `${id} with the sidecar`).toBeGreaterThanOrEqual(0);
    expect(byId.get(id).paragraphs[withMeta].text).toBe('**' + heading + '**');
    expect(fromText, `${id} from the text alone`).toBe(withMeta);
  });

  it.each(STALE_LINKS)('a stale link: %s', (url, heading) => {
    const [id, withMeta, fromText] = land(url);
    expect(withMeta, id).toBeGreaterThanOrEqual(0);
    expect(byId.get(id).paragraphs[withMeta].text).toBe('**' + heading + '**');
    expect(fromText, `${id} from the text alone`).toBe(withMeta);
  });

  /* Every Related Topics row naming a section (224 rows, 62 distinct URLs across Volumes 1-7,
     Letters, Lord's Rebuke, Matthew and Holy Days): a heading, the same one either way. */
  it('every letter link with a #section lands on a heading, with or without the sidecar', () => {
    const urls = new Set();
    let rows = 0;
    for (const f of readdirSync(DATA).filter((n) => /^(volume-|letters-|lords-rebuke|matthew\.js$|holy-days\.js$)/.test(n))) {
      const text = readFileSync(resolve(DATA, f), 'utf8');
      for (const m of text.matchAll(/"?url"?:\s*"(https?:\/\/[^"]*answersonlygodcangive\.com[^"#]*#[^"]+)"/g)) { rows++; urls.add(m[1]); }
    }
    expect(rows).toBeGreaterThanOrEqual(224);
    const missed = [];
    for (const url of urls) {
      const [id, withMeta, fromText] = land(url);
      const t = withMeta >= 0 ? byId.get(id).paragraphs[withMeta].text : '';
      if (withMeta < 0 || fromText !== withMeta || !(t.startsWith('**') && t.endsWith('**'))) missed.push(`${url} -> ${id}:${withMeta}/${fromText}`);
    }
    expect(missed).toEqual([]);
  });

  it('opens at the top (-1) for an anchor no heading has, no anchor, or no entry', () => {
    const e = byId.get('regarding-pride');
    expect(answersAnchorPara(e, 'No_Such_Section_Here', M[e.id])).toBe(-1);
    expect(answersAnchorPara(e, 'No_Such_Section_Here', null)).toBe(-1);
    expect(answersAnchorPara(e, '', M[e.id])).toBe(-1);
    expect(answersAnchorPara(e, null, null)).toBe(-1);
    expect(answersAnchorPara(null, 'For_the_Sake_of_Pride', null)).toBe(-1);
  });

  it('matches a heading prefix only on whole words', () => {
    const entry = { paragraphs: [
      { text: '**Faithfulness**', align: 'center' }, { text: 'one' },
      { text: '**Faith in Trials**', align: 'center' }, { text: 'two' },
    ] };
    expect(answersAnchorPara(entry, 'Faith', null)).toBe(2);
    expect(answersAnchorPara(entry, 'Faithful', null)).toBe(-1);
  });
});

describe('answersSections', () => {
  it('is the sidecar\'s sections when given, else the topic\'s own headings', () => {
    const e = byId.get('regarding-pride');
    expect(answersSections(e, M[e.id])).toBe(M[e.id].sections);
    const fromText = answersSections(e, null);
    expect(fromText.map((s) => s.at)).toEqual(answersContents(e).sections.filter((s) => s.title).map((s) => s.index));
    expect(fromText.every((s) => s.level === 1)).toBe(true);
    expect(answersSections(null, null)).toEqual([]);
  });

  it('every non-synthetic sidecar section is a heading the text carries at the same place', () => {
    for (const e of A) {
      const fromText = new Set(answersSections(e, null).map((s) => s.at));
      for (const s of (M[e.id].sections || [])) if (!s.synthetic) expect(fromText.has(s.at), `${e.id}:${s.at} ${s.title}`).toBe(true);
    }
  });
});

describe('answersSectionOf', () => {
  const S = [
    { title: 'One', level: 1, at: 2 },
    { title: 'One A', level: 2, at: 5 },
    { title: 'One B', level: 2, at: 8 },
    { title: 'Two', level: 1, at: 11 },
  ];

  it('is null before the first section', () => {
    expect(answersSectionOf(S, 0)).toBe(null);
    expect(answersSectionOf(S, 1)).toBe(null);
    expect(answersSectionOf([], 4)).toBe(null);
    expect(answersSectionOf(null, 4)).toBe(null);
  });

  it('names the innermost section a paragraph sits in, with its level-1 parent', () => {
    expect(answersSectionOf(S, 2)).toEqual({ section: S[0], parent: null });
    expect(answersSectionOf(S, 4)).toEqual({ section: S[0], parent: null });
    expect(answersSectionOf(S, 5)).toEqual({ section: S[1], parent: S[0] });
    expect(answersSectionOf(S, 10)).toEqual({ section: S[2], parent: S[0] });
    expect(answersSectionOf(S, 11)).toEqual({ section: S[3], parent: null });
    expect(answersSectionOf(S, 999)).toEqual({ section: S[3], parent: null });
  });

  it('puts each sidecar heading paragraph in its own section, and a level-2 one under a level-1', () => {
    let nested = 0;
    for (const e of A) {
      const secs = M[e.id].sections || [];
      secs.forEach((s, i) => {
        if (secs.some((o, j) => j > i && o.at === s.at)) return;   // a synthetic one sharing the paragraph
        const got = answersSectionOf(secs, s.at);
        expect(got.section, `${e.id}:${s.at}`).toBe(s);
        if (s.level > 1 && got.parent) { nested++; expect(got.parent.level).toBeLessThan(s.level); }
      });
    }
    expect(nested).toBeGreaterThan(0);
  });
});

describe('answersSectionAnchor and answersMetaFor', () => {
  afterEach(() => { delete window.ANSWERS_META; });

  it('makes a section landing for a tab, or null without an anchor', () => {
    expect(answersSectionAnchor('regarding-pride', 'For_the_Sake_of_Pride'))
      .toEqual({ type: 'section', letterId: 'regarding-pride', anchor: 'For_the_Sake_of_Pride' });
    expect(answersSectionAnchor('regarding-pride', null)).toBe(null);
    expect(answersSectionAnchor('regarding-pride', '')).toBe(null);
    expect(answersSectionAnchor('', 'For_the_Sake_of_Pride')).toBe(null);
  });

  it('reads the sidecar once answers-meta.js has loaded, and is null before', () => {
    expect(answersMetaFor('regarding-pride')).toBe(null);
    window.ANSWERS_META = M;
    expect(answersMetaFor('regarding-pride')).toBe(M['regarding-pride']);
    expect(answersMetaFor('no-such-topic')).toBe(null);
    expect(answersMetaFor('toString')).toBe(null);
  });
});
