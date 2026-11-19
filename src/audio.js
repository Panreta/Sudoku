// Tiny Web Audio synth: a looping chiptune and sound effects. No audio files.
// Browsers only allow sound after a user gesture, so call unlock() from one.

const PREFS_KEY = 'sudoku-sprinkles-audio';

const NOTE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
function freq(name) {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  const midi = 12 * (Number(m[3]) + 1) + NOTE[m[1]] + (m[2] ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}

// 4 bars of eighth notes (C – Am – F – G). '-' is a rest.
const MELODY = (
  'E5 G5 C6 G5 E5 G5 A5 G5 ' +
  'C5 E5 A5 E5 G5 - E5 D5 ' +
  'A4 C5 F5 A5 G5 F5 E5 D5 ' +
  'D5 G5 B5 G5 D5 E5 F5 G5'
).split(' ');
const BASS = ['C3', 'A2', 'F2', 'G2'];
const STEP = 60 / 128 / 2; // eighth notes at 128 bpm

let ctx = null;
let musicBus, sfxBus;
let timer = null;
let step = 0;
let nextTime = 0;

const prefs = (() => {
  try {
    return { music: true, sfx: true, ...JSON.parse(localStorage.getItem(PREFS_KEY)) };
  } catch {
    return { music: true, sfx: true };
  }
})();

function savePrefs() {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

function ensure() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(ctx.destination);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.35;
  musicBus.connect(master);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = 0.6;
  sfxBus.connect(master);
  return ctx;
}

/** Play one enveloped oscillator note. */
function tone(bus, { f, t, dur = 0.15, type = 'triangle', vol = 0.2, slideTo = null, cutoff = null }) {
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let node = osc;
  if (cutoff) {
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = cutoff;
    osc.connect(lp);
    node = lp;
  }
  node.connect(gain).connect(bus);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function tick(t) {
  const len = Math.floor(ctx.sampleRate * 0.03);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let k = 0; k < len; k++) data[k] = (Math.random() * 2 - 1) * (1 - k / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 7000;
  const gain = ctx.createGain();
  gain.gain.value = 0.08;
  src.connect(hp).connect(gain).connect(musicBus);
  src.start(t);
}

function scheduleMusic() {
  while (nextTime < ctx.currentTime + 0.12) {
    const n = MELODY[step % MELODY.length];
    if (n !== '-') tone(musicBus, { f: freq(n), t: nextTime, dur: STEP * 0.9, type: 'square', vol: 0.07, cutoff: 2200 });
    if (step % 4 === 0) {
      const root = BASS[Math.floor(step / 8) % BASS.length];
      tone(musicBus, { f: freq(root), t: nextTime, dur: STEP * 3.5, type: 'triangle', vol: 0.22 });
    }
    if (step % 2 === 1) tick(nextTime);
    nextTime += STEP;
    step++;
  }
}

function startMusic() {
  if (timer || !ensure()) return;
  step = 0;
  nextTime = ctx.currentTime + 0.05;
  timer = setInterval(scheduleMusic, 25);
}

function stopMusic() {
  clearInterval(timer);
  timer = null;
}

/** Call from a user gesture. Starts music if the player wants it. */
export function unlock() {
  if (!ensure()) return;
  if (ctx.state === 'suspended') ctx.resume();
  if (prefs.music) startMusic();
}

export const isMusicOn = () => prefs.music;
export const isSfxOn = () => prefs.sfx;

export function toggleMusic() {
  prefs.music = !prefs.music;
  savePrefs();
  if (prefs.music) unlock();
  else stopMusic();
  return prefs.music;
}

export function toggleSfx() {
  prefs.sfx = !prefs.sfx;
  savePrefs();
  return prefs.sfx;
}

document.addEventListener('visibilitychange', () => {
  if (!ctx) return;
  if (document.hidden) ctx.suspend();
  else ctx.resume();
});

// ---------- sound effects ----------

function sfx(fn) {
  if (!prefs.sfx || !ensure()) return;
  if (ctx.state === 'suspended') ctx.resume();
  fn(ctx.currentTime);
}

const SCALE = ['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G6', 'A6', 'C7'];

/** Correct move: a two-note blip that climbs with the streak. */
export const playCorrect = (fast, streak) => sfx((t) => {
  const k = Math.min(streak, SCALE.length - 2);
  tone(sfxBus, { f: freq(SCALE[k]), t, dur: 0.12, vol: 0.25 });
  tone(sfxBus, { f: freq(SCALE[k + 1]), t: t + 0.07, dur: fast ? 0.25 : 0.15, vol: 0.25 });
  if (fast) tone(sfxBus, { f: freq(SCALE[k + 1]) * 2, t: t + 0.12, dur: 0.2, type: 'sine', vol: 0.1 });
});

export const playMistake = () => sfx((t) => {
  tone(sfxBus, { f: 330, t, dur: 0.18, type: 'sawtooth', vol: 0.12, slideTo: 160, cutoff: 1200 });
  tone(sfxBus, { f: 220, t: t + 0.16, dur: 0.25, type: 'sawtooth', vol: 0.12, slideTo: 110, cutoff: 900 });
});

export const playCombo = (big) => sfx((t) => {
  const notes = big ? ['C5', 'E5', 'G5', 'C6', 'E6', 'G6', 'C7'] : ['C5', 'E5', 'G5', 'C6'];
  notes.forEach((n, k) => tone(sfxBus, { f: freq(n), t: t + k * 0.06, dur: 0.2, type: 'square', vol: 0.12, cutoff: 3500 }));
  tone(sfxBus, { f: freq(notes.at(-1)), t: t + notes.length * 0.06, dur: 0.5, type: 'triangle', vol: 0.25 });
});

export const playWin = () => sfx((t) => {
  const fan = [['C5', 0, 0.15], ['E5', 0.15, 0.15], ['G5', 0.3, 0.15], ['C6', 0.45, 0.35],
    ['A5', 0.85, 0.15], ['C6', 1.0, 0.15], ['E6', 1.15, 0.7]];
  for (const [n, at, d] of fan) {
    tone(sfxBus, { f: freq(n), t: t + at, dur: d, type: 'square', vol: 0.1, cutoff: 3000 });
    tone(sfxBus, { f: freq(n) / 2, t: t + at, dur: d, type: 'triangle', vol: 0.2 });
  }
});

export const playHint = () => sfx((t) => {
  ['G6', 'E6', 'C7'].forEach((n, k) => tone(sfxBus, { f: freq(n), t: t + k * 0.08, dur: 0.3, type: 'sine', vol: 0.15 }));
});
