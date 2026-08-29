// Game Night — © 2026 Ankit Kumar Mishra. All rights reserved. See LICENSE.
// Silent Order: a co-operative card game.
//
// Everyone holds numbers from 1 to 100 and the table must play them all onto one pile in
// ascending order. Nobody may say what they are holding. You play when you believe nothing
// lower is still out there, and the whole table lives or dies on that judgement.
//
// The engine is the referee for exactly one question: was anything lower still held? That
// is checked against every hand at the moment a card is played, so the verdict is never a
// matter of opinion and the clients never need to know each other's cards.
import { GameError, pick, shuffle } from '../../lib/util.js';
import { pickQuip } from '../../lib/quips.js';
import { POINTS, award } from '../../core/scores.js';

// The shared quip bank speaks in impostors and islands, and Silent Order has neither:
// one table wins or loses together. So the endings live here, next to the game they
// describe, instead of stretching a category that was written for someone else.
const SO_WIN_QUIPS = [
  'Not a word was spoken. Not a card was wasted. Take a bow 🃏',
  'The whole table, one brain. That was beautiful to watch.',
  'Perfect order, held to the very last card 🕯️',
  'You read each other like open books. Poker champions, beware.',
  'Every card in its place. The deck is impressed, and it has seen things.',
];
const SO_LOSS_QUIPS = [
  'The candles are out. The order broke 🕯️',
  'So close to silence, so loud at the end.',
  'The deck wins this one. It usually does.',
  'Three mistakes is all it takes. The table will talk about this one.',
  'The order fell apart, but what a way to go.',
];

export const SO_MIN_PLAYERS = 2;
export const SO_MAX_PLAYERS = 8;
export const DECK_HIGH = 100;
export const START_LIVES = 3;

// Fewer players means more cards each, so a run is a similar length either way.
export function levelsFor(playerCount) {
  if (playerCount <= 2) return 12;
  if (playerCount <= 3) return 10;
  if (playerCount <= 4) return 8;
  return 6;
}

function st(room) {
  if (room.game !== 'silentorder' || !room.state) throw new GameError('No Silent Order game is running.');
  return room.state;
}

function requireHost(room, playerId) {
  if (room.hostId !== playerId) throw new GameError('Only the room owner can do that.');
}

const handOf = (state, id) => state.hands[id] || [];

// Everyone still holding something, and connected enough to play it.
function playersWithCards(state) {
  return state.order.filter((id) => handOf(state, id).length > 0);
}

function dealLevel(room, state) {
  const deck = shuffle(Array.from({ length: DECK_HIGH }, (_, i) => i + 1));
  state.hands = {};
  let at = 0;
  for (const id of state.order) {
    state.hands[id] = deck.slice(at, at + state.level).sort((a, b) => a - b);
    at += state.level;
  }
  state.pile = [];
  state.discarded = [];
  // lastMistake deliberately survives the deal: a mistake can be the very play that
  // empties the hands, and wiping it here would erase the moment before any client had
  // a chance to show it. Clients de-duplicate by its id, so carrying it over is safe.
  state.dealtAt = Date.now();
  state.phase = 'dealing';
}

export function startGame(room, playerId) {
  requireHost(room, playerId);
  const ids = [...room.players.keys()].filter((id) => room.players.get(id).connected);
  if (ids.length < SO_MIN_PLAYERS) throw new GameError(`Silent Order needs at least ${SO_MIN_PLAYERS} connected players.`);
  if (ids.length > SO_MAX_PLAYERS) throw new GameError(`Silent Order supports up to ${SO_MAX_PLAYERS} players.`);
  // A double press on Start must not re-shuffle a run that is already under way.
  if (room.game === 'silentorder' && room.state?.kind === 'silentorder' && !room.state.over) {
    throw new GameError('A run is already going.');
  }

  room.game = 'silentorder';
  room.state = {
    kind: 'silentorder',
    startedAt: Date.now(),
    order: shuffle(ids),
    level: 1,
    maxLevel: levelsFor(ids.length),
    lives: START_LIVES,
    hands: {},
    pile: [],
    discarded: [],
    ready: [],
    lastMistake: null,
    mistakes: 0,
    won: false,
    over: false,
    startQuip: pickQuip('gameStart'),
    endQuip: '',
  };
  dealLevel(room, room.state);
  return { fx: [{ kind: 'game-start', game: 'silentorder' }, { kind: 'so-deal', level: 1 }] };
}

