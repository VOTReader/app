/** @jsx h */
/** @jsxFrag Fragment */
/* ═══════════════════════════════════════════════════════════════════════
   WtlbEntryView — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════ */

import { h, Fragment } from '../jsx-h.js';
import { inertAttr } from '../../utils/inert-attr.js';
import { resolveNeighborLetter, savedScrollFor, letterScrollKey } from '../components/pager-preview.jsx';
import { splitFormatBInline } from '../../utils/format-b-inline.js';
import { formatBOffsetMap, formatBRefScan } from '../../utils/format-b-dom-text.js';
import { AudioPlayer } from '../../utils/audio-player.js';
import { excerptLanding } from '../../utils/excerpt-landing.js';
import { LetterListenRow, LetterSongsCard } from '../components/LetterSongs.jsx';
import { ReadAlongHighlight } from '../components/ReadAlongHighlight.jsx';
import { FindInUnit } from '../components/FindInUnit.jsx';
import { wtlbHlKey, wtlbHlPrefix } from '../../utils/hl-keys.js';
import { scrollBehavior } from '../../utils/reduced-motion.js';
import { AnswersTopic, answersHeadCover, answersHlDomChanged } from '../components/AnswersTopic.jsx';
import { AnsIcon, useAnswersMetaState, answersLayoutClass } from '../components/AnswersParts.jsx';
import { passageTextBefore } from '../../utils/answers-contents.js';
import { answersAnchorPara, answersMetaFor } from '../../utils/answers-sections.js';
import { highlightExcerptInDom } from '../../utils/highlight.jsx';
import { BackHintPill } from '../components/BackHintPill.jsx';
import { MiniTitleBand, stickyCover } from '../components/MiniTitleBand.jsx';


/** Readable fallback for a {{nav:bookId:ch}} target before the lazy Bible
    corpus loads — "esther" → "Esther". BOOKS[id].title is preferred when
    available; this only keeps the inline link from showing a raw lowercase id. */
