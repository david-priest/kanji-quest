// Build data/readings.json: a small curated set of short Japanese
// reading passages, each tokenised with furigana, plus an English
// translation. Two sources:
//
//   1. Aozora Bunko — public-domain folk-tale openings (typically N2/N3
//      difficulty). Fetched live, then the ruby annotations in the
//      original HTML are preserved verbatim; any remaining kanji that
//      weren't ruby-annotated get readings from kuromoji.js.
//   2. Hand-picked Tatoeba sentences (CC-BY 2.0 FR) stitched into
//      short thematic paragraphs at N5/N4 levels. Tokenised entirely
//      via kuromoji.js.
//
// Output shape (one entry per reading):
//   { id, title, titleEn, source, sourceUrl, license, level, tokens, en }
//
// Usage: node scripts/build-readings.mjs

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const kuromoji = require("kuromoji");

const dicPath = path.join(__dirname, "..", "node_modules", "kuromoji", "dict");
const kanjiPath = path.join(__dirname, "..", "data", "jlpt-kanji.json");
const outPath = path.join(__dirname, "..", "data", "readings.json");
const tatoebaDir = "/tmp/tatoeba";
const jpnPath = path.join(tatoebaDir, "jpn_sentences.tsv");
const engPath = path.join(tatoebaDir, "eng_sentences.tsv");
const linksPath = path.join(tatoebaDir, "jpn-eng_links.tsv");

const kanji = JSON.parse(fs.readFileSync(kanjiPath, "utf8"));
const kanjiByChar = new Map(kanji.map((k) => [k.c, k]));

// Kanji partitioned by JLPT level for difficulty caps
const kanjiByLevel = { 5: new Set(), 4: new Set(), 3: new Set(), 2: new Set(), 1: new Set() };
for (const k of kanji) if (kanjiByLevel[k.n]) kanjiByLevel[k.n].add(k.c);
function allowedKanjiUpTo(maxLevel) {
  const s = new Set();
  for (const lvl of [5, 4, 3, 2, 1]) {
    for (const c of kanjiByLevel[lvl]) s.add(c);
    if (lvl === maxLevel) break;
  }
  return s;
}

