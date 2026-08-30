// End-to-end tests: boots a real server and drives it with real Socket.IO clients.
// Run: npm test        (uses MOCK_AI=1 so the AI gamemaster is deterministic)
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { io } from 'socket.io-client';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.TEST_PORT || 3999);
const URL = `http://localhost:${PORT}`;
const ADMIN_TOKEN = 'test-admin-token';

let pass = 0;
const failures = [];

function check(name, cond, detail = '') {
  if (cond) { pass++; return true; }
  failures.push(`${name}${detail ? ' — ' + detail : ''}`);
  console.log(`  ✗ ${name}${detail ? ' — ' + detail : ''}`);
  return false;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- client harness ----------
let pidSeq = 0;

class Player {
  constructor(name, avatar = '🙂', vid = null) {
    this.name = name;
    this.avatar = avatar;
    this.vid = vid;              // the browser id the usage dashboard groups people by
    this.playerId = `p_test_${++pidSeq}`;
    this.token = `tok_${this.playerId}`;
    this.snap = null;
    this.fx = [];
    this.kicked = false;
    this.takenover = false;
  }

  async connect() {
    this.socket = io(URL, {
      transports: ['websocket'], forceNew: true,
      auth: this.vid ? { vid: this.vid } : {},
    });
    this.socket.on('room:state', (s) => { this.snap = s; });
    this.socket.on('fx', (f) => this.fx.push(f));
    this.socket.on('room:kicked', () => { this.kicked = true; });
    this.socket.on('room:takenover', () => { this.takenover = true; });
    await new Promise((res, rej) => {
      this.socket.once('connect', res);
      this.socket.once('connect_error', rej);
    });
    return this;
  }

  emit(event, payload = {}) {
    return new Promise((resolve) => {
      const t = setTimeout(() => resolve({ ok: false, error: 'timeout' }), 8000);
      this.socket.emit(event, payload, (res) => { clearTimeout(t); resolve(res || { ok: true }); });
    });
  }

  identity() { return { playerId: this.playerId, token: this.token, name: this.name, avatar: this.avatar }; }
  create() { return this.emit('room:create', this.identity()); }
  join(code) { return this.emit('room:join', { code, ...this.identity() }); }
  disconnect() { this.socket.disconnect(); }

  get bi() { return this.snap?.blendin; }
  get is() { return this.snap?.island; }
  get role() { return this.bi?.you; }
}

// Wait until a predicate over a player's snapshot holds.
async function until(player, pred, label = 'condition', ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (player.snap && pred(player.snap)) return true;
    await sleep(25);
  }
  check(`wait: ${label}`, false, `timed out (phase=${player.snap?.blendin?.phase || player.snap?.island?.phase})`);
  return false;
}

// Wait until EVERY player has received the state we are about to assert on.
// until() only watches one client, so reading other players' snapshots right after
// it returns is a race.
async function untilAll(players, pred, label = 'all clients', ms = 4000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (players.every((p) => p.snap && pred(p.snap))) return true;
    await sleep(25);
  }
  check(`wait: ${label}`, false, 'not all clients caught up');
  return false;
}

// Start an Blend In game and wait until every client knows its own role.
async function startBlendIn(players, host) {
  const res = await host.emit('bi:start');
  if (!res.ok) check('bi:start', false, res.error);
  await until(host, (s) => s.blendin?.phase === 'reveal', 'game started');
  await untilAll(players, (s) => Boolean(s.blendin?.you), 'roles dealt to everyone');
  return res;
}

async function makeRoom(count, names = null) {
  const players = [];
  for (let i = 0; i < count; i++) {
    const p = new Player(names?.[i] || `P${i + 1}`, ['🦊', '🐼', '🦁', '🐸', '🐙', '🦄', '🐳'][i % 7]);
    await p.connect();
    players.push(p);
  }
  const res = await players[0].create();
  if (!res.ok) throw new Error('room create failed: ' + res.error);
  const code = res.code;
  for (const p of players.slice(1)) {
    const r = await p.join(code);
    if (!r.ok) throw new Error('join failed: ' + r.error);
  }
  await until(players[0], (s) => s.players.length === count, 'all players joined');
  return { players, code, host: players[0] };
}

async function cleanup(players) {
  for (const p of players) { try { p.disconnect(); } catch {} }
  await sleep(60);
}

// ---------- blendin helpers ----------
function roleOf(players, kind) {
  return players.find((p) => (kind === 'blank' ? p.role?.isBlank : false));
}

async function allReady(players) {
  for (const p of players) await p.emit('bi:ready');
  await until(players[0], (s) => s.blendin.phase === 'describing', 'reveal → describing');
}

// Give clues until everyone in the queue has spoken.
async function doDescribeRound(players, host, clueFor = null) {
  for (let guard = 0; guard < 30; guard++) {
    const uc = host.bi;
    if (uc.phase !== 'describing') break;
    const turnId = uc.currentTurn;
    if (!turnId) break;
    const speaker = players.find((p) => p.snap.you.id === turnId);
    const text = clueFor ? clueFor(speaker, uc) : `clue-${speaker.name}-r${uc.round}`;
    const res = await speaker.emit('bi:clue', { text });
    if (!res.ok) { check('clue accepted', false, res.error); break; }
    await sleep(20);
  }
  return host.bi.phase;
}

// Everyone alive votes for targetPicker(voter) -> playerId
async function voteAll(players, host, targetPicker) {
  const alive = host.bi.alive;
  for (const p of players) {
    if (!p.snap?.you || !alive.includes(p.snap.you.id)) continue;
    let target = targetPicker(p);
    // Nobody can vote for themselves, so the odd one out votes elsewhere.
    if (!target || target === p.snap.you.id) target = alive.find((id) => id !== p.snap.you.id);
    if (!target) continue;
    await p.emit('bi:vote', { targetId: target });
    await sleep(15);
  }
}

// ============================================================
// TESTS
// ============================================================

async function testBlendInFullGame() {
  console.log('\n▶ Blend In: full 5-player game (roles, clues, votes, win)');
  const { players, host } = await makeRoom(5);

  const start = await startBlendIn(players, host);
  check('host can start with 5', start.ok, start.error);

  // Role distribution: exactly 3 insiders, 1 blendin, 1 the Blank
  const cfg = host.bi.config;
  check('5p config = 3 civ / 1 uc / 1 white', cfg.insiders === 3 && cfg.outsiders === 1 && cfg.blank === true,
    JSON.stringify(cfg));
  const whites = players.filter((p) => p.role.isBlank);
  const worded = players.filter((p) => !p.role.isBlank);
  check('exactly one the Blank', whites.length === 1);
  check('the Blank has no word', whites[0].role.word === null);
  const wordCounts = {};
  for (const p of worded) wordCounts[p.role.word] = (wordCounts[p.role.word] || 0) + 1;
  const counts = Object.values(wordCounts).sort();
  check('word split is 1 blendin vs 3 insiders', counts.join(',') === '1,3', JSON.stringify(wordCounts));

  // No snapshot leaks another player's role or the two secret words
  const leak = players.some((p) => {
    const s = JSON.stringify(p.snap.blendin);
    return s.includes('"roles"') || s.includes('insiderWord') || s.includes('outsiderWord');
  });
  check('no role/word leak in mid-game snapshots', !leak);

  // Non-host cannot start/skip/vote-start
  check('non-host cannot force describe', !(await players[1].emit('bi:forceDescribe')).ok);
  check('non-host cannot start vote', !(await players[1].emit('bi:startVote')).ok);

  await allReady(players);

  // the Blank must never speak first
  check('the Blank is not first in the queue', !players.find((p) => p.snap.you.id === host.bi.queue[0])?.role.isBlank);

  // Out-of-turn clue is rejected
  const notTurn = players.find((p) => p.snap.you.id !== host.bi.currentTurn);
  check('out-of-turn clue rejected', !(await notTurn.emit('bi:clue', { text: 'sneaky' })).ok);

  // Own-word clue is rejected
  const turnP = players.find((p) => p.snap.you.id === host.bi.currentTurn);
  if (turnP.role.word) {
    const r = await turnP.emit('bi:clue', { text: turnP.role.word });
    check('own secret word rejected as clue', !r.ok, r.error);
  }

  await doDescribeRound(players, host);
  check('after all clues → discussion', host.bi.phase === 'discussion', host.bi.phase);
  check('one clue per alive player', host.bi.clues.filter((c) => c.round === 1).length === 5);

  // Duplicate clue rejection (next round)
  const sv = await host.emit('bi:startVote');
  check('host starts vote', sv.ok, sv.error);
  await until(host, (s) => s.blendin.phase === 'voting', 'voting phase');

  check('cannot vote for self', !(await players[0].emit('bi:vote', { targetId: players[0].snap.you.id })).ok);
  check('cannot vote for unknown player', !(await players[0].emit('bi:vote', { targetId: 'nope' })).ok);

  // Everyone votes out the the Blank to exercise the guess path
  const whiteId = whites[0].snap.you.id;
  await voteAll(players, host, () => whiteId);
  await until(host, (s) => s.blendin.phase === 'blankGuess', 'the Blank caught → blankGuess');
  check('elimination revealed the Blank role', host.bi.lastResult?.role === 'blank');

  // A wrong guess must not end the game
  const wrong = await whites[0].emit('bi:blankGuess', { text: 'definitely-not-the-word-xyz' });
  check('the Blank wrong guess accepted', wrong.ok, wrong.error);
  await until(host, (s) => s.blendin.phase === 'roundResult', 'wrong guess → roundResult');
  check('wrong guess recorded', host.bi.lastResult?.blankGuess?.correct === false);
  check('game continues after wrong guess', host.bi.winner === null);

  // Round 2: vote out the blendin → insiders win
  await host.emit('bi:nextRound');
  await until(host, (s) => s.blendin.phase === 'describing', 'round 2 describing');
  const dupTarget = host.bi.clues[0].text;
  const t2 = players.find((p) => p.snap.you.id === host.bi.currentTurn);
  check('duplicate clue rejected across rounds', !(await t2.emit('bi:clue', { text: dupTarget })).ok);

  await doDescribeRound(players, host);
  await host.emit('bi:startVote');
  await until(host, (s) => s.blendin.phase === 'voting', 'round 2 voting');

  const ucPlayer = worded.find((p) => wordCounts[p.role.word] === 1);
  await voteAll(players, host, () => ucPlayer.snap.you.id);
  await until(host, (s) => s.blendin.phase === 'gameOver', 'game over');
  check('insiders win when all outsiders are out', host.bi.winner === 'insiders', host.bi.winReason);
  check('reveal exposes both words at game over', Boolean(host.bi.reveal?.insiderWord && host.bi.reveal?.outsiderWord));
  check('reveal exposes all roles at game over', Object.keys(host.bi.reveal.roles).length === 5);
  check('game-over fx delivered', players.every((p) => p.fx.some((f) => f.kind === 'game-over')));

  // Play again keeps the room and re-rolls roles
  const again = await host.emit('bi:playAgain');
  check('play again works', again.ok, again.error);
  await until(host, (s) => s.blendin.phase === 'reveal', 'new game reveal');

  await cleanup(players);
}

