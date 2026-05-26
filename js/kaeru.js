// Master Kaeru — the kanji frog monk who narrates the app.
//
// kaeruSvg(mood, size) returns inline SVG markup. Moods change eyes
// and mouth; everything else is consistent. CSS handles the breathing
// animation and any mood-triggered reactions.
//
// speak(context, ctx) returns a context-appropriate flavor line.
// ctx fields are optional — quotes that reference a field gracefully
// fall back when it's missing.

export function kaeruSvg(mood = "calm", size = 110) {
  return `
    <svg class="kaeru kaeru-${mood}" width="${size}" height="${size}"
         viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg"
         aria-hidden="true">
      <!-- soft shadow under the lotus -->
      <ellipse cx="60" cy="114" rx="34" ry="3" fill="rgba(15,23,42,0.18)"/>

      <!-- lotus base (legs folded) -->
      <ellipse cx="60" cy="100" rx="40" ry="13" fill="#558b2f"/>
      <ellipse cx="60" cy="98" rx="34" ry="9" fill="#7cb342" opacity="0.6"/>

      <!-- robe lower half -->
      <path d="M 22 82 Q 60 73 98 82 L 92 108 Q 60 114 28 108 Z"
            fill="#b45309"/>
      <path d="M 60 73 L 60 112" stroke="#92400e" stroke-width="1.4" opacity="0.45"/>

      <!-- body / chest -->
      <ellipse cx="60" cy="64" rx="30" ry="28" fill="#7cb342"/>
      <ellipse cx="60" cy="72" rx="18" ry="13" fill="#aed581" opacity="0.65"/>

      <!-- robe across the shoulders -->
      <path d="M 30 65 Q 60 74 90 65 L 88 79 Q 60 84 32 79 Z"
            fill="#b45309"/>

      <!-- mala beads -->
      <circle cx="45" cy="73" r="1.6" fill="#7c2d12"/>
      <circle cx="51" cy="76" r="1.6" fill="#7c2d12"/>
      <circle cx="60" cy="77.4" r="2" fill="#facc15"/>
      <circle cx="69" cy="76" r="1.6" fill="#7c2d12"/>
      <circle cx="75" cy="73" r="1.6" fill="#7c2d12"/>

      <!-- head (wider than the body, frog-style) -->
      <ellipse cx="60" cy="42" rx="29" ry="22" fill="#7cb342"/>

      <!-- eye protrusions -->
      <ellipse cx="46" cy="28" rx="10" ry="9" fill="#7cb342"/>
      <ellipse cx="74" cy="28" rx="10" ry="9" fill="#7cb342"/>

      ${eyesFor(mood)}

      <!-- urna -->
      <circle cx="60" cy="30" r="1.6" fill="#7c2d12"/>

      <!-- cheek blush -->
      <circle cx="42" cy="52" r="3" fill="#f87171" opacity="0.4"/>
      <circle cx="78" cy="52" r="3" fill="#f87171" opacity="0.4"/>

      ${mouthFor(mood)}

      <!-- folded hands in his lap -->
      <ellipse cx="60" cy="93" rx="14" ry="7" fill="#7cb342"/>
      <ellipse cx="60" cy="91.5" rx="11" ry="5" fill="#aed581" opacity="0.55"/>
    </svg>
  `;
}

