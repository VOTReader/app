// @ts-nocheck — reads the corpus files the way the app's own gates do
/* answers-site — the site's own contents (24 sidebar headings, 120 topics) and its reading order,
   held to the sidebar and redirects captured from answersonlygodcangive.com (aogcg 1b, brief 3.1,
   3.4, D6) and to the converter's siteGroup / siteNav sidecars. A re-vendor that moves, drops or
   renames a topic fails here rather than filing it under the wrong heading. */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import {
  ANSWERS_SIDEBAR, ANSWERS_FD_INDEX_ID, ANSWERS_FD_INDEX_TEXT, ANSWERS_END_CARD, ANSWERS_GROUP_NOTE, ANSWERS_NOT_IN_MENU,
  answersSiteShelves, answersSiteShelfOf, answersSiteOrder, answersSiteNav,
} from './answers-site.js';
import { ANSWERS_COMMANDMENTS, ANSWERS_SUBJECTS, ANSWERS_MAIN_PAGE_ID } from './answers-shelves.js';
import { answersIdForUrl } from './answers-links.js';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const ctx = {};
runInNewContext(readFileSync(resolve(DATA, 'answers.js'), 'utf8'), ctx);
runInNewContext(readFileSync(resolve(DATA, 'answers-meta.js'), 'utf8'), ctx);
const A = ctx.ANSWERS, M = ctx.ANSWERS_META, SITE = ctx.ANSWERS_SITE_META;

/* MediaWiki:Sidebar as the site served it (2026-10, the converter's cache): each heading word for
   word, and the page titles it links under it, in order. */
