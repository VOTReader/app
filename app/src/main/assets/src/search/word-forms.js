/* ═══════════════════════════════════════════════════════════════════════
   search/word-forms.js — the other forms of a typed word (query side only)
   ═══════════════════════════════════════════════════════════════════════
   A literal term is searched exact + prefix, so it reaches only FORWARD:
   "flood" finds flooding, floods, flooded; "flooding" never finds flood.
   Measured on the shipped corpus (2026-09-26), typing the inflected form
   missed most of the family: "prayed" 397 of the 463 pray-family results,
   "repented" 889 of 921, "loving" 833 of 862, "flooding" 85 of 101, "wept"
   139 of 151.

   wordForms() names the rest of the family: strip one inflection to a base
   ("flooding" -> flood, "loving" -> love, "cried" -> cry, "sinned" -> sin),
   then inflect the base, the King James endings included (loveth, lovest,
   crieth), plus a short table of the strong verbs the Scriptures and the
   letters use (wept/weep, spake/spoke/speak, fled/flee...). The engine
   searches each form EXACTLY, never as a prefix (a prefix of "cry" is
   crystal), as a demoted unit under the typed word's origin, so the typed
   form's own hits still rank first and a form that is not in the index
   simply finds nothing. No index change: the index stays unstemmed.

   Deliberately conservative: one strip, no -er/-ness/-ly (a sinner is not
   to sin, earnest is not earn), bases under three letters dropped, stop
   words never produced.
   ═══════════════════════════════════════════════════════════════════════ */

/* Strong verbs: base -> its irregular forms. Both directions are looked up,
   so "wept" reaches weep and "weep" reaches wept. Left out on purpose, for the
   other word each form also is: ground (grind), left (leave), lay (lie), tore
   (tear, of weeping), born (bear, of animals). */
const IRREGULAR = {
  weep: ['wept'], flee: ['fled'], speak: ['spake', 'spoke', 'spoken'], give: ['gave', 'given'],
  take: ['took', 'taken'], forsake: ['forsook', 'forsaken'], shake: ['shook', 'shaken'],
  eat: ['ate', 'eaten'], fall: ['fell', 'fallen'], rise: ['rose', 'risen'], arise: ['arose', 'arisen'],
  write: ['wrote', 'written'], smite: ['smote', 'smitten'], drive: ['drove', 'driven'],
  choose: ['chose', 'chosen'], forget: ['forgot', 'forgotten'], forgive: ['forgave', 'forgiven'],
  know: ['knew', 'known'], grow: ['grew', 'grown'], throw: ['threw', 'thrown'], blow: ['blew', 'blown'],
  slay: ['slew', 'slain'], see: ['saw', 'seen'], bear: ['bore', 'borne'], swear: ['swore', 'sworn'],
  wear: ['wore', 'worn'], break: ['broke', 'broken', 'brake'], wake: ['woke', 'woken'],
  sing: ['sang', 'sung'], drink: ['drank', 'drunk'], begin: ['began', 'begun'], run: ['ran'],
  come: ['came'], become: ['became'], sit: ['sat'], stand: ['stood'], understand: ['understood'],
  teach: ['taught'], seek: ['sought'], bring: ['brought'], think: ['thought'], buy: ['bought'],
  fight: ['fought'], catch: ['caught'], sell: ['sold'], tell: ['told'], hold: ['held'], feed: ['fed'],
  lead: ['led'], bleed: ['bled'], meet: ['met'], keep: ['kept'], sleep: ['slept'], sweep: ['swept'],
  feel: ['felt'], build: ['built'], send: ['sent'], spend: ['spent'], bend: ['bent'],
  lose: ['lost'], hide: ['hid', 'hidden'], ride: ['rode', 'ridden'], strive: ['strove', 'striven'],
  hear: ['heard'], find: ['found'], bind: ['bound'], win: ['won'], shine: ['shone'],
  draw: ['drew', 'drawn'], fly: ['flew', 'flown'], sink: ['sank', 'sunk'],
  cling: ['clung'], sting: ['stung'], swing: ['swung'], strike: ['struck'], dig: ['dug'], spin: ['spun'],
};
const IRREGULAR_BASE = (() => {
  const m = Object.create(null);
  for (const base in IRREGULAR) for (const f of IRREGULAR[base]) (m[f] = m[f] || []).push(base);
  return m;
})();

