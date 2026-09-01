// Dev-only scenario browser. Renders every dramatic screen from a hand-written snapshot,
// so each outcome can be looked at without playing a whole game to reach it. Served only
// outside production (see server/index.js), and it imports the real render functions, so
// what you see here is exactly what a player would see.
import { renderSleepless } from '/js/games/sleepless/index.js';
import { renderBlendIn } from '/js/games/blendin/index.js';
import { renderSilentOrder } from '/js/games/silentorder/index.js';
import { renderIsland } from '/js/games/island/index.js';
import { h } from '/js/core/ui.js';

const P = [
  { id: 'p1', name: 'AKM', avatar: '🦊', alive: true, connected: true },
  { id: 'p2', name: 'SB', avatar: '🦄', alive: true, connected: true },
  { id: 'p3', name: 'ST', avatar: '🦉', alive: true, connected: true },
  { id: 'p4', name: 'TV', avatar: '👻', alive: true, connected: true },
];
const dead = (ids) => P.map((p) => ({ ...p, alive: !ids.includes(p.id) }));
const ctx = {
  me: { id: 'p1' }, isHost: true, hostId: 'p1',
  player: (id) => P.find((p) => p.id === id) || { name: '?', avatar: '👤', connected: true },
  players: () => P,
  emit: () => Promise.resolve({ ok: true }),
  sound: { tap() {}, pop() {}, tick() {} },
  rerender() {}, toast() {},
};
const RULES = {
  sleepless: [['🌅', '+4', 'Seeing the sun rise on a village win'], ['🥷', '+8', 'The Prowler outlasting the village']],
  blendin: [['🗳️', '+2', 'Voting out someone who turns out to be an outsider']],
  silentorder: [['🃏', '+1', 'Playing a card with nothing lower still held']],
};

const sl = (over) => ({ scoringRules: RULES, sleepless: { dealId: 'd1', round: 2, players: P, you: { id: 'p1', role: 'medic', alive: true }, ...over } });

