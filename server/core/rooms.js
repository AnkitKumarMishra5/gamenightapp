// In-memory room registry and snapshot assembly.
import { aiAvailable } from '../lib/openai.js';
import * as blendin from '../games/blendin/engine.js';
import { DIFFICULTIES } from '../games/blendin/ai.js';
import * as island from '../games/island/engine.js';
import { GameError, cleanText, roomCode } from '../lib/util.js';
import { roomLeaderboard, SCORING_RULES } from './scores.js';

export const MAX_PLAYERS = 16;
// Rooms live in memory, so an unbounded number of them is a way to exhaust the process.
// Far above any real night, low enough that a script cannot walk the server out of RAM.
export const MAX_ROOMS = 2000;
const ROOM_IDLE_MS = 3 * 60 * 60 * 1000;   // drop rooms idle for 3h
const ROOM_ABANDONED_MS = 2 * 60 * 1000;   // drop rooms where everyone went offline 2min ago

export const rooms = new Map();

export function createRoom({ name, avatar, playerId, token }) {
  if (rooms.size >= MAX_ROOMS) {
    throw new GameError('The server is at capacity right now, try again in a few minutes.');
  }
  let code;
  do { code = roomCode(); } while (rooms.has(code));
  const room = {
    code,
    hostId: playerId,
    players: new Map(),
    game: null,
    settings: { blendin: { outsiders: 'auto', blank: true, difficulty: 'medium' } },
    state: null,
    scores: new Map(),      // playerId -> points, kept across games and rejoins
    createdAt: Date.now(),
    lastActivity: Date.now(),
    hostGraceTimer: null,
    aiBusyUntil: 0,
  };
  addPlayer(room, { name, avatar, playerId, token });
  rooms.set(code, room);
  return room;
}

export function getRoom(code) {
  const room = rooms.get(String(code || '').toUpperCase().trim());
  if (!room) throw new GameError('Room not found, check the code and try again.');
  return room;
}

export function addPlayer(room, { name, avatar, playerId, token }) {
  const cleanName = cleanText(name, 18);
  if (!cleanName) throw new GameError('Pick a name first!');
  if (!playerId || !token) throw new GameError('Missing player identity, refresh and try again.');
  if (room.players.size >= MAX_PLAYERS) throw new GameError(`This room is full (${MAX_PLAYERS} players max).`);
  const player = {
    id: playerId,
    token,
    name: cleanName,
    avatar: cleanText(avatar, 16) || '🙂',
    socketId: null,
    connected: false,
    joinedAt: Date.now(),
  };
  room.players.set(playerId, player);
  return player;
}

export function removePlayer(room, playerId) {
  room.players.delete(playerId);
  if (room.hostId === playerId) transferHost(room);
}

export function transferHost(room) {
  const candidates = [...room.players.values()]
    .filter((p) => p.connected)
    .sort((a, b) => a.joinedAt - b.joinedAt);
  const next = candidates[0] || [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt)[0];
  room.hostId = next ? next.id : null;
  return next;
}

// Close a room the moment its last player is gone, so codes are freed immediately
// instead of lingering until the next sweep. Returns true if the room was closed.
export function closeRoomIfEmpty(room) {
  if (!room || room.players.size > 0) return false;
  if (room.hostGraceTimer) clearTimeout(room.hostGraceTimer);
  rooms.delete(room.code);
  return true;
}

export function sweepRooms() {
  const now = Date.now();
  for (const [code, room] of rooms) {
    const anyoneConnected = [...room.players.values()].some((p) => p.connected);
    const idle = now - room.lastActivity;
    if ((!anyoneConnected && idle > ROOM_ABANDONED_MS) || idle > ROOM_IDLE_MS || room.players.size === 0) {
      if (room.hostGraceTimer) clearTimeout(room.hostGraceTimer);
      rooms.delete(code);
    }
  }
}

// A view of every live room for the owner's dashboard. Deliberately excludes anything
// secret — no words, roles or patterns — so having the dashboard open never gives the
// person running the server an advantage in a game they are also playing.
export function adminOverview() {
  const now = Date.now();
  return [...rooms.values()]
    .sort((a, b) => b.lastActivity - a.lastActivity)
    .map((room) => {
      const players = [...room.players.values()].sort((a, b) => a.joinedAt - b.joinedAt);
      const scores = room.scores || new Map();
      const state = room.state;
      return {
        code: room.code,
        game: room.game,
        phase: state?.phase || null,
        round: state?.round || state?.roundNum || null,
        ageMin: Math.round((now - room.createdAt) / 60000),
        idleSec: Math.round((now - room.lastActivity) / 1000),
        total: players.length,
        connected: players.filter((p) => p.connected).length,
        players: players.map((p) => ({
          name: p.name,
          avatar: p.avatar,
          person: p.person || null,
          host: room.hostId === p.id,
          connected: p.connected,
          joinedMinAgo: Math.round((now - p.joinedAt) / 60000),
          points: scores.get(p.id)?.total || 0,
        })),
      };
    });
}

export function snapshot(room, forPlayerId) {
  const you = room.players.get(forPlayerId);
  return {
    code: room.code,
    hostId: room.hostId,
    you: you ? { id: you.id, name: you.name, avatar: you.avatar, isHost: room.hostId === you.id } : null,
    players: [...room.players.values()]
      .sort((a, b) => a.joinedAt - b.joinedAt)
      .map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, connected: p.connected, isHost: room.hostId === p.id })),
    game: room.game,
    settings: room.settings,
    aiAvailable: aiAvailable(),
    limits: { biMin: blendin.BI_MIN_PLAYERS, biMax: blendin.BI_MAX_PLAYERS, islandMin: island.ISLAND_MIN_PLAYERS, roomMax: MAX_PLAYERS },
    // Sent to the client so the difficulty picker is generated from one list rather than
    // duplicated in the UI.
    difficulties: DIFFICULTIES,
    leaderboard: roomLeaderboard(room),
    scoringRules: SCORING_RULES,
    blendin: room.game === 'blendin' ? blendin.snapshot(room, forPlayerId) : null,
    island: room.game === 'island' ? island.snapshot(room, forPlayerId) : null,
  };
}
