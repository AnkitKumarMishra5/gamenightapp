// Game Night — © 2026 Ankit Kumar Mishra. All rights reserved. See LICENSE.
// Sleepless: a night-and-day social deduction game.
//
// One Prowler hunts by night. One Medic guards a door. One Oracle reads a face. Everyone
// else is a Sleeper with nothing but instincts and a vote. Nights alternate with daytime
// votes until the Prowler is voted out (the village wins) or almost nobody is left
// standing (the Prowler wins).
//
// The one rule everything below serves: nothing a player knows in secret may ever reach
// another player's snapshot. Night picks are stored but only ever surfaced as a count,
// the Oracle's reading goes to the Oracle alone, votes stay sealed until the last one is
// in, and the full role map exists in a snapshot only once the game is over.
import { GameError, pick, shuffle } from '../../lib/util.js';
import { pickQuip } from '../../lib/quips.js';
import { POINTS, award } from '../../core/scores.js';

export const SL_MIN_PLAYERS = 4;
export const SL_MAX_PLAYERS = 16;

// The engine reads its point values through this so it still runs (and the tests still
// pass) if the scores.js entries land a beat later than this file. The real values live
// in WIRING.md for the integrator to add; these mirror them exactly.
const P = () => POINTS.sleepless || {
  villageWinAlive: 4, villageWinDead: 2, medicSave: 2, oracleRead: 3,
  prowlerWin: 8, prowlerSurvivedVote: 1, instinct: 1,
};

const ROLES = ['prowler', 'medic', 'oracle'];
// Big tables get a pack, not a lone hunter: one Prowler up to eight players, two from
// nine, three from fourteen. The Medic and Oracle stay singular at every size.
const prowlerCountFor = (n) => (n >= 14 ? 3 : n >= 9 ? 2 : 1);

// ---------- helpers ----------

