// Game Night — © 2026 Ankit Kumar Mishra. All rights reserved. See LICENSE.
// The app's sound effects.
//
// Two layers. Anything acoustic — a crowd laughing, booing, gasping, applauding, a gong,
// a snare, and the spoken meme one-liners — is a real recording from public/media/sfx/,
// because no amount of oscillator maths sounds like a room full of people. Everything else
// is synthesized here: the short musical stings and cartoon noises are cheaper and cleaner
// made from oscillators than sampled, and they cost nothing to download.
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

  // A crowd cheer: broadband noise swelling and falling, with a few whistles over it.
  cheer() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.85);
    const t = ctx.currentTime;
    const n = noise(ctx, 1.6, (j, len) => {
      const x = j / len;
      return Math.min(1, x * 6) * (1 - x) ** 0.8;      // fast swell, slow fall
    });
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 0.5;
    const g = ctx.createGain(); g.gain.value = 0.5;
    n.connect(bp).connect(g).connect(out);
    n.start(t);
    // Two whistles cutting through, the way they do in a real crowd.
    for (const [at, f] of [[0.35, 2100], [0.8, 2600]]) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f * 0.8, t + at);
      osc.frequency.exponentialRampToValueAtTime(f, t + at + 0.12);
      const wg = ctx.createGain();
      wg.gain.setValueAtTime(0.0001, t + at);
      wg.gain.exponentialRampToValueAtTime(0.06, t + at + 0.05);
      wg.gain.exponentialRampToValueAtTime(0.0001, t + at + 0.3);
      osc.connect(wg).connect(out);
      osc.start(t + at); osc.stop(t + at + 0.35);
    }
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


  // Chiptune reward.
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
  sparkle() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.5);
    const t = ctx.currentTime;
    for (let i = 0; i < 7; i++) {
      const f = 1400 + Math.random() * 2600;
      tone(ctx, out, { type: 'sine', from: f, to: f * 1.4, at: t + i * 0.045, dur: 0.22, gain: 0.13 });
    }
  },
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

  // Two slow thumps and a beat of silence, over and over the way a pulse is. Used by the
  // card games for the moment a player is about to do something they cannot take back.
  heartbeat() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.9);
    const t = ctx.currentTime;
    const thump = (at, gain) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(58, at);
      osc.frequency.exponentialRampToValueAtTime(40, at + 0.16);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.exponentialRampToValueAtTime(gain, at + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, at + 0.22);
      osc.connect(g).connect(out);
      osc.start(at); osc.stop(at + 0.3);
    };
    // lub-DUB, twice: the second pair softer, like it is settling.
    thump(t, 0.5); thump(t + 0.18, 0.62);
    thump(t + 0.95, 0.4); thump(t + 1.13, 0.5);
  },

  // Night falling: a soft high shimmer dissolving downward into a low drone, the audio
  // version of the lights going down. Built for Sleepless, generic enough for anything.
  nightfall() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.7);
    const t = ctx.currentTime;
    // The shimmer: three detuned high sines gliding down and fading.
    [880, 1108, 1318].forEach((f, i) => {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);
      osc.frequency.exponentialRampToValueAtTime(f / 4, t + 2.4);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.055 - i * 0.012, t + 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
      osc.connect(g).connect(out);
      osc.start(t); osc.stop(t + 2.8);
    });
    // The ground the night settles onto.
    const low = ctx.createOscillator();
    low.type = 'triangle';
    low.frequency.value = 55;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(0.0001, t + 0.4);
    lg.gain.linearRampToValueAtTime(0.16, t + 1.6);
    lg.gain.exponentialRampToValueAtTime(0.0001, t + 3.4);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
    low.connect(lg).connect(lp).connect(out);
    low.start(t + 0.4); low.stop(t + 3.6);
  },

  // ---- the card table ----------------------------------------------------
  // Cards are all noise, no pitch: a card is a stiff sheet of paper, and every sound it
  // makes is a broadband click shaped by how fast it moves. So these are built from
  // filtered noise bursts rather than oscillators, and what makes them recognisable is
  // the rhythm, not the tone.

  // A riffle shuffle. Two halves interleaving is a burst of clicks that accelerates as
  // the halves release, and the ear identifies the shuffle from that acceleration alone.
  // Three bursts, matching the three motions the table animates: riffle, riffle, cut.
  cardShuffle() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.9);
    const t0 = ctx.currentTime;
    const hp = ctx.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 800;
    hp.connect(out);

    const click = (at, level, bright) => {
      const n = noise(ctx, 0.014, (i, len) => (1 - i / len) ** 2.4);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass'; bp.frequency.value = bright; bp.Q.value = 1.2;
      const g = ctx.createGain(); g.gain.value = level;
      n.connect(bp).connect(g).connect(hp);
      n.start(at);
    };
    // Gaps shorten across the burst, because the cards speed up as the bridge collapses.
    const riffle = (start, count, span, level) => {
      for (let i = 0; i < count; i += 1) {
        const at = start + span * ((i / count) ** 1.55);
        click(at, level * (0.55 + Math.random() * 0.55), 2100 + Math.random() * 2700);
      }
    };
    riffle(t0 + 0.02, 22, 0.33, 0.5);
    riffle(t0 + 0.52, 20, 0.29, 0.44);
    riffle(t0 + 1.04, 9, 0.15, 0.36);

    // The square-up: the deck knocked flat on the table, which is the only part of a
    // shuffle with any low end in it.
    const body = noise(ctx, 0.1, (i, len) => (1 - i / len) ** 3);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 340;
    const bg = ctx.createGain(); bg.gain.value = 0.55;
    body.connect(lp).connect(bg).connect(out);
    body.start(t0 + 1.3);
    click(t0 + 1.3, 0.4, 1500);
  },

  // One card leaving the dealer's hand: a short rising hiss, gone before you notice it.
  // Quiet on purpose, because this fires once per player.
  cardFlick() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.55);
    const t = ctx.currentTime;
    const n = noise(ctx, 0.14, (i, len) => Math.sin((Math.PI * i) / len) ** 2);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 1.5;
    bp.frequency.setValueAtTime(1300 + Math.random() * 500, t);
    bp.frequency.exponentialRampToValueAtTime(3100, t + 0.11);
    const g = ctx.createGain(); g.gain.value = 0.3;
    n.connect(bp).connect(g).connect(out);
    n.start(t);
  },

  // A card landing flat on felt: soft, damped, no ring.
  cardSlap() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.7);
    const t = ctx.currentTime;
    const n = noise(ctx, 0.07, (i, len) => (1 - i / len) ** 2.6);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 900;
    const g = ctx.createGain(); g.gain.value = 0.42;
    n.connect(lp).connect(g).connect(out);
    n.start(t);
  },

  // Turning a card over. Two events, and the gap between them is what sells it: the
  // sweep of the card through the air, then the snap as it lands flat again.
  cardTurn() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.85);
    const t = ctx.currentTime;
    const n = noise(ctx, 0.19, (i, len) => Math.sin((Math.PI * i) / len) ** 1.4);
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.Q.value = 0.9;
    bp.frequency.setValueAtTime(650, t);
    bp.frequency.exponentialRampToValueAtTime(3300, t + 0.15);
    const g = ctx.createGain(); g.gain.value = 0.4;
    n.connect(bp).connect(g).connect(out);
    n.start(t);

    const snap = noise(ctx, 0.028, (i, len) => (1 - i / len) ** 2);
    const sh = ctx.createBiquadFilter();
    sh.type = 'highpass'; sh.frequency.value = 1700;
    const sg = ctx.createGain(); sg.gain.value = 0.34;
    snap.connect(sh).connect(sg).connect(out);
    snap.start(t + 0.17);
  },

  // The room going serious. A low fifth swells in under the silence, the minor third
  // arrives late over the top, and nothing resolves. Two notes is all it takes.
  serious() {
    const ctx = ready(); if (!ctx) return;
    const out = bus(ctx, 0.75);
    const t = ctx.currentTime;
    const swell = (freq, at, dur, peak, type = 'sine') => {
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      // A slow attack is the whole point, so this cannot reuse the shared tone helper.
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, at);
      g.gain.linearRampToValueAtTime(peak, at + dur * 0.45);
      g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass'; lp.frequency.value = 900;
      osc.connect(g).connect(lp).connect(out);
      osc.start(at);
      osc.stop(at + dur + 0.1);
    };
    swell(73.42, t, 2.4, 0.5);                    // D2
    swell(110.0, t + 0.05, 2.3, 0.26);            // A2
    swell(174.61, t + 0.7, 1.7, 0.13, 'triangle'); // F3, the minor third, held back
  },
};