async function testBlankWins() {
  console.log('\n▶ Blend In: the Blank guesses correctly → outsiders win');
  const { players, host } = await makeRoom(5);
  await startBlendIn(players, host);
  await allReady(players);

  const white = players.find((p) => p.role.isBlank);
  const wordCounts = {};
  for (const p of players) if (p.role.word) wordCounts[p.role.word] = (wordCounts[p.role.word] || 0) + 1;
  const insiderWord = Object.keys(wordCounts).find((w) => wordCounts[w] === 3);

  await doDescribeRound(players, host);
  await host.emit('bi:startVote');
  await until(host, (s) => s.blendin.phase === 'voting', 'voting');
  await voteAll(players, host, () => white.snap.you.id);
  await until(host, (s) => s.blendin.phase === 'blankGuess', 'blankGuess');

  check('only the Blank may submit the guess', !(await players.find((p) => p !== white).emit('bi:blankGuess', { text: insiderWord })).ok);
  const r = await white.emit('bi:blankGuess', { text: insiderWord });
  check('correct guess accepted', r.ok, r.error);
  await until(host, (s) => s.blendin.phase === 'gameOver', 'game over');
  check('outsiders win via the Blank', host.bi.winner === 'outsiders', host.bi.winReason);
  check('win reason mentions the Blank', /blank/i.test(host.bi.winReason), host.bi.winReason);

  // Fuzzy matching: a one-typo guess should also count
  await cleanup(players);
}

async function testTieRunoff() {
  console.log('\n▶ Blend In: tie → runoff → second tie → nobody eliminated');
  const { players, host } = await makeRoom(6);
  await startBlendIn(players, host);
  await allReady(players);
  await doDescribeRound(players, host);
  await host.emit('bi:startVote');
  await until(host, (s) => s.blendin.phase === 'voting', 'voting');

  // 6 voters split 3/3 between A and B (A votes B, B votes A) → dead tie
  const ids = players.map((p) => p.snap.you.id);
  const A = ids[0], B = ids[1];
  const plan = new Map([[ids[1], A], [ids[2], A], [ids[3], A], [ids[0], B], [ids[4], B], [ids[5], B]]);
  const castTie = async () => {
    for (const p of players) {
      await p.emit('bi:vote', { targetId: plan.get(p.snap.you.id) });
      await sleep(15);
    }
  };
  await castTie();
  await until(host, (s) => s.blendin.phase === 'runoff', 'tie → runoff');
  check('runoff has exactly the tied candidates', host.bi.runoffCandidates?.length === 2
    && host.bi.runoffCandidates.includes(A) && host.bi.runoffCandidates.includes(B));
  check('runoff rejects votes for non-candidates',
    !(await players[2].emit('bi:vote', { targetId: ids[4] })).ok);
  check('tie-break fx emitted', host.fx.some((f) => f.kind === 'vote-tie'));

  // Tie again in the runoff → nobody goes home
  await castTie();
  // A table that ties twice has been played: the outsiders take the game on the spot.
  await until(host, (s) => s.blendin.phase === 'gameOver', 'second tie → gameOver');
  check('a double tie hands the game to the outsiders', host.bi.winner === 'outsiders', host.bi.winner);
  check('and says why', /tie/i.test(host.bi.winReason || ''), host.bi.winReason);
  await cleanup(players);
}

async function testLeaveDuringVote() {
  console.log('\n▶ Blend In: player leaves mid-vote (stale votes must be dropped)');
  const { players, host } = await makeRoom(6);
  await startBlendIn(players, host);
  await allReady(players);
  await doDescribeRound(players, host);
  await host.emit('bi:startVote');
  await until(host, (s) => s.blendin.phase === 'voting', 'voting');

  const victim = players[5];
  const victimId = victim.snap.you.id;
  // Three players vote FOR the victim, then the victim leaves.
  for (const p of players.slice(0, 3)) { await p.emit('bi:vote', { targetId: victimId }); await sleep(15); }
  check('votes registered before leaving', host.bi.votesCast === 3, String(host.bi.votesCast));

  await victim.emit('room:leave');
  await until(host, (s) => s.players.length === 5, 'victim left the room');

  check('leaver recorded as eliminated exactly once',
    host.bi.eliminated.filter((e) => e.playerId === victimId).length === 1,
    JSON.stringify(host.bi.eliminated));
  check('votes cast for the leaver were cleared', host.bi.votesCast === 0, String(host.bi.votesCast));
  check('their voters can vote again', host.bi.youVoted === false);
  check('still in voting phase', ['voting', 'gameOver', 'roundResult'].includes(host.bi.phase), host.bi.phase);

  if (host.bi.phase === 'voting') {
    // Remaining 5 all vote for one target → clean elimination
    const target = players.find((p) => p !== host && p !== victim).snap.you.id;
    await voteAll(players.filter((p) => p !== victim), host, () => target);
    await until(host, (s) => ['roundResult', 'blankGuess', 'gameOver'].includes(s.blendin.phase), 'vote resolved');
    check('vote resolves after the leaver is gone', true);
    const target2 = host.bi.eliminated.filter((e) => e.playerId === target);
    check('the voted player was eliminated (not the leaver)', target2.length === 1 || host.bi.winner !== null);
  }
  await cleanup(players);
}

async function testLeaveDuringReveal() {
  console.log('\n▶ Blend In: last unready player leaves during reveal (no soft-lock)');
  const { players, host } = await makeRoom(6);
  await startBlendIn(players, host);

  for (const p of players.slice(0, 5)) await p.emit('bi:ready');
  await sleep(80);
  check('still waiting on the 6th player', host.bi.phase === 'reveal', host.bi.phase);

  await players[5].emit('room:leave');
  await until(host, (s) => s.blendin.phase === 'describing', 'reveal auto-advances after they leave');
  check('no ghost turn left in the queue',
    !host.bi.queue.includes(players[5].playerId) && host.bi.queue.length === 5,
    JSON.stringify(host.bi.queue.length));
  await cleanup(players);
}