function st(room) {
  if (room.game !== 'sleepless' || !room.state) throw new GameError('No Sleepless game is running.');
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

function roleHolder(state, role) {
  return state.order.find((id) => state.roles[id] === role) || null;
}

function prowlerIds(state) {
  return state.order.filter((id) => state.roles[id] === 'prowler');
}

function prowlersAlive(state) {
  return prowlerIds(state).filter((id) => state.alive.has(id));
}

function prowlerAlive(state) {
  return prowlersAlive(state).length > 0;
}

// ---------- lifecycle ----------

export function startGame(room, playerId) {
  requireHost(room, playerId);
  const ids = [...room.players.keys()].filter((id) => room.players.get(id).connected);
  if (ids.length < SL_MIN_PLAYERS) throw new GameError(`Sleepless needs at least ${SL_MIN_PLAYERS} connected players (you have ${ids.length}).`);
  if (ids.length > SL_MAX_PLAYERS) throw new GameError(`Sleepless supports up to ${SL_MAX_PLAYERS} players.`);
  // Start is for starting, never for erasing: a live game cannot be re-dealt from under
  // the table by the host, and switching games goes through room:setGame's own gate.
  if (room.state && !(room.state.kind === 'sleepless' && room.state.phase === 'gameOver')) {
    throw new GameError('A game is already going. Finish it first.');
  }

  // Two independent shuffles: one decides who gets which role, the other decides the
  // seating order, so a seat at the table says nothing about the card in front of it.
  const dealt = shuffle(ids);
  const roles = {};
  const packSize = prowlerCountFor(ids.length);
  dealt.forEach((id, i) => {
    roles[id] = i < packSize ? 'prowler'
      : i === packSize ? 'medic'
      : i === packSize + 1 ? 'oracle'
      : 'sleeper';
  });

  room.game = 'sleepless';
  room.state = {
    kind: 'sleepless',
    phase: 'dealing',
    startedAt: Date.now(),
    round: 0,                    // becomes 1 the moment the first night falls
    order: shuffle(ids),
    roles,
    alive: new Set(ids),
    left: new Set(),             // walked out mid-game; their role stays hidden until the end
    ready: new Set(),
    night: {},                   // playerId -> targetId, wiped every dusk
    dawn: null,                  // the last morning's public result
    dawnSeq: 0,                  // bumps every dawn so clients can play the reveal exactly once
    oracle: null,                // { targetId, isProwler } — surfaces only in the Oracle's snapshot
    oracleHit: false,            // scoring: did the Oracle ever read the Prowler
    medicSaves: 0,               // scoring: nights where the guard was on the right door
    instinct: {},                // scoring: per-Sleeper nights their watch was on a Prowler's door
    witness: {},                 // per-Sleeper private clue from watching the attacked door
    votesSurvived: 0,            // scoring: completed votes the Prowler walked away from
    votes: {},                   // playerId -> targetId | 'skip', sealed until all are in
    verdict: null,               // { outId, role, tie, tally, skips } once a vote resolves
    winner: null,                // { side, prowlerId } once it is decided
    startQuip: pickQuip('gameStart'),
    endQuip: '',
  };
  return { fx: [{ kind: 'game-start', game: 'sleepless' }] };
}

// Everyone confirms they have peeked at their role card, which also gives the dealing
// animation room to finish before the first night falls.
export function markReady(room, playerId) {
  const state = st(room);
  requirePhase(state, 'dealing');
  if (!state.alive.has(playerId)) throw new GameError('You are not in this game.');
  state.ready.add(playerId);
  const here = aliveConnected(room, state);
  if (here.length && here.every((id) => state.ready.has(id))) return beginNight(state);
}

function beginNight(state) {
  state.round += 1;
  state.phase = 'night';
  state.night = {};
  state.votes = {};
  state.verdict = null;
  return { fx: [{ kind: 'sl-night', round: state.round }] };
}

// ---------- night ----------

// Every living player submits a pick, whatever their role, so nobody's screen time gives
// them away. The Sleeper's pick is recorded and then deliberately never read again.
export function submitNight(room, playerId, payload) {
  const state = st(room);
  requirePhase(state, 'night');
  if (!state.alive.has(playerId)) throw new GameError('The night is not yours anymore. You are watching.');

  const targetId = String(payload?.targetId || '');
  if (!state.alive.has(targetId)) throw new GameError('Pick someone who is still in the game.');
  const role = state.roles[playerId];
  // Only the Medic may point at their own door; everyone else must look outward.
  if (targetId === playerId && role !== 'medic') throw new GameError('Pick someone other than yourself.');
  if (role === 'prowler' && state.roles[targetId] === 'prowler') {
    throw new GameError('The pack hunts outward. Pick someone else.');
  }

  // Last write wins until the night resolves, so a changed mind costs nothing.
  state.night[playerId] = targetId;

  const fx = [{ kind: 'sl-tuck', submitted: Object.keys(state.night).length, total: aliveIds(state).length }];
  const resolved = maybeResolveNight(room, state);
  if (resolved) return { fx: [...fx, ...resolved.fx] };
  return { fx };
}

// The night waits for EVERY living player, connected or not — a briefly-dropped phone
// must not have its pick made for it. The escape hatches for a player who never returns
// are removal (which drops them from the wait set) and the stalled-room check.
function maybeResolveNight(room, state) {
  if (state.phase !== 'night') return;
  const waiting = aliveIds(state);
  if (!waiting.length || !waiting.every((id) => state.night[id])) return;
  return resolveDawn(room, state);
}

function resolveDawn(room, state) {
  const prowlerId = roleHolder(state, 'prowler');
  const medicId = roleHolder(state, 'medic');
  const oracleId = roleHolder(state, 'oracle');

  // The Oracle's reading is taken before anyone dies, and never leaves their snapshot.
  if (oracleId && state.alive.has(oracleId)) {
    const targetId = state.night[oracleId];
    const isProwler = state.roles[targetId] === 'prowler';
    state.oracle = { targetId, isProwler, round: state.round };
    if (isProwler) state.oracleHit = true;
  }

  // The pack hunts together: each living Prowler names a door, the most-named door is
  // the kill, and a split vote falls to chance among the tied doors.
  const packPicks = prowlersAlive(state).map((id) => state.night[id]).filter(Boolean);
  let victim = null;
  if (packPicks.length) {
    const counts = {};
    for (const t of packPicks) counts[t] = (counts[t] || 0) + 1;
    const max = Math.max(...Object.values(counts));
    victim = pick(Object.keys(counts).filter((t) => counts[t] === max));
  }
  const guard = medicId && state.alive.has(medicId) ? state.night[medicId] : null;

  // The Sleepers' watch pays out here, before anyone dies, while "who was where" is
  // still true. One pick, two silent rewards, nothing announced at dawn:
  //  - a watch on a Prowler's door banks an Instinct point, revealed only at game over;
  //  - a watch on the attacked door witnesses the scuffle, and the watcher privately
  //    learns one player who is provably not a Prowler. Live ammunition for the day.
  for (const id of aliveIds(state)) {
    if (state.roles[id] !== 'sleeper') continue;
    const door = state.night[id];
    if (!door) continue;
    if (state.roles[door] === 'prowler' && state.alive.has(door)) {
      state.instinct[id] = (state.instinct[id] || 0) + 1;
    }
    if (victim && door === victim) {
      const cleared = pick(aliveIds(state).filter((c) =>
        c !== id && c !== victim && state.roles[c] !== 'prowler'));
      if (cleared) state.witness[id] = { round: state.round, clearedId: cleared };
    }
  }

  state.dawnSeq += 1;

  if (victim && guard === victim) {
    // A save is announced but never located: naming the survivor would hand the table
    // both the Medic's read and the Prowler's target for free.
    state.dawn = { kind: 'saved', seq: state.dawnSeq, round: state.round };
    state.medicSaves += 1;
  } else if (victim) {
    state.alive.delete(victim);
    state.dawn = { kind: 'death', victimId: victim, role: state.roles[victim], seq: state.dawnSeq, round: state.round };
  } else {
    // Only reachable if the Prowler was removed mid-resolution, which ends the game
    // elsewhere — but a quiet morning is still a correct morning.
    state.dawn = { kind: 'saved', seq: state.dawnSeq, round: state.round };
  }

  const fx = [{ kind: 'sl-dawn', result: state.dawn.kind, round: state.round }];
  const winner = checkWin(state);
  if (winner) return { fx: [...fx, ...endGame(room, state, winner).fx] };
  state.phase = 'day';
  state.votes = {};
  return { fx };
}

// ---------- day ----------

export function castVote(room, playerId, payload) {
  const state = st(room);
  requirePhase(state, 'day');
  if (!state.alive.has(playerId)) throw new GameError('The vote belongs to the living. You are watching.');

  const targetId = String(payload?.targetId || '');
  if (targetId !== 'skip') {
    if (targetId === playerId) throw new GameError('You cannot vote for yourself.');
    if (!state.alive.has(targetId)) throw new GameError('They are already out of the game.');
  }
  // Last write wins until the final ballot lands — a vote is only sealed by the reveal.
  state.votes[playerId] = targetId;

  const fx = [{ kind: 'sl-vote', cast: Object.keys(state.votes).length, total: aliveConnected(room, state).length }];
  const resolved = maybeFinishVote(room, state);
  if (resolved) return { fx: [...fx, ...resolved.fx] };
  return { fx };
}

// Votes resolve on the connected living rather than all living, unlike the night: a vote
// is a public argument, and one closed tab should not be able to hold the whole table
// hostage. Re-checked whenever connectivity changes.
function maybeFinishVote(room, state) {
  if (state.phase !== 'day') return;
  const voters = aliveConnected(room, state);
  if (!voters.length || !voters.every((id) => state.votes[id])) return;
  return finishVote(room, state);
}

function finishVote(room, state) {
  // The vote resolves over the players it waited for. A ballot from someone who cast it
  // and then dropped off is not counted: the same standard decides both when the vote is
  // done and whose voice is in it, so a dead phone cannot swing a verdict it never saw.
  const counted = new Set(aliveConnected(room, state));
  const tally = {};
  let skips = 0;
  for (const [voter, target] of Object.entries(state.votes)) {
    if (!counted.has(voter)) continue;
    if (target === 'skip') skips += 1;
    else tally[target] = (tally[target] || 0) + 1;
  }
  let max = 0;
  for (const n of Object.values(tally)) max = Math.max(max, n);
  const top = Object.keys(tally).filter((id) => tally[id] === max);

  // Somebody goes home only on a clear answer: one name on top, ahead of the skips.
  // A tie between names, or skip matching the leader, is the village failing to agree.
  const outId = top.length === 1 && max > skips ? top[0] : null;
  state.phase = 'verdict';
  state.verdict = {
    outId,
    role: outId ? state.roles[outId] : null,
    tie: !outId,
    tally,
    skips,
    round: state.round,
  };

  const fx = [{ kind: 'sl-verdict', outId, round: state.round }];
  if (outId) state.alive.delete(outId);

  // The Prowler banks a point for every completed vote they walk away from — including
  // the one that hands them the win, so the count is settled before the game can end.
  if (prowlerAlive(state)) state.votesSurvived += 1;

  const winner = checkWin(state);
  if (winner) return { fx: [...fx, ...endGame(room, state, winner).fx] };
  return { fx };
}

// From the verdict the host sends the table back to bed; from game over the same button
// deals a fresh game.
export function nextPhase(room, playerId) {
  const state = st(room);
  requireHost(room, playerId);
  if (state.phase === 'verdict') return beginNight(state);
  if (state.phase === 'gameOver') return startGame(room, playerId);
  throw new GameError('Nothing to move on from yet.');
}

// ---------- endings ----------

function checkWin(state) {
  const pack = prowlersAlive(state).length;
  if (pack === 0) return 'village';
  if (pack >= aliveIds(state).length - pack) return 'prowler';
  return null;
}

function endGame(room, state, side) {
  const pts = P();
  const pack = prowlerIds(state);

  // A game the table never played pays nothing: if it collapses before the first night
  // finishes (players leaving during the deal), the winner is declared so the room can
  // move on, but nobody is paid for a night that never happened.
  const everPlayed = state.round > 1 || state.dawn || state.verdict
    || Object.keys(state.night || {}).length > 0;

  // Every point is paid out here and only here. An award mid-game would put a reason like
  // "guarded the right door" on the public leaderboard while the Medic still needs cover.
  if (everPlayed && side === 'village') {
    for (const id of Object.keys(state.roles)) {
      if (state.roles[id] === 'prowler' || state.left.has(id)) continue;
      if (state.alive.has(id)) award(room, id, 'sleepless', pts.villageWinAlive, 'saw the sun rise');
      else award(room, id, 'sleepless', pts.villageWinDead, 'fell, but the village held');
    }
    const medicId = roleHolder(state, 'medic');
    if (medicId && !state.left.has(medicId) && state.medicSaves) {
      award(room, medicId, 'sleepless', pts.medicSave * state.medicSaves, 'guarded the right door');
    }
    const oracleId = roleHolder(state, 'oracle');
    if (oracleId && !state.left.has(oracleId) && state.oracleHit) {
      award(room, oracleId, 'sleepless', pts.oracleRead, 'read the Prowler\'s face');
    }
  } else if (everPlayed && side === 'prowler') {
    for (const id of pack) {
      if (state.left.has(id)) continue;
      award(room, id, 'sleepless', pts.prowlerWin, 'hunted until the end');
      if (state.votesSurvived) {
        award(room, id, 'sleepless', pts.prowlerSurvivedVote * state.votesSurvived, 'stared down the vote');
      }
    }
  }

  if (everPlayed) {
    for (const [id, hits] of Object.entries(state.instinct)) {
      if (hits && !state.left.has(id)) {
        award(room, id, 'sleepless', pts.instinct * hits, 'trusted the right gut');
      }
    }
  }

  // Instinct tallies join the reveal: they were the one secret with no owner to out.
  state.winner = { side, prowlerId: pack[0] || null, prowlerIds: pack, instinct: { ...state.instinct } };
  state.endQuip = pickQuip(side === 'village' ? 'insiderWin' : 'outsiderWin');
  state.phase = 'gameOver';
  return { fx: [{ kind: 'sl-over', side }] };
}

// ---------- departures & connectivity ----------

// A removed player leaves the game the way they left the room: quietly. Their role is not
// revealed (the full map arrives at game over anyway), their pending night pick stops
// blocking the dawn, and anything aimed at them is unwound so nobody is stuck acting on
// a ghost.
export function removePlayerFromGame(room, targetId) {
  const state = room.state;
  if (!state || room.game !== 'sleepless' || state.phase === 'gameOver') return;
  if (!Object.hasOwn(state.roles, targetId)) return;

  const wasAlive = state.alive.has(targetId);
  state.left.add(targetId);
  state.alive.delete(targetId);
  state.ready.delete(targetId);

  // Their own pick goes, and so does every pick and vote pointing at them — the pickers
  // are freed to choose again rather than spending the night visiting an empty chair.
  // Only live ballots are unwound: a verdict already announced is history, not a vote.
  if (state.phase === 'night') {
    delete state.night[targetId];
    for (const [who, target] of Object.entries(state.night)) {
      if (target === targetId) delete state.night[who];
    }
  }
  if (state.phase === 'day') {
    delete state.votes[targetId];
    for (const [who, target] of Object.entries(state.votes)) {
      if (target === targetId) delete state.votes[who];
    }
  }

  if (!wasAlive) return;

  // The hunt cannot outlive the hunter: with the Prowler gone the village has, in every
  // sense that matters, already won.
  if (state.roles[targetId] === 'prowler') return endGame(room, state, 'village');
  const winner = checkWin(state);
  if (winner) return endGame(room, state, winner);

  if (state.phase === 'dealing') return onConnectivityChange(room);
  if (state.phase === 'night') return maybeResolveNight(room, state);
  if (state.phase === 'day') return maybeFinishVote(room, state);
}

// True when the game is running but nobody present can move it along. One person cannot
// play a deduction game whoever they are, so a lone returner gets the escape hatch.
export function isStalled(room) {
  const state = room.state;
  if (!state || room.game !== 'sleepless') return false;
  if (state.phase === 'gameOver') return false;
  const present = [...room.players.values()].filter((p) => p.connected).length;
  return present < 2 || aliveConnected(room, state).length === 0;
}

export function onConnectivityChange(room) {
  const state = room.state;
  if (!state || room.game !== 'sleepless' || state.phase === 'gameOver') return;
  if (state.phase === 'dealing') {
    const here = aliveConnected(room, state);
    if (here.length && here.every((id) => state.ready.has(id))) return beginNight(state);
    return;
  }
  // The night deliberately keeps waiting for a dropped player — their pick is theirs to
  // make — but a day vote resolves over whoever is still in the room.
  if (state.phase === 'day') return maybeFinishVote(room, state);
}

// ---------- snapshot ----------

export function snapshot(room, forPlayerId) {
  const state = room.state;
  if (!state || room.game !== 'sleepless') return null;
  const over = state.phase === 'gameOver';
  const role = state.roles[forPlayerId] || null;
  const isOracle = role === 'oracle';

  return {
    phase: state.phase,
    round: state.round,
    // Ties the client's one-shot animation cache to this particular deal, so a replay
    // in the same room gets a fresh card table instead of last game's cached one.
    dealId: state.startedAt,
    players: state.order.map((id) => ({
      id,
      alive: state.alive.has(id),
      connected: room.players.get(id)?.connected || false,
      left: state.left.has(id),
    })),
    you: role ? {
      role,
      alive: state.alive.has(forPlayerId),
      // A Prowler knows the rest of the pack; nobody else ever sees this field.
      allies: role === 'prowler'
        ? prowlerIds(state).filter((id) => id !== forPlayerId)
        : [],
    } : null,
    readyCount: state.ready.size,
    youReady: state.ready.has(forPlayerId),
    // The night is a count, never a list: who has settled in is exactly the kind of
    // timing information a table would read roles from.
    submitted: state.phase === 'night' ? Object.keys(state.night).length : 0,
    submittedTotal: state.phase === 'night' ? aliveIds(state).length : 0,
    youSubmitted: state.phase === 'night' ? Boolean(state.night[forPlayerId]) : false,
    yourPick: state.phase === 'night' ? state.night[forPlayerId] || null : null,
    dawn: state.dawn,
    // The reading is the Oracle's alone until the very end.
    oracle: isOracle ? state.oracle : null,
    // What your watch saw, if it saw anything. Yours alone, same rule as the reading.
    witness: role === 'sleeper' ? (state.witness[forPlayerId] || null) : null,
    // Progress is counted over the same set the vote resolves over, so the count can
    // never read as more ballots than voters.
    voteCount: state.phase === 'day'
      ? aliveConnected(room, state).filter((id) => state.votes[id]).length : 0,
    votersTotal: state.phase === 'day' ? aliveConnected(room, state).length : 0,
    youVoted: Boolean(state.votes[forPlayerId]),
    yourVote: state.votes[forPlayerId] || null,
    // Ballots stay sealed until the vote is decided, then the whole table sees who
    // pointed at whom — that argument IS the game.
    votes: state.phase === 'verdict' || over ? { ...state.votes } : null,
    verdict: state.verdict,
    winner: over ? { ...state.winner, roles: { ...state.roles } } : null,
    startQuip: state.startQuip,
    endQuip: state.endQuip,
  };
}
