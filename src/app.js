import { DIFFICULTIES, PEERS, rowOf, colOf, boxOf, candidates, generatePuzzle } from './sudoku.js';
import { SCORING, freshScore, streakMultiplier, scoreCorrect, scoreMistake, scoreHint, scoreWin } from './score.js';
import * as audio from './audio.js';

const STORAGE_KEY = 'sudoku-sprinkles-v1';
const BEST_KEY = 'sudoku-sprinkles-best';
const $ = (id) => document.getElementById(id);

const MASCOTS = { easy: '🐣', medium: '🐱', hard: '🐲' };
const CHEERS = ['Nice one! ✨', 'Purr-fect! 🐾', 'You’re on fire! 🔥', 'Sweet! 🍭', 'Yay! 🌈', 'Smart cookie! 🍪', 'Boop! 💖'];
const OOPS = ['Hmm, not quite… 🙈', 'Oopsie! Try again 💫', 'That one doesn’t fit 🧩', 'Close, but nope! 🍓'];

let state;
let cells = [];
let padButtons = [];
let spotButtons = [];

// ---------- state ----------

function newGame(difficulty) {
  const { puzzle, solution, clues, verification } = generatePuzzle(difficulty);
  state = {
    difficulty,
    solution,
    values: puzzle.slice(),
    given: puzzle.map(Boolean),
    notes: new Array(81).fill(0),
    selected: puzzle.findIndex((v) => !v),
    notesMode: false,
    spot: 0,
    history: [],
    mistakes: 0,
    hints: 0,
    seconds: 0,
    won: false,
    score: freshScore(),
    scored: new Array(81).fill(false),
    clues,
    verification,
  };
  $('winModal').hidden = true;
  const v = verification;
  say(`New ${DIFFICULTIES[difficulty].label.toLowerCase()} puzzle! My robot pal solved it first with backtracking in ${v.guesses} guesses 🤖`);
  save();
  render();
}

function save() {
  try {
    const { history, ...rest } = state;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rest));
  } catch { /* storage unavailable: progress just isn't kept */ }
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && !saved.won && Array.isArray(saved.values) && saved.values.length === 81) {
      state = { score: freshScore(), scored: new Array(81).fill(false), ...saved, history: [], spot: 0 };
      return true;
    }
  } catch { /* ignore corrupt or blocked storage */ }
  return false;
}

function snapshot() {
  state.history.push({ values: state.values.slice(), notes: state.notes.slice(), given: state.given.slice() });
  if (state.history.length > 200) state.history.shift();
}

// ---------- actions ----------

function select(i) {
  state.selected = i;
  render();
}

function input(d) {
  const i = state.selected;
  if (state.won || i < 0 || state.given[i]) {
    if (i >= 0 && state.given[i]) say('That’s a clue, it’s locked in 🔒');
    return;
  }

  if (state.notesMode) {
    if (state.values[i]) return;
    snapshot();
    state.notes[i] ^= 1 << d;
  } else {
    if (state.values[i] === d) return erase();
    snapshot();
    state.values[i] = d;
    state.notes[i] = 0;
    // Clear this digit from notes in the same row, column and box.
    for (const p of PEERS[i]) state.notes[p] &= ~(1 << d);

    if (d !== state.solution[i]) {
      state.mistakes++;
      const lost = scoreMistake(state.score);
      popup(i, lost ? `${lost}` : 'oops', 'bad');
      audio.playMistake();
      bumpScore('down');
      say(pick(OOPS));
      flash(i, 'shake');
    } else {
      flash(i, 'pop');
      // Each cell pays out once, so erasing and re-entering can't farm points.
      const r = state.scored[i] ? null : scoreCorrect(state.score, state.seconds, state.difficulty);
      state.scored[i] = true;
      if (r) {
        popup(i, `+${r.points}${r.fast ? ' ⚡' : ''}`, r.fast ? 'fast' : 'slow');
        audio.playCorrect(r.fast, r.streak);
        bumpScore('up');
      }
      if (r?.combo) {
        comboBanner(r.combo, r.streak);
      } else if (state.values.filter((v) => v === d).length === 9) {
        say(`All the ${d}s are home! 🏡`);
      } else if (r?.fast && Math.random() < 0.4) {
        say(pick(['Speedy! ⚡', 'Zoom zoom! 🏎️', 'Quick paws! 🐾']));
      } else if (Math.random() < 0.3) {
        say(pick(CHEERS));
      }
    }
  }
  save();
  render();
  checkWin();
}