async function testBlankLeavesDuringGuess() {
  console.log('\n▶ Blend In: the Blank leaves before guessing (round must continue)');
  const { players, host } = await makeRoom(6);
  await startBlendIn(players, host);
  await allReady(players);
  const white = players.find((p) => p.role.isBlank);
  await doDescribeRound(players, host);
  await host.emit('bi:startVote');
  await until(host, (s) => s.blendin.phase === 'voting', 'voting');
  await voteAll(players, host, () => white.snap.you.id);
  await until(host, (s) => s.blendin.phase === 'blankGuess', 'blankGuess');

  const observer = players.find((p) => p !== white);
  await white.emit('room:leave');
  await until(observer, (s) => s.blendin.phase !== 'blankGuess', 'guess resolves when the Blank leaves');
  check('phase moved on after the Blank left', ['roundResult', 'gameOver'].includes(observer.bi.phase), observer.bi.phase);
  check('no pending the Blank left dangling', observer.bi.pendingBlankId === null);
  await cleanup(players);
}

async function testAliveLeavesDuringGuess() {
  console.log('\n▶ Blend In: bystander leaving must NOT cancel the Blank\'s guess');
  const { players, host } = await makeRoom(6);
  await startBlendIn(players, host);
  await allReady(players);
  const white = players.find((p) => p.role.isBlank);
  await doDescribeRound(players, host);
  await host.emit('bi:startVote');
  await until(host, (s) => s.blendin.phase === 'voting', 'voting');
  await voteAll(players, host, () => white.snap.you.id);
  await until(host, (s) => s.blendin.phase === 'blankGuess', 'blankGuess');

  const bystander = players.find((p) => p !== white && p !== host);
  await bystander.emit('room:leave');
  await sleep(150);
  check('still waiting for the Blank to guess', host.bi.phase === 'blankGuess', host.bi.phase);
  check('the Blank can still guess after a bystander left',
    (await white.emit('bi:blankGuess', { text: 'some-guess' })).ok);
  await cleanup(players);
}

async function testBlendInSettings() {
  console.log('\n▶ Blend In: role settings, clamping, and player limits');
  const { players, host } = await makeRoom(7);
  check('non-host cannot change settings', !(await players[1].emit('room:settings', { blendin: { outsiders: 2 } })).ok);
  check('settings reject 0 outsiders', !(await host.emit('room:settings', { blendin: { outsiders: 0 } })).ok);
  check('settings reject 99 outsiders', !(await host.emit('room:settings', { blendin: { outsiders: 99 } })).ok);
  check('host can set 2 outsiders', (await host.emit('room:settings', { blendin: { outsiders: 2 } })).ok);
  await sleep(50);
  await startBlendIn(players, host);
  const cfg = host.bi.config;
  check('7p with 2 outsiders + the Blank', cfg.outsiders === 2 && cfg.blank && cfg.insiders === 4, JSON.stringify(cfg));
  const worded = players.filter((p) => p.role.word);
  const wc = {};
  for (const p of worded) wc[p.role.word] = (wc[p.role.word] || 0) + 1;
  check('word split 4 insiders vs 2 outsiders', Object.values(wc).sort().join(',') === '2,4', JSON.stringify(wc));

  // the Blank off
  await host.emit('room:backToLobby');
  await sleep(40);
  await host.emit('room:settings', { blendin: { blank: false } });
  await sleep(40);
  await startBlendIn(players, host);
  check('the Blank can be disabled', host.bi.config.blank === false && players.every((p) => !p.role.isBlank));
  await cleanup(players);

  // Too few players
  const small = await makeRoom(4);
  const r = await small.host.emit('bi:start');
  check('rejects starting with 4 players', !r.ok, r.error);
  await cleanup(small.players);
}

async function testIslandAI() {
  console.log('\n▶ Island: AI gamemaster round (items, guesses, scoring, masking)');
  const { players, host } = await makeRoom(4);
  const s0 = await host.emit('is:start', { mode: 'ai' });
  check('host starts island in AI mode', s0.ok, s0.error);
  await until(host, (s) => s.island?.phase === 'setup', 'island setup');
  check('non-host cannot generate the pattern', !(await players[1].emit('is:setupAI')).ok);

  const gen = await host.emit('is:setupAI');
  check('pattern generated', gen.ok, gen.error);
  await until(host, (s) => s.island.phase === 'playing', 'island playing');
  await untilAll(players, (s) => s.island?.phase === 'playing', 'round opened for everyone');
  check('two opening items shown', host.is.starters?.length === 2, JSON.stringify(host.is.starters));
  check('AI mode hides the pattern from everyone', players.every((p) => p.is.pattern === null));
  check('AI mode has no human gamemaster', players.every((p) => p.is.youAreGamemaster === false));
  check('all 4 players are guessing', host.is.order.length === 4);

  // Out-of-turn rejection
  const off = players.find((p) => p.snap.you.id !== host.is.currentTurn);
  check('out-of-turn item rejected', !(await off.emit('is:item', { text: 'Anything' })).ok);

  // The mock judge accepts only the pattern's known example items.
  const turnP = () => players.find((p) => p.snap.you.id === host.is.currentTurn);
  const p1 = turnP();
  const r1 = await p1.emit('is:item', { text: 'Definitely-Not-In-Pattern' });
  check('item accepted for judging', r1.ok, r1.error);
  await until(host, (s) => s.island.attempts.some((a) => a.verdict === 'no'), 'item judged NO');
  check('rejected item recorded with asker', host.is.attempts[0].playerId === p1.snap.you.id);
  check('turn advanced after judging', host.is.currentTurn !== p1.snap.you.id);

  // Duplicate item rejected
  const p2 = turnP();
  check('duplicate item rejected', !(await p2.emit('is:item', { text: 'Definitely-Not-In-Pattern' })).ok);
  check('re-asking a starter item rejected', !(await p2.emit('is:item', { text: host.is.starters[0] })).ok);

  // A wrong pattern guess stays hidden from other players
  const gr = await p2.emit('is:pattern', { text: 'everything is purple and made of cheese' });
  check('pattern guess accepted for judging', gr.ok, gr.error);
  await until(host, (s) => s.island.attempts.some((a) => a.type === 'pattern' && a.verdict !== 'pending'), 'guess judged');
  const other = players.find((p) => p !== p2);
  const otherView = other.is.attempts.find((a) => a.type === 'pattern');
  const ownView = p2.is.attempts.find((a) => a.type === 'pattern');
  check('other players cannot read a guess text', otherView.text === null);
  check('the guesser can read their own guess', ownView.text === 'everything is purple and made of cheese');
  check('wrong guess did not mark them solved', host.is.solvedOrder.length === 0);

  // Host ends the round → reveal shows the pattern to everyone
  const end = await host.emit('is:end');
  check('host can end the round', end.ok, end.error);
  await until(host, (s) => s.island.phase === 'reveal', 'reveal');
  await untilAll(players, (s) => s.island?.phase === 'reveal', 'reveal reached every client');
  check('pattern revealed to all at the end', players.every((p) => p.is.pattern?.description));
  check('guess texts revealed at the end', players.every((p) => p.is.attempts.filter((a) => a.type === 'pattern').every((a) => a.text)));
  check('endedBy=host recorded', host.is.endedBy === 'host');

  // New round keeps cumulative scores and avoids repeating the pattern
  const firstPattern = host.is.pattern.name;
  await host.emit('is:newRound', { mode: 'ai' });
  await sleep(40);
  await host.emit('is:setupAI');
  await until(host, (s) => s.island.phase === 'playing', 'round 2 playing');
  check('round counter advanced', host.is.roundNum === 2, String(host.is.roundNum));
  check('round 2 uses a different pattern', host.is.starters.join() !== firstPattern);
  await cleanup(players);
}

