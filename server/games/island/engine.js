// Game Night — © 2026 Ankit Kumar Mishra. All rights reserved. See LICENSE.
// The Island game engine. Turn-based pattern induction with two gamemaster modes:
//   'ai'   — OpenAI invents the pattern and judges; everyone (host included) plays.
//   'host' — the room owner knows the pattern (own or "surprise" from the bank) and judges.
// AI judging is async: attempts sit in verdict 'pending' until resolved by the socket layer.
import { ISLAND_PATTERNS } from './patterns.js';
import { aiAvailable } from '../../lib/openai.js';
import { pickQuip } from '../../lib/quips.js';
import { GameError, cleanText, normalize, pick, randomId, shuffle } from '../../lib/util.js';
import { POINTS, award } from '../../core/scores.js';

export const ISLAND_MIN_PLAYERS = 2; // guessing participants, excluding a host gamemaster
export const MAX_PATTERN_GUESSES = 3; // a fourth wrong guess puts you out for the round

function st(room) {
  if (room.game !== 'island' || !room.state) throw new GameError('No Island game is running.');
  return room.state;
}

function requireHost(room, playerId) {
  if (room.hostId !== playerId) throw new GameError('Only the room owner can do that.');
}

// ---------- lifecycle ----------

export function startGame(room, playerId, payload) {
  requireHost(room, playerId);
  const mode = payload?.mode === 'host' ? 'host' : 'ai';
  if (mode === 'ai' && !aiAvailable()) {
    throw new GameError('The AI Gamemaster is unavailable right now, choose "You are the Gamemaster" instead.');
  }
  const connected = [...room.players.keys()].filter((id) => room.players.get(id).connected);
  const participants = mode === 'host' ? connected.filter((id) => id !== playerId) : connected;
  if (participants.length < ISLAND_MIN_PLAYERS) {
    throw new GameError(`The Island needs at least ${ISLAND_MIN_PLAYERS} guessing players${mode === 'host' ? ' besides you' : ''}.`);
  }

  room.game = 'island';
  room.state = {
    kind: 'island',
    phase: 'setup',
    startedAt: Date.now(),   // only used to measure how long a game runs
    mode,
    gmId: mode === 'host' ? playerId : null,
    roundNum: (room.state?.kind === 'island' ? room.state.roundNum : 0) + 1,
    pattern: null,
    bankEntry: null, // full bank entry when pattern came from the bank (mock judging hints)
    order: [],
    turnPtr: 0,
    attempts: [],
    solvedOrder: [],
    wrongGuesses: {},   // playerId -> count, reset each round
    knockedOut: [],     // spent all three guesses
    hints: [],          // items the boat gives away, two per completed lap
    turnsTaken: 0,      // how many turns have resolved, used to count laps
    scores: room.state?.kind === 'island' ? room.state.scores : {},
    pendingJudge: null,
    usedPatternNames: room.state?.kind === 'island' ? room.state.usedPatternNames : [],
    endedBy: null,
    startQuip: pickQuip('gameStart'),
  };
  return { fx: [{ kind: 'game-start', game: 'island' }] };
}

function beginPlaying(room, state, pattern, bankEntry) {
  state.pattern = pattern;
  state.bankEntry = bankEntry || null;
  state.usedPatternNames.push(pattern.name);
  const connected = [...room.players.keys()].filter((id) => room.players.get(id).connected);
  const participants = state.mode === 'host' ? connected.filter((id) => id !== state.gmId) : connected;
  if (participants.length < ISLAND_MIN_PLAYERS) throw new GameError('Not enough connected players to start.');
  state.order = shuffle(participants);
  state.turnPtr = 0;
  state.attempts = [];
  state.solvedOrder = [];
  state.wrongGuesses = {};
  state.knockedOut = [];
  state.hints = [];
  state.turnsTaken = 0;
  state.pendingJudge = null;
  state.endedBy = null;
  state.phase = 'playing';
  // Running the round for everyone else is worth something.
  if (state.mode === 'host' && state.gmId) {
    award(room, state.gmId, 'island', POINTS.island.gamemaster, 'ran a round as gamemaster');
  }
}

