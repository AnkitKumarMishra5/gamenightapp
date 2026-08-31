// Game Night — © 2026 Ankit Kumar Mishra. All rights reserved. See LICENSE.
// Swap or Stay: push-your-luck Cucù for 3 to 10 players.
//
// Everyone is dealt one face-down card and gets exactly one decision: keep it, or force a
// trade with the neighbour on their left. The dealer, acting last, trades with the deck
// instead. Then every card is turned over at once and the lowest one costs its holder a
// life. Four Sentinels hide in the deck: worth 99, they never lose, and anyone who tries
// to swap into one is publicly bounced off it.
//
// The engine's whole job is to keep the cards honest: who holds what is secret until the
// reveal, so no snapshot ever carries another player's card, and every public event
// (a stay, a swap, a blocked swap, a dealer draw) is described without values.
import { GameError, pick, shuffle } from '../../lib/util.js';
import { pickQuip } from '../../lib/quips.js';
import { POINTS, award } from '../../core/scores.js';

export const SS_MIN_PLAYERS = 3;
export const SS_MAX_PLAYERS = 10;
export const START_LIVES = 3;
export const SENTINEL_VALUE = 99;
const DECK_HIGH = 40;
const SENTINELS = 4;

// The point values live in core/scores.js like every game's. The fallback
// keeps the engine playable before that entry lands, and defers to it the moment it does.
function pts() {
  return POINTS.swaporstay || { roundSurvived: 1, gameWon: 6 };
}

// Flavour lines of our own: the shared quip bank talks about insiders and islands, and a
// card game deserves its own voice.
const ROUND_QUIPS = [
  'The felt claims another heart 💔',
  'Low card, long face.',
  'That is what greed looks like, folks.',
  'Somebody swapped into trouble.',
  'The deck giveth, the deck taketh away.',
  'Ouch. Shuffle it off.',
];
const OUT_QUIPS = [
  'And down they go! 💀',
  'Out of hearts, out of the game.',
  'The table just got smaller.',
  'Gone, but the snacks remember them.',
  'Three strikes. Enjoy the show!',
];
const SPARED_QUIPS = [
  'Everyone would have gone down — the table laughs it off 😅',
  'Total wipeout averted. Nobody loses!',
  'The cards blinked first. Free round!',
  'Too brutal even for this deck. All spared.',
];
const WIN_QUIPS = [
  'Last one standing takes the table 👑',
  'Outlasted, outswapped, outright winner!',
  'Three hearts of pure nerve.',
  'The table is theirs. Bow accordingly.',
  'Survived every low card in the deck!',
];

// ---------- helpers ----------

function st(room) {
  if (room.game !== 'swaporstay' || !room.state) throw new GameError('No Swap or Stay game is running.');
  return room.state;
}

function requireHost(room, playerId) {
  if (room.hostId !== playerId) throw new GameError('Only the room owner can do that.');
}

function requirePhase(state, ...phases) {
  if (!phases.includes(state.phase)) throw new GameError('That move is not available right now.');
}

function freshDeck() {
  const cards = [];
  for (let v = 1; v <= DECK_HIGH; v++) cards.push({ v, sentinel: false });
  for (let i = 0; i < SENTINELS; i++) cards.push({ v: SENTINEL_VALUE, sentinel: true });
  return shuffle(cards);
}

function aliveIds(state) {
  return state.order.filter((id) => (state.lives[id] || 0) > 0);
}

function aliveConnected(room, state) {
  return aliveIds(state).filter((id) => room.players.get(id)?.connected);
}

// The next living player clockwise from a seat, in the fixed seating order. Dead seats
// are walked straight past, which is the rule that keeps swaps working at any table size.
function nextAlive(state, fromId) {
  const n = state.order.length;
  const at = state.order.indexOf(fromId);
  for (let step = 1; step <= n; step++) {
    const cand = state.order[(at + step) % n];
    if (cand !== fromId && (state.lives[cand] || 0) > 0) return cand;
  }
  return null;
}

