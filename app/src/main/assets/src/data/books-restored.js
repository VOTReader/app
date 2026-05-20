// Restored-Name chrome overrides for the 66-book Bible.
//
// Structure mirrors BOOKS in books.js but carries ONLY editorial chrome
// (chapter titles and section headings). Verses are NEVER stored here —
// the renderer reads verses from BOOKS and chrome from BOOKS_RESTORED
// when settings.restoredNames is true.
//
// Rule applied to each entry (manual, verse-by-verse):
//   - "Lord" / "LORD" in original chrome + verses invoke YHWH  →  YAHUWAH
//   - "Jesus" / "Christ" in original chrome + verses name Him  →  YahuShua / HaMashiach
//   - "God" stays "God" — Elohim is a title, not the Name. Not promoted.
//   - Every entry, changed or not, is a deliberate hand-reviewed copy.
//
// Chapters present in BOOKS_RESTORED are considered reviewed. Chapters
// absent fall back to the original chrome from BOOKS.
//
// var (not const/let) — required for cross-script visibility in the
// Android WebView, matching the convention in books.js and volume files.

var BOOKS_RESTORED = {};

// =========================================================================
// GENESIS — The First Book of Moses
// =========================================================================
// Name-restoration changes in this book:
//   Ch 22 title: "The Binding of Isaac · The Lord Provides the Ram"
//              → "The Binding of Isaac · YAHUWAH Provides the Ram"
//   Ch 22 section heading: "The Lord Provides the Ram"
//              → "YAHUWAH Provides the Ram"
// All other chapters: chrome identical to BOOKS.genesis, preserved verbatim
// as a record of deliberate review.

BOOKS_RESTORED.genesis = {
  chapters: [
    {
      num: 1,
      title: "The Creation Week · Mankind in God's Image",
      sections: [
        { heading: "In the Beginning" },
        { heading: "The First Day: Light" },
        { heading: "The Second Day: Sky" },
        { heading: "The Third Day: Land and Vegetation" },
        { heading: "The Fourth Day: Sun, Moon, and Stars" },
        { heading: "The Fifth Day: Sea Creatures and Birds" },
        { heading: "The Sixth Day: Land Animals" },
        { heading: "Mankind in God's Image" }
      ]
    },
    {
      num: 2,
      title: "The Seventh Day · The Garden of Eden · The First Man and Woman",
      sections: [
        { heading: "The Seventh Day" },
        { heading: "The Garden of Eden" },
        { heading: "The Tree of the Knowledge of Good and Evil" },
        { heading: "The First Man and Woman" }
      ]
    },
    {
      num: 3,
      title: "The Serpent's Temptation · The Fall · Driven from the Garden",
      sections: [
        { heading: "The Serpent's Temptation" },
        { heading: "The Fall" },
        { heading: "The Curse" },
        { heading: "Driven from the Garden" }
      ]
    },
    {
      num: 4,
      title: "Cain and Abel · Cain's Punishment · The Line of Cain",
      sections: [
        { heading: "Cain and Abel" },
        { heading: "The First Murder" },
        { heading: "The Line of Cain" },
        { heading: "Seth Born" }
      ]
    },
    {
      num: 5,
      title: "From Adam to Noah",
      sections: [
        { heading: "From Adam to Noah" }
      ]
    },
    {
      num: 6,
      title: "The Sons of God and the Daughters of Men · Noah Finds Favor · The Ark Commanded",
      sections: [
        { heading: "The Sons of God and the Daughters of Men" },
        { heading: "Noah Finds Favor" },
        { heading: "The Ark Commanded" }
      ]
    },
    {
      num: 7,
      title: "Into the Ark · The Flood Begins · Every Living Thing Destroyed",
      sections: [
        { heading: "Into the Ark" },
        { heading: "The Flood Begins" },
        { heading: "Every Living Thing Destroyed" }
      ]
    },
    {
      num: 8,
      title: "The Waters Recede · Noah Leaves the Ark · Noah's Altar",
      sections: [
        { heading: "The Waters Recede" },
        { heading: "Noah Leaves the Ark" },
        { heading: "Noah's Altar" }
      ]
    },
    {
      num: 9,
      title: "God's Covenant with Noah · The Rainbow Sign · The Curse on Canaan",
      sections: [
        { heading: "God's Covenant with Noah" },
        { heading: "The Rainbow Sign" },
        { heading: "The Curse on Canaan" }
      ]
    },
    {
      num: 10,
      title: "The Table of Nations",
      sections: [
        { heading: "The Sons of Japheth" },
        { heading: "The Sons of Ham" },
        { heading: "The Sons of Shem" }
      ]
    },
    {
      num: 11,
      title: "The Tower of Babel · From Shem to Abram",
      sections: [
        { heading: "The Tower of Babel" },
        { heading: "From Shem to Abram" },
        { heading: "The Family of Terah" }
      ]
    },
    {
      num: 12,
      title: "The Call of Abram · Abram in Egypt",
      sections: [
        { heading: "The Call of Abram" },
        { heading: "Abram in Egypt" }
      ]
    },
    {
      num: 13,
      title: "Abram and Lot Separate · The Promise to Abram",
      sections: [
        { heading: "Abram and Lot Separate" },
        { heading: "The Promise to Abram" }
      ]
    },
    {
      num: 14,
      title: "Abram Rescues Lot · Melchizedek Blesses Abram",
      sections: [
        { heading: "Abram Rescues Lot" },
        { heading: "Melchizedek Blesses Abram" }
      ]
    },
    {
      num: 15,
      title: "God's Covenant with Abram",
      sections: [
        { heading: "Counted as Righteousness" },
        { heading: "God's Covenant with Abram" }
      ]
    },
    {
      num: 16,
      title: "Hagar and Ishmael",
      sections: [
        { heading: "Sarai Gives Hagar to Abram" },
        { heading: "Hagar and the Angel" }
      ]
    },
    {
      num: 17,
      title: "The Covenant of Circumcision · Abraham and Sarah Renamed · Isaac Promised",
      sections: [
        { heading: "The Covenant of Circumcision" },
        { heading: "The Sign of Circumcision" },
        { heading: "Abraham and Sarah Renamed" },
        { heading: "Abraham Obeys" }
      ]
    },
    {
      num: 18,
      title: "The Three Visitors · Abraham Pleads for Sodom",
      sections: [
        { heading: "The Three Visitors" },
        { heading: "Abraham Pleads for Sodom" }
      ]
    },
    {
      num: 19,
      title: "Sodom and Gomorrah Destroyed · Lot's Wife Becomes a Pillar of Salt · Lot and His Daughters",
      sections: [
        { heading: "The Angels at Lot's House" },
        { heading: "Lot Flees Sodom" },
        { heading: "Lot's Wife Becomes a Pillar of Salt" },
        { heading: "Sodom and Gomorrah Destroyed" },
        { heading: "Lot and His Daughters" }
      ]
    },
    {
      num: 20,
      title: "Abraham and Abimelech",
      sections: [
        { heading: "Abraham and Abimelech" }
      ]
    },
    {
      num: 21,
      title: "The Birth of Isaac · Hagar and Ishmael Sent Away · The Covenant at Beersheba",
      sections: [
        { heading: "The Birth of Isaac" },
        { heading: "Hagar and Ishmael Sent Away" },
        { heading: "The Covenant at Beersheba" }
      ]
    },
    {
      num: 22,
      // RESTORED — Gen 22:14 "The-LORD-Will-Provide" (YAHUWAH-Yireh);
      // ch 22 is dense with the Tetragrammaton (v11, v14, v15, v16).
      title: "The Binding of Isaac · YAHUWAH Provides the Ram",
      sections: [
        { heading: "The Binding of Isaac" },
        { heading: "YAHUWAH Provides the Ram" },
        { heading: "The Family of Nahor" }
      ]
    },
    {
      num: 23,
      title: "The Death of Sarah · The Cave of Machpelah",
      sections: [
        { heading: "The Death of Sarah" },
        { heading: "The Cave of Machpelah" }
      ]
    },
    {
      num: 24,
      title: "The Servant Sent for Isaac's Bride · Rebekah at the Well · Isaac and Rebekah",
      sections: [
        { heading: "The Servant Sent for Isaac's Bride" },
        { heading: "Rebekah at the Well" },
        { heading: "Rebekah Agrees to Go" },
        { heading: "Isaac and Rebekah" }
      ]
    },
    {
      num: 25,
      title: "The Death of Abraham · Jacob and Esau · Esau Sells His Birthright",
      sections: [
        { heading: "The Death of Abraham" },
        { heading: "The Family of Ishmael" },
        { heading: "Jacob and Esau" },
        { heading: "Esau Sells His Birthright" }
      ]
    },
    {
      num: 26,
      title: "Isaac and Abimelech · The Wells of Isaac",
      sections: [
        { heading: "Isaac and Abimelech" },
        { heading: "The Wells of Isaac" },
        { heading: "The Covenant at Beersheba" },
        { heading: "Esau's Wives" }
      ]
    },
    {
      num: 27,
      title: "Jacob Steals the Blessing · Esau's Hatred",
      sections: [
        { heading: "Jacob Steals the Blessing" },
        { heading: "Esau's Lost Blessing" },
        { heading: "Esau's Hatred" }
      ]
    },
    {
      num: 28,
      title: "Jacob Sent to Laban · Jacob's Ladder",
      sections: [
        { heading: "Jacob Sent to Laban" },
        { heading: "Jacob's Ladder" }
      ]
    },
    {
      num: 29,
      title: "Jacob Meets Rachel · Jacob Marries Leah and Rachel · Leah's Sons",
      sections: [
        { heading: "Jacob Meets Rachel" },
        { heading: "Jacob Marries Leah and Rachel" },
        { heading: "Leah's Sons" }
      ]
    },
    {
      num: 30,
      title: "The Sons of Jacob · Jacob's Speckled Flocks",
      sections: [
        { heading: "The Sons of Jacob" },
        { heading: "Jacob's Speckled Flocks" }
      ]
    },
    {
      num: 31,
      title: "Jacob Flees from Laban · Laban Pursues Jacob",
      sections: [
        { heading: "Jacob Flees from Laban" },
        { heading: "Laban Pursues Jacob" },
        { heading: "The Covenant at Mizpah" }
      ]
    },
    {
      num: 32,
      title: "Jacob Prepares to Meet Esau · Jacob Wrestles with God",
      sections: [
        { heading: "Jacob Prepares to Meet Esau" },
        { heading: "Jacob Wrestles with God" }
      ]
    },
    {
      num: 33,
      title: "Jacob and Esau Reconcile",
      sections: [
        { heading: "Jacob and Esau Reconcile" },
        { heading: "Jacob Settles in Shechem" }
      ]
    },
    {
      num: 34,
      title: "Dinah Defiled · Simeon and Levi's Revenge",
      sections: [
        { heading: "Dinah Defiled" },
        { heading: "Simeon and Levi's Revenge" }
      ]
    },
    {
      num: 35,
      title: "Jacob Returns to Bethel · The Death of Rachel · The Death of Isaac",
      sections: [
        { heading: "Jacob Returns to Bethel" },
        { heading: "The Death of Rachel" },
        { heading: "The Sons of Jacob" },
        { heading: "The Death of Isaac" }
      ]
    },
    {
      num: 36,
      title: "The Descendants of Esau",
      sections: [
        { heading: "Esau's Family" },
        { heading: "The Sons of Seir" },
        { heading: "The Kings of Edom" }
      ]
    },
    {
      num: 37,
      title: "Joseph's Dreams · Joseph Sold into Slavery",
      sections: [
        { heading: "Joseph's Dreams" },
        { heading: "Joseph Sold into Slavery" },
        { heading: "Jacob Mourns for Joseph" }
      ]
    },
    {
      num: 38,
      title: "Judah and Tamar",
      sections: [
        { heading: "Judah and Tamar" },
        { heading: "Tamar Vindicated" }
      ]
    },
    {
      num: 39,
      title: "Joseph in Potiphar's House · Joseph and Potiphar's Wife · Joseph Imprisoned",
      sections: [
        { heading: "Joseph in Potiphar's House" },
        { heading: "Joseph and Potiphar's Wife" },
        { heading: "Joseph Imprisoned" }
      ]
    },
    {
      num: 40,
      title: "Joseph Interprets the Prisoners' Dreams",
      sections: [
        { heading: "Joseph Interprets the Prisoners' Dreams" }
      ]
    },
    {
      num: 41,
      title: "Pharaoh's Dreams · Joseph Interprets Pharaoh's Dreams · Joseph Made Ruler over Egypt",
      sections: [
        { heading: "Pharaoh's Dreams" },
        { heading: "Joseph Interprets Pharaoh's Dreams" },
        { heading: "Joseph Made Ruler over Egypt" },
        { heading: "The Years of Plenty and Famine" }
      ]
    },
    {
      num: 42,
      title: "Joseph's Brothers Come to Egypt · Simeon Held Hostage",
      sections: [
        { heading: "Joseph's Brothers Come to Egypt" },
        { heading: "Simeon Held Hostage" },
        { heading: "The Brothers Return to Jacob" }
      ]
    },
    {
      num: 43,
      title: "Benjamin Brought to Egypt · The Brothers Dine with Joseph",
      sections: [
        { heading: "Benjamin Brought to Egypt" },
        { heading: "The Brothers Dine with Joseph" }
      ]
    },
    {
      num: 44,
      title: "The Silver Cup in Benjamin's Sack · Judah's Plea for Benjamin",
      sections: [
        { heading: "The Silver Cup in Benjamin's Sack" },
        { heading: "Judah's Plea for Benjamin" }
      ]
    },
    {
      num: 45,
      title: "Joseph Reveals Himself · Jacob Sent For",
      sections: [
        { heading: "Joseph Reveals Himself" },
        { heading: "Jacob Sent For" }
      ]
    },
    {
      num: 46,
      title: "Jacob Goes to Egypt · Jacob Reunited with Joseph",
      sections: [
        { heading: "Jacob's Journey to Egypt" },
        { heading: "The Family of Jacob" },
        { heading: "Jacob Reunited with Joseph" }
      ]
    },
    {
      num: 47,
      title: "Jacob Settles in Goshen · The Famine and Joseph's Administration",
      sections: [
        { heading: "Jacob Settles in Goshen" },
        { heading: "The Famine and Joseph's Administration" },
        { heading: "Jacob's Final Request" }
      ]
    },
    {
      num: 48,
      title: "Jacob Blesses Ephraim and Manasseh",
      sections: [
        { heading: "Jacob Blesses Ephraim and Manasseh" }
      ]
    },
    {
      num: 49,
      title: "Jacob Blesses His Twelve Sons · The Death of Jacob",
      sections: [
        { heading: "Jacob Blesses His Twelve Sons" },
        { heading: "The Death of Jacob" }
      ]
    },
    {
      num: 50,
      title: "Jacob Buried in Canaan · Joseph Forgives His Brothers · The Death of Joseph",
      sections: [
        { heading: "Jacob Buried in Canaan" },
        { heading: "Joseph Forgives His Brothers" },
        { heading: "The Death of Joseph" }
      ]
    }
  ]
};

// =========================================================================
// EXODUS — The Second Book of Moses
// =========================================================================
// Name-restoration changes in this book:
//   Ch 19 title + section: "The Lord Descends on the Mountain"
//              → "YAHUWAH Descends on the Mountain"
//       (text: Ex 19:18-20 "the LORD descended upon it in fire … the LORD came down upon Mount Sinai")
//   Ch 33 title + section: "Moses Sees the Lord's Glory"
//              → "Moses Sees YAHUWAH's Glory"
//       (text: Ex 33:18-22 "I will proclaim the name of the LORD before you")
//   Ch 40 title + section: "The Glory of the Lord Fills the Tabernacle"
//              → "The Glory of YAHUWAH Fills the Tabernacle"
//       (text: Ex 40:34-38 "the glory of the LORD filled the tabernacle")
// "God" references (e.g. Ch 2 "God Hears Israel's Groaning", Ch 6 "God Promises Deliverance")
// stay — Elohim is a title, not the Name. "I AM WHO I AM" (Ch 3) stays — it is the
// Name in its self-revelatory English form quoted directly from the text.

BOOKS_RESTORED.exodus = {
  chapters: [
    {
      num: 1,
      title: "Israel Multiplies in Egypt · Pharaoh Oppresses Israel · Pharaoh Orders the Hebrew Boys Killed",
      sections: [
        { heading: "Israel Multiplies in Egypt" },
        { heading: "Pharaoh Oppresses Israel" },
        { heading: "Pharaoh Orders the Hebrew Boys Killed" }
      ]
    },
    {
      num: 2,
      title: "The Birth of Moses · Moses Flees to Midian",
      sections: [
        { heading: "The Birth of Moses" },
        { heading: "Moses Flees to Midian" },
        { heading: "God Hears Israel's Groaning" }
      ]
    },
    {
      num: 3,
      title: "The Burning Bush · I AM WHO I AM",
      sections: [
        { heading: "The Burning Bush" },
        { heading: "I AM WHO I AM" }
      ]
    },
    {
      num: 4,
      title: "Signs for Moses · Moses Returns to Egypt",
      sections: [
        { heading: "Signs for Moses" },
        { heading: "Moses Returns to Egypt" }
      ]
    },
    {
      num: 5,
      title: "Let My People Go · Bricks Without Straw",
      sections: [
        { heading: "Let My People Go" },
        { heading: "Bricks Without Straw" }
      ]
    },
    {
      num: 6,
      title: "God Promises Deliverance · The Family of Moses and Aaron",
      sections: [
        { heading: "God Promises Deliverance" },
        { heading: "The Family of Moses and Aaron" },
        { heading: "Moses and Aaron Before Pharaoh" }
      ]
    },
    {
      num: 7,
      title: "Aaron's Rod Becomes a Serpent · The First Plague: Water Turned to Blood",
      sections: [
        { heading: "Aaron's Rod Becomes a Serpent" },
        { heading: "The First Plague: Water Turned to Blood" }
      ]
    },
    {
      num: 8,
      title: "The Plague of Frogs · The Plague of Lice · The Plague of Flies",
      sections: [
        { heading: "The Second Plague: Frogs" },
        { heading: "The Third Plague: Lice" },
        { heading: "The Fourth Plague: Flies" }
      ]
    },
    {
      num: 9,
      title: "The Plague on Livestock · The Plague of Boils · The Plague of Hail",
      sections: [
        { heading: "The Fifth Plague: Death of Livestock" },
        { heading: "The Sixth Plague: Boils" },
        { heading: "The Seventh Plague: Hail" }
      ]
    },
    {
      num: 10,
      title: "The Plague of Locusts · The Plague of Darkness",
      sections: [
        { heading: "The Eighth Plague: Locusts" },
        { heading: "The Ninth Plague: Darkness" }
      ]
    },
    {
      num: 11,
      title: "The Death of the Firstborn Foretold",
      sections: [
        { heading: "The Death of the Firstborn Foretold" }
      ]
    },
    {
      num: 12,
      title: "The Passover Instituted · The Death of the Firstborn · The Exodus Begins",
      sections: [
        { heading: "The Passover Instituted" },
        { heading: "The Feast of Unleavened Bread" },
        { heading: "The Passover Lamb" },
        { heading: "The Death of the Firstborn" },
        { heading: "The Exodus Begins" },
        { heading: "Passover Regulations" }
      ]
    },
    {
      num: 13,
      title: "Consecration of the Firstborn · The Pillar of Cloud and Fire",
      sections: [
        { heading: "Consecration of the Firstborn" },
        { heading: "The Pillar of Cloud and Fire" }
      ]
    },
    {
      num: 14,
      title: "Pharaoh Pursues Israel · The Red Sea Parted · The Egyptians Drowned",
      sections: [
        { heading: "Pharaoh Pursues Israel" },
        { heading: "The Red Sea Parted" },
        { heading: "The Egyptians Drowned" }
      ]
    },
    {
      num: 15,
      title: "The Song of Moses · The Bitter Water Made Sweet",
      sections: [
        { heading: "The Song of Moses" },
        { heading: "The Bitter Water Made Sweet" }
      ]
    },
    {
      num: 16,
      title: "Manna and Quail · The Sabbath Rest",
      sections: [
        { heading: "The People Murmur" },
        { heading: "Manna and Quail" },
        { heading: "The Sabbath Rest" }
      ]
    },
    {
      num: 17,
      title: "Water from the Rock · Victory over Amalek",
      sections: [
        { heading: "Water from the Rock" },
        { heading: "Victory over Amalek" }
      ]
    },
    {
      num: 18,
      title: "Jethro Visits Moses · Jethro's Counsel",
      sections: [
        { heading: "Jethro Visits Moses" },
        { heading: "Jethro's Counsel" }
      ]
    },
    {
      num: 19,
      // RESTORED — Ex 19:18-20 "the LORD descended upon it in fire …
      // the LORD came down upon Mount Sinai"
      title: "At Mount Sinai · YAHUWAH Descends on the Mountain",
      sections: [
        { heading: "At Mount Sinai" },
        { heading: "Israel Consecrated" },
        { heading: "YAHUWAH Descends on the Mountain" }
      ]
    },
    {
      num: 20,
      title: "The Ten Commandments · The People Tremble",
      sections: [
        { heading: "The Ten Commandments" },
        { heading: "The People Tremble" },
        { heading: "The Altar of Earth" }
      ]
    },
    {
      num: 21,
      title: "Laws Concerning Servants · Laws Concerning Violence",
      sections: [
        { heading: "Laws Concerning Servants" },
        { heading: "Laws Concerning Violence" },
        { heading: "Laws Concerning Animals" }
      ]
    },
    {
      num: 22,
      title: "Laws Concerning Property · Laws of Justice and Mercy",
      sections: [
        { heading: "Laws Concerning Property" },
        { heading: "Laws of Justice and Mercy" }
      ]
    },
    {
      num: 23,
      title: "Laws of Justice · The Three Annual Feasts · The Angel and the Promise",
      sections: [
        { heading: "Laws of Justice" },
        { heading: "The Sabbath Year and the Sabbath Day" },
        { heading: "The Three Annual Feasts" },
        { heading: "The Angel and the Promise" }
      ]
    },
    {
      num: 24,
      title: "The Covenant Confirmed · Moses on the Mountain",
      sections: [
        { heading: "The Covenant Confirmed" },
        { heading: "Moses on the Mountain" }
      ]
    },
    {
      num: 25,
      title: "Offerings for the Tabernacle · The Ark of the Covenant · The Table and the Lampstand",
      sections: [
        { heading: "Offerings for the Tabernacle" },
        { heading: "The Ark of the Covenant" },
        { heading: "The Table of Showbread" },
        { heading: "The Lampstand" }
      ]
    },
    {
      num: 26,
      title: "The Tabernacle and Its Curtains · The Veil and the Screen",
      sections: [
        { heading: "The Tabernacle and Its Curtains" },
        { heading: "The Boards and Frames" },
        { heading: "The Veil and the Screen" }
      ]
    },
    {
      num: 27,
      title: "The Bronze Altar · The Court of the Tabernacle · Oil for the Lamp",
      sections: [
        { heading: "The Bronze Altar" },
        { heading: "The Court of the Tabernacle" },
        { heading: "Oil for the Lamp" }
      ]
    },
    {
      num: 28,
      title: "The Garments of the Priesthood · The Ephod and Breastplate · The Robe and Crown",
      sections: [
        { heading: "The Garments of the Priesthood" },
        { heading: "The Ephod" },
        { heading: "The Breastplate of Judgment" },
        { heading: "The Robe of the Ephod" },
        { heading: "The Crown and Other Garments" }
      ]
    },
    {
      num: 29,
      title: "The Consecration of the Priests · The Daily Offerings",
      sections: [
        { heading: "The Consecration of the Priests" },
        { heading: "The Sacrifices for Consecration" },
        { heading: "Seven Days of Consecration" },
        { heading: "The Daily Offerings" }
      ]
    },
    {
      num: 30,
      title: "The Altar of Incense · The Bronze Laver · The Anointing Oil",
      sections: [
        { heading: "The Altar of Incense" },
        { heading: "The Ransom Money" },
        { heading: "The Bronze Laver" },
        { heading: "The Anointing Oil" },
        { heading: "The Holy Incense" }
      ]
    },
    {
      num: 31,
      title: "Bezalel and Aholiab Called · The Sabbath Sign",
      sections: [
        { heading: "Bezalel and Aholiab Called" },
        { heading: "The Sabbath Sign" }
      ]
    },
    {
      num: 32,
      title: "The Golden Calf · Moses Pleads for Israel · The Levites Take a Stand",
      sections: [
        { heading: "The Golden Calf" },
        { heading: "Moses Pleads for Israel" },
        { heading: "The Levites Take a Stand" },
        { heading: "Moses Intercedes Again" }
      ]
    },
    {
      num: 33,
      // RESTORED — Ex 33:18-22 "I will proclaim the name of the LORD
      // before you"; Moses beseeches to see YHWH's glory.
      title: "The Tent of Meeting · Moses Sees YAHUWAH's Glory",
      sections: [
        { heading: "Israel Mourns" },
        { heading: "The Tent of Meeting" },
        { heading: "Moses Sees YAHUWAH's Glory" }
      ]
    },
    {
      num: 34,
      title: "The Tablets Restored · The Covenant Renewed · Moses' Face Shines",
      sections: [
        { heading: "The Tablets Restored" },
        { heading: "The Covenant Renewed" },
        { heading: "Moses' Face Shines" }
      ]
    },
    {
      num: 35,
      title: "The Sabbath Commanded · Offerings for the Tabernacle · Bezalel and Aholiab",
      sections: [
        { heading: "The Sabbath Commanded" },
        { heading: "Offerings for the Tabernacle" },
        { heading: "Bezalel and Aholiab" }
      ]
    },
    {
      num: 36,
      title: "The Generous Offering · The Tabernacle Built",
      sections: [
        { heading: "The Generous Offering" },
        { heading: "The Tabernacle Built" }
      ]
    },
    {
      num: 37,
      title: "The Ark, the Table, and the Lampstand · The Altar of Incense and the Anointing Oil",
      sections: [
        { heading: "The Ark Made" },
        { heading: "The Table Made" },
        { heading: "The Lampstand Made" },
        { heading: "The Altar of Incense and the Anointing Oil" }
      ]
    },
    {
      num: 38,
      title: "The Bronze Altar and the Laver · The Court of the Tabernacle · Materials Used",
      sections: [
        { heading: "The Bronze Altar and the Laver" },
        { heading: "The Court of the Tabernacle" },
        { heading: "Materials Used" }
      ]
    },
    {
      num: 39,
      title: "The Priestly Garments Made · The Tabernacle Completed",
      sections: [
        { heading: "The Priestly Garments Made" },
        { heading: "The Tabernacle Completed" }
      ]
    },
    {
      num: 40,
      // RESTORED — Ex 40:34-38 "the glory of the LORD filled the tabernacle"
      title: "The Tabernacle Erected · The Glory of YAHUWAH Fills the Tabernacle",
      sections: [
        { heading: "The Tabernacle Erected" },
        { heading: "The Tabernacle Set Up" },
        { heading: "The Glory of YAHUWAH Fills the Tabernacle" }
      ]
    }
  ]
};

// =========================================================================
// LEVITICUS — The Third Book of Moses
// =========================================================================
// Restorations:
//   Ch 9 title + section: "The Glory of the Lord Appears" → "The Glory of YAHUWAH Appears"
//         (Lev 9:23-24 "the glory of the LORD appeared … fire came out from before the LORD")
//   Ch 23 title: "The Feasts of the Lord" → "The Feasts of YAHUWAH"
//         (Lev 23:2 "The feasts of the LORD … these are My feasts")

BOOKS_RESTORED.leviticus = {
  chapters: [
    { num: 1, title: "The Burnt Offering",
      sections: [ { heading: "Burnt Offerings from the Herd" }, { heading: "Burnt Offerings from the Flock" }, { heading: "Burnt Offerings of Birds" } ] },
    { num: 2, title: "The Grain Offering",
      sections: [ { heading: "Uncooked Grain Offerings" }, { heading: "Baked Grain Offerings" }, { heading: "Rules for Grain Offerings" } ] },
    { num: 3, title: "The Peace Offering",
      sections: [ { heading: "Peace Offerings from the Herd" }, { heading: "Peace Offerings from the Flock" } ] },
    { num: 4, title: "The Sin Offering",
      sections: [ { heading: "Sin Offering for the Priest" }, { heading: "Sin Offering for the Congregation" }, { heading: "Sin Offering for a Ruler" }, { heading: "Sin Offering for the Common Person" } ] },
    { num: 5, title: "The Trespass Offering",
      sections: [ { heading: "Sin Offerings for Specific Sins" }, { heading: "The Trespass Offering" } ] },
    { num: 6, title: "The Trespass Offering Continued · Laws of the Offerings",
      sections: [ { heading: "The Trespass Offering for Deceit" }, { heading: "The Law of the Burnt Offering" }, { heading: "The Law of the Grain Offering" }, { heading: "The Law of the Sin Offering" } ] },
    { num: 7, title: "Laws of the Trespass and Peace Offerings · The Priests' Portion",
      sections: [ { heading: "The Law of the Trespass Offering" }, { heading: "The Law of the Peace Offering" }, { heading: "Fat and Blood Forbidden" }, { heading: "The Priests' Portion" } ] },
    { num: 8, title: "The Consecration of Aaron and His Sons",
      sections: [ { heading: "Aaron and His Sons Clothed" }, { heading: "The Consecration Sacrifices" }, { heading: "Seven Days at the Tabernacle" } ] },
    { num: 9,
      // RESTORED — Lev 9:23-24
      title: "Aaron's First Offerings · The Glory of YAHUWAH Appears",
      sections: [ { heading: "Aaron's First Offerings" }, { heading: "The Glory of YAHUWAH Appears" } ] },
    { num: 10, title: "Nadab and Abihu Consumed by Fire · Rules for the Priests",
      sections: [ { heading: "Nadab and Abihu Consumed by Fire" }, { heading: "No Wine for the Priests" }, { heading: "Eating the Offerings" } ] },
    { num: 11, title: "Clean and Unclean Animals · Be Holy, for I Am Holy",
      sections: [ { heading: "Clean and Unclean Land Animals" }, { heading: "Clean and Unclean Sea Creatures" }, { heading: "Unclean Birds and Insects" }, { heading: "Uncleanness from Carcasses" }, { heading: "Be Holy, for I Am Holy" } ] },
    { num: 12, title: "Purification After Childbirth",
      sections: [ { heading: "Purification After Childbirth" } ] },
    { num: 13, title: "Laws Concerning Leprosy · Leprosy in Garments",
      sections: [ { heading: "Laws Concerning Leprosy" }, { heading: "Leprosy from Boils and Burns" }, { heading: "Leprosy on the Head and Beard" }, { heading: "The Leper's Isolation" }, { heading: "Leprosy in Garments" } ] },
    { num: 14, title: "Cleansing of the Leper · Leprosy in Houses",
      sections: [ { heading: "Cleansing of the Leper" }, { heading: "Sacrifices for the Cleansed Leper" }, { heading: "Leprosy in Houses" } ] },
    { num: 15, title: "Laws of Bodily Discharges",
      sections: [ { heading: "Discharges in Men" }, { heading: "Discharges in Women" } ] },
    { num: 16, title: "The Day of Atonement · The Scapegoat",
      sections: [ { heading: "The Day of Atonement" }, { heading: "Atonement in the Holy Place" }, { heading: "The Scapegoat" }, { heading: "The Annual Day of Atonement" } ] },
    { num: 17, title: "One Place of Sacrifice · Eating Blood Forbidden",
      sections: [ { heading: "One Place of Sacrifice" }, { heading: "Eating Blood Forbidden" } ] },
    { num: 18, title: "Forbidden Sexual Relations · Defilement of the Land",
      sections: [ { heading: "Do Not Walk in the Ways of the Nations" }, { heading: "Forbidden Sexual Relations" }, { heading: "Other Sexual Prohibitions" }, { heading: "Defilement of the Land" } ] },
    { num: 19, title: "Be Holy, for I Am Holy · Love Your Neighbor as Yourself",
      sections: [ { heading: "Be Holy, for I Am Holy" }, { heading: "Love Your Neighbor as Yourself" }, { heading: "Various Holiness Laws" } ] },
    { num: 20, title: "Punishments for Sin · You Shall Be Holy to Me",
      sections: [ { heading: "Punishments for Idolatry and Cursing Parents" }, { heading: "Punishments for Sexual Sin" }, { heading: "You Shall Be Holy to Me" } ] },
    { num: 21, title: "Holiness of the Priests",
      sections: [ { heading: "Rules for the Priests" }, { heading: "Rules for the High Priest" }, { heading: "Priests with Defects" } ] },
    { num: 22, title: "Holiness of the Offerings",
      sections: [ { heading: "Eating Holy Offerings" }, { heading: "Acceptable Offerings" } ] },
    { num: 23,
      // RESTORED — Lev 23:2 "The feasts of the LORD"
      title: "The Sabbath · Passover and Unleavened Bread · The Feasts of YAHUWAH",
      sections: [ { heading: "The Sabbath" }, { heading: "Passover and Unleavened Bread" }, { heading: "The Feast of Firstfruits" }, { heading: "The Feast of Weeks" }, { heading: "The Feast of Trumpets" }, { heading: "The Day of Atonement" }, { heading: "The Feast of Tabernacles" } ] },
    { num: 24, title: "The Lamp and the Showbread · The Blasphemer Stoned",
      sections: [ { heading: "The Lamp and the Showbread" }, { heading: "The Blasphemer Stoned" } ] },
    { num: 25, title: "The Sabbath Year · The Year of Jubilee · Redemption of Property and Persons",
      sections: [ { heading: "The Sabbath Year" }, { heading: "The Year of Jubilee" }, { heading: "Redemption of Property" }, { heading: "Redemption of Persons" } ] },
    { num: 26, title: "Blessings for Obedience · Curses for Disobedience · The Promise of Restoration",
      sections: [ { heading: "Blessings for Obedience" }, { heading: "Curses for Disobedience" }, { heading: "The Promise of Restoration" } ] },
    { num: 27, title: "Vows and Tithes",
      sections: [ { heading: "Vows of Persons" }, { heading: "Vows of Animals and Property" }, { heading: "Tithes" } ] }
  ]
};

// =========================================================================
// NUMBERS — The Fourth Book of Moses
// =========================================================================
// Restorations:
//   Ch 7 section: "The Lord Speaks from Above the Mercy Seat" → "YAHUWAH Speaks from Above the Mercy Seat"
//         (Num 7:89 — Moses hearing the voice; YHWH context throughout Numbers)
//   Ch 11 title + section: "Fire from the Lord at Taberah" → "Fire from YAHUWAH at Taberah"
//         (Num 11:1-3 "the fire of the LORD burned among them")