// Host wrote their own pattern, or asked for a surprise one from the bank.
export function setupHostPattern(room, playerId, payload) {
  const state = st(room);
  requireHost(room, playerId);
  if (state.phase !== 'setup') throw new GameError('The round is already underway.');
  if (state.mode !== 'host') throw new GameError('You are not the gamemaster this round.');
  state.gmId = playerId;

  if (payload?.surprise) {
    const avoid = new Set(state.usedPatternNames.map(normalize));
    const options = ISLAND_PATTERNS.filter((p) => !avoid.has(normalize(p.name)));
    const entry = pick(options.length ? options : ISLAND_PATTERNS);
    beginPlaying(room, state, {
      name: entry.name, description: entry.description, starters: entry.starters.slice(0, 2), source: 'bank',
    }, entry);
    return { fx: [{ kind: 'island-open' }] };
  }

  const name = cleanText(payload?.name, 80);
  const description = cleanText(payload?.description, 300);
  const s1 = cleanText(payload?.starters?.[0], 40);
  const s2 = cleanText(payload?.starters?.[1], 40);
  if (!description) throw new GameError('Describe the secret pattern (this is your judging rule).');
  if (!s1 || !s2) throw new GameError('Give two opening items that fit the pattern.');
  beginPlaying(room, state, { name: name || 'Secret pattern', description, starters: [s1, s2], source: 'host' });
  return { fx: [{ kind: 'island-open' }] };
}

// AI mode: socket layer calls ai.generatePattern() and passes the result here.
export function setupAIPattern(room, playerId, pattern, bankEntry) {
  const state = st(room);
  requireHost(room, playerId);
  if (state.phase !== 'setup') throw new GameError('The round is already underway.');
  if (state.mode !== 'ai') throw new GameError('This round has a human gamemaster.');
  beginPlaying(room, state, pattern, bankEntry);
  return { fx: [{ kind: 'island-open' }] };
}

// ---------- turns ----------

function currentPlayer(state) {
  return state.order[state.turnPtr] || null;
}

function requireTurn(room, state, playerId) {
  if (state.phase !== 'playing') throw new GameError('The round is not in play.');
  if (state.pendingJudge) throw new GameError('Hold on. The last attempt is still being judged.');
  if (state.knockedOut.includes(playerId)) throw new GameError('You are out for this round, sit tight for the reveal.');
  if (currentPlayer(state) !== playerId) throw new GameError('It is not your turn.');
}

export function guessesLeft(state, playerId) {
  return Math.max(0, MAX_PATTERN_GUESSES - (state.wrongGuesses?.[playerId] || 0));
}

export function advanceTurn(room, state) {
  const n = state.order.length;
  if (n === 0) return;
  state.turnsTaken = (state.turnsTaken || 0) + 1;
  for (let step = 1; step <= n; step++) {
    const idx = (state.turnPtr + step) % n;
    const id = state.order[idx];
    if (room.players.get(id)?.connected && !state.knockedOut.includes(id)) { state.turnPtr = idx; return; }
  }
  // Everyone left is out or offline — park the pointer rather than spinning.
  state.turnPtr = (state.turnPtr + 1) % n;
}

// A lap is one turn for every player still in the round. Finish a lap and the boat gives
// something away: two more items it will accept. It is the pressure valve for a pattern
// nobody is getting, and it costs nothing but the round taking longer.
export const HINT_SIZE = 2;

export function lapsCompleted(state) {
  const n = Math.max(state.order?.length || 0, 1);
  return Math.floor((state.turnsTaken || 0) / n);
}

export function hintsAvailable(state) {
  return Math.max(0, lapsCompleted(state) - (state.hints?.length || 0));
}

// Everything already on the table, so a hint never repeats a word the room has seen.
export function knownItems(state) {
  return [
    ...(state.pattern?.starters || []),
    ...state.attempts.filter((a) => a.type === 'item').map((a) => a.text),
    ...(state.hints || []).flatMap((h) => h.items),
  ];
}