function erase() {
  const i = state.selected;
  if (state.won || i < 0 || state.given[i] || (!state.values[i] && !state.notes[i])) return;
  snapshot();
  state.values[i] = 0;
  state.notes[i] = 0;
  save();
  render();
}

function undo() {
  const prev = state.history.pop();
  if (!prev || state.won) return say('Nothing to undo 🌱');
  Object.assign(state, prev);
  save();
  render();
}

function toggleNotes() {
  state.notesMode = !state.notesMode;
  say(state.notesMode ? 'Pencil mode on ✏️ Tap numbers to jot down ideas.' : 'Pencil away, pen out 🖊️');
  render();
}

function autoNotes() {
  if (state.won) return;
  snapshot();
  for (let i = 0; i < 81; i++) {
    state.notes[i] = 0;
    if (!state.values[i]) for (const d of candidates(state.values, i)) state.notes[i] |= 1 << d;
  }
  say('🪄 Poof! Every empty cell now shows what could fit.');
  save();
  render();
}

function hint() {
  if (state.won) return;
  const isOpen = (i) => !state.given[i] && state.values[i] !== state.solution[i];
  let i = state.selected;
  if (i < 0 || !isOpen(i)) {
    // Help where it's easiest: the open cell with the fewest possibilities.
    let best = 10;
    for (let k = 0; k < 81; k++) {
      if (!isOpen(k)) continue;
      const n = state.values[k] ? 0 : candidates(state.values, k).length;
      if (n < best) { best = n; i = k; }
    }
  }
  if (i < 0 || !isOpen(i)) return;
  snapshot();
  const d = state.solution[i];
  state.values[i] = d;
  state.given[i] = true;
  state.notes[i] = 0;
  for (const p of PEERS[i]) state.notes[p] &= ~(1 << d);
  state.hints++;
  state.scored[i] = true;
  scoreHint(state.score);
  audio.playHint();
  state.selected = i;
  say(`Psst… row ${rowOf(i) + 1}, column ${colOf(i) + 1} is a ${d} 🤫`);
  flash(i, 'hinted');
  save();
  render();
  checkWin();
}

function spotlight(d) {
  state.spot = state.spot === d ? 0 : d;
  if (state.spot) {
    const n = state.values.reduce((acc, _, i) => acc + candidates(state.values, i).includes(d), 0);
    say(n ? `🔦 ${d} could still go in ${n} glowing cell${n > 1 ? 's' : ''}.` : `🔦 Every ${d} is already placed!`);
  }
  render();
}

function checkWin() {
  if (!state.values.every((v, i) => v === state.solution[i])) return;
  state.won = true;
  const { win, perfect } = scoreWin(state.score, state.difficulty, state.mistakes);
  const best = loadBest();
  const isRecord = state.score.points > (best[state.difficulty] ?? 0);
  if (isRecord) {
    best[state.difficulty] = state.score.points;
    try { localStorage.setItem(BEST_KEY, JSON.stringify(best)); } catch { /* ignore */ }
  }
  save();
  render();
  const t = fmtTime(state.seconds);
  $('winText').textContent =
    `${DIFFICULTIES[state.difficulty].label} solved in ${t} with ${state.mistakes} mistake${state.mistakes === 1 ? '' : 's'}` +
    ` and ${state.hints} hint${state.hints === 1 ? '' : 's'}.`;
  $('winScore').innerHTML =
    `<div class="final">⭐ ${state.score.points.toLocaleString()}</div>` +
    `<div class="row"><span>🏁 Finish bonus</span><b>+${win}</b></div>` +
    (perfect ? `<div class="row"><span>💎 No mistakes</span><b>+${perfect}</b></div>` : '') +
    `<div class="row"><span>🔥 Best streak</span><b>${state.score.bestStreak}</b></div>` +
    `<div class="row"><span>🏆 Best ${DIFFICULTIES[state.difficulty].label}</span><b>${(best[state.difficulty] ?? 0).toLocaleString()}</b></div>` +
    (isRecord ? '<div class="record">✨ NEW HIGH SCORE! ✨</div>' : '');
  setTimeout(() => ($('winModal').hidden = false), 400);
  say('WOW! You solved it! 🎉🎉🎉');
  audio.playWin();
  confetti();
}

// ---------- rendering ----------

