// Main app controller: data loading, routing, views, FX.

import { loadState, saveState, resetState, exportState, importState } from "./storage.js";
import { newCard, grade as applyGrade, tierOf, isDue, TIERS, DAY } from "./srs.js";
import { awardForGrade, rollCrit, todayKey, levelFromXp } from "./gamification.js";

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
let route = { name: "home" };

(async function init() {
  const res = await fetch("./data/jlpt-kanji.json");
  kanji = await res.json();
  kanjiByChar = new Map(kanji.map((k) => [k.c, k]));

  els.navHome.addEventListener("click", () => go({ name: "home" }));
  els.navSettings.addEventListener("click", () => go({ name: "settings" }));

  renderTopbar();
  go({ name: "home" });
})();

function go(next) {
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

function newCardsIntroducedToday() {
  const t = todayKey();
  return Object.values(state.cards).filter((c) => {
    const d = new Date(c.introducedAt);
    return d.toLocaleDateString("en-CA") === t;
  }).length;
}

function remainingDailyCap() {
  return Math.max(0, state.settings.dailyNewCap - newCardsIntroducedToday());
}

function dueCards(now = Date.now()) {
  const out = [];
  for (const [char, card] of Object.entries(state.cards)) {
    if (isDue(card, now)) {
      const k = kanjiByChar.get(char);
      if (k) out.push({ char, card, k });
    }
  }
  // Due first (oldest overdue first), then learning vs review interleaved.
  out.sort((a, b) => a.card.due - b.card.due);
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
  }
}

// ---------- Home ------------------------------------------------------------