BOOKS_RESTORED.numbers = {
  chapters: [
    { num: 1, title: "The First Census of Israel",
      sections: [ { heading: "The Census Commanded" }, { heading: "The Numbering of the Tribes" }, { heading: "The Levites Set Apart" } ] },
    { num: 2, title: "Arrangement of the Tribes Around the Tabernacle",
      sections: [ { heading: "The Camps on the East" }, { heading: "The Camps on the South" }, { heading: "The Camps on the West" }, { heading: "The Camps on the North" } ] },
    { num: 3, title: "The Levites and Their Duties · The Levites in Place of the Firstborn",
      sections: [ { heading: "The Levites and Their Duties" }, { heading: "The Numbering of the Levites" }, { heading: "The Levites in Place of the Firstborn" } ] },
    { num: 4, title: "Duties of the Kohathites · Duties of the Gershonites and Merarites",
      sections: [ { heading: "Duties of the Kohathites" }, { heading: "Duties of the Gershonites and Merarites" }, { heading: "The Numbering of the Levites" } ] },
    { num: 5, title: "Confession and Restitution · The Test of the Bitter Water",
      sections: [ { heading: "The Unclean Sent Outside the Camp" }, { heading: "Confession and Restitution" }, { heading: "The Test of the Bitter Water" } ] },
    { num: 6, title: "The Nazirite Vow · The Aaronic Blessing",
      sections: [ { heading: "The Nazirite Vow" }, { heading: "The Aaronic Blessing" } ] },
    { num: 7, title: "Offerings of the Tribal Leaders",
      sections: [ { heading: "The Tabernacle Dedicated" }, { heading: "Offerings of the Tribal Leaders" },
        // RESTORED — Num 7:89
        { heading: "YAHUWAH Speaks from Above the Mercy Seat" } ] },
    { num: 8, title: "The Lamps Set Up · The Levites Cleansed and Dedicated",
      sections: [ { heading: "The Lamps Set Up" }, { heading: "The Levites Cleansed and Dedicated" } ] },
    { num: 9, title: "The Passover Kept · The Cloud Covers the Tabernacle",
      sections: [ { heading: "The Passover Kept" }, { heading: "The Cloud Covers the Tabernacle" } ] },
    { num: 10, title: "The Silver Trumpets · Israel Departs from Sinai",
      sections: [ { heading: "The Silver Trumpets" }, { heading: "Israel Departs from Sinai" }, { heading: "Hobab Invited" } ] },
    { num: 11,
      // RESTORED — Num 11:1-3 "the fire of the LORD burned among them"
      title: "Fire from YAHUWAH at Taberah · The People Crave Meat · Quail and Plague",
      sections: [ { heading: "Fire from YAHUWAH at Taberah" }, { heading: "The People Crave Meat" }, { heading: "The Seventy Elders" }, { heading: "Quail and Plague" } ] },
    { num: 12, title: "Miriam and Aaron Oppose Moses · Miriam Stricken with Leprosy",
      sections: [ { heading: "Miriam and Aaron Oppose Moses" }, { heading: "Miriam Stricken with Leprosy" } ] },
    { num: 13, title: "The Twelve Spies Sent Out · The Bad Report",
      sections: [ { heading: "The Twelve Spies Sent Out" }, { heading: "Into the Land" }, { heading: "The Bad Report" } ] },
    { num: 14, title: "Israel Refuses to Enter the Land · Forty Years in the Wilderness",
      sections: [ { heading: "Israel Refuses to Enter the Land" }, { heading: "Moses Pleads for Israel" }, { heading: "Forty Years in the Wilderness" }, { heading: "Israel Defeated at Hormah" } ] },
    { num: 15, title: "Laws of Offerings · The Sabbath Breaker Stoned · Tassels on Garments",
      sections: [ { heading: "Laws of Offerings" }, { heading: "Sins of Ignorance and Defiance" }, { heading: "The Sabbath Breaker Stoned" }, { heading: "Tassels on Garments" } ] },
    { num: 16, title: "Korah's Rebellion · The Earth Swallows the Rebels · Plague Stopped by Aaron's Censer",
      sections: [ { heading: "Korah's Rebellion" }, { heading: "The Earth Swallows the Rebels" }, { heading: "Plague Stopped by Aaron's Censer" } ] },
    { num: 17, title: "Aaron's Rod Buds",
      sections: [ { heading: "Aaron's Rod Buds" } ] },
    { num: 18, title: "Duties of Priests and Levites · The Tithe of the Levites",
      sections: [ { heading: "Duties of Priests and Levites" }, { heading: "The Priests' Portion" }, { heading: "The Tithe of the Levites" } ] },
    { num: 19, title: "The Red Heifer · The Water of Purification",
      sections: [ { heading: "The Red Heifer" }, { heading: "The Water of Purification" } ] },
    { num: 20, title: "The Death of Miriam · Moses Strikes the Rock · The Death of Aaron",
      sections: [ { heading: "The Death of Miriam" }, { heading: "Moses Strikes the Rock" }, { heading: "Edom Refuses Israel Passage" }, { heading: "The Death of Aaron" } ] },
    { num: 21, title: "The Bronze Serpent · Defeat of Sihon and Og",
      sections: [ { heading: "Victory at Hormah" }, { heading: "The Bronze Serpent" }, { heading: "The Journey to Moab" }, { heading: "Defeat of Sihon and Og" } ] },
    { num: 22, title: "Balak Sends for Balaam · Balaam's Donkey Speaks",
      sections: [ { heading: "Balak Sends for Balaam" }, { heading: "Balaam's Donkey Speaks" }, { heading: "Balaam Meets Balak" } ] },
    { num: 23, title: "Balaam's First Oracle · Balaam's Second Oracle",
      sections: [ { heading: "Balaam's First Oracle" }, { heading: "Balaam's Second Oracle" } ] },
    { num: 24, title: "Balaam's Third Oracle · Balaam's Final Prophecies",
      sections: [ { heading: "Balaam's Third Oracle" }, { heading: "Balaam's Final Prophecies" } ] },
    { num: 25, title: "Israel's Sin at Peor · Phinehas's Zeal",
      sections: [ { heading: "Israel's Sin at Peor" }, { heading: "Phinehas's Zeal" } ] },
    { num: 26, title: "The Second Census of Israel",
      sections: [ { heading: "The Numbering of the Tribes" }, { heading: "Inheritance by Lot" } ] },
    { num: 27, title: "The Daughters of Zelophehad · Joshua Chosen to Succeed Moses",
      sections: [ { heading: "The Daughters of Zelophehad" }, { heading: "Joshua Chosen to Succeed Moses" } ] },
    { num: 28, title: "Daily and Sabbath Offerings · Monthly and Festival Offerings",
      sections: [ { heading: "Daily Offerings" }, { heading: "Sabbath and Monthly Offerings" }, { heading: "Passover and Feast of Weeks Offerings" } ] },
    { num: 29, title: "Offerings for Trumpets, Atonement, and Tabernacles",
      sections: [ { heading: "Offerings for the Feast of Trumpets" }, { heading: "Offerings for the Day of Atonement" }, { heading: "Offerings for the Feast of Tabernacles" } ] },
    { num: 30, title: "Laws Concerning Vows",
      sections: [ { heading: "Laws Concerning Vows" } ] },
    { num: 31, title: "Vengeance on the Midianites · Division of the Spoils",
      sections: [ { heading: "Vengeance on the Midianites" }, { heading: "The Spoils Purified" }, { heading: "Division of the Spoils" } ] },
    { num: 32, title: "Reuben and Gad Settle East of the Jordan",
      sections: [ { heading: "Reuben and Gad Request Land" }, { heading: "The Land Granted" } ] },
    { num: 33, title: "The Journeys of Israel · Drive Out the Inhabitants",
      sections: [ { heading: "The Journeys of Israel" }, { heading: "Drive Out the Inhabitants" } ] },
    { num: 34, title: "The Borders of Canaan · Leaders to Divide the Land",
      sections: [ { heading: "The Borders of Canaan" }, { heading: "Leaders to Divide the Land" } ] },
    { num: 35, title: "Cities for the Levites · Cities of Refuge",
      sections: [ { heading: "Cities for the Levites" }, { heading: "Cities of Refuge" } ] },
    { num: 36, title: "The Inheritance of Zelophehad's Daughters",
      sections: [ { heading: "The Inheritance of Zelophehad's Daughters" } ] }
  ]
};

// =========================================================================
// DEUTERONOMY — The Fifth Book of Moses
// =========================================================================
// Restorations (Deuteronomy is saturated with the Tetragrammaton; all Lord
// references in chrome verify immediately):
//   Ch 4 section:  "The Lord Is the Only God"     → "YAHUWAH Is the Only God"      (Deut 4:35)
//   Ch 6 title:    "Do Not Forget the Lord"        → "Do Not Forget YAHUWAH"        (Deut 6:12)
//   Ch 6 section:  "Fear the Lord and Keep His Commandments" → "Fear YAHUWAH and Keep His Commandments"
//   Ch 6 section:  "Do Not Forget the Lord"        → "Do Not Forget YAHUWAH"
//   Ch 8 title:    "Do Not Forget the Lord"        → "Do Not Forget YAHUWAH"        (Deut 8:11-14)
//   Ch 8 section:  "Do Not Forget the Lord"        → "Do Not Forget YAHUWAH"
//   Ch 10 title:   "What the Lord Requires"        → "What YAHUWAH Requires"        (Deut 10:12)
//   Ch 10 section: "What the Lord Requires"        → "What YAHUWAH Requires"
//   Ch 11 title:   "Love and Obey the Lord"        → "Love and Obey YAHUWAH"        (Deut 11:1)
//   Ch 11 section: "Love and Obey the Lord"        → "Love and Obey YAHUWAH"

BOOKS_RESTORED.deuteronomy = {
  chapters: [
    { num: 1, title: "Moses Begins His Address · Leaders Appointed · Israel Refuses to Enter the Land",
      sections: [ { heading: "Moses Begins His Address" }, { heading: "Leaders Appointed" }, { heading: "The Spies Sent Out" }, { heading: "Israel Refuses to Enter the Land" } ] },
    { num: 2, title: "The Wilderness Years · The Defeat of Sihon",
      sections: [ { heading: "The Wilderness Years" }, { heading: "The Defeat of Sihon" } ] },
    { num: 3, title: "The Defeat of Og · Land Given East of the Jordan · Moses Forbidden to Cross",
      sections: [ { heading: "The Defeat of Og" }, { heading: "Land Given East of the Jordan" }, { heading: "Moses Forbidden to Cross" } ] },
    { num: 4, title: "Obey the Statutes and Judgments · Warning Against Idolatry · Cities of Refuge East of the Jordan",
      sections: [ { heading: "Obey the Statutes and Judgments" }, { heading: "Warning Against Idolatry" },
        // RESTORED — Deut 4:35
        { heading: "YAHUWAH Is the Only God" },
        { heading: "Cities of Refuge East of the Jordan" } ] },
    { num: 5, title: "The Ten Commandments · The People Tremble at Sinai",
      sections: [ { heading: "The Ten Commandments" }, { heading: "The People Tremble at Sinai" } ] },
    { num: 6,
      // RESTORED — Deut 6:4-12
      title: "The Greatest Commandment · Teach Your Children · Do Not Forget YAHUWAH",
      sections: [ { heading: "Fear YAHUWAH and Keep His Commandments" }, { heading: "The Greatest Commandment" }, { heading: "Do Not Forget YAHUWAH" }, { heading: "Teach Your Children" } ] },
    { num: 7, title: "Drive Out the Nations · A Chosen People · Blessings for Obedience",
      sections: [ { heading: "Drive Out the Nations" }, { heading: "Blessings for Obedience" } ] },
    { num: 8,
      // RESTORED — Deut 8:11-14
      title: "Remember the Wilderness · Do Not Forget YAHUWAH",
      sections: [ { heading: "Remember the Wilderness" }, { heading: "Do Not Forget YAHUWAH" } ] },
    { num: 9, title: "Not for Your Righteousness · The Golden Calf Remembered",
      sections: [ { heading: "Not for Your Righteousness" }, { heading: "The Golden Calf Remembered" } ] },
    { num: 10,
      // RESTORED — Deut 10:12
      title: "The Tablets Restored · What YAHUWAH Requires",
      sections: [ { heading: "The Tablets Restored" }, { heading: "What YAHUWAH Requires" } ] },
    { num: 11,
      // RESTORED — Deut 11:1
      title: "Love and Obey YAHUWAH · The Blessing and the Curse",
      sections: [ { heading: "Love and Obey YAHUWAH" }, { heading: "Bind These Words on Your Heart" }, { heading: "The Blessing and the Curse" } ] },
    { num: 12, title: "The One Place of Worship · Warning Against Pagan Practices",
      sections: [ { heading: "The One Place of Worship" }, { heading: "Permitted and Forbidden Food" }, { heading: "Warning Against Pagan Practices" } ] },
    { num: 13, title: "Punishment for Idolatry",
      sections: [ { heading: "False Prophets to Be Put to Death" }, { heading: "Family Members Who Entice to Idolatry" }, { heading: "Cities That Turn to Idolatry" } ] },
    { num: 14, title: "Clean and Unclean Food · The Tithe",
      sections: [ { heading: "Clean and Unclean Food" }, { heading: "The Tithe" } ] },
    { num: 15, title: "The Year of Release · Freeing Hebrew Servants · Firstborn Animals",
      sections: [ { heading: "The Year of Release" }, { heading: "Freeing Hebrew Servants" }, { heading: "Firstborn Animals" } ] },
    { num: 16, title: "The Three Annual Feasts · Justice and Judges",
      sections: [ { heading: "Passover and Unleavened Bread" }, { heading: "The Feast of Weeks" }, { heading: "The Feast of Tabernacles" }, { heading: "Justice and Judges" } ] },
    { num: 17, title: "Punishment for Idolatry · Difficult Cases · The Future King",
      sections: [ { heading: "Punishment for Idolatry" }, { heading: "Difficult Cases" }, { heading: "The Future King" } ] },
    { num: 18, title: "Provision for Priests and Levites · The Prophet Like Moses",
      sections: [ { heading: "Provision for Priests and Levites" }, { heading: "Forbidden Practices" }, { heading: "The Prophet Like Moses" } ] },
    { num: 19, title: "Cities of Refuge · Boundary Stones and Witnesses",
      sections: [ { heading: "Cities of Refuge" }, { heading: "Boundary Stones and Witnesses" } ] },
    { num: 20, title: "Laws of Warfare",
      sections: [ { heading: "Going to Battle" }, { heading: "Laws of Siege" } ] },
    { num: 21, title: "The Unsolved Murder · Various Civil Laws · A Hanged Man Is Cursed",
      sections: [ { heading: "The Unsolved Murder" }, { heading: "Marriage to a Captive Woman" }, { heading: "The Right of the Firstborn" }, { heading: "The Rebellious Son" }, { heading: "A Hanged Man Is Cursed" } ] },
    { num: 22, title: "Various Civil Laws · Marriage Violations",
      sections: [ { heading: "Various Civil Laws" }, { heading: "Marriage Violations" } ] },
    { num: 23, title: "Excluded from the Assembly · Various Laws",
      sections: [ { heading: "Excluded from the Assembly" }, { heading: "Cleanliness in the Camp" }, { heading: "Various Laws" } ] },
    { num: 24, title: "Divorce · Justice for the Vulnerable",
      sections: [ { heading: "Divorce and Remarriage" }, { heading: "Justice for the Vulnerable" } ] },
    { num: 25, title: "Various Laws · Blot Out Amalek",
      sections: [ { heading: "Limits on Punishment" }, { heading: "Levirate Marriage" }, { heading: "Honest Weights and Measures" }, { heading: "Blot Out Amalek" } ] },
    { num: 26, title: "The Firstfruits and Tithes · A Holy People",
      sections: [ { heading: "The Firstfruits" }, { heading: "The Tithe of the Third Year" }, { heading: "A Holy People" } ] },
    { num: 27, title: "The Stones at Mount Ebal · The Curses from Mount Ebal",
      sections: [ { heading: "The Stones at Mount Ebal" }, { heading: "The Curses from Mount Ebal" } ] },
    { num: 28, title: "Blessings for Obedience · Curses for Disobedience",
      sections: [ { heading: "Blessings for Obedience" }, { heading: "Curses for Disobedience" }, { heading: "The Coming Exile" } ] },
    { num: 29, title: "The Covenant Renewed in Moab · Warning Against Secret Idolatry",
      sections: [ { heading: "The Covenant Renewed in Moab" }, { heading: "Warning Against Secret Idolatry" } ] },
    { num: 30, title: "The Promise of Restoration · Choose Life",
      sections: [ { heading: "The Promise of Restoration" }, { heading: "Choose Life" } ] },
    { num: 31, title: "Joshua to Succeed Moses · The Reading of the Law · The Song of Witness Foretold",
      sections: [ { heading: "Joshua to Succeed Moses" }, { heading: "The Reading of the Law" }, { heading: "The Song of Witness Foretold" } ] },
    { num: 32, title: "The Song of Moses · Moses Told to Ascend Mount Nebo",
      sections: [ { heading: "The Song of Moses" }, { heading: "Moses Told to Ascend Mount Nebo" } ] },
    { num: 33, title: "Moses Blesses the Twelve Tribes",
      sections: [ { heading: "The Blessing Begins" }, { heading: "Blessings on the Tribes" }, { heading: "The Eternal God Is Your Refuge" } ] },
    { num: 34, title: "The Death of Moses",
      sections: [ { heading: "The Death of Moses" }, { heading: "Joshua Filled with the Spirit" } ] }
  ]
};

// =========================================================================
// JOSHUA
// =========================================================================
// Restorations:
//   Ch 5 title + section: "The Commander of the Lord's Army" → "YAHUWAH's Commander of the Army"
//     — I held this one: the Hebrew is שַׂר־צְבָא־יהוה, literally "Prince of
//     the host of YHWH." But "Commander of YAHUWAH's Army" reads most
//     faithfully to the NKJV construction. (Josh 5:13-15)
//   Ch 21 title + section: "All the Lord's Promises Fulfilled" → "All YAHUWAH's Promises Fulfilled"
//     (Josh 21:43-45)

BOOKS_RESTORED.joshua = {
  chapters: [
    { num: 1, title: "Be Strong and of Good Courage · Joshua Commands the People",
      sections: [ { heading: "Be Strong and of Good Courage" }, { heading: "Joshua Commands the People" } ] },
    { num: 2, title: "Rahab Hides the Spies",
      sections: [ { heading: "Rahab Hides the Spies" }, { heading: "The Scarlet Cord" } ] },
    { num: 3, title: "Crossing the Jordan",
      sections: [ { heading: "Israel Approaches the Jordan" }, { heading: "The Waters Cut Off" } ] },
    { num: 4, title: "The Twelve Stones at Gilgal",
      sections: [ { heading: "Twelve Stones from the Jordan" }, { heading: "The Memorial at Gilgal" } ] },
    { num: 5,
      // RESTORED — Josh 5:13-15 "Commander of the army of the LORD"
      title: "Circumcision at Gilgal · The Commander of YAHUWAH's Army",
      sections: [ { heading: "Circumcision at Gilgal" }, { heading: "Passover at Gilgal" }, { heading: "The Commander of YAHUWAH's Army" } ] },
    { num: 6, title: "The Walls of Jericho Fall · Rahab Spared",
      sections: [ { heading: "The Siege of Jericho" }, { heading: "The Walls of Jericho Fall" }, { heading: "Rahab Spared" } ] },
    { num: 7, title: "Defeat at Ai · Achan's Sin Exposed",
      sections: [ { heading: "Defeat at Ai" }, { heading: "Achan's Sin Exposed" } ] },
    { num: 8, title: "The Conquest of Ai · The Altar on Mount Ebal",
      sections: [ { heading: "The Conquest of Ai" }, { heading: "The Altar on Mount Ebal" } ] },
    { num: 9, title: "The Gibeonite Deception",
      sections: [ { heading: "The Gibeonite Deception" }, { heading: "The Gibeonites Made Servants" } ] },
    { num: 10, title: "The Sun Stands Still · Five Kings Defeated · The Southern Campaign",
      sections: [ { heading: "The Sun Stands Still" }, { heading: "Five Kings Defeated" }, { heading: "The Southern Campaign" } ] },
    { num: 11, title: "The Northern Campaign · Joshua's Conquests",
      sections: [ { heading: "The Northern Campaign" }, { heading: "Joshua's Conquests" } ] },
    { num: 12, title: "The Kings Defeated by Israel",
      sections: [ { heading: "Kings Defeated East of the Jordan" }, { heading: "Kings Defeated West of the Jordan" } ] },
    { num: 13, title: "Land Yet to Be Possessed · Inheritance East of the Jordan",
      sections: [ { heading: "Land Yet to Be Possessed" }, { heading: "Inheritance East of the Jordan" } ] },
    { num: 14, title: "Caleb's Inheritance",
      sections: [ { heading: "Division of the Land Begins" }, { heading: "Caleb's Inheritance" } ] },
    { num: 15, title: "The Inheritance of Judah · Caleb Conquers Hebron",
      sections: [ { heading: "The Borders of Judah" }, { heading: "Caleb Conquers Hebron" }, { heading: "The Cities of Judah" } ] },
    { num: 16, title: "The Inheritance of Ephraim",
      sections: [ { heading: "The Inheritance of Ephraim" } ] },
    { num: 17, title: "The Inheritance of Manasseh",
      sections: [ { heading: "The Inheritance of Manasseh" }, { heading: "Joseph's Tribes Ask for More Land" } ] },
    { num: 18, title: "The Tabernacle at Shiloh · The Inheritance of Benjamin",
      sections: [ { heading: "The Tabernacle at Shiloh" }, { heading: "The Inheritance of Benjamin" } ] },
    { num: 19, title: "Inheritance of the Remaining Tribes · Joshua's Inheritance",
      sections: [ { heading: "The Inheritance of Simeon" }, { heading: "The Inheritance of Zebulun" }, { heading: "The Inheritance of Issachar" }, { heading: "The Inheritance of Asher" }, { heading: "The Inheritance of Naphtali" }, { heading: "The Inheritance of Dan" }, { heading: "Joshua's Inheritance" } ] },
    { num: 20, title: "The Cities of Refuge",
      sections: [ { heading: "The Cities of Refuge" } ] },
    { num: 21,
      // RESTORED — Josh 21:43-45
      title: "The Cities of the Levites · All YAHUWAH's Promises Fulfilled",
      sections: [ { heading: "The Cities of the Levites" }, { heading: "All YAHUWAH's Promises Fulfilled" } ] },
    { num: 22, title: "The Eastern Tribes Return Home · The Altar of Witness",
      sections: [ { heading: "The Eastern Tribes Return Home" }, { heading: "The Altar of Witness" } ] },
    { num: 23, title: "Joshua's Farewell to the Leaders",
      sections: [ { heading: "Joshua's Farewell to the Leaders" } ] },
    { num: 24, title: "Joshua's Farewell at Shechem · Choose This Day Whom You Will Serve · The Death of Joshua",
      sections: [ { heading: "Joshua's Farewell at Shechem" }, { heading: "Choose This Day Whom You Will Serve" }, { heading: "The Death of Joshua" } ] }
  ]
};

// =========================================================================
// JUDGES
// =========================================================================
// Restorations:
//   Ch 2 title + section: "The Angel of the Lord at Bochim"
//              → "The Angel of YAHUWAH at Bochim"
//     (Judg 2:1 "the Angel of the LORD came up from Gilgal to Bochim")

BOOKS_RESTORED.judges = {
  chapters: [
    { num: 1, title: "Judah's Conquests · Failure to Drive Out the Canaanites",
      sections: [ { heading: "Judah's Conquests" }, { heading: "Failure to Drive Out the Canaanites" } ] },
    { num: 2,
      // RESTORED — Judg 2:1
      title: "The Angel of YAHUWAH at Bochim · The Cycle of Disobedience",
      sections: [ { heading: "The Angel of YAHUWAH at Bochim" }, { heading: "The Cycle of Disobedience" } ] },
    { num: 3, title: "The Nations Left to Test Israel · Othniel and Ehud · Shamgar",
      sections: [ { heading: "The Nations Left to Test Israel" }, { heading: "Othniel" }, { heading: "Ehud and Eglon" }, { heading: "Shamgar" } ] },
    { num: 4, title: "Deborah and Barak · Jael Kills Sisera",
      sections: [ { heading: "Deborah and Barak" }, { heading: "Jael Kills Sisera" } ] },
    { num: 5, title: "The Song of Deborah",
      sections: [ { heading: "The Song of Deborah" } ] },
    { num: 6, title: "Israel Oppressed by Midian · The Call of Gideon · Gideon's Fleece",
      sections: [ { heading: "Israel Oppressed by Midian" }, { heading: "The Call of Gideon" }, { heading: "Gideon Tears Down the Altar of Baal" }, { heading: "Gideon's Fleece" } ] },
    { num: 7, title: "Gideon's Three Hundred · Midian Routed",
      sections: [ { heading: "Gideon's Three Hundred" }, { heading: "The Dream of the Barley Loaf" }, { heading: "Midian Routed" } ] },
    { num: 8, title: "Gideon Pursues the Midianite Kings · Gideon's Ephod · The Death of Gideon",
      sections: [ { heading: "Gideon Pursues the Midianite Kings" }, { heading: "Gideon's Ephod" }, { heading: "The Death of Gideon" } ] },
    { num: 9, title: "Abimelech Made King · Jotham's Parable · The Death of Abimelech",
      sections: [ { heading: "Abimelech Made King" }, { heading: "Jotham's Parable" }, { heading: "Shechem Rebels Against Abimelech" }, { heading: "The Death of Abimelech" } ] },
    { num: 10, title: "Tola and Jair · Israel Oppressed Again",
      sections: [ { heading: "Tola and Jair" }, { heading: "Israel Oppressed Again" } ] },
    { num: 11, title: "Jephthah Called to Lead · Jephthah's Vow",
      sections: [ { heading: "Jephthah Called to Lead" }, { heading: "Jephthah's Message to the Ammonites" }, { heading: "Jephthah's Vow" } ] },
    { num: 12, title: "Jephthah and the Ephraimites · Ibzan, Elon, and Abdon",
      sections: [ { heading: "Jephthah and the Ephraimites" }, { heading: "Ibzan, Elon, and Abdon" } ] },
    { num: 13, title: "The Birth of Samson",
      sections: [ { heading: "The Birth of Samson" } ] },
    { num: 14, title: "Samson's Marriage · The Riddle",
      sections: [ { heading: "Samson's Marriage" }, { heading: "The Riddle" } ] },
    { num: 15, title: "Samson's Revenge · The Jawbone of a Donkey",
      sections: [ { heading: "Samson's Revenge" }, { heading: "The Jawbone of a Donkey" } ] },
    { num: 16, title: "Samson and Delilah · The Death of Samson",
      sections: [ { heading: "Samson at Gaza" }, { heading: "Samson and Delilah" }, { heading: "The Death of Samson" } ] },
    { num: 17, title: "Micah's Idols and His Levite",
      sections: [ { heading: "Micah's Idols and His Levite" } ] },
    { num: 18, title: "The Danites Take Micah's Idols",
      sections: [ { heading: "The Danites Seek Land" }, { heading: "The Danites Take Micah's Idols" } ] },
    { num: 19, title: "The Levite and His Concubine · The Outrage at Gibeah",
      sections: [ { heading: "The Levite and His Concubine" }, { heading: "The Outrage at Gibeah" } ] },
    { num: 20, title: "Israel Wars Against Benjamin",
      sections: [ { heading: "Israel Assembles Against Benjamin" }, { heading: "Benjamin Defeated" } ] },
    { num: 21, title: "Wives for Benjamin",
      sections: [ { heading: "Wives for Benjamin" } ] }
  ]
};

// =========================================================================
// RUTH
// =========================================================================
// No Lord/LORD in chrome. All chapters identical copy-paste.

BOOKS_RESTORED.ruth = {
  chapters: [
    { num: 1, title: "Naomi's Bitter Loss · Where You Go, I Will Go",
      sections: [ { heading: "Naomi's Bitter Loss" }, { heading: "Where You Go, I Will Go" }, { heading: "Return to Bethlehem" } ] },
    { num: 2, title: "Ruth Gleans in Boaz's Field · Boaz's Kindness",
      sections: [ { heading: "Ruth Gleans in Boaz's Field" }, { heading: "Boaz's Kindness" } ] },
    { num: 3, title: "Ruth at the Threshing Floor",
      sections: [ { heading: "Ruth at the Threshing Floor" } ] },
    { num: 4, title: "Boaz Redeems Ruth · The Birth of Obed",
      sections: [ { heading: "Boaz Redeems Ruth" }, { heading: "The Birth of Obed" } ] }
  ]
};

// =========================================================================
// 1 SAMUEL
// =========================================================================
// Restorations:
//   Ch 3 title + section: "The Lord Calls Samuel" → "YAHUWAH Calls Samuel"
//        (1 Sam 3:4-10 "the LORD called Samuel" — the Name called by Name)
//   Ch 15 title + sections: "Saul Disobeys the Lord" / "The Lord Rejects Saul"
//              → "Saul Disobeys YAHUWAH" / "YAHUWAH Rejects Saul"
//        (1 Sam 15:10-23 — YHWH dominates the entire chapter)

BOOKS_RESTORED["1samuel"] = {
  chapters: [
    { num: 1, title: "Hannah's Prayer for a Son · The Birth of Samuel",
      sections: [ { heading: "Hannah's Sorrow" }, { heading: "Hannah's Prayer for a Son" }, { heading: "The Birth of Samuel" } ] },
    { num: 2, title: "Hannah's Song · The Wickedness of Eli's Sons · Judgment on Eli's House",
      sections: [ { heading: "Hannah's Song" }, { heading: "The Wickedness of Eli's Sons" }, { heading: "Judgment on Eli's House" } ] },
    { num: 3,
      // RESTORED — 1 Sam 3:4-10
      title: "YAHUWAH Calls Samuel",
      sections: [ { heading: "YAHUWAH Calls Samuel" } ] },
    { num: 4, title: "The Ark Captured · The Death of Eli · Ichabod",
      sections: [ { heading: "The Ark Captured" }, { heading: "The Death of Eli" }, { heading: "Ichabod" } ] },
    { num: 5, title: "The Ark in the House of Dagon",
      sections: [ { heading: "The Ark in the House of Dagon" } ] },
    { num: 6, title: "The Ark Returned to Israel",
      sections: [ { heading: "The Philistines Return the Ark" }, { heading: "The Ark at Beth Shemesh" } ] },
    { num: 7, title: "Samuel Judges Israel · Victory at Mizpah",
      sections: [ { heading: "Samuel Judges Israel" }, { heading: "Victory at Mizpah" } ] },
    { num: 8, title: "Israel Demands a King",
      sections: [ { heading: "Israel Demands a King" }, { heading: "The Warning About a King" } ] },
    { num: 9, title: "Saul Searches for the Donkeys · Saul Meets Samuel",
      sections: [ { heading: "Saul Searches for the Donkeys" }, { heading: "Saul Meets Samuel" } ] },
    { num: 10, title: "Saul Anointed King · Saul Among the Prophets · Saul Proclaimed King",
      sections: [ { heading: "Saul Anointed King" }, { heading: "Saul Among the Prophets" }, { heading: "Saul Proclaimed King" } ] },
    { num: 11, title: "Saul Rescues Jabesh Gilead · Saul's Kingship Confirmed",
      sections: [ { heading: "Saul Rescues Jabesh Gilead" }, { heading: "Saul's Kingship Confirmed" } ] },
    { num: 12, title: "Samuel's Farewell Address",
      sections: [ { heading: "Samuel's Farewell Address" } ] },
    { num: 13, title: "Saul's Unlawful Sacrifice",
      sections: [ { heading: "Saul's Unlawful Sacrifice" }, { heading: "Israel Without Weapons" } ] },
    { num: 14, title: "Jonathan Attacks the Philistines · Saul's Rash Oath",
      sections: [ { heading: "Jonathan Attacks the Philistines" }, { heading: "Saul's Rash Oath" }, { heading: "Saul's Family and Wars" } ] },
    { num: 15,
      // RESTORED — 1 Sam 15:10-23
      title: "Saul Disobeys YAHUWAH · YAHUWAH Rejects Saul",
      sections: [ { heading: "Saul Disobeys YAHUWAH" }, { heading: "YAHUWAH Rejects Saul" } ] },
    { num: 16, title: "Samuel Anoints David · David Plays for Saul",
      sections: [ { heading: "Samuel Anoints David" }, { heading: "David Plays for Saul" } ] },
    { num: 17, title: "Goliath's Challenge · David Accepts the Challenge · David Kills Goliath",
      sections: [ { heading: "Goliath's Challenge" }, { heading: "David Comes to the Battle" }, { heading: "David Accepts the Challenge" }, { heading: "David Kills Goliath" }, { heading: "David Brought to Saul" } ] },
    { num: 18, title: "David and Jonathan · Saul's Jealousy of David",
      sections: [ { heading: "David and Jonathan" }, { heading: "Saul's Jealousy of David" }, { heading: "David Marries Michal" } ] },
    { num: 19, title: "Saul Tries to Kill David · David Escapes to Samuel",
      sections: [ { heading: "Saul Tries to Kill David" }, { heading: "David Escapes to Samuel" } ] },
    { num: 20, title: "David and Jonathan's Covenant · The Arrows in the Field",
      sections: [ { heading: "David and Jonathan's Covenant" }, { heading: "Saul's Anger at Jonathan" }, { heading: "The Arrows in the Field" } ] },
    { num: 21, title: "David and the Showbread · David Feigns Madness Before Achish",
      sections: [ { heading: "David and the Showbread" }, { heading: "David Feigns Madness Before Achish" } ] },
    { num: 22, title: "David at the Cave of Adullam · Saul Slaughters the Priests of Nob",
      sections: [ { heading: "David at the Cave of Adullam" }, { heading: "Saul Slaughters the Priests of Nob" } ] },
    { num: 23, title: "David Saves Keilah · David Hides in the Wilderness",
      sections: [ { heading: "David Saves Keilah" }, { heading: "David Hides in the Wilderness" } ] },
    { num: 24, title: "David Spares Saul in the Cave",
      sections: [ { heading: "David Spares Saul in the Cave" } ] },
    { num: 25, title: "The Death of Samuel · David, Nabal, and Abigail",
      sections: [ { heading: "The Death of Samuel" }, { heading: "David, Nabal, and Abigail" } ] },
    { num: 26, title: "David Spares Saul a Second Time",
      sections: [ { heading: "David Spares Saul a Second Time" } ] },
    { num: 27, title: "David Among the Philistines",
      sections: [ { heading: "David Among the Philistines" } ] },
    { num: 28, title: "Saul and the Witch of Endor",
      sections: [ { heading: "Saul and the Witch of Endor" } ] },
    { num: 29, title: "David Sent Back by the Philistines",
      sections: [ { heading: "David Sent Back by the Philistines" } ] },
    { num: 30, title: "David Recovers What Was Taken at Ziklag",
      sections: [ { heading: "Ziklag Burned by the Amalekites" }, { heading: "David Recovers Everything" }, { heading: "David's Distribution of the Spoil" } ] },
    { num: 31, title: "The Death of Saul",
      sections: [ { heading: "The Death of Saul" } ] }
  ]
};

// =========================================================================
// 2 SAMUEL
// =========================================================================
// No Lord/LORD in chrome. All chapters identical copy-paste.
// ("God's Covenant with David" in Ch 7 stays — Elohim is a title, not the Name.)

BOOKS_RESTORED["2samuel"] = {
  chapters: [
    { num: 1, title: "David Hears of Saul's Death · David's Lament for Saul and Jonathan",
      sections: [ { heading: "David Hears of Saul's Death" }, { heading: "David's Lament for Saul and Jonathan" } ] },
    { num: 2, title: "David Anointed King over Judah · War Between the House of Saul and David",
      sections: [ { heading: "David Anointed King over Judah" }, { heading: "War Between the House of Saul and David" } ] },
    { num: 3, title: "Abner Joins David · Joab Murders Abner",
      sections: [ { heading: "Abner Joins David" }, { heading: "Joab Murders Abner" } ] },
    { num: 4, title: "The Murder of Ish-Bosheth",
      sections: [ { heading: "The Murder of Ish-Bosheth" } ] },
    { num: 5, title: "David Anointed King over All Israel · David Captures Jerusalem · David Defeats the Philistines",
      sections: [ { heading: "David Anointed King over All Israel" }, { heading: "David Captures Jerusalem" }, { heading: "David Defeats the Philistines" } ] },
    { num: 6, title: "The Ark Brought to Jerusalem · Uzzah Struck Down · Michal Despises David",
      sections: [ { heading: "Uzzah Struck Down" }, { heading: "The Ark Brought to Jerusalem" }, { heading: "Michal Despises David" } ] },
    { num: 7, title: "God's Covenant with David · David's Prayer of Thanksgiving",
      sections: [ { heading: "God's Covenant with David" }, { heading: "David's Prayer of Thanksgiving" } ] },
    { num: 8, title: "David's Victories",
      sections: [ { heading: "David's Victories" }, { heading: "David's Officials" } ] },
    { num: 9, title: "David's Kindness to Mephibosheth",
      sections: [ { heading: "David's Kindness to Mephibosheth" } ] },
    { num: 10, title: "David Defeats the Ammonites and Syrians",
      sections: [ { heading: "David Defeats the Ammonites and Syrians" } ] },
    { num: 11, title: "David and Bathsheba · Uriah Killed in Battle",
      sections: [ { heading: "David and Bathsheba" }, { heading: "Uriah Killed in Battle" } ] },
    { num: 12, title: "Nathan Confronts David · The Death of David's Son",
      sections: [ { heading: "Nathan Confronts David" }, { heading: "The Death of David's Son" }, { heading: "The Capture of Rabbah" } ] },
    { num: 13, title: "Amnon and Tamar · Absalom Kills Amnon",
      sections: [ { heading: "Amnon and Tamar" }, { heading: "Absalom Kills Amnon" } ] },
    { num: 14, title: "The Wise Woman of Tekoa · Absalom Returns to Jerusalem",
      sections: [ { heading: "The Wise Woman of Tekoa" }, { heading: "Absalom Returns to Jerusalem" } ] },
    { num: 15, title: "Absalom's Rebellion · David Flees Jerusalem",
      sections: [ { heading: "Absalom's Rebellion" }, { heading: "David Flees Jerusalem" } ] },
    { num: 16, title: "Ziba and Mephibosheth · Shimei Curses David · Absalom Enters Jerusalem",
      sections: [ { heading: "Ziba and Mephibosheth" }, { heading: "Shimei Curses David" }, { heading: "Absalom Enters Jerusalem" } ] },
    { num: 17, title: "Hushai Defeats Ahithophel's Counsel · Ahithophel's Suicide",
      sections: [ { heading: "Hushai Defeats Ahithophel's Counsel" }, { heading: "Ahithophel's Suicide" }, { heading: "David Reaches Mahanaim" } ] },
    { num: 18, title: "Absalom Defeated · The Death of Absalom · David Mourns Absalom",
      sections: [ { heading: "Absalom Defeated" }, { heading: "The Death of Absalom" }, { heading: "David Mourns Absalom" } ] },
    { num: 19, title: "David Returns to Jerusalem",
      sections: [ { heading: "Joab Rebukes David" }, { heading: "David Returns to Jerusalem" }, { heading: "Quarrel Between Israel and Judah" } ] },
    { num: 20, title: "Sheba's Rebellion · Joab Kills Amasa",
      sections: [ { heading: "Joab Kills Amasa" }, { heading: "The Death of Sheba" } ] },
    { num: 21, title: "The Gibeonites Avenged · Wars with the Philistines",
      sections: [ { heading: "The Gibeonites Avenged" }, { heading: "Wars with the Philistines" } ] },
    { num: 22, title: "David's Song of Deliverance",
      sections: [ { heading: "David's Song of Deliverance" } ] },
    { num: 23, title: "David's Last Words · David's Mighty Men",
      sections: [ { heading: "David's Last Words" }, { heading: "David's Mighty Men" } ] },
    { num: 24, title: "David's Census · The Plague and the Threshing Floor",
      sections: [ { heading: "David's Census" }, { heading: "The Plague on Israel" }, { heading: "The Altar at the Threshing Floor" } ] }
  ]
};