const AOZORA = [
  {
    id: "momotaro",
    title: "桃太郎",
    titleEn: "Momotaro (The Peach Boy)",
    author: "楠山 正雄",
    url: "https://www.aozora.gr.jp/cards/000329/files/18376_12100.html",
    sentenceLimit: 4,
    en: "Long, long ago, there lived an old man and an old woman. Every day the old man went to the mountain to gather firewood, and the old woman went to the river to do the washing. One day, while the old woman was busy washing by the river, a huge peach came floating down from upstream — bobbing along.",
  },
  {
    id: "urashima",
    title: "浦島太郎",
    titleEn: "Urashima Tarō",
    author: "楠山 正雄",
    url: "https://www.aozora.gr.jp/cards/000329/files/3390_33153.html",
    sentenceLimit: 4,
    en: "Long ago, in a certain place, there lived a fisherman named Urashima Tarō. One day, as he was on his way home from fishing, he came upon a group of children gathered on the beach, making a loud racket. They had caught a small turtle, and were striking it with sticks, throwing it about, and tormenting it in every way.",
  },
  {
    id: "issun-boshi",
    title: "一寸法師",
    titleEn: "Issun-bōshi (One-Inch Boy)",
    author: "楠山 正雄",
    url: "https://www.aozora.gr.jp/cards/000329/files/43457_23938.html",
    sentenceLimit: 4,
    en: "Long, long ago, in a certain place, there lived an old man and an old woman. They had no child, and were very lonely about it. So one day they prayed to the local shrine, asking: please grant us a child — even one no bigger than the tip of a finger.",
  },
  {
    id: "oniroku",
    title: "大工と鬼六",
    titleEn: "The Carpenter and Oniroku",
    author: "楠山 正雄",
    url: "https://www.aozora.gr.jp/cards/000329/files/18389_11945.html",
    sentenceLimit: 4,
    en: "Long, long ago, in a certain place, there flowed a great river. It was so swift and turbulent that even the most skilled carpenter could never build a bridge across it. Every time one was built, the very next day a flood would come and wash it away.",
  },
  {
    id: "kintaro",
    title: "金太郎",
    titleEn: "Kintarō (The Golden Boy)",
    author: "楠山 正雄",
    url: "https://www.aozora.gr.jp/cards/000329/files/18337_11942.html",
    sentenceLimit: 4,
    en: "Long, long ago, deep in the mountains of Ashigara, there lived a little boy called Kintarō. His mother, Yamauba, was a mountain witch, and so the boy was very strong from the day he was born — strong enough to wrestle bears as playmates.",
  },
  {
    id: "nezumi-yomeiri",
    title: "ねずみの嫁入り",
    titleEn: "The Mouse's Wedding",
    author: "楠山 正雄",
    url: "https://www.aozora.gr.jp/cards/000329/files/18335_11944.html",
    sentenceLimit: 4,
    en: "Long ago, in a certain country, there was a mouse father and mother who had one beautiful daughter. They wanted to give her in marriage to the very greatest being in all the world. After much thought, they decided that nothing in the world was greater than the sun — so they would marry her to the sun.",
  },
  {
    id: "bunbuku",
    title: "文福茶がま",
    titleEn: "Bunbuku Chagama (The Magic Tea-Kettle)",
    author: "楠山 正雄",
    url: "https://www.aozora.gr.jp/cards/000329/files/18336_11941.html",
    sentenceLimit: 4,
    en: "Long ago, in the country of Jōshū, at a temple called Morinji, there lived an old priest. The priest treasured a single iron tea-kettle. One day, he decided to use it to boil water for tea — but as the kettle grew hot on the fire, something very strange happened.",
  },
  {
    id: "osho-kozo",
    title: "和尚さんと小僧",
    titleEn: "The Priest and the Little Monk",
    author: "楠山 正雄",
    url: "https://www.aozora.gr.jp/cards/000329/files/18387_11946.html",
    sentenceLimit: 4,
    en: "Long ago, at a certain temple, there lived an old priest and one little novice monk. The priest was rather stingy, and whenever someone gave him sweets, he would hide them away so that he could eat them all by himself. The little monk, watching this, thought it most unfair.",
  },
  {
    id: "urikohime",
    title: "瓜子姫子",
    titleEn: "Urikohime (The Melon Princess)",
    author: "楠山 正雄",
    url: "https://www.aozora.gr.jp/cards/000329/files/43459_24404.html",
    sentenceLimit: 4,
    en: "Long, long ago, in a certain place, there lived an old man and an old woman. They had no children, and felt terribly lonely. One day, as the old woman was washing clothes by the river, a large melon came floating down to her — bobbing on the current.",
  },
  {
    id: "kumo-no-ito",
    title: "蜘蛛の糸",
    titleEn: "The Spider's Thread",
    author: "芥川 龍之介",
    url: "https://www.aozora.gr.jp/cards/000879/files/92_14545.html",
    sentenceLimit: 3,
    en: "One day, the Buddha was wandering alone by the edge of the Pond of Lotuses in Paradise. The lotuses blooming on the pond were all perfect, white as jewels, and from their golden centres rose a fragrance that filled the air with an indescribable, exquisite scent.",
  },
  {
    id: "ryori-ten",
    title: "注文の多い料理店",
    titleEn: "The Restaurant of Many Orders",
    author: "宮沢 賢治",
    url: "https://www.aozora.gr.jp/cards/000081/files/43754_17659.html",
    sentenceLimit: 4,
    en: "Two young gentlemen, splendidly equipped like British soldiers, with shining new rifles slung over their shoulders, were tramping through the mountains at a place so deep that even the leaves seemed to whisper. With them they had brought two big dogs the colour of polar bears.",
  },
];

