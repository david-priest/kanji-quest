// Main app controller: data loading, routing, views, FX.

import { loadState, saveState, resetState, exportState, importState } from "./storage.js";
import { newCard, grade as applyGrade, tierOf, isDue, TIERS, DAY } from "./srs.js";
import { awardForGrade, rollCrit, todayKey, levelFromXp } from "./gamification.js";
import { kaeruSvg, speak as kaeruSpeak } from "./kaeru.js";

// ---------- Boot ------------------------------------------------------------

const els = {
  view: document.getElementById("view"),
  streak: document.getElementById("stat-streak"),
  streakWrap: document.querySelector(".stat.streak"),
  xp: document.getElementById("stat-xp"),
  xpWrap: document.querySelector(".stat.xp"),
  navHome: document.getElementById("nav-home"),
  navSettings: document.getElementById("nav-settings"),
  fx: document.getElementById("fx-layer"),
  toasts: document.getElementById("toast-layer"),
};

let state = loadState();
let kanji = [];                 // [{c, n, s, f, m, on, kun, r}]
let kanjiByChar = new Map();    // char -> entry
let examples = {};              // { char: { tokens: [{t, r|null}, ...] } }
let route = { name: "home" };
let viewCleanup = null;         // global teardown for whichever view is mounted

(async function init() {
  const kanjiRes = await fetch("./data/jlpt-kanji.json");
  kanji = await kanjiRes.json();
  kanjiByChar = new Map(kanji.map((k) => [k.c, k]));

  // examples.json is ~440KB and only needed in Learn / Review / detail
  // modal. Load it in the background; if a view that uses it is open
  // when the load finishes, re-render so the sections appear.
  fetch("./data/examples.json")
    .then((r) => r.json())
    .then((j) => {
      examples = j;
      if (route.name === "learn" || route.name === "review") render();
    })
    .catch(() => { examples = {}; });

  els.navHome.addEventListener("click", () => go({ name: "home" }));
  els.navSettings.addEventListener("click", () => go({ name: "settings" }));

  renderTopbar();
  go({ name: "home" });
})();

function go(next) {
  if (viewCleanup) { viewCleanup(); viewCleanup = null; }
  route = next;
  render();
}

function persist() {
  saveState(state);
  renderTopbar();
}

// ---------- Top bar ---------------------------------------------------------

function renderTopbar() {
  els.streak.textContent = state.streak.current;
  els.xp.textContent = state.xp.total;
}

// ---------- Queue helpers ---------------------------------------------------

function activeLevelKanji() {
  return kanji.filter((k) => k.n === state.settings.activeLevel);
}

function unseenInLevel() {
  return activeLevelKanji().filter((k) => !state.cards[k.c]);
}

function dueCards(now = Date.now()) {
  const out = [];
  for (const [char, card] of Object.entries(state.cards)) {
    if (isDue(card, now)) {
      const k = kanjiByChar.get(char);
      if (k) out.push({ char, card, k });
    }
  }
  // Sort by due time first, then shuffle within ~1-hour buckets so
  // cards from the same learning batch don't always appear in a row.
  out.sort((a, b) => a.card.due - b.card.due);
  const BUCKET = 60 * 60 * 1000;
  let i = 0;
  while (i < out.length) {
    let j = i + 1;
    while (j < out.length && out[j].card.due - out[i].card.due < BUCKET) j += 1;
    if (j - i > 1) {
      const slice = out.slice(i, j);
      for (let k = slice.length - 1; k > 0; k--) {
        const r = Math.floor(Math.random() * (k + 1));
        [slice[k], slice[r]] = [slice[r], slice[k]];
      }
      for (let k = i; k < j; k++) out[k] = slice[k - i];
    }
    i = j;
  }
  return out;
}

function levelStats(level) {
  const list = kanji.filter((k) => k.n === level);
  const total = list.length;
  const tally = { unseen: 0, apprentice: 0, guru: 0, master: 0, enlightened: 0, burned: 0 };
  for (const k of list) {
    const c = state.cards[k.c];
    if (!c) tally.unseen += 1;
    else tally[tierOf(c)] += 1;
  }
  const masteredOrBetter = tally.guru + tally.master + tally.enlightened + tally.burned;
  return { total, tally, masteredOrBetter, pct: total ? masteredOrBetter / total : 0 };
}

// ---------- Router / render -------------------------------------------------

function render() {
  els.view.innerHTML = "";
  switch (route.name) {
    case "home":     return renderHome();
    case "learn":    return renderLearn();
    case "review":   return renderReview();
    case "settings": return renderSettings();
    case "mastery":  return renderMastery();
    case "quiz":     return renderQuizSetup();
    case "quiz-run": return renderQuizRun();
  }
}

// ---------- Home ------------------------------------------------------------