function renderHome() {
  const due = dueCards().length;
  const remaining = remainingDailyCap();
  const newAvail = Math.min(remaining, unseenInLevel().length);
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
              ? remaining === 0
                ? "Daily cap reached — try tomorrow"
                : `All N${state.settings.activeLevel} introduced`
              : `${remaining} left today`
          }</div>
        </div>
        <div class="count">${newAvail}</div>
      </button>
    </div>
  `;
  els.view.appendChild(hero);

  // Mastery row
  const mastery = aggregateMastery();
  const masteryEl = document.createElement("div");
  masteryEl.className = "section-title";
  masteryEl.textContent = "Your mastery";
  els.view.appendChild(masteryEl);
  const row = document.createElement("div");
  row.className = "mastery-row";
  for (const t of TIERS) {
    const pill = document.createElement("div");
    pill.className = `tier-pill tier-${t}`;
    pill.innerHTML = `<span class="n">${mastery[t]}</span>${t}`;
    row.appendChild(pill);
  }
  els.view.appendChild(row);

  // Level grid
  const lvlTitle = document.createElement("div");
  lvlTitle.className = "section-title";
  lvlTitle.textContent = "JLPT levels — tap to focus";
  els.view.appendChild(lvlTitle);

  const grid = document.createElement("div");
  grid.className = "level-grid";
  for (const n of [5, 4, 3, 2, 1]) {
    const s = levelStats(n);
    const card = document.createElement("button");
    card.className = "level-card" + (state.settings.activeLevel === n ? " active" : "");
    card.innerHTML = `
      <div class="name">N${n}</div>
      <div class="meta">${s.masteredOrBetter}/${s.total} mastered</div>
      <div class="bar"><span style="width:${Math.round(s.pct*100)}%"></span></div>
    `;
    card.addEventListener("click", () => {
      state.settings.activeLevel = n;
      persist();
      render();
    });
    grid.appendChild(card);
  }
  els.view.appendChild(grid);

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

// ---------- Learn -----------------------------------------------------------

function renderLearn() {
  const list = unseenInLevel().slice(0, remainingDailyCap());
  if (list.length === 0) {
    showEmpty(
      "🌱",
      "No new cards available",
      remainingDailyCap() === 0
        ? "You've hit your daily new-card cap. Come back tomorrow — or bump the cap in Settings."
        : `All N${state.settings.activeLevel} kanji have been introduced. Pick another level on the home screen.`,
    );
    return;
  }

  let idx = 0;

  const surface = document.createElement("section");
  surface.className = "card-surface";
  els.view.appendChild(surface);

  function step() {
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
          Build a mental picture of <em>${(k.m?.[0] ?? "this")}</em> using its parts:
          <em>${k.r.join(", ")}</em>. The weirder, the stickier.
        </div>` : ""}
      </div>
      <div class="btn-row" style="justify-content:flex-end; margin-top:auto">
        <button class="btn btn-ghost" data-act="skip">Skip</button>
        <button class="btn btn-success" data-act="got">Got it →</button>
      </div>
    `;
    surface.querySelector('[data-act="got"]').addEventListener("click", () => commit("got"));
    surface.querySelector('[data-act="skip"]').addEventListener("click", () => commit("skip"));
  }

  function commit(action) {
    const k = list[idx];
    if (action === "got") {
      state.cards[k.c] = newCard();
      persist();
      toast("good", `+ ${k.c} added to your queue`);
    }
    idx += 1;
    if (idx >= list.length) {
      showLearnDone();
    } else {
      step();
    }
  }

  function showLearnDone() {
    els.view.innerHTML = "";
    const e = document.createElement("section");
    e.className = "empty";
    e.innerHTML = `
      <div class="emoji">🎉</div>
      <h2>Nice — those are queued</h2>
      <p>They'll start appearing in your reviews within a minute.</p>
      <div class="btn-row" style="justify-content:center">
        <button class="btn" data-go="home">Home</button>
        <button class="btn btn-primary" data-go="review">Start reviewing</button>
      </div>
    `;
    els.view.appendChild(e);
    e.querySelectorAll("[data-go]").forEach((b) =>
      b.addEventListener("click", () => go({ name: b.getAttribute("data-go") })),
    );
    burst(40);
  }

  step();
}

// ---------- Review ----------------------------------------------------------

function renderReview() {
  let queue = dueCards();
  if (queue.length === 0) {
    showEmpty("✨", "All caught up", "No reviews are due right now. Learn some new kanji, or come back later.");
    return;
  }

  const session = {
    combo: 0,
    crit: rollCrit(),
    answered: 0,
    correct: 0,
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
    surface.innerHTML = `
      <div class="progress-line" style="width:${(session.answered/(session.answered + queue.length))*100}%"></div>
      <div class="card-meta">
        <span>Review · N${k.n} · ${tierOf(card)}</span>
        <span>
          ${session.combo > 1 ? `<span class="combo">🔥 ${session.combo}</span>` : ""}
          ${session.crit ? `<span class="double-xp">★ DOUBLE XP</span>` : ""}
        </span>
      </div>
      <div class="kanji-big" data-k>${k.c}</div>
      <div id="answer-slot"></div>
      <div class="tap-hint" id="tap-hint">Tap the kanji (or press space) to reveal</div>
    `;
    surface.querySelector("[data-k]").addEventListener("click", reveal);
    document.addEventListener("keydown", onKey);
    function onKey(e) {
      if (!revealed && (e.code === "Space" || e.code === "Enter")) { e.preventDefault(); reveal(); }
      else if (revealed) {
        if (e.code === "Digit1") grade("again");
        else if (e.code === "Digit2") grade("hard");
        else if (e.code === "Digit3") grade("good");
        else if (e.code === "Digit4") grade("easy");
      }
    }
    surface._cleanup = () => document.removeEventListener("keydown", onKey);

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
      surface._cleanup?.();
      const before = state.cards[char];
      const tierBefore = tierOf(before);
      const updated = applyGrade(before, action);
      state.cards[char] = updated;
      const tierAfter = tierOf(updated);

      const award = awardForGrade(state, action, session);
      session.answered += 1;
      if (action !== "again") session.correct += 1;
      else session.again += 1;

      state.stats.reviewedTotal += 1;
      if (tierBefore === "apprentice" && tierAfter !== "apprentice") {
        state.stats.masteredEver += 1;
      }
      persist();

      // Visual feedback
      if (award.gained > 0) {
        xpPop(award.gained, award.doubled);
        bump(els.xpWrap, "bump");
      } else {
        toast("bad", `${k.c} — keep going`);
      }
      if (award.streakChanged) {
        flame(els.streakWrap);
        if (state.streak.current > 1 && state.streak.current % 7 === 0) {
          toast("streak", `🔥 ${state.streak.current}-day streak!`);
          burst(50);
        } else if (state.streak.current === 1) {
          toast("streak", `🔥 streak started`);
        }
      }
      if (tierBefore !== tierAfter && rankUp(tierBefore, tierAfter)) {
        toast("tier", `⬆ ${k.c} — ${tierAfter}!`);
        if (tierAfter === "master" || tierAfter === "enlightened" || tierAfter === "burned") burst(70);
      }
      // Roll crit for next card
      session.crit = rollCrit();
      // Next card
      setTimeout(nextCard, 220);
    }
  }

  function showReviewDone() {
    surface._cleanup?.();
    const xpEarned = state.xp.total - session.xpStart;
    const acc = session.answered === 0 ? 0 : Math.round((session.correct / session.answered) * 100);
    const secs = Math.max(1, Math.round((Date.now() - session.started) / 1000));
    els.view.innerHTML = "";
    const e = document.createElement("section");
    e.className = "empty";
    e.innerHTML = `
      <div class="emoji">${acc >= 90 ? "🏅" : acc >= 70 ? "💪" : "📚"}</div>
      <h2>Session complete</h2>
      <p>${session.answered} reviewed in ${formatDuration(secs)}</p>
      <div class="summary">
        <div class="box"><div class="v" style="color:var(--yellow)">+${xpEarned}</div><div class="l">XP</div></div>
        <div class="box"><div class="v" style="color:var(--green)">${acc}%</div><div class="l">Accuracy</div></div>
        <div class="box"><div class="v" style="color:var(--orange)">${state.streak.current}</div><div class="l">Day streak</div></div>
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
    if (acc >= 90 && session.answered >= 5) burst(80);
  }

  let revealed = false;
  nextCard();
}

function ivLabel(card, action) {
  // A user-facing "what happens next" hint — keeps it lightweight, no exact values.
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
      <h3>Daily new-card cap</h3>
      <div class="field-row">
        <input type="range" min="1" max="20" value="${state.settings.dailyNewCap}" id="cap" />
        <strong id="cap-val">${state.settings.dailyNewCap}</strong>
      </div>
      <p style="color:var(--text-dim); font-size:13px; margin:8px 0 0">
        Lower = steadier review load. 5–10 is sustainable for most learners.
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
    state.settings.dailyNewCap = Number(cap.value); persist();
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
  el.textContent = `${doubled ? "★ " : ""}+${amount} XP`;
  // Position near the XP stat in the top-right
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

function flame(target) { bump(target, "flame"); }
function bump(target, cls) {
  target.classList.remove(cls);
  // Force reflow so the animation can restart
  void target.offsetWidth;
  target.classList.add(cls);
  setTimeout(() => target.classList.remove(cls), 900);
}