/* A strip that lands on a different word: evening is not to even, bring not bre. */
const NOT_A_BASE = new Set(['even', 'bre']);

const VOWEL = /[aeiou]/;
/** A short closed syllable whose last consonant doubles before an ending: sin -> sinned. */
function doubles(b) {
  const n = b.length;
  return n >= 3 && n <= 4 && !VOWEL.test(b[n - 1]) && !/[wxy]/.test(b[n - 1]) && VOWEL.test(b[n - 2]) && !VOWEL.test(b[n - 3]);
}

/** Candidate bases: the word with one inflection stripped. */
function bases(w) {
  const out = [];
  const n = w.length;
  const add = (b) => { if (b && b.length >= 3 && b !== w) out.push(b); };
  const stem = (s) => {
    add(s);
    add(s + 'e');
    // sinned -> sinn -> sin: a doubled CONSONANT, never "ll"/"ss" (called -> call
    // stays whole) and never a vowel (fleeing -> flee, not fle)
    const c = s[s.length - 1];
    if (s.length >= 4 && c === s[s.length - 2] && !VOWEL.test(c) && !/[lsz]/.test(c)) add(s.slice(0, -1));
  };
  if (n >= 5 && (w.endsWith('ies') || w.endsWith('ied'))) add(w.slice(0, -3) + 'y');
  else if (n >= 6 && w.endsWith('ieth')) add(w.slice(0, -4) + 'y');
  if (n >= 5 && w.endsWith('ing')) stem(w.slice(0, -3));
  if (n >= 6 && (w.endsWith('eth') || w.endsWith('est'))) stem(w.slice(0, -3));
  if (n >= 5 && w.endsWith('ed') && !w.endsWith('ied')) stem(w.slice(0, -2));
  if (n >= 5 && w.endsWith('es') && !w.endsWith('ies')) add(w.slice(0, -2));
  if (n >= 4 && w.endsWith('s') && !/(ss|us|is)$/.test(w)) add(w.slice(0, -1));
  if (IRREGULAR_BASE[w]) for (const b of IRREGULAR_BASE[w]) out.push(b);
  return out;
}

/** Every inflection of a base, King James endings included. */
function inflect(b) {
  const last = b[b.length - 1];
  const out = [b, b + 's'];
  if (last === 'e') {
    // love: loves loved loving loveth lovest; see / flee: seeing, never "seed"
    out.push(b + 'th', b + 'st');
    if (b.endsWith('ee')) out.push(b + 'ing');
    else out.push(b + 'd', b.slice(0, -1) + 'ing');
  } else {
    out.push(b + 'ed', b + 'ing', b + 'eth', b + 'est');
    if (/(s|x|z|ch|sh)$/.test(b)) out.push(b + 'es');
    if (last === 'y' && !VOWEL.test(b[b.length - 2] || '')) {
      const s = b.slice(0, -1);
      out.push(s + 'ies', s + 'ied', s + 'ieth', s + 'iest');
    }
    if (doubles(b)) {
      const d = b + last;
      out.push(d + 'ed', d + 'ing', d + 'eth', d + 'est');
    }
  }
  if (IRREGULAR[b]) out.push(...IRREGULAR[b]);
  return out;
}

/**
 * The other forms of a typed word worth searching exactly: its family, minus the
 * word itself, minus every form its own prefix search already reaches (a form
 * that starts with the word), minus stop words. Lowercase in, lowercase out;
 * the caller hands in a kjvEncode'd single token.
 * @param {string} word
 * @param {(w: string) => boolean} [isStop]
 * @returns {string[]}
 */
export function wordForms(word, isStop) {
  const w = String(word || '').toLowerCase();
  if (w.length < 3 || !/^[a-z]+$/.test(w)) return [];
  if (isStop && isStop(w)) return [];
  const out = [];
  const seen = new Set([w]);
  const push = (f) => {
    if (seen.has(f) || f.startsWith(w) || f.length < 3 || (isStop && isStop(f))) return;
    seen.add(f);
    out.push(f);
  };
  // The word as a base too: "weep" reaches wept, "sin" reaches sinned.
  for (const f of inflect(w)) push(f);
  for (const b of bases(w)) {
    if (NOT_A_BASE.has(b) || (isStop && isStop(b))) continue;
    for (const f of inflect(b)) push(f);
  }
  return out;
}