// =========================================================================
// 1 KINGS
// =========================================================================
// Restorations:
//   Ch 9 title + section: "The Lord Appears to Solomon a Second Time"
//              → "YAHUWAH Appears to Solomon a Second Time"
//     (1 Kgs 9:2 "the LORD appeared to Solomon the second time")
//   Ch 19 title + section: "The Lord in the Still Small Voice"
//              → "YAHUWAH in the Still Small Voice"
//     (1 Kgs 19:11-13 "the LORD passed by … after the fire a still small voice")

BOOKS_RESTORED["1kings"] = {
  chapters: [
    { num: 1, title: "Adonijah Sets Himself Up as King · Solomon Anointed King",
      sections: [ { heading: "Adonijah Sets Himself Up as King" }, { heading: "Nathan and Bathsheba Before David" }, { heading: "Solomon Anointed King" } ] },
    { num: 2, title: "David's Charge to Solomon · The Death of David · Solomon Establishes His Kingdom",
      sections: [ { heading: "David's Charge to Solomon" }, { heading: "The Death of David" }, { heading: "Solomon Establishes His Kingdom" } ] },
    { num: 3, title: "Solomon Asks for Wisdom · The Wisdom of Solomon",
      sections: [ { heading: "Solomon Asks for Wisdom" }, { heading: "The Wisdom of Solomon" } ] },
    { num: 4, title: "Solomon's Officials · Solomon's Wisdom and Prosperity",
      sections: [ { heading: "Solomon's Officials" }, { heading: "Solomon's Wisdom and Prosperity" } ] },
    { num: 5, title: "Preparations to Build the Temple",
      sections: [ { heading: "Preparations to Build the Temple" } ] },
    { num: 6, title: "The Temple Built · The Inner Sanctuary",
      sections: [ { heading: "The Temple Built" }, { heading: "The Inner Sanctuary" } ] },
    { num: 7, title: "Solomon's Palace · The Bronze Furnishings",
      sections: [ { heading: "Solomon's Palace" }, { heading: "The Bronze Furnishings" } ] },
    { num: 8, title: "The Ark Brought to the Temple · Solomon's Prayer of Dedication · The Glory Fills the Temple",
      sections: [ { heading: "The Ark Brought to the Temple" }, { heading: "Solomon Blesses the People" }, { heading: "Solomon's Prayer of Dedication" }, { heading: "Solomon Blesses the Assembly" } ] },
    { num: 9,
      // RESTORED — 1 Kgs 9:2
      title: "YAHUWAH Appears to Solomon a Second Time · Solomon's Other Activities",
      sections: [ { heading: "YAHUWAH Appears to Solomon a Second Time" }, { heading: "Solomon's Other Activities" } ] },
    { num: 10, title: "The Queen of Sheba Visits Solomon · Solomon's Wealth and Splendor",
      sections: [ { heading: "The Queen of Sheba Visits Solomon" }, { heading: "Solomon's Wealth and Splendor" } ] },
    { num: 11, title: "Solomon's Foreign Wives Lead Him Astray · Adversaries of Solomon · The Death of Solomon",
      sections: [ { heading: "Solomon's Foreign Wives Lead Him Astray" }, { heading: "Adversaries of Solomon" }, { heading: "Jeroboam's Rebellion" }, { heading: "The Death of Solomon" } ] },
    { num: 12, title: "The Kingdom Divided · Jeroboam's Golden Calves",
      sections: [ { heading: "The Kingdom Divided" }, { heading: "Jeroboam's Golden Calves" } ] },
    { num: 13, title: "The Man of God from Judah · The Lying Prophet",
      sections: [ { heading: "The Man of God from Judah" }, { heading: "The Lying Prophet" } ] },
    { num: 14, title: "Judgment on Jeroboam's House · Rehoboam Reigns in Judah",
      sections: [ { heading: "Judgment on Jeroboam's House" }, { heading: "Rehoboam Reigns in Judah" } ] },
    { num: 15, title: "Abijam and Asa of Judah · Nadab and Baasha of Israel",
      sections: [ { heading: "Abijam Reigns in Judah" }, { heading: "Asa Reigns in Judah" }, { heading: "Nadab and Baasha of Israel" } ] },
    { num: 16, title: "Kings of Israel from Baasha to Omri · The Reign of Ahab",
      sections: [ { heading: "Baasha and Elah of Israel" }, { heading: "Zimri and Omri of Israel" }, { heading: "The Reign of Ahab" } ] },
    { num: 17, title: "Elijah Fed by Ravens · The Widow of Zarephath · Elijah Raises the Widow's Son",
      sections: [ { heading: "Elijah Fed by Ravens" }, { heading: "The Widow of Zarephath" }, { heading: "Elijah Raises the Widow's Son" } ] },
    { num: 18, title: "Elijah Meets Obadiah · Elijah on Mount Carmel · Fire from Heaven",
      sections: [ { heading: "Elijah Meets Obadiah" }, { heading: "Elijah on Mount Carmel" }, { heading: "Fire from Heaven" }, { heading: "The Rain Returns" } ] },
    { num: 19,
      // RESTORED — 1 Kgs 19:11-13
      title: "Elijah Flees from Jezebel · YAHUWAH in the Still Small Voice · The Call of Elisha",
      sections: [ { heading: "Elijah Flees from Jezebel" }, { heading: "YAHUWAH in the Still Small Voice" }, { heading: "The Call of Elisha" } ] },
    { num: 20, title: "Ahab Defeats the Syrians · Ahab Spares Ben-Hadad",
      sections: [ { heading: "Ahab Defeats the Syrians" }, { heading: "Ahab Spares Ben-Hadad" } ] },
    { num: 21, title: "Naboth's Vineyard · Elijah Confronts Ahab",
      sections: [ { heading: "Naboth's Vineyard" }, { heading: "Elijah Confronts Ahab" } ] },
    { num: 22, title: "Micaiah Prophesies Against Ahab · The Death of Ahab",
      sections: [ { heading: "Micaiah Prophesies Against Ahab" }, { heading: "The Death of Ahab" }, { heading: "Jehoshaphat and Ahaziah" } ] }
  ]
};

// =========================================================================
// 2 KINGS
// =========================================================================
// No Lord/LORD in chrome. All chapters identical copy-paste.

BOOKS_RESTORED["2kings"] = {
  chapters: [
    { num: 1, title: "Elijah and the Messengers of Ahaziah",
      sections: [ { heading: "Elijah and the Messengers of Ahaziah" } ] },
    { num: 2, title: "Elijah Taken Up to Heaven · Elisha Succeeds Elijah",
      sections: [ { heading: "Elijah Taken Up to Heaven" }, { heading: "Elisha Succeeds Elijah" } ] },
    { num: 3, title: "Moab Rebels Against Israel",
      sections: [ { heading: "Moab Rebels Against Israel" } ] },
    { num: 4, title: "The Widow's Oil · The Shunammite Woman's Son · Death in the Pot, Bread for a Hundred",
      sections: [ { heading: "The Widow's Oil" }, { heading: "The Shunammite Woman's Son" }, { heading: "Elisha Raises the Shunammite's Son" }, { heading: "Death in the Pot, Bread for a Hundred" } ] },
    { num: 5, title: "Naaman the Leper Healed · Gehazi's Greed",
      sections: [ { heading: "Naaman the Leper Healed" }, { heading: "Gehazi's Greed" } ] },
    { num: 6, title: "The Floating Axe Head · Chariots of Fire · Famine in Samaria",
      sections: [ { heading: "The Floating Axe Head" }, { heading: "Chariots of Fire" }, { heading: "Famine in Samaria" } ] },
    { num: 7, title: "The Four Lepers and the Empty Camp",
      sections: [ { heading: "Elisha Foretells Plenty" }, { heading: "The Four Lepers and the Empty Camp" } ] },
    { num: 8, title: "The Shunammite's Land Restored · Hazael Murders Ben-Hadad · Jehoram and Ahaziah of Judah",
      sections: [ { heading: "The Shunammite's Land Restored" }, { heading: "Hazael Murders Ben-Hadad" }, { heading: "Jehoram and Ahaziah of Judah" } ] },
    { num: 9, title: "Jehu Anointed King · Jehu Kills Joram and Ahaziah · The Death of Jezebel",
      sections: [ { heading: "Jehu Anointed King" }, { heading: "Jehu Kills Joram and Ahaziah" }, { heading: "The Death of Jezebel" } ] },
    { num: 10, title: "Ahab's Family Killed · Jehu Destroys the Worshipers of Baal",
      sections: [ { heading: "Ahab's Family Killed" }, { heading: "Jehu Destroys the Worshipers of Baal" } ] },
    { num: 11, title: "Athaliah Seizes the Throne · Joash Made King",
      sections: [ { heading: "Athaliah Seizes the Throne" }, { heading: "Joash Made King" } ] },
    { num: 12, title: "Joash Repairs the Temple · The Death of Joash",
      sections: [ { heading: "Joash Repairs the Temple" }, { heading: "The Death of Joash" } ] },
    { num: 13, title: "Jehoahaz and Jehoash of Israel · The Death of Elisha",
      sections: [ { heading: "Jehoahaz and Jehoash of Israel" }, { heading: "The Death of Elisha" } ] },
    { num: 14, title: "Amaziah of Judah · Jeroboam II of Israel",
      sections: [ { heading: "Amaziah of Judah" }, { heading: "Jeroboam II of Israel" } ] },
    { num: 15, title: "Azariah and Jotham of Judah · Six Kings of Israel",
      sections: [ { heading: "Azariah of Judah" }, { heading: "Six Kings of Israel" }, { heading: "Jotham of Judah" } ] },
    { num: 16, title: "Ahaz of Judah",
      sections: [ { heading: "Ahaz of Judah" } ] },
    { num: 17, title: "The Fall of Samaria · Israel Exiled to Assyria · Samaria Resettled",
      sections: [ { heading: "The Fall of Samaria" }, { heading: "Israel Exiled to Assyria" }, { heading: "Samaria Resettled" } ] },
    { num: 18, title: "Hezekiah Reigns in Judah · Sennacherib Threatens Jerusalem",
      sections: [ { heading: "Hezekiah Reigns in Judah" }, { heading: "Sennacherib Threatens Jerusalem" } ] },
    { num: 19, title: "Hezekiah's Prayer · Sennacherib's Army Destroyed",
      sections: [ { heading: "Hezekiah's Prayer" }, { heading: "Isaiah's Prophecy" }, { heading: "Sennacherib's Army Destroyed" } ] },
    { num: 20, title: "Hezekiah's Sickness and Healing · The Babylonian Envoys",
      sections: [ { heading: "Hezekiah's Sickness and Healing" }, { heading: "The Babylonian Envoys" } ] },
    { num: 21, title: "Manasseh's Wickedness · Amon of Judah",
      sections: [ { heading: "Manasseh's Wickedness" }, { heading: "Amon of Judah" } ] },
    { num: 22, title: "The Book of the Law Found · Huldah's Prophecy",
      sections: [ { heading: "The Book of the Law Found" }, { heading: "Huldah's Prophecy" } ] },
    { num: 23, title: "Josiah's Reforms · The Passover Kept · The Death of Josiah",
      sections: [ { heading: "Josiah's Reforms" }, { heading: "The Passover Kept" }, { heading: "The Death of Josiah" }, { heading: "Jehoahaz and Jehoiakim" } ] },
    { num: 24, title: "The First Babylonian Captivity",
      sections: [ { heading: "Jehoiakim's Rebellion" }, { heading: "Jehoiachin Exiled to Babylon" }, { heading: "Zedekiah Reigns in Judah" } ] },
    { num: 25, title: "The Fall of Jerusalem · The Temple Destroyed · Jehoiachin Released",
      sections: [ { heading: "The Fall of Jerusalem" }, { heading: "The Temple Destroyed" }, { heading: "Gedaliah Murdered" }, { heading: "Jehoiachin Released" } ] }
  ]
};

// =========================================================================
// 1 CHRONICLES
// =========================================================================
// No Lord/LORD in chrome. ("God's Covenant with David" Ch 17 stays.)

BOOKS_RESTORED["1chronicles"] = {
  chapters: [
    { num: 1, title: "From Adam to the Sons of Noah · From Abraham to Israel",
      sections: [ { heading: "From Adam to the Sons of Noah" }, { heading: "From Abraham to Israel" } ] },
    { num: 2, title: "The Sons of Israel · The Family of Judah",
      sections: [ { heading: "The Sons of Israel" }, { heading: "The Family of Judah" } ] },
    { num: 3, title: "The Family of David",
      sections: [ { heading: "The Family of David" } ] },
    { num: 4, title: "The Descendants of Judah and Simeon · The Prayer of Jabez",
      sections: [ { heading: "The Descendants of Judah" }, { heading: "The Prayer of Jabez" }, { heading: "More Descendants of Judah" }, { heading: "The Descendants of Simeon" } ] },
    { num: 5, title: "The Tribes East of the Jordan",
      sections: [ { heading: "The Descendants of Reuben" }, { heading: "The Descendants of Gad" }, { heading: "The Half-Tribe of Manasseh" } ] },
    { num: 6, title: "The Descendants of Levi · The Cities of the Levites",
      sections: [ { heading: "The Descendants of Levi" }, { heading: "The Temple Musicians and Priests" }, { heading: "The Cities of the Levites" } ] },
    { num: 7, title: "The Northern Tribes",
      sections: [ { heading: "The Descendants of Issachar" }, { heading: "The Descendants of Benjamin" }, { heading: "Naphtali, Manasseh, and Ephraim" }, { heading: "Ephraim and Asher" } ] },
    { num: 8, title: "The Descendants of Benjamin · The Family of Saul",
      sections: [ { heading: "The Descendants of Benjamin" }, { heading: "The Family of Saul" } ] },
    { num: 9, title: "The People Who Returned from Exile · The Family of Saul",
      sections: [ { heading: "The People Who Returned from Exile" }, { heading: "The Family of Saul" } ] },
    { num: 10, title: "The Death of Saul",
      sections: [ { heading: "The Death of Saul" } ] },
    { num: 11, title: "David Made King over All Israel · David Captures Jerusalem · David's Mighty Men",
      sections: [ { heading: "David Made King over All Israel" }, { heading: "David Captures Jerusalem" }, { heading: "David's Mighty Men" } ] },
    { num: 12, title: "David's Mighty Warriors at Ziklag · Israel Makes David King at Hebron",
      sections: [ { heading: "David's Mighty Warriors at Ziklag" }, { heading: "Israel Makes David King at Hebron" } ] },
    { num: 13, title: "The Ark Brought from Kirjath Jearim · Uzzah Struck Down",
      sections: [ { heading: "The Ark Brought from Kirjath Jearim" }, { heading: "Uzzah Struck Down" } ] },
    { num: 14, title: "David's House and Family · David Defeats the Philistines",
      sections: [ { heading: "David's House and Family" }, { heading: "David Defeats the Philistines" } ] },
    { num: 15, title: "The Ark Brought to Jerusalem",
      sections: [ { heading: "Preparing to Move the Ark" }, { heading: "The Ark Brought to Jerusalem" } ] },
    { num: 16, title: "The Ark Placed in the Tent · David's Song of Thanksgiving",
      sections: [ { heading: "The Ark Placed in the Tent" }, { heading: "David's Song of Thanksgiving" }, { heading: "The Worship Established" } ] },
    { num: 17, title: "God's Covenant with David · David's Prayer",
      sections: [ { heading: "God's Covenant with David" }, { heading: "David's Prayer" } ] },
    { num: 18, title: "David's Victories",
      sections: [ { heading: "David's Victories" } ] },
    { num: 19, title: "David Defeats the Ammonites and Syrians",
      sections: [ { heading: "David Defeats the Ammonites and Syrians" } ] },
    { num: 20, title: "The Capture of Rabbah · Wars with the Philistines",
      sections: [ { heading: "The Capture of Rabbah" }, { heading: "Wars with the Philistines" } ] },
    { num: 21, title: "David's Census · The Plague and the Threshing Floor",
      sections: [ { heading: "David's Census" }, { heading: "The Altar at the Threshing Floor" } ] },
    { num: 22, title: "David Prepares to Build the Temple · David Charges Solomon",
      sections: [ { heading: "David Prepares to Build the Temple" }, { heading: "David Charges Solomon" } ] },
    { num: 23, title: "The Divisions of the Levites",
      sections: [ { heading: "The Divisions of the Levites" } ] },
    { num: 24, title: "The Divisions of the Priests",
      sections: [ { heading: "The Divisions of the Priests" } ] },
    { num: 25, title: "The Divisions of the Musicians",
      sections: [ { heading: "The Divisions of the Musicians" } ] },
    { num: 26, title: "The Gatekeepers and Treasurers",
      sections: [ { heading: "The Gatekeepers" }, { heading: "The Treasurers and Other Officials" } ] },
    { num: 27, title: "David's Military and Civil Officers",
      sections: [ { heading: "The Army Divisions" }, { heading: "Leaders of the Tribes" }, { heading: "David's Officials" } ] },
    { num: 28, title: "David's Charge to Solomon and the Assembly · Plans for the Temple",
      sections: [ { heading: "David's Charge to Solomon and the Assembly" }, { heading: "Plans for the Temple" } ] },
    { num: 29, title: "Offerings for the Temple · David's Prayer of Praise · Solomon Anointed King",
      sections: [ { heading: "Offerings for the Temple" }, { heading: "David's Prayer of Praise" }, { heading: "Solomon Anointed King" } ] }
  ]
};

// =========================================================================
// 2 CHRONICLES
// =========================================================================
// Restorations:
//   Ch 20 title + section: "The Battle Is Not Yours but the Lord's"
//              → "The Battle Is Not Yours but YAHUWAH's"
//     The specific verse (2 Chr 20:15) says "God's" (Elohim), but the
//     surrounding chapter is saturated with YHWH — "Thus says the LORD"
//     (v15), "the LORD set ambushes" (v22), "the LORD had fought" (v29),
//     etc. The chrome writer chose "Lord's" deliberately, and the text
//     confirms YHWH throughout. Rule holds.

BOOKS_RESTORED["2chronicles"] = {
  chapters: [
    { num: 1, title: "Solomon Asks for Wisdom",
      sections: [ { heading: "Solomon Asks for Wisdom" }, { heading: "Solomon's Wealth" } ] },
    { num: 2, title: "Preparations to Build the Temple",
      sections: [ { heading: "Preparations to Build the Temple" } ] },
    { num: 3, title: "The Temple Built",
      sections: [ { heading: "The Temple Built" } ] },
    { num: 4, title: "The Temple Furnishings",
      sections: [ { heading: "The Temple Furnishings" } ] },
    { num: 5, title: "The Ark Brought to the Temple · The Glory Fills the Temple",
      sections: [ { heading: "The Ark Brought to the Temple" }, { heading: "The Glory Fills the Temple" } ] },
    { num: 6, title: "Solomon Blesses the People · Solomon's Prayer of Dedication",
      sections: [ { heading: "Solomon Blesses the People" }, { heading: "Solomon's Prayer of Dedication" } ] },
    { num: 7, title: "Fire from Heaven · If My People Will Humble Themselves",
      sections: [ { heading: "Fire from Heaven" }, { heading: "If My People Will Humble Themselves" } ] },
    { num: 8, title: "Solomon's Other Activities",
      sections: [ { heading: "Solomon's Other Activities" } ] },
    { num: 9, title: "The Queen of Sheba Visits Solomon · Solomon's Splendor and Death",
      sections: [ { heading: "The Queen of Sheba Visits Solomon" }, { heading: "Solomon's Wealth and Splendor" }, { heading: "The Death of Solomon" } ] },
    { num: 10, title: "The Kingdom Divided",
      sections: [ { heading: "The Kingdom Divided" } ] },
    { num: 11, title: "Rehoboam Strengthens Judah",
      sections: [ { heading: "Rehoboam Strengthens Judah" }, { heading: "Rehoboam's Family" } ] },
    { num: 12, title: "Shishak Invades Judah · The Death of Rehoboam",
      sections: [ { heading: "Shishak Invades Judah" }, { heading: "The Death of Rehoboam" } ] },
    { num: 13, title: "Abijah Defeats Jeroboam",
      sections: [ { heading: "Abijah Defeats Jeroboam" } ] },
    { num: 14, title: "Asa's Reforms · Asa Defeats the Ethiopians",
      sections: [ { heading: "Asa's Reforms" }, { heading: "Asa Defeats the Ethiopians" } ] },
    { num: 15, title: "Asa's Covenant Renewal",
      sections: [ { heading: "Asa's Covenant Renewal" } ] },
    { num: 16, title: "Asa's Last Years",
      sections: [ { heading: "Asa's Last Years" } ] },
    { num: 17, title: "Jehoshaphat Reigns in Judah",
      sections: [ { heading: "Jehoshaphat Reigns in Judah" } ] },
    { num: 18, title: "Micaiah Prophesies Against Ahab · The Death of Ahab",
      sections: [ { heading: "Micaiah Prophesies Against Ahab" }, { heading: "The Death of Ahab" } ] },
    { num: 19, title: "Jehoshaphat Appoints Judges",
      sections: [ { heading: "Jehoshaphat Appoints Judges" } ] },
    { num: 20,
      // RESTORED — 2 Chr 20 is YHWH-dominant throughout
      title: "Jehoshaphat Defeats Moab and Ammon · The Battle Is Not Yours but YAHUWAH's",
      sections: [ { heading: "Jehoshaphat Calls a Fast" }, { heading: "The Battle Is Not Yours but YAHUWAH's" }, { heading: "Jehoshaphat Defeats Moab and Ammon" }, { heading: "The End of Jehoshaphat's Reign" } ] },
    { num: 21, title: "Jehoram's Wickedness",
      sections: [ { heading: "Jehoram's Wickedness" } ] },
    { num: 22, title: "Ahaziah of Judah · Athaliah Seizes the Throne",
      sections: [ { heading: "Ahaziah of Judah" }, { heading: "Athaliah Seizes the Throne" } ] },
    { num: 23, title: "Joash Made King",
      sections: [ { heading: "Joash Made King" } ] },
    { num: 24, title: "Joash Repairs the Temple · The Murder of Zechariah",
      sections: [ { heading: "Joash Repairs the Temple" }, { heading: "The Murder of Zechariah" } ] },
    { num: 25, title: "Amaziah of Judah",
      sections: [ { heading: "Amaziah Defeats Edom" }, { heading: "Amaziah Defeated by Israel" } ] },
    { num: 26, title: "Uzziah's Reign and His Pride",
      sections: [ { heading: "Uzziah Reigns in Judah" }, { heading: "Uzziah's Pride and Leprosy" } ] },
    { num: 27, title: "Jotham of Judah",
      sections: [ { heading: "Jotham of Judah" } ] },
    { num: 28, title: "Ahaz's Wickedness",
      sections: [ { heading: "Ahaz's Wickedness" } ] },
    { num: 29, title: "Hezekiah Cleanses the Temple",
      sections: [ { heading: "Hezekiah Cleanses the Temple" }, { heading: "Worship Restored in the Temple" } ] },
    { num: 30, title: "Hezekiah Keeps the Passover",
      sections: [ { heading: "Hezekiah Calls Israel to the Passover" }, { heading: "The Passover Kept" } ] },
    { num: 31, title: "Hezekiah's Reforms · Provisions for the Priests and Levites",
      sections: [ { heading: "Hezekiah's Reforms" }, { heading: "Provisions for the Priests and Levites" } ] },
    { num: 32, title: "Sennacherib Threatens Jerusalem · Sennacherib's Army Destroyed · Hezekiah's Last Years",
      sections: [ { heading: "Sennacherib Threatens Jerusalem" }, { heading: "Sennacherib's Army Destroyed" }, { heading: "Hezekiah's Last Years" } ] },
    { num: 33, title: "Manasseh's Wickedness and Repentance · Amon of Judah",
      sections: [ { heading: "Manasseh's Wickedness" }, { heading: "Manasseh's Repentance" }, { heading: "Amon of Judah" } ] },
    { num: 34, title: "Josiah's Reforms · The Book of the Law Found",
      sections: [ { heading: "Josiah's Reforms" }, { heading: "The Book of the Law Found" } ] },
    { num: 35, title: "Josiah Keeps the Passover · The Death of Josiah",
      sections: [ { heading: "Josiah Keeps the Passover" }, { heading: "The Death of Josiah" } ] },
    { num: 36, title: "The Last Kings of Judah · The Fall of Jerusalem · The Decree of Cyrus",
      sections: [ { heading: "The Last Kings of Judah" }, { heading: "The Fall of Jerusalem" }, { heading: "The Decree of Cyrus" } ] }
  ]
};

// =========================================================================
// EZRA, NEHEMIAH, ESTHER
// =========================================================================
// None contain Lord/LORD in chrome. All chapters identical copy-paste.

BOOKS_RESTORED.ezra = {
  chapters: [
    { num: 1, title: "The Decree of Cyrus · The Return Begins",
      sections: [ { heading: "The Decree of Cyrus" }, { heading: "The Return Begins" } ] },
    { num: 2, title: "The List of Returning Exiles",
      sections: [ { heading: "The List of Returning Exiles" } ] },
    { num: 3, title: "The Altar Rebuilt · The Foundation of the Temple Laid",
      sections: [ { heading: "The Altar Rebuilt" }, { heading: "The Foundation of the Temple Laid" } ] },
    { num: 4, title: "Opposition to the Rebuilding · The Work Stopped",
      sections: [ { heading: "Opposition to the Rebuilding" }, { heading: "The Work Stopped" } ] },
    { num: 5, title: "Haggai and Zechariah Stir Up the Work · Tattenai's Letter to Darius",
      sections: [ { heading: "Haggai and Zechariah Stir Up the Work" }, { heading: "Tattenai's Letter to Darius" } ] },
    { num: 6, title: "The Decree of Darius · The Temple Completed and Dedicated",
      sections: [ { heading: "The Decree of Darius" }, { heading: "The Temple Completed and Dedicated" } ] },
    { num: 7, title: "Ezra Comes to Jerusalem · The Letter of Artaxerxes",
      sections: [ { heading: "Ezra Comes to Jerusalem" }, { heading: "The Letter of Artaxerxes" } ] },
    { num: 8, title: "Those Who Returned with Ezra · The Journey to Jerusalem",
      sections: [ { heading: "Those Who Returned with Ezra" }, { heading: "The Journey to Jerusalem" } ] },
    { num: 9, title: "The Sin of Intermarriage · Ezra's Prayer of Confession",
      sections: [ { heading: "The Sin of Intermarriage" }, { heading: "Ezra's Prayer of Confession" } ] },
    { num: 10, title: "The People Confess Their Sin · The Foreign Wives Put Away",
      sections: [ { heading: "The People Confess Their Sin" }, { heading: "The Foreign Wives Put Away" } ] }
  ]
};

BOOKS_RESTORED.nehemiah = {
  chapters: [
    { num: 1, title: "Nehemiah Hears About Jerusalem · Nehemiah's Prayer",
      sections: [ { heading: "Nehemiah Hears About Jerusalem" }, { heading: "Nehemiah's Prayer" } ] },
    { num: 2, title: "Nehemiah Sent to Jerusalem · Nehemiah Inspects the Walls",
      sections: [ { heading: "Nehemiah Sent to Jerusalem" }, { heading: "Nehemiah Inspects the Walls" } ] },
    { num: 3, title: "The Wall Builders",
      sections: [ { heading: "The Wall Builders" } ] },
    { num: 4, title: "Opposition to the Work · Building with Sword in Hand",
      sections: [ { heading: "Opposition to the Work" }, { heading: "Building with Sword in Hand" } ] },
    { num: 5, title: "Nehemiah Stops Oppression of the Poor · Nehemiah's Generosity as Governor",
      sections: [ { heading: "Nehemiah Stops Oppression of the Poor" }, { heading: "Nehemiah's Generosity as Governor" } ] },
    { num: 6, title: "Plots Against Nehemiah · The Wall Completed",
      sections: [ { heading: "Plots Against Nehemiah" }, { heading: "The Wall Completed" } ] },
    { num: 7, title: "The Watchmen Appointed · The List of Returning Exiles",
      sections: [ { heading: "The Watchmen Appointed" }, { heading: "The List of Returning Exiles" } ] },
    { num: 8, title: "Ezra Reads the Law · The Feast of Tabernacles Kept",
      sections: [ { heading: "Ezra Reads the Law" }, { heading: "The Feast of Tabernacles Kept" } ] },
    { num: 9, title: "The People Confess Their Sin · The Levites' Prayer of Confession",
      sections: [ { heading: "The People Confess Their Sin" }, { heading: "The Levites' Prayer of Confession" } ] },
    { num: 10, title: "The Covenant Sealed",
      sections: [ { heading: "Those Who Sealed the Covenant" }, { heading: "The Terms of the Covenant" } ] },
    { num: 11, title: "The People Who Lived in Jerusalem",
      sections: [ { heading: "The People Who Lived in Jerusalem" }, { heading: "The People in the Other Towns" } ] },
    { num: 12, title: "The Priests and Levites · The Wall Dedicated",
      sections: [ { heading: "The Priests and Levites" }, { heading: "The Wall Dedicated" } ] },
    { num: 13, title: "Nehemiah's Final Reforms",
      sections: [ { heading: "Nehemiah Cleanses the Temple" }, { heading: "Sabbath Reforms" }, { heading: "Mixed Marriages Confronted" } ] }
  ]
};

BOOKS_RESTORED.esther = {
  chapters: [
    { num: 1, title: "Vashti Refuses the King · Vashti Deposed",
      sections: [ { heading: "The Feast of Ahasuerus" }, { heading: "Vashti Deposed" } ] },
    { num: 2, title: "Esther Becomes Queen · Mordecai Uncovers a Plot",
      sections: [ { heading: "Esther Becomes Queen" }, { heading: "Mordecai Uncovers a Plot" } ] },
    { num: 3, title: "Haman's Plot to Destroy the Jews",
      sections: [ { heading: "Haman's Plot to Destroy the Jews" } ] },
    { num: 4, title: "Mordecai Mourns · For Such a Time as This",
      sections: [ { heading: "Mordecai Mourns" }, { heading: "For Such a Time as This" } ] },
    { num: 5, title: "Esther's Banquet · Haman Builds the Gallows",
      sections: [ { heading: "Esther's Banquet" }, { heading: "Haman Builds the Gallows" } ] },
    { num: 6, title: "The King Honors Mordecai",
      sections: [ { heading: "The King Honors Mordecai" } ] },
    { num: 7, title: "Esther Exposes Haman · Haman Hanged",
      sections: [ { heading: "Esther Exposes Haman" }, { heading: "Haman Hanged" } ] },
    { num: 8, title: "Mordecai's Decree · The Jews Empowered to Defend Themselves",
      sections: [ { heading: "Mordecai's Decree" }, { heading: "The Jews Empowered to Defend Themselves" } ] },
    { num: 9, title: "The Jews Triumph over Their Enemies · The Feast of Purim Established",
      sections: [ { heading: "The Jews Triumph over Their Enemies" }, { heading: "The Feast of Purim Established" } ] },
    { num: 10, title: "The Greatness of Mordecai",
      sections: [ { heading: "The Greatness of Mordecai" } ] }
  ]
};

// =========================================================================
// JOB
// =========================================================================
// Restorations (YHWH speaks directly to Job from ch 38-42):
//   Ch 38 title + section: "The Lord Answers from the Whirlwind"
//              → "YAHUWAH Answers from the Whirlwind"          (Job 38:1)
//   Ch 40 title: "Job Humbled Before the Lord"
//              → "Job Humbled Before YAHUWAH"                   (Job 40:1-6)
//   Ch 40 section "Job Humbled Before the Lord" same restoration
//   Ch 40 section: "The Lord's Second Challenge"
//              → "YAHUWAH's Second Challenge"                   (Job 40:6)
//   Ch 42 section: "The Lord Rebukes Job's Friends"
//              → "YAHUWAH Rebukes Job's Friends"                (Job 42:7)

