// Game Night — © 2026 Ankit Kumar Mishra. All rights reserved. See LICENSE.
// Server: Express static hosting + Socket.IO realtime game protocol.
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Server } from 'socket.io';

// Minimal .env loader (no dependency): real environment variables win.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const { rooms, createRoom, getRoom, addPlayer, removePlayer, transferHost, sweepRooms, closeRoomIfEmpty, snapshot, adminOverview, invitePreview, gameIsStalled, claimHostIfAbandoned } = await import('./core/rooms.js');
const blendin = await import('./games/blendin/engine.js');
const island = await import('./games/island/engine.js');
const islandAI = await import('./games/island/ai.js');
const blendinAI = await import('./games/blendin/ai.js');
const silentorder = await import('./games/silentorder/engine.js');
const swaporstay = await import('./games/swaporstay/engine.js');
const sleepless = await import('./games/sleepless/engine.js');
const { aiAvailable, aiStatus } = await import('./lib/openai.js');
const { GameError, cleanText } = await import('./lib/util.js');
const analytics = await import('./core/analytics.js');
const { statsPage } = await import('./core/dashboard.js');

// A host that assigns the port sets PORT. An empty or junk value falls back rather than
// crashing, which is what lets `npm start` work with no configuration at all.
const PORT = Number(process.env.PORT) || 3456;
const HOST_GRACE_MS = 45_000;
const AI_COOLDOWN_MS = 1_200;
// Generous enough that fast, legitimate play never trips it; tight enough that a script
// cannot flood a room. Counted per socket over a sliding window.
const RATE_WINDOW_MS = 10_000;
const RATE_MAX_EVENTS = 120;

const app = express();

// Behind Render/Fly/Cloudflare, so req.secure and the client IP come from the proxy.
app.set('trust proxy', 1);
app.disable('x-powered-by');

// ---------- security headers ----------
// The app has no inline scripts of its own, so script-src can stay strict. Inline style
// *attributes* are unavoidable (the h() helper sets element.style), and those are covered
// by style-src-attr rather than script-src, so nothing has to be loosened for them.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "media-src 'self'",
  "connect-src 'self' ws: wss:",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join('; ');

app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  // Also stops the dashboard's ?token= leaking to anywhere a page might link out to.
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
  if (req.secure || req.headers['x-forwarded-proto'] === 'https') {
    res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  }
  // The dashboard is one self-contained page with its own inline script and styles, so it
  // gets a nonce instead of a blanket 'unsafe-inline'.
  if (req.path.startsWith('/admin')) {
    res.locals.nonce = crypto.randomBytes(16).toString('base64');
    // Scripts are locked to the nonce, which is what stops an injected <script> from
    // running. Styles stay inline-permissive because the bar widths are style attributes
    // and a nonce cannot cover those; CSS cannot execute code, and every value on the
    // page is either a server-computed number or HTML-escaped.
    res.setHeader('Content-Security-Policy',
      `default-src 'self'; script-src 'nonce-${res.locals.nonce}'; style-src 'unsafe-inline'; `
      + "img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
    res.setHeader('Cache-Control', 'no-store, max-age=0');
  } else {
    res.setHeader('Content-Security-Policy', CSP);
  }
  next();
});

// Link-preview crawlers need absolute URLs and do not run JavaScript, so the shell is
// served with %ORIGIN% substituted for whatever host the request came in on
// (PUBLIC_URL pins it behind a proxy/CDN).
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const indexTemplate = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');

function originFor(req) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol).split(',')[0];
  const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
  return `${proto}://${host}`;
}

// Three link cards for a plain domain share, rotated daily so a feed full of shares does
// not look like wallpaper. Crawlers cache per URL, so within a day everyone sees one card.
const HOME_OG = [
  { image: '/icons/og-home-1.jpg', title: 'Game Night: deal your friends in',
    desc: 'Five party games, one five-letter code. Bluff in Blend In, crack Island Rules, keep your nerve at the card table. Free, in the browser.' },
  { image: '/icons/og-home-2.jpg', title: 'Game Night: no downloads, no excuses',
    desc: 'Every phone becomes a seat at the table. 2 to 16 friends, live, with sound and cards and arguments. Nothing to install.' },
  { image: '/icons/og-home-3.jpg', title: 'Game Night: your table is ready',
    desc: 'Social deduction, secret patterns and three card games on one premium table. Make a room, share the code, play tonight.' },
  { image: '/icons/og-home-4.jpg', title: 'Game Night: bluff, deduce, survive',
    desc: 'Five games where the fun is reading your friends. One room code, points that follow you all night, nothing to install.' },
  { image: '/icons/og-home-5.jpg', title: 'Game Night: five games, one code',
    desc: 'Somebody is lying, a pattern needs cracking, and the lowest card loses a heart. All from the phones already in the room.' },
  { image: '/icons/og-home-6.jpg', title: 'Game Night: wake the group chat up',
    desc: 'Turn "we should hang out" into an actual game night. Make a room, drop the code in the chat, and watch everyone show up.' },
  { image: '/icons/og-home-1.jpg', title: 'Game Night: the table is set',
    desc: 'Cards, candles and accusations. Five live party games for 2 to 16 friends, free in the browser, ready in ten seconds.' },
  { image: '/icons/og-home-3.jpg', title: 'Game Night: bring snacks, bring suspicion',
    desc: 'One room code turns every phone into a seat. Bluff your best friend, crack the pattern, survive the deck.' },
  { image: '/icons/og-home-2.jpg', title: 'Game Night: tonight, at your place',
    desc: "No downloads, no accounts, no excuses. Five party games that run on the phones already in everyone's pockets." },
  { image: '/icons/og-home-5.jpg', title: 'Game Night: reading friends since tonight',
    desc: 'The games are simple. Your friends are not. One five-letter code and the whole room is playing.' },
];
const dayIndex = () => Math.floor(Date.now() / 86_400_000);
const DEFAULT_OG = () => ({ ...HOME_OG[dayIndex() % HOME_OG.length] });

