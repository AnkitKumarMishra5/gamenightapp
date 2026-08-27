// Game Night — © 2026 Ankit Kumar Mishra. All rights reserved. See LICENSE.
// Soundtrack engine — a real step sequencer, synthesized in WebAudio.
//
// The earlier version was floating drones and it sounded dead, because nothing kept time.
// This one runs a 16-step grid per bar with a lookahead scheduler (notes are queued
// against ctx.currentTime, never setTimeout), so the groove is tight: kick, hat, clap,
// a bass line that follows a chord progression, an arpeggiated lead and a pad.
//
// A theme is pure data — bpm, swing, chord progression, drum/bass/lead patterns, timbres —
// so adding a sixth soundtrack means adding one object to THEMES.
import { getAudioContext } from './fx.js';

const SOUND_KEY = 'gn_sound';      // master: music + game effects
const MUSIC_KEY = 'gn_music_on';   // background music only
const VOL_KEY = 'gn_music_vol';
const THEME_KEY = 'gn_theme';

const FADE_IN = 1.2;
const FADE_OUT = 0.9;
const LOOKAHEAD_MS = 25;
const SCHEDULE_AHEAD = 0.14;       // seconds of notes queued in advance

// Semitone -> frequency, A4 = 440.
const hz = (n) => 440 * Math.pow(2, (n - 69) / 12);

// Chord shapes as semitone offsets from the chord root.
const MIN7 = [0, 3, 7, 10];
const MAJ7 = [0, 4, 7, 11];
const MIN9 = [0, 3, 7, 10, 14];
const MAJ6 = [0, 4, 7, 9];
const DOM7 = [0, 4, 7, 10];
const MIN = [0, 3, 7];
const SUS4 = [0, 5, 7];

// Pattern helper: "x..x" style strings are far easier to read than boolean arrays.
const pat = (s) => s.split('').map((c) => (c === '.' || c === ' ' ? 0 : c === 'x' ? 1 : Number(c) / 9));

