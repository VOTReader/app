// @ts-nocheck
/**
 * The app never presents itself, or a page inside it, as the official website (Corbin 11-18 02:09, DECISIONS):
 * "It should NEVER look like it's portraying itself as the official website inside our app. Ever".
 * Every label the app writes over Answers' words, for every entry and every media and sister-site row, is free of
 * "official"; the site's own running text stays word for word (that is the browser walk's allowlist, not this file's).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { answersEyebrow, answersMediaLabel, answersMediaKindSub, answersRunTitle } from './answers-topic.js';
import { answersMediaTitle, answersMediaSource, answersMediaSub, answersSisterRow, answersPlaceOf } from './answers-browse.js';

const here = dirname(fileURLToPath(import.meta.url));
const ctx = {};
runInNewContext(readFileSync(resolve(here, '..', 'data', 'answers.js'), 'utf8') + ';this.SITE=ANSWERS_SITE_META;', ctx);
runInNewContext(readFileSync(resolve(here, '..', 'data', 'answers-meta.js'), 'utf8'), ctx);
const A = ctx.ANSWERS, M = ctx.ANSWERS_META, SITE = ctx.SITE;
const OFFICIAL = /official/i;

describe('the app never calls a page official', () => {
  it('answersEyebrow never says official, for any entry (the Main Page is "Introduction")', () => {
    expect(A.length).toBeGreaterThan(100);
    for (const e of A) expect(answersEyebrow(A, e).text, e.id).not.toMatch(OFFICIAL);
    expect(answersEyebrow(A, A.find((e) => e.id === 'answers-main-page')).text).toBe('Introduction');
  });

  it('no row name or place the app writes for an entry says official', () => {
    for (const e of A) {
      expect(answersRunTitle(e), e.id).not.toMatch(OFFICIAL);
      expect(answersPlaceOf(A, e.id), e.id).not.toMatch(OFFICIAL);
    }
  });

  it('every media row, on the Charts & videos page and at a topic\'s end, is free of "official"', () => {
    let channels = 0;
    for (const [id, meta] of Object.entries(M)) {
      for (const m of /** @type {any} */ (meta).media || []) {
        if (m.kind === 'channel') channels++;
        for (const s of [answersMediaTitle(m), answersMediaLabel(m), answersMediaKindSub(m), answersMediaSource(m), answersMediaSub(m, 'x')]) {
          expect(s, id + ' ' + m.title).not.toMatch(OFFICIAL);
        }
      }
    }
    // the site's two "OFFICIAL YOUTUBE CHANNEL" rows are there, and drawn plain
    expect(channels).toBeGreaterThanOrEqual(2);
    const ch = { kind: 'channel', title: 'OFFICIAL YOUTUBE CHANNEL', url: 'https://www.youtube.com/c/AnswersOnlyGodCanGive' };
    expect(answersMediaTitle(ch)).toBe('YouTube channel');
    expect(answersMediaLabel(ch)).toBe('YouTube channel');
    expect(answersMediaKindSub(ch)).toBe('youtube.com/c/AnswersOnlyGodCanGive');
  });

  it('every sister-site row, its name, address and what a screen reader hears, is free of "official"', () => {
    expect(SITE.sisterSites.some((s) => OFFICIAL.test(s.label))).toBe(true); // the source says it; the rows do not
    for (const s of SITE.sisterSites) {
      const r = answersSisterRow(s);
      for (const v of [r.title, r.sub, r.label]) expect(v, s.label).not.toMatch(OFFICIAL);
    }
  });

  it('the site\'s "OFFICIAL WEBSITE" header (ANSWERS_SITE_META.mainHeader) is read by no code, so it is never drawn', () => {
    expect(SITE.mainHeader).toContain('OFFICIAL WEBSITE'); // kept: the data mirrors the source
    const root = resolve(here, '..');
    const hits = [];
    const walk = (dir) => {
      for (const n of readdirSync(dir)) {
        const p = join(dir, n);
        if (statSync(p).isDirectory()) { if (n !== 'data' && n !== 'node_modules') walk(p); continue; }
        if (!/\.(js|jsx|mjs)$/.test(n) || /\.test\.(js|jsx)$/.test(n)) continue;
        if (readFileSync(p, 'utf8').includes('mainHeader')) hits.push(p);
      }
    };
    walk(root);
    expect(hits).toEqual([]);
  });
});
