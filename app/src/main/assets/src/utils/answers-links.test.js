// @ts-nocheck
/* answers-links — a letter's answersonlygodcangive.com rows open the topic in-app. */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { answersUrlKey, answersIdForUrl, answersLinkForUrl, openAnswersLink, ANSWERS_COLLECTION_LABEL } from './answers-links.js';
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
    expect(answersIdForUrl('https://answersonlygodcangive.com/Regarding_Pride')).toBe('regarding-pride');
    expect(answersLinkForUrl('https://answersonlygodcangive.com/No_Such_Page')).toBeNull();
  });

  it('resolves nearly every Related Topics row the letters carry', () => {
    const urls = [];
    for (const f of readdirSync(DATA).filter((n) => /^(volume-|letters-|lords-rebuke)/.test(n))) {
      const text = readFileSync(resolve(DATA, f), 'utf8');
      for (const m of text.matchAll(/"url":\s*"(https?:\/\/[^"]*answersonlygodcangive\.com[^"]*)"/g)) urls.push(m[1]);
    }
    const resolved = urls.filter((u) => answersLinkForUrl(u));
    expect(urls.length).toBeGreaterThan(1000);
    // The rest point at the site's Main Page anchors or its search.
    expect(resolved.length / urls.length).toBeGreaterThan(0.98);
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