function renderHome() {
  const due = dueCards().length;
  const newAvail = unseenInLevel().length;
  const lvl = levelFromXp(state.xp.total);

  const greeting = greet();

  const hero = document.createElement("section");
  hero.className = "hero";
  hero.innerHTML = `
    <h1>${greeting}</h1>
    <p class="sub">Level ${lvl.level} · ${lvl.into} / ${lvl.needed} XP to next</p>
    <div class="bar" style="margin-bottom:14px"><span style="width:${Math.round((lvl.into/lvl.needed)*100)}%"></span></div>
    <div class="hero-actions">
      <button class="cta review" data-go="review" ${due === 0 ? "disabled" : ""}>
        <div>
          <div class="label">Review</div>
          <div class="sub">${due === 0 ? "Nothing due — come back later" : "Due now"}</div>
        </div>
        <div class="count">${due}</div>
      </button>
      <button class="cta learn" data-go="learn" ${newAvail === 0 ? "disabled" : ""}>
        <div>
          <div class="label">Learn new</div>
          <div class="sub">${
            newAvail === 0
              ? `All N${state.settings.activeLevel} introduced`
              : `N${state.settings.activeLevel}`
          }</div>
        </div>
        <div class="count">${newAvail}</div>
      </button>
      <button class="cta quiz" data-go="quiz" ${Object.keys(state.cards).length === 0 ? "disabled" : ""}>
        <div>
          <div class="label">Quiz</div>
          <div class="sub">${
            Object.keys(state.cards).length === 0
              ? "Learn some kanji first"
              : "Pick a scope, test recall"
          }</div>
        </div>
        <div class="count">?</div>
      </button>
    </div>
  `;
  els.view.appendChild(hero);

  // Master Kaeru, sitting between the hero and your stats.
  const kaeru = document.createElement("div");
  kaeru.innerHTML = kaeruScene("greeting", { streak: state.streak.current });
  els.view.appendChild(kaeru.firstElementChild);

  // Mastery row
  const mastery = aggregateMastery();
  const masteryHead = document.createElement("div");
  masteryHead.className = "section-title section-title-row";
  masteryHead.innerHTML = `
    <span>Your mastery</span>
    <button class="link-btn" data-go="mastery">See all kanji →</button>
  `;
  els.view.appendChild(masteryHead);
  const row = document.createElement("div");
  row.className = "mastery-row";
  for (const t of TIERS) {
    const pill = document.createElement("button");
    pill.className = `tier-pill tier-${t}`;
    pill.innerHTML = `<span class="n">${mastery[t]}</span>${t}`;
    pill.addEventListener("click", () => go({ name: "mastery", focus: t }));
    row.appendChild(pill);
  }
  els.view.appendChild(row);

  // Level grid
  const lvlTitle = document.createElement("div");
  lvlTitle.className = "section-title";
  lvlTitle.textContent = "JLPT levels — tap to browse";
  els.view.appendChild(lvlTitle);

  const expanded = route.expanded ?? null;
  const grid = document.createElement("div");
  grid.className = "level-grid";
  for (const n of [5, 4, 3, 2, 1]) {
    const s = levelStats(n);
    const card = document.createElement("button");
    const isOpen = expanded === n;
    card.className =
      "level-card" +
      (state.settings.activeLevel === n ? " active" : "") +
      (isOpen ? " open" : "");
    card.innerHTML = `
      <div class="name">N${n}<span class="chev">${isOpen ? "▾" : "▸"}</span></div>
      <div class="meta">${s.masteredOrBetter}/${s.total} mastered</div>
      <div class="bar"><span style="width:${Math.round(s.pct*100)}%"></span></div>
    `;
    card.addEventListener("click", () => {
      if (route.expanded === n) {
        go({ name: "home", expanded: null });
      } else {
        state.settings.activeLevel = n;
        saveState(state);
        renderTopbar();
        go({ name: "home", expanded: n, scroll: true });
      }
    });
    grid.appendChild(card);
  }
  els.view.appendChild(grid);

  if (expanded != null) {
    renderInlineLevelDetail(expanded);
  }

  const lore = document.createElement("p");
  lore.className = "lore-tagline";
  lore.textContent = "— Temple of Ten Thousand Kanji —";
  els.view.appendChild(lore);

  els.view.querySelectorAll("[data-go]").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const dest = e.currentTarget.getAttribute("data-go");
      if (btn.disabled) return;
      go({ name: dest });
    });
  });
}

function greet() {
  const h = new Date().getHours();
  const part = h < 5 ? "Late night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
  return `${part} — let's do some kanji`;
}

function aggregateMastery() {
  const tally = { apprentice: 0, guru: 0, master: 0, enlightened: 0, burned: 0 };
  for (const c of Object.values(state.cards)) tally[tierOf(c)] += 1;
  return tally;
}

// ---------- Learn (intro + MCQ check) ---------------------------------------

