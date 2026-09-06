// @ts-nocheck — free-var globals via settings-harness (SettingsScreen takes no ES imports)
/* The Bible Audio picker describes an edition with an INTERNAL ID.
   ═══════════════════════════════════════════════════════════════════════
   SettingsScreen builds each option's description from the registry:

       desc: 'Per-chapter audiobook · ' + String(ed.translation || '').toUpperCase() + ' text'

   For three editions `translation` is a real translation code that
   TRANSLATION_OPTIONS carries, and the sentence reads correctly. For
   `tsot-matthew` it is `'vot-matthew'` — a MARKER, not a code — and the reader
   is shown "Per-chapter audiobook · VOT-MATTHEW text". Live since c48.

   ONE FIELD CARRYING TWO KINDS OF VALUE, which the picker cannot tell apart:
   it upper-cases whatever it finds. The fix is a POSITIVE match against
   TRANSLATION_OPTIONS — keep the clause when the code is one the app knows,
   drop it otherwise — so a future edition with a real code keeps its clause
   automatically and one with a marker falls through silently.

   NOT `translationLabel(ed.translation)`, and this is worth naming because it is
   the obvious reach: that helper falls back to the NKJV strings for an unknown
   code, so Matthew would be described as NKJV. A wrong answer in place of no
   answer, which is worse than the id.

   These cases open the real sheet and read the real option markup rather than
   testing the expression, because the defect is what the READER is shown.
*/
import { describe, it, expect, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, cleanup } from '@testing-library/react';
import {
  setupSettingsGlobals, teardownSettingsGlobals, renderSettings,
} from './settings-harness.jsx';

/** The four shipped editions, verbatim from utils/audio-track.js. */
const REAL_EDITIONS = {
  'brm-kjv': { label: 'KJV · Biblical Restoration Ministries', short: 'KJV · BRM', translation: 'kjv', volKey: 'bible-brm-kjv', assetPrefix: 'brm', books: 'all' },
  'wop-nkjv': { label: 'NKJV · The Word of Promise (Dramatized)', short: 'NKJV · Dramatized', translation: 'nkjv', volKey: 'bible-wop-nkjv', assetPrefix: 'wop', books: 'all' },
  'web-ebible': { label: 'WEB · World English Bible', short: 'WEB', translation: 'web', volKey: 'bible-web', assetPrefix: 'web', books: 'all' },
  'tsot-matthew': { label: 'Matthew · The Sword of Truth (read by Benjamin)', short: 'Matthew · TSOT', translation: 'vot-matthew', volKey: 'bible-tsot-matthew', books: ['matthew'] },
};

/* The registry the app ships. Only the codes in here may reach the reader as
   "· X text"; anything else is an internal name. */
const TRANSLATION_OPTIONS = [
  { id: 'nkjv', label: 'NKJV' }, { id: 'kjv', label: 'KJV' },
  { id: 'web', label: 'WEB' }, { id: 'bsb', label: 'BSB' },
  { id: 'rkjv', label: 'KJV-R', base: 'kjv' },
];

function mount(editions) {
  setupSettingsGlobals({ BIBLE_AUDIO_EDITIONS: editions, TRANSLATION_OPTIONS });
  renderSettings({ bibleAudio: 'brm-kjv' });
}

/** Open the Bible Audio sheet and return every option as { label, desc }. */
async function options() {
  const trigger = [...document.querySelectorAll('.settings-select-trigger')]
    .find((b) => (b.getAttribute('aria-label') || '').indexOf('Bible Audio: ') === 0);
  expect(trigger, 'the Bible Audio field must be on screen — nothing below is about it otherwise').toBeTruthy();
  await act(async () => { trigger.click(); });
  const sheet = [...document.querySelectorAll('.select-sheet')].pop();
  expect(sheet, 'the option sheet must open').toBeTruthy();
  return [...sheet.querySelectorAll('.select-sheet-option')].map((b) => ({
    label: (b.querySelector('.select-sheet-option-label') || {}).textContent || '',
    desc: (b.querySelector('.select-sheet-option-desc') || {}).textContent || '',
  }));
}

const descOf = (list, label) => (list.find((o) => o.label === label) || {}).desc;

afterEach(() => { cleanup(); teardownSettingsGlobals(); });