BOOKS_RESTORED.job = {
  chapters: [
    { num: 1, title: "Job's Character and Wealth · Satan Permitted to Test Job · Job Loses Everything",
      sections: [ { heading: "Job's Character and Wealth" }, { heading: "Satan Permitted to Test Job" }, { heading: "Job Loses Everything" } ] },
    { num: 2, title: "Satan Strikes Job's Body · Job's Three Friends Arrive",
      sections: [ { heading: "Satan Strikes Job's Body" }, { heading: "Job's Three Friends Arrive" } ] },
    { num: 3, title: "Job Curses the Day of His Birth",
      sections: [ { heading: "Job Curses the Day of His Birth" } ] },
    { num: 4, title: "Eliphaz's First Speech",
      sections: [ { heading: "Eliphaz's First Speech" } ] },
    { num: 5, title: "Eliphaz Continues",
      sections: [ { heading: "Eliphaz Continues" } ] },
    { num: 6, title: "Job's Reply to Eliphaz",
      sections: [ { heading: "Job's Reply to Eliphaz" } ] },
    { num: 7, title: "Job Cries Out to God",
      sections: [ { heading: "Job Cries Out to God" } ] },
    { num: 8, title: "Bildad's First Speech",
      sections: [ { heading: "Bildad's First Speech" } ] },
    { num: 9, title: "Job's Reply to Bildad",
      sections: [ { heading: "Job's Reply to Bildad" } ] },
    { num: 10, title: "Job's Lament Continues",
      sections: [ { heading: "Job's Lament Continues" } ] },
    { num: 11, title: "Zophar's First Speech",
      sections: [ { heading: "Zophar's First Speech" } ] },
    { num: 12, title: "Job's Reply to Zophar",
      sections: [ { heading: "Job's Reply to Zophar" } ] },
    { num: 13, title: "Though He Slay Me, Yet Will I Trust Him",
      sections: [ { heading: "Though He Slay Me, Yet Will I Trust Him" } ] },
    { num: 14, title: "Man Born of Woman",
      sections: [ { heading: "Man Born of Woman" } ] },
    { num: 15, title: "Eliphaz's Second Speech",
      sections: [ { heading: "Eliphaz's Second Speech" } ] },
    { num: 16, title: "Job's Reply: Miserable Comforters",
      sections: [ { heading: "Job's Reply: Miserable Comforters" } ] },
    { num: 17, title: "Job's Hope in the Grave",
      sections: [ { heading: "Job's Hope in the Grave" } ] },
    { num: 18, title: "Bildad's Second Speech",
      sections: [ { heading: "Bildad's Second Speech" } ] },
    { num: 19, title: "I Know That My Redeemer Lives",
      sections: [ { heading: "Job's Reply to Bildad" }, { heading: "I Know That My Redeemer Lives" } ] },
    { num: 20, title: "Zophar's Second Speech",
      sections: [ { heading: "Zophar's Second Speech" } ] },
    { num: 21, title: "Job's Reply: Why Do the Wicked Prosper?",
      sections: [ { heading: "Job's Reply: Why Do the Wicked Prosper?" } ] },
    { num: 22, title: "Eliphaz's Third Speech",
      sections: [ { heading: "Eliphaz's Third Speech" } ] },
    { num: 23, title: "Oh, That I Knew Where to Find Him",
      sections: [ { heading: "Oh, That I Knew Where to Find Him" } ] },
    { num: 24, title: "The Wicked Seem to Go Unpunished",
      sections: [ { heading: "The Wicked Seem to Go Unpunished" } ] },
    { num: 25, title: "Bildad's Third Speech",
      sections: [ { heading: "Bildad's Third Speech" } ] },
    { num: 26, title: "Job Declares God's Power",
      sections: [ { heading: "Job Declares God's Power" } ] },
    { num: 27, title: "Job Maintains His Integrity",
      sections: [ { heading: "Job Maintains His Integrity" } ] },
    { num: 28, title: "Where Shall Wisdom Be Found?",
      sections: [ { heading: "Where Shall Wisdom Be Found?" } ] },
    { num: 29, title: "Job Remembers His Former Days",
      sections: [ { heading: "Job Remembers His Former Days" } ] },
    { num: 30, title: "Job's Present Suffering",
      sections: [ { heading: "Job's Present Suffering" } ] },
    { num: 31, title: "Job's Final Defense",
      sections: [ { heading: "Job's Final Defense" } ] },
    { num: 32, title: "Elihu Speaks",
      sections: [ { heading: "Elihu Speaks" } ] },
    { num: 33, title: "Elihu Rebukes Job",
      sections: [ { heading: "Elihu Rebukes Job" } ] },
    { num: 34, title: "Elihu Defends God's Justice",
      sections: [ { heading: "Elihu Defends God's Justice" } ] },
    { num: 35, title: "Elihu Continues",
      sections: [ { heading: "Elihu Continues" } ] },
    { num: 36, title: "Elihu Exalts God's Greatness",
      sections: [ { heading: "Elihu Exalts God's Greatness" } ] },
    { num: 37, title: "Elihu Speaks of God's Majesty",
      sections: [ { heading: "Elihu Speaks of God's Majesty" } ] },
    { num: 38,
      // RESTORED — Job 38:1
      title: "YAHUWAH Answers from the Whirlwind · Where Were You When I Laid the Foundations?",
      sections: [ { heading: "YAHUWAH Answers from the Whirlwind" }, { heading: "Where Were You When I Laid the Foundations?" }, { heading: "Who Provides for the Beasts?" } ] },
    { num: 39, title: "The Wild Creatures of God",
      sections: [ { heading: "The Wild Creatures of God" } ] },
    { num: 40,
      // RESTORED — Job 40:1-6
      title: "Job Humbled Before YAHUWAH · Behemoth",
      sections: [ { heading: "Job Humbled Before YAHUWAH" }, { heading: "YAHUWAH's Second Challenge" }, { heading: "Behemoth" } ] },
    { num: 41, title: "Leviathan",
      sections: [ { heading: "Leviathan" } ] },
    { num: 42,
      // RESTORED — Job 42:7
      title: "Job's Repentance · Job Restored",
      sections: [ { heading: "Job's Repentance" }, { heading: "YAHUWAH Rebukes Job's Friends" }, { heading: "Job Restored" } ] }
  ]
};

// =========================================================================
// PSALMS
// =========================================================================
// 150 chapters. Psalms is YHWH-saturated — nearly every "Lord" in chrome
// corresponds to the Tetragrammaton in the verses. Each entry reviewed
// and restored accordingly. A few notes:
//   - "God" chrome (Ps 46, 66, 68, 75, 76, 80, 81, 82, 83, 89) stays as
//     "God" (Elohim — title, not Name).
//   - Ps 89 section: "God's Covenant with David" stays (Elohim).
//   - Ps 110:1 — "The LORD said to my Lord" — the first Name is YHWH
//     (restored to YAHUWAH), the second "my Lord" is Adonai referring
//     to the Messiah as title. The second stays.
//   - Ps 119 acrostic (Aleph through Tav, 22 Hebrew letter sections) —
//     chapter title "The Excellence of the Lord's Law" restored; the
//     22 letter-name sections stay unchanged.

BOOKS_RESTORED.psalms = {
  chapters: [
    { num: 1, title: "The Way of the Righteous and the Wicked",
      sections: [ { heading: "The Way of the Righteous and the Wicked" } ] },
    { num: 2,
      // RESTORED — Ps 2:2 "against the LORD and His Anointed"
      title: "The Reign of YAHUWAH's Anointed",
      sections: [ { heading: "The Reign of YAHUWAH's Anointed" } ] },
    { num: 3, title: "A Morning Prayer of Trust",
      sections: [ { heading: "A Morning Prayer of Trust" } ] },
    { num: 4, title: "An Evening Prayer of Confidence",
      sections: [ { heading: "An Evening Prayer of Confidence" } ] },
    { num: 5, title: "A Prayer for Guidance",
      sections: [ { heading: "A Prayer for Guidance" } ] },
    { num: 6, title: "A Cry for Mercy in Distress",
      sections: [ { heading: "A Cry for Mercy in Distress" } ] },
    { num: 7, title: "A Plea for Justice Against the Wicked",
      sections: [ { heading: "A Plea for Justice Against the Wicked" } ] },
    { num: 8, title: "How Majestic Is Your Name",
      sections: [ { heading: "How Majestic Is Your Name" } ] },
    { num: 9,
      // RESTORED — Ps 9 addresses YHWH throughout ("I will praise You, O LORD")
      title: "Thanksgiving for YAHUWAH's Justice",
      sections: [ { heading: "Thanksgiving for YAHUWAH's Justice" } ] },
    { num: 10, title: "Why Do You Stand Far Off?",
      sections: [ { heading: "Why Do You Stand Far Off?" } ] },
    { num: 11,
      // RESTORED — Ps 11:1 "In the LORD I put my trust"
      title: "In YAHUWAH I Take Refuge",
      sections: [ { heading: "In YAHUWAH I Take Refuge" } ] },
    { num: 12,
      // RESTORED — Ps 12:6 "The words of the LORD are pure words"
      title: "The Pure Words of YAHUWAH",
      sections: [ { heading: "The Pure Words of YAHUWAH" } ] },
    { num: 13,
      // RESTORED — Ps 13:1 "How long, O LORD?"
      title: "How Long, O YAHUWAH?",
      sections: [ { heading: "How Long, O YAHUWAH?" } ] },
    { num: 14, title: "The Fool Says There Is No God",
      sections: [ { heading: "The Fool Says There Is No God" } ] },
    { num: 15, title: "Who May Dwell on Your Holy Hill?",
      sections: [ { heading: "Who May Dwell on Your Holy Hill?" } ] },
    { num: 16, title: "You Will Not Abandon My Soul to Sheol",
      sections: [ { heading: "You Will Not Abandon My Soul to Sheol" } ] },
    { num: 17, title: "Hide Me Under the Shadow of Your Wings",
      sections: [ { heading: "Hide Me Under the Shadow of Your Wings" } ] },
    { num: 18,
      // RESTORED — Ps 18:2 "The LORD is my rock"
      title: "YAHUWAH Is My Rock and My Deliverer",
      sections: [ { heading: "YAHUWAH My Rock and Deliverer" }, { heading: "He Trains My Hands for Battle" } ] },
    { num: 19,
      // RESTORED — Ps 19:7 "The law of the LORD is perfect"
      title: "The Heavens Declare the Glory of God · The Law of YAHUWAH Is Perfect",
      sections: [ { heading: "The Heavens Declare the Glory of God" }, { heading: "The Law of YAHUWAH Is Perfect" } ] },
    { num: 20,
      // RESTORED — Ps 20:1 "May the LORD answer you in the day of trouble"
      title: "May YAHUWAH Answer in the Day of Trouble",
      sections: [ { heading: "May YAHUWAH Answer in the Day of Trouble" } ] },
    { num: 21,
      // RESTORED — Ps 21:1 "The king shall have joy in Your strength, O LORD"
      title: "The King Rejoices in YAHUWAH's Strength",
      sections: [ { heading: "The King Rejoices in YAHUWAH's Strength" } ] },
    { num: 22, title: "My God, My God, Why Have You Forsaken Me? · They Pierced My Hands and My Feet",
      sections: [ { heading: "My God, My God, Why Have You Forsaken Me?" }, { heading: "I Will Declare Your Name" } ] },
    { num: 23,
      // RESTORED — Ps 23:1 "The LORD is my shepherd"
      title: "YAHUWAH Is My Shepherd",
      sections: [ { heading: "YAHUWAH Is My Shepherd" } ] },
    { num: 24, title: "The King of Glory Comes In",
      sections: [ { heading: "The King of Glory Comes In" } ] },
    { num: 25, title: "Teach Me Your Paths",
      sections: [ { heading: "Teach Me Your Paths" } ] },
    { num: 26,
      // RESTORED — Ps 26:1 "Vindicate me, O LORD"
      title: "Vindicate Me, O YAHUWAH",
      sections: [ { heading: "Vindicate Me, O YAHUWAH" } ] },
    { num: 27,
      // RESTORED — Ps 27:1 "The LORD is my light and my salvation"
      title: "YAHUWAH Is My Light and My Salvation",
      sections: [ { heading: "YAHUWAH Is My Light and My Salvation" } ] },
    { num: 28,
      // RESTORED — Ps 28:7 "The LORD is my strength and my shield"
      title: "YAHUWAH Is My Strength and Shield",
      sections: [ { heading: "YAHUWAH Is My Strength and Shield" } ] },
    { num: 29,
      // RESTORED — Ps 29:3 "The voice of the LORD is over the waters"
      title: "The Voice of YAHUWAH Over the Waters",
      sections: [ { heading: "The Voice of YAHUWAH Over the Waters" } ] },
    { num: 30, title: "Weeping Endures for a Night, Joy Comes in the Morning",
      sections: [ { heading: "Weeping Endures for a Night, Joy Comes in the Morning" } ] },
    { num: 31, title: "Into Your Hand I Commit My Spirit",
      sections: [ { heading: "Into Your Hand I Commit My Spirit" } ] },
    { num: 32, title: "Blessed Is He Whose Sin Is Forgiven",
      sections: [ { heading: "Blessed Is He Whose Sin Is Forgiven" } ] },
    { num: 33,
      // RESTORED — Ps 33:1,3 "Rejoice in the LORD … sing to Him a new song"
      title: "Sing a New Song to YAHUWAH",
      sections: [ { heading: "Sing a New Song to YAHUWAH" } ] },
    { num: 34,
      // RESTORED — Ps 34:8 "Oh, taste and see that the LORD is good"
      title: "Taste and See That YAHUWAH Is Good",
      sections: [ { heading: "Taste and See That YAHUWAH Is Good" } ] },
    { num: 35, title: "A Prayer for Vindication",
      sections: [ { heading: "A Prayer for Vindication" } ] },
    { num: 36, title: "With You Is the Fountain of Life",
      sections: [ { heading: "With You Is the Fountain of Life" } ] },
    { num: 37, title: "Do Not Fret Because of Evildoers",
      sections: [ { heading: "Do Not Fret Because of Evildoers" } ] },
    { num: 38, title: "A Penitent's Cry for Help",
      sections: [ { heading: "A Penitent's Cry for Help" } ] },
    { num: 39, title: "Show Me My End",
      sections: [ { heading: "Show Me My End" } ] },
    { num: 40, title: "He Lifted Me Out of the Pit",
      sections: [ { heading: "He Lifted Me Out of the Pit" } ] },
    { num: 41, title: "Blessed Is He Who Considers the Poor · Doxology of Book One",
      sections: [ { heading: "Blessed Is He Who Considers the Poor" }, { heading: "Doxology of Book One" } ] },
    { num: 42, title: "As the Deer Pants for the Water",
      sections: [ { heading: "As the Deer Pants for the Water" } ] },
    { num: 43, title: "Send Out Your Light and Truth",
      sections: [ { heading: "Send Out Your Light and Truth" } ] },
    { num: 44, title: "A Lament in Defeat",
      sections: [ { heading: "A Lament in Defeat" } ] },
    { num: 45, title: "A Royal Wedding Song",
      sections: [ { heading: "A Royal Wedding Song" } ] },
    { num: 46, title: "God Is Our Refuge and Strength · Be Still and Know That I Am God",
      sections: [ { heading: "God Is Our Refuge and Strength" }, { heading: "Be Still and Know That I Am God" } ] },
    { num: 47,
      // RESTORED — Ps 47:2 "For the LORD Most High is awesome; He is a great King"
      title: "YAHUWAH Reigns Over the Nations",
      sections: [ { heading: "YAHUWAH Reigns Over the Nations" } ] },
    { num: 48,
      // RESTORED — Ps 48:1 "Great is the LORD, and greatly to be praised in the city of our God"
      title: "Great Is YAHUWAH in the City of Our God",
      sections: [ { heading: "Great Is YAHUWAH in the City of Our God" } ] },
    { num: 49, title: "Why Should I Fear in Days of Trouble?",
      sections: [ { heading: "Why Should I Fear in Days of Trouble?" } ] },
    { num: 50, title: "The Mighty God Calls the Earth",
      sections: [ { heading: "The Mighty God Calls the Earth" } ] },
    { num: 51, title: "Have Mercy on Me, O God · Create in Me a Clean Heart",
      sections: [ { heading: "Have Mercy on Me, O God" }, { heading: "Create in Me a Clean Heart" } ] },
    { num: 52, title: "Why Do You Boast in Evil?",
      sections: [ { heading: "Why Do You Boast in Evil?" } ] },
    { num: 53, title: "The Fool Says There Is No God",
      sections: [ { heading: "The Fool Says There Is No God" } ] },
    { num: 54, title: "A Prayer for Help Against Enemies",
      sections: [ { heading: "A Prayer for Help Against Enemies" } ] },
    { num: 55,
      // RESTORED — Ps 55:22 "Cast your burden on the LORD"
      title: "Cast Your Burden on YAHUWAH",
      sections: [ { heading: "Cast Your Burden on YAHUWAH" } ] },
    { num: 56, title: "When I Am Afraid, I Will Trust in You",
      sections: [ { heading: "When I Am Afraid, I Will Trust in You" } ] },
    { num: 57, title: "In the Shadow of Your Wings I Take Refuge",
      sections: [ { heading: "In the Shadow of Your Wings I Take Refuge" } ] },
    { num: 58, title: "A Prayer Against Unjust Rulers",
      sections: [ { heading: "A Prayer Against Unjust Rulers" } ] },
    { num: 59, title: "Deliver Me from My Enemies",
      sections: [ { heading: "Deliver Me from My Enemies" } ] },
    { num: 60, title: "A Prayer After Defeat",
      sections: [ { heading: "A Prayer After Defeat" } ] },
    { num: 61, title: "Lead Me to the Rock That Is Higher Than I",
      sections: [ { heading: "Lead Me to the Rock That Is Higher Than I" } ] },
    { num: 62, title: "My Soul Waits in Silence for God Alone",
      sections: [ { heading: "My Soul Waits in Silence for God Alone" } ] },
    { num: 63, title: "My Soul Thirsts for You",
      sections: [ { heading: "My Soul Thirsts for You" } ] },
    { num: 64, title: "Hide Me from the Secret Plots of the Wicked",
      sections: [ { heading: "Hide Me from the Secret Plots of the Wicked" } ] },
    { num: 65, title: "You Crown the Year with Your Bounty",
      sections: [ { heading: "You Crown the Year with Your Bounty" } ] },
    { num: 66, title: "Come and See What God Has Done",
      sections: [ { heading: "Come and See What God Has Done" } ] },
    { num: 67, title: "May the Nations Praise You",
      sections: [ { heading: "May the Nations Praise You" } ] },
    { num: 68, title: "Let God Arise",
      sections: [ { heading: "Let God Arise" } ] },
    { num: 69, title: "Save Me, for the Waters Have Come Up to My Neck",
      sections: [ { heading: "Save Me, for the Waters Have Come Up to My Neck" } ] },
    { num: 70, title: "Make Haste to Help Me",
      sections: [ { heading: "Make Haste to Help Me" } ] },
    { num: 71, title: "Do Not Cast Me Off in Old Age",
      sections: [ { heading: "Do Not Cast Me Off in Old Age" } ] },
    { num: 72, title: "A Prayer for the King's Reign · Doxology of Book Two",
      sections: [ { heading: "A Prayer for the King's Reign" }, { heading: "Doxology of Book Two" } ] },
    { num: 73, title: "When I Saw the Prosperity of the Wicked",
      sections: [ { heading: "When I Saw the Prosperity of the Wicked" } ] },
    { num: 74, title: "Why Have You Cast Us Off Forever?",
      sections: [ { heading: "Why Have You Cast Us Off Forever?" } ] },
    { num: 75, title: "God Is the Judge",
      sections: [ { heading: "God Is the Judge" } ] },
    { num: 76, title: "God Is Known in Judah",
      sections: [ { heading: "God Is Known in Judah" } ] },
    { num: 77,
      // RESTORED — Ps 77:11 "I will remember the works of the LORD"
      title: "I Will Remember the Works of YAHUWAH",
      sections: [ { heading: "I Will Remember the Works of YAHUWAH" } ] },
    { num: 78,
      // RESTORED — Ps 78:4 "telling … the praises of the LORD, and His strength and His wonderful works"
      title: "The Story of YAHUWAH's Mighty Deeds",
      sections: [ { heading: "The Story of YAHUWAH's Mighty Deeds" } ] },
    { num: 79, title: "The Nations Have Defiled Your Holy Temple",
      sections: [ { heading: "The Nations Have Defiled Your Holy Temple" } ] },
    { num: 80, title: "Restore Us, O God",
      sections: [ { heading: "Restore Us, O God" } ] },
    { num: 81, title: "Sing Aloud to God Our Strength",
      sections: [ { heading: "Sing Aloud to God Our Strength" } ] },
    { num: 82, title: "God Judges Among the Gods",
      sections: [ { heading: "God Judges Among the Gods" } ] },
    { num: 83, title: "Do Not Keep Silent, O God",
      sections: [ { heading: "Do Not Keep Silent, O God" } ] },
    { num: 84, title: "How Lovely Is Your Dwelling Place",
      sections: [ { heading: "How Lovely Is Your Dwelling Place" } ] },
    { num: 85, title: "Mercy and Truth Have Met Together",
      sections: [ { heading: "Mercy and Truth Have Met Together" } ] },
    { num: 86,
      // RESTORED — Ps 86:11 "Teach me Your way, O LORD"
      title: "Teach Me Your Way, O YAHUWAH",
      sections: [ { heading: "Teach Me Your Way, O YAHUWAH" } ] },
    { num: 87, title: "Glorious Things Are Spoken of Zion",
      sections: [ { heading: "Glorious Things Are Spoken of Zion" } ] },
    { num: 88, title: "A Prayer from the Depths of Despair",
      sections: [ { heading: "A Prayer from the Depths of Despair" } ] },
    { num: 89, title: "God's Covenant with David · Doxology of Book Three",
      sections: [ { heading: "God's Covenant with David" }, { heading: "Doxology of Book Three" } ] },
    { num: 90, title: "A Thousand Years in Your Sight",
      sections: [ { heading: "A Thousand Years in Your Sight" } ] },
    { num: 91, title: "He Who Dwells in the Secret Place of the Most High",
      sections: [ { heading: "He Who Dwells in the Secret Place of the Most High" } ] },
    { num: 92, title: "A Song for the Sabbath",
      sections: [ { heading: "A Song for the Sabbath" } ] },
    { num: 93,
      // RESTORED — Ps 93:1 "The LORD reigns, He is clothed with majesty"
      title: "YAHUWAH Reigns, Robed in Majesty",
      sections: [ { heading: "YAHUWAH Reigns, Robed in Majesty" } ] },
    { num: 94,
      // RESTORED — Ps 94:1 "O LORD God of vengeance"
      title: "O YAHUWAH, God of Vengeance",
      sections: [ { heading: "O YAHUWAH, God of Vengeance" } ] },
    { num: 95,
      // RESTORED — Ps 95:1 "come, let us sing to the LORD"
      title: "Come, Let Us Sing to YAHUWAH",
      sections: [ { heading: "Come, Let Us Sing to YAHUWAH" } ] },
    { num: 96,
      // RESTORED — Ps 96:1 "Oh, sing to the LORD a new song"
      title: "Sing to YAHUWAH a New Song",
      sections: [ { heading: "Sing to YAHUWAH a New Song" } ] },
    { num: 97,
      // RESTORED — Ps 97:1 "The LORD reigns; let the earth rejoice"
      title: "YAHUWAH Reigns, Let the Earth Rejoice",
      sections: [ { heading: "YAHUWAH Reigns, Let the Earth Rejoice" } ] },
    { num: 98, title: "Sing a New Song, for He Has Done Marvelous Things",
      sections: [ { heading: "Sing a New Song, for He Has Done Marvelous Things" } ] },
    { num: 99,
      // RESTORED — Ps 99:1 "The LORD reigns; let the peoples tremble"
      title: "YAHUWAH Reigns, Let the Peoples Tremble",
      sections: [ { heading: "YAHUWAH Reigns, Let the Peoples Tremble" } ] },
    { num: 100,
      // RESTORED — Ps 100:1 "make a joyful shout to the LORD"
      title: "Make a Joyful Noise to YAHUWAH",
      sections: [ { heading: "Make a Joyful Noise to YAHUWAH" } ] },
    { num: 101, title: "I Will Sing of Mercy and Justice",
      sections: [ { heading: "I Will Sing of Mercy and Justice" } ] },
    { num: 102, title: "The Prayer of an Afflicted Man",
      sections: [ { heading: "The Prayer of an Afflicted Man" } ] },
    { num: 103,
      // RESTORED — Ps 103:1 "Bless the LORD, O my soul"
      title: "Bless YAHUWAH, O My Soul",
      sections: [ { heading: "Bless YAHUWAH, O My Soul" } ] },
    { num: 104,
      // RESTORED — Ps 104:1 "Bless the LORD, O my soul! O LORD my God, You are very great"
      title: "YAHUWAH the Creator and Sustainer",
      sections: [ { heading: "YAHUWAH the Creator and Sustainer" } ] },
    { num: 105, title: "Remember the Wonderful Works He Has Done",
      sections: [ { heading: "Remember the Wonderful Works He Has Done" } ] },
    { num: 106,
      // RESTORED — Ps 106:1 "Praise the LORD … for His mercy endures forever"
      title: "Israel's Rebellions and YAHUWAH's Mercy · Doxology of Book Four",
      sections: [ { heading: "Israel's Rebellions and YAHUWAH's Mercy" }, { heading: "Doxology of Book Four" } ] },
    { num: 107, title: "Give Thanks, for His Mercy Endures Forever",
      sections: [ { heading: "Give Thanks, for His Mercy Endures Forever" } ] },
    { num: 108, title: "My Heart Is Steadfast, O God",
      sections: [ { heading: "My Heart Is Steadfast, O God" } ] },
    { num: 109, title: "A Cry Against Slanderers",
      sections: [ { heading: "A Cry Against Slanderers" } ] },
    { num: 110,
      // RESTORED — Ps 110:1 "The LORD said to my Lord, 'Sit at My right hand'"
      // First "Lord" = YHWH (restored). Second "my Lord" = Adonai referring to
      // the Messiah as Lord/Master — held as title, not Name.
      title: "YAHUWAH Said to My Lord",
      sections: [ { heading: "YAHUWAH Said to My Lord" } ] },
    { num: 111,
      // RESTORED — Ps 111:10 "The fear of the LORD is the beginning of wisdom"
      title: "The Fear of YAHUWAH Is the Beginning of Wisdom",
      sections: [ { heading: "The Fear of YAHUWAH Is the Beginning of Wisdom" } ] },
    { num: 112,
      // RESTORED — Ps 112:1 "Blessed is the man who fears the LORD"
      title: "Blessed Is the Man Who Fears YAHUWAH",
      sections: [ { heading: "Blessed Is the Man Who Fears YAHUWAH" } ] },
    { num: 113,
      // RESTORED — Ps 113:3 "From the rising of the sun to its going down, the LORD's name is to be praised"
      title: "Praise YAHUWAH from the Rising of the Sun",
      sections: [ { heading: "Praise YAHUWAH from the Rising of the Sun" } ] },
    { num: 114, title: "When Israel Came Out of Egypt",
      sections: [ { heading: "When Israel Came Out of Egypt" } ] },
    { num: 115,
      // RESTORED — Ps 115:1 "Not unto us, O LORD, not unto us, But to Your name give glory"
      title: "Not to Us, O YAHUWAH, but to Your Name",
      sections: [ { heading: "Not to Us, O YAHUWAH, but to Your Name" } ] },
    { num: 116,
      // RESTORED — Ps 116:1 "I love the LORD, because He has heard my voice"
      title: "I Love YAHUWAH, for He Has Heard My Voice",
      sections: [ { heading: "I Love YAHUWAH, for He Has Heard My Voice" } ] },
    { num: 117,
      // RESTORED — Ps 117:1 "Praise the LORD, all you Gentiles"
      title: "Praise YAHUWAH, All Nations",
      sections: [ { heading: "Praise YAHUWAH, All Nations" } ] },
    { num: 118, title: "The Stone Which the Builders Rejected",
      sections: [ { heading: "The Stone Which the Builders Rejected" } ] },
    { num: 119,
      // RESTORED — Ps 119 is a 176-verse meditation on YHWH's law
      title: "The Excellence of YAHUWAH's Law",
      sections: [
        { heading: "Aleph" }, { heading: "Beth" }, { heading: "Gimel" }, { heading: "Daleth" },
        { heading: "He" }, { heading: "Vav" }, { heading: "Zayin" }, { heading: "Cheth" },
        { heading: "Teth" }, { heading: "Yod" }, { heading: "Kaph" }, { heading: "Lamed" },
        { heading: "Mem" }, { heading: "Nun" }, { heading: "Samekh" }, { heading: "Ayin" },
        { heading: "Pe" }, { heading: "Tzaddi" }, { heading: "Qoph" }, { heading: "Resh" },
        { heading: "Shin" }, { heading: "Tav" }
      ] },
    { num: 120,
      // RESTORED — Ps 120:1 "In my distress I cried to the LORD"
      title: "I Cried to YAHUWAH in My Distress",
      sections: [ { heading: "I Cried to YAHUWAH in My Distress" } ] },
    { num: 121, title: "I Will Lift Up My Eyes to the Hills",
      sections: [ { heading: "I Will Lift Up My Eyes to the Hills" } ] },
    { num: 122, title: "Pray for the Peace of Jerusalem",
      sections: [ { heading: "Pray for the Peace of Jerusalem" } ] },
    { num: 123, title: "To You I Lift Up My Eyes",
      sections: [ { heading: "To You I Lift Up My Eyes" } ] },
    { num: 124,
      // RESTORED — Ps 124:1 "If it had not been the LORD who was on our side"
      title: "If YAHUWAH Had Not Been on Our Side",
      sections: [ { heading: "If YAHUWAH Had Not Been on Our Side" } ] },
    { num: 125,
      // RESTORED — Ps 125:1 "Those who trust in the LORD are like Mount Zion"
      title: "Those Who Trust in YAHUWAH Are Like Mount Zion",
      sections: [ { heading: "Those Who Trust in YAHUWAH Are Like Mount Zion" } ] },
    { num: 126, title: "Those Who Sow in Tears Shall Reap in Joy",
      sections: [ { heading: "Those Who Sow in Tears Shall Reap in Joy" } ] },
    { num: 127,
      // RESTORED — Ps 127:1 "Unless the LORD builds the house"
      title: "Unless YAHUWAH Builds the House",
      sections: [ { heading: "Unless YAHUWAH Builds the House" } ] },
    { num: 128,
      // RESTORED — Ps 128:1 "Blessed is every one who fears the LORD"
      title: "Blessed Is Everyone Who Fears YAHUWAH",
      sections: [ { heading: "Blessed Is Everyone Who Fears YAHUWAH" } ] },
    { num: 129, title: "Many Times They Have Afflicted Me",
      sections: [ { heading: "Many Times They Have Afflicted Me" } ] },
    { num: 130, title: "Out of the Depths I Cry to You",
      sections: [ { heading: "Out of the Depths I Cry to You" } ] },
    { num: 131, title: "A Quieted Soul",
      sections: [ { heading: "A Quieted Soul" } ] },
    { num: 132,
      // RESTORED — Ps 132:11 "The LORD has sworn in truth to David"
      title: "YAHUWAH's Promise to David",
      sections: [ { heading: "YAHUWAH's Promise to David" } ] },
    { num: 133, title: "How Good and Pleasant When Brothers Dwell in Unity",
      sections: [ { heading: "How Good and Pleasant When Brothers Dwell in Unity" } ] },
    { num: 134,
      // RESTORED — Ps 134:1 "Bless the LORD, all you servants of the LORD"
      title: "Bless YAHUWAH, You Servants Who Stand by Night",
      sections: [ { heading: "Bless YAHUWAH, You Servants Who Stand by Night" } ] },
    { num: 135,
      // RESTORED — Ps 135:1 "Praise the name of the LORD"
      title: "Praise YAHUWAH, the God Above All Gods",
      sections: [ { heading: "Praise YAHUWAH, the God Above All Gods" } ] },
    { num: 136, title: "His Mercy Endures Forever",
      sections: [ { heading: "His Mercy Endures Forever" } ] },
    { num: 137, title: "By the Rivers of Babylon",
      sections: [ { heading: "By the Rivers of Babylon" } ] },
    { num: 138, title: "I Will Praise You with My Whole Heart",
      sections: [ { heading: "I Will Praise You with My Whole Heart" } ] },
    { num: 139, title: "You Have Searched Me and Known Me · Fearfully and Wonderfully Made",
      sections: [ { heading: "You Have Searched Me and Known Me" }, { heading: "Fearfully and Wonderfully Made" }, { heading: "Search Me, O God" } ] },
    { num: 140, title: "Deliver Me from Evil Men",
      sections: [ { heading: "Deliver Me from Evil Men" } ] },
    { num: 141, title: "Set a Guard Over My Mouth",
      sections: [ { heading: "Set a Guard Over My Mouth" } ] },
    { num: 142,
      // RESTORED — Ps 142:1 "I cry out to the LORD"
      title: "I Cry to YAHUWAH from the Cave",
      sections: [ { heading: "I Cry to YAHUWAH from the Cave" } ] },
    { num: 143, title: "Teach Me to Do Your Will",
      sections: [ { heading: "Teach Me to Do Your Will" } ] },
    { num: 144,
      // RESTORED — Ps 144:1 "Blessed be the LORD my Rock"
      title: "Blessed Be YAHUWAH, My Rock",
      sections: [ { heading: "Blessed Be YAHUWAH, My Rock" } ] },
    { num: 145, title: "I Will Extol You, My God, O King",
      sections: [ { heading: "I Will Extol You, My God, O King" } ] },
    { num: 146,
      // RESTORED — Ps 146:1 "Praise the LORD! Praise the LORD, O my soul!"
      title: "Praise YAHUWAH, O My Soul",
      sections: [ { heading: "Praise YAHUWAH, O My Soul" } ] },
    { num: 147, title: "He Heals the Brokenhearted",
      sections: [ { heading: "He Heals the Brokenhearted" } ] },
    { num: 148,
      // RESTORED — Ps 148:1 "Praise the LORD from the heavens; Praise Him in the heights!"
      title: "Praise YAHUWAH from the Heavens and the Earth",
      sections: [ { heading: "Praise YAHUWAH from the Heavens and the Earth" } ] },
    { num: 149,
      // RESTORED — Ps 149:1 "Sing to the LORD a new song"
      title: "Sing a New Song to YAHUWAH",
      sections: [ { heading: "Sing a New Song to YAHUWAH" } ] },
    { num: 150,
      // RESTORED — Ps 150:6 "Let everything that has breath praise the LORD"
      title: "Let Everything That Has Breath Praise YAHUWAH",
      sections: [ { heading: "Let Everything That Has Breath Praise YAHUWAH" } ] }
  ]
};

// =========================================================================
// PROVERBS
// =========================================================================
// Restorations:
//   Ch 3 title + section: "Trust in the Lord with All Your Heart"  (Prov 3:5)
//   Ch 6 title + section: "The Six Things the Lord Hates"           (Prov 6:16)
//   Ch 16 title + section: "The Plans of Man and the Purposes of the Lord" (Prov 16:9)
//   Ch 18 title + section: "The Name of the Lord Is a Strong Tower"  (Prov 18:10)
//   Ch 21 title + section: "The King's Heart in the Lord's Hand"     (Prov 21:1)

BOOKS_RESTORED.proverbs = {
  chapters: [
    { num: 1, title: "The Beginning of Knowledge · Wisdom Calls in the Streets",
      sections: [ { heading: "The Beginning of Knowledge" }, { heading: "A Father's Warning" }, { heading: "Wisdom Calls in the Streets" } ] },
    { num: 2, title: "The Value of Wisdom",
      sections: [ { heading: "The Value of Wisdom" } ] },
    { num: 3,
      // RESTORED — Prov 3:5
      title: "Trust in YAHUWAH with All Your Heart · Wisdom Is Better Than Silver",
      sections: [ { heading: "Trust in YAHUWAH with All Your Heart" }, { heading: "Wisdom Is Better Than Silver" }, { heading: "Do Not Withhold Good" } ] },
    { num: 4, title: "Get Wisdom, Get Understanding · Guard Your Heart",
      sections: [ { heading: "Get Wisdom, Get Understanding" }, { heading: "The Way of the Righteous and the Wicked" }, { heading: "Guard Your Heart" } ] },
    { num: 5, title: "Warning Against the Forbidden Woman",
      sections: [ { heading: "Warning Against the Forbidden Woman" } ] },
    { num: 6,
      // RESTORED — Prov 6:16
      title: "Warnings Against Folly · The Six Things YAHUWAH Hates",
      sections: [ { heading: "Warning Against Surety" }, { heading: "Go to the Ant, You Sluggard" }, { heading: "The Six Things YAHUWAH Hates" }, { heading: "Warning Against Adultery" } ] },
    { num: 7, title: "The Seductress and the Simple Man",
      sections: [ { heading: "The Seductress and the Simple Man" } ] },
    { num: 8, title: "Wisdom Calls · Wisdom Was with God Before Creation",
      sections: [ { heading: "Wisdom Calls" }, { heading: "Wisdom Was with God Before Creation" } ] },
    { num: 9, title: "The Feast of Wisdom · The Feast of Folly",
      sections: [ { heading: "The Feast of Wisdom" }, { heading: "The Feast of Folly" } ] },
    { num: 10, title: "The Proverbs of Solomon",
      sections: [ { heading: "The Proverbs of Solomon" } ] },
    { num: 11, title: "The Righteous and the Wicked Contrasted",
      sections: [ { heading: "The Righteous and the Wicked Contrasted" } ] },
    { num: 12, title: "The Way of Wisdom and Folly",
      sections: [ { heading: "The Way of Wisdom and Folly" } ] },
    { num: 13, title: "Diligence and Discipline",
      sections: [ { heading: "Diligence and Discipline" } ] },
    { num: 14, title: "Wisdom Builds Her House",
      sections: [ { heading: "Wisdom Builds Her House" } ] },
    { num: 15, title: "A Soft Answer Turns Away Wrath",
      sections: [ { heading: "A Soft Answer Turns Away Wrath" } ] },
    { num: 16,
      // RESTORED — Prov 16:9
      title: "The Plans of Man and the Purposes of YAHUWAH",
      sections: [ { heading: "The Plans of Man and the Purposes of YAHUWAH" } ] },
    { num: 17, title: "Better a Dry Morsel with Quietness",
      sections: [ { heading: "Better a Dry Morsel with Quietness" } ] },
    { num: 18,
      // RESTORED — Prov 18:10
      title: "The Name of YAHUWAH Is a Strong Tower",
      sections: [ { heading: "The Name of YAHUWAH Is a Strong Tower" } ] },
    { num: 19, title: "Better the Poor Who Walks in Integrity",
      sections: [ { heading: "Better the Poor Who Walks in Integrity" } ] },
    { num: 20, title: "Wine Is a Mocker",
      sections: [ { heading: "Wine Is a Mocker" } ] },
    { num: 21,
      // RESTORED — Prov 21:1
      title: "The King's Heart in YAHUWAH's Hand",
      sections: [ { heading: "The King's Heart in YAHUWAH's Hand" } ] },
    { num: 22, title: "A Good Name Is Better Than Riches · The Words of the Wise",
      sections: [ { heading: "A Good Name Is Better Than Riches" }, { heading: "The Words of the Wise" } ] },
    { num: 23, title: "Sayings of the Wise",
      sections: [ { heading: "Sayings of the Wise" } ] },
    { num: 24, title: "More Sayings of the Wise",
      sections: [ { heading: "More Sayings of the Wise" }, { heading: "Further Sayings of the Wise" } ] },
    { num: 25, title: "More Proverbs of Solomon",
      sections: [ { heading: "More Proverbs of Solomon" } ] },
    { num: 26, title: "Honor Is Not Fitting for a Fool",
      sections: [ { heading: "Honor Is Not Fitting for a Fool" } ] },
    { num: 27, title: "Iron Sharpens Iron",
      sections: [ { heading: "Iron Sharpens Iron" } ] },
    { num: 28, title: "The Wicked Flee When None Pursue",
      sections: [ { heading: "The Wicked Flee When None Pursue" } ] },
    { num: 29, title: "Where There Is No Vision the People Perish",
      sections: [ { heading: "Where There Is No Vision the People Perish" } ] },
    { num: 30, title: "The Words of Agur",
      sections: [ { heading: "The Words of Agur" } ] },
    { num: 31, title: "The Words of King Lemuel · The Virtuous Woman",
      sections: [ { heading: "The Words of King Lemuel" }, { heading: "The Virtuous Woman" } ] }
  ]
};