export const THEMES = [
  {
    id: 'neon',
    name: 'Neon Nights',
    blurb: 'Synthwave drive, pumping bass, crisp hats and a soaring arpeggio.',
    bpm: 104,
    swing: 0,
    level: 0.34,
    // Am – F – C – G, the classic four-chord engine room.
    progression: [[57, MIN9], [53, MAJ7], [60, MAJ6], [55, DOM7]],
    drums: {
      kick: pat('x...x...x...x...'),
      hat: pat('..x...x...x...x.'),
      clap: pat('....x.......x...'),
      openHat: pat('..............x.'),
    },
    bass: { pattern: pat('x.xxx.x.x.xxx.x.'), octave: -24, type: 'sawtooth', cutoff: 620, level: 0.3, decay: 0.2 },
    lead: { steps: [0, 2, 4, 2, 3, 4, 2, 0], octave: 12, type: 'square', level: 0.075, decay: 0.34, every: 2, delay: true },
    pad: { type: 'sawtooth', level: 0.035, octave: 0, cutoff: 1500 },
  },
  {
    id: 'pokerface',
    name: 'Poker Face',
    blurb: 'Smoky jazz-noir, swung hats, walking bass and moody chords.',
    bpm: 88,
    swing: 0.22,                                   // that laid-back shuffle
    level: 0.33,
    progression: [[57, MIN7], [50, MIN7], [55, DOM7], [60, MAJ7]],
    drums: {
      kick: pat('x.......x.......'),
      hat: pat('..x.x.x...x.x.x.'),
      clap: pat('....x.......x..x'),
      openHat: pat('...............x'),
    },
    bass: { pattern: pat('x...x..xx...x..x'), octave: -24, type: 'triangle', cutoff: 520, level: 0.3, decay: 0.34 },
    lead: { steps: [4, 3, 2, 3, 1, 2, 0, 2], octave: 12, type: 'triangle', level: 0.08, decay: 0.7, every: 4, delay: true },
    pad: { type: 'triangle', level: 0.05, octave: 0, cutoff: 1200 },
  },
  {
    id: 'islandparty',
    name: 'Island Party',
    blurb: 'Tropical house, plucky marimba lead over an offbeat bounce.',
    bpm: 112,
    swing: 0,
    level: 0.32,
    progression: [[62, MAJ6], [59, MIN7], [55, MAJ7], [57, MIN7]],
    drums: {
      kick: pat('x...x...x...x...'),
      hat: pat('..x...x...x...x.'),
      clap: pat('....x.......x...'),
      shaker: pat('.x.x.x.x.x.x.x.x'),
    },
    bass: { pattern: pat('..x...x...x...x.'), octave: -24, type: 'sine', cutoff: 700, level: 0.32, decay: 0.26 },
    lead: { steps: [0, 2, 4, 5, 4, 2, 3, 1], octave: 12, type: 'sine', level: 0.11, decay: 0.5, every: 2, delay: true },
    pad: { type: 'triangle', level: 0.04, octave: 0, cutoff: 2000 },
  },
  {
    id: 'suspicion',
    name: 'Suspicion',
    blurb: 'Cinematic chase, staccato pulse, timpani hits and rising tension.',
    bpm: 128,
    swing: 0,
    level: 0.3,
    progression: [[57, MIN], [56, MIN], [57, MIN], [58, SUS4]],   // creeping semitone
    drums: {
      kick: pat('x.....x...x.....'),
      hat: pat('x.x.x.x.x.x.x.x.'),
      clap: pat('........x.......'),
      openHat: pat('...............x'),
    },
    bass: { pattern: pat('xxxxxxxxxxxxxxxx'), octave: -24, type: 'sawtooth', cutoff: 420, level: 0.22, decay: 0.1 },
    lead: { steps: [0, 0, 1, 0, 2, 1, 0, 4], octave: 12, type: 'sawtooth', level: 0.05, decay: 0.18, every: 2, delay: false },
    pad: { type: 'sawtooth', level: 0.03, octave: -12, cutoff: 900 },
  },
  {
    id: 'arcade',
    name: 'Arcade Rush',
    blurb: 'Chiptune energy, fast square arpeggios and a bouncy 8-bit bass.',
    bpm: 140,
    swing: 0,
    level: 0.26,
    progression: [[60, MAJ6], [57, MIN7], [65, MAJ7], [55, DOM7]],
    drums: {
      kick: pat('x..x..x...x..x..'),
      hat: pat('..x...x...x...x.'),
      clap: pat('....x.......x...'),
      openHat: pat('..............x.'),
    },
    bass: { pattern: pat('x.x.x.x.x.x.x.x.'), octave: -24, type: 'square', cutoff: 900, level: 0.2, decay: 0.14 },
    lead: { steps: [0, 1, 2, 3, 4, 3, 2, 1], octave: 12, type: 'square', level: 0.055, decay: 0.12, every: 1, delay: true },
    pad: { type: 'square', level: 0.008, octave: 12, cutoff: 2600 },
  },
];

// ---------------------------------------------------------------------------
// Preferences — sound on, music on, 80% by default
// ---------------------------------------------------------------------------
const clamp01 = (v) => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0.8));

let soundOn = localStorage.getItem(SOUND_KEY) !== '0';
let musicOn = localStorage.getItem(MUSIC_KEY) !== '0';
let volume = clamp01(parseFloat(localStorage.getItem(VOL_KEY) ?? '0.8'));
let themeId = localStorage.getItem(THEME_KEY) || THEMES[0].id;

let graph = null;
let armed = false;
let welcomed = false;

export function soundEnabled() { return soundOn; }
export function musicIsOn() { return musicOn; }
export function musicVolume() { return volume; }
export function musicPlaying() { return Boolean(graph); }
export function currentThemeId() { return themeId; }
export function currentTheme() { return THEMES.find((t) => t.id === themeId) || THEMES[0]; }

function wantsMusic() { return soundOn && musicOn && volume > 0.01; }

function announce() {
  dispatchEvent(new CustomEvent('gn:music', {
    detail: { soundOn, musicOn, volume, playing: Boolean(graph), themeId },
  }));
}

