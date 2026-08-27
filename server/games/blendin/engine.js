// Game Night — © 2026 Ankit Kumar Mishra. All rights reserved. See LICENSE.
// Blend In game engine. All functions mutate room.state and are called with the
// room lock held by the socket layer. They throw GameError for player-facing failures
// and may return { fx: [...] } transient events for the client to animate.
import { WORD_PAIRS } from './wordPairs.js';
import { pickQuip } from '../../lib/quips.js';
import { GameError, cleanText, normalize, pick, shuffle, wordsMatch } from '../../lib/util.js';
import { POINTS, award } from '../../core/scores.js';

export const BI_MIN_PLAYERS = 5;
export const BI_MAX_PLAYERS = 16;

// ---------- helpers ----------

function st(room) {
  if (room.game !== 'blendin' || !room.state) throw new GameError('No Blend In game is running.');
  return room.state;
}

function requireHost(room, playerId) {
  if (room.hostId !== playerId) throw new GameError('Only the room owner can do that.');
}

function requirePhase(state, ...phases) {
  if (!phases.includes(state.phase)) throw new GameError('That action is not available right now.');
}

function aliveIds(state) {
  return state.order.filter((id) => state.alive.has(id));
}

function aliveConnected(room, state) {
  return aliveIds(state).filter((id) => room.players.get(id)?.connected);
}

function outsidersAlive(state) {
  return aliveIds(state).filter((id) => state.roles[id] !== 'insider');
}

function insidersAlive(state) {
  return aliveIds(state).filter((id) => state.roles[id] === 'insider');
}

// Build this round's speaking queue: alive players in fixed order, rotated to start
// at startIdx, shifted so the Blank never speaks first (official rule).
function buildQueue(state) {
  const alive = aliveIds(state);
  const startId = state.order[state.startIdx];
  let startPos = alive.indexOf(startId);
  if (startPos === -1) {
    // startIdx player is dead: begin from the next alive player in order
    const n = state.order.length;
    for (let step = 1; step <= n; step++) {
      const cand = state.order[(state.startIdx + step) % n];
      if (state.alive.has(cand)) { startPos = alive.indexOf(cand); break; }
    }
  }
  let queue = alive.slice(startPos).concat(alive.slice(0, startPos));
  for (let i = 0; i < queue.length && state.roles[queue[0]] === 'blank'; i++) {
    queue = queue.slice(1).concat(queue[0]);
  }
  state.queue = queue;
  state.queuePos = 0;
}

// Suggested outsider count by table size: one more roughly every three players.
// 5-6 players → 1, 7-9 → 2, 10-12 → 3, and so on.
export function suggestedOutsiders(playerCount) {
  return Math.max(1, 1 + Math.floor((playerCount - 4) / 3));
}

export function roleCounts(playerCount, settings) {
  if (playerCount === 5) return { outsiders: 1, blank: true };
  const blank = settings?.blank !== false;
  // The outsiders must always stay outnumbered, and the Blank counts against their share.
  const minority = Math.floor((playerCount - 1) / 2);
  const maxOutsiders = Math.max(1, minority - (blank ? 1 : 0));
  const requested = settings?.outsiders === 'auto' || settings?.outsiders == null
    ? suggestedOutsiders(playerCount)
    : Number(settings.outsiders) || 1;
  const outsiders = Math.min(Math.max(1, requested), maxOutsiders);
  return { outsiders, blank };
}

// ---------- lifecycle ----------

// Step one, run the moment the owner presses start. It parks the room on a "dealing"
// screen so everybody sees something is happening while the AI picks the words, and so a
// second press cannot start two games.
export function beginDealing(room, playerId) {
  requireHost(room, playerId);
  const ids = [...room.players.keys()].filter((id) => room.players.get(id).connected);
  if (ids.length < BI_MIN_PLAYERS) throw new GameError(`Blend In needs at least ${BI_MIN_PLAYERS} connected players (you have ${ids.length}).`);
  if (ids.length > BI_MAX_PLAYERS) throw new GameError(`Blend In supports up to ${BI_MAX_PLAYERS} players.`);
  if (room.state?.kind === 'blendin' && room.state.phase === 'dealing') {
    throw new GameError('Already dealing, hold on.');
  }

  const usedWords = room.state?.kind === 'blendin' ? room.state.usedWords || [] : [];
  room.game = 'blendin';
  room.state = {
    kind: 'blendin',
    phase: 'dealing',
    startedAt: Date.now(),
    difficulty: room.settings.blendin.difficulty || 'medium',
    usedWords,
  };
  return { fx: [{ kind: 'bi-dealing' }] };
}

