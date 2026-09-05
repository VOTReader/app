/**
 * VOTReader data schema validators (Formats A-E + cross-reference)
 *
 * Validates every structured data shape under src/data/:
 *   A  letters         volumes 1-7, Lord's Rebuke, Flock, Timothy, Hidden Manna
 *   B  WTLB / Blessed  simple paragraph entries
 *   C  Bible books     books.js, matthew-plain.js, books-restored.js (chrome)
 *   D  Bible Studies   bible-studies.js
 *   E  translations    bible-*.js verse maps; matthew.js Study Bible;
 *                      matthew-nkjv.js ref->text dict
 *   + cross-reference  Format C verse counts vs the complete KJV
 *
 * Usage:
 *   node tools/validate-schemas.js [--strict] [--report-only]
 *   Exits 1 on any error; --report-only prints the totals and exits 0 instead.
 *
 * Exports: validateFormatA / validateFormatB / validateHolyDays /
 *   validateFormatC / validateFormatD / validateAgainstReference /
 *   validateTranslationMap / validateScriptureDict / validateStudyBible
 *   — each => { errors: string[], warnings: string[] }.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { createContext, runInNewContext } from 'vm';
import { resolve, basename } from 'path';
import { fileURLToPath } from 'url';
import { parseRefRange, splitIntoVerses } from '../app/src/main/assets/src/utils/scripture-parse.js';
import { COLLECTIONS, parseRefStr, findBook, splitCompoundRef } from '../app/src/main/assets/src/data/scripture-resolution.js';
import { splitFormatBInline } from '../app/src/main/assets/src/utils/format-b-inline.js';
// The graph asset's delta runs — imported, never re-derived, so the gate can
// never drift from the encoder it is checking.
import { deltaRuns } from './scripture-web-lib.mjs';
// The SAME counting module the app ships (word-count.js) — the baseline gate
// and every in-app display derive from one definition, so they cannot drift.
import { countItemWords } from '../app/src/main/assets/src/utils/word-count.js';

// Consume Format B inline markup the SAME way WtlbEntryView.renderLine does
// (same splitter → no drift), returning the VISIBLE text. A leftover `_` or `**`
// in that result means a marker that won't pair — it would render literally on
// screen (the cross-newline-underscore class of bug). Recurses for nested
// **bold**/_italic_; ref/nav/attribution markers become chips, so they drop out.
function visibleFormatBText(text) {
  return splitFormatBInline(text).map((seg) => {
    if (!seg) return '';
    if (seg.startsWith('**') && seg.endsWith('**')) return visibleFormatBText(seg.slice(2, -2));
    if (seg.startsWith('_') && seg.endsWith('_')) return visibleFormatBText(seg.slice(1, -1));
    if (/^\{\{(?:ref|nav):/.test(seg) || /^\[From /.test(seg)) return '';
    return seg;
  }).join('');
}

// ── Blank-footnote guards (the 2026-07-19 owner report) ──────────
// A chapter-only scripture ref ("1 Kings 22") deliberately has NO nkjv dict
// entry — letter dicts never embed whole chapters; lookupVersesFromBooks
// resolves the full chapter from the bundled Bible at runtime. Existence of
// the book/chapter is enforced by the runner's Bible-ref resolution pass.
function isChapterOnlyRef(ref) {
  const p = parseRefStr(ref);
  return !!(p && p.verse == null);
}
// A note-type footnote whose entire text is a scripture reference renders as
// bare text — no verse content, no Go-to-Scripture — i.e. a blank sheet to the
// reader. Such footnotes must be type "scripture" so the verse pipeline runs.
const BARE_REF_SHAPE = /^[1-3]?\s?[A-Za-z. ']+\s\d+(:\d+([-,]\d+)*)?(\s*\(\w+\))?$/;
function isBareScriptureRef(text) {
  const t = String(text || '').trim();
  if (!t || t.length > 45 || !BARE_REF_SHAPE.test(t)) return false;
  return !!parseRefStr(t);
}

// ── Compound-ref completeness (the 2026-08-04 owner report) ──────
// "If 3 different passages from Revelation fall under one footnote ref, there
// must be a tap-through link for each one." Every surface that makes a ref
// tappable per-passage decomposes it with splitCompoundRef, so a chunk the
// splitter drops is a passage the reader cannot reach. An audit found 35 of
// the corpus's 66 compound refs lossy this way — 56 unreachable passages —
// because comma tails that spelled out their own book were never parsed.
// This gate keeps that closed: every `;`/`,` chunk that is ENTIRELY a
// reference (BARE_REF_SHAPE — so prose containing commas is not checked, and
// bookless numeric tails like ", 7" are covered by the splitter's own tests)
// must show up in the splitter's output.
const _norm = (s) => String(s).replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim();
function compoundRefGaps(ref) {
  if (typeof ref !== 'string' || !/[;,]/.test(ref)) return [];
  const parts = splitCompoundRef(ref).map((p) => _norm(p.ref));
  const gaps = [];
  for (const raw of ref.replace(/[–—]/g, '-').split(';').flatMap((s) => s.split(','))) {
    const chunk = raw.trim();
    // Entirely-a-reference AND carrying an explicit chapter:verse. The colon
    // requirement is the prose guard: BARE_REF_SHAPE alone also matches a
    // chapter-only phrase like "through the 144" (out of "…the 144,000…"),
    // which would flag a sentence as an unreachable passage. Every real
    // compound tail in the corpus is Book C:V.
    if (!chunk || !BARE_REF_SHAPE.test(chunk) || !/\d+\s*:\s*\d+/.test(chunk)) continue;
    if (!parts.includes(_norm(chunk))) gaps.push(chunk);
  }
  return gaps;
}

// ── CORP-2: cross-reference resolution ───────────────────────────
// The in-app letter registry (built at index.html runtime) keys every letter by
// `registryLabel + '::' + title`, and resolveVotLetter looks up `collection +
// '::' + letterTitle` from a cross-ref. A cross-ref whose `collection` is the
// DISPLAY label instead of the registryLabel silently fails to resolve — the
// CORP-1 dead "Also read" ("The Lord's Rebuke" vs "A Testament Against The World:
// The Lord's Rebuke"). The validator never checked this, so it shipped green.
// GLOBAL_TO_REGISTRY is the faithful registry-label map (off COLLECTIONS, the
// single source); walkLetterXrefs collects every structured cross-ref a letter
// carries; the runner registers all titles, then ERRORs on any that won't resolve.
const GLOBAL_TO_REGISTRY = new Map(COLLECTIONS.map((c) => [c.globalName, c.registryLabel]));
// A cross-ref is a VOT-LETTER link only when its `collection` names a real VOT
// collection (by registryLabel OR display label). Links whose collection is
// neither — e.g. a Bible-Study reference `{collection,letterTitle}` that is just
// a study title + an external `url` — resolve through a DIFFERENT path and are
// NOT checked here (else they false-positive). A display-label collection IS a
// VOT collection but the WRONG key — the CORP-1 class — and must fail.
const VOT_REGISTRY_LABELS = new Set(COLLECTIONS.map((c) => c.registryLabel));
const VOT_DISPLAY_LABELS = new Set(COLLECTIONS.map((c) => c.label));
// Casing- + apostrophe-insensitive registry, for catching near-miss labels:
// "A Testament Against the World..." (lowercase 'the'), "Words to Live By..."
// (lowercase 'to'), "Letters From Timothy", a curly apostrophe, etc. — which
// match neither the exact registryLabel nor the display label, but are clearly
// a mistyped registryLabel (the CORP-1 class).
const _normLabel = (s) => String(s).toLowerCase().replace(/[‘’ʼ]/g, "'");
const NORM_TO_REGISTRY = new Map(COLLECTIONS.map((c) => [_normLabel(c.registryLabel), c.registryLabel]));

/**
 * Recursively collect every letter-link segment's {collection, letterTitle}
 * anywhere in a nested structure — Format-D studies nest blocks several levels
 * deep, so a flat block/segment walk misses them.
 * @param {any} node
 * @param {Array<{collection:string, letterTitle:string, where:string}>} out
 */
function collectLetterLinksDeep(node, out) {
  if (Array.isArray(node)) { for (const x of node) collectLetterLinksDeep(x, out); return; }
  if (node && typeof node === 'object') {
    if (node.t === 'letter-link' && node.link && typeof node.link.collection === 'string' && typeof node.link.letterTitle === 'string') {
      out.push({ collection: node.link.collection, letterTitle: node.link.letterTitle, where: 'bible-studies letter-link' });
    }
    for (const k of Object.keys(node)) collectLetterLinksDeep(node[k], out);
  }
}

/**
 * Every (collection, letterTitle) cross-reference a letter carries: footnote
 * `seeAlso` / footnote `link` / `metaAddendumLink` / `letter-link` segments.
 * External (url-only) links are skipped — only internal letter targets resolve.
 * @param {any} letter
 * @returns {Array<{ collection: string, letterTitle: string, where: string }>}
 */
function walkLetterXrefs(letter) {
  /** @type {Array<{ collection: string, letterTitle: string, where: string }>} */
  const out = [];
  const push = (lnk, where) => {
    if (lnk && typeof lnk === 'object' && typeof lnk.collection === 'string' && typeof lnk.letterTitle === 'string') {
      out.push({ collection: lnk.collection, letterTitle: lnk.letterTitle, where });
    }
  };
  const fns = (letter && letter.footnotes && typeof letter.footnotes === 'object') ? letter.footnotes : {};
  for (const num of Object.keys(fns)) {
    const fn = fns[num];
    if (fn && fn.seeAlso) push(fn.seeAlso, `footnote ${num} seeAlso`);
    if (fn && fn.link) push(fn.link, `footnote ${num} link`);
  }
  if (letter && letter.metaAddendumLink) push(letter.metaAddendumLink, 'metaAddendumLink');
  const blocks = (letter && Array.isArray(letter.blocks)) ? letter.blocks : [];
  for (let bi = 0; bi < blocks.length; bi++) {
    const segs = blocks[bi] && Array.isArray(blocks[bi].segments) ? blocks[bi].segments : [];
    for (let si = 0; si < segs.length; si++) {
      if (segs[si] && segs[si].t === 'letter-link') push(segs[si].link, `block ${bi} letter-link`);
    }
  }
  return out;
}

// ── valid enum sets ──────────────────────────────────────────────

const VALID_BLOCK_TYPES = new Set([
  'para', 'poetry', 'closing', 'closing-fn', 'note', 'scripture', 'intro',
]);

const VALID_SEGMENT_TYPES = new Set([
  'text', 'italic', 'bold-italic', 'caps', 'fn', 'stanza-break', 'letter-link',
]);

// Footnote types
const VALID_FOOTNOTE_TYPES = new Set(['scripture', 'note']);

// Format B paragraph alignment
const VALID_ALIGN = new Set(['center', 'justify', 'left']);

// Holy Days entry types — the album is hybrid: each entry is either a
// Format A letter (type="letter") or a Format B entry (type="wtlb").
const VALID_HOLY_DAYS_TYPES = new Set(['wtlb', 'letter']);

// ── helpers ──────────────────────────────────────────────────────

function ctx(letterIdx, letterId) {
  return letterId ? `letter[${letterIdx}] "${letterId}"` : `letter[${letterIdx}]`;
}

/** Generic context label: `<noun>[<i>] "<id>"` (id optional). */
function ctxItem(noun, i, id) {
  return id ? `${noun}[${i}] "${id}"` : `${noun}[${i}]`;
}

// ── validateFormatA ──────────────────────────────────────────────

/**
 * @param {object[]} letters - array of Format A letter objects
 * @param {{ strict?: boolean, fileName?: string }} [opts]
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateFormatA(letters, opts = {}) {
  const errors = [];
  const warnings = [];
  const fileName = opts.fileName || '(unknown)';

  if (!Array.isArray(letters)) {
    errors.push(`${fileName}: expected an array, got ${typeof letters}`);
    return { errors, warnings };
  }

  const seenIds = new Set();   // CORP1 — catch duplicate slug ids (the likeliest regression)
  for (let i = 0; i < letters.length; i++) {
    const letter = letters[i];
    if (!letter || typeof letter !== 'object' || Array.isArray(letter)) {
      errors.push(`${fileName}: letter[${i}] is not a plain object`);
      continue;
    }

    const id = letter.id;
    const prefix = `${fileName}: ${ctx(i, id)}`;

    // ── required top-level fields ───────────────────────────────
    if (typeof id !== 'string' || id.length === 0) {
      errors.push(`${prefix}: missing or empty "id" (string)`);
    } else if (seenIds.has(id)) {
      errors.push(`${prefix}: CORP1 — duplicate "id" "${id}" (already used by an earlier entry; a slug collision misroutes nav / bookmarks / notes)`);
    } else {
      seenIds.add(id);
    }
    if (typeof letter.title !== 'string' || letter.title.length === 0) {
      errors.push(`${prefix}: missing or empty "title" (string)`);
    }
    if (!Array.isArray(letter.blocks)) {
      errors.push(`${prefix}: missing or non-array "blocks"`);
    }

    // footnotes + nkjv — required per letter (can be empty objects)
    const footnotes = letter.footnotes;
    const nkjv = letter.nkjv;
    if (!footnotes || typeof footnotes !== 'object' || Array.isArray(footnotes)) {
      errors.push(`${prefix}: missing or non-object "footnotes"`);
    }
    if (!nkjv || typeof nkjv !== 'object' || Array.isArray(nkjv)) {
      errors.push(`${prefix}: missing or non-object "nkjv"`);
    }

    // ── optional typed fields ───────────────────────────────────
    if (letter.num !== undefined && typeof letter.num !== 'number') {
      errors.push(`${prefix}: "num" must be a number if present`);
    }
    for (const optStr of ['date', 'audioUrl',
      'soundcloudUrl', 'videoVoiceUrl', 'videoMusicUrl',
      'metaAddendum', 'metaAddendumUrl', 'metaAddendumInternal']) {
      if (letter[optStr] !== undefined && typeof letter[optStr] !== 'string') {
        errors.push(`${prefix}: "${optStr}" must be a string if present`);
      }
    }
    // from / spoken / forLine / noteLine may be a plain string OR a segments
    // array — a header line can carry a footnote bubble (e.g. The Shadow of The
    // Almighty's attribution "The Interpretation of the Vision Given to Timothy[1]",
    // or Death and Awakening's "(Regarding the state of the dead[1])").
    for (const optMeta of ['from', 'spoken', 'forLine', 'noteLine']) {
      if (letter[optMeta] !== undefined && typeof letter[optMeta] !== 'string' && !Array.isArray(letter[optMeta])) {
        errors.push(`${prefix}: "${optMeta}" must be a string or a segments array if present`);
      }
    }

    // relatedTopics
    if (letter.relatedTopics !== undefined) {
      if (!Array.isArray(letter.relatedTopics)) {
        errors.push(`${prefix}: "relatedTopics" must be an array if present`);
      } else {
        for (let ri = 0; ri < letter.relatedTopics.length; ri++) {
          const rt = letter.relatedTopics[ri];
          if (!rt || typeof rt.label !== 'string') {
            errors.push(`${prefix}: relatedTopics[${ri}] missing "label" (string)`);
          }
          if (!rt || typeof rt.url !== 'string') {
            errors.push(`${prefix}: relatedTopics[${ri}] missing "url" (string)`);
          }
        }
      }
    }

    // prevLetter / nextLetter
    validateNavLink(letter.prevLetter, 'prevLetter', prefix, errors);
    validateNavLink(letter.nextLetter, 'nextLetter', prefix, errors);

    // ── blocks ──────────────────────────────────────────────────
    const fnRefsUsed = new Set();

    if (Array.isArray(letter.blocks)) {
      for (let bi = 0; bi < letter.blocks.length; bi++) {
        const block = letter.blocks[bi];
        const bp = `${prefix} block[${bi}]`;

        if (!block || typeof block !== 'object') {
          errors.push(`${bp}: not an object`);
          continue;
        }

        if (!VALID_BLOCK_TYPES.has(block.type)) {
          errors.push(`${bp}: invalid block type "${block.type}"`);
          continue;
        }

        switch (block.type) {
          case 'para':
          case 'closing-fn':
          case 'intro':
            if (!Array.isArray(block.segments)) {
              errors.push(`${bp}: type="${block.type}" requires "segments" array`);
            } else {
              validateSegments(block.segments, bp, errors, fnRefsUsed);
            }
            break;

          case 'poetry':
            if (!Array.isArray(block.lines)) {
              errors.push(`${bp}: type="poetry" requires "lines" array`);
            } else {
              for (let li = 0; li < block.lines.length; li++) {
                const line = block.lines[li];
                if (!Array.isArray(line)) {
                  errors.push(`${bp} lines[${li}]: must be an array`);
                } else {
                  validateSegments(line, `${bp} lines[${li}]`, errors, fnRefsUsed);
                }
              }
            }
            break;

          case 'closing':
          case 'note':
            if (typeof block.text !== 'string') {
              errors.push(`${bp}: type="${block.type}" requires "text" (string)`);
            }
            break;

          case 'scripture':
            // B6: a scripture block must carry SOME content — at least one of
            // segments (array), text (string), or lines (array). The spec allows
            // varied structure, but "none of the three" is a valid schema that
            // renders BLANK. (No shipped block is type=scripture today; forward guard.)
            if (!Array.isArray(block.segments) && typeof block.text !== 'string' && !Array.isArray(block.lines)) {
              errors.push(`${bp}: type="scripture" needs at least one of segments/text/lines`);
            }
            break;
        }
      }
    }

    // ── footnote validation ─────────────────────────────────────
    if (footnotes && typeof footnotes === 'object' && !Array.isArray(footnotes)) {
      const fnKeys = Object.keys(footnotes);

      for (const fnKey of fnKeys) {
        const fn = footnotes[fnKey];
        const fp = `${prefix} footnote["${fnKey}"]`;

        if (!fn || typeof fn !== 'object') {
          errors.push(`${fp}: not an object`);
          continue;
        }

        if (!VALID_FOOTNOTE_TYPES.has(fn.type)) {
          errors.push(`${fp}: invalid footnote type "${fn.type}" (expected "scripture" or "note")`);
          continue;
        }

        if (fn.type === 'scripture') {
          if (typeof fn.ref !== 'string' || fn.ref.length === 0) {
            errors.push(`${fp}: scripture footnote missing "ref" (string)`);
          } else if (nkjv && typeof nkjv === 'object' && !Array.isArray(nkjv)) {
            // Chapter-only refs are exempt: the runtime resolves the whole
            // chapter from the bundled Bible (letter dicts never embed one);
            // the runner's Bible-ref resolution pass proves the ref exists.
            if (!(fn.ref in nkjv) && !isChapterOnlyRef(fn.ref)) {
              errors.push(`${fp}: ref "${fn.ref}" not found in nkjv dict`);
            }
          }
        }

        if (fn.type === 'note') {
          if (typeof fn.text !== 'string' || fn.text.length === 0) {
            errors.push(`${fp}: note footnote missing "text" (string)`);
          } else if (!fn.link && !fn.url && isBareScriptureRef(fn.text)) {
            errors.push(`${fp}: note text "${fn.text}" is a bare scripture reference — the sheet would show it with NO verse content; type it "scripture" with a ref instead`);
          }
        }
      }

      // Any header meta line (from / spoken / forLine / noteLine) may be a
      // segments array carrying an fn bubble — e.g. noteLine "(Regarding the
      // state of the dead[1])" or the Timothy attribution "The Interpretation of
      // the Vision Given to Timothy[1]". Scan those for fn refs too, or the
      // footnote looks orphaned.
      for (const field of ['from', 'spoken', 'forLine', 'noteLine']) {
        if (Array.isArray(letter[field])) {
          validateSegments(letter[field], `${prefix} ${field}`, errors, fnRefsUsed);
        }
      }

      // orphan detection — footnotes not referenced by any fn segment
      for (const fnKey of fnKeys) {
        if (!fnRefsUsed.has(fnKey)) {
          warnings.push(`${prefix}: footnote "${fnKey}" defined but never referenced by an fn segment`);
        }
      }

      // fn segments referencing non-existent footnotes
      for (const ref of fnRefsUsed) {
        if (!(ref in footnotes)) {
          errors.push(`${prefix}: fn segment references footnote "${ref}" which does not exist`);
        }
      }
    }

    // ── nkjv orphan detection ───────────────────────────────────
    if (nkjv && typeof nkjv === 'object' && !Array.isArray(nkjv) &&
        footnotes && typeof footnotes === 'object' && !Array.isArray(footnotes)) {
      const fnRefs = new Set();
      for (const fnKey of Object.keys(footnotes)) {
        const fn = footnotes[fnKey];
        if (fn && fn.type === 'scripture' && typeof fn.ref === 'string') {
          fnRefs.add(fn.ref);
        }
      }
      for (const nkjvKey of Object.keys(nkjv)) {
        if (!fnRefs.has(nkjvKey)) {
          warnings.push(`${prefix}: nkjv key "${nkjvKey}" not referenced by any scripture footnote`);
        }
      }
    }
  }

  // ── chain validation ──────────────────────────────────────────
  validateChain(letters, fileName, errors, warnings, 'prevLetter', 'nextLetter', 'letter');

  return { errors, warnings };
}

/**
 * Validate prev/next chain consistency across an ordered item array.
 * Generalized so Format A (prevLetter/nextLetter, noun="letter") and the
 * Holy Days album (prevEntry/nextEntry, noun="entry") share one impl.
 * @param {object[]} items
 * @param {string} fileName
 * @param {string[]} errors
 * @param {string[]} warnings
 * @param {string} prevKey
 * @param {string} nextKey
 * @param {string} noun
 */
function validateChain(items, fileName, errors, warnings, prevKey, nextKey, noun) {
  for (let i = 0; i < items.length - 1; i++) {
    const curr = items[i];
    const next = items[i + 1];
    if (!curr || !next) continue;
    const prefix = `${fileName}: chain[${i}→${i + 1}]`;
    if (curr[nextKey]) {
      if (curr[nextKey].id !== next.id) {
        errors.push(`${prefix}: ${noun}[${i}].${nextKey}.id is "${curr[nextKey].id}" but ${noun}[${i + 1}].id is "${next.id}"`);
      }
    }
    if (next[prevKey]) {
      if (next[prevKey].id !== curr.id) {
        errors.push(`${prefix}: ${noun}[${i + 1}].${prevKey}.id is "${next[prevKey].id}" but ${noun}[${i}].id is "${curr.id}"`);
      }
    }
  }
  if (items.length > 0 && items[0] && items[0][prevKey] !== undefined && items[0][prevKey] !== null) {
    warnings.push(`${fileName}: first ${noun} has non-null ${prevKey}`);
  }
  if (items.length > 0) {
    const last = items[items.length - 1];
    if (last && last[nextKey] !== undefined && last[nextKey] !== null) {
      warnings.push(`${fileName}: last ${noun} has non-null ${nextKey}`);
    }
  }
}

// ── segment validation ──────────────────────────────────────────

function validateSegments(segments, pathPrefix, errors, fnRefsUsed) {
  for (let si = 0; si < segments.length; si++) {
    const seg = segments[si];
    const sp = `${pathPrefix} seg[${si}]`;

    if (!seg || typeof seg !== 'object') {
      errors.push(`${sp}: not an object`);
      continue;
    }

    if (!VALID_SEGMENT_TYPES.has(seg.t)) {
      errors.push(`${sp}: invalid segment type "${seg.t}"`);
      continue;
    }

    switch (seg.t) {
      case 'text':
      case 'italic':
      case 'bold-italic':
      case 'caps':
        if (typeof seg.v !== 'string') {
          errors.push(`${sp}: type="${seg.t}" requires "v" (string)`);
        }
        break;

      case 'fn':
        if (typeof seg.v !== 'string' || seg.v.length === 0) {
          errors.push(`${sp}: type="fn" requires "v" (non-empty string)`);
        } else {
          fnRefsUsed.add(seg.v);
        }
        break;

      case 'stanza-break':
        // v is optional for stanza-break
        break;

      case 'letter-link':
        // letter-link has label + link, not v
        if (typeof seg.label !== 'string') {
          errors.push(`${sp}: type="letter-link" requires "label" (string)`);
        }
        if (!seg.link || typeof seg.link !== 'object') {
          errors.push(`${sp}: type="letter-link" requires "link" (object)`);
        }
        break;
    }
  }
}

// ── nav link validation ─────────────────────────────────────────

function validateNavLink(nav, fieldName, prefix, errors) {
  if (nav === undefined || nav === null) return;
  if (typeof nav !== 'object' || Array.isArray(nav)) {
    errors.push(`${prefix}: "${fieldName}" must be an object or null`);
    return;
  }
  if (typeof nav.id !== 'string' || nav.id.length === 0) {
    errors.push(`${prefix}: ${fieldName}.id must be a non-empty string`);
  }
  if (typeof nav.title !== 'string' || nav.title.length === 0) {
    errors.push(`${prefix}: ${fieldName}.title must be a non-empty string`);
  }
}

// ── Format B (WTLB One/Two, The Blessed) ─────────────────────────

/**
 * @param {object[]} entries - array of Format B entry objects
 * @param {{ strict?: boolean, fileName?: string, scriptures?: object }} [opts]
 *   opts.scriptures - dict of "Ref" → text used to cross-check {{ref:…}}
 *   (WTLB/Blessed store this in a separate module-level variable).
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateFormatB(entries, opts = {}) {
  const errors = [];
  const warnings = [];
  const fileName = opts.fileName || '(unknown)';
  const scriptures = opts.scriptures && typeof opts.scriptures === 'object' && !Array.isArray(opts.scriptures)
    ? opts.scriptures : null;

  if (!Array.isArray(entries)) {
    errors.push(`${fileName}: expected an array, got ${typeof entries}`);
    return { errors, warnings };
  }

  const seenIds = new Set();   // CORP1 — catch duplicate slug ids
  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${fileName}: entry[${i}] is not a plain object`);
      continue;
    }
    if (typeof entry.id === 'string' && entry.id.length > 0) {
      if (seenIds.has(entry.id)) errors.push(`${fileName}: ${ctxItem('entry', i, entry.id)}: CORP1 — duplicate "id" "${entry.id}" (already used by an earlier entry)`);
      else seenIds.add(entry.id);
    }
    validateFormatBEntry(entry, `${fileName}: ${ctxItem('entry', i, entry.id)}`, errors, warnings, scriptures);
  }

  return { errors, warnings };
}

/**
 * Validate a single Format B entry (no chain). Shared by validateFormatB
 * and validateHolyDays (type="wtlb").
 */
function validateFormatBEntry(entry, prefix, errors, warnings, scriptures) {
  if (typeof entry.id !== 'string' || entry.id.length === 0) {
    errors.push(`${prefix}: missing or empty "id" (string)`);
  }
  if (typeof entry.title !== 'string' || entry.title.length === 0) {
    errors.push(`${prefix}: missing or empty "title" (string)`);
  }
  if (entry.num !== undefined && typeof entry.num !== 'number') {
    errors.push(`${prefix}: "num" must be a number if present`);
  }
  for (const optStr of ['sourceLabel', 'type']) {
    if (entry[optStr] !== undefined && typeof entry[optStr] !== 'string') {
      errors.push(`${prefix}: "${optStr}" must be a string if present`);
    }
  }
  if (entry.scriptures !== undefined &&
      (typeof entry.scriptures !== 'object' || Array.isArray(entry.scriptures))) {
    errors.push(`${prefix}: "scriptures" must be an object if present`);
  }

  // A per-entry scriptures dict (Holy Days) takes precedence over the
  // module-level one passed in opts (WTLB/Blessed).
  const refDict = (entry.scriptures && typeof entry.scriptures === 'object' && !Array.isArray(entry.scriptures)
    && Object.keys(entry.scriptures).length > 0)
    ? entry.scriptures : scriptures;

  if (!Array.isArray(entry.paragraphs)) {
    errors.push(`${prefix}: missing or non-array "paragraphs"`);
    return;
  }
  for (let pi = 0; pi < entry.paragraphs.length; pi++) {
    const para = entry.paragraphs[pi];
    const pp = `${prefix} paragraph[${pi}]`;
    if (!para || typeof para !== 'object') {
      errors.push(`${pp}: not an object`);
      continue;
    }
    if (!VALID_ALIGN.has(para.align)) {
      errors.push(`${pp}: invalid align "${para.align}" (expected center|justify|left)`);
    }
    if (typeof para.text !== 'string') {
      errors.push(`${pp}: missing "text" (string)`);
    } else {
      validateInlineRefs(para.text, pp, errors, warnings, refDict);
      // Marker-balance guard: after consuming every _italic_/**bold** span the
      // way the renderer does, no literal `_` or `**` may remain — an unpaired
      // marker renders on screen (the underscore-"underline" bug). Catches a
      // future edit that drops a closing marker before it can ship.
      const visible = visibleFormatBText(para.text);
      if (visible.includes('_') || visible.includes('**')) {
        errors.push(`${pp}: unpaired emphasis marker — "${para.text.slice(0, 60).replace(/\n/g, '\\n')}…" would render a literal _ or ** (close the _italic_ / **bold** span)`);
      }
    }
  }
}

/**
 * Validate inline {{nav:…}} and {{ref:…}} patterns in Format B text.
 * - {{nav:bookId:chapter}} → must be 2 colon-separated parts, chapter numeric (ERROR if not)
 * - {{ref:Book Ch:V}} → non-empty (ERROR if empty); existence checked against
 *   the scriptures dict only when one is provided AND non-empty (WARNING on miss,
 *   since some refs may resolve through a global resolver rather than the dict).
 */
function validateInlineRefs(text, prefix, errors, warnings, scriptures) {
  const navRe = /\{\{nav:([^}]*)\}\}/g;
  let m;
  while ((m = navRe.exec(text)) !== null) {
    const parts = m[1].split(':');
    if (parts.length !== 2 || parts[0].length === 0 || !/^\d+$/.test(parts[1])) {
      errors.push(`${prefix}: malformed nav link "{{nav:${m[1]}}}" (expected {{nav:bookId:chapter}})`);
    }
  }
  const refRe = /\{\{ref:([^}]*)\}\}/g;
  while ((m = refRe.exec(text)) !== null) {
    const ref = m[1];
    if (ref.trim().length === 0) {
      errors.push(`${prefix}: empty inline ref "{{ref:}}"`);
      continue;
    }
    if (scriptures && Object.keys(scriptures).length > 0 && !(ref in scriptures)) {
      warnings.push(`${prefix}: inline ref "${ref}" not found in scriptures dict`);
    }
  }
}

// ── Holy Days (hybrid album — Format A or B per entry.type) ──────

/**
 * @param {object[]} entries - HOLY_DAYS array (each entry is type "letter" or "wtlb")
 * @param {{ strict?: boolean, fileName?: string }} [opts]
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateHolyDays(entries, opts = {}) {
  const errors = [];
  const warnings = [];
  const fileName = opts.fileName || '(unknown)';

  if (!Array.isArray(entries)) {
    errors.push(`${fileName}: expected an array, got ${typeof entries}`);
    return { errors, warnings };
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      errors.push(`${fileName}: entry[${i}] is not a plain object`);
      continue;
    }
    const label = `${fileName}: ${ctxItem('entry', i, entry.id)}`;
    if (!VALID_HOLY_DAYS_TYPES.has(entry.type)) {
      errors.push(`${label}: invalid or missing "type" "${entry.type}" (expected "letter" or "wtlb")`);
      continue;
    }
    // Dispatch to the matching per-item validator. The single-element
    // reuse keeps the full Format A / B rule sets without duplicating them;
    // prevLetter/nextLetter are absent here (Holy Days uses prevEntry/
    // nextEntry), so the reused per-item chain checks are inert.
    const sub = entry.type === 'letter'
      ? validateFormatA([entry], { fileName: label })
      : validateFormatB([entry], { fileName: label, scriptures: entry.scriptures });
    for (const e of sub.errors) errors.push(e);
    for (const w of sub.warnings) warnings.push(w);
  }

  // Album chain runs on the prevEntry/nextEntry fields.
  validateChain(entries, fileName, errors, warnings, 'prevEntry', 'nextEntry', 'entry');

  return { errors, warnings };
}

// ── Format C (Bible books: books.js, matthew-plain, books-restored) ──

/**
 * @param {object|object[]} books - object-of-books (BOOKS), single book
 *   (MATTHEW_PLAIN), or array of books.
 * @param {{ strict?: boolean, fileName?: string, chromeOnly?: boolean }} [opts]
 *   opts.chromeOnly - books-restored.js carries chapter/section chrome only
 *   (verses live in books.js); skip the verse-level requirements.
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateFormatC(books, opts = {}) {
  const errors = [];
  const warnings = [];
  const fileName = opts.fileName || '(unknown)';
  const chromeOnly = !!opts.chromeOnly;

  /** @type {Array<[string, any]>} */
  let bookList;
  if (Array.isArray(books)) {
    bookList = books.map((b, i) => [String(i), b]);
  } else if (books && typeof books === 'object' &&
             ('chapters' in books || 'id' in books || 'title' in books)) {
    // Single book — identified by its own top-level book fields. (An
    // object-of-books is keyed by book id, so it has none of these.)
    // Detect by field presence, not by chapters being a valid array, so a
    // malformed single book still reports "missing chapters" cleanly.
    bookList = [[books.id || '0', books]];
  } else if (books && typeof books === 'object') {
    bookList = Object.entries(books);                // object-of-books
  } else {
    errors.push(`${fileName}: expected an object or array of books, got ${typeof books}`);
    return { errors, warnings };
  }

  for (const [key, book] of bookList) {
    const prefix = `${fileName}: book "${(book && book.id) || key}"`;
    if (!book || typeof book !== 'object' || Array.isArray(book)) {
      errors.push(`${prefix}: not a plain object`);
      continue;
    }
    // Chrome-only files (books-restored) key each book by its id in the
    // enclosing object and carry no per-book id/title — those live in
    // books.js. Require them only for full book files.
    if (!chromeOnly) {
      if (typeof book.id !== 'string' || book.id.length === 0) {
        errors.push(`${prefix}: missing or empty "id" (string)`);
      }
      if (typeof book.title !== 'string' || book.title.length === 0) {
        errors.push(`${prefix}: missing or empty "title" (string)`);
      }
    } else {
      if (book.id !== undefined && typeof book.id !== 'string') {
        errors.push(`${prefix}: "id" must be a string if present`);
      }
      if (book.title !== undefined && typeof book.title !== 'string') {
        errors.push(`${prefix}: "title" must be a string if present`);
      }
    }
    if (book.subtitle !== undefined && typeof book.subtitle !== 'string') {
      errors.push(`${prefix}: "subtitle" must be a string if present`);
    }
    if (!Array.isArray(book.chapters)) {
      errors.push(`${prefix}: missing or non-array "chapters"`);
      continue;
    }
    for (let ci = 0; ci < book.chapters.length; ci++) {
      const ch = book.chapters[ci];
      const cp = `${prefix} chapter[${ci}]`;
      if (!ch || typeof ch !== 'object') {
        errors.push(`${cp}: not an object`);
        continue;
      }
      if (typeof ch.num !== 'number') {
        errors.push(`${cp}: missing "num" (number)`);
      }
      if (ch.title !== undefined && typeof ch.title !== 'string') {
        errors.push(`${cp}: "title" must be a string if present`);
      }
      if (!Array.isArray(ch.sections)) {
        errors.push(`${cp}: missing or non-array "sections"`);
        continue;
      }
      // Verse numbering ascends across the whole chapter (sections concatenate).
      let lastN = null;
      for (let si = 0; si < ch.sections.length; si++) {
        const sec = ch.sections[si];
        const sp = `${cp} section[${si}]`;
        if (!sec || typeof sec !== 'object') {
          errors.push(`${sp}: not an object`);
          continue;
        }
        if (sec.heading !== undefined && typeof sec.heading !== 'string') {
          errors.push(`${sp}: "heading" must be a string if present`);
        }
        if (chromeOnly) {
          // Chrome-only files carry headings, not verses.
          if (sec.verses !== undefined && !Array.isArray(sec.verses)) {
            errors.push(`${sp}: "verses" must be an array if present`);
          }
          continue;
        }
        if (!Array.isArray(sec.verses)) {
          errors.push(`${sp}: missing or non-array "verses"`);
          continue;
        }
        for (let vi = 0; vi < sec.verses.length; vi++) {
          const v = sec.verses[vi];
          const vp = `${sp} verse[${vi}]`;
          if (!v || typeof v !== 'object') {
            errors.push(`${vp}: not an object`);
            continue;
          }
          if (typeof v.n !== 'number') {
            errors.push(`${vp}: missing "n" (number)`);
            continue;
          }
          if (typeof v.text !== 'string') {
            errors.push(`${vp}: missing "text" (string)`);
          }
          if (lastN !== null) {
            if (v.n <= lastN) {
              errors.push(`${cp}: verse numbering not ascending — n=${v.n} follows n=${lastN}`);
            } else if (v.n > lastN + 1) {
              warnings.push(`${cp}: verse gap — n jumps from ${lastN} to ${v.n}`);
            }
          }
          lastN = v.n;
        }
      }
    }
  }

  return { errors, warnings };
}

// ── Format D (Bible Studies: bible-studies.js) ───────────────────

/**
 * @param {object[]} studies - BIBLE_STUDIES array
 * @param {{ strict?: boolean, fileName?: string }} [opts]
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateFormatD(studies, opts = {}) {
  const errors = [];
  const warnings = [];
  const fileName = opts.fileName || '(unknown)';

  if (!Array.isArray(studies)) {
    errors.push(`${fileName}: expected an array, got ${typeof studies}`);
    return { errors, warnings };
  }

  const seenIds = new Set();   // CORP1 — catch duplicate slug ids
  for (let i = 0; i < studies.length; i++) {
    const study = studies[i];
    const prefix = `${fileName}: ${ctxItem('study', i, study && study.id)}`;
    if (!study || typeof study !== 'object' || Array.isArray(study)) {
      errors.push(`${prefix}: not a plain object`);
      continue;
    }
    if (typeof study.id !== 'string' || study.id.length === 0) {
      errors.push(`${prefix}: missing or empty "id" (string)`);
    } else if (seenIds.has(study.id)) {
      errors.push(`${prefix}: CORP1 — duplicate "id" "${study.id}" (already used by an earlier study)`);
    } else {
      seenIds.add(study.id);
    }
    if (typeof study.title !== 'string' || study.title.length === 0) {
      errors.push(`${prefix}: missing or empty "title" (string)`);
    }
    for (const optStr of ['slug', 'coverImage', 'prefaceId', 'subtitle']) {
      if (study[optStr] !== undefined && typeof study[optStr] !== 'string') {
        errors.push(`${prefix}: "${optStr}" must be a string if present`);
      }
    }
    if (study.order !== undefined && typeof study.order !== 'number') {
      errors.push(`${prefix}: "order" must be a number if present`);
    }
    if (study.singlePage !== undefined && typeof study.singlePage !== 'boolean') {
      errors.push(`${prefix}: "singlePage" must be a boolean if present`);
    }

    // chapters — required; collect ids so parts.chapterIds can be cross-checked
    const chapterIds = new Set();
    if (!Array.isArray(study.chapters)) {
      errors.push(`${prefix}: missing or non-array "chapters"`);
    } else {
      for (let ci = 0; ci < study.chapters.length; ci++) {
        const ch = study.chapters[ci];
        const cp = `${prefix} chapter[${ci}]`;
        if (!ch || typeof ch !== 'object') {
          errors.push(`${cp}: not an object`);
          continue;
        }
        if (typeof ch.id !== 'string' || ch.id.length === 0) {
          errors.push(`${cp}: missing or empty "id" (string)`);
        } else {
          chapterIds.add(ch.id);
        }
        if (ch.num !== undefined && typeof ch.num !== 'number') {
          errors.push(`${cp}: "num" must be a number if present`);
        }
        if (ch.title !== undefined && typeof ch.title !== 'string') {
          errors.push(`${cp}: "title" must be a string if present`);
        }
        if (ch.blocks !== undefined && !Array.isArray(ch.blocks)) {
          errors.push(`${cp}: "blocks" must be an array if present`);
        }
      }
    }

    // parts — optional (only multi-part studies have them)
    if (study.parts !== undefined) {
      if (!Array.isArray(study.parts)) {
        errors.push(`${prefix}: "parts" must be an array if present`);
      } else {
        for (let pi = 0; pi < study.parts.length; pi++) {
          const part = study.parts[pi];
          const pp = `${prefix} part[${pi}]`;
          if (!part || typeof part !== 'object') {
            errors.push(`${pp}: not an object`);
            continue;
          }
          if (typeof part.title !== 'string' || part.title.length === 0) {
            errors.push(`${pp}: missing or empty "title" (string)`);
          }
          if (!Array.isArray(part.chapterIds)) {
            errors.push(`${pp}: missing or non-array "chapterIds"`);
          } else {
            for (let cii = 0; cii < part.chapterIds.length; cii++) {
              const cid = part.chapterIds[cii];
              if (typeof cid !== 'string') {
                errors.push(`${pp}: chapterIds[${cii}] is not a string`);
                continue;
              }
              // Only enforce resolution when the study actually lists chapters
              // (partial studies may carry parts before chapters are populated).
              if (chapterIds.size > 0 && !chapterIds.has(cid)) {
                errors.push(`${pp}: chapterId "${cid}" does not match any chapter in study.chapters`);
              }
            }
          }
        }
      }
    }
  }

  return { errors, warnings };
}

// ── Format E (translations / Study Bible / ref dicts) ───────────
// Three distinct shapes that postdate the original A-D spec, all now
// web-served — so a malformed one is a black-screen risk to web clients,
// not just an APK-bundle concern.

const VALID_STUDY_BLOCK_TYPES = new Set(['heading', 'para', 'poetry']);

/**
 * Validate a flat verse array [{ n, text }] — shared by the Format E
 * translation maps and the Study Bible's sectionless chapters. (Format C's
 * verses live under sections and keep their own inline check, whose message
 * contract is pinned by tests.) Non-ascending n is an ERROR (structural
 * corruption); a gap is a WARNING (legitimate versification differences).
 * @param {any[]} verses
 * @param {string} prefix
 * @param {string[]} errors
 * @param {string[]} warnings
 * @param {boolean} [sparse] - sparse overlay (bible-rnkjv/rkjv): verse gaps
 *   are the DESIGN (only changed verses are present), so the gap warning is
 *   suppressed; ascending order stays an error.
 * @param {boolean} [quietGaps] - the caller runs validateTranslationVerseSet
 *   against the KJV reference, which sees every missing verse (both chapter
 *   edges included) and errors unless allowlisted — so the adjacent-pair
 *   warning here would only repeat the 36 allowlisted Textus Receptus gaps.
 */
function validateVerseArray(verses, prefix, errors, warnings, sparse, quietGaps) {
  let lastN = null;
  for (let vi = 0; vi < verses.length; vi++) {
    const v = verses[vi];
    const vp = `${prefix} verse[${vi}]`;
    if (!v || typeof v !== 'object' || Array.isArray(v)) {
      errors.push(`${vp}: not an object`);
      continue;
    }
    if (typeof v.n !== 'number') {
      errors.push(`${vp}: missing "n" (number)`);
      continue;
    }
    if (typeof v.text !== 'string') {
      errors.push(`${vp}: missing "text" (string)`);
    }
    if (lastN !== null) {
      if (v.n <= lastN) {
        errors.push(`${prefix}: verse numbering not ascending — n=${v.n} follows n=${lastN}`);
      } else if (v.n > lastN + 1 && !sparse && !quietGaps) {
        warnings.push(`${prefix}: verse gap — n jumps from ${lastN} to ${v.n}`);
      }
    }
    lastN = v.n;
  }
}

/**
 * Format E — translation verse map (bible-asv/bsb/hnv/kjv/lsv/web/ylt, and
 * the sparse Restored-Name overlays bible-rnkjv/rkjv).
 * Shape: { bookId: { "<chapNum>": [ { n: number, text: string } ] } }
 * @param {object} map
 * @param {{ strict?: boolean, fileName?: string, sparse?: boolean, quietGaps?: boolean }} [opts]
 *   quietGaps: the caller also runs validateTranslationVerseSet (see validateVerseArray)
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateTranslationMap(map, opts = {}) {
  const errors = [];
  const warnings = [];
  const fileName = opts.fileName || '(unknown)';

  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    errors.push(`${fileName}: expected an object of books, got ${Array.isArray(map) ? 'array' : typeof map}`);
    return { errors, warnings };
  }

  for (const [bookId, book] of Object.entries(map)) {
    const bp = `${fileName}: book "${bookId}"`;
    if (bookId.length === 0) {
      errors.push(`${fileName}: empty book id key`);
    }
    if (!book || typeof book !== 'object' || Array.isArray(book)) {
      errors.push(`${bp}: not an object of chapters`);
      continue;
    }
    for (const [chapKey, verses] of Object.entries(book)) {
      const cp = `${bp} chapter "${chapKey}"`;
      if (!/^\d+$/.test(chapKey)) {
        warnings.push(`${cp}: chapter key is not a positive-integer string`);
      }
      if (!Array.isArray(verses)) {
        errors.push(`${cp}: chapter value is not an array of verses`);
        continue;
      }
      validateVerseArray(verses, cp, errors, warnings, opts.sparse, opts.quietGaps);
    }
  }

  return { errors, warnings };
}

/**
 * Sparse-overlay subset check (bible-rnkjv/rkjv): a sparse overlay may only
 * carry verses that EXIST in the complete reference translation — an unknown
 * book id, chapter, or verse number means the generator mis-keyed something
 * and that verse would silently never render. Inverse of
 * validateTranslationCompleteness, which sparse files intentionally skip.
 * @param {object} map - sparse overlay
 * @param {object} ref - complete reference map (BIBLE_KJV)
 * @param {{ fileName?: string }} [opts]
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateOverlaySubset(map, ref, opts = {}) {
  const errors = [];
  const warnings = [];
  const fileName = opts.fileName || '(unknown)';
  if (!map || typeof map !== 'object' || !ref || typeof ref !== 'object') return { errors, warnings };
  for (const [bookId, book] of Object.entries(map)) {
    const rBook = ref[bookId];
    if (!rBook) { errors.push(`${fileName}: book "${bookId}" not in the reference translation`); continue; }
    for (const [chapKey, verses] of Object.entries(book)) {
      const rVerses = rBook[chapKey];
      if (!Array.isArray(rVerses)) { errors.push(`${fileName}: ${bookId} ${chapKey} not in the reference translation`); continue; }
      if (!Array.isArray(verses)) continue; // shape error already reported by validateTranslationMap
      const rNs = new Set(rVerses.map((v) => v && v.n));
      for (const v of verses) {
        if (v && typeof v.n === 'number' && !rNs.has(v.n)) {
          errors.push(`${fileName}: ${bookId} ${chapKey}:${v.n} not in the reference translation`);
        }
      }
    }
  }
  return { errors, warnings };
}

/**
 * Format E — ref->text scripture dict (matthew-nkjv.js, and any { ref: text }
 * lookup). Keys are scripture refs; values are verse text. Compound values
 * (multiple refs joined with " | " and em-dashes) are legitimate per the
 * project's permanent rules, so only the top-level value type is constrained.
 * @param {object} dict
 * @param {{ strict?: boolean, fileName?: string }} [opts]
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateScriptureDict(dict, opts = {}) {
  const errors = [];
  const warnings = [];
  const fileName = opts.fileName || '(unknown)';

  if (!dict || typeof dict !== 'object' || Array.isArray(dict)) {
    errors.push(`${fileName}: expected an object of ref->text, got ${Array.isArray(dict) ? 'array' : typeof dict}`);
    return { errors, warnings };
  }

  for (const [ref, text] of Object.entries(dict)) {
    if (ref.length === 0) {
      errors.push(`${fileName}: empty ref key`);
    }
    if (typeof text !== 'string') {
      errors.push(`${fileName}: ref "${ref}" value is not a string`);
    } else if (text.length === 0) {
      warnings.push(`${fileName}: ref "${ref}" has empty text`);
    }
  }

  return { errors, warnings };
}

/**
 * Footnote verse-marker integrity. Every MULTI-verse footnote scripture value
 * must render fully gold from its own EXPLICIT markers — splitIntoVerses (the
 * real renderer path) must return one segment per verse, not the single-element
 * degraded fallback. A marker-less multi-verse value is an ERROR: it would
 * render white / duplicated / mis-numbered. The renderer's guessing heuristics
 * (sentence-split / genealogy-comma) were deleted, so THIS gate is what keeps
 * footnote data honest going forward.
 *
 * `dict` is a ref->text map. Compound values ("Ref A — text | Ref B — text")
 * are split into parts (mirroring ScriptureVerseText) and each part validated
 * against its own label-ref.
 *
 * @param {Record<string, string>} dict
 * @param {{ fileName?: string }} [opts]
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateFootnoteMarkers(dict, opts = {}) {
  const errors = [];
  const warnings = [];
  const fileName = opts.fileName || '(unknown)';
  if (!dict || typeof dict !== 'object') return { errors, warnings };

  for (const ref of Object.keys(dict)) {
    const value = dict[ref];
    if (typeof value !== 'string') continue;
    // Compound values render as separate parts: split on " | ", label before " — ".
    const parts = value.includes(' | ')
      ? value.split(' | ').map((p) => {
          const i = p.indexOf(' — ');
          return i >= 0 ? { ref: p.slice(0, i).trim(), text: p.slice(i + 3) } : { ref, text: p };
        })
      : [{ ref, text: value }];
    for (const part of parts) {
      const range = parseRefRange(part.ref);
      if (!range) continue; // single-verse / unparseable label → no verse markers needed
      const count = (range.verses && range.verses.length) || (range.end - range.start + 1);
      if (count < 2) continue;
      const segs = splitIntoVerses(part.text, part.ref);
      if (!segs) continue;
      if (segs.length < count) {
        // A short split only renders WHITE if un-consumed DECIMAL markers
        // ("16. ") remain in the text — the renderer STRIPS Unicode
        // superscripts (so abbreviated Study-Bible excerpts like Isaiah 53:2-12
        // render gold-first + clean prose), and marker-less prose just renders
        // under the start verse with no stray numbers. So flag the decimal case
        // specifically — that's the visible white / duplicated eyesore.
        if (/(?:^|[\s“‘"'(])\d+\.\s/.test(part.text)) {
          errors.push(`${fileName}: "${ref}" — decimal verse markers don't fully split (${segs.length}/${count}); the leftovers render WHITE. Ensure verses ${range.start}..${range.end} each carry an "N. " marker (tools/mark-footnote-verses.js).`);
        }
      }
    }
  }
  return { errors, warnings };
}

/**
 * Format E — Study Bible (matthew.js MATTHEW). A single annotated book: a
 * preface (heading/para/poetry blocks) plus sectionless chapters (verses live
 * directly on the chapter; scriptures/votNotes/links are the annotation
 * layers).
 * @param {object} study
 * @param {{ strict?: boolean, fileName?: string }} [opts]
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateStudyBible(study, opts = {}) {
  const errors = [];
  const warnings = [];
  const fileName = opts.fileName || '(unknown)';

  if (!study || typeof study !== 'object' || Array.isArray(study)) {
    errors.push(`${fileName}: expected a study object, got ${Array.isArray(study) ? 'array' : typeof study}`);
    return { errors, warnings };
  }

  if (typeof study.id !== 'string' || study.id.length === 0) {
    errors.push(`${fileName}: missing or empty "id" (string)`);
  }
  if (typeof study.title !== 'string' || study.title.length === 0) {
    errors.push(`${fileName}: missing or empty "title" (string)`);
  }
  for (const optStr of ['subtitle', '_dataVersion']) {
    if (study[optStr] !== undefined && typeof study[optStr] !== 'string') {
      errors.push(`${fileName}: "${optStr}" must be a string if present`);
    }
  }
  if (study.votEdition !== undefined && typeof study.votEdition !== 'boolean') {
    errors.push(`${fileName}: "votEdition" must be a boolean if present`);
  }

  // ── preface (optional) ──
  if (study.preface !== undefined) {
    const pf = study.preface;
    const pp = `${fileName}: preface`;
    if (!pf || typeof pf !== 'object' || Array.isArray(pf)) {
      errors.push(`${pp}: must be an object`);
    } else {
      if (pf.title !== undefined && typeof pf.title !== 'string') {
        errors.push(`${pp}: "title" must be a string if present`);
      }
      if (!Array.isArray(pf.blocks)) {
        errors.push(`${pp}: missing or non-array "blocks"`);
      } else {
        validateStudyBlocks(pf.blocks, pp, errors);
      }
    }
  }

  // ── chapters (required) ──
  if (!Array.isArray(study.chapters)) {
    errors.push(`${fileName}: missing or non-array "chapters"`);
    return { errors, warnings };
  }
  for (let ci = 0; ci < study.chapters.length; ci++) {
    const ch = study.chapters[ci];
    const cp = `${fileName}: chapter[${ci}]`;
    if (!ch || typeof ch !== 'object' || Array.isArray(ch)) {
      errors.push(`${cp}: not an object`);
      continue;
    }
    if (typeof ch.num !== 'number') {
      errors.push(`${cp}: missing "num" (number)`);
    }
    if (ch.title !== undefined && typeof ch.title !== 'string') {
      errors.push(`${cp}: "title" must be a string if present`);
    }
    const cpn = typeof ch.num === 'number' ? `${fileName}: chapter ${ch.num}` : cp;
    if (!Array.isArray(ch.verses)) {
      errors.push(`${cp}: missing or non-array "verses"`);
    } else {
      validateVerseArray(ch.verses, cpn, errors, warnings);
    }
    // annotation layers — all optional. votNotes.vol is nullable (non-volume sources).
    validateAnnotationArray(ch.scriptures, 'scriptures', { ref: 'string', cite: 'string' }, cp, errors);
    validateAnnotationArray(ch.votNotes, 'votNotes', { ref: 'string', vol: 'string?', letter: 'string', excerpt: 'string' }, cp, errors);
    validateAnnotationArray(ch.links, 'links', { label: 'string', url: 'string' }, cp, errors);
  }

  return { errors, warnings };
}

/**
 * Validate a Study Bible preface block list (heading / para / poetry).
 * Reuses the Format A segment validator — the preface's segment vocabulary
 * (text / italic / letter-link) is a subset of VALID_SEGMENT_TYPES.
 * @param {any[]} blocks
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateStudyBlocks(blocks, prefix, errors) {
  const sink = new Set();   // fn segments never appear in the preface; throwaway
  for (let bi = 0; bi < blocks.length; bi++) {
    const block = blocks[bi];
    const bp = `${prefix} block[${bi}]`;
    if (!block || typeof block !== 'object') {
      errors.push(`${bp}: not an object`);
      continue;
    }
    if (!VALID_STUDY_BLOCK_TYPES.has(block.type)) {
      errors.push(`${bp}: invalid block type "${block.type}"`);
      continue;
    }
    switch (block.type) {
      case 'heading':
        if (typeof block.level !== 'number') {
          errors.push(`${bp}: type="heading" requires "level" (number)`);
        }
        if (typeof block.text !== 'string') {
          errors.push(`${bp}: type="heading" requires "text" (string)`);
        }
        break;
      case 'para':
        if (!Array.isArray(block.segments)) {
          errors.push(`${bp}: type="para" requires "segments" array`);
        } else {
          validateSegments(block.segments, bp, errors, sink);
        }
        break;
      case 'poetry':
        if (!Array.isArray(block.lines)) {
          errors.push(`${bp}: type="poetry" requires "lines" array`);
        } else {
          for (let li = 0; li < block.lines.length; li++) {
            const line = block.lines[li];
            if (!Array.isArray(line)) {
              errors.push(`${bp} lines[${li}]: must be an array`);
            } else {
              validateSegments(line, `${bp} lines[${li}]`, errors, sink);
            }
          }
        }
        break;
    }
  }
}

/**
 * Validate an optional array of annotation records. `spec` maps each field to
 * its kind: 'string' = required non-empty string; 'string?' = optional, and if
 * present must be a string or null. (votNotes.vol is null when the source is a
 * non-volume collection whose name is already carried in `letter` — e.g. "The
 * Blessed".) Shared by the Study Bible's scriptures / votNotes / links layers.
 * @param {any} arr
 * @param {string} fieldName
 * @param {Record<string, 'string'|'string?'>} spec
 * @param {string} prefix
 * @param {string[]} errors
 */
function validateAnnotationArray(arr, fieldName, spec, prefix, errors) {
  if (arr === undefined) return;
  if (!Array.isArray(arr)) {
    errors.push(`${prefix}: "${fieldName}" must be an array if present`);
    return;
  }
  for (let i = 0; i < arr.length; i++) {
    const rec = arr[i];
    const rp = `${prefix} ${fieldName}[${i}]`;
    if (!rec || typeof rec !== 'object' || Array.isArray(rec)) {
      errors.push(`${rp}: not an object`);
      continue;
    }
    for (const [f, kind] of Object.entries(spec)) {
      const val = rec[f];
      if (kind === 'string?') {
        if (val !== undefined && val !== null && typeof val !== 'string') {
          errors.push(`${rp}: "${f}" must be a string or null if present`);
        }
      } else if (typeof val !== 'string' || val.length === 0) {
        errors.push(`${rp}: missing or empty "${f}" (string)`);
      }
    }
  }
}

// ── Cross-translation verse-count check ─────────────────────────

/** Compress an ascending number list to a range string: [1,2,3,5] → "1-3, 5". */
function compressRanges(nums) {
  if (nums.length === 0) return '';
  const sorted = [...nums].sort((a, b) => a - b);
  const out = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === prev + 1) { prev = sorted[i]; } else {
      out.push(start === prev ? `${start}` : `${start}-${prev}`);
      start = prev = sorted[i];
    }
  }
  out.push(start === prev ? `${start}` : `${start}-${prev}`);
  return out.join(', ');
}