function renderLearn() {
  const chunk = Math.max(1, state.settings.learnChunkSize ?? 5);
  const fullList = unseenInLevel();
  if (fullList.length === 0) {
    showEmpty(
      "🌱",
      "No new cards available",
      `All N${state.settings.activeLevel} kanji have been introduced. Pick another level on the home screen.`,
    );
    return;
  }
  const list = fullList.slice(0, chunk);

  let idx = 0;
  let phase = "intro"; // "intro" → "mcq" → next

  const surface = document.createElement("section");
  surface.className = "card-surface";
  els.view.appendChild(surface);

  function renderIntro() {
    const k = list[idx];
    surface.innerHTML = `
      <div class="progress-line" style="width:${((idx)/list.length)*100}%"></div>
      <div class="card-meta">
        <span>Learn · N${k.n}</span>
        <span>${idx + 1} / ${list.length}</span>
      </div>
      <div class="kanji-big">${k.c}</div>
      <div class="learn-meta">
        ${k.s ? `<span class="chip"><strong>${k.s}</strong> strokes</span>` : ""}
        ${k.f ? `<span class="chip">freq <strong>#${k.f}</strong></span>` : ""}
      </div>
      <div class="answer">
        <div class="row"><span class="label">Meaning</span>
          <span class="vals">${(k.m ?? []).slice(0, 4).join(" · ") || "—"}</span></div>
        <div class="row"><span class="label">On-yomi</span>
          <span class="vals jp">${(k.on ?? []).join(" · ") || "—"}</span></div>
        <div class="row"><span class="label">Kun-yomi</span>
          <span class="vals jp">${(k.kun ?? []).join(" · ") || "—"}</span></div>
        ${k.r?.length ? `<div class="mnemonic">
          Build a mental picture of <em>${escapeHtml(k.m?.[0] ?? "this")}</em> using its parts:
          <em>${escapeHtml(k.r.join(", "))}</em>. The weirder, the stickier.
        </div>` : `<div class="mnemonic">
          Picture a vivid, exaggerated scene that captures
          <em>${escapeHtml(k.m?.[0] ?? "the meaning")}</em>. The weirder the image,
          the stickier the memory.
        </div>`}
        ${exampleHtml(k.c)}
      </div>
      <div class="btn-row" style="justify-content:flex-end; margin-top:auto">
        <button class="btn btn-ghost" data-act="skip">Skip quiz →</button>
        <button class="btn btn-success" data-act="quiz">Quiz me →</button>
      </div>
    `;
    const queueCurrent = () => {
      const k = list[idx];
      if (!state.cards[k.c]) {
        state.cards[k.c] = newCard();
        persist();
      }
    };
    surface.querySelector('[data-act="quiz"]').addEventListener("click", () => {
      queueCurrent();
      phase = "mcq";
      renderMcq();
    });
    surface.querySelector('[data-act="skip"]').addEventListener("click", () => {
      queueCurrent();
      advance();
    });
  }

  function renderMcq() {
    const k = list[idx];
    const correct = (k.m ?? [])[0] ?? "—";
    const distractors = pickDistractors(k, 3);
    const options = shuffle([correct, ...distractors]);
    let answered = false;

    surface.innerHTML = `
      <div class="progress-line" style="width:${((idx)/list.length)*100}%"></div>
      <div class="card-meta">
        <span>Check · N${k.n}</span>
        <span>${idx + 1} / ${list.length}</span>
      </div>
      <div class="kanji-big">${k.c}</div>
      <div class="mcq-prompt">What does this kanji mean?</div>
      <div class="mcq-options">
        ${options.map((opt) => `
          <button class="mcq-opt" data-opt="${escapeHtml(opt)}">${escapeHtml(opt)}</button>
        `).join("")}
      </div>
      <div class="btn-row" style="justify-content:space-between; margin-top:auto">
        <button class="btn btn-ghost" data-act="back">← Show again</button>
        <button class="btn" data-act="next" disabled>Next →</button>
      </div>
    `;
    surface.querySelector('[data-act="back"]').addEventListener("click", () => {
      phase = "intro";
      renderIntro();
    });
    const nextBtn = surface.querySelector('[data-act="next"]');
    nextBtn.addEventListener("click", advance);

    const optBtns = [...surface.querySelectorAll(".mcq-opt")];
    const pickOption = (btn) => {
      if (answered) return;
      answered = true;
      const picked = btn.getAttribute("data-opt");
      const isCorrect = picked === correct;
      optBtns.forEach((b) => {
        const v = b.getAttribute("data-opt");
        b.disabled = true;
        if (v === correct) b.classList.add("correct");
        else if (b === btn) b.classList.add("wrong");
      });
      toast(isCorrect ? "good" : "bad", isCorrect ? `Nice — ${k.c} = ${correct}` : `${k.c} = ${correct}`);
      nextBtn.disabled = false;
      nextBtn.focus();
    };
    optBtns.forEach((btn) => btn.addEventListener("click", () => pickOption(btn)));

    // Keyboard: 1-4 to pick option, Enter advances when answered.
    if (viewCleanup) viewCleanup();
    function onKey(e) {
      if (!answered && e.code >= "Digit1" && e.code <= "Digit4") {
        const idx = Number(e.code.slice(-1)) - 1;
        if (optBtns[idx]) { e.preventDefault(); pickOption(optBtns[idx]); }
      } else if (answered && (e.code === "Enter" || e.code === "Space")) {
        e.preventDefault();
        advance();
      }
    }
    document.addEventListener("keydown", onKey);
    viewCleanup = () => document.removeEventListener("keydown", onKey);
  }

  function advance() {
    idx += 1;
    if (idx >= list.length) {
      showLearnDone();
    } else {
      phase = "intro";
      renderIntro();
    }
  }

  function showLearnDone() {
    els.view.innerHTML = "";
    const remaining = unseenInLevel().length;
    const nextChunk = Math.min(chunk, remaining);
    const e = document.createElement("section");
    e.className = "empty";
    // Reference one of the kanji you just learned in the dialogue.
    const featured = list[list.length - 1];
    e.innerHTML = `
      ${kaeruScene("learnDone", {
        kanji: featured?.c,
        meaning: featured?.m?.[0] ?? "the meaning",
      }, "stack")}
      <h2>Nice — those are queued</h2>
      <p>${remaining > 0
          ? `${remaining} N${state.settings.activeLevel} kanji still to introduce.`
          : `All N${state.settings.activeLevel} kanji have been introduced.`}</p>
      <div class="btn-row" style="justify-content:center">
        <button class="btn" data-go="home">Home</button>
        <button class="btn" data-go="review">Review</button>
        ${remaining > 0 ? `<button class="btn btn-primary" data-act="more">Learn ${nextChunk} more →</button>` : ""}
      </div>
    `;
    els.view.appendChild(e);
    e.querySelectorAll("[data-go]").forEach((b) =>
      b.addEventListener("click", () => go({ name: b.getAttribute("data-go") })),
    );
    const more = e.querySelector('[data-act="more"]');
    if (more) more.addEventListener("click", () => go({ name: "learn" }));
    burst(40);
  }

  renderIntro();
}

function pickDistractors(target, n) {
  // Skip candidates whose first meaning is *anywhere* in the target's
  // meaning list (avoids 'distractor that's actually correct').
  const targetMeanings = new Set(target.m ?? []);
  const isAmbiguous = (k) => {
    const m = k.m?.[0];
    return !m || targetMeanings.has(m);
  };
  const pool = kanji.filter((k) =>
    k.c !== target.c && k.n === target.n && !isAmbiguous(k)
  );
  const fallback = kanji.filter((k) =>
    k.c !== target.c && !isAmbiguous(k)
  );
  const seen = new Set(targetMeanings);
  const picked = [];
  const tryPool = (arr) => {
    const shuffled = shuffle(arr.slice());
    for (const k of shuffled) {
      const m = k.m[0];
      if (seen.has(m)) continue;
      seen.add(m);
      picked.push(m);
      if (picked.length >= n) break;
    }
  };
  tryPool(pool);
  if (picked.length < n) tryPool(fallback);
  return picked;
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/**
 * Render Master Kaeru with a speech bubble.
 *   context: matches kaeru.js QUOTES key (greeting, learnDone, ...)
 *   ctx:     vars referenced by the quote ({kanji}, {streak}, {pct}, ...)
 *   layout:  "side" (default — horizontal, for inline/home use) or
 *            "stack" (vertical, centered — for done/empty screens)
 */
function kaeruScene(context, ctx = {}, layout = "side") {
  const { line, mood } = kaeruSpeak(context, ctx);
  const cls = layout === "stack" ? "kaeru-scene stack" : "kaeru-scene";
  const size = layout === "stack" ? 130 : 88;
  return `
    <div class="${cls}">
      ${kaeruSvg(mood, size)}
      <div class="kaeru-bubble">${escapeHtml(line)}</div>
    </div>
  `;
}

/** Render the example sentence for a kanji as a ruby-annotated HTML block. */
function exampleHtml(char) {
  const ex = examples[char];
  if (!ex || !ex.tokens?.length) return "";
  const inner = ex.tokens.map((t) => {
    if (t.r) {
      return `<ruby>${escapeHtml(t.t)}<rt>${escapeHtml(t.r)}</rt></ruby>`;
    }
    return escapeHtml(t.t);
  }).join("");
  const en = ex.en
    ? `<details class="ex-translation">
         <summary>Show translation</summary>
         <div class="ex-en">${escapeHtml(ex.en)}</div>
       </details>`
    : "";
  return `
    <div class="example">
      <div class="ex-label">Example</div>
      <div class="ex-jp">${inner}</div>
      ${en}
    </div>
  `;
}

// ---------- Quiz (standalone MCQ, doesn't touch SRS) ------------------------

function quizPrefs() {
  const base = { tier: "apprentice", level: "any", count: 10 };
  return { ...base, ...(state.settings.quiz ?? {}) };
}

function buildQuizPool(prefs) {
  const out = [];
  for (const [char, card] of Object.entries(state.cards)) {
    const k = kanjiByChar.get(char);
    if (!k) continue;
    if (prefs.tier !== "any" && tierOf(card) !== prefs.tier) continue;
    if (prefs.level !== "any" && k.n !== Number(prefs.level)) continue;
    out.push(k);
  }
  return out;
}

function renderQuizSetup() {
  const prefs = quizPrefs();
  const pool = buildQuizPool(prefs);
  const tiers = ["any", ...TIERS];
  const levels = ["any", 5, 4, 3, 2, 1];

  const wrap = document.createElement("section");
  wrap.innerHTML = `
    <div class="hero">
      <h1>Quiz yourself</h1>
      <p class="sub">Test recall on a custom set. Doesn't affect your SRS schedule.</p>
    </div>

    <div class="field">
      <h3>Tier</h3>
      <div class="opt-row" id="tier-row">
        ${tiers.map((t) => `
          <button class="opt ${prefs.tier === t ? "selected" : ""}" data-tier="${t}">${t === "any" ? "any" : t}</button>
        `).join("")}
      </div>
    </div>

    <div class="field">
      <h3>JLPT level</h3>
      <div class="opt-row" id="lvl-row">
        ${levels.map((l) => `
          <button class="opt ${String(prefs.level) === String(l) ? "selected" : ""}" data-lvl="${l}">${l === "any" ? "any" : "N" + l}</button>
        `).join("")}
      </div>
    </div>

    <div class="field">
      <h3>Number of questions</h3>
      <div class="field-row">
        <input type="range" min="5" max="30" value="${prefs.count}" id="count" />
        <strong id="count-val">${prefs.count}</strong>
      </div>
      <p class="quiz-pool-info" style="color:var(--text-dim); font-size:13px; margin:8px 0 0">
        <span id="pool-count">${pool.length}</span> kanji available with this scope.
      </p>
    </div>

    <div class="btn-row" style="justify-content:flex-end; gap:8px">
      <button class="btn" data-go="home">Cancel</button>
      <button class="btn btn-primary" id="start" ${pool.length === 0 ? "disabled" : ""}>
        Start quiz →
      </button>
    </div>
  `;
  els.view.appendChild(wrap);

  const refresh = () => {
    const p = quizPrefs();
    const pool = buildQuizPool(p);
    wrap.querySelector("#pool-count").textContent = pool.length;
    const startBtn = wrap.querySelector("#start");
    startBtn.disabled = pool.length === 0;
  };

  wrap.querySelectorAll("[data-tier]").forEach((b) =>
    b.addEventListener("click", () => {
      state.settings.quiz = { ...quizPrefs(), tier: b.getAttribute("data-tier") };
      persist();
      renderQuizSetup_replace(wrap);
    }),
  );
  wrap.querySelectorAll("[data-lvl]").forEach((b) =>
    b.addEventListener("click", () => {
      const v = b.getAttribute("data-lvl");
      state.settings.quiz = { ...quizPrefs(), level: v === "any" ? "any" : Number(v) };
      persist();
      renderQuizSetup_replace(wrap);
    }),
  );

  const countSlider = wrap.querySelector("#count");
  const countVal = wrap.querySelector("#count-val");
  countSlider.addEventListener("input", () => { countVal.textContent = countSlider.value; });
  countSlider.addEventListener("change", () => {
    state.settings.quiz = { ...quizPrefs(), count: Number(countSlider.value) };
    persist();
  });

  wrap.querySelector("[data-go]").addEventListener("click", () => go({ name: "home" }));
  wrap.querySelector("#start").addEventListener("click", () => {
    const p = quizPrefs();
    const pool = buildQuizPool(p);
    if (pool.length === 0) return;
    const list = shuffle(pool).slice(0, Math.min(p.count, pool.length));
    go({ name: "quiz-run", list });
  });
}

// Re-render the setup view in-place after a pref change so the pool
// count + selected state both refresh, without full route bounce.
function renderQuizSetup_replace(oldWrap) {
  oldWrap.remove();
  renderQuizSetup();
}

function renderQuizRun() {
  const list = route.list ?? [];
  if (list.length === 0) {
    showEmpty("🌱", "No kanji to quiz", "Pick a wider scope or learn some kanji first.");
    return;
  }

  let idx = 0;
  let correctCount = 0;
  const misses = [];

  const surface = document.createElement("section");
  surface.className = "card-surface";
  els.view.appendChild(surface);

  function renderQuestion() {
    const k = list[idx];
    const correct = (k.m ?? [])[0] ?? "—";
    const distractors = pickDistractors(k, 3);
    const options = shuffle([correct, ...distractors]);
    let answered = false;

    // Base mood reflects how grumpy Kaeru is at this point in the quiz.
    const baseMood =
      misses.length <= 2 ? "calm" :
      misses.length <= 5 ? "irked" :
      "angry";

    surface.innerHTML = `
      <div class="progress-line" style="width:${(idx / list.length) * 100}%"></div>
      <div class="card-meta">
        <span>Quiz · N${k.n}</span>
        <span>${idx + 1} / ${list.length} · ✓ ${correctCount}</span>
      </div>
      <div class="kanji-big">${k.c}</div>
      <div class="kaeru-asker" id="kaeru-host">
        ${kaeruSvg(baseMood, 64)}
        <div class="kaeru-bubble">What does this kanji mean?</div>
      </div>
      <div class="mcq-options">
        ${options.map((opt) => `
          <button class="mcq-opt" data-opt="${escapeHtml(opt)}">${escapeHtml(opt)}</button>
        `).join("")}
      </div>
    `;

    const optBtns = [...surface.querySelectorAll(".mcq-opt")];

    const updateKaeru = (mood, line) => {
      const host = surface.querySelector("#kaeru-host");
      if (!host) return;
      host.innerHTML = `${kaeruSvg(mood, 64)}<div class="kaeru-bubble">${escapeHtml(line)}</div>`;
    };

    const advance = () => {
      idx += 1;
      if (idx >= list.length) showResults();
      else renderQuestion();
    };

    const pickOption = (btn) => {
      if (answered) return;
      answered = true;
      const picked = btn.getAttribute("data-opt");
      const isCorrect = picked === correct;
      if (isCorrect) correctCount += 1;
      else misses.push({ k, picked });
      optBtns.forEach((b) => {
        b.disabled = true;
        const v = b.getAttribute("data-opt");
        if (v === correct) b.classList.add("correct");
        else if (b === btn) b.classList.add("wrong");
      });
      if (isCorrect) {
        const r = kaeruSpeak("quizRight", { kanji: k.c, correct });
        updateKaeru(r.mood, r.line);
      } else {
        const r = kaeruSpeak("quizWrong", {
          kanji: k.c, correct, picked, misses: misses.length,
        });
        updateKaeru(r.mood, r.line);
      }
      // Auto-advance: snappier when correct, longer on wrong so the
      // right answer (and Kaeru's reaction) stays visible.
      setTimeout(advance, isCorrect ? 700 : 1800);
    };
    optBtns.forEach((b) => b.addEventListener("click", () => pickOption(b)));

    if (viewCleanup) viewCleanup();
    function onKey(e) {
      if (answered) return;
      if (e.code >= "Digit1" && e.code <= "Digit4") {
        const i = Number(e.code.slice(-1)) - 1;
        if (optBtns[i]) { e.preventDefault(); pickOption(optBtns[i]); }
      }
    }
    document.addEventListener("keydown", onKey);
    viewCleanup = () => document.removeEventListener("keydown", onKey);
  }

  function showResults() {
    if (viewCleanup) { viewCleanup(); viewCleanup = null; }
    const pct = Math.round((correctCount / list.length) * 100);
    els.view.innerHTML = "";
    const e = document.createElement("section");
    e.className = "empty";
    e.innerHTML = `
      ${kaeruScene("quizDone", { pct }, "stack")}
      <h2>Quiz complete</h2>
      <p>${correctCount} of ${list.length} correct (${pct}%)</p>
      <div class="summary">
        <div class="box"><div class="v" style="color:var(--green)">${correctCount}</div><div class="l">correct</div></div>
        <div class="box"><div class="v" style="color:var(--red)">${misses.length}</div><div class="l">missed</div></div>
        <div class="box"><div class="v" style="color:var(--blue)">${pct}%</div><div class="l">accuracy</div></div>
      </div>
      ${misses.length > 0 ? `
        <h3 style="margin:18px 0 6px; font-size:13px; letter-spacing:1.5px; text-transform:uppercase; color:var(--text-mute)">Missed</h3>
        <div class="kanji-grid" id="miss-grid"></div>
      ` : ""}
      <div class="btn-row" style="justify-content:center; margin-top:16px">
        <button class="btn" data-go="home">Home</button>
        <button class="btn" data-go="quiz">New quiz</button>
        <button class="btn btn-primary" id="again">Quiz same again</button>
      </div>
    `;
    els.view.appendChild(e);
    e.querySelectorAll("[data-go]").forEach((b) =>
      b.addEventListener("click", () => go({ name: b.getAttribute("data-go") })),
    );
    e.querySelector("#again").addEventListener("click", () => {
      const reshuffled = shuffle(list.slice());
      go({ name: "quiz-run", list: reshuffled });
    });
    const missGrid = e.querySelector("#miss-grid");
    if (missGrid) {
      for (const { k } of misses) {
        const card = state.cards[k.c];
        const tier = card ? tierOf(card) : "unseen";
        missGrid.appendChild(renderKanjiCell(k, tier));
      }
    }
    if (pct === 100 && list.length >= 5) burst(60);
  }

  renderQuestion();
}

// ---------- Review ----------------------------------------------------------

function renderReview() {
  let queue = dueCards();
  if (queue.length === 0) {
    showEmptyWithKaeru("emptyReviews", "All caught up", "No reviews are due right now. Learn some new kanji, or come back later.");
    return;
  }

  const session = {
    combo: 0,
    crit: rollCrit(),
    answered: 0,
    again: 0,
    xpStart: state.xp.total,
    started: Date.now(),
  };

  const surface = document.createElement("section");
  surface.className = "card-surface";
  els.view.appendChild(surface);

  function nextCard() {
    queue = dueCards();
    if (queue.length === 0) return showReviewDone();
    const { char, card, k } = queue[0];
    revealed = false;
    const total = session.answered + queue.length;
    const pct = total > 0 ? (session.answered / total) * 100 : 0;
    surface.innerHTML = `
      <div class="progress-line" style="width:${pct}%"></div>
      <div class="card-meta">
        <span>Review · N${k.n} · ${tierOf(card)}</span>
        <span>
          ${session.combo > 1 ? `<span class="combo">combo ${session.combo}</span>` : ""}
          ${session.crit ? `<span class="double-xp">DOUBLE XP</span>` : ""}
        </span>
      </div>
      <div class="kanji-big" data-k>${k.c}</div>
      <div id="answer-slot"></div>
      <div class="tap-hint" id="tap-hint">Tap the kanji (or press space) to reveal</div>
    `;
    surface.querySelector("[data-k]").addEventListener("click", reveal);
    // Replace any prior card's listener
    if (viewCleanup) viewCleanup();
    document.addEventListener("keydown", onKey);
    viewCleanup = () => document.removeEventListener("keydown", onKey);
    function onKey(e) {
      if (!revealed && (e.code === "Space" || e.code === "Enter")) { e.preventDefault(); reveal(); }
      else if (revealed) {
        if (e.code === "Digit1") grade("again");
        else if (e.code === "Digit2") grade("hard");
        else if (e.code === "Digit3") grade("good");
        else if (e.code === "Digit4") grade("easy");
      }
    }

    function reveal() {
      if (revealed) return;
      revealed = true;
      surface.querySelector("#tap-hint").remove();
      const slot = surface.querySelector("#answer-slot");
      slot.innerHTML = `
        <div class="answer">
          <div class="row"><span class="label">Meaning</span>
            <span class="vals">${(k.m ?? []).slice(0,4).join(" · ") || "—"}</span></div>
          <div class="row"><span class="label">On-yomi</span>
            <span class="vals jp">${(k.on ?? []).join(" · ") || "—"}</span></div>
          <div class="row"><span class="label">Kun-yomi</span>
            <span class="vals jp">${(k.kun ?? []).join(" · ") || "—"}</span></div>
        </div>
        ${exampleHtml(k.c)}
        <div class="grade-row">
          <button class="grade grade-again" data-g="again">Again<span class="iv">${ivLabel(card, "again")}</span></button>
          <button class="grade grade-hard"  data-g="hard">Hard<span class="iv">${ivLabel(card, "hard")}</span></button>
          <button class="grade grade-good"  data-g="good">Good<span class="iv">${ivLabel(card, "good")}</span></button>
          <button class="grade grade-easy"  data-g="easy">Easy<span class="iv">${ivLabel(card, "easy")}</span></button>
        </div>
      `;
      slot.querySelectorAll("[data-g]").forEach((b) =>
        b.addEventListener("click", () => grade(b.getAttribute("data-g"))),
      );
    }

    function grade(action) {
      if (viewCleanup) { viewCleanup(); viewCleanup = null; }
      const before = state.cards[char];
      const tierBefore = tierOf(before);
      const updated = applyGrade(before, action);
      state.cards[char] = updated;
      const tierAfter = tierOf(updated);

      const award = awardForGrade(state, action, session);
      session.answered += 1;
      if (action === "again") session.again += 1;

      state.stats.reviewedTotal += 1;
      if (tierBefore === "apprentice" && tierAfter !== "apprentice") {
        state.stats.masteredEver += 1;
      }
      persist();

      if (award.gained > 0) {
        xpPop(award.gained, award.doubled);
        bump(els.xpWrap, "bump");
      } else {
        toast("bad", `${k.c} — keep going`);
      }
      if (award.streakChanged) {
        bump(els.streakWrap, "bump");
        if (state.streak.current > 1 && state.streak.current % 7 === 0) {
          toast("streak", `${state.streak.current}-day streak!`);
          burst(50);
        } else if (state.streak.current === 1) {
          toast("streak", `streak started`);
        }
      }
      if (tierBefore !== tierAfter && rankUp(tierBefore, tierAfter)) {
        toast("tier", `${k.c} → ${tierAfter}`);
        if (tierAfter === "master" || tierAfter === "enlightened" || tierAfter === "burned") burst(70);
      }
      session.crit = rollCrit();
      setTimeout(nextCard, 220);
    }
  }

  function showReviewDone() {
    if (viewCleanup) { viewCleanup(); viewCleanup = null; }
    const xpEarned = state.xp.total - session.xpStart;
    const secs = Math.max(1, Math.round((Date.now() - session.started) / 1000));
    els.view.innerHTML = "";
    const e = document.createElement("section");
    e.className = "empty";
    e.innerHTML = `
      ${kaeruScene("reviewDone", { count: session.answered }, "stack")}
      <h2>Session complete</h2>
      <p>${session.answered} reviewed in ${formatDuration(secs)}</p>
      <div class="summary">
        <div class="box"><div class="v" style="color:var(--yellow)">+${xpEarned}</div><div class="l">XP earned</div></div>
        <div class="box"><div class="v" style="color:var(--orange)">${session.again}</div><div class="l">${session.again === 1 ? "needs work" : "need work"}</div></div>
        <div class="box"><div class="v" style="color:var(--green)">${state.streak.current}</div><div class="l">Day streak</div></div>
      </div>
      <div class="btn-row" style="justify-content:center">
        <button class="btn" data-go="home">Home</button>
        ${dueCards().length > 0 ? `<button class="btn btn-primary" data-go="review">Keep going</button>` : ""}
      </div>
    `;
    els.view.appendChild(e);
    e.querySelectorAll("[data-go]").forEach((b) =>
      b.addEventListener("click", () => go({ name: b.getAttribute("data-go") })),
    );
    if (session.answered >= 20) burst(60);
  }

  let revealed = false;
  nextCard();
}

function ivLabel(card, action) {
  if (card.state !== "review") {
    if (action === "again") return "<1m";
    if (action === "hard") return "soon";
    if (action === "good") return card.step + 1 >= 2 ? "1d" : "10m";
    if (action === "easy") return "4d";
  } else {
    if (action === "again") return "10m";
    if (action === "hard") return roundDays(Math.max(card.interval + 1, card.interval * 1.2));
    if (action === "good") return roundDays(Math.max(card.interval + 1, card.interval * card.ease));
    if (action === "easy") return roundDays(Math.max(card.interval + 2, card.interval * card.ease * 1.3));
  }
}
function roundDays(d) {
  d = Math.round(d);
  if (d < 30) return `${d}d`;
  if (d < 365) return `${Math.round(d / 30)}mo`;
  return `${(d / 365).toFixed(1)}y`;
}
function rankUp(before, after) {
  const order = ["apprentice", "guru", "master", "enlightened", "burned"];
  return order.indexOf(after) > order.indexOf(before);
}
function formatDuration(s) {
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), r = s % 60;
  return `${m}m ${r.toString().padStart(2, "0")}s`;
}

// ---------- Inline level detail (expanded under home grid) ------------------

function matchesQuery(k, q) {
  if (!q) return true;
  const lower = q.toLowerCase();
  if (k.c.includes(q)) return true;
  if ((k.m ?? []).some((m) => m.toLowerCase().includes(lower))) return true;
  if ((k.on ?? []).some((r) => r.includes(q))) return true;
  if ((k.kun ?? []).some((r) => r.includes(q))) return true;
  return false;
}

function renderKanjiCell(k, tier) {
  const cell = document.createElement("button");
  cell.className = `k-cell tier-${tier}`;
  cell.innerHTML = `<div class="k">${k.c}</div><div class="m">${escapeHtml((k.m ?? [])[0] ?? "")}</div>`;
  cell.addEventListener("click", () => showKanjiDetail(k));
  return cell;
}

function renderInlineLevelDetail(level) {
  const list = kanji.filter((k) => k.n === level);
  const s = levelStats(level);
  const shouldScroll = route.scroll === true;

  const wrap = document.createElement("section");
  wrap.className = "inline-level-detail";
  wrap.innerHTML = `
    <div class="detail-head-row">
      <div>
        <div class="detail-title">N${level}</div>
        <div class="detail-sub">${list.length} kanji · ${s.masteredOrBetter} mastered · active level</div>
      </div>
      <button class="btn btn-ghost" id="collapse">Collapse ▴</button>
    </div>
    <div class="legend">
      <span class="legend-item"><i class="dot unseen"></i>unseen ${s.tally.unseen}</span>
      <span class="legend-item"><i class="dot tier-apprentice"></i>apprentice ${s.tally.apprentice}</span>
      <span class="legend-item"><i class="dot tier-guru"></i>guru ${s.tally.guru}</span>
      <span class="legend-item"><i class="dot tier-master"></i>master ${s.tally.master}</span>
      <span class="legend-item"><i class="dot tier-enlightened"></i>enlightened ${s.tally.enlightened}</span>
      <span class="legend-item"><i class="dot tier-burned"></i>burned ${s.tally.burned}</span>
    </div>
    <input type="search" class="kanji-search" placeholder="Search kanji, meaning, or reading…" aria-label="Search this level" />
  `;
  els.view.appendChild(wrap);
  wrap.querySelector("#collapse").addEventListener("click", () =>
    go({ name: "home", expanded: null }),
  );

  const grid = document.createElement("section");
  grid.className = "kanji-grid";
  els.view.appendChild(grid);

  const renderGrid = (q) => {
    grid.innerHTML = "";
    let shown = 0;
    for (const k of list) {
      if (!matchesQuery(k, q)) continue;
      const card = state.cards[k.c];
      const tier = card ? tierOf(card) : "unseen";
      grid.appendChild(renderKanjiCell(k, tier));
      shown += 1;
    }
    if (shown === 0) {
      const empty = document.createElement("div");
      empty.className = "tier-empty";
      empty.textContent = "— no matches";
      grid.appendChild(empty);
    }
  };
  renderGrid("");

  const search = wrap.querySelector(".kanji-search");
  search.addEventListener("input", (e) => renderGrid(e.target.value.trim()));

  if (shouldScroll) wrap.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showKanjiDetail(k) {
  const card = state.cards[k.c];
  const tier = card ? tierOf(card) : "unseen";
  const isLeech = card && card.lapses >= 8;
  const canBurn = tier !== "burned";
  const canRemove = card != null;
  const dlg = document.createElement("div");
  dlg.className = "modal-backdrop";
  dlg.setAttribute("role", "dialog");
  dlg.setAttribute("aria-modal", "true");
  dlg.setAttribute("aria-label", `Details for kanji ${k.c}`);
  dlg.innerHTML = `
    <div class="modal" tabindex="-1">
      <button class="modal-close" aria-label="Close">×</button>
      <div class="modal-k">${k.c}</div>
      <div class="modal-tier tier-${tier}">${tier}${isLeech ? ' <span class="leech-badge" title="Many lapses — consider revisiting the mnemonic">leech</span>' : ""}</div>
      <div class="answer">
        <div class="row"><span class="label">Meaning</span>
          <span class="vals">${escapeHtml((k.m ?? []).slice(0,4).join(" · ") || "—")}</span></div>
        <div class="row"><span class="label">On-yomi</span>
          <span class="vals jp">${escapeHtml((k.on ?? []).join(" · ") || "—")}</span></div>
        <div class="row"><span class="label">Kun-yomi</span>
          <span class="vals jp">${escapeHtml((k.kun ?? []).join(" · ") || "—")}</span></div>
        ${k.s ? `<div class="row"><span class="label">Strokes</span><span class="vals">${k.s}</span></div>` : ""}
        ${k.f ? `<div class="row"><span class="label">Frequency</span><span class="vals">#${k.f}</span></div>` : ""}
        ${card ? `<div class="row"><span class="label">Reps</span><span class="vals">${card.reps} · ${card.lapses} lapse${card.lapses === 1 ? "" : "s"}</span></div>` : ""}
      </div>
      ${exampleHtml(k.c)}
      <div class="modal-actions">
        ${canBurn ? `<button class="btn btn-ghost" data-act="burn">Mark as known (burn)</button>` : ""}
        ${canRemove ? `<button class="btn btn-ghost danger-text" data-act="remove">Remove from queue</button>` : ""}
      </div>
    </div>
  `;
  document.body.appendChild(dlg);

  // Focus management for a11y: remember the previously focused element,
  // move focus into the modal, restore it on close.
  const previouslyFocused = document.activeElement;
  const modalEl = dlg.querySelector(".modal");
  modalEl.focus();

  const close = () => {
    document.removeEventListener("keydown", onKey);
    dlg.remove();
    if (previouslyFocused && typeof previouslyFocused.focus === "function") {
      previouslyFocused.focus();
    }
  };
  function onKey(e) {
    if (e.key === "Escape") { e.preventDefault(); close(); }
  }
  document.addEventListener("keydown", onKey);

  dlg.addEventListener("click", (e) => { if (e.target === dlg) close(); });
  dlg.querySelector(".modal-close").addEventListener("click", close);

  const burnBtn = dlg.querySelector('[data-act="burn"]');
  if (burnBtn) burnBtn.addEventListener("click", () => {
    if (!confirm(`Mark ${k.c} as burned? It won't appear in reviews again.`)) return;
    // Set the card into a "burned" state: review-state with a 1-year interval.
    const now = Date.now();
    state.cards[k.c] = {
      state: "review",
      step: 0,
      ease: 2.5,
      interval: 400,           // ≥ 365 → tierOf returns 'burned'
      reps: (card?.reps ?? 0) + 1,
      lapses: card?.lapses ?? 0,
      due: now + 400 * 24 * 60 * 60 * 1000,
      introducedAt: card?.introducedAt ?? now,
    };
    persist();
    toast("tier", `${k.c} → burned`);
    close();
  });

  const rmBtn = dlg.querySelector('[data-act="remove"]');
  if (rmBtn) rmBtn.addEventListener("click", () => {
    if (!confirm(`Remove ${k.c} from your queue? Progress on it will be lost.`)) return;
    delete state.cards[k.c];
    persist();
    toast("bad", `${k.c} removed`);
    close();
  });
}

