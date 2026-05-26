// XP, streak, combo, milestones — the dopamine layer.

export const XP_BASE = { again: 0, hard: 5, good: 10, easy: 15 };

/** Same calendar day in the user's local timezone. */
export function todayKey(d = new Date()) {
  return d.toLocaleDateString("en-CA"); // YYYY-MM-DD
}

export function dayDiff(a, b) {
  if (!a || !b) return Infinity;
  const da = new Date(a + "T00:00:00");
  const db = new Date(b + "T00:00:00");
  return Math.round((db - da) / 86400000);
}

/**
 * Apply XP + combo + streak side-effects to state.
 * Returns { gained, combo, doubled, streakChanged }
 * Mutates `state` in place. Caller is responsible for persisting.
 */
export function awardForGrade(state, action, session) {
  let gained = XP_BASE[action];
  let doubled = false;
  let comboBefore = session.combo;

  if (action === "again") {
    session.combo = 0;
  } else {
    session.combo += 1;
    // Combo bonus: +1 XP per consecutive correct, capped
    gained += Math.min(session.combo, 10);
    // Variable-reward "crit": 10% chance to double XP
    if (session.crit) {
      gained *= 2;
      doubled = true;
      session.crit = false;
    }
  }

  // Daily streak update — only on a non-Again answer
  let streakChanged = false;
  if (action !== "again") {
    const today = todayKey();
    if (state.streak.lastDay !== today) {
      const diff = dayDiff(state.streak.lastDay, today);
      if (diff === 1) state.streak.current += 1;
      else state.streak.current = 1;
      state.streak.lastDay = today;
      state.streak.longest = Math.max(state.streak.longest, state.streak.current);
      streakChanged = true;
    }
  }

  if (gained > 0) {
    state.xp.total += gained;
    const today = todayKey();
    state.xp.byDay[today] = (state.xp.byDay[today] ?? 0) + gained;
  }

  return { gained, combo: session.combo, comboBefore, doubled, streakChanged };
}

/** Decide whether the upcoming card should be a "DOUBLE XP" crit. ~10%. */
export function rollCrit() {
  return Math.random() < 0.1;
}

/** Level number derived from total XP. Each level needs ~25% more XP than the last. */
export function levelFromXp(xp) {
  // L1 = 0, L2 = 50, L3 = 113, L4 = 191, ...   roughly 50 * (1.25^(L-1) - 1) / 0.25
  let level = 1, threshold = 0, step = 50;
  while (xp >= threshold + step) {
    threshold += step;
    step = Math.round(step * 1.25);
    level += 1;
  }
  return { level, into: xp - threshold, needed: step };
}