function setAction(state, action) {
  // The seq is how clients tell a fresh action from one they have already animated,
  // and it survives reconnects where a transient fx event would not.
  state.actionSeq += 1;
  state.lastAction = { ...action, seq: state.actionSeq };
  // The same beats kept as a list, so a player who looks away can still read the round
  // back. Card values are never in here: only who did what to whom.
  state.log = state.log || [];
  state.log.push({
    seq: state.actionSeq, round: state.round,
    kind: action.kind, by: action.by, with: action.with || null,
  });
}

function dealRound(state) {
  const alive = aliveIds(state);
  // The stock must cover one card per living player plus one more for the dealer's draw.
  // When it cannot, everything already spent is shuffled back in — nothing is in anyone's
  // hand between rounds, so the discard pile is the whole rest of the deck.
  if (state.deck.length < alive.length + 1) {
    state.deck = shuffle([...state.deck, ...state.discard]);
    state.discard = [];
  }
  state.hands = {};
  for (const id of alive) state.hands[id] = state.deck.shift();
  // Acting order: clockwise starting on the dealer's left, dealer last.
  const di = alive.indexOf(state.dealerId);
  state.actingOrder = [...alive.slice(di + 1), ...alive.slice(0, di + 1)];
  state.turnIdx = 0;
  state.acted = [];
  state.ready = [];
  state.lastAction = null;
  state.reveal = null;
  state.losers = [];
  state.eliminatedThisRound = [];
  state.spared = false;
  state.roundQuip = '';
  state.phase = 'dealing';
}

// ---------- lifecycle ----------

export function startGame(room, playerId) {
  requireHost(room, playerId);
  const ids = [...room.players.keys()].filter((id) => room.players.get(id).connected);
  if (ids.length < SS_MIN_PLAYERS) throw new GameError(`Swap or Stay needs at least ${SS_MIN_PLAYERS} connected players (you have ${ids.length}).`);
  if (ids.length > SS_MAX_PLAYERS) throw new GameError(`Swap or Stay seats up to ${SS_MAX_PLAYERS} players.`);
  // Start is for starting, never for erasing: a live table cannot be wiped by the host
  // pressing the button again, and switching games goes through room:setGame's own gate.
  if (room.state && !(room.state.kind === 'swaporstay' && room.state.phase === 'gameOver')) {
    throw new GameError('A game is already going. Finish it first.');
  }

  room.game = 'swaporstay';
  room.state = {
    kind: 'swaporstay',
    startedAt: Date.now(),
    round: 1,
    order: shuffle(ids),               // seating, fixed for the whole game
    lives: Object.fromEntries(ids.map((id) => [id, START_LIVES])),
    // Round one: the room owner deals, provided they are seated; a start issued for a
    // host who is not at the table falls to the first seat instead of a ghost dealer.
    dealerId: ids.includes(playerId) ? playerId : ids[0],
    deck: freshDeck(),
    discard: [],
    hands: {},
    actingOrder: [],
    turnIdx: 0,
    acted: [],
    ready: [],
    lastAction: null,
    log: [],
    actionSeq: 0,
    reveal: null,
    losers: [],
    eliminatedThisRound: [],
    spared: false,
    winnerId: null,
    startQuip: pickQuip('gameStart'),
    roundQuip: '',
    endQuip: '',
  };
  dealRound(room.state);
  return { fx: [{ kind: 'game-start', game: 'swaporstay' }, { kind: 'ss-deal', round: 1 }] };
}

// Everyone confirms they have peeked at their card, which doubles as the time the deal
// animation needs to finish before the first turn can begin.
export function markReady(room, playerId) {
  const state = st(room);
  if (state.phase !== 'dealing') return;
  if ((state.lives[playerId] || 0) <= 0) throw new GameError('You are not in this round.');
  if (!state.ready.includes(playerId)) state.ready.push(playerId);
  return maybeBegin(room, state);
}