// Anyone can ask, not just whoever's turn it is: the hint helps the whole boat.
export function requestHint(room, playerId) {
  const state = st(room);
  if (state.phase !== 'playing') throw new GameError('Hints are only for a round in progress.');
  if (state.pendingJudge) throw new GameError('Wait for the current call to be judged.');
  if (playerId === state.gmId) throw new GameError('You wrote the pattern, you already know.');
  if (hintsAvailable(state) < 1) {
    const n = Math.max(state.order.length, 1);
    const left = n - ((state.turnsTaken || 0) % n);
    throw new GameError(`No hint yet. ${left} more turn${left === 1 ? '' : 's'} to finish this lap.`);
  }
  return state;
}

export function applyHint(room, playerId, items) {
  const state = st(room);
  const clean = items.map((t) => cleanText(t, 40)).filter(Boolean).slice(0, HINT_SIZE);
  if (!clean.length) throw new GameError('The boat had nothing else to offer, try again.');
  state.hints.push({ items: clean, byId: playerId, at: Date.now() });
  return {
    fx: [{ kind: 'island-hint', items: clean, playerId }],
  };
}

export function attemptItem(room, playerId, payload) {
  const state = st(room);
  requireTurn(room, state, playerId);
  const text = cleanText(payload?.text, 40);
  if (!text) throw new GameError('Name the thing you want to bring!');
  const norm = normalize(text);
  if (state.pattern.starters.some((s) => normalize(s) === norm)
    || state.attempts.some((a) => a.type === 'item' && normalize(a.text) === norm)) {
    throw new GameError('That item has already been tried. Pick something new.');
  }
  const attempt = {
    id: randomId(10), playerId, type: 'item', text,
    verdict: 'pending', remark: '', round: state.roundNum, ts: Date.now(),
  };
  state.attempts.push(attempt);
  state.pendingJudge = { attemptId: attempt.id };
  return { attempt };
}

export function attemptPattern(room, playerId, payload) {
  const state = st(room);
  requireTurn(room, state, playerId);
  if (state.solvedOrder.includes(playerId)) throw new GameError('You already cracked it, give item hints instead!');
  if (guessesLeft(state, playerId) <= 0) throw new GameError('You have used all three guesses this round.');
  const text = cleanText(payload?.text, 200);
  if (!text) throw new GameError('Describe the pattern you think it is!');
  const attempt = {
    id: randomId(10), playerId, type: 'pattern', text,
    verdict: 'pending', remark: '', round: state.roundNum, ts: Date.now(),
  };
  state.attempts.push(attempt);
  state.pendingJudge = { attemptId: attempt.id };
  return { attempt };
}

export function passTurn(room, playerId) {
  const state = st(room);
  requireTurn(room, state, playerId);
  if (!state.solvedOrder.includes(playerId)) throw new GameError('Only players who solved the pattern can pass.');
  advanceTurn(room, state);
}

// The judge did not recognise the text as a real thing. Discard the attempt, leave the
// turn where it is, and tell just that player so they can try again.
export function rejectInvalidItem(room, attemptId) {
  const state = st(room);
  const attempt = state.attempts.find((a) => a.id === attemptId);
  if (!attempt || attempt.verdict !== 'pending') return null;
  state.attempts = state.attempts.filter((a) => a.id !== attemptId);
  state.pendingJudge = null;
  return { playerId: attempt.playerId, text: attempt.text };
}