/**
 * Compare a Format C structure's verse NUMBERS per chapter against a complete
 * reference translation. Catches MISSING verses that validateFormatC's
 * per-file contiguity check structurally cannot — it only flags internal
 * jumps, not a chapter that stops early (trailing gap) or starts late. This
 * is the check that would have caught the Hebrews 10/12 trailing gaps on the
 * first pass instead of via a manual audit.
 *
 * @param {object|object[]} books - Format C (object-of-books / single book / array)
 * @param {object} reference - translation map { bookId: { chapNum: [{n,…}] } } (e.g. BIBLE_KJV)
 * @param {{ fileName?: string, exceptions?: string[], singleBookId?: string }} [opts]
 *   opts.singleBookId - reference key for a single-book input (e.g. "matthew-plain")
 *   opts.exceptions  - "<bookId> <chap>" entries to skip (known versification
 *                      differences, e.g. apocryphal additions present in one
 *                      text but not the other)
 * @returns {{ errors: string[], warnings: string[] }}
 */
/**
 * Scripture Web graph asset (src/data/scripture-web-data.js, generated by
 * tools/gen-scripture-web.mjs).
 *
 * The renderer trusts this file's invariants at 60 fps without re-checking
 * them: it draws sub-ranges of the baked bucket layout and indexes verse ids
 * straight into the chapter table. A bad offset silently draws the wrong arcs;
 * an out-of-range verse id reads past the end of the layout tables. So the
 * gate proves them here, once, at build time.
 *
 * @param {any} data — the decoded SCRIPTURE_WEB_DATA object
 * @param {object} [opts]
 * @param {(b64: string) => Uint8Array} [opts.decode] — base64 → bytes
 * @returns {{ errors: string[], warnings: string[], count: number }}
 */