// Step two, once the pair is in hand. The pair comes from the AI when there is one and
// from the bank otherwise, so this function does not care which.
export function startGame(room, playerId, pair) {
  requireHost(room, playerId);
  const ids = [...room.players.keys()].filter((id) => room.players.get(id).connected);
  if (ids.length < BI_MIN_PLAYERS) throw new GameError(`Blend In needs at least ${BI_MIN_PLAYERS} connected players (you have ${ids.length}).`);
  if (ids.length > BI_MAX_PLAYERS) throw new GameError(`Blend In supports up to ${BI_MAX_PLAYERS} players.`);

  const { outsiders, blank } = roleCounts(ids.length, room.settings.blendin);
  const chosen = pair?.a && pair?.b ? pair : pick(WORD_PAIRS);
  const insiderWord = Math.random() < 0.5 ? chosen.a : chosen.b;
  const outsiderWord = insiderWord === chosen.a ? chosen.b : chosen.a;
  const usedWords = [
    ...(room.state?.kind === 'blendin' ? room.state.usedWords || [] : []),
    chosen.a, chosen.b,
  ].slice(-40);

  const shuffled = shuffle(ids);
  const roles = {};
  let cursor = 0;
  for (let i = 0; i < outsiders; i++) roles[shuffled[cursor++]] = 'outsider';
  if (blank) roles[shuffled[cursor++]] = 'blank';
  for (; cursor < shuffled.length; cursor++) roles[shuffled[cursor]] = 'insider';

  room.game = 'blendin';
  room.state = {
    kind: 'blendin',
    phase: 'reveal',
    startedAt: Date.now(),   // only used to measure how long a game runs
    round: 1,
    insiderWord,
    outsiderWord,
    wordSource: chosen.source || 'bank',
    difficulty: chosen.difficulty || room.settings.blendin.difficulty || 'medium',
    usedWords,
    roles,
    config: { outsiders, blank, insiders: ids.length - outsiders - (blank ? 1 : 0) },
    order: shuffle(ids),
    startIdx: 0,
    queue: [],
    queuePos: 0,
    alive: new Set(ids),
    clues: [],
    ready: new Set(),
    votes: {},
    runoff: null,
    eliminated: [],
    lastResult: null,
    pendingBlankId: null,
    winner: null,
    winReason: '',
    endQuip: '',
    startQuip: pickQuip('gameStart'),
  };
  buildQueue(room.state);
  return { fx: [{ kind: 'game-start', game: 'blendin' }] };
}

export function markReady(room, playerId) {
  const state = st(room);
  requirePhase(state, 'reveal');
  if (!state.alive.has(playerId)) throw new GameError('You are not in this game.');
  state.ready.add(playerId);
  const connected = aliveConnected(room, state);
  if (connected.every((id) => state.ready.has(id))) state.phase = 'describing';
}

export function forceDescribe(room, playerId) {
  const state = st(room);
  requireHost(room, playerId);
  requirePhase(state, 'reveal');
  state.phase = 'describing';
}

export function submitClue(room, playerId, payload) {
  const state = st(room);
  requirePhase(state, 'describing');
  const current = state.queue[state.queuePos];
  if (current !== playerId) throw new GameError('It is not your turn to describe.');

  const text = cleanText(payload?.text, 30);
  if (!text) throw new GameError('Type a clue first!');
  const norm = normalize(text);
  const role = state.roles[playerId];
  if (role !== 'blank') {
    const own = role === 'insider' ? state.insiderWord : state.outsiderWord;
    if (norm === normalize(own)) throw new GameError('You cannot say your own secret word!');
  }
  if (state.clues.some((c) => normalize(c.text) === norm)) {
    throw new GameError('Someone already used that clue. Say something new.');
  }

  state.clues.push({ round: state.round, playerId, text, skipped: false, id: `c${state.clues.length}`, reactions: {} });
  advanceTurn(state);
  return { fx: [{ kind: 'clue', playerId }] };
}