/* THE ONE THING THE CASES BELOW CANNOT SEE, AND IT WOULD SHIP BROKEN.
   `const TRANSLATION_OPTIONS` at index.html:462 is a LEXICAL global. A `const`
   at the top level of a classic script goes into the global lexical
   environment, NOT onto `window` — nothing ever assigns it there, and every
   reader in the app uses the free-variable form
   (`typeof TRANSLATION_OPTIONS !== 'undefined'`, translations.js:36/52/207/220).

   `globalThis.TRANSLATION_OPTIONS` would therefore be `undefined` in the real
   app, no code would ever be recognised, and EVERY edition would lose its
   clause — while every behavioural case in this file stayed green, because the
   harness installs the registry as a `globalThis` property and a free-var read
   resolves to that too. Both forms pass the sheet cases. Only this one tells
   them apart, and it is a text gate because a module cannot create a lexical
   global to distinguish them with.

   AND THE CLASS THIS GUARDS IS EMPTY TODAY, WHICH IS NOT A REASON TO DELETE IT.
   Measured on this tree, with the scope stated because a zero is a claim about the
   search and not about the code: over the 45 names index.html declares with
   const/let/var at the top level of its classic scripts, all 300 non-test src/
   .js/.jsx files were searched for `window.<name>` / `globalThis.<name>`. ONE hit —
   ScreenLayout.jsx:60 — and it is a `//` comment saying why the bare-name form is
   required there. Zero in code. The control is alive: the same search over the 253
   test files finds 29, which IS the mechanism above — every harness installs its
   registry as a property, so the wrong read form resolves under vitest.

   So anyone who measures what this case catches will get zero, every time, until the
   day it matters — and on that day this is the only instrument that can see it. */
describe('the read form, which no rendered assertion here can distinguish', () => {
  const SRC = readFileSync(
    resolve(dirname(fileURLToPath(import.meta.url)), 'SettingsScreen.jsx'), 'utf8');

  it('CONTROL: the file really is the one that builds this picker', () => {
    /* A gate over a file it failed to read passes every "must not contain"
       assertion perfectly. */
    expect(SRC).toContain('BIBLE_AUDIO_EDITIONS');
    expect(SRC).toContain('Per-chapter audiobook');
  });

  it('reads TRANSLATION_OPTIONS as a free variable, never off globalThis or window', () => {
    expect(SRC).not.toContain('globalThis.TRANSLATION_OPTIONS');
    expect(SRC).not.toContain('window.TRANSLATION_OPTIONS');
    expect(SRC).toContain("typeof TRANSLATION_OPTIONS");
  });
});

describe('the Bible Audio picker never shows a reader an internal id', () => {
  it('PRECONDITION: the sheet lists every registry edition plus Off', async () => {
    /* If the sheet ever stopped rendering the registry, every case below would
       be about an empty list and all of them would pass. */
    mount(REAL_EDITIONS);
    const list = await options();
    expect(list.map((o) => o.label)).toEqual([
      'KJV · Biblical Restoration Ministries',
      'NKJV · The Word of Promise (Dramatized)',
      'WEB · World English Bible',
      'Matthew · The Sword of Truth (read by Benjamin)',
      'Off',
    ]);
  });

  it('THE READER-FACING CONSEQUENCE: Matthew is not described as VOT-MATTHEW', async () => {
    mount(REAL_EDITIONS);
    const desc = descOf(await options(), 'Matthew · The Sword of Truth (read by Benjamin)');
    expect(desc).not.toContain('VOT-MATTHEW');
    expect(desc).not.toContain('vot-matthew');
    expect(desc).toBe('Per-chapter audiobook');
  });

  it('CONTROL: an edition whose code the app KNOWS keeps its clause', async () => {
    /* The arm that fails if the clause is dropped unconditionally. Without it,
       "Matthew shows no code" is satisfied by a picker that shows none at all. */
    mount(REAL_EDITIONS);
    const list = await options();
    expect(descOf(list, 'KJV · Biblical Restoration Ministries')).toBe('Per-chapter audiobook · KJV text');
    expect(descOf(list, 'WEB · World English Bible')).toBe('Per-chapter audiobook · WEB text');
  });

  it('a FUTURE edition with an unknown code shows no clause either, without anyone editing this', async () => {
    /* The rule is a positive match against the registry, not a list of the ids
       that happen to be wrong today. John lands next and this is what says the
       fix covers it. */
    mount({
      ...REAL_EDITIONS,
      'planted-x': { label: 'Planted · X', short: 'X', translation: 'not-a-translation', volKey: 'bible-planted-x', books: ['john'] },
    });
    expect(descOf(await options(), 'Planted · X')).toBe('Per-chapter audiobook');
  });

  it('CONTROL: a future edition with a code the app DOES know keeps its clause', async () => {
    /* Same planted shape, real code — so the case above cannot be passing
       because a planted entry is treated specially. */
    mount({
      ...REAL_EDITIONS,
      'planted-bsb': { label: 'Planted · BSB', short: 'BSB', translation: 'bsb', volKey: 'bible-planted-bsb', books: ['john'] },
    });
    expect(descOf(await options(), 'Planted · BSB')).toBe('Per-chapter audiobook · BSB text');
  });

  it('and an edition with NO translation field at all is not described as "  text"', async () => {
    /* `String(undefined || '').toUpperCase()` is the empty string, so the old
       expression rendered "Per-chapter audiobook ·  text" — a dangling
       separator. Absence and an unknown code are the same answer here. */
    mount({ 'no-field': { label: 'No Field', short: 'NF', volKey: 'bible-no-field', books: 'all' } });
    expect(descOf(await options(), 'No Field')).toBe('Per-chapter audiobook');
  });
});