const SCENES = [
  ['🌅 Dawn · murdered', 'A kill lands. Grim tone, role card tossed at the corner, somber tail on the sound.',
    () => renderSleepless(sl({ phase: 'day', players: dead(['p3']), dawn: { kind: 'death', victimId: 'p3', role: 'sleeper', seq: 1, round: 2 }, votes: {}, voteCount: 0, votersTotal: 3, youVoted: false }), ctx)],
  ['🌅 Dawn · saved', 'The Medic guarded the right door. Good tone, no card.',
    () => renderSleepless(sl({ phase: 'day', dawn: { kind: 'saved', seq: 2, round: 2 }, votes: {}, voteCount: 0, votersTotal: 4, youVoted: false }), ctx)],
  ['⚖️ Banished · a Prowler', 'Big table with TWO Prowlers: catching one does not end it, so the night still falls. On a one-Prowler table this jumps straight to the win screen instead.',
    () => renderSleepless({ scoringRules: RULES, sleepless: { dealId: 'd1', round: 2, you: { id: 'p1', role: 'medic', alive: true }, players: [...P, { id: 'p5', name: 'TVS', avatar: '🎃', connected: true }, { id: 'p6', name: 'DK', avatar: '🐙', connected: true }].map((p) => ({ ...p, alive: p.id !== 'p4' })), phase: 'verdict', verdict: { outId: 'p4', role: 'prowler', tie: false, tally: { p4: 4 }, skips: 0, round: 2 }, votes: { p1: 'p4', p2: 'p4', p3: 'p4', p5: 'p4' } } }, ctx)],
  ['⚖️ Banished · an innocent', 'Grim tone, sad trombone. The Prowler is still at the table.',
    () => renderSleepless(sl({ phase: 'verdict', players: dead(['p3']), verdict: { outId: 'p3', role: 'medic', tie: false, tally: { p3: 2 }, skips: 1, round: 2 }, votes: { p1: 'p3', p2: 'p3', p4: 'skip' } }), ctx)],
  ['⚖️ Banished · nobody', 'Nobody goes home.',
    () => renderSleepless(sl({ phase: 'verdict', verdict: { outId: null, role: null, tie: true, tally: {}, skips: 2, round: 2 }, votes: { p1: 'skip', p2: 'skip' } }), ctx)],
  ['🏁 Village wins (by vote)', 'Final vote reveal first, then the winner a beat later.',
    () => renderSleepless(sl({ phase: 'gameOver', players: dead(['p4']), verdict: { outId: 'p4', role: 'prowler', tie: false, tally: { p4: 3 }, skips: 0, round: 2 }, votes: { p1: 'p4', p2: 'p4', p3: 'p4' }, winner: { side: 'village', roles: { p1: 'medic', p2: 'sleeper', p3: 'sleeper', p4: 'prowler' } }, endQuip: 'The town sleeps easy tonight 🌙' }), ctx)],
  ['🏁 Prowler wins (by kill)', 'The dawn that ended it, then the winner.',
    () => renderSleepless(sl({ phase: 'gameOver', players: dead(['p2', 'p3']), dawn: { kind: 'death', victimId: 'p3', role: 'sleeper', seq: 3, round: 2 }, verdict: null, winner: { side: 'prowler', roles: { p1: 'medic', p2: 'sleeper', p3: 'sleeper', p4: 'prowler' } }, endQuip: 'You were fooled. Beautifully.' }), ctx)],
  ['🕵️ Blend In · outsider out', 'Elimination reveal mid-game.',
    () => renderBlendIn({ scoringRules: RULES, leaderboard: [], blendin: { phase: 'roundResult', round: 2, order: P.map((p) => p.id), alive: ['p1', 'p2', 'p3'], eliminated: [{ playerId: 'p4', role: 'outsider', round: 2 }], clues: [], config: { insiders: 2, outsiders: 1, blank: 1 }, votedIds: [], you: { alive: true }, lastResult: { type: 'elimination', playerId: 'p4', role: 'outsider', round: 2, tally: { p4: 3 }, quip: 'is out!' } } }, ctx)],
  ['🕵️ Blend In · insiders win', 'Final elimination, then the winner.',
    () => renderBlendIn({ scoringRules: RULES, leaderboard: P.map((p, i) => ({ id: p.id, total: 9 - i })), blendin: { phase: 'gameOver', round: 3, order: P.map((p) => p.id), alive: ['p1', 'p2'], eliminated: [], clues: [], config: { insiders: 2, outsiders: 2, blank: 0 }, votedIds: [], lastResult: { type: 'elimination', playerId: 'p4', role: 'outsider', round: 3, tally: { p4: 3 }, quip: 'is out!' }, winner: 'insiders', winReason: 'Every outsider has been found.', endQuip: 'The insiders held the line 😇', reveal: { roles: { p1: 'insider', p2: 'insider', p3: 'outsider', p4: 'outsider' }, insiderWord: 'Lighthouse', outsiderWord: 'Candle' } } }, ctx)],
  ['🕵️ Blend In · outsiders win', 'The impostors walked out with it.',
    () => renderBlendIn({ scoringRules: RULES, leaderboard: P.map((p, i) => ({ id: p.id, total: 9 - i })), blendin: { phase: 'gameOver', round: 3, order: P.map((p) => p.id), alive: ['p3', 'p4'], eliminated: [], clues: [], config: { insiders: 2, outsiders: 2, blank: 0 }, votedIds: [], lastResult: { type: 'elimination', playerId: 'p2', role: 'insider', round: 3, tally: { p2: 3 }, quip: 'is out!' }, winner: 'outsiders', winReason: 'Only one insider left standing.', endQuip: 'Nobody suspected a thing 🕵️', reveal: { roles: { p1: 'insider', p2: 'insider', p3: 'outsider', p4: 'outsider' }, insiderWord: 'Lighthouse', outsiderWord: 'Candle' } } }, ctx)],
  ['🕵️ Blend In · the Blank steals it', 'Caught, then named the word and took the whole game.',
    () => renderBlendIn({ scoringRules: RULES, leaderboard: P.map((p, i) => ({ id: p.id, total: 9 - i })), blendin: { phase: 'gameOver', round: 2, order: P.map((p) => p.id), alive: ['p1', 'p2'], eliminated: [], clues: [], config: { insiders: 2, outsiders: 1, blank: 1 }, votedIds: [], lastResult: { type: 'elimination', playerId: 'p4', role: 'blank', round: 2, tally: { p4: 3 }, quip: 'is out!', blankGuess: { text: 'Lighthouse', correct: true, guesserId: 'p4' } }, winner: 'outsiders', winReason: 'The Blank named the secret word!', endQuip: 'The one with nothing took everything 🃏', reveal: { roles: { p1: 'insider', p2: 'insider', p3: 'outsider', p4: 'blank' }, insiderWord: 'Lighthouse', outsiderWord: 'Candle' } } }, ctx)],
  ['🕯️ Silent Order · held', 'The run cleared.',
    () => renderSilentOrder({ leaderboard: [], scoringRules: RULES, silentorder: { phase: 'over', startedAt: 11, over: true, won: true, level: 6, maxLevel: 6, lives: 3, order: ['p1', 'p2'], counts: { p1: 0, p2: 0 }, yourHand: [], youPlay: true, pile: [], discards: [], topCard: 0, played: 0, endQuip: 'Not one word, not one mistake.' } }, ctx)],
  ['🕯️ Silent Order · broke', 'The run failed.',
    () => renderSilentOrder({ leaderboard: [], scoringRules: RULES, silentorder: { phase: 'over', startedAt: 12, over: true, won: false, level: 3, maxLevel: 6, lives: 0, order: ['p1', 'p2'], counts: { p1: 0, p2: 0 }, yourHand: [], youPlay: true, pile: [], discards: [], topCard: 0, played: 0, endQuip: 'So close.' } }, ctx)],
  ['🏝️ Island · everyone cracked it', 'The celebratory ending.',
    () => renderIsland({ scoringRules: RULES, island: { phase: 'reveal', roundNum: 1, mode: 'ai', order: ['p1', 'p2'], solvedOrder: ['p1', 'p2'], knockedOut: [], scores: { p1: 6, p2: 4 }, endedBy: 'all-solved', pattern: { name: 'Things that can break', description: 'anything that can break' }, attempts: [], hints: [], starters: ['Heart', 'Window'] } }, ctx)],
];

const bar = document.getElementById('bar');
const stage = document.getElementById('stage');
const note = document.getElementById('note');
let active = 0;
function show(i) {
  active = i;
  [...bar.querySelectorAll('.dev-tab')].forEach((b, k) => b.classList.toggle('on', k === i));
  note.textContent = SCENES[i][1];
  stage.replaceChildren();
  try { stage.append(SCENES[i][2]()); } catch (err) { stage.append(h('pre', { style: 'color:#f87171' }, String(err && err.stack || err))); }
  location.hash = String(i);
}
SCENES.forEach(([label], i) => {
  bar.append(h('button', { class: 'dev-tab', onClick: () => show(i) }, label));
});
show(Number(location.hash.slice(1)) || 0);