export function skipTurn(room, playerId) {
  const state = st(room);
  requireHost(room, playerId);
  requirePhase(state, 'describing');
  const current = state.queue[state.queuePos];
  if (!current) return;
  state.clues.push({ round: state.round, playerId: current, text: '—', skipped: true, id: `c${state.clues.length}`, reactions: {} });
  advanceTurn(state);
}

function advanceTurn(state) {
  state.queuePos += 1;
  if (state.queuePos >= state.queue.length) state.phase = 'discussion';
}

// `force` lets the room owner cut the describing phase short — plenty of tables give
// their clues out loud and only use the app to vote.
export function startVote(room, playerId, payload) {
  const state = st(room);
  requireHost(room, playerId);
  requirePhase(state, 'discussion', 'describing');
  if (state.phase === 'describing' && state.queuePos < state.queue.length && !payload?.force) {
    throw new GameError('Wait for everyone to give their clue first.');
  }
  if (state.phase === 'describing') {
    // Anyone who never typed is marked as having spoken aloud, so the board is honest.
    for (let i = state.queuePos; i < state.queue.length; i++) {
      state.clues.push({
        round: state.round, playerId: state.queue[i], text: '(said aloud)',
        skipped: true, id: `c${state.clues.length}`, reactions: {},
      });
    }
    state.queuePos = state.queue.length;
  }
  state.phase = 'voting';
  state.votes = {};
  state.runoff = null;
  return { fx: [{ kind: 'vote-start' }] };
}

// One reaction per player per clue; tapping the same one again removes it.
const REACTIONS = ['😂', '🤔', '😱', '🧐', '🔥', '💀'];
export function reactToClue(room, playerId, payload) {
  const state = st(room);
  if (!state.roles[playerId]) throw new GameError('Only players in this game can react.');
  const emoji = String(payload?.emoji || '');
  if (!REACTIONS.includes(emoji)) throw new GameError('Unknown reaction.');
  const clue = state.clues.find((c) => c.id === String(payload?.clueId || ''));
  if (!clue) throw new GameError('That clue is gone.');

  clue.reactions ||= {};
  const mine = clue.reactions[playerId];
  if (mine === emoji) delete clue.reactions[playerId];
  else clue.reactions[playerId] = emoji;
  return { fx: [{ kind: 'reaction', emoji, clueId: clue.id, playerId, added: mine !== emoji }] };
}

export function castVote(room, playerId, payload) {
  const state = st(room);
  requirePhase(state, 'voting', 'runoff');
  if (!state.alive.has(playerId)) throw new GameError('Eliminated players cannot vote.');
  const targetId = String(payload?.targetId || '');
  if (targetId === playerId) throw new GameError('You cannot vote for yourself.');
  if (!state.alive.has(targetId)) throw new GameError('That player is not in the game.');

  if (state.phase === 'runoff') {
    if (!state.runoff.candidates.includes(targetId)) throw new GameError('You can only vote for a tied player.');
    state.runoff.votes[playerId] = targetId;
  } else {
    state.votes[playerId] = targetId;
  }
  const resolved = maybeFinishVote(room, state);
  if (resolved) return resolved;
  return { fx: [{ kind: 'vote-cast', playerId }] };
}

// Called after every vote AND whenever a voter disconnects.
export function maybeFinishVote(room, state) {
  if (state.phase !== 'voting' && state.phase !== 'runoff') return;
  const votes = state.phase === 'runoff' ? state.runoff.votes : state.votes;
  const voters = aliveConnected(room, state);
  if (voters.length === 0) return;
  if (!voters.every((id) => votes[id])) return;
  return finishVote(room, state);
}

