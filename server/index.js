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

const { rooms, createRoom, getRoom, addPlayer, removePlayer, transferHost, sweepRooms, closeRoomIfEmpty, snapshot, adminOverview, invitePreview } = await import('./core/rooms.js');
const blendin = await import('./games/blendin/engine.js');
const island = await import('./games/island/engine.js');
const islandAI = await import('./games/island/ai.js');
const blendinAI = await import('./games/blendin/ai.js');
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

const DEFAULT_OG = {
  title: 'Game Night: party games for your crew',
  desc: 'Your crew, your rules, one room code away. Play Blend In and The Island live with '
    + 'friends on any device. Built by Ankit Kumar Mishra.',
};

// Escaping matters here: these strings land inside an HTML attribute, and the host name is
// whatever a player typed.
const attr = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[c]));

const GAME_LABEL = { blendin: 'Blend In', island: 'The Island' };

// A shared invite deserves its own preview. Rather than trusting a name in the URL, the
// server looks the room up by its code: no personal data in the link, nothing to escape
// from a query string, and the numbers are live at the moment the link is unfurled.
function ogFor(req) {
  const code = String(req.query.join || '').toUpperCase().trim();
  if (!/^[A-Z0-9]{5}$/.test(code)) return DEFAULT_OG;
  const room = invitePreview(code);
  // An expired or mistyped code falls back to the normal card rather than advertising a
  // room that is not there.
  if (!room) return DEFAULT_OG;

  const name = room.hostName || 'A friend';
  const others = Math.max(0, room.players - 1);
  const crowd = others === 0
    ? `${name} is waiting in room ${room.code}`
    : `${name} and ${others} other${others > 1 ? 's' : ''} are in room ${room.code}`;
  const game = GAME_LABEL[room.game];

  return {
    title: `${room.hostAvatar || '🎭'} ${name} invited you to Game Night`,
    desc: `${crowd}.`
      + (game ? ` Tonight: ${game}.` : '')
      + ' No download, no sign-up, just the code.',
  };
}