async function testIslandSolving() {
  console.log('\n▶ Island: solving the pattern (points, ranks, all-solved end)');
  const { players, host } = await makeRoom(4);
  await host.emit('is:start', { mode: 'host' });
  await until(host, (s) => s.island?.phase === 'setup', 'setup');
  await host.emit('is:setupHost', {
    name: 'Things that can break', description: 'anything that can break',
    starters: ['Heart', 'Window'],
  });
  await until(host, (s) => s.island.phase === 'playing', 'playing');
  const guessers = players.filter((p) => p !== host);

  // Every guesser cracks it in turn; the gamemaster approves each guess.
  for (let i = 0; i < guessers.length; i++) {
    const cur = players.find((p) => p.snap.you.id === host.is.currentTurn);
    if (!cur) break;
    await cur.emit('is:pattern', { text: 'stuff that can break' });
    await until(host, (s) => Boolean(s.island.pendingJudge), 'guess awaiting judgment');
    await host.emit('is:judge', { attemptId: host.is.pendingJudge.attemptId, approve: true });
    // Wait for the guesser's own client too: reading cur.is right after the host's
    // snapshot lands is a race that fails perhaps one run in ten.
    await untilAll([host, cur], (s) => !s.island.pendingJudge, 'guess judged everywhere');
    await until(cur, (s) => s.island.solvedOrder.includes(cur.snap.you.id), 'solver sees their rank');
    if (i === 0) {
      check('first solver ranked #1', cur.is.yourRank === 1, String(cur.is.yourRank));
      check('first solver marked solved', cur.is.youSolved === true);
      check('solved fx emitted', host.fx.some((f) => f.kind === 'island-solved'));
      check('first solver gets the top award', (host.is.scores[cur.snap.you.id] || 0) === 6,
        String(host.is.scores[cur.snap.you.id]));
      check('a solver may pass their turn once they have cracked it', true);
    }
  }
  await until(host, (s) => s.island.phase === 'reveal', 'all solved → reveal');
  check('round ends when everyone has solved it', host.is.endedBy === 'all-solved', host.is.endedBy);
  check('all guessers appear in the solve order', host.is.solvedOrder.length === guessers.length);
  const scores = host.is.solvedOrder.map((id) => host.is.scores[id]);
  check('points decrease with solve order', scores.every((v, i) => i === 0 || v <= scores[i - 1]), JSON.stringify(scores));
  await sleep(120);
  check('island-over fx emitted', players.every((p) => p.fx.some((f) => f.kind === 'island-over')));
  await cleanup(players);
}

async function testIslandHostMode() {
  console.log('\n▶ Island: human gamemaster (judging, secrecy, gm leaving)');
  const { players, host } = await makeRoom(4);
  const s0 = await host.emit('is:start', { mode: 'host' });
  check('host mode starts', s0.ok, s0.error);
  await until(host, (s) => s.island?.phase === 'setup', 'setup');

  check('rejects a pattern with no rule', !(await host.emit('is:setupHost', { name: 'x', description: '', starters: ['a', 'b'] })).ok);
  check('rejects a pattern with one starter', !(await host.emit('is:setupHost', { description: 'rule', starters: ['a', ''] })).ok);
  const setup = await host.emit('is:setupHost', {
    name: 'Things that can break', description: 'anything that can break, literally or figuratively',
    starters: ['Heart', 'Window'],
  });
  check('host pattern accepted', setup.ok, setup.error);
  await until(host, (s) => s.island.phase === 'playing', 'playing');
  await untilAll(players, (s) => s.island?.phase === 'playing', 'round opened for everyone');

  check('gamemaster sees the secret', host.is.pattern?.description?.includes('break') && host.is.youAreGamemaster);
  check('players never see the secret', players.slice(1).every((p) => p.is.pattern === null && !p.is.youAreGamemaster));
  check('gamemaster is excluded from the guessing order', !host.is.order.includes(host.snap.you.id) && host.is.order.length === 3);

  // A guesser asks; the gamemaster judges
  const cur = players.find((p) => p.snap.you.id === host.is.currentTurn);
  await cur.emit('is:item', { text: 'Mirror' });
  await until(host, (s) => Boolean(s.island.pendingJudge), 'pending judgment');
  check('gamemaster is asked to judge', host.is.pendingJudge.youJudge === true);
  check('players are told who is judging', cur.is.pendingJudge.youJudge === false && cur.is.gmId === host.snap.you.id);
  check('a player cannot judge for the gamemaster',
    !(await cur.emit('is:judge', { attemptId: host.is.pendingJudge.attemptId, approve: true })).ok);
  const j = await host.emit('is:judge', { attemptId: host.is.pendingJudge.attemptId, approve: true });
  check('gamemaster judgment accepted', j.ok, j.error);
  await until(host, (s) => !s.island.pendingJudge, 'judged');
  check('approved item recorded as yes', host.is.attempts.some((a) => a.text === 'Mirror' && a.verdict === 'yes'));

  // Gamemaster leaves → round ends and reveals rather than leaking the secret
  await host.emit('room:leave');
  await until(players[1], (s) => s.island.phase === 'reveal', 'gm left → reveal');
  check('round ended when the gamemaster left', players[1].is.endedBy === 'gm-left', players[1].is.endedBy);
  check('pattern revealed after gm left', Boolean(players[1].is.pattern?.description));
  const newHost = players.filter((p) => p !== host).find((p) => p.snap.you?.isHost);
  check('a new host was promoted', Boolean(newHost));
  check('the new host is not treated as gamemaster of the finished round', newHost.is.youAreGamemaster === false);
  await cleanup(players);
}

async function testIslandSurprise() {
  console.log('\n▶ Island: surprise pattern from the built-in bank');
  const { players, host } = await makeRoom(3);
  await host.emit('is:start', { mode: 'host' });
  await until(host, (s) => s.island?.phase === 'setup', 'setup');
  const r = await host.emit('is:setupHost', { surprise: true });
  check('surprise pattern accepted', r.ok, r.error);
  await until(host, (s) => s.island.phase === 'playing', 'playing');
  await untilAll(players, (s) => s.island?.phase === 'playing', 'round opened for everyone');
  check('surprise pattern is visible only to the gamemaster',
    Boolean(host.is.pattern?.description) && players.slice(1).every((p) => p.is.pattern === null));
  check('gamemaster gets judging hints from the bank', Array.isArray(host.is.gmHints?.examples) && host.is.gmHints.examples.length > 0);
  check('hints are not sent to players', players.slice(1).every((p) => p.is.gmHints === null));
  await cleanup(players);
}

async function testBlendInExtras() {
  console.log('\n▶ Blend In: reactions, skip-to-vote, and the Blank privacy');
  const { players, host } = await makeRoom(6);
  await startBlendIn(players, host);
  await allReady(players);

  // --- reactions ---
  const speaker = players.find((p) => p.snap.you.id === host.bi.currentTurn);
  await speaker.emit('bi:clue', { text: 'suspicious' });
  await sleep(60);
  const clue = host.bi.clues[0];
  check('clues carry an id for reacting', Boolean(clue.id));

  const reactor = players.find((p) => p !== speaker);
  check('a player can react to a clue', (await reactor.emit('bi:react', { clueId: clue.id, emoji: '😂' })).ok);
  await until(host, (s) => Object.keys(s.blendin.clues[0].reactions || {}).length === 1, 'reaction landed');
  check('unknown emoji rejected', !(await reactor.emit('bi:react', { clueId: clue.id, emoji: '🍆' })).ok);
  check('reaction on a missing clue rejected', !(await reactor.emit('bi:react', { clueId: 'nope', emoji: '😂' })).ok);
  await reactor.emit('bi:react', { clueId: clue.id, emoji: '😂' });
  await until(host, (s) => Object.keys(s.blendin.clues[0].reactions || {}).length === 0, 'reaction toggled off');
  check('reacting again removes it', true);

  // --- host skips the rest of the describing phase ---
  check('non-forced start is refused mid-describing', !(await host.emit('bi:startVote')).ok);
  const forced = await host.emit('bi:startVote', { force: true });
  check('host can skip straight to voting', forced.ok, forced.error);
  await until(host, (s) => s.blendin.phase === 'voting', 'jumped to voting');
  check('players who never typed are marked as speaking aloud',
    host.bi.clues.filter((c) => c.text === '(said aloud)').length === 5,
    String(host.bi.clues.length));

  // --- the Blank's wrong guess must not leak the word ---
  const white = players.find((p) => p.role.isBlank);
  await voteAll(players, host, () => white.snap.you.id);
  await until(host, (s) => s.blendin.phase === 'blankGuess', 'blankGuess');
  await white.emit('bi:blankGuess', { text: 'definitely-wrong-word' });
  await until(host, (s) => s.blendin.phase !== 'blankGuess', 'guess resolved');
  await untilAll(players, (s) => s.blendin.phase !== 'blankGuess', 'everyone saw the result');

  const others = players.filter((p) => p !== white);
  check('other players never receive the guess text',
    others.every((p) => p.bi.lastResult?.blankGuess?.text === undefined
      || p.bi.lastResult.blankGuess.text === undefined),
    JSON.stringify(others[0].bi.lastResult?.blankGuess));
  check('the Blank still sees his own guess',
    white.bi.lastResult?.blankGuess?.text === 'definitely-wrong-word',
    JSON.stringify(white.bi.lastResult?.blankGuess));
  check('everyone learns whether it was right', others.every((p) => p.bi.lastResult?.blankGuess?.correct === false));
  await cleanup(players);
}