// =========================================================================
// ECCLESIASTES
// =========================================================================
// No Lord/LORD in chrome.

BOOKS_RESTORED.ecclesiastes = {
  chapters: [
    { num: 1, title: "Vanity of Vanities · All Things Are Wearisome",
      sections: [ { heading: "Vanity of Vanities" }, { heading: "The Vanity of Wisdom" } ] },
    { num: 2, title: "The Vanity of Pleasure · The Vanity of Toil",
      sections: [ { heading: "The Vanity of Pleasure" }, { heading: "Wisdom and Folly Both End in Death" }, { heading: "The Vanity of Toil" } ] },
    { num: 3, title: "A Time for Everything · God Has Made Everything Beautiful in Its Time",
      sections: [ { heading: "A Time for Everything" }, { heading: "God Has Made Everything Beautiful in Its Time" }, { heading: "From Dust to Dust" } ] },
    { num: 4, title: "The Oppressed Have No Comforter · Two Are Better Than One",
      sections: [ { heading: "The Oppressed Have No Comforter" }, { heading: "Two Are Better Than One" }, { heading: "The Vanity of Political Power" } ] },
    { num: 5, title: "Guard Your Steps in the House of God · The Vanity of Wealth",
      sections: [ { heading: "Guard Your Steps in the House of God" }, { heading: "The Vanity of Wealth" } ] },
    { num: 6, title: "The Vanity of Wealth Without Enjoyment",
      sections: [ { heading: "The Vanity of Wealth Without Enjoyment" } ] },
    { num: 7, title: "The Day of Death and the House of Mourning",
      sections: [ { heading: "The Day of Death and the House of Mourning" } ] },
    { num: 8, title: "Obey the King · The Mystery of God's Ways",
      sections: [ { heading: "Obey the King" }, { heading: "The Mystery of God's Ways" } ] },
    { num: 9, title: "One Fate for All · Whatever Your Hand Finds to Do",
      sections: [ { heading: "One Fate for All" }, { heading: "Whatever Your Hand Finds to Do" }, { heading: "Wisdom Better Than Strength" } ] },
    { num: 10, title: "Wisdom and Folly",
      sections: [ { heading: "Wisdom and Folly" } ] },
    { num: 11, title: "Cast Your Bread upon the Waters · Remember Your Creator in Youth",
      sections: [ { heading: "Cast Your Bread upon the Waters" }, { heading: "Remember Your Creator in Youth" } ] },
    { num: 12, title: "Remember Your Creator · Fear God and Keep His Commandments",
      sections: [ { heading: "Remember Your Creator Before the Days of Trouble" }, { heading: "Fear God and Keep His Commandments" } ] }
  ]
};

// =========================================================================
// SONG OF SOLOMON
// =========================================================================
// No Lord/LORD in chrome. The Song does not contain the Tetragrammaton.

BOOKS_RESTORED.songofsolomon = {
  chapters: [
    { num: 1, title: "The Bride Longs for Her Beloved",
      sections: [ { heading: "The Bride's Longing" }, { heading: "I Am Dark but Lovely" }, { heading: "The Beloved and the Bride Praise One Another" } ] },
    { num: 2, title: "The Rose of Sharon · His Banner Over Me Is Love",
      sections: [ { heading: "The Rose of Sharon" }, { heading: "Rise Up, My Love, and Come Away" } ] },
    { num: 3, title: "The Bride Searches for Her Beloved · Solomon's Wedding Procession",
      sections: [ { heading: "The Bride Searches for Her Beloved" }, { heading: "Solomon's Wedding Procession" } ] },
    { num: 4, title: "You Are Altogether Beautiful, My Love",
      sections: [ { heading: "You Are Altogether Beautiful, My Love" } ] },
    { num: 5, title: "The Bride's Dream · My Beloved Is Altogether Lovely",
      sections: [ { heading: "The Bride's Dream" }, { heading: "My Beloved Is Altogether Lovely" } ] },
    { num: 6, title: "Where Has Your Beloved Gone?",
      sections: [ { heading: "Where Has Your Beloved Gone?" }, { heading: "The Beloved Praises His Bride" } ] },
    { num: 7, title: "The Beloved Praises His Bride",
      sections: [ { heading: "The Beloved Praises His Bride" } ] },
    { num: 8, title: "Love Is Strong as Death",
      sections: [ { heading: "The Bride's Longing for Her Beloved" }, { heading: "Love Is Strong as Death" }, { heading: "The Final Exchange" } ] }
  ]
};

// =========================================================================
// ISAIAH
// =========================================================================
// 66 chapters, richly YHWH-saturated. Every Lord reference in chrome has
// been verified against the verses (the Tetragrammaton is nearly omnipresent
// in Isaiah).

BOOKS_RESTORED.isaiah = {
  chapters: [
    { num: 1, title: "The Wickedness of Judah · Come, Let Us Reason Together",
      sections: [ { heading: "The Wickedness of Judah" }, { heading: "Worship Without Justice" }, { heading: "Come, Let Us Reason Together" } ] },
    { num: 2,
      // RESTORED — Is 2:2-3 "mountain of the LORD's house"; v12 "the day of the LORD"
      title: "The Mountain of YAHUWAH · The Day of YAHUWAH Against Pride",
      sections: [ { heading: "The Mountain of YAHUWAH" }, { heading: "The Day of YAHUWAH Against Pride" } ] },
    { num: 3, title: "Judgment on Judah and Jerusalem",
      sections: [ { heading: "Judgment on Judah's Leaders" }, { heading: "Judgment on the Daughters of Zion" } ] },
    { num: 4,
      // RESTORED — Is 4:2 "the Branch of the LORD shall be beautiful"
      title: "The Branch of YAHUWAH",
      sections: [ { heading: "The Branch of YAHUWAH" } ] },
    { num: 5, title: "The Song of the Vineyard · Six Woes Against Judah",
      sections: [ { heading: "The Song of the Vineyard" }, { heading: "Six Woes Against Judah" } ] },
    { num: 6,
      // RESTORED — Is 6:1-5 "I saw the Lord … Holy, holy, holy is the LORD of hosts"
      title: "Isaiah's Vision of YAHUWAH · Here Am I, Send Me",
      sections: [ { heading: "Isaiah's Vision of YAHUWAH" }, { heading: "Here Am I, Send Me" } ] },
    { num: 7, title: "The Sign of Immanuel",
      sections: [ { heading: "Isaiah's Message to Ahaz" }, { heading: "The Sign of Immanuel" } ] },
    { num: 8,
      // RESTORED — Is 8:13 "The LORD of hosts, Him you shall hallow"
      title: "Maher-Shalal-Hash-Baz · Fear YAHUWAH Alone",
      sections: [ { heading: "Maher-Shalal-Hash-Baz" }, { heading: "Fear YAHUWAH Alone" } ] },
    { num: 9,
      // RESTORED — Is 9:8-12 "the LORD will set up … the LORD of hosts"
      title: "For Unto Us a Child Is Born · YAHUWAH's Anger Against Israel",
      sections: [ { heading: "For Unto Us a Child Is Born" }, { heading: "YAHUWAH's Anger Against Israel" } ] },
    { num: 10,
      // RESTORED — Is 10:5,12 "O Assyrian, the rod of My anger … the LORD has performed all His work"
      title: "Woe to Assyria, the Rod of YAHUWAH's Anger · The Remnant of Israel",
      sections: [ { heading: "Woe to Unjust Lawmakers" }, { heading: "Woe to Assyria, the Rod of YAHUWAH's Anger" }, { heading: "The Remnant of Israel" } ] },
    { num: 11, title: "The Branch from the Stem of Jesse · The Wolf Shall Dwell with the Lamb",
      sections: [ { heading: "The Branch from the Stem of Jesse" }, { heading: "The Wolf Shall Dwell with the Lamb" }, { heading: "The Remnant Gathered" } ] },
    { num: 12, title: "A Song of Praise",
      sections: [ { heading: "A Song of Praise" } ] },
    { num: 13, title: "The Burden Against Babylon",
      sections: [ { heading: "The Burden Against Babylon" } ] },
    { num: 14, title: "Israel's Restoration · How Are You Fallen from Heaven, O Lucifer · The Burden Against Philistia",
      sections: [ { heading: "Israel's Restoration" }, { heading: "How Are You Fallen from Heaven, O Lucifer" }, { heading: "The Burden Against Assyria" }, { heading: "The Burden Against Philistia" } ] },
    { num: 15, title: "The Burden Against Moab",
      sections: [ { heading: "The Burden Against Moab" } ] },
    { num: 16, title: "The Doom of Moab",
      sections: [ { heading: "The Doom of Moab" } ] },
    { num: 17, title: "The Burden Against Damascus",
      sections: [ { heading: "The Burden Against Damascus" } ] },
    { num: 18, title: "The Burden Against Cush",
      sections: [ { heading: "The Burden Against Cush" } ] },
    { num: 19, title: "The Burden Against Egypt · Egypt and Assyria Blessed",
      sections: [ { heading: "The Burden Against Egypt" }, { heading: "Egypt and Assyria Blessed" } ] },
    { num: 20, title: "A Sign Against Egypt and Cush",
      sections: [ { heading: "A Sign Against Egypt and Cush" } ] },
    { num: 21, title: "Babylon Is Fallen · Burdens Against Edom and Arabia",
      sections: [ { heading: "Babylon Is Fallen" }, { heading: "Burdens Against Edom and Arabia" } ] },
    { num: 22, title: "The Burden Against the Valley of Vision · Shebna Replaced by Eliakim",
      sections: [ { heading: "The Burden Against the Valley of Vision" }, { heading: "Shebna Replaced by Eliakim" } ] },
    { num: 23, title: "The Burden Against Tyre",
      sections: [ { heading: "The Burden Against Tyre" } ] },
    { num: 24,
      // RESTORED — Is 24:1 "the LORD makes the earth empty"
      title: "YAHUWAH's Devastation of the Earth",
      sections: [ { heading: "YAHUWAH's Devastation of the Earth" } ] },
    { num: 25,
      // RESTORED — Is 25:1,8 "O LORD … He will swallow up death forever"
      title: "YAHUWAH Will Swallow Up Death Forever",
      sections: [ { heading: "Praise to YAHUWAH" }, { heading: "YAHUWAH Will Swallow Up Death Forever" } ] },
    { num: 26,
      // RESTORED — Is 26:4 "Trust in the LORD forever"
      title: "You Will Keep Him in Perfect Peace · YAHUWAH's People Delivered",
      sections: [ { heading: "A Song of Trust in YAHUWAH" }, { heading: "You Will Keep Him in Perfect Peace" }, { heading: "YAHUWAH's People Delivered" } ] },
    { num: 27, title: "Leviathan Punished · Israel Restored",
      sections: [ { heading: "Leviathan Punished" }, { heading: "Israel Restored" } ] },
    { num: 28, title: "Woe to Drunkards · The Precious Cornerstone",
      sections: [ { heading: "Woe to the Drunkards of Ephraim" }, { heading: "The Precious Cornerstone" } ] },
    { num: 29, title: "Woe to Ariel · This People Honor Me with Their Lips",
      sections: [ { heading: "Woe to Ariel" }, { heading: "This People Honor Me with Their Lips" } ] },
    { num: 30,
      // RESTORED — Is 30:18 "the LORD will wait, that He may be gracious to you"
      title: "Woe to the Rebellious Children · YAHUWAH Will Be Gracious",
      sections: [ { heading: "Woe to the Rebellious Children" }, { heading: "YAHUWAH Will Be Gracious" } ] },
    { num: 31, title: "Woe to Those Who Trust in Egypt",
      sections: [ { heading: "Woe to Those Who Trust in Egypt" } ] },
    { num: 32, title: "A King Will Reign in Righteousness · The Spirit Poured Out",
      sections: [ { heading: "A King Will Reign in Righteousness" }, { heading: "Warning to Complacent Women" }, { heading: "The Spirit Poured Out" } ] },
    { num: 33,
      // RESTORED — Is 33:22 "the LORD is our Judge … the LORD is our King"
      title: "Woe to the Destroyer · YAHUWAH Will Reign",
      sections: [ { heading: "Woe to the Destroyer" }, { heading: "YAHUWAH Will Reign" } ] },
    { num: 34, title: "Judgment on the Nations",
      sections: [ { heading: "Judgment on the Nations" } ] },
    { num: 35, title: "The Desert Shall Blossom · The Highway of Holiness",
      sections: [ { heading: "The Desert Shall Blossom" }, { heading: "The Highway of Holiness" } ] },
    { num: 36, title: "Sennacherib Threatens Jerusalem",
      sections: [ { heading: "Sennacherib Threatens Jerusalem" } ] },
    { num: 37, title: "Hezekiah's Prayer · Sennacherib's Army Destroyed",
      sections: [ { heading: "Hezekiah's Prayer" }, { heading: "Isaiah's Prophecy Against Sennacherib" }, { heading: "Sennacherib's Army Destroyed" } ] },
    { num: 38, title: "Hezekiah's Sickness and Healing · Hezekiah's Song",
      sections: [ { heading: "Hezekiah's Sickness and Healing" }, { heading: "Hezekiah's Song" } ] },
    { num: 39, title: "The Babylonian Envoys",
      sections: [ { heading: "The Babylonian Envoys" } ] },
    { num: 40,
      // RESTORED — Is 40:18,25 "To whom then will you liken God?"; v28 "the everlasting God, the LORD"
      title: "Comfort My People · The Voice in the Wilderness · They Shall Mount Up with Wings as Eagles",
      sections: [ { heading: "Comfort My People" }, { heading: "The Voice in the Wilderness" }, { heading: "To Whom Will You Compare YAHUWAH?" }, { heading: "They Shall Mount Up with Wings as Eagles" } ] },
    { num: 41,
      // RESTORED — Is 41:2,4 "the LORD, the first, and with the last; I am He"
      title: "Fear Not, I Am with You",
      sections: [ { heading: "YAHUWAH Stirs Up the One from the East" }, { heading: "Fear Not, I Am with You" }, { heading: "The Idols Are Nothing" } ] },
    { num: 42,
      // RESTORED — Is 42:10 "Sing to the LORD a new song"
      title: "Behold My Servant · A New Song to YAHUWAH",
      sections: [ { heading: "Behold My Servant" }, { heading: "A New Song to YAHUWAH" }, { heading: "Israel's Blindness and Deafness" } ] },
    { num: 43,
      // RESTORED — Is 43:3,11 "For I am the LORD your God … besides Me there is no savior"
      title: "When You Pass Through the Waters · I Am YAHUWAH, Your Savior",
      sections: [ { heading: "When You Pass Through the Waters" }, { heading: "I Am YAHUWAH, Your Savior" }, { heading: "Israel's Sin" } ] },
    { num: 44, title: "I Will Pour Out My Spirit · The Folly of Idolatry · Cyrus, My Shepherd",
      sections: [ { heading: "I Will Pour Out My Spirit" }, { heading: "The Folly of Idolatry" }, { heading: "Cyrus, My Shepherd" } ] },
    { num: 45,
      // RESTORED — Is 45:1 "Thus says the LORD to His anointed, to Cyrus"
      title: "YAHUWAH's Anointed, Cyrus · Turn to Me and Be Saved",
      sections: [ { heading: "YAHUWAH's Anointed, Cyrus" }, { heading: "Turn to Me and Be Saved" } ] },
    { num: 46, title: "The Idols of Babylon Fall · I Am God, There Is No Other",
      sections: [ { heading: "The Idols of Babylon Fall" }, { heading: "I Am God, There Is No Other" } ] },
    { num: 47, title: "The Fall of Babylon",
      sections: [ { heading: "The Fall of Babylon" } ] },
    { num: 48, title: "For My Own Sake I Will Act · Come Out from Babylon",
      sections: [ { heading: "For My Own Sake I Will Act" }, { heading: "Come Out from Babylon" } ] },
    { num: 49, title: "The Servant a Light to the Nations · Can a Mother Forget Her Nursing Child?",
      sections: [ { heading: "The Servant a Light to the Nations" }, { heading: "The Restoration of Israel" }, { heading: "Can a Mother Forget Her Nursing Child?" } ] },
    { num: 50, title: "The Obedience of the Servant",
      sections: [ { heading: "Israel's Sin" }, { heading: "The Obedience of the Servant" } ] },
    { num: 51,
      // RESTORED — Is 51:9 "Awake, awake, put on strength, O arm of the LORD"
      title: "Look to the Rock from Which You Were Hewn · Awake, Awake, Put On Strength",
      sections: [ { heading: "Look to the Rock from Which You Were Hewn" }, { heading: "The Arm of YAHUWAH Awake" }, { heading: "Awake, Awake, Put On Strength" } ] },
    { num: 52, title: "How Beautiful Are the Feet of Him Who Brings Good News · The Suffering Servant Lifted Up",
      sections: [ { heading: "Awake, Awake, O Zion" }, { heading: "How Beautiful Are the Feet of Him Who Brings Good News" }, { heading: "The Suffering Servant Lifted Up" } ] },
    { num: 53, title: "He Was Wounded for Our Transgressions · Like a Lamb to the Slaughter",
      sections: [ { heading: "Despised and Rejected by Men" }, { heading: "He Was Wounded for Our Transgressions" }, { heading: "Like a Lamb to the Slaughter" }, { heading: "He Bore the Sin of Many" } ] },
    { num: 54, title: "The Eternal Covenant of Peace",
      sections: [ { heading: "Sing, O Barren One" }, { heading: "The Eternal Covenant of Peace" } ] },
    { num: 55, title: "Come, Buy Without Money · My Word Shall Not Return Void",
      sections: [ { heading: "Come, Buy Without Money" }, { heading: "My Word Shall Not Return Void" } ] },
    { num: 56, title: "Salvation for the Foreigner · Israel's Worthless Watchmen",
      sections: [ { heading: "Salvation for the Foreigner" }, { heading: "Israel's Worthless Watchmen" } ] },
    { num: 57, title: "Israel's Idolatry Condemned · Peace to the Contrite",
      sections: [ { heading: "Israel's Idolatry Condemned" }, { heading: "Peace to the Contrite" } ] },
    { num: 58,
      // RESTORED — Is 58:5-6 "Is this not the fast that I have chosen?" (YHWH speaking)
      title: "The Fast YAHUWAH Has Chosen · If You Honor the Sabbath",
      sections: [ { heading: "The Fast YAHUWAH Has Chosen" }, { heading: "If You Honor the Sabbath" } ] },
    { num: 59, title: "Sin Has Separated You from God · The Redeemer Will Come to Zion",
      sections: [ { heading: "Sin Has Separated You from God" }, { heading: "The Redeemer Will Come to Zion" } ] },
    { num: 60, title: "Arise, Shine, for Your Light Has Come",
      sections: [ { heading: "Arise, Shine, for Your Light Has Come" } ] },
    { num: 61,
      // RESTORED — Is 61:1 "The Spirit of the Lord GOD is upon Me"
      // Note: "Lord GOD" in NKJV = Adonai YHWH; the Spirit here is of YHWH.
      title: "The Spirit of YAHUWAH Is upon Me · The Garment of Praise",
      sections: [ { heading: "The Spirit of YAHUWAH Is upon Me" }, { heading: "The Garment of Praise" } ] },
    { num: 62, title: "Zion's New Name · The Coming Salvation",
      sections: [ { heading: "Zion's New Name" }, { heading: "The Coming Salvation" } ] },
    { num: 63,
      // RESTORED — Is 63:4 "the day of vengeance is in My heart"; v7 "I will mention the lovingkindnesses of the LORD"
      title: "YAHUWAH's Day of Vengeance · A Prayer of Remembrance",
      sections: [ { heading: "YAHUWAH's Day of Vengeance" }, { heading: "A Prayer of Remembrance" } ] },
    { num: 64, title: "Oh, That You Would Rend the Heavens",
      sections: [ { heading: "Oh, That You Would Rend the Heavens" } ] },
    { num: 65, title: "The New Heavens and the New Earth",
      sections: [ { heading: "Judgment and Salvation" }, { heading: "The New Heavens and the New Earth" } ] },
    { num: 66, title: "Heaven Is My Throne · The Final Glory of Zion",
      sections: [ { heading: "Heaven Is My Throne" }, { heading: "Rejoice with Jerusalem" }, { heading: "The Final Glory of Zion" } ] }
  ]
};

// =========================================================================
// JEREMIAH
// =========================================================================
// 52 chapters. Jeremiah speaks as YHWH's mouthpiece throughout.

BOOKS_RESTORED.jeremiah = {
  chapters: [
    { num: 1, title: "The Call of Jeremiah · Two Visions",
      sections: [ { heading: "Introduction" }, { heading: "The Call of Jeremiah" }, { heading: "Two Visions" } ] },
    { num: 2,
      // RESTORED — Jer 2:13 "My people have committed two evils: they have forsaken Me, the fountain of living waters"
      title: "Israel Has Forsaken YAHUWAH · Broken Cisterns",
      sections: [ { heading: "Israel Has Forsaken YAHUWAH" }, { heading: "Israel's Apostasy" } ] },
    { num: 3, title: "Faithless Israel and Treacherous Judah · Return, O Backsliding Children",
      sections: [ { heading: "Judah's Adultery" }, { heading: "Faithless Israel and Treacherous Judah" }, { heading: "Return, O Backsliding Children" } ] },
    { num: 4, title: "A Call to Repentance · Disaster from the North",
      sections: [ { heading: "A Call to Repentance" }, { heading: "Disaster from the North" } ] },
    { num: 5, title: "Not One Righteous Person · Judgment on Judah",
      sections: [ { heading: "Not One Righteous Person" }, { heading: "Judgment on Judah" } ] },
    { num: 6, title: "The Siege of Jerusalem Foretold · The Old Paths",
      sections: [ { heading: "The Siege of Jerusalem Foretold" }, { heading: "The Old Paths" } ] },
    { num: 7, title: "The Sermon at the Temple Gate · The Valley of Slaughter",
      sections: [ { heading: "The Sermon at the Temple Gate" }, { heading: "Do Not Pray for This People" }, { heading: "The Valley of Slaughter" } ] },
    { num: 8, title: "Sin and Punishment · Is There No Balm in Gilead?",
      sections: [ { heading: "Sin and Punishment" }, { heading: "Is There No Balm in Gilead?" } ] },
    { num: 9,
      // RESTORED — Jer 9:24 "let him who glories glory … that he understands and knows Me, that I am the LORD"
      title: "Jeremiah Weeps for His People · Let Him Who Glories Glory in Knowing YAHUWAH",
      sections: [ { heading: "Jeremiah Weeps for His People" }, { heading: "Why the Land Will Be Destroyed" }, { heading: "Let Him Who Glories Glory in Knowing YAHUWAH" } ] },
    { num: 10, title: "Idols and the True God",
      sections: [ { heading: "Idols and the True God" }, { heading: "The Coming Captivity" } ] },
    { num: 11, title: "The Broken Covenant · Plot Against Jeremiah",
      sections: [ { heading: "The Broken Covenant" }, { heading: "Plot Against Jeremiah" } ] },
    { num: 12,
      // RESTORED — Jer 12:5,14 YHWH answers Jeremiah's complaint
      title: "Jeremiah's Complaint · YAHUWAH's Answer",
      sections: [ { heading: "Jeremiah's Complaint" }, { heading: "YAHUWAH's Answer" } ] },
    { num: 13, title: "The Linen Sash · The Wineskins",
      sections: [ { heading: "The Linen Sash" }, { heading: "The Wineskins" }, { heading: "Captivity Threatened" } ] },
    { num: 14, title: "The Drought · False Prophets",
      sections: [ { heading: "The Drought" }, { heading: "False Prophets" } ] },
    { num: 15, title: "Judgment Not Withheld · Jeremiah's Complaint",
      sections: [ { heading: "Judgment Not Withheld" }, { heading: "Jeremiah's Complaint" } ] },
    { num: 16, title: "Jeremiah Forbidden to Marry · Restoration Promised",
      sections: [ { heading: "Jeremiah Forbidden to Marry" }, { heading: "Restoration Promised" } ] },
    { num: 17,
      // RESTORED — Jer 17:7 "Blessed is the man who trusts in the LORD, and whose hope is the LORD"
      title: "The Sin of Judah · Blessed Is the Man Who Trusts in YAHUWAH · Hallow the Sabbath Day",
      sections: [ { heading: "The Sin of Judah" }, { heading: "Blessed Is the Man Who Trusts in YAHUWAH" }, { heading: "Jeremiah's Prayer" }, { heading: "Hallow the Sabbath Day" } ] },
    { num: 18, title: "The Potter and the Clay · Plot Against Jeremiah",
      sections: [ { heading: "The Potter and the Clay" }, { heading: "Israel's Forgetfulness" }, { heading: "Plot Against Jeremiah" } ] },
    { num: 19, title: "The Broken Flask",
      sections: [ { heading: "The Broken Flask" } ] },
    { num: 20, title: "Jeremiah Persecuted by Pashhur · Cursed Be the Day I Was Born",
      sections: [ { heading: "Jeremiah Persecuted by Pashhur" }, { heading: "Cursed Be the Day I Was Born" } ] },
    { num: 21, title: "Zedekiah's Request Refused",
      sections: [ { heading: "Zedekiah's Request Refused" } ] },
    { num: 22, title: "Judgment Against Wicked Kings",
      sections: [ { heading: "Message to the King of Judah" }, { heading: "Judgment Against Jehoiakim" }, { heading: "Judgment Against Coniah" } ] },
    { num: 23, title: "The Righteous Branch · Lying Prophets Condemned",
      sections: [ { heading: "The Righteous Branch" }, { heading: "Lying Prophets Condemned" } ] },
    { num: 24, title: "The Two Baskets of Figs",
      sections: [ { heading: "The Two Baskets of Figs" } ] },
    { num: 25,
      // RESTORED — Jer 25:15 "Take this wine cup of fury from My hand" (YHWH speaking)
      title: "Seventy Years of Captivity · The Cup of YAHUWAH's Wrath",
      sections: [ { heading: "Seventy Years of Captivity" }, { heading: "The Cup of YAHUWAH's Wrath" } ] },
    { num: 26, title: "Jeremiah Threatened with Death",
      sections: [ { heading: "Jeremiah Threatened with Death" } ] },
    { num: 27, title: "Serve the King of Babylon",
      sections: [ { heading: "Serve the King of Babylon" } ] },
    { num: 28, title: "Hananiah the False Prophet",
      sections: [ { heading: "Hananiah the False Prophet" } ] },
    { num: 29, title: "Letter to the Exiles · Plans for Welfare and a Future",
      sections: [ { heading: "Letter to the Exiles" }, { heading: "Plans for Welfare and a Future" }, { heading: "Judgment on the False Prophets" } ] },
    { num: 30, title: "Restoration Promised",
      sections: [ { heading: "The Time of Jacob's Trouble" }, { heading: "Restoration Promised" } ] },
    { num: 31, title: "I Have Loved You with an Everlasting Love · Rachel Weeping for Her Children · The New Covenant",
      sections: [ { heading: "I Have Loved You with an Everlasting Love" }, { heading: "The Return from Exile" }, { heading: "Rachel Weeping for Her Children" }, { heading: "Each Shall Die for His Own Sin" }, { heading: "The New Covenant" } ] },
    { num: 32,
      // RESTORED — Jer 32:26 "Then the word of the LORD came to Jeremiah"
      title: "Jeremiah Buys a Field · Jeremiah's Prayer · YAHUWAH's Answer",
      sections: [ { heading: "Jeremiah Buys a Field" }, { heading: "Jeremiah's Prayer" }, { heading: "YAHUWAH's Answer" } ] },
    { num: 33, title: "The Coming Restoration · The Branch of Righteousness",
      sections: [ { heading: "The Coming Restoration" }, { heading: "The Branch of Righteousness" } ] },
    { num: 34, title: "Zedekiah Will Be Captured · The Slaves Set Free and Reclaimed",
      sections: [ { heading: "Zedekiah Will Be Captured" }, { heading: "The Slaves Set Free and Reclaimed" } ] },
    { num: 35, title: "The Faithfulness of the Rechabites",
      sections: [ { heading: "The Faithfulness of the Rechabites" } ] },
    { num: 36, title: "Jehoiakim Burns the Scroll",
      sections: [ { heading: "The Scroll Read in the Temple" }, { heading: "Jehoiakim Burns the Scroll" } ] },
    { num: 37, title: "Jeremiah Imprisoned",
      sections: [ { heading: "Jeremiah Imprisoned" } ] },
    { num: 38, title: "Jeremiah in the Cistern",
      sections: [ { heading: "Jeremiah in the Cistern" }, { heading: "Zedekiah Consults Jeremiah" } ] },
    { num: 39, title: "The Fall of Jerusalem",
      sections: [ { heading: "The Fall of Jerusalem" }, { heading: "Jeremiah and Ebed-Melech" } ] },
    { num: 40, title: "Jeremiah Released · Gedaliah Made Governor",
      sections: [ { heading: "Jeremiah Released" }, { heading: "Gedaliah Made Governor" } ] },
    { num: 41, title: "Gedaliah Murdered",
      sections: [ { heading: "Gedaliah Murdered" } ] },
    { num: 42, title: "Warning Against Going to Egypt",
      sections: [ { heading: "Warning Against Going to Egypt" } ] },
    { num: 43, title: "Flight to Egypt",
      sections: [ { heading: "Flight to Egypt" } ] },
    { num: 44, title: "Judgment on Those in Egypt · The Queen of Heaven",
      sections: [ { heading: "Judgment on Those in Egypt" }, { heading: "The Queen of Heaven" } ] },
    { num: 45, title: "A Word to Baruch",
      sections: [ { heading: "A Word to Baruch" } ] },
    { num: 46, title: "Prophecy Against Egypt",
      sections: [ { heading: "Prophecy Against Egypt" } ] },
    { num: 47, title: "Prophecy Against the Philistines",
      sections: [ { heading: "Prophecy Against the Philistines" } ] },
    { num: 48, title: "Prophecy Against Moab",
      sections: [ { heading: "Prophecy Against Moab" } ] },
    { num: 49, title: "Prophecies Against the Nations",
      sections: [ { heading: "Against Ammon" }, { heading: "Against Edom" }, { heading: "Against Damascus" }, { heading: "Against Kedar and Hazor" }, { heading: "Against Elam" } ] },
    { num: 50, title: "Prophecy Against Babylon",
      sections: [ { heading: "Prophecy Against Babylon" } ] },
    { num: 51, title: "The Fall of Babylon Foretold",
      sections: [ { heading: "The Fall of Babylon Foretold" }, { heading: "Babylon's Final Doom" } ] },
    { num: 52, title: "The Fall of Jerusalem · The Temple Destroyed · Jehoiachin Released",
      sections: [ { heading: "The Fall of Jerusalem" }, { heading: "The Temple Destroyed" }, { heading: "The People Exiled" }, { heading: "Jehoiachin Released" } ] }
  ]
};

// =========================================================================
// LAMENTATIONS
// =========================================================================
// Restoration:
//   Ch 2 title + section: "The Lord's Anger Against Jerusalem"
//              → "YAHUWAH's Anger Against Jerusalem"
//     (Lam 2:1-5 "how the LORD has covered the daughter of Zion with a cloud
//      in His anger … the LORD was like an enemy")

BOOKS_RESTORED.lamentations = {
  chapters: [
    { num: 1, title: "How Lonely Sits the City",
      sections: [ { heading: "Jerusalem's Desolation" }, { heading: "Is It Nothing to You, All You Who Pass By?" } ] },
    { num: 2,
      // RESTORED — Lam 2:1-5
      title: "YAHUWAH's Anger Against Jerusalem",
      sections: [ { heading: "YAHUWAH's Anger Against Jerusalem" } ] },
    { num: 3, title: "I Am the Man Who Has Seen Affliction · His Mercies Are New Every Morning",
      sections: [ { heading: "I Am the Man Who Has Seen Affliction" }, { heading: "His Mercies Are New Every Morning" }, { heading: "A Cry for Vengeance" } ] },
    { num: 4, title: "The Horror of the Siege",
      sections: [ { heading: "The Horror of the Siege" } ] },
    { num: 5, title: "A Prayer for Restoration",
      sections: [ { heading: "A Prayer for Restoration" } ] }
  ]
};

// =========================================================================
// EZEKIEL
// =========================================================================
// Restorations:
//   Ch 1 title + section: "The Glory of the Lord"            (Ezek 1:28)
//   Ch 21 title + section: "The Sword of the Lord"           (Ezek 21:3-5)
//   Ch 30 title + section: "The Day of the Lord Against Egypt" (Ezek 30:3)
//   Ch 48 title + section: "The Lord Is There" — the closing name of the
//              city, "YAHUWAH Shammah" (Ezek 48:35).