export function setSoundEnabled(on) {
  soundOn = on;
  localStorage.setItem(SOUND_KEY, on ? '1' : '0');
  if (wantsMusic()) start(); else stop();
  announce();
  return soundOn;
}

export function setMusicOn(on) {
  musicOn = on;
  localStorage.setItem(MUSIC_KEY, on ? '1' : '0');
  if (wantsMusic()) start(); else stop();
  announce();
  return musicOn;
}

export function setMusicVolume(v) {
  volume = clamp01(v);
  localStorage.setItem(VOL_KEY, String(volume));
  if (graph) {
    if (!wantsMusic()) {
      stop();
    } else {
      const { ctx, master, theme } = graph;
      const now = ctx.currentTime;
      master.gain.cancelScheduledValues(now);
      master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
      master.gain.linearRampToValueAtTime(theme.level * volume, now + 0.15);
    }
  } else if (wantsMusic() && armed) {
    start();
  }
  announce();
  return volume;
}

export function setTheme(id) {
  if (!THEMES.some((t) => t.id === id)) return themeId;
  themeId = id;
  localStorage.setItem(THEME_KEY, id);
  if (graph) { stop(); armed = true; setTimeout(start, 120); }
  announce();
  return themeId;
}

// ---------------------------------------------------------------------------
// Welcome sting: a short rising flourish, then the groove comes in under it.
// ---------------------------------------------------------------------------
export function playWelcome({ thenStartMusic = true } = {}) {
  if (welcomed) return;
  welcomed = true;
  if (!soundOn) return;

  let ctx;
  try { ctx = getAudioContext(); } catch { return; }
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  const t0 = ctx.currentTime + 0.04;
  const out = ctx.createGain();
  out.gain.value = 0.34 * Math.max(volume, 0.55);   // audible even at a low music volume
  out.connect(ctx.destination);

  const verb = ctx.createDelay(0.6);
  verb.delayTime.value = 0.16;
  const verbGain = ctx.createGain();
  verbGain.gain.value = 0.3;
  verb.connect(verbGain).connect(out);

  // A bright major-9 arpeggio climbing up, then a soft cymbal-ish shimmer.
  const notes = [60, 64, 67, 71, 74, 79];
  notes.forEach((n, i) => {
    const at = t0 + i * 0.075;
    const osc = ctx.createOscillator();
    osc.type = i < 4 ? 'triangle' : 'sine';
    osc.frequency.value = hz(n);

    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.5 - i * 0.045, at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.9);

    osc.connect(g);
    g.connect(out);
    g.connect(verb);
    osc.start(at);
    osc.stop(at + 1);
  });

  // Low swell underneath for weight.
  const sub = ctx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(hz(36), t0);
  const subGain = ctx.createGain();
  subGain.gain.setValueAtTime(0.0001, t0);
  subGain.gain.exponentialRampToValueAtTime(0.6, t0 + 0.1);
  subGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.4);
  sub.connect(subGain).connect(out);
  sub.start(t0);
  sub.stop(t0 + 1.5);

  // Airy shimmer tail.
  const noise = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, ctx.sampleRate * 0.9, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2;
  noise.buffer = buf;
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 4200;
  const ng = ctx.createGain();
  ng.gain.setValueAtTime(0.0001, t0);
  ng.gain.exponentialRampToValueAtTime(0.22, t0 + 0.06);
  ng.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.85);
  noise.connect(hp).connect(ng).connect(out);
  noise.start(t0);

  setTimeout(() => { try { out.disconnect(); } catch {} }, 2200);

  // Let the flourish breathe, then bring the groove in underneath it.
  if (thenStartMusic) setTimeout(() => { armed = true; startAmbience(); }, 900);
}

export function armAmbience() {
  if (armed) return;
  armed = true;
  if (wantsMusic()) start();
}

export function startAmbience() {
  if (!wantsMusic() || !armed) return;
  start();
}

