/* MarkSheet - "Mark this paragraph" (picture 4b-mark-paragraph): five highlight colours, Listen from here (a recorded
   paragraph only, with an outline Repeat where it can loop: dz16, v2-gaps 23), Add a note, Link to another passage
   (dz22, v2-gaps 24: it makes a link; Share a link shares the page), Copy, Share a link, Cancel.
   The ringed colour is the paragraph's own highlight, else the colour the reader used last; tapping the ringed colour of a
   highlighted paragraph takes the highlight off. The letter screen does the work (marks.js, main's Listen from here). */
import { Icon } from '../Icon.jsx';
import { Sheet } from '../Sheet.jsx';
import { REPEAT_TIMES } from '../../utils/listen-from.js';

/** The kit's five colours, in the picture's order. */
export const SWATCHES = ['gold', 'sage', 'rose', 'blue', 'plum'];

/**
 * @param {{ colour: string, marked: boolean, desktop?: boolean, onColour: (c: string) => void, onNote: () => void,
 *   onLink?: (() => void) | null, onCopy: () => void, onShare: (() => void) | null, onClose: () => void,
 *   listen?: { reader: string | null, repeat: boolean } | null, onListen?: () => void, onRepeat?: () => void }} props
 *   colour the ringed swatch; marked whether the paragraph already carries that highlight; onLink and onShare null hide
 *   their rows;
 *   listen null hides the Listen row (no recording), its repeat false the Repeat button
 */
export function MarkSheet({ colour, marked, desktop = false, onColour, onNote, onLink = null, onCopy, onShare, onClose, listen = null,
  onListen, onRepeat }) {
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
      {listen && (
        // the row is the kit's .srow.act.lis; its Listen half is a button of its own, so Repeat can sit beside it
        <div className="srow act lis">
          <button type="button" className="lis-go" onClick={onListen}>
            <span className="lead"><Icon name="play" size={18} /></span>
            <span className="tx"><span className="t">Listen from here</span>{listen.reader && <span className="s">{listen.reader}</span>}</span>
          </button>
          {listen.repeat && (
            <button type="button" className="btn2 sm rpt" onClick={onRepeat} aria-label={'Repeat this passage ' + REPEAT_TIMES + ' times'}>
              <Icon name="repeat" />Repeat
            </button>
          )}
        </div>
      )}
      {act('pen', 'Add a note', onNote)}
      {onLink && act('link', 'Link to another passage', onLink)}
      {act('copy', 'Copy', onCopy)}
      {onShare && act('share', 'Share a link', onShare)}
      <button type="button" className="textbtn cancel" onClick={onClose}>Cancel</button>
    </Sheet>
  );
}
