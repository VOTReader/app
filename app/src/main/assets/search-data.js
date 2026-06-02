/* ═════════════════════════════════════════════════════════════════════════
   VotReader Search Data — named passages, synonyms, abbreviations, stop words
   Exposed as window.VotSearchData. Pure data, no logic. Safe to reload.
═════════════════════════════════════════════════════════════════════════ */
(function () {
'use strict';

// ─── Stop words (filtered from token matching but preserved in phrase search) ───
// Archaic KJV pronouns (thee/thou/thy/thine/ye/unto) are PRESERVED — they're
// crucial for narrowing queries in KJV, ASV, YLT and other older translations.
var STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by','from',
  'that','this','these','those','is','was','are','were','be','been','being','have',
  'has','had','do','does','did','will','would','could','should','may','might','shall',
  'must','can','not','no','nor','so','yet','both','either','neither','also','as','if',
  'when','where','who','which','what','whom','whose','then','than','him','his','her',
  'he','she','they','their','them','we','our','ours','you','your','yours','it','its',
  'i','me','my','mine','us','all','any','each','every','said',
  'about','upon','over','under','through','there','here',
  'how','why','whether'
]);

// Trimmed stop word list — drops grammar glue only. Keeps semantically-loaded words
// ("all", "no", "not", "every", "where", "what", etc.) because they carry meaning in
// scripture searches (e.g. "all things", "no man", "what does it profit").
// KJV pronouns (thee/thou/thy/ye/unto) preserved — see note above.
var STOP_WORDS_TRIMMED = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by','from',
  'that','this','these','those','is','was','are','were','be','been','being','have',
  'has','had','do','does','did','as','if','than','then','so','yet',
  'him','his','her','he','she','they','their','them','we','our','ours','you','your','yours','it','its',
  'i','me','my','mine','us','said'
]);

