/* letter-text - a letter's blocks as v2 reading text (kit .reader .body). Spacing between segments is the app's one rule
   (utils/segment-dom-text.js segmentRenderText: the read-along offsets are measured on the same text), so v2 renders the
   same DOM text the read-along timings were cut against. */
import { segmentRenderText } from '../utils/segment-dom-text.js';

/** @param {any[]} segments */
export function renderSegments(segments) {
  return segments.map((seg, i) => {
    if (!seg) return null;
    if (seg.t === 'stanza-break') return <span key={i} className="stanza-break" />;
    if (seg.t === 'fn') return <sup key={i} className="fn">{seg.v}</sup>;
    const v = segmentRenderText(segments, i);
    if (seg.t === 'bold-italic') return <i key={i} className="lead-in">{v}</i>;
    if (seg.t === 'italic') return <i key={i}>{v}</i>;
    if (seg.t === 'caps') return <span key={i} className="caps">{v}</span>;
    return <React.Fragment key={i}>{v}</React.Fragment>;
  });
}

/** One corpus block: para / closing / intro as a paragraph; poetry as one paragraph of lines. @param {{ block: any }} props */
export function LetterBlock({ block }) {
  if (block && block.type === 'poetry' && Array.isArray(block.lines)) {
    return (
      <p className="poetry">
        {block.lines.map((line, i) => (Array.isArray(line) && line.length === 1 && line[0].t === 'stanza-break')
          ? <span key={i} className="stanza-break" />
          : <span key={i} className="poem">{renderSegments(Array.isArray(line) ? line : [])}</span>)}
      </p>
    );
  }
  return <p className={block && block.type !== 'para' ? block.type : undefined}>{renderSegments((block && block.segments) || [])}</p>;
}

/** The kit's title step: 52 px, long titles 44 (".display.long"), very long 36 (".longer"). */
export function titleClass(title) {
  const t = String(title || '');
  if (t.length > 56) return 'display longer';
  if (t.length > 13) return 'display long';
  return 'display';
}