// Every sound in one list with where it fires and whether a real recording is shipped
// for it. Not imported by the app: it is the reference for anyone adding a sound, and the
// source the README's sound table is written from. Keep it in step with the call sites in
// main.js and with the files in public/media/sfx/.
export const MEME_CATALOG = [
  // The emoji reactions. One pack each; the server seeds the pick so the whole room
  // hears the same clip at the same moment.
  { id: 'rxLaugh', emoji: '😂', name: 'Laugh pack', where: 'The 😂 reaction (9 clips)', recorded: true },
  { id: 'rxShock', emoji: '😱', name: 'Shock pack', where: 'The 😱 reaction (5 clips)', recorded: true },
  { id: 'rxFire', emoji: '🔥', name: 'Fire pack', where: 'The 🔥 reaction (4 clips)', recorded: true },
  { id: 'rxDoubt', emoji: '🧐', name: 'Doubt pack', where: 'The 🧐 reaction (3 clips)', recorded: true },
  { id: 'rxDead', emoji: '💀', name: 'Dead pack', where: 'The 💀 reaction (2 clips)', recorded: true },
  { id: 'rxThink', emoji: '🤔', name: 'Thinking pack', where: 'The 🤔 reaction (2 clips)', recorded: true },
  { id: 'rxCry', emoji: '😭', name: 'Crying pack', where: 'The 😭 reaction (1 clip)', recorded: true },
  { id: 'rimshot', emoji: '🥁', name: 'Rimshot', where: 'Lands the quip after a tied vote', recorded: true },
  { id: 'bruh', emoji: '🫠', name: 'Bruh', where: 'The judge cannot make sense of what you typed' },
  { id: 'recordScratch', emoji: '💿', name: 'Record scratch', where: 'An unrecognised item; an AI error' },
  { id: 'airhorn', emoji: '📣', name: 'Airhorn', where: 'The Blank guesses right; the outsiders win; the 🔥 reaction', recorded: true },
  { id: 'sparkle', emoji: '✨', name: 'Sparkle', where: 'Island Rules opens with a fresh pattern' },
  { id: 'boom', emoji: '💥', name: 'Bass boom', where: 'A player is eliminated', recorded: true },
  { id: 'gasp', emoji: '😱', name: 'Crowd gasp', where: 'The moment an elimination is revealed', recorded: true },
  { id: 'boo', emoji: '👎', name: 'Boo', where: 'The room votes out an innocent insider', recorded: true },
  { id: 'laughTrack', emoji: '😂', name: 'Crowd laugh', where: 'A round won on a bluff', recorded: true },
  { id: 'crickets', emoji: '🦗', name: 'Crickets', where: 'A tied vote; nobody eliminated', recorded: true },
  { id: 'suspense', emoji: '🧐', name: 'Suspense sting', where: 'Voting opens', recorded: true },
  { id: 'drumroll', emoji: '🥁', name: 'Drum roll', where: 'A game starting; the run-up to an elimination', recorded: true },
  { id: 'applause', emoji: '👏', name: 'Applause', where: 'Insiders win; a pattern is cracked; the round ends', recorded: true },
  { id: 'sadTrombone', emoji: '🎺', name: 'Sad trombone', where: "the Blank's guess misses" },
  { id: 'sinister', emoji: '😈', name: 'Sinister', where: 'The outsiders take the game' },
  { id: 'levelUp', emoji: '⬆️', name: 'Level up', where: 'Insiders win; a player cracks the pattern' },
  { id: 'yeet', emoji: '🚀', name: 'Yeet', where: 'A new game kicking off' },
  { id: 'coin', emoji: '🪙', name: 'Coin', where: 'An item is allowed aboard; a hint is spent' },
  { id: 'bonk', emoji: '🔨', name: 'Bonk', where: 'An item is turned away' },
  { id: 'buzzer', emoji: '🚫', name: 'Buzzer', where: 'A wrong pattern guess', recorded: true },
  { id: 'emotionalDamage', emoji: '🩹', name: 'Emotional damage', where: 'Three wrong guesses and you are out' },
  { id: 'cheer', emoji: '🎉', name: 'Crowd cheer', where: 'The 🔥 reaction', recorded: true },
  { id: 'cardShuffle', emoji: '🃏', name: 'Riffle shuffle', where: 'The deck shuffling at the start of any card deal' },
  { id: 'cardFlick', emoji: '✉️', name: 'Card flick', where: 'Each card leaving the deck during the deal' },
  { id: 'cardSlap', emoji: '👋', name: 'Card landing', where: 'A card landing on the felt, or being played to the pile' },
  { id: 'cardTurn', emoji: '🔄', name: 'Card turning over', where: 'Turning your own card face up, and peeking at it again' },
  { id: 'serious', emoji: '🕯️', name: 'Serious swell', where: 'After the shuffle: the laugh cuts out and the round begins' },
  { id: 'heartbeat', emoji: '🫀', name: 'Heartbeat', where: 'A card game moment you cannot take back' },
  { id: 'nightfall', emoji: '🌙', name: 'Nightfall', where: 'Sleepless: the room goes dark for the night' },
  { id: 'winInsiders', emoji: '🏆', name: 'Insiders win', where: 'Blend In: the insiders take the game', recorded: true },
  { id: 'winOutsiders', emoji: '🎭', name: 'Outsiders win', where: 'Blend In: the outsiders take the game', recorded: true },
  { id: 'dhol', emoji: '🪘', name: 'Dhol', where: 'Big wins and the 🔥 reaction (indian pack)', recorded: true },
  { id: 'wow', emoji: '😮', name: 'Crowd wow', where: 'Island solves; the 😮-adjacent pools', recorded: true },
  { id: 'fail', emoji: '🪈', name: 'Slide-whistle fail', where: 'Knocked out of Island Rules; 💀 pool', recorded: true },
  { id: 'dun', emoji: '🎻', name: 'Dun dun dunnn', where: 'Sentinel blocks; suspicion pools', recorded: true },
  { id: 'evilLaugh', emoji: '😈', name: 'Evil laugh', where: 'Prowler win; 🧐 and 💀 pools', recorded: true },
  { id: 'ding', emoji: '🔔', name: 'Correct ding', where: 'Island: an item fits; 🔥 pool', recorded: true },
  { id: 'aww', emoji: '🥺', name: 'Crowd aww', where: 'Sleepless: a night everyone survives', recorded: true },
  { id: 'kaching', emoji: '💰', name: 'Ka-ching', where: 'Points landing; the 🔥 pool', recorded: true },
  { id: 'clang', emoji: '🛡', name: 'Shield clang', where: 'Swap or Stay: a Sentinel blocks a swap', recorded: true },
  { id: 'bellToll', emoji: '🔔', name: 'Bell toll', where: 'Sleepless: someone did not wake up', recorded: true },
  { id: 'rooster', emoji: '🐓', name: 'Rooster crow', where: 'Sleepless: a morning everyone survived', recorded: true },
];