// ─── Book abbreviations (exhaustive — every common form) ───
// Each key → canonical book id (lowercase, no space, as used in BOOKS global).
var BOOK_ABBREVS = {
  // Genesis
  'gen':'genesis','ge':'genesis','gn':'genesis','genesis':'genesis',
  // Exodus
  'exod':'exodus','ex':'exodus','exo':'exodus','exodus':'exodus',
  // Leviticus
  'lev':'leviticus','le':'leviticus','lv':'leviticus','leviticus':'leviticus',
  // Numbers
  'num':'numbers','nu':'numbers','nm':'numbers','nb':'numbers','numbers':'numbers',
  // Deuteronomy
  'deut':'deuteronomy','de':'deuteronomy','dt':'deuteronomy','deu':'deuteronomy','deuteronomy':'deuteronomy','deutoronomy':'deuteronomy',
  // Joshua
  'josh':'joshua','jos':'joshua','jsh':'joshua','joshua':'joshua',
  // Judges
  'judg':'judges','jdg':'judges','jg':'judges','jdgs':'judges','judges':'judges',
  // Ruth
  'ruth':'ruth','ru':'ruth','rth':'ruth',
  // 1 Samuel
  '1sam':'1samuel','1sa':'1samuel','1s':'1samuel','1 samuel':'1samuel','1samuel':'1samuel',
  'isam':'1samuel','i samuel':'1samuel','1st samuel':'1samuel','first samuel':'1samuel',
  // 2 Samuel
  '2sam':'2samuel','2sa':'2samuel','2s':'2samuel','2 samuel':'2samuel','2samuel':'2samuel',
  'iisam':'2samuel','ii samuel':'2samuel','2nd samuel':'2samuel','second samuel':'2samuel',
  // 1 Kings
  '1ki':'1kings','1kgs':'1kings','1k':'1kings','1 kings':'1kings','1kings':'1kings',
  'iki':'1kings','i kings':'1kings','1st kings':'1kings','first kings':'1kings',
  // 2 Kings
  '2ki':'2kings','2kgs':'2kings','2k':'2kings','2 kings':'2kings','2kings':'2kings',
  'iiki':'2kings','ii kings':'2kings','2nd kings':'2kings','second kings':'2kings',
  // 1 Chronicles
  '1chr':'1chronicles','1ch':'1chronicles','1chron':'1chronicles','1 chronicles':'1chronicles','1chronicles':'1chronicles',
  'ichr':'1chronicles','i chronicles':'1chronicles','1st chronicles':'1chronicles','first chronicles':'1chronicles',
  // 2 Chronicles
  '2chr':'2chronicles','2ch':'2chronicles','2chron':'2chronicles','2 chronicles':'2chronicles','2chronicles':'2chronicles',
  'iichr':'2chronicles','ii chronicles':'2chronicles','2nd chronicles':'2chronicles','second chronicles':'2chronicles',
  // Ezra
  'ezr':'ezra','ez':'ezra','ezra':'ezra',
  // Nehemiah
  'neh':'nehemiah','ne':'nehemiah','nehemiah':'nehemiah','nehemia':'nehemiah',
  // Esther
  'est':'esther','esth':'esther','es':'esther','esther':'esther',
  // Job
  'job':'job','jb':'job',
  // Psalms
  'ps':'psalms','psa':'psalms','psm':'psalms','pss':'psalms','psal':'psalms','psalm':'psalms','psalms':'psalms','pslam':'psalms','pslams':'psalms',
  // Proverbs
  'prov':'proverbs','pr':'proverbs','pro':'proverbs','prv':'proverbs','proverbs':'proverbs','prob':'proverbs',
  // Ecclesiastes
  'eccl':'ecclesiastes','ecc':'ecclesiastes','ec':'ecclesiastes','qoh':'ecclesiastes','qoheleth':'ecclesiastes','ecclesiastes':'ecclesiastes','ecclesiates':'ecclesiastes',
  // Song of Solomon
  'song':'songofsolomon','sos':'songofsolomon','ss':'songofsolomon','cant':'songofsolomon','song of songs':'songofsolomon','song of solomon':'songofsolomon','songofsolomon':'songofsolomon','canticles':'songofsolomon',
  // Isaiah
  'isa':'isaiah','is':'isaiah','isaiah':'isaiah','isiah':'isaiah',
  // Jeremiah
  'jer':'jeremiah','je':'jeremiah','jr':'jeremiah','jeremiah':'jeremiah','jeremia':'jeremiah',
  // Lamentations
  'lam':'lamentations','la':'lamentations','lamentations':'lamentations',
  // Ezekiel
  'ezek':'ezekiel','eze':'ezekiel','ezk':'ezekiel','ezekiel':'ezekiel','ezekial':'ezekiel',
  // Daniel
  'dan':'daniel','da':'daniel','dn':'daniel','daniel':'daniel',
  // Hosea
  'hos':'hosea','ho':'hosea','hosea':'hosea',
  // Joel
  'joel':'joel','jl':'joel',
  // Amos
  'amos':'amos','am':'amos','amo':'amos',
  // Obadiah
  'obad':'obadiah','ob':'obadiah','obadiah':'obadiah','obd':'obadiah',
  // Jonah
  'jon':'jonah','jnh':'jonah','jonah':'jonah',
  // Micah
  'mic':'micah','mi':'micah','mc':'micah','micah':'micah',
  // Nahum
  'nah':'nahum','na':'nahum','nahum':'nahum',
  // Habakkuk
  'hab':'habakkuk','hb':'habakkuk','habakkuk':'habakkuk','habakuk':'habakkuk',
  // Zephaniah
  'zeph':'zephaniah','zep':'zephaniah','zp':'zephaniah','zephaniah':'zephaniah',
  // Haggai
  'hag':'haggai','hg':'haggai','haggai':'haggai',
  // Zechariah
  'zech':'zechariah','zec':'zechariah','zc':'zechariah','zechariah':'zechariah','zecharia':'zechariah',
  // Malachi
  'mal':'malachi','ml':'malachi','malachi':'malachi','malichi':'malachi',
  // Matthew
  'matt':'matthew','mt':'matthew','mat':'matthew','matthew':'matthew','mathew':'matthew',
  // Mark
  'mark':'mark','mk':'mark','mrk':'mark','mr':'mark',
  // Luke
  'luke':'luke','lk':'luke','luk':'luke','lu':'luke',
  // John
  'john':'john','jn':'john','joh':'john','jhn':'john',
  // Acts
  'acts':'acts','act':'acts','ac':'acts',
  // Romans
  'rom':'romans','ro':'romans','rm':'romans','romans':'romans','roman':'romans',
  // 1 Corinthians
  '1cor':'1corinthians','1co':'1corinthians','1c':'1corinthians','1 corinthians':'1corinthians','1corinthians':'1corinthians',
  'icor':'1corinthians','i corinthians':'1corinthians','1st corinthians':'1corinthians','first corinthians':'1corinthians',
  // 2 Corinthians
  '2cor':'2corinthians','2co':'2corinthians','2c':'2corinthians','2 corinthians':'2corinthians','2corinthians':'2corinthians',
  'iicor':'2corinthians','ii corinthians':'2corinthians','2nd corinthians':'2corinthians','second corinthians':'2corinthians',
  // Galatians
  'gal':'galatians','ga':'galatians','galatians':'galatians',
  // Ephesians
  'eph':'ephesians','ephes':'ephesians','ephesians':'ephesians',
  // Philippians
  'phil':'philippians','php':'philippians','pp':'philippians','philippians':'philippians','phillipians':'philippians','phillippians':'philippians','phlppns':'philippians',
  // Colossians
  'col':'colossians','co':'colossians','colossians':'colossians',
  // 1 Thessalonians
  '1thess':'1thessalonians','1th':'1thessalonians','1ts':'1thessalonians','1 thessalonians':'1thessalonians','1thessalonians':'1thessalonians',
  'ithess':'1thessalonians','i thessalonians':'1thessalonians','1st thessalonians':'1thessalonians','first thessalonians':'1thessalonians',
  // 2 Thessalonians
  '2thess':'2thessalonians','2th':'2thessalonians','2ts':'2thessalonians','2 thessalonians':'2thessalonians','2thessalonians':'2thessalonians',
  'iithess':'2thessalonians','ii thessalonians':'2thessalonians','2nd thessalonians':'2thessalonians','second thessalonians':'2thessalonians',
  // 1 Timothy
  '1tim':'1timothy','1ti':'1timothy','1t':'1timothy','1 timothy':'1timothy','1timothy':'1timothy',
  'itim':'1timothy','i timothy':'1timothy','1st timothy':'1timothy','first timothy':'1timothy',
  // 2 Timothy
  '2tim':'2timothy','2ti':'2timothy','2t':'2timothy','2 timothy':'2timothy','2timothy':'2timothy',
  'iitim':'2timothy','ii timothy':'2timothy','2nd timothy':'2timothy','second timothy':'2timothy',
  // Titus
  'tit':'titus','ti':'titus','titus':'titus',
  // Philemon
  'phlm':'philemon','phm':'philemon','pm':'philemon','philemon':'philemon',
  // Hebrews
  'heb':'hebrews','he':'hebrews','hebrews':'hebrews','hebrew':'hebrews',
  // James
  'jas':'james','jms':'james','jm':'james','james':'james',
  // 1 Peter
  '1pet':'1peter','1pe':'1peter','1pt':'1peter','1p':'1peter','1 peter':'1peter','1peter':'1peter',
  'ipet':'1peter','i peter':'1peter','1st peter':'1peter','first peter':'1peter',
  // 2 Peter
  '2pet':'2peter','2pe':'2peter','2pt':'2peter','2p':'2peter','2 peter':'2peter','2peter':'2peter',
  'iipet':'2peter','ii peter':'2peter','2nd peter':'2peter','second peter':'2peter',
  // 1 John
  '1jn':'1john','1jo':'1john','1joh':'1john','1 john':'1john','1john':'1john',
  'ijn':'1john','i john':'1john','1st john':'1john','first john':'1john',
  // 2 John
  '2jn':'2john','2jo':'2john','2joh':'2john','2 john':'2john','2john':'2john',
  'iijn':'2john','ii john':'2john','2nd john':'2john','second john':'2john',
  // 3 John
  '3jn':'3john','3jo':'3john','3joh':'3john','3 john':'3john','3john':'3john',
  'iiijn':'3john','iii john':'3john','3rd john':'3john','third john':'3john',
  // Jude
  'jude':'jude','jud':'jude','jd':'jude',
  // Revelation
  'rev':'revelation','re':'revelation','rv':'revelation','revelation':'revelation','revelations':'revelation','apoc':'revelation','apocalypse':'revelation'
};