function buildBoard() {
  const board = $('board');
  for (let i = 0; i < 81; i++) {
    const el = document.createElement('button');
    el.className = `cell r${rowOf(i)} c${colOf(i)}${boxOf(i) % 2 ? ' box-b' : ''}`;
    el.setAttribute('role', 'gridcell');
    el.addEventListener('click', () => select(i));
    board.appendChild(el);
    cells.push(el);
  }

  const pad = $('pad');
  const spot = $('spot');
  for (let d = 1; d <= 9; d++) {
    const b = document.createElement('button');
    b.className = `num d${d}`;
    b.innerHTML = `${d}<small></small>`;
    b.setAttribute('aria-label', `Place ${d}`);
    b.addEventListener('click', () => input(d));
    pad.appendChild(b);
    padButtons.push(b);

    const s = document.createElement('button');
    s.className = `d${d}`;
    s.innerHTML = `<span>${d}</span>`;
    s.setAttribute('aria-label', `Show where ${d} can go`);
    s.addEventListener('click', () => spotlight(d));
    spot.appendChild(s);
    spotButtons.push(s);
  }
}

function render() {
  const { values, notes, given, selected, solution, spot } = state;
  const selVal = selected >= 0 ? values[selected] : 0;

  for (let i = 0; i < 81; i++) {
    const el = cells[i];
    const v = values[i];
    const isPeer = selected >= 0 && i !== selected && PEERS[selected].includes(i);
    const canSpot = spot && !v && candidates(values, i).includes(spot);

    el.classList.toggle('selected', i === selected);
    el.classList.toggle('peer', isPeer);
    el.classList.toggle('same', !!v && (v === selVal || v === spot) && i !== selected);
    el.classList.toggle('spot', !!canSpot);
    el.classList.toggle('given', given[i]);
    el.classList.toggle('user', !!v && !given[i]);
    el.classList.toggle('wrong', !!v && v !== solution[i]);
    if (canSpot) el.style.setProperty('--spot', `var(--d${spot})`);

    if (v) {
      el.innerHTML = `<span class="val d${v}">${v}</span>`;
    } else if (notes[i]) {
      let html = '<span class="notes">';
      for (let d = 1; d <= 9; d++) html += `<span class="d${d}">${notes[i] & (1 << d) ? d : ''}</span>`;
      el.innerHTML = html + '</span>';
    } else {
      el.innerHTML = '';
    }
    el.setAttribute('aria-label', `Row ${rowOf(i) + 1} column ${colOf(i) + 1}${v ? `, ${v}` : ', empty'}`);
  }

  for (let d = 1; d <= 9; d++) {
    const placed = values.filter((v, i) => v === d && v === solution[i]).length;
    padButtons[d - 1].classList.toggle('done', placed === 9);
    padButtons[d - 1].querySelector('small').textContent = placed === 9 ? '✓' : `${9 - placed} left`;
    spotButtons[d - 1].setAttribute('aria-pressed', String(spot === d));
  }

  $('pad').classList.toggle('notes-mode', state.notesMode);
  $('notes').setAttribute('aria-pressed', String(state.notesMode));
  $('notesState').textContent = state.notesMode ? 'on' : 'off';
  document.querySelectorAll('.level').forEach((b) =>
    b.setAttribute('aria-checked', String(b.dataset.level === state.difficulty)));
  const streak = state.score.streak;
  $('mascotFace').textContent = state.won ? '😻' : streak >= 7 ? '🤩' : streak >= 5 ? '😸' : MASCOTS[state.difficulty];
  renderScore();

  $('mistakes').textContent = state.mistakes;
  $('hintsUsed').textContent = state.hints;
  $('timer').textContent = fmtTime(state.seconds);
  const v = state.verification;
  $('verified').textContent = `🤖 Robot-solved ✓ ${state.clues} clues`;
  $('verified').title =
    `Before you got this puzzle, it was solved by a backtracking search (${v.guesses} guesses, ` +
    `${v.backtracks} backtracks) and checked to have exactly one solution.`;

  renderPeek();
}

