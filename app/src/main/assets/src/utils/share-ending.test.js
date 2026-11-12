/* share-ending (SHARE1, Corbin 2026-11-12: "For links, make it controllable. For scriptures, default is the verse
   and range and normal info, no version number, for letters there should be like 3 tiers, just the letter's online
   website link as the default minimal. Share should be a different thing though"). Every tier of both kinds on both
   actions, named by the same passageSourceFor every Copy and Share path uses. */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { passageSourceFor } from './passage-copy.js';
import { sharedText, endingChoice, canSwapLink, SHARE_ENDING_DEFAULTS, SCRIPTURE_CHOICES, LETTER_CHOICES } from './share-ending.js';

const g = /** @type {any} */ (globalThis);
const W = 'For God so loved the world';
const APP = 'https://votreader.github.io/app/?p=';
const SITE = 'https://www.thevolumesoftruth.com/The_Wide_Path';
/** @type {Record<string, any>} */
let settings = {};

beforeEach(() => {
  settings = { translation: 'rnkjv' };
  g._bookTitle = (/** @type {string} */ id) => ({ john: 'John', psalms: 'Psalms' })[id] || id;
  g.StateStore = { get: () => ({ settings }) };
  g.TRANSLATION_OPTIONS = [{ id: 'nkjv', label: 'NKJV' }, { id: 'rnkjv', label: 'NKJV-R' }, { id: 'kjv', label: 'KJV' }];
  g.findEntryContext = (/** @type {string} */ id) => ({
    'the-wide-path': { kind: 'letter', title: 'The Wide Path', collection: 'Volume Two', screen: 'vot-letter', entry: { id: 'the-wide-path', num: 1, date: '3/28/05' } },
    'v1-preface': { kind: 'letter', title: 'Preface', collection: 'Volume One', screen: 'vot-one-letter', entry: { id: 'v1-preface', num: 0 } },
    'prayer': { title: 'Prayer', collection: 'Answers Only God Can Give', screen: 'answers-entry', entry: { paragraphs: [] } },
  })[id] || null;
});
afterEach(() => { delete g._bookTitle; delete g.StateStore; delete g.TRANSLATION_OPTIONS; delete g.findEntryContext; });

/** @param {'copy' | 'share'} action @param {string[]} keys @param {Record<string, any>} [set] @param {string} [words] */
function text(action, keys, set = {}, words = W) {
  settings = { translation: 'rnkjv', ...set };
  return sharedText(words, passageSourceFor(keys), { action });
}

describe('From the Scriptures, on Copy and on Share, each set on its own', () => {
  const range = ['bible:john:3:16', 'bible:john:3:18'];
  const link = APP + 'bible%3Ajohn%3A3%3A16';
  for (const action of /** @type {const} */ (['copy', 'share'])) {
    const key = action + 'Scripture';
    it(action + ': Reference (the default), Reference and translation, Reference and link, Nothing', () => {
      expect(text(action, range)).toBe('"' + W + '"\n\nJohn 3:16-18');
      expect(text(action, range, { [key]: 'translation' })).toBe('"' + W + '"\n\nJohn 3:16-18 (NKJV)');   // cite-r: NKJV-R cited as NKJV
      expect(text(action, range, { [key]: 'link' })).toBe('"' + W + '"\n\nJohn 3:16-18\n' + link);
      expect(text(action, range, { [key]: 'none' })).toBe(W);
    });
  }
  it('Copy and Share keep their own choice', () => {
    expect(text('copy', range, { copyScripture: 'translation', shareScripture: 'none' })).toBe('"' + W + '"\n\nJohn 3:16-18 (NKJV)');
    expect(text('share', range, { copyScripture: 'translation', shareScripture: 'none' })).toBe(W);
  });
  it('a single verse, a whole chapter, a selection across chapters', () => {
    expect(text('copy', ['bible:john:3:16'], { copyScripture: 'translation' })).toBe('"' + W + '"\n\nJohn 3:16 (NKJV)');
    expect(text('share', ['bible:john:3'], { shareScripture: 'link' })).toBe('"' + W + '"\n\nJohn 3\n' + APP + 'bible%3Ajohn%3A3%3A1');
    expect(text('copy', ['bible:john:7:53', 'bible:john:8:1'])).toBe('"' + W + '"\n\nJohn 7:53-8:1');
    expect(text('share', ['bible:john:7:53', 'bible:john:8:1'], { shareScripture: 'link' }))
      .toBe('"' + W + '"\n\nJohn 7:53-8:1\n' + APP + 'bible%3Ajohn%3A7%3A53');
  });
  it('the Bible has no page on the website: its link is the app\'s, whatever Links I share point to says', () => {
    expect(text('share', ['bible:john:3:16'], { shareScripture: 'link', shareLink: 'site' })).toBe('"' + W + '"\n\nJohn 3:16\n' + link);
    expect(canSwapLink(passageSourceFor(['bible:john:3:16']), 'share')).toBe(false);
  });
});