BOOKS_RESTORED.ezekiel = {
  chapters: [
    { num: 1,
      // RESTORED — Ezek 1:28
      title: "The Vision of the Four Living Creatures · The Wheels Within Wheels · The Glory of YAHUWAH",
      sections: [ { heading: "Introduction" }, { heading: "The Vision of the Four Living Creatures" }, { heading: "The Wheels Within Wheels" }, { heading: "The Glory of YAHUWAH" } ] },
    { num: 2, title: "Ezekiel Called to Be a Prophet · The Scroll of Lamentation",
      sections: [ { heading: "Ezekiel Called to Be a Prophet" }, { heading: "The Scroll of Lamentation" } ] },
    { num: 3, title: "Ezekiel Eats the Scroll · The Watchman of Israel",
      sections: [ { heading: "Ezekiel Eats the Scroll" }, { heading: "The Watchman of Israel" }, { heading: "Ezekiel Made Mute" } ] },
    { num: 4, title: "The Siege of Jerusalem Acted Out",
      sections: [ { heading: "The Siege of Jerusalem Acted Out" } ] },
    { num: 5, title: "The Razor and the Sword",
      sections: [ { heading: "The Razor and the Sword" } ] },
    { num: 6, title: "Judgment on the Mountains of Israel",
      sections: [ { heading: "Judgment on the Mountains of Israel" } ] },
    { num: 7, title: "The End Has Come",
      sections: [ { heading: "The End Has Come" } ] },
    { num: 8, title: "Visions of Idolatry in the Temple",
      sections: [ { heading: "Visions of Idolatry in the Temple" } ] },
    { num: 9, title: "The Mark on the Foreheads · The Slaughter Begins",
      sections: [ { heading: "The Mark on the Foreheads" }, { heading: "The Slaughter Begins" } ] },
    { num: 10, title: "The Glory Departs the Temple",
      sections: [ { heading: "The Glory Departs the Temple" } ] },
    { num: 11, title: "Judgment on Wicked Counselors · A New Heart and a New Spirit",
      sections: [ { heading: "Judgment on Wicked Counselors" }, { heading: "A New Heart and a New Spirit" } ] },
    { num: 12, title: "Ezekiel Acts Out the Exile",
      sections: [ { heading: "Ezekiel Acts Out the Exile" }, { heading: "The Vision Will Be Fulfilled" } ] },
    { num: 13, title: "Against False Prophets and Prophetesses",
      sections: [ { heading: "Against False Prophets" }, { heading: "Against False Prophetesses" } ] },
    { num: 14, title: "Idolaters Condemned · Even Noah, Daniel, and Job Could Not Save Them",
      sections: [ { heading: "Idolaters Condemned" }, { heading: "Even Noah, Daniel, and Job Could Not Save Them" } ] },
    { num: 15, title: "The Useless Vine",
      sections: [ { heading: "The Useless Vine" } ] },
    { num: 16, title: "Jerusalem the Unfaithful Bride",
      sections: [ { heading: "Jerusalem the Foundling" }, { heading: "Jerusalem the Unfaithful Bride" }, { heading: "Judgment and Restoration" } ] },
    { num: 17, title: "The Two Eagles and the Vine",
      sections: [ { heading: "The Two Eagles and the Vine" }, { heading: "The Tender Shoot" } ] },
    { num: 18, title: "The Soul That Sins Shall Die",
      sections: [ { heading: "The Soul That Sins Shall Die" } ] },
    { num: 19, title: "A Lament for the Princes of Israel",
      sections: [ { heading: "A Lament for the Princes of Israel" } ] },
    { num: 20, title: "Israel's Rebellion Recounted · I Will Be King Over You",
      sections: [ { heading: "Israel's Rebellion Recounted" }, { heading: "I Will Be King Over You" }, { heading: "The Fire in the South" } ] },
    { num: 21,
      // RESTORED — Ezek 21:3-5
      title: "The Sword of YAHUWAH",
      sections: [ { heading: "The Sword of YAHUWAH" }, { heading: "The King of Babylon at the Crossroads" } ] },
    { num: 22, title: "The Sins of Jerusalem · Israel as Dross",
      sections: [ { heading: "The Sins of Jerusalem" }, { heading: "Israel as Dross" }, { heading: "I Sought for a Man to Stand in the Gap" } ] },
    { num: 23, title: "Oholah and Oholibah",
      sections: [ { heading: "Oholah and Oholibah" } ] },
    { num: 24, title: "The Boiling Pot · The Death of Ezekiel's Wife",
      sections: [ { heading: "The Boiling Pot" }, { heading: "The Death of Ezekiel's Wife" } ] },
    { num: 25, title: "Prophecies Against Ammon, Moab, Edom, and Philistia",
      sections: [ { heading: "Against Ammon" }, { heading: "Against Moab" }, { heading: "Against Edom" }, { heading: "Against Philistia" } ] },
    { num: 26, title: "Prophecy Against Tyre",
      sections: [ { heading: "Prophecy Against Tyre" } ] },
    { num: 27, title: "A Lament for Tyre",
      sections: [ { heading: "A Lament for Tyre" } ] },
    { num: 28, title: "The King of Tyre's Pride · The Anointed Cherub Who Covered",
      sections: [ { heading: "The King of Tyre's Pride" }, { heading: "The Anointed Cherub Who Covered" }, { heading: "Prophecy Against Sidon" } ] },
    { num: 29, title: "Prophecy Against Egypt",
      sections: [ { heading: "Prophecy Against Egypt" } ] },
    { num: 30,
      // RESTORED — Ezek 30:3 "the day of the LORD is near"
      title: "The Day of YAHUWAH Against Egypt",
      sections: [ { heading: "The Day of YAHUWAH Against Egypt" } ] },
    { num: 31, title: "The Cedar of Lebanon Cut Down",
      sections: [ { heading: "The Cedar of Lebanon Cut Down" } ] },
    { num: 32, title: "A Lament for Pharaoh · Egypt Goes Down to Sheol",
      sections: [ { heading: "A Lament for Pharaoh" }, { heading: "Egypt Goes Down to Sheol" } ] },
    { num: 33, title: "The Watchman's Duty · The Fall of Jerusalem Reported",
      sections: [ { heading: "The Watchman's Duty" }, { heading: "The Fall of Jerusalem Reported" } ] },
    { num: 34, title: "Woe to the Shepherds of Israel · I Myself Will Be Their Shepherd · My Servant David",
      sections: [ { heading: "Woe to the Shepherds of Israel" }, { heading: "I Myself Will Be Their Shepherd" }, { heading: "My Servant David" } ] },
    { num: 35, title: "Prophecy Against Mount Seir",
      sections: [ { heading: "Prophecy Against Mount Seir" } ] },
    { num: 36, title: "Blessing on the Mountains of Israel · A New Heart and a New Spirit",
      sections: [ { heading: "Blessing on the Mountains of Israel" }, { heading: "A New Heart and a New Spirit" }, { heading: "The Land Restored" } ] },
    { num: 37, title: "The Valley of Dry Bones · One Stick, One Nation",
      sections: [ { heading: "The Valley of Dry Bones" }, { heading: "One Stick, One Nation" } ] },
    { num: 38, title: "Gog and Magog",
      sections: [ { heading: "Gog and Magog" } ] },
    { num: 39, title: "The Defeat of Gog · Israel Restored",
      sections: [ { heading: "The Defeat of Gog" }, { heading: "Israel Restored" } ] },
    { num: 40, title: "The Vision of the New Temple",
      sections: [ { heading: "Ezekiel Brought to the Temple" }, { heading: "The Outer Court" }, { heading: "The Inner Court" } ] },
    { num: 41, title: "The Temple Sanctuary",
      sections: [ { heading: "The Temple Sanctuary" } ] },
    { num: 42, title: "The Priests' Chambers",
      sections: [ { heading: "The Priests' Chambers" } ] },
    { num: 43, title: "The Glory Returns to the Temple · The Altar Restored",
      sections: [ { heading: "The Glory Returns to the Temple" }, { heading: "The Altar Restored" } ] },
    { num: 44, title: "The Closed East Gate · Rules for the Priests",
      sections: [ { heading: "The Closed East Gate" }, { heading: "Rules for the Priests" } ] },
    { num: 45, title: "The Holy District · The Prince's Offerings",
      sections: [ { heading: "The Holy District" }, { heading: "The Prince's Offerings" } ] },
    { num: 46, title: "Worship in the New Temple",
      sections: [ { heading: "Worship in the New Temple" } ] },
    { num: 47, title: "The River from the Temple · The Borders of the Land",
      sections: [ { heading: "The River from the Temple" }, { heading: "The Borders of the Land" } ] },
    { num: 48,
      // RESTORED — Ezek 48:35 "YAHUWAH Shammah" / "The LORD Is There"
      title: "Division of the Land · YAHUWAH Is There",
      sections: [ { heading: "Division of the Land" }, { heading: "YAHUWAH Is There" } ] }
  ]
};

// =========================================================================
// DANIEL
// =========================================================================
// No Lord/LORD in chrome. Daniel uses "God" (Elohim) throughout; the
// Tetragrammaton does appear in Dan 9 ("I, Daniel, understood by the
// books the number of the years specified by the word of the LORD") but
// the chrome writer chose titles that stay as written.

BOOKS_RESTORED.daniel = {
  chapters: [
    { num: 1, title: "Daniel and His Friends in Babylon · Daniel's Resolve Not to Defile Himself",
      sections: [ { heading: "Daniel and His Friends in Babylon" }, { heading: "Daniel's Resolve Not to Defile Himself" } ] },
    { num: 2, title: "Nebuchadnezzar's Dream · Daniel Interprets the Dream · The Stone Cut Without Hands",
      sections: [ { heading: "Nebuchadnezzar's Forgotten Dream" }, { heading: "Daniel Asks for Time" }, { heading: "The Image and the Stone" }, { heading: "Daniel Interprets the Dream" }, { heading: "Daniel Promoted" } ] },
    { num: 3, title: "The Image of Gold · The Fiery Furnace · The Fourth Man in the Fire",
      sections: [ { heading: "The Image of Gold" }, { heading: "Shadrach, Meshach, and Abednego Refuse" }, { heading: "The Fiery Furnace" }, { heading: "The Fourth Man in the Fire" } ] },
    { num: 4, title: "Nebuchadnezzar's Dream of the Tree · Nebuchadnezzar's Madness and Restoration",
      sections: [ { heading: "Nebuchadnezzar's Dream of the Tree" }, { heading: "Daniel Interprets the Dream" }, { heading: "Nebuchadnezzar's Madness and Restoration" } ] },
    { num: 5, title: "The Writing on the Wall · Belshazzar Slain",
      sections: [ { heading: "Belshazzar's Feast" }, { heading: "Daniel Brought In" }, { heading: "The Writing on the Wall" }, { heading: "Belshazzar Slain" } ] },
    { num: 6, title: "Daniel in the Lions' Den · Daniel Delivered",
      sections: [ { heading: "The Plot Against Daniel" }, { heading: "Daniel in the Lions' Den" }, { heading: "Daniel Delivered" } ] },
    { num: 7, title: "The Vision of the Four Beasts · The Ancient of Days · The Son of Man",
      sections: [ { heading: "The Vision of the Four Beasts" }, { heading: "The Ancient of Days and the Son of Man" }, { heading: "The Vision Interpreted" } ] },
    { num: 8, title: "The Ram and the Goat · The Vision Interpreted",
      sections: [ { heading: "The Ram and the Goat" }, { heading: "The Vision Interpreted" } ] },
    { num: 9, title: "Daniel's Prayer of Confession · The Seventy Weeks",
      sections: [ { heading: "Daniel's Prayer of Confession" }, { heading: "The Seventy Weeks" } ] },
    { num: 10, title: "Daniel's Vision by the Tigris · The Heavenly Messenger",
      sections: [ { heading: "Daniel's Vision by the Tigris" }, { heading: "The Heavenly Messenger" } ] },
    { num: 11, title: "The Kings of the North and the South · The Willful King",
      sections: [ { heading: "The Kings of the North and the South" }, { heading: "The Contemptible Person" }, { heading: "The Willful King" } ] },
    { num: 12, title: "The Time of the End · Many Shall Be Purified",
      sections: [ { heading: "The Time of the End" }, { heading: "Many Shall Be Purified" } ] }
  ]
};

// =========================================================================
// HOSEA
// =========================================================================
BOOKS_RESTORED.hosea = {
  chapters: [
    { num: 1, title: "Hosea Marries Gomer · The Children of Hosea",
      sections: [ { heading: "Hosea Marries Gomer" }, { heading: "The Children of Hosea" } ] },
    { num: 2, title: "Israel's Unfaithfulness Punished · I Will Allure Her into the Wilderness",
      sections: [ { heading: "Israel's Unfaithfulness Punished" }, { heading: "I Will Allure Her into the Wilderness" } ] },
    { num: 3, title: "Hosea Redeems His Wife",
      sections: [ { heading: "Hosea Redeems His Wife" } ] },
    { num: 4, title: "My People Are Destroyed for Lack of Knowledge",
      sections: [ { heading: "My People Are Destroyed for Lack of Knowledge" } ] },
    { num: 5, title: "Judgment on Israel and Judah",
      sections: [ { heading: "Judgment on Israel and Judah" } ] },
    { num: 6,
      // RESTORED — Hos 6:1 "Come, and let us return to the LORD"
      title: "Come, Let Us Return to YAHUWAH · Mercy, Not Sacrifice",
      sections: [ { heading: "Come, Let Us Return to YAHUWAH" }, { heading: "Mercy, Not Sacrifice" } ] },
    { num: 7, title: "Israel's Iniquity Exposed",
      sections: [ { heading: "Israel's Iniquity Exposed" } ] },
    { num: 8, title: "They Sow the Wind and Reap the Whirlwind",
      sections: [ { heading: "They Sow the Wind and Reap the Whirlwind" } ] },
    { num: 9, title: "The Days of Punishment Have Come",
      sections: [ { heading: "The Days of Punishment Have Come" } ] },
    { num: 10, title: "Israel's Empty Vine · Sow for Yourselves Righteousness",
      sections: [ { heading: "Israel's Empty Vine" }, { heading: "Sow for Yourselves Righteousness" } ] },
    { num: 11, title: "Out of Egypt I Called My Son · How Can I Give You Up, Ephraim?",
      sections: [ { heading: "Out of Egypt I Called My Son" }, { heading: "How Can I Give You Up, Ephraim?" } ] },
    { num: 12, title: "Judgment on Ephraim and Judah",
      sections: [ { heading: "Judgment on Ephraim and Judah" } ] },
    { num: 13,
      // RESTORED — Hos 13:4 "I am the LORD your God ever since the land of Egypt"
      title: "YAHUWAH's Anger Against Israel · I Will Ransom Them from Sheol",
      sections: [ { heading: "YAHUWAH's Anger Against Israel" }, { heading: "I Will Ransom Them from Sheol" } ] },
    { num: 14,
      // RESTORED — Hos 14:1 "O Israel, return to the LORD your God"
      title: "Return to YAHUWAH · I Will Heal Their Backsliding",
      sections: [ { heading: "Return to YAHUWAH" }, { heading: "I Will Heal Their Backsliding" } ] }
  ]
};

// =========================================================================
// JOEL
// =========================================================================
BOOKS_RESTORED.joel = {
  chapters: [
    { num: 1, title: "The Locust Plague · A Call to Lamentation",
      sections: [ { heading: "The Locust Plague" }, { heading: "A Call to Lamentation" } ] },
    { num: 2,
      // RESTORED — Joel 2:1 "the day of the LORD is coming"; 2:18 "the LORD will be zealous"
      title: "The Day of YAHUWAH · Rend Your Heart, Not Your Garments · I Will Pour Out My Spirit",
      sections: [ { heading: "The Day of YAHUWAH" }, { heading: "Rend Your Heart, Not Your Garments" }, { heading: "YAHUWAH's Answer" }, { heading: "I Will Pour Out My Spirit" } ] },
    { num: 3,
      // RESTORED — Joel 3:16-18 "the LORD will be a shelter for His people"
      title: "The Nations Judged in the Valley of Jehoshaphat · Blessings for YAHUWAH's People",
      sections: [ { heading: "The Nations Judged in the Valley of Jehoshaphat" }, { heading: "Blessings for YAHUWAH's People" } ] }
  ]
};

// =========================================================================
// AMOS
// =========================================================================
BOOKS_RESTORED.amos = {
  chapters: [
    { num: 1, title: "Judgment on the Nations",
      sections: [ { heading: "Introduction" }, { heading: "Against Damascus" }, { heading: "Against Philistia" }, { heading: "Against Tyre" }, { heading: "Against Edom" }, { heading: "Against Ammon" } ] },
    { num: 2, title: "Judgment on Moab, Judah, and Israel",
      sections: [ { heading: "Against Moab" }, { heading: "Against Judah" }, { heading: "Against Israel" } ] },
    { num: 3, title: "Israel's Privilege and Punishment",
      sections: [ { heading: "Israel's Privilege and Punishment" } ] },
    { num: 4, title: "Israel Has Not Returned to Me · Prepare to Meet Your God",
      sections: [ { heading: "Cows of Bashan" }, { heading: "Israel Has Not Returned to Me" }, { heading: "Prepare to Meet Your God" } ] },
    { num: 5,
      // RESTORED — Amos 5:4 "Thus says the LORD … Seek Me and live"
      title: "Seek YAHUWAH and Live · Let Justice Roll Down Like Waters",
      sections: [ { heading: "A Lament for Israel" }, { heading: "Seek YAHUWAH and Live" }, { heading: "Let Justice Roll Down Like Waters" } ] },
    { num: 6, title: "Woe to Those Who Are at Ease in Zion",
      sections: [ { heading: "Woe to Those Who Are at Ease in Zion" } ] },
    { num: 7, title: "Visions of Locusts, Fire, and the Plumb Line · Amos and Amaziah",
      sections: [ { heading: "The Vision of Locusts" }, { heading: "The Vision of Fire" }, { heading: "The Vision of the Plumb Line" }, { heading: "Amos and Amaziah" } ] },
    { num: 8, title: "The Vision of the Basket of Summer Fruit · A Famine of Hearing the Word",
      sections: [ { heading: "The Vision of the Basket of Summer Fruit" }, { heading: "A Famine of Hearing the Word" } ] },
    { num: 9,
      // RESTORED — Amos 9:1 "I saw the LORD standing by the altar"
      title: "The Vision of YAHUWAH at the Altar · Israel Will Be Restored",
      sections: [ { heading: "The Vision of YAHUWAH at the Altar" }, { heading: "Israel Will Be Restored" } ] }
  ]
};

// =========================================================================
// OBADIAH
// =========================================================================
BOOKS_RESTORED.obadiah = {
  chapters: [
    { num: 1,
      // RESTORED — Obad 1:15 "the day of the LORD upon all the nations is near"
      title: "Edom Will Be Destroyed · The Day of YAHUWAH for All Nations",
      sections: [ { heading: "Edom Will Be Destroyed" }, { heading: "The Sins of Edom Against Jacob" }, { heading: "The Day of YAHUWAH for All Nations" } ] }
  ]
};

// =========================================================================
// JONAH
// =========================================================================
BOOKS_RESTORED.jonah = {
  chapters: [
    { num: 1,
      // RESTORED — Jonah 1:3 "Jonah arose to flee to Tarshish from the presence of the LORD"
      title: "Jonah Flees from YAHUWAH · The Storm · Jonah Thrown into the Sea",
      sections: [ { heading: "Jonah Flees from YAHUWAH" }, { heading: "The Storm" }, { heading: "Jonah Thrown into the Sea" } ] },
    { num: 2,
      // RESTORED — Jonah 2:9 "Salvation is of the LORD"
      title: "Jonah's Prayer from the Fish · Salvation Is of YAHUWAH",
      sections: [ { heading: "Jonah's Prayer from the Fish" }, { heading: "Vomited onto Dry Land" } ] },
    { num: 3, title: "Jonah Preaches to Nineveh · Nineveh Repents",
      sections: [ { heading: "Jonah Preaches to Nineveh" }, { heading: "Nineveh Repents" } ] },
    { num: 4,
      // RESTORED — Jonah 4:10-11 (the LORD's final word of mercy)
      title: "Jonah's Anger · The Plant and the Worm · YAHUWAH's Compassion on Nineveh",
      sections: [ { heading: "Jonah's Anger" }, { heading: "The Plant and the Worm" }, { heading: "YAHUWAH's Compassion on Nineveh" } ] }
  ]
};

// =========================================================================
// MICAH
// =========================================================================
BOOKS_RESTORED.micah = {
  chapters: [
    { num: 1, title: "Judgment Against Samaria and Jerusalem",
      sections: [ { heading: "Judgment Against Samaria and Jerusalem" } ] },
    { num: 2, title: "Woe to Those Who Plot Evil",
      sections: [ { heading: "Woe to Those Who Plot Evil" } ] },
    { num: 3, title: "Against the Wicked Rulers and False Prophets",
      sections: [ { heading: "Against the Wicked Rulers" }, { heading: "Against the False Prophets" }, { heading: "Zion Plowed Like a Field" } ] },
    { num: 4,
      // RESTORED — Mic 4:1 "the mountain of the LORD's house"
      title: "The Mountain of YAHUWAH's House · Swords into Plowshares",
      sections: [ { heading: "The Mountain of YAHUWAH's House" }, { heading: "The Daughter of Zion Restored" } ] },
    { num: 5, title: "Out of Bethlehem Shall Come a Ruler · The Remnant of Jacob",
      sections: [ { heading: "Out of Bethlehem Shall Come a Ruler" }, { heading: "The Remnant of Jacob" } ] },
    { num: 6,
      // RESTORED — Mic 6:2 "the LORD has a complaint against His people"; 6:8 "what does the LORD require of you?"
      title: "YAHUWAH's Case Against Israel · What Does YAHUWAH Require of You?",
      sections: [ { heading: "YAHUWAH's Case Against Israel" }, { heading: "What Does YAHUWAH Require of You?" }, { heading: "Israel's Sins Punished" } ] },
    { num: 7, title: "The Misery of Israel · Who Is a God Like You?",
      sections: [ { heading: "The Misery of Israel" }, { heading: "Israel Will Rise Again" }, { heading: "Who Is a God Like You?" } ] }
  ]
};

// =========================================================================
// NAHUM
// =========================================================================
BOOKS_RESTORED.nahum = {
  chapters: [
    { num: 1,
      // RESTORED — Nah 1:2 "the LORD avenges and is furious"
      title: "YAHUWAH's Wrath on His Enemies · Good News for Judah",
      sections: [ { heading: "YAHUWAH's Wrath on His Enemies" }, { heading: "Good News for Judah" } ] },
    { num: 2, title: "The Fall of Nineveh",
      sections: [ { heading: "The Fall of Nineveh" } ] },
    { num: 3, title: "Woe to the Bloody City",
      sections: [ { heading: "Woe to the Bloody City" } ] }
  ]
};

// =========================================================================
// HABAKKUK
// =========================================================================
BOOKS_RESTORED.habakkuk = {
  chapters: [
    { num: 1,
      // RESTORED — Hab 1:6 "I am raising up the Chaldeans" (YHWH speaking)
      title: "Habakkuk's First Complaint · YAHUWAH Raises Up the Chaldeans · Habakkuk's Second Complaint",
      sections: [ { heading: "Habakkuk's First Complaint" }, { heading: "YAHUWAH Raises Up the Chaldeans" }, { heading: "Habakkuk's Second Complaint" } ] },
    { num: 2, title: "The Just Shall Live by His Faith · Five Woes on the Chaldeans",
      sections: [ { heading: "The Just Shall Live by His Faith" }, { heading: "Five Woes on the Chaldeans" } ] },
    { num: 3,
      // RESTORED — Hab 3:18 "Yet I will rejoice in the LORD"
      title: "Habakkuk's Prayer · Yet I Will Rejoice in YAHUWAH",
      sections: [ { heading: "Habakkuk's Prayer" }, { heading: "Yet I Will Rejoice in YAHUWAH" } ] }
  ]
};

// =========================================================================
// ZEPHANIAH
// =========================================================================
BOOKS_RESTORED.zephaniah = {
  chapters: [
    { num: 1,
      // RESTORED — Zeph 1:7,14 "the day of the LORD is at hand"
      title: "The Coming Day of YAHUWAH",
      sections: [ { heading: "The Coming Day of YAHUWAH" } ] },
    { num: 2, title: "A Call to Repentance · Judgment on the Nations",
      sections: [ { heading: "A Call to Repentance" }, { heading: "Judgment on the Nations" } ] },
    { num: 3,
      // RESTORED — Zeph 3:17 "the LORD your God in your midst … He will rejoice over you with singing"
      title: "Woe to Jerusalem · The Restoration of Israel · YAHUWAH Rejoices Over You with Singing",
      sections: [ { heading: "Woe to Jerusalem" }, { heading: "The Restoration of Israel" }, { heading: "YAHUWAH Rejoices Over You with Singing" } ] }
  ]
};

// =========================================================================
// HAGGAI
// =========================================================================
// No Lord/LORD in chrome.
BOOKS_RESTORED.haggai = {
  chapters: [
    { num: 1, title: "Consider Your Ways · The People Begin to Build",
      sections: [ { heading: "Consider Your Ways" }, { heading: "The People Begin to Build" } ] },
    { num: 2, title: "The Glory of the Latter Temple · The Promise to Zerubbabel",
      sections: [ { heading: "The Glory of the Latter Temple" }, { heading: "Blessings on a Defiled People" }, { heading: "The Promise to Zerubbabel" } ] }
  ]
};

// =========================================================================
// ZECHARIAH
// =========================================================================
BOOKS_RESTORED.zechariah = {
  chapters: [
    { num: 1, title: "Return to Me · The Vision of the Horsemen",
      sections: [ { heading: "Return to Me" }, { heading: "The Vision of the Horsemen" }, { heading: "The Vision of the Four Horns" } ] },
    { num: 2, title: "The Vision of the Measuring Line",
      sections: [ { heading: "The Vision of the Measuring Line" } ] },
    { num: 3, title: "The Vision of Joshua the High Priest · The Branch",
      sections: [ { heading: "The Vision of Joshua the High Priest" }, { heading: "The Branch" } ] },
    { num: 4, title: "The Vision of the Golden Lampstand · Not by Might, Nor by Power",
      sections: [ { heading: "The Vision of the Golden Lampstand" }, { heading: "Not by Might, Nor by Power" } ] },
    { num: 5, title: "The Vision of the Flying Scroll · The Vision of the Woman in the Basket",
      sections: [ { heading: "The Vision of the Flying Scroll" }, { heading: "The Vision of the Woman in the Basket" } ] },
    { num: 6, title: "The Vision of the Four Chariots · The Crowning of Joshua",
      sections: [ { heading: "The Vision of the Four Chariots" }, { heading: "The Crowning of Joshua" } ] },
    { num: 7, title: "The Question About Fasting · Disobedience Brought Captivity",
      sections: [ { heading: "The Question About Fasting" }, { heading: "Disobedience Brought Captivity" } ] },
    { num: 8,
      // RESTORED — Zech 8:22 "many peoples … shall come to seek the LORD of hosts in Jerusalem"
      title: "The Promised Restoration of Jerusalem",
      sections: [ { heading: "Jerusalem Restored" }, { heading: "Be Strong and Build" }, { heading: "The Nations Will Seek YAHUWAH" } ] },
    { num: 9, title: "Judgment on the Nations · Behold, Your King Is Coming to You",
      sections: [ { heading: "Judgment on the Nations" }, { heading: "Behold, Your King Is Coming to You" } ] },
    { num: 10,
      // RESTORED — Zech 10:6 "I will strengthen the house of Judah … I am the LORD their God"
      title: "YAHUWAH Will Restore His People",
      sections: [ { heading: "YAHUWAH Will Restore His People" } ] },
    { num: 11, title: "The Foolish Shepherd · Thirty Pieces of Silver",
      sections: [ { heading: "The Doomed Flock" }, { heading: "The Two Staffs" }, { heading: "The Foolish Shepherd" } ] },
    { num: 12, title: "Jerusalem a Cup of Trembling · They Shall Look on Me Whom They Pierced",
      sections: [ { heading: "Jerusalem a Cup of Trembling" }, { heading: "They Shall Look on Me Whom They Pierced" } ] },
    { num: 13, title: "A Fountain Opened for Sin · The Shepherd Struck",
      sections: [ { heading: "A Fountain Opened for Sin" }, { heading: "The Shepherd Struck" } ] },
    { num: 14,
      // RESTORED — Zech 14:1,9,20 "the day of the LORD … the LORD shall be King over all the earth … HOLINESS TO THE LORD"
      title: "The Day of YAHUWAH Comes · YAHUWAH Will Be King over All the Earth",
      sections: [ { heading: "The Day of YAHUWAH Comes" }, { heading: "YAHUWAH Will Be King over All the Earth" }, { heading: "Holiness to YAHUWAH" } ] }
  ]
};

// =========================================================================
// MALACHI
// =========================================================================
BOOKS_RESTORED.malachi = {
  chapters: [
    { num: 1,
      // RESTORED — Mal 1:2 "'I have loved you,' says the LORD"
      title: "YAHUWAH's Love for Israel · Polluted Offerings",
      sections: [ { heading: "YAHUWAH's Love for Israel" }, { heading: "Polluted Offerings" } ] },
    { num: 2,
      // RESTORED — Mal 2:16 "For the LORD God of Israel says that He hates divorce"
      title: "Rebuke of the Priests · YAHUWAH Hates Divorce",
      sections: [ { heading: "Rebuke of the Priests" }, { heading: "YAHUWAH Hates Divorce" }, { heading: "Wearying YAHUWAH with Words" } ] },
    { num: 3, title: "The Messenger of the Covenant · Will a Man Rob God? · The Book of Remembrance",
      sections: [ { heading: "The Messenger of the Covenant" }, { heading: "Will a Man Rob God?" }, { heading: "The Book of Remembrance" } ] },
    { num: 4,
      // RESTORED — Mal 4:5 "the great and dreadful day of the LORD"
      title: "The Day of YAHUWAH · The Coming of Elijah",
      sections: [ { heading: "The Day of YAHUWAH" }, { heading: "The Coming of Elijah" } ] }
  ]
};

// =========================================================================
// NEW TESTAMENT
// =========================================================================
// Rule refinements for NT chrome:
//   "Jesus"              → YahuShua                (the Name alone)
//   "Jesus Christ"       → YahuShua HaMashiach     (Name + "the Anointed One")
//   "Christ Jesus"       → HaMashiach YahuShua
//   "Christ" (the title, with or without "the") → HaMashiach
//   "Messiah" / "the Messiah" → HaMashiach
//   "Lord Jesus"         → Lord YahuShua           ("Lord" is kyrios = title)
//   "Lord" alone         → stays "Lord"            (title, not Name)
//   "LORD" (all caps OT quote, rare in NT) → YAHUWAH
//   Titles like "Son of Man", "Lamb of God", "Lord of the Sabbath",
//   "Good Shepherd" stay as written — they are titles/roles, not Names.

// =========================================================================
// MARK
// =========================================================================
BOOKS_RESTORED.mark = {
  chapters: [
    { num: 1,
      title: "The Baptism of YahuShua · The First Disciples Called · The Demon at Capernaum",
      sections: [ { heading: "John the Baptist Prepares the Way" }, { heading: "The Baptism of YahuShua" }, { heading: "The Temptation in the Wilderness" }, { heading: "Ministry Begins in Galilee" }, { heading: "The First Disciples Called" }, { heading: "The Demon at Capernaum" }, { heading: "Healings at Evening" }, { heading: "Preaching Throughout Galilee" }, { heading: "A Leper Cleansed" } ] },
    { num: 2,
      // "Lord of the Sabbath" stays — "Lord" here is kyrios as title/authority, not a Name.
      title: "The Paralytic Lowered Through the Roof · Levi Called · Lord of the Sabbath",
      sections: [ { heading: "The Paralytic Lowered Through the Roof" }, { heading: "Levi Called" }, { heading: "New Wine and New Wineskins" }, { heading: "Lord of the Sabbath" } ] },
    { num: 3,
      title: "The Twelve Appointed · The Unforgivable Sin · The True Family of YahuShua",
      sections: [ { heading: "The Withered Hand Healed" }, { heading: "Crowds by the Sea" }, { heading: "The Twelve Appointed" }, { heading: "A House Divided" }, { heading: "The Unforgivable Sin" }, { heading: "The True Family of YahuShua" } ] },
    { num: 4,
      title: "The Parable of the Sower · The Mustard Seed · The Storm Calmed",
      sections: [ { heading: "The Parable of the Sower" }, { heading: "Why YahuShua Speaks in Parables" }, { heading: "The Lamp Under a Basket" }, { heading: "The Seed Growing Secretly" }, { heading: "The Mustard Seed" }, { heading: "Speaking in Parables" }, { heading: "The Storm Calmed" } ] },
    { num: 5, title: "The Gerasene Demoniac · Jairus's Daughter and the Bleeding Woman",
      sections: [ { heading: "The Gerasene Demoniac" }, { heading: "Jairus's Daughter and the Bleeding Woman" } ] },
    { num: 6,
      title: "John the Baptist Beheaded · Feeding the Five Thousand · YahuShua Walks on Water",
      sections: [ { heading: "Rejected at Nazareth" }, { heading: "The Twelve Sent Out" }, { heading: "John the Baptist Beheaded" }, { heading: "Feeding the Five Thousand" }, { heading: "YahuShua Walks on Water" }, { heading: "Healings at Gennesaret" } ] },
    { num: 7, title: "The Tradition of the Elders · The Syrophoenician Woman · The Deaf-Mute Healed",
      sections: [ { heading: "The Tradition of the Elders" }, { heading: "What Defiles a Man" }, { heading: "The Syrophoenician Woman" }, { heading: "The Deaf-Mute Healed" } ] },
    { num: 8,
      title: "Feeding the Four Thousand · Peter's Confession of HaMashiach · Take Up Your Cross",
      sections: [ { heading: "Feeding the Four Thousand" }, { heading: "The Pharisees Seek a Sign" }, { heading: "The Leaven of the Pharisees and Herod" }, { heading: "The Blind Man of Bethsaida" }, { heading: "Peter's Confession of HaMashiach" }, { heading: "Get Behind Me, Satan" }, { heading: "Take Up Your Cross" } ] },
    { num: 9, title: "The Transfiguration · The Demon-Possessed Boy Healed · Causing Little Ones to Stumble",
      sections: [ { heading: "The Transfiguration" }, { heading: "The Demon-Possessed Boy Healed" }, { heading: "The Second Passion Prediction" }, { heading: "The Greatest in the Kingdom" }, { heading: "Whoever Is Not Against Us" }, { heading: "Causing Little Ones to Stumble" } ] },
    { num: 10, title: "Divorce and Marriage · The Rich Young Ruler · Blind Bartimaeus Healed",
      sections: [ { heading: "Divorce and Marriage" }, { heading: "Let the Children Come" }, { heading: "The Rich Young Ruler" }, { heading: "The Third Passion Prediction" }, { heading: "The Request of James and John" }, { heading: "Blind Bartimaeus Healed" } ] },
    { num: 11,
      title: "The Triumphal Entry · The Temple Cleansed · The Fig Tree Withered",
      sections: [ { heading: "The Triumphal Entry" }, { heading: "The Fig Tree Cursed" }, { heading: "The Temple Cleansed" }, { heading: "The Fig Tree Withered" }, { heading: "YahuShua's Authority Questioned" } ] },
    { num: 12,
      title: "The Wicked Vinedressers · The Greatest Commandment · The Widow's Mite",
      sections: [ { heading: "The Wicked Vinedressers" }, { heading: "Render to Caesar" }, { heading: "The Sadducees and the Resurrection" }, { heading: "The Greatest Commandment" }, { heading: "Whose Son Is HaMashiach?" }, { heading: "Beware of the Scribes" }, { heading: "The Widow's Mite" } ] },
    { num: 13, title: "The Great Tribulation · The Coming of the Son of Man · No One Knows the Hour",
      sections: [ { heading: "The Temple Destruction Foretold" }, { heading: "The Beginning of Sorrows" }, { heading: "The Great Tribulation" }, { heading: "The Coming of the Son of Man" }, { heading: "The Lesson of the Fig Tree" }, { heading: "No One Knows the Hour" } ] },
    { num: 14,
      title: "The Passover Bread and Wine · Gethsemane · Betrayed and Arrested",
      sections: [ { heading: "The Plot to Kill YahuShua" }, { heading: "The Anointing at Bethany" }, { heading: "Judas Agrees to Betray" }, { heading: "The Passover Prepared" }, { heading: "The Passover Bread and Wine" }, { heading: "Peter's Denial Foretold" }, { heading: "Gethsemane" }, { heading: "Betrayed and Arrested" }, { heading: "Before the Sanhedrin" }, { heading: "Peter Denies YahuShua" } ] },
    { num: 15,
      title: "YahuShua Before Pilate · The Crucifixion · The Death of YahuShua",
      sections: [ { heading: "YahuShua Before Pilate" }, { heading: "Mocked by the Soldiers" }, { heading: "The Crucifixion" }, { heading: "The Death of YahuShua" }, { heading: "The Burial" } ] },
    { num: 16, title: "The Empty Tomb · The Great Commission · The Ascension",
      sections: [ { heading: "The Empty Tomb" }, { heading: "Appears to Mary Magdalene" }, { heading: "Appears to Two Disciples" }, { heading: "The Great Commission" }, { heading: "The Ascension" } ] }
  ]
};