function renderScore() {
  const { points, streak } = state.score;
  $('score').textContent = points.toLocaleString();
  const mult = streakMultiplier(streak) * (SCORING.difficulty[state.difficulty] ?? 1);
  $('streakLabel').textContent = `🔥 Streak ${streak}`;
  $('multLabel').textContent = `×${mult}`;
  $('multLabel').classList.toggle('hot', streak >= 5);
  $('multLabel').classList.toggle('blazing', streak >= 7);
  const shown = streak > 7 ? ((streak - 1) % 7) + 1 : streak;
  [...$('streakDots').children].forEach((dot, k) => dot.classList.toggle('on', k < shown));
  $('streakDots').classList.toggle('blazing', streak >= 7);
  renderSpeed();
  $('musicBtn').setAttribute('aria-pressed', String(audio.isMusicOn()));
  $('musicBtn').textContent = audio.isMusicOn() ? '🎵' : '🔇';
  $('sfxBtn').setAttribute('aria-pressed', String(audio.isSfxOn()));
  $('sfxBtn').textContent = audio.isSfxOn() ? '🔊' : '🔈';
}

/** Drains over the fast window after each correct move. */
function renderSpeed() {
  const last = state.score.lastCorrectAt;
  const left = last === null || state.won ? 0 : Math.max(0, SCORING.fastWindow - (state.seconds - last));
  $('speedFill').style.width = `${(left / SCORING.fastWindow) * 100}%`;
  $('speedLabel').textContent = left ? `⚡ Speed bonus ${left}s` : '⚡ Speed bonus: place a correct number';
  $('speed').classList.toggle('live', left > 0);
}

function renderPeek() {
  const i = state.selected;
  const peek = $('peek');
  if (i < 0) {
    peek.textContent = 'Tap an empty cell to see what could fit there.';
  } else if (state.given[i]) {
    peek.textContent = `Row ${rowOf(i) + 1}, column ${colOf(i) + 1} is a locked clue 🔒`;
  } else if (state.values[i]) {
    peek.textContent = `Row ${rowOf(i) + 1}, column ${colOf(i) + 1}: you wrote ${state.values[i]}.`;
  } else {
    const c = candidates(state.values, i);
    peek.innerHTML = c.length
      ? `Row ${rowOf(i) + 1}, column ${colOf(i) + 1} could be: ${c.map((d) => `<b class="d${d}">${d}</b>`).join(' · ')}`
      : `Uh-oh, nothing fits row ${rowOf(i) + 1}, column ${colOf(i) + 1}. Something nearby is off 🕵️`;
  }
}

function flash(i, cls) {
  requestAnimationFrame(() => {
    const el = cells[i];
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 1000);
  });
}

function say(text) {
  const b = $('bubble');
  b.textContent = text;
  const face = $('mascotFace');
  face.classList.remove('happy');
  void face.offsetWidth;
  face.classList.add('happy');
}

function confetti() {
  const box = $('confetti');
  const colors = ['--d1', '--d2', '--d3', '--d4', '--d5', '--d6', '--d7', '--d8', '--d9'];
  for (let k = 0; k < 140; k++) {
    const p = document.createElement('i');
    p.style.left = `${Math.random() * 100}vw`;
    p.style.background = `var(${pick(colors)})`;
    p.style.animationDuration = `${2 + Math.random() * 2.5}s`;
    p.style.animationDelay = `${Math.random() * 0.8}s`;
    p.style.transform = `rotate(${Math.random() * 360}deg)`;
    if (Math.random() < 0.3) p.style.borderRadius = '50%';
    box.appendChild(p);
  }
  setTimeout(() => (box.innerHTML = ''), 5500);
}

function popup(i, text, kind) {
  const r = cells[i].getBoundingClientRect();
  const p = document.createElement('div');
  p.className = `popup ${kind}`;
  p.textContent = text;
  p.style.left = `${r.left + r.width / 2}px`;
  p.style.top = `${r.top}px`;
  $('popups').appendChild(p);
  setTimeout(() => p.remove(), 1200);
}

function bumpScore(dir) {
  const el = $('scoreBox');
  el.classList.remove('up', 'down');
  void el.offsetWidth;
  el.classList.add(dir);
}

function comboBanner(combo, streak) {
  const big = combo.mult >= 2;
  const el = $('comboBanner');
  el.innerHTML =
    `<div class="combo-title">${big ? '🌟' : '🔥'} ${combo.name}! ${big ? '🌟' : '🔥'}</div>` +
    `<div class="combo-sub">${streak} in a row · +${Math.round(combo.bonus * (SCORING.difficulty[state.difficulty] ?? 1))} bonus · ×${combo.mult} points</div>`;
  el.className = `combo-banner ${big ? 'big' : ''}`;
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add('show');
  clearTimeout(comboBanner.t);
  comboBanner.t = setTimeout(() => (el.hidden = true), 1900);
  audio.playCombo(big);
  burst(big ? 70 : 35);
  say(big ? `${streak} in a row?! You’re a Sudoku superstar! 🌟` : 'Combo! Points are now ×1.5 — keep going! 🔥');
  document.body.classList.remove('rumble');
  void document.body.offsetWidth;
  document.body.classList.add('rumble');
}