// Bulk Aozora additions — many more public-domain folk tales from
// Kusuyama Masao plus a few from other PD authors. No English
// translation included for these; users who want one can look up the
// full text via the source link.
const AOZORA_BULK = [
  ["akai-tama",       "赤い玉",            "The Red Jewel",                    "楠山 正雄", "https://www.aozora.gr.jp/cards/000329/files/33207_17213.html"],
  ["adachigahara",    "安達が原",          "Adachigahara",                     "楠山 正雄", "https://www.aozora.gr.jp/cards/000329/files/33208_13245.html"],
  ["ushiwaka",        "牛若と弁慶",        "Ushiwaka and Benkei",              "楠山 正雄", "https://www.aozora.gr.jp/cards/000329/files/18384_14265.html"],
  ["oeyama",          "大江山",            "Mount Ōe",                         "楠山 正雄", "https://www.aozora.gr.jp/cards/000329/files/18339_13246.html"],
  ["kuzunoha",        "葛の葉狐",          "Kuzunoha the Fox",                 "楠山 正雄", "https://www.aozora.gr.jp/cards/000329/files/18386_13247.html"],
  ["nagai-na",        "長い名",            "The Long Name",                    "楠山 正雄", "https://www.aozora.gr.jp/cards/000329/files/18388_11943.html"],
  ["mono-no-iware",   "物のいわれ",        "The Origins of Things",            "楠山 正雄", "https://www.aozora.gr.jp/cards/000329/files/18390_13254.html"],
  ["ippon-no-wara",   "一本のわら",        "A Single Straw",                   "楠山 正雄", "https://www.aozora.gr.jp/cards/000329/files/43458_23936.html"],
  ["obasuteyama",     "姨捨山",            "Obasuteyama",                      "楠山 正雄", "https://www.aozora.gr.jp/cards/000329/files/43460_24403.html"],
  ["tawara-toda",     "田原藤太",          "Tawara Tōda",                      "楠山 正雄", "https://www.aozora.gr.jp/cards/000329/files/18338_13249.html"],
  ["rashomon-folk",   "羅生門",            "Rashomon (folk version)",          "楠山 正雄", "https://www.aozora.gr.jp/cards/000329/files/18340_13256.html"],
  ["hachimantaro",    "八幡太郎",          "Hachiman Tarō",                    "楠山 正雄", "https://www.aozora.gr.jp/cards/000329/files/18341_13252.html"],
  ["nue",             "鵺",                "Nue",                              "楠山 正雄", "https://www.aozora.gr.jp/cards/000329/files/18342_13251.html"],
  ["kaminari-no-sazuke","雷のさずけもの",  "The Thunder's Gift",               "楠山 正雄", "https://www.aozora.gr.jp/cards/000329/files/33209_14866.html"],
  ["shiroi-tori",     "白い鳥",            "The White Bird",                   "楠山 正雄", "https://www.aozora.gr.jp/cards/000329/files/33210_13248.html"],
  ["chugi-na-inu",    "忠義な犬",          "The Loyal Dog",                    "楠山 正雄", "https://www.aozora.gr.jp/cards/000329/files/33211_13250.html"],
  ["kachi-kachi",     "かちかち山",        "Kachi-kachi Yama",                 "楠山 正雄", "https://www.aozora.gr.jp/cards/000329/files/18377_11982.html"],
  ["shita-kiri",      "舌切りすずめ",      "The Tongue-Cut Sparrow",           "楠山 正雄", "https://www.aozora.gr.jp/cards/000329/files/18378_12098.html"],
  ["kurage-tsukai",   "くらげのお使い",    "The Jellyfish's Errand",           "楠山 正雄", "https://www.aozora.gr.jp/cards/000329/files/18379_12097.html"],
  ["neko-no-soshi",   "猫の草紙",          "The Cat's Tale",                   "楠山 正雄", "https://www.aozora.gr.jp/cards/000329/files/18380_12099.html"],
  ["yumedono",        "夢殿",              "The Hall of Dreams",               "楠山 正雄", "https://www.aozora.gr.jp/cards/000329/files/18381_14262.html"],
  ["tamura-shogun",   "田村将軍",          "General Tamura",                   "楠山 正雄", "https://www.aozora.gr.jp/cards/000329/files/18382_14263.html"],
  ["chinzei-hachiro", "鎮西八郎",          "Chinzei Hachirō",                  "楠山 正雄", "https://www.aozora.gr.jp/cards/000329/files/18383_14264.html"],
];
for (const [id, title, titleEn, author, url] of AOZORA_BULK) {
  AOZORA.push({ id, title, titleEn, author, url, sentenceLimit: 4 });
}

