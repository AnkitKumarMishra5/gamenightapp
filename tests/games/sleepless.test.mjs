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
      medic: role('medic'),
      oracle: role('oracle'),
      sleepers: players.filter((p) => sl(p)?.you?.role === 'sleeper'),
    };
  }

  async function submitNights(players, picks) {
    for (const p of players) {
      if (!sl(p)?.you?.alive) continue;
      const target = picks.get(p);
      if (!target) continue;
      const r = await p.emit('sl:night', { targetId: target });
      if (!r.ok) check(`night pick accepted for ${p.name}`, false, r.error);
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

    // [TEST role counts] 5 players deal to exactly 1/1/1 and 2 sleepers.
    const { prowler, medic, oracle, sleepers } = castOf(players);
    check('exactly one prowler, medic, oracle', Boolean(prowler && medic && oracle));
    check('the rest are sleepers', sleepers.length === 2);

    // Snapshot secrecy at the deal: nobody's snapshot names anyone else's card.
    for (const p of players) {
      const json = JSON.stringify(sl(p));
      if (p !== prowler) check(`${p.name} cannot see the prowler`, !json.includes('"prowler"'), json.slice(0, 200));
      check(`${p.name} has no role map mid-game`, !json.includes('"roles"'));
      if (p !== oracle) check(`${p.name} gets no oracle field`, sl(p).oracle === null);
    }
    check('non-host cannot deal', !(await players[1].emit('sl:start')).ok);

    // The ready gate holds until the whole table has peeked.
    for (const p of players.slice(0, 4)) await p.emit('sl:ready');
    await sleep(120);
    check('still dealing until everyone is ready', sl(host).phase === 'dealing', sl(host).phase);
    await players[4].emit('sl:ready');
    await untilAll(players, (s) => s.sleepless.phase === 'night', 'all ready → night 1');
    check('round counter starts at night 1', sl(host).round === 1);

    // [TEST] self-picks: only the Medic may guard their own door.
    check('prowler cannot visit themselves', !(await prowler.emit('sl:night', { targetId: prowler.playerId })).ok);
    check('oracle cannot read themselves', !(await oracle.emit('sl:night', { targetId: oracle.playerId })).ok);
    check('a sleeper cannot pick themselves', !(await sleepers[0].emit('sl:night', { targetId: sleepers[0].playerId })).ok);
    check('junk target is refused', !(await prowler.emit('sl:night', { targetId: 'nobody' })).ok);

    // [TEST medic self-guard allowed] and [TEST night ends only when ALL have submitted].
    const victim = sleepers[1];
    await submitNights(players, new Map([
      [prowler, victim.playerId],
      [medic, medic.playerId],
      [oracle, prowler.playerId],
    ]));
    await untilAll(players, (s) => s.sleepless.submitted === 3, 'three picks in');
    check('night waits for the sleepers', sl(host).phase === 'night', sl(host).phase);
    check('progress is a count, never names', sl(sleepers[0]).submitted === 3
      && sl(sleepers[0]).youSubmitted === false && sl(prowler).youSubmitted === true);
    // Looks for the KEY form `"night":` — the phase VALUE "night" is public and fine.
    check('picks never appear in a snapshot', !JSON.stringify(sl(sleepers[0])).includes('"night":'));

    // [TEST decoy accepted + zero effect] The sleepers point at whoever they like; the
    // dawn is decided by the prowler and medic alone.
    await submitNights(players, new Map([
      [sleepers[0], prowler.playerId],
      [victim, medic.playerId],
    ]));
    await untilAll(players, (s) => s.sleepless.phase === 'day', 'all picks in → dawn');
    check('the unguarded victim dies', sl(host).dawn?.kind === 'death'
      && sl(host).dawn.victimId === victim.playerId, JSON.stringify(sl(host).dawn));
    check('their role is revealed publicly', sl(host).dawn.role === 'sleeper');
    check('sleeper decoys changed nothing', players.filter((p) => sl(host).players
      .find((q) => q.id === p.playerId && !q.alive)).length === 1);

    // [TEST oracle secrecy] Only the Oracle learns the reading.
    check('oracle learns the truth', sl(oracle).oracle?.targetId === prowler.playerId
      && sl(oracle).oracle.isProwler === true, JSON.stringify(sl(oracle).oracle));
    for (const p of players.filter((x) => x !== oracle)) {
      check(`${p.name} never sees the reading`, sl(p).oracle === null
        && !JSON.stringify(sl(p)).includes('isProwler'));
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
    await voteAll([medic, oracle, prowler], (p) => (p === prowler ? medic.playerId : prowler.playerId));
    await untilAll(players, (s) => s.sleepless.phase === 'gameOver', 'prowler voted out → game over');
    check('village wins', sl(host).winner?.side === 'village', JSON.stringify(sl(host).winner));
    check('winner names the prowler', sl(host).winner.prowlerId === prowler.playerId);
    check('the full role map arrives only now', Object.keys(sl(host).winner.roles).length === 5);
    check('ballots are public at the reveal', sl(host).votes?.[s0.playerId] === 'skip',
      JSON.stringify(sl(host).votes));

    // Scoring settles at the end: villagers paid by survival, oracle paid for the read.
    await until(host, (s) => (s.leaderboard || []).some((e) => e.total > 0), 'points awarded');
    const board = host.snap.leaderboard;
    const total = (p) => board.find((e) => e.id === p.playerId)?.total || 0;
    check('living villagers earn 4', total(s0) === 4 && total(medic) === 4, `${total(s0)}/${total(medic)}`);
    check('the fallen villager earns 2', total(victim) === 2, String(total(victim)));
    check('the oracle banks the correct read', total(oracle) === 7, String(total(oracle)));
    check('the losing prowler earns nothing', total(prowler) === 0, String(total(prowler)));

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
    const { prowler, medic, oracle, sleepers } = castOf(players);
    const [s1, s2] = sleepers;

    // Night 1: the Medic guards the exact door the Prowler visits. [TEST medic save]
    await submitNights(players, new Map([
      [prowler, s1.playerId],
      [medic, s1.playerId],
      [oracle, s2.playerId],
      [s1, prowler.playerId],
      [s2, s1.playerId],
    ]));
    await untilAll(players, (s) => s.sleepless.phase === 'day', 'dawn after the save');
    check('a guarded victim survives', sl(host).dawn?.kind === 'saved', JSON.stringify(sl(host).dawn));
    check('the survivor is never named', sl(host).dawn.victimId === undefined);
    check('nobody died', sl(host).players.every((p) => p.alive));
    check('oracle read a villager as not the prowler', sl(oracle).oracle?.isProwler === false);

    // Day 1: everyone skips → nobody goes home. [TEST skip]
    await voteAll(players, () => 'skip');
    await untilAll(players, (s) => s.sleepless.phase === 'verdict', 'skip vote resolves');
    check('skip plurality eliminates nobody', sl(host).verdict?.outId === null && sl(host).verdict.tie === true);
    // players[1] is never the room owner, whatever role they drew.
    check('non-host cannot advance the night', !(await players[1].emit('sl:next')).ok);
    await host.emit('sl:next');
    await untilAll(players, (s) => s.sleepless.phase === 'night' && s.sleepless.round === 2, 'night 2');

    // Night 2: the guard is elsewhere, so the Medic falls.
    await submitNights(players, new Map([
      [prowler, medic.playerId],
      [medic, s1.playerId],
      [oracle, s1.playerId],
      [s1, s2.playerId],
      [s2, s1.playerId],
    ]));
    await untilAll(players, (s) => s.sleepless.phase === 'day', 'dawn 2');
    check('the medic falls unguarded', sl(host).dawn?.victimId === medic.playerId
      && sl(host).dawn.role === 'medic');

    // Day 2: a dead 2–2 tie → nobody goes home. [TEST tie]
    await voteAll([prowler, oracle, s1, s2], (p) => {
      if (p === prowler || p === oracle) return s1.playerId;
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
    check('a dead player cannot pick at night', !(await medic.emit('sl:night', { targetId: s1.playerId })).ok);
    check('the prowler cannot visit the dead', !(await prowler.emit('sl:night', { targetId: medic.playerId })).ok);

    // Night 3 and 4: the Prowler works the table down to two. [TEST prowler win]
    await submitNights(players, new Map([
      [prowler, s1.playerId], [oracle, s1.playerId], [s1, s2.playerId], [s2, s1.playerId],
    ]));
    await untilAll(players, (s) => s.sleepless.phase === 'day', 'dawn 3');
    await voteAll([prowler, oracle, s2], () => 'skip');
    await untilAll(players, (s) => s.sleepless.phase === 'verdict', 'day 3 skipped');
    await host.emit('sl:next');
    await untilAll(players, (s) => s.sleepless.phase === 'night' && s.sleepless.round === 4, 'night 4');

    await submitNights(players, new Map([
      [prowler, oracle.playerId], [oracle, s2.playerId], [s2, oracle.playerId],
    ]));
    await untilAll(players, (s) => s.sleepless.phase === 'gameOver', 'two left → prowler wins');
    check('prowler wins at two standing', sl(host).winner?.side === 'prowler', JSON.stringify(sl(host).winner));

    // 8 for the win plus 1 for each of the three completed votes stared down.
    await until(host, (s) => (s.leaderboard || []).some((e) => e.id === prowler.playerId), 'prowler on the board');
    const entry = host.snap.leaderboard.find((e) => e.id === prowler.playerId);
    check('prowler paid for the win and the votes survived', entry?.total === 11, String(entry?.total));
    await cleanup(players);
  }

  // ============================================================

  async function roleCountsAtTheLimits() {
    // [TEST 4-player start] The smallest table still has one of every role.
    const small = await makeRoom(4);
    await startSleepless(small.players, small.host);
    const c4 = castOf(small.players);
    check('4 players: one of each role', Boolean(c4.prowler && c4.medic && c4.oracle));
    check('4 players: exactly one sleeper', c4.sleepers.length === 1);
    await cleanup(small.players);

    // [TEST 12-player start] The biggest table pads out with sleepers.
    const big = await makeRoom(12);
    await startSleepless(big.players, big.host);
    const c12 = castOf(big.players);
    check('12 players: one of each role', Boolean(c12.prowler && c12.medic && c12.oracle));
    check('12 players: nine sleepers', c12.sleepers.length === 9);
    await cleanup(big.players);

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
    const { prowler, medic, oracle, sleepers } = castOf(players);
    // The player who drops and later gets kicked must not be the room owner: the test
    // needs the owner's socket alive to do the kicking. Any role can be the owner, but
    // with three sleepers at a six-seat table at least two are not.
    const sC = sleepers.find((p) => p !== host);
    const [sA, sB] = sleepers.filter((p) => p !== sC);

    // Everyone but one sleeper settles in, then that sleeper's connection drops.
    await submitNights(players, new Map([
      [prowler, sB.playerId],
      [medic, medic.playerId],
      [oracle, prowler.playerId],
      [sA, sB.playerId],
      [sB, prowler.playerId],
    ]));
    await untilAll([prowler, oracle], (s) => s.sleepless.submitted === 5, 'five of six picks in');
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
    check('their pick still lands', (await back.emit('sl:night', { targetId: prowler.playerId })).ok);
    await untilAll([prowler, back], (s) => s.sleepless.phase === 'day', 'night resolves after the return');
    check('the dawn arrived', sl(prowler).dawn?.victimId === sB.playerId);

    // On to the next night, where a player is REMOVED instead of returning.
    const present = [...players.filter((p) => p !== sC), back];
    await voteAll(present, () => 'skip');
    await untilAll([prowler, back], (s) => s.sleepless.phase === 'verdict', 'day 1 skipped');
    await host.emit('sl:next');
    await untilAll([prowler, back], (s) => s.sleepless.phase === 'night' && s.sleepless.round === 2, 'night 2');

    await submitNights([prowler, medic, oracle, sA], new Map([
      [prowler, sA.playerId],
      [medic, medic.playerId],
      [oracle, sA.playerId],
      [sA, prowler.playerId],
    ]));
    await until(prowler, (s) => s.sleepless.submitted === 4, 'four of five picks in');
    check('still waiting on the removed-to-be', sl(prowler).phase === 'night');

    // [TEST removed at night: pending submit dropped from the wait set]
    check('host removes the absent player', (await host.emit('room:kick', { targetId: back.playerId })).ok);
    await untilAll([prowler, oracle], (s) => s.sleepless.phase === 'day', 'kick unblocks the dawn');
    check('the night resolved without them', sl(prowler).dawn?.victimId === sA.playerId);
    check('the removed player is marked as gone', sl(prowler).players
      .find((p) => p.id === back.playerId)?.left === true);

    // [TEST prowler removed → village wins immediately]
    await voteAll([prowler, medic, oracle], () => 'skip');
    await untilAll([prowler, oracle], (s) => s.sleepless.phase === 'verdict', 'day 2 skipped');
    await host.emit('sl:next');
    await until(oracle, (s) => s.sleepless.phase === 'night' && s.sleepless.round === 3, 'night 3');
    await prowler.emit('room:leave');
    await until(oracle, (s) => s.sleepless.phase === 'gameOver', 'prowler leaves → game over');
    check('village wins the moment the prowler leaves', sl(oracle).winner?.side === 'village');
    back.disconnect();
    await cleanup(players);
  }

  return [
    { name: 'sleepless: full game to a village win', fn: fullVillageWin },
    { name: 'sleepless: saves, skips, ties, and a prowler win', fn: prowlerWinWithSavesAndTies },
    { name: 'sleepless: role counts at 4 and 12 players', fn: roleCountsAtTheLimits },
    { name: 'sleepless: night disconnects, removals, and a fleeing prowler', fn: nightDisconnectsAndRemovals },
  ];
}