// =========================================================================
// LUKE
// =========================================================================
BOOKS_RESTORED.luke = {
  chapters: [
    { num: 1, title: "The Annunciation to Mary · Mary's Song · The Birth of John the Baptist",
      sections: [ { heading: "Prologue to Theophilus" }, { heading: "The Birth of John the Baptist Foretold" }, { heading: "The Annunciation to Mary" }, { heading: "Mary Visits Elizabeth" }, { heading: "Mary's Song" }, { heading: "The Birth of John the Baptist" }, { heading: "Zacharias's Prophecy" } ] },
    { num: 2,
      title: "The Birth of YahuShua · The Shepherds and the Angels · YahuShua in the Temple at Twelve",
      sections: [ { heading: "The Birth of YahuShua" }, { heading: "The Shepherds and the Angels" }, { heading: "Presentation in the Temple" }, { heading: "Simeon's Prophecy" }, { heading: "Anna the Prophetess" }, { heading: "Return to Nazareth" }, { heading: "YahuShua in the Temple at Twelve" } ] },
    { num: 3,
      title: "John the Baptist Prepares the Way · The Baptism of YahuShua · The Genealogy of YahuShua",
      sections: [ { heading: "John the Baptist Prepares the Way" }, { heading: "The Baptism of YahuShua" }, { heading: "The Genealogy of YahuShua" } ] },
    { num: 4, title: "The Temptation in the Wilderness · Rejected at Nazareth · The Demon at Capernaum",
      sections: [ { heading: "The Temptation in the Wilderness" }, { heading: "Rejected at Nazareth" }, { heading: "The Demon at Capernaum" }, { heading: "Many Healed at Evening" }, { heading: "Preaching in the Synagogues" } ] },
    { num: 5, title: "The Miraculous Catch of Fish · The Paralytic Lowered Through the Roof · Levi Called",
      sections: [ { heading: "The Miraculous Catch of Fish" }, { heading: "A Leper Cleansed" }, { heading: "The Paralytic Lowered Through the Roof" }, { heading: "Levi Called" }, { heading: "New Wine and New Wineskins" } ] },
    { num: 6,
      // "Lord of the Sabbath" stays — title.
      title: "The Twelve Chosen · The Beatitudes and Woes · Love Your Enemies",
      sections: [ { heading: "Lord of the Sabbath" }, { heading: "The Withered Hand Healed" }, { heading: "The Twelve Chosen" }, { heading: "Healings by the Sea" }, { heading: "The Beatitudes and Woes" }, { heading: "Love Your Enemies" }, { heading: "Do Not Judge" }, { heading: "A Tree Known by Its Fruit" }, { heading: "The Wise and Foolish Builders" } ] },
    { num: 7,
      title: "The Centurion's Faith · The Widow's Son at Nain Raised · The Sinful Woman Anoints YahuShua's Feet",
      sections: [ { heading: "The Centurion's Faith" }, { heading: "The Widow's Son at Nain Raised" }, { heading: "John the Baptist's Question" }, { heading: "The Sinful Woman Anoints YahuShua's Feet" } ] },
    { num: 8, title: "The Storm Calmed · The Gerasene Demoniac · Jairus's Daughter and the Bleeding Woman",
      sections: [ { heading: "The Women Who Followed" }, { heading: "The Parable of the Sower" }, { heading: "The Lamp Under a Basket" }, { heading: "The True Family of YahuShua" }, { heading: "The Storm Calmed" }, { heading: "The Gerasene Demoniac" }, { heading: "Jairus's Daughter and the Bleeding Woman" } ] },
    { num: 9,
      title: "Feeding the Five Thousand · Peter's Confession of HaMashiach · The Transfiguration",
      sections: [ { heading: "The Twelve Sent Out" }, { heading: "Herod's Perplexity" }, { heading: "Feeding the Five Thousand" }, { heading: "Peter's Confession of HaMashiach" }, { heading: "Take Up Your Cross" }, { heading: "The Transfiguration" }, { heading: "The Demon-Possessed Boy Healed" }, { heading: "The Second Passion Prediction" }, { heading: "The Greatest in the Kingdom" }, { heading: "Whoever Is Not Against Us" }, { heading: "Samaritans Reject YahuShua" }, { heading: "The Cost of Following" } ] },
    { num: 10, title: "The Seventy Sent Out · The Good Samaritan · Mary and Martha",
      sections: [ { heading: "The Seventy Sent Out" }, { heading: "The Return of the Seventy" }, { heading: "The Good Samaritan" }, { heading: "Mary and Martha" } ] },
    { num: 11, title: "How to Pray · The Sign of Jonah · Woes on the Pharisees and Lawyers",
      sections: [ { heading: "How to Pray" }, { heading: "A House Divided" }, { heading: "The Return of an Unclean Spirit" }, { heading: "True Blessedness" }, { heading: "The Sign of Jonah" }, { heading: "The Lamp of the Body" }, { heading: "Woes on the Pharisees and Lawyers" } ] },
    { num: 12, title: "The Rich Fool · Do Not Worry · Not Peace but Division",
      sections: [ { heading: "Beware of the Leaven of the Pharisees" }, { heading: "The Rich Fool" }, { heading: "Do Not Worry" }, { heading: "The Faithful and Wise Servant" }, { heading: "Not Peace but Division" }, { heading: "Discerning the Times" } ] },
    { num: 13, title: "The Barren Fig Tree · The Narrow Door · Lament Over Jerusalem",
      sections: [ { heading: "Repent or Perish" }, { heading: "The Barren Fig Tree" }, { heading: "The Crippled Woman Healed" }, { heading: "The Mustard Seed and the Leaven" }, { heading: "The Narrow Door" }, { heading: "Lament Over Jerusalem" } ] },
    { num: 14, title: "The Best Seats at the Feast · The Great Supper · The Cost of Discipleship",
      sections: [ { heading: "The Man with Dropsy Healed" }, { heading: "The Best Seats at the Feast" }, { heading: "The Great Supper" }, { heading: "The Cost of Discipleship" } ] },
    { num: 15, title: "The Lost Sheep · The Lost Coin · The Prodigal Son",
      sections: [ { heading: "The Lost Sheep" }, { heading: "The Lost Coin" }, { heading: "The Prodigal Son" } ] },
    { num: 16, title: "The Unjust Steward · The Rich Man and Lazarus",
      sections: [ { heading: "The Unjust Steward" }, { heading: "The Law and the Kingdom" }, { heading: "The Rich Man and Lazarus" } ] },
    { num: 17, title: "Faith and Forgiveness · Ten Lepers Cleansed · The Coming of the Kingdom",
      sections: [ { heading: "Faith and Forgiveness" }, { heading: "Ten Lepers Cleansed" }, { heading: "The Coming of the Kingdom" } ] },
    { num: 18, title: "The Persistent Widow · The Pharisee and the Tax Collector · The Rich Young Ruler",
      sections: [ { heading: "The Persistent Widow" }, { heading: "The Pharisee and the Tax Collector" }, { heading: "Let the Children Come" }, { heading: "The Rich Young Ruler" }, { heading: "The Third Passion Prediction" }, { heading: "The Blind Man at Jericho Healed" } ] },
    { num: 19,
      title: "Zacchaeus · The Triumphal Entry · YahuShua Weeps Over Jerusalem",
      sections: [ { heading: "Zacchaeus" }, { heading: "The Parable of the Minas" }, { heading: "The Triumphal Entry" }, { heading: "YahuShua Weeps Over Jerusalem" }, { heading: "The Temple Cleansed" } ] },
    { num: 20,
      title: "The Wicked Vinedressers · Render to Caesar · The Sadducees and the Resurrection",
      sections: [ { heading: "YahuShua's Authority Questioned" }, { heading: "The Wicked Vinedressers" }, { heading: "Render to Caesar" }, { heading: "The Sadducees and the Resurrection" }, { heading: "Whose Son Is HaMashiach?" }, { heading: "Beware of the Scribes" } ] },
    { num: 21, title: "The Widow's Mite · Jerusalem Surrounded by Armies · The Coming of the Son of Man",
      sections: [ { heading: "The Widow's Mite" }, { heading: "The Temple Destruction Foretold" }, { heading: "The Beginning of Sorrows" }, { heading: "Jerusalem Surrounded by Armies" }, { heading: "The Coming of the Son of Man" }, { heading: "The Lesson of the Fig Tree" }, { heading: "Watch and Pray" } ] },
    { num: 22,
      title: "The Passover Bread and Wine · Prayer on the Mount of Olives · Betrayed and Arrested",
      sections: [ { heading: "Judas Agrees to Betray" }, { heading: "The Passover Prepared" }, { heading: "The Passover Bread and Wine" }, { heading: "The Greatest Among You" }, { heading: "Peter's Denial Foretold" }, { heading: "Buy a Sword" }, { heading: "Prayer on the Mount of Olives" }, { heading: "Betrayed and Arrested" }, { heading: "Peter Denies YahuShua" }, { heading: "Mocked and Beaten" }, { heading: "Before the Council" } ] },
    { num: 23,
      title: "The Crucifixion · The Two Thieves · The Death of YahuShua",
      sections: [ { heading: "YahuShua Before Pilate" }, { heading: "YahuShua Before Herod" }, { heading: "Pilate Delivers YahuShua to Be Crucified" }, { heading: "The Way to the Cross" }, { heading: "The Crucifixion" }, { heading: "The Two Thieves" }, { heading: "The Death of YahuShua" }, { heading: "The Burial" } ] },
    { num: 24,
      title: "The Empty Tomb · The Road to Emmaus · The Ascension",
      sections: [ { heading: "The Empty Tomb" }, { heading: "The Road to Emmaus" }, { heading: "YahuShua Appears to the Disciples" }, { heading: "The Ascension" } ] }
  ]
};

// =========================================================================
// JOHN
// =========================================================================
BOOKS_RESTORED.john = {
  chapters: [
    { num: 1, title: "The Word Became Flesh · Behold the Lamb of God · The First Disciples",
      sections: [ { heading: "The Word Became Flesh" }, { heading: "John's Testimony" }, { heading: "Behold the Lamb of God" }, { heading: "The First Disciples" }, { heading: "Philip and Nathanael Called" } ] },
    { num: 2, title: "The Wedding at Cana · The Temple Cleansed",
      sections: [ { heading: "The Wedding at Cana" }, { heading: "The Temple Cleansed" } ] },
    { num: 3, title: "Nicodemus and the New Birth · John the Baptist's Final Witness",
      sections: [ { heading: "Nicodemus and the New Birth" }, { heading: "John the Baptist's Final Witness" } ] },
    { num: 4, title: "The Samaritan Woman at the Well · The Nobleman's Son Healed",
      sections: [ { heading: "The Samaritan Woman at the Well" }, { heading: "The Nobleman's Son Healed" } ] },
    { num: 5, title: "The Healing at Bethesda · The Father and the Son",
      sections: [ { heading: "The Healing at Bethesda" }, { heading: "The Father and the Son" }, { heading: "Witnesses to YahuShua" } ] },
    { num: 6, title: "Feeding the Five Thousand · The Bread of Life · Many Disciples Turn Back",
      sections: [ { heading: "Feeding the Five Thousand" }, { heading: "YahuShua Walks on Water" }, { heading: "The Bread of Life" }, { heading: "Many Disciples Turn Back" } ] },
    { num: 7, title: "At the Feast of Tabernacles · Rivers of Living Water · Division Among the People",
      sections: [ { heading: "At the Feast of Tabernacles" }, { heading: "Teaching at the Feast" }, { heading: "Rivers of Living Water" }, { heading: "Division Among the People" } ] },
    { num: 8, title: "The Woman Caught in Adultery · The Light of the World · Before Abraham Was, I AM",
      sections: [ { heading: "The Woman Caught in Adultery" }, { heading: "The Light of the World" }, { heading: "Where I Am Going" }, { heading: "The Truth Shall Make You Free" }, { heading: "Before Abraham Was, I AM" } ] },
    { num: 9, title: "The Man Born Blind Healed · Spiritual Blindness",
      sections: [ { heading: "The Man Born Blind Healed" }, { heading: "The Pharisees Question the Healed Man" }, { heading: "Spiritual Blindness" } ] },
    { num: 10, title: "The Good Shepherd · I and the Father Are One",
      sections: [ { heading: "The Good Shepherd" }, { heading: "I and the Father Are One" } ] },
    { num: 11,
      title: "The Raising of Lazarus · The Plot to Kill YahuShua",
      sections: [ { heading: "The Raising of Lazarus" }, { heading: "The Plot to Kill YahuShua" } ] },
    { num: 12,
      title: "The Anointing at Bethany · The Triumphal Entry · The Hour Has Come",
      sections: [ { heading: "The Anointing at Bethany" }, { heading: "The Triumphal Entry" }, { heading: "The Greeks Seek YahuShua" }, { heading: "The Hour Has Come" }, { heading: "The Unbelief of the People" } ] },
    { num: 13, title: "Washing the Disciples' Feet · The Betrayer Revealed · A New Commandment",
      sections: [ { heading: "Washing the Disciples' Feet" }, { heading: "The Betrayer Revealed" }, { heading: "A New Commandment" } ] },
    { num: 14, title: "I Am the Way, the Truth, and the Life · The Promise of the Helper · My Peace I Leave with You",
      sections: [ { heading: "My Father's House" }, { heading: "I Am the Way, the Truth, and the Life" }, { heading: "Show Us the Father" }, { heading: "The Promise of the Helper" }, { heading: "My Peace I Leave with You" } ] },
    { num: 15, title: "The True Vine · Abide in My Love · The World's Hatred",
      sections: [ { heading: "The True Vine" }, { heading: "Abide in My Love" }, { heading: "The World's Hatred" }, { heading: "The Helper Will Bear Witness" } ] },
    { num: 16, title: "The Work of the Helper · Sorrow Turned to Joy · I Have Overcome the World",
      sections: [ { heading: "Persecution Foretold" }, { heading: "The Work of the Helper" }, { heading: "Sorrow Turned to Joy" }, { heading: "I Have Overcome the World" } ] },
    { num: 17,
      title: "YahuShua Prays for Himself · YahuShua Prays for His Disciples · YahuShua Prays for All Believers",
      sections: [ { heading: "YahuShua Prays for Himself" }, { heading: "YahuShua Prays for His Disciples" }, { heading: "YahuShua Prays for All Believers" } ] },
    { num: 18,
      title: "Betrayed and Arrested in the Garden · Peter Denies YahuShua · YahuShua Before Pilate",
      sections: [ { heading: "Betrayed and Arrested in the Garden" }, { heading: "Before Annas" }, { heading: "Peter's First Denial" }, { heading: "The High Priest Questions YahuShua" }, { heading: "Peter Denies YahuShua" }, { heading: "YahuShua Before Pilate" } ] },
    { num: 19,
      title: "The Crucifixion · It Is Finished · YahuShua's Side Pierced",
      sections: [ { heading: "Pilate Delivers YahuShua to Be Crucified" }, { heading: "The Crucifixion" }, { heading: "Mary at the Cross" }, { heading: "It Is Finished" }, { heading: "YahuShua's Side Pierced" }, { heading: "The Burial" } ] },
    { num: 20,
      title: "The Empty Tomb · Mary Magdalene Meets the Risen YahuShua · Doubting Thomas",
      sections: [ { heading: "The Empty Tomb" }, { heading: "Mary Magdalene Meets the Risen YahuShua" }, { heading: "YahuShua Appears to the Disciples" }, { heading: "Doubting Thomas" }, { heading: "The Purpose of This Gospel" } ] },
    { num: 21, title: "The Miraculous Catch of Fish · The Restoration of Peter · The Beloved Disciple",
      sections: [ { heading: "The Miraculous Catch of Fish" }, { heading: "The Restoration of Peter" }, { heading: "The Beloved Disciple" } ] }
  ]
};

// =========================================================================
// MATTHEW (plain NKJV — the regular 66-book reading flow)
// =========================================================================
// This is `matthew-plain.js` / `BOOKS["matthew-plain"]`, NOT the VOT Study
// Bible Matthew (`matthew.js`), which has its own chrome with restored Names
// already embedded in its native data.

BOOKS_RESTORED["matthew-plain"] = {
  chapters: [
    { num: 1,
      title: "The Genealogy of YahuShua · The Birth of YahuShua",
      sections: [ { heading: "The Genealogy of YahuShua HaMashiach" }, { heading: "The Birth of YahuShua" } ] },
    { num: 2, title: "The Wise Men from the East · The Flight into Egypt · Herod Slaughters the Children",
      sections: [ { heading: "The Wise Men from the East" }, { heading: "The Flight into Egypt" }, { heading: "Herod Slaughters the Children" }, { heading: "The Return to Nazareth" } ] },
    { num: 3,
      title: "John the Baptist Prepares the Way · The Baptism of YahuShua",
      sections: [ { heading: "John the Baptist Prepares the Way" }, { heading: "The Baptism of YahuShua" } ] },
    { num: 4, title: "The Temptation in the Wilderness · The First Disciples Called",
      sections: [ { heading: "The Temptation in the Wilderness" }, { heading: "Ministry Begins in Galilee" }, { heading: "The First Disciples Called" }, { heading: "Healing Throughout Galilee" } ] },
    { num: 5, title: "The Beatitudes · Adultery in the Heart · Love Your Enemies",
      sections: [ { heading: "The Beatitudes" }, { heading: "Salt and Light" }, { heading: "YahuShua Fulfills the Law" }, { heading: "Anger and Reconciliation" }, { heading: "Adultery in the Heart" }, { heading: "Divorce" }, { heading: "Do Not Swear Oaths" }, { heading: "Do Not Resist Evil" }, { heading: "Love Your Enemies" } ] },
    { num: 6, title: "How to Pray · Treasures in Heaven · Do Not Worry",
      sections: [ { heading: "Giving in Secret" }, { heading: "How to Pray" }, { heading: "Fasting in Secret" }, { heading: "Treasures in Heaven" }, { heading: "Do Not Worry" } ] },
    { num: 7, title: "The Narrow Gate · False Prophets Known by Their Fruit · The Wise and Foolish Builders",
      sections: [ { heading: "Do Not Judge" }, { heading: "Ask, Seek, Knock" }, { heading: "The Narrow Gate" }, { heading: "False Prophets Known by Their Fruit" }, { heading: "I Never Knew You" }, { heading: "The Wise and Foolish Builders" }, { heading: "The Crowds Are Astonished" } ] },
    { num: 8, title: "The Centurion's Faith · The Storm Calmed · The Gadarene Demoniacs",
      sections: [ { heading: "A Leper Cleansed" }, { heading: "The Centurion's Faith" }, { heading: "Many Healed at Evening" }, { heading: "The Cost of Following" }, { heading: "The Storm Calmed" }, { heading: "The Gadarene Demoniacs" } ] },
    { num: 9, title: "The Paralytic Forgiven · Matthew Called · Jairus's Daughter and the Bleeding Woman",
      sections: [ { heading: "The Paralytic Forgiven" }, { heading: "Matthew Called" }, { heading: "New Wine and New Wineskins" }, { heading: "Jairus's Daughter and the Bleeding Woman" }, { heading: "Two Blind Men Healed" }, { heading: "A Mute Demoniac Healed" }, { heading: "The Harvest Is Plentiful" } ] },
    { num: 10, title: "The Twelve Sent Out · Not Peace but a Sword",
      sections: [ { heading: "The Twelve Apostles" }, { heading: "The Twelve Sent Out" }, { heading: "Sheep Among Wolves" }, { heading: "Do Not Fear Men" }, { heading: "Not Peace but a Sword" }, { heading: "Rewards for Receiving the Disciples" } ] },
    { num: 11, title: "John the Baptist's Question · Woes on the Unrepentant Cities · Come to Me, All Who Labor",
      sections: [ { heading: "John the Baptist's Question" }, { heading: "Woes on the Unrepentant Cities" }, { heading: "Come to Me, All Who Labor" } ] },
    { num: 12,
      // "Lord of the Sabbath" stays (title). "True Family of Jesus" → YahuShua.
      title: "Lord of the Sabbath · The Unforgivable Sin · The Sign of Jonah",
      sections: [ { heading: "Lord of the Sabbath" }, { heading: "The Withered Hand Healed" }, { heading: "The Chosen Servant" }, { heading: "The Unforgivable Sin" }, { heading: "A Tree Known by Its Fruit" }, { heading: "The Sign of Jonah" }, { heading: "The Return of an Unclean Spirit" }, { heading: "The True Family of YahuShua" } ] },
    { num: 13, title: "The Parable of the Sower · The Wheat and the Tares · Rejected at Nazareth",
      sections: [ { heading: "The Parable of the Sower" }, { heading: "Why YahuShua Speaks in Parables" }, { heading: "The Sower Explained" }, { heading: "The Wheat and the Tares" }, { heading: "The Mustard Seed and the Leaven" }, { heading: "The Tares Explained" }, { heading: "Hidden Treasure and the Pearl of Great Price" }, { heading: "The Dragnet" }, { heading: "Treasures New and Old" }, { heading: "Rejected at Nazareth" } ] },
    { num: 14,
      title: "John the Baptist Beheaded · Feeding the Five Thousand · YahuShua Walks on Water",
      sections: [ { heading: "John the Baptist Beheaded" }, { heading: "Feeding the Five Thousand" }, { heading: "YahuShua Walks on Water" }, { heading: "Healings at Gennesaret" } ] },
    { num: 15, title: "The Tradition of the Elders · The Canaanite Woman's Faith · Feeding the Four Thousand",
      sections: [ { heading: "The Tradition of the Elders" }, { heading: "What Defiles a Man" }, { heading: "The Canaanite Woman's Faith" }, { heading: "Healings on the Mountain" }, { heading: "Feeding the Four Thousand" } ] },
    { num: 16,
      title: "The Leaven of the Pharisees · Peter's Confession of HaMashiach · Take Up Your Cross",
      sections: [ { heading: "A Sign Demanded" }, { heading: "The Leaven of the Pharisees" }, { heading: "Peter's Confession of HaMashiach" }, { heading: "The First Passion Prediction" }, { heading: "Take Up Your Cross" } ] },
    { num: 17, title: "The Transfiguration · The Demon-Possessed Boy Healed · The Coin in the Fish's Mouth",
      sections: [ { heading: "The Transfiguration" }, { heading: "The Demon-Possessed Boy Healed" }, { heading: "The Second Passion Prediction" }, { heading: "The Coin in the Fish's Mouth" } ] },
    { num: 18, title: "The Greatest in the Kingdom · The Lost Sheep · The Unforgiving Servant",
      sections: [ { heading: "The Greatest in the Kingdom" }, { heading: "Causing Little Ones to Stumble" }, { heading: "The Lost Sheep" }, { heading: "Restoring an Erring Brother" }, { heading: "The Unforgiving Servant" } ] },
    { num: 19, title: "Divorce and Marriage · The Rich Young Ruler · The First Shall Be Last",
      sections: [ { heading: "Divorce and Marriage" }, { heading: "Let the Children Come" }, { heading: "The Rich Young Ruler" }, { heading: "The First Shall Be Last" } ] },
    { num: 20, title: "The Workers in the Vineyard · A Mother's Request · Two Blind Men Healed at Jericho",
      sections: [ { heading: "The Workers in the Vineyard" }, { heading: "The Third Passion Prediction" }, { heading: "A Mother's Request" }, { heading: "Two Blind Men Healed at Jericho" } ] },
    { num: 21,
      title: "The Triumphal Entry · The Temple Cleansed · The Wicked Vinedressers",
      sections: [ { heading: "The Triumphal Entry" }, { heading: "The Temple Cleansed" }, { heading: "The Fig Tree Withered" }, { heading: "YahuShua's Authority Questioned" }, { heading: "The Parable of Two Sons" }, { heading: "The Wicked Vinedressers" } ] },
    { num: 22,
      title: "The Wedding Feast · Render to Caesar · The Greatest Commandment",
      sections: [ { heading: "The Wedding Feast" }, { heading: "Render to Caesar" }, { heading: "The Sadducees and the Resurrection" }, { heading: "The Greatest Commandment" }, { heading: "Whose Son Is HaMashiach?" } ] },
    { num: 23, title: "Seven Woes · Lament Over Jerusalem",
      sections: [ { heading: "The Hypocrisy of the Scribes and Pharisees" }, { heading: "Seven Woes" }, { heading: "Lament Over Jerusalem" } ] },
    { num: 24, title: "The Great Tribulation · The Coming of the Son of Man · No One Knows the Day or Hour",
      sections: [ { heading: "The Temple Destruction Foretold" }, { heading: "The Beginning of Sorrows" }, { heading: "The Great Tribulation" }, { heading: "The Coming of the Son of Man" }, { heading: "The Lesson of the Fig Tree" }, { heading: "No One Knows the Day or Hour" }, { heading: "The Faithful and Wise Servant" } ] },
    { num: 25, title: "The Ten Virgins · The Talents · The Sheep and the Goats",
      sections: [ { heading: "The Ten Virgins" }, { heading: "The Talents" }, { heading: "The Sheep and the Goats" } ] },
    { num: 26,
      title: "The Passover Bread and Wine · Gethsemane · Betrayed and Arrested",
      sections: [ { heading: "The Plot to Kill YahuShua" }, { heading: "The Anointing at Bethany" }, { heading: "Judas Agrees to Betray" }, { heading: "The Passover Prepared" }, { heading: "The Passover Bread and Wine" }, { heading: "Peter's Denial Foretold" }, { heading: "Gethsemane" }, { heading: "Betrayed and Arrested" }, { heading: "Before the Sanhedrin" }, { heading: "Peter Denies YahuShua" } ] },
    { num: 27,
      title: "YahuShua Before Pilate · The Crucifixion · The Death of YahuShua",
      sections: [ { heading: "Delivered to Pilate" }, { heading: "Judas's End" }, { heading: "YahuShua Before Pilate" }, { heading: "Mocked by the Soldiers" }, { heading: "The Crucifixion" }, { heading: "The Death of YahuShua" }, { heading: "The Burial" }, { heading: "The Tomb Sealed" } ] },
    { num: 28, title: "The Resurrection · The Great Commission",
      sections: [ { heading: "The Resurrection" }, { heading: "The Guards Bribed" }, { heading: "The Great Commission" } ] }
  ]
};

// =========================================================================
// ACTS
// =========================================================================
BOOKS_RESTORED.acts = {
  chapters: [
    { num: 1,
      title: "The Ascension of YahuShua · Matthias Chosen to Replace Judas",
      sections: [ { heading: "The Ascension of YahuShua" }, { heading: "Matthias Chosen to Replace Judas" } ] },
    { num: 2, title: "The Day of Pentecost · Peter Preaches at Pentecost · The Fellowship of the Believers",
      sections: [ { heading: "The Day of Pentecost" }, { heading: "Peter Preaches at Pentecost" }, { heading: "The Fellowship of the Believers" } ] },
    { num: 3, title: "The Lame Man Healed at the Temple · Peter Preaches in Solomon's Portico",
      sections: [ { heading: "The Lame Man Healed at the Temple" }, { heading: "Peter Preaches in Solomon's Portico" } ] },
    { num: 4, title: "Peter and John Before the Sanhedrin · The Believers Pray for Boldness · All Things in Common",
      sections: [ { heading: "Peter and John Before the Sanhedrin" }, { heading: "The Believers Pray for Boldness" }, { heading: "All Things in Common" } ] },
    { num: 5, title: "Ananias and Sapphira · The Apostles Freed by an Angel · Gamaliel's Counsel",
      sections: [ { heading: "Ananias and Sapphira" }, { heading: "Signs and Wonders by the Apostles" }, { heading: "The Apostles Freed by an Angel" }, { heading: "Gamaliel's Counsel" } ] },
    { num: 6, title: "The Seven Chosen to Serve · Stephen Seized",
      sections: [ { heading: "The Seven Chosen to Serve" }, { heading: "Stephen Seized" } ] },
    { num: 7, title: "Stephen's Speech Before the Sanhedrin · Stephen Stoned",
      sections: [ { heading: "Stephen's Speech Before the Sanhedrin" }, { heading: "Stephen Stoned" } ] },
    { num: 8, title: "Saul Persecutes the Church · Simon the Sorcerer · Philip and the Ethiopian Eunuch",
      sections: [ { heading: "Saul Persecutes the Church" }, { heading: "Philip in Samaria" }, { heading: "Simon the Sorcerer" }, { heading: "Philip and the Ethiopian Eunuch" } ] },
    { num: 9, title: "The Conversion of Saul · Saul Preaches at Damascus · Tabitha Raised",
      sections: [ { heading: "The Conversion of Saul" }, { heading: "Saul Preaches at Damascus" }, { heading: "Aeneas Healed" }, { heading: "Tabitha Raised" } ] },
    { num: 10, title: "Cornelius's Vision · Peter's Vision · Gentiles Receive the Holy Spirit",
      sections: [ { heading: "Cornelius's Vision" }, { heading: "Peter's Vision" }, { heading: "Gentiles Receive the Holy Spirit" } ] },
    { num: 11, title: "Peter Explains His Actions · The Church at Antioch",
      sections: [ { heading: "Peter Explains His Actions" }, { heading: "The Church at Antioch" } ] },
    { num: 12, title: "Peter Freed from Prison · The Death of Herod",
      sections: [ { heading: "Peter Freed from Prison" }, { heading: "The Death of Herod" } ] },
    { num: 13, title: "Barnabas and Saul Sent Off · Elymas the Sorcerer Blinded · Paul Preaches at Pisidian Antioch",
      sections: [ { heading: "Barnabas and Saul Sent Off" }, { heading: "Elymas the Sorcerer Blinded" }, { heading: "Paul Preaches at Pisidian Antioch" } ] },
    { num: 14, title: "At Iconium · Mistaken for Gods at Lystra · Strengthening the Disciples",
      sections: [ { heading: "At Iconium" }, { heading: "Mistaken for Gods at Lystra" }, { heading: "Strengthening the Disciples" } ] },
    { num: 15, title: "The Council at Jerusalem · The Letter to the Gentile Believers · Paul and Barnabas Part Ways",
      sections: [ { heading: "The Council at Jerusalem" }, { heading: "The Letter to the Gentile Believers" }, { heading: "Paul and Barnabas Part Ways" } ] },
    { num: 16, title: "The Macedonian Call · Lydia Converted at Philippi · The Philippian Jailer Converted",
      sections: [ { heading: "Timothy Joins Paul" }, { heading: "The Macedonian Call" }, { heading: "Lydia Converted at Philippi" }, { heading: "Paul and Silas Imprisoned" }, { heading: "The Philippian Jailer Converted" } ] },
    { num: 17, title: "At Thessalonica · At Berea · Paul at the Areopagus",
      sections: [ { heading: "At Thessalonica" }, { heading: "At Berea" }, { heading: "Paul at the Areopagus" } ] },
    { num: 18, title: "At Corinth · Apollos at Ephesus",
      sections: [ { heading: "At Corinth" }, { heading: "Return to Antioch" }, { heading: "Apollos at Ephesus" } ] },
    { num: 19, title: "Disciples at Ephesus Receive the Holy Spirit · Paul at Ephesus · The Riot at Ephesus",
      sections: [ { heading: "Disciples at Ephesus Receive the Holy Spirit" }, { heading: "Paul at Ephesus" }, { heading: "The Riot at Ephesus" } ] },
    { num: 20, title: "Eutychus Raised · Paul's Farewell to the Ephesian Elders",
      sections: [ { heading: "Through Macedonia and Greece" }, { heading: "Eutychus Raised" }, { heading: "From Troas to Miletus" }, { heading: "Paul's Farewell to the Ephesian Elders" } ] },
    { num: 21, title: "Agabus's Prophecy · Paul at Jerusalem · Paul Arrested at the Temple",
      sections: [ { heading: "Agabus's Prophecy" }, { heading: "Paul at Jerusalem" }, { heading: "Paul Arrested at the Temple" } ] },
    { num: 22, title: "Paul's Defense Before the Crowd · Paul Reveals His Roman Citizenship",
      sections: [ { heading: "Paul's Defense Before the Crowd" }, { heading: "Paul Reveals His Roman Citizenship" } ] },
    { num: 23, title: "Paul Before the Sanhedrin · The Plot to Kill Paul · Paul Sent to Felix",
      sections: [ { heading: "Paul Before the Sanhedrin" }, { heading: "The Plot to Kill Paul" }, { heading: "Paul Sent to Felix" } ] },
    { num: 24, title: "Tertullus Accuses Paul · Paul's Defense Before Felix · Paul Detained by Felix",
      sections: [ { heading: "Tertullus Accuses Paul" }, { heading: "Paul's Defense Before Felix" }, { heading: "Paul Detained by Felix" } ] },
    { num: 25, title: "Paul Appeals to Caesar · Festus Consults King Agrippa",
      sections: [ { heading: "Paul Appeals to Caesar" }, { heading: "Festus Consults King Agrippa" } ] },
    { num: 26, title: "Paul Recounts His Conversion · Paul's Mission to the Gentiles · Almost Persuaded",
      sections: [ { heading: "Paul's Life Before His Conversion" }, { heading: "Paul Recounts His Conversion" }, { heading: "Paul's Mission to the Gentiles" }, { heading: "Almost Persuaded" } ] },
    { num: 27, title: "The Voyage to Rome · The Storm at Sea · Shipwreck on Malta",
      sections: [ { heading: "The Voyage to Rome" }, { heading: "The Storm at Sea" }, { heading: "Shipwreck on Malta" } ] },
    { num: 28, title: "Paul Bitten by a Viper on Malta · Arrival at Rome · Paul Preaches in Rome",
      sections: [ { heading: "Paul Bitten by a Viper on Malta" }, { heading: "Arrival at Rome" }, { heading: "Paul Preaches in Rome" } ] }
  ]
};

// =========================================================================
// ROMANS
// =========================================================================
BOOKS_RESTORED.romans = {
  chapters: [
    { num: 1, title: "Paul's Longing to Visit Rome · The Righteous Shall Live by Faith · God's Wrath Against Unrighteousness",
      sections: [ { heading: "Greeting" }, { heading: "Paul's Longing to Visit Rome" }, { heading: "The Righteous Shall Live by Faith" }, { heading: "The Wrath of God Revealed" }, { heading: "God Gives Them Over" } ] },
    { num: 2, title: "God's Righteous Judgment · The Jews and the Law",
      sections: [ { heading: "God's Righteous Judgment" }, { heading: "The Jews and the Law" } ] },
    { num: 3, title: "All Have Sinned · Righteousness Through Faith",
      sections: [ { heading: "God's Faithfulness" }, { heading: "All Have Sinned" }, { heading: "Righteousness Through Faith" } ] },
    { num: 4, title: "Abraham Justified by Faith · The Promise Realized Through Faith",
      sections: [ { heading: "Abraham Justified by Faith" }, { heading: "The Promise Realized Through Faith" } ] },
    { num: 5,
      title: "Peace and Hope Through Faith · Reconciled by the Death of HaMashiach · The Free Gift in YahuShua",
      sections: [ { heading: "Peace and Hope Through Faith" }, { heading: "Reconciled by the Death of HaMashiach" }, { heading: "Death Through Adam" }, { heading: "The Free Gift in YahuShua" } ] },
    { num: 6,
      title: "Buried with HaMashiach in Baptism · Dead to Sin, Alive to God · The Wages of Sin Is Death",
      sections: [ { heading: "Buried with HaMashiach in Baptism" }, { heading: "Dead to Sin, Alive to God" }, { heading: "Do Not Let Sin Reign" }, { heading: "Slaves of Righteousness" }, { heading: "The Wages of Sin Is Death" } ] },
    { num: 7, title: "Released from the Law · The Law Is Holy · Wretched Man That I Am",
      sections: [ { heading: "Released from the Law" }, { heading: "The Law Is Holy" }, { heading: "The Struggle Within" }, { heading: "Wretched Man That I Am" } ] },
    { num: 8,
      title: "No Condemnation in HaMashiach · All Things Work for Good · More Than Conquerors",
      sections: [ { heading: "No Condemnation in HaMashiach" }, { heading: "Living According to the Spirit" }, { heading: "Sons and Heirs of God" }, { heading: "Future Glory" }, { heading: "The Spirit Helps Our Weakness" }, { heading: "All Things Work for Good" }, { heading: "More Than Conquerors" } ] },
    { num: 9, title: "Paul's Sorrow for Israel · God's Sovereign Choice · Israel's Unbelief",
      sections: [ { heading: "Paul's Sorrow for Israel" }, { heading: "God's Sovereign Choice" }, { heading: "Israel's Unbelief" } ] },
    { num: 10, title: "Salvation for All Who Believe · Israel Rejects the Gospel",
      sections: [ { heading: "Salvation for All Who Believe" }, { heading: "Israel Rejects the Gospel" } ] },
    { num: 11, title: "The Remnant of Israel · Grafted In · All Israel Will Be Saved",
      sections: [ { heading: "The Remnant of Israel" }, { heading: "Grafted In" }, { heading: "All Israel Will Be Saved" } ] },
    { num: 12, title: "Living Sacrifices · Many Gifts, One Body · Overcome Evil with Good",
      sections: [ { heading: "Living Sacrifices" }, { heading: "Many Gifts, One Body" }, { heading: "Genuine Love" }, { heading: "Bless Those Who Persecute You" }, { heading: "Overcome Evil with Good" } ] },
    { num: 13, title: "Submission to the Authorities · Love Fulfills the Law · Put On the Armor of Light",
      sections: [ { heading: "Submission to the Authorities" }, { heading: "Love Fulfills the Law" }, { heading: "Put On the Armor of Light" } ] },
    { num: 14, title: "Do Not Judge Another's Conscience · Do Not Cause a Brother to Stumble",
      sections: [ { heading: "Do Not Judge Another's Conscience" }, { heading: "Do Not Cause a Brother to Stumble" } ] },
    { num: 15, title: "Bear with the Weak · Paul's Ministry to the Gentiles · Paul's Planned Visit",
      sections: [ { heading: "Bear with the Weak" }, { heading: "Paul's Ministry to the Gentiles" }, { heading: "Paul's Planned Visit" } ] },
    { num: 16, title: "Personal Greetings · Avoid Those Who Cause Divisions",
      sections: [ { heading: "Personal Greetings" }, { heading: "Avoid Those Who Cause Divisions" }, { heading: "Final Greetings" } ] }
  ]
};

