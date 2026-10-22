// The tri bench's prose filter (tri/prose-filter.mjs): which candidate lines make-tri.mjs never draws (search200, 2026-10-18).
// The lines are made up in the shapes the corpus sweep found, not copied from it.
import { describe, it, expect } from 'vitest';
import { nonProse, stripLead, titleCaseShare, upperShare, references, RULES } from './prose-filter.mjs';

const rule = (text, ctx) => nonProse(text, ctx);

describe('prose filter: what is not prose', () => {
  it('sign-off: a closing block, or a line opening "Says The ..."', () => {
    expect(rule('For I am the Maker of all, and My word does not fail.', { type: 'closing', whole: true })).toBe('sign-off');
    expect(rule('Says The Holy One, the Maker of heaven and of the deep sea.', { whole: true })).toBe('sign-off');
  });
  it('link: PDF, download and web lines', () => {
    expect(rule('FREE PDF download available, here > The Long Walk Home - A Study', { whole: true })).toBe('link');
    expect(rule('*NOTE: The file may take a few moments to download, depending on your browser speed.')).toBe('link');
    expect(rule('Read the whole account on our website at www.example.org for the rest of the story.')).toBe('link');
  });
  it('footer: copyright, sharing and lines about the page', () => {
    expect(rule('Copyright 2010, all rights reserved by the keepers of this small archive.')).toBe('footer');
    expect(rule('Please see the chart, at the end of this study, for more understanding.')).toBe('footer');
    expect(rule('• Please share these pages with everyone you know - BE PART OF THE WORK', { whole: true })).toBe('footer');
  });
  it("note: an editor's note or a line opening on an asterisk", () => {
    expect(rule('*This fire is not burning today, as the next verses show us plainly.')).toBe('note');
    expect(rule('Note: As he said the words, he walked out into the bright light.')).toBe('note');
    expect(rule("Translator's explanation of the three chapters which concern the river:", { whole: true })).toBe('note');
  });
  it('glossary: a word and its meaning or its language', () => {
    expect(rule('- Wander – Hebrew: Nuwd - to move, to flee, to stray about.', { whole: true })).toBe('glossary');
    expect(rule('- Concordance: To destroy, to cause to perish, to blot out', { whole: true })).toBe('glossary');
    expect(rule("Please take note of these words in Strong's numbering, which lists every word.")).toBe('glossary');
    expect(rule('That is because the word "are" is not in the Greek manuscripts at all.')).toBe('glossary');
    expect(rule('Elijah[2] means: "My God Is Yah", "Yah Is God", "The Lord Is God", etc.')).toBe('glossary');
  });
  it('source: where a passage comes from', () => {
    expect(rule('(From “The River That Runs Through the Valley of Stones”)')).toBe('source');
    expect(rule('Excerpt from: The Long Walk Home and the Morning After It', { whole: true })).toBe('source');
  });
  it('references: mostly Bible references, or opening on one', () => {
    expect(rule('See also Genesis 1:1, John 1:1-3, Hebrews 11:3 and Psalm 33:6.')).toBe('references');
    expect(rule('- Exodus 20:11 Therefore the people shall keep the day throughout their generations.')).toBe('references');
    expect(rule('14:11 (from #3 above) would be more accurately translated as follows:')).toBe('references');
    expect(rule('Therefore if you seek the river, let these go their way to it,” – Mark 4:41-46; John 8:1-8')).toBe('references');
  });
  it('cross-ref: mostly the name of another writing', () => {
    expect(rule('(An excerpt from "The Lamp and the Field" - Volume Four)')).toBe('cross-ref');
    expect(rule('The Lord’s Rebuke - “The Generation of the Long Night”)')).toBe('cross-ref');
  });
  it('outline: a lettered or numbered point', () => {
    expect(rule('b) The traveller has knowledge of his family at home', { whole: true })).toBe('outline');
    expect(rule('2) “And they came to the river and crossed it in the night, every one.')).toBe('outline');
  });
  it('heading: no sentence end and Title Case, or a short whole block with no end', () => {
    expect(rule('Workers in the Field of the Long Harvest', { whole: true })).toBe('heading');
    expect(rule('A Completion of Your Trust, the Strengthening of Your Faith', { whole: false })).toBe('heading');
    expect(rule('The rain fell on the town and the river rose by night', { whole: true })).toBe('heading');
    expect(rule('Anything at all in a heading block, even with an end.', { type: 'heading' })).toBe('heading');
  });
  it('all-caps: a banner in capitals with no sentence end', () => {
    expect(rule('REGARDING THE KEEPING OF THE SEVEN FEASTS OF THE YEAR', { whole: true })).toBe('all-caps');
    expect(rule('THE LAMP AND THE FIELD AND THE RIVER, A STUDY IN THREE PARTS')).toBe('all-caps');
  });
});

