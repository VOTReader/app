/* ═══════════════════════════════════════════════════════════════════════
   answers-shelves — how the Answers landing page files its 121 topics
   ═══════════════════════════════════════════════════════════════════════
   Two shelves:

   ANSWERS_COMMANDMENTS — the Ten Commandments tablets. The TOPICS under each
   commandment are NOT listed here: answersonlygodcangive.com files them itself
   (entry.group "Commandment N", written by tools/fetch-answers.py), and
   answersCommandmentTopics reads that filing. Each row carries only its short
   tablet label and its verse, copied verbatim from the app's NKJV (books.js,
   Exodus 20) — answers-shelves.test.js holds every verse to that text.

   ANSWERS_SUBJECTS — the other 102 topics in nine subjects. THIS GROUPING IS
   THE APP'S, NOT THE SITE'S: the site files them only as "Thus Says The
   Lord…" (85), "Other Topics" (15), "False Doctrines" and "More Topics".
   Move a topic by moving its id; answers-shelves.test.js fails the build if a
   topic is placed twice, left out, or no longer exists in the data.
   ═══════════════════════════════════════════════════════════════════════ */

export const ANSWERS_COMMANDMENTS = Object.freeze([
  { n: 1, numeral: 'I', ordinal: 'First', label: 'No other gods', ref: 'Exodus 20:3', verse: '“You shall have no other gods before Me.' },
  { n: 2, numeral: 'II', ordinal: 'Second', label: 'No idols', ref: 'Exodus 20:4', verse: '“You shall not make for yourself a carved image—any likeness of anything that is in heaven above, or that is in the earth beneath, or that is in the water under the earth;' },
  { n: 3, numeral: 'III', ordinal: 'Third', label: 'His name in vain', ref: 'Exodus 20:7', verse: '“You shall not take the name of the LORD your God in vain, for the LORD will not hold him guiltless who takes His name in vain.' },
  { n: 4, numeral: 'IV', ordinal: 'Fourth', label: 'The Sabbath', ref: 'Exodus 20:8', verse: '“Remember the Sabbath day, to keep it holy.' },
  { n: 5, numeral: 'V', ordinal: 'Fifth', label: 'Honor parents', ref: 'Exodus 20:12', verse: '“Honor your father and your mother, that your days may be long upon the land which the LORD your God is giving you.' },
  { n: 6, numeral: 'VI', ordinal: 'Sixth', label: 'Do not murder', ref: 'Exodus 20:13', verse: '“You shall not murder.' },
  { n: 7, numeral: 'VII', ordinal: 'Seventh', label: 'No adultery', ref: 'Exodus 20:14', verse: '“You shall not commit adultery.' },
  { n: 8, numeral: 'VIII', ordinal: 'Eighth', label: 'Do not steal', ref: 'Exodus 20:15', verse: '“You shall not steal.' },
  { n: 9, numeral: 'IX', ordinal: 'Ninth', label: 'No false witness', ref: 'Exodus 20:16', verse: '“You shall not bear false witness against your neighbor.' },
  { n: 10, numeral: 'X', ordinal: 'Tenth', label: 'Do not covet', ref: 'Exodus 20:17', verse: '“You shall not covet your neighbor’s house; you shall not covet your neighbor’s wife, nor his male servant, nor his female servant, nor his ox, nor his donkey, nor anything that is your neighbor’s.”' },
]);

