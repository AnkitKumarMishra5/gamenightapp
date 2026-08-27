// Fill a room with bot players so you can test the real UI solo.
//   npm run bots -- ABCDE        (4 bots, default)
//   npm run bots -- ABCDE 6      (6 bots)
//   PORT=3456 npm run bots -- ABCDE
// Bots auto-play: they reveal their word, give clues on their turn, vote randomly,
// and in The Island they ask for random items. You stay in control in the browser.
import { io } from 'socket.io-client';

const CODE = (process.argv[2] || '').toUpperCase();
const COUNT = Math.max(1, Math.min(12, Number(process.argv[3]) || 4));
const URL = process.env.URL || `http://localhost:${process.env.PORT || 3456}`;

if (!CODE || CODE.length !== 5) {
  console.error('Usage: npm run bots -- <ROOM-CODE> [howMany]');
  process.exit(1);
}

const NAMES = ['Maya', 'Leo', 'Zara', 'Sam', 'Kim', 'Ravi', 'Nina', 'Omar', 'Iris', 'Theo', 'Priya', 'Jo'];
const AVATARS = ['🦊', '🐼', '🦁', '🐸', '🐙', '🦄', '🐳', '🦉', '🐯', '🦋', '🐺', '🦖'];
const CLUES = ['warm', 'sweet', 'shiny', 'noisy', 'tiny', 'classic', 'daily', 'crunchy', 'smooth', 'bright',
  'cheap', 'popular', 'weird', 'cozy', 'sharp', 'round', 'heavy', 'quick', 'old', 'fancy', 'salty', 'cold'];
const ITEMS = ['Mirror', 'Balloon', 'Pillow', 'Kettle', 'Ladder', 'Compass', 'Pencil', 'Guitar', 'Bottle',
  'Candle', 'Promise', 'Anchor', 'Sandals', 'Coconut', 'Lantern', 'Puzzle', 'Marble', 'Whistle'];

const rnd = (a) => a[Math.floor(Math.random() * a.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Bot {
  constructor(i) {
    this.name = NAMES[i % NAMES.length];
    this.avatar = AVATARS[i % AVATARS.length];
    this.playerId = `bot_${Math.random().toString(36).slice(2, 12)}`;
    this.token = Math.random().toString(36).slice(2, 18);
    this.snap = null;
    this.busy = false;
  }

  async start() {
    this.socket = io(URL, { transports: ['websocket'], forceNew: true });
    await new Promise((res, rej) => {
      this.socket.once('connect', res);
      this.socket.once('connect_error', () => rej(new Error(`cannot reach ${URL} — is the server running?`)));
    });
    this.socket.on('room:state', (s) => { this.snap = s; this.think(); });
    this.socket.on('room:kicked', () => { console.log(`  ${this.avatar} ${this.name} was kicked`); this.socket.disconnect(); });
    const res = await this.emit('room:join', {
      code: CODE, name: this.name, avatar: this.avatar, playerId: this.playerId, token: this.token,
    });
    if (!res.ok) throw new Error(`${this.name} could not join: ${res.error}`);
    console.log(`  ${this.avatar} ${this.name} joined`);
  }

  emit(event, payload = {}) {
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve({ ok: false, error: 'timeout' }), 8000);
      this.socket.emit(event, payload, (r) => { clearTimeout(t); resolve(r || { ok: true }); });
    });
  }

  // React to the latest snapshot, with a human-ish pause so the UI is watchable.
  async think() {
    if (this.busy || !this.snap) return;
    this.busy = true;
    try {
      await sleep(700 + Math.random() * 900);
      const s = this.snap;
      const me = s.you?.id;
      const uc = s.blendin;
      const isl = s.island;

      if (uc) {
        if (uc.phase === 'reveal' && !uc.youReady) await this.emit('bi:ready');
        else if (uc.phase === 'describing' && uc.currentTurn === me) {
          const used = new Set(uc.clues.map((c) => c.text.toLowerCase()));
          const own = (uc.you?.word || '').toLowerCase();
          const clue = CLUES.find((c) => !used.has(c.toLowerCase()) && c.toLowerCase() !== own)
            || `hint-${Math.random().toString(36).slice(2, 6)}`;
          await this.emit('bi:clue', { text: clue });
        } else if ((uc.phase === 'voting' || uc.phase === 'runoff') && !uc.youVoted && uc.you?.alive) {
          const pool = (uc.runoffCandidates || uc.alive).filter((id) => id !== me);
          if (pool.length) await this.emit('bi:vote', { targetId: rnd(pool) });
        } else if (uc.phase === 'blankGuess' && uc.pendingBlankId === me) {
          await this.emit('bi:blankGuess', { text: rnd(['coffee', 'pizza', 'guitar', 'beach']) });
        }
      } else if (isl) {
        if (isl.phase === 'playing' && isl.currentTurn === me) {
          const asked = new Set([...(isl.starters || []), ...isl.attempts.filter((a) => a.type === 'item' && a.text).map((a) => a.text)]
            .map((t) => t.toLowerCase()));
          const item = ITEMS.find((t) => !asked.has(t.toLowerCase()));
          if (item) await this.emit('is:item', { text: item });
          else if (isl.youSolved) await this.emit('is:pass');
        }
      }
    } catch (err) {
      console.error(`  ${this.name} error:`, err.message);
    } finally {
      this.busy = false;
      // A snapshot may have arrived while we were acting.
      if (this.snap) setTimeout(() => this.think(), 200);
    }
  }
}

console.log(`Adding ${COUNT} bots to room ${CODE} at ${URL}…`);
const bots = [];
for (let i = 0; i < COUNT; i++) {
  const bot = new Bot(i);
  try {
    await bot.start();
    bots.push(bot);
  } catch (err) {
    console.error('  ✗', err.message);
    process.exit(1);
  }
}
console.log(`\n${bots.length} bots ready — they'll play along automatically. Ctrl+C to remove them.`);

const bye = () => {
  for (const b of bots) { try { b.emit('room:leave'); b.socket.disconnect(); } catch {} }
  setTimeout(() => process.exit(0), 200);
};
process.on('SIGINT', bye);
process.on('SIGTERM', bye);