describe('prose filter: what is prose', () => {
  const prose = [
    ['For I am coming quickly, and My reward is with Me, to give to every one.', {}],
    ['- Brother against brother, nation against nation, every man against his neighbor!', {}],
    // a lead-in that ends on a colon is a sentence going on in the next block, not a heading
    ['Therefore, this is how you shall know the children of the light:', { type: 'poetry', whole: true }],
    ['Even so, blessed are all those who call on the name Of The Lord in that day, for as it is written:', { whole: true }],
    // capitals of reverence and one shouted phrase do not make a heading or an all-caps line
    ['For I tell you the truth, I AM HE who was and is, and My Word does not change.', {}],
    // a shouted sentence is the text itself, in capitals for emphasis
    ['WOE TO ALL WHO REFUSE TO HEAR THE CALL OF THE WATCHMEN!', { whole: true }],
    ['Behold, even some among this little flock shall fall away, saying, “Where is the promise?”', {}],
    ['In Leviticus 23:5-6, the feast begins at evening, and is kept for the seven days following.', {}],
    ['Yet they will also declare that which you have not heard (nor have you understood it).', {}],
    ['Lord, may we still give gifts to our loved ones, as long as it is not on the 25th?', { whole: true }],
  ];
  for (const [t, ctx] of prose) it(t.slice(0, 50), () => expect(rule(t, ctx)).toBe(null));
});

describe('prose filter: helpers', () => {
  it('stripLead drops speaker tags, quoted formula openers and question labels, and keeps a suffix', () => {
    const cases = [
      ['[The Lord answered] My son, why ask of Me such things?', 'My son, why ask of Me such things?'],
      ['"Thus says The Lord God: Peoples of the earth, hear Me!', 'Peoples of the earth, hear Me!'],
      ['For thus declares The Lord: As you have sown, so shall you reap!', 'As you have sown, so shall you reap!'],
      ['Question asked by Timothy: Lord, can You help me understand?', 'Lord, can You help me understand?'],
      ['"[A sister in Christ] I choose You now, Lord!', 'I choose You now, Lord!'],
      ['Answer: Those who have died are sleeping, awaiting the morning.', 'Those who have died are sleeping, awaiting the morning.'],
      ['Thus says The Lord, and it is done.', 'Thus says The Lord, and it is done.'],
    ];
    for (const [a, b] of cases) { expect(stripLead(a)).toBe(b); expect(a.endsWith(stripLead(a))).toBe(true); }
  });
  it('titleCaseShare, upperShare, references', () => {
    expect(titleCaseShare('Workers in the Field of the Long Harvest')).toBe(1);
    expect(titleCaseShare('the rain fell on the town')).toBe(0);
    expect(upperShare('SHALL I NOT PUNISH YOU?')).toBe(1);
    expect(upperShare('short')).toBe(0);
    expect(references('John 3:16 and 1 John 4:8-10')).toEqual({ n: 2, rest: 0 });
  });
  it('every rule has a name in RULES', () => expect(RULES.length).toBe(new Set(RULES).size));
});
