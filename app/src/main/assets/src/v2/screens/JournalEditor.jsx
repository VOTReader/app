/* JournalEditor - one journal entry as a writing surface (zv1; mw9, design dz20 3n, 3o, 4g).

   The page IS the entry: its date, its title and its paragraphs are written in place (fields with no boxes, growing with
   their words), and what Insert added sits between them as main's own blocks: cards (a letter, a chapter, an excerpt),
   the divider, a picture, a voice memo that plays in place (JournalBlocks.jsx draws them; journal-blocks.js says what
   they are). Insert (the top bar's "+ Insert") is main's ten kinds in its four groups; Card and Excerpt open the link
   picker in its card and excerpt modes, and a block goes in under the paragraph the cursor was in (main's
   insertBlockBelow). Bookmark, Note, Journal entry, Notebook and Voice memo come next (mw9b, mw9c).

   It writes through main's own JournalStore (add / update), the entry shape main keeps, so nothing is migrated. It saves
   half a second after the last change, at once after a picture (its blob is already stored), and once more on leaving,
   so Back and Android's Back never lose words. A gate boot reads facts.journalEntry and never writes. */
import { definePlace } from '../places.js';
import { Icon } from '../Icon.jsx';
import { Sheet, LayerToast } from '../Sheet.jsx';
import { isText, newBlock, blockView, insertBelow, targetToBlock, withTail, moveBlock, removedWords, blockName, PICKERS } from '../journal-blocks.js';
import { JournalCard, JournalImage, JournalMemo } from './JournalBlocks.jsx';
import { JournalPick } from './JournalPickers.jsx';
import { LinkPicker } from './LinkPicker.jsx';
import { useVotCorpus } from '../corpus.js';

const g = /** @type {any} */ (globalThis);
const SAVE_AFTER_MS = 500;

/** "October 14, 2026". @param {number} ts */
export function longDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
}

/** Something worth keeping: words in the title or a paragraph, or any block that is not a paragraph (a card, a picture). */
function hasContent(title, blocks) {
  return !!String(title || '').trim() || blocks.some((b) => (isText(b) ? !!b.text.trim() : !!b));
}

/** The blocks as the editor opens them: always a paragraph to write in after the last card (main's rule). */
function openBlocks(entry) {
  const blocks = entry && Array.isArray(entry.blocks) ? entry.blocks.slice() : [];
  if (!blocks.length || !isText(blocks[blocks.length - 1])) blocks.push(newBlock('p', { text: '' }));
  return blocks;
}

/**
 * The entry as the editor holds it, and save(): add once there is something to keep, update after (never for a gate
 * boot, which hands its entry as `seed`).
 * @param {{ id?: string } & Record<string, any>} route @param {boolean} gated @param {any} [seed]
 */
export function useJournalDraft(route, gated, seed = null) {
  const store = gated ? null : g.JournalStore;
  const [entry] = React.useState(() => (gated ? seed
    : route.id && store && typeof store.get === 'function' ? store.get(route.id) : null));
  const [title, setTitle] = React.useState(entry ? entry.title || '' : '');
  const [blocks, setBlocks] = React.useState(() => openBlocks(entry));
  const idRef = React.useRef(gated ? null : entry ? entry.id : null);
  const latest = React.useRef({ title, blocks, dirty: false, now: false });
  latest.current = { ...latest.current, title, blocks };

  const save = React.useCallback(() => {
    const cur = latest.current;
    if (!cur.dirty || !store) return;
    if (!idRef.current) {
      if (!hasContent(cur.title, cur.blocks)) return;
      const made = store.add({ title: cur.title, blocks: cur.blocks });
      idRef.current = made && made.id ? made.id : null;
    } else {
      store.update(idRef.current, { title: cur.title, blocks: cur.blocks });
    }
    latest.current.dirty = false;
  }, [store]);

  const touch = () => { latest.current.dirty = true; };
  const editTitle = (v) => { touch(); setTitle(v); };
  /** @param {number} i @param {string} v */
  const editBlock = (i, v) => { touch(); setBlocks((bs) => bs.map((b, j) => (j === i ? { ...b, text: v } : b))); };
  /** The whole list replaced (Insert); `now` saves without the half second (a picture: its blob is already kept). */
  const putBlocks = (next, now = false) => { touch(); if (now) latest.current.now = true; setBlocks(next); };

  // Save half a second after the last change (at once when asked), and once more on leaving.
  React.useEffect(() => {
    if (!latest.current.dirty) return undefined;
    if (latest.current.now) { latest.current.now = false; save(); return undefined; }
    const t = setTimeout(save, SAVE_AFTER_MS);
    return () => clearTimeout(t);
  }, [title, blocks, save]);
  React.useEffect(() => () => save(), [save]);

  return { entry, title, blocks, editTitle, editBlock, putBlocks, save, id: () => idRef.current };
}

