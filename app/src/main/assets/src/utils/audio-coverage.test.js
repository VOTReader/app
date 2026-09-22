// @ts-nocheck -- classic-global manifests are installed on globalThis here.
import { afterEach, describe, expect, it } from 'vitest';
import {
  COVERAGE_LISTENING_ONLY, COVERAGE_NONE, COVERAGE_READ_ALONG,
  bibleEditionCoverage, coverageCopy, studyCoverage, studyCoverageDetail,
} from './audio-coverage.js';

afterEach(() => {
  delete globalThis.BIBLE_AUDIO_MANIFEST;
  delete globalThis.AUDIO_MANIFEST;
});

describe('bibleEditionCoverage -- an edition is read-along unless it says otherwise', () => {
  it('reads a timed edition as read-along', () => {
    globalThis.BIBLE_AUDIO_MANIFEST = { 'bible-brm-kjv:genesis': [['g', '']] };
    expect(bibleEditionCoverage('bible-brm-kjv')).toBe(COVERAGE_READ_ALONG);
  });

  it('reads the John film (timed: false in the registry) as listening only', () => {
    globalThis.BIBLE_AUDIO_MANIFEST = { 'bible-john-film:john': [['j', '']] };
    expect(bibleEditionCoverage('bible-john-film')).toBe(COVERAGE_LISTENING_ONLY);
  });

  it('reads an edition with no manifest row as no recording, and never throws without a manifest', () => {
    globalThis.BIBLE_AUDIO_MANIFEST = { 'bible-brm-kjv:genesis': [['g', '']] };
    expect(bibleEditionCoverage('bible-tsot-matthew')).toBe(COVERAGE_NONE);
    delete globalThis.BIBLE_AUDIO_MANIFEST;
    expect(bibleEditionCoverage('bible-brm-kjv')).toBe(COVERAGE_NONE);
  });

  it('matches the volKey whole, not by prefix', () => {
    globalThis.BIBLE_AUDIO_MANIFEST = { 'bible-brm-kjv-extra:genesis': [['g', '']] };
    expect(bibleEditionCoverage('bible-brm-kjv')).toBe(COVERAGE_NONE);
  });
});

describe('studyCoverage -- counted, not guessed', () => {
  const lambShaped = {
    id: 'lamb-of-god',
    prefaceId: 'lamb-of-god-ch0',
    parts: [{ num: 1, chapterIds: ['lamb-of-god-ch1', 'lamb-of-god-ch2'] }],
  };

  it('counts the recorded chapters of a partly recorded study', () => {
    globalThis.AUDIO_MANIFEST = {
      'study:lamb-of-god-ch1': [['a', 'V']],
      'study:lamb-of-god-ch2': [['b', 'V']],
    };
    const cov = studyCoverage(lambShaped);
    expect(cov).toEqual({ state: COVERAGE_READ_ALONG, recorded: 2, total: 3 });
    expect(studyCoverageDetail(cov)).toBe('2 of 3 parts');
  });

  it('says no recording when the study has none (the 52 chapters the census counted)', () => {
    globalThis.AUDIO_MANIFEST = { 'study:purity-ch1': [['p', 'V']] };
    const cov = studyCoverage({ id: 'trinity', chapters: [{ id: 'trinity-ch1' }, { id: 'trinity-ch2' }] });
    expect(cov).toEqual({ state: COVERAGE_NONE, recorded: 0, total: 2 });
    expect(studyCoverageDetail(cov)).toBeNull();
  });

  it('prints no count when every chapter is recorded', () => {
    globalThis.AUDIO_MANIFEST = { 'study:purity-ch1': [['p', 'V']] };
    const cov = studyCoverage({ id: 'purity', chapters: [{ id: 'purity-ch1' }] });
    expect(cov.state).toBe(COVERAGE_READ_ALONG);
    expect(studyCoverageDetail(cov)).toBeNull();
  });

  it('survives a study whose corpus has not landed, and an empty manifest row', () => {
    expect(studyCoverage(undefined)).toEqual({ state: COVERAGE_NONE, recorded: 0, total: 0 });
    globalThis.AUDIO_MANIFEST = { 'study:purity-ch1': [] };
    expect(studyCoverage({ id: 'purity', chapters: [{ id: 'purity-ch1' }] }).state).toBe(COVERAGE_NONE);
  });
});

describe('studyCoverage -- the Matthew Study Bible is read along from the Bible editions', () => {
  it('reads the Matthew study as read-along when an edition ships the book, though it owns no study: keys', () => {
    // The Matthew Study Bible is a virtual study over the Matthew corpus
    // (use-bible-studies.js MATTHEW_CHAIN_ENTRY); its recording is the BIBLE
    // edition the reader picks in Settings, not a "study:" asset — so counting
    // study keys alone would call a read-along screen silent.
    globalThis.AUDIO_MANIFEST = {};
    globalThis.BIBLE_AUDIO_MANIFEST = { 'bible-tsot-matthew:matthew': [['m', 'B']] };
    const cov = studyCoverage({ id: 'matthew-study', isMatthewStudy: true, chapters: [{ id: 'mt-1' }] });
    expect(cov.state).toBe(COVERAGE_READ_ALONG);
    expect(studyCoverageDetail(cov)).toBeNull();
  });

  it('says no recording for the Matthew study when no edition ships the book', () => {
    globalThis.BIBLE_AUDIO_MANIFEST = { 'bible-brm-kjv:genesis': [['g', '']] };
    expect(studyCoverage({ id: 'matthew-study', isMatthewStudy: true, chapters: [{ id: 'mt-1' }] }).state).toBe(COVERAGE_NONE);
  });
});

describe('coverageCopy -- every state wears words', () => {
  it('names each state and falls back to no recording', () => {
    expect(coverageCopy(COVERAGE_READ_ALONG).label).toBe('Read-along');
    expect(coverageCopy(COVERAGE_LISTENING_ONLY).label).toBe('Listening only');
    expect(coverageCopy(COVERAGE_NONE).label).toBe('No recording');
    expect(coverageCopy('nonsense').label).toBe('No recording');
    for (const state of [COVERAGE_READ_ALONG, COVERAGE_LISTENING_ONLY, COVERAGE_NONE]) {
      expect(coverageCopy(state).title.length).toBeGreaterThan(10);
    }
  });
});
