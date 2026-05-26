// Build data/examples.json: one short, furigana-annotated example sentence
// per kanji, sourced from the Tatoeba Japanese corpus and tokenised with
// kuromoji.js.
//
// Output entry per kanji char:
//   { tokens: [{ t: "山", r: "やま" }, { t: "に", r: null }, ...] }
//
// Usage: node scripts/build-examples.mjs <path/to/jpn_sentences.tsv>

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const kuromoji = require("kuromoji");

const tatoebaPath = process.argv[2] ?? "/tmp/tatoeba/jpn_sentences.tsv";
const kanjiPath = path.join(__dirname, "..", "data", "jlpt-kanji.json");
const outPath = path.join(__dirname, "..", "data", "examples.json");
const dicPath = path.join(__dirname, "..", "node_modules", "kuromoji", "dict");

function isKanji(ch) {
  const cp = ch.codePointAt(0);
  return (cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf);
}

function katakanaToHiragana(s) {
  let out = "";
  for (const ch of s) {
    const cp = ch.codePointAt(0);
    if (cp >= 0x30a1 && cp <= 0x30f6) {
      out += String.fromCodePoint(cp - 0x60);
    } else {
      out += ch;
    }
  }
  return out;
}

const kanji = JSON.parse(fs.readFileSync(kanjiPath, "utf8"));
const levelOf = new Map();
for (const k of kanji) levelOf.set(k.c, k.n);
const allKanjiChars = new Set(kanji.map((k) => k.c));

console.log(`Loaded ${kanji.length} kanji entries`);
console.log(`Reading Tatoeba sentences from ${tatoebaPath}`);
const raw = fs.readFileSync(tatoebaPath, "utf8");
const sentences = [];
for (const line of raw.split("\n")) {
  if (!line) continue;
  const parts = line.split("\t");
  if (parts.length < 3) continue;
  const text = parts[2].trim();
  if (!text) continue;
  if (text.length < 4 || text.length > 30) continue; // bias toward short
  sentences.push(text);
}
console.log(`${sentences.length} short Japanese sentences after length filter`);

// Build inverted index: kanji char → list of sentence indexes that contain it
const index = new Map();
for (let i = 0; i < sentences.length; i++) {
  const seen = new Set();
  for (const ch of sentences[i]) {
    if (!isKanji(ch) || seen.has(ch)) continue;
    seen.add(ch);
    if (!index.has(ch)) index.set(ch, []);
    index.get(ch).push(i);
  }
}
console.log(`Indexed ${index.size} distinct kanji across the corpus`);

// Score a sentence for a given target kanji + JLPT level.
// Lower score = better. We prefer short sentences, and sentences whose other
// kanji are at the same or easier JLPT level than the target.
function scoreSentence(sentence, targetLevel) {
  let penalty = sentence.length * 0.5; // short is better
  for (const ch of sentence) {
    if (!isKanji(ch)) continue;
    const lvl = levelOf.get(ch);
    if (lvl == null) {
      penalty += 8; // non-JLPT kanji = costly
    } else if (lvl < targetLevel) {
      // JLPT levels: 5 (easy) → 1 (hard). Smaller number = harder.
      penalty += (targetLevel - lvl) * 4;
    }
  }
  return penalty;
}

function pickSentence(targetChar, targetLevel) {
  const candidates = index.get(targetChar);
  if (!candidates || candidates.length === 0) return null;
  let best = null;
  let bestScore = Infinity;
  // Cap exploration for speed
  const limit = Math.min(candidates.length, 80);
  for (let i = 0; i < limit; i++) {
    const s = sentences[candidates[i]];
    const score = scoreSentence(s, targetLevel);
    if (score < bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return best;
}

// Build tokenizer
console.log(`Building kuromoji tokenizer from ${dicPath} ...`);
const tokenizer = await new Promise((resolve, reject) => {
  kuromoji.builder({ dicPath }).build((err, t) => (err ? reject(err) : resolve(t)));
});
console.log("Tokenizer ready");

function tokensFor(sentence) {
  const toks = tokenizer.tokenize(sentence);
  return toks.map((t) => {
    const hasKanji = [...t.surface_form].some(isKanji);
    if (!hasKanji) return { t: t.surface_form, r: null };
    const reading = t.reading && t.reading !== "*"
      ? katakanaToHiragana(t.reading)
      : null;
    return { t: t.surface_form, r: reading };
  });
}

// Build the output
const out = {};
let hit = 0, miss = 0;
const t0 = Date.now();
for (const k of kanji) {
  const sentence = pickSentence(k.c, k.n);
  if (!sentence) { miss += 1; continue; }
  out[k.c] = { tokens: tokensFor(sentence) };
  hit += 1;
  if (hit % 200 === 0) {
    console.log(`  ${hit} processed...`);
  }
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

fs.writeFileSync(outPath, JSON.stringify(out));
const size = fs.statSync(outPath).size;
console.log(`\nDone in ${elapsed}s`);
console.log(`  ${hit} kanji with examples, ${miss} without`);
console.log(`  output: ${outPath} (${(size / 1024).toFixed(0)} KB)`);
