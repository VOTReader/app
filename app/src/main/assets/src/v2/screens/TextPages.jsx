/* TextPages - Settings > Text and theme (mw11, design dz16 7g; v2-gaps 15) and its Reading font list.
   - Text and theme: the Aa sheet (1c) as a page, without its title and Done (AaControls), main's preview sentence under
     Text size in the chosen size, page and font, then a Reading font row ("EB Garamond · the app's own").
   - Reading font: main's 25 fonts in main's order (utils/reading-fonts.js), each name in its own face, main's words over
     them; a tap keeps it in main's own setting (fontStyle, so main reads the same font) and goes back. The kit's list of
     choices, as Bible translation's (7e). A gate boot shows its facts and writes nothing. */
import { Icon } from '../Icon.jsx';
import { definePlace } from '../places.js';
import { AaControls } from './AaSheet.jsx';
import { writeSetting } from '../settings-pages.js';
import { DEFAULT_FONT, fontRowWords, fontRows } from '../reading-font.js';

/** main's preview sentence (Psalm 119:105, SettingsScreen's text-size preview). */
const PREVIEW = '“Your word is a lamp to my feet and a light to my path.”';

/** The font a page shows as chosen: a gate's, else the reader's (facts.readingFont, read from main's settings). */
const fontOf = (gate, facts) => (gate ? (gate.facts && gate.facts.readingFont) || DEFAULT_FONT : (facts && facts.readingFont) || DEFAULT_FONT);

/** @param {import('../places.js').PlaceProps} props */
export function TextThemePage({ gate, facts, look, setLook, go, onReady }) {
  React.useEffect(() => { onReady(); }, [onReady]);
  const font = fontOf(gate, facts);
  return (
    <>
      <div className="page-head g"><h1 className="display">Text and theme</h1></div>
      {look && setLook && (
        <div className="g aa pg">
          <AaControls look={look} onChange={setLook} preview={<p className="aa-pv">{PREVIEW}</p>} />
        </div>
      )}
      <div className="g settings aax">
        <button type="button" className="srow" onClick={() => go({ place: 'settings/font' })}>
          <span className="tx"><span className="t">Reading font</span><span className="s">{fontRowWords(font)}</span></span>
          <span className="chev"><Icon name="chev" /></span>
        </button>
      </div>
    </>
  );
}

/** @param {import('../places.js').PlaceProps} props */
export function ReadingFontPage({ gate, facts, pop, onReady }) {
  React.useEffect(() => { onReady(); }, [onReady]);
  const value = fontOf(gate, facts);
  const pick = (id) => {
    if (gate) return;
    if (id !== value) writeSetting('fontStyle', id);
    pop();
  };
  return (
    <>
      <div className="page-head g">
        <h1 className="display">Reading font</h1>
        <p className="lede">The typeface for reading text everywhere in the app. Headings keep the app’s own style. Every font is built in and works offline.</p>
      </div>
      <div className="opts trn fnt" role="radiogroup" aria-label="Reading font">
        {fontRows().map((r) => {
          const on = r.id === value;
          return (
            <button key={r.id} type="button" role="radio" aria-checked={on} className={'srow opt gt' + (on ? ' on' : '')} onClick={() => pick(r.id)}>
              <span className="tx">
                <span className="t" style={{ fontFamily: r.css }}>{r.label}</span>
                <span className="s">{r.sub}</span>
              </span>
              {on && <span className="ck"><Icon name="check" /></span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

definePlace('settings/text', { Screen: TextThemePage, title: () => 'Text and theme' });
definePlace('settings/font', { Screen: ReadingFontPage, title: () => 'Reading font' });
