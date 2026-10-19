// @ts-nocheck
/* answers-links — a letter's answersonlygodcangive.com rows open the topic in-app. */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { answersUrlKey, answersUrlAnchor, answersIdForUrl, answersLinkForUrl, answersEndpointForUrl, openAnswersLink, ANSWERS_COLLECTION_LABEL } from './answers-links.js';
import { ANSWERS_URL_INDEX, ANSWERS_TITLES } from './answers-url-index.js';

const DATA = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const ctx = {};
runInNewContext(readFileSync(resolve(DATA, 'answers.js'), 'utf8'), ctx);
const ANSWERS = ctx.ANSWERS;

describe('answersUrlKey', () => {
  it('normalises the site\'s URL forms to one key', () => {
    expect(answersUrlKey('https://answersonlygodcangive.com/Regarding_Pride')).toBe('regarding pride');
    expect(answersUrlKey('https://www.answersonlygodcangive.com/index.php?title=Regarding_Pride')).toBe('regarding pride');
    expect(answersUrlKey('https://answersonlygodcangive.com/Regarding_the_Gathering_Up_%28Rapture%29')).toBe('regarding the gathering up rapture');
  });
  it('is null for any other site or a malformed URL', () => {
    expect(answersUrlKey('https://www.thevolumesoftruth.com/Regarding_Pride')).toBeNull();
    expect(answersUrlKey('not a url')).toBeNull();
    expect(answersUrlKey('')).toBeNull();
  });
});

describe('the generated link index agrees with the corpus', () => {
  it('names every topic by its real title, and nothing else', () => {
    expect(Object.keys(ANSWERS_TITLES).length).toBe(ANSWERS.length);
    for (const e of ANSWERS) expect(ANSWERS_TITLES[e.id], e.id).toBe(e.title);
  });
  it('every URL key points at a real topic', () => {
    const ids = new Set(ANSWERS.map((e) => e.id));
    expect(Object.values(ANSWERS_URL_INDEX).filter((id) => !ids.has(id))).toEqual([]);
  });
});

describe('answersLinkForUrl', () => {
  it('turns a site URL into the in-app link LetterView opens', () => {
    expect(answersLinkForUrl('https://answersonlygodcangive.com/Regarding_Pride'))
      .toEqual({ collection: ANSWERS_COLLECTION_LABEL, letterTitle: 'Regarding Pride' });
    expect(answersIdForUrl('https://answersonlygodcangive.com/Regarding_Pride')).toEqual({ id: 'regarding-pride', anchor: null });
    expect(answersLinkForUrl('https://answersonlygodcangive.com/No_Such_Page')).toBeNull();
    expect(answersIdForUrl('https://answersonlygodcangive.com/No_Such_Page')).toBeNull();
  });

  /* Every Related Topics row the letters carry (2078 of them, 224 naming a section; Volume Two
     writes `url:` unquoted, the rest `"url":`): the in-app topic, never the website. Only the
     site's own search pages stay outside. */
  it('resolves every Related Topics row the letters carry but the site\'s search pages', () => {
    const urls = [];
    for (const f of readdirSync(DATA).filter((n) => /^(volume-|letters-|lords-rebuke|matthew\.js$|holy-days\.js$)/.test(n))) {
      const text = readFileSync(resolve(DATA, f), 'utf8');
      for (const m of text.matchAll(/"?url"?:\s*"(https?:\/\/[^"]*answersonlygodcangive\.com[^"]*)"/g)) urls.push(m[1]);
    }
    expect(urls.length).toBeGreaterThanOrEqual(2078);
    const outside = urls.filter((u) => !answersLinkForUrl(u));
    expect(outside.filter((u) => !/[?&]search=/.test(u))).toEqual([]);
  });
});

/* aogcg 1b (brief 7.2, C10/C11): a site URL names a page AND, after '#', a section of it. Both
   URL forms the site writes keep the fragment: /Title#Section and /index.php?title=Title#Section. */