// Hand-picked Tatoeba sentences (verified in jpn_sentences.tsv), stitched
// into mini paragraphs by theme. English translations written from the
// Japanese. All sentences are CC-BY 2.0 FR via Tatoeba.
const TATOEBA = [
  // ----- N5-aimed (use only the simplest kanji set) -----
  {
    id: "self-intro",
    title: "はじめまして",
    titleEn: "Pleased to meet you",
    sentences: [
      "はじめまして。",
      "私の名前は田中です。",
      "日本人です。",
      "東京の大学で日本語を学んでいます。",
      "毎日先生と話します。",
    ],
    en: "Pleased to meet you. My name is Tanaka. I'm Japanese. I study Japanese at a university in Tokyo. I talk with my teacher every day.",
  },
  {
    id: "good-weather",
    title: "いい天気",
    titleEn: "Nice weather",
    sentences: [
      "今日は天気がいいです。",
      "空が青いです。",
      "山がよく見えます。",
      "子どもたちは川で水を見ています。",
    ],
    en: "The weather is nice today. The sky is blue. You can see the mountains clearly. The children are watching the water in the river.",
  },
  {
    id: "ichi-nichi",
    title: "私の一日",
    titleEn: "My day",
    sentences: [
      "私は毎日学校に行きます。",
      "学校で日本語と英語を学びます。",
      "お昼にパンを食べます。",
      "夜は家で本を読みます。",
    ],
    en: "Every day I go to school. At school I learn Japanese and English. At lunch I eat bread. In the evening I read a book at home.",
  },
];

// Append the original N4/N3 paragraphs after the N5-aimed ones above.
TATOEBA.push(...[
  {
    id: "morning-routine",
    title: "朝の生活",
    titleEn: "Morning routine",
    sentences: [
      "私は毎朝六時に起きます。",
      "朝ご飯にパンを食べます。",
      "それからコーヒーを飲みます。",
      "八時に学校に行きます。",
    ],
    en: "I wake up at six every morning. I eat bread for breakfast. Then I drink coffee. At eight, I go to school.",
  },
  {
    id: "weather-today",
    title: "今日の天気",
    titleEn: "Today's weather",
    sentences: [
      "今日はとてもいい天気です。",
      "空は青くて、雲は白いです。",
      "公園を散歩しましょう。",
      "犬も一緒に行きます。",
    ],
    en: "Today the weather is very nice. The sky is blue and the clouds are white. Let's take a walk in the park. The dog will come along too.",
  },
  {
    id: "family",
    title: "私の家族",
    titleEn: "My family",
    sentences: [
      "私の家族は四人です。",
      "父は会社員で、母は先生です。",
      "兄は東京の大学で勉強しています。",
      "私は家で猫と遊ぶのが好きです。",
    ],
    en: "There are four people in my family. My father is a company employee, and my mother is a teacher. My older brother is studying at a university in Tokyo. I love to play with the cat at home.",
  },
  {
    id: "restaurant",
    title: "レストランで",
    titleEn: "At the restaurant",
    sentences: [
      "友達と一緒にレストランに行きました。",
      "私は魚を、友達は肉を食べました。",
      "とてもおいしかったです。",
      "また来週も来たいと思います。",
    ],
    en: "I went to a restaurant with my friend. I ate fish, and my friend ate meat. It was very delicious. I'd like to come back again next week.",
  },
  {
    id: "school-life",
    title: "学校の一日",
    titleEn: "A school day",
    sentences: [
      "私は中学生です。",
      "学校は家の近くにあります。",
      "毎日歩いて行きます。",
      "数学の先生はとてもやさしいです。",
    ],
    en: "I'm a middle-school student. The school is near my house. I walk there every day. The maths teacher is very kind.",
  },
  {
    id: "weekend",
    title: "週末",
    titleEn: "The weekend",
    sentences: [
      "土曜日と日曜日は学校に行きません。",
      "朝はゆっくり起きます。",
      "友達とカフェでコーヒーを飲みます。",
      "夜は家で映画を見ます。",
    ],
    en: "I don't go to school on Saturdays and Sundays. I get up slowly in the morning. I have coffee with friends at a café. In the evening I watch a film at home.",
  },
  {
    id: "shopping",
    title: "買い物",
    titleEn: "Shopping",
    sentences: [
      "今日は母と買い物に行きました。",
      "近くのスーパーで野菜と肉を買いました。",
      "それからパン屋でパンを買いました。",
      "家に帰ってから夕ご飯を作りました。",
    ],
    en: "Today I went shopping with my mother. We bought vegetables and meat at a nearby supermarket. Then we got bread at the bakery. After getting home, we made dinner.",
  },
  {
    id: "pets",
    title: "うちの犬",
    titleEn: "Our dog",
    sentences: [
      "私の家には小さい犬がいます。",
      "名前はポチです。",
      "毎朝、公園を一緒に散歩します。",
      "ポチはボールで遊ぶのが大好きです。",
    ],
    en: "We have a small dog at home. Her name is Pochi. Every morning we walk together in the park. Pochi loves playing with a ball.",
  },
  {
    id: "hobby",
    title: "私の趣味",
    titleEn: "My hobby",
    sentences: [
      "私の趣味は読書です。",
      "週末はよく図書館に行きます。",
      "静かな場所で本を読むのが好きです。",
      "最近は日本の小説を読んでいます。",
    ],
    en: "My hobby is reading. I often go to the library on weekends. I like reading books in a quiet place. Recently I've been reading Japanese novels.",
  },
  {
    id: "summer-trip",
    title: "夏休みの思い出",
    titleEn: "A summer holiday memory",
    sentences: [
      "去年の夏、家族と海に行きました。",
      "毎日泳いだり、貝がらを集めたりしました。",
      "夜は浜辺で花火を見ました。",
      "とても楽しい一週間でした。",
    ],
    en: "Last summer I went to the sea with my family. Every day we swam and collected seashells. At night we watched fireworks on the beach. It was a very fun week.",
  },
  {
    id: "train-to-tokyo",
    title: "東京へ",
    titleEn: "To Tokyo",
    sentences: [
      "明日、新幹線で東京に行きます。",
      "東京駅で友達が待っています。",
      "二人で美術館に行く予定です。",
      "夜は一緒に晩ご飯を食べます。",
    ],
    en: "Tomorrow I'm going to Tokyo on the shinkansen. My friend is waiting at Tokyo Station. We plan to visit an art museum together. In the evening we'll have dinner together.",
  },
]);