/**
 * The Scripture Web node-position buffer (scripture-web-positions.js).
 *
 * The load-bearing check is NOT "is this file well formed" — it is "does this
 * file agree with the thing that indexes it". scripture-web-data.js stores its
 * edges as verse indices into a 31,102 space, so a position buffer of the wrong
 * length, or one whose order drifted, draws a scrambled graph with nothing
 * failing. Both directions are checked, with the CORPUS as the origin of truth
 * for the count rather than the edge asset's opinion of it:
 *
 *   1. buffer length  === corpus verse count
 *   2. every node index any EDGE references is inside the buffer
 *   3. coincident nodes stay under a stated fraction — a node quantised on top
 *      of another is unpickable, so this is the cheap check that a layout which
 *      failed to converge cannot ship. It needs no human to look at the result.
 *
 * @param {any} data     SCRIPTURE_WEB_POSITIONS
 * @param {any} edges    SCRIPTURE_WEB_DATA, for the cross-check (optional)
 */
export function validateScriptureWebPositions(data, edges, opts = {}) {
  const errors = [];
  const warnings = [];
  const file = opts.fileName || 'scripture-web-positions.js';
  const CORPUS_VERSES = 31102;
  const MAX_COINCIDENT_FRACTION = 0.001;   // 0.1% — see (3) above

  if (!data || typeof data !== 'object') {
    errors.push(`${file}: SCRIPTURE_WEB_POSITIONS is missing or not an object`);
    return { errors, warnings, count: 0 };
  }
  for (const f of ['version', 'layout', 'total', 'range', 'xy64']) {
    if (data[f] === undefined) errors.push(`${file}: missing field "${f}"`);
  }
  if (errors.length) return { errors, warnings, count: 0 };

  const bin = Buffer.from(String(data.xy64), 'base64');
  const xy = new Int16Array(bin.buffer, bin.byteOffset, Math.floor(bin.byteLength / 2));
  const nodes = Math.floor(xy.length / 2);

  if (data.total !== CORPUS_VERSES) {
    errors.push(`${file}: total ${data.total} but the corpus has ${CORPUS_VERSES} verses`);
  }
  if (nodes !== data.total) {
    errors.push(`${file}: xy64 decodes to ${nodes} nodes but total says ${data.total}`);
  }
  if (xy.length % 2 !== 0) errors.push(`${file}: xy64 is not an even number of Int16s (must be interleaved x,y)`);

  const range = Number(data.range) || 32767;
  let outOfRange = 0;
  for (let i = 0; i < xy.length; i++) {
    if (!Number.isFinite(xy[i]) || xy[i] < -range || xy[i] > range) outOfRange++;
  }
  if (outOfRange) errors.push(`${file}: ${outOfRange} coordinate(s) outside [-${range}, ${range}]`);

  // (2) the cross-check that actually catches a scrambled graph.
  if (edges && typeof edges === 'object') {
    if (typeof edges.total === 'number' && edges.total !== nodes) {
      errors.push(`${file}: ${nodes} nodes, but scripture-web-data.js indexes a ${edges.total}-verse space — ` +
        'the edges would point at the wrong nodes');
    }
    for (const e of (edges.votEdges || [])) {
      for (const idx of [e && e.from, e && e.to]) {
        if (typeof idx === 'number' && (idx < 0 || idx >= nodes)) {
          errors.push(`${file}: a VOT edge references node ${idx}, outside the ${nodes}-node buffer`);
          break;
        }
      }
      if (errors.length > 40) break;
    }
  } else {
    warnings.push(`${file}: scripture-web-data.js not available — the edge cross-check did not run`);
  }

  // (3) coincident nodes.
  const seen = new Set();
  let dup = 0;
  for (let i = 0; i < xy.length; i += 2) {
    const key = (xy[i] + 32768) * 65536 + (xy[i + 1] + 32768);
    if (seen.has(key)) dup++; else seen.add(key);
  }
  if (dup / Math.max(nodes, 1) > MAX_COINCIDENT_FRACTION) {
    errors.push(`${file}: ${dup} coincident node pair(s) (${((100 * dup) / nodes).toFixed(2)}%) exceeds ` +
      `${(100 * MAX_COINCIDENT_FRACTION).toFixed(1)}% — coincident nodes are unpickable, so the layout did not converge`);
  }

  return { errors, warnings, count: nodes, coincident: dup };
}