describe('answersIdForUrl — the page and the section a site URL names', () => {
  it('keeps the #fragment of both URL forms, as the site wrote it', () => {
    expect(answersIdForUrl('https://answersonlygodcangive.com/Regarding_Pride#For_the_Sake_of_Pride'))
      .toEqual({ id: 'regarding-pride', anchor: 'For_the_Sake_of_Pride' });
    expect(answersIdForUrl('http://www.answersonlygodcangive.com/index.php?title=Regarding_Pride#For_the_Sake_of_Pride'))
      .toEqual({ id: 'regarding-pride', anchor: 'For_the_Sake_of_Pride' });
    expect(answersIdForUrl('https://answersonlygodcangive.com/God_Speaks_Regarding_Those_Who_Take_His_Name_in_Vain#.22In_My_Name.22'))
      .toEqual({ id: 'god-speaks-regarding-those-who-take-his-name-in-vain', anchor: '.22In_My_Name.22' });
    // A percent-encoded fragment is decoded; an empty one is no anchor.
    expect(answersUrlAnchor('https://answersonlygodcangive.com/Regarding_Pride#The_Pride_of_Man%20Shall')).toBe('The_Pride_of_Man Shall');
    expect(answersIdForUrl('https://answersonlygodcangive.com/Regarding_Pride#')).toEqual({ id: 'regarding-pride', anchor: null });
    expect(answersUrlAnchor('https://www.thevolumesoftruth.com/Regarding_Pride#X')).toBeNull();
  });

  it('the Main Page and its three redirects open the Main Page entry, at the named section', () => {
    for (const t of ['Main_Page', 'Regarding_Divorce', 'Regarding_Australia', 'Regarding_Good_and_Evil']) {
      expect(answersIdForUrl('https://answersonlygodcangive.com/' + t), t).toEqual({ id: 'answers-main-page', anchor: null });
    }
    expect(answersIdForUrl('https://answersonlygodcangive.com/Main_Page#Discernment'))
      .toEqual({ id: 'answers-main-page', anchor: 'Discernment' });
  });

  it('the site\'s dead #Come_Out_and_Fight_Against_Me link opens that page (it is not a section of I Am Calling You Out)', () => {
    expect(answersIdForUrl('https://answersonlygodcangive.com/I_Am_Calling_You_Out#Come_Out_and_Fight_Against_Me'))
      .toEqual({ id: 'come-out-and-fight-against-me', anchor: null });
    // Its real sections stay sections.
    expect(answersIdForUrl('https://answersonlygodcangive.com/I_Am_Calling_You_Out#Take_No_Part'))
      .toEqual({ id: 'i-am-calling-you-out', anchor: 'Take_No_Part' });
  });
});

describe('answersEndpointForUrl — the in-app jump a letter row makes', () => {
  it('opens the topic, with a section landing when the URL names one and a cleared landing when not', () => {
    expect(answersEndpointForUrl('https://answersonlygodcangive.com/Regarding_Pride#For_the_Sake_of_Pride')).toEqual({
      type: 'wtlb', screen: 'answers-entry', letterId: 'regarding-pride',
      surpriseAnchor: { type: 'section', letterId: 'regarding-pride', anchor: 'For_the_Sake_of_Pride' },
    });
    expect(answersEndpointForUrl('https://answersonlygodcangive.com/Regarding_Pride'))
      .toEqual({ type: 'wtlb', screen: 'answers-entry', letterId: 'regarding-pride', surpriseAnchor: null });
    expect(answersEndpointForUrl('https://answersonlygodcangive.com/index.php?search=mercy')).toBeNull();
  });
});

describe('openAnswersLink', () => {
  it('opens only after the corpus load settles (no loader in tests: at once)', async () => {
    const open = vi.fn();
    const link = { collection: ANSWERS_COLLECTION_LABEL, letterTitle: 'Regarding Pride' };
    await openAnswersLink(link, open);
    expect(open).toHaveBeenCalledWith(link);
  });
});