function eyesFor(mood) {
  switch (mood) {
    case "happy":
      // arched-shut "^_^" eyes
      return `
        <path d="M 41 28 Q 46 23 51 28" stroke="#1a1d24" stroke-width="2"
              fill="none" stroke-linecap="round"/>
        <path d="M 69 28 Q 74 23 79 28" stroke="#1a1d24" stroke-width="2"
              fill="none" stroke-linecap="round"/>
      `;
    case "sad":
      return `
        <circle cx="46" cy="29" r="2" fill="#1a1d24"/>
        <circle cx="74" cy="29" r="2" fill="#1a1d24"/>
        <path d="M 42 25 Q 46 27 50 25" stroke="#1a1d24" stroke-width="1.4"
              fill="none" stroke-linecap="round"/>
        <path d="M 70 25 Q 74 27 78 25" stroke="#1a1d24" stroke-width="1.4"
              fill="none" stroke-linecap="round"/>
      `;
    case "irked":
      // half-lowered lids + downward brow
      return `
        <path d="M 40 27 L 51 24" stroke="#7c2d12" stroke-width="1.6"
              fill="none" stroke-linecap="round"/>
        <path d="M 80 27 L 69 24" stroke="#7c2d12" stroke-width="1.6"
              fill="none" stroke-linecap="round"/>
        <circle cx="46" cy="30" r="2" fill="#1a1d24"/>
        <circle cx="74" cy="30" r="2" fill="#1a1d24"/>
        <path d="M 41 31 Q 46 33 51 31" stroke="#1a1d24" stroke-width="1.4"
              fill="none" stroke-linecap="round"/>
        <path d="M 69 31 Q 74 33 79 31" stroke="#1a1d24" stroke-width="1.4"
              fill="none" stroke-linecap="round"/>
      `;
    case "angry":
      // ">_<" furious eyes + steam puffs
      return `
        <path d="M 40 24 L 52 31" stroke="#7c2d12" stroke-width="2.2"
              stroke-linecap="round"/>
        <path d="M 80 24 L 68 31" stroke="#7c2d12" stroke-width="2.2"
              stroke-linecap="round"/>
        <path d="M 41 32 L 51 28" stroke="#1a1d24" stroke-width="1.6"
              fill="none" stroke-linecap="round"/>
        <path d="M 79 32 L 69 28" stroke="#1a1d24" stroke-width="1.6"
              fill="none" stroke-linecap="round"/>
        <circle cx="26" cy="22" r="3" fill="#fff" stroke="#94a3b8"
                stroke-width="1" opacity="0.85"/>
        <circle cx="22" cy="16" r="2" fill="#fff" stroke="#94a3b8"
                stroke-width="1" opacity="0.7"/>
        <circle cx="94" cy="22" r="3" fill="#fff" stroke="#94a3b8"
                stroke-width="1" opacity="0.85"/>
        <circle cx="98" cy="16" r="2" fill="#fff" stroke="#94a3b8"
                stroke-width="1" opacity="0.7"/>
      `;
    case "alert":
      return `
        <circle cx="46" cy="28" r="4.5" fill="#fff" stroke="#1a1d24" stroke-width="1.2"/>
        <circle cx="74" cy="28" r="4.5" fill="#fff" stroke="#1a1d24" stroke-width="1.2"/>
        <circle cx="47" cy="28.5" r="2.4" fill="#1a1d24"/>
        <circle cx="75" cy="28.5" r="2.4" fill="#1a1d24"/>
      `;
    case "sleep":
      return `
        <path d="M 41 29 Q 46 31 51 29" stroke="#1a1d24" stroke-width="1.6"
              fill="none" stroke-linecap="round"/>
        <path d="M 69 29 Q 74 31 79 29" stroke="#1a1d24" stroke-width="1.6"
              fill="none" stroke-linecap="round"/>
        <text x="92" y="22" font-size="8" font-family="sans-serif"
              fill="#1a1d24" opacity="0.6">z</text>
        <text x="98" y="14" font-size="6" font-family="sans-serif"
              fill="#1a1d24" opacity="0.45">z</text>
      `;
    case "calm":
    default:
      // meditative slits
      return `
        <path d="M 41 30 Q 46 32 51 30" stroke="#1a1d24" stroke-width="1.6"
              fill="none" stroke-linecap="round"/>
        <path d="M 69 30 Q 74 32 79 30" stroke="#1a1d24" stroke-width="1.6"
              fill="none" stroke-linecap="round"/>
      `;
  }
}