// ─── Canonical display titles ───
var BOOK_DISPLAY = {
  genesis:'Genesis',exodus:'Exodus',leviticus:'Leviticus',numbers:'Numbers',
  deuteronomy:'Deuteronomy',joshua:'Joshua',judges:'Judges',ruth:'Ruth',
  '1samuel':'1 Samuel','2samuel':'2 Samuel','1kings':'1 Kings','2kings':'2 Kings',
  '1chronicles':'1 Chronicles','2chronicles':'2 Chronicles',ezra:'Ezra',nehemiah:'Nehemiah',
  esther:'Esther',job:'Job',psalms:'Psalms',proverbs:'Proverbs',ecclesiastes:'Ecclesiastes',
  songofsolomon:'Song of Solomon',isaiah:'Isaiah',jeremiah:'Jeremiah',lamentations:'Lamentations',
  ezekiel:'Ezekiel',daniel:'Daniel',hosea:'Hosea',joel:'Joel',amos:'Amos',obadiah:'Obadiah',
  jonah:'Jonah',micah:'Micah',nahum:'Nahum',habakkuk:'Habakkuk',zephaniah:'Zephaniah',
  haggai:'Haggai',zechariah:'Zechariah',malachi:'Malachi',matthew:'Matthew',mark:'Mark',
  luke:'Luke',john:'John',acts:'Acts',romans:'Romans','1corinthians':'1 Corinthians',
  '2corinthians':'2 Corinthians',galatians:'Galatians',ephesians:'Ephesians',
  philippians:'Philippians',colossians:'Colossians','1thessalonians':'1 Thessalonians',
  '2thessalonians':'2 Thessalonians','1timothy':'1 Timothy','2timothy':'2 Timothy',
  titus:'Titus',philemon:'Philemon',hebrews:'Hebrews',james:'James','1peter':'1 Peter',
  '2peter':'2 Peter','1john':'1 John','2john':'2 John','3john':'3 John',jude:'Jude',
  revelation:'Revelation'
};

