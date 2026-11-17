/* TranslationPill (W2h reader: r-bindex; off the chapter header since Corbin 11-16). The reader's Bible translation as a pill, its code in gold and
   its short name ("NKJV New King James ▾"); a tap opens the "Bible translation" sheet (code, name, one plain line).
   Without a writer it is plain text. TRANSLATION_OPTIONS (index.html) is the one list. */

import { translationName, translationSheetOptions, translationShortName } from '../../data/translations.js';
import { SelectSheet } from './SelectField.jsx';
import { UiIcon } from './UiIcon.jsx';

/** @param {{ translation?: string, onTranslation?: ((v: string) => void) | null }} props */
export function TranslationPill({ translation, onTranslation }) {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  const opts = typeof TRANSLATION_OPTIONS !== 'undefined' && Array.isArray(TRANSLATION_OPTIONS) ? TRANSLATION_OPTIONS : [];
  const code = translation || 'nkjv';
  const found = opts.find((o) => o && o.id === code);
  const label = found ? found.label : code.toUpperCase();
  const canPick = typeof onTranslation === 'function' && opts.length > 1;
  const inner = (
    <>
      <span className="rd-trans-code">{label}</span>
      <span className="rd-trans-name">{translationShortName(translation)}</span>
    </>
  );
  if (!canPick) return <span className="rd-trans-pill is-still">{inner}</span>;
  return (
    <>
      <button type="button" className="rd-trans-pill" aria-haspopup="dialog" aria-expanded={open}
        aria-label={'Bible translation: ' + translationName(translation) + '. Change'} onClick={() => setOpen(true)}>
        {inner}<UiIcon name="down" size="sm" />
      </button>
      <SelectSheet open={open} onClose={close} portal title="Bible translation"
        value={code} options={translationSheetOptions()} onChange={/** @type {(v: string) => void} */ (onTranslation)} />
    </>
  );
}
