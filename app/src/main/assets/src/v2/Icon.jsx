/* Icon - one kit icon (icons.js) as inline SVG (mw4).
   The wrapper span is display: contents (shell.css), so the <svg> lays out exactly where the kit's pages stamp it: the
   kit's selectors (.tb .ic svg, .tabbar .tab svg, .srow .chev svg ...) size it unchanged. The markup is the kit's own
   constant strings, never user text. */
import { I } from './icons.js';

/**
 * @param {string} name  dotted path into the icon set, e.g. 'chev' or 'tab.home'
 * @param {{ on?: boolean, size?: number }} [opts]
 */
export function iconSvg(name, { on = false, size } = {}) {
  /** @type {any} */
  let v = name.split('.').reduce((/** @type {any} */ o, k) => (o ? o[k] : undefined), I);
  if (typeof v === 'function') v = size != null ? v(size) : v(on);
  if (typeof v !== 'string') throw new Error('v2: no icon ' + name);
  return v;
}

/**
 * @param {{ name: string, on?: boolean, size?: number, flip?: boolean, className?: string }} props  flip: turned round (the
 *   kit's svg.flip: a back chevron); className: on the wrapper, for a kit rule that names the svg's class (.lfr > svg.lead
 *   is .lfr > .v2i.lead > svg in shell.css)
 */
export function Icon({ name, on, size, flip = false, className = '' }) {
  const svg = iconSvg(name, { on, size });
  return <span className={className ? 'v2i ' + className : 'v2i'} aria-hidden="true"
    dangerouslySetInnerHTML={{ __html: flip ? svg.replace('<svg', '<svg class="flip"') : svg }} />;
}