describe('From the letters, on Copy and on Share, each set on its own', () => {
  const key = ['letter:the-wide-path:1'];
  for (const action of /** @type {const} */ (['copy', 'share'])) {
    const k = action + 'Letters';
    it(action + ': Link (the default), Title and link, Full citation and link, Nothing', () => {
      expect(text(action, key)).toBe('"' + W + '"\n\n' + SITE);
      expect(text(action, key, { [k]: 'title' })).toBe('"' + W + '"\n\nThe Wide Path\n' + SITE);
      expect(text(action, key, { [k]: 'citation' })).toBe('"' + W + '"\n\nVolume Two, Letter 1: The Wide Path · 3/28/05\n' + SITE);
      expect(text(action, key, { [k]: 'none' })).toBe(W);
    });
  }
  it('Links I share point to: The app puts the app\'s link in every tier (an old stored value keeps working)', () => {
    const app = APP + 'letter%3Athe-wide-path%3A1';
    expect(text('copy', key, { shareLink: 'app' })).toBe('"' + W + '"\n\n' + app);
    expect(text('share', key, { shareLink: 'app', shareLetters: 'title' })).toBe('"' + W + '"\n\nThe Wide Path\n' + app);
  });
  it('a letter without a number (a preface) is cited by its title and collection', () => {
    expect(text('share', ['letter:v1-preface:0'], { shareLetters: 'citation' })).toMatch(/^"For God so loved the world"\n\nPreface \(Volume One\)\nhttps:\/\//);
  });
  it('a page the website does not have (an Answers topic with no address) gets the app\'s link; the journal travels as the words alone', () => {
    const src = passageSourceFor(['wtlb:prayer:0']);
    expect(src && src.siteLink).toBe('');
    expect(text('share', ['wtlb:prayer:0'])).toBe('"' + W + '"\n\n' + APP + 'wtlb%3Aprayer%3A0');
    expect(text('share', ['wtlb:prayer:0'], { shareLetters: 'citation' })).toBe('"' + W + '"\n\nPrayer (Answers Only God Can Give)\n' + APP + 'wtlb%3Aprayer%3A0');
    expect(passageSourceFor(['journal:abc:0'])).toBeNull();
    expect(text('share', ['journal:abc:0'])).toBe(W);
  });
  it('with no link at all the Link tier still names the letter', () => {
    const src = { kind: /** @type {'letter'} */ ('letter'), place: 'X', translation: '', title: 'X', citation: 'X', siteLink: '', appLink: '' };
    expect(sharedText(W, src, { action: 'share', settings: {} })).toBe('"' + W + '"\n\nX');
  });
  it('the other link is offered only when the choice adds one', () => {
    settings = {};
    expect(canSwapLink(passageSourceFor(key), 'share')).toBe(true);
    settings = { shareLetters: 'none' };
    expect(canSwapLink(passageSourceFor(key), 'share')).toBe(false);
  });
});

describe('a note\'s Share and the settings', () => {
  it('a note keeps "My note:" between the quote and what is added', () => {
    settings = {};
    expect(sharedText(W, passageSourceFor(['bible:john:3:16']), { action: 'share', note: 'Mine' })).toBe('"' + W + '"\n\nMy note: Mine\n\nJohn 3:16');
    settings = { shareLetters: 'none' };
    expect(sharedText(W, passageSourceFor(['letter:the-wide-path:1']), { action: 'share', note: 'Mine' })).toBe('"' + W + '"\n\nMy note: Mine');
    expect(sharedText(W, null, { action: 'share', note: 'Mine' })).toBe(W + '\n\nMine');
  });
  it('defaults and unknown stored values', () => {
    expect(SHARE_ENDING_DEFAULTS).toEqual({ copyScripture: 'reference', copyLetters: 'link', shareScripture: 'reference', shareLetters: 'link' });
    expect(endingChoice({ copyScripture: 'bogus' }, 'copy', 'scripture')).toBe('reference');
    expect(endingChoice(null, 'share', 'letter')).toBe('link');
    expect(SCRIPTURE_CHOICES.map((o) => o.label)).toEqual(['Reference', 'Reference and translation', 'Reference and link', 'Nothing']);
    expect(LETTER_CHOICES.map((o) => o.label)).toEqual(['Link', 'Title and link', 'Full citation and link', 'Nothing']);
  });
});