app.get(['/', '/index.html'], (req, res) => {
  // No visit is logged here on purpose. The page reports itself a moment later via
  // /api/hello, carrying the browser id that makes one person one row instead of two.
  const og = ogFor(req);
  res.type('html').send(indexTemplate
    .replaceAll('%ORIGIN%', originFor(req))
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
    return {
      files: fs.readdirSync(dir)
        .filter((f) => /\.(mp3|m4a|ogg|wav|webm)$/i.test(f))
        .map((f) => ({ id: path.basename(f, path.extname(f)), src: `/media/sfx/${f}` })),
    };
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
  for (const player of room.players.values()) {
    if (player.connected && player.socketId) {
      io.to(player.socketId).emit('room:state', snapshot(room, player.id));
    }
  }
}

// A game reaching its end is the single most useful thing to measure: it turns "somebody
// pressed start" into "somebody actually played". Detected centrally so no engine has to
// remember to report it, and keyed so a replay of the same finished state logs once.
function noteFinish(room) {
  const state = room.state;
  if (!state) { room.finishLogged = null; return; }
  const done = room.game === 'blendin' ? Boolean(state.winner)
    : room.game === 'island' ? state.phase === 'reveal'
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
  } else {
    player.connected = false;
    player.socketId = null;
    if (room.game === 'blendin') results.push(blendin.onConnectivityChange(room));
    if (room.game === 'island') results.push(island.onConnectivityChange(room));
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
            message: `“${rejected.text}” isn't something you can bring, try a real word.`,
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
      attachToRoom(socket, room, playerId);
      const fx = [];
      if (room.game === 'blendin') fx.push(...(blendin.onConnectivityChange(room)?.fx || []));
      if (room.game === 'island') fx.push(...(island.onConnectivityChange(room)?.fx || []));
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
      || (room.state.kind === 'island' && room.state.phase === 'reveal');
    if (!finished) throw new GameError('Finish or end the current game first.');
    const game = payload?.game;
    if (game !== null && game !== 'blendin' && game !== 'island') throw new GameError('Unknown game.');
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
    if (room.hostId !== playerId) throw new GameError('Only the room owner can do that.');
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
  socket.on('bi:clue', action(socket, (room, playerId, payload) => blendin.submitClue(room, playerId, payload)));
  socket.on('bi:skipTurn', action(socket, (room, playerId) => blendin.skipTurn(room, playerId)));
  socket.on('bi:startVote', action(socket, (room, playerId, payload) => blendin.startVote(room, playerId, payload)));
  socket.on('bi:react', action(socket, (room, playerId, payload) => blendin.reactToClue(room, playerId, payload)));
  socket.on('bi:vote', action(socket, (room, playerId, payload) => blendin.castVote(room, playerId, payload)));
  socket.on('bi:blankGuess', action(socket, (room, playerId, payload) => blendin.blankGuess(room, playerId, payload)));
  socket.on('bi:skipBlankGuess', action(socket, (room, playerId) => blendin.skipBlankGuess(room, playerId)));
  socket.on('bi:nextRound', action(socket, (room, playerId) => blendin.nextRound(room, playerId)));
  socket.on('bi:playAgain', (_payload, cb) => dealAndStart(socket, cb));

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

  socket.on('is:setupAI', (payload, cb) => {
    const { roomCode, playerId } = socket.data;
    const room = rooms.get(roomCode);
    try {
      if (!room || !playerId) throw new GameError('You are not in a room.');
      if (room.hostId !== playerId) throw new GameError('Only the room owner can do that.');
      if (room.game !== 'island' || room.state?.phase !== 'setup') throw new GameError('Not in island setup.');
      if (room.state.mode !== 'ai') throw new GameError('This round has a human gamemaster.');
    } catch (err) {
      return cb?.({ ok: false, error: err instanceof GameError ? err.message : 'Setup failed.' });
    }
    const state = room.state;
    islandAI.generatePattern(state.usedPatternNames)
      .then((result) => {
        if (room.state !== state || state.phase !== 'setup') return;
        const { bankEntry = null, ...pattern } = result;
        const fx = island.setupAIPattern(room, playerId, pattern, bankEntry);
        broadcast(room);
        emitFx(room, fx.fx);
        cb?.({ ok: true });
      })
      .catch((err) => {
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
      room.hintCooldownUntil = Date.now() + 3000;
    } catch (err) {
      return cb?.({ ok: false, error: err instanceof GameError ? err.message : 'No hint right now.' });
    }
    islandAI.suggestItems(state.pattern, island.knownItems(state), state.bankEntry, island.HINT_SIZE)
      .then((items) => {
        // The round can end or restart while the model is thinking.
        if (room.state !== state || state.phase !== 'playing') return cb?.({ ok: false, error: 'The round moved on.' });
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

  socket.on('is:item', action(socket, (room, playerId, payload) => {
    const state = room.state;
    const { attempt } = island.attemptItem(room, playerId, payload);
    if (state.mode === 'ai') {
      aiCooldown(room, playerId);
      queueMicrotask(() => judgeIslandAttempt(room, attempt));
    }
    return { fx: [{ kind: 'island-attempt', playerId }] };
  }));

  socket.on('is:pattern', action(socket, (room, playerId, payload) => {
    const state = room.state;
    const { attempt } = island.attemptPattern(room, playerId, payload);
    if (state.mode === 'ai') {
      aiCooldown(room, playerId);
      queueMicrotask(() => judgeIslandAttempt(room, attempt));
    }
    return { fx: [{ kind: 'island-attempt', playerId }] };
  }));

  socket.on('is:pass', action(socket, (room, playerId) => island.passTurn(room, playerId)));
  socket.on('is:judge', action(socket, (room, playerId, payload) => island.hostJudge(room, playerId, payload)));
  socket.on('is:cancelPending', action(socket, (room, playerId) => island.cancelPending(room, playerId)));
  socket.on('is:end', action(socket, (room, playerId) => island.endRound(room, playerId)));

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