// Themed paragraph templates for algorithmic Tatoeba stitching.
// Each theme picks sentences from Tatoeba that:
//   - contain >=1 of its `core` kanji
//   - have all kanji at or easier than `maxLevel`
//   - have a linked English translation
// Sentence count and length filters applied uniformly.
const THEMES = [
  // ---- N5 / N4-ish ----
  { id: "th-greeting", core: ["先","生","名","人"], max: 4, title: "あいさつ", titleEn: "Greetings" },
  { id: "th-family",   core: ["父","母","兄","姉","弟","妹","家","族"], max: 4, title: "家族のこと", titleEn: "About family" },
  { id: "th-school",   core: ["学","校","先","生","友"], max: 4, title: "学校のこと", titleEn: "About school" },
  { id: "th-food",     core: ["食","飲","米","魚","肉","水"], max: 4, title: "食べ物の話", titleEn: "About food" },
  { id: "th-weather",  core: ["天","気","雨","風","空","雪"], max: 4, title: "今日の天気", titleEn: "Today's weather" },
  { id: "th-time",     core: ["時","分","日","月","年","今"], max: 4, title: "時間", titleEn: "Time" },
  { id: "th-numbers",  core: ["一","二","三","四","五","六","七","八","九","十","百","千"], max: 4, title: "数字", titleEn: "Numbers" },
  { id: "th-body",     core: ["目","耳","口","手","足","顔"], max: 4, title: "体", titleEn: "The body" },
  { id: "th-home",     core: ["家","部","屋","台","所","庭"], max: 4, title: "家のこと", titleEn: "Around the house" },
  { id: "th-travel",   core: ["旅","駅","電","車","行","来"], max: 4, title: "旅行", titleEn: "Travel" },
  // ---- N4 / N3 ----
  { id: "th-shopping", core: ["買","物","店","円","品"], max: 3, title: "買い物", titleEn: "Shopping" },
  { id: "th-hobby",    core: ["趣","味","本","音","楽","映","画"], max: 3, title: "趣味", titleEn: "Hobbies" },
  { id: "th-sport",    core: ["走","泳","運","動","球"], max: 3, title: "スポーツ", titleEn: "Sports" },
  { id: "th-music",    core: ["音","楽","歌","聞"], max: 3, title: "音楽", titleEn: "Music" },
  { id: "th-cooking",  core: ["料","理","作","食","味","野","菜"], max: 3, title: "料理", titleEn: "Cooking" },
  { id: "th-transport",core: ["車","電","駅","乗","降","道","橋"], max: 3, title: "乗り物", titleEn: "Transport" },
  { id: "th-work",     core: ["会","社","仕","事","働"], max: 3, title: "仕事", titleEn: "Work" },
  { id: "th-friends",  core: ["友","達","話","会","遊"], max: 3, title: "友達と", titleEn: "With friends" },
  { id: "th-animal",   core: ["犬","猫","鳥","魚","馬"], max: 3, title: "動物", titleEn: "Animals" },
  { id: "th-feeling",  core: ["楽","好","嬉","悲","怒","心"], max: 3, title: "気持ち", titleEn: "Feelings" },
  // ---- N3 / N2 ----
  { id: "th-season",   core: ["春","夏","秋","冬","季","節"], max: 2, title: "季節", titleEn: "Seasons" },
  { id: "th-nature",   core: ["山","川","海","森","花","木","島"], max: 2, title: "自然", titleEn: "Nature" },
  { id: "th-city",     core: ["町","村","都","会","建","物"], max: 2, title: "町と村", titleEn: "Town and country" },
  { id: "th-health",   core: ["病","気","医","薬","体","痛"], max: 2, title: "体の調子", titleEn: "Health" },
  { id: "th-tech",     core: ["機","械","電","話","計","算"], max: 2, title: "技術", titleEn: "Technology" },
  { id: "th-edu",      core: ["学","勉","強","試","験","読","書"], max: 2, title: "勉強", titleEn: "Studying" },
];

