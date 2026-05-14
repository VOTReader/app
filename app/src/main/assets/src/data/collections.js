const COLLECTIONS = [
  { volKey: 'one',     cardId: 'volume-one',        readKey: 'volume-one',      globalName: 'LETTERS_V1',      prefaceGlobal: 'LETTERS_V1_PREFACE',      letterScreen: 'vot-one-letter',     indexScreen: 'vot-one-index',     label: 'Volume One',                                              registryLabel: 'Volume One',                                              searchVolId: 'v1',            kind: 'letter',     surpriseType: 'vot-one' },
  { volKey: 'two',     cardId: 'volume-two',        readKey: 'volume-two',      globalName: 'LETTERS',         prefaceGlobal: null,                       letterScreen: 'vot-letter',         indexScreen: 'vot-index',         label: 'Volume Two',                                              registryLabel: 'Volume Two',                                              searchVolId: 'v2',            kind: 'letter',     surpriseType: 'vot' },
  { volKey: 'three',   cardId: 'volume-three',      readKey: 'volume-three',    globalName: 'LETTERS_V3',      prefaceGlobal: 'LETTERS_V3_PREFACE',      letterScreen: 'vot-three-letter',   indexScreen: 'vot-three-index',   label: 'Volume Three',                                            registryLabel: 'Volume Three',                                            searchVolId: 'v3',            kind: 'letter',     surpriseType: 'vot-three' },
  { volKey: 'four',    cardId: 'volume-four',       readKey: 'volume-four',     globalName: 'LETTERS_V4',      prefaceGlobal: 'LETTERS_V4_PREFACE',      letterScreen: 'vot-four-letter',    indexScreen: 'vot-four-index',    label: 'Volume Four',                                             registryLabel: 'Volume Four',                                             searchVolId: 'v4',            kind: 'letter',     surpriseType: 'vot-four' },
  { volKey: 'five',    cardId: 'volume-five',       readKey: 'volume-five',     globalName: 'LETTERS_V5',      prefaceGlobal: 'LETTERS_V5_PREFACE',      letterScreen: 'vot-five-letter',    indexScreen: 'vot-five-index',    label: 'Volume Five',                                             registryLabel: 'Volume Five',                                             searchVolId: 'v5',            kind: 'letter',     surpriseType: 'vot-five' },
  { volKey: 'six',     cardId: 'volume-six',        readKey: 'volume-six',      globalName: 'LETTERS_V6',      prefaceGlobal: 'LETTERS_V6_PREFACE',      letterScreen: 'vot-six-letter',     indexScreen: 'vot-six-index',     label: 'Volume Six',                                              registryLabel: 'Volume Six',                                              searchVolId: 'v6',            kind: 'letter',     surpriseType: 'vot-six' },
  { volKey: 'seven',   cardId: 'volume-seven',      readKey: 'volume-seven',    globalName: 'LETTERS_V7',      prefaceGlobal: 'LETTERS_V7_PREFACE',      letterScreen: 'vot-seven-letter',   indexScreen: 'vot-seven-index',   label: 'Volume Seven',                                            registryLabel: 'Volume Seven',                                            searchVolId: 'v7',            kind: 'letter',     surpriseType: 'vot-seven' },
  { volKey: 'timothy', cardId: 'letters-timothy',   readKey: 'letters-timothy', globalName: 'LETTERS_TIMOTHY', prefaceGlobal: 'LETTERS_TIMOTHY_PREFACE', letterScreen: 'vot-timothy-letter', indexScreen: 'vot-timothy-index', label: 'Letters from Timothy',                                    registryLabel: 'Letters from Timothy',                                    searchVolId: 'timothy',       kind: 'letter',     surpriseType: 'vot-timothy' },
  { volKey: 'flock',   cardId: 'little-flock',      readKey: 'little-flock',    globalName: 'LETTERS_FLOCK',   prefaceGlobal: 'LETTERS_FLOCK_PREFACE',   letterScreen: 'vot-flock-letter',   indexScreen: 'vot-flock-index',   label: "Letters to The Lord's Little Flock",                       registryLabel: "Letters to The Lord's Little Flock",                       searchVolId: 'flock',         kind: 'letter',     surpriseType: 'vot-flock' },
  { volKey: 'rebuke',  cardId: 'lords-rebuke',      readKey: 'lords-rebuke',    globalName: 'LETTERS_REBUKE',  prefaceGlobal: 'LETTERS_REBUKE_PREFACE',  letterScreen: 'vot-rebuke-letter',  indexScreen: 'vot-rebuke-index',  label: "The Lord's Rebuke",                                       registryLabel: "A Testament Against The World: The Lord's Rebuke",        searchVolId: 'rebuke',        kind: 'letter',     surpriseType: 'vot-rebuke' },
  { volKey: 'wtlb1',   cardId: 'words-to-live-by-1',readKey: 'wtlb-one',        globalName: 'WTLB_ONE',       prefaceGlobal: null,                       letterScreen: 'wtlb-one-entry',     indexScreen: 'wtlb-one-index',    label: 'Words To Live By: Part One',                              registryLabel: 'Words To Live By: Part One',                              searchVolId: 'wtlb1',         kind: 'wtlb',       surpriseType: 'wtlb1' },
  { volKey: 'wtlb2',   cardId: 'words-to-live-by-2',readKey: 'wtlb-two',        globalName: 'WTLB_TWO',       prefaceGlobal: null,                       letterScreen: 'wtlb-two-entry',     indexScreen: 'wtlb-two-index',    label: 'Words To Live By: Part Two',                              registryLabel: 'Words To Live By: Part Two',                              searchVolId: 'wtlb2',         kind: 'wtlb',       surpriseType: 'wtlb2' },
  { volKey: 'blessed', cardId: 'the-blessed',       readKey: 'the-blessed',     globalName: 'THE_BLESSED',     prefaceGlobal: null,                       letterScreen: 'blessed-entry',      indexScreen: 'blessed-index',     label: 'The Blessed',                                             registryLabel: 'The Blessed',                                             searchVolId: 'blessed',       kind: 'blessed',    surpriseType: 'blessed' },
  { volKey: 'holydays',cardId: 'holy-days',         readKey: 'holy-days',       globalName: 'HOLY_DAYS',       prefaceGlobal: null,                       letterScreen: 'holy-days-entry',    indexScreen: 'holy-days-index',   label: 'Regarding The Holy Days',                                 registryLabel: 'Regarding The Holy Days',                                 searchVolId: 'holydays',      kind: 'holy-days',  surpriseType: null },
  { volKey: 'hm',      cardId: null,                readKey: 'hidden-manna',    globalName: 'HIDDEN_MANNA',    prefaceGlobal: null,                       letterScreen: 'hm-letter',          indexScreen: null,                label: 'Hidden Manna',                                            registryLabel: 'Hidden Manna',                                            searchVolId: 'hidden-manna',  kind: 'letter',     surpriseType: null }
];