/** A field's height made to fit its words, without the page jumping while it is measured. @param {HTMLTextAreaElement | null} el */
function grow(el) {
  if (!el || !el.clientWidth) return;   // a page kept under another is not laid out: measured again once it shows
  const box = el.parentElement;
  const hold = box ? box.style.minHeight : '';
  if (box) box.style.minHeight = box.offsetHeight + 'px';
  el.style.height = 'auto';
  el.style.height = (el.scrollHeight + el.offsetHeight - el.clientHeight) + 'px';
  if (box) box.style.minHeight = hold;
}

/** A borderless field that grows with its words (the title, a paragraph); `epoch` re-measures after a resize or fonts. */
function GrowField({ value, epoch, fieldRef = null, ...rest }) {
  const ref = React.useRef(/** @type {HTMLTextAreaElement | null} */ (null));
  React.useLayoutEffect(() => { grow(ref.current); }, [value, epoch]);
  const setRef = (el) => {
    ref.current = el;
    if (fieldRef) fieldRef.current = el;
  };
  return <textarea ref={setRef} rows={1} value={value} {...rest} />;
}

/** main's ten, in its four groups (3o); `desk` is the laptop's line where it differs. */
export const INSERT_GROUPS = [
  { label: 'From the library', items: [
    { id: 'card', icon: 'book', name: 'Card', line: 'A letter or a chapter' },
    { id: 'excerpt', icon: 'quote', name: 'Excerpt', line: 'Words from a page' }] },
  { label: 'From your notes', items: [
    { id: 'bookmark', icon: 'bm', name: 'Bookmark', line: 'A saved place' },
    { id: 'note', icon: 'pen', name: 'Note', line: 'One of your notes' },
    { id: 'journal', icon: 'journal', name: 'Journal entry', line: 'Another entry' },
    { id: 'notebook', icon: 'notebook', name: 'Notebook', line: 'A notebook of notes' }] },
  { label: 'Capture', items: [
    { id: 'picture', icon: 'image', name: 'Picture', line: 'From your photos', desk: 'A picture on this computer' },
    { id: 'memo', icon: 'mic', name: 'Voice memo', line: 'Record a prayer' }] },
  { label: 'Text', items: [
    { id: 'text', icon: 'lines', name: 'Text', line: 'A new paragraph' },
    { id: 'divider', icon: 'divider', name: 'Divider', line: '❖ ❖ ❖' }] },
];

/** @param {{ desktop: boolean, onPick: (id: string) => void, onClose: () => void }} props */
function InsertSheet({ desktop, onPick, onClose }) {
  return (
    <Sheet kind="ins" label="Insert" desktop={desktop} closeX onClose={onClose}>
      <div className="sh">Insert</div>
      {INSERT_GROUPS.map((grp) => (
        <React.Fragment key={grp.label}>
          <span className="label ins-l">{grp.label}</span>
          <div className="insg">
            {grp.items.map((it) => (
              <button key={it.id} type="button" className="it" onClick={() => onPick(it.id)}>
                <span className="itt"><Icon name={it.icon} />{it.name}</span>
                <span className="its">{desktop && it.desk ? it.desk : it.line}</span>
              </button>
            ))}
          </div>
        </React.Fragment>
      ))}
    </Sheet>
  );
}