// ─── Named passages (~130 — exhaustive) ───
// { query keys: } → { bookId, chapter, verseStart?, verseEnd?, chapterEnd? }
// Multi-chapter ranges use chapterEnd. Multi-verse uses verseStart + verseEnd.
var NAMED_PASSAGES = [
  // ─── NT narrative ───
  { keys:['sermon on the mount','sermon mount'],                          bookId:'matthew',       chapter:5,  chapterEnd:7 },
  { keys:['beatitudes'],                                                   bookId:'matthew',       chapter:5,  verseStart:3,  verseEnd:12 },
  { keys:["lord's prayer",'lords prayer','our father','pater noster'],     bookId:'matthew',       chapter:6,  verseStart:9,  verseEnd:13 },
  { keys:['golden rule'],                                                  bookId:'matthew',       chapter:7,  verseStart:12 },
  { keys:['great commission'],                                             bookId:'matthew',       chapter:28, verseStart:18, verseEnd:20 },
  { keys:['good samaritan','parable good samaritan'],                      bookId:'luke',          chapter:10, verseStart:25, verseEnd:37 },
  { keys:['prodigal son','parable prodigal son'],                          bookId:'luke',          chapter:15, verseStart:11, verseEnd:32 },
  { keys:['rich young ruler'],                                             bookId:'matthew',       chapter:19, verseStart:16, verseEnd:30 },
  { keys:['good shepherd'],                                                bookId:'john',          chapter:10, verseStart:1,  verseEnd:18 },
  { keys:['bread of life'],                                                bookId:'john',          chapter:6 },
  { keys:['i am statements','i am sayings'],                               bookId:'john',          chapter:6 },
  { keys:['upper room discourse','farewell discourse'],                    bookId:'john',          chapter:13, chapterEnd:17 },
  { keys:['vine and branches','true vine'],                                bookId:'john',          chapter:15 },
  { keys:['high priestly prayer'],                                         bookId:'john',          chapter:17 },
  { keys:['olivet discourse'],                                             bookId:'matthew',       chapter:24, chapterEnd:25 },
  { keys:['seven woes','woes pharisees'],                                  bookId:'matthew',       chapter:23 },
  { keys:['passion narrative'],                                            bookId:'matthew',       chapter:26, chapterEnd:27 },
  { keys:['last supper'],                                                  bookId:'matthew',       chapter:26, verseStart:17, verseEnd:30 },
  { keys:['garden of gethsemane','gethsemane'],                            bookId:'matthew',       chapter:26, verseStart:36, verseEnd:46 },
  { keys:['crucifixion'],                                                  bookId:'matthew',       chapter:27, verseStart:27 },
  { keys:['resurrection'],                                                 bookId:'matthew',       chapter:28 },
  { keys:['road to emmaus','emmaus road'],                                 bookId:'luke',          chapter:24, verseStart:13, verseEnd:35 },
  { keys:['doubting thomas'],                                              bookId:'john',          chapter:20, verseStart:24, verseEnd:29 },
  { keys:['great catch of fish','miraculous catch'],                       bookId:'john',          chapter:21, verseStart:1,  verseEnd:14 },
  { keys:['transfiguration'],                                              bookId:'matthew',       chapter:17, verseStart:1,  verseEnd:13 },
  { keys:['walking on water'],                                             bookId:'matthew',       chapter:14, verseStart:22, verseEnd:33 },
  { keys:['feeding of the 5000','feeding five thousand','feeding 5000'],   bookId:'matthew',       chapter:14, verseStart:13, verseEnd:21 },
  { keys:['feeding of the 4000','feeding four thousand'],                  bookId:'matthew',       chapter:15, verseStart:32, verseEnd:39 },
  { keys:['nativity','birth of jesus','birth of christ'],                  bookId:'luke',          chapter:2,  verseStart:1,  verseEnd:20 },
  { keys:['wise men','magi','visit of the magi'],                          bookId:'matthew',       chapter:2,  verseStart:1,  verseEnd:12 },
  { keys:['flight to egypt','flight into egypt'],                          bookId:'matthew',       chapter:2,  verseStart:13, verseEnd:23 },
  { keys:['baptism of jesus','baptism of christ'],                         bookId:'matthew',       chapter:3,  verseStart:13, verseEnd:17 },
  { keys:['temptation of christ','temptation of jesus'],                   bookId:'matthew',       chapter:4,  verseStart:1,  verseEnd:11 },
  { keys:['wedding at cana','water into wine'],                            bookId:'john',          chapter:2,  verseStart:1,  verseEnd:11 },
  { keys:['woman at the well','samaritan woman'],                          bookId:'john',          chapter:4,  verseStart:1,  verseEnd:42 },
  { keys:['raising of lazarus','lazarus raised'],                          bookId:'john',          chapter:11 },
  { keys:['triumphal entry','palm sunday'],                                bookId:'matthew',       chapter:21, verseStart:1,  verseEnd:11 },
  { keys:['pentecost'],                                                    bookId:'acts',          chapter:2 },
  { keys:['conversion of saul','damascus road','saul conversion'],         bookId:'acts',          chapter:9,  verseStart:1,  verseEnd:19 },
  { keys:['macedonian call'],                                              bookId:'acts',          chapter:16, verseStart:6,  verseEnd:10 },
  { keys:['shipwreck','paul shipwreck'],                                   bookId:'acts',          chapter:27 },
  { keys:['widows mite',"widow's mite"],                                   bookId:'mark',          chapter:12, verseStart:41, verseEnd:44 },
  { keys:['sheep and goats','separating sheep goats'],                     bookId:'matthew',       chapter:25, verseStart:31, verseEnd:46 },
  { keys:['parable of the sower','sower parable'],                         bookId:'matthew',       chapter:13, verseStart:1,  verseEnd:23 },
  { keys:['parable of the talents','talents parable'],                     bookId:'matthew',       chapter:25, verseStart:14, verseEnd:30 },
  { keys:['parable of the ten virgins','ten virgins'],                     bookId:'matthew',       chapter:25, verseStart:1,  verseEnd:13 },

  // ─── NT doctrine ───
  { keys:['armor of god','whole armor of god'],                            bookId:'ephesians',     chapter:6,  verseStart:10, verseEnd:18 },
  { keys:['fruit of the spirit'],                                          bookId:'galatians',     chapter:5,  verseStart:22, verseEnd:23 },
  { keys:['works of the flesh','fruits of the flesh'],                     bookId:'galatians',     chapter:5,  verseStart:19, verseEnd:21 },
  { keys:['love chapter','charity chapter','chapter on love'],             bookId:'1corinthians',  chapter:13 },
  { keys:['faith chapter','hall of faith'],                                bookId:'hebrews',       chapter:11 },
  { keys:['roman road','romans road','road to salvation'],                 bookId:'romans',        chapter:3,  verseStart:23 },
  { keys:['gifts of the spirit','spiritual gifts'],                        bookId:'1corinthians',  chapter:12 },
  { keys:['body of christ'],                                               bookId:'1corinthians',  chapter:12, verseStart:12, verseEnd:27 },
  { keys:['mind of christ'],                                               bookId:'1corinthians',  chapter:2,  verseStart:16 },
  { keys:['new creation'],                                                 bookId:'2corinthians',  chapter:5,  verseStart:17 },
  { keys:['predestination'],                                               bookId:'romans',        chapter:8,  verseStart:28, verseEnd:30 },
  { keys:['justification by faith'],                                       bookId:'romans',        chapter:5 },
  { keys:['all things work together','romans 8','nothing can separate','more than conquerors'], bookId:'romans', chapter:8 },
  { keys:['philippian hymn','philippians hymn','kenosis hymn'],            bookId:'philippians',   chapter:2,  verseStart:5,  verseEnd:11 },
  { keys:['colossian hymn','christ hymn'],                                 bookId:'colossians',    chapter:1,  verseStart:15, verseEnd:20 },
  { keys:['household code','household codes'],                             bookId:'ephesians',     chapter:5,  verseStart:22, verseEnd:33 },
  { keys:['faith without works'],                                          bookId:'james',         chapter:2 },
  { keys:['tongue is a fire','taming the tongue'],                         bookId:'james',         chapter:3 },

  // ─── OT narrative (Genesis) ───
  { keys:['creation','creation account','creation story','in the beginning'], bookId:'genesis',    chapter:1 },
  { keys:['fall of man','fall','the fall','garden of eden','adam and eve'], bookId:'genesis',      chapter:3 },
  { keys:['cain and abel'],                                                bookId:'genesis',       chapter:4 },
  { keys:['noahs ark',"noah's ark",'the flood','noah and the flood'],      bookId:'genesis',       chapter:6,  chapterEnd:9 },
  { keys:['tower of babel'],                                               bookId:'genesis',       chapter:11 },
  { keys:['call of abraham','abraham called'],                             bookId:'genesis',       chapter:12 },
  { keys:['covenant with abraham','abrahamic covenant'],                   bookId:'genesis',       chapter:15 },
  { keys:['binding of isaac','akedah','sacrifice of isaac'],               bookId:'genesis',       chapter:22 },
  { keys:['jacobs ladder',"jacob's ladder"],                               bookId:'genesis',       chapter:28, verseStart:10, verseEnd:22 },
  { keys:['wrestling with the angel','jacob wrestling'],                   bookId:'genesis',       chapter:32, verseStart:22 },
  { keys:["joseph's coat",'josephs coat','coat of many colors'],           bookId:'genesis',       chapter:37 },
  { keys:['joseph in egypt'],                                              bookId:'genesis',       chapter:39, chapterEnd:50 },
  { keys:['sodom and gomorrah'],                                           bookId:'genesis',       chapter:19 },

  // ─── OT narrative (Exodus-Deuteronomy) ───
  { keys:['moses in the basket','baby moses'],                             bookId:'exodus',        chapter:2,  verseStart:1,  verseEnd:10 },
  { keys:['burning bush'],                                                 bookId:'exodus',        chapter:3 },
  { keys:['ten plagues','plagues of egypt'],                               bookId:'exodus',        chapter:7,  chapterEnd:12 },
  { keys:['passover'],                                                     bookId:'exodus',        chapter:12 },
  { keys:['red sea crossing','parting of the red sea'],                    bookId:'exodus',        chapter:14 },
  { keys:['manna from heaven','manna'],                                    bookId:'exodus',        chapter:16 },
  { keys:['ten commandments','decalogue'],                                 bookId:'exodus',        chapter:20, verseStart:1,  verseEnd:17 },
  { keys:['golden calf'],                                                  bookId:'exodus',        chapter:32 },
  { keys:['tabernacle'],                                                   bookId:'exodus',        chapter:25 },
  { keys:['shema','hear o israel'],                                        bookId:'deuteronomy',   chapter:6,  verseStart:4,  verseEnd:9 },
  { keys:['priestly blessing','aaronic blessing'],                         bookId:'numbers',       chapter:6,  verseStart:24, verseEnd:26 },
  { keys:['twelve spies','spies canaan'],                                  bookId:'numbers',       chapter:13 },
  { keys:["balaams donkey","balaam's donkey",'balaam'],                    bookId:'numbers',       chapter:22 },

  // ─── OT narrative (Joshua-Kings) ───
  { keys:['walls of jericho','jericho'],                                   bookId:'joshua',        chapter:6 },
  { keys:['deborah and barak'],                                            bookId:'judges',        chapter:4 },
  { keys:["gideons fleece","gideon's fleece",'gideon'],                    bookId:'judges',        chapter:6 },
  { keys:['samson and delilah','samson'],                                  bookId:'judges',        chapter:16 },
  { keys:['ruth and boaz','ruth boaz'],                                    bookId:'ruth',          chapter:2 },
  { keys:["hannah's prayer",'hannahs prayer'],                             bookId:'1samuel',       chapter:2,  verseStart:1,  verseEnd:10 },
  { keys:["samuels call","samuel's call"],                                 bookId:'1samuel',       chapter:3 },
  { keys:['saul anointed','anointing of saul'],                            bookId:'1samuel',       chapter:10 },
  { keys:['david and goliath'],                                            bookId:'1samuel',       chapter:17 },
  { keys:['david and jonathan'],                                           bookId:'1samuel',       chapter:18 },
  { keys:['david and bathsheba'],                                          bookId:'2samuel',       chapter:11 },
  { keys:["absaloms rebellion","absalom's rebellion"],                     bookId:'2samuel',       chapter:15 },
  { keys:["solomons wisdom","solomon's wisdom"],                           bookId:'1kings',        chapter:3 },
  { keys:['temple dedication'],                                            bookId:'1kings',        chapter:8 },
  { keys:['queen of sheba'],                                               bookId:'1kings',        chapter:10 },
  { keys:['elijah on mount carmel','prophets of baal'],                    bookId:'1kings',        chapter:18 },
  { keys:["elijahs chariot","elijah's chariot",'chariot of fire'],         bookId:'2kings',        chapter:2 },
  { keys:["elishas mantle","elisha's mantle"],                             bookId:'2kings',        chapter:2 },
  { keys:['naaman the leper','naaman'],                                    bookId:'2kings',        chapter:5 },
  { keys:["hezekiahs prayer","hezekiah's prayer"],                         bookId:'2kings',        chapter:19 },
  { keys:["josiahs reforms","josiah's reforms"],                           bookId:'2kings',        chapter:23 },
  { keys:['fall of jerusalem'],                                            bookId:'2kings',        chapter:25 },

  // ─── OT prophetic ───
  { keys:['shepherd psalm','psalm 23',"lord is my shepherd"],              bookId:'psalms',        chapter:23 },
  { keys:['psalm 1','blessed is the man'],                                 bookId:'psalms',        chapter:1 },
  { keys:['psalm 51','create in me a clean heart'],                        bookId:'psalms',        chapter:51 },
  { keys:['psalm 91','he who dwells'],                                     bookId:'psalms',        chapter:91 },
  { keys:['psalm 119'],                                                    bookId:'psalms',        chapter:119 },
  { keys:['psalm 139','fearfully and wonderfully made'],                   bookId:'psalms',        chapter:139 },
  { keys:['suffering servant','isaiah 53'],                                bookId:'isaiah',        chapter:53 },
  { keys:['emmanuel prophecy','virgin birth prophecy','isaiah 7'],         bookId:'isaiah',        chapter:7,  verseStart:14 },
  { keys:['for unto us a child is born','isaiah 9'],                       bookId:'isaiah',        chapter:9,  verseStart:6,  verseEnd:7 },
  { keys:['throne room vision','isaiah 6','holy holy holy'],               bookId:'isaiah',        chapter:6 },
  { keys:['valley of dry bones','dry bones'],                              bookId:'ezekiel',       chapter:37 },
  { keys:['son of man vision','daniel 7'],                                 bookId:'daniel',        chapter:7 },
  { keys:['seventy weeks','70 weeks'],                                     bookId:'daniel',        chapter:9,  verseStart:24, verseEnd:27 },
  { keys:['fiery furnace','shadrach meshach abednego'],                    bookId:'daniel',        chapter:3 },
  { keys:['lions den',"lion's den",'daniel in the lions den'],             bookId:'daniel',        chapter:6 },
  { keys:['writing on the wall','mene mene tekel'],                        bookId:'daniel',        chapter:5 },
  { keys:['jonah and the fish','jonah and the whale'],                     bookId:'jonah',         chapter:1 },
  { keys:['valley of decision'],                                           bookId:'joel',          chapter:3,  verseStart:14 },

  // ─── Revelation ───
  { keys:['four horsemen','4 horsemen','horsemen apocalypse'],             bookId:'revelation',    chapter:6 },
  { keys:['seven seals','7 seals'],                                        bookId:'revelation',    chapter:6 },
  { keys:['seven trumpets','7 trumpets'],                                  bookId:'revelation',    chapter:8,  chapterEnd:11 },
  { keys:['seven bowls','7 bowls','seven vials','seven plagues revelation'], bookId:'revelation',  chapter:16 },
  { keys:['woman and dragon','woman clothed with the sun'],                bookId:'revelation',    chapter:12 },
  { keys:['two witnesses'],                                                bookId:'revelation',    chapter:11,  verseStart:1,  verseEnd:14 },
  { keys:['mark of the beast','666'],                                      bookId:'revelation',    chapter:13 },
  { keys:['whore of babylon','harlot babylon','mystery babylon'],          bookId:'revelation',    chapter:17 },
  { keys:['millennial reign','1000 year reign','millennium'],              bookId:'revelation',    chapter:20 },
  { keys:['great white throne','white throne judgment'],                   bookId:'revelation',    chapter:20, verseStart:11 },
  { keys:['new jerusalem','holy city'],                                    bookId:'revelation',    chapter:21 },
  { keys:['tree of life'],                                                 bookId:'revelation',    chapter:22,  verseStart:1,  verseEnd:5 }
];

