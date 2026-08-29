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
  silentorder: {
    goodCard: 1,           // a card played with nothing lower still out there
    levelCleared: 3,       // everyone who survives a level
    runWon: 8,             // everyone, for clearing the final level
  },
  island: {
    solveFirst: 6,
    solveSecond: 4,
    solveThird: 3,
    solveOther: 2,
    gamemaster: 2,         // running a round for everyone else is worth something
  },
  swaporstay: {
    roundSurvived: 1,      // still holding a heart when the cards go up
    gameWon: 6,            // last player standing
  },
  sleepless: {
    villageWinAlive: 4,    // villagers still standing when the Prowler falls
    villageWinDead: 2,     // villagers who fell along the way
    medicSave: 2,          // per night the guard was on the right door (paid on a village win)
    prowlerWin: 8,         // the Prowler outlasting the village
    prowlerSurvivedVote: 1, // per completed vote the Prowler walked away from (paid on a prowler win)
    puzzle: 1,              // per night the player answered their sum correctly
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
  silentorder: [
    ['🃏', `+${POINTS.silentorder.goodCard}`, 'Playing a card with nothing lower still held'],
    ['🎚️', `+${POINTS.silentorder.levelCleared}`, 'Everyone, for clearing a level'],
    ['🏆', `+${POINTS.silentorder.runWon}`, 'Everyone, for clearing the final level'],
    ['💔', '0', 'Three mistakes ends the run'],
  ],
  island: [
    ['🥇', `+${POINTS.island.solveFirst}`, 'Cracking the pattern first'],
    ['🥈', `+${POINTS.island.solveSecond}`, 'Second to crack it'],
    ['🥉', `+${POINTS.island.solveThird}`, 'Third to crack it'],
    ['💡', `+${POINTS.island.solveOther}`, 'Cracking it after that'],
    ['🧑‍⚖️', `+${POINTS.island.gamemaster}`, 'Running a round as the gamemaster'],
    ['❌', '0', 'Three wrong pattern guesses puts you out for the round'],
  ],
  swaporstay: [
    ['❤️', `+${POINTS.swaporstay.roundSurvived}`, 'Living to see another deal'],
    ['👑', `+${POINTS.swaporstay.gameWon}`, 'Being the last player standing'],
    ['🛡', '0', 'A Sentinel never loses, and blocks swaps'],
  ],
  sleepless: [
    ['🌅', `+${POINTS.sleepless.villageWinAlive}`, 'Seeing the sun rise on a village win'],
    ['🪦', `+${POINTS.sleepless.villageWinDead}`, 'Falling before a village win'],
    ['🩺', `+${POINTS.sleepless.medicSave}`, 'Each night the Medic guarded the right door'],
    ['🐾', `+${POINTS.sleepless.prowlerWin}`, 'The Prowler outlasting the village'],
    ['🗳️', `+${POINTS.sleepless.prowlerSurvivedVote}`, 'Each vote the Prowler stared down'],
    ['🧮', `+${POINTS.sleepless.puzzle}`, 'Each night-sum answered correctly'],
  ],
};

// ---------------------------------------------------------------------------
// Titles — earned by where the points came from, so they say something true
// about how someone plays.
// ---------------------------------------------------------------------------
export function titleFor({ blendin = 0, island = 0, silentorder = 0, swaporstay = 0, sleepless = 0 }) {
  const total = blendin + island + silentorder + swaporstay + sleepless;
  if (total < 10) return { title: 'Newcomer', emoji: '🌱' };

  // Titles come from where the points were earned, so every game needs its own branch
  // rather than being folded into another's.
  if (silentorder / Math.max(total, 1) >= 0.7) {
    if (silentorder >= 60) return { title: 'Perfect Timing', emoji: '⏱️' };
    if (silentorder >= 30) return { title: 'Mind Reader', emoji: '🃏' };
    return { title: 'Steady Hand', emoji: '🤝' };
  }
  if (swaporstay / Math.max(total, 1) >= 0.7) {
    if (swaporstay >= 60) return { title: 'Stone Cold', emoji: '🗿' };
    if (swaporstay >= 30) return { title: 'Card Shark', emoji: '🦈' };
    return { title: 'Cool Customer', emoji: '🧊' };
  }
  if (sleepless / Math.max(total, 1) >= 0.7) {
    if (sleepless >= 60) return { title: 'Night Watch', emoji: '🌙' };
    if (sleepless >= 30) return { title: 'Light Sleeper', emoji: '🛏️' };
    return { title: 'Wide Awake', emoji: '👁️' };
  }
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
    silentorder: 0,
    swaporstay: 0,
    sleepless: 0,
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
      silentorder: e.silentorder,
      swaporstay: e.swaporstay || 0,
      sleepless: e.sleepless || 0,
      total: e.total,
      ...titleFor(e),
      here: room.players.has(id),
    }))
    .sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
}