const SITE_SIDEBAR = [
  ["1. You Shall Have No Other gods Before Me.", [
    "THERE IS NO OTHER",
    "God Rebukes New Age Spirituality",
  ]],
  ["2. You Shall Not Commit Idolatry.", [
    "God Speaks About Idolatry",
    "God Speaks About Materialism",
    "Regarding Another Messiah",
  ]],
  ["3. You Shall Not Take the Name of The Lord Your God in Vain.", [
    "God Speaks Regarding Those Who Take His Name in Vain",
  ]],
  ["4. Remember The Sabbath Day, to Keep it Holy.", [
    "God Speaks About The Sabbath",
  ]],
  ["5. Honor Your Father and Your Mother.", [
    "God Speaks About Honoring Your Father and Your Mother",
  ]],
  ["6. You Shall Not Murder.", [
    "Thus Says The Lord Regarding Abortion",
    "Thus Says The Lord Regarding Capital Punishment and Suicide",
    "God Speaks About Committing Murder Within the Heart",
  ]],
  ["7. You Shall Not Commit Adultery.", [
    "God Speaks Regarding Adultery Committed Against Him",
    "God Speaks Regarding Adultery Committed in Marriage",
    "God Speaks About Adultery of the Heart",
  ]],
  ["8. You Shall Not Steal.", [
    "God Speaks Regarding Those Who Steal From Him",
    "God Speaks Regarding Those Who Forsake the Poor and the Needy",
  ]],
  ["9. You Shall Not Bear False Witness Against Your Neighbor.", [
    "God Speaks Regarding Those Who Bear False Witness in His Name",
    "God Speaks Regarding Those Who Bear False Witness Against His Servants",
  ]],
  ["10. You Shall Not Covet.", [
    "God Speaks Regarding Covetousness",
  ]],
  ["Other Topics:", [
    "The Volumes of Truth",
    "The Name of The Lord",
    "The Father and The Son are One",
    "The Messiah",
    "The Way, The Truth, The Life",
    "Lamentations From The Lord",
    "Woe to Those Who...",
    "I Am Calling You Out",
    "New Heights in Wickedness",
    "Nature Shall Rise Up and Fight Against This Generation",
    "The One Who Stays, Lets",
    "I Am The Lord, I Do Not Change",
    "Parables",
    "Visions",
    "The Coming of The Lord",
  ]],
  ["1. Thus Says The Lord...", [
    "Regarding What is an Abomination to The Lord",
    "Regarding the Day of The Lord",
    "Regarding the Birth Pangs",
    "Regarding the Days of Noah",
    "Regarding Sodom and Gomorrah Revived",
    "Regarding Pollution and Mankind's Exploitation of the Earth",
    "Regarding Worldly Suffering",
  ]],
  ["2. Thus Says The Lord...", [
    "Regarding Prophets (True)",
    "Regarding Prophets (False)",
    "Regarding the 144,000 Witnesses",
    "Regarding the Two Witnesses",
    "Regarding the Voice of The Lord",
    "Regarding Spiritual Gifts",
  ]],
  ["3. Thus Says The Lord...", [
    "Regarding the United States",
    "Regarding Israel",
    "Regarding Africa",
    "Regarding the Olympics",
  ]],
  ["4. Thus Says The Lord...", [
    "Regarding the Churches of Men",
    "Regarding the Catholic Church",
    "Regarding the Jehovah's Witnesses",
    "Regarding the Church of Jesus Christ of Latter-day Saints (Mormons)",
    "Regarding the Seventh Day Adventist Church",
    "Regarding the United Church of God",
    "Regarding The True Church",
  ]],
  ["5. Thus Says The Lord...", [
    "Regarding the Mistranslation and Misinterpretation of the Scriptures",
    "Regarding Adding to or Taking Away From The Word of God",
    "Regarding The Ten Commandments",
    "Regarding The Holy Spirit",
    "Regarding The Trinity",
    "Regarding Hell and Eternal Torment",
    "Regarding Children’s Inheritance on Earth and in Heaven",
    "Regarding Who Killed The Messiah",
    "Regarding Sacred Names",
  ]],
  ["6. Thus Says The Lord...", [
    "Regarding The Holy Days of God",
    "Regarding The Crucifixion",
    "Regarding Crucifying The Messiah in Your Heart",
    "Regarding The Resurrection",
    "Regarding the First and Second Resurrection",
    "Regarding The Ascension and The Blessed Hope",
    "Regarding the Holidays of Men",
  ]],
  ["7. Thus Says The Lord...", [
    "Regarding Forgiveness",
    "Regarding Unforgiveness",
    "Regarding True Repentance",
    "Regarding Being Born Again",
    "Regarding Salvation",
  ]],
  ["8. Thus Says The Lord...", [
    "Regarding the Day and Hour Unknown",
    "Regarding the Gathering Up (Rapture)",
    "Regarding the First and Second Harvest",
    "Regarding the End Sign",
    "Regarding The Kingdom and Heaven",
    "Regarding Pets in The Kingdom",
  ]],
  ["9. Thus Says The Lord...", [
    "Regarding Spiritual Warfare",
    "Regarding Demons",
    "Regarding the Antichrist",
    "Regarding the Mark of the Beast",
    "Regarding Sin",
    "Regarding the First Death",
    "Regarding the Second Death",
    "Regarding the Final Judgment",
  ]],
  ["10. Thus Says The Lord...", [
    "Regarding Patience",
    "Regarding Faith",
    "Regarding Doubt",
    "Regarding Healing",
    "Regarding Baptism",
    "Regarding Prayer",
    "Regarding Fasting",
    "Regarding Tithing",
    "Regarding Obedience",
    "Regarding Staying Separate",
    "Regarding Scoffers",
    "Regarding Pride",
  ]],
  ["11. Thus Says The Lord...", [
    "Regarding Health",
    "Regarding Sex",
    "Regarding Homosexuality",
    "Regarding Marriage",
    "Regarding Parenting",
    "Regarding the Wearing of Jewelry",
  ]],
  ["12. Thus Says The Lord...", [
    "Regarding the Book of Ezekiel",
    "Regarding the Apostle Paul",
    "Regarding Judas Iscariot",
    "Regarding Noah, Ham and Canaan (Genesis 9:20-27)",
    "Regarding Creation",
    "Regarding Science",
    "Regarding Dinosaurs",
    "Regarding the Flat Earth Theory",
  ]],
  ["Index of False Doctrines Within the Churches of Men", [
    "False Doctrines Within the Churches of Men Regarding...",
  ]],
];