function isKanji(ch) {
  const cp = ch.codePointAt(0);
  return (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf);
}

function katakanaToHiragana(s) {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x30a1 && cp <= 0x30f6) out += String.fromCodePoint(cp - 0x60);
    else out += ch;
  }
  return out;
}

async function fetchAozora(url) {
  const res = await fetch(url);
  const buf = new Uint8Array(await res.arrayBuffer());
  return new TextDecoder("shift_jis").decode(buf);
}

/**
 * Extract the main story body from an Aozora HTML page, trimmed to a
 * given number of sentences (counting 。 at zero <ruby> depth).
 */
function extractAozoraBody(html, sentenceLimit) {
  // Find the opening <div class="main_text"> and grab everything up to
  // the matching </div>, respecting nested divs (some Aozora stories
  // wrap sections in jisage_5 etc.).
  const startMarker = '<div class="main_text">';
  const startIdx = html.indexOf(startMarker);
  if (startIdx === -1) return "";
  let pos = startIdx + startMarker.length;
  let depth = 1;
  let body = "";
  while (pos < html.length && depth > 0) {
    if (html.startsWith("<div", pos)) {
      depth += 1;
      const end = html.indexOf(">", pos);
      body += html.slice(pos, end + 1);
      pos = end + 1;
    } else if (html.startsWith("</div>", pos)) {
      depth -= 1;
      if (depth === 0) break;
      body += "</div>";
      pos += 6;
    } else {
      body += html[pos++];
    }
  }
  body = body.replace(/<br\s*\/?\s*>/g, "");
  // Drop everything except ruby-family tags
  body = body.replace(/<(?!\/?(?:ruby|rb|rt|rp)\b)[^>]+>/g, "");
  body = body
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");

  // Trim to N sentences, counting 。 only at zero <ruby> depth.
  let buf = "";
  let count = 0;
  let i = 0;
  while (i < body.length && count < sentenceLimit) {
    if (body.startsWith("<ruby", i)) {
      const end = body.indexOf("</ruby>", i);
      if (end === -1) break;
      buf += body.slice(i, end + 7);
      i = end + 7;
      continue;
    }
    const ch = body[i++];
    buf += ch;
    if (ch === "。") count += 1;
  }
  // Drop a leading chapter heading like "一\n" if present.
  let out = buf.trim().replace(/^[\s　]+/, "");
  out = out.replace(/^[一二三四五六七八九十]\s*\n+\s*/, "");
  return out;
}

function plainToTokens(text, tokenizer) {
  if (!text) return [];
  const trimmed = text.replace(/[\s　]+/g, "");
  if (!trimmed) return [];
  const toks = tokenizer.tokenize(text);
  return toks.map((t) => {
    const surface = t.surface_form;
    if (!surface) return null;
    const hasKanji = [...surface].some(isKanji);
    if (!hasKanji) return { t: surface, r: null };
    const r = t.reading && t.reading !== "*"
      ? katakanaToHiragana(t.reading)
      : null;
    return { t: surface, r };
  }).filter(Boolean);
}