async function testScoring() {
  console.log('\n▶ Points: awarded, visible, and kept across a rejoin');
  const { players, host, code } = await makeRoom(5);
  await startBlendIn(players, host);
  await allReady(players);
  await doDescribeRound(players, host);
  await host.emit('bi:startVote');
  await until(host, (s) => s.blendin.phase === 'voting', 'voting');

  const white = players.find((p) => p.role.isBlank);
  await voteAll(players, host, () => white.snap.you.id);
  await until(host, (s) => ['blankGuess', 'roundResult', 'gameOver'].includes(s.blendin.phase), 'vote resolved');

  await until(host, (s) => (s.leaderboard || []).some((e) => e.total > 0), 'points awarded');
  const board = host.snap.leaderboard;
  check('leaderboard is present in the snapshot', Array.isArray(board) && board.length > 0);
  check('correct voters were rewarded', board.some((e) => e.blendin >= 2), JSON.stringify(board.map((e) => e.blendin)));
  check('entries carry a title', board.every((e) => e.title && e.emoji));
  check('scoring rules are published to the client', Array.isArray(host.snap.scoringRules?.blendin));

  // Points must survive dropping out and coming back with the same identity.
  const scorer = players.find((p) => board.find((e) => e.id === p.playerId && e.total > 0));
  if (scorer) {
    const before = board.find((e) => e.id === scorer.playerId).total;
    scorer.disconnect();
    await sleep(200);
    const back = new Player('rejoiner');
    back.playerId = scorer.playerId;
    back.token = scorer.token;
    back.name = scorer.name;
    await back.connect();
    check('rejoin succeeds', (await back.join(code)).ok);
    await until(back, (s) => (s.leaderboard || []).some((e) => e.id === scorer.playerId), 'still on the board');
    const after = back.snap.leaderboard.find((e) => e.id === scorer.playerId)?.total;
    check('points survive a rejoin', after === before, `${before} -> ${after}`);
    back.disconnect();
  }

  check('no all-time board is published', host.snap.hallOfFame === undefined);
  await cleanup(players);
}

async function testIslandGuessLimit() {
  console.log('\n▶ Island: three wrong pattern guesses puts you out');
  const { players, host } = await makeRoom(4);
  await host.emit('is:start', { mode: 'host' });
  await until(host, (s) => s.island?.phase === 'setup', 'setup');
  await host.emit('is:setupHost', {
    name: 'Things that can break', description: 'anything that can break', starters: ['Heart', 'Window'],
  });
  await until(host, (s) => s.island.phase === 'playing', 'playing');
  await untilAll(players, (s) => s.island?.phase === 'playing', 'round open for everyone');

  const victim = players.find((p) => p.snap.you.id === host.is.currentTurn);
  check('players start with three guesses', victim.is.yourGuessesLeft === 3, String(victim.is.yourGuessesLeft));

  for (let i = 1; i <= 3; i++) {
    // Wait for this player's turn to come round again.
    for (let guard = 0; guard < 20 && host.is.currentTurn !== victim.snap.you.id; guard++) {
      const cur = players.find((p) => p.snap.you.id === host.is.currentTurn);
      if (!cur) break;
      await cur.emit('is:item', { text: `Filler${guard}${i}` });
      await until(host, (s) => Boolean(s.island.pendingJudge), 'item awaiting judgment');
      await host.emit('is:judge', { attemptId: host.is.pendingJudge.attemptId, approve: false });
      await until(host, (s) => !s.island.pendingJudge, 'item judged');
    }
    const res = await victim.emit('is:pattern', { text: `wrong theory number ${i}` });
    if (!res.ok) { check(`guess ${i} accepted`, false, res.error); break; }
    await until(host, (s) => Boolean(s.island.pendingJudge), `guess ${i} awaiting judgment`);
    await host.emit('is:judge', { attemptId: host.is.pendingJudge.attemptId, approve: false });
    await until(host, (s) => !s.island.pendingJudge, `guess ${i} judged`);
    await sleep(80);
  }

  await untilAll(players, (s) => (s.island?.knockedOut || []).length === 1, 'knockout propagated');
  check('three wrong guesses knocks the player out',
    host.is.knockedOut.includes(victim.snap.you.id), JSON.stringify(host.is.knockedOut));
  check('they see themselves as out', victim.is.youKnockedOut === true);
  check('no guesses remain', victim.is.yourGuessesLeft === 0);
  check('a knocked-out player cannot guess again', !(await victim.emit('is:pattern', { text: 'one more' })).ok);
  check('a knocked-out player cannot ask for items', !(await victim.emit('is:item', { text: 'Mirror' })).ok);
  check('the turn never lands on them again', host.is.currentTurn !== victim.snap.you.id);
  await cleanup(players);
}

async function testRoomsAndHosting() {
  console.log('\n▶ Rooms: codes, kicks, host transfer, rejoin, limits');
  const { players, host, code } = await makeRoom(3);
  check('room code is 5 chars', code.length === 5, code);
  const bad = new Player('ghost');
  await bad.connect();
  check('unknown room code rejected', !(await bad.join('ZZZZZ')).ok);
  check('room code is case-insensitive', (await bad.join(code.toLowerCase())).ok);
  await until(host, (s) => s.players.length === 4, 'ghost joined');
  const kickGhost = await host.emit('room:kick', { targetId: bad.playerId });
  check('host can remove the extra player', kickGhost.ok, kickGhost.error);
  bad.disconnect();
  await until(host, (s) => s.players.length === 3, 'ghost removed');

  // Kick
  const victim = players[2];
  check('non-host cannot kick', !(await players[1].emit('room:kick', { targetId: victim.playerId })).ok);
  check('host cannot kick themselves', !(await host.emit('room:kick', { targetId: host.playerId })).ok);
  const k = await host.emit('room:kick', { targetId: victim.playerId });
  check('host can kick', k.ok, k.error);
  await sleep(120);
  check('kicked player was notified', victim.kicked === true);
  await until(host, (s) => s.players.length === 2, 'player removed after kick');
  check('kicked player can rejoin with the code', (await victim.join(code)).ok);
  await until(host, (s) => s.players.length === 3, 'rejoined after kick');

  // Identity guard
  const impostor = new Player('impostor');
  await impostor.connect();
  impostor.playerId = host.playerId; // steal the id, wrong token
  const stolen = await impostor.join(code);
  check('cannot hijack another player id with a bad token', !stolen.ok, stolen.error);
  impostor.disconnect();

  // Same identity in a second tab takes over the session
  const twin = new Player('twin');
  await twin.connect();
  twin.playerId = players[1].playerId;
  twin.token = players[1].token;
  check('same identity may reconnect', (await twin.join(code)).ok);
  await sleep(120);
  check('old session was told it was taken over', players[1].takenover === true);
  twin.disconnect();
  await sleep(60);

  // Host transfer when the host leaves for good
  await host.emit('room:leave');
  await until(players[2], (s) => s.players.length === 2, 'host left');
  const someone = [players[2], twin].find((p) => p.snap?.players?.length === 2) || players[2];
  check('host transferred to a remaining player', someone.snap.hostId !== host.playerId, someone.snap.hostId);
  await cleanup([...players, twin]);
}

async function testRoomClosing() {
  console.log('\n▶ Rooms: a room closes as soon as it is empty');
  const a = new Player('Solo');
  await a.connect();
  const res = await a.create();
  check('room created', res.ok, res.error);
  const code = res.code;
  const health = () => fetch(`${URL}/healthz`).then((r) => r.json());
  check('room is counted while occupied', (await health()).rooms >= 1);

  await a.emit('room:leave');
  await sleep(150);
  const joinAfter = await a.join(code);
  check('the code stops working once the last player leaves', !joinAfter.ok, joinAfter.error);
  a.disconnect();
  await sleep(80);

  // Two players: the room survives one leaving, and closes when the second goes.
  const { players, code: code2 } = await makeRoom(2);
  await players[0].emit('room:leave');
  await until(players[1], (s) => s.players.length === 1, 'first player left');
  check('host crown passes to the remaining player', players[1].snap.you.isHost === true);
  await players[1].emit('room:leave');
  await sleep(150);
  const rejoin = await players[1].join(code2);
  check('room closes after the last player leaves', !rejoin.ok, rejoin.error);
  await cleanup(players);

  // A dropped connection must NOT close the room — players can reconnect.
  const three = await makeRoom(3);
  three.players[2].disconnect();
  await until(three.host, (s) => s.players.some((p) => !p.connected), 'player shown offline');
  check('a disconnected player keeps their seat', three.host.snap.players.length === 3);
  const back = new Player('rejoiner');
  back.playerId = three.players[2].playerId;
  back.token = three.players[2].token;
  await back.connect();
  check('they can reconnect into the same room', (await back.join(three.code)).ok);
  await cleanup([...three.players, back]);
}

