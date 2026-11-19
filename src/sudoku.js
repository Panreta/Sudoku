// Sudoku engine: generation, backtracking solver, candidate helpers.
// Grids are flat arrays of 81 numbers, 0 = empty. Works in browser and Node.

export const DIFFICULTIES = {
  easy: { label: 'Easy', clues: 40 },
  medium: { label: 'Medium', clues: 32 },
  hard: { label: 'Hard', clues: 25 },
};

const ALL = 0b1111111110; // bits 1..9

export const rowOf = (i) => Math.floor(i / 9);
export const colOf = (i) => i % 9;
export const boxOf = (i) => Math.floor(rowOf(i) / 3) * 3 + Math.floor(colOf(i) / 3);

// PEERS[i] = indices sharing a row, column or box with i (excluding i).
export const PEERS = Array.from({ length: 81 }, (_, i) => {
  const set = new Set();
  for (let j = 0; j < 81; j++) {
    if (j !== i && (rowOf(j) === rowOf(i) || colOf(j) === colOf(i) || boxOf(j) === boxOf(i))) {
      set.add(j);
    }
  }
  return [...set];
});

function shuffle(arr, rand) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/** Bitmask of digits that can legally go in cell i. */
function candidateMask(grid, i) {
  let used = 0;
  for (const p of PEERS[i]) used |= 1 << grid[p];
  return ALL & ~used;
}

/** Digits (1-9) that could go in cell i given the current grid. */
export function candidates(grid, i) {
  if (grid[i]) return [];
  const mask = candidateMask(grid, i);
  const out = [];
  for (let d = 1; d <= 9; d++) if (mask & (1 << d)) out.push(d);
  return out;
}

export function isValidPlacement(grid, i, d) {
  return PEERS[i].every((p) => grid[p] !== d);
}

/**
 * Backtracking search. Always branches on the empty cell with the fewest
 * candidates (MRV). Calls onSolution(grid) for each solution found and stops
 * when it returns true. Returns stats about the search.
 */
function backtrack(grid, onSolution, rand = null) {
  const stats = { guesses: 0, backtracks: 0 };
  const g = grid.slice();

  const search = () => {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;
    for (let i = 0; i < 81; i++) {
      if (g[i]) continue;
      const mask = candidateMask(g, i);
      let count = 0;
      for (let m = mask; m; m &= m - 1) count++;
      if (count === 0) return false; // dead end
      if (count < bestCount) {
        best = i;
        bestMask = mask;
        bestCount = count;
        if (count === 1) break;
      }
    }
    if (best === -1) return onSolution(g.slice());

    const digits = [];
    for (let d = 1; d <= 9; d++) if (bestMask & (1 << d)) digits.push(d);
    if (rand) shuffle(digits, rand);

    for (const d of digits) {
      g[best] = d;
      stats.guesses++;
      if (search()) return true;
      stats.backtracks++;
    }
    g[best] = 0;
    return false;
  };

  search();
  return stats;
}

/** Solve a puzzle with backtracking. Returns { solution, guesses, backtracks } or null. */
export function solve(grid) {
  if (!isConsistent(grid)) return null;
  let solution = null;
  const stats = backtrack(grid, (s) => {
    solution = s;
    return true;
  });
  return solution ? { solution, ...stats } : null;
}

/** Count solutions, stopping early once `limit` is reached. */
export function countSolutions(grid, limit = 2) {
  if (!isConsistent(grid)) return 0;
  let n = 0;
  backtrack(grid, () => ++n >= limit);
  return n;
}

/** True if no two filled cells conflict. */
export function isConsistent(grid) {
  for (let i = 0; i < 81; i++) {
    if (grid[i] && !isValidPlacement(grid, i, grid[i])) return false;
  }
  return true;
}

export function isSolved(grid) {
  return grid.every((v) => v >= 1 && v <= 9) && isConsistent(grid);
}

/** A random complete, valid grid. */
export function generateSolved(rand = Math.random) {
  let solved = null;
  backtrack(new Array(81).fill(0), (s) => {
    solved = s;
    return true;
  }, rand);
  return solved;
}

/**
 * Generate a puzzle with a unique solution. Before returning, the puzzle is
 * played from scratch by the backtracking solver to confirm it is solvable
 * and that the solver's answer matches the intended solution.
 */
export function generatePuzzle(difficulty = 'easy', rand = Math.random) {
  const target = (DIFFICULTIES[difficulty] ?? DIFFICULTIES.easy).clues;

  for (let attempt = 1; ; attempt++) {
    const solution = generateSolved(rand);
    const puzzle = solution.slice();
    let clues = 81;

    // Remove cells in symmetric pairs while the solution stays unique.
    const order = shuffle([...Array(41).keys()], rand);
    for (const i of order) {
      if (clues <= target) break;
      const j = 80 - i;
      const removed = i === j ? [i] : [i, j];
      if (clues - removed.length < target) continue;
      const saved = removed.map((k) => puzzle[k]);
      removed.forEach((k) => (puzzle[k] = 0));
      if (countSolutions(puzzle, 2) === 1) {
        clues -= removed.length;
      } else {
        removed.forEach((k, n) => (puzzle[k] = saved[n]));
      }
    }

    // Play it ourselves with backtracking before handing it to the player.
    const start = Date.now();
    const result = solve(puzzle);
    const ms = Date.now() - start;
    const verified =
      result !== null &&
      result.solution.every((v, k) => v === solution[k]) &&
      countSolutions(puzzle, 2) === 1;

    if (verified && clues <= target + 2) {
      return {
        puzzle,
        solution,
        difficulty,
        clues,
        verification: { solved: true, unique: true, guesses: result.guesses, backtracks: result.backtracks, ms, attempt },
      };
    }
  }
}