function aozoraToTokens(body, tokenizer) {
  const tokens = [];
  const rubyRe = /<ruby><rb>([^<]+)<\/rb>(?:<rp>[^<]*<\/rp>)?<rt>([^<]+)<\/rt>(?:<rp>[^<]*<\/rp>)?<\/ruby>/g;
  let lastEnd = 0;
  let m;
  while ((m = rubyRe.exec(body)) !== null) {
    if (m.index > lastEnd) {
      tokens.push(...plainToTokens(body.slice(lastEnd, m.index), tokenizer));
    }
    tokens.push({ t: m[1], r: m[2] });
    lastEnd = rubyRe.lastIndex;
  }
  if (lastEnd < body.length) {
    tokens.push(...plainToTokens(body.slice(lastEnd), tokenizer));
  }
  return tokens;
}

/**
 * Approximate JLPT level: the lowest N number (N5 = easiest → N1 = hardest)
 * such that at least 80% of the kanji are at-or-easier than that level.
 * Kanji not in our dataset count toward "harder" implicitly.
 */
function computeLevel(tokens) {
  let total = 0;
  const tally = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  for (const tok of tokens) {
    for (const ch of tok.t) {
      if (!isKanji(ch)) continue;
      total += 1;
      const k = kanjiByChar.get(ch);
      if (k && tally.hasOwnProperty(k.n)) tally[k.n] += 1;
    }
  }
  if (total === 0) return 5;
  let cum = 0;
  for (const level of [5, 4, 3, 2, 1]) {
    cum += tally[level];
    if (cum / total >= 0.8) return level;
  }
  return 1;
}

/**
 * Load Tatoeba JP sentences + jpn-eng links + EN sentence text needed
 * for the generated paragraphs. Returns:
 *   { jpSentences: [{id, text}], jpToEng: Map(jpId -> Set<engId>),
 *     engById: Map(engId -> text) }
 */
function loadTatoeba() {
  if (!fs.existsSync(jpnPath)) return null;
  console.log("Loading Tatoeba corpora...");
  const jpRaw = fs.readFileSync(jpnPath, "utf8");
  const jpSentences = [];
  for (const line of jpRaw.split("\n")) {
    if (!line) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const id = Number(parts[0]);
    const text = parts[2].trim();
    if (!id || !text) continue;
    if (text.length < 6 || text.length > 25) continue;
    jpSentences.push({ id, text });
  }

  const jpToEng = new Map();
  const linksRaw = fs.readFileSync(linksPath, "utf8");
  for (const line of linksRaw.split("\n")) {
    if (!line) continue;
    const [a, b] = line.split("\t");
    const jp = Number(a), en = Number(b);
    if (!jp || !en) continue;
    if (!jpToEng.has(jp)) jpToEng.set(jp, new Set());
    jpToEng.get(jp).add(en);
  }

  // Only load the EN sentences linked to any short JP sentence.
  const neededEng = new Set();
  for (const { id } of jpSentences) {
    const set = jpToEng.get(id);
    if (set) for (const e of set) neededEng.add(e);
  }
  const engById = new Map();
  const engRaw = fs.readFileSync(engPath, "utf8");
  for (const line of engRaw.split("\n")) {
    if (!line) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const id = Number(parts[0]);
    if (!neededEng.has(id)) continue;
    engById.set(id, parts[2].trim());
  }
  console.log(`  ${jpSentences.length} JP / ${jpToEng.size} linked / ${engById.size} EN`);
  return { jpSentences, jpToEng, engById };
}