// Flatten to lookup: every key → passage entry
var NAMED_PASSAGE_INDEX = {};
for (var _np = 0; _np < NAMED_PASSAGES.length; _np++) {
  var _entry = NAMED_PASSAGES[_np];
  for (var _k = 0; _k < _entry.keys.length; _k++) {
    NAMED_PASSAGE_INDEX[_entry.keys[_k].toLowerCase()] = _entry;
  }
}

// ─── Synonym expansion (scripture-aware, bi-directional) ───
// Each group: a token matches any member; query is expanded to include all.
var SYNONYM_GROUPS = [
  ['mercy','compassion','pity','loving-kindness','lovingkindness','chesed'],
  ['love','charity','agape'],
  ['flesh','body','carnal','carnality'],
  ['spirit','ruach','pneuma','ghost'],
  ['word','logos','rhema'],
  // NOTE: the generic words 'lord' / 'god' / 'father' were intentionally trimmed
  // from these two name groups — they are far too common to expand every query
  // into the full set of messianic / deity names. The name<->name synonyms stay.
  ['yahushua','yeshua','yahshua','yahusha','yeshu','jesus','christ','messiah'],
  ['yahuwah','yahweh','yhwh','jehovah','elohim','adonai'],
  ['holy spirit','holy ghost','ruach hakodesh','comforter','advocate','helper'],
  ['heaven','heavens','paradise','celestial'],
  ['hell','sheol','hades','gehenna','grave','pit','lake of fire'],
  ['satan','devil','adversary','accuser','lucifer','dragon','serpent'],
  ['angel','angels','messenger','heavenly host'],
  ['prayer','supplication','intercession','petition'],
  ['sin','iniquity','transgression','trespass','wickedness'],
  ['salvation','saved','redemption','deliverance'],
  ['faith','belief','trust'],
  ['repent','repentance','turn','return'],
  ['forgive','forgiveness','pardon','remission'],
  ['resurrection','raised','rising','rose again'],
  ['righteous','righteousness','just','justified','justification'],
  ['gospel','good news','evangel'],
  ['kingdom','reign','dominion'],
  ['sabbath','rest','shabbat'],
  ['commandment','law','torah','precept','statute','ordinance'],
  ['prophet','prophecy','prophesy','seer'],
  ['temple','sanctuary','tabernacle','house of god'],
  ['sacrifice','offering','oblation'],
  ['covenant','testament','pact'],
  ['anxious','anxiety','worry','worried','fear','fearful','afraid'],
  ['joy','joyful','rejoice','gladness'],
  ['peace','shalom','tranquility'],
  ['grace','favor','unmerited favor'],
  ['truth','veracity','verity'],
  ['wisdom','understanding','knowledge','discernment'],
  ['heart','soul','mind','inner being'],
  ['light','illumination','brightness'],
  ['darkness','dark','shadow','night'],
  ['water','waters','sea','ocean'],
  ['fire','flame','burning'],
  ['blood','lifeblood'],
  ['bread','loaf','manna'],
  ['wine','vine','cup'],
  ['sheep','flock','lamb'],
  ['shepherd','pastor'],
  ['wolf','wolves','beast','beasts'],
  ['enemy','foe','adversary'],
  ['friend','brother','neighbor'],
  ['king','ruler','monarch','sovereign'],
  ['servant','slave','bondservant','handmaid'],
  ['nation','gentile','heathen','pagan'],
  ['end times','last days','end of age','end of the world','tribulation','apocalypse','eschaton']
];