// Waits only on the people who can actually press the button: a player who has dropped
// off must never hold the whole table on the dealing screen.
function maybeBegin(room, state) {
  if (state.phase !== 'dealing') return;
  const here = aliveConnected(room, state);
  if (here.length && here.every((id) => state.ready.includes(id))) {
    state.phase = 'acting';
    return { fx: [{ kind: 'ss-begin', turnId: state.actingOrder[0] || null }] };
  }
}

// The one move of the game. Exactly one per player per round, in acting order.
export function choice(room, playerId, payload) {
  const state = st(room);
  requirePhase(state, 'acting');
  if ((state.lives[playerId] || 0) <= 0) throw new GameError('You are out of this one — enjoy the show.');
  const turnId = state.actingOrder[state.turnIdx];
  if (playerId !== turnId) throw new GameError('Hold on, it is not your turn yet.');
  const act = payload?.action;
  if (act !== 'stay' && act !== 'swap') throw new GameError('Pick swap or stay.');

  if (act === 'stay') {
    setAction(state, { kind: 'stay', by: playerId });
  } else if (playerId === state.dealerId) {
    // The dealer has nobody left to swap with, so their swap trades with the deck: the
    // old card is spent and the top of the stock replaces it, sight unseen.
    if (!state.deck.length) {
      state.deck = shuffle(state.discard);
      state.discard = [];
    }
    const drawn = state.deck.shift();
    state.discard.push(state.hands[playerId]);
    state.hands[playerId] = drawn;
    setAction(state, { kind: 'draw', by: playerId });
  } else {
    const targetId = nextAlive(state, playerId);
    if (state.hands[targetId].sentinel) {
      // A Sentinel blocks the trade and is shown to the whole table doing it. That is
      // public knowledge by rule, and the only card ever revealed before the flip.
      setAction(state, { kind: 'blocked', by: playerId, with: targetId });
    } else {
      const mine = state.hands[playerId];
      state.hands[playerId] = state.hands[targetId];
      state.hands[targetId] = mine;
      setAction(state, { kind: 'swap', by: playerId, with: targetId });
    }
  }

  state.acted.push(playerId);
  state.turnIdx += 1;
  const fx = [{ kind: 'ss-choice', ...state.lastAction }];
  if (state.turnIdx >= state.actingOrder.length) fx.push(...revealRound(room, state));
  return { fx };
}

// The dealer has acted: turn everything over and settle up.
function revealRound(room, state) {
  state.reveal = state.actingOrder.map((id) => ({
    id,
    v: state.hands[id].v,
    sentinel: state.hands[id].sentinel,
    lostLife: false,
  }));

  // The lowest numeric card loses; every holder of it if there is a tie. A Sentinel is
  // never in the running: 99 beats everything, and it is immune by rule besides.
  const numbers = state.reveal.filter((r) => !r.sentinel);
  let losers = [];
  if (numbers.length) {
    const low = Math.min(...numbers.map((r) => r.v));
    losers = numbers.filter((r) => r.v === low);
  }

  // Mercy rule: if the same reveal would put every remaining player out at once, nobody
  // loses a life. A game that ends with zero players standing has no winner to crown.
  const alive = aliveIds(state);
  const wouldWipe = losers.length > 0
    && losers.length === alive.length
    && losers.every((r) => state.lives[r.id] === 1);
  state.spared = losers.length === 0 || wouldWipe;

  state.eliminatedThisRound = [];
  if (!state.spared) {
    for (const r of losers) {
      r.lostLife = true;
      state.lives[r.id] -= 1;
      if (state.lives[r.id] <= 0) state.eliminatedThisRound.push(r.id);
    }
  }
  state.losers = state.spared ? [] : losers.map((r) => r.id);

  // Everyone who lives to see another deal earns a little something for it.
  for (const id of aliveIds(state)) {
    award(room, id, 'swaporstay', pts().roundSurvived, 'lived to see another deal');
  }

  // The cards have been seen, so they are spent: back to the discard for the reshuffle.
  for (const id of Object.keys(state.hands)) state.discard.push(state.hands[id]);
  state.hands = {};

  state.roundQuip = state.spared
    ? pick(SPARED_QUIPS)
    : (state.eliminatedThisRound.length ? pick(OUT_QUIPS) : pick(ROUND_QUIPS));

  const fx = [{
    kind: 'ss-reveal',
    losers: state.losers,
    eliminated: state.eliminatedThisRound,
    spared: state.spared,
  }];

  const left = aliveIds(state);
  if (left.length <= 1) return [...fx, ...endGame(room, state, left[0] || null)];
  state.phase = 'result';
  return fx;
}

