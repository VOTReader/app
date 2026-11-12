/* ═══════════════════════════════════════════════════════════════════════
   study-titles — how the study pages lay a title out (Cluster D, bundle-d.js)
   ═══════════════════════════════════════════════════════════════════════
   A study's title on the site is one long line ("YAHUSHUA More Than a Man:
   YahuShua Is The Fulfillment of All Messianic Prophecy (Extensive
   Bible/Letter Study)"): at a heading's size it filled a third of the
   screen. The pages set it in three levels instead: the label above says
   what it is, the name is the heading, the rest is the line under it. No
   word of the title is dropped; the data is not touched.
   ═══════════════════════════════════════════════════════════════════════ */

const TAG_RE = /\s*(?:\((Extensive )?Bible\/Letter Study\)|-\s*Bible\/Letter Study)\s*$/i;

/**
 * A study's title in its parts.
 *   head       the name, up to the first ": " or " - "
 *   tail       what follows it; the study's own subtitle when the title has no second half
 *   extensive  the title ended "(Extensive Bible/Letter Study)": the label says so
 * @param {string} title
 * @param {string} [subtitle]
 * @returns {{ head: string, tail: string, extensive: boolean }}
 */
export function studyTitleParts(title, subtitle) {
  let t = String(title || '').trim();
  let extensive = false;
  const tag = TAG_RE.exec(t);
  if (tag) { extensive = !!tag[1]; t = t.slice(0, tag.index).trim(); }
  const colon = t.indexOf(': ');
  const dash = t.indexOf(' - ');
  const cut = colon > 0 && (dash < 1 || colon < dash) ? colon : dash;
  const head = cut > 0 ? t.slice(0, cut).trim() : t;
  const rest = cut > 0 ? t.slice(cut + (cut === colon ? 2 : 3)).trim() : '';
  const sub = String(subtitle || '').trim();
  return { head, tail: rest && sub ? rest + ' · ' + sub : rest || sub, extensive };
}

/**
 * A chapter's title as a short label and a name: "Section One: YahuShua The Messiah, God With Us" is
 * { over: 'Section One', name: 'YahuShua The Messiah, God With Us' }. The study's own name is left out of the
 * label ("Purity Part One" under Purity is "Part One"). A title with no short label before a colon stays whole.
 * @param {string} title
 * @param {string} [studyHead]
 * @returns {{ over: string, name: string }}
 */
export function chapterTitleParts(title, studyHead) {
  const t = String(title || '').trim();
  const i = t.indexOf(': ');
  if (i < 1 || i > 24 || i + 2 >= t.length) return { over: '', name: t };
  let over = t.slice(0, i).trim();
  const head = String(studyHead || '').trim();
  if (head && over.length > head.length && over.toLowerCase().startsWith(head.toLowerCase() + ' ')) over = over.slice(head.length).trim();
  return { over, name: t.slice(i + 2).trim() };
}

/**
 * Where the reader goes next in a study, and what to call it.
 * @param {any[]} order            the study's chapters in reading order
 * @param {string | null} currentId  the chapter last open, if any
 * @param {(ch: any) => boolean} read
 * @returns {{ k: string, ch: any } | null}
 */
export function studyNextStep(order, currentId, read) {
  if (!order || !order.length) return null;
  const at = currentId ? order.findIndex((c) => c.id === currentId) : -1;
  if (at >= 0 && !read(order[at])) return { k: 'Continue', ch: order[at] };
  const unread = order.slice(at + 1).find((c) => !read(c)) || order.find((c) => !read(c));
  if (!unread) return { k: 'Read again', ch: order[0] };
  return { k: at >= 0 || order.some(read) ? 'Up next' : 'Start here', ch: unread };
}