/* The site's redirects (Special:ListRedirects, 2026-10): [from, to]. Some chain; three end on the Main Page. */
const SITE_REDIRECTS = [
  ["Regarding \"Another Messiah\"", "Regarding Another Messiah"],
  ["Regarding Divorce", "Main Page"],
  ["''Regarding what is an Abomination to The Lord'''", "Regarding what is an Abomination to The Lord"],
  ["Regarding Original Sin", "Regarding Children’s Inheritance on Earth and in Heaven"],
  ["Regarding Miracles", "Regarding Healing"],
  ["Regarding the Anti-Christ", "Regarding the Antichrist"],
  ["Regarding Noah's Sons", "Regarding Noah, Ham and Canaan (Genesis 9:20-27)"],
  ["God Speaks about Idolatry", "God Speaks About Idolatry"],
  ["God Speaks about Materialism", "God Speaks About Materialism"],
  ["God Speaks Regarding those Who Take His Name in Vain", "God Speaks Regarding Those Who Take His Name in Vain"],
  ["God Speaks about The Sabbath", "God Speaks About The Sabbath"],
  ["God Speaks Regarding Adultery committed against Him", "God Speaks Regarding Adultery Committed Against Him"],
  ["God Speaks Regarding Adultery committed in Marriage", "God Speaks Regarding Adultery Committed in Marriage"],
  ["God Speaks Regarding those who Steal from His Glory", "God Speaks Regarding Those Who Steal From His Glory"],
  ["God Speaks Regarding those who Steal from their Neighbor", "God Speaks Regarding Those Who Steal From Their Neighbor"],
  ["God Speaks Regarding those who bear false witness in His name", "God Speaks Regarding Those Who Bear False Witness in His Name"],
  ["God Speaks Regarding those who bear false witness against His servants", "God Speaks Regarding Those Who Bear False Witness Against His Servants"],
  ["Lamentations from The Lord Our God and Savior", "Lamentations From The Lord Our God and Savior"],
  ["Regarding The Kingdom & Heaven", "Regarding The Kingdom and Heaven"],
  ["Regarding Sodom & Gomorrah Revived", "Regarding Sodom and Gomorrah Revived"],
  ["Regarding Hell & Eternal Torment", "Regarding Hell and Eternal Torment"],
  ["Lamentations From The Lord Our God and Savior", "Lamentations From The Lord"],
  ["Regarding The Messiah", "The Messiah"],
  ["Regarding The Volumes of Truth", "The Volumes of Truth"],
  ["Regarding Death", "Regarding the First Death"],
  ["Falsehoods Within the Churches of Men (Index)", "Index: False Doctrines Within the Churches of Men Regarding..."],
  ["Index: False Doctrines Within the Churches of Men Regarding...", "False Doctrines Within the Churches of Men Regarding..."],
  ["False Doctrines Within the Churches of Men Regarding", "False Doctrines Within the Churches of Men Regarding..."],
  ["God Speaks Regarding Those Who Steal From His Glory", "God Speaks Regarding Those Who Steal From Him"],
  ["God Speaks Regarding Those Who Steal From Their Neighbor", "God Speaks Regarding Those Who Forsake the Poor and the Needy"],
  ["Regarding Resurrection", "Regarding The Resurrection"],
  ["Regarding Australia", "Main Page"],
  ["Regarding Destroying the Garden (Earth", "Regarding Destroying the Garden (Earth)"],
  ["Regarding Prophets (True", "Regarding Prophets (True)"],
  ["Regarding Prophets (False", "Regarding Prophets (False)"],
  ["Regarding the Church of Jesus Christ of Latter-day Saints", "Regarding the Church of Jesus Christ of Latter-day Saints (Mormons)"],
  ["Regarding Good and Evil", "Main Page"],
  ["Regarding Prophets True", "Regarding Prophets (True)"],
  ["Regarding Destroying the Garden Earth", "Regarding Destroying the Garden (Earth)"],
  ["Regarding Prophets False", "Regarding Prophets (False)"],
  ["Regarding the Church of Jesus Christ of Latter-day Saints (Mormons", "Regarding the Church of Jesus Christ of Latter-day Saints (Mormons)"],
  ["Regarding the Church of Jesus Christ of Latter-day Saints Mormons", "Regarding the Church of Jesus Christ of Latter-day Saints (Mormons)"],
  ["Regarding Noah, Ham and Canaan (Genesis 9:20-27", "Regarding Noah, Ham and Canaan (Genesis 9:20-27)"],
  ["Regarding Noah, Ham and Canaan Genesis 9:20-27", "Regarding Noah, Ham and Canaan (Genesis 9:20-27)"],
  ["Regarding Destroying the Garden (Earth)", "Regarding Pollution and Mankind's Exploitation of the Earth"],
  ["Regarding Sodom and Gomorrah", "Regarding Sodom and Gomorrah Revived"],
  ["Regarding Children", "Regarding Children’s Inheritance on Earth and in Heaven"],
  ["False Doctrines Within the Churches of Men Regarding..", "False Doctrines Within the Churches of Men Regarding..."],
  ["God Speaks Regarding Those Who Bear False Witness", "God Speaks Regarding Those Who Bear False Witness Against His Servants"],
  ["Regarding Children’s Inheritance", "Regarding Children’s Inheritance on Earth and in Heaven"],
  ["Regarding what is an Abomination to The Lord", "Regarding What is an Abomination to The Lord"],
  ["Regarding the Gathering Up (\"Rapture\")", "Regarding the Gathering Up (Rapture)"],
  ["Regarding the Pollution of the Earth", "Regarding Destroying the Garden (Earth)"],
  ["Woe to Those Who", "Woe to Those Who..."],
  ["Regarding the Holy Spirit", "Regarding The Holy Spirit"],
  ["Regarding the Messiah", "Regarding The Messiah"],
  ["Regarding the Ten Commandments", "Regarding The Ten Commandments"],
  ["Regarding the Holy Days of God", "Regarding The Holy Days of God"],
  ["Regarding the Kingdom & Heaven", "Regarding The Kingdom & Heaven"],
  ["Regarding the Volumes of Truth", "Regarding The Volumes of Truth"],
  ["Regarding the True Church", "Regarding The True Church"],
  ["Regarding the Day and Hour", "The Day and Hour"],
  ["The Day and Hour", "Regarding the Day and Hour Unknown"],
  ["Regarding the Gathering Up (\"Rapture\"", "Regarding the Gathering Up (\"Rapture\")"],
  ["Regarding the Gathering Up (\"Rapture", "Regarding the Gathering Up (\"Rapture\")"],
  ["Regarding the Gathering Up Rapture", "Regarding the Gathering Up (\"Rapture\")"],
  ["The Lord's Hand is Removed", "The One Who Stays, Lets"],
  ["Woe to Those Who.", "Woe to Those Who..."],
  ["Woe to Those Who..", "Woe to Those Who..."],
  ["Visions and Interpretations", "Visions"],
  ["Regarding the Gathering Up (", "Regarding the Gathering Up (Rapture)"],
];

