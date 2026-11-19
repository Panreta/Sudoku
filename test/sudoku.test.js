import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DIFFICULTIES, generatePuzzle, generateSolved, solve, countSolutions, candidates, isSolved,
} from '../src/sudoku.js';

test('generateSolved produces a valid full grid', () => {
  for (let k = 0; k < 20; k++) assert.ok(isSolved(generateSolved()));
});

for (const difficulty of Object.keys(DIFFICULTIES)) {
  test(`${difficulty} puzzles are verified solvable by backtracking and unique`, () => {
    for (let k = 0; k < 15; k++) {
      const { puzzle, solution, clues, verification } = generatePuzzle(difficulty);
      assert.equal(puzzle.filter(Boolean).length, clues);
      assert.ok(clues <= DIFFICULTIES[difficulty].clues + 2);
      assert.ok(verification.solved && verification.unique);
      puzzle.forEach((v, i) => v && assert.equal(v, solution[i]));
      assert.deepEqual(solve(puzzle).solution, solution);
      assert.equal(countSolutions(puzzle), 1);
    }
  });
}

test('solve rejects contradictory grids', () => {
  const g = new Array(81).fill(0);
  g[0] = 5; g[1] = 5;
  assert.equal(solve(g), null);
});

test('candidates respects row, column and box', () => {
  const g = new Array(81).fill(0);
  g[1] = 1; g[9] = 2; g[20] = 3; g[72] = 4;
  assert.deepEqual(candidates(g, 0), [5, 6, 7, 8, 9]);
  assert.deepEqual(candidates(g, 1), []);
});