export function validateScriptureWeb(data, opts = {}) {
  const errors = [];
  const warnings = [];
  const file = opts.fileName || 'scripture-web-data.js';
  const decode = opts.decode || ((b64) => {
    const bin = Buffer.from(b64, 'base64').toString('binary');
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  });

  if (!data || typeof data !== 'object') {
    errors.push(`${file}: SCRIPTURE_WEB_DATA is missing or not an object`);
    return { errors, warnings, count: 0 };
  }
  for (const field of ['total', 'count', 'books', 'chapters', 'buckets',
    'dfrom64', 'span64', 'votes64', 'attribution']) {
    if (data[field] === undefined) errors.push(`${file}: missing field "${field}"`);
  }
  if (errors.length) return { errors, warnings, count: 0 };

  // CC-BY: the attribution string must survive into the shipped asset.
  if (!/openbible/i.test(String(data.attribution))) {
    errors.push(`${file}: attribution must name OpenBible.info (CC-BY requires it)`);
  }
  // The shipped Web is intentionally the famous ~64k-link view. A larger
  // weak-tail asset recreates the laggy complete mode this gate is meant to
  // keep out of the Android/PWA build.
  if (!Array.isArray(data.densityTiers) || data.densityTiers[0] !== 20 || data.densityTiers[1] !== 7) {
    errors.push(`${file}: expected density tiers [20, 7] (Essential / Famous)`);
  }
  if (data.count > 70000) {
    errors.push(`${file}: graph count ${data.count} exceeds the shipped Famous-view ceiling of 70,000`);
  }

  // Canon shape — 66 books / 1189 chapters / 31102 verses is the app's corpus.
  if (data.books.length !== 66) errors.push(`${file}: expected 66 books, got ${data.books.length}`);
  if (data.chapters.length !== 1189) errors.push(`${file}: expected 1189 chapters, got ${data.chapters.length}`);
  if (data.books.some((b) => b.id === 'matthew')) {
    errors.push(`${file}: book id "matthew" is the Study Bible — plain Matthew must be "matthew-plain"`);
  }
  // Chapters must tile the verse space with no gap and no overlap.
  let cursor = 0;
  for (const [bookIdx, chapterNum, start, verses] of data.chapters) {
    if (start !== cursor) {
      errors.push(`${file}: chapter ${bookIdx}:${chapterNum} starts at ${start}, expected ${cursor}`);
      break;
    }
    if (!(verses > 0)) { errors.push(`${file}: chapter ${bookIdx}:${chapterNum} has ${verses} verses`); break; }
    cursor += verses;
  }
  if (!errors.length && cursor !== data.total) {
    errors.push(`${file}: chapters cover ${cursor} verses but total is ${data.total}`);
  }

  // Decode + reconstruct exactly the way the app does.
  const n = data.count;
  const u16 = (b64) => { const b = decode(b64); return new Uint16Array(b.buffer, b.byteOffset, n); };
  let dfrom, span, votes;
  try {
    dfrom = u16(data.dfrom64);
    span = u16(data.span64);
    const vb = decode(data.votes64);
    votes = new Int16Array(vb.buffer, vb.byteOffset, n);
  } catch (e) {
    errors.push(`${file}: typed-array decode failed — ${e.message}`);
    return { errors, warnings, count: 0 };
  }

  // Buckets must partition [0, count) in order, with monotonic tier offsets.
  let expect = 0;
  for (const [i, b] of data.buckets.entries()) {
    if (b.off !== expect) errors.push(`${file}: bucket[${i}] off=${b.off}, expected ${expect}`);
    if (b.off20 > b.off10) errors.push(`${file}: bucket[${i}] essential(${b.off20}) exceeds classic(${b.off10})`);
    if (b.off10 > b.len) errors.push(`${file}: bucket[${i}] classic(${b.off10}) exceeds len(${b.len})`);
    if (!(b.segments > 0)) errors.push(`${file}: bucket[${i}] has no segment count`);
    expect += b.len;
  }
  if (expect !== n) errors.push(`${file}: buckets cover ${expect} arcs but count is ${n}`);
  if (errors.length) return { errors, warnings, count: n };

  // Every reconstructed pair must be in range, non-degenerate, and unique.
  const seen = new Set();
  let bad = 0, dupes = 0, tierBreaks = 0;
  for (const b of data.buckets) {
    for (const [start, len] of deltaRuns(b)) {
      let acc = 0;
      for (let i = start; i < start + len; i++) {
        acc += dfrom[i];
        const from = acc, to = acc + span[i];
        if (from >= data.total || to >= data.total || from >= to) {
          if (bad++ === 0) errors.push(`${file}: arc ${i} out of range (${from} -> ${to}, total ${data.total})`);
          continue;
        }
        const key = from * (data.total + 1) + to;
        if (seen.has(key)) { if (dupes++ === 0) errors.push(`${file}: duplicate pair at arc ${i} (${from} -> ${to})`); }
        else seen.add(key);
        // Density tiers must stay contiguous — the UI draws [off, off+off20)
        // and [off, off+off10) as sub-ranges, so a stray weak arc inside the
        // essential run would be drawn as if it were strong.
        const rel = i - b.off;
        const tier = rel < b.off20 ? 0 : rel < b.off10 ? 1 : 2;
        const minVotes = tier === 0 ? data.densityTiers[0] : tier === 1 ? data.densityTiers[1] : -Infinity;
        if (votes[i] < minVotes) {
          if (tierBreaks++ === 0) {
            errors.push(`${file}: arc ${i} sits in tier ${tier} with votes ${votes[i]} (needs >= ${minVotes})`);
          }
        }
      }
    }
  }
  if (bad > 1) errors.push(`${file}: ${bad} arcs total out of range`);
  if (dupes > 1) errors.push(`${file}: ${dupes} duplicate pairs total`);
  if (tierBreaks > 1) errors.push(`${file}: ${tierBreaks} arcs total in the wrong density tier`);

  // VOT edges must land on real verses and name a resolvable destination.
  let edgeErrors = 0;
  for (const e of data.votEdges || []) {
    if (!(e.v >= 0 && e.v < data.total)) { edgeErrors++; continue; }
    if (!e.kind) { edgeErrors++; continue; }
    if (!e.volKey && !e.studyId) edgeErrors++;
  }
  if (edgeErrors) errors.push(`${file}: ${edgeErrors} votEdges are out of range or have no destination`);
  for (const p of data.prophecy || []) {
    if (!(p.a >= 0 && p.a < data.total && p.b >= 0 && p.b < data.total)) {
      errors.push(`${file}: prophecy pair out of range (${p.a} -> ${p.b})`);
      break;
    }
  }

  return { errors, warnings, count: n };
}

