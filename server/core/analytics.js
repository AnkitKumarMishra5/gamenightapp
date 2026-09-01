// Game Night — © 2026 Ankit Kumar Mishra. All rights reserved. See LICENSE.
// Lightweight, privacy-conscious usage logging — no accounts, no third parties.
//
// WHAT IS RECORDED: a device and browser picture (type, OS and version, browser and
// version, device model where the browser offers it, screen and viewport size, pixel
// ratio, orientation, colour depth, CPU cores, memory, connection type, data-saver and
// touch support, colour-scheme and reduced-motion preferences, timezone and languages),
// how the visit arrived (referrer, UTM parameters, whether it came from an invite link,
// whether the app is installed), how the page performed (TTFB, DOM ready, total load),
// how long the visit lasted, the display name the player chose, and gameplay milestones
// (room created, joined, game started and finished, with headcount, winner and duration).
//
// HOW PEOPLE ARE COUNTED: the browser makes up a random id the first time it loads the
// page and keeps it in localStorage. The server never stores that value, it stores a hash
// of it, shown as a pseudonym like P-7KQ2M. That is enough to tell "the same browser came
// back on Tuesday" apart from "two different people" without knowing whose browser it is,
// and clearing site data makes the person a brand new stranger. Requests that arrive
// without one (a bot, curl, a link preview) fall back to a hash of IP + user-agent that is
// re-salted every day, so those cannot be followed from one day to the next at all.
//
// WHAT IS DELIBERATELY NOT COLLECTED, and why:
//   • Raw IP addresses, never written down, only ever fed through a one-way hash.
//   • Anything typed in a game, no clues, words, guesses or chat. Those are the game.
//   • Battery Status API. Firefox removed it outright over privacy; level + charging time
//     together are close to a unique device id, and it tells us nothing useful here.
//   • Canvas/WebGL fingerprinting, a strong cross-site identifier with no legitimate use
//     in a party game.
//   • Third-party IP geolocation, which would mean shipping every visitor's IP to another
//     company. Country is read only if the host already provides it in a header.
//   • No cookies, no ad networks, no third-party analytics of any kind.
//
// Everything is also written to stdout as one JSON line per event, because on a host like
// Render the log stream is the most reliable place to read it.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Project root, two levels up from server/core/.
const DATA_DIR = process.env.GN_DATA_DIR
  || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '.data');
const LOG_FILE = path.join(DATA_DIR, 'usage.jsonl');
const SALT_FILE = path.join(DATA_DIR, 'id-salt');
const MAX_MEMORY_EVENTS = 50_000;   // roughly a year of a busy party game
const MAX_LOG_BYTES = 16 * 1024 * 1024;
const SESSION_GAP_MS = 30 * 60 * 1000;   // a fresh visit after this long is a new session
const DUPLICATE_VISIT_MS = 5000;         // two hellos in the same breath are one visit
const SILENT = process.env.GN_ANALYTICS === 'off';

export const RANGES = {
  day: { label: 'Today', ms: 24 * 60 * 60 * 1000 },
  week: { label: 'Week', ms: 7 * 24 * 60 * 60 * 1000 },
  month: { label: 'Month', ms: 30 * 24 * 60 * 60 * 1000 },
  year: { label: 'Year', ms: 365 * 24 * 60 * 60 * 1000 },
  all: { label: 'All time', ms: Infinity },
};

// ---------------------------------------------------------------------------
// Identity
// ---------------------------------------------------------------------------
// One secret, kept next to the log and never committed. It exists so that the ids in the
// log cannot be recomputed by anyone holding a copy of the log but not the server.
function loadSalt() {
  if (process.env.GN_ID_SECRET) return process.env.GN_ID_SECRET;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(SALT_FILE)) return fs.readFileSync(SALT_FILE, 'utf8').trim();
    const fresh = crypto.randomBytes(24).toString('hex');
    fs.writeFileSync(SALT_FILE, fresh, { mode: 0o600 });
    return fresh;
  } catch {
    // Read-only disk: ids stay stable for the life of the process, which is still enough
    // to spot someone coming back during a session.
    return crypto.randomBytes(24).toString('hex');
  }
}
const SALT = loadSalt();

