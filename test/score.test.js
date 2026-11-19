import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCORING, freshScore, scoreCorrect, scoreMistake, scoreHint, scoreWin } from '../src/score.js';

test('two correct moves within 30s score high, further apart score lower', () => {
  const s = freshScore();
  assert.equal(scoreCorrect(s, 10, 'easy').points, SCORING.fast);
  assert.equal(scoreCorrect(s, 40, 'easy').points, SCORING.fast); // exactly 30s later
  const slow = scoreCorrect(s, 71, 'easy');
  assert.equal(slow.fast, false);
  assert.equal(slow.points, SCORING.slow);
});

test('a mistake subtracts points, breaks the streak and the speed chain', () => {
  const s = freshScore();
  scoreCorrect(s, 1, 'easy');
  scoreCorrect(s, 2, 'easy');
  assert.equal(scoreMistake(s), SCORING.mistake);
  assert.equal(s.points, 2 * SCORING.fast + SCORING.mistake);
  assert.equal(s.streak, 0);
  assert.equal(scoreCorrect(s, 3, 'easy').fast, false);
});

test('score never drops below zero', () => {
  const s = freshScore();
  scoreMistake(s);
  assert.equal(s.points, 0);
});

test('streak of 5 gives a combo, 7 a super combo, repeating every 7', () => {
  const s = freshScore();
  const results = [];
  for (let k = 1; k <= 14; k++) results.push(scoreCorrect(s, k, 'easy'));
  assert.equal(results[3].combo, null);
  assert.equal(results[4].combo.name, 'COMBO');
  assert.equal(results[4].points, SCORING.fast * 1.5 + 150);
  assert.equal(results[5].points, SCORING.fast * 1.5);
  assert.equal(results[6].combo.name, 'SUPER COMBO');
  assert.equal(results[6].points, SCORING.fast * 2 + 300);
  assert.equal(results[7].points, SCORING.fast * 2);
  assert.equal(results[13].combo.name, 'SUPER COMBO');
  assert.equal(s.bestStreak, 14);
});

test('difficulty scales points', () => {
  assert.equal(scoreCorrect(freshScore(), 1, 'hard').points, SCORING.fast * 2);
  assert.equal(scoreCorrect(freshScore(), 1, 'medium').points, SCORING.fast * 1.5);
});

test('hints reset the streak; finishing adds bonuses', () => {
  const s = freshScore();
  scoreCorrect(s, 1, 'easy');
  scoreHint(s);
  assert.equal(s.streak, 0);
  assert.equal(scoreCorrect(s, 2, 'easy').fast, false);
  assert.deepEqual(scoreWin(s, 'easy', 0), { win: 500, perfect: 300 });
  assert.deepEqual(scoreWin(freshScore(), 'hard', 2), { win: 1000, perfect: 0 });
});