export function validateAgainstReference(books, reference, opts = {}) {
  const errors = [];
  const warnings = [];
  const fileName = opts.fileName || '(unknown)';
  const exceptions = new Set(opts.exceptions || []);

  if (!reference || typeof reference !== 'object' || Array.isArray(reference)) {
    warnings.push(`${fileName}: no reference translation available — cross-check skipped`);
    return { errors, warnings };
  }

  /** @type {Array<[string, any]>} */
  let bookList;
  if (Array.isArray(books)) {
    bookList = books.map((b) => [b && b.id, b]);
  } else if (books && typeof books === 'object' && Array.isArray(books.chapters)) {
    bookList = [[opts.singleBookId || books.id, books]];
  } else if (books && typeof books === 'object') {
    bookList = Object.entries(books);
  } else {
    errors.push(`${fileName}: expected an object or array of Format C books`);
    return { errors, warnings };
  }

  for (const [bookId, book] of bookList) {
    if (!book || !Array.isArray(book.chapters)) continue;
    const refBook = reference[bookId];
    if (!refBook || typeof refBook !== 'object') {
      warnings.push(`${fileName}: book "${bookId}" absent from reference — cross-check skipped`);
      continue;
    }
    for (const ch of book.chapters) {
      if (!ch || typeof ch.num !== 'number') continue;
      const refVerses = refBook[String(ch.num)];
      if (!Array.isArray(refVerses)) continue;          // reference lacks this chapter
      if (exceptions.has(`${bookId} ${ch.num}`)) continue;
      const have = new Set();
      for (const sec of (ch.sections || [])) {
        for (const v of (sec && Array.isArray(sec.verses) ? sec.verses : [])) {
          if (v && typeof v.n === 'number') have.add(v.n);
        }
      }
      const missing = [];
      for (const rv of refVerses) {
        if (rv && typeof rv.n === 'number' && !have.has(rv.n)) missing.push(rv.n);
      }
      if (missing.length) {
        errors.push(`${fileName}: ${bookId} ${ch.num} missing verse(s) ${compressRanges(missing)} — have ${have.size}, reference has ${refVerses.length}`);
      }
    }
  }
  return { errors, warnings };
}

/**
 * CORP2 — a translation MAP (Format E: `{ bookId: { chapNum: [{n,…}] } }`) must
 * contain every BOOK + CHAPTER the reference (BIBLE_KJV) has. The per-chapter
 * contiguity check (validateTranslationMap) iterates the translation's OWN
 * chapters, so it can't see a wholly-MISSING chapter; and now that the
 * alt-translations are offline-cached (SW1) a dropped chapter would ship + serve
 * offline. Presence-only: single-verse critical-text omissions are legitimate
 * variants (validateTranslationMap already WARNs on those gaps) and are NOT
 * errored here.
 *
 * @param {any} map        the translation map under test
 * @param {any} reference  BIBLE_KJV (same `{ bookId: { chapNum: verses[] } }` shape)
 * @param {{ fileName?: string }} [opts]
 * @returns {{ errors: string[], warnings: string[] }}
 */
export function validateTranslationCompleteness(map, reference, opts = {}) {
  const errors = [];
  const warnings = [];
  const fileName = opts.fileName || '(unknown)';
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    errors.push(`${fileName}: expected a translation map object`);
    return { errors, warnings };
  }
  if (!reference || typeof reference !== 'object' || Array.isArray(reference)) {
    warnings.push(`${fileName}: no KJV reference — completeness check skipped`);
    return { errors, warnings };
  }
  for (const bookId of Object.keys(reference)) {
    const refBook = reference[bookId];
    if (!refBook || typeof refBook !== 'object') continue;
    const tBook = map[bookId];
    if (!tBook || typeof tBook !== 'object') {
      errors.push(`${fileName}: missing book "${bookId}" (present in the KJV reference)`);
      continue;
    }
    for (const chNum of Object.keys(refBook)) {
      if (!Array.isArray(refBook[chNum])) continue;
      if (!Array.isArray(tBook[chNum])) {
        errors.push(`${fileName}: missing ${bookId} chapter ${chNum} (present in the KJV reference)`);
      }
    }
  }
  return { errors, warnings };
}

// ── c43 corpus gates (2026-09-03) ────────────────────────────────────────
// Three holes the 2026-09-01 review found in the translation data and its
// footnote quotations, closed here as pure functions the CLI runner wires in:
//   validateKjvInvariants      — the KJV reference keeps its canon AND its
//                                small-caps divine name (LORD / GOD / JEHOVAH)
//   validateTranslationVerseSet — every translation carries the reference's
//                                verse set, at BOTH chapter edges, allowlisted
//                                only with a named versification reason
//   validateTaggedDictValues   — a footnote value tagged with a bundled
//                                translation is that translation's text

/** The KJV as shipped: 66 books, 1,189 chapters, 31,102 verses. */
export const KJV_CANON = Object.freeze({ books: 66, chapters: 1189, verses: 31102 });

/**
 * Floors on the KJV's small-caps divine name. The 1769 text prints LORD for
 * the Tetragrammaton ~6,600 times, GOD in "Lord GOD" ~300 times and JEHOVAH
 * four times; the 2026-05-28 regeneration from getbible v2 (case-flattened)
 * collapsed them to 6 / 2 / 1 and no gate noticed for three months. Measured
 * after the c43 restore: LORD 6,574, GOD 310, JEHOVAH 5. The floors sit a
 * little under that so a future regeneration from a faithful source (which may
 * differ by a handful of gloss / superscription cases) still passes — a source
 * that flattens case fails by thousands. Never lower these to make a regen pass.
 */
export const KJV_DIVINE_NAME_FLOORS = Object.freeze({ LORD: 6500, GOD: 300, JEHOVAH: 4 });

/**
 * The KJV reference's own invariants: canonical totals + the divine-name floors.
 * @param {any} map  BIBLE_KJV
 * @param {{ fileName?: string, canon?: {books:number,chapters:number,verses:number}|null,
 *           floors?: Record<string, number> }} [opts]  canon:null skips the totals (fixtures)
 * @returns {{ errors: string[], warnings: string[], counts: Record<string, number> }}
 */
export function validateKjvInvariants(map, opts = {}) {
  const errors = [];
  const warnings = [];
  const fileName = opts.fileName || 'bible-kjv.js';
  const canon = 'canon' in opts ? opts.canon : KJV_CANON;
  const floors = opts.floors || KJV_DIVINE_NAME_FLOORS;
  /** @type {Record<string, number>} */
  const counts = { books: 0, chapters: 0, verses: 0 };
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    errors.push(`${fileName}: expected a translation map object`);
    return { errors, warnings, counts };
  }
  const res = {};
  for (const w of Object.keys(floors)) { counts[w] = 0; res[w] = new RegExp('\\b' + w + '\\b', 'g'); }
  for (const book of Object.values(map)) {
    if (!book || typeof book !== 'object' || Array.isArray(book)) continue;
    counts.books++;
    for (const ch of Object.values(book)) {
      if (!Array.isArray(ch)) continue;
      counts.chapters++;
      for (const v of ch) {
        counts.verses++;
        const t = v && typeof v.text === 'string' ? v.text : '';
        for (const w of Object.keys(floors)) {
          const m = t.match(res[w]);
          if (m) counts[w] += m.length;
        }
      }
    }
  }
  if (canon) {
    for (const k of ['books', 'chapters', 'verses']) {
      if (counts[k] !== canon[k]) errors.push(`${fileName}: ${counts[k]} ${k}, the KJV canon has ${canon[k]} — a regeneration dropped or added ${k}`);
    }
  }
  for (const [w, floor] of Object.entries(floors)) {
    if (counts[w] < floor) {
      errors.push(`${fileName}: "${w}" appears ${counts[w]} times, below the floor of ${floor}. The KJV prints the divine name in small caps (LORD for YHWH, GOD in "Lord GOD", JEHOVAH); a case-flattened source collapsed it on 2026-05-28. Restore the casing (see c43: the pre-regen blob, token-aligned) — do not lower the floor.`);
    }
  }
  return { errors, warnings, counts };
}

/**
 * The sixteen verses the Textus Receptus carries and the critical-text
 * translations (ASV, BSB, and four of them the WEB / HNV) omit or leave empty.
 * Keyed `bookId chapter:verse` in the Format E ids (Matthew is matthew-plain).
 * Any translation may lack these; nothing else is allowlisted for every file.
 */
export const TEXTUS_RECEPTUS_ONLY_VERSES = Object.freeze([
  'matthew-plain 17:21', 'matthew-plain 18:11', 'matthew-plain 23:14',
  'mark 7:16', 'mark 9:44', 'mark 9:46', 'mark 11:26', 'mark 15:28',
  'luke 17:36', 'luke 23:17',
  'john 5:4',
  'acts 8:37', 'acts 15:34', 'acts 24:7', 'acts 28:29',
  'romans 16:24',
]);

/**
 * Real versification differences, ruled on by the owner (review finding
 * data-corpus-4, decided 2026-09-04: route A). Recorded here so they stay
 * VISIBLE on every run instead of silently absent: the WEB and HNV print the
 * Romans doxology at 14:24-26, so their 16:25-27 have no text (the HNV ships
 * 16:25 as an empty string). The reader does NOT lose the doxology —
 * translations.js `_VERSIFICATION_ALIAS` renders those 14:24-26 rows under the
 * 16:25-27 references — so the verse-set difference is permanent and expected,
 * allowed for exactly these two files and nothing else. Add a row only for a
 * genuine versification difference with a `why` that names the evidence; a
 * translation that is simply MISSING a verse must error, not be listed here.
 */
export const VERSIFICATION_DIFFERENCES = Object.freeze([
  { file: 'bible-web.js', missing: ['romans 16:25', 'romans 16:26', 'romans 16:27'], extra: ['romans 14:24', 'romans 14:25', 'romans 14:26'], why: 'WEB prints the doxology at 14:24-26; translations.js _VERSIFICATION_ALIAS renders those rows at 16:25-27 (data-corpus-4, decided)' },
  { file: 'bible-hnv.js', missing: ['romans 16:25', 'romans 16:26', 'romans 16:27'], extra: ['romans 14:24', 'romans 14:25', 'romans 14:26'], why: 'HNV prints the doxology at 14:24-26 (16:25 ships empty); translations.js _VERSIFICATION_ALIAS renders those rows at 16:25-27 (data-corpus-4, decided)' },
]);