const HOLD_MS = 500;

/**
 * A long press (half a second, the finger still) or the context menu (a right click, the menu key) on a block: `onHold`.
 * The click that ends a long press is swallowed wherever it lands: on the card it would open the page, and on the sheet's
 * scrim, drawn under the finger by then, it would close the sheet it just opened. Spread the result on the block's root;
 * `st` is the editor's one gesture (a ref's object), so a render mid-press keeps its timer.
 * @param {(() => void) | null} onHold
 * @param {{ timer: any, start: { x: number, y: number } | null, held: boolean }} st
 */
function holdProps(onHold, st) {
  if (!onHold) return {};
  const stop = () => { if (st.timer) { clearTimeout(st.timer); st.timer = null; } };
  // one click, at most: it lets go after the click it caught, a moment after the finger is up, or after 1.5 s (a mouse up
  // can land on the scrim, never reaching this block's handlers)
  const unswallow = () => document.removeEventListener('click', swallow, true);
  const swallow = (e) => { e.preventDefault(); e.stopPropagation(); unswallow(); };
  const release = () => {
    stop();
    if (!st.held) return;
    st.held = false;
    setTimeout(unswallow, 350);   // the tap's click comes right after the up
  };
  return {
    onPointerDown: (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      st.held = false;
      st.start = { x: e.clientX, y: e.clientY };
      stop();
      st.timer = setTimeout(() => {
        st.timer = null;
        st.held = true;
        document.addEventListener('click', swallow, true);
        setTimeout(unswallow, 1500);
        onHold();
      }, HOLD_MS);
    },
    onPointerMove: (e) => { if (st.start && Math.hypot(e.clientX - st.start.x, e.clientY - st.start.y) > 8) stop(); },
    onPointerUp: release,
    onPointerCancel: release,
    onContextMenu: (e) => { e.preventDefault(); stop(); onHold(); },
  };
}

/**
 * What a held block can do (design dz20: main's Move up, Move down, Remove): a sheet on the phone, a dialog on the laptop.
 * @param {{ name: string, first: boolean, last: boolean, desktop: boolean, onMove: (by: number) => void,
 *   onRemove: () => void, onClose: () => void }} props
 */
function BlockSheet({ name, first, last, desktop, onMove, onRemove, onClose }) {
  const row = (label, icon, act, off = false, flip = false) => (
    <button type="button" className="srow act" disabled={off} onClick={act}>
      <span className="lead"><Icon name={icon} flip={flip} /></span>
      <span className="tx"><span className="t">{label}</span></span>
    </button>
  );
  return (
    <Sheet kind="jbs" label={name} desktop={desktop} closeX onClose={onClose}>
      <div className="sh">{name}</div>
      {row('Move up', 'arrowUp', () => onMove(-1), first)}
      {row('Move down', 'arrowUp', () => onMove(1), last, true)}
      {row('Remove', 'trash', onRemove)}
    </Sheet>
  );
}

/** The open editors' Insert openers, the newest last: the top bar's button opens the top one's (v2 keeps lower pages mounted). */
const inserters = /** @type {Array<() => void>} */ ([]);

/** The top bar's "+ Insert" (3n). */
function InsertButton() {
  return (
    <button type="button" className="btn2 sm tbj jins" onClick={() => { const f = inserters[inserters.length - 1]; if (f) f(); }}>
      <Icon name="plus" />Insert
    </button>
  );
}

