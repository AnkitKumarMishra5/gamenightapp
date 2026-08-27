// Game Night — © 2026 Ankit Kumar Mishra. All rights reserved. See LICENSE.
// Living backdrop: drifting fog, floating bokeh orbs and rising motes, drawn on a
// canvas behind the page.
//
// Why not a GIF/video? A 1080p loop is megabytes and GIF's 256-colour palette bands
// badly on dark navy gradients. This is ~4KB, never repeats, scales to any viewport,
// and costs a fraction of a frame. Photos or footage from source-assets/ layer on top of
// it (main.js) rather than replacing it, so the motion continues behind them.
const COLORS = [
  [139, 92, 246],   // violet
  [99, 102, 241],   // indigo
  [34, 211, 238],   // cyan
  [244, 114, 182],  // pink
];

let canvas = null;
let ctx = null;
let raf = null;
let orbs = [];
let motes = [];
let fog = [];
let w = 0;
let h = 0;
let dpr = 1;
let pointer = { x: 0, y: 0, tx: 0, ty: 0 };
let last = 0;
let t = 0;
let disabled = false;

const rand = (a, b) => a + Math.random() * (b - a);

export function startBackdrop(host) {
  if (disabled || canvas) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { disabled = true; return; }
  // Leave very low-powered devices alone — the CSS gradient already looks fine.
  if ((navigator.hardwareConcurrency || 4) <= 2 || navigator.connection?.saveData) {
    disabled = true;
    return;
  }

  canvas = document.createElement('canvas');
  canvas.className = 'bg-canvas';
  ctx = canvas.getContext('2d', { alpha: true });
  host.prepend(canvas);

  resize();
  addEventListener('resize', resize, { passive: true });
  addEventListener('pointermove', onPointer, { passive: true });
  document.addEventListener('visibilitychange', onVisibility);

  last = performance.now();
  raf = requestAnimationFrame(frame);
}

