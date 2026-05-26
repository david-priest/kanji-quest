// Lightweight SRS scheduler. SM-2 with FSRS-inspired tweaks:
//   - Two short learning steps (1m, 10m) so 10-minute sessions feel productive
//   - Ease clamped to [1.3, 3.5]
//   - Lapses route through a re-learning step, not straight back to graduated
// A future v2 could swap in true FSRS with fitted parameters.

export const MINUTE = 60 * 1000;
export const DAY = 24 * 60 * MINUTE;

const LEARNING_STEPS = [1 * MINUTE, 10 * MINUTE];
const GRADUATING_INTERVAL_D = 1;
const EASY_GRADUATING_INTERVAL_D = 4;
const RELEARN_STEP = 10 * MINUTE;
const MIN_EASE = 1.3;
const MAX_EASE = 3.5;

/** Build a fresh card record for a kanji the user just chose to learn. */
export function newCard(now = Date.now()) {
  return {
    state: "learning",
    step: 0,
    ease: 2.5,
    interval: 0,           // days (review state only)
    reps: 0,
    lapses: 0,
    due: now,              // available immediately
    introducedAt: now,
  };
}

/**
 * Apply a grade to a card and return the updated card.
 * grade: "again" | "hard" | "good" | "easy"
 */
export function grade(card, action, now = Date.now()) {
  const c = { ...card };
  switch (c.state) {
    case "learning":
    case "lapsed": {
      const steps = c.state === "lapsed" ? [RELEARN_STEP] : LEARNING_STEPS;
      if (action === "again") {
        c.step = 0;
        c.due = now + steps[0];
      } else if (action === "hard") {
        // Stay on the same step, due at midpoint of current and (current+next)
        const cur = steps[Math.min(c.step, steps.length - 1)];
        c.due = now + Math.round(cur * 1.5);
      } else if (action === "good") {
        c.step += 1;
        if (c.step >= steps.length) {
          // Graduate
          c.state = "review";
          c.interval = GRADUATING_INTERVAL_D;
          c.due = now + c.interval * DAY;
          c.reps += 1;
          c.step = 0;
        } else {
          c.due = now + steps[c.step];
        }
      } else if (action === "easy") {
        c.state = "review";
        c.interval = EASY_GRADUATING_INTERVAL_D;
        c.due = now + c.interval * DAY;
        c.reps += 1;
        c.step = 0;
      }
      break;
    }
    case "review": {
      if (action === "again") {
        c.state = "lapsed";
        c.step = 0;
        c.lapses += 1;
        c.ease = clampEase(c.ease - 0.2);
        c.interval = 0;
        c.due = now + RELEARN_STEP;
      } else if (action === "hard") {
        c.ease = clampEase(c.ease - 0.15);
        c.interval = Math.max(c.interval + 1, Math.round(c.interval * 1.2));
        c.reps += 1;
        c.due = now + c.interval * DAY;
      } else if (action === "good") {
        c.interval = Math.max(c.interval + 1, Math.round(c.interval * c.ease));
        c.reps += 1;
        c.due = now + c.interval * DAY;
      } else if (action === "easy") {
        c.ease = clampEase(c.ease + 0.15);
        c.interval = Math.max(c.interval + 2, Math.round(c.interval * c.ease * 1.3));
        c.reps += 1;
        c.due = now + c.interval * DAY;
      }
      break;
    }
  }
  return c;
}

function clampEase(e) {
  return Math.max(MIN_EASE, Math.min(MAX_EASE, e));
}

/** Mastery tier derived from current card state. */
export function tierOf(card) {
  if (!card) return "unseen";
  if (card.state !== "review") return "apprentice";
  if (card.interval < 21) return "guru";
  if (card.interval < 90) return "master";
  if (card.interval < 365) return "enlightened";
  return "burned";
}

export const TIERS = ["apprentice", "guru", "master", "enlightened", "burned"];

export function isDue(card, now = Date.now()) {
  return card && card.due <= now;
}
