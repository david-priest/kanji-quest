// Build data/examples.json: one short, furigana-annotated example sentence
// per kanji, sourced from the Tatoeba Japanese corpus and tokenised with
// kuromoji.js. Includes an English translation when one is linked in
// Tatoeba's jpn-eng pairings.
//
// Output entry per kanji char:
//   { tokens: [{ t: "山", r: "やま" }, { t: "に", r: null }, ...], en?: "..." }
//
// Usage: node scripts/build-examples.mjs [tatoeba-dir]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const kuromoji = require("kuromoji");

const tatoebaDir = process.argv[2] ?? "/tmp/tatoeba";
const jpnPath = path.join(tatoebaDir, "jpn_sentences.tsv");
const engPath = path.join(tatoebaDir, "eng_sentences.tsv");
const linksPath = path.join(tatoebaDir, "jpn-eng_links.tsv");
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
console.log(`Loaded ${kanji.length} kanji entries`);

// ---- Load Japanese sentences ----
console.log(`Reading ${jpnPath}`);
const jpnRaw = fs.readFileSync(jpnPath, "utf8");
const sentences = []; // [{id, text}]
for (const line of jpnRaw.split("\n")) {
  if (!line) continue;
  const parts = line.split("\t");
  if (parts.length < 3) continue;
  const id = Number(parts[0]);
  const text = parts[2].trim();
  if (!id || !text) continue;
  if (text.length < 4 || text.length > 30) continue;
  sentences.push({ id, text });
}
console.log(`${sentences.length} short Japanese sentences after length filter`);

// Inverted index: kanji char → array of sentence indexes
const index = new Map();
for (let i = 0; i < sentences.length; i++) {
  const seen = new Set();
  for (const ch of sentences[i].text) {
    if (!isKanji(ch) || seen.has(ch)) continue;
    seen.add(ch);
    if (!index.has(ch)) index.set(ch, []);
    index.get(ch).push(i);
  }
}
console.log(`Indexed ${index.size} distinct kanji across the corpus`);

function scoreSentence(text, targetLevel) {
  let penalty = text.length * 0.5;
  for (const ch of text) {
    if (!isKanji(ch)) continue;
    const lvl = levelOf.get(ch);
    if (lvl == null) penalty += 8;
    else if (lvl < targetLevel) penalty += (targetLevel - lvl) * 4;
  }
  return penalty;
}

function pickSentence(targetChar, targetLevel) {
  const candidates = index.get(targetChar);
  if (!candidates?.length) return null;
  let best = null, bestScore = Infinity;
  const limit = Math.min(candidates.length, 80);
  for (let i = 0; i < limit; i++) {
    const s = sentences[candidates[i]];
    const score = scoreSentence(s.text, targetLevel);
    if (score < bestScore) { bestScore = score; best = s; }
  }
  return best;
}

// ---- First pass: choose the best JP sentence per kanji ----
const chosen = []; // [{c, level, jpId, text}]
for (const k of kanji) {
  const s = pickSentence(k.c, k.n);
  if (!s) continue;
  chosen.push({ c: k.c, level: k.n, jpId: s.id, text: s.text });
}
console.log(`Chose JP sentences for ${chosen.length} / ${kanji.length} kanji`);

// ---- Resolve English translations ----
console.log(`Reading links ${linksPath}`);
const chosenJpIds = new Set(chosen.map((c) => c.jpId));
const jpToEng = new Map(); // jpId → Set<engId>
{
  const linksRaw = fs.readFileSync(linksPath, "utf8");
  for (const line of linksRaw.split("\n")) {
    if (!line) continue;
    const [a, b] = line.split("\t");
    const jp = Number(a), en = Number(b);
    if (!jp || !en) continue;
    if (!chosenJpIds.has(jp)) continue;
    if (!jpToEng.has(jp)) jpToEng.set(jp, new Set());
    jpToEng.get(jp).add(en);
  }
}
const neededEngIds = new Set();
for (const set of jpToEng.values()) for (const id of set) neededEngIds.add(id);
console.log(`${neededEngIds.size} English sentence IDs to resolve`);

console.log(`Reading ${engPath}`);
const engById = new Map();
{
  const engRaw = fs.readFileSync(engPath, "utf8");
  for (const line of engRaw.split("\n")) {
    if (!line) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const id = Number(parts[0]);
    if (!neededEngIds.has(id)) continue;
    engById.set(id, parts[2].trim());
  }
}
console.log(`Loaded ${engById.size} English translations`);

function pickEnglish(jpId) {
  const ids = jpToEng.get(jpId);
  if (!ids) return null;
  let best = null;
  for (const id of ids) {
    const t = engById.get(id);
    if (!t) continue;
    if (!best || t.length < best.length) best = t;
  }
  return best;
}

// ---- Tokenize and assemble ----
console.log(`Building kuromoji tokenizer ...`);
const tokenizer = await new Promise((resolve, reject) => {
  kuromoji.builder({ dicPath }).build((err, t) => (err ? reject(err) : resolve(t)));
});
console.log("Tokenizer ready");

function tokensFor(sentence) {
  return tokenizer.tokenize(sentence).map((t) => {
    const hasKanji = [...t.surface_form].some(isKanji);
    if (!hasKanji) return { t: t.surface_form, r: null };
    const reading = t.reading && t.reading !== "*"
      ? katakanaToHiragana(t.reading)
      : null;
    return { t: t.surface_form, r: reading };
  });
}

const out = {};
let withEn = 0, withoutEn = 0;
const t0 = Date.now();
for (const c of chosen) {
  const entry = { tokens: tokensFor(c.text) };
  const en = pickEnglish(c.jpId);
  if (en) { entry.en = en; withEn += 1; } else { withoutEn += 1; }
  out[c.c] = entry;
}
const elapsed = ((Date.now() - t0) / 1000).toFixed(1);

fs.writeFileSync(outPath, JSON.stringify(out));
const size = fs.statSync(outPath).size;
console.log(`\nDone in ${elapsed}s`);
console.log(`  ${chosen.length} kanji with examples (${kanji.length - chosen.length} without)`);
console.log(`  ${withEn} with English translation, ${withoutEn} without`);
console.log(`  output: ${outPath} (${(size / 1024).toFixed(0)} KB)`);
