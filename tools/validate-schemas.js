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
 *   node tools/validate-schemas.js [--strict]
 *
 * Exports: validateFormatA / validateFormatB / validateHolyDays /
 *   validateFormatC / validateFormatD / validateAgainstReference /
 *   validateTranslationMap / validateScriptureDict / validateStudyBible
 *   — each => { errors: string[], warnings: string[] }.
 */

import { readFileSync } from 'fs';
import { createContext, runInNewContext } from 'vm';
import { resolve, basename } from 'path';
import { fileURLToPath } from 'url';
import { parseRefRange, splitIntoVerses } from '../app/src/main/assets/src/utils/scripture-parse.js';
import { COLLECTIONS } from '../app/src/main/assets/src/data/scripture-resolution.js';
import { splitFormatBInline } from '../app/src/main/assets/src/utils/format-b-inline.js';

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
    for (const optStr of ['date', 'from', 'spoken', 'forLine', 'audioUrl',
      'soundcloudUrl', 'videoVoiceUrl', 'videoMusicUrl',
      'metaAddendum', 'metaAddendumUrl', 'metaAddendumInternal']) {
      if (letter[optStr] !== undefined && typeof letter[optStr] !== 'string') {
        errors.push(`${prefix}: "${optStr}" must be a string if present`);
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
            if (!(fn.ref in nkjv)) {
              errors.push(`${fp}: ref "${fn.ref}" not found in nkjv dict`);
            }
          }
        }

        if (fn.type === 'note') {
          if (typeof fn.text !== 'string' || fn.text.length === 0) {
            errors.push(`${fp}: note footnote missing "text" (string)`);
          }
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
 */
function validateVerseArray(verses, prefix, errors, warnings) {
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
      } else if (v.n > lastN + 1) {
        warnings.push(`${prefix}: verse gap — n jumps from ${lastN} to ${v.n}`);
      }
    }
    lastN = v.n;
  }
}

/**
 * Format E — translation verse map (bible-asv/bsb/hnv/kjv/lsv/web/ylt).
 * Shape: { bookId: { "<chapNum>": [ { n: number, text: string } ] } }
 * @param {object} map
 * @param {{ strict?: boolean, fileName?: string }} [opts]
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
      validateVerseArray(verses, cp, errors, warnings);
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
/** @type {Array<{file: string, varName: string}>} */
const FORMAT_E_TRANSLATIONS = [
  { file: 'bible-asv.js', varName: 'BIBLE_ASV' },
  { file: 'bible-bsb.js', varName: 'BIBLE_BSB' },
  { file: 'bible-hnv.js', varName: 'BIBLE_HNV' },
  { file: 'bible-kjv.js', varName: 'BIBLE_KJV' },
  { file: 'bible-lsv.js', varName: 'BIBLE_LSV' },
  { file: 'bible-web.js', varName: 'BIBLE_WEB' },
  { file: 'bible-ylt.js', varName: 'BIBLE_YLT' },
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

function runCli() {
  const args = process.argv.slice(2);
  const strict = args.includes('--strict');
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
    const result = validateTranslationMap(map, { strict, fileName: label });
    // CORP2: also require every KJV book/chapter to be present (kjv-vs-kjv is
    // trivially complete, so skip it). Merged into `result` so it counts + prints
    // on the same line.
    if (xlatRef && entry.varName !== 'BIBLE_KJV') {
      const comp = validateTranslationCompleteness(map, xlatRef, { fileName: label });
      result.errors.push(...comp.errors);
      result.warnings.push(...comp.warnings);
    }
    const nBooks = Object.keys(map).length;
    add(result, nBooks);
    emit(result, label, nBooks, 'books', '');
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

  console.log(`\n=== TOTALS: ${totals.items} items validated, ${totals.errors} errors, ${totals.warnings} warnings ===`);
  if (strict && totals.errors > 0) process.exit(1);
}

// Run CLI when executed directly
const isMain = process.argv[1] &&
  resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url));
if (isMain) {
  runCli();
}