// Which sound each reaction fires. Keep these in step with REACTIONS on the server.
// Each reaction draws from a pool, and every id in a pool may itself have several
// recorded variants, so the same emoji rarely sounds the same twice.
// Ids whose recordings live in media/sfx/indian/ — the desi flavour pack. Kept as one
// list so it can be extended or swapped for a global pack without touching game code.
export const INDIAN_SFX = ['dhol'];

// Recording-only ids fall back to the nearest synth until their file has decoded.
const SYNTH_FALLBACK = {
  dhol: 'drumroll',
  winInsiders: 'levelUp', winOutsiders: 'sinister',
  wow: 'gasp', fail: 'buzzer', dun: 'suspense', evilLaugh: 'sinister',
  ding: 'levelUp', aww: 'crickets', kaching: 'coin',
  clang: 'buzzer', bellToll: 'boo', rooster: 'levelUp',
  // Ids that ship as recordings only: without these they would be silent whenever the
  // clip has not been fetched yet.
  laughTrack: 'cheer', sadTrombone: 'boo',
  boom: 'emotionalDamage',
};

export const REACTION_SOUNDS = {
  '😂': ['rxLaugh'],
  '🤔': ['rxThink'],
  '😱': ['rxShock'],
  '🧐': ['rxDoubt'],
  '🔥': ['rxFire'],
  '💀': ['rxDead'],
  '😭': ['rxCry'],
};