function tally(votes) {
  const counts = {};
  for (const target of Object.values(votes)) counts[target] = (counts[target] || 0) + 1;
  let max = 0;
  for (const n of Object.values(counts)) max = Math.max(max, n);
  const top = Object.keys(counts).filter((id) => counts[id] === max);
  return { counts, top, max };
}

function finishVote(room, state) {
  const isRunoff = state.phase === 'runoff';
  const votes = isRunoff ? state.runoff.votes : state.votes;
  if (isRunoff) state.runoffVotes = { ...votes };   // kept so eliminate() can credit voters
  const { counts, top } = tally(votes);

  if (top.length !== 1) {
    if (!isRunoff && top.length > 1) {
      // First tie of the round: runoff between the tied players.
      state.phase = 'runoff';
      state.runoff = { candidates: top, votes: {} };
      return { fx: [{ kind: 'vote-tie', quip: pickQuip('voteTie') }] };
    }
    // Second tie: nobody goes home this round.
    state.lastResult = { type: 'none', tally: counts, quip: pickQuip('voteTie') };
    state.phase = 'roundResult';
    return { fx: [{ kind: 'no-elimination' }] };
  }
  return eliminate(room, state, top[0], counts);
}

function eliminate(room, state, targetId, counts) {
  state.runoff = null;
  state.alive.delete(targetId);
  const role = state.roles[targetId];

  // Everyone who voted for an outsider that actually went home gets credit.
  if (role !== 'insider') {
    const ballots = { ...state.votes, ...(state.runoffVotes || {}) };
    for (const [voter, target] of Object.entries(ballots)) {
      if (target === targetId) award(room, voter, 'blendin', POINTS.blendin.correctVote, 'read the room');
    }
  }
  // Outsiders who lived through the round earn their keep.
  for (const id of aliveIds(state)) {
    if (state.roles[id] !== 'insider') {
      award(room, id, 'blendin', POINTS.blendin.survivedRound, 'survived a round undetected');
    }
  }
  state.eliminated.push({ playerId: targetId, role, round: state.round });
  state.lastResult = {
    type: 'elimination',
    playerId: targetId,
    role,
    tally: counts || null,
    quip: pickQuip('elimination'),
  };

  if (role === 'blank') {
    state.phase = 'blankGuess';
    state.pendingBlankId = targetId;
    return { fx: [{ kind: 'elimination', playerId: targetId, role }] };
  }
  const winner = checkWin(state);
  if (winner) return endGame(room, state, winner);
  state.phase = 'roundResult';
  return { fx: [{ kind: 'elimination', playerId: targetId, role }] };
}

export function blankGuess(room, playerId, payload) {
  const state = st(room);
  requirePhase(state, 'blankGuess');
  if (state.pendingBlankId !== playerId) throw new GameError('Only the eliminated Blank can guess.');
  const text = cleanText(payload?.text, 40);
  if (!text) throw new GameError('Type your guess first!');
  return resolveWhiteGuess(room, state, text);
}

export function skipBlankGuess(room, playerId) {
  const state = st(room);
  requireHost(room, playerId);
  requirePhase(state, 'blankGuess');
  return resolveWhiteGuess(room, state, null);
}

function resolveWhiteGuess(room, state, text) {
  const correct = text !== null && wordsMatch(text, state.insiderWord);
  // A wrong guess is often very close to the insider word, so showing it would hand the
  // surviving outsiders the answer. Only the Blank sees what was actually said, until
  // the reveal at the end.
  state.lastResult = {
    ...state.lastResult,
    blankGuess: { text: text ?? '(no guess)', correct, guesserId: state.pendingBlankId },
    quip: correct ? pickQuip('whiteGuessCorrect') : pickQuip('whiteGuessWrong'),
  };
  const blankId = state.pendingBlankId;
  state.pendingBlankId = null;

  if (correct) {
    if (blankId) award(room, blankId, 'blendin', POINTS.blendin.blankGuess, 'named the insiders\' word');
    return endGame(room, state, 'outsiders', 'The Blank named the secret word!');
  }
  const winner = checkWin(state);
  if (winner) return endGame(room, state, winner);
  state.phase = 'roundResult';
  return { fx: [{ kind: 'white-guess', correct }] };
}