const COL_BY_KEY       = new Map(COLLECTIONS.map(c => [c.volKey, c]));
const COL_BY_CARD      = new Map(COLLECTIONS.filter(c => c.cardId).map(c => [c.cardId, c]));
const COL_BY_LETTER_SC = new Map(COLLECTIONS.map(c => [c.letterScreen, c]));
const COL_BY_INDEX_SC  = new Map(COLLECTIONS.filter(c => c.indexScreen).map(c => [c.indexScreen, c]));
const COL_BY_SEARCH_ID = new Map(COLLECTIONS.filter(c => c.searchVolId).map(c => [c.searchVolId, c]));
const COL_BY_READ_KEY  = new Map(COLLECTIONS.filter(c => c.readKey).map(c => [c.readKey, c]));
const _NAV_ICONS = {one:'V1',two:'V2',three:'V3',four:'V4',five:'V5',six:'V6',seven:'V7',timothy:'LT',flock:'LF',rebuke:'LR',wtlb1:'W1',wtlb2:'W2',blessed:'TB',holydays:'HD',hm:'HM'};
const COL_NAV_ICON = new Map(COLLECTIONS.map(c => [c.label, _NAV_ICONS[c.volKey] || '?']));

/* Boundary-card short labels (default to .label when same). Used by the
   boundaryConfig() helper inside App() to compute prev/next reading-chain
   transitions. shortFromOutside is the label shown when crossing in from a
   different "family" (Rebuke→WTLB1 shows "Words To Live By", not "Part One"). */
const _BOUNDARY_SHORT = { flock: 'Little Flock', holydays: 'Holy Days', wtlb1: 'Part One', wtlb2: 'Part Two' };
const _BOUNDARY_SHORT_OUTSIDE = { wtlb1: 'Words To Live By', wtlb2: 'Words To Live By' };
COLLECTIONS.forEach(c => {
  c.short = _BOUNDARY_SHORT[c.volKey] || c.label;
  c.shortFromOutside = _BOUNDARY_SHORT_OUTSIDE[c.volKey] || null;
});

/* Reading chain — order in which collections appear in the prev/next nav.
   Optional members (blessed) are skipped when their global is empty. */
const READING_CHAIN = ['one','two','three','four','five','six','seven','rebuke','wtlb1','wtlb2','blessed','flock','timothy','holydays'];
function _isWtlbFamily(col) { return !!col && (col.kind === 'wtlb' || col.kind === 'blessed'); }
function _boundaryShort(sourceCol, targetCol) {
  if (targetCol.shortFromOutside && _isWtlbFamily(sourceCol) !== _isWtlbFamily(targetCol)) return targetCol.shortFromOutside;
  return targetCol.short;
}

function colLetters(col)  { return col && typeof window[col.globalName] !== 'undefined' ? window[col.globalName] : null; }
function colPreface(col)  { return col && col.prefaceGlobal && typeof window[col.prefaceGlobal] !== 'undefined' ? window[col.prefaceGlobal] : null; }
function colLetterArr(col) { if (!col) return []; const arr = colLetters(col); return Array.isArray(arr) ? arr : []; }

const LETTER_SCREEN_SET = new Set(COLLECTIONS.map(c => c.letterScreen).concat(['bible-study-chapter']));

// Phase 2: Normalize all data collections into the unified schema declared in data-schema.d.ts.
// Decorates each collection in the registry with a .normalized property.
if (window.VotNormalize) {
  VotNormalize.normalizeAll(COLLECTIONS);
}