var SYNONYM_MAP = {};
for (var _sg = 0; _sg < SYNONYM_GROUPS.length; _sg++) {
  var _group = SYNONYM_GROUPS[_sg];
  for (var _gi = 0; _gi < _group.length; _gi++) {
    SYNONYM_MAP[_group[_gi].toLowerCase()] = _group;
  }
}

// ─── Simple Porter-style stemmer (compact, tailored for scripture English) ───
// Strips common inflections: plurals, -ing, -ed, -ly, -ness, -ment, -tion, -ation.
function stemWord(w) {
  if (!w || w.length < 4) return w;
  w = w.toLowerCase();
  var endings = [
    'ational','ization','fulness','ousness','iveness','icate','ically',
    'ation','ement','ation','ities','eness','ement','ation',
    'ness','ment','tion','sion','able','ible','ance','ence','ship',
    'less','ful','ous','ive','ize','ise','ing','ed','ly','es','s',
    'er','or','al'
  ];
  for (var i = 0; i < endings.length; i++) {
    var e = endings[i];
    if (w.length > e.length + 2 && w.endsWith(e)) {
      var stem = w.slice(0, w.length - e.length);
      // guard against over-stemming short stems
      if (stem.length >= 3) return stem;
    }
  }
  return w;
}

// ─── Phonetic key (Soundex-like, tuned for names) ───
function phoneticKey(s) {
  if (!s) return '';
  s = s.toLowerCase().replace(/[^a-z]/g, '');
  if (!s) return '';
  var map = {b:'1',f:'1',p:'1',v:'1',c:'2',g:'2',j:'2',k:'2',q:'2',s:'2',x:'2',z:'2',
             d:'3',t:'3',l:'4',m:'5',n:'5',r:'6'};
  var out = s[0].toUpperCase();
  var last = map[s[0]] || '';
  for (var i = 1; i < s.length; i++) {
    var c = map[s[i]] || '';
    if (c && c !== last) out += c;
    last = c;
    if (out.length >= 4) break;
  }
  while (out.length < 4) out += '0';
  return out;
}