// ---------- Mastery overview ------------------------------------------------

function renderMastery() {
  const groups = { apprentice: [], guru: [], master: [], enlightened: [], burned: [] };
  for (const [char, card] of Object.entries(state.cards)) {
    const k = kanjiByChar.get(char);
    if (!k) continue;
    groups[tierOf(card)].push(k);
  }
  for (const t of TIERS) {
    groups[t].sort((a, b) => (b.n - a.n) || ((a.f ?? 9e9) - (b.f ?? 9e9)));
  }
  const total = Object.values(groups).reduce((a, b) => a + b.length, 0);

  const head = document.createElement("section");
  head.className = "detail-head";
  head.innerHTML = `
    <div class="detail-head-row">
      <div>
        <div class="detail-title">Your kanji by stage</div>
        <div class="detail-sub">${total} total in study</div>
      </div>
    </div>
    <input type="search" class="kanji-search" placeholder="Search your kanji, meaning, or reading…" aria-label="Search your kanji" />
  `;
  els.view.appendChild(head);

  const focus = route.focus;
  const order = focus ? [focus, ...TIERS.filter((t) => t !== focus)] : TIERS.slice();

  // Mount empty tier sections; rerender on search.
  const sections = new Map(); // tier → { section, grid }
  for (const t of order) {
    const section = document.createElement("section");
    section.className = "tier-section";
    section.innerHTML = `
      <div class="tier-section-head">
        <span class="tier-pill tier-${t}"><span class="n" data-count></span>${t}</span>
      </div>
    `;
    const grid = document.createElement("div");
    grid.className = "kanji-grid";
    section.appendChild(grid);
    els.view.appendChild(section);
    sections.set(t, { section, grid });
  }

  const renderAll = (q) => {
    for (const t of order) {
      const { section, grid } = sections.get(t);
      grid.innerHTML = "";
      const list = groups[t].filter((k) => matchesQuery(k, q));
      section.querySelector("[data-count]").textContent = q
        ? `${list.length}/${groups[t].length}`
        : `${groups[t].length}`;
      if (list.length === 0) {
        const empty = document.createElement("div");
        empty.className = "tier-empty";
        empty.textContent = q ? "— no matches" : "— none yet";
        grid.appendChild(empty);
      } else {
        for (const k of list) {
          const cell = document.createElement("button");
          cell.className = `k-cell tier-${t}`;
          cell.innerHTML = `<div class="k">${k.c}</div><div class="m">N${k.n}</div>`;
          cell.addEventListener("click", () => showKanjiDetail(k));
          grid.appendChild(cell);
        }
      }
    }
  };
  renderAll("");

  head.querySelector(".kanji-search").addEventListener("input", (e) => {
    renderAll(e.target.value.trim());
  });
}