// The one gate check, shared by everything that can be the last straw: a ready press, a
// reconnection, or the missing player being removed. Play begins only when every player
// still present has confirmed their hand.
function beginIfAllReady(room, state) {
  if (state.phase !== 'dealing') return;
  const here = state.order.filter((id) => room.players.get(id)?.connected);
  if (here.length && here.every((id) => state.ready.includes(id))) {
    state.ready = [];
    state.phase = 'playing';
    return { fx: [{ kind: 'so-begin' }] };
  }
}

// Everyone confirms they have looked at their hand, which is also what gives the dealing
// animation time to finish before the first card can be played.
export function markReady(room, playerId) {
  const state = st(room);
  if (state.phase !== 'dealing') return;
  if (!state.order.includes(playerId)) throw new GameError('You are not in this game.');
  if (!state.ready.includes(playerId)) state.ready.push(playerId);
  return beginIfAllReady(room, state);
}

export function playLowest(room, playerId) {
  const state = st(room);
  if (state.phase !== 'playing') throw new GameError('Not playing right now.');
  if (state.over) throw new GameError('This run is over.');
  const hand = handOf(state, playerId);
  if (!hand.length) throw new GameError('You have nothing left to play.');

  const card = hand[0];                       // always the lowest you hold
  state.hands[playerId] = hand.slice(1);
  state.pile.push({ card, playerId });

  // The only judgement call in the game: was anything lower still out there?
  const missed = [];
  for (const id of state.order) {
    for (const c of handOf(state, id)) {
      if (c < card) missed.push({ card: c, playerId: id });
    }
  }

  const fx = [{ kind: 'so-play', card, playerId, ok: missed.length === 0 }];

  if (missed.length) {
    // Everything lower is burned, so the pile stays honestly ascending.
    for (const m of missed) {
      state.hands[m.playerId] = handOf(state, m.playerId).filter((c) => c !== m.card);
    }
    const burned = missed.map((m) => m.card).sort((a, b) => a - b);
    state.discarded.push(...burned);
    state.lives -= 1;
    // The id is what lets a client tell a new mistake from the one it has already
    // animated, and it survives reconnects where an fx event would not.
    state.mistakes = (state.mistakes || 0) + 1;
    state.lastMistake = { id: state.mistakes, card, by: playerId, burned };
    fx.push({ kind: 'so-mistake', card, by: playerId, burned, lives: state.lives });
    if (state.lives <= 0) return { fx: [...fx, ...endRun(room, state, false).fx] };
  } else {
    state.lastMistake = null;
    award(room, playerId, 'silentorder', POINTS.silentorder.goodCard, 'read the table');
  }

  // Level done when every hand is empty. Done is not the same as cleared: a burn that
  // empties the last hands still moves the run forward, but the level medal is only for
  // a level finished without a mistake on its final play.
  if (playersWithCards(state).length === 0) {
    if (!missed.length) {
      for (const id of state.order) {
        award(room, id, 'silentorder', POINTS.silentorder.levelCleared, `cleared level ${state.level}`);
      }
    }
    fx.push({ kind: 'so-level', level: state.level, lives: state.lives });
    if (state.level >= state.maxLevel) return { fx: [...fx, ...endRun(room, state, true).fx] };
    state.level += 1;
    dealLevel(room, state);
    fx.push({ kind: 'so-deal', level: state.level });
  }
  return { fx };
}

function endRun(room, state, won) {
  state.over = true;
  state.won = won;
  state.phase = 'over';
  state.endQuip = pick(won ? SO_WIN_QUIPS : SO_LOSS_QUIPS) || '';
  if (won) {
    for (const id of state.order) {
      award(room, id, 'silentorder', POINTS.silentorder.runWon, 'held the line to the end');
    }
  }
  return { fx: [{ kind: won ? 'so-won' : 'so-lost' }] };
}

