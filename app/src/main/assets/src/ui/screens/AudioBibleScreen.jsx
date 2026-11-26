/*
   AudioBibleScreen -- The Bible on Listen (listen.html au-bible, 2026-11-11): its own screen, not a list opening inside
   the root. "Whole Bible" (the editions that read every book) and "Single books" (Matthew, John), each row the
   edition's name, its reading, and Read-along or Listening only; a row opens that edition's books (au-books).
   BIBLE_AUDIO_EDITIONS, bibleAudioOffered and bibleEditionCoverage are bundle-a / bundle-d globals.
*/

import { ListGroup, ListRow } from '../components/UiParts.jsx';
import { bibleBookCount } from './AudioLibraryScreen.jsx';

/** The edition's name in the row: "KJV", "Matthew". @param {any} edition @returns {string} */
export function editionName(edition) {
  return String(edition.short || edition.label || '').split(' · ')[0];
}

/**
 * The row's line: the reading's name from the label, its bracket said as words ("The Word of Promise, dramatized",
 * "The Scriptures of Truth · Benjamin", "The Gospel of John, film audio"); the chip already says read-along or not.
 * @param {any} edition @returns {string}
 */
export function editionReading(edition) {
  const label = String(edition.label || '');
  const at = label.indexOf(' · ');
  let rest = at >= 0 ? label.slice(at + 3) : (edition.description || '');
  const open = rest.indexOf(' (');
  if (open >= 0 && rest.endsWith(')')) {
    const inner = rest.slice(open + 2, -1).replace(/, no read-along$/, '');
    const head = rest.slice(0, open);
    rest = /^read by /i.test(inner) ? head + ' · ' + inner.slice(8) : head + ', ' + inner.charAt(0).toLowerCase() + inner.slice(1);
  }
  return rest;
}

/**
 * @param {{ onBack: () => void, backLabel?: string, onOpenEdition: (volKey: string) => void }} props
 */
export function AudioBibleScreen({ onBack, backLabel = 'Back to Listen', onOpenEdition }) {
  React.useSyncExternalStore(React.useCallback((cb) => AudioPlayer.subscribe(cb), []), AudioPlayer.getShape);
  const editions = Object.values(BIBLE_AUDIO_EDITIONS).filter(bibleAudioOffered);
  const counted = editions.map((edition) => ({ edition, books: bibleBookCount(edition.volKey) }));
  const whole = counted.filter((e) => e.books > 1);
  const single = counted.filter((e) => e.books === 1);
  const same = whole.length && whole.every((e) => e.books === whole[0].books) ? whole[0].books + ' books each' : undefined;

  /** @param {{ edition: any, books: number }} e */
  const row = ({ edition }) => {
    const along = bibleEditionCoverage(edition.volKey) === 'read-along';
    return (
      <ListRow key={edition.volKey} noLead className="listen-edition" title={editionName(edition)} meta={editionReading(edition)}
        mark={{ label: along ? 'Read-along' : 'Listening only' }} onClick={() => onOpenEdition(edition.volKey)} chevron
        ariaLabel={edition.label + (along ? ', read-along' : ', listening only')} />
    );
  };

  return (
    <ScreenLayout utility={{ title: 'The Bible', onBack, backLabel }}>
      <div className="root-screen listen-bible">
        {whole.length ? <ListGroup label="Whole Bible" aside={same}>{whole.map(row)}</ListGroup> : null}
        {single.length ? <ListGroup label="Single books" aside="1 book each">{single.map(row)}</ListGroup> : null}
        <p className="listen-saved-note">Read-along recordings follow the text as they play. Listening only has sound and no moving text.</p>
      </div>
    </ScreenLayout>
  );
}
