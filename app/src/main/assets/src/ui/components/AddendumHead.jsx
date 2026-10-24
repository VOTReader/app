/* AddendumHead — a dated addendum header inside a letter, set as the letter's own header is
   (.letter-meta's line classes), one published line per line. The text is the paragraph's
   rendered text character for character (utils/closing-breaks.js): only breaks and styling. */

import { renderTextWithScripRefs } from '../../utils/render-text.jsx';

const PIECE_CLASS = { italic: 'italic-text', 'bold-italic': 'bold-italic', text: null };

export function AddendumHeadLines({ lines, onScripClick, highlightText }) {
  return lines.map((line, li) => (
    <span key={li} className={'addendum-head-line meta-' + line.kind}>
      {line.pieces.map((p, pi) => (
        <React.Fragment key={pi}>{renderTextWithScripRefs(p.text, PIECE_CLASS[p.t], onScripClick, highlightText)}</React.Fragment>
      ))}
    </span>
  ));
}