export function nextRun(room, playerId) {
  requireHost(room, playerId);
  const state = st(room);
  if (!state.over) throw new GameError('This run is still going.');
  return startGame(room, playerId);
}

export function removePlayerFromGame(room, playerId) {
  const state = room.state;
  if (!state || room.game !== 'silentorder' || state.over) return { fx: [] };
  // Someone who was never dealt in leaves nothing behind, and announcing their exit
  // from a game they were not in only confuses the table.
  if (!state.order.includes(playerId)) return { fx: [] };
  // Their cards leave with them rather than blocking the level forever.
  const held = handOf(state, playerId);
  delete state.hands[playerId];
  state.order = state.order.filter((id) => id !== playerId);
  state.ready = state.ready.filter((id) => id !== playerId);
  if (state.order.length < SO_MIN_PLAYERS) return endRun(room, state, false);
  if (held.length) state.discarded.push(...held);

  // The player everyone was waiting on may be the one who just left: without this check
  // the ready gate could never open again, because nobody left has a reason to re-press.
  if (state.phase === 'dealing') {
    const begun = beginIfAllReady(room, state);
    if (begun) return begun;
  }

  if (state.phase === 'playing' && playersWithCards(state).length === 0) {
    // Their departure emptied the last hand, so the level completes for the people who
    // stayed — cleanly, with the clear's points and no life lost.
    const fx = [{ kind: 'so-level', level: state.level, lives: state.lives }];
    for (const id of state.order) {
      award(room, id, 'silentorder', POINTS.silentorder.levelCleared, `cleared level ${state.level}`);
    }
    if (state.level >= state.maxLevel) return { fx: [...fx, ...endRun(room, state, true).fx] };
    state.level += 1;
    dealLevel(room, state);
    return { fx: [...fx, { kind: 'so-deal', level: state.level }] };
  }
  return { fx: [{ kind: 'so-left', playerId, cards: held.length }] };
}

export function isStalled(room) {
  const state = room.state;
  if (!state || room.game !== 'silentorder' || state.over) return false;
  const present = [...room.players.values()].filter((p) => p.connected).length;
  if (present < SO_MIN_PLAYERS) return true;
  // A quieter dead end: every card left in the level is in a disconnected hand. Nobody
  // present can play, nothing can burn the stuck cards, and the level can never empty.
  if (state.phase === 'playing') {
    const holders = playersWithCards(state);
    if (holders.length && holders.every((id) => !room.players.get(id)?.connected)) return true;
  }
  return false;
}

export function onConnectivityChange(room) {
  const state = room.state;
  if (!state || room.game !== 'silentorder') return;
  return beginIfAllReady(room, state);
}

export function snapshot(room, forPlayerId) {
  const state = room.state;
  if (!state || room.game !== 'silentorder') return null;

  // Only ever your own numbers. Everyone else is a count, which is all the game allows
  // you to know and all any client is told.
  const counts = {};
  for (const id of state.order) counts[id] = handOf(state, id).length;

  return {
    phase: state.phase,
    // Stable for the whole run, so the client can key its card table on it and know a
    // new run from a new level.
    startedAt: state.startedAt,
    level: state.level,
    maxLevel: state.maxLevel,
    lives: state.lives,
    startLives: START_LIVES,
    order: state.order,
    counts,
    yourHand: handOf(state, forPlayerId),
    youPlay: state.order.includes(forPlayerId),
    youReady: state.ready.includes(forPlayerId),
    readyCount: state.ready.length,
    pile: state.pile.slice(-6).map((p) => ({ card: p.card, by: p.playerId })),
    topCard: state.pile.length ? state.pile[state.pile.length - 1].card : 0,
    played: state.pile.length,
    discarded: state.discarded.length,
    // The actual burned cards, not just the count: they landed face-up, so they are
    // public, and a reconnecting client needs them to redraw the discard row.
    discards: [...state.discarded],
    lastMistake: state.lastMistake
      ? { id: state.lastMistake.id, card: state.lastMistake.card, by: state.lastMistake.by, burned: state.lastMistake.burned }
      : null,
    over: state.over,
    won: state.won,
    startQuip: state.startQuip,
    endQuip: state.endQuip,
    deckHigh: DECK_HIGH,
  };
}