/** @param {import('../places.js').PlaceProps} props */
export function JournalEditor({ route, gate, facts, desktop, go, onReady }) {
  const seed = gate ? (desktop && facts.journalEntryDesktop) || facts.journalEntry || null : null;
  const { entry, title, blocks, editTitle, editBlock, putBlocks, id: entryId } = useJournalDraft(route, !!gate, seed);
  const gateOpen = gate && gate.open ? gate.open : null;
  const gateMedia = gate ? facts.journalMedia || {} : null;
  const gateMemo = gate && facts.journalMemo ? facts.journalMemo : null;
  const [sheet, setSheet] = React.useState(/** @type {null | string} */ (gateOpen
    ? gateOpen.sheet === 'insert' ? 'insert' : gateOpen.sheet === 'link-picker' ? (gateOpen.picker && gateOpen.picker.mode) || 'excerpt' : null
    : null));
  /** The block a long press is acting on (its sheet: Move up, Move down, Remove), by id. */
  const [held, setHeld] = React.useState(/** @type {string | null} */ (null));
  const [toast, setToast] = React.useState(/** @type {{ text: string, act?: string, onAct?: () => void, ms?: number } | null} */ (null));
  const gesture = React.useRef({ timer: null, start: null, held: false });
  const blocksRef = React.useRef(blocks);
  blocksRef.current = blocks;
  const mounted = React.useRef(true);
  React.useEffect(() => () => { mounted.current = false; }, []);
  const [epoch, setEpoch] = React.useState(0);
  const rootRef = React.useRef(/** @type {HTMLDivElement | null} */ (null));
  const titleRef = React.useRef(/** @type {HTMLTextAreaElement | null} */ (null));
  const fileRef = React.useRef(/** @type {HTMLInputElement | null} */ (null));
  /** The paragraph the cursor was last in, and where in it (Insert puts a block under it). */
  const cursor = React.useRef(/** @type {{ id: string, caret: number } | null} */ (null));
  /** Where the cursor goes once an insert has drawn. */
  const focusNext = React.useRef(/** @type {{ id: string, caret: number } | null} */ (null));

  // A letter's card is named from the letters' corpus (lazy): asked for once the entry holds one, drawn again when it lands.
  const needsLetters = blocks.some((b) => b && (b.type === 'letter-card' || b.type === 'bookmark-card' || b.type === 'note-card'));
  const corpus = useVotCorpus(needsLetters);

  // A gate boot is ready once its cards are named, its pictures have loaded and its picker (4g) has drawn its words.
  const gatePictures = gate ? blocks.filter((b) => b && b.type === 'image' && gateMedia[b.mediaId]).length : 0;
  const [loaded, setLoaded] = React.useState(0);
  const [pickerShown, setPickerShown] = React.useState(false);
  const waitPicker = !!(gateOpen && gateOpen.sheet === 'link-picker');
  React.useEffect(() => {
    if (loaded >= gatePictures && (!waitPicker || pickerShown) && !(needsLetters && corpus === 'loading')) onReady();
  }, [onReady, loaded, gatePictures, waitPicker, pickerShown, needsLetters, corpus]);

  // The top bar's Insert opens this editor's sheet.
  React.useEffect(() => {
    const openInsert = () => { if (!gate) setSheet('insert'); };
    inserters.push(openInsert);
    return () => { const i = inserters.indexOf(openInsert); if (i >= 0) inserters.splice(i, 1); };
  }, [gate]);

  // The fields re-measure when the page's width changes and once the faces have loaded.
  React.useEffect(() => {
    const el = rootRef.current;
    let live = true;
    const bump = () => { if (live) setEpoch((n) => n + 1); };
    const fonts = /** @type {any} */ (document).fonts;
    if (fonts && fonts.ready) fonts.ready.then(bump, () => {});
    let ro = null;
    let w = el ? el.clientWidth : 0;
    if (el && typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(() => { if (el.clientWidth !== w) { w = el.clientWidth; bump(); } });
      ro.observe(el);
    }
    return () => { live = false; if (ro) ro.disconnect(); };
  }, []);

  // After an insert, the cursor goes back where it was (or into the new paragraph).
  React.useLayoutEffect(() => {
    const f = focusNext.current;
    const root = rootRef.current;
    if (!f || !root) return;
    focusNext.current = null;
    const el = /** @type {HTMLTextAreaElement | null} */ (root.querySelector('textarea[data-b="' + f.id + '"]'));
    if (!el) return;
    el.focus();
    try { el.setSelectionRange(f.caret, f.caret); } catch (_e) { /* a field that cannot take a caret */ }
    cursor.current = f;
  }, [blocks]);

  const note = (/** @type {string} */ text) => setToast({ text });
  React.useEffect(() => {
    if (!toast) return undefined;
    const t = setTimeout(() => setToast(null), toast.ms || 2600);
    return () => clearTimeout(t);
  }, [toast]);

  /** A held block one place up or down; the entry always ends with a paragraph to write in. */
  const move = (bid, by) => {
    const i = blocks.findIndex((b) => b && b.id === bid);
    const next = moveBlock(blocks, i, by);
    setHeld(null);
    if (next !== blocks) putBlocks(withTail(next));
  };
  /**
   * A held block taken out, with main's Undo (its words, six seconds): Undo puts it back where it was. Once the window has
   * closed, main's purgeBlockMarks takes the block's marks (it keeps them if the block is back by then); a picture's or a
   * memo's blob is left to main's start-up sweep of unreferenced media.
   */
  const remove = (bid) => {
    const i = blocks.findIndex((b) => b && b.id === bid);
    setHeld(null);
    if (i < 0) return;
    const removed = blocks[i];
    putBlocks(withTail(blocks.filter((_b, j) => j !== i)));
    let undone = false;
    setToast({ text: removedWords(removed), act: 'Undo', ms: 6000, onAct: () => {
      undone = true;
      setToast(null);
      const cur = blocksRef.current;
      if (cur.some((b) => b && b.id === removed.id)) return;
      const back = cur.slice();
      back.splice(Math.min(i, back.length), 0, removed);
      putBlocks(withTail(back));
    } });
    setTimeout(() => {
      const eid = entryId();
      const S = g.JournalStore;
      if (undone || !eid || !S || typeof S.purgeBlockMarks !== 'function' || !removed.id) return;
      try { S.purgeBlockMarks(eid, removed.id, mounted.current ? blocksRef.current : undefined); } catch (_e) { /* best effort, as main */ }
    }, 6500);
  };

  /** A block put in under the cursor's paragraph. */
  const insert = (block, now = false) => {
    if (!block) return;
    const out = insertBelow(blocks, cursor.current, block);
    focusNext.current = out.focus;
    putBlocks(out.blocks, now);
  };
  /** Text: a new paragraph under the cursor's, the cursor in it (the trailing empty one when there is no cursor). */
  const insertText = () => {
    const at = cursor.current ? blocks.findIndex((b) => b && b.id === cursor.current.id) : -1;
    const last = blocks[blocks.length - 1];
    if (at < 0 && last && isText(last) && !last.text.trim() && last.id) {
      focusNext.current = { id: last.id, caret: 0 };
      putBlocks(blocks.slice());
      return;
    }
    const p = newBlock('p', { text: '' });
    const next = blocks.slice();
    next.splice(at >= 0 ? at + 1 : next.length, 0, p);
    focusNext.current = { id: p.id, caret: 0 };
    putBlocks(next);
  };
  /** A picture from the reader's photos: main's compress and store, then its block at once. */
  const onFile = (e) => {
    const input = e.currentTarget;
    const file = input.files && input.files[0];
    input.value = '';
    const S = g.JournalMediaStore;
    if (!file || !S) return;
    Promise.resolve(S.compressImage(file, { maxDim: 1600, quality: 0.8 }))
      .then((out) => S.put({ type: 'image', blob: out.blob, mime: 'image/jpeg', width: out.width, height: out.height }))
      .then((mediaId) => insert(newBlock('image', { mediaId, caption: '' }), true))
      .catch(() => note('Could not save that image.'));
  };
  const onInsert = (id) => {
    if (id === 'card' || id === 'excerpt' || PICKERS[id]) { setSheet(id); return; }
    setSheet(null);
    if (id === 'divider') insert(newBlock('divider'));
    else if (id === 'text') insertText();
    else if (id === 'picture') { if (fileRef.current) fileRef.current.click(); }
    else note('Not built yet in v2.');
  };
  const onPicked = (target, item) => {
    const block = targetToBlock(target, item, sheet === 'excerpt');
    setSheet(null);
    if (block) insert(block);
    else note('That place cannot go in an entry.');
  };

  const firstText = blocks.findIndex(isText);
  const heldAt = held ? blocks.findIndex((b) => b && b.id === held) : -1;
  const keep = (b) => (e) => { if (b.id) cursor.current = { id: b.id, caret: e.currentTarget.selectionStart || 0 }; };
  return (
    <>
      <div ref={rootRef} className="g jed jw">
        <p className="mm jdate">{longDate(entry ? entry.created || Date.now() : Date.now())}</p>
        <GrowField className="jt" fieldRef={titleRef} epoch={epoch} placeholder="Title" aria-label="Title" value={title}
          onFocus={() => { cursor.current = null; }}
          onChange={(e) => editTitle(e.target.value.replace(/[\r\n]+/g, ' '))}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return;
            e.preventDefault();
            const p = blocks[firstText];
            const el = p && rootRef.current ? rootRef.current.querySelectorAll('textarea.jp')[0] : null;
            if (el) /** @type {HTMLTextAreaElement} */ (el).focus();
          }} />
        {blocks.map((b, i) => {
          const view = blockView(b);
          const key = b && b.id ? b.id : 'i' + i;
          if (view.kind === 'text') {
            return (
              <GrowField key={key} className="jp" data-b={b.id || undefined} epoch={epoch} value={view.text}
                placeholder={i === firstText ? 'Write here' : ''} aria-label="Entry text" autoFocus={!entry && !gate && i === firstText}
                onChange={(e) => { keep(b)(e); editBlock(i, e.target.value); }}
                onFocus={keep(b)} onSelect={keep(b)} onKeyUp={keep(b)} onClick={keep(b)} />
            );
          }
          const hold = holdProps(gate || !b || !b.id ? null : () => setHeld(b.id), gesture.current);
          if (view.kind === 'card') return <JournalCard key={key} view={view} go={go} hold={hold} />;
          if (view.kind === 'divider') return <div key={key} className="jdiv" aria-hidden="true" {...hold}>❖ ❖ ❖</div>;
          if (view.kind === 'image') return <JournalImage key={key} view={view} gateMedia={gateMedia} onLoaded={() => setLoaded((n) => n + 1)} hold={hold} />;
          if (view.kind === 'memo') return <JournalMemo key={key} view={view} gateMedia={gateMedia} gateMemo={gateMemo} hold={hold} />;
          return <p key={key} className="mm jother" {...hold}>{view.line}</p>;
        })}
        {!gate && <input ref={fileRef} type="file" accept="image/*" hidden onChange={onFile} />}
      </div>
      {sheet === 'insert' && <InsertSheet desktop={desktop} onPick={onInsert} onClose={() => setSheet(null)} />}
      {(sheet === 'card' || sheet === 'excerpt') && (
        <LinkPicker mode={sheet} desktop={desktop} gate={waitPicker ? gateOpen.picker || {} : null}
          onPick={onPicked} onClose={() => setSheet(null)} onShown={() => setPickerShown(true)} />
      )}
      {sheet && PICKERS[sheet] && (
        <JournalPick kind={/** @type {any} */ (sheet)} exclude={entryId() || (entry && entry.id) || null} desktop={desktop}
          onPick={(block) => { setSheet(null); insert(block); }} onClose={() => setSheet(null)} />
      )}
      {heldAt >= 0 && (
        <BlockSheet name={blockName(blocks[heldAt])} first={heldAt === 0} last={heldAt === blocks.length - 1} desktop={desktop}
          onMove={(by) => move(held, by)} onRemove={() => remove(held)} onClose={() => setHeld(null)} />
      )}
      <LayerToast text={toast && toast.text} act={toast && toast.act} onAct={toast && toast.onAct} />
    </>
  );
}

definePlace('journal-entry', {
  Screen: JournalEditor,
  title: (r) => (r.id ? 'Journal entry' : 'New journal entry'),
  barTitle: () => 'Journal entry',
  actions: () => <InsertButton />,
});
