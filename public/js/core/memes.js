// Game Night — © 2026 Ankit Kumar Mishra. All rights reserved. See LICENSE.
// The app's sound effects.
//
// Two layers. Anything acoustic — a crowd laughing, booing, gasping, applauding, a gong,
// a snare — is a real CC0 recording from public/media/sfx/, because no amount of
// oscillator maths sounds like a room full of people. Everything else is synthesized
// here: the short musical stings and cartoon noises are cheaper and cleaner made from
// oscillators than sampled, and they cost nothing to download.
//
// The synthesized version of every sound is kept even where a recording exists. It plays
// on the very first use while the file decodes, and it is the fallback if a file is
// missing or corrupt, so a sound never simply fails to happen mid-game.
//
// WHAT IS NOT HERE: the famous meme clips (Vine boom, "bruh", airhorn drops, "emotional
// damage") are copyrighted recordings lifted from films, TV and music. Shipping them in
// a public, all-rights-reserved repository is how a project collects a takedown notice.
// These recreate the character of those sounds instead.
import { getAudioContext, isMuted } from './fx.js';

// A shared bus keeps every effect at a sane level relative to the soundtrack.
function bus(ctx, level = 1) {
  const g = ctx.createGain();
  g.gain.value = 0.5 * level;
  g.connect(ctx.destination);
  return g;
}