function onVisibility() {
  if (document.hidden) {
    if (raf) cancelAnimationFrame(raf);
    raf = null;
  } else if (canvas && !raf) {
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
}

function onPointer(e) {
  // Normalised to [-1, 1]; layers lag behind it by different amounts for depth.
  pointer.tx = (e.clientX / innerWidth - 0.5) * 2;
  pointer.ty = (e.clientY / innerHeight - 0.5) * 2;
}

function resize() {
  if (!canvas) return;
  dpr = Math.min(devicePixelRatio || 1, 1.5); // the art is soft; full retina is wasted
  w = innerWidth;
  h = innerHeight;
  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  seed();
}

function seed() {
  const area = Math.sqrt(w * h) / 900;

  // Bokeh orbs: big, soft, slow. Depth drives size, speed and parallax together.
  const orbCount = Math.round(rand(11, 15) * Math.max(0.7, Math.min(area, 1.6)));
  orbs = Array.from({ length: orbCount }, () => {
    const depth = rand(0.25, 1);
    return {
      x: rand(-0.1, 1.1) * w,
      y: rand(-0.1, 1.1) * h,
      r: rand(70, 240) * depth,
      color: COLORS[(Math.random() * COLORS.length) | 0],
      alpha: rand(0.1, 0.24) * depth,
      depth,
      // Lissajous drift: two incommensurate sines, so the path never retraces exactly.
      ax: rand(30, 110), ay: rand(20, 80),
      fx: rand(0.011, 0.03), fy: rand(0.009, 0.026),
      px: rand(0, Math.PI * 2), py: rand(0, Math.PI * 2),
      pulse: rand(0.05, 0.12), pulseSpeed: rand(0.15, 0.4), pulsePhase: rand(0, Math.PI * 2),
    };
  });

  // Fog: a few enormous, barely-visible washes sliding across.
  fog = Array.from({ length: 4 }, (_, i) => ({
    x: rand(0, w), y: rand(0.15, 0.85) * h,
    r: rand(0.5, 0.95) * Math.max(w, h),
    color: COLORS[i % COLORS.length],
    alpha: rand(0.03, 0.062),
    speed: rand(4, 11) * (Math.random() < 0.5 ? -1 : 1),
    bob: rand(14, 46), bobSpeed: rand(0.05, 0.13), bobPhase: rand(0, Math.PI * 2),
  }));

  // Motes: tiny specks rising, twinkling, wrapping at the top.
  const moteCount = Math.round(64 * Math.max(0.6, Math.min(area, 1.7)));
  motes = Array.from({ length: moteCount }, () => ({
    x: Math.random() * w,
    y: Math.random() * h,
    r: rand(0.7, 2.4),
    speed: rand(5, 20),
    sway: rand(6, 26), swaySpeed: rand(0.25, 0.8), swayPhase: rand(0, Math.PI * 2),
    alpha: rand(0.28, 0.8),
    twinkle: rand(0.5, 1.6), twinklePhase: rand(0, Math.PI * 2),
  }));
}

let streak = null;
let nextStreak = 4;

function updateStreak(dt) {
  if (!streak) {
    nextStreak -= dt;
    if (nextStreak > 0) return;
    const fromLeft = Math.random() < 0.5;
    streak = {
      x: fromLeft ? -120 : w + 120,
      y: rand(0.1, 0.85) * h,
      vx: (fromLeft ? 1 : -1) * rand(55, 110),
      len: rand(90, 200),
      life: 1,
      color: COLORS[(Math.random() * COLORS.length) | 0],
    };
    nextStreak = rand(9, 20);
    return;
  }
  streak.x += streak.vx * dt;
  streak.life -= dt * 0.22;
  if (streak.life <= 0 || streak.x < -300 || streak.x > w + 300) streak = null;
}

function paintStreak() {
  if (!streak) return;
  const { x, y, len, color, life, vx } = streak;
  const dir = Math.sign(vx);
  const g = ctx.createLinearGradient(x - dir * len, y, x, y);
  const [r, gg, b] = color;
  g.addColorStop(0, `rgba(${r}, ${gg}, ${b}, 0)`);
  g.addColorStop(1, `rgba(${r}, ${gg}, ${b}, ${0.3 * Math.max(life, 0)})`);
  ctx.globalAlpha = 1;
  ctx.strokeStyle = g;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(x - dir * len, y);
  ctx.lineTo(x, y);
  ctx.stroke();
}

function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 0.05);
  // ~34fps is plenty for something this soft, and halves the GPU cost.
  if (dt < 0.028) return;
  last = now;
  t += dt;

  // Ease the pointer so motion stays silky even with jumpy input.
  pointer.x += (pointer.tx - pointer.x) * Math.min(dt * 2.4, 1);
  pointer.y += (pointer.ty - pointer.y) * Math.min(dt * 2.4, 1);

  ctx.clearRect(0, 0, w, h);
  ctx.globalCompositeOperation = 'lighter';

  for (const f of fog) {
    f.x += f.speed * dt;
    if (f.x - f.r > w) f.x = -f.r;
    if (f.x + f.r < 0) f.x = w + f.r;
    const y = f.y + Math.sin(t * f.bobSpeed + f.bobPhase) * f.bob;
    paintBlob(f.x - pointer.x * 26, y - pointer.y * 16, f.r, f.color, f.alpha);
  }

  for (const o of orbs) {
    const x = o.x + Math.sin(t * o.fx * Math.PI * 2 + o.px) * o.ax - pointer.x * 46 * o.depth;
    const y = o.y + Math.cos(t * o.fy * Math.PI * 2 + o.py) * o.ay - pointer.y * 34 * o.depth;
    const r = o.r * (1 + Math.sin(t * o.pulseSpeed + o.pulsePhase) * o.pulse);
    paintBlob(x, y, r, o.color, o.alpha);
  }

  for (const m of motes) {
    m.y -= m.speed * dt;
    if (m.y < -6) { m.y = h + 6; m.x = Math.random() * w; }
    const x = m.x + Math.sin(t * m.swaySpeed + m.swayPhase) * m.sway - pointer.x * 12;
    const a = m.alpha * (0.55 + 0.45 * Math.sin(t * m.twinkle + m.twinklePhase));
    ctx.globalAlpha = Math.max(a, 0);
    ctx.fillStyle = '#dfe4ff';
    ctx.beginPath();
    ctx.arc(x, m.y, m.r, 0, Math.PI * 2);
    ctx.fill();
  }

  updateStreak(dt);
  paintStreak();

  // Vignette in normal blend mode: darkens the centre so headlines stay readable.
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  const vignette = ctx.createRadialGradient(w / 2, h * 0.42, 0, w / 2, h * 0.42, Math.max(w, h) * 0.75);
  vignette.addColorStop(0, 'rgba(11, 14, 26, 0.34)');
  vignette.addColorStop(0.55, 'rgba(11, 14, 26, 0.12)');
  vignette.addColorStop(1, 'rgba(11, 14, 26, 0)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, w, h);
}

function paintBlob(x, y, r, [red, green, blue], alpha) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${red}, ${green}, ${blue}, ${alpha})`);
  g.addColorStop(0.45, `rgba(${red}, ${green}, ${blue}, ${alpha * 0.45})`);
  g.addColorStop(1, `rgba(${red}, ${green}, ${blue}, 0)`);
  ctx.globalAlpha = 1;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
}