// Official rules: insiders win once every outsider is out; the outsiders
// (outsiders + the Blank together) win by surviving until only 1 insider is left.
function checkWin(state) {
  const inf = outsidersAlive(state).length;
  const civ = insidersAlive(state).length;
  if (inf === 0) return 'insiders';
  if (civ <= 1) return 'outsiders';
  return null;
}

function endGame(room, state, winner, reason) {
  // Settle up before the screen changes.
  for (const id of Object.keys(state.roles)) {
    const role = state.roles[id];
    const survived = state.alive.has(id);
    if (winner === 'insiders' && role === 'insider') {
      award(room, id, 'blendin', POINTS.blendin.insiderWin, 'insiders won');
      if (survived) award(room, id, 'blendin', POINTS.blendin.survivorBonus, 'survived to the end');
    }
    if (winner === 'outsiders' && role !== 'insider') {
      award(room, id, 'blendin', POINTS.blendin.outsiderWin, 'outsiders won');
      if (survived) award(room, id, 'blendin', POINTS.blendin.survivorBonus, 'survived to the end');
    }
  }
  state.winner = winner;
  state.winReason = reason
    || (winner === 'insiders'
      ? 'Every outsider and the Blank was eliminated!'
      : 'The outsiders survived until only one insider was left!');
  state.endQuip = pickQuip(winner === 'insiders' ? 'insiderWin' : 'outsiderWin');
  state.phase = 'gameOver';
  return { fx: [{ kind: 'game-over', winner }] };
}

export function nextRound(room, playerId) {
  const state = st(room);
  requireHost(room, playerId);
  requirePhase(state, 'roundResult');
  state.round += 1;
  state.votes = {};
  state.runoff = null;
  // Rotate the starting describer to the next player in the fixed order.
  state.startIdx = (state.startIdx + 1) % state.order.length;
  buildQueue(state);
  state.phase = 'describing';
}

// Drop a player's own vote AND every vote cast FOR them, so a departed player
// can't still win the vote — and their voters are freed to vote again.
function dropVotesInvolving(votes, id) {
  delete votes[id];
  for (const [voter, target] of Object.entries(votes)) {
    if (target === id) delete votes[voter];
  }
}

// Host removed a player mid-game (kick or permanent leave): treat as an elimination
// outside voting, reveal the role, and re-check win conditions.
export function removePlayerFromGame(room, targetId) {
  const state = room.state;
  if (!state || room.game !== 'blendin' || state.phase === 'gameOver') return;

  // A pending the Blank is already out of `alive`, but his departure still has to
  // resolve the guess so the round can move on instead of stalling.
  if (state.pendingBlankId === targetId) {
    state.pendingBlankId = null;
    return resolveWhiteGuess(room, state, null);
  }
  if (!state.alive.has(targetId)) return;

  state.alive.delete(targetId);
  state.ready.delete(targetId);
  const role = state.roles[targetId];
  state.eliminated.push({ playerId: targetId, role, round: state.round, left: true });

  dropVotesInvolving(state.votes, targetId);
  if (state.runoff) {
    dropVotesInvolving(state.runoff.votes, targetId);
    state.runoff.candidates = state.runoff.candidates.filter((id) => id !== targetId);
  }

  // The speaking queue exists from the reveal phase onward, so clean it in every
  // phase — otherwise a departed player leaves a ghost turn behind.
  const pos = state.queue.indexOf(targetId);
  if (pos !== -1) {
    if (pos < state.queuePos) state.queuePos -= 1;
    state.queue.splice(pos, 1);
    if (state.phase === 'describing' && state.queuePos >= state.queue.length) state.phase = 'discussion';
  }

  // Win checks are deliberately skipped during blankGuess: the Blank's one guess
  // must resolve first (resolveWhiteGuess re-checks right after).
  if (state.phase !== 'blankGuess') {
    const winner = checkWin(state);
    if (winner) return endGame(room, state, winner);
  }

  if (state.phase === 'reveal') return onConnectivityChange(room);
  if (state.phase === 'blankGuess') return;
  if (state.phase === 'runoff') {
    if (state.runoff.candidates.length === 1) return eliminate(room, state, state.runoff.candidates[0], null);
    if (state.runoff.candidates.length === 0) {
      state.runoff = null;
      state.lastResult = { type: 'none', tally: null, quip: pickQuip('voteTie') };
      state.phase = 'roundResult';
      return { fx: [{ kind: 'no-elimination' }] };
    }
  }
  return maybeFinishVote(room, state);
}