export const ANSWERS_SUBJECTS = Object.freeze([
  { id: 'the-lord-and-his-messiah', title: 'The Lord & His Messiah', topics: [
    'the-name-of-the-lord',
    'the-father-and-the-son-are-one',
    'the-messiah',
    'the-way-the-truth-the-life',
    'i-am-the-lord-i-do-not-change',
    'regarding-the-voice-of-the-lord',
    'regarding-the-holy-spirit',
    'regarding-the-trinity',
    'regarding-sacred-names',
    'lamentations-from-the-lord',
    'regarding-the-crucifixion',
    'regarding-crucifying-the-messiah-in-your-heart',
    'regarding-who-killed-the-messiah',
  ] },
  { id: 'his-word-and-his-prophets', title: 'His Word & His Prophets', topics: [
    'answers-the-volumes-of-truth',
    'regarding-prophets-true',
    'regarding-spiritual-gifts',
    'parables',
    'visions',
    'regarding-scoffers',
    'regarding-the-book-of-ezekiel',
    'regarding-the-apostle-paul',
    'regarding-judas-iscariot',
    'regarding-noah-ham-and-canaan-genesis-9-20-27',
  ] },
  { id: 'sin-repentance-and-salvation', title: 'Sin, Repentance & Salvation', topics: [
    'regarding-what-is-an-abomination-to-the-lord',
    'regarding-sin',
    'regarding-true-repentance',
    'regarding-forgiveness',
    'regarding-unforgiveness',
    'regarding-being-born-again',
    'regarding-salvation',
    'regarding-baptism',
  ] },
  { id: 'walking-with-god', title: 'Walking With God', topics: [
    'regarding-faith',
    'regarding-doubt',
    'regarding-patience',
    'regarding-prayer',
    'regarding-fasting',
    'regarding-obedience',
    'regarding-staying-separate',
    'regarding-pride',
    'regarding-healing',
    'regarding-spiritual-warfare',
    'regarding-demons',
    'regarding-the-ten-commandments',
    'regarding-the-holy-days-of-god',
    'regarding-tithing',
  ] },
  { id: 'churches-and-doctrines-of-men', title: 'Churches & Doctrines of Men', topics: [
    'regarding-the-churches-of-men',
    'regarding-the-catholic-church',
    'regarding-the-jehovahs-witnesses',
    'regarding-the-church-of-jesus-christ-of-latter-day-saints-mormons',
    'regarding-the-seventh-day-adventist-church',
    'regarding-the-united-church-of-god',
    'regarding-the-true-church',
    'i-am-calling-you-out',
    'false-doctrines-within-the-churches-of-men-regarding',
    'regarding-the-mistranslation-and-misinterpretation-of-the-scriptures',
    'regarding-adding-to-or-taking-away-from-the-word-of-god',
    'regarding-the-holidays-of-men',
    'regarding-prophets-false',
  ] },
  { id: 'the-end-of-this-age', title: 'The End of This Age', topics: [
    'the-coming-of-the-lord',
    'regarding-the-day-of-the-lord',
    'regarding-the-birth-pangs',
    'regarding-the-days-of-noah',
    'regarding-sodom-and-gomorrah-revived',
    'regarding-the-day-and-hour-unknown',
    'regarding-the-gathering-up-rapture',
    'regarding-the-first-and-second-harvest',
    'regarding-the-end-sign',
    'regarding-the-antichrist',
    'regarding-the-mark-of-the-beast',
    'regarding-the-144-000-witnesses',
    'regarding-the-two-witnesses',
    'nature-shall-rise-up-and-fight-against-this-generation',
    'new-heights-in-wickedness',
    'regarding-worldly-suffering',
    'the-one-who-stays-lets',
  ] },
  { id: 'death-judgment-and-the-kingdom', title: 'Death, Judgment & The Kingdom', topics: [
    'woe-to-those-who',
    'regarding-hell-and-eternal-torment',
    'regarding-the-first-death',
    'regarding-the-second-death',
    'regarding-the-final-judgment',
    'regarding-the-resurrection',
    'regarding-the-first-and-second-resurrection',
    'regarding-the-ascension-and-the-blessed-hope',
    'regarding-the-kingdom-and-heaven',
    'regarding-pets-in-the-kingdom',
    'regarding-childrens-inheritance-on-earth-and-in-heaven',
  ] },
  { id: 'the-nations-and-creation', title: 'The Nations & Creation', topics: [
    'regarding-the-united-states',
    'regarding-israel',
    'regarding-africa',
    'regarding-the-olympics',
    'come-out-and-fight-against-me',
    'regarding-pollution-and-mankinds-exploitation-of-the-earth',
    'regarding-creation',
    'regarding-science',
    'regarding-dinosaurs',
    'regarding-the-flat-earth-theory',
  ] },
  { id: 'marriage-family-and-body', title: 'Marriage, Family & Body', topics: [
    'regarding-marriage',
    'regarding-parenting',
    'regarding-sex',
    'regarding-homosexuality',
    'regarding-health',
    'regarding-the-wearing-of-jewelry',
  ] },

]);

const SUBJECT_BY_ID = new Map(ANSWERS_SUBJECTS.map((s) => [s.id, s]));

/** A subject row by id, or null (a saved tab can name one this build dropped). */
export function answersSubjectById(id) { return SUBJECT_BY_ID.get(id) || null; }

const SUBJECT_OF_TOPIC = new Map();
ANSWERS_SUBJECTS.forEach((s) => s.topics.forEach((id) => SUBJECT_OF_TOPIC.set(id, s)));

/** Where a topic is filed: "Commandment IV", its subject's title, or '' for neither. */
export function answersFiledUnder(entry) {
  const m = entry && /^Commandment (\d+)$/.exec(entry.group || '');
  if (m) {
    const c = ANSWERS_COMMANDMENTS.find((r) => r.n === Number(m[1]));
    return c ? 'Commandment ' + c.numeral : entry.group;
  }
  const s = entry && SUBJECT_OF_TOPIC.get(entry.id);
  return s ? s.title : '';
}

/** The site's own filing for one commandment, in the site's order. */
export function answersCommandmentTopics(entries, n) {
  const group = 'Commandment ' + n;
  return (entries || []).filter((e) => e && e.group === group);
}

/** Passages in a topic = its "~ [From …]" attribution lines (0 for a page of prose). */
export function answersPassageCount(entry) {
  const paras = (entry && entry.paragraphs) || [];
  let n = 0;
  for (let i = 0; i < paras.length; i++) if (isAttribution(paras[i] && paras[i].text)) n++;
  return n;
}

export function isAttribution(text) {
  return typeof text === 'string' && /^~ \[From /.test(text);
}

/**
 * A list label: the site's lead-in dropped so a list reads by subject —
 * "Regarding Pride" → "Pride", "God Speaks About The Sabbath" → "The Sabbath".
 * Only a leading phrase is removed; the rest is the site's title, untouched.
 * The topic page itself always shows the full title.
 */
export function answersShortTitle(title) {
  let t = String(title || '');
  t = t.replace(/^Thus Says The Lord Regarding /, '')
    .replace(/^God Speaks (?:About|Regarding) /, '')
    .replace(/^God Rebukes /, '')
    .replace(/^Regarding /, '');
  if (/^the /.test(t)) t = 'The ' + t.slice(4);
  return t;
}

/** A–Z order ignores a leading "The" / "A"; numbers file under "#". */
export function answersSortKey(title) {
  return answersShortTitle(title).replace(/^(?:The|A) /, '').replace(/^["'“‘]/, '');
}

export function answersIndexLetter(title) {
  const c = answersSortKey(title).charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
}
