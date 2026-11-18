/* ═══════════════════════════════════════════════════
   StudyFigure — Cluster D (esbuild bundle-d.js)
   ═══════════════════════════════════════════════════
   A picture inside a study chapter (studies pass 3, hub 2026-11-18). There are
   three kinds, told apart by the file's name as the stylesheet tells them:

     plate    a part's title page ("Part One · YahuShua The Messiah …"): the
              book's own type, cropped to its ink, drawn in the page's colours
     chart    a diagram too fine to read at the column's width: fitted to the
              column, and a tap opens the zoom viewer Answers' charts use
     picture  an illustration, in the column with the card's corners

   Before, a chart kept its natural width inside a sideways-scrolling strip
   with no hint, a white slab running off the screen. */

import { ChartViewer } from '../sheets/AnswersSheets.jsx';
import { UiIcon } from './UiIcon.jsx';

/** @param {string} src @returns {'plate' | 'chart' | 'picture'} */
export function studyFigureKind(src) {
  const s = String(src || '');
  if (s.indexOf('chart') >= 0) return 'chart';
  if (s.indexOf('study-title-') >= 0 || s.indexOf('study-cover-lamb') >= 0) return 'plate';
  return 'picture';
}

/** The chart's name for the viewer's head: the block's alt without its "Chart: " lead. */
export function chartTitle(alt) {
  const s = String(alt || '').trim();
  if (!s) return 'Chart';
  return s.indexOf('Chart: ') === 0 ? s.slice('Chart: '.length) : s;
}

/** @param {{ src: string, alt?: string }} props */
export function StudyFigure({ src, alt }) {
  const kind = studyFigureKind(src);
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  if (kind === 'chart') {
    const title = chartTitle(alt);
    return (
      <>
        <button type="button" className="study-figure is-chart" aria-haspopup="dialog"
          aria-label={title + ', a chart. Opens larger, to zoom'} onClick={() => setOpen(true)}>
          <img src={src} alt="" />
          <span className="study-figure-hint"><UiIcon name="out" size="sm" />Open chart<span className="study-figure-hint-more">{' \xB7 pinch to zoom'}</span></span>
        </button>
        {open ? <ChartViewer chart={{ title, src }} onClose={close} /> : null}
      </>
    );
  }
  return (
    <div className={'study-figure is-' + kind}>
      <img src={src} alt={alt || (kind === 'plate' ? 'Title page' : 'Study picture')} />
    </div>
  );
}