function mouthFor(mood) {
  switch (mood) {
    case "happy":
      return `
        <path d="M 48 50 Q 60 60 72 50" stroke="#1a1d24" stroke-width="2.2"
              fill="none" stroke-linecap="round"/>
      `;
    case "sad":
      return `
        <path d="M 50 56 Q 60 50 70 56" stroke="#1a1d24" stroke-width="2"
              fill="none" stroke-linecap="round"/>
      `;
    case "irked":
      return `
        <path d="M 52 53 L 68 53" stroke="#1a1d24" stroke-width="2"
              fill="none" stroke-linecap="round"/>
      `;
    case "angry":
      return `
        <path d="M 48 56 Q 60 48 72 56 L 70 58 Q 60 52 50 58 Z"
              fill="#1a1d24" stroke="#1a1d24" stroke-width="1.6"
              stroke-linejoin="round"/>
      `;
    case "alert":
      return `
        <ellipse cx="60" cy="54" rx="4" ry="3" fill="#1a1d24"/>
      `;
    case "sleep":
      return `
        <path d="M 52 52 Q 60 54 68 52" stroke="#1a1d24" stroke-width="1.6"
              fill="none" stroke-linecap="round"/>
      `;
    case "calm":
    default:
      return `
        <path d="M 50 50 Q 60 56 70 50" stroke="#1a1d24" stroke-width="2"
              fill="none" stroke-linecap="round"/>
      `;
  }
}

// ---------- Speech ----------------------------------------------------------

const QUOTES = {
  greeting: [
    "The temple's gates are open. Step through.",
    "Have you fed your kanji today?",
    "Even an old monk forgot 'forgotten' once.",
    "Practice is the slow river that wears the stone.",
  ],
  greetingStreak: [
    "{streak} days at the gate. Persistence is a quiet virtue.",
    "{streak} sunrises walked. The bamboo creaks wider.",
    "Day {streak}. The lantern still burns.",
  ],
  greetingStreakMilestone: [
    "{streak} days. The wind itself knows your name now.",
    "{streak}. Even the stones nod.",
  ],
  emptyReviews: [
    "The pond is still. Rest, or wander.",
    "No bells today. Even monks have empty afternoons.",
    "Stillness is also study.",
  ],
  learnDone: [
    "Ah, '{meaning}'. A worthy guest — don't feed it after midnight.",
    "{kanji} — that's '{meaning}', for the uninitiated.",
    "'{meaning}'? In this economy?",
    "Knew a '{meaning}' once. Quiet type. Like {kanji}.",
    "Behold: '{meaning}'. The cosmos files this under 'minor wisdom'.",
    "I once forgot {kanji} and just called it 'thing'. Worked for a week.",
    "{kanji}, '{meaning}'. May it serve you, or at least not bite.",
    "Some kanji shout. {kanji} just hums '{meaning}' under its breath.",
    "Old proverb: 'a {meaning} in the hand is worth two in the pond.' Made it up. Still true.",
    "Welcome, '{meaning}'. Your roommate is {kanji}, who is — coincidentally — also '{meaning}'.",
    "I asked my master what '{meaning}' truly is. He said: {kanji}. Helpful, that man.",
    "Heavy with intent, light with strokes: '{meaning}'.",
    "Pop quiz next week. The answer is {kanji}. Don't tell anyone.",
    "{kanji} walked into a temple. The frog said: '{meaning}?' The kanji said: 'yes'.",
    "Filed away in your skull's filing cabinet, top drawer: '{meaning}'.",
    "A '{meaning}'-shaped door opens. Mind the lotus — it bites back.",
    "Look at you, learning '{meaning}'. The pond is impressed.",
    "Ribbiting news: '{meaning}' is now part of your kanji rolodex.",
    "Some say {kanji} contains the spirit of '{meaning}'. Some say I talk too much. Both are true.",
    "If you forget what {kanji} means, just remember: '{meaning}'. Or eat a fly. Both work.",
  ],
  learnDoneGeneric: [
    "Lanterns lit. The hall is brighter.",
    "New friends. Walk with them a while.",
  ],
  quizWrongMild: [
    "Almost. {kanji} is '{correct}', not '{picked}'.",
    "Close, but the brush wandered. {kanji} = '{correct}'.",
    "Eh. {kanji} means '{correct}'. Try again next time.",
    "Pond says no. {kanji} is '{correct}'.",
  ],
  quizWrongIrked: [
    "That's the third one, by my count. {kanji} = '{correct}'.",
    "Pay attention, student. {kanji} is '{correct}'.",
    "The lotus sighs. {kanji} means '{correct}'.",
    "Focus. {kanji} = '{correct}', as it has been since the Heian period.",
  ],
  quizWrongAngry: [
    "ENOUGH. {kanji} is '{correct}'. Write it on your arm.",
    "I am NOT angry. The pond is angry. {kanji} = '{correct}'.",
    "{kanji} means '{correct}'. You will remember this or I will haunt your dreams.",
    "RIBBIT. That means I'm displeased. {kanji} = '{correct}'.",
  ],
  quizRight: [
    "Correct.",
    "Yes — {kanji} indeed means '{correct}'.",
    "The pond approves.",
    "Bow accepted.",
    "Mm. Good frog.",
  ],
  reviewSmall: [
    "A small bell still rings clear.",
    "Few reviews, well-walked.",
  ],
  reviewMedium: [
    "A steady morning. The river flows.",
    "Well-walked path.",
  ],
  reviewLarge: [
    "A marathon among the lanterns. Drink water.",
    "Your brush has not lifted in some time.",
  ],
  quizPerfect: [
    "Nothing escaped your net. The pond is impressed.",
    "Every lantern lit. Bow accepted.",
  ],
  quizHigh: [
    "Few stones turned over to find a missing key. Most were right.",
    "The wind shifted once or twice. You stood firm.",
  ],
  quizLow: [
    "The river of practice flows both ways. Try once more.",
    "Even the master forgot the strokes of 'forgotten' once.",
  ],
};

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function fill(s, ctx) {
  return s.replace(/\{(\w+)\}/g, (_, k) => (ctx?.[k] != null ? ctx[k] : ""));
}