function ready() {
  if (isMuted()) return null;
  try {
    const ctx = getAudioContext();
    if (!ctx) return null;
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

// Short burst of noise, used for hats, claps, crowds and scratches.
function noise(ctx, dur, shape = (i, n) => 1 - i / n) {
  const src = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, Math.max(1, Math.ceil(ctx.sampleRate * dur)), ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * shape(i, d.length);
  src.buffer = buf;
  return src;
}

function tone(ctx, dest, { type = 'sine', from, to, at, dur, gain = 0.4, curve = 'exp' }) {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  if (to && to !== from) {
    if (curve === 'exp') osc.frequency.exponentialRampToValueAtTime(Math.max(to, 1), at + dur);
    else osc.frequency.linearRampToValueAtTime(to, at + dur);
  }
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain, at + Math.min(0.02, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(g).connect(dest);
  osc.start(at);
  osc.stop(at + dur + 0.05);
  return osc;
}

// Mild waveshaping — the crunch that makes a boom feel like a meme boom.
function crunch(ctx, amount = 12) {
  const shaper = ctx.createWaveShaper();
  const n = 1024;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    curve[i] = ((3 + amount) * x * 20 * Math.PI) / (Math.PI + amount * Math.abs(x));
  }
  shaper.curve = curve;
  return shaper;
}

export const memes = {
  // The big dramatic bass hit. The one everyone knows.
  boom() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 1.1);
    const t = ctx.currentTime;
    const sh = crunch(ctx, 6);
    sh.connect(out);
    tone(ctx, sh, { type: 'sine', from: 160, to: 28, at: t, dur: 1.1, gain: 0.85 });
    tone(ctx, out, { type: 'sine', from: 80, to: 20, at: t, dur: 1.4, gain: 0.5 });
    const n = noise(ctx, 0.12, (i, len) => (1 - i / len) ** 3);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 400;
    const ng = ctx.createGain(); ng.gain.value = 0.5;
    n.connect(lp).connect(ng).connect(out);
    n.start(t);
  },

  // Flat, deadpan, two-syllable — the "bruh" cadence without the sample.
  bruh() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.9);
    const t = ctx.currentTime;
    // A vowel-ish tone: low sawtooth pushed through two formant bandpasses.
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(126, t);
    osc.frequency.linearRampToValueAtTime(98, t + 0.42);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.5, t + 0.04);
    g.gain.setValueAtTime(0.5, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.46);
    const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 620; f1.Q.value = 5;
    const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1180; f2.Q.value = 7;
    const mix = ctx.createGain(); mix.gain.value = 0.8;
    osc.connect(g);
    g.connect(f1).connect(mix);
    g.connect(f2).connect(mix);
    mix.connect(out);
    osc.start(t);
    osc.stop(t + 0.5);
  },

  // Three rising blasts. Peak celebration.
  airhorn() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.55);
    const t = ctx.currentTime;
    [0, 0.22, 0.44].forEach((offset, i) => {
      const at = t + offset;
      const dur = i === 2 ? 0.5 : 0.16;
      for (const detune of [0, 7, -5]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300 + i * 40, at);
        osc.frequency.linearRampToValueAtTime(430 + i * 45, at + dur);
        osc.detune.value = detune;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, at);
        g.gain.exponentialRampToValueAtTime(0.3, at + 0.02);
        g.gain.setValueAtTime(0.3, at + dur * 0.7);
        g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
        osc.connect(g).connect(lp).connect(out);
        osc.start(at);
        osc.stop(at + dur + 0.05);
      }
    });
  },

  // Womp womp womp wommmp.
  sadTrombone() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.8);
    const t = ctx.currentTime;
    const notes = [[233, 220, 0, 0.2], [207, 196, 0.22, 0.2], [185, 175, 0.44, 0.22], [165, 110, 0.68, 0.75]];
    for (const [from, to, offset, dur] of notes) {
      const at = t + offset;
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(from, at);
      osc.frequency.linearRampToValueAtTime(to, at + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(0.34, at + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1100;
      osc.connect(g).connect(lp).connect(out);
      osc.start(at);
      osc.stop(at + dur + 0.05);
    }
  },

  // Ba-dum-tss.
  rimshot() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.8);
    const t = ctx.currentTime;
    tone(ctx, out, { type: 'sine', from: 260, to: 150, at: t, dur: 0.13, gain: 0.5 });
    tone(ctx, out, { type: 'sine', from: 200, to: 120, at: t + 0.16, dur: 0.13, gain: 0.5 });
    const n = noise(ctx, 0.5, (i, len) => (1 - i / len) ** 1.5);
    const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 5200;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.4, t + 0.32);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.85);
    n.connect(hp).connect(g).connect(out);
    n.start(t + 0.32);
  },

  // A room full of people laughing. Each "voice" fires a short run of "ha" syllables —
  // noise pushed through vowel formants — at its own pitch and offset, which is what
  // makes it read as a crowd rather than one synth blip.
  // A room full of people losing it. Built from a glottal pulse train rather than a raw
  // sawtooth: real laughter is a buzzy voiced source shaped by the mouth, and three
  // formants for an "ah" vowel are what make it read as a person and not a synth. One
  // lead voice carries the rhythm, the rest pile in behind it a beat late.
  laughTrack() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 1.0);
    const t = ctx.currentTime;

    // A glottal pulse: strong fundamental with a long, steep harmonic tail.
    const HARMONICS = 22;
    const real = new Float32Array(HARMONICS);
    const imag = new Float32Array(HARMONICS);
    for (let k = 1; k < HARMONICS; k++) imag[k] = (1 / k ** 1.35) * (k % 2 ? 1 : 0.65);
    const glottal = ctx.createPeriodicWave(real, imag, { disableNormalization: false });

    const formant = (freq, q, gain) => {
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = freq;
      f.Q.value = q;
      const g = ctx.createGain();
      g.gain.value = gain;
      f.connect(g);
      return { in: f, out: g };
    };

    // One "ha". Pitch snaps up on the attack then falls away, which is the shape that
    // makes a syllable sound like a laugh rather than a hum.
    const ha = (at, f0, level, vowel) => {
      const dur = 0.115 + Math.random() * 0.03;

      const osc = ctx.createOscillator();
      osc.setPeriodicWave(glottal);
      osc.frequency.setValueAtTime(f0 * 1.22, at);
      osc.frequency.exponentialRampToValueAtTime(f0, at + 0.035);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.82, at + dur);

      // A little vibrato keeps it from sounding machine-perfect.
      const vib = ctx.createOscillator();
      vib.frequency.value = 5.5 + Math.random() * 2;
      const vibGain = ctx.createGain();
      vibGain.gain.value = f0 * 0.03;
      vib.connect(vibGain).connect(osc.frequency);
      vib.start(at); vib.stop(at + dur + 0.05);

      const env = ctx.createGain();
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(level, at + 0.012);   // percussive attack
      env.gain.exponentialRampToValueAtTime(level * 0.35, at + dur * 0.55);
      env.gain.exponentialRampToValueAtTime(0.0001, at + dur);

      // "ah" formants, scaled with the voice so a high voice keeps a small mouth.
      const scale = 0.78 + (f0 / 320);
      const f1 = formant(vowel[0] * scale, 7, 1.0);
      const f2 = formant(vowel[1] * scale, 9, 0.6);
      const f3 = formant(vowel[2] * scale, 11, 0.28);

      osc.connect(env);
      for (const f of [f1, f2, f3]) { env.connect(f.in); f.out.connect(out); }
      osc.start(at);
      osc.stop(at + dur + 0.05);

      // The breath that opens every "h".
      const air = noise(ctx, 0.06, (j, len) => (1 - j / len) ** 3);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = 1700 + Math.random() * 900; bp.Q.value = 0.9;
      const ag = ctx.createGain(); ag.gain.value = level * 0.5;
      air.connect(bp).connect(ag).connect(out);
      air.start(at);
    };

    // A bout of laughter: syllables speed up slightly and fall in pitch as it runs out.
    const bout = (startAt, f0, count, level, vowel) => {
      let at = startAt;
      let gap = 0.155;
      for (let i = 0; i < count; i++) {
        const decay = 1 - i * 0.055;
        ha(at, f0 * decay * (0.985 + Math.random() * 0.03), level * Math.max(decay, 0.35), vowel);
        at += gap * (0.94 + Math.random() * 0.12);
        gap *= 0.965;
      }
    };

    const AH = [730, 1090, 2440];      // "ha"
    const EH = [610, 1900, 2500];      // "heh", for variety in the crowd

    // The lead laugh, out front and unmistakable.
    bout(t, 168, 7, 0.30, AH);
    // The room joining in, staggered so no two land together.
    bout(t + 0.10, 122, 6, 0.16, AH);
    bout(t + 0.18, 214, 6, 0.15, EH);
    bout(t + 0.07, 258, 5, 0.12, AH);
    bout(t + 0.26, 145, 7, 0.13, EH);
    bout(t + 0.33, 192, 5, 0.10, AH);
    bout(t + 0.41, 300, 4, 0.08, EH);
  },

  // Awkward silence.
  crickets() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.6);
    const t = ctx.currentTime;
    for (let chirp = 0; chirp < 6; chirp++) {
      const at = t + chirp * 0.34 + (chirp % 2) * 0.06;
      for (let i = 0; i < 3; i++) {
        tone(ctx, out, { type: 'square', from: 4400, to: 4700, at: at + i * 0.035, dur: 0.025, gain: 0.12 });
      }
    }
  },

  // Crowd inhale — for a reveal.
  gasp() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.85);
    const t = ctx.currentTime;
    const n = noise(ctx, 0.55, (i, len) => Math.sin((Math.PI * i) / len) ** 2);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.setValueAtTime(700, t);
    bp.frequency.exponentialRampToValueAtTime(2100, t + 0.45);
    bp.Q.value = 1.4;
    const g = ctx.createGain(); g.gain.value = 0.55;
    n.connect(bp).connect(g).connect(out);
    n.start(t);
    tone(ctx, out, { type: 'sine', from: 320, to: 620, at: t + 0.04, dur: 0.4, gain: 0.09, curve: 'lin' });
  },

  // The disappointed crowd.
  boo() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.75);
    const t = ctx.currentTime;
    for (const [detune, delay] of [[0, 0], [-14, 0.05], [11, 0.1]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(190, t + delay);
      osc.frequency.linearRampToValueAtTime(120, t + delay + 0.7);
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.exponentialRampToValueAtTime(0.2, t + delay + 0.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.75);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      osc.connect(g).connect(lp).connect(out);
      osc.start(t + delay);
      osc.stop(t + delay + 0.8);
    }
  },

  applause() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.9);
    const t = ctx.currentTime;
    // Dense claps thinning out, which is what a real room sounds like.
    for (let i = 0; i < 46; i++) {
      const at = t + Math.random() * 1.5;
      const n = noise(ctx, 0.05, (j, len) => (1 - j / len) ** 2);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1200 + Math.random() * 2600;
      bp.Q.value = 0.9;
      const g = ctx.createGain();
      g.gain.value = 0.1 * (1 - (at - t) / 2.2);
      n.connect(bp).connect(g).connect(out);
      n.start(at);
    }
  },

  drumroll() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.8);
    const t = ctx.currentTime;
    for (let i = 0; i < 34; i++) {
      const at = t + i * 0.035;
      const n = noise(ctx, 0.04, (j, len) => (1 - j / len) ** 2);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 260; bp.Q.value = 1.2;
      const g = ctx.createGain(); g.gain.value = 0.1 + (i / 34) * 0.22;
      n.connect(bp).connect(g).connect(out);
      n.start(at);
    }
    tone(ctx, out, { type: 'sine', from: 180, to: 60, at: t + 1.2, dur: 0.5, gain: 0.6 });
  },

  // Rising tension for a vote.
  suspense() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.6);
    const t = ctx.currentTime;
    for (const [base, delay] of [[110, 0], [164.81, 0.5], [220, 1.0]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(base, t + delay);
      osc.frequency.linearRampToValueAtTime(base * 1.06, t + delay + 1.2);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t + delay);
      g.gain.linearRampToValueAtTime(0.16, t + delay + 0.9);
      g.gain.exponentialRampToValueAtTime(0.0001, t + delay + 1.4);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
      osc.connect(g).connect(lp).connect(out);
      osc.start(t + delay);
      osc.stop(t + delay + 1.5);
    }
  },

  // Dramatic descending sting — the "oof, that hurt" beat.
  emotionalDamage() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.85);
    const t = ctx.currentTime;
    for (const [from, to, delay, dur] of [[880, 660, 0, 0.28], [660, 440, 0.26, 0.3], [440, 220, 0.54, 0.9]]) {
      for (const detune of [-8, 8]) {
        const osc = ctx.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(from, t + delay);
        osc.frequency.exponentialRampToValueAtTime(to, t + delay + dur);
        osc.detune.value = detune;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + delay);
        g.gain.exponentialRampToValueAtTime(0.2, t + delay + 0.04);
        g.gain.exponentialRampToValueAtTime(0.0001, t + delay + dur);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
        osc.connect(g).connect(lp).connect(out);
        osc.start(t + delay);
        osc.stop(t + delay + dur + 0.05);
      }
    }
  },

  bonk() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.9);
    const t = ctx.currentTime;
    tone(ctx, out, { type: 'triangle', from: 900, to: 90, at: t, dur: 0.16, gain: 0.6 });
    const n = noise(ctx, 0.05, (i, len) => (1 - i / len) ** 3);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1600;
    const g = ctx.createGain(); g.gain.value = 0.35;
    n.connect(bp).connect(g).connect(out);
    n.start(t);
  },

  recordScratch() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.7);
    const t = ctx.currentTime;
    const n = noise(ctx, 0.4, (i, len) => Math.sin((Math.PI * i) / len));
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 6;
    bp.frequency.setValueAtTime(2400, t);
    bp.frequency.exponentialRampToValueAtTime(380, t + 0.18);
    bp.frequency.exponentialRampToValueAtTime(1700, t + 0.36);
    const g = ctx.createGain(); g.gain.value = 0.5;
    n.connect(bp).connect(g).connect(out);
    n.start(t);
  },

  // Chiptune reward.
  coin() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.55);
    const t = ctx.currentTime;
    tone(ctx, out, { type: 'square', from: 988, to: 988, at: t, dur: 0.07, gain: 0.3 });
    tone(ctx, out, { type: 'square', from: 1319, to: 1319, at: t + 0.07, dur: 0.3, gain: 0.3 });
  },

  levelUp() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.6);
    const t = ctx.currentTime;
    [523, 659, 784, 1047, 1319].forEach((f, i) => {
      tone(ctx, out, { type: 'square', from: f, to: f, at: t + i * 0.07, dur: 0.22, gain: 0.24 });
    });
  },

  // Fast rising whoosh.
  yeet() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.7);
    const t = ctx.currentTime;
    const n = noise(ctx, 0.45, (i, len) => (i / len) ** 2);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.6;
    bp.frequency.setValueAtTime(300, t);
    bp.frequency.exponentialRampToValueAtTime(5200, t + 0.4);
    const g = ctx.createGain(); g.gain.value = 0.45;
    n.connect(bp).connect(g).connect(out);
    n.start(t);
    tone(ctx, out, { type: 'sine', from: 220, to: 1400, at: t, dur: 0.42, gain: 0.14 });
  },

  sparkle() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.5);
    const t = ctx.currentTime;
    for (let i = 0; i < 7; i++) {
      const f = 1400 + Math.random() * 2600;
      tone(ctx, out, { type: 'sine', from: f, to: f * 1.4, at: t + i * 0.045, dur: 0.22, gain: 0.13 });
    }
  },

  // Wrong-answer buzzer.
  buzzer() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.6);
    const t = ctx.currentTime;
    for (const detune of [0, 12]) {
      const osc = ctx.createOscillator();
      osc.type = 'square';
      osc.frequency.value = 140;
      osc.detune.value = detune;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.28, t);
      g.gain.setValueAtTime(0.28, t + 0.42);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 900;
      osc.connect(g).connect(lp).connect(out);
      osc.start(t);
      osc.stop(t + 0.55);
    }
  },

  // Sinister little laugh for when the liars win.
  sinister() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.75);
    const t = ctx.currentTime;
    [0, 0.16, 0.32, 0.5].forEach((offset, i) => {
      tone(ctx, out, {
        type: 'triangle', from: 220 - i * 18, to: 165 - i * 14,
        at: t + offset, dur: 0.14, gain: 0.3,
      });
    });
    tone(ctx, out, { type: 'sine', from: 90, to: 55, at: t, dur: 1.1, gain: 0.35 });
  },
};