// Resolve a pending attempt (from the AI, or from the host's judge buttons).
export function resolveAttempt(room, attemptId, result) {
  const state = st(room);
  const attempt = state.attempts.find((a) => a.id === attemptId);
  if (!attempt || attempt.verdict !== 'pending') throw new GameError('That attempt was already judged.');
  state.pendingJudge = null;

  const fx = [];
  if (attempt.type === 'item') {
    attempt.verdict = result.fits ? 'yes' : 'no';
    attempt.remark = result.remark || pickQuip(result.fits ? 'itemYes' : 'itemNo');
    fx.push({ kind: 'island-item', fits: result.fits, playerId: attempt.playerId });
  } else {
    attempt.verdict = result.correct ? 'correct' : 'wrong';
    attempt.remark = result.remark || pickQuip(result.correct ? 'patternCorrect' : 'patternWrong');
    // The judge's own words can describe the rule, so everyone else sees a canned
    // line instead until the reveal.
    attempt.publicRemark = pickQuip(result.correct ? 'patternCorrect' : 'patternWrong');
    if (result.correct) {
      state.solvedOrder.push(attempt.playerId);
      const rank = state.solvedOrder.length;
      const points = rank === 1 ? POINTS.island.solveFirst
        : rank === 2 ? POINTS.island.solveSecond
        : rank === 3 ? POINTS.island.solveThird
        : POINTS.island.solveOther;
      state.scores[attempt.playerId] = (state.scores[attempt.playerId] || 0) + points;
      award(room, attempt.playerId, 'island', points, `cracked the pattern (#${rank})`);
      fx.push({ kind: 'island-solved', playerId: attempt.playerId, rank });
    } else {
      // Three strikes and you sit out the rest of the round.
      state.wrongGuesses[attempt.playerId] = (state.wrongGuesses[attempt.playerId] || 0) + 1;
      const left = guessesLeft(state, attempt.playerId);
      attempt.guessesLeft = left;
      if (left <= 0 && !state.knockedOut.includes(attempt.playerId)) {
        state.knockedOut.push(attempt.playerId);
        fx.push({ kind: 'island-knocked-out', playerId: attempt.playerId });
      } else {
        fx.push({ kind: 'island-wrong-pattern', playerId: attempt.playerId, guessesLeft: left });
      }
    }
  }

  const unsolved = state.order.filter((id) => !state.solvedOrder.includes(id) && !state.knockedOut.includes(id));
  if (unsolved.length === 0) {
    state.endedBy = 'all-solved';
    state.phase = 'reveal';
    fx.push({ kind: 'island-over' });
  } else {
    advanceTurn(room, state);
  }
  return { fx };
}

// Host abandons a stuck pending judgment (e.g. the AI failed repeatedly).
export function cancelPending(room, playerId) {
  const state = st(room);
  requireHost(room, playerId);
  if (!state.pendingJudge) return;
  const attempt = state.attempts.find((a) => a.id === state.pendingJudge.attemptId);
  if (attempt && attempt.verdict === 'pending') state.attempts = state.attempts.filter((a) => a !== attempt);
  state.pendingJudge = null;
}

export function hostJudge(room, playerId, payload) {
  const state = st(room);
  if (state.mode !== 'host') throw new GameError('The AI is the judge this round.');
  if (state.gmId !== playerId) throw new GameError('Only the gamemaster can judge.');
  if (!state.pendingJudge || state.pendingJudge.attemptId !== payload?.attemptId) {
    throw new GameError('Nothing is waiting for your judgment.');
  }
  const attempt = state.attempts.find((a) => a.id === payload.attemptId);
  if (!attempt) throw new GameError('Attempt not found.');
  const approve = Boolean(payload?.approve);
  return resolveAttempt(room, attempt.id, attempt.type === 'item' ? { fits: approve } : { correct: approve });
}

export function endRound(room, playerId) {
  const state = st(room);
  requireHost(room, playerId);
  if (state.phase !== 'playing') throw new GameError('No round to end.');
  state.pendingJudge = null;
  state.endedBy = 'host';
  state.phase = 'reveal';
  return { fx: [{ kind: 'island-over' }] };
}