const ORPHAN = 'come-out-and-fight-against-me';
const FLAT_EARTH = 'regarding-the-flat-earth-theory';
const TVOT = 'answers-the-volumes-of-truth';
const COVET = 'god-speaks-regarding-covetousness';
const TINO = 'there-is-no-other';

const pathOf = (title) => title.replace(/ /g, '_');
const URL_FORMS = (title) => [
  'https://answersonlygodcangive.com/' + pathOf(title),
  'https://answersonlygodcangive.com/' + encodeURIComponent(pathOf(title)),
  'https://answersonlygodcangive.com/index.php?title=' + encodeURIComponent(pathOf(title)),
];
const idOf = (title) => { const r = answersIdForUrl(URL_FORMS(title)[0]); return r ? r.id : null; };
const REDIRECT = new Map(SITE_REDIRECTS);
/** A redirect followed to the page it ends on (the site's redirects chain: "The Day and Hour" -> ...). */
const finalTitle = (t) => { for (let i = 0; i < 10 && REDIRECT.has(t); i++) t = REDIRECT.get(t); return t; };

describe('the sidebar, word for word', () => {
  it('has the site\'s 24 headings, and the vendored chrome agrees', () => {
    expect(SITE_SIDEBAR.length).toBe(24);
    expect([...ANSWERS_SIDEBAR]).toEqual(SITE_SIDEBAR.map(([label]) => label));
    expect([...ANSWERS_SIDEBAR]).toEqual(SITE.sidebar);
    expect(Object.isFrozen(ANSWERS_SIDEBAR)).toBe(true);
  });

  it('lists 120 topics, and every title resolves in each URL form the site writes', () => {
    const titles = SITE_SIDEBAR.flatMap(([, ts]) => ts);
    expect(titles.length).toBe(120);
    const ids = new Set();
    for (const t of titles) {
      const [id, ...rest] = URL_FORMS(t).map((u) => answersIdForUrl(u));
      expect(id, t).toEqual({ id: expect.any(String), anchor: null });
      for (const r of rest) expect(r, t).toEqual(id);
      expect(A.some((e) => e.id === id.id), `${t} -> ${id.id}`).toBe(true);
      ids.add(id.id);
    }
    expect(ids.size).toBe(120);
    expect(ids.has(ANSWERS_MAIN_PAGE_ID)).toBe(false);
    expect(ids.has(ORPHAN)).toBe(false);
  });

  it('follows all 71 site redirects to the page they end on (the Main Page for its three)', () => {
    expect(SITE_REDIRECTS.length).toBe(71);
    const toMain = [];
    for (const [from] of SITE_REDIRECTS) {
      const end = finalTitle(from);
      expect(REDIRECT.has(end), `${from} ends on a redirect`).toBe(false);
      const want = end === 'Main Page' ? ANSWERS_MAIN_PAGE_ID : idOf(end);
      expect(want, `${from} -> ${end}`).toBeTruthy();
      if (want === ANSWERS_MAIN_PAGE_ID) toMain.push(from);
      for (const u of URL_FORMS(from)) expect(answersIdForUrl(u), `${from} (${u})`).toEqual({ id: want, anchor: null });
    }
    expect(toMain.sort()).toEqual(['Regarding Australia', 'Regarding Divorce', 'Regarding Good and Evil']);
    expect(answersIdForUrl('https://answersonlygodcangive.com/Main_Page')).toEqual({ id: ANSWERS_MAIN_PAGE_ID, anchor: null });
  });
});