/**
 * The verse-set allowlist for one translation file: the Textus Receptus verses
 * (every file) plus that file's own versification differences.
 * @param {string} fileName  e.g. 'bible-web.js'
 * @returns {{ missing: Set<string>, extra: Set<string> }}
 */
export function verseSetAllowlist(fileName) {
  const missing = new Set(TEXTUS_RECEPTUS_ONLY_VERSES);
  const extra = new Set();
  for (const p of VERSIFICATION_DIFFERENCES) {
    if (p.file !== fileName) continue;
    for (const k of p.missing || []) missing.add(k);
    for (const k of p.extra || []) extra.add(k);
  }
  return { missing, extra };
}

/**
 * A translation map must carry the reference's VERSE SET, chapter by chapter —
 * not just its books and chapters (validateTranslationCompleteness) and not
 * just "no gap between two verses it does have" (validateVerseArray). That gap
 * check starts its comparison at the second verse and never looks past the
 * last, so a chapter that begins at verse 2 or stops one verse short passed
 * for months (ASV Song of Solomon 1:1, WEB/HNV Romans 16:25-27), and its 36
 * standing warnings for the Textus Receptus verses buried anything new. Here:
 * every reference verse must be present with non-empty text and every verse
 * present must be in the reference; an exception is an ERROR unless the
 * allowlist names it with a versification reason.
 *
 * @param {any} map        the translation under test
 * @param {any} reference  BIBLE_KJV
 * @param {{ fileName?: string, allow?: { missing: Set<string>, extra: Set<string> } }} [opts]
 * @returns {{ errors: string[], warnings: string[], checked: number, allowed: number }}
 */
export function validateTranslationVerseSet(map, reference, opts = {}) {
  const errors = [];
  const warnings = [];
  const fileName = opts.fileName || '(unknown)';
  const allow = opts.allow || verseSetAllowlist(fileName);
  let checked = 0;
  let allowed = 0;
  if (!map || typeof map !== 'object' || Array.isArray(map)) {
    errors.push(`${fileName}: expected a translation map object`);
    return { errors, warnings, checked, allowed };
  }
  if (!reference || typeof reference !== 'object' || Array.isArray(reference)) {
    warnings.push(`${fileName}: no KJV reference — verse-set check skipped`);
    return { errors, warnings, checked, allowed };
  }
  for (const bookId of Object.keys(reference)) {
    const refBook = reference[bookId];
    const tBook = map[bookId];
    if (!refBook || typeof refBook !== 'object' || !tBook || typeof tBook !== 'object') continue; // completeness owns missing books
    for (const chNum of Object.keys(refBook)) {
      const refCh = refBook[chNum];
      const tCh = tBook[chNum];
      if (!Array.isArray(refCh) || !Array.isArray(tCh)) continue; // completeness owns missing chapters
      const have = new Map();
      for (const v of tCh) if (v && typeof v.n === 'number') have.set(v.n, v);
      const refNs = new Set();
      for (const rv of refCh) {
        if (!rv || typeof rv.n !== 'number') continue;
        refNs.add(rv.n);
        checked++;
        const key = `${bookId} ${chNum}:${rv.n}`;
        const tv = have.get(rv.n);
        // A BLANK verse is NEVER allowlistable (data-corpus-6, 2026-09-04).
        // The allowlist grants permission to be ABSENT, and the two are not the
        // same thing: an absent verse falls through to the alias, the base hop
        // and finally the NKJV, while a blank one used to be handed back and
        // rendered as a numbered row with no scripture in it. Storing "we do
        // not carry this verse" as an empty string also makes the file claim a
        // verse it does not have. Leave the row out instead.
        if (tv && (typeof tv.text !== 'string' || tv.text.trim() === '')) {
          errors.push(`${fileName}: ${key} is present but BLANK — a verse this translation does not carry must be LEFT OUT, not stored as an empty string. The allowlist permits absence, never blankness; delete the row (${allow.missing.has(key) ? 'it is already allowlisted, so nothing else changes' : 'and allowlist the absence with a versification reason'}).`);
          continue;
        }
        if (!tv) {
          if (allow.missing.has(key)) { allowed++; continue; }
          errors.push(`${fileName}: ${key} is missing (the KJV reference has it) — the reader would see NKJV text under this translation's header; allowlist it in tools/validate-schemas.js only with a versification reason`);
        }
      }
      for (const n of have.keys()) {
        if (refNs.has(n)) continue;
        const key = `${bookId} ${chNum}:${n}`;
        if (allow.extra.has(key)) { allowed++; continue; }
        errors.push(`${fileName}: ${key} is an extra verse the KJV reference does not have — BibleChapterView walks the NKJV verse list, so it can never render`);
      }
    }
  }
  return { errors, warnings, checked, allowed };
}

/** Translation tags a footnote key may carry that name a BUNDLED bible-<code>.js. */
export const BUNDLED_TRANSLATION_TAGS = Object.freeze(['ASV', 'BSB', 'HNV', 'KJV', 'LSV', 'WEB', 'YLT']);
const _BUNDLED_TAG_RE = /\s*\((ASV|BSB|HNV|KJV|LSV|WEB|YLT)\)\s*$/i;
/** Quote + whitespace normalization for comparing a quoted verse to its source. */
function _normVerseText(s) {
  return String(s).replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
}
/** Join the bundled verse texts for one passage, or null when any verse is absent. */
function _bundledPassage(map, bookId, chapter, verse, verseEnd) {
  const ch = bookId && map && map[bookId] && map[bookId][String(chapter)];
  if (!Array.isArray(ch)) return null;
  const nums = verse == null ? ch.map((v) => v.n) : Array.from({ length: (verseEnd || verse) - verse + 1 }, (_, i) => verse + i);
  const out = [];
  for (const n of nums) {
    const v = ch.find((x) => x && x.n === n);
    if (!v || typeof v.text !== 'string') return null;
    out.push(v.text);
  }
  return out.join(' ');
}

/**
 * A footnote dict value whose KEY carries a bundled-translation tag
 * ("1 Corinthians 3:11 (HNV)") must be that translation's own text for that
 * passage — the sheet header names the translation, so the body must be it.
 * Three HNV-tagged values shipped WEB/NKJV wording ("Jesus Christ" for
 * "Yeshua the Messiah", "Hades" for "Sheol", "Yahweh" for "the LORD") and
 * nothing noticed. Compared after collapsing whitespace, unifying curly quotes
 * and dropping the "N. " verse markers a multi-verse value carries; a literal
 * newline in the value is its own error. Compound keys ("Psalm 40:7-8, Hebrews
 * 10:7 (KJV)") are split the way the renderer splits them; each " | " part may
 * carry a "Label — " prefix whose OWN tag decides its translation, and a
 * labelled part without a tag is the NKJV default (not checked here).
 *
 * @param {any[]} dicts  the owner's ref->text dicts (nkjv / scriptures)
 * @param {{ where?: string, translation: (tag: string) => any,
 *           bookIdFor?: (rawBook: string) => string|null }} opts
 *   translation: returns the bundled map for a tag (or null → skipped with a warning)
 *   bookIdFor:   raw book name → Format E book id (defaults to findBook)
 * @returns {{ errors: string[], warnings: string[], checked: number, skipped: number }}
 */
export function validateTaggedDictValues(dicts, opts) {
  const errors = [];
  const warnings = [];
  const where = (opts && opts.where) || '(unknown)';
  const translation = opts && opts.translation;
  const bookIdFor = (opts && opts.bookIdFor) || findBook;
  let checked = 0;
  let skipped = 0;
  for (const dict of dicts || []) {
    if (!dict || typeof dict !== 'object' || Array.isArray(dict)) continue;
    for (const [key, value] of Object.entries(dict)) {
      const km = String(key).match(_BUNDLED_TAG_RE);
      if (!km || typeof value !== 'string') continue;
      const keyTag = km[1].toUpperCase();
      checked++;
      if (/\n/.test(value)) errors.push(`[${where}] "${key}": the value carries a literal newline — footnote values are single-line strings`);
      const parts = splitCompoundRef(key.replace(_BUNDLED_TAG_RE, ''));
      if (parts.length === 0) { errors.push(`[${where}] "${key}": the reference does not parse`); continue; }
      const valueParts = value.includes(' | ') ? value.split(' | ') : [value];
      if (parts.length > 1 && valueParts.length !== parts.length) {
        errors.push(`[${where}] "${key}": ${parts.length} passages in the key but ${valueParts.length} " | " parts in the value`);
        continue;
      }
      for (let i = 0; i < parts.length; i++) {
        const p = parts[i].parsed;
        let body = valueParts[i] == null ? '' : valueParts[i];
        let tag = keyTag;
        const lm = body.match(/^([^|]{1,80}?)\s—\s([\s\S]*)$/);
        if (lm) {
          body = lm[2];
          const lt = lm[1].match(_BUNDLED_TAG_RE);
          if (lt) tag = lt[1].toUpperCase();
          else if (parts.length > 1) tag = null; // a labelled, untagged part reads NKJV
        }
        if (!tag) { skipped++; continue; }
        const map = typeof translation === 'function' ? translation(tag) : null;
        if (!map) { warnings.push(`[${where}] "${key}": bundled ${tag} unavailable — not compared`); continue; }
        const bookId = bookIdFor(p.rawBook);
        const expected = _bundledPassage(map, bookId, p.chapter, p.verse, p.verseEnd);
        if (expected == null) { errors.push(`[${where}] "${key}": ${parts[i].ref} does not resolve in the bundled ${tag}`); continue; }
        const got = _normVerseText(body.replace(/(?:^|(?<=\s))\d{1,3}\.\s+/g, ' '));
        const want = _normVerseText(expected);
        if (got !== want) {
          errors.push(`[${where}] "${key}": the value is not the bundled ${tag} text for ${parts[i].ref}\n         dict: ${got.slice(0, 160)}\n         ${tag.padEnd(4)}: ${want.slice(0, 160)}`);
        }
      }
    }
  }
  return { errors, warnings, checked, skipped };
}

// ── CLI runner ───────────────────────────────────────────────────

/** @type {Array<{file: string, arrayVar: string, prefaceVar?: string}>} */
const FORMAT_A_FILES = [
  { file: 'volume-one.js',      arrayVar: 'LETTERS_V1',      prefaceVar: 'LETTERS_V1_PREFACE' },
  { file: 'volume-two.js',      arrayVar: 'LETTERS',         prefaceVar: null },
  { file: 'volume-three.js',    arrayVar: 'LETTERS_V3',      prefaceVar: 'LETTERS_V3_PREFACE' },
  { file: 'volume-four.js',     arrayVar: 'LETTERS_V4',      prefaceVar: 'LETTERS_V4_PREFACE' },
  { file: 'volume-five.js',     arrayVar: 'LETTERS_V5',      prefaceVar: 'LETTERS_V5_PREFACE' },
  { file: 'volume-six.js',      arrayVar: 'LETTERS_V6',      prefaceVar: 'LETTERS_V6_PREFACE' },
  { file: 'volume-seven.js',    arrayVar: 'LETTERS_V7',      prefaceVar: 'LETTERS_V7_PREFACE' },
  { file: 'lords-rebuke.js',    arrayVar: 'LETTERS_REBUKE',  prefaceVar: 'LETTERS_REBUKE_PREFACE' },
  { file: 'letters-timothy.js', arrayVar: 'LETTERS_TIMOTHY', prefaceVar: 'LETTERS_TIMOTHY_PREFACE' },
  { file: 'letters-flock.js',   arrayVar: 'LETTERS_FLOCK',   prefaceVar: 'LETTERS_FLOCK_PREFACE' },
  { file: 'hidden-manna.js',    arrayVar: 'HIDDEN_MANNA',    prefaceVar: null },
];

/** @type {Array<{file: string, arrayVar: string, scripturesFile?: string, scripturesVar?: string}>} */
const FORMAT_B_FILES = [
  { file: 'wtlb-one.js',    arrayVar: 'WTLB_ONE',    scripturesFile: 'wtlb-scriptures.js', scripturesVar: 'WTLB_SCRIPTURES' },
  { file: 'wtlb-two.js',    arrayVar: 'WTLB_TWO',    scripturesFile: 'wtlb-scriptures.js', scripturesVar: 'WTLB_SCRIPTURES' },
  { file: 'the-blessed.js', arrayVar: 'THE_BLESSED', scripturesFile: 'the-blessed.js',     scripturesVar: 'THE_BLESSED_SCRIPTURES' },
];

const HOLY_DAYS_FILE = { file: 'holy-days.js', arrayVar: 'HOLY_DAYS' };

/** @type {Array<{file: string, arrayVar: string, chromeOnly?: boolean}>} */
const FORMAT_C_FILES = [
  { file: 'books.js',          arrayVar: 'BOOKS' },
  { file: 'matthew-plain.js',  arrayVar: 'MATTHEW_PLAIN' },
  { file: 'books-restored.js', arrayVar: 'BOOKS_RESTORED', chromeOnly: true },
];

const FORMAT_D_FILES = [
  { file: 'bible-studies.js', arrayVar: 'BIBLE_STUDIES' },
];

// Format E — distinct shapes from A-D, all now web-served. The translation
// verse maps share one shape (table below); matthew.js (MATTHEW Study Bible)
// and matthew-nkjv.js (ref->text dict) are single objects handled inline in
// the CLI Format E section.
/** @type {Array<{file: string, varName: string, sparse?: boolean}>} */
const FORMAT_E_TRANSLATIONS = [
  { file: 'bible-asv.js', varName: 'BIBLE_ASV' },
  { file: 'bible-bsb.js', varName: 'BIBLE_BSB' },
  { file: 'bible-hnv.js', varName: 'BIBLE_HNV' },
  { file: 'bible-kjv.js', varName: 'BIBLE_KJV' },
  { file: 'bible-lsv.js', varName: 'BIBLE_LSV' },
  { file: 'bible-web.js', varName: 'BIBLE_WEB' },
  { file: 'bible-ylt.js', varName: 'BIBLE_YLT' },
  // Restored-Name NT overlays (tools/gen-restored-nt.mjs) — sparse: only
  // changed verses; completeness is skipped, subset-vs-reference is enforced.
  { file: 'bible-rnkjv.js', varName: 'BIBLE_RNKJV', sparse: true },
  { file: 'bible-rkjv.js', varName: 'BIBLE_RKJV', sparse: true },
];

/**
 * Load a Format A data file via vm.runInNewContext and return the
 * letter array (and optional preface).
 */
function loadDataFile(filePath, arrayVar, prefaceVar) {
  const code = readFileSync(filePath, 'utf-8');
  const sandbox = {};
  runInNewContext(code, sandbox);
  const letters = sandbox[arrayVar];
  const preface = prefaceVar ? sandbox[prefaceVar] : null;
  return { letters, preface };
}

/** Run a data file in a fresh VM context and return one global variable. */
function loadVar(filePath, varName) {
  const code = readFileSync(filePath, 'utf-8');
  const sandbox = {};
  runInNewContext(code, sandbox);
  return sandbox[varName];
}

/** Print a validation result + per-file status line. */
function emit(result, label, count, noun, extra) {
  for (const e of result.errors) console.error(`  ERROR: ${e}`);
  for (const w of result.warnings) console.warn(`  WARN:  ${w}`);
  const status = result.errors.length === 0 ? 'OK' : 'FAIL';
  console.log(`  ${label}: ${count} ${noun}${extra || ''} — ${status} (${result.errors.length} errors, ${result.warnings.length} warnings)`);
}

/* ── Word-count baseline (2026-08-03) ─────────────────────────────────
   A per-item word-count ledger built while the collections load anyway,
   compared against tools/word-count-baseline.json. Any unintended
   content loss or duplication in a corpus edit shifts a count, so this
   catches the c9–c18 class of defect (eaten paragraphs, dropped header
   lines, doubled refs) BETWEEN full audits, at zero runtime cost — the
   baseline never ships in a bundle. Deliberate edits regenerate with:
     node tools/validate-schemas.js --update-wordcounts
   Scope: hand-edited prose (Formats A/B/D + Holy Days + Matthew study)
   plus the NKJV base + matthew-plain + books-restored text. Generated
   translation maps are excluded — validateTranslationCompleteness
   already guards those, and their generator owns their content. */