// ─── Word numbers (for "Letter Five" etc.) ───
var WORD_NUMS = {
  one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,
  eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,
  seventeen:17,eighteen:18,nineteen:19,twenty:20,
  thirty:30,forty:40,fifty:50,sixty:60,seventy:70,eighty:80,ninety:90,
  hundred:100,thousand:1000
};
var ROMAN_NUMS = { i:1, ii:2, iii:3, iv:4, v:5, vi:6, vii:7 };

// ─── Volume collection metadata ───
// Maps user-friendly volume tokens to screen + data globals.
// Populated at runtime in search.js (since data globals aren't loaded yet at data module parse time).
var VOLUME_COLLECTIONS = [
  { tokens:['v1','vol1','volume1','volumeone','one'],          id:'v1',       screen:'vot-one-letter',     dataVar:'LETTERS_V1',       prefaceVar:'LETTERS_V1_PREFACE',       label:'Volume One',    activeKey:'vol:one' },
  { tokens:['v2','vol2','volume2','volumetwo','two'],          id:'v2',       screen:'vot-letter',         dataVar:'LETTERS',          prefaceVar:null,                       label:'Volume Two',    activeKey:'vol:two' },
  { tokens:['v3','vol3','volume3','volumethree','three'],      id:'v3',       screen:'vot-three-letter',   dataVar:'LETTERS_V3',       prefaceVar:'LETTERS_V3_PREFACE',       label:'Volume Three',  activeKey:'vol:three' },
  { tokens:['v4','vol4','volume4','volumefour','four'],        id:'v4',       screen:'vot-four-letter',    dataVar:'LETTERS_V4',       prefaceVar:'LETTERS_V4_PREFACE',       label:'Volume Four',   activeKey:'vol:four' },
  { tokens:['v5','vol5','volume5','volumefive','five'],        id:'v5',       screen:'vot-five-letter',    dataVar:'LETTERS_V5',       prefaceVar:'LETTERS_V5_PREFACE',       label:'Volume Five',   activeKey:'vol:five' },
  { tokens:['v6','vol6','volume6','volumesix','six'],          id:'v6',       screen:'vot-six-letter',     dataVar:'LETTERS_V6',       prefaceVar:'LETTERS_V6_PREFACE',       label:'Volume Six',    activeKey:'vol:six' },
  { tokens:['v7','vol7','volume7','volumeseven','seven'],      id:'v7',       screen:'vot-seven-letter',   dataVar:'LETTERS_V7',       prefaceVar:'LETTERS_V7_PREFACE',       label:'Volume Seven',  activeKey:'vol:seven' },
  { tokens:['timothy','lft','letterstimothy','lettersfromtimothy','lt'], id:'timothy', screen:'vot-timothy-letter', dataVar:'LETTERS_TIMOTHY', prefaceVar:'LETTERS_TIMOTHY_PREFACE', label:"Letters from Timothy", activeKey:'vol:timothy' },
  { tokens:['flock','llf','littleflock','letterstolittleflock','lf'],    id:'flock',   screen:'vot-flock-letter',   dataVar:'LETTERS_FLOCK',   prefaceVar:'LETTERS_FLOCK_PREFACE',   label:"Letters to The Lord's Little Flock", activeKey:'vol:flock' },
  { tokens:['rebuke','lr','lordsrebuke','testamentagainstworld'],        id:'rebuke',  screen:'vot-rebuke-letter',  dataVar:'LETTERS_REBUKE',  prefaceVar:'LETTERS_REBUKE_PREFACE',  label:"A Testament Against The World: The Lord's Rebuke", activeKey:'vol:rebuke' },
  { tokens:['blessed','theblessed','tb'],                                id:'blessed', screen:'blessed-entry',      dataVar:'THE_BLESSED',     prefaceVar:null,                      label:'The Blessed',   activeKey:'vol:blessed' },
  { tokens:['wtlb1','wtlbone','wtlb_one','wordstoliveby1','wordstolivebyone','wordstoliveby partone','wtlbp1'], id:'wtlb1', screen:'wtlb-one-entry', dataVar:'WTLB_ONE', prefaceVar:null, label:'Words To Live By: Part One', activeKey:'vol:wtlb1' },
  { tokens:['wtlb2','wtlbtwo','wtlb_two','wordstoliveby2','wordstolivebytwo','wordstoliveby parttwo','wtlbp2'], id:'wtlb2', screen:'wtlb-two-entry', dataVar:'WTLB_TWO', prefaceVar:null, label:'Words To Live By: Part Two', activeKey:'vol:wtlb2' },
  { tokens:['holydays','hd','holy_days'],                                id:'holydays',screen:'holy-days-entry',    dataVar:'HOLY_DAYS',       prefaceVar:null,                      label:'Holy Days',     activeKey:'vol:holydays' }
];

