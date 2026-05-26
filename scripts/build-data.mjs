#!/usr/bin/env node
// Regenerates app/data/jlpt-kanji.json from the upstream KANJIDIC-derived
// dataset at https://github.com/davidluzgouveia/kanji-data. Only the JLPT
// kanji (N5..N1) are kept, and only the fields the app actually uses.
//
// Usage:  node app/scripts/build-data.mjs

import { writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const SOURCE_URL =
  "https://raw.githubusercontent.com/davidluzgouveia/kanji-data/master/kanji.json";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, "..", "data", "jlpt-kanji.json");

const res = await fetch(SOURCE_URL);
if (!res.ok) throw new Error(`fetch ${SOURCE_URL} -> ${res.status}`);
const raw = await res.json();

// WaniKani prefixes "primary" entries with "^" (meanings) and "!" (readings).
// Strip those markers; the order already conveys primacy.
const stripPrefix = (s) => s.replace(/^[\^!]/, "");

const entries = [];
for (const [character, v] of Object.entries(raw)) {
  if (!v.jlpt_new) continue;
  const meanings = (v.wk_meanings?.length ? v.wk_meanings : v.meanings) ?? [];
  // Drop radicals that are just the kanji's own primary meaning — they make
  // the "build a mental picture using its parts" hint look silly.
  const primaryMeaning = meanings[0] ? stripPrefix(meanings[0]).toLowerCase() : "";
  const radicals = (v.wk_radicals ?? []).filter(
    (r) => r.toLowerCase() !== primaryMeaning,
  );
  entries.push({
    c: character,
    n: v.jlpt_new,
    s: v.strokes ?? null,
    f: v.freq ?? null,
    m: meanings.map(stripPrefix),
    on: (v.readings_on ?? []).map(stripPrefix),
    kun: (v.readings_kun ?? []).map(stripPrefix),
    r: radicals,
  });
}

// Stable ordering: by JLPT level (N5 first), then frequency (rarer = higher).
entries.sort((a, b) => {
  if (a.n !== b.n) return b.n - a.n;
  const af = a.f ?? 99999;
  const bf = b.f ?? 99999;
  return af - bf;
});

await writeFile(OUT_PATH, JSON.stringify(entries));

const counts = entries.reduce((acc, e) => ((acc[e.n] = (acc[e.n] ?? 0) + 1), acc), {});
console.log(`wrote ${entries.length} kanji to ${OUT_PATH}`);
for (const lvl of [5, 4, 3, 2, 1]) console.log(`  N${lvl}: ${counts[lvl] ?? 0}`);