// Crockford-ish base32: no I, L, O or U, so an id can be read aloud without ambiguity.
const ID_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
function shortId(input, length = 5) {
  const digest = crypto.createHash('sha256').update(input).digest();
  let out = '';
  for (let i = 0; i < length; i += 1) out += ID_ALPHABET[digest[i] % ID_ALPHABET.length];
  return out;
}

// The IP fallback rotates daily, so yesterday's anonymous hashes cannot be matched
// against today's.
let saltDay = '';
let daySalt = '';
function dailySalt() {
  const today = new Date().toISOString().slice(0, 10);
  if (today !== saltDay) {
    saltDay = today;
    daySalt = crypto.randomBytes(16).toString('hex');
  }
  return daySalt;
}

const cleanVid = (v) => (typeof v === 'string' && /^[a-z0-9]{8,40}$/i.test(v) ? v : null);

// `vid` is the browser's own random id. Everything else is a fallback for clients that
// never ran our JavaScript.
export function personId(req, vid) {
  const known = cleanVid(vid);
  if (known) return { person: `P-${shortId(`${SALT}|vid|${known}`)}`, idSource: 'browser' };
  const ua = String(req?.headers?.['user-agent'] || '');
  const ip = clientIp(req);
  if (!ua && !ip) return { person: 'P-?????', idSource: 'unknown' };
  return { person: `A-${shortId(`${dailySalt()}|${ip}|${ua}`)}`, idSource: 'network' };
}

function clientIp(req) {
  return String(req?.headers?.['x-forwarded-for'] || req?.socket?.remoteAddress || '')
    .split(',')[0].trim();
}

// ---------------------------------------------------------------------------
// Event store
// ---------------------------------------------------------------------------
const events = [];
let nextSeq = 1;

const eventId = (n) => `E-${String(n).padStart(6, '0')}`;

// Bring the previous runs back so week/month/year mean something after a restart or a
// redeploy. Anything unparseable is skipped rather than taking the server down with it.
function hydrate() {
  if (SILENT) return;
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').slice(-MAX_MEMORY_EVENTS);
    const legacy = [];
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (!event?.t || !event?.type) continue;
        // Lines written before events had ids and stable people. Keep them rather than
        // throwing history away: they still count towards the totals and the trend, they
        // just cannot be followed from one day to the next.
        if (!event.person && event.visitor) {
          event.person = `A-${String(event.visitor).slice(0, 5).toUpperCase()}`;
          event.idSource = 'network';
        }
        if (!event.id) legacy.push(event);
        events.push(event);
        const seq = Number(String(event.id || '').replace(/\D/g, ''));
        if (Number.isFinite(seq) && seq >= nextSeq) nextSeq = seq + 1;
      } catch { /* a half-written line from a hard kill */ }
    }
    // Number the old lines below the live counter so ids stay unique and in order.
    for (const event of legacy) {
      event.id = eventId(nextSeq);
      nextSeq += 1;
    }
    if (events.length) {
      console.log(`[usage] restored ${events.length} events from ${path.basename(LOG_FILE)}${
        legacy.length ? ` (${legacy.length} from before ids existed)` : ''}`);
    }
  } catch { /* no history is not an error */ }
}

function persist(event) {
  if (SILENT) return;
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_LOG_BYTES) {
      // Keep the tail rather than growing without bound.
      const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n').slice(-MAX_MEMORY_EVENTS / 2);
      fs.writeFileSync(LOG_FILE, lines.join('\n'));
    }
    fs.appendFileSync(LOG_FILE, `${JSON.stringify(event)}\n`);
  } catch { /* read-only or ephemeral disk: stdout still has it */ }
}