describe('answersSiteShelves', () => {
  const shelves = answersSiteShelves(A);

  it('files each topic under the heading the sidebar lists it under, in the sidebar\'s order', () => {
    expect(shelves.length).toBe(24);
    shelves.forEach((s, i) => {
      expect(s.n).toBe(i + 1);
      expect(s.label).toBe(SITE_SIDEBAR[i][0]);
      expect(s.topics.map((e) => e.id), s.label).toEqual(SITE_SIDEBAR[i][1].map(idOf));
    });
  });

  it('has 10 commandments (19 topics), Other Topics (15 and one page outside the menu), 12 numbered groups and the index', () => {
    const kinds = shelves.map((s) => s.kind);
    expect(kinds).toEqual([...Array(10).fill('commandment'), 'other', ...Array(12).fill('tstl'), 'index']);
    const cmd = shelves.slice(0, 10);
    expect(cmd.reduce((n, s) => n + s.topics.length, 0)).toBe(19);
    cmd.forEach((s, i) => {
      expect(s.num).toBe(i + 1);
      expect(s.commandment).toBe(ANSWERS_COMMANDMENTS[i]);
      expect(s.short).toBe(ANSWERS_COMMANDMENTS[i].label);
      expect(s.notInMenu).toEqual([]);
    });
    const other = shelves[10];
    expect(other.label).toBe('Other Topics:');
    expect(other.num).toBe(null);
    expect(other.topics.length).toBe(15);
    expect(other.notInMenu.map((e) => e.id)).toEqual([ORPHAN]);
    const tstl = shelves.slice(11, 23);
    expect(tstl.map((s) => s.topics.length)).toEqual([7, 6, 4, 7, 9, 7, 5, 6, 8, 12, 6, 8]);
    expect(tstl.map((s) => s.num)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(tstl.map((s) => s.label)).toEqual(tstl.map((s) => `${s.num}. Thus Says The Lord...`));
    expect(tstl.map((s) => s.short)).toEqual([
      'Signs of this generation', 'Prophets, witnesses & gifts', 'The nations', 'The churches',
      'Scripture & doctrine', 'Holy Days, cross & resurrection', 'Forgiveness to salvation', 'The end & the Kingdom',
      'Warfare, sin, death & judgment', 'The walk of faith', 'Body, marriage & family', 'People of the Bible & creation',
    ]);
    const fd = shelves[23];
    expect(fd.kind).toBe('index');
    expect(fd.topics.map((e) => e.id)).toEqual([ANSWERS_FD_INDEX_ID]);
    expect(SITE_SIDEBAR[23][1]).toEqual(['False Doctrines Within the Churches of Men Regarding...']);
  });

  it('puts every topic on exactly one shelf, the one the converter\'s siteGroup names', () => {
    const seen = new Map();
    for (const s of shelves) for (const e of [...s.topics, ...s.notInMenu]) {
      expect(seen.has(e.id), `${e.id} twice`).toBe(false);
      seen.set(e.id, s);
    }
    expect(seen.size).toBe(A.length - 1);   // all but the Main Page
    for (const e of A) {
      const g = M[e.id].siteGroup;
      if (e.id === ANSWERS_MAIN_PAGE_ID) { expect(g).toEqual({ n: 0, label: 'Main Page' }); continue; }
      const s = seen.get(e.id);
      if (e.id === ORPHAN) { expect(g.n).toBe(null); expect(s.n).toBe(11); continue; }
      expect({ n: s.n, label: s.label }, e.id).toEqual({ n: g.n, label: g.label });
    }
    expect(M[ANSWERS_FD_INDEX_ID].siteGroup.text).toBe(ANSWERS_FD_INDEX_TEXT);
  });

  it('answersSiteShelfOf: a topic\'s shelf (Other Topics for the page outside the menu), else null', () => {
    expect(answersSiteShelfOf(A, TINO).n).toBe(1);
    expect(answersSiteShelfOf(A, FLAT_EARTH).n).toBe(23);
    expect(answersSiteShelfOf(A, ORPHAN).kind).toBe('other');
    expect(answersSiteShelfOf(A, ANSWERS_MAIN_PAGE_ID)).toBe(null);
    expect(answersSiteShelfOf(A, 'no-such-topic')).toBe(null);
  });

  it('builds once per corpus array, and copes with none', () => {
    // The cache holds one corpus, and other tests ask for other arrays first: compare
    // two calls in a row, not with the collection-time `shelves`.
    expect(answersSiteShelves(A)).toBe(answersSiteShelves(A));
    expect(answersSiteOrder(A)).toBe(answersSiteOrder(A));
    const empty = answersSiteShelves([]);
    expect(empty.length).toBe(24);
    expect(empty.every((s) => s.topics.length === 0)).toBe(true);
    expect(answersSiteOrder(null)).toEqual([]);
    expect(answersSiteNav([], TINO)).toBe(null);
    expect(answersSiteShelves(A)).toStrictEqual(shelves);
  });
});

describe('answersSiteOrder — the site\'s reading chain', () => {
  const order = answersSiteOrder(A);
  const ids = order.map((e) => e.id);

  it('runs Main Page, the 120 topics as the sidebar lists them, Flat Earth, then the index last', () => {
    expect(ids.length).toBe(121);
    expect(ids[0]).toBe(ANSWERS_MAIN_PAGE_ID);
    expect(ids[1]).toBe(TINO);
    expect(ids[ids.length - 2]).toBe(FLAT_EARTH);
    expect(ids[ids.length - 1]).toBe(ANSWERS_FD_INDEX_ID);
    expect(ids.slice(1)).toEqual(SITE_SIDEBAR.flatMap(([, ts]) => ts).map(idOf));
  });

  it('holds every entry exactly once but the page outside the menu', () => {
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice().sort()).toEqual(A.map((e) => e.id).filter((id) => id !== ORPHAN).sort());
  });
});