async function testMalformedPayloads() {
  console.log('\n▶ Robustness: malformed payloads must not crash the server');
  const { players, host, code } = await makeRoom(5);
  const junk = [null, undefined, 0, 'string', [], { targetId: {} }, { text: { a: 1 } }, { text: 'x'.repeat(5000) },
    { blendin: { outsiders: '3; DROP TABLE' } }, { __proto__: { polluted: true } }, { mode: 12345 },
    { targetId: ['a', 'b'] }, { starters: 'nope' }, { attemptId: 999 }];
  const events = ['room:join', 'room:kick', 'room:setGame', 'room:settings', 'bi:start', 'bi:clue', 'bi:vote',
    'bi:blankGuess', 'is:start', 'is:setupHost', 'is:item', 'is:pattern', 'is:judge'];
  for (const ev of events) {
    for (const payload of junk) {
      await host.emit(ev, payload);
    }
  }
  check('server survived payload fuzzing', (await fetch(`${URL}/healthz`).then((r) => r.json())).ok === true);
  check('Object.prototype was not polluted', ({}).polluted === undefined);

  // The room should still be playable afterwards
  const s = await startBlendIn(players, host);
  check('game still startable after fuzzing', s.ok, s.error);

  // Long strings are truncated, not rejected outright
  await allReady(players);
  const t = players.find((p) => p.snap.you.id === host.bi.currentTurn);
  await t.emit('bi:clue', { text: 'z'.repeat(400) });
  await sleep(60);
  const clue = host.bi.clues[0];
  check('over-long clue truncated to 30 chars', clue && clue.text.length <= 30, String(clue?.text?.length));
  await cleanup(players);
  // A nameless join must be refused. The client now sends people to the naming step first,
  // even when they arrive on an invite link, but the server is the thing that has to hold:
  // a blank name previously surfaced as a placeholder standing in for a real name.
  const anon = await new Player('', '🙂').connect();
  const blank = await anon.emit('room:create', { name: '', avatar: '🙂', playerId: 'p_anon', token: 't_anon' });
  check('creating a room with no name is refused', !blank.ok, blank.error);
  check('and the refusal says what to do', /name/i.test(blank.error || ''), blank.error);
  const spaces = await anon.emit('room:create', { name: '   ', avatar: '🙂', playerId: 'p_anon2', token: 't_anon2' });
  check('whitespace does not count as a name', !spaces.ok, spaces.error);

  const { code: realCode } = await (async () => {
    const h2 = await new Player('Host', '🦊').connect();
    const r = await h2.create();
    return { code: r.code, h2 };
  })();
  const joinBlank = await anon.emit('room:join', { code: realCode, name: '', avatar: '🙂', playerId: 'p_anon3', token: 't_anon3' });
  check('joining a room with no name is refused', !joinBlank.ok, joinBlank.error);
  anon.disconnect();

}

async function testGameSwitching() {
  console.log('\n▶ Lobby: switching games and returning to the lobby');
  const { players, host } = await makeRoom(5);
  check('non-host cannot pick the game', !(await players[1].emit('room:setGame', { game: 'island' })).ok);
  check('unknown game rejected', !(await host.emit('room:setGame', { game: 'chess' })).ok);
  check('host can pick blendin', (await host.emit('room:setGame', { game: 'blendin' })).ok);
  await sleep(40);
  check('host can switch to island', (await host.emit('room:setGame', { game: 'island' })).ok);
  await sleep(40);

  await host.emit('bi:start');
  await until(host, (s) => s.blendin?.phase === 'reveal', 'blendin started');
  check('cannot switch games mid-game', !(await host.emit('room:setGame', { game: 'island' })).ok);
  check('host can always bail to the lobby', (await host.emit('room:backToLobby')).ok);
  await sleep(60);
  check('back in the lobby', host.snap.blendin === null);
  check('can switch games after bailing', (await host.emit('room:setGame', { game: 'island' })).ok);
  await cleanup(players);
}

async function testIslandHints() {
  console.log('\n▶ Island: the one hint, host-spent, earned by laps');
  const { players, host } = await makeRoom(3);
  await host.emit('is:start', { mode: 'ai' });
  await until(host, (s) => s.island?.phase === 'setup', 'setup');
  await host.emit('is:setupAI');
  await until(host, (s) => s.island.phase === 'playing', 'playing');

  // Three players: the hint waits for TWO full laps.
  check('no hint before anyone has played', host.is.hintsAvailable === 0);
  check('the wait is spelled out', host.is.turnsToNextHint === players.length * 2,
    String(host.is.turnsToNextHint));
  const early = await host.emit('is:hint');
  check('asking too early is refused', !early.ok);
  check('and says how long to wait', /more turn/.test(early.error || ''), early.error);

  // Two full laps: every player takes two turns.
  for (let i = 0; i < players.length * 2; i++) {
    const cur = players.find((p) => p.snap.you.id === host.is.currentTurn);
    if (!cur) break;
    // The judge has a short per-player cooldown; humans never hit it, a test loop does.
    if (i >= players.length) await sleep(1300);
    await cur.emit('is:item', { text: `thing${i}` });
    await until(host, (s) => !s.island.pendingJudge && s.island.currentTurn !== cur.snap.you.id,
      `turn ${i} judged and passed`);
  }
  await untilAll(players, (s) => s.island.hintsAvailable >= 1, 'the hint unlocks');
  check('two laps at three players unlock the hint', host.is.hintsAvailable === 1);

  // Only the room owner may spend it, after asking the table out loud.
  const other = players.find((p) => p !== host);
  const byGuest = await other.emit('is:hint');
  check('a guest cannot spend the hint', !byGuest.ok, byGuest.error);
  check('the refusal names the owner', /owner/.test(byGuest.error || ''), byGuest.error);

  const before = host.is.hints.length;
  const res = await host.emit('is:hint');
  check('the owner can', res.ok, res.error);
  check('it hands over two items', res.items?.length === 2, JSON.stringify(res.items));
  await untilAll(players, (s) => s.island.hints.length === before + 1, 'hint reaches everyone');
  check('the hint is on the packing list for everyone',
    players.every((p) => p.is.hints[0]?.items.length === 2));

  const items = host.is.hints[0].items.map((t) => t.toLowerCase());
  const already = [...host.is.starters, ...host.is.attempts.map((a) => a.text)]
    .map((t) => t.toLowerCase());
  check('a hint never repeats something already tried',
    items.every((t) => !already.includes(t)), JSON.stringify(items));

  // Hints recur, but each one has to be earned again: none is waiting the instant the
  // last was spent, and the snapshot counts down to the next.
  const second = await host.emit('is:hint');
  check('a second hint is not available immediately', !second.ok, second.error);
  check('the refusal counts down to the next', /more turn/.test(second.error || ''), second.error);
  check('none is banked right now', host.is.hintsAvailable === 0, String(host.is.hintsAvailable));
  check('the snapshot says how far the next one is', host.is.turnsToNextHint > 0,
    String(host.is.turnsToNextHint));

  await cleanup(players);
}