function endGame(room, state, winnerId) {
  state.winnerId = winnerId;
  state.phase = 'gameOver';
  state.endQuip = pick(WIN_QUIPS);
  if (winnerId) award(room, winnerId, 'swaporstay', pts().gameWon, 'outlasted the whole table');
  return [{ kind: 'ss-over', winnerId }];
}

// One button on the host's screen for both jobs: from a round result it deals the next
// round, and from a finished game it starts a new one with everyone connected.
// Table reactions: stateless, broadcast-only. The seed makes every phone play the same
// clip, and nothing is stored because a laugh is not game state.
const SS_REACTIONS = ['😂', '😱', '🔥', '💀', '🤔', '🧐', '😭'];
export function react(room, playerId, payload) {
  const state = st(room);
  if (!state.order.includes(playerId)) throw new GameError('Only players at this table can react.');
  const emoji = String(payload?.emoji || '');
  if (!SS_REACTIONS.includes(emoji)) throw new GameError('Unknown reaction.');
  return { fx: [{ kind: 'ss-react', playerId, emoji, seed: Math.floor(Math.random() * 1e6) }] };
}

export function next(room, playerId) {
  const state = st(room);
  requireHost(room, playerId);
  if (state.phase === 'gameOver') return startGame(room, playerId);
  requirePhase(state, 'result');
  state.round += 1;
  // The deal rotates clockwise among the living. Walking from the old dealer's seat
  // works whether or not they survived the round they just dealt.
  state.dealerId = nextAlive(state, state.dealerId) || aliveIds(state)[0];
  dealRound(state);
  return { fx: [{ kind: 'ss-deal', round: state.round }] };
}

// ---------- departures ----------