export function stopAmbience() { stop(); }

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------
function start() {
  if (graph || !wantsMusic()) return;
  let ctx;
  try { ctx = getAudioContext(); } catch { return; }
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();

  const theme = currentTheme();
  const now = ctx.currentTime;

  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(Math.max(theme.level * volume, 0.0002), now + FADE_IN);

  // Glue bus keeps the mix punchy and stops the kick swamping everything.
  const glue = ctx.createDynamicsCompressor();
  glue.threshold.value = -16;
  glue.knee.value = 20;
  glue.ratio.value = 5;
  glue.attack.value = 0.004;
  glue.release.value = 0.16;
  glue.connect(master);
  master.connect(ctx.destination);

  const delay = ctx.createDelay(1);
  delay.delayTime.value = (60 / theme.bpm) * 0.75;   // dotted-eighth: classic and musical
  const feedback = ctx.createGain();
  feedback.gain.value = 0.26;
  const delayOut = ctx.createGain();
  delayOut.gain.value = 0.34;
  delay.connect(feedback).connect(delay);
  delay.connect(delayOut).connect(glue);

  // Held pad, gated per bar so it swells rather than droning.
  const padGain = ctx.createGain();
  padGain.gain.value = 0;
  const padFilter = ctx.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = theme.pad.cutoff;
  padGain.connect(padFilter).connect(glue);

  graph = {
    ctx, theme, master, glue, delay, delayOut, padGain, padFilter,
    step: 0, nextNoteTime: now + 0.08, padVoices: [], timer: null, chordIndex: -1,
  };

  graph.timer = setInterval(scheduler, LOOKAHEAD_MS);
  announce();
}

// Queue every step that falls inside the lookahead window.
function scheduler() {
  if (!graph) return;
  const { ctx, theme } = graph;
  const stepDur = 60 / theme.bpm / 4;              // sixteenth notes

  while (graph.nextNoteTime < ctx.currentTime + SCHEDULE_AHEAD) {
    const step = graph.step % 16;
    // Swing pushes the odd sixteenths late, which is what makes a shuffle feel human.
    const swingOffset = step % 2 === 1 ? stepDur * theme.swing : 0;
    scheduleStep(step, graph.nextNoteTime + swingOffset, stepDur);
    graph.nextNoteTime += stepDur;
    graph.step += 1;
  }
}

function scheduleStep(step, when, stepDur) {
  const { theme } = graph;
  const bar = Math.floor(graph.step / 16);
  const [chordRoot, chordShape] = theme.progression[bar % theme.progression.length];

  // New bar: retune the pad to the new chord.
  if (step === 0) setPad(chordRoot, chordShape, when, stepDur * 16);

  const d = theme.drums;
  if (d.kick?.[step]) kick(when, d.kick[step]);
  if (d.hat?.[step]) hat(when, d.hat[step], false);
  if (d.openHat?.[step]) hat(when, d.openHat[step], true);
  if (d.clap?.[step]) clap(when, d.clap[step]);
  if (d.shaker?.[step]) hat(when, d.shaker[step] * 0.5, false, 9000);

  if (theme.bass.pattern[step]) {
    // Walk the chord: root most of the time, fifth on later hits for movement.
    const tone = step % 8 === 0 ? 0 : (step % 4 === 0 ? 2 : 0);
    const note = chordRoot + chordShape[tone % chordShape.length] + theme.bass.octave;
    bassNote(note, when, theme.bass.pattern[step]);
  }

  const lead = theme.lead;
  if (step % lead.every === 0) {
    const idx = (step / lead.every) % lead.steps.length;
    const degree = lead.steps[idx];
    const note = chordRoot + chordShape[degree % chordShape.length]
      + 12 * Math.floor(degree / chordShape.length) + lead.octave;
    leadNote(note, when, lead);
  }
}

// ---- voices ----
function kick(when, vel) {
  const { ctx, glue } = graph;
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(150, when);
  osc.frequency.exponentialRampToValueAtTime(45, when + 0.13);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.9 * vel, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.2);
  osc.connect(g).connect(glue);
  osc.start(when);
  osc.stop(when + 0.24);
}