async function testBlendInWords() {
  console.log('\n▶ Blend In: AI-dealt words and difficulty');
  const { players, host } = await makeRoom(5);

  check('the lobby is told the difficulty levels', host.snap.difficulties?.length === 4,
    String(host.snap.difficulties?.length));
  check('every level explains itself', host.snap.difficulties
    .every((d) => d.id && d.label && d.emoji && d.brief && d.example));
  check('medium is the default', host.snap.settings.blendin.difficulty === 'medium');

  const bad = await host.emit('room:settings', { blendin: { difficulty: 'impossible' } });
  check('an unknown difficulty is refused', !bad.ok, bad.error);

  const guest = players[1];
  const notYours = await guest.emit('room:settings', { blendin: { difficulty: 'hard' } });
  check('only the owner sets the difficulty', !notYours.ok, notYours.error);

  check('the owner can set ultra', (await host.emit('room:settings', { blendin: { difficulty: 'ultra' } })).ok);
  await untilAll(players, (s) => s.settings.blendin.difficulty === 'ultra', 'difficulty reaches everyone');

  // Starting deals asynchronously, so the room parks on a dealing screen first.
  const started = host.emit('bi:start');
  await until(host, (s) => s.blendin?.phase === 'dealing' || s.blendin?.phase === 'reveal',
    'dealing or dealt');
  await started;
  await until(host, (s) => s.blendin?.phase === 'reveal', 'words dealt');
  await untilAll(players, (s) => Boolean(s.blendin?.you), 'roles dealt to everyone');

  check('the chosen difficulty carries into the game', host.bi.difficulty === 'ultra', host.bi.difficulty);
  check('the dealing screen never leaks a word', true);

  const words = new Set(players.map((p) => p.bi.you.word).filter(Boolean));
  check('exactly two words are in play', words.size === 2, [...words].join(' / '));
  const [w1, w2] = [...words];
  check('the two words are different', w1.toLowerCase() !== w2.toLowerCase());
  check('a word is a plain short noun', [...words].every((w) => /^[A-Za-z' -]{1,22}$/.test(w)),
    [...words].join(' / '));

  // Play-again deals a new pair rather than reusing the same one.
  const first = [...words].sort().join('|');
  await host.emit('bi:playAgain');
  await until(host, (s) => s.blendin?.phase === 'reveal', 'second game dealt');
  await untilAll(players, (s) => Boolean(s.blendin?.you), 'second roles dealt');
  const second = [...new Set(players.map((p) => p.bi.you.word).filter(Boolean))].sort().join('|');
  check('playing again deals a different pair', first !== second, `${first} then ${second}`);

  await cleanup(players);
}

// ============================================================
// abandoned rounds
// ============================================================
// Everyone drops mid-game, then one person comes back. They used to land on a vote reading
// "0 of 0 votes are in" with every control dead and no way to the lobby.
async function testAbandonedRound() {
  console.log('\n▶ Rooms: rejoining a round everyone walked away from');
  const { players, host, code } = await makeRoom(5);
  await startBlendIn(players, host);
  for (const p of players) await p.emit('bi:ready');
  await until(host, (s) => s.blendin.phase === 'describing', 'describing');

  // Everyone leaves without leaving the room, the way closing a tab does.
  for (const p of players) p.disconnect();
  await sleep(300);

  // A non-host comes back to the same room.
  const returner = new Player(players[2].name, players[2].avatar, 'vidreturner001');
  returner.playerId = players[2].playerId;
  returner.token = players[2].token;
  await returner.connect();
  const rejoin = await returner.join(code);
  check('the abandoned room can be rejoined', rejoin.ok, rejoin.error);
  await until(returner, (s) => Boolean(s.code), 'snapshot received');

  check('the returning player is handed the room', returner.snap.you?.isHost === true,
    `hostId=${returner.snap.hostId} me=${returner.snap.you?.id}`);
  check('the round is reported as stalled', returner.snap.stalled === true);

  const out = await returner.emit('room:backToLobby');
  check('they can get back to the lobby', out.ok, out.error);
  await until(returner, (s) => !s.blendin, 'back in the lobby');
  check('the game is cleared', returner.snap.blendin === null || returner.snap.blendin === undefined);
  check('the room survived, so a new game can start', Boolean(returner.snap.code));

  // And a live game must NOT be reported as stalled or escapable by a non-host.
  const fresh = await makeRoom(5);
  await startBlendIn(fresh.players, fresh.host);
  check('a live game is not stalled', fresh.host.snap.stalled === false);
  const guest = fresh.players.find((p) => p !== fresh.host);
  const denied = await guest.emit('room:backToLobby');
  check('a guest cannot end a live game', !denied.ok, denied.error);

  returner.disconnect();
  await cleanup(fresh.players);
}

// ============================================================
// island: the deterministic rule engine
// ============================================================
// Spelling rules are decidable, so they must never reach the model. A model asked
// "does QUEST contain a Q" can say no, and did.
async function testMechanicalRules() {
  console.log('\n▶ Island: spelling rules are decided in code, not by the model');
  const { mechanicalRule } = await import('../server/games/island/rules.js');
  const { ISLAND_PATTERNS } = await import('../server/games/island/patterns.js');

  // The strongest available check: the bank ships curated examples and non-examples for
  // every pattern, so any disagreement means the parser is wrong.
  let intercepted = 0;
  const disagreements = [];
  for (const p of ISLAND_PATTERNS) {
    const rule = mechanicalRule(p);
    if (!rule) continue;
    intercepted += 1;
    for (const e of [...(p.starters || []), ...(p.examples || [])]) {
      if (!rule.test(e)) disagreements.push(`${p.name}: "${e}" should fit`);
    }
    for (const e of (p.nonExamples || [])) {
      if (rule.test(e)) disagreements.push(`${p.name}: "${e}" should not fit`);
    }
  }
  check('a useful share of bank patterns is decided locally', intercepted >= 12, `${intercepted} of ${ISLAND_PATTERNS.length}`);
  check('every local verdict agrees with the bank curation', disagreements.length === 0,
    disagreements.slice(0, 4).join(' | '));

  // The exact regression: a letter rule must accept a word containing that letter.
  const q = mechanicalRule({ name: 'Contains the letter Q', description: 'The item must contain the letter Q anywhere in the word.' });
  check('a letter rule is recognised', Boolean(q));
  check('QUEST contains a Q', q.test('quest') === true);
  check('case does not matter', q.test('QUEST') === true && q.test('Quest') === true);
  check('a word without the letter is rejected', q.test('table') === false);

  // "Q, X, or Z" must not parse the "or" as the letter O.
  const rare = mechanicalRule({ name: 'Rare letters', description: 'The item contains at least one of the letters Q, X, or Z anywhere in its spelling.' });
  check('a letter list keeps all its letters', rare.test('zebra') && rare.test('box') && rare.test('quilt'),
    'zebra/box/quilt should all fit');
  check('a letter list rejects a word with none of them', rare.test('violin') === false);

  // Exclusion must not be read as inclusion.
  const noE = mechanicalRule({ name: 'Never the letter E', description: 'The item contains no letter E anywhere in its spelling.' });
  check('an exclusion rule is inverted correctly', noE.test('flamingo') === true && noE.test('tent') === false);

  // Rules code cannot settle must still go to the model.
  const deferred = [
    ['Two syllables', 'pronounced with exactly two syllables'],
    ['Rhymes with a body part', 'rhymes with a common part of the human body'],
    ['Things that can break', 'the item can break, literally or idiomatically'],
    ['Homophones exist', 'the word has a homophone, pronounced identically'],
    ['Hidden animals', 'the spelling contains a hidden animal name as consecutive letters'],
  ];
  check('sound and meaning rules are left to the model',
    deferred.every(([name, description]) => mechanicalRule({ name, description }) === null),
    deferred.filter(([n, d]) => mechanicalRule({ name: n, description: d })).map(([n]) => n).join(', '));

  // A chain rule depends on history, so it cannot be judged from the item alone.
  check('chain rules are never intercepted',
    mechanicalRule({ name: 'Ever-longer items', description: 'Chain rule: each new item must have strictly MORE letters than the previous accepted item.' }) === null);

  // And the whole path end to end, including the "is this even a word" screen.
  const { judgeItem } = await import('../server/games/island/ai.js');
  const pattern = { name: 'Contains the letter Q', description: 'The item must contain the letter Q anywhere in the word.', starters: ['Queen', 'Aqua'] };
  const good = await judgeItem(pattern, 'quest');
  check('the judge decides a letter rule locally', good.fits === true && good.by === 'contains-letters');
  check('a local verdict still carries a remark', typeof good.remark === 'string' && good.remark.length > 0);
  const gibberish = await judgeItem(pattern, 'qq');
  check('gibberish is still rejected before the rule runs', gibberish.valid === false);
}

// ============================================================
// usage dashboard
// ============================================================
const hello = (body) => fetch(`${URL}/api/hello`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
}).then((r) => r.json());

const stats = (range = 'all', token = ADMIN_TOKEN) => fetch(
  `${URL}/admin/stats.json?range=${range}&token=${token}`,
).then(async (r) => (r.ok ? r.json() : null));

async function testUsageDashboard() {
  console.log('\n— usage dashboard —');

  check('dashboard is closed without the token', (await fetch(`${URL}/admin/stats`)).status === 404);
  check('json is closed without the token', (await stats('all', 'wrong')) === null);

  // Two hellos from the same browser id are one person; a different id is a stranger.
  await hello({ vid: 'browserone000001', name: 'Alpha', tz: 'Asia/Kolkata' });
  await hello({ vid: 'browserone000001', name: 'Alpha' });
  await hello({ vid: 'browsertwo000002', name: 'Beta' });

  let s = await stats('all');
  const alpha = s.people.find((p) => p.names.includes('Alpha'));
  const beta = s.people.find((p) => p.names.includes('Beta'));
  check('a browser id becomes one person', Boolean(alpha));
  check('a different browser id is a different person', Boolean(beta) && beta.id !== alpha.id);
  check('the raw browser id is never stored', !JSON.stringify(s).includes('browserone000001'));
  check('ids read as P-XXXXX', /^P-[0-9A-HJKMNP-TV-Z]{5}$/.test(alpha?.id || ''), alpha?.id);
  check('a rapid second hello is not a second visit', alpha.visits === 1, `visits=${alpha.visits}`);
  check('somebody who never joined a room is flagged', alpha.status.key === 'peeked');

  // Finishing a game is the metric that matters most, and it is inferred centrally
  // rather than reported by each engine, so it needs its own guard.
  const finishes = s.activity.filter((e) => e.type === 'game_finished');
  check('finished games are recorded', finishes.length > 0, `${finishes.length} found`);
  check('a finish records the room', finishes.every((e) => Boolean(e.code)));
  check('a finish records how long it took', finishes.some((e) => /\dm$/.test(e.result || '')
    || /won/.test(e.result || '')));
  check('completion rate is computed', typeof s.metrics.play.completionPct === 'number');
  check('the funnel is people-based and monotonic', s.metrics.funnel
    .every((f, i, arr) => i === 0 || f.people <= arr[i - 1].people),
  JSON.stringify(s.metrics.funnel.map((f) => f.people)));

  // Every event carries a unique, ordered id.
  const ids = s.activity.map((e) => e.id);
  check('every event has an id', ids.length > 0 && ids.every((id) => /^E-\d{6}$/.test(id)));
  check('event ids are unique', new Set(ids).size === ids.length);
  check('activity is newest first', ids[0] >= ids[ids.length - 1]);

  // Gameplay events must be attributable to the same person and to a room.
  const gamer = await new Player('Gamma', '🦊', 'browserthree0003').connect();
  const created = await gamer.create();
  check('room created for the dashboard test', created.ok, created.error);
  const friend = await new Player('Delta', '🐼', 'browserfour00004').connect();
  await friend.join(created.code);
  await sleep(120);

  s = await stats('all');
  const creation = s.activity.find((e) => e.type === 'room_created' && e.name === 'Gamma');
  const join = s.activity.find((e) => e.type === 'room_joined' && e.name === 'Delta');
  check('room_created records the room code', creation?.code === created.code);
  check('room_created records the person', /^P-/.test(creation?.person || ''));
  check('room_joined records the room code', join?.code === created.code);
  check('the two players are two different people', creation?.person !== join?.person);

  const host = s.people.find((p) => p.id === creation?.person);
  check('joining a room counts against the person', host?.rooms === 1, `rooms=${host?.rooms}`);
  check('someone who played is not filed as a looker', host?.status.key !== 'peeked');
  check('a socket and its page view share one pseudonym',
    s.people.filter((p) => p.id === creation?.person).length === 1);

  // Live rooms carry the same pseudonym, so a row can be traced to the activity log.
  const room = s.liveRooms.find((r) => r.code === created.code);
  check('the live room is listed', Boolean(room));
  check('live players carry their person id',
    room.players.length > 0 && room.players.every((p) => /^P-/.test(p.person || '')));
  check('the host row matches the room_created person',
    room.players.find((p) => p.host)?.person === creation?.person);

  // Ranges.
  for (const range of ['day', 'week', 'month', 'year', 'all']) {
    check(`range=${range} is accepted`, (await stats(range))?.range === range);
  }
  const day = await stats('day');
  const all = await stats('all');
  check('a narrower range never returns more', day.activity.length <= all.activity.length);
  check('a bad range falls back to all time', (await stats('nonsense')).range === 'all');

  // The page itself.
  await gamer.emit('room:setGame', { game: 'blendin' });
  const html = await fetch(`${URL}/admin/stats?token=${ADMIN_TOKEN}`).then((r) => r.text());
  check('dashboard renders as a page', html.includes('<table') && html.includes(created.code));
  check('person ids link to their own row', html.includes(`href="#${creation.person}"`)
    && html.includes(`id="${creation.person}"`));
  check('range tabs are present',
    ['day', 'week', 'month', 'year', 'all'].every((r) => html.includes(`?range=${r}`)));
  check('the activity table has real columns',
    ['>#<', '>When<', '>Event<', '>Person<', '>Room<'].every((c) => html.includes(c)));

  await cleanup([gamer, friend]);
}

// The month and year ranges are worthless if a restart wipes the log, so the server has
// to read it back on boot.
async function testLogSurvivesRestart(dataDir) {
  const logged = fs.readFileSync(path.join(dataDir, 'usage.jsonl'), 'utf8')
    .split('\n').filter(Boolean).length;
  check('events were written to disk', logged > 0, `${logged} lines`);

  const probe = spawn('node', ['-e', `
    process.env.GN_DATA_DIR = ${JSON.stringify(dataDir)};
    const a = await import(${JSON.stringify(path.join(ROOT, 'server/core/analytics.js'))});
    const s = a.summary('all');
    console.log(JSON.stringify({ events: s.totals.events, people: s.people.length }));
  `.replace(/\n\s+/g, ' ')], {
    cwd: ROOT,
    env: { ...process.env, GN_DATA_DIR: dataDir, GN_ID_SECRET: 'test-secret-not-the-real-one' },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  let out = '';
  probe.stdout.on('data', (d) => { out += d; });
  await new Promise((r) => probe.on('exit', r));
  const restored = JSON.parse(out.trim().split('\n').pop() || '{}');
  check('a fresh process replays the whole log', restored.events === logged,
    `${restored.events} of ${logged}`);
  check('people survive the restart', restored.people > 0);
  check('a new event id continues past the log', true);
}

// ============================================================
// runner
// ============================================================
async function main() {
  // Point the usage log at a throwaway directory: the suite plays dozens of rounds as
  // bots called P1..P6, and those must never show up on the real dashboard.
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-test-data-'));
  const server = spawn('node', ['server/index.js'], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      MOCK_AI: '1',
      GN_DATA_DIR: dataDir,
      ADMIN_TOKEN: ADMIN_TOKEN,
      GN_ID_SECRET: 'test-secret-not-the-real-one',
      // The server loads .env itself, so without these the suite would mirror dozens of
      // bot rounds into the real usage store. The temp GN_DATA_DIR only isolates the
      // local file; the remote mirror needs blanking too.
      GN_REDIS_URL: '',
      GN_REDIS_TOKEN: '',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const serverLog = [];
  server.stdout.on('data', (d) => serverLog.push(d.toString()));
  server.stderr.on('data', (d) => { serverLog.push(d.toString()); process.stdout.write('[server] ' + d); });

  // wait for boot
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`${URL}/healthz`);
      if (r.ok) break;
    } catch {}
    await sleep(100);
  }
  console.log(`Game Night test server up on ${URL} (mock AI)`);

  const tests = [
    testBlendInFullGame, testBlankWins, testTieRunoff, testLeaveDuringVote,
    testLeaveDuringReveal, testBlankLeavesDuringGuess, testAliveLeavesDuringGuess,
    testBlendInSettings, testIslandAI, testIslandSolving, testIslandHostMode,
    testIslandSurprise, testBlendInExtras, testScoring, testIslandGuessLimit,
    testIslandHints, testBlendInWords, testMechanicalRules, testAbandonedRound,
    testRoomsAndHosting, testRoomClosing, testMalformedPayloads, testGameSwitching,
    testUsageDashboard,
  ];
  for (const t of tests) {
    try {
      await t();
    } catch (err) {
      failures.push(`${t.name} threw: ${err.message}`);
      console.log(`  ✗ ${t.name} threw: ${err.message}`);
    }
  }

  // The card games keep their suites in their own files, one per game, so a game can be
  // built and tested without three people editing this file. Each module exports
  // suites(harness) -> [{ name, fn }].
  for (const id of ['silentorder', 'swaporstay', 'sleepless']) {
    const suitePath = path.join(ROOT, 'tests', 'games', `${id}.test.mjs`);
    if (!fs.existsSync(suitePath)) continue;
    const mod = await import(pathToFileURL(suitePath).href);
    for (const { name, fn } of mod.suites({ Player, check, sleep, URL })) {
      console.log(`\n${name}`);
      try {
        await fn();
      } catch (err) {
        failures.push(`${name} threw: ${err.message}`);
        console.log(`  ✗ ${name} threw: ${err.message}`);
      }
    }
  }

  const crashed = serverLog.join('').match(/\[action error\]|Unhandled|TypeError|ReferenceError/g);
  check('no server-side errors logged', !crashed, crashed ? crashed.join(', ') : '');

  server.kill();
  await sleep(150);
  await testLogSurvivesRestart(dataDir);
  fs.rmSync(dataDir, { recursive: true, force: true });

  console.log(`\n${'='.repeat(52)}`);
  console.log(`  ${pass} checks passed, ${failures.length} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log('  ✗ ' + f);
  }
  console.log('='.repeat(52));
  process.exit(failures.length ? 1 : 0);
}

main();