function _createWordLedger() {
  /** @type {Record<string, Record<string, number>>} */
  const byCollection = {};
  return {
    add(collection, id, words) {
      const c = byCollection[collection] || (byCollection[collection] = {});
      // Duplicate ids within a file are a validator error elsewhere; last
      // write wins here so the ledger stays total-stable regardless.
      c[String(id)] = words;
    },
    /** Sorted-keys snapshot for byte-stable diffs. */
    snapshot() {
      /** @type {Record<string, Record<string, number>>} */
      const out = {};
      for (const c of Object.keys(byCollection).sort()) {
        /** @type {Record<string, number>} */
        const items = {};
        for (const id of Object.keys(byCollection[c]).sort()) items[id] = byCollection[c][id];
        out[c] = items;
      }
      return out;
    },
  };
}

function runCli() {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
  const reportOnly = args.includes('--report-only');
  const updateWordcounts = args.includes('--update-wordcounts');
  const wordLedger = _createWordLedger();
  const dataDir = resolve(
    fileURLToPath(import.meta.url), '..', '..', 'app', 'src', 'main', 'assets', 'src', 'data'
  );

  const totals = { items: 0, errors: 0, warnings: 0 };
  // CORP-2: registry of resolvable letter targets (registryLabel::title) + the
  // cross-refs to verify against it once every collection has loaded.
  const xrefRegistry = new Set();
  /** @type {Array<{ collection: string, letterTitle: string, where: string }>} */
  const xrefs = [];
  // Format-D (Bible Studies) letter-link cross-refs. Checked as WARNINGS, not
  // errors: the study renderer navigates by letterId+screen (Segments path b),
  // so seg.link here is currently UNUSED — a casing variant is latent, not a live
  // dead link. Surfaced so it can't silently rot if the renderer ever switches.
  /** @type {Array<{ collection: string, letterTitle: string, where: string }>} */
  const studyXrefs = [];
  // Blank-footnote gate: every content owner (letter / entry / study chapter)
  // is collected here so the Bible-ref resolution pass (runs last, once the
  // Bible corpus is loaded) can prove its scripture footnotes + inline
  // {{ref:…}} cites all produce verse content at runtime.
  /** @type {Array<{ where: string, owner: any, dicts: any[] }>} */
  const refOwners = [];
  const registerTitle = (rl, item) => { if (rl && item && typeof item.title === 'string') xrefRegistry.add(rl + '::' + item.title); };
  const add = (result, n) => {
    totals.errors += result.errors.length;
    totals.warnings += result.warnings.length;
    totals.items += n;
  };
  const loadErr = (label, msg) => { console.error(`LOAD ERROR: ${label}: ${msg}`); totals.errors++; };

  // ── Format A ──
  console.log('Format A (letters):');
  for (const entry of FORMAT_A_FILES) {
    const label = basename(entry.file);
    let data;
    try { data = loadDataFile(resolve(dataDir, entry.file), entry.arrayVar, entry.prefaceVar); }
    catch (e) { loadErr(label, e.message); continue; }
    const { letters, preface } = data;
    if (!Array.isArray(letters)) { loadErr(label, `variable "${entry.arrayVar}" is not an array`); continue; }
    if (preface && typeof preface === 'object' && !Array.isArray(preface)) {
      const prefRes = validateFormatA([preface], { strict, fileName: `${label}(preface)` });
      add(prefRes, 1);
      for (const e of prefRes.errors) console.error(`  ERROR: ${e}`);
      for (const w of prefRes.warnings) console.warn(`  WARN:  ${w}`);
    }
    const result = validateFormatA(letters, { strict, fileName: label });
    add(result, letters.length);
    emit(result, label, letters.length, 'letters', preface ? ' + preface' : '');
    // CORP-2: register this collection's titles + collect its cross-refs.
    const rl = GLOBAL_TO_REGISTRY.get(entry.arrayVar);
    if (rl) {
      registerTitle(rl, preface);
      if (preface) for (const x of walkLetterXrefs(preface)) xrefs.push(x);
      for (const L of letters) { registerTitle(rl, L); for (const x of walkLetterXrefs(L)) xrefs.push(x); }
    }
    if (preface) refOwners.push({ where: `${label}(preface)`, owner: preface, dicts: [preface.nkjv] });
    for (const L of letters) refOwners.push({ where: `${label} "${L.id || L.title || '?'}"`, owner: L, dicts: [L.nkjv] });
    if (preface) wordLedger.add(label, preface.id || '(preface)', countItemWords(preface));
    for (const L of letters) wordLedger.add(label, L.id || L.title, countItemWords(L));
  }

  // ── Format B ──
  console.log('\nFormat B (WTLB / The Blessed):');
  for (const entry of FORMAT_B_FILES) {
    const label = basename(entry.file);
    let entries, scriptures = null;
    try {
      entries = loadVar(resolve(dataDir, entry.file), entry.arrayVar);
      if (entry.scripturesFile) scriptures = loadVar(resolve(dataDir, entry.scripturesFile), entry.scripturesVar);
    } catch (e) { loadErr(label, e.message); continue; }
    if (!Array.isArray(entries)) { loadErr(label, `variable "${entry.arrayVar}" is not an array`); continue; }
    const result = validateFormatB(entries, { strict, fileName: label, scriptures });
    add(result, entries.length);
    emit(result, label, entries.length, 'entries', '');
    // CORP-2: WTLB / Blessed entries are cross-ref TARGETS (register their titles);
    // their own cross-refs are text-embedded attributions, not structured links.
    const rlB = GLOBAL_TO_REGISTRY.get(entry.arrayVar);
    if (rlB) for (const e of entries) registerTitle(rlB, e);
    for (const e of entries) refOwners.push({ where: `${label} "${e.id || e.title || '?'}"`, owner: e, dicts: [e.scriptures, scriptures] });
    for (const e of entries) wordLedger.add(label, e.id || e.title, countItemWords(e));
  }

  // ── Holy Days (hybrid) ──
  console.log('\nHoly Days (hybrid album):');
  {
    const label = basename(HOLY_DAYS_FILE.file);
    let entries;
    try { entries = loadVar(resolve(dataDir, HOLY_DAYS_FILE.file), HOLY_DAYS_FILE.arrayVar); }
    catch (e) { loadErr(label, e.message); entries = undefined; }
    if (Array.isArray(entries)) {
      const result = validateHolyDays(entries, { strict, fileName: label });
      add(result, entries.length);
      emit(result, label, entries.length, 'entries', '');
      // CORP-2: Holy Days clones are both targets AND carry Format-A cross-refs
      // (their footnotes/seeAlso point back at the originals).
      const rlH = GLOBAL_TO_REGISTRY.get(HOLY_DAYS_FILE.arrayVar);
      if (rlH) for (const e of entries) { registerTitle(rlH, e); for (const x of walkLetterXrefs(e)) xrefs.push(x); }
      for (const e of entries) refOwners.push({ where: `${label} "${e.id || e.title || '?'}"`, owner: e, dicts: [e.nkjv, e.scriptures] });
      for (const e of entries) wordLedger.add(label, e.id || e.title, countItemWords(e));
    } else if (entries !== undefined) {
      loadErr(label, `variable "${HOLY_DAYS_FILE.arrayVar}" is not an array`);
    }
  }

  // ── Format C ──
  console.log('\nFormat C (Bible books):');
  for (const entry of FORMAT_C_FILES) {
    const label = basename(entry.file);
    let books;
    try { books = loadVar(resolve(dataDir, entry.file), entry.arrayVar); }
    catch (e) { loadErr(label, e.message); continue; }
    if (!books || typeof books !== 'object') { loadErr(label, `variable "${entry.arrayVar}" is not an object`); continue; }
    const result = validateFormatC(books, { strict, fileName: label, chromeOnly: entry.chromeOnly });
    const n = Array.isArray(books) ? books.length : (books.chapters ? 1 : Object.keys(books).length);
    add(result, n);
    emit(result, label, n, 'books', entry.chromeOnly ? ' (chrome)' : '');
    // Word ledger: one entry per chapter (chromeOnly files count their
    // heading/title chrome — that overlay text is audited content too).
    {
      const bookArr = Array.isArray(books) ? books : (books.chapters ? [books] : Object.values(books));
      for (const b of bookArr) {
        if (!b || !Array.isArray(b.chapters)) continue;
        for (const ch of b.chapters) wordLedger.add(label, `${b.id || '?'}:${ch && ch.num}`, countItemWords(ch));
      }
    }
  }

  // ── Format D ──
  console.log('\nFormat D (Bible Studies):');
  for (const entry of FORMAT_D_FILES) {
    const label = basename(entry.file);
    let studies;
    try { studies = loadVar(resolve(dataDir, entry.file), entry.arrayVar); }
    catch (e) { loadErr(label, e.message); continue; }
    if (!Array.isArray(studies)) { loadErr(label, `variable "${entry.arrayVar}" is not an array`); continue; }
    const result = validateFormatD(studies, { strict, fileName: label });
    add(result, studies.length);
    emit(result, label, studies.length, 'studies', '');
    collectLetterLinksDeep(studies, studyXrefs);   // CORP-2 (Format D, warn-only)
    // Study chapters are letter-shaped content owners (blocks + footnotes +
    // nkjv) nested inside parts — walk them out for the Bible-ref pass.
    {
      const seen = new Set();
      (function collect(n) {
        if (!n || typeof n !== 'object' || seen.has(n)) return;
        seen.add(n);
        if (Array.isArray(n)) { n.forEach(collect); return; }
        if ((n.blocks || n.paragraphs) && (n.id || n.title)) {
          refOwners.push({ where: `${label} "${n.id || n.title}"`, owner: n, dicts: [n.nkjv, n.scriptures] });
          wordLedger.add(label, n.id || n.title, countItemWords(n));
          return;
        }
        for (const k of Object.keys(n)) collect(n[k]);
      })(studies);
    }
  }

  // ── Format E (translations / Study Bible / ref dicts) ──
  console.log('\nFormat E (translations / Study Bible / ref dicts):');
  // CORP2: load the KJV reference once so each alt-translation can be checked for a
  // wholly-MISSING book/chapter. Best-effort — completeness is skipped if it won't load.
  let xlatRef = null;
  try { xlatRef = loadVar(resolve(dataDir, 'bible-kjv.js'), 'BIBLE_KJV'); } catch (_e) { /* completeness skipped */ }
  for (const entry of FORMAT_E_TRANSLATIONS) {
    const label = basename(entry.file);
    let map;
    try { map = loadVar(resolve(dataDir, entry.file), entry.varName); }
    catch (e) { loadErr(label, e.message); continue; }
    if (!map || typeof map !== 'object' || Array.isArray(map)) { loadErr(label, `variable "${entry.varName}" is not an object`); continue; }
    // c43: a full translation checked against the KJV reference gets the
    // verse-set gate below, which owns every gap (both edges) with an
    // allowlist — so the adjacent-pair warning is silenced for it.
    const fullVsRef = !!xlatRef && entry.varName !== 'BIBLE_KJV' && !entry.sparse;
    const result = validateTranslationMap(map, { strict, fileName: label, sparse: entry.sparse, quietGaps: fullVsRef });
    let verseSetNote = '';
    // CORP2: also require every KJV book/chapter to be present (kjv-vs-kjv is
    // trivially complete, so skip it; sparse overlays are incomplete BY DESIGN
    // and get the inverse subset check instead). Merged into `result` so it
    // counts + prints on the same line.
    if (fullVsRef) {
      const comp = validateTranslationCompleteness(map, xlatRef, { fileName: label });
      result.errors.push(...comp.errors);
      result.warnings.push(...comp.warnings);
      // c43: the verse SET, both chapter edges, allowlisted only with a reason.
      const vs = validateTranslationVerseSet(map, xlatRef, { fileName: label });
      result.errors.push(...vs.errors);
      result.warnings.push(...vs.warnings);
      verseSetNote = `, verse set vs KJV: ${vs.checked} checked, ${vs.allowed} allowlisted`;
    }
    if (entry.varName === 'BIBLE_KJV') {
      // c43: the reference itself — canon totals + the small-caps divine name.
      const inv = validateKjvInvariants(map, { fileName: label });
      result.errors.push(...inv.errors);
      result.warnings.push(...inv.warnings);
      verseSetNote = `, canon ${inv.counts.books}/${inv.counts.chapters}/${inv.counts.verses}, LORD ${inv.counts.LORD} GOD ${inv.counts.GOD} JEHOVAH ${inv.counts.JEHOVAH}`;
    }
    if (xlatRef && entry.sparse) {
      const sub = validateOverlaySubset(map, xlatRef, { fileName: label });
      result.errors.push(...sub.errors);
      result.warnings.push(...sub.warnings);
    }
    const nBooks = Object.keys(map).length;
    add(result, nBooks);
    emit(result, label, nBooks, 'books', verseSetNote);
  }
  {
    const label = 'matthew.js';
    let study;
    try { study = loadVar(resolve(dataDir, 'matthew.js'), 'MATTHEW'); }
    catch (e) { loadErr(label, e.message); study = undefined; }
    if (study && typeof study === 'object' && !Array.isArray(study)) {
      const result = validateStudyBible(study, { strict, fileName: label });
      const nCh = Array.isArray(study.chapters) ? study.chapters.length : 0;
      add(result, nCh);
      emit(result, label, nCh, 'chapters', '');
      for (const ch of study.chapters || []) wordLedger.add(label, `matthew:${ch && ch.num}`, countItemWords(ch));
    } else if (study !== undefined) {
      loadErr(label, 'variable "MATTHEW" is not an object');
    }
  }
  {
    const label = 'matthew-nkjv.js';
    let dict;
    try { dict = loadVar(resolve(dataDir, 'matthew-nkjv.js'), 'MATTHEW_NKJV'); }
    catch (e) { loadErr(label, e.message); dict = undefined; }
    if (dict && typeof dict === 'object' && !Array.isArray(dict)) {
      const result = validateScriptureDict(dict, { strict, fileName: label });
      const nRefs = Object.keys(dict).length;
      add(result, nRefs);
      emit(result, label, nRefs, 'refs', '');
    } else if (dict !== undefined) {
      loadErr(label, 'variable "MATTHEW_NKJV" is not an object');
    }
  }

  // ── Cross-reference (Format C verse counts vs the complete KJV) ──
  // Catches MISSING verses the per-file contiguity check can't (trailing /
  // leading gaps). Errors here count toward the strict-mode exit.
  console.log('\nCross-reference (verse counts vs KJV):');
  {
    let reference = null;
    try { reference = loadVar(resolve(dataDir, 'bible-kjv.js'), 'BIBLE_KJV'); }
    catch (e) { console.warn(`  WARN:  bible-kjv.js failed to load — cross-check skipped: ${e.message}`); totals.warnings++; }
    if (reference) {
      const xrefTargets = [
        { file: 'books.js',         arrayVar: 'BOOKS',         opts: {} },
        { file: 'matthew-plain.js', arrayVar: 'MATTHEW_PLAIN', opts: { singleBookId: 'matthew-plain' } },
      ];
      for (const t of xrefTargets) {
        const label = basename(t.file);
        let data;
        try { data = loadVar(resolve(dataDir, t.file), t.arrayVar); }
        catch (e) { loadErr(label, e.message); continue; }
        const result = validateAgainstReference(data, reference, { fileName: label, ...t.opts });
        add(result, 0);
        for (const e of result.errors) console.error(`  ERROR: ${e}`);
        for (const w of result.warnings) console.warn(`  WARN:  ${w}`);
        const status = result.errors.length === 0 ? 'OK' : 'FAIL';
        console.log(`  ${label}: vs KJV — ${status} (${result.errors.length} errors, ${result.warnings.length} warnings)`);
      }
    }
  }

  // ── Footnote verse markers (every multi-verse value renders gold) ──
  console.log('\nFootnote verse markers (multi-verse values must carry explicit markers):');
  let fnErrors = 0;
  let fnChecked = 0;
  const checkFn = (dict, label) => {
    const r = validateFootnoteMarkers(dict, { fileName: label });
    add(r, 0); // errors/warnings count toward the gate; items already counted above
    fnChecked += Object.keys(dict || {}).length;
    fnErrors += r.errors.length;
    for (const e of r.errors) console.error(`  ERROR: ${e}`);
    for (const w of r.warnings) console.warn(`  WARN:  ${w}`);
  };
  for (const entry of FORMAT_A_FILES) {
    let data;
    try { data = loadDataFile(resolve(dataDir, entry.file), entry.arrayVar, entry.prefaceVar); }
    catch (e) { loadErr(basename(entry.file), e.message); continue; }
    const all = Array.isArray(data.letters) ? data.letters.slice() : [];
    if (data.preface && typeof data.preface === 'object') all.push(data.preface);
    for (const letter of all) {
      if (letter && letter.nkjv) checkFn(letter.nkjv, `${basename(entry.file)} "${letter.id || letter.title || '?'}"`);
    }
  }
  for (const src of [
    { file: 'wtlb-scriptures.js', varName: 'WTLB_SCRIPTURES' },
    { file: 'the-blessed.js', varName: 'THE_BLESSED_SCRIPTURES' },
    { file: 'matthew-nkjv.js', varName: 'MATTHEW_NKJV' },
  ]) {
    let dict;
    try { dict = loadVar(resolve(dataDir, src.file), src.varName); }
    catch (e) { loadErr(basename(src.file), e.message); continue; }
    if (dict) checkFn(dict, basename(src.file));
  }
  console.log(`  ${fnChecked} footnote values — ${fnErrors === 0 ? 'OK' : 'FAIL'} (${fnErrors} errors)`);

  // ── CORP-2: cross-reference resolution (runs last — every collection loaded) ──
  console.log('\nCross-reference resolution (CORP-2):');
  let xrefErrors = 0;
  let xrefVotChecked = 0;
  for (const x of xrefs) {
    if (xrefRegistry.has(x.collection + '::' + x.letterTitle)) { xrefVotChecked++; continue; } // resolves
    if (VOT_REGISTRY_LABELS.has(x.collection)) {
      xrefVotChecked++;
      console.error(`  ERROR: dead cross-ref [${x.where}] → "${x.collection}::${x.letterTitle}" — collection is a real registryLabel but no letter has that title (renamed/removed letter, or a typo).`);
      xrefErrors++;
    } else if (VOT_DISPLAY_LABELS.has(x.collection)) {
      xrefVotChecked++;
      console.error(`  ERROR: dead cross-ref [${x.where}] → "${x.collection}::${x.letterTitle}" — collection is the DISPLAY label; resolveVotLetter keys by registryLabel, so this "Also read" is a silent no-op (the CORP-1 class). Use the COLLECTIONS registryLabel.`);
      xrefErrors++;
    } else if (NORM_TO_REGISTRY.has(_normLabel(x.collection))) {
      xrefVotChecked++;
      console.error(`  ERROR: dead cross-ref [${x.where}] → "${x.collection}::${x.letterTitle}" — collection is a casing/apostrophe variant of "${NORM_TO_REGISTRY.get(_normLabel(x.collection))}"; use the exact registryLabel (the CORP-1 class).`);
      xrefErrors++;
    }
    // else: collection is not a VOT collection (Bible-Study / external link) → not a letter cross-ref; skip.
  }
  totals.errors += xrefErrors;
  totals.items += xrefVotChecked;
  console.log(`  ${xrefVotChecked} VOT-letter cross-refs checked (of ${xrefs.length} link objects) — ${xrefErrors === 0 ? 'OK' : 'FAIL'} (${xrefErrors} unresolved)`);
  // Format-D study links — WARN (not error) on a casing/display variant of a real
  // registryLabel (the seg.link is currently unused, so it's latent not live).
  let studyWarns = 0;
  for (const x of studyXrefs) {
    if (VOT_REGISTRY_LABELS.has(x.collection)) continue;          // exact registryLabel → fine
    const variant = NORM_TO_REGISTRY.get(_normLabel(x.collection));
    if (variant || VOT_DISPLAY_LABELS.has(x.collection)) {
      console.warn(`  WARN:  [${x.where}] collection "${x.collection}" should be the exact registryLabel${variant ? ` "${variant}"` : ''} — harmless today (study links nav by letterId+screen) but a latent dead-link if the renderer ever uses seg.link.`);
      studyWarns++;
    }
    // else: collection isn't a VOT collection at all (Bible-Study self-ref) → skip.
  }
  totals.warnings += studyWarns;
  console.log(`  ${studyXrefs.length} Format-D study links checked — ${studyWarns} casing/label warning(s).`);

  // ── Bible-ref resolution (blank-footnote gate, 2026-07-19) ──────
  // Every scripture footnote ref and inline {{ref:…}} cite must produce verse
  // content at runtime: either its owner's dict carries non-empty text, or the
  // ref resolves against the bundled NKJV Bible (book + chapter + every named
  // verse exist — the lookupVersesFromBooks chain, incl. its whole-chapter
  // path for chapter-only refs). Catches the "Matthew 19:36" class (a typo'd
  // verse with an empty dict value → a blank sheet) and proves the pure
  // validator's chapter-only nkjv exemption safe.
  console.log('\nBible-ref resolution (footnote + inline {{ref}} content):');
  {
    let books = null;
    try {
      books = loadVar(resolve(dataDir, 'books.js'), 'BOOKS');
      const mp = loadVar(resolve(dataDir, 'matthew-plain.js'), 'MATTHEW_PLAIN');
      if (books && mp) books['matthew-plain'] = mp; // mirror tools/build.py's corpus merge
    } catch (e) { console.warn(`  WARN:  Bible corpus failed to load — resolution pass skipped: ${e.message}`); totals.warnings++; }
    if (books) {
      // findBook reads window.__ALL_BOOKS at call time (the app's runtime
      // contract) — point it at the freshly loaded corpus for this pass.
      if (typeof globalThis.window === 'undefined') globalThis.window = globalThis;
      globalThis.window.__ALL_BOOKS = books;
      const chapterVerses = (bookKey, chapter) => {
        const b = books[bookKey];
        const ch = b && Array.isArray(b.chapters) ? b.chapters.find((c) => c.num === chapter) : null;
        if (!ch) return null;
        return ch.sections ? ch.sections.flatMap((s) => s.verses || []) : (ch.verses || []);
      };
      // Compound refs ("Isaiah 40:13; Romans 11:34") split on ';' exactly like
      // lookupVersesFromBooks — every part must resolve.
      const resolvesInBible = (ref) => String(ref).split(';').every((part) => {
        const p = parseRefStr(part.trim());
        if (!p) return false;
        const bookKey = findBook(p.rawBook);
        const verses = bookKey ? chapterVerses(bookKey, p.chapter) : null;
        if (!verses || verses.length === 0) return false;
        if (p.verse == null) return true; // chapter-only → the whole chapter
        const has = (n) => verses.some((v) => v.n === n);
        return has(p.verse) && (p.verseEnd == null || has(p.verseEnd));
      });
      let checked = 0;
      let refErrors = 0;
      const refRe = /\{\{ref:([^}]+)\}\}/g;
      for (const { where, owner, dicts } of refOwners) {
        const dictList = dicts.filter((d) => d && typeof d === 'object' && !Array.isArray(d));
        const dictText = (ref) => dictList.some((d) => String(d[ref] || '').trim().length > 0);
        const fail = (ref, kind) => {
          console.error(`  ERROR: [${where}] ${kind} "${ref}" has no dict text and does not resolve in the Bible corpus — renders a BLANK sheet.`);
          refErrors++;
        };
        const failCompound = (ref, kind, gaps) => {
          console.error(`  ERROR: [${where}] ${kind} "${ref}" — no tap target for: ${gaps.join(' | ')} (splitCompoundRef drops them).`);
          refErrors++;
        };
        for (const fn of Object.values(owner.footnotes || {})) {
          if (fn && fn.type === 'scripture' && typeof fn.ref === 'string' && fn.ref) {
            checked++;
            if (!dictText(fn.ref) && !resolvesInBible(fn.ref)) fail(fn.ref, 'scripture footnote');
            const gaps = compoundRefGaps(fn.ref);
            if (gaps.length) failCompound(fn.ref, 'scripture footnote', gaps);
          }
        }
        // inline {{ref:…}} anywhere in the owner's rendered content (block
        // segments, paragraphs, headers) — the dict subtrees themselves are
        // skipped (verse text, not markup).
        const seen = new Set();
        (function walk(n) {
          if (n == null) return;
          if (typeof n === 'string') {
            for (const m of n.matchAll(refRe)) {
              const ref = m[1].trim();
              checked++;
              if (!dictText(ref) && !resolvesInBible(ref)) fail(ref, 'inline {{ref}}');
              const gaps = compoundRefGaps(ref);
              if (gaps.length) failCompound(ref, 'inline {{ref}}', gaps);
            }
            return;
          }
          if (typeof n !== 'object' || seen.has(n)) return;
          seen.add(n);
          if (Array.isArray(n)) { n.forEach(walk); return; }
          for (const k of Object.keys(n)) { if (k !== 'nkjv' && k !== 'scriptures') walk(n[k]); }
        })(owner);
        // an EMPTY dict value whose ref can't resolve from the Bible either is
        // a guaranteed blank (the runtime falls through '' to the corpus)
        for (const d of dictList) {
          for (const [ref, txt] of Object.entries(d)) {
            if (!String(txt || '').trim() && !resolvesInBible(ref)) {
              console.error(`  ERROR: [${where}] dict entry "${ref}" is EMPTY and does not resolve in the Bible corpus.`);
              refErrors++;
            }
          }
        }
      }
      totals.errors += refErrors;
      // c43: a value tagged with a bundled translation must BE that translation.
      {
        const xlatCache = { KJV: xlatRef || null };
        const translation = (tag) => {
          if (!(tag in xlatCache)) {
            try { xlatCache[tag] = loadVar(resolve(dataDir, `bible-${tag.toLowerCase()}.js`), `BIBLE_${tag}`) || null; }
            catch (_e) { xlatCache[tag] = null; }
          }
          return xlatCache[tag];
        };
        let tagChecked = 0;
        let tagSkipped = 0;
        let tagErrors = 0;
        for (const { where, dicts } of refOwners) {
          const r = validateTaggedDictValues(dicts, { where, translation });
          tagChecked += r.checked;
          tagSkipped += r.skipped;
          for (const e of r.errors) console.error(`  ERROR: ${e}`);
          for (const w of r.warnings) console.warn(`  WARN:  ${w}`);
          tagErrors += r.errors.length;
          totals.warnings += r.warnings.length;
        }
        totals.errors += tagErrors;
        console.log(`  ${tagChecked} translation-tagged footnote values compared with their bundled translation (${tagSkipped} labelled NKJV parts skipped) — ${tagErrors === 0 ? 'OK' : 'FAIL'} (${tagErrors} differ)`);
      }
      totals.items += checked;
      console.log(`  ${checked} refs checked across ${refOwners.length} content owners — ${refErrors === 0 ? 'OK' : 'FAIL'} (${refErrors} unresolvable)`);
      delete globalThis.window.__ALL_BOOKS;
    }
  }

  // ── Scripture Web graph asset ──
  {
    const swPath = resolve(dataDir, 'scripture-web-data.js');
    if (existsSync(swPath)) {
      console.log('\nScripture Web graph asset:');
      let data = null;
      try { data = loadVar(swPath, 'SCRIPTURE_WEB_DATA'); }
      catch (e) { console.error(`  ERROR: failed to load — ${e.message}`); totals.errors++; }
      if (data) {
        const r = validateScriptureWeb(data, { fileName: 'scripture-web-data.js' });
        for (const e of r.errors) console.error(`  ERROR: ${e}`);
        for (const w of r.warnings) console.warn(`  WARN:  ${w}`);
        totals.errors += r.errors.length;
        totals.warnings += r.warnings.length;
        totals.items += r.count;
        console.log(`  ${r.count.toLocaleString()} cross-references + ` +
          `${(data.votEdges || []).length} VOT edges checked — ` +
          `${r.errors.length === 0 ? 'OK' : 'FAIL'}`);
      }
    }
  }

  // ── Scripture Web node-position buffer ──
  {
    const posPath = resolve(dataDir, 'scripture-web-positions.js');
    if (existsSync(posPath)) {
      console.log('\nScripture Web node positions:');
      let pos = null, edges = null;
      try { pos = loadVar(posPath, 'SCRIPTURE_WEB_POSITIONS'); }
      catch (e) { console.error(`  ERROR: failed to load — ${e.message}`); totals.errors++; }
      // The cross-check's other side. Loaded here, not passed in, so the gate
      // balances the buffer against the EDGE ASSET rather than against anything
      // the position generator wrote.
      const swPath2 = resolve(dataDir, 'scripture-web-data.js');
      if (existsSync(swPath2)) { try { edges = loadVar(swPath2, 'SCRIPTURE_WEB_DATA'); } catch { /* reported above */ } }
      if (pos) {
        const r = validateScriptureWebPositions(pos, edges, { fileName: 'scripture-web-positions.js' });
        for (const e of r.errors) console.error(`  ERROR: ${e}`);
        for (const w of r.warnings) console.warn(`  WARN:  ${w}`);
        totals.errors += r.errors.length;
        totals.warnings += r.warnings.length;
        totals.items += r.count;
        console.log(`  ${r.count.toLocaleString()} node positions (layout "${pos.layout}", ` +
          `${r.coincident} coincident) — ${r.errors.length === 0 ? 'OK' : 'FAIL'}`);
      }
    }
  }

  // ── Word-count baseline gate ──
  {
    const baselinePath = resolve(fileURLToPath(import.meta.url), '..', 'word-count-baseline.json');
    const snap = wordLedger.snapshot();
    if (updateWordcounts) {
      writeFileSync(baselinePath, JSON.stringify(snap, null, 1) + '\n');
      let items = 0, words = 0;
      for (const c of Object.values(snap)) for (const w of Object.values(c)) { items++; words += w; }
      console.log(`\nWord-count baseline: WROTE ${basename(baselinePath)} — ${items} items, ${words.toLocaleString()} words.`);
    } else if (existsSync(baselinePath)) {
      /** @type {Record<string, Record<string, number>>} */
      let base;
      try { base = JSON.parse(readFileSync(baselinePath, 'utf8')); }
      catch (e) { base = {}; console.error(`  ERROR: word-count baseline unreadable: ${e.message}`); totals.errors++; }
      const diffs = [];
      const cols = new Set([...Object.keys(base), ...Object.keys(snap)]);
      for (const c of cols) {
        const b = base[c] || {}, s = snap[c] || {};
        for (const id of new Set([...Object.keys(b), ...Object.keys(s)])) {
          if (b[id] === s[id]) continue;
          if (b[id] === undefined) diffs.push(`${c} :: ${id} — NEW item (${s[id]} words)`);
          else if (s[id] === undefined) diffs.push(`${c} :: ${id} — MISSING (baseline had ${b[id]} words)`);
          else diffs.push(`${c} :: ${id} — ${b[id]} → ${s[id]} words (${s[id] - b[id] > 0 ? '+' : ''}${s[id] - b[id]})`);
        }
      }
      if (diffs.length) {
        console.error(`\nWord-count baseline: ${diffs.length} item(s) drifted from ${basename(baselinePath)}.`);
        console.error('An INTENDED edit regenerates with: node tools/validate-schemas.js --update-wordcounts');
        console.error('An UNINTENDED drift is eaten/duplicated content — the c9–c18 audit class.');
        for (const d of diffs.slice(0, 20)) console.error(`  DRIFT: ${d}`);
        if (diffs.length > 20) console.error(`  … and ${diffs.length - 20} more`);
        totals.errors += diffs.length;
      } else {
        console.log('\nWord-count baseline: OK (every item matches).');
      }
    } else {
      console.warn('\nWord-count baseline: none found — seed it with: node tools/validate-schemas.js --update-wordcounts');
      totals.warnings++;
    }
  }

  console.log(`\n=== TOTALS: ${totals.items} items validated, ${totals.errors} errors, ${totals.warnings} warnings ===`);
  if (totals.errors > 0 && !reportOnly) process.exit(1);
}

// Run CLI when executed directly
const isMain = process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  runCli();
}