// ---------- Settings --------------------------------------------------------

function renderSettings() {
  const wrap = document.createElement("section");
  wrap.innerHTML = `
    <div class="field">
      <h3>Active JLPT level</h3>
      <div class="opt-row" id="lvl-row">
        ${[5,4,3,2,1].map((n) => `
          <button class="opt ${state.settings.activeLevel === n ? "selected" : ""}" data-lvl="${n}">N${n}</button>
        `).join("")}
      </div>
    </div>

    <div class="field">
      <h3>Cards per learn session</h3>
      <div class="field-row">
        <input type="range" min="1" max="20" value="${state.settings.learnChunkSize ?? 5}" id="cap" />
        <strong id="cap-val">${state.settings.learnChunkSize ?? 5}</strong>
      </div>
      <p style="color:var(--text-dim); font-size:13px; margin:8px 0 0">
        How many new kanji are introduced per Learn session. No daily limit —
        finish a session and tap "Learn more" to keep going.
      </p>
    </div>

    <div class="field">
      <h3>Backup</h3>
      <div class="btn-row">
        <button class="btn" id="export">Export progress (JSON)</button>
        <label class="btn" for="import-file">Import…</label>
        <input type="file" id="import-file" accept="application/json" hidden />
      </div>
    </div>

    <div class="field">
      <h3>Danger zone</h3>
      <div class="btn-row">
        <button class="btn danger" id="reset">Reset all progress</button>
      </div>
    </div>

    <p style="color:var(--text-mute); font-size:12px; margin-top:24px; text-align:center">
      Kanji data derived from
      <a href="https://github.com/davidluzgouveia/kanji-data" style="color:var(--blue)">davidluzgouveia/kanji-data</a>
      (KANJIDIC). All progress is stored locally in your browser.
    </p>
  `;
  els.view.appendChild(wrap);

  wrap.querySelectorAll("[data-lvl]").forEach((b) =>
    b.addEventListener("click", () => {
      state.settings.activeLevel = Number(b.getAttribute("data-lvl"));
      persist(); renderSettings();
    }),
  );

  const cap = wrap.querySelector("#cap");
  const capVal = wrap.querySelector("#cap-val");
  cap.addEventListener("input", () => { capVal.textContent = cap.value; });
  cap.addEventListener("change", () => {
    state.settings.learnChunkSize = Number(cap.value); persist();
  });

  wrap.querySelector("#export").addEventListener("click", () => {
    const blob = new Blob([exportState()], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `kanji-quest-progress-${todayKey()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  });
  wrap.querySelector("#import-file").addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      importState(await file.text());
      state = loadState();
      persist(); renderSettings();
      toast("good", "Progress imported");
    } catch {
      toast("bad", "Couldn't read that file");
    }
  });
  wrap.querySelector("#reset").addEventListener("click", () => {
    if (!confirm("Erase all progress, XP, streak, and learned cards? This cannot be undone.")) return;
    resetState();
    state = loadState();
    persist(); go({ name: "home" });
  });
}

// ---------- Empty state -----------------------------------------------------

function showEmptyWithKaeru(context, title, body) {
  const e = document.createElement("section");
  e.className = "empty";
  e.innerHTML = `
    ${kaeruScene(context, {}, "stack")}
    <h2>${title}</h2>
    <p>${body}</p>
    <div class="btn-row" style="justify-content:center">
      <button class="btn" data-go="home">Home</button>
    </div>
  `;
  els.view.appendChild(e);
  e.querySelectorAll("[data-go]").forEach((b) =>
    b.addEventListener("click", () => go({ name: b.getAttribute("data-go") })),
  );
}

function showEmpty(emoji, title, body) {
  const e = document.createElement("section");
  e.className = "empty";
  e.innerHTML = `
    <div class="emoji">${emoji}</div>
    <h2>${title}</h2>
    <p>${body}</p>
    <div class="btn-row" style="justify-content:center">
      <button class="btn" data-go="home">Home</button>
    </div>
  `;
  els.view.appendChild(e);
  e.querySelectorAll("[data-go]").forEach((b) =>
    b.addEventListener("click", () => go({ name: b.getAttribute("data-go") })),
  );
}

// ---------- FX layer --------------------------------------------------------

function xpPop(amount, doubled) {
  const el = document.createElement("div");
  el.className = "xp-pop";
  el.textContent = `${doubled ? "2× " : ""}+${amount} XP`;
  const r = els.xpWrap.getBoundingClientRect();
  el.style.left = `${r.left + r.width / 2 - 24}px`;
  el.style.top = `${r.bottom + 4}px`;
  els.fx.appendChild(el);
  setTimeout(() => el.remove(), 1000);
}

function burst(count = 40) {
  const colors = ["#fde047", "#4ade80", "#60a5fa", "#c084fc", "#fb923c", "#f472b6"];
  for (let i = 0; i < count; i++) {
    const el = document.createElement("div");
    el.className = "confetti";
    el.style.left = `${50 + (Math.random() - 0.5) * 30}%`;
    el.style.top = `-10vh`;
    el.style.background = colors[i % colors.length];
    el.style.setProperty("--dx", `${(Math.random() - 0.5) * 60}vw`);
    el.style.animationDelay = `${Math.random() * 0.2}s`;
    els.fx.appendChild(el);
    setTimeout(() => el.remove(), 1700);
  }
}

function toast(kind, msg) {
  const el = document.createElement("div");
  el.className = `toast ${kind}`;
  el.textContent = msg;
  els.toasts.appendChild(el);
  setTimeout(() => el.remove(), 2700);
}

function bump(target, cls) {
  target.classList.remove(cls);
  void target.offsetWidth;
  target.classList.add(cls);
  setTimeout(() => target.classList.remove(cls), 900);
}
