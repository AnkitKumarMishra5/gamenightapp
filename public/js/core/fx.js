// Confetti (canvas) and synthesized UI sounds (WebAudio, no assets needed).

// ---------- confetti ----------
const canvas = document.getElementById('fx-canvas');
const ctx = canvas.getContext('2d');
let particles = [];
let rafId = null;

function fitCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = innerWidth * dpr;
  canvas.height = innerHeight * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener('resize', fitCanvas);
fitCanvas();

const COLORS = ['#8b5cf6', '#22d3ee', '#f472b6', '#fbbf24', '#34d399', '#f87171', '#ffffff'];

export function confettiBurst({ count = 140, origin = null, spread = 1 } = {}) {
  const ox = origin?.x ?? innerWidth / 2;
  const oy = origin?.y ?? innerHeight * 0.35;
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (4 + Math.random() * 9) * spread;
    particles.push({
      x: ox, y: oy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 6,
      w: 5 + Math.random() * 6,
      hgt: 3 + Math.random() * 5,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      rot: Math.random() * Math.PI,
      vr: (Math.random() - 0.5) * 0.3,
      life: 90 + Math.random() * 60,
      shape: Math.random() < 0.25 ? 'circle' : 'rect',
    });
  }
  if (!rafId) tick();
}

export function confettiRain(ms = 2200) {
  const end = Date.now() + ms;
  const drop = () => {
    for (let i = 0; i < 6; i++) {
      particles.push({
        x: Math.random() * innerWidth, y: -12,
        vx: (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 3,
        w: 5 + Math.random() * 6, hgt: 3 + Math.random() * 5,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.25,
        life: 220, shape: Math.random() < 0.25 ? 'circle' : 'rect',
      });
    }
    if (Date.now() < end) setTimeout(drop, 60);
  };
  drop();
  if (!rafId) tick();
}

function tick() {
  rafId = requestAnimationFrame(tick);
  ctx.clearRect(0, 0, innerWidth, innerHeight);
  particles = particles.filter((p) => p.life > 0 && p.y < innerHeight + 30);
  if (particles.length === 0) {
    cancelAnimationFrame(rafId);
    rafId = null;
    return;
  }
  for (const p of particles) {
    p.life -= 1;
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.22;
    p.vx *= 0.985;
    p.rot += p.vr;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.min(1, p.life / 40);
    ctx.fillStyle = p.color;
    if (p.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, p.w / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillRect(-p.w / 2, -p.hgt / 2, p.w, p.hgt);
    }
    ctx.restore();
  }
}

// ---------- sounds ----------
let audioCtx = null;
// Shared with the ambience engine: one "sound on/off" preference for the whole app.
let muted = localStorage.getItem('gn_sound') === '0';

function ac() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

// Shared with the ambience engine so both live in a single AudioContext.
export function getAudioContext() {
  return ac();
}

export function isMuted() { return muted; }
export function setMuted(v) {
  muted = v;
  localStorage.setItem('gn_sound', v ? '0' : '1');
}

// Re-read the shared preference (the sound button writes it via the ambience module).
export function refreshMuted() {
  muted = localStorage.getItem('gn_sound') === '0';
  return muted;
}

function tone({ freq = 440, dur = 0.12, type = 'sine', gain = 0.16, when = 0, glide = null }) {
  if (muted) return;
  try {
    const context = ac();
    const t0 = context.currentTime + when;
    const osc = context.createOscillator();
    const g = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (glide) osc.frequency.exponentialRampToValueAtTime(glide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(context.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  } catch { /* audio blocked */ }
}

// The small interface sounds. Anything with personality lives in memes.js; these are the
// quiet ones that acknowledge a tap or a turn without demanding attention.
export const sound = {
  tap: () => tone({ freq: 660, dur: 0.06, type: 'triangle', gain: 0.1 }),
  pop: () => tone({ freq: 520, dur: 0.09, type: 'triangle', gain: 0.14, glide: 780 }),
  tick: () => tone({ freq: 880, dur: 0.05, type: 'square', gain: 0.05 }),
  woosh: () => tone({ freq: 220, dur: 0.3, type: 'sine', gain: 0.1, glide: 880 }),
};