// The pool is weighted by repetition (the signature sound appears more than once), so
// picking uniformly still favours it while leaving room for a surprise.
// With a seed, every phone at the table resolves the same emoji to the same sound: the
// server rolls once per reaction and everyone hears one joke, not six different ones.
export function reactionSound(emoji, seed = null) {
  const pool = REACTION_SOUNDS[emoji];
  if (!Array.isArray(pool)) return pool || 'pop';
  const i = seed == null ? (Math.random() * pool.length) | 0 : Math.abs(seed) % pool.length;
  return pool[i];
}

// ---------------------------------------------------------------------------
// Real recordings, when there are any
// ---------------------------------------------------------------------------
// Every sound above is synthesized, which keeps the app free of licensing problems and
// adds nothing to the download. Drop an audio file named after a sound into
// public/media/sfx/ (boom.mp3, laughTrack.mp3, rxLaugh-3.mp3 …) and it is used instead.
// Files are fetched once, decoded, then cached; if anything fails the synth still plays,
// so a missing or broken file never leaves a silent gap in a game.
const samples = new Map();      // id -> [AudioBuffer, ...] decoded variants
let sampleIndex = null;         // id -> [url, ...] every variant the server has

export async function loadSampleIndex() {
  try {
    const res = await fetch('/api/sfx');
    const { files } = await res.json();
    const byId = new Map();
    for (const f of files) {
      if (!byId.has(f.id)) byId.set(f.id, []);
      byId.get(f.id).push(f.src);
    }
    sampleIndex = byId;
    // A frozen copy, sorted, for seeded playback: the lazy loader consumes sampleIndex as
    // it goes, and a seed can only mean the same file on every phone if the list it
    // indexes into never changes.
    fullIndex = new Map([...byId].map(([id, urls]) => [id, [...urls].sort()]));
  } catch {
    sampleIndex = new Map();
    fullIndex = new Map();
  }
}
let fullIndex = new Map();
const decodedByUrl = new Map();