// Invite cards get variety per ROOM (unique URL per code, so crawlers cache each one
// separately): the line, the image and the roster all come from the room itself.
const INVITE_LINES = [
  (n, a) => `${a} ${n} dealt you a seat`,
  (n, a) => `${a} ${n} saved you a chair`,
  (n, a) => `${a} ${n} says the table is short one player: you`,
  (n, a) => `${a} ${n} lit the candles. Get in here`,
  (n, a) => `${a} ${n} is waiting for you at the table`,
  (n, a) => `${a} ${n} picked you. Out of everyone`,
  (n, a) => `${a} ${n} is shuffling. Sit down before the deal`,
  (n, a) => `${a} ${n} left the porch light on for you`,
  (n, a) => `${a} ${n} wrote your name on a chair`,
  (n, a) => `${a} ${n} refuses to start without you`,
  (n, a) => `${a} ${n} bet you would show up. Prove them right`,
  (n, a) => `${a} ${n} needs somebody they can actually beat`,
  (n, a) => `${a} ${n} says this is your sign`,
  (n, a) => `${a} ${n} is stalling the whole table for you`,
  (n, a) => `${a} ${n} put game night on the calendar: now`,
];
const INVITE_IMAGES = [
  '/icons/og-invite-1.jpg', '/icons/og-invite-2.jpg', '/icons/og-invite-3.jpg',
  '/icons/og-invite-4.jpg', '/icons/og-invite-5.jpg', '/icons/og-invite-6.jpg',
  '/icons/og-invite-7.jpg', '/icons/og-invite-8.jpg', '/icons/og-invite-9.jpg',
  '/icons/og-invite-10.jpg',
];
// One teasing line per game, so the card sells what is actually on the table tonight.
const GAME_HOOK = {
  blendin: 'Somebody at that table is lying to everyone.',
  island: 'There is a secret pattern nobody has cracked yet.',
  silentorder: 'One wrong card burns a candle.',
  swaporstay: 'Lowest card loses a heart. No pressure.',
  sleepless: 'The Prowler walks tonight.',
};
const INVITE_TAILS = [
  'No download, no sign-up, just the code.',
  'Nothing to install, the code is the whole key.',
  'Free, in the browser, ready in ten seconds.',
  'Your phone is the ticket. This link is the door.',
  'No app store between you and the table.',
];
const codeHash = (code) => [...code].reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 7) >>> 0;

// Escaping matters here: these strings land inside an HTML attribute, and the host name is
// whatever a player typed.
const attr = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const GAME_LABEL = {
  blendin: 'Blend In', island: 'Island Rules',
  silentorder: 'Silent Order', swaporstay: 'Swap or Stay', sleepless: 'Sleepless',
};

// A shared invite deserves its own preview. Rather than trusting a name in the URL, the
// server looks the room up by its code: no personal data in the link, nothing to escape
// from a query string, and the numbers are live at the moment the link is unfurled.
function ogFor(req) {
  const code = String(req.query.join || '').toUpperCase().trim();
  if (!/^[A-Z0-9]{5}$/.test(code)) return DEFAULT_OG();
  const room = invitePreview(code);
  // An expired or mistyped code falls back to the normal card rather than advertising a
  // room that is not there.
  if (!room) return DEFAULT_OG();

  const h = codeHash(code);
  const name = room.hostName || 'A friend';
  const game = GAME_LABEL[room.game];
  // Who is already at the table, by first name, so the invite feels like walking into a
  // room of people rather than clicking a link. Capped to keep the card tidy.
  const others = (room.playerNames || []).filter((n) => n !== name).slice(0, 3);
  const extra = Math.max(0, room.players - 1 - others.length);
  const crowd = others.length
    ? `At the table already: ${others.join(', ')}${extra ? ` +${extra}` : ''}.`
    : `${name} is setting the table in room ${room.code}.`;

  // Independent hash shifts so the line, the art, the hook and the tail all rotate on
  // their own axes: neighbouring room codes land on genuinely different cards.
  const hook = room.game && GAME_HOOK[room.game] ? ` ${GAME_HOOK[room.game]}` : '';
  return {
    image: INVITE_IMAGES[h % INVITE_IMAGES.length],
    title: INVITE_LINES[(h >>> 3) % INVITE_LINES.length](name, room.hostAvatar || '🎭'),
    desc: `${crowd}${game ? ` Tonight: ${game}.` : ''}${hook} ${INVITE_TAILS[(h >>> 7) % INVITE_TAILS.length]}`,
  };
}

// Dev-only scenario browser: every dramatic screen rendered from a fixed snapshot, so a
// reveal can be looked at without playing a whole game to reach it. Never mounted in
// production, and it lives in tools/ rather than public/ so it cannot ship by accident.
if (process.env.NODE_ENV !== 'production') {
  const DEV_DIR = path.join(__dirname, '..', 'tools', 'dev');
  app.get('/dev/scenarios', (_req, res) => res.sendFile(path.join(DEV_DIR, 'scenarios.html')));
  app.get('/dev/scenarios.js', (_req, res) => res.type('application/javascript')
    .sendFile(path.join(DEV_DIR, 'scenarios.js')));
}

app.get(['/', '/index.html'], (req, res) => {
  // No visit is logged here on purpose. The page reports itself a moment later via
  // /api/hello, carrying the browser id that makes one person one row instead of two.
  const og = ogFor(req);
  res.type('html').send(indexTemplate
    .replaceAll('%ORIGIN%', originFor(req))
    .replaceAll('%OG_IMAGE%', attr(og.image || '/icons/og-home-1.jpg'))
    .replaceAll('%OG_TITLE%', attr(og.title))
    .replaceAll('%OG_DESC%', attr(og.desc)));
});

// Same substitution, because a crawler needs the real host in both of these too.
const robotsTemplate = fs.readFileSync(path.join(PUBLIC_DIR, 'robots.txt'), 'utf8');
const sitemapTemplate = fs.readFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), 'utf8');
app.get('/robots.txt', (req, res) => res.type('text/plain')
  .send(robotsTemplate.replaceAll('%ORIGIN%', originFor(req))));
app.get('/sitemap.xml', (req, res) => res.type('application/xml')
  .send(sitemapTemplate.replaceAll('%ORIGIN%', originFor(req))));

// The browser knows things the request headers do not (screen size, timezone, whether it
// was launched from the home screen). Tiny body, no personal data.
app.post('/api/hello', express.json({ limit: '2kb' }), (req, res) => {
  // recordVisit clamps and type-checks every field, so the whole body can go through.
  analytics.recordVisit(req, req.body || {});
  res.json({ ok: true });
});

