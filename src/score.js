// Scoring rules. Pure functions over a small score object so they can be tested.
//
// - A correct move made within FAST_WINDOW seconds of the previous correct move
//   earns FAST points; a slower correct move earns SLOW points.
// - A mistake costs MISTAKE points and breaks both the streak and the speed chain.
// - Streaks of correct moves raise a multiplier and pay milestone bonuses.
// - Everything is scaled by the difficulty multiplier.

export const SCORING = {
  fast: 100,
  slow: 40,
  fastWindow: 30,
  mistake: -50,
  winBonus: 500,
  perfectBonus: 300,
  difficulty: { easy: 1, medium: 1.5, hard: 2 },
  // Checked from highest to lowest; `every` repeats the milestone after `at`.
  combos: [
    { at: 7, every: 7, bonus: 300, mult: 2, name: 'SUPER COMBO' },
    { at: 5, bonus: 150, mult: 1.5, name: 'COMBO' },
  ],
};

export function freshScore() {
  return { points: 0, streak: 0, bestStreak: 0, lastCorrectAt: 0 };
}

export function streakMultiplier(streak) {
  return SCORING.combos.find((c) => streak >= c.at)?.mult ?? 1;
}

function milestoneFor(streak) {
  return SCORING.combos.find((c) =>
    streak === c.at || (c.every && streak > c.at && (streak - c.at) % c.every === 0)) ?? null;
}

/** Record a correct placement at game time `now` (seconds). Returns what was earned. */
export function scoreCorrect(score, now, difficulty) {
  const dm = SCORING.difficulty[difficulty] ?? 1;
  const fast = score.lastCorrectAt !== null && now - score.lastCorrectAt <= SCORING.fastWindow;

  score.streak++;
  score.bestStreak = Math.max(score.bestStreak, score.streak);
  score.lastCorrectAt = now;

  const base = fast ? SCORING.fast : SCORING.slow;
  const mult = streakMultiplier(score.streak);
  const combo = milestoneFor(score.streak);
  const points = Math.round(base * mult * dm) + (combo ? Math.round(combo.bonus * dm) : 0);
  score.points += points;
  return { points, fast, mult, combo, streak: score.streak };
}

/** Record a wrong placement. Returns the (negative) points applied. */
export function scoreMistake(score) {
  const before = score.points;
  score.points = Math.max(0, score.points + SCORING.mistake);
  score.streak = 0;
  score.lastCorrectAt = null;
  return score.points - before;
}

/** A hint gives no points and breaks the chain. */
export function scoreHint(score) {
  score.streak = 0;
  score.lastCorrectAt = null;
}

/** Bonus for finishing the puzzle. */
export function scoreWin(score, difficulty, mistakes) {
  const dm = SCORING.difficulty[difficulty] ?? 1;
  const win = Math.round(SCORING.winBonus * dm);
  const perfect = mistakes === 0 ? Math.round(SCORING.perfectBonus * dm) : 0;
  score.points += win + perfect;
  return { win, perfect };
}