function fetchDecode(url) {
  return fetch(url)
    .then((r) => r.arrayBuffer())
    .then((buf) => ready()?.decodeAudioData(buf))
    .then((decoded) => { if (decoded) decodedByUrl.set(url, decoded); return decoded; })
    .catch(() => null);
}

// Seeded playback: same seed, same file, on every phone in the room. Returns a stopper.
export function playMemeSeeded(name, seed) {
  const urls = fullIndex.get(name);
  if (!urls?.length) return playMeme(name);
  const url = urls[Math.abs(seed) % urls.length];
  const buf = decodedByUrl.get(url);
  if (buf) return playSample(buf) || (() => {});
  // Not decoded yet: fetch it and play the moment it lands, so the room still hears the
  // same clip rather than a silent first reaction. A stop asked for meanwhile is honoured.
  let stop = null;
  let cancelled = false;
  fetchDecode(url).then((decoded) => {
    if (cancelled || !decoded) return;
    stop = playSample(decoded);
  });
  const fn = memes[name];
  if (fn) fn();
  return (fade) => { cancelled = true; stop?.(fade); };
}

// One reaction at a time: a new reaction cuts the previous one short instead of being
// swallowed because something else was still playing. The table hears every joke land.
let reactionStop = null;
let reactionTimer = 0;
// Long enough for a proper laugh, short enough that a stray thirty-second clip does not
// hold the table hostage.
const REACTION_MAX_MS = 6000;
export function playReaction(emoji, seed = null) {
  reactionStop?.(0.06);
  clearTimeout(reactionTimer);
  const name = reactionSound(emoji, seed);
  const stop = seed == null ? playMeme(name) : playMemeSeeded(name, seed);
  reactionStop = stop;
  reactionTimer = setTimeout(() => { if (reactionStop === stop) stop?.(0.25); }, REACTION_MAX_MS);
}