function _prettyBookId(id) {
  return String(id).split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function WtlbEntryView({ entry, volKey, partLabel, onHome, onNavigate, onSearch, onSettings, onHistory, onNavToChapter, prevBoundary, onPrevBoundary, nextBoundary, onNextBoundary, theme, onThemeChange, onMarkRead, readTrackKey, onUnmark: _onUnmark, isRead: _isRead, markAsReadEnabled, scripturesDict, indexLabel: _indexLabel, footnotesMode, backHint, onBack, navBack = null, onLinkOpen: _onLinkOpen, onInAppLink, onNavigateToLink, readAlongOn = true, readAlongFollow = true, showSongs = true, inert = false, restoreScroll = null, surpriseAnchor = null, fontScale = '1', answers = null }) {
  // An Answers topic (AOGCG f07-f11) draws its own page (AnswersTopic.jsx) from its sidecar, plain
  // until ANSWERS_META lands: the body waits up to 300 ms for it, then paints plain and is decorated
  // in place when it arrives.
  const isAns = volKey === 'answers';
  const [ansMetaAll, ansMetaFailed] = useAnswersMetaState(isAns);
  const ansMeta = ansMetaAll ? ansMetaAll[entry.id] || null : null;
  const [ansWaited, setAnsWaited] = React.useState(false);
  React.useEffect(() => {
    setAnsWaited(false);
    if (!isAns || ansMetaAll) return undefined;
    const t = setTimeout(() => setAnsWaited(true), 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per entry; the sidecar's arrival ends the wait
  }, [entry.id, isAns]);
  const ansReady = !isAns || inert || !!ansMetaAll || ansWaited;
  const ansDecorated = !!ansMetaAll;
  // the body's keyed paragraphs mount late (and again decorated): the annotation pass re-runs over them
  React.useEffect(() => {
    if (!isAns || inert || !ansReady) return;
    answersHlDomChanged();
  }, [isAns, inert, ansReady, ansDecorated, entry.id]);
  const [scriptureRef, setScriptureRef] = React.useState(null);
  // The site's own translation for the open cite (refMeta, O2): it opens the HCSB there.
  const [scriptureNote, setScriptureNote] = React.useState(/** @type {any} */ (null));
  // "Go to Scripture" on the inline ref sheet — close the sheet, then route
  // the resolved {type:'bible'} endpoint through navigateToLink (verse flash
  // highlight + "Back to …" pill + Android back via the from-letter stack).
  const goToScriptureRef = onNavigateToLink ? (endpoint) => {
    setScriptureRef(null);
    onNavigateToLink(endpoint, { sourceLetterTitle: entry.title, sourceVolumeLabel: partLabel || null });
  } : null;
  const [highlightedFn, setHighlightedFn] = React.useState(null);
  const wtlbMainRef = React.useRef(null);
  /* The entry's title: the voice's place before its first timed row (the
     read-along lead-in, 2026-09-22). */
  // A LANDING (a search hit's matched words — use-search.js excerptAnchor):
  // find the paragraph whose text holds the excerpt's head in the search
  // index's own domain ({{refs}} removed, whitespace squashed — index-builder
  // pushEntryCollection), scroll it, pulse it, and hand its hl-key to
  // ReadAlongHighlight as `seekTo` so a playing recording of THIS entry goes
  // there too. Shorter heads are tried: the excerpt may run past the paragraph.
  const [landedPara, setLandedPara] = React.useState(/** @type {number} */ (-1));
  const [landedOff, setLandedOff] = React.useState(/** @type {number | null} */ (null));   // where in it the words start (corpus domain, ≈ the rows')
  // An Answers topic's Contents sheet (AnswersContents.jsx) jumps to a section or passage:
  // the paragraph comes to the top of the scroller, clear of a sticky "Back to" pill when one
  // is showing (measured, not guessed), and glows like a search landing. One-shot and
  // reader-initiated, the same class of write as that landing.
  /* search200 UX B10 (1): an entry landed on mid-way names itself in a band pinned under
     the top bar once this hero has scrolled away (MiniTitleBand), in the hero's words. */
  const heroRef = React.useRef(null);
  // (An Answers topic names itself in its running head instead.)
  const miniTitle = inert || isAns ? null : (
    <MiniTitleBand heroRef={heroRef} pageKey={entry.id} title={entry.title}
      eyebrow={[partLabel, entry.num].filter((x) => x != null && x !== '').join(' · ')} />
  );
  const jumpTimerRef = React.useRef(/** @type {any} */ (null));
  React.useEffect(() => () => clearTimeout(jumpTimerRef.current), []);
  // opts.el: the element to bring up (an Answers heading); opts.pulse false: no glow (a section jump).
  const jumpToPara = React.useCallback((/** @type {number} */ index, /** @type {{ pulse?: boolean, el?: HTMLElement | null }} */ o = {}) => {
    let el = o.el || (wtlbMainRef.current && /** @type {HTMLElement|null} */ (wtlbMainRef.current.querySelector(`[data-hl-key="${wtlbHlKey(entry.id, index)}"]`)));
    if (!el) return;
    if (isAns) {
      // a heading the site made up ("Section One") sits just before the paragraph it heads
      const prev = /** @type {HTMLElement | null} */ (el.previousElementSibling);
      if (!o.el && prev && prev.matches('h2.ans-sh:not([data-hl-key])')) el = prev;
      // under the running head; a long way is instant, so a jump always lands within 600 ms (U4)
      el.style.scrollMarginTop = (answersHeadCover() + 8) + 'px';
      const sc = el.closest('.screen-scroll');
      const far = !!sc && Math.abs(el.getBoundingClientRect().top - sc.getBoundingClientRect().top) > 2 * sc.clientHeight;
      el.scrollIntoView({ behavior: far ? 'auto' : scrollBehavior(), block: 'start' });
      if (el.tabIndex === -1) { try { el.focus({ preventScroll: true }); } catch (_e) { /* best-effort */ } }
      if (o.pulse === false) return;
    } else {
      // past the "Back to" row and the mini title band under it (search200 UX B10)
      el.style.scrollMarginTop = (stickyCover(el) + 16) + 'px';
      el.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
    }
    setLandedPara(index);
    setLandedOff(null);
    clearTimeout(jumpTimerRef.current);
    jumpTimerRef.current = setTimeout(() => setLandedPara(-1), 4000);
  }, [entry.id, isAns]);
  // v01-03: a landing belongs to its entry. The instance is reused (no key) for the
  // next entry, and the landing effect below returns early for an anchor made for
  // another entry - before anything reset these - so the next entry's paragraph at
  // the same index pulsed and a playing recording sought there. LetterView resets
  // its own on every letter change the same way. Declared first: on a change that
  // brings a new landing, the reset runs and then the landing sets the new place.
  React.useEffect(() => { setLandedPara(-1); setLandedOff(null); }, [entry.id]);
  // A SECTION landing (aogcg 1b): a link to answersonlygodcangive.com/Topic#Section names a heading
  // by its MediaWiki anchor (answers-sections.js answersAnchorPara: the sections sidecar once loaded,
  // the topic's own headings until then). The heading comes to the top the way the Contents sheet's
  // jump brings it (jumpToPara: the same one-shot, reader-initiated write). No heading: the top.
  React.useEffect(() => {
    if (!ansReady || !surpriseAnchor || surpriseAnchor.type !== 'section' || surpriseAnchor.letterId !== entry.id) return;
    const at = answersAnchorPara(entry, surpriseAnchor.anchor, answersMetaFor(entry.id));
    if (at < 0) return;
    const timer = setTimeout(() => jumpToPara(at), 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entry.paragraphs is corpus data; entry.id identifies the entry (same contract as the excerpt landing below)
  }, [surpriseAnchor, entry.id, ansReady]);
  React.useEffect(() => {
    // (an Answers topic's body paints once its sidecar is in, or 300 ms on: land then)
    if (!ansReady || !surpriseAnchor || surpriseAnchor.type !== 'excerpt') return;
    if (surpriseAnchor.letterId && surpriseAnchor.letterId !== entry.id) return;   // made for another entry: not ours
    // A title named (search200 B5, the S22 look): the landing is the entry's top, where its title is. No
    // paragraph is landed on, pulsed or sought, though the excerpt (the text's first words) would find one.
    if (surpriseAnchor.top) {
      const topTimer = setTimeout(() => {
        const sc = wtlbMainRef.current && wtlbMainRef.current.closest('.screen-scroll');
        if (sc && typeof sc.scrollTo === 'function') sc.scrollTo({ top: 0, behavior: scrollBehavior() });
      }, 150);
      return () => clearTimeout(topTimer);
    }
    const squash = (s) => String(s || '').replace(/\{\{[^}]+\}\}/g, ' ').replace(/\s+/g, ' ').trim();
    // (excerptLanding: head then TAIL at every length — the engine's cut can
    // open with the previous paragraph's last words, read-along find 2026-09-22.)
    const excerpt = squash(surpriseAnchor.text);
    const paras = entry.paragraphs || [];
    const { index: found, off } = excerptLanding(excerpt, paras.map((p) => squash(p && p.text)), surpriseAnchor.find && surpriseAnchor.find.terms);
    if (found < 0) return;
    setLandedPara(found);
    setLandedOff(off);
    const timer = setTimeout(() => {
      const el = wtlbMainRef.current && wtlbMainRef.current.querySelector(`[data-hl-key="${wtlbHlKey(entry.id, found)}"]`);
      if (el) el.scrollIntoView({ behavior: scrollBehavior(), block: 'center' });
    }, 150);
    const fadeTimer = setTimeout(() => { setLandedPara(-1); setLandedOff(null); }, 4000);
    return () => { clearTimeout(timer); clearTimeout(fadeTimer); };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entry.paragraphs is corpus data; entry.id identifies the entry (same contract as the refAnalysis memo above)
  }, [surpriseAnchor, entry.id, ansReady]);
  React.useEffect(() => {
    const pending = window.navHandoff.peek('pendingHighlight');
    if (!pending || pending.letterId !== entry.id || !pending.excerpt) return;
    window.navHandoff.clear('pendingHighlight');
    const excerpt = pending.excerpt;
    const t = setTimeout(() => highlightExcerptInDom(wtlbMainRef.current, excerpt), 80);
    return () => clearTimeout(t);
  }, [entry.id]);

  // Pre-scan paragraphs for scripture refs (shared with the link excerpt
  // picker, which has to render the same footnote numbers).
  const refAnalysis = React.useMemo(() => formatBRefScan(entry.paragraphs, footnotesMode),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identity-based cache key: entry.paragraphs is corpus data (read-only after boot); entry.id uniquely identifies the entry, so [entry.id, footnotesMode] is sufficient. Using [entry, ...] would force re-memoize on any parent re-render that hands a fresh object literal.
    [entry.id, footnotesMode]);

  // One projection per paragraph, rebuilt only when something the render
  // branches on actually changes. refAnalysis is the same pre-scan the renderer
  // consumes, so the numbers here are the numbers on screen.
  const paraOffsetMap = React.useMemo(() => {
    const cache = new Map();
    return (pi) => {
      if (cache.has(pi)) return cache.get(pi);
      const p = (entry.paragraphs || [])[pi];
      const fn = p ? formatBOffsetMap(p.text, {
        refs: refAnalysis.perParagraph[pi] || [],
        footnotesMode,
      }).toDom : null;
      cache.set(pi, fn);
      return fn;
    };
  }, [footnotesMode, refAnalysis, entry.paragraphs]);

  const lookupVerse = (ref) => {
    const perEntry = entry.scriptures || {};
    // WTLB_SCRIPTURES rides the VOT corpus. A WTLB-family entry from another
    // corpus (Answers) can render before it lands, so read it guarded.
    const dict = scripturesDict || (typeof WTLB_SCRIPTURES !== 'undefined' ? WTLB_SCRIPTURES : {});
    // SC6: fall back to the global BOOKS corpus when neither the per-entry nor
    // the WTLB scripture dict carries the ref, so a dict-miss resolves instead
    // of rendering "not available" (the SC1 fix pre-loads BOOKS on the WTLB
    // index; lookupVersesFromBooks returns null if it isn't loaded yet).
    return perEntry[ref] || dict[ref] || lookupVersesFromBooks(ref) || null;
  };
  // The open sheet's verse, looked up on every render like the footnote list's
  // (sweep v73). Stored at tap time it froze a pre-corpus null: a cite tapped
  // before the lazy Bible corpus landed kept "Verse text not available" after
  // it loaded and App re-rendered the entry.
  const scriptureText = scriptureRef ? lookupVerse(scriptureRef) : null;

  React.useEffect(() => {
    if (scriptureRef === null) return;
    var prev = window.__closeSheet;
    window.__closeSheet = () => setScriptureRef(null);
    return () => { window.__closeSheet = prev || null; };
  }, [scriptureRef]);

  // W1.5(a.2) parity with LetterView's two sheets (C2-C [C1], 2026-08-10).
  // This sheet claimed ONLY window.__closeSheet — the older, disjoint slot the
  // Android back handler reads. Every consumer of the MODAL REGISTRY therefore
  // saw an empty registry while the sheet was open, and the visible cost was
  // the auto-scroll transport: use-autoscroll's isModalOpen() gate asks
  // modalRegistry.isAnyOpen(), read false, and kept scrolling the page out from
  // under an open scripture sheet on ~400 Format B entries.
  //
  // REGISTRATION ONLY. Escape stays single-source in useAndroidBack's
  // dispatcher (use-modal-registry.js header, W1.5 DISPATCHER CONTRACT):
  // a second listener here would race it — the local one dismisses and
  // unregisters, the dispatcher then reads an empty registry and navigates
  // back, so one Escape press would both close the sheet AND leave the entry.
  useModalRegistry({
    id: 'wtlb-scripture-sheet',
    dismiss: () => setScriptureRef(null),
    active: scriptureRef != null,
  });

  const openSheetForRef = (ref, note = null) => {
    setScriptureRef(ref);
    setScriptureNote(note);
  };

  const handleBubbleClick = (ref, _n) => {
    openSheetForRef(ref);
  };

  // An inert clone (a swipe peek) must never claim __onReadingComplete.
  useMarkAsRead(inert ? false : markAsReadEnabled, onMarkRead, readTrackKey);

  // Warm the stream pipe for this entry's track (see LetterView's prewarm note).
  React.useEffect(() => {
    if (!inert) AudioPlayer.prewarm(volKey, entry.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entry.id is the identity; volKey/inert are fixed per mount site
  }, [entry.id]);
  const railMode = useRailMode();   // companion rail — inline scripture sheet docks too
  const scripTrapRef = useFocusTrap(!!scriptureRef, { modal: !railMode });  // dialog semantics — see LetterView

  React.useEffect(() => { setScriptureRef(null); setHighlightedFn(null); }, [entry.id]);

  React.useEffect(() => {
    const root = wtlbMainRef.current;
    if (!root) return;
    root.querySelectorAll('.fn-ref.active').forEach((e) => e.classList.remove('active'));
    if (highlightedFn != null) {
      const el = root.querySelector('.fn-ref[data-fn-num="' + String(highlightedFn).replace(/"/g, '\\"') + '"]');
      if (el) el.classList.add('active');
    }
  }, [highlightedFn, entry.id]);

  const prevEntry = entry.prevEntry;
  const nextEntry = entry.nextEntry;
  const goPrev = () => prevEntry ? onNavigate(prevEntry.id) : onPrevBoundary && onPrevBoundary();
  const goNext = () => nextEntry ? onNavigate(nextEntry.id) : onNextBoundary && onNextBoundary();

  // Visible finger-follow page swipe (ScreenLayout `pager`). The neighbor page
  // that drags in is the REAL WtlbEntryView rendered inert (ScreenLayout `inert`
  // + PagerPeek kind:'screen') — identical component → identical UI, width,
  // wrapping, inline scripture cites, and annotation icons before and after the
  // swipe commits. A boundary (no in-collection neighbor) still peeks a card.
  const _entryPeek = (nb) => {
    const full = resolveNeighborLetter(volKey, nb.id);
    // FORMAT GATE. Holy Days is a MIXED collection: its ghost entries carry
    // type 'wtlb' (Format B, `paragraphs`) or 'letter' (Format A, `blocks`),
    // and the route branches on that. A neighbor of the OTHER format resolves
    // fine here but has no `paragraphs`, so rendering it through this
    // component threw on arrival (`entry.paragraphs.forEach`). Peek the
    // boundary card instead — which is what a cross-format neighbor showed
    // before real screen peeks existed.
    if (!full || !full.paragraphs) return { kind: 'boundary', eyebrow: 'Continue', title: nb.title };
    return {
      kind: 'screen',
      el: (
        // @ts-expect-error -- inert clone: only render-affecting props are passed; interactive callbacks (onHome/onNavigate/…) are intentionally omitted (the peek is pointer-events:none + HTML inert, so they can never fire).
        <WtlbEntryView
          entry={full}
          volKey={volKey}
          partLabel={partLabel}
          scripturesDict={scripturesDict}
          footnotesMode={footnotesMode}
          theme={theme}
          markAsReadEnabled={false}
          inert={true}
          restoreScroll={savedScrollFor(letterScrollKey(volKey, full.id))}
        />
      ),
    };
  };
  // Cross-COLLECTION neighbor along the reading chain (2026-07-19): when the
  // destination is another WTLB-family collection (wtlb/blessed — also
  // rendered by THIS component), peek its REAL first/last entry exactly like
  // an in-collection neighbor. Different-component destinations (the VOT
  // letters on either side of the WTLB run) keep the boundary card. The
  // partLabel mirrors what screen-routes passes for each collection.
  const WTLB_PART_LABELS = { wtlb1: 'Part One', wtlb2: 'Part Two', blessed: 'The Blessed' };
  const _chainPeek = (b, side) => {
    const card = { kind: 'boundary', eyebrow: b.short ? `${side === 'next' ? 'Next' : 'Previous'} \xB7 ${b.short}` : (side === 'next' ? 'Next' : 'Previous'), title: b.title };
    const destCol = (b.volKey && typeof COL_BY_KEY !== 'undefined') ? COL_BY_KEY.get(b.volKey) : null;
    if (!destCol || !_isWtlbFamily(destCol) || !b.letterId) return card;
    const full = resolveNeighborLetter(b.volKey, b.letterId);
    if (!full || !full.paragraphs) return card; // format gate — see _entryPeek
    return {
      kind: 'screen',
      el: (
        // @ts-expect-error -- inert clone: only render-affecting props are passed (see _entryPeek)
        <WtlbEntryView
          entry={full}
          volKey={b.volKey}
          partLabel={WTLB_PART_LABELS[b.volKey] || partLabel}
          scripturesDict={scripturesDict}
          footnotesMode={footnotesMode}
          theme={theme}
          markAsReadEnabled={false}
          inert={true}
          restoreScroll={savedScrollFor(letterScrollKey(b.volKey, full.id))}
        />
      ),
    };
  };
  const pager = {
    onPrev: goPrev,
    onNext: goNext,
    peek: (side) => side === 'next'
      ? (nextEntry ? _entryPeek(nextEntry) : nextBoundary ? _chainPeek(nextBoundary, 'next') : null)
      : (prevEntry ? _entryPeek(prevEntry) : prevBoundary ? _chainPeek(prevBoundary, 'prev') : null),
  };

  const _attrCollectionLabel = (volStr) => {
    if (!volStr) return null;
    const s = String(volStr).trim().toLowerCase();
    const NUMS = { '1':'One', '2':'Two', '3':'Three', '4':'Four', '5':'Five', '6':'Six', '7':'Seven' };
    if (NUMS[s]) return 'Volume ' + NUMS[s];
    const WORDS = ['one','two','three','four','five','six','seven'];
    if (WORDS.includes(s)) return 'Volume ' + s.charAt(0).toUpperCase() + s.slice(1);
    const vm = s.match(/^volume\s+(\d|[a-z]+)$/);
    if (vm) return _attrCollectionLabel(vm[1]);
    // Answers attributions also cite Rebuke / Flock / Timothy / WTLB / Holy Days
    // excerpts, by the collection's label or registryLabel.
    if (typeof COLLECTIONS !== 'undefined') {
      const col = COLLECTIONS.find((c) => c.registryLabel && (c.registryLabel.toLowerCase() === s || (c.label || '').toLowerCase() === s));
      if (col) return col.registryLabel;
    }
    return null;
  };

  // Render a plain-text run, converting soft line breaks (\n) to <br/>. Because
  // a _italic_/**bold** span can wrap a whole stanza, its breaks live INSIDE the
  // <em>/<strong>; this fragmenting happens here in the leaf text segments so the
  // breaks land wherever the run sits in the recursion.
  const renderText = (str, keyBase) => {
    if (str.indexOf('\n') < 0) return str;
    const out = [];
    str.split('\n').forEach((part, i) => {
      if (i > 0) out.push(<br key={keyBase + 'br' + i} />);
      if (part) out.push(<React.Fragment key={keyBase + 'tx' + i}>{part}</React.Fragment>);
    });
    return out;
  };

  // `line` is now the WHOLE paragraph text (with \n soft breaks), not one line —
  // so _italic_/**bold** markers that close after a line break still pair (the
  // splitter matches across \n). renderText turns the breaks back into <br/>.
  const renderLine = (line, consumeRef) => {
    const parts = splitFormatBInline(line);
    return parts.map((seg, si) => {
      if (!seg) return null;
      if (seg.startsWith('**') && seg.endsWith('**')) return <strong key={si}>{renderLine(seg.slice(2, -2), consumeRef)}</strong>;
      if (seg.startsWith('_') && seg.endsWith('_')) return <em key={si}>{renderLine(seg.slice(1, -1), consumeRef)}</em>;
      const attrMatch = seg.match(/^\[From ["“”](.+?)["“”]\s*~\s*(.+?)\]$/);
      if (attrMatch && onInAppLink) {
        const title = attrMatch[1];
        const collection = _attrCollectionLabel(attrMatch[2]);
        if (collection) {
          // The tap carries the passage this source line closes, so the letter opens ON it and
          // flashes it (pendingHighlight) instead of at its top (improvement sweep n5-01). The
          // paragraph index comes from the host's data-hl-key at tap time: no render plumbing.
          const sourceTarget = (/** @type {any} */ ev) => {
            const host = ev && ev.currentTarget && ev.currentTarget.closest ? ev.currentTarget.closest('[data-hl-key]') : null;
            const at = host ? /:(\d+)$/.exec(host.getAttribute('data-hl-key') || '') : null;
            const excerpt = at ? passageTextBefore(entry.paragraphs, Number(at[1])) : '';
            return excerpt ? { collection: collection, letterTitle: title, excerpt } : { collection: collection, letterTitle: title };
          };
          return (
            <span
              key={si}
              className="letter-link-ref"
              role="link"
              tabIndex={0}
              onClick={(ev) => onInAppLink(
                sourceTarget(ev),
                { sourceLetterTitle: entry.title, sourceVolumeLabel: partLabel || null }
              )}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return;
                e.preventDefault();
                onInAppLink(
                  sourceTarget(e),
                  { sourceLetterTitle: entry.title, sourceVolumeLabel: partLabel || null }
                );
              }}
              title={'Open "' + title + '" in ' + collection}
            >
              {seg}
            </span>
          );
        }
      }
      const refMatch = seg.match(/^\{\{ref:(.+)\}\}$/);
      if (refMatch) {
        const ref = refMatch[1].trim();
        const info = consumeRef();
        if (info && footnotesMode && !info.trailing && info.num != null) {
          const n = info.num;
          return (
            <span
              key={si}
              className={`fn-ref${highlightedFn === n ? " active" : ""}`}
              data-fn-num={n}
              role="button"
              tabIndex={0}
              aria-label={`Footnote ${n}`}
              onClick={() => handleBubbleClick(ref, n)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleBubbleClick(ref, n);
                }
              }}
              title={`Footnote ${n}`}
            >
              {n}
            </span>
          );
        }
        return (
          <a key={si} className="wtlb-cite" href="#" onClick={(e) => { e.preventDefault(); openSheetForRef(ref); }}>
            ({ref})
          </a>
        );
      }
      const navMatch = seg.match(/^\{\{nav:([^:]+):(\d+)\}\}$/);
      if (navMatch) {
        const bookId = navMatch[1], ch = parseInt(navMatch[2], 10);
        // BOOKS is the LAZY Bible corpus (var in bundle-a-bible.js), undeclared
        // until __loadBibleCorpus resolves. A bare BOOKS[bookId] throws a
        // ReferenceError here on a cold-boot WTLB read (VolumesHome pre-fires
        // only the VOT corpus) — the `?.` does NOT guard the base identifier.
        // Guard with typeof; fall back to a readable book name until it loads.
        const bookTitle = (typeof BOOKS !== 'undefined' && BOOKS[bookId]?.title) || _prettyBookId(bookId);
        return (
          <a key={si} className="fn-link" href="#" onClick={(e) => { e.preventDefault(); onNavToChapter(bookId, ch, entry.title); }}>
            [{bookTitle} {ch}]
          </a>
        );
      }
      return <React.Fragment key={si}>{renderText(seg, 's' + si)}</React.Fragment>;
    });
  };

  // ONE Back on an Answers topic (U5): the nav ‹ goes where the old "Back to …" pill went (the
  // letter or list it was opened from, or the results), else to Answers.
  const ansBack = !isAns ? null
    : backHint ? { onBack, label: backHint.volumeLabel ? backHint.volumeLabel + ' · ' + backHint.title : backHint.title }
      : navBack;
  const srcMeta = { sourceLetterTitle: entry.title, sourceVolumeLabel: partLabel || null };
  const ansPage = isAns ? (
    <AnswersTopic
      entry={entry} entries={answers ? answers.entries : null} meta={ansMeta} metaAll={ansMetaAll} metaFailed={ansMetaFailed}
      site={typeof ANSWERS_SITE_META !== 'undefined' ? ANSWERS_SITE_META : null}
      ready={ansReady} inert={inert} ts2={answersLayoutClass(fontScale, false).includes('ans-ts2')} landedPara={landedPara}
      mainRef={wtlbMainRef} isRead={(answers && answers.isRead) || (() => false)} pathOn={!!(answers && answers.pathOn)}
      findOn={!!(surpriseAnchor && surpriseAnchor.find && surpriseAnchor.letterId === entry.id)}
      nav={answers || {}}
      act={{
        cite: (ref, note) => openSheetForRef(ref, note),
        jump: jumpToPara,
        letter: (target) => { if (onInAppLink) onInAppLink({ ...target, collection: _attrCollectionLabel(target.collection) || target.collection }, srcMeta); },
        // a source chip opens its letter ON the passage it closes, and flashes it (n5-01)
        source: (pi) => {
          const parts = /^~ \[From ["“”](.+?)["“”]\s*~\s*(.+?)\]$/.exec(String((entry.paragraphs[pi] && entry.paragraphs[pi].text) || '').trim());
          const collection = parts ? _attrCollectionLabel(parts[2]) : null;
          if (!parts || !collection || !onInAppLink) return;
          const excerpt = passageTextBefore(entry.paragraphs, pi);
          onInAppLink(excerpt ? { collection, letterTitle: parts[1], excerpt } : { collection, letterTitle: parts[1] }, srcMeta);
        },
      }}
    />
  ) : null;

  return (
    <ScreenLayout
      className={isAns ? answersLayoutClass(fontScale, true) : undefined}
      inert={inert}
      restoreScroll={restoreScroll}
      pager={inert ? undefined : pager}
      placeKey={(volKey || '') + ':' + (entry && entry.id)}
      stickyNav={<StickyChapterNav
        onPrev={() => prevEntry ? onNavigate(prevEntry.id) : onPrevBoundary && onPrevBoundary()}
        onNext={() => nextEntry ? onNavigate(nextEntry.id) : onNextBoundary && onNextBoundary()}
        prevDisabled={!prevEntry && !prevBoundary}
        nextDisabled={!nextEntry && !nextBoundary}
        prevLabel="Previous entry"
        nextLabel="Next entry"
      />}
      navChildren={LibraryNav({
        // onHome — NOT onBack. onBack is the in-content back-hint pill.
        // C2-C [C3]: the label names the REAL destination like every sibling
        // reading screen does (LetterView says its volume, ChapterView says
        // its book). 'Index' described a generic noun, not a place — the
        // index this returns to is Part One / Part Two / The Blessed /
        // Regarding The Holy Days, which partLabel already carries.
        // navBack (search200 UX B1): from a search hit the ‹ returns to the results.
        onBack: ansBack ? ansBack.onBack : navBack ? navBack.onBack : onHome,
        backLabel: ansBack ? ansBack.label : navBack ? navBack.label : (partLabel || 'Index'),
        arrows: {
          onPrev: () => prevEntry ? onNavigate(prevEntry.id) : onPrevBoundary && onPrevBoundary(),
          onNext: () => nextEntry ? onNavigate(nextEntry.id) : onNextBoundary && onNextBoundary(),
          prevDisabled: !prevEntry && !prevBoundary,
          nextDisabled: !nextEntry && !nextBoundary,
          prevLabel: 'Previous entry', nextLabel: 'Next entry',
        },
        reading: true,
        chapterBookmark: entry ? { hlKey: 'wtlb:' + entry.id, label: entry.title || (partLabel ? partLabel + ' — Entry ' + entry.num : 'Bookmark') } : null,
        onSettings, onHistory, onSearch, theme, onThemeChange,
      })}
    >
      {isAns ? ansPage : <>
      <BackHintPill backHint={backHint} onClick={onBack}>{miniTitle}</BackHintPill>
      {!backHint && miniTitle ? <div className="mini-title-anchor">{miniTitle}</div> : null}

      <header className="hero" ref={heroRef}>
        <div className="hero-bg vol" />
        <div className="hero-content">
          <div className="hero-eyebrow">{partLabel} {" · "} {entry.num}</div>
          <h1 className="hero-title">{entry.title}</h1>
          <div className="hero-ornament">
            <div className="hero-ornament-line" />
            <div className="hero-ornament-diamond" />
            <div className="hero-ornament-line r" />
          </div>
          {/* Streaming audio entry — see LetterView's hero pill note (manifest
              rides the same lazy corpus bundle; inert peeks keep the pill for
              pixel parity, it can never fire there). */}
          {/* Songs of the Letters (L4): ♪ HEAR IT SUNG beside LISTEN; both pills show a playing state (W3-08). */}
          <LetterListenRow volKey={volKey} letter={entry} collectionLabel={partLabel || null} showSongs={showSongs} />
        </div>
      </header>

      {/* data-copy-key: words copied from this entry outside its paragraphs still name it (utils/passage-copy.js). */}
      <div className="page-wrapper" data-copy-key={'wtlb:' + entry.id}>
        <div className="content-layout">
          {/* data-mark-entry/-blocks: marks a corpus edit moved go back to their words (stores/corpus-mark-remap.js, n4-02) */}
          <div className="letter-body" ref={wtlbMainRef} data-mark-entry={'wtlb:' + entry.id + ':'} data-mark-blocks={entry.paragraphs.length}>
            {entry.paragraphs.map((p, pi) => {
              const paraRefs = refAnalysis.perParagraph[pi] || [];
              let refCursor = 0;
              const consumeRef = () => paraRefs[refCursor++];
              return (
                <p
                  key={entry.id + ":" + pi}
                  style={{ textAlign: p.align }}
                  className={(p.align === 'center' ? 'letter-poetry' : 'letter-para') + (landedPara === pi ? ' pulse' : '')}
                  data-hl-key={wtlbHlKey(entry.id, pi)}
                  data-hl-dom={true}
                >
                  <StaticSubtree>
                    {renderLine(p.text, consumeRef)}
                  </StaticSubtree>
                </p>
              );
            })}

            {/* Reading-end sentinel: end of body text, before footnotes/nav. */}
            <div className="reading-end" />

            {footnotesMode && refAnalysis.orderedRefs.length > 0 && (
              <div className="footnote-list wtlb-footnote-list">
                <div className="footnote-list-header">Footnotes</div>
                {refAnalysis.orderedRefs.map((ref) => {
                  const num = refAnalysis.refNumMap[ref];
                  const verseText = lookupVerse(ref);
                  return (
                    <div key={ref} id={`wtlb-fn-${entry.id}-${num}`} className={`footnote-list-item${highlightedFn === num ? " pulse" : ""}`}>
                      <div className="footnote-list-num">{num}.</div>
                      <div>
                        <span className="footnote-list-ref">{ref}</span>
                        {verseText && <ExpandableVerse text={verseText} refStr={ref} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="ornament-divider">
              <div className="ornament-divider-line" />
              <div className="ornament-divider-symbol">✦</div>
              <div className="ornament-divider-line" />
            </div>

            <div className="bottom-nav">
              {prevEntry ? (
                <button className="bottom-nav-card" onClick={() => onNavigate(prevEntry.id)}>
                  <div className="bottom-nav-label">‹ Previous</div>
                  <div className="bottom-nav-title">{prevEntry.title}</div>
                </button>
              ) : prevBoundary ? (
                <button className="bottom-nav-card" onClick={onPrevBoundary}>
                  <div className="bottom-nav-label">{prevBoundary.short ? `‹ Previous · ${prevBoundary.short}` : "‹ Previous"}</div>
                  <div className="bottom-nav-title">{prevBoundary.title}</div>
                </button>
              ) : (
                <div className="bottom-nav-card placeholder">
                  <div className="bottom-nav-label">‹ Previous</div>
                  <div className="bottom-nav-title">—</div>
                </div>
              )}

              {nextEntry ? (
                <button className="bottom-nav-card next" onClick={() => onNavigate(nextEntry.id)}>
                  <div className="bottom-nav-label">Next ›</div>
                  <div className="bottom-nav-title">{nextEntry.title}</div>
                </button>
              ) : nextBoundary ? (
                <button className="bottom-nav-card next" onClick={onNextBoundary}>
                  <div className="bottom-nav-label">{nextBoundary.short ? `Next · ${nextBoundary.short} ›` : "Next ›"}</div>
                  <div className="bottom-nav-title">{nextBoundary.title}</div>
                </button>
              ) : (
                <div className="bottom-nav-card next placeholder">
                  <div className="bottom-nav-label">Next ›</div>
                  <div className="bottom-nav-title">—</div>
                </div>
              )}
            </div>

            {/* End matter (W3-14: an entry had none). Songs of the Letters (L4): the songs made from this entry. */}
            <div className="related-section">
              <LetterSongsCard volKey={volKey} letterId={entry.id} letterTitle={entry.title} showSongs={showSongs} />
            </div>
          </div>
        </div>
      </div>
      </>}

      {/* Read-along. Format B timings are stored in the CORPUS offset domain,
          because the rendered one is not stable — it moves with the footnote
          route, with every soft line break, and with whether the lazy Bible
          corpus has landed (a nav link reads "Songofsolomon" until it does).
          offsetMapFn projects onto whatever is on screen right now, which is
          what lets these entries paint a line at a time instead of washing a
          whole paragraph. Both halves are separately gated in Settings.  */}
      {/* Opened from search: every place the words appear, marked, and the pill
          that steps between them. Live pane only, like the read-along. */}
      {!inert && <FindInUnit anchor={surpriseAnchor} unitId={entry.id} mainRef={wtlbMainRef} noun={partLabel === 'Answers' ? 'topic' : 'entry'} keyPrefix={wtlbHlPrefix(entry.id)} />}
      {!inert && <ReadAlongHighlight volKey={volKey} letterId={entry.id} mainRef={wtlbMainRef} onListen={AudioPlayer.hasAudio(volKey, entry.id) ? () => AudioPlayer.playLetter({ volKey, letter: entry, collectionLabel: partLabel || null }) : null} hlKeyFn={wtlbHlKey} readAlongOn={readAlongOn} readAlongFollow={readAlongFollow} offsetMapFn={paraOffsetMap} seekTo={landedPara >= 0 ? wtlbHlKey(entry.id, landedPara) : null} seekOffset={landedOff} />}

      {/* position:fixed bottom sheet. Skipped in an inert peek (a clone is
          non-interactive and a duplicate sheet in <body> would be wrong); for the
          LIVE pane it's portaled to <body> so the page-swipe transform on
          `.pager-track` can't become its containing block and drop it off-screen
          (see ScriptureSheet for the full rationale). */}
      {!inert && ReactDOM.createPortal(
      <>
        {!railMode && <div className={`fn-sheet-backdrop${scriptureRef ? " open" : ""}`} aria-hidden="true" onClick={() => setScriptureRef(null)} />}
        <div className={`fn-sheet${scriptureRef ? " open" : ""}${railMode ? " rail" : ""}`} ref={scripTrapRef} role={railMode ? "complementary" : "dialog"} aria-modal={!railMode && scriptureRef ? "true" : undefined} aria-live={railMode ? "polite" : undefined} aria-atomic={railMode ? "true" : undefined} aria-hidden={!scriptureRef} {...inertAttr(!scriptureRef)} aria-label={scriptureRef ? `Scripture ${scriptureRef}` : "Scripture"}>
          <SheetHandle onClose={() => setScriptureRef(null)} />
          {scriptureRef && (
            <>
              <span className="sc-sheet-tag">Scripture Reference</span>
              <span className="sc-sheet-cite">{scriptureRef}</span>
              {scriptureText ? (
                <div className="sc-sheet-verse"><ScriptureVerseText text={scriptureText} cite={scriptureRef} /></div>
              ) : (
                <div className="sc-sheet-verse" style={{ color: 'var(--cream-dim)', fontStyle: 'italic' }}>Verse text not available in app data</div>
              )}
              {scriptureNote && scriptureNote.version ? (
                <div className="ans-sc-note">
                  <p className="ans-note">{'On the site this reference opens the ' + scriptureNote.version + '. Shown here: NKJV.'}</p>
                  {scriptureNote.siteUrl ? <a className="ans-textbtn" href={scriptureNote.siteUrl} target="_blank" rel="noopener noreferrer">{'Open the ' + scriptureNote.version + ' on Bible Gateway'}<AnsIcon name="ext" /></a> : null}
                </div>
              ) : null}
              {typeof GoToRefButton !== 'undefined' && goToScriptureRef && (
                <GoToRefButton refStr={scriptureRef} onGo={goToScriptureRef} />
              )}
            </>
          )}
        </div>
      </>,
      document.body
      )}
    </ScreenLayout>
  );
}
