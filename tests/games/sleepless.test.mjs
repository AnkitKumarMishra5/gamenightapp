// Sleepless end-to-end suites, driven through the same Player harness as tests/e2e.mjs.
// The engine shuffles roles, so nothing here assumes who got what: every scenario first
// reads each player's own snapshot to learn their role, then steers the game with that
// knowledge — which is exactly the information a real player at that seat would have.
export function suites(harness) {
  const { Player, check, sleep } = harness;

  const AVATARS = ['🦊', '🐼', '🦁', '🐸', '🐙', '🦄', '🐳', '🐯', '🐺', '🦉', '🐝', '🐢'];
  const sl = (p) => p.snap?.sleepless;

  async function until(p, pred, label, ms = 5000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (p.snap && pred(p.snap)) return true;
      await sleep(25);
    }
    check(`wait: ${label}`, false, `timed out (phase=${sl(p)?.phase})`);
    return false;
  }

  // until() only watches one client; asserting on the others right after it returns is a
  // race. This waits for every listed client to have caught up.
  async function untilAll(players, pred, label, ms = 5000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (players.every((p) => p.snap && pred(p.snap))) return true;
      await sleep(25);
    }
    check(`wait: ${label}`, false, 'not all clients caught up');
    return false;
  }

  async function makeRoom(count) {
    const players = [];
    for (let i = 0; i < count; i++) {
      const p = new Player(`P${i + 1}`, AVATARS[i % AVATARS.length]);
      await p.connect();
      players.push(p);
    }
    const res = await players[0].create();
    if (!res.ok) throw new Error('room create failed: ' + res.error);
    for (const p of players.slice(1)) {
      const r = await p.join(res.code);
      if (!r.ok) throw new Error('join failed: ' + r.error);
    }
    await until(players[0], (s) => s.players.length === count, 'all players joined');
    return { players, code: res.code, host: players[0] };
  }

  async function cleanup(players) {
    for (const p of players) { try { p.disconnect(); } catch { /* already gone */ } }
    await sleep(60);
  }

  async function startSleepless(players, host) {
    const res = await host.emit('sl:start');
    check('host can start Sleepless', res.ok, res.error);
    await untilAll(players, (s) => Boolean(s.sleepless?.you), 'roles dealt to everyone');
    return res;
  }

  async function allReady(players, host) {
    for (const p of players) await p.emit('sl:ready');
    await untilAll(players, (s) => s.sleepless.phase === 'night', 'night falls');
  }

  // Which seat holds which card, read from each player's own snapshot only.
  function castOf(players) {
    const role = (r) => players.find((p) => sl(p)?.you?.role === r);
    return {
      prowler: role('prowler'),
      prowlers: players.filter((p) => sl(p)?.you?.role === 'prowler'),
      medic: role('medic'),
      sleepers: players.filter((p) => sl(p)?.you?.role === 'sleeper'),
    };
  }

  // Tonight's sum arrives in the snapshot without its answer, exactly as it reaches a
  // real phone. Working it out here is the test playing the game, not peeking at state.
  function solve(text) {
    const m = String(text).match(/^(\d+)\s*([+\u00d7])\s*(\d+)(?:\s*\+\s*(\d+))?$/);
    if (!m) throw new Error(`unreadable sum: ${text}`);
    const [a, b, c] = [Number(m[1]), Number(m[3]), Number(m[4] || 0)];
    return (m[2] === '+' ? a + b : a * b) + c;
  }
  const answerOf = (p) => solve(sl(p).puzzle.text);
  const night = (p, targetId) => p.emit('sl:night', { answer: answerOf(p), targetId });

  // picks maps a player to their target; a player mapped to null answers and sleeps.
  // Players absent from the map do not submit at all, so the night keeps waiting.
  async function submitNights(players, picks) {
    for (const p of players) {
      if (!sl(p)?.you?.alive || !picks.has(p)) continue;
      const r = await night(p, picks.get(p) || undefined);
      if (!r.ok) check(`night submission accepted for ${p.name}`, false, r.error);
      await sleep(15);
    }
  }

  async function voteAll(players, targetFor) {
    for (const p of players) {
      if (!sl(p)?.you?.alive) continue;
      const r = await p.emit('sl:vote', { targetId: targetFor(p) });
      if (!r.ok) check(`vote accepted for ${p.name}`, false, r.error);
      await sleep(15);
    }
  }

  // ============================================================

  async function fullVillageWin() {
    const { players, host } = await makeRoom(5);
    await startSleepless(players, host);

    // [TEST role counts] 5 players deal to exactly one prowler, one medic, 3 sleepers.
    const { prowler, medic, sleepers } = castOf(players);
    check('exactly one prowler and one medic', Boolean(prowler && medic));
    check('the rest are sleepers', sleepers.length === 3);

    // Snapshot secrecy at the deal: nobody's snapshot names anyone else's card.
    for (const p of players) {
      const json = JSON.stringify(sl(p));
      if (p !== prowler) check(`${p.name} cannot see the prowler`, !json.includes('"prowler"'), json.slice(0, 200));
      check(`${p.name} has no role map mid-game`, !json.includes('"roles"'));
    }
    check('non-host cannot deal', !(await players[1].emit('sl:start')).ok);

    // The ready gate holds until the whole table has peeked.
    for (const p of players.slice(0, 4)) await p.emit('sl:ready');
    await sleep(120);
    check('still dealing until everyone is ready', sl(host).phase === 'dealing', sl(host).phase);
    await players[4].emit('sl:ready');
    await untilAll(players, (s) => s.sleepless.phase === 'night', 'all ready → night 1');
    check('round counter starts at night 1', sl(host).round === 1);

    // [TEST] the sum gates every submission, whatever the role.
    check('everyone is handed a sum', players.every((p) => Boolean(sl(p).puzzle?.text)));
    check('the answer never ships to the client', !JSON.stringify(sl(prowler)).includes('"answer"'));
    check('a wrong answer is refused', !(await prowler.emit('sl:night', {
      answer: answerOf(prowler) + 1, targetId: sleepers[0].playerId })).ok);
    check('a missing answer is refused', !(await sleepers[0].emit('sl:night', {})).ok);

    // [TEST] self-picks: only the Medic may guard their own door.
    check('prowler cannot visit themselves', !(await night(prowler, prowler.playerId)).ok);
    check('junk target is refused', !(await night(prowler, 'nobody')).ok);

    // [TEST medic self-guard allowed] and [TEST night ends only when ALL have submitted].
    const victim = sleepers[1];
    const s3 = sleepers[2];
    await submitNights(players, new Map([
      [prowler, victim.playerId],
      [medic, medic.playerId],
      [s3, null],
    ]));
    await untilAll(players, (s) => s.sleepless.submitted === 3, 'three picks in');
    check('night waits for the sleepers', sl(host).phase === 'night', sl(host).phase);
    check('progress is a count, never names', sl(sleepers[0]).submitted === 3
      && sl(sleepers[0]).youSubmitted === false && sl(prowler).youSubmitted === true);
    // Looks for the KEY form `"night":` — the phase VALUE "night" is public and fine.
    check('picks never appear in a snapshot', !JSON.stringify(sl(sleepers[0])).includes('"night":'));

    // The remaining Sleepers answer their sums and turn in. They send no target, and
    // the dawn is decided by the Prowler and the Medic alone.
    await submitNights(players, new Map([
      [sleepers[0], null],
      [victim, null],
    ]));
    await untilAll(players, (s) => s.sleepless.phase === 'day', 'all picks in → dawn');
    check('the unguarded victim dies', sl(host).dawn?.kind === 'death'
      && sl(host).dawn.victimId === victim.playerId, JSON.stringify(sl(host).dawn));
    check('their role is revealed publicly', sl(host).dawn.role === 'sleeper');
    check('a sleeper\'s night changes nothing about who dies', players.filter((p) => sl(host).players
      .find((q) => q.id === p.playerId && !q.alive)).length === 1);
    // [TEST] the night hands nothing private to anyone: no clue fields at all.
    for (const p of players) {
      const json = JSON.stringify(sl(p));
      check(`${p.name} learns nothing private overnight`,
        !json.includes('dream') && !json.includes('witness') && !json.includes('instinct'));
    }

    // [TEST dead player snap secrecy] The dead spectate with no extra knowledge.
    const dead = sl(victim);
    check('the dead keep their own role', dead.you.role === 'sleeper' && dead.you.alive === false);
    check('the dead see no hidden roles', !JSON.stringify(dead).includes('"prowler"')
      && !JSON.stringify(dead).includes('"roles"'));
    check('the dead cannot vote', !(await victim.emit('sl:vote', { targetId: prowler.playerId })).ok);

    // [TEST] vote edges: no dead targets, no self-votes, last write wins.
    const [s0] = sleepers;
    check('cannot vote for a dead player', !(await s0.emit('sl:vote', { targetId: victim.playerId })).ok);
    check('cannot vote for yourself', !(await s0.emit('sl:vote', { targetId: s0.playerId })).ok);
    check('a first vote is accepted', (await s0.emit('sl:vote', { targetId: medic.playerId })).ok);
    check('a changed vote replaces it', (await s0.emit('sl:vote', { targetId: 'skip' })).ok);
    await until(host, (s) => s.sleepless.voteCount === 1, 'one ballot counted');
    check('votes stay sealed until all are in', sl(medic).votes === null);

    // Everyone turns on the prowler → the village wins on the spot.
    await voteAll([medic, s3, prowler], (p) => (p === prowler ? medic.playerId : prowler.playerId));
    await untilAll(players, (s) => s.sleepless.phase === 'gameOver', 'prowler voted out → game over');
    check('village wins', sl(host).winner?.side === 'village', JSON.stringify(sl(host).winner));
    check('winner names the prowler', sl(host).winner.prowlerId === prowler.playerId);
    check('the full role map arrives only now', Object.keys(sl(host).winner.roles).length === 5);
    check('ballots are public at the reveal', sl(host).votes?.[s0.playerId] === 'skip',
      JSON.stringify(sl(host).votes));

    // Scoring settles at the end: villagers paid by survival, instinct paid on top.
    await until(host, (s) => (s.leaderboard || []).some((e) => e.total > 0), 'points awarded');
    const board = host.snap.leaderboard;
    const total = (p) => board.find((e) => e.id === p.playerId)?.total || 0;
    // 4 for surviving, plus 1 for the single night-sum this game got through.
    check('living villagers earn 4 + their sum', total(s0) === 5 && total(medic) === 5, `${total(s0)}/${total(medic)}`);
    // 2 for falling on the winning side, plus the sum they answered before it.
    check('the fallen villager earns 2 + their sum', total(victim) === 3, String(total(victim)));
    check('the losing prowler earns only their sum', total(prowler) === 1, String(total(prowler)));

    // The same button deals the next game.
    check('host can run it back', (await host.emit('sl:next')).ok);
    await untilAll(players, (s) => s.sleepless?.phase === 'dealing', 'fresh deal');
    await cleanup(players);
  }

  // ============================================================

  async function prowlerWinWithSavesAndTies() {
    const { players, host } = await makeRoom(5);
    await startSleepless(players, host);
    await allReady(players, host);
    const { prowler, medic, sleepers } = castOf(players);
    const [s1, s2, s3] = sleepers;

    // Night 1: the Medic guards the exact door the Prowler visits. [TEST medic save]
    await submitNights(players, new Map([
      [prowler, s1.playerId],
      [medic, s1.playerId],
      [s1, null], [s2, null], [s3, null],
    ]));
    await untilAll(players, (s) => s.sleepless.phase === 'day', 'dawn after the save');
    check('a guarded victim survives', sl(host).dawn?.kind === 'saved', JSON.stringify(sl(host).dawn));
    check('the survivor is never named', sl(host).dawn.victimId === undefined);
    check('nobody died', sl(host).players.every((p) => p.alive));

    // Day 1: everyone skips → nobody goes home. [TEST skip]
    await voteAll(players, () => 'skip');
    await untilAll(players, (s) => s.sleepless.phase === 'verdict', 'skip vote resolves');
    check('skip plurality eliminates nobody', sl(host).verdict?.outId === null && sl(host).verdict.tie === true);
    // players[1] is never the room owner, whatever role they drew.
    check('non-host cannot advance the night', !(await players[1].emit('sl:next')).ok);
    await host.emit('sl:next');
    await untilAll(players, (s) => s.sleepless.phase === 'night' && s.sleepless.round === 2, 'night 2');

    // [TEST the medic must move] Last night's door — s1 — is barred tonight.
    check('the medic is told which door is barred', sl(medic).lastGuard === s1.playerId);
    check('nobody else sees the barred door', sl(s2).lastGuard === null && sl(prowler).lastGuard === null);
    check('the medic cannot guard the same door twice', !(await night(medic, s1.playerId)).ok);

    // Night 2: the guard moves elsewhere, so the Medic falls.
    await submitNights(players, new Map([
      [prowler, medic.playerId],
      [medic, s2.playerId],
      [s1, null], [s2, null], [s3, null],
    ]));
    await untilAll(players, (s) => s.sleepless.phase === 'day', 'dawn 2');
    check('the medic falls unguarded', sl(host).dawn?.victimId === medic.playerId
      && sl(host).dawn.role === 'medic');

    // Day 2: a dead 2–2 tie → nobody goes home. [TEST tie]
    await voteAll([prowler, s3, s1, s2], (p) => {
      if (p === prowler || p === s3) return s1.playerId;
      return prowler.playerId;
    });
    await untilAll(players, (s) => s.sleepless.phase === 'verdict', 'tie vote resolves');
    check('a tie eliminates nobody', sl(host).verdict?.outId === null && sl(host).verdict.tie === true,
      JSON.stringify(sl(host).verdict));
    check('everyone still standing after the tie', sl(host).players.filter((p) => p.alive).length === 4);
    await host.emit('sl:next');
    await untilAll(players, (s) => s.sleepless.phase === 'night' && s.sleepless.round === 3, 'night 3');
    // The fallen Medic is a spectator now, at night as much as by day — and no longer
    // a target either. [TEST prowler picks a dead target → GameError]
    check('a dead player cannot pick at night', !(await medic.emit('sl:night', { answer: 1, targetId: s1.playerId })).ok);
    check('the prowler cannot visit the dead', !(await night(prowler, medic.playerId)).ok);

    // Night 3 and 4: the Prowler works the table down to two. [TEST prowler win]
    await submitNights(players, new Map([
      [prowler, s1.playerId], [s3, null], [s1, null], [s2, null],
    ]));
    await untilAll(players, (s) => s.sleepless.phase === 'day', 'dawn 3');
    await voteAll([prowler, s3, s2], () => 'skip');
    await untilAll(players, (s) => s.sleepless.phase === 'verdict', 'day 3 skipped');
    await host.emit('sl:next');
    await untilAll(players, (s) => s.sleepless.phase === 'night' && s.sleepless.round === 4, 'night 4');

    await submitNights(players, new Map([
      [prowler, s3.playerId], [s3, null], [s2, null],
    ]));
    await untilAll(players, (s) => s.sleepless.phase === 'gameOver', 'two left → prowler wins');
    check('prowler wins at two standing', sl(host).winner?.side === 'prowler', JSON.stringify(sl(host).winner));

    // 8 for the win, 1 for each of the three completed votes stared down, plus sums.
    await until(host, (s) => (s.leaderboard || []).some((e) => e.id === prowler.playerId), 'prowler on the board');
    const entry = host.snap.leaderboard.find((e) => e.id === prowler.playerId);
    check('prowler paid for the win, the votes survived and their sums', entry?.total === 15, String(entry?.total));
    await cleanup(players);
  }

  // ============================================================

  async function roleCountsAtTheLimits() {
    // [TEST 4-player start] The smallest table still has one of every role.
    const small = await makeRoom(4);
    await startSleepless(small.players, small.host);
    const c4 = castOf(small.players);
    check('4 players: one prowler and one medic', Boolean(c4.prowler && c4.medic));
    check('4 players: exactly two sleepers', c4.sleepers.length === 2);
    await cleanup(small.players);

    // [TEST 12-player start] From nine players the Prowlers hunt as a pack of two.
    const big = await makeRoom(12);
    await startSleepless(big.players, big.host);
    const c12 = castOf(big.players);
    check('12 players: a pack of two prowlers', c12.prowlers.length === 2, String(c12.prowlers.length));
    check('12 players: exactly one medic', Boolean(c12.medic));
    check('12 players: nine sleepers', c12.sleepers.length === 9, String(c12.sleepers.length));
    // Each prowler sees the other; nobody else carries an allies list.
    const [pa, pb] = c12.prowlers;
    check('the pack knows each other', sl(pa).you.allies.includes(pb.playerId) && sl(pb).you.allies.includes(pa.playerId));
    check('villagers get no allies field', c12.sleepers.every((p) => (sl(p).you.allies || []).length === 0));
    check('a prowler cannot hunt the pack', !(await pa.emit('sl:night', { targetId: pb.playerId })).ok);
    await cleanup(big.players);

    // [TEST 16-player start] The cap: a pack of three, and the room is full.
    const max = await makeRoom(16);
    await startSleepless(max.players, max.host);
    const c16 = castOf(max.players);
    check('16 players: a pack of three prowlers', c16.prowlers.length === 3, String(c16.prowlers.length));
    check('16 players: twelve sleepers', c16.sleepers.length === 12, String(c16.sleepers.length));
    await cleanup(max.players);

    // Too small to hide a Prowler in.
    const tiny = await makeRoom(3);
    const r = await tiny.host.emit('sl:start');
    check('rejects starting with 3 players', !r.ok, r.error);
    await cleanup(tiny.players);
  }

  // ============================================================

  async function nightDisconnectsAndRemovals() {
    const { players, host, code } = await makeRoom(6);
    await startSleepless(players, host);
    await allReady(players, host);
    const { prowler, medic, sleepers } = castOf(players);
    // The player who drops and later gets kicked must not be the room owner: the test
    // needs the owner's socket alive to do the kicking. Any role can be the owner, but
    // with four sleepers at a six-seat table at least three are not.
    const sC = sleepers.find((p) => p !== host);
    const [sA, sB, sD] = sleepers.filter((p) => p !== sC);

    // Everyone but one sleeper settles in, then that sleeper's connection drops.
    await submitNights(players, new Map([
      [prowler, sB.playerId],
      [medic, medic.playerId],
      [sD, null], [sA, null], [sB, null],
    ]));
    await untilAll([prowler, sD], (s) => s.sleepless.submitted === 5, 'five of six picks in');
    sC.disconnect();
    await sleep(300);
    // [TEST disconnect at night: night waits] Their pick is theirs to make.
    check('the night waits for a dropped player', sl(prowler).phase === 'night', sl(prowler).phase);

    // [TEST returning player resumes cleanly] Same identity, new socket, same night.
    const back = new Player(sC.name, '🐢');
    back.playerId = sC.playerId;
    back.token = sC.token;
    await back.connect();
    check('they can reconnect into the night', (await back.join(code)).ok);
    await until(back, (s) => s.sleepless?.phase === 'night', 'rejoined mid-night');
    check('their answer still lands', (await night(back)).ok);
    await untilAll([prowler, back], (s) => s.sleepless.phase === 'day', 'night resolves after the return');
    check('the dawn arrived', sl(prowler).dawn?.victimId === sB.playerId);

    // On to the next night, where a player is REMOVED instead of returning.
    const present = [...players.filter((p) => p !== sC), back];
    await voteAll(present, () => 'skip');
    await untilAll([prowler, back], (s) => s.sleepless.phase === 'verdict', 'day 1 skipped');
    await host.emit('sl:next');
    await untilAll([prowler, back], (s) => s.sleepless.phase === 'night' && s.sleepless.round === 2, 'night 2');

    // The medic guarded their own door on night 1, so tonight the guard must move.
    check('the medic cannot repeat last night\'s guard', !(await night(medic, medic.playerId)).ok);
    await submitNights([prowler, medic, sD, sA], new Map([
      [prowler, sA.playerId],
      [medic, prowler.playerId],
      [sD, null], [sA, null],
    ]));
    await until(prowler, (s) => s.sleepless.submitted === 4, 'four of five picks in');
    check('still waiting on the removed-to-be', sl(prowler).phase === 'night');

    // [TEST removed at night: pending submit dropped from the wait set]
    check('host removes the absent player', (await host.emit('room:kick', { targetId: back.playerId })).ok);
    await untilAll([prowler, sD], (s) => s.sleepless.phase === 'day', 'kick unblocks the dawn');
    check('the night resolved without them', sl(prowler).dawn?.victimId === sA.playerId);
    check('the removed player is marked as gone', sl(prowler).players
      .find((p) => p.id === back.playerId)?.left === true);

    // [TEST prowler removed → village wins immediately]
    await voteAll([prowler, medic, sD], () => 'skip');
    await untilAll([prowler, sD], (s) => s.sleepless.phase === 'verdict', 'day 2 skipped');
    await host.emit('sl:next');
    await until(sD, (s) => s.sleepless.phase === 'night' && s.sleepless.round === 3, 'night 3');
    await prowler.emit('room:leave');
    await until(sD, (s) => s.sleepless.phase === 'gameOver', 'prowler leaves → game over');
    check('village wins the moment the prowler leaves', sl(sD).winner?.side === 'village');
    back.disconnect();
    await cleanup(players);
  }

  return [
    { name: 'sleepless: full game to a village win', fn: fullVillageWin },
    { name: 'sleepless: saves, skips, ties, and a prowler win', fn: prowlerWinWithSavesAndTies },
    { name: 'sleepless: role counts and the pack at 4, 12 and 16 players', fn: roleCountsAtTheLimits },
    { name: 'sleepless: night disconnects, removals, and a fleeing prowler', fn: nightDisconnectsAndRemovals },
  ];
}
