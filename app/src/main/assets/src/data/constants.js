const HL_COLORS = ['yellow','green','pink','red','orange','blue','purple','teal','brown','gray'];

const TRANSLATION_OPTIONS = [
  { id: 'nkjv', label: 'NKJV', desc: 'New King James Version — default' },
  { id: 'web', label: 'WEB', desc: 'World English Bible — modern, public domain' },
  { id: 'bsb', label: 'BSB', desc: 'Berean Standard Bible — modern literal' },
  { id: 'hnv', label: 'HNV', desc: 'Hebrew Names Version — names restored (Yeshua, Mattityahu)' },
  { id: 'kjv', label: 'KJV', desc: 'King James Version 1769 — traditional' },
  { id: 'asv', label: 'ASV', desc: 'American Standard Version 1901 — classical literal' },
  { id: 'lsv', label: 'LSV', desc: 'Literal Standard Version — uses YHWH for the Name' },
  { id: 'ylt', label: 'YLT', desc: "Young's Literal Translation 1898 — hyper-literal" }
];

const SCRIPTURE_LAYOUT_OPTIONS = [
  { id: 'genre', label: 'Genre Grid', desc: 'Books grouped by genre with collapsible sections (default)' },
  { id: 'compact', label: 'Compact List', desc: 'Dense single-column list — fastest to scan' },
  { id: 'grid', label: 'Book Grid', desc: 'Flat three-column grid of every book' },
  { id: 'canon', label: 'Canonical', desc: 'Standard biblical order' }
];

const ARROW_LAYOUT_OPTIONS = [
  { id: 'split', label: 'Split · Left + Right', desc: 'Arrows on opposite edges of the content. Default.' },
  { id: 'right', label: 'Right-handed', desc: 'Both arrows tucked on the right for one-thumb reach.' },
  { id: 'left', label: 'Left-handed', desc: 'Both arrows tucked on the left for one-thumb reach.' },
  { id: 'nav', label: 'In Top Nav', desc: 'Small bubble arrows inside the top nav bar.' },
  { id: 'off', label: 'Hidden', desc: 'Hide both arrows. Use the bottom prev/next cards.' }
];

const CLEAR_LABELS = ["Clear", "Are You Sure?", "Confirm"];
const CLEAR_CLASSES = ["settings-clear-btn", "settings-clear-btn warning", "settings-clear-btn danger"];