// Sent by sendBeacon when a tab closes, so a session has a length.
app.post('/api/bye', express.json({ limit: '1kb', type: () => true }), (req, res) => {
  analytics.recordDeparture(req, req.body || {});
  res.status(204).end();
});

// Usage dashboard. Protected by ADMIN_TOKEN; without one set it is only reachable from
// localhost, so a deployed instance is never accidentally public.
function adminAllowed(req) {
  const token = process.env.ADMIN_TOKEN;
  if (token) {
    // Constant-time, so the response time cannot be used to guess the token a byte at a
    // time. Lengths are compared first because timingSafeEqual throws on a mismatch.
    const given = Buffer.from(String(req.query.token || ''));
    const want = Buffer.from(token);
    return given.length === want.length && crypto.timingSafeEqual(given, want);
  }
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '');
  return /127\.0\.0\.1|::1|localhost/.test(ip);
}

// day | week | month | year | all — anything else falls back to the whole history.
const rangeOf = (req) => (analytics.RANGES[req.query.range] ? String(req.query.range) : 'all');

// The dashboard's start-over button. POST so a prefetch can never wipe the log, same
// token gate as everything else under /admin.
app.post('/admin/purge', (req, res) => {
  if (!adminAllowed(req)) return res.status(404).end();
  analytics.purgeAll()
    .then(() => res.json({ ok: true }))
    .catch(() => res.status(500).json({ ok: false }));
});

app.get('/admin/stats.json', (req, res) => {
  if (!adminAllowed(req)) return res.status(404).end();
  res.json({
    ...analytics.summary(rangeOf(req)),
    liveRooms: adminOverview(),
    rooms: rooms.size,
    uptimeSec: Math.round(process.uptime()),
  });
});

app.get('/admin/stats', (req, res) => {
  if (!adminAllowed(req)) return res.status(404).end();
  const range = rangeOf(req);
  res.type('html').send(statsPage(analytics.summary(range), adminOverview(), {
    range,
    token: process.env.ADMIN_TOKEN ? String(req.query.token || '') : '',
    nonce: res.locals.nonce,
  }));
});

app.use(express.static(PUBLIC_DIR));
app.get('/healthz', (_req, res) => res.json({ ok: true, rooms: rooms.size, ai: aiAvailable() }));