/** Small confetti burst from the middle of the board. */
function burst(n) {
  const box = $('confetti');
  const r = $('board').getBoundingClientRect();
  const colors = ['--d1', '--d2', '--d3', '--d4', '--d5', '--d6', '--d7', '--d8', '--d9'];
  for (let k = 0; k < n; k++) {
    const p = document.createElement('b');
    const angle = Math.random() * Math.PI * 2;
    const dist = 80 + Math.random() * 160;
    p.style.left = `${r.left + r.width / 2}px`;
    p.style.top = `${r.top + r.height / 2}px`;
    p.style.background = `var(${pick(colors)})`;
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
    box.appendChild(p);
    setTimeout(() => p.remove(), 1000);
  }
}

function loadBest() {
  try { return JSON.parse(localStorage.getItem(BEST_KEY)) ?? {}; } catch { return {}; }
}

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// ---------- wiring ----------

function moveSelection(dr, dc) {
  const i = state.selected < 0 ? 0 : state.selected;
  const r = (rowOf(i) + dr + 9) % 9;
  const c = (colOf(i) + dc + 9) % 9;
  select(r * 9 + c);
}

function wire() {
  document.querySelectorAll('.level').forEach((b) =>
    b.addEventListener('click', () => newGame(b.dataset.level)));
  $('newGame').addEventListener('click', () => newGame(state.difficulty));
  $('playAgain').addEventListener('click', () => newGame(state.difficulty));
  $('undo').addEventListener('click', undo);
  $('erase').addEventListener('click', erase);
  $('notes').addEventListener('click', toggleNotes);
  $('autoNotes').addEventListener('click', autoNotes);
  $('hint').addEventListener('click', hint);
  $('musicBtn').addEventListener('click', () => {
    say(audio.toggleMusic() ? 'Music on! 🎶' : 'Shh… music off 🤫');
    renderScore();
  });
  $('sfxBtn').addEventListener('click', () => {
    audio.toggleSfx();
    renderScore();
  });
  // Browsers only allow audio after the first tap or key press.
  // The music button handles its own first tap, so it isn't toggled twice.
  const unlock = (e) => {
    if (e.target.closest?.('#musicBtn')) return;
    audio.unlock();
    document.removeEventListener('pointerdown', unlock);
    document.removeEventListener('keydown', unlock);
  };
  document.addEventListener('pointerdown', unlock);
  document.addEventListener('keydown', unlock);

  for (let k = 0; k < 7; k++) {
    const dot = document.createElement('i');
    if (k === 4) dot.className = 'mark';
    if (k === 6) dot.className = 'mark big';
    $('streakDots').appendChild(dot);
  }

  document.addEventListener('keydown', (e) => {
    if (e.metaKey || e.altKey) return;
    const k = e.key;
    if (/^[1-9]$/.test(k)) input(Number(k));
    else if (k === 'Backspace' || k === 'Delete' || k === '0') erase();
    else if (k === 'ArrowUp') moveSelection(-1, 0);
    else if (k === 'ArrowDown') moveSelection(1, 0);
    else if (k === 'ArrowLeft') moveSelection(0, -1);
    else if (k === 'ArrowRight') moveSelection(0, 1);
    else if (k === 'n' || k === 'N') toggleNotes();
    else if (k === 'z' || k === 'Z') undo();
    else if (k === 'h' || k === 'H') hint();
    else if (k === 'Escape') $('winModal').hidden = true;
    else return;
    e.preventDefault();
  });

  $('winModal').addEventListener('click', (e) => {
    if (e.target === $('winModal')) $('winModal').hidden = true;
  });

  setInterval(() => {
    if (!state.won && document.visibilityState === 'visible') {
      state.seconds++;
      $('timer').textContent = fmtTime(state.seconds);
      renderSpeed();
      if (state.seconds % 10 === 0) save();
    }
  }, 1000);
}

buildBoard();
wire();
if (load()) {
  say('Welcome back! Your puzzle missed you 💕');
  render();
} else {
  newGame('easy');
}
