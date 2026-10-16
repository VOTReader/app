/* LinksSheet - "Links" (mw8, v2-gaps 24; design dz22 4i; main's LinkSidebar + LinkCard): every link on one passage,
   either way, newest first. Opened by the link icon main's painter puts at the end of a linked passage (applyDOMLinks
   calls window.__openLinkSidebar(key)), on any page, so it is the shell's overlay. A card says To or From and the other
   place's kind, its title (the card opens it), its words and the day it was made; Remove takes the link away at once
   with an Undo in the toast (main asked first). With none left the sheet closes. The overlay also shows links' one toast
   (links.js linkToast: "Linked to ..." from a letter, "Link removed." from here). A gate boot draws its row's links and
   its row's toast (4h). */
import { Icon } from '../Icon.jsx';
import { Sheet, LayerToast } from '../Sheet.jsx';
import { defineOverlay } from '../places.js';
import { placeOfKey } from '../notes-facts.js';
import { linksOn, linkCard, removeLink, restoreLink, inBlock, linkToast } from '../links.js';
import { UNDO_MS } from './LetterScreen.jsx';

const g = /** @type {any} */ (globalThis);

function useLinkVersion(on) {
  const L = on ? g.LinkStore : null;
  const subscribe = React.useCallback((cb) => (L && typeof L.subscribe === 'function' ? L.subscribe(cb) : () => {}), [L]);
  return React.useSyncExternalStore(subscribe, () => (L && typeof L.getVersion === 'function' ? L.getVersion() : 0));
}

/**
 * The sheet itself. `links` main's records touching `block`; `title` the passage's name.
 * @param {{ block: string, title: string, links: any[], now: number, desktop?: boolean, onOpen: (route: any) => void,
 *   onRemove: (link: any) => void, onClose: () => void }} props
 */
export function LinksSheet({ block, title, links, now, desktop = false, onOpen, onRemove, onClose }) {
  const n = links.length;
  return (
    <Sheet kind="lks2" label="Links" desktop={desktop} closeX onClose={onClose}>
      <div className="sh">Links</div>
      <p className="lkct">{(n === 1 ? '1 link' : n + ' links') + (title ? ' · ' + title : '')}</p>
      {links.map((l) => {
        const c = linkCard(l, block, now);
        return (
          <div key={l.id} className="lkc">
            <button type="button" className="lkco" aria-label={'Open linked passage ' + c.title} onClick={() => { if (c.open) onOpen(c.open); }}>
              <span className="je">{c.eyebrow}</span>
              <span className="jh"><span>{c.title}</span><Icon name="chev" /></span>
              {c.text && <span className="jv">{c.text}</span>}
            </button>
            <div className="lkcm">
              <span>{c.day}</span>
              <button type="button" className="textbtn sm" aria-label={'Remove link to ' + c.title} onClick={() => onRemove(l)}>Remove</button>
            </div>
          </div>
        );
      })}
    </Sheet>
  );
}

/**
 * The shell's overlay: answers main's icons (window.__openLinkSidebar) on a real boot; on a gate boot opens with its
 * row (open.sheet 'links', open.block, facts.links). Opening a card closes the sheet and opens that place.
 * @param {{ gate: any, desktop: boolean, go: (route: any) => void }} props
 */
function LinksOverlay({ gate, desktop, go }) {
  const gateOpen = gate && gate.open && gate.open.sheet === 'links' ? gate.open : null;
  const [block, setBlock] = React.useState(gateOpen ? String(gateOpen.block || '') : '');
  const toastVer = React.useSyncExternalStore(linkToast.subscribe, linkToast.version);
  const toast = gate ? gateToast(gate) : linkToast.get();
  const ver = useLinkVersion(!gate);
  React.useEffect(() => {
    if (gate) return undefined;
    const prev = g.__openLinkSidebar;
    g.__openLinkSidebar = (key) => { if (key) setBlock(String(key)); };
    return () => { g.__openLinkSidebar = prev; };
  }, [gate]);
  // a toast goes by itself, unless another has taken its place by then
  React.useEffect(() => {
    if (gate || !toast) return undefined;
    const t = setTimeout(() => { if (linkToast.get() === toast) linkToast.set(null); }, UNDO_MS);
    return () => clearTimeout(t);
  }, [gate, toast, toastVer]);
  const links = React.useMemo(() => {
    if (!block) return [];
    if (gate) {
      return ((gate.facts && gate.facts.links) || []).filter((l) => inBlock(l.source.key, block) || inBlock(l.target.key, block))
        .sort((a, b) => (b.created || 0) - (a.created || 0));
    }
    return linksOn(block);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- ver: read again when a link is made or removed
  }, [block, gate, ver]);
  // the last link removed: the sheet goes (main's sidebar kept an empty "No links yet")
  React.useEffect(() => { if (block && !gate && !links.length) setBlock(''); }, [block, gate, links.length]);
  const now = gate && gate.facts && gate.facts.now ? gate.facts.now : Date.now();
  const sheet = block && links.length ? (
    <LinksSheet block={block} title={placeOfKey(block, g).title} links={links} now={now} desktop={desktop}
      onClose={() => setBlock('')}
      onOpen={(route) => { if (gate) return; setBlock(''); go(route); }}
      onRemove={(l) => {
        if (gate) return;
        removeLink(l.id);
        linkToast.set({ text: 'Link removed.', act: 'Undo', onAct: () => { restoreLink(l); linkToast.set(null); } });
      }} />
  ) : null;
  return (
    <>
      {sheet}
      <LayerToast text={toast ? toast.text : null} icon="link" act={toast ? toast.act : undefined}
        onAct={toast && toast.onAct && !gate ? toast.onAct : undefined} />
    </>
  );
}

/** A gate's link toast (4h: { toast: 'linked', linked: its place }), drawn with its Undo.
 *  @returns {import('../links.js').LinkToast | null} */
function gateToast(gate) {
  const o = gate.open;
  return o && o.toast === 'linked' ? { text: 'Linked to ' + o.linked, act: 'Undo' } : null;
}

defineOverlay('links', LinksOverlay);