/** Generate themed paragraphs by sampling short Tatoeba sentences. */
function generateThemed(themes, t, tokenizer) {
  if (!t) return [];
  const { jpSentences, jpToEng, engById } = t;

  // Pre-index sentences by each kanji they contain
  const sentenceByKanji = new Map();
  for (const s of jpSentences) {
    const seen = new Set();
    for (const ch of s.text) {
      if (!isKanji(ch) || seen.has(ch)) continue;
      seen.add(ch);
      if (!sentenceByKanji.has(ch)) sentenceByKanji.set(ch, []);
      sentenceByKanji.get(ch).push(s);
    }
  }

  const pickFor = (theme, count, exclude) => {
    const allowed = allowedKanjiUpTo(theme.max);
    // Pull candidates: any sentence containing any core kanji
    const candidatesById = new Map();
    for (const c of theme.core) {
      const arr = sentenceByKanji.get(c) ?? [];
      for (const s of arr) {
        if (exclude.has(s.id)) continue;
        if (candidatesById.has(s.id)) continue;
        // Every kanji in the sentence must be in the allowed set
        let ok = true;
        for (const ch of s.text) {
          if (!isKanji(ch)) continue;
          if (!allowed.has(ch)) { ok = false; break; }
        }
        if (!ok) continue;
        // Must have a linked EN
        const ens = jpToEng.get(s.id);
        if (!ens) continue;
        let en = null;
        for (const e of ens) {
          const t = engById.get(e);
          if (t) { en = t; break; }
        }
        if (!en) continue;
        candidatesById.set(s.id, { jp: s.text, en, id: s.id });
      }
    }
    const arr = [...candidatesById.values()];
    if (arr.length < count) return null;
    // Shortest first, then take `count` distinct ones
    arr.sort((a, b) => a.jp.length - b.jp.length);
    return arr.slice(0, count);
  };

  const out = [];
  for (const theme of themes) {
    const used = new Set();
    // Generate up to two paragraphs per theme so we get variety
    for (let variant = 0; variant < 3; variant++) {
      const picked = pickFor(theme, 4, used);
      if (!picked) break;
      for (const p of picked) used.add(p.id);
      const jpText = picked.map((p) => p.jp).join("");
      const enText = picked.map((p) => p.en).join(" ");
      const tokens = plainToTokens(jpText, tokenizer);
      const level = computeLevel(tokens);
      out.push({
        id: variant === 0 ? theme.id : `${theme.id}-${variant + 1}`,
        title: variant === 0 ? theme.title : `${theme.title} ${variant + 1}`,
        titleEn: variant === 0 ? theme.titleEn : `${theme.titleEn} (${variant + 1})`,
        source: "Tatoeba (themed)",
        sourceUrl: "https://tatoeba.org",
        license: "CC-BY 2.0 FR",
        level,
        tokens,
        en: enText,
      });
    }
  }
  return out;
}

async function main() {
  console.log("Building kuromoji tokenizer...");
  const tokenizer = await new Promise((resolve, reject) => {
    kuromoji.builder({ dicPath }).build((err, t) => (err ? reject(err) : resolve(t)));
  });
  console.log("Tokenizer ready.\n");

  const out = [];

  // --- Aozora ---
  for (const story of AOZORA) {
    process.stdout.write(`Fetching ${story.title}… `);
    const html = await fetchAozora(story.url);
    const body = extractAozoraBody(html, story.sentenceLimit);
    if (!body) { console.log("EMPTY"); continue; }
    const tokens = aozoraToTokens(body, tokenizer);
    const level = computeLevel(tokens);
    out.push({
      id: story.id,
      title: story.title,
      titleEn: story.titleEn,
      author: story.author,
      source: "Aozora Bunko",
      sourceUrl: story.url,
      license: "Public domain (Aozora Bunko)",
      level,
      tokens,
      en: story.en,
    });
    console.log(`level N${level}, ${tokens.length} tokens`);
  }

  // --- Tatoeba ---
  for (const p of TATOEBA) {
    const text = p.sentences.join("");
    const tokens = plainToTokens(text, tokenizer);
    const level = computeLevel(tokens);
    out.push({
      id: p.id,
      title: p.title,
      titleEn: p.titleEn,
      source: "Tatoeba (stitched)",
      sourceUrl: "https://tatoeba.org",
      license: "CC-BY 2.0 FR",
      level,
      tokens,
      en: p.en,
    });
    console.log(`Stitched ${p.id}: level N${level}, ${tokens.length} tokens`);
  }

  // --- Algorithmic themed Tatoeba paragraphs ---
  const tatoeba = loadTatoeba();
  const themed = generateThemed(THEMES, tatoeba, tokenizer);
  for (const t of themed) {
    out.push(t);
    console.log(`Themed ${t.id}: level N${t.level}, ${t.tokens.length} tokens`);
  }

  // Sort easiest (N5) → hardest (N1)
  out.sort((a, b) => b.level - a.level);

  fs.writeFileSync(outPath, JSON.stringify(out));
  const size = fs.statSync(outPath).size;
  console.log(`\nWrote ${out.length} readings to ${outPath} (${(size / 1024).toFixed(1)} KB)`);
}

main().catch((e) => { console.error(e); process.exit(1); });
