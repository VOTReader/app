/* ═══════════════════════════════════════════════════════════════════════════
   data-normalize.js — VOTReader-studio Unified Data Normalizer
   ═══════════════════════════════════════════════════════════════════════════

   STATUS: SKELETON / Phase 2 starting point.
           This file is NOT yet loaded by index.html. It will be wired in
           when Phase 2 begins. For now, it serves as the canonical sketch
           of how the normalize() function will be structured.

   PURPOSE
   -------
   Convert any source-format entry (Format A letters, Format B WTLB,
   Format D Matthew Study Bible chapter, Holy Days mixed) into the
   UnifiedEntry shape declared in data-schema.d.ts.

   The renderer (after Phase 2) consumes only UnifiedEntry. Source files
   stay in their current format until we run a separate migration script;
   in the meantime, normalize() runs at app load and decorates window
   globals with their normalized versions.

   USAGE (when wired in):
     const normalized = window.normalize(rawEntry, { kind: 'letter', collection: COL_BY_KEY.get('two') });

   ═══════════════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ────────────────────────────────────────────────────────────────────────
  // Public API
  // ────────────────────────────────────────────────────────────────────────

  /**
   * Normalize a single raw entry into the unified shape.
   *
   * @param {object} raw            The raw entry from a data file
   * @param {object} ctx            Context: { kind, collection, sharedScriptures? }
   * @returns {object}              UnifiedEntry (see data-schema.d.ts)
   */
  function normalize(raw, ctx) {
    if (!raw) return null;
    if (!ctx) ctx = {};
    var kind = ctx.kind || (raw.blocks ? 'letter' : raw.paragraphs ? 'wtlb' : 'unknown');

    switch (kind) {
      case 'letter':       return normalizeLetter(raw, ctx);
      case 'wtlb':         return normalizeWtlb(raw, ctx);
      case 'blessed':      return normalizeWtlb(raw, ctx);    // same shape as wtlb
      case 'holy-day':     return normalizeHolyDay(raw, ctx);
      case 'study':        return normalizeLetter(raw, ctx);  // study chapters use Format A blocks
      case 'hidden':       return normalizeLetter(raw, ctx);
      default:             return normalizeUnknown(raw, ctx);
    }
  }

  /**
   * Normalize a whole collection of entries plus its preface.
   *
   * @param {object} collection     Source-of-truth collection meta (from COLLECTIONS)
   * @param {Array}  rawEntries     The window global (e.g., LETTERS_V3)
   * @param {object} [rawPreface]   The preface global (e.g., LETTERS_V3_PREFACE)
   * @returns {object}              Normalized Collection
   */
  function normalizeCollection(collection, rawEntries, rawPreface) {
    var ctx = {
      kind: collection.kind,
      collection: collection,
      sharedScriptures: getSharedScriptures(collection)
    };
    return {
      volKey: collection.volKey,
      kind: collection.kind,
      label: collection.label,
      short: collection.short,
      shortFromOutside: collection.shortFromOutside,
      preface: rawPreface ? normalize(rawPreface, ctx) : undefined,
      entries: (rawEntries || []).map(function (e) { return normalize(e, ctx); }).filter(Boolean),
      sharedScriptures: ctx.sharedScriptures,
      searchVolId: collection.searchVolId,
      cardId: collection.cardId,
      readKey: collection.readKey
    };
  }

  // ────────────────────────────────────────────────────────────────────────
  // Format-specific normalizers
  // ────────────────────────────────────────────────────────────────────────

  // Format A: { id, num, title, date, from, spoken, forLine, blocks, footnotes, nkjv, prevLetter, nextLetter, ... }
  function normalizeLetter(raw, ctx) {
    var entry = {
      id: raw.id,
      num: raw.num != null ? raw.num : 0,
      title: raw.title,
      kind: ctx.kind || 'letter',
      isPreface: !!raw.isPreface
    };
    copyOptional(entry, raw, ['subtitle', 'date', 'from', 'spoken', 'forLine', 'preamble', 'sourceLabel', 'part', 'coverImage']);

    entry.content = (raw.blocks || []).map(normalizeBlockFormatA);
    entry.footnotes = normalizeFootnotes(raw.footnotes);
    entry.scriptures = raw.nkjv ? Object.assign({}, raw.nkjv) : (raw.scriptures ? Object.assign({}, raw.scriptures) : undefined);
    entry.media = collectMediaFromFlatFields(raw);
    entry.nav = collectNavFromFlatFields(raw);
    return entry;
  }

  // Format B: { id, num, title, paragraphs: [{align, text}], scriptures?, prevEntry, nextEntry, sourceLabel? }
  function normalizeWtlb(raw, ctx) {
    var entry = {
      id: raw.id,
      num: raw.num != null ? raw.num : 0,
      title: raw.title,
      kind: ctx.kind || 'wtlb',
      isPreface: !!raw.isPreface
    };
    copyOptional(entry, raw, ['subtitle', 'sourceLabel']);

    entry.content = (raw.paragraphs || []).map(function (p) {
      return {
        type: 'paragraph',
        align: p.align || undefined,
        content: parseInlineMarkup(p.text || '')
      };
    });

    entry.scriptures = raw.scriptures ? Object.assign({}, raw.scriptures) : undefined;
    entry.nav = collectNavFromEntryFields(raw);
    return entry;
  }

  // Holy Days: entry.type discriminates between 'wtlb' and 'letter' shapes
  function normalizeHolyDay(raw, ctx) {
    var subKind = raw.type === 'wtlb' ? 'wtlb' : 'letter';
    var subCtx = Object.assign({}, ctx, { kind: subKind });
    var normalized = subKind === 'wtlb' ? normalizeWtlb(raw, subCtx) : normalizeLetter(raw, subCtx);
    normalized.kind = 'holy-day';
    if (raw.sourceLabel) normalized.sourceLabel = raw.sourceLabel;
    return normalized;
  }

  function normalizeUnknown(raw, ctx) {
    // Defensive fallback — preserve as-is, mark as unknown
    return Object.assign({}, raw, { kind: 'unknown', _unnormalized: true });
  }

  // ────────────────────────────────────────────────────────────────────────
  // Block normalization (Format A blocks → unified Block)
  // ────────────────────────────────────────────────────────────────────────

  function normalizeBlockFormatA(b) {
    if (!b) return null;
    switch (b.type) {
      case 'para':
        return { type: 'paragraph', content: (b.segments || []).map(normalizeSegmentFormatA) };

      case 'poetry':
        // Two source variants: lines: Segment[][] OR segments: Segment[]
        if (b.lines) {
          // Flatten lines → paragraph blocks separated by line-breaks
          // Renderer can group them back via consecutive-poetry detection.
          // Simpler approach: keep as a poetry block with line groups.
          return {
            type: 'poetry',
            content: flattenPoetryLines(b.lines)
          };
        }
        return { type: 'poetry', content: (b.segments || []).map(normalizeSegmentFormatA) };

      case 'closing':
        return { type: 'closing', text: b.text || '' };

      case 'closing-fn':
        return { type: 'closing-fn', content: (b.segments || []).map(normalizeSegmentFormatA) };

      case 'intro':
        return { type: 'intro', content: (b.segments || []).map(normalizeSegmentFormatA) };

      case 'heading':
        return { type: 'heading', level: b.level || 2, text: b.text || '' };

      case 'note':
        return { type: 'note', text: b.text || '' };

      case 'scripture':
        return { type: 'scripture', content: (b.segments || []).map(normalizeSegmentFormatA), text: b.text };

      case 'prophecy-group':
        return {
          type: 'prophecy-group',
          cardType: b.cardType,
          sublabel: b.sublabel,
          content: (b.segments || []).map(normalizeSegmentFormatA)
        };

      case 'cover-image':
        return { type: 'cover-image', src: b.src };

      case 'study-image':
        return { type: 'study-image', src: b.src, alt: b.alt, caption: b.caption };

      default:
        // Preserve unknown block types verbatim — renderer will skip if it
        // doesn't recognize. Better than dropping data.
        return Object.assign({}, b, { _unrecognized: true });
    }
  }

  function flattenPoetryLines(lines) {
    var out = [];
    lines.forEach(function (line, i) {
      if (i > 0) out.push({ type: 'line-break' });
      (line || []).forEach(function (seg) {
        out.push(normalizeSegmentFormatA(seg));
      });
    });
    return out;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Segment normalization (Format A `t` types → unified Segment.type)
  // ────────────────────────────────────────────────────────────────────────

  function normalizeSegmentFormatA(s) {
    if (!s) return null;
    switch (s.t) {
      case 'text':         return { type: 'text', text: s.v || '' };
      case 'italic':       return { type: 'emphasis', text: s.v || '' };
      case 'bold-italic':  return { type: 'strong', children: [{ type: 'emphasis', text: s.v || '' }] };
      case 'caps':         return { type: 'caps', text: s.v || '' };
      case 'fn':           return { type: 'footnote-ref', footnoteId: String(s.v) };
      case 'stanza-break': return { type: 'stanza-break' };
      case 'letter-link':
        return {
          type: 'letter-link',
          text: s.label || '',
          link: s.link ? Object.assign({}, s.link) : undefined
        };
      default:
        return Object.assign({ type: 'text', text: s.v || '' }, { _unrecognized_t: s.t });
    }
  }

  // ────────────────────────────────────────────────────────────────────────
  // Inline-markup parser (Format B text → Segment[])
  //
  // Tokens recognized:
  //   {{ref:Book Chapter:Verse}}              → scripture-ref segment
  //   {{ref:A:B; C:D}}                        → multiple scripture-ref segments
  //   {{nav:bookId:chapter}}                  → nav-ref segment
  //   _italic_                                → emphasis segment
  //   **bold**                                → strong segment
  //   _**bold-italic**_ or **_bold-italic_**  → strong > emphasis
  //   †                                       → divider segment
  //   ~ "From X" line at end of paragraph     → attribution segment
  // ────────────────────────────────────────────────────────────────────────

  function parseInlineMarkup(text) {
    if (!text) return [];
    // Phase 2 will implement this fully. For now, this is a high-fidelity
    // skeleton that the test suite (normalize-tests.html) will exercise.
    var out = [];
    var i = 0;
    var len = text.length;
    var buf = '';

    function flushText() {
      if (buf.length > 0) {
        out.push({ type: 'text', text: buf });
        buf = '';
      }
    }

    while (i < len) {
      // {{ref:...}} or {{nav:...}}
      if (text[i] === '{' && text[i + 1] === '{') {
        var endIdx = text.indexOf('}}', i + 2);
        if (endIdx !== -1) {
          flushText();
          var inner = text.substring(i + 2, endIdx);
          var colonIdx = inner.indexOf(':');
          if (colonIdx !== -1) {
            var tag = inner.substring(0, colonIdx);
            var payload = inner.substring(colonIdx + 1).trim();
            if (tag === 'ref') {
              // Compound refs: split on ;
              var refs = payload.split(';');
              for (var r = 0; r < refs.length; r++) {
                var ref = refs[r].trim();
                if (ref) out.push({ type: 'scripture-ref', ref: ref, text: ref });
                if (r < refs.length - 1) out.push({ type: 'text', text: '; ' });
              }
            } else if (tag === 'nav') {
              var parts = payload.split(':');
              out.push({
                type: 'nav-ref',
                bookId: parts[0],
                chapter: parts[1] ? parseInt(parts[1], 10) : undefined,
                text: payload
              });
            }
          }
          i = endIdx + 2;
          continue;
        }
      }

      // _**...**_  (bold-italic, underscore-outer variant)
      if (text[i] === '_' && text[i + 1] === '*' && text[i + 2] === '*') {
        var biEnd = text.indexOf('**_', i + 3);
        if (biEnd !== -1) {
          flushText();
          var biInner = text.substring(i + 3, biEnd);
          out.push({
            type: 'strong',
            children: [{ type: 'emphasis', text: biInner }]
          });
          i = biEnd + 3;
          continue;
        }
      }

      // **_..._**  (bold-italic, asterisk-outer variant)
      if (text[i] === '*' && text[i + 1] === '*' && text[i + 2] === '_') {
        var biEnd2 = text.indexOf('_**', i + 3);
        if (biEnd2 !== -1) {
          flushText();
          var biInner2 = text.substring(i + 3, biEnd2);
          out.push({
            type: 'strong',
            children: [{ type: 'emphasis', text: biInner2 }]
          });
          i = biEnd2 + 3;
          continue;
        }
      }

      // **...**  (bold)
      if (text[i] === '*' && text[i + 1] === '*') {
        var bEnd = text.indexOf('**', i + 2);
        if (bEnd !== -1) {
          flushText();
          out.push({ type: 'strong', text: text.substring(i + 2, bEnd) });
          i = bEnd + 2;
          continue;
        }
      }

      // _..._  (italic) — but skip if preceded by a word char (avoids
      // matching mid-word underscores like snake_case).
      if (text[i] === '_' && (i === 0 || /\W/.test(text[i - 1]))) {
        var iEnd = text.indexOf('_', i + 1);
        if (iEnd !== -1 && (iEnd + 1 >= len || /\W/.test(text[iEnd + 1]))) {
          flushText();
          out.push({ type: 'emphasis', text: text.substring(i + 1, iEnd) });
          i = iEnd + 1;
          continue;
        }
      }

      // † divider
      if (text[i] === '†') {
        flushText();
        out.push({ type: 'divider' });
        i++;
        continue;
      }

      buf += text[i];
      i++;
    }

    flushText();
    return out;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Footnote, media, nav extraction helpers
  // ────────────────────────────────────────────────────────────────────────

  function normalizeFootnotes(rawFootnotes) {
    if (!rawFootnotes) return undefined;
    var out = {};
    Object.keys(rawFootnotes).forEach(function (key) {
      var fn = rawFootnotes[key];
      if (!fn) return;
      var f = { id: String(key), type: fn.type };
      if (fn.type === 'scripture') {
        f.ref = fn.ref;
        if (fn.translation) f.translation = fn.translation;
        if (fn.seeAlso) f.seeAlso = Object.assign({}, fn.seeAlso);
      } else {
        f.text = fn.text;
        if (fn.url) f.url = fn.url;
        if (fn.link) f.link = Object.assign({}, fn.link);
        if (fn.seeAlso) f.seeAlso = Object.assign({}, fn.seeAlso);
      }
      out[key] = f;
    });
    return out;
  }

  function collectMediaFromFlatFields(raw) {
    var media = { audio: [], video: [] };
    if (raw.audioUrl) media.audio.push({ service: 'bandcamp', url: raw.audioUrl });
    if (raw.soundcloudUrl) media.audio.push({ service: 'soundcloud', url: raw.soundcloudUrl });
    if (raw.videoVoiceUrl) media.video.push({ kind: 'voice', url: raw.videoVoiceUrl, label: raw.videoVoiceLabel });
    if (raw.videoMusicUrl) media.video.push({ kind: 'music', url: raw.videoMusicUrl });
    if (Array.isArray(raw.videos)) {
      raw.videos.forEach(function (v) {
        media.video.push({ kind: 'other', url: v.url, label: v.label });
      });
    }
    if (media.audio.length === 0 && media.video.length === 0) return undefined;
    return media;
  }

  function collectNavFromFlatFields(raw) {
    var nav = {};
    if (raw.prevLetter) nav.prev = { id: raw.prevLetter.id, title: raw.prevLetter.title };
    if (raw.nextLetter) nav.next = { id: raw.nextLetter.id, title: raw.nextLetter.title };
    if (Array.isArray(raw.relatedTopics)) nav.related = raw.relatedTopics.map(normalizeRelatedLink);
    if (Array.isArray(raw.bibleStudies)) nav.bibleStudies = raw.bibleStudies.map(normalizeRelatedLink);
    if (raw.addendum) {
      nav.addendum = {
        text: raw.addendum,
        url: raw.addendumUrl,
        link: raw.addendumLink ? Object.assign({}, raw.addendumLink) : undefined,
        internal: raw.addendumInternal
      };
    }
    if (raw.metaAddendum) {
      // metaAddendum* is the older name for addendum*
      nav.addendum = nav.addendum || {
        text: raw.metaAddendum,
        url: raw.metaAddendumUrl,
        link: raw.metaAddendumLink ? Object.assign({}, raw.metaAddendumLink) : undefined,
        internal: raw.metaAddendumInternal
      };
    }
    return Object.keys(nav).length ? nav : undefined;
  }

  function collectNavFromEntryFields(raw) {
    var nav = {};
    if (raw.prevEntry) nav.prev = { id: raw.prevEntry.id, title: raw.prevEntry.title };
    if (raw.nextEntry) nav.next = { id: raw.nextEntry.id, title: raw.nextEntry.title };
    return Object.keys(nav).length ? nav : undefined;
  }

  function normalizeRelatedLink(rt) {
    if (!rt) return null;
    var rl = { label: rt.label };
    if (rt.url) rl.url = rt.url;
    if (rt.link) rl.link = Object.assign({}, rt.link);
    if (rt.internalStudy) rl.internalStudy = Object.assign({}, rt.internalStudy);
    return rl;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Helpers
  // ────────────────────────────────────────────────────────────────────────

  function copyOptional(target, source, fields) {
    fields.forEach(function (f) {
      if (source[f] != null) target[f] = source[f];
    });
  }

  function getSharedScriptures(collection) {
    if (!collection) return undefined;
    if (collection.kind === 'wtlb' && typeof window.WTLB_SCRIPTURES !== 'undefined') return window.WTLB_SCRIPTURES;
    if (collection.kind === 'blessed' && typeof window.THE_BLESSED_SCRIPTURES !== 'undefined') return window.THE_BLESSED_SCRIPTURES;
    return undefined;
  }

  // ────────────────────────────────────────────────────────────────────────
  // Expose
  // ────────────────────────────────────────────────────────────────────────

  window.VotNormalize = {
    normalize: normalize,
    normalizeCollection: normalizeCollection,
    parseInlineMarkup: parseInlineMarkup,
    // Sub-functions exposed for tests
    _normalizeLetter: normalizeLetter,
    _normalizeWtlb: normalizeWtlb,
    _normalizeBlockFormatA: normalizeBlockFormatA,
    _normalizeSegmentFormatA: normalizeSegmentFormatA,
    _collectMediaFromFlatFields: collectMediaFromFlatFields,
    _collectNavFromFlatFields: collectNavFromFlatFields,
    _normalizeFootnotes: normalizeFootnotes
  };
})();
