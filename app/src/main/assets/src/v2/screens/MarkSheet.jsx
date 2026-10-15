/* MarkSheet - "Mark this paragraph" (picture 4b-mark-paragraph): five highlight colours, Add a note, Copy, Share a link,
   Cancel. The ringed colour is the paragraph's own highlight, else the colour the reader used last; tapping the ringed
   colour of a highlighted paragraph takes the highlight off. The letter screen does the work (marks.js). */
import { Icon } from '../Icon.jsx';
import { Sheet } from '../Sheet.jsx';

/** The kit's five colours, in the picture's order. */
export const SWATCHES = ['gold', 'sage', 'rose', 'blue', 'plum'];

/**
 * @param {{ colour: string, marked: boolean, desktop?: boolean, onColour: (c: string) => void, onNote: () => void,
 *   onCopy: () => void, onShare: (() => void) | null, onClose: () => void }} props
 *   colour the ringed swatch; marked whether the paragraph already carries that highlight; onShare null hides the row
 */
export function MarkSheet({ colour, marked, desktop = false, onColour, onNote, onCopy, onShare, onClose }) {
  const act = (icon, label, fn) => (
    <button type="button" className="srow act" onClick={fn}>
      <span className="lead"><Icon name={icon} /></span>
      <span className="tx"><span className="t">{label}</span></span>
    </button>
  );
  return (
    <Sheet kind="para" label="Mark this paragraph" scrim="light" desktop={desktop} onClose={onClose}>
      <div className="sh">Mark this paragraph</div>
      <div className="swatches">
        {SWATCHES.map((c) => (
          <button key={c} type="button" className={'swatch ' + c + (c === colour ? ' on' : '')}
            aria-label={(marked && c === colour ? 'Remove the ' : 'Highlight ') + c + (marked && c === colour ? ' highlight' : '')}
            aria-pressed={marked && c === colour} onClick={() => onColour(c)} />
        ))}
      </div>
      {act('pen', 'Add a note', onNote)}
      {act('copy', 'Copy', onCopy)}
      {onShare && act('share', 'Share a link', onShare)}
      <button type="button" className="textbtn cancel" onClick={onClose}>Cancel</button>
    </Sheet>
  );
}