/**
 * speak(context, ctx?) → { line, mood }
 * Picks an appropriate quote and matching mood.
 */
export function speak(context, ctx = {}) {
  let mood = "calm";
  let bucket = QUOTES[context] ?? QUOTES.greeting;

  if (context === "greeting") {
    const s = ctx.streak ?? 0;
    if (s > 0 && (s === 7 || s === 30 || s === 100 || s === 365)) {
      bucket = QUOTES.greetingStreakMilestone;
      mood = "happy";
    } else if (s >= 2) {
      bucket = QUOTES.greetingStreak;
    }
  } else if (context === "emptyReviews") {
    mood = "sleep";
  } else if (context === "learnDone") {
    mood = "happy";
    if (!ctx.kanji) bucket = QUOTES.learnDoneGeneric;
  } else if (context === "reviewDone") {
    const n = ctx.count ?? 0;
    if (n >= 30) bucket = QUOTES.reviewLarge;
    else if (n >= 10) bucket = QUOTES.reviewMedium;
    else bucket = QUOTES.reviewSmall;
    mood = "calm";
  } else if (context === "quizDone") {
    const p = ctx.pct ?? 0;
    if (p === 100) { bucket = QUOTES.quizPerfect; mood = "happy"; }
    else if (p >= 70) { bucket = QUOTES.quizHigh; mood = "calm"; }
    else { bucket = QUOTES.quizLow; mood = "sad"; }
  } else if (context === "quizRight") {
    bucket = QUOTES.quizRight;
    mood = "happy";
  } else if (context === "quizWrong") {
    const m = ctx.misses ?? 1;
    if (m <= 2)       { bucket = QUOTES.quizWrongMild;  mood = "sad"; }
    else if (m <= 5)  { bucket = QUOTES.quizWrongIrked; mood = "irked"; }
    else              { bucket = QUOTES.quizWrongAngry; mood = "angry"; }
  } else if (context === "quizAsk") {
    bucket = ["What does this kanji mean?"];
    mood = ctx.baseMood ?? "calm";
  }

  return { line: fill(pick(bucket), ctx), mood };
}