// The backdrops the client should rotate through. `npm run backdrop` writes the manifest;
// probing from the browser meant a handful of 404s in everyone's console, and the server
// already knows what is on disk.
function detectBackdrop() {
  const dir = path.join(PUBLIC_DIR, 'media');
  const manifestPath = path.join(dir, 'backdrops.json');
  try {
    const list = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const items = list.filter((item) => item?.src && fs.existsSync(path.join(PUBLIC_DIR, item.src.replace(/^\//, ''))));
    if (items.length) return { items };
  } catch { /* no manifest yet, fall through */ }
  return { items: [] };
}

// Cached, but re-read when a file is dropped in during development.
let backdropCache = detectBackdrop();
if (process.env.NODE_ENV !== 'production') {
  setInterval(() => { backdropCache = detectBackdrop(); }, 10_000);
}
app.get('/api/backdrop', (_req, res) => res.json(backdropCache));

// Optional real recordings that override the synthesized sound effects. Anything named
// after a sound in public/js/core/memes.js is picked up; nothing here is required.
function detectSfx() {
  const dir = path.join(PUBLIC_DIR, 'media', 'sfx');
  try {
    const files = [];
    // One level of subfolders. "laughTrack.m4a" and "laughTrack-3.m4a" are both the
    // laugh: a trailing -N marks a variant. The folder is a provenance label (e.g.
    // indian/), so a whole flavour can be added or removed by moving files, no code.
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const scan = entry.isDirectory()
        ? fs.readdirSync(path.join(dir, entry.name)).map((f) => `${entry.name}/${f}`)
        : [entry.name];
      for (const f of scan) {
        if (!/\.(mp3|m4a|ogg|wav|webm)$/i.test(f)) continue;
        files.push({
          id: path.basename(f, path.extname(f)).replace(/-\d+$/, ''),
          src: `/media/sfx/${f}`,
          pack: f.includes('/') ? f.split('/')[0] : 'core',
        });
      }
    }
    return { files };
  } catch { return { files: [] }; }
}
let sfxCache = detectSfx();
if (process.env.NODE_ENV !== 'production') {
  setInterval(() => { sfxCache = detectSfx(); }, 10_000);
}
app.get('/api/sfx', (_req, res) => res.json(sfxCache));

const server = http.createServer(app);
const io = new Server(server, { serveClient: true });

setInterval(sweepRooms, 30 * 1000);

// ---------- helpers ----------

function broadcast(room) {
  room.lastActivity = Date.now();
  noteFinish(room);
  scheduleSilentOrderAdvance(room);
  for (const player of room.players.values()) {
    if (player.connected && player.socketId) {
      io.to(player.socketId).emit('room:state', snapshot(room, player.id));
    }
  }
}

// A cleared Silent Order level holds on screen so the final card is actually seen on the
// pile, then the next level deals itself. Hooked off broadcast because every path that
// can finish a level (a play, a departure) already broadcasts, and the timer re-checks
// the state so a run that ended or restarted in the meantime is left alone.
function scheduleSilentOrderAdvance(room) {
  if (room.game !== 'silentorder' || room.state?.phase !== 'cleared' || room.soAdvanceTimer) return;
  const state = room.state;
  room.soAdvanceTimer = setTimeout(() => {
    room.soAdvanceTimer = null;
    if (rooms.get(room.code) !== room || room.state !== state) return;
    const result = silentorder.advanceLevel(room);
    if (!result) return;
    broadcast(room);
    emitFx(room, result.fx);
  }, silentorder.LEVEL_CLEAR_MS);
}

// A game reaching its end is the single most useful thing to measure: it turns "somebody
// pressed start" into "somebody actually played". Detected centrally so no engine has to
// remember to report it, and keyed so a replay of the same finished state logs once.
function noteFinish(room) {
  const state = room.state;
  if (!state) { room.finishLogged = null; return; }
  const done = room.game === 'blendin' ? Boolean(state.winner)
    : room.game === 'island' ? state.phase === 'reveal'
    : room.game === 'silentorder' ? Boolean(state.over)
    : room.game === 'swaporstay' ? state.phase === 'gameOver'
    : room.game === 'sleepless' ? state.phase === 'gameOver'
    : false;
  if (!done) return;
  const key = `${room.game}:${state.startedAt || state.round || 0}:${state.winner || 'end'}`;
  if (room.finishLogged === key) return;
  room.finishLogged = key;
  analytics.track('game_finished', {
    game: room.game,
    code: room.code,
    players: room.players.size,
    winner: state.winner || null,
    rounds: state.round || null,
    seconds: state.startedAt ? Math.round((Date.now() - state.startedAt) / 1000) : null,
  });
}

function emitFx(room, fxList) {
  if (!fxList) return;
  for (const fx of fxList) io.to(`room:${room.code}`).emit('fx', fx);
}

// Wrap a handler: resolve the socket's room+player, run, ack, broadcast.
function action(socket, fn) {
  return (payload, cb) => {
    try {
      const ctx = socket.data;
      if (!ctx.roomCode || !ctx.playerId) throw new GameError('You are not in a room.');
      const room = rooms.get(ctx.roomCode);
      if (!room) throw new GameError('This room no longer exists.');
      const result = fn(room, ctx.playerId, payload) || {};
      broadcast(room);
      emitFx(room, result.fx);
      cb?.({ ok: true, ...(result.ack || {}) });
    } catch (err) {
      if (err instanceof GameError) return cb?.({ ok: false, error: err.message });
      console.error('[action error]', err);
      cb?.({ ok: false, error: 'Something went wrong on the server.' });
    }
  };
}

function attachToRoom(socket, room, playerId) {
  const player = room.players.get(playerId);
  // Same identity connecting from a second tab/socket: the new one takes over.
  if (player.socketId && player.socketId !== socket.id) {
    const old = io.sockets.sockets.get(player.socketId);
    if (old) {
      old.data.roomCode = null;
      old.data.playerId = null;
      old.leave(`room:${room.code}`);
      old.emit('room:takenover');
    }
  }
  player.socketId = socket.id;
  player.connected = true;
  // Carried onto the player so the usage dashboard can show the same pseudonym next to
  // them in a live room as it does in the activity log.
  player.person = socket.data.person;
  socket.data.roomCode = room.code;
  socket.data.playerId = playerId;
  socket.join(`room:${room.code}`);
  if (room.hostGraceTimer && room.hostId === playerId) {
    clearTimeout(room.hostGraceTimer);
    room.hostGraceTimer = null;
  }
}

function detachPlayer(room, playerId, { permanent }) {
  const player = room.players.get(playerId);
  if (!player) return { fx: [] };
  const results = [];
  if (permanent) {
    removePlayer(room, playerId);
    if (room.game === 'blendin') results.push(blendin.removePlayerFromGame(room, playerId));
    if (room.game === 'island') results.push(island.removePlayerFromGame(room, playerId));
    if (room.game === 'silentorder') results.push(silentorder.removePlayerFromGame(room, playerId));
    if (room.game === 'swaporstay') results.push(swaporstay.removePlayerFromGame(room, playerId));
    if (room.game === 'sleepless') results.push(sleepless.removePlayerFromGame(room, playerId));
  } else {
    player.connected = false;
    player.socketId = null;
    if (room.game === 'blendin') results.push(blendin.onConnectivityChange(room));
    if (room.game === 'island') results.push(island.onConnectivityChange(room));
    if (room.game === 'silentorder') results.push(silentorder.onConnectivityChange(room));
    if (room.game === 'swaporstay') results.push(swaporstay.onConnectivityChange(room));
    if (room.game === 'sleepless') results.push(sleepless.onConnectivityChange(room));
    if (room.hostId === playerId && !room.hostGraceTimer) {
      // Give a disconnected host a grace window to refresh before passing the crown.
      room.hostGraceTimer = setTimeout(() => {
        room.hostGraceTimer = null;
        const host = room.players.get(room.hostId);
        if (host && !host.connected) {
          transferHost(room);
          broadcast(room);
        }
      }, HOST_GRACE_MS);
    }
  }
  return { fx: results.flatMap((r) => r?.fx || []) };
}

// ---------- async AI judging for The Island ----------

async function judgeIslandAttempt(room, attempt) {
  const state = room.state;
  try {
    const result = attempt.type === 'item'
      ? await islandAI.judgeItem(state.pattern, attempt.text, state.bankEntry)
      : await islandAI.judgePatternGuess(state.pattern, attempt.text);
    // The room may have moved on (host ended round, player left) while we awaited.
    if (room.state !== state || !state.pendingJudge || state.pendingJudge.attemptId !== attempt.id) return;

    // Not a real word — that is a typo, not a turn. Give the turn straight back.
    if (attempt.type === 'item' && result.valid === false) {
      const rejected = island.rejectInvalidItem(room, attempt.id);
      broadcast(room);
      if (rejected) {
        const player = room.players.get(rejected.playerId);
        if (player?.socketId) {
          io.to(player.socketId).emit('fx', {
            kind: 'item-invalid',
            playerId: rejected.playerId,
            message: `“${rejected.text}” isn't one thing the boat can take, name a real item, or use “Guess the pattern”.`,
          });
        }
      }
      return;
    }

    const fx = island.resolveAttempt(room, attempt.id, result);
    broadcast(room);
    emitFx(room, fx.fx);
  } catch (err) {
    console.error('[island ai judge]', err.message);
    if (room.state !== state || state.pendingJudge?.attemptId !== attempt.id) return;
    state.attempts = state.attempts.filter((a) => a.id !== attempt.id);
    state.pendingJudge = null;
    broadcast(room);
    io.to(`room:${room.code}`).emit('fx', { kind: 'ai-error', playerId: attempt.playerId, message: 'The AI judge hiccuped, please try again.' });
  }
}

// Every model call in a room passes through here. The per-action cooldowns stop the
// obvious spam; this is the backstop that bounds the bill when one of them has a hole.
const AI_BUDGET_MAX = 120;             // model calls per room per window
const AI_BUDGET_WINDOW_MS = 60_000;
function spendAiBudget(room, cost = 1) {
  const now = Date.now();
  if (!room.aiBudget || now > room.aiBudget.resetAt) {
    room.aiBudget = { spent: 0, resetAt: now + AI_BUDGET_WINDOW_MS };
  }
  if (room.aiBudget.spent + cost > AI_BUDGET_MAX) {
    throw new GameError('This room has asked the AI a lot in the last minute. Give it a moment.');
  }
  room.aiBudget.spent += cost;
}

function aiCooldown(room, playerId) {
  const now = Date.now();
  room.aiCooldowns ||= new Map();
  if (now < (room.aiCooldowns.get(playerId) || 0)) {
    throw new GameError('Easy there, give the judge a second.');
  }
  room.aiCooldowns.set(playerId, now + AI_COOLDOWN_MS);
}

// ---------- abuse limits ----------

// Returns false when this socket has spent its budget for the current window.
function withinRate(socket) {
  const now = Date.now();
  const bucket = socket.data.rate;
  if (now > bucket.resetAt) {
    bucket.count = 0;
    bucket.resetAt = now + RATE_WINDOW_MS;
  }
  bucket.count += 1;
  if (bucket.count > RATE_MAX_EVENTS) {
    if (!bucket.warned) {
      bucket.warned = true;
      console.warn(`[rate limit] socket ${socket.id} exceeded ${RATE_MAX_EVENTS} events / ${RATE_WINDOW_MS}ms`);
    }
    return false;
  }
  return true;
}

// ---------- socket wiring ----------

io.on('connection', (socket) => {
  // Same pseudonym the page view was logged under, so the dashboard can follow one person
  // from "landed" to "started a game" without ever knowing who they are.
  const { person } = analytics.personId(socket.request, socket.handshake.auth?.vid);
  socket.data = {
    roomCode: null, playerId: null, person,
    rate: { count: 0, resetAt: Date.now() + RATE_WINDOW_MS, warned: false },
  };

  // Applies to every event, including the handlers registered outside action().
  socket.use((_event, next) => {
    if (!withinRate(socket)) return next(new Error('Too many actions, slow down.'));
    next();
  });
  socket.on('error', (err) => {
    if (err?.message) socket.emit('fx', { kind: 'ai-error', message: err.message });
  });

  socket.on('room:create', (payload, cb) => {
    try {
      const room = createRoom({
        name: payload?.name, avatar: payload?.avatar,
        playerId: cleanText(payload?.playerId, 24), token: cleanText(payload?.token, 32),
      });
      analytics.track('room_created', {
        person: socket.data.person,
        name: cleanText(payload?.name, 18),
        code: room.code,
        players: 1,
      });
      attachToRoom(socket, room, room.hostId);
      broadcast(room);
      cb?.({ ok: true, code: room.code });
    } catch (err) {
      cb?.({ ok: false, error: err instanceof GameError ? err.message : 'Could not create the room.' });
    }
  });

  socket.on('room:join', (payload, cb) => {
    try {
      const room = getRoom(payload?.code);
      const playerId = cleanText(payload?.playerId, 24);
      const token = cleanText(payload?.token, 32);
      const existing = room.players.get(playerId);
      if (existing) {
        if (existing.token !== token) throw new GameError('Identity mismatch, refresh and rejoin.');
        if (payload?.name) existing.name = cleanText(payload.name, 18) || existing.name;
      } else {
        addPlayer(room, { name: payload?.name, avatar: payload?.avatar, playerId, token });
      }
      analytics.track(existing ? 'room_rejoined' : 'room_joined', {
        person: socket.data.person,
        name: room.players.get(playerId)?.name || null,
        code: room.code,
        players: room.players.size,
      });
      const tookOver = claimHostIfAbandoned(room, playerId);
      attachToRoom(socket, room, playerId);
      const fx = [];
      if (tookOver) fx.push({ kind: 'host-claimed', playerId });
      if (room.game === 'blendin') fx.push(...(blendin.onConnectivityChange(room)?.fx || []));
      if (room.game === 'island') fx.push(...(island.onConnectivityChange(room)?.fx || []));
      if (room.game === 'silentorder') fx.push(...(silentorder.onConnectivityChange(room)?.fx || []));
      if (room.game === 'swaporstay') fx.push(...(swaporstay.onConnectivityChange(room)?.fx || []));
      if (room.game === 'sleepless') fx.push(...(sleepless.onConnectivityChange(room)?.fx || []));
      broadcast(room);
      emitFx(room, fx);
      cb?.({ ok: true, code: room.code, rejoined: Boolean(existing) });
    } catch (err) {
      cb?.({ ok: false, error: err instanceof GameError ? err.message : 'Could not join the room.' });
    }
  });

  socket.on('room:leave', (payload, cb) => {
    const { roomCode, playerId } = socket.data;
    const room = rooms.get(roomCode);
    socket.data.roomCode = null;
    socket.data.playerId = null;
    if (room && playerId) {
      socket.leave(`room:${room.code}`);
      const result = detachPlayer(room, playerId, { permanent: true });
      if (!closeRoomIfEmpty(room)) {
        broadcast(room);
        emitFx(room, result.fx);
      }
    }
    cb?.({ ok: true });
  });

  socket.on('room:kick', action(socket, (room, playerId, payload) => {
    if (room.hostId !== playerId) throw new GameError('Only the room owner can remove players.');
    const targetId = String(payload?.targetId || '');
    if (targetId === playerId) throw new GameError('You cannot remove yourself.');
    const target = room.players.get(targetId);
    if (!target) throw new GameError('Player not found.');
    if (target.socketId) {
      const ts = io.sockets.sockets.get(target.socketId);
      if (ts) {
        ts.emit('room:kicked');
        ts.leave(`room:${room.code}`);
        ts.data.roomCode = null;
        ts.data.playerId = null;
      }
    }
    const result = detachPlayer(room, targetId, { permanent: true });
    closeRoomIfEmpty(room);
    return result;
  }));

  socket.on('room:setGame', action(socket, (room, playerId, payload) => {
    if (room.hostId !== playerId) throw new GameError('Only the room owner picks the game.');
    const finished = !room.state
      || (room.state.kind === 'blendin' && room.state.phase === 'gameOver')
      || (room.state.kind === 'island' && room.state.phase === 'reveal')
      || (room.state.kind === 'silentorder' && room.state.over)
      || (room.state.kind === 'swaporstay' && room.state.phase === 'gameOver')
      || (room.state.kind === 'sleepless' && room.state.phase === 'gameOver');
    if (!finished) throw new GameError('Finish or end the current game first.');
    const game = payload?.game;
    const KNOWN_GAMES = [null, 'blendin', 'island', 'silentorder', 'swaporstay', 'sleepless'];
    if (!KNOWN_GAMES.includes(game)) throw new GameError('Unknown game.');
    room.game = game;
    room.state = null;
  }));

  socket.on('room:settings', action(socket, (room, playerId, payload) => {
    if (room.hostId !== playerId) throw new GameError('Only the room owner can change settings.');
    const uc = payload?.blendin;
    if (uc) {
      if ('outsiders' in uc) {
        if (uc.outsiders === 'auto') {
          room.settings.blendin.outsiders = 'auto';
        } else {
          const n = Number.parseInt(uc.outsiders, 10);
          if (Number.isNaN(n) || n < 1 || n > 6) throw new GameError('Blend In count must be between 1 and 6.');
          room.settings.blendin.outsiders = n;
        }
      }
      if ('blank' in uc) room.settings.blendin.blank = Boolean(uc.blank);
      if ('difficulty' in uc) {
        if (!blendinAI.isDifficulty(uc.difficulty)) throw new GameError('Unknown difficulty.');
        room.settings.blendin.difficulty = uc.difficulty;
      }
    }
  }));

  socket.on('room:backToLobby', action(socket, (room, playerId) => {
    // Normally the owner's call. But a game nobody present can advance is a dead end, and
    // insisting on the owner there just traps whoever came back.
    if (room.hostId !== playerId && !gameIsStalled(room)) {
      throw new GameError('Only the room owner can do that.');
    }
    room.state = null;
  }));

  // ----- Blend In -----
  // Two steps, because the words come from the AI and that takes a moment. The room lands
  // on a dealing screen first so nobody is left looking at an unresponsive button.
  function dealAndStart(socket, cb) {
    const { roomCode, playerId } = socket.data;
    const room = rooms.get(roomCode);
    let state;
    try {
      if (!room || !playerId) throw new GameError('You are not in a room.');
      spendAiBudget(room, 2);         // one word pair, retried once
      const opened = blendin.beginDealing(room, playerId);
      state = room.state;
      broadcast(room);
      emitFx(room, opened.fx);
    } catch (err) {
      return cb?.({ ok: false, error: err instanceof GameError ? err.message : 'Could not start the game.' });
    }

    blendinAI.generateWordPair(state.difficulty, state.usedWords)
      .then((pair) => {
        // The owner can leave or the room can close while the model is thinking.
        if (room.state !== state) return;
        const result = blendin.startGame(room, playerId, pair);
        analytics.track('game_started', {
          person: socket.data.person,
          game: 'blendin',
          difficulty: state.difficulty,
          wordSource: pair.source,
          name: room.players.get(playerId)?.name || null,
          code: room.code,
          players: room.players.size,
          roster: [...room.players.values()].map((p) => p.name).join(', ').slice(0, 200),
        });
        broadcast(room);
        emitFx(room, result.fx);
        cb?.({ ok: true });
      })
      .catch((err) => {
        console.error('[blendin deal]', err.message);
        // generateWordPair already falls back to the bank, so reaching here means the
        // engine refused. Put the room back in the lobby rather than stranding it.
        if (room.state === state) { room.state = null; broadcast(room); }
        cb?.({ ok: false, error: 'Could not deal the words, try again.' });
      });
  }

  socket.on('bi:start', (_payload, cb) => dealAndStart(socket, cb));
  socket.on('bi:ready', action(socket, (room, playerId) => blendin.markReady(room, playerId)));
  socket.on('bi:forceDescribe', action(socket, (room, playerId) => blendin.forceDescribe(room, playerId)));
  socket.on('bi:clue', action(socket, (room, playerId, payload) => {
    const result = blendin.submitClue(room, playerId, payload);
    // The last clue rolls straight into the vote after a short countdown, so nobody sits
    // waiting for the owner. The owner's own button still works and simply beats the timer.
    if (result?.roundDescribed) {
      const state = room.state;
      const round = state.round;
      setTimeout(() => {
        if (room.state !== state || state.phase !== 'discussion' || state.round !== round) return;
        try {
          const started = blendin.startVote(room, null, {});
          broadcast(room);
          emitFx(room, started?.fx);
        } catch (err) {
          if (!(err instanceof GameError)) console.error('[bi autovote]', err.message);
        }
      }, 3600);
    }
    return result;
  }));
  socket.on('bi:skipTurn', action(socket, (room, playerId) => blendin.skipTurn(room, playerId)));
  socket.on('bi:startVote', action(socket, (room, playerId, payload) => blendin.startVote(room, playerId, payload)));
  socket.on('bi:react', action(socket, (room, playerId, payload) => blendin.reactToClue(room, playerId, payload)));
  socket.on('bi:vote', action(socket, (room, playerId, payload) => blendin.castVote(room, playerId, payload)));
  socket.on('bi:blankGuess', action(socket, (room, playerId, payload) => blendin.blankGuess(room, playerId, payload)));
  socket.on('bi:skipBlankGuess', action(socket, (room, playerId) => blendin.skipBlankGuess(room, playerId)));
  socket.on('bi:nextRound', action(socket, (room, playerId) => blendin.nextRound(room, playerId)));
  socket.on('bi:playAgain', (_payload, cb) => dealAndStart(socket, cb));

  // ----- room-wide reactions -----
  // Stateless and broadcast-only, like Swap or Stay's table reactions, but usable from
  // any screen that mounts the bar. Games where an emoji could carry forbidden
  // information gate it: Silent Order is played in silence, and a Sleepless night must
  // not reveal who is awake doing something.
  const ROOM_REACTIONS = ['😂', '😱', '🔥', '💀', '🤔', '🧐', '😭'];
  socket.on('room:react', (payload, cb) => {
    try {
      const { roomCode, playerId } = socket.data;
      const room = rooms.get(roomCode);
      if (!room || !playerId || !room.players.has(playerId)) throw new GameError('You are not in a room.');
      const emoji = String(payload?.emoji || '');
      if (!ROOM_REACTIONS.includes(emoji)) throw new GameError('Unknown reaction.');
      if (room.game === 'silentorder' && room.state && !room.state.over) {
        throw new GameError('Silent Order is played in silence, save it for the scoreboard.');
      }
      if (room.game === 'sleepless' && room.state?.phase === 'night') {
        throw new GameError('The village is asleep. Reactions wake with the sun.');
      }
      // One reaction a second per player: enough for banter, too slow for a soundboard.
      const now = Date.now();
      if (now < (socket.data.reactCooldownUntil || 0)) throw new GameError('Easy on the button!');
      socket.data.reactCooldownUntil = now + 1_000;
      emitFx(room, [{ kind: 'room-react', playerId, emoji, seed: Math.floor(Math.random() * 1e6) }]);
      cb?.({ ok: true });
    } catch (err) {
      cb?.({ ok: false, error: err instanceof GameError ? err.message : 'No reaction right now.' });
    }
  });

  // ----- The Island -----
  socket.on('is:start', action(socket, (room, playerId, payload) => {
    const result = island.startGame(room, playerId, payload);
    analytics.track('game_started', {
      person: socket.data.person,
      game: 'island',
      mode: room.state?.mode,
      name: room.players.get(playerId)?.name || null,
      code: room.code,
      players: room.players.size,
      roster: [...room.players.values()].map((p) => p.name).join(', ').slice(0, 200),
    });
    return result;
  }));
  socket.on('is:newRound', action(socket, (room, playerId, payload) => {
    if (room.game !== 'island' || room.state?.phase !== 'reveal') throw new GameError('No finished round to continue from.');
    return island.startGame(room, playerId, payload);
  }));
  socket.on('is:setupHost', action(socket, (room, playerId, payload) => island.setupHostPattern(room, playerId, payload)));
  // A surprise the gamemaster can look at before committing to it: the ack carries the
  // draw, nothing changes in the room until they open the island with it.
  socket.on('is:peekSurprise', (_payload, cb) => {
    const { roomCode, playerId } = socket.data;
    try {
      const room = rooms.get(roomCode);
      if (!room || !playerId) throw new GameError('You are not in a room.');
      if (room.game !== 'island') throw new GameError('No island round in progress.');
      cb?.({ ok: true, draw: island.drawSurprise(room, playerId) });
    } catch (err) {
      cb?.({ ok: false, error: err instanceof GameError ? err.message : 'No surprise right now.' });
    }
  });

  socket.on('is:setupAI', (payload, cb) => {
    const { roomCode, playerId } = socket.data;
    const room = rooms.get(roomCode);
    try {
      if (!room || !playerId) throw new GameError('You are not in a room.');
      if (room.hostId !== playerId) throw new GameError('Only the room owner can do that.');
      if (room.game !== 'island' || room.state?.phase !== 'setup') throw new GameError('Not in island setup.');
      if (room.state.mode !== 'ai') throw new GameError('This round has a human gamemaster.');
      // Phase stays 'setup' while a pattern is being written, so without this a host
      // could stack overlapping generations, each costing a handful of model calls.
      if (room.state.generating) throw new GameError('The gamemaster is already thinking.');
      spendAiBudget(room, 10);        // 2 rounds x (1 generation + 4 calls judging both starters)
      room.state.generating = true;
    } catch (err) {
      return cb?.({ ok: false, error: err instanceof GameError ? err.message : 'Setup failed.' });
    }
    const state = room.state;
    const doneGenerating = () => { if (room.state === state) state.generating = false; };
    islandAI.generatePattern(state.usedPatternNames)
      .then((result) => {
        doneGenerating();
        if (room.state !== state || state.phase !== 'setup') return;
        const { bankEntry = null, ...pattern } = result;
        const fx = island.setupAIPattern(room, playerId, pattern, bankEntry);
        broadcast(room);
        emitFx(room, fx.fx);
        cb?.({ ok: true });
      })
      .catch((err) => {
        doneGenerating();
        console.error('[island ai generate]', err.message);
        cb?.({ ok: false, error: 'The AI could not come up with a pattern, try again.' });
      });
  });

  // A hint is earned by the table, so anyone can spend it, and it goes through the AI
  // rather than the engine because only the AI knows more items that fit.
  socket.on('is:hint', (_payload, cb) => {
    const { roomCode, playerId } = socket.data;
    const room = rooms.get(roomCode);
    let state;
    try {
      if (!room || !playerId) throw new GameError('You are not in a room.');
      if (room.game !== 'island') throw new GameError('No island round in progress.');
      state = island.requestHint(room, playerId);
      if (!aiAvailable() && !state.bankEntry) {
        throw new GameError('Hints need the AI gamemaster, and it is unavailable right now.');
      }
      // A hint is shared, so the cooldown is the room's, not the asker's. It is separate
      // from the judging cooldown: someone who just asked for an item should still be
      // able to spend a hint the table has earned.
      if (Date.now() < (room.hintCooldownUntil || 0)) throw new GameError('One hint at a time.');
      spendAiBudget(room, 9);         // worst case: three suggest-and-verify rounds
      room.hintCooldownUntil = Date.now() + 3000;
    } catch (err) {
      return cb?.({ ok: false, error: err instanceof GameError ? err.message : 'No hint right now.' });
    }
    // A human gamemaster reviews before anything reaches the table: the model only
    // drafts, and the round is unchanged until they hand the hint over.
    const review = state.mode === 'host';
    islandAI.suggestItems(state.pattern, island.knownItems(state), state.bankEntry, island.HINT_SIZE)
      .then((items) => {
        // The round can end or restart while the model is thinking.
        if (room.state !== state || state.phase !== 'playing') return cb?.({ ok: false, error: 'The round moved on.' });
        if (review) return cb?.({ ok: true, items, review: true });
        const result = island.applyHint(room, playerId, items);
        broadcast(room);
        emitFx(room, result.fx);
        cb?.({ ok: true, items });
      })
      .catch((err) => {
        console.error('[island hint]', err.message);
        cb?.({ ok: false, error: 'The boat is not giving anything away right now, try again.' });
      });
  });

  // The gamemaster's own words, whether they wrote them or edited the model's draft.
  socket.on('is:hintGive', action(socket, (room, playerId, payload) => {
    island.requestHint(room, playerId);
    return island.applyHint(room, playerId, Array.isArray(payload?.items) ? payload.items : []);
  }));

  socket.on('is:item', action(socket, (room, playerId, payload) => {
    const state = room.state;
    const { attempt } = island.attemptItem(room, playerId, payload);
    if (state.mode === 'ai') {
      spendAiBudget(room, 3);         // judge, verify, and a tie-break if they disagree
      aiCooldown(room, playerId);
      queueMicrotask(() => judgeIslandAttempt(room, attempt));
    }
    return { fx: [{ kind: 'island-attempt', playerId }] };
  }));

  socket.on('is:pattern', action(socket, (room, playerId, payload) => {
    const state = room.state;
    const { attempt } = island.attemptPattern(room, playerId, payload);
    if (state.mode === 'ai') {
      spendAiBudget(room, 2);         // judge, plus an appeal if it is rejected
      aiCooldown(room, playerId);
      queueMicrotask(() => judgeIslandAttempt(room, attempt));
    }
    return { fx: [{ kind: 'island-attempt', playerId }] };
  }));

  socket.on('is:pass', action(socket, (room, playerId) => island.passTurn(room, playerId)));
  // The table's appeal: re-read every ruling of the round with a fresh pair of AI eyes.
  socket.on('is:audit', (_payload, cb) => {
    const { roomCode, playerId } = socket.data;
    const room = rooms.get(roomCode);
    let gate;
    try {
      if (!room || !playerId) throw new GameError('You are not in a room.');
      if (room.game !== 'island') throw new GameError('No island round in progress.');
      if (Date.now() < (room.auditCooldownUntil || 0)) throw new GameError('The boat just re-checked. Give it a minute.');
      spendAiBudget(room, 4);         // worst case: two judge-and-defend rounds
      gate = island.requestAudit(room, playerId);
      room.auditCooldownUntil = Date.now() + 60_000;
    } catch (err) {
      return cb?.({ ok: false, error: err instanceof GameError ? err.message : 'No re-check right now.' });
    }
    // A call landing mid-audit would be judged against a list about to change under it.
    gate.state.auditing = true;
    broadcast(room);
    const release = () => { if (room.state === gate.state) gate.state.auditing = false; };
    islandAI.auditRound(gate.state.pattern, gate.judged)
      .then(({ corrections }) => {
        release();
        if (room.state !== gate.state || gate.state.phase !== 'playing') return cb?.({ ok: false, error: 'The round moved on.' });
        const result = island.applyAudit(room, playerId, corrections);
        broadcast(room);
        emitFx(room, result.fx);
        cb?.({ ok: true, fixed: gate.state.lastAudit.fixed.length });
      })
      .catch((err) => {
        console.error('[island audit]', err.message);
        release();
        broadcast(room);
        room.auditCooldownUntil = 0;
        cb?.({ ok: false, error: 'The boat could not re-check just now, try again.' });
      });
  });
  socket.on('is:judge', action(socket, (room, playerId, payload) => island.hostJudge(room, playerId, payload)));
  socket.on('is:cancelPending', action(socket, (room, playerId) => island.cancelPending(room, playerId)));
  socket.on('is:end', action(socket, (room, playerId) => island.endRound(room, playerId)));

  // ----- Silent Order -----
  socket.on('so:start', action(socket, (room, playerId) => {
    const result = silentorder.startGame(room, playerId);
    analytics.track('game_started', {
      person: socket.data.person,
      game: 'silentorder',
      name: room.players.get(playerId)?.name || null,
      code: room.code,
      players: room.players.size,
      roster: [...room.players.values()].map((p) => p.name).join(', ').slice(0, 200),
    });
    return result;
  }));
  socket.on('so:ready', action(socket, (room, playerId) => silentorder.markReady(room, playerId)));
  socket.on('so:play', action(socket, (room, playerId) => silentorder.playLowest(room, playerId)));
  socket.on('so:next', action(socket, (room, playerId) => silentorder.nextRun(room, playerId)));

  // ----- Swap or Stay -----
  socket.on('ss:start', action(socket, (room, playerId) => {
    const result = swaporstay.startGame(room, playerId);
    analytics.track('game_started', {
      person: socket.data.person,
      game: 'swaporstay',
      name: room.players.get(playerId)?.name || null,
      code: room.code,
      players: room.players.size,
      roster: [...room.players.values()].map((p) => p.name).join(', ').slice(0, 200),
    });
    return result;
  }));
  socket.on('ss:ready', action(socket, (room, playerId) => swaporstay.markReady(room, playerId)));
  socket.on('ss:choice', action(socket, (room, playerId, payload) => swaporstay.choice(room, playerId, payload)));
  // One event covers "next round" from a result and "play again" from game over.
  socket.on('ss:next', action(socket, (room, playerId) => swaporstay.next(room, playerId)));
  socket.on('ss:react', action(socket, (room, playerId, payload) => swaporstay.react(room, playerId, payload)));

  // ----- Sleepless -----
  socket.on('sl:start', action(socket, (room, playerId) => {
    const result = sleepless.startGame(room, playerId);
    analytics.track('game_started', {
      person: socket.data.person,
      game: 'sleepless',
      name: room.players.get(playerId)?.name || null,
      code: room.code,
      players: room.players.size,
      roster: [...room.players.values()].map((p) => p.name).join(', ').slice(0, 200),
    });
    return result;
  }));
  socket.on('sl:ready', action(socket, (room, playerId) => sleepless.markReady(room, playerId)));
  socket.on('sl:night', action(socket, (room, playerId, payload) => sleepless.submitNight(room, playerId, payload)));
  socket.on('sl:vote', action(socket, (room, playerId, payload) => sleepless.castVote(room, playerId, payload)));
  socket.on('sl:next', action(socket, (room, playerId) => sleepless.nextPhase(room, playerId)));

  socket.on('disconnect', () => {
    const { roomCode, playerId } = socket.data;
    const room = rooms.get(roomCode);
    if (room && playerId && room.players.get(playerId)?.socketId === socket.id) {
      const result = detachPlayer(room, playerId, { permanent: false });
      broadcast(room);
      emitFx(room, result.fx);
    }
  });
});

server.listen(PORT, () => {
  const bound = server.address()?.port ?? PORT;
  console.log(process.env.RENDER || process.env.NODE_ENV === 'production'
    ? `Game Night listening on port ${bound}`
    : `Game Night running at http://localhost:${bound}`);
  console.log(`The Island's AI gamemaster: ${aiStatus()}`);
});
