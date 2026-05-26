// Persistent state in localStorage. One key, JSON-serialised.

const KEY = "dpkanji.state.v1";

const defaultState = () => ({
  version: 1,
  settings: {
    activeLevel: 5,        // start at N5
    learnChunkSize: 5,     // new kanji introduced per Learn session
    soundEnabled: true,
  },
  xp: { total: 0, byDay: {} },
  streak: { current: 0, longest: 0, lastDay: null },
  cards: {},               // keyed by kanji character
  stats: { reviewedTotal: 0, masteredEver: 0 },
});

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    // shallow merge so new fields appear on upgrades
    const base = defaultState();
    const settings = { ...base.settings, ...(parsed.settings ?? {}) };
    // Migrate legacy dailyNewCap → learnChunkSize (renamed once
    // per-day-cap was removed in favour of per-session chunking).
    if (settings.learnChunkSize == null && parsed.settings?.dailyNewCap != null) {
      settings.learnChunkSize = parsed.settings.dailyNewCap;
    }
    delete settings.dailyNewCap;
    return {
      ...base,
      ...parsed,
      settings,
      xp: { ...base.xp, ...(parsed.xp ?? {}) },
      streak: { ...base.streak, ...(parsed.streak ?? {}) },
      stats: { ...base.stats, ...(parsed.stats ?? {}) },
      cards: parsed.cards ?? {},
    };
  } catch {
    return defaultState();
  }
}

export function saveState(state) {
  localStorage.setItem(KEY, JSON.stringify(state));
}

export function resetState() {
  localStorage.removeItem(KEY);
}

export function exportState() {
  return JSON.stringify(loadState(), null, 2);
}

export function importState(json) {
  const parsed = JSON.parse(json);
  if (typeof parsed !== "object" || parsed === null) throw new Error("not an object");
  localStorage.setItem(KEY, JSON.stringify(parsed));
}