// Returns a function that cuts the sound short, because a sample that has already
// started can only be stopped by whoever still holds its nodes. The card table needs
// this: the laugh has to stop dead when the shuffle ends.
// Recordings arrive at wildly different levels. Measuring the loudest moment once and
// scaling to a common target keeps a laugh track and a braam at the same distance
// from the listener, and stops quiet clips from vanishing under the room.
const PEAK_TARGET = 0.72;
const gains = new WeakMap();
function sampleGain(buffer) {
  const cached = gains.get(buffer);
  if (cached != null) return cached;
  let peak = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    // Every 32nd frame is plenty to find the peak and keeps long clips cheap.
    for (let i = 0; i < data.length; i += 32) {
      const v = data[i] < 0 ? -data[i] : data[i];
      if (v > peak) peak = v;
    }
  }
  const gain = peak > 0.02 ? Math.min(4, PEAK_TARGET / peak) : 1;
  gains.set(buffer, gain);
  return gain;
}

function playSample(buffer) {
  const ctx = ready(); if (!ctx) return null;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const g = ctx.createGain();
  g.gain.value = sampleGain(buffer);
  src.connect(g).connect(bus(ctx, 1));
  src.start();
  return (fade = 0.05) => {
    try {
      const now = ctx.currentTime;
      g.gain.cancelScheduledValues(now);
      g.gain.setValueAtTime(Math.max(g.gain.value, 0.0001), now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + fade);
      src.stop(now + fade + 0.02);
    } catch { /* already ended */ }
  };
}

const randomOf = (arr) => arr[(Math.random() * arr.length) | 0];

// Fetch and decode one variant, then remember it. Called lazily so a sound costs nothing
// until it actually plays, and the pool fills out over a session.
function loadVariant(name, url) {
  return fetch(url)
    .then((r) => r.arrayBuffer())
    .then((buf) => ready()?.decodeAudioData(buf))
    .then((decoded) => {
      if (!decoded) return;
      if (!samples.has(name)) samples.set(name, []);
      samples.get(name).push(decoded);
    })
    .catch(() => { /* the synth stays as the fallback */ });
}

// Returns a stopper so a caller can cut the sound short mid-play. A synthesized sound
// cannot be stopped, so the stopper is a no-op in that case; callers that care about
// stopping are all playing recordings.
export function playMeme(name) {
  const noop = () => {};
  const synth = () => { const fn = memes[name] || memes[SYNTH_FALLBACK[name]]; if (fn) fn(); return noop; };
  const decoded = samples.get(name);
  const pending = sampleIndex?.get(name);

  // Reach for a variant that is not loaded yet roughly half the time, so the pool keeps
  // widening instead of settling on whichever one arrived first.
  if (decoded?.length && (!pending?.length || Math.random() > 0.5)) {
    const stop = playSample(randomOf(decoded));
    if (pending?.length) {
      const url = randomOf(pending);
      pending.splice(pending.indexOf(url), 1);
      loadVariant(name, url);
    }
    return stop || noop;
  }

  if (!pending?.length) return synth();

  // Nothing decoded yet: play the synth so the moment is not silent, and fetch a variant
  // for next time.
  const stop = decoded?.length ? playSample(randomOf(decoded)) : synth();
  const url = randomOf(pending);
  pending.splice(pending.indexOf(url), 1);
  loadVariant(name, url);
  return stop || noop;
}