var VOLUME_TOKEN_MAP = {};
for (var _vc = 0; _vc < VOLUME_COLLECTIONS.length; _vc++) {
  var _v = VOLUME_COLLECTIONS[_vc];
  for (var _t = 0; _t < _v.tokens.length; _t++) {
    VOLUME_TOKEN_MAP[_v.tokens[_t].toLowerCase()] = _v;
  }
}

// ─── BIBLE_BOOK_LIST canonical order for reverse lookup/filters ───
var OT_BOOK_IDS = [
  'genesis','exodus','leviticus','numbers','deuteronomy','joshua','judges','ruth',
  '1samuel','2samuel','1kings','2kings','1chronicles','2chronicles','ezra','nehemiah',
  'esther','job','psalms','proverbs','ecclesiastes','songofsolomon','isaiah','jeremiah',
  'lamentations','ezekiel','daniel','hosea','joel','amos','obadiah','jonah','micah',
  'nahum','habakkuk','zephaniah','haggai','zechariah','malachi'
];
var NT_BOOK_IDS = [
  'matthew','mark','luke','john','acts','romans','1corinthians','2corinthians','galatians',
  'ephesians','philippians','colossians','1thessalonians','2thessalonians','1timothy',
  '2timothy','titus','philemon','hebrews','james','1peter','2peter','1john','2john','3john',
  'jude','revelation'
];

// ─── Genre groups for facet filters ───
var GENRE_GROUPS = {
  'law':      ['genesis','exodus','leviticus','numbers','deuteronomy'],
  'history':  ['joshua','judges','ruth','1samuel','2samuel','1kings','2kings','1chronicles','2chronicles','ezra','nehemiah','esther'],
  'poetry':   ['job','psalms','proverbs','ecclesiastes','songofsolomon'],
  'major-prophets': ['isaiah','jeremiah','lamentations','ezekiel','daniel'],
  'minor-prophets': ['hosea','joel','amos','obadiah','jonah','micah','nahum','habakkuk','zephaniah','haggai','zechariah','malachi'],
  'gospels':  ['matthew','mark','luke','john'],
  'acts':     ['acts'],
  'epistles-paul': ['romans','1corinthians','2corinthians','galatians','ephesians','philippians','colossians','1thessalonians','2thessalonians','1timothy','2timothy','titus','philemon','hebrews'],
  'epistles-general': ['james','1peter','2peter','1john','2john','3john','jude'],
  'revelation': ['revelation']
};

// ─── Command palette ───
var COMMANDS = [
  { keys:['/random','random'],            action:'random',         label:'Random verse or letter' },
  { keys:['/home','/go home'],            action:'home',           label:'Go home' },
  { keys:['/settings','/go settings'],    action:'settings',       label:'Open settings' },
  { keys:['/scriptures','/go scriptures'],action:'scriptures',     label:'Go to scriptures' },
  { keys:['/volumes','/go volumes'],      action:'volumes',        label:'Go to volumes' },
  { keys:['/clear history'],              action:'clear-history',  label:'Clear search history' },
  { keys:['/clear','/clear search'],      action:'clear-query',    label:'Clear current search' },
  { keys:['/help'],                       action:'help',           label:'Show search help' },
  { keys:['/rebuild index','/reindex'],   action:'rebuild-index',  label:'Rebuild search index' }
];
var COMMAND_MAP = {};
for (var _c = 0; _c < COMMANDS.length; _c++) {
  for (var _ck = 0; _ck < COMMANDS[_c].keys.length; _ck++) {
    COMMAND_MAP[COMMANDS[_c].keys[_ck].toLowerCase()] = COMMANDS[_c];
  }
}

// ─── Export ───
window.VotSearchData = {
  STOP_WORDS: STOP_WORDS,
  STOP_WORDS_TRIMMED: STOP_WORDS_TRIMMED,
  SYNONYM_MAP: SYNONYM_MAP,   // SR4: scripture-aware synonym expansion (opt-in via settings.searchSynonyms)
  BOOK_ABBREVS: BOOK_ABBREVS,
  BOOK_DISPLAY: BOOK_DISPLAY,
  NAMED_PASSAGES: NAMED_PASSAGES,
  NAMED_PASSAGE_INDEX: NAMED_PASSAGE_INDEX,
  WORD_NUMS: WORD_NUMS,
  ROMAN_NUMS: ROMAN_NUMS,
  VOLUME_COLLECTIONS: VOLUME_COLLECTIONS,
  VOLUME_TOKEN_MAP: VOLUME_TOKEN_MAP,
  OT_BOOK_IDS: OT_BOOK_IDS,
  NT_BOOK_IDS: NT_BOOK_IDS,
  GENRE_GROUPS: GENRE_GROUPS,
  COMMANDS: COMMANDS,
  COMMAND_MAP: COMMAND_MAP
};

})();