// Every sound in one list with where it fires and whether a real recording is shipped
// for it. Not imported by the app: it is the reference for anyone adding a sound, and the
// source the README's sound table is written from. Keep it in step with the call sites in
// main.js and with the files in public/media/sfx/.
export const MEME_CATALOG = [
  { id: 'boom', emoji: '💥', name: 'Bass boom', where: 'A player is eliminated; the 💀 reaction', recorded: true },
  { id: 'gasp', emoji: '😱', name: 'Crowd gasp', where: 'The moment an elimination is revealed; the 😱 reaction', recorded: true },
  { id: 'boo', emoji: '👎', name: 'Boo', where: 'The room votes out an innocent insider', recorded: true },
  { id: 'airhorn', emoji: '📣', name: 'Airhorn', where: 'The Blank guesses right; the outsiders win; the 🔥 reaction', recorded: true },
  { id: 'laughTrack', emoji: '😂', name: 'Crowd laugh', where: 'The 😂 reaction', recorded: true },
  { id: 'crickets', emoji: '🦗', name: 'Crickets', where: 'A tied vote; nobody eliminated; the 🤔 reaction', recorded: true },
  { id: 'rimshot', emoji: '🥁', name: 'Rimshot', where: 'Lands the quip after a tied vote', recorded: true },
  { id: 'suspense', emoji: '🧐', name: 'Suspense sting', where: 'Voting opens; the 🧐 reaction', recorded: true },
  { id: 'drumroll', emoji: '🥁', name: 'Drum roll', where: 'A game starting; the run-up to an elimination', recorded: true },
  { id: 'applause', emoji: '👏', name: 'Applause', where: 'Insiders win; a pattern is cracked; the round ends', recorded: true },
  { id: 'sadTrombone', emoji: '🎺', name: 'Sad trombone', where: "the Blank's guess misses" },
  { id: 'sinister', emoji: '😈', name: 'Sinister', where: 'The outsiders take the game' },
  { id: 'levelUp', emoji: '⬆️', name: 'Level up', where: 'Insiders win; a player cracks the pattern' },
  { id: 'yeet', emoji: '🚀', name: 'Yeet', where: 'A new game kicking off' },
  { id: 'sparkle', emoji: '✨', name: 'Sparkle', where: 'The Island opens with a fresh pattern' },
  { id: 'coin', emoji: '🪙', name: 'Coin', where: 'An item is allowed aboard; a hint is spent' },
  { id: 'bonk', emoji: '🔨', name: 'Bonk', where: 'An item is turned away' },
  { id: 'buzzer', emoji: '🚫', name: 'Buzzer', where: 'A wrong pattern guess', recorded: true },
  { id: 'emotionalDamage', emoji: '🩹', name: 'Emotional damage', where: 'Three wrong guesses and you are out' },
  { id: 'recordScratch', emoji: '💿', name: 'Record scratch', where: 'An unrecognised item; an AI error' },
  { id: 'bruh', emoji: '🫠', name: 'Bruh', where: 'The judge cannot make sense of what you typed' },
];