describe('answersSiteNav', () => {
  const nav = (id) => answersSiteNav(A, id);

  it('starts at the Main Page and reads on through the sidebar', () => {
    expect(nav(ANSWERS_MAIN_PAGE_ID)).toMatchObject({ prev: null, next: TINO, end: null, proceed: null, ret: null, notInMenu: false });
    expect(nav(TINO)).toMatchObject({ prev: ANSWERS_MAIN_PAGE_ID, next: 'god-rebukes-new-age-spirituality' });
  });

  it('reads The Volumes of Truth after Covetousness (the site\'s own Previous points at the index)', () => {
    expect(nav(TVOT).prev).toBe(COVET);
    expect(nav(COVET).next).toBe(TVOT);
    expect(M[TVOT].siteNav.prev).toBe(ANSWERS_FD_INDEX_ID);
  });

  it('ends the topics at Flat Earth with the site\'s end card and its Proceed to the index', () => {
    expect(nav(FLAT_EARTH)).toEqual({
      prev: 'regarding-dinosaurs', next: null, end: ANSWERS_END_CARD,
      proceed: { id: ANSWERS_FD_INDEX_ID, title: ANSWERS_FD_INDEX_TEXT }, ret: null, notInMenu: false,
    });
    expect(ANSWERS_END_CARD).toBe(SITE.endCard);
  });

  it('gives the index Previous = Flat Earth and Return to Main Page', () => {
    expect(nav(ANSWERS_FD_INDEX_ID)).toEqual({ prev: FLAT_EARTH, next: null, end: null, proceed: null, ret: ANSWERS_MAIN_PAGE_ID, notInMenu: false });
  });

  it('gives the page outside the menu the neighbours its own page claims, outside the chain', () => {
    expect(nav(ORPHAN)).toEqual({
      prev: 'new-heights-in-wickedness', next: 'nature-shall-rise-up-and-fight-against-this-generation',
      end: null, proceed: null, ret: null, notInMenu: true,
    });
    expect({ prev: M[ORPHAN].siteNav.prev, next: M[ORPHAN].siteNav.next }).toEqual({ prev: nav(ORPHAN).prev, next: nav(ORPHAN).next });
    expect(nav('new-heights-in-wickedness').next).toBe('nature-shall-rise-up-and-fight-against-this-generation');
  });

  it('is null for an id the corpus lacks', () => {
    expect(nav('no-such-topic')).toBe(null);
    expect(answersSiteNav(A.filter((e) => e.id !== ORPHAN), ORPHAN)).toBe(null);
  });

  /* The converter recorded each page's own Previous / Next links. The chain keeps them all but two,
     each the reciprocal of a neighbour's link: The Volumes of Truth's Previous (the site's points
     at the index; Covetousness's Next points here), and THERE IS NO OTHER's, which the site leaves
     out (the Main Page's Next points here). */
  it('agrees with every Previous / Next the site\'s pages carry but those two', () => {
    const differ = [];
    for (const e of answersSiteOrder(A)) {
      const ours = nav(e.id), site = M[e.id].siteNav || {};
      for (const k of ['prev', 'next']) if ((site[k] || null) !== ours[k]) differ.push(`${e.id}.${k}: site ${site[k]} / ours ${ours[k]}`);
      if (site.end || ours.end) expect(ours.end, e.id).toBe(site.end);
      if (site.ret || ours.ret) expect(ours.ret, e.id).toBe(site.ret);
    }
    expect(differ.sort()).toEqual([
      `${TVOT}.prev: site ${ANSWERS_FD_INDEX_ID} / ours ${COVET}`,
      `${TINO}.prev: site undefined / ours ${ANSWERS_MAIN_PAGE_ID}`,
    ].sort());
    expect(M[ANSWERS_MAIN_PAGE_ID].siteNav.next).toBe(TINO);
  });
});

describe('the shared words', () => {
  it('carries the site\'s wording and ours where each shows', () => {
    expect(ANSWERS_FD_INDEX_TEXT).toBe('False Doctrines Within the Churches (Index)');
    expect(ANSWERS_GROUP_NOTE).toBe('The site numbers these groups; the short names are ours.');
    expect(ANSWERS_NOT_IN_MENU).toBe('Not in the site’s menu');
  });

  it('keeps the nine subjects the app files topics under today', () => {
    expect(ANSWERS_SUBJECTS.length).toBe(9);
  });
});
