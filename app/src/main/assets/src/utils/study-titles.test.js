/* How the study pages lay a title out (second studies pass, 2026-11-12): the
   real titles from data/bible-studies.js, so a new shape of title shows up
   here before it shows up on a phone. */
import { describe, it, expect } from 'vitest';
import { studyTitleParts, chapterTitleParts, studyNextStep } from './study-titles.js';

describe('studyTitleParts', () => {
  /** @type {Array<[string, string, { head: string, tail: string, extensive: boolean }]>} */
  const cases = [
    ['YAHUSHUA More Than a Man: YahuShua Is The Fulfillment of All Messianic Prophecy (Extensive Bible/Letter Study)', '',
      { head: 'YAHUSHUA More Than a Man', tail: 'YahuShua Is The Fulfillment of All Messianic Prophecy', extensive: true }],
    ['Purity - Bible/Letter Study', '', { head: 'Purity', tail: '', extensive: false }],
    ['Grace AND The Law (Bible/Letter Study)', '', { head: 'Grace AND The Law', tail: '', extensive: false }],
    ['Odds Chart - YahuShua Fulfills Over 200 Messianic Prophecies', '',
      { head: 'Odds Chart', tail: 'YahuShua Fulfills Over 200 Messianic Prophecies', extensive: false }],
    ['The State of the Dead and The Fate of the Wicked: The False Doctrine of Hell and Eternal Torment Exposed', '',
      { head: 'The State of the Dead and The Fate of the Wicked', tail: 'The False Doctrine of Hell and Eternal Torment Exposed', extensive: false }],
    ['The False Doctrine of "The Trinity" Exposed - The Holy Spirit is Not a Person', '',
      { head: 'The False Doctrine of "The Trinity" Exposed', tail: 'The Holy Spirit is Not a Person', extensive: false }],
    ['YahuShua The Messiah, The Lamb of God', 'The True Chronology of The Messiah’s Crucifixion and Resurrection',
      { head: 'YahuShua The Messiah, The Lamb of God', tail: 'The True Chronology of The Messiah’s Crucifixion and Resurrection', extensive: false }],
    ['The Volumes of Truth New Testament Study Bible - The Book of Matthew', '',
      { head: 'The Volumes of Truth New Testament Study Bible', tail: 'The Book of Matthew', extensive: false }],
  ];
  it.each(cases)('%s', (title, subtitle, want) => {
    expect(studyTitleParts(title, subtitle)).toEqual(want);
  });
  it('drops no word: the name, the rest and the tag make the title again', () => {
    for (const [title] of cases) {
      const { head, tail } = studyTitleParts(title, '');
      for (const word of (head + ' ' + tail).split(/\s+/).filter(Boolean)) expect(title).toContain(word);
      expect(title.startsWith(head)).toBe(true);
    }
  });
  it('a title with a second half and a subtitle keeps both; nothing in, nothing out', () => {
    expect(studyTitleParts('A: B', 'C')).toEqual({ head: 'A', tail: 'B · C', extensive: false });
    expect(studyTitleParts(undefined)).toEqual({ head: '', tail: '', extensive: false });
  });
  it('splits at whichever comes first, the colon or the dash', () => {
    expect(studyTitleParts('One - Two: Three').head).toBe('One');
    expect(studyTitleParts('One: Two - Three').head).toBe('One');
  });
});

describe('chapterTitleParts', () => {
  it('splits a short label off the front', () => {
    expect(chapterTitleParts('Section One: YahuShua The Messiah, God With Us')).toEqual({ over: 'Section One', name: 'YahuShua The Messiah, God With Us' });
    expect(chapterTitleParts('Q & A: What is the State of the Dead?')).toEqual({ over: 'Q & A', name: 'What is the State of the Dead?' });
  });
  it('leaves the study’s own name out of the label', () => {
    expect(chapterTitleParts('Purity Part One: Purity is Important to God', 'Purity')).toEqual({ over: 'Part One', name: 'Purity is Important to God' });
    expect(chapterTitleParts('Purity: The Call', 'Purity')).toEqual({ over: 'Purity', name: 'The Call' });
  });
  it('keeps a title whole when it has no short label before a colon', () => {
    for (const t of ['Preface', 'Do We Then Nullify The Law Through Faith?:', 'Let Us Hear the CONCLUSION of the Whole Matter:',
      'In Conclusion - "That, Which is Not of Me, is Against Me, and Comes From the Evil One, Says The Lord"',
      'The Entire Human Race Was on Death Row, But Capital Punishment is Annulled: In YahuShua']) {
      expect(chapterTitleParts(t)).toEqual({ over: '', name: t });
    }
  });
});

describe('studyNextStep', () => {
  const order = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const readSet = (...ids) => (ch) => ids.includes(ch.id);
  it('nothing read, nothing open: start at the first', () => {
    expect(studyNextStep(order, null, readSet())).toEqual({ k: 'Start here', ch: order[0] });
  });
  it('an open chapter that is not read: continue it', () => {
    expect(studyNextStep(order, 'b', readSet('a'))).toEqual({ k: 'Continue', ch: order[1] });
  });
  it('an open chapter that is read: the next unread one after it, else the first unread', () => {
    expect(studyNextStep(order, 'b', readSet('b'))).toEqual({ k: 'Up next', ch: order[2] });
    expect(studyNextStep(order, 'c', readSet('b', 'c'))).toEqual({ k: 'Up next', ch: order[0] });
  });
  it('some read and nothing open: the first unread', () => {
    expect(studyNextStep(order, null, readSet('a'))).toEqual({ k: 'Up next', ch: order[1] });
  });
  it('all read: read again from the start; an id the study no longer holds counts as none', () => {
    expect(studyNextStep(order, 'c', readSet('a', 'b', 'c'))).toEqual({ k: 'Read again', ch: order[0] });
    expect(studyNextStep(order, 'gone', readSet())).toEqual({ k: 'Start here', ch: order[0] });
    expect(studyNextStep([], null, readSet())).toBeNull();
  });
});