// A player leaving for good (kick or permanent leave). Their card goes back to the pile
// so the deck stays complete, their pending turn simply never happens, and the dealer's
// duty passes on if it was theirs.
export function removePlayerFromGame(room, targetId) {
  const state = room.state;
  if (!state || room.game !== 'swaporstay' || state.phase === 'gameOver') return { fx: [] };
  if (!state.order.includes(targetId)) return { fx: [] };

  const wasAlive = (state.lives[targetId] || 0) > 0;
  // Computed before the seat disappears, because "the next player round from here" only
  // means something while the seat is still in the order.
  const successor = wasAlive ? nextAlive(state, targetId) : null;
  // The seat one step behind, for anchoring the deal rotation when the dealer's own
  // chair vanishes: next() advances one step from the anchor, so anchoring at the
  // predecessor makes the next deal land exactly where the vanished chair would have
  // passed it. Anchoring at the successor instead would skip a seat.
  const at = state.order.indexOf(targetId);
  const predecessor = state.order[(at - 1 + state.order.length) % state.order.length] || null;

  if (state.hands[targetId]) {
    state.discard.push(state.hands[targetId]);
    delete state.hands[targetId];
  }
  state.order = state.order.filter((id) => id !== targetId);
  delete state.lives[targetId];
  state.ready = state.ready.filter((id) => id !== targetId);
  state.acted = state.acted.filter((id) => id !== targetId);

  // A spectator leaving takes nothing but their chair - unless that chair was still
  // anchoring the deal rotation, which re-anchors one seat back so nothing is skipped.
  if (!wasAlive) {
    if (state.dealerId === targetId && predecessor !== targetId) state.dealerId = predecessor;
    return { fx: [{ kind: 'ss-left', playerId: targetId }] };
  }
  // A live dealer leaving mid-round hands the rest of their duty to the next chair.
  if (state.dealerId === targetId && successor) state.dealerId = successor;

  const pos = state.actingOrder.indexOf(targetId);
  if (pos !== -1) {
    state.actingOrder.splice(pos, 1);
    // A seat removed from behind the cursor shifts everything one place left.
    if (pos < state.turnIdx) state.turnIdx -= 1;
  }

  const fx = [{ kind: 'ss-left', playerId: targetId }];

  const left = aliveIds(state);
  if (left.length <= 1) return { fx: [...fx, ...endGame(room, state, left[0] || null)] };

  if (state.phase === 'dealing') {
    const begun = maybeBegin(room, state);
    if (begun) fx.push(...begun.fx);
  } else if (state.phase === 'acting' && state.turnIdx >= state.actingOrder.length) {
    // The leaver was the last one still to act, so the reveal happens without them.
    fx.push(...revealRound(room, state));
  }
  return { fx };
}

// True when the game is running but nobody present can move it forward. Someone
// rejoining an abandoned round needs the app to hand them a way back to the lobby.
export function isStalled(room) {
  const state = room.state;
  if (!state || room.game !== 'swaporstay') return false;
  if (state.phase === 'gameOver') return false;
  const present = [...room.players.values()].filter((p) => p.connected).length;
  return present < 2 || aliveConnected(room, state).length === 0;
}

// The dealing gate waits on connected players only, so it has to be re-checked whenever
// somebody drops or comes back.
export function onConnectivityChange(room) {
  const state = room.state;
  if (!state || room.game !== 'swaporstay') return;
  return maybeBegin(room, state);
}

// ---------- snapshot ----------

export function snapshot(room, forPlayerId) {
  const state = room.state;
  if (!state || room.game !== 'swaporstay') return null;
  const showReveal = state.phase === 'result' || state.phase === 'gameOver';
  const alive = aliveIds(state);
  const hand = state.hands[forPlayerId] || null;

  return {
    phase: state.phase,
    round: state.round,
    startedAt: state.startedAt,
    dealerId: state.dealerId,
    turnId: state.phase === 'acting' ? state.actingOrder[state.turnIdx] || null : null,
    // The living players in fixed seating order: the table the client draws. Eliminated
    // players keep their lives entry (at zero) but lose their seat.
    order: alive,
    aliveIds: alive,
    lives: { ...state.lives },
    startLives: START_LIVES,
    // Your own card and nobody else's. What is not sent cannot be read in devtools.
    yourCard: hand ? { v: hand.v, sentinel: hand.sentinel } : null,
    youAlive: (state.lives[forPlayerId] || 0) > 0,
    youReady: state.ready.includes(forPlayerId),
    readyCount: state.ready.length,
    acted: [...state.acted],
    // Public table talk only: who stayed, who swapped with whom, who bounced off a
    // Sentinel, who drew. Never a card value.
    lastAction: state.lastAction,
    log: (state.log || []).slice(-24),
    reveal: showReveal ? state.reveal : null,
    losers: showReveal ? state.losers : [],
    eliminated: showReveal ? state.eliminatedThisRound : [],
    spared: showReveal ? state.spared : false,
    deckLeft: state.deck.length,
    winnerId: state.winnerId,
    startQuip: state.startQuip,
    roundQuip: showReveal ? state.roundQuip : '',
    endQuip: state.endQuip,
  };
}
