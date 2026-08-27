// Game Night — © 2026 Ankit Kumar Mishra. All rights reserved. See LICENSE.
// Scoring and leaderboards.
//
// Points are per room and live only as long as the room does. There is deliberately no
// all-time table: without accounts it could only be matched on display name, which means
// anyone typing "Maya" inherits Maya's score — a leaderboard that lies is worse than none.

// ---------------------------------------------------------------------------
// Point values — kept here so the rules are readable in one place, and so the
// in-app "how points work" panel can be generated from the same source.
// ---------------------------------------------------------------------------
export const POINTS = {
  blendin: {
    correctVote: 2,        // you voted for someone who turned out to be an outsider
    survivedRound: 1,      // outsiders only: another round without being caught
    insiderWin: 3,         // every insider on the winning side
    survivorBonus: 2,      // ...plus this if you were still alive at the end
    outsiderWin: 5,        // every outsider on the winning side
    blankGuess: 8,         // the Blank naming the insiders' word
  },
  island: {
    solveFirst: 6,
    solveSecond: 4,
    solveThird: 3,
    solveOther: 2,
    gamemaster: 2,         // running a round for everyone else is worth something
  },
};

export const SCORING_RULES = {
  blendin: [
    ['🗳️', `+${POINTS.blendin.correctVote}`, 'Voting out someone who turns out to be an outsider'],
    ['🕵️', `+${POINTS.blendin.survivedRound}`, 'Surviving a round as an outsider or the Blank'],
    ['😇', `+${POINTS.blendin.insiderWin}`, 'Winning as an insider'],
    ['💪', `+${POINTS.blendin.survivorBonus}`, 'Still being alive when your side wins'],
    ['🎭', `+${POINTS.blendin.outsiderWin}`, 'Winning as an outsider'],
    ['🃏', `+${POINTS.blendin.blankGuess}`, 'The Blank naming the insiders\' word'],
  ],
  island: [
    ['🥇', `+${POINTS.island.solveFirst}`, 'Cracking the pattern first'],
    ['🥈', `+${POINTS.island.solveSecond}`, 'Second to crack it'],
    ['🥉', `+${POINTS.island.solveThird}`, 'Third to crack it'],
    ['💡', `+${POINTS.island.solveOther}`, 'Cracking it after that'],
    ['🧑‍⚖️', `+${POINTS.island.gamemaster}`, 'Running a round as the gamemaster'],
    ['❌', '0', 'Three wrong pattern guesses puts you out for the round'],
  ],
};

// ---------------------------------------------------------------------------
// Titles — earned by where the points came from, so they say something true
// about how someone plays.
// ---------------------------------------------------------------------------
export function titleFor({ blendin = 0, island = 0 }) {
  const total = blendin + island;
  if (total < 10) return { title: 'Newcomer', emoji: '🌱' };

  const ratio = blendin / Math.max(total, 1);
  if (ratio >= 0.7) {
    if (blendin >= 60) return { title: 'Master of Disguise', emoji: '🕵️' };
    if (blendin >= 30) return { title: 'Smooth Liar', emoji: '🎭' };
    return { title: 'Poker Face', emoji: '😐' };
  }
  if (ratio <= 0.3) {
    if (island >= 60) return { title: 'Pattern Oracle', emoji: '🔮' };
    if (island >= 30) return { title: 'Code Breaker', emoji: '🧩' };
    return { title: 'Sharp Eye', emoji: '👁️' };
  }
  if (total >= 80) return { title: 'Game Night Legend', emoji: '👑' };
  if (total >= 40) return { title: 'All-Rounder', emoji: '🎲' };
  return { title: 'Regular', emoji: '🎈' };
}

// ---------------------------------------------------------------------------
// Room scores
// ---------------------------------------------------------------------------
export function ensureScores(room) {
  room.scores ||= new Map();      // playerId -> { name, avatar, blendin, island, total }
  return room.scores;
}

export function award(room, playerId, game, amount, reason = '') {
  if (!amount) return;
  const scores = ensureScores(room);
  const player = room.players.get(playerId);
  const entry = scores.get(playerId) || {
    name: player?.name || 'Player',
    avatar: player?.avatar || '🙂',
    blendin: 0,
    island: 0,
    total: 0,
    log: [],
  };
  if (player) { entry.name = player.name; entry.avatar = player.avatar; }
  entry[game] = (entry[game] || 0) + amount;
  entry.total += amount;
  if (reason) {
    entry.log.push({ amount, reason });
    if (entry.log.length > 12) entry.log.shift();
  }
  scores.set(playerId, entry);
}

// Sorted view for the client. Includes players who have left, so a leaderboard does not
// silently rewrite history mid-session.
export function roomLeaderboard(room) {
  const scores = ensureScores(room);
  return [...scores.entries()]
    .map(([id, e]) => ({
      id,
      name: e.name,
      avatar: e.avatar,
      blendin: e.blendin,
      island: e.island,
      total: e.total,
      ...titleFor(e),
      here: room.players.has(id),
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