export function removePlayerFromGame(room, targetId) {
  const state = room.state;
  if (!state || room.game !== 'island') return;
  if (state.mode === 'host' && state.gmId === targetId) {
    // The only person who knows the pattern has left — reveal it rather than
    // handing the secret to a player who is still guessing.
    if (state.phase === 'reveal') return;
    state.pendingJudge = null;
    state.endedBy = 'gm-left';
    state.phase = 'reveal';
    return { fx: [{ kind: 'island-over' }] };
  }
  const idx = state.order.indexOf(targetId);
  if (idx === -1) return;
  const wasCurrent = currentPlayer(state) === targetId;
  state.order.splice(idx, 1);
  if (idx < state.turnPtr) state.turnPtr -= 1;
  if (state.turnPtr >= state.order.length) state.turnPtr = 0;
  state.solvedOrder = state.solvedOrder.filter((id) => id !== targetId);

  if (state.phase !== 'playing') return;
  if (state.order.length === 0) { state.endedBy = 'host'; state.phase = 'reveal'; return; }
  if (state.pendingJudge) {
    const attempt = state.attempts.find((a) => a.id === state.pendingJudge.attemptId);
    if (attempt?.playerId === targetId) {
      state.attempts = state.attempts.filter((a) => a !== attempt);
      state.pendingJudge = null;
    }
  }
  if (wasCurrent && !state.pendingJudge) {
    state.turnPtr = state.turnPtr % state.order.length;
    if (!room.players.get(currentPlayer(state))?.connected) advanceTurn(room, state);
  }
  const unsolved = state.order.filter((id) => !state.solvedOrder.includes(id) && !state.knockedOut.includes(id));
  if (unsolved.length === 0) {
    state.pendingJudge = null;
    state.endedBy = 'all-solved';
    state.phase = 'reveal';
    return { fx: [{ kind: 'island-over' }] };
  }
}

// Skip over the current player if they disconnect mid-turn (no pending judgment).
export function onConnectivityChange(room) {
  const state = room.state;
  if (!state || room.game !== 'island' || state.phase !== 'playing' || state.pendingJudge) return;
  const current = currentPlayer(state);
  if (current && !room.players.get(current)?.connected) advanceTurn(room, state);
}

// ---------- snapshot ----------

export function snapshot(room, forPlayerId) {
  const state = room.state;
  if (!state || room.game !== 'island') return null;
  const isGM = state.mode === 'host' && forPlayerId === state.gmId;
  const revealed = state.phase === 'reveal';

  const attempts = state.attempts.map((a) => {
    // Pattern guess text stays hidden from other players until the reveal,
    // so a correct guess can't be read off the screen. The judge must see it.
    const canSeeText = a.type === 'item' || revealed || a.playerId === forPlayerId || isGM;
    return { ...a, text: canSeeText ? a.text : null, remark: canSeeText ? a.remark : (a.publicRemark || '') };
  });

  return {
    phase: state.phase,
    mode: state.mode,
    roundNum: state.roundNum,
    order: state.order,
    currentTurn: state.phase === 'playing' && !state.pendingJudge ? currentPlayer(state) : null,
    attempts,
    solvedOrder: state.solvedOrder,
    knockedOut: state.knockedOut || [],
    yourGuessesLeft: guessesLeft(state, forPlayerId),
    maxGuesses: MAX_PATTERN_GUESSES,
    youKnockedOut: (state.knockedOut || []).includes(forPlayerId),
    scores: state.scores,
    starters: state.pattern?.starters || null,
    hints: (state.hints || []).map((h) => ({ items: h.items, byId: h.byId })),
    hintsAvailable: hintsAvailable(state),
    turnsToNextHint: (() => {
      const n = Math.max(state.order.length, 1);
      return hintsAvailable(state) > 0 ? 0 : n - ((state.turnsTaken || 0) % n);
    })(),
    pendingJudge: state.pendingJudge
      ? {
          attemptId: state.pendingJudge.attemptId,
          type: state.attempts.find((a) => a.id === state.pendingJudge.attemptId)?.type || 'item',
          playerId: state.attempts.find((a) => a.id === state.pendingJudge.attemptId)?.playerId || null,
          youJudge: isGM,
        }
      : null,
    youAreGamemaster: isGM,
    gmId: state.gmId || null,
    youSolved: state.solvedOrder.includes(forPlayerId),
    yourRank: state.solvedOrder.indexOf(forPlayerId) + 1 || null,
    youPlay: state.order.includes(forPlayerId),
    pattern: (isGM || revealed) && state.pattern
      ? { name: state.pattern.name, description: state.pattern.description, source: state.pattern.source }
      : null,
    gmHints: isGM && state.bankEntry
      ? { examples: state.bankEntry.examples, nonExamples: state.bankEntry.nonExamples }
      : null,
    endedBy: state.endedBy,
    startQuip: state.startQuip,
    aiAvailable: aiAvailable(),
  };
}