// ---------------------------------------------------------------------------
// Optional remote mirror
// ---------------------------------------------------------------------------
// A free host gives you an ephemeral disk, so .data/usage.jsonl is wiped on every
// redeploy and the month and year ranges become meaningless. Point these two variables at
// an Upstash Redis database (its REST API is plain HTTPS, so there is no dependency to
// install) and every event is mirrored there and replayed on boot.
//
// Entirely optional: unset, nothing here runs and the local file behaves as before.
// Failures are swallowed on purpose. Analytics must never be able to break a game.
// Values pasted from a provider's dashboard routinely arrive wrapped in quotes or with a
// trailing newline. Left alone that produces an "Invalid URL" deep inside fetch and the
// mirror silently never works, so clean them here rather than trusting the caller.
const envStr = (name) => String(process.env[name] || '').trim().replace(/^["']|["']$/g, '').trim();
const REDIS_URL = envStr('GN_REDIS_URL').replace(/\/+$/, '');
const REDIS_TOKEN = envStr('GN_REDIS_TOKEN');
const REDIS_KEY = envStr('GN_REDIS_KEY') || 'gn:events';
const REMOTE = Boolean(REDIS_URL && REDIS_TOKEN);
const REMOTE_KEEP = 40_000;          // how many events to retain remotely
let remoteWrites = 0;
let remoteWarned = false;

async function redis(command) {
  const res = await fetch(`${REDIS_URL}/${command.map(encodeURIComponent).join('/')}`, {
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  });
  if (!res.ok) throw new Error(`redis ${res.status}`);
  return (await res.json()).result;
}

function remotePush(event) {
  if (!REMOTE) return;
  // Fire and forget. One command per event, plus a trim every few hundred, which keeps
  // this comfortably inside a free tier's monthly command budget.
  redis(['rpush', REDIS_KEY, JSON.stringify(event)])
    .then(() => {
      remoteWrites += 1;
      if (remoteWrites % 250 === 0) return redis(['ltrim', REDIS_KEY, String(-REMOTE_KEEP), '-1']);
      return null;
    })
    .catch((err) => {
      if (!remoteWarned) {
        remoteWarned = true;
        console.warn(`[usage] remote mirror unavailable (${err.message}), local log only`);
      }
    });
}

// Start over: the local log and the remote mirror both emptied. Used to clear test data
// before real traffic, from the dashboard's own button.
export async function purgeAll() {
  try { fs.writeFileSync(LOG_FILE, ''); } catch { /* nothing to clear */ }
  events.length = 0;
  if (REDIS_URL && REDIS_TOKEN) {
    await fetch(`${REDIS_URL}/del/${encodeURIComponent(REDIS_KEY)}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    }).catch(() => {});
  }
  return true;
}

export function track(type, data = {}) {
  if (SILENT) return null;
  const event = { id: eventId(nextSeq), t: new Date().toISOString(), type, ...data };
  nextSeq += 1;
  events.push(event);
  if (events.length > MAX_MEMORY_EVENTS) events.shift();
  console.log(`[usage] ${JSON.stringify(event)}`);
  persist(event);
  remotePush(event);
  return event;
}

// ---------------------------------------------------------------------------
// Parsing the User-Agent — coarse buckets only, no fingerprinting
// ---------------------------------------------------------------------------
const version = (ua, re) => (ua.match(re)?.[1] || '').split('.').slice(0, 2).join('.') || null;

export function describeClient(req, extra = {}) {
  const ua = String(req.headers['user-agent'] || '');

  const os = /iPhone|iPad|iPod/i.test(ua) ? 'iOS'
    : /Android/i.test(ua) ? 'Android'
    : /Mac OS X|Macintosh/i.test(ua) ? 'macOS'
    : /Windows/i.test(ua) ? 'Windows'
    : /CrOS/i.test(ua) ? 'ChromeOS'
    : /Linux/i.test(ua) ? 'Linux'
    : 'Other';

  const osVersion = os === 'iOS' ? version(ua, /OS (\d+[._]\d+)/)?.replace('_', '.')
    : os === 'Android' ? version(ua, /Android (\d+\.?\d*)/)
    : os === 'macOS' ? version(ua, /Mac OS X (\d+[._]\d+)/)?.replace('_', '.')
    : os === 'Windows' ? ({ '10.0': '10/11', '6.3': '8.1', '6.1': '7' }[version(ua, /Windows NT (\d+\.\d+)/)] || null)
    : null;

  // Order matters: Edge and Opera both advertise Chrome in their UA string.
  const browser = /Edg\//i.test(ua) ? 'Edge'
    : /OPR\/|Opera/i.test(ua) ? 'Opera'
    : /SamsungBrowser/i.test(ua) ? 'Samsung Internet'
    : /Chrome\//i.test(ua) ? 'Chrome'
    : /Firefox\//i.test(ua) ? 'Firefox'
    : /Safari\//i.test(ua) ? 'Safari'
    : 'Other';

  const browserVersion = version(ua, new RegExp(`${
    { Edge: 'Edg', Opera: 'OPR', 'Samsung Internet': 'SamsungBrowser', Chrome: 'Chrome',
      Firefox: 'Firefox', Safari: 'Version' }[browser] || 'zzz'
  }\\/(\\d+\\.?\\d*)`));

  const device = /iPad|Tablet/i.test(ua) ? 'tablet'
    : /Mobi|iPhone|Android/i.test(ua) ? 'phone'
    : 'desktop';

  // Only if the host already resolved it — never a third-party lookup.
  const country = req.headers['cf-ipcountry'] || req.headers['x-vercel-ip-country']
    || req.headers['fly-client-ip-country'] || null;

  return {
    device, os, osVersion, browser, browserVersion,
    lang: String(req.headers['accept-language'] || '').split(',')[0] || null,
    country: country ? String(country).slice(0, 2).toUpperCase() : null,
    ref: refererHost(req.headers.referer),
    ...extra,
  };
}

function refererHost(referer) {
  if (!referer) return null;
  try {
    return new URL(referer).host || null;
  } catch { return null; }
}

const str = (v, max = 40) => (typeof v === 'string' && v ? v.slice(0, max) : null);
const num = (v, max = 1e6) => (Number.isFinite(v) && v >= 0 && v <= max ? v : null);

// Called from the client with everything only the browser knows. Every field is clamped —
// this is untrusted input from the page.
export function recordVisit(req, clientInfo = {}) {
  const { person, idSource } = personId(req, clientInfo.vid);

  // A reload storm, a service-worker retry and a second tab all fire hellos at once.
  // Counting those as separate visits would inflate every number on the dashboard.
  const last = [...events].reverse().find((e) => e.type === 'visit' && e.person === person);
  if (last && Date.now() - Date.parse(last.t) < DUPLICATE_VISIT_MS) return last;

  return track('visit', {
    person,
    idSource,
    ...describeClient(req),
    screen: str(clientInfo.screen, 16),
    resolution: str(clientInfo.resolution, 16),
    viewport: str(clientInfo.viewport, 16),
    dpr: num(clientInfo.dpr, 8),
    cores: num(clientInfo.cores, 256),
    memoryGb: num(clientInfo.memoryGb, 1024),
    network: str(clientInfo.network, 12),
    downlinkMbps: num(clientInfo.downlinkMbps, 1000),
    touch: Boolean(clientInfo.touch),
    theme: str(clientInfo.theme, 8),
    reducedMotion: Boolean(clientInfo.reducedMotion),
    installed: Boolean(clientInfo.installed),
    tz: str(clientInfo.tz, 40),
    langs: str(clientInfo.langs, 40),
    orientation: str(clientInfo.orientation, 10),
    colorDepth: num(clientInfo.colorDepth, 64),
    maxTouch: num(clientInfo.maxTouch, 32),
    saveData: Boolean(clientInfo.saveData),
    platformVersion: str(clientInfo.platformVersion, 16),
    model: str(clientInfo.model, 32),
    arch: str(clientInfo.arch, 12),
    utmSource: str(clientInfo.utmSource, 32),
    utmMedium: str(clientInfo.utmMedium, 32),
    utmCampaign: str(clientInfo.utmCampaign, 32),
    viaInvite: Boolean(clientInfo.viaInvite),
    entry: str(clientInfo.entry, 64),
    loadMs: num(clientInfo.loadMs, 120000),
    ttfbMs: num(clientInfo.ttfbMs, 120000),
    domReadyMs: num(clientInfo.domReadyMs, 120000),
    automated: Boolean(clientInfo.automated),
    name: str(clientInfo.name, 18),          // the display name, if they have set one
  });
}

// Sent by the page when the tab is hidden or closed. It is the only way to know whether
// somebody stayed for a round or bounced in three seconds.
export function recordDeparture(req, clientInfo = {}) {
  const { person } = personId(req, clientInfo.vid);
  const seconds = num(clientInfo.seconds, 24 * 60 * 60);
  if (!seconds) return null;
  return track('left', {
    person,
    name: str(clientInfo.name, 18),
    seconds,
    installed: Boolean(clientInfo.installed),
  });
}

// ---------------------------------------------------------------------------
// Reading it back
// ---------------------------------------------------------------------------
export function eventsInRange(range = 'all') {
  const ms = RANGES[range]?.ms ?? Infinity;
  if (!Number.isFinite(ms)) return events.slice();
  const cutoff = Date.now() - ms;
  return events.filter((e) => Date.parse(e.t) >= cutoff);
}

// Everything we can honestly say about one pseudonymous person, folded up from their
// events. This is the answer to "is anybody actually coming back?".
function foldPeople(list) {
  const byPerson = new Map();

  for (const e of list) {
    if (!e.person) continue;
    let p = byPerson.get(e.person);
    if (!p) {
      p = {
        id: e.person,
        idSource: e.idSource || 'browser',
        names: [],
        first: Infinity,
        last: 0,
        days: new Set(),
        visits: 0,
        events: 0,
        sessions: 0,
        rooms: new Set(),
        games: new Map(),
        roomsCreated: 0,
        gamesStarted: 0,
        lastVisitAt: 0,
        secondsOnSite: 0,
        device: null, os: null, osVersion: null, browser: null, browserVersion: null,
        resolution: null, viewport: null, dpr: null, cores: null, memoryGb: null,
        network: null, touch: false, theme: null, installed: false, saveData: false,
        tz: null, lang: null, langs: null, country: null, ref: null,
        orientation: null, colorDepth: null, model: null, arch: null, platformVersion: null,
        source: null, viaInvite: false, automated: false, loadMs: null,
      };
      byPerson.set(e.person, p);
    }

    const at = Date.parse(e.t);
    p.events += 1;
    p.first = Math.min(p.first, at);
    p.last = Math.max(p.last, at);
    p.days.add(e.t.slice(0, 10));
    if (e.name && !p.names.includes(e.name)) p.names.push(e.name);
    if (e.code) p.rooms.add(e.code);

    if (e.type === 'visit') {
      p.visits += 1;
      if (at - p.lastVisitAt > SESSION_GAP_MS) p.sessions += 1;
      p.lastVisitAt = at;
      // Keep the most recent device picture rather than the first — people upgrade.
      for (const k of ['device', 'os', 'osVersion', 'browser', 'browserVersion', 'resolution',
        'viewport', 'dpr', 'cores', 'memoryGb', 'network', 'theme', 'tz', 'lang', 'langs',
        'country', 'ref', 'orientation', 'colorDepth', 'model', 'arch', 'platformVersion',
        'loadMs']) {
        if (e[k] != null) p[k] = e[k];
      }
      p.touch = p.touch || Boolean(e.touch);
      p.installed = p.installed || Boolean(e.installed);
      p.saveData = p.saveData || Boolean(e.saveData);
      p.viaInvite = p.viaInvite || Boolean(e.viaInvite);
      p.automated = p.automated || Boolean(e.automated);
      p.source ||= e.utmSource || e.ref || (e.viaInvite ? 'invite link' : null);
    }
    if (e.type === 'left' && e.seconds) p.secondsOnSite += e.seconds;
    if (e.type === 'room_created') p.roomsCreated += 1;
    if (e.type === 'game_started') {
      p.gamesStarted += 1;
      if (e.game) p.games.set(e.game, (p.games.get(e.game) || 0) + 1);
    }
  }

  return [...byPerson.values()]
    .map((p) => ({
      ...p,
      names: p.names.length ? p.names : [],
      activeDays: p.days.size,
      sessions: Math.max(p.sessions, 1),
      rooms: p.rooms.size,
      games: [...p.games.entries()].sort((a, b) => b[1] - a[1]),
      played: p.rooms.size > 0,
      status: standing(p),
      days: undefined,
      lastVisitAt: undefined,
    }))
    .sort((a, b) => b.last - a.last);
}

// A plain-language read on how attached someone is, based only on how many separate days
// they turned up — the one signal that is hard to fake and easy to trust.
function standing(p) {
  const days = p.days.size;
  if (days >= 5) return { key: 'core', label: 'Regular', hint: `${days} days` };
  if (days >= 3) return { key: 'repeat', label: 'Coming back', hint: `${days} days` };
  if (days === 2) return { key: 'returned', label: 'Returned', hint: '2 days' };
  if (p.rooms.size === 0) return { key: 'peeked', label: 'Just looked', hint: 'never joined a room' };
  return { key: 'new', label: 'First time', hint: 'one day so far' };
}

export function people(range = 'all', limit = 200) {
  return foldPeople(eventsInRange(range)).slice(0, limit);
}

// One flat row per event, with the person attached, ready to drop into a table.
export function activity(range = 'all', limit = 500) {
  const list = eventsInRange(range);
  const nameByPerson = new Map();
  for (const e of list) if (e.person && e.name) nameByPerson.set(e.person, e.name);

  // Device details only arrive on a visit, so carry the last known picture forward onto
  // that person's later gameplay rows. Otherwise every game_started row reads as blank.
  const deviceByPerson = new Map();
  for (const e of list) {
    if (e.type === 'visit' && e.person) {
      deviceByPerson.set(e.person, {
        device: e.device,
        client: [e.os && e.osVersion ? `${e.os} ${e.osVersion}` : e.os,
          e.browser && e.browserVersion ? `${e.browser} ${e.browserVersion}` : e.browser]
          .filter(Boolean).join(' · ') || null,
        place: [e.country, e.tz].filter(Boolean).join(' · ') || null,
        source: e.utmSource || e.ref || (e.viaInvite ? 'invite link' : 'direct'),
      });
    }
  }

  return list.slice(-limit).reverse().map((e) => {
    const d = deviceByPerson.get(e.person) || {};
    return {
      id: e.id || ', ',
      t: e.t,
      type: e.type,
      person: e.person || null,
      name: e.name || nameByPerson.get(e.person) || null,
      code: e.code || null,
      game: e.game || null,
      players: e.players ?? null,
      result: e.winner
        ? `${e.winner} won${e.rounds ? `, ${e.rounds} rounds` : ''}`
        : e.seconds ? `${Math.round(e.seconds / 6) / 10}m` : null,
      device: e.device || d.device || null,
      client: d.client || null,
      place: d.place || null,
      source: e.utmSource || e.ref || (e.viaInvite ? 'invite link' : null) || d.source || null,
      detail: [e.roster, e.mode, e.model, e.resolution, e.langs,
        e.loadMs ? `loaded in ${(e.loadMs / 1000).toFixed(1)}s` : '']
        .filter(Boolean).join(' · ') || null,
    };
  });
}

// ---------------------------------------------------------------------------
// Product metrics
// ---------------------------------------------------------------------------
// The numbers that answer "is this worth putting money or time into?" rather than
// "what phone was that". Everything is derived from the same event log.
function productMetrics(list, folk) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const activeSince = (ms) => new Set(
    list.filter((e) => now - Date.parse(e.t) < ms && e.person).map((e) => e.person),
  ).size;

  // Funnel. Each step counts people, not events, so one enthusiast cannot inflate a stage
  // by doing the same thing twice. Each step is also intersected with the one above it, so
  // the funnel can only ever narrow: somebody who somehow started a game without the page
  // reporting a view still cannot make a later step exceed an earlier one.
  const setOf = (pred) => new Set(list.filter(pred).map((e) => e.person).filter(Boolean));
  const narrow = (prev, next) => new Set([...next].filter((id) => prev.has(id)));

  const opened = new Set(folk.map((p) => p.id));
  const named = narrow(opened, setOf((e) => Boolean(e.name)));
  const joined = narrow(named, setOf((e) => e.type === 'room_created' || e.type === 'room_joined'));
  const started = narrow(joined, setOf((e) => e.type === 'game_started'));
  const finished = narrow(started, setOf((e) => e.type === 'game_finished'));
  const visited = opened.size;
  const pct = (n) => (visited ? Math.round((n / visited) * 100) : 0);

  // Retention by cohort: of the people first seen on a given day, how many came back at
  // all on a later day. Below about ten people a day this is noise, and it says so.
  const firstDay = new Map();
  const daysByPerson = new Map();
  for (const e of list) {
    if (!e.person) continue;
    const d = e.t.slice(0, 10);
    if (!firstDay.has(e.person) || d < firstDay.get(e.person)) firstDay.set(e.person, d);
    if (!daysByPerson.has(e.person)) daysByPerson.set(e.person, new Set());
    daysByPerson.get(e.person).add(d);
  }
  const cohorts = new Map();
  for (const [person, first] of firstDay) {
    let c = cohorts.get(first);
    if (!c) cohorts.set(first, (c = { day: first, size: 0, returned: 0 }));
    c.size += 1;
    if (daysByPerson.get(person).size > 1) c.returned += 1;
  }

  const rooms = list.filter((e) => e.type === 'room_created');
  const starts = list.filter((e) => e.type === 'game_started');
  const ends = list.filter((e) => e.type === 'game_finished');
  const durations = ends.map((e) => e.seconds).filter(Number.isFinite).sort((a, b) => a - b);
  const sessions = list.filter((e) => e.type === 'left' && e.seconds)
    .map((e) => e.seconds).sort((a, b) => a - b);
  const median = (arr) => (arr.length ? arr[Math.floor(arr.length / 2)] : null);

  // Peak hours in the viewer's own clock, which is the one they schedule around.
  const hours = Array.from({ length: 24 }, () => 0);
  for (const e of list) {
    if (e.type !== 'visit') continue;
    // Bucketed in IST: the person reading the chart plans their evenings in it.
    const h = Number(new Date(e.t).toLocaleTimeString('en-GB', { timeZone: 'Asia/Kolkata', hour12: false, hour: '2-digit' }));
    hours[h % 24] += 1;
  }

  const dau = activeSince(day);
  const mau = activeSince(30 * day);

  return {
    funnel: [
      { step: 'Opened the app', people: visited, pct: visited ? 100 : 0 },
      { step: 'Picked a name', people: named.size, pct: pct(named.size) },
      { step: 'Got into a room', people: joined.size, pct: pct(joined.size) },
      { step: 'Started a game', people: started.size, pct: pct(started.size) },
      { step: 'Played one out', people: finished.size, pct: pct(finished.size) },
    ],
    active: {
      dau,
      wau: activeSince(7 * day),
      mau,
      stickiness: mau ? Math.round((dau / mau) * 100) : 0,
    },
    retention: [...cohorts.values()].sort((a, b) => b.day.localeCompare(a.day)).slice(0, 14)
      .map((c) => ({ ...c, pct: c.size ? Math.round((c.returned / c.size) * 100) : 0 })),
    reach: {
      rooms: rooms.length,
      avgPlayersPerRoom: starts.length
        ? Math.round((starts.reduce((n, e) => n + (e.players || 0), 0) / starts.length) * 10) / 10
        : 0,
      // How many people arrive on somebody else's invite link. This is the number that
      // decides whether the thing spreads on its own.
      viaInvite: folk.filter((p) => p.viaInvite).length,
      invitePct: folk.length
        ? Math.round((folk.filter((p) => p.viaInvite).length / folk.length) * 100) : 0,
      installed: folk.filter((p) => p.installed).length,
      countries: new Set(list.map((e) => e.country).filter(Boolean)).size,
    },
    play: {
      gamesStarted: starts.length,
      gamesFinished: ends.length,
      completionPct: starts.length ? Math.round((ends.length / starts.length) * 100) : 0,
      medianGameMin: durations.length ? Math.round(median(durations) / 6) / 10 : null,
      medianSessionMin: sessions.length ? Math.round(median(sessions) / 6) / 10 : null,
      gamesPerRoom: rooms.length ? Math.round((starts.length / rooms.length) * 10) / 10 : 0,
    },
    hours,
  };
}

export function summary(range = 'all') {
  const list = eventsInRange(range);
  const now = Date.now();
  const hour = list.filter((e) => now - Date.parse(e.t) < 60 * 60 * 1000);
  const today = list.filter((e) => now - Date.parse(e.t) < 24 * 60 * 60 * 1000);

  const tally = (rows, key) => {
    const counts = {};
    for (const e of rows) {
      const v = e[key];
      if (v) counts[v] = (counts[v] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  };

  const visits = list.filter((e) => e.type === 'visit');
  const folk = foldPeople(list);
  const repeat = folk.filter((p) => p.activeDays >= 2);

  return {
    range,
    totals: {
      events: list.length,
      visits: visits.length,
      uniqueVisitors: folk.length,
      visitsToday: today.filter((e) => e.type === 'visit').length,
      uniqueToday: new Set(today.filter((e) => e.type === 'visit').map((e) => e.person)).size,
      visitsLastHour: hour.filter((e) => e.type === 'visit').length,
      roomsCreated: list.filter((e) => e.type === 'room_created').length,
      gamesStarted: list.filter((e) => e.type === 'game_started').length,
      gamesFinished: list.filter((e) => e.type === 'game_finished').length,
      repeatPeople: repeat.length,
      repeatShare: folk.length ? Math.round((repeat.length / folk.length) * 100) : 0,
      playedShare: folk.length
        ? Math.round((folk.filter((p) => p.played).length / folk.length) * 100) : 0,
    },
    perDay: perDay(list),
    metrics: productMetrics(list, folk),
    players: tally(list.filter((e) => e.name), 'name'),
    devices: tally(visits, 'device'),
    networks: tally(visits, 'network'),
    resolutions: tally(visits, 'resolution'),
    themes: tally(visits, 'theme'),
    countries: tally(visits, 'country'),
    timezones: tally(visits, 'tz'),
    os: tally(visits, 'os'),
    browsers: tally(visits, 'browser'),
    screens: tally(visits, 'screen'),
    languages: tally(visits, 'lang'),
    referrers: tally(visits, 'ref'),
    games: tally(list.filter((e) => e.type === 'game_started'), 'game'),
    installed: visits.filter((e) => e.installed).length,
    touch: visits.filter((e) => e.touch).length,
    people: folk,
    activity: activity(range),
  };
}

// Visits and distinct people per calendar day, newest last — the shape of the trend.
function perDay(list) {
  const days = new Map();
  for (const e of list) {
    const day = e.t.slice(0, 10);
    let d = days.get(day);
    if (!d) days.set(day, (d = { day, visits: 0, people: new Set(), games: 0 }));
    if (e.type === 'visit') d.visits += 1;
    if (e.type === 'game_started') d.games += 1;
    if (e.person) d.people.add(e.person);
  }
  return [...days.values()]
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-90)
    .map((d) => ({ day: d.day, visits: d.visits, people: d.people.size, games: d.games }));
}

hydrate();

// Replay the remote mirror on top of the local file. Async, so the server starts serving
// immediately and the older history folds in a moment later. Events are merged by id and
// re-sorted, so overlapping local and remote history cannot double-count.
async function hydrateRemote() {
  if (!REMOTE || SILENT) return;
  try {
    const rows = await redis(['lrange', REDIS_KEY, String(-MAX_MEMORY_EVENTS), '-1']);
    if (!Array.isArray(rows) || !rows.length) return;

    const byId = new Map();
    const keyOf = (e) => e.id || `${e.t}|${e.type}|${e.person || ''}`;
    for (const e of events) byId.set(keyOf(e), e);
    let added = 0;
    for (const row of rows) {
      try {
        const e = JSON.parse(row);
        if (!e?.t || !e?.type) continue;
        const k = keyOf(e);
        if (byId.has(k)) continue;
        byId.set(k, e);
        added += 1;
      } catch { /* a truncated row */ }
    }
    if (!added) return;

    const merged = [...byId.values()].sort((a, b) => a.t.localeCompare(b.t));
    events.length = 0;
    events.push(...merged.slice(-MAX_MEMORY_EVENTS));
    for (const e of events) {
      const seq = Number(String(e.id || '').replace(/\D/g, ''));
      if (Number.isFinite(seq) && seq >= nextSeq) nextSeq = seq + 1;
    }
    console.log(`[usage] merged ${added} events from the remote mirror (${events.length} total)`);
  } catch (err) {
    console.warn(`[usage] could not read the remote mirror: ${err.message}`);
  }
}
hydrateRemote();