function noiseBurst(when, dur) {
  const { ctx } = graph;
  const src = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  src.buffer = buf;
  src.start(when);
  return src;
}

function hat(when, vel, open, freq = 7200) {
  const { ctx, glue } = graph;
  const dur = open ? 0.22 : 0.045;
  const src = noiseBurst(when, dur + 0.02);
  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.22 * vel, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(hp).connect(g).connect(glue);
}

function clap(when, vel) {
  const { ctx, glue } = graph;
  const src = noiseBurst(when, 0.18);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1900;
  bp.Q.value = 1.1;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(0.34 * vel, when + 0.006);
  g.gain.exponentialRampToValueAtTime(0.0001, when + 0.16);
  src.connect(bp).connect(g).connect(glue);
}

function bassNote(note, when, vel) {
  const { ctx, theme, glue } = graph;
  const spec = theme.bass;
  const osc = ctx.createOscillator();
  osc.type = spec.type;
  osc.frequency.value = hz(note);

  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(spec.cutoff * 1.7, when);
  lp.frequency.exponentialRampToValueAtTime(spec.cutoff, when + spec.decay);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(spec.level * vel, when + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, when + spec.decay);

  osc.connect(lp).connect(g).connect(glue);
  osc.start(when);
  osc.stop(when + spec.decay + 0.05);
}

function leadNote(note, when, spec) {
  const { ctx, glue, delay } = graph;
  const osc = ctx.createOscillator();
  osc.type = spec.type;
  osc.frequency.value = hz(note);

  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, when);
  g.gain.exponentialRampToValueAtTime(spec.level, when + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, when + spec.decay);

  const tone = ctx.createBiquadFilter();
  tone.type = 'lowpass';
  tone.frequency.value = 4200;

  osc.connect(g).connect(tone);
  tone.connect(glue);
  if (spec.delay) tone.connect(delay);
  osc.start(when);
  osc.stop(when + spec.decay + 0.05);
}

// The pad is rebuilt each bar so it follows the progression.
function setPad(chordRoot, chordShape, when, barDur) {
  const { ctx, theme, padGain } = graph;

  for (const v of graph.padVoices) {
    try { v.stop(when + barDur + 0.2); } catch {}
  }
  graph.padVoices = [];

  for (const interval of chordShape) {
    const osc = ctx.createOscillator();
    osc.type = theme.pad.type;
    osc.frequency.value = hz(chordRoot + interval + theme.pad.octave);
    osc.detune.value = (Math.random() - 0.5) * 8;
    osc.connect(padGain);
    osc.start(when);
    graph.padVoices.push(osc);
  }

  // Swell in and out across the bar so it breathes with the groove.
  padGain.gain.cancelScheduledValues(when);
  padGain.gain.setValueAtTime(Math.max(padGain.gain.value, 0.0001), when);
  padGain.gain.linearRampToValueAtTime(theme.pad.level, when + barDur * 0.45);
  padGain.gain.linearRampToValueAtTime(theme.pad.level * 0.55, when + barDur * 0.95);
}

function stop() {
  if (!graph) return;
  const g = graph;
  graph = null;
  clearInterval(g.timer);
  announce();

  const { ctx, master } = g;
  const now = ctx.currentTime;
  try {
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(Math.max(master.gain.value, 0.0001), now);
    master.gain.exponentialRampToValueAtTime(0.0001, now + FADE_OUT);
  } catch { /* context already gone */ }

  setTimeout(() => {
    for (const v of g.padVoices) { try { v.stop(); } catch {} try { v.disconnect(); } catch {} }
    for (const n of [g.master, g.glue, g.delay, g.delayOut, g.padGain, g.padFilter]) {
      try { n.disconnect(); } catch {}
    }
  }, (FADE_OUT + 0.3) * 1000);
}

// Hush while the tab is in the background.
let pausedByVisibility = false;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    if (graph) { pausedByVisibility = true; stop(); }
  } else if (pausedByVisibility) {
    pausedByVisibility = false;
    startAmbience();
  }
});