// Re-check auto-advance conditions when a player connects or disconnects:
// the reveal phase waits on all CONNECTED players, and voting completes when
// every connected alive player has voted.
// True when the game is running but nobody who could move it along is connected. Someone
// rejoining an abandoned room would otherwise land on a vote that can never finish, with
// no control on screen to escape it.
export function isStalled(room) {
  const state = room.state;
  if (!state || room.game !== 'blendin') return false;
  // gameOver has its own buttons, and dealing is over in a second.
  if (state.phase === 'gameOver' || state.phase === 'dealing') return false;
  // One person cannot play a social deduction game, whoever they are. This catches both
  // the spectator alone in an abandoned room and the last player still standing.
  const present = [...room.players.values()].filter((p) => p.connected).length;
  return present < 2 || aliveConnected(room, state).length === 0;
}

export function onConnectivityChange(room) {
  const state = room.state;
  if (!state || room.game !== 'blendin' || state.phase === 'gameOver') return;
  if (state.phase === 'reveal') {
    const connected = aliveConnected(room, state);
    if (connected.length > 0 && connected.every((id) => state.ready.has(id))) state.phase = 'describing';
    return;
  }
  return maybeFinishVote(room, state);
}

// ---------- snapshot ----------

export function snapshot(room, forPlayerId) {
  const state = room.state;
  if (!state || room.game !== 'blendin') return null;
  // The dealing screen exists before any roles do, so it answers early and on its own.
  if (state.phase === 'dealing') {
    return { phase: 'dealing', difficulty: state.difficulty || 'medium' };
  }
  const over = state.phase === 'gameOver';
  const role = state.roles[forPlayerId] || null;
  const inGame = Boolean(role);
  const votesMap = state.phase === 'runoff' ? state.runoff?.votes || {} : state.votes;

  // the Blank's guess is usually a near-miss on the insider word, so sending the text to
  // everyone would hand the surviving outsiders the answer. Only the guesser sees it
  // before the reveal — the verdict itself is public, since the table needs to know.
  let lastResult = state.lastResult;
  if (lastResult?.blankGuess && !over && lastResult.blankGuess.guesserId !== forPlayerId) {
    const { text, ...rest } = lastResult.blankGuess;
    lastResult = { ...lastResult, blankGuess: rest };
  }

  return {
    phase: state.phase,
    round: state.round,
    difficulty: state.difficulty || 'medium',
    wordSource: state.wordSource || 'bank',
    config: state.config,
    order: state.order,
    queue: state.queue,
    currentTurn: state.phase === 'describing' ? state.queue[state.queuePos] || null : null,
    alive: [...state.alive],
    clues: state.clues,
    readyCount: state.ready.size,
    youReady: state.ready.has(forPlayerId),
    votesCast: Object.keys(votesMap).length,
    votersNeeded: (state.phase === 'voting' || state.phase === 'runoff') ? aliveConnected(room, state).length : 0,
    youVoted: Boolean(votesMap[forPlayerId]),
    yourVote: votesMap[forPlayerId] || null,
    runoffCandidates: state.runoff?.candidates || null,
    eliminated: state.eliminated,
    lastResult,
    pendingBlankId: state.pendingBlankId,
    winner: state.winner,
    winReason: state.winReason,
    endQuip: state.endQuip,
    startQuip: state.startQuip,
    you: inGame
      ? {
          alive: state.alive.has(forPlayerId),
          isBlank: role === 'blank',
          word: role === 'blank' ? null : (role === 'insider' ? state.insiderWord : state.outsiderWord),
        }
      : null,
    reveal: over
      ? { insiderWord: state.insiderWord, outsiderWord: state.outsiderWord, roles: state.roles }
      : null,
  };
}