// Which sound each reaction fires. Keep these in step with REACTIONS on the server.
export const REACTION_SOUNDS = {
  '😂': 'laughTrack',
  '🤔': 'crickets',
  '😱': 'gasp',
  '🧐': 'suspense',
  '🔥': 'airhorn',
  '💀': 'boom',
};

// ---------------------------------------------------------------------------
// Real recordings, when there are any
// ---------------------------------------------------------------------------
// Every sound above is synthesized, which keeps the app free of licensing problems and
// adds nothing to the download. Drop an audio file named after a sound into
// public/media/sfx/ (boom.mp3, airhorn.mp3, laughTrack.mp3 …) and it is used instead.
// Files are fetched once, decoded, then cached; if anything fails the synth still plays,
// so a missing or broken file never leaves a silent gap in a game.
const samples = new Map();      // id -> AudioBuffer
let sampleIndex = null;         // Set of ids the server says exist

export async function loadSampleIndex() {
  try {
    const res = await fetch('/api/sfx');
    const { files } = await res.json();
    sampleIndex = new Map(files.map((f) => [f.id, f.src]));
  } catch {
    sampleIndex = new Map();
  }
}

function playSample(buffer) {
  const ctx = ready(); if (!ctx) return false;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.connect(bus(ctx, 1));
  src.start();
  return true;
}

export function playMeme(name) {
  const synth = () => { const fn = memes[name]; if (fn) fn(); };

  const cached = samples.get(name);
  if (cached) { playSample(cached); return; }
  if (!sampleIndex?.has(name)) { synth(); return; }

  // First use of this sample: play the synth now so nothing is late, and decode in the
  // background so every later use is the real recording.
  synth();
  const url = sampleIndex.get(name);
  sampleIndex.delete(name);           // never fetch the same one twice
  fetch(url)
    .then((r) => r.arrayBuffer())
    .then((buf) => ready()?.decodeAudioData(buf))
    .then((decoded) => { if (decoded) samples.set(name, decoded); })
    .catch(() => { /* keep using the synth */ });
}