// =========================================================================
// 1 CORINTHIANS
// =========================================================================
BOOKS_RESTORED["1corinthians"] = {
  chapters: [
    { num: 1, title: "Divisions in the Church · The Wisdom and Power of God",
      sections: [ { heading: "Greeting and Thanksgiving" }, { heading: "Divisions in the Church" }, { heading: "The Wisdom and Power of God" } ] },
    { num: 2,
      title: "HaMashiach Crucified · Spiritual Wisdom",
      sections: [ { heading: "HaMashiach Crucified" }, { heading: "Spiritual Wisdom" } ] },
    { num: 3, title: "Divisions About Leaders · The Foundation and the Building · Avoid Worldly Wisdom",
      sections: [ { heading: "Divisions About Leaders" }, { heading: "The Foundation and the Building" }, { heading: "Avoid Worldly Wisdom" } ] },
    { num: 4,
      title: "Apostles of HaMashiach · Paul's Appeal as a Father",
      sections: [ { heading: "Apostles of HaMashiach" }, { heading: "Paul's Appeal as a Father" } ] },
    { num: 5, title: "Sexual Immorality in the Church · Do Not Associate with the Immoral",
      sections: [ { heading: "Sexual Immorality in the Church" }, { heading: "Do Not Associate with the Immoral" } ] },
    { num: 6, title: "Lawsuits Among Believers · Your Body Is a Temple",
      sections: [ { heading: "Lawsuits Among Believers" }, { heading: "Your Body Is a Temple" } ] },
    { num: 7, title: "Marriage and Singleness · Live as You Are Called · The Unmarried and Widows",
      sections: [ { heading: "Marriage and Singleness" }, { heading: "Live as You Are Called" }, { heading: "The Unmarried and Widows" } ] },
    { num: 8, title: "Food Sacrificed to Idols · Do Not Cause a Weaker Brother to Stumble",
      sections: [ { heading: "Food Sacrificed to Idols" }, { heading: "Do Not Cause a Weaker Brother to Stumble" } ] },
    { num: 9, title: "Paul's Rights as an Apostle · Paul's Sacrifice for the Gospel · Run the Race",
      sections: [ { heading: "Paul's Rights as an Apostle" }, { heading: "Paul's Sacrifice for the Gospel" }, { heading: "Run the Race" } ] },
    { num: 10, title: "Warnings from Israel's History · Flee Idolatry · All for the Glory of God",
      sections: [ { heading: "Warnings from Israel's History" }, { heading: "Flee Idolatry" }, { heading: "All for the Glory of God" } ] },
    { num: 11, title: "Head Coverings · Disorder at the Gatherings · The Bread and the Cup",
      sections: [ { heading: "Head Coverings" }, { heading: "Disorder at the Gatherings" }, { heading: "The Bread and the Cup" }, { heading: "Examine Yourself" } ] },
    { num: 12, title: "Spiritual Gifts · One Body, Many Members · The Greater Gifts",
      sections: [ { heading: "Concerning Spiritual Gifts" }, { heading: "Diverse Gifts, One Spirit" }, { heading: "One Body, Many Members" }, { heading: "The Greater Gifts" } ] },
    { num: 13, title: "Without Love · The Way of Love · Love Never Fails",
      sections: [ { heading: "Without Love" }, { heading: "The Way of Love" }, { heading: "Love Never Fails" } ] },
    { num: 14, title: "Prophecy Greater Than Tongues · Tongues a Sign to Unbelievers · Order in the Gathering",
      sections: [ { heading: "Prophecy Greater Than Tongues" }, { heading: "Speaking with the Mind" }, { heading: "Pray with Understanding" }, { heading: "Tongues a Sign to Unbelievers" }, { heading: "All Things for Edification" }, { heading: "Order in the Gathering" } ] },
    { num: 15,
      title: "The Resurrection of HaMashiach · The Resurrection of the Dead · Death Is Swallowed Up in Victory",
      sections: [ { heading: "The Resurrection of HaMashiach" }, { heading: "The Resurrection of the Dead" }, { heading: "The Resurrection Body" }, { heading: "Death Is Swallowed Up in Victory" } ] },
    { num: 16, title: "The Collection for the Saints · Paul's Plans",
      sections: [ { heading: "The Collection for the Saints" }, { heading: "Paul's Plans" }, { heading: "Final Greetings" } ] }
  ]
};

// =========================================================================
// 2 CORINTHIANS
// =========================================================================
BOOKS_RESTORED["2corinthians"] = {
  chapters: [
    { num: 1, title: "The God of All Comfort · Paul's Change of Plans",
      sections: [ { heading: "The God of All Comfort" }, { heading: "Paul's Change of Plans" } ] },
    { num: 2,
      title: "Forgive the Offender · Triumph in HaMashiach",
      sections: [ { heading: "Forgive the Offender" }, { heading: "Triumph in HaMashiach" } ] },
    { num: 3, title: "Ministers of a New Covenant · The Greater Glory of the New Covenant",
      sections: [ { heading: "Ministers of a New Covenant" }, { heading: "The Greater Glory of the New Covenant" } ] },
    { num: 4, title: "The Light of the Gospel · Treasure in Jars of Clay · An Eternal Weight of Glory",
      sections: [ { heading: "The Light of the Gospel" }, { heading: "Treasure in Jars of Clay" }, { heading: "An Eternal Weight of Glory" } ] },
    { num: 5,
      title: "Our Heavenly Dwelling · The Love of HaMashiach Compels Us · The Ministry of Reconciliation",
      sections: [ { heading: "Our Heavenly Dwelling" }, { heading: "The Love of HaMashiach Compels Us" }, { heading: "The Ministry of Reconciliation" } ] },
    { num: 6, title: "Paul's Hardships and Ministry · Do Not Be Unequally Yoked",
      sections: [ { heading: "Paul's Hardships and Ministry" }, { heading: "Do Not Be Unequally Yoked" } ] },
    { num: 7, title: "A Plea for Open Hearts · Paul's Joy at Their Repentance",
      sections: [ { heading: "A Plea for Open Hearts" }, { heading: "Paul's Joy at Their Repentance" } ] },
    { num: 8, title: "The Generosity of the Macedonians · Titus Sent to Corinth",
      sections: [ { heading: "The Generosity of the Macedonians" }, { heading: "Titus Sent to Corinth" } ] },
    { num: 9, title: "Preparing the Gift · God Loves a Cheerful Giver",
      sections: [ { heading: "Preparing the Gift" }, { heading: "God Loves a Cheerful Giver" } ] },
    { num: 10,
      // "Boasting in the Lord" stays — "Lord" here is kyrios as title
      title: "Paul Defends His Ministry · Boasting in the Lord",
      sections: [ { heading: "Paul Defends His Ministry" }, { heading: "Boasting in the Lord" } ] },
    { num: 11, title: "False Apostles · Paul's Sufferings",
      sections: [ { heading: "False Apostles" }, { heading: "Paul's Sufferings" } ] },
    { num: 12, title: "Paul's Vision and the Thorn in the Flesh · Paul's Concern for the Corinthians",
      sections: [ { heading: "Paul's Vision and the Thorn in the Flesh" }, { heading: "Paul's Concern for the Corinthians" } ] },
    { num: 13, title: "Final Warnings · Final Greetings",
      sections: [ { heading: "Final Warnings" }, { heading: "Final Greetings" } ] }
  ]
};

// =========================================================================
// GALATIANS
// =========================================================================
BOOKS_RESTORED.galatians = {
  chapters: [
    { num: 1, title: "No Other Gospel · Paul's Calling and Conversion",
      sections: [ { heading: "No Other Gospel" }, { heading: "Paul's Calling and Conversion" } ] },
    { num: 2, title: "Paul Accepted by the Apostles · Paul Confronts Peter",
      sections: [ { heading: "Paul Accepted by the Apostles" }, { heading: "Paul Confronts Peter" } ] },
    { num: 3,
      title: "Justified by Faith Like Abraham · Redeemed from the Curse of the Law · Sons of God Through Faith",
      sections: [ { heading: "Justified by Faith Like Abraham" }, { heading: "Redeemed from the Curse of the Law" }, { heading: "The Law and the Promise" }, { heading: "A Schoolmaster Until HaMashiach" }, { heading: "Sons of God Through Faith" } ] },
    { num: 4, title: "Sons and Heirs · Paul's Concern for the Galatians · Hagar and Sarah",
      sections: [ { heading: "Sons and Heirs" }, { heading: "Paul's Concern for the Galatians" }, { heading: "Hagar and Sarah" } ] },
    { num: 5, title: "Stand Fast in Liberty · The Works of the Flesh · The Fruit of the Spirit",
      sections: [ { heading: "Stand Fast in Liberty" }, { heading: "A Little Leaven" }, { heading: "By Love Serve One Another" }, { heading: "The Works of the Flesh" }, { heading: "The Fruit of the Spirit" } ] },
    { num: 6, title: "Bear One Another's Burdens · Boast Only in the Cross",
      sections: [ { heading: "Bear One Another's Burdens" }, { heading: "Boast Only in the Cross" } ] }
  ]
};

// =========================================================================
// EPHESIANS
// =========================================================================
BOOKS_RESTORED.ephesians = {
  chapters: [
    { num: 1,
      title: "Greeting · Spiritual Blessings in HaMashiach · Paul's Prayer for Spiritual Wisdom",
      sections: [ { heading: "Greeting" }, { heading: "Spiritual Blessings in HaMashiach" }, { heading: "Paul's Prayer for Spiritual Wisdom" } ] },
    { num: 2,
      title: "By Grace Through Faith · Brought Near by His Blood · HaMashiach Our Cornerstone",
      sections: [ { heading: "By Grace Through Faith" }, { heading: "Brought Near by His Blood" }, { heading: "HaMashiach Our Peace" }, { heading: "HaMashiach Our Cornerstone" } ] },
    { num: 3, title: "The Mystery Revealed · Paul's Prayer for Spiritual Strength",
      sections: [ { heading: "The Mystery Revealed" }, { heading: "Paul's Prayer for Spiritual Strength" } ] },
    { num: 4, title: "Walk in Unity · Spiritual Gifts for the Body · Put Off the Old Man",
      sections: [ { heading: "Walk in Unity" }, { heading: "Spiritual Gifts for the Body" }, { heading: "Put Off the Old Man" }, { heading: "Do Not Grieve the Spirit" } ] },
    { num: 5, title: "Walk in Love · Walk as Children of Light · Wives and Husbands",
      sections: [ { heading: "Walk in Love" }, { heading: "Walk as Children of Light" }, { heading: "Walk in Wisdom" }, { heading: "Wives and Husbands" } ] },
    { num: 6, title: "Children and Parents · Bondservants and Masters · The Whole Armor of God",
      sections: [ { heading: "Children and Parents" }, { heading: "Bondservants and Masters" }, { heading: "The Whole Armor of God" }, { heading: "A Gracious Greeting" } ] }
  ]
};

// =========================================================================
// PHILIPPIANS
// =========================================================================
BOOKS_RESTORED.philippians = {
  chapters: [
    { num: 1,
      title: "To Live Is HaMashiach, to Die Is Gain · Worthy of the Gospel",
      sections: [ { heading: "Greeting" }, { heading: "Paul's Prayer for the Philippians" }, { heading: "My Chains Have Advanced the Gospel" }, { heading: "To Live Is HaMashiach, to Die Is Gain" }, { heading: "Worthy of the Gospel" } ] },
    { num: 2,
      title: "The Mind of HaMashiach · Work Out Your Salvation · Timothy and Epaphroditus",
      sections: [ { heading: "Be of One Mind" }, { heading: "The Mind of HaMashiach" }, { heading: "Work Out Your Salvation" }, { heading: "Timothy" }, { heading: "Epaphroditus" } ] },
    { num: 3,
      title: "Knowing HaMashiach · Pressing Toward the Goal",
      sections: [ { heading: "Knowing HaMashiach" }, { heading: "Pressing Toward the Goal" } ] },
    { num: 4,
      // "Rejoice in the Lord Always" — Lord as title, stays
      title: "Rejoice in the Lord Always · Contentment in Any Circumstance",
      sections: [ { heading: "Rejoice in the Lord Always" }, { heading: "Contentment in Any Circumstance" } ] }
  ]
};

// =========================================================================
// COLOSSIANS
// =========================================================================
BOOKS_RESTORED.colossians = {
  chapters: [
    { num: 1,
      title: "The Supremacy of HaMashiach · Paul's Labor for the Church",
      sections: [ { heading: "Greeting" }, { heading: "Thanksgiving for the Colossians" }, { heading: "Paul's Prayer for the Colossians" }, { heading: "The Supremacy of HaMashiach" }, { heading: "Reconciled in His Body" }, { heading: "Paul's Labor for the Church" } ] },
    { num: 2,
      title: "Rooted in HaMashiach · Alive in HaMashiach · Freedom from Human Regulations",
      sections: [ { heading: "Rooted in HaMashiach" }, { heading: "Alive in HaMashiach" }, { heading: "Freedom from Human Regulations" } ] },
    { num: 3, title: "Put Off the Old Man · Put On the New Man · Wives, Husbands, Children, and Servants",
      sections: [ { heading: "Set Your Mind on Things Above" }, { heading: "Put Off the Old Man" }, { heading: "Put On the New Man" }, { heading: "Wives, Husbands, Children, and Servants" } ] },
    { num: 4, title: "Pray and Walk in Wisdom · Final Greetings",
      sections: [ { heading: "Pray and Walk in Wisdom" }, { heading: "Final Greetings" } ] }
  ]
};

// =========================================================================
// 1 THESSALONIANS
// =========================================================================
// "Coming of the Lord" and "Day of the Lord" — "Lord" is kyrios (title/
// role referring to Christ's return). The NT echoes the OT Day-of-YHWH
// pattern but uses lowercase kyrios throughout, and the chrome title
// stays as a title-form. Held.
BOOKS_RESTORED["1thessalonians"] = {
  chapters: [
    { num: 1, title: "The Faith of the Thessalonians",
      sections: [ { heading: "Greeting" }, { heading: "The Faith of the Thessalonians" } ] },
    { num: 2, title: "Paul's Ministry in Thessalonica · Paul's Longing to See Them",
      sections: [ { heading: "Paul's Ministry in Thessalonica" }, { heading: "Paul's Longing to See Them" } ] },
    { num: 3, title: "Timothy Sent to Thessalonica · Timothy's Encouraging Report",
      sections: [ { heading: "Timothy Sent to Thessalonica" }, { heading: "Timothy's Encouraging Report" } ] },
    { num: 4, title: "A Life Pleasing to God · The Coming of the Lord",
      sections: [ { heading: "A Life Pleasing to God" }, { heading: "The Coming of the Lord" } ] },
    { num: 5, title: "The Day of the Lord · Rejoice Always, Pray Without Ceasing",
      sections: [ { heading: "The Day of the Lord" }, { heading: "Esteem Your Leaders" }, { heading: "Rejoice Always, Pray Without Ceasing" }, { heading: "Closing Prayer" } ] }
  ]
};

// =========================================================================
// 2 THESSALONIANS
// =========================================================================
BOOKS_RESTORED["2thessalonians"] = {
  chapters: [
    { num: 1,
      title: "Thanksgiving for the Thessalonians · Judgment at the Coming of YahuShua",
      sections: [ { heading: "Thanksgiving for the Thessalonians" }, { heading: "Judgment at the Coming of YahuShua" } ] },
    { num: 2, title: "The Man of Lawlessness · Stand Firm",
      sections: [ { heading: "The Man of Lawlessness" }, { heading: "Stand Firm" } ] },
    { num: 3, title: "Pray for Us · Warning Against Idleness",
      sections: [ { heading: "Pray for Us" }, { heading: "Warning Against Idleness" }, { heading: "Final Greetings" } ] }
  ]
};

// =========================================================================
// 1 TIMOTHY
// =========================================================================
BOOKS_RESTORED["1timothy"] = {
  chapters: [
    { num: 1, title: "Warning Against False Teachers · Paul's Gratitude for Grace · Charge to Timothy",
      sections: [ { heading: "Warning Against False Teachers" }, { heading: "Paul's Gratitude for Grace" }, { heading: "Charge to Timothy" } ] },
    { num: 2, title: "Pray for All People · Men and Women in the Gathering",
      sections: [ { heading: "Pray for All People" }, { heading: "Men and Women in the Gathering" } ] },
    { num: 3, title: "Qualifications for Overseers · Qualifications for Deacons · The Mystery of Godliness",
      sections: [ { heading: "Qualifications for Overseers" }, { heading: "Qualifications for Deacons" }, { heading: "The Mystery of Godliness" } ] },
    { num: 4,
      title: "The Departure from the Faith · A Good Minister of YahuShua",
      sections: [ { heading: "The Departure from the Faith" }, { heading: "A Good Minister of YahuShua" } ] },
    { num: 5, title: "Care for Widows · Honoring Elders",
      sections: [ { heading: "Care for Widows" }, { heading: "Honoring Elders" } ] },
    { num: 6, title: "The Love of Money · Charge to the Man of God",
      sections: [ { heading: "Servants and Masters" }, { heading: "The Love of Money" }, { heading: "Charge to the Man of God" } ] }
  ]
};

// =========================================================================
// 2 TIMOTHY
// =========================================================================
BOOKS_RESTORED["2timothy"] = {
  chapters: [
    { num: 1, title: "Stir Up the Gift · Not Ashamed of the Gospel",
      sections: [ { heading: "Stir Up the Gift" }, { heading: "Not Ashamed of the Gospel" } ] },
    { num: 2,
      title: "A Good Soldier of YahuShua · An Approved Worker · A Vessel for Honor",
      sections: [ { heading: "A Good Soldier of YahuShua" }, { heading: "An Approved Worker" }, { heading: "A Vessel for Honor" } ] },
    { num: 3, title: "The Last Days · All Scripture Is Inspired",
      sections: [ { heading: "The Last Days" }, { heading: "All Scripture Is Inspired" } ] },
    { num: 4, title: "Preach the Word · Personal Instructions and Final Greetings",
      sections: [ { heading: "Preach the Word" }, { heading: "Personal Instructions and Final Greetings" } ] }
  ]
};

// =========================================================================
// TITUS — no Jesus/Messiah in chrome
// =========================================================================
BOOKS_RESTORED.titus = {
  chapters: [
    { num: 1, title: "Qualifications for Elders · Rebuke False Teachers",
      sections: [ { heading: "Greeting" }, { heading: "Qualifications for Elders" }, { heading: "Rebuke False Teachers" } ] },
    { num: 2, title: "Teach What Is Good · The Grace That Brings Salvation",
      sections: [ { heading: "Teach What Is Good" }, { heading: "The Grace That Brings Salvation" } ] },
    { num: 3, title: "Be Ready for Every Good Work · Final Instructions",
      sections: [ { heading: "Be Ready for Every Good Work" }, { heading: "Final Instructions" } ] }
  ]
};

// =========================================================================
// PHILEMON — no Jesus/Messiah in chrome
// =========================================================================
BOOKS_RESTORED.philemon = {
  chapters: [
    { num: 1, title: "Thanksgiving for Philemon · Paul's Plea for Onesimus",
      sections: [ { heading: "Thanksgiving for Philemon" }, { heading: "Paul's Plea for Onesimus" }, { heading: "Final Greetings" } ] }
  ]
};

// =========================================================================
// HEBREWS
// =========================================================================
BOOKS_RESTORED.hebrews = {
  chapters: [
    { num: 1, title: "God Has Spoken by His Son · The Son Greater Than the Angels",
      sections: [ { heading: "God Has Spoken by His Son" }, { heading: "The Son Greater Than the Angels" } ] },
    { num: 2,
      title: "Do Not Drift from Salvation · YahuShua Made Like His Brothers",
      sections: [ { heading: "Do Not Drift from Salvation" }, { heading: "Crowned with Glory and Honor" }, { heading: "YahuShua Made Like His Brothers" } ] },
    { num: 3,
      title: "YahuShua Greater Than Moses · Do Not Harden Your Hearts",
      sections: [ { heading: "YahuShua Greater Than Moses" }, { heading: "Do Not Harden Your Hearts" } ] },
    { num: 4,
      title: "The Sabbath Rest for the People of God · YahuShua Our Great High Priest",
      sections: [ { heading: "The Sabbath Rest for the People of God" }, { heading: "YahuShua Our Great High Priest" } ] },
    { num: 5,
      title: "YahuShua a Priest Like Melchizedek · Warning Against Falling Away from Maturity",
      sections: [ { heading: "YahuShua a Priest Like Melchizedek" }, { heading: "Warning Against Falling Away from Maturity" } ] },
    { num: 6, title: "The Peril of Falling Away · The Certainty of God's Promise",
      sections: [ { heading: "The Peril of Falling Away" }, { heading: "Better Things from You" }, { heading: "The Certainty of God's Promise" } ] },
    { num: 7,
      title: "Melchizedek the Priest-King · YahuShua a Priest Forever",
      sections: [ { heading: "Melchizedek the Priest-King" }, { heading: "A Better Priesthood" }, { heading: "YahuShua a Priest Forever" } ] },
    { num: 8, title: "The High Priest of a Better Covenant · The New Covenant Promised",
      sections: [ { heading: "The High Priest of a Better Covenant" }, { heading: "The New Covenant Promised" } ] },
    { num: 9,
      title: "The Earthly Tabernacle · The Blood of HaMashiach · The One Sacrifice for Sins",
      sections: [ { heading: "The Earthly Tabernacle" }, { heading: "The Blood of HaMashiach" }, { heading: "The One Sacrifice for Sins" } ] },
    { num: 10,
      title: "The Sacrifice of HaMashiach Once for All · Hold Fast Your Confession · Do Not Shrink Back",
      sections: [ { heading: "The Sacrifice of HaMashiach Once for All" }, { heading: "One Offering Has Perfected Forever" }, { heading: "Hold Fast Your Confession" } ] },
    { num: 11, title: "Faith Defined · The Faith of the Patriarchs · The Faith of Moses and Beyond",
      sections: [ { heading: "Faith Defined" }, { heading: "The Faith of Abel, Enoch, and Noah" }, { heading: "The Faith of the Patriarchs" }, { heading: "By Faith They Conquered Kingdoms" } ] },
    { num: 12, title: "The Great Cloud of Witnesses · The Discipline of Sons · Mount Sinai and Mount Zion",
      sections: [ { heading: "The Great Cloud of Witnesses" }, { heading: "The Discipline of Sons" }, { heading: "Pursue Peace and Holiness" } ] },
    { num: 13,
      title: "Let Brotherly Love Continue · The Altar of YahuShua · Final Greetings",
      sections: [ { heading: "Let Brotherly Love Continue" }, { heading: "The Altar of YahuShua" }, { heading: "Obey Your Leaders" }, { heading: "Final Greetings" } ] }
  ]
};

// =========================================================================
// JAMES — no Jesus/Messiah in chrome
// =========================================================================
BOOKS_RESTORED.james = {
  chapters: [
    { num: 1, title: "Trials and Temptations · God Gives Good Gifts · Be Doers of the Word",
      sections: [ { heading: "Greeting" }, { heading: "Trials and Temptations" }, { heading: "God Gives Good Gifts" }, { heading: "Quick to Hear, Slow to Speak" }, { heading: "Be Doers of the Word" }, { heading: "Pure Religion" } ] },
    { num: 2, title: "Warning Against Partiality · Faith Without Works Is Dead",
      sections: [ { heading: "Warning Against Partiality" }, { heading: "Faith Without Works Is Dead" } ] },
    { num: 3, title: "Taming the Tongue · Wisdom from Above",
      sections: [ { heading: "Teachers Will Be Judged More Strictly" }, { heading: "Taming the Tongue" }, { heading: "Wisdom from Above" } ] },
    { num: 4, title: "Friendship with the World · Do Not Speak Evil · Do Not Boast About Tomorrow",
      sections: [ { heading: "Friendship with the World Is Enmity with God" }, { heading: "Do Not Speak Evil of One Another" }, { heading: "Do Not Boast About Tomorrow" } ] },
    { num: 5, title: "Warning to the Rich · Patience in Suffering · The Prayer of Faith",
      sections: [ { heading: "Warning to the Rich" }, { heading: "Patience in Suffering" }, { heading: "The Prayer of Faith" } ] }
  ]
};

// =========================================================================
// 1 PETER
// =========================================================================
BOOKS_RESTORED["1peter"] = {
  chapters: [
    { num: 1, title: "A Living Hope · Be Holy · Born Again of Incorruptible Seed",
      sections: [ { heading: "Greeting" }, { heading: "A Living Hope" }, { heading: "The Salvation of Souls Foretold" }, { heading: "Be Holy" }, { heading: "Redeemed by the Precious Blood" }, { heading: "Born Again of Incorruptible Seed" } ] },
    { num: 2,
      title: "Living Stones, a Chosen People · Submission to Authorities · HaMashiach's Example of Suffering",
      sections: [ { heading: "Crave the Pure Milk of the Word" }, { heading: "Living Stones, a Chosen People" }, { heading: "Abstain from Fleshly Lusts" }, { heading: "Submission to Authorities" }, { heading: "HaMashiach's Example of Suffering" } ] },
    { num: 3,
      title: "Wives and Husbands · Suffering for Righteousness · HaMashiach's Suffering and Triumph",
      sections: [ { heading: "Wives and Husbands" }, { heading: "Living for God" }, { heading: "Suffering for Righteousness" }, { heading: "HaMashiach's Suffering and Triumph" } ] },
    { num: 4,
      title: "Living for God's Will · Serving for God's Glory · Sharing in HaMashiach's Sufferings",
      sections: [ { heading: "Living for God's Will" }, { heading: "Serving for God's Glory" }, { heading: "Sharing in HaMashiach's Sufferings" } ] },
    { num: 5, title: "To the Elders · Humble Yourselves Before God",
      sections: [ { heading: "To the Elders" }, { heading: "Humble Yourselves Before God" }, { heading: "Final Greetings" } ] }
  ]
};

// =========================================================================
// 2 PETER — "Day of the Lord" (3:10) stays: "Lord" is kyrios/title
// =========================================================================
BOOKS_RESTORED["2peter"] = {
  chapters: [
    { num: 1, title: "Add to Your Faith · The Trustworthy Prophetic Word",
      sections: [ { heading: "Add to Your Faith" }, { heading: "The Trustworthy Prophetic Word" } ] },
    { num: 2, title: "False Teachers Will Arise · God's Judgment on the Wicked",
      sections: [ { heading: "False Teachers Will Arise" }, { heading: "God's Judgment on the Wicked" }, { heading: "The Way of the False Teachers" } ] },
    { num: 3, title: "The Day of the Lord Will Come · The New Heavens and New Earth",
      sections: [ { heading: "The Day of the Lord Will Come" }, { heading: "The New Heavens and New Earth" } ] }
  ]
};

// =========================================================================
// 1 JOHN
// =========================================================================
BOOKS_RESTORED["1john"] = {
  chapters: [
    { num: 1, title: "The Word of Life · Walking in the Light",
      sections: [ { heading: "The Word of Life" }, { heading: "Walking in the Light" } ] },
    { num: 2,
      title: "A New Commandment · Do Not Love the World · Warning Against Antichrists",
      sections: [ { heading: "YahuShua Our Advocate" }, { heading: "A New Commandment" }, { heading: "Do Not Love the World" }, { heading: "Warning Against Antichrists" }, { heading: "Abide in Him" } ] },
    { num: 3, title: "Children of God · Love One Another · Confidence Before God",
      sections: [ { heading: "Children of God" }, { heading: "Children of God and Children of the Devil" }, { heading: "Love One Another" }, { heading: "Confidence Before God" } ] },
    { num: 4, title: "Test the Spirits · God Is Love",
      sections: [ { heading: "Test the Spirits" }, { heading: "God Is Love" } ] },
    { num: 5, title: "Faith Overcomes the World · That You May Know You Have Eternal Life",
      sections: [ { heading: "Faith Overcomes the World" }, { heading: "That You May Know You Have Eternal Life" } ] }
  ]
};

// =========================================================================
// 2 JOHN — no Jesus/Messiah in chrome
// =========================================================================
BOOKS_RESTORED["2john"] = {
  chapters: [
    { num: 1, title: "Walking in Truth and Love · Beware of Deceivers",
      sections: [ { heading: "Greeting" }, { heading: "Walking in Truth and Love" }, { heading: "Beware of Deceivers" }, { heading: "Final Greetings" } ] }
  ]
};

// =========================================================================
// 3 JOHN — no Jesus/Messiah in chrome
// =========================================================================
BOOKS_RESTORED["3john"] = {
  chapters: [
    { num: 1, title: "Gaius the Beloved · Diotrephes the Troublemaker · Demetrius's Good Testimony",
      sections: [ { heading: "Gaius the Beloved" }, { heading: "Diotrephes the Troublemaker" }, { heading: "Demetrius and Final Greetings" } ] }
  ]
};

// =========================================================================
// JUDE — no Jesus/Messiah in chrome
// =========================================================================
BOOKS_RESTORED.jude = {
  chapters: [
    { num: 1, title: "Contend for the Faith · Warning Against False Teachers · Build Yourselves Up",
      sections: [ { heading: "Greeting" }, { heading: "Contend for the Faith" }, { heading: "Warning Against False Teachers" }, { heading: "Build Yourselves Up" }, { heading: "To Him Who Is Able" } ] }
  ]
};

// =========================================================================
// REVELATION
// =========================================================================
// Titles like "the Lamb", "Rider on the White Horse", "Son of Man" stay
// — titles/roles, not Names. Only Ch 22 "Come, Lord Jesus" restores to
// "Come, Lord YahuShua" (the Name appears in the combo).
BOOKS_RESTORED.revelation = {
  chapters: [
    { num: 1, title: "Greeting to the Seven Churches · Vision of the Son of Man",
      sections: [ { heading: "Prologue" }, { heading: "Greeting to the Seven Churches" }, { heading: "Vision of the Son of Man" } ] },
    { num: 2, title: "To Ephesus · To Smyrna · To Pergamos · To Thyatira",
      sections: [ { heading: "The Letter to Ephesus" }, { heading: "The Letter to Smyrna" }, { heading: "The Letter to Pergamos" }, { heading: "The Letter to Thyatira" } ] },
    { num: 3, title: "To Sardis · To Philadelphia · To Laodicea",
      sections: [ { heading: "The Letter to Sardis" }, { heading: "The Letter to Philadelphia" }, { heading: "The Letter to Laodicea" } ] },
    { num: 4, title: "The Throne in Heaven · The Twenty-Four Elders · The Four Living Creatures",
      sections: [ { heading: "The Throne in Heaven" }, { heading: "The Twenty-Four Elders" }, { heading: "The Four Living Creatures" } ] },
    { num: 5, title: "The Scroll and the Lamb · Worthy Is the Lamb",
      sections: [ { heading: "The Scroll and the Lamb" }, { heading: "Worthy Is the Lamb" } ] },
    { num: 6, title: "The Four Horsemen · The Martyrs Under the Altar · The Day of Wrath",
      sections: [ { heading: "The First Seal: The White Horse" }, { heading: "The Second Seal: The Red Horse" }, { heading: "The Third Seal: The Black Horse" }, { heading: "The Fourth Seal: The Pale Horse" }, { heading: "The Fifth Seal: The Martyrs Under the Altar" }, { heading: "The Sixth Seal: The Day of Wrath" } ] },
    { num: 7, title: "The 144,000 Sealed · The Great Multitude in White Robes",
      sections: [ { heading: "The 144,000 Sealed" }, { heading: "The Great Multitude in White Robes" } ] },
    { num: 8, title: "The Seventh Seal and the Golden Censer · The First Four Trumpets",
      sections: [ { heading: "The Seventh Seal and the Golden Censer" }, { heading: "The First Trumpet" }, { heading: "The Second Trumpet" }, { heading: "The Third Trumpet: Wormwood" }, { heading: "The Fourth Trumpet" } ] },
    { num: 9, title: "Locusts from the Abyss · The Two Hundred Million Horsemen",
      sections: [ { heading: "The Fifth Trumpet: Locusts from the Abyss" }, { heading: "The Sixth Trumpet: The Two Hundred Million Horsemen" } ] },
    { num: 10, title: "The Mighty Angel · The Little Scroll Eaten",
      sections: [ { heading: "The Mighty Angel" }, { heading: "The Little Scroll Eaten" } ] },
    { num: 11, title: "The Two Witnesses · The Seventh Trumpet",
      sections: [ { heading: "The Two Witnesses" }, { heading: "The Seventh Trumpet" } ] },
    { num: 12, title: "The Woman and the Dragon · War in Heaven · The Dragon Pursues the Woman",
      sections: [ { heading: "The Woman and the Dragon" }, { heading: "War in Heaven" }, { heading: "The Dragon Pursues the Woman" } ] },
    { num: 13, title: "The Beast from the Sea · The Beast from the Earth and the Number 666",
      sections: [ { heading: "The Beast from the Sea" }, { heading: "The Beast from the Earth and the Number 666" } ] },
    { num: 14, title: "The 144,000 with the Lamb · The Three Angels · The Harvest of the Earth",
      sections: [ { heading: "The 144,000 with the Lamb" }, { heading: "The Three Angels" }, { heading: "The Harvest of the Earth" } ] },
    { num: 15, title: "The Song of Moses and of the Lamb · The Seven Angels with the Seven Plagues",
      sections: [ { heading: "The Song of Moses and of the Lamb" }, { heading: "The Seven Angels with the Seven Plagues" } ] },
    { num: 16, title: "The Seven Bowls of Wrath · Armageddon",
      sections: [ { heading: "The First Bowl" }, { heading: "The Second Bowl" }, { heading: "The Third Bowl" }, { heading: "The Fourth Bowl" }, { heading: "The Fifth Bowl" }, { heading: "The Sixth Bowl: Armageddon" }, { heading: "The Seventh Bowl" } ] },
    { num: 17, title: "The Woman on the Beast · Mystery Babylon · The Defeat of the Beast Foretold",
      sections: [ { heading: "The Woman on the Beast" }, { heading: "The Mystery of the Beast" }, { heading: "The Defeat of the Beast Foretold" } ] },
    { num: 18, title: "Babylon Has Fallen · Come Out of Her, My People · The Merchants Weep",
      sections: [ { heading: "Babylon Has Fallen" }, { heading: "Come Out of Her, My People" }, { heading: "The Kings and Merchants Weep" }, { heading: "The Final Fall of Babylon" } ] },
    { num: 19, title: "The Marriage Supper of the Lamb · The Rider on the White Horse · The Beast and False Prophet Cast into the Lake of Fire",
      sections: [ { heading: "Hallelujahs in Heaven" }, { heading: "The Marriage Supper of the Lamb" }, { heading: "The Rider on the White Horse" }, { heading: "The Beast and False Prophet Cast into the Lake of Fire" } ] },
    { num: 20, title: "The Thousand Years · The Great White Throne · The Lake of Fire",
      sections: [ { heading: "Satan Bound" }, { heading: "The Thousand Years" }, { heading: "Satan's Final Defeat" }, { heading: "The Great White Throne" }, { heading: "The Lake of Fire" } ] },
    { num: 21, title: "A New Heaven and a New Earth · I Make All Things New · The New Jerusalem",
      sections: [ { heading: "A New Heaven and a New Earth" }, { heading: "I Make All Things New" }, { heading: "The New Jerusalem" }, { heading: "The Glory of the New Jerusalem" } ] },
    { num: 22,
      // RESTORED — Rev 22:20 "Come, Lord Jesus!" → "Come, Lord YahuShua!"
      title: "The River of Life · I Am Coming Quickly · Come, Lord YahuShua",
      sections: [ { heading: "The River of Life and the Tree of Life" }, { heading: "I Am Coming Quickly" }, { heading: "Come, Lord YahuShua" } ] }
  ]
};
