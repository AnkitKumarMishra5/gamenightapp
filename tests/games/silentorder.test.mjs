// Silent Order end-to-end suites, driven through the same Player harness as tests/e2e.mjs.
//
// The engine shuffles for real, so the tests never assume which cards anyone holds.
// Instead they do what no player can: read every client's own hand, aggregate them, and
// then play either perfectly (the global ascending order) or deliberately wrongly (a
// player whose lowest is not the table's lowest). Both are fully deterministic whatever
// the shuffle dealt.
export function suites({ Player, check, sleep }) {
  const so = (p) => p.snap?.silentorder;

  async function until(p, pred, label, ms = 5000) {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      if (p.snap && pred(p.snap)) return true;
      await sleep(25);
    }
    check(`wait: ${label}`, false, `timed out (phase=${so(p)?.phase} level=${so(p)?.level})`);
    return false;
  }

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
      const p = new Player(`SO${i + 1}`, ['🦊', '🐼', '🦁', '🐸', '🐙', '🦄'][i % 6]);
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
    return { players, host: players[0], code: res.code };
  }

  async function cleanup(players) {
    for (const p of players) { try { p.disconnect(); } catch { /* already gone */ } }
    await sleep(60);
  }

  // Wait until every client agrees on the same run position, so hands read from their
  // snapshots are all from the same moment.
  async function settle(players, label) {
    const lead = players[0];
    return untilAll(players, (s) => {
      const a = s.silentorder; const b = so(lead);
      return a && b && a.level === b.level && a.played === b.played
        && a.lives === b.lives && a.phase === b.phase && a.over === b.over;
    }, label);
  }

  async function readyAll(players) {
    for (const p of players) {
      if (so(p)?.youPlay) {
        const r = await p.emit('so:ready');
        if (!r.ok) check('so:ready accepted', false, r.error);
      }
    }
    await untilAll(players, (s) => s.silentorder.phase === 'playing' || s.silentorder.over,
      'ready gate opens');
  }

  // Every card on the table right now, with who holds it, read from each client's own view.
  function tableHands(players) {
    return players
      .filter((p) => so(p) && !p.kicked)
      .flatMap((p) => (so(p).yourHand || []).map((card) => ({ card, p })));
  }

  // Play the whole level in the one order that can never be a mistake.
  async function playLevelClean(players) {
    const plan = tableHands(players).sort((a, b) => a.card - b.card);
    for (const move of plan) {
      const r = await move.p.emit('so:play');
      if (!r.ok) { check('clean play accepted', false, `${move.card}: ${r.error}`); return false; }
    }
    return true;
  }

  // ----------------------------------------------------------------
  // 1. The happy path: a full clean run, every level, to the win.
  // ----------------------------------------------------------------
  async function testWin() {
    const { players, host } = await makeRoom(5);
    check('non-host cannot start', !(await players[1].emit('so:start')).ok);
    const start = await host.emit('so:start');
    check('host starts the run', start.ok, start.error);
    await untilAll(players, (s) => s.silentorder?.phase === 'dealing', 'first deal');
    check('game-start fx delivered', host.fx.some((f) => f.kind === 'game-start' && f.game === 'silentorder'));
    check('run has a start quip', typeof so(host).startQuip === 'string' && so(host).startQuip.length > 0);

    const maxLevel = so(host).maxLevel;
    check('5 players get 6 levels', maxLevel === 6, String(maxLevel));
    check('double start is refused mid-run', !(await host.emit('so:start')).ok);

    const startLives = so(host).lives;
    for (let level = 1; level <= maxLevel; level++) {
      await untilAll(players, (s) => s.silentorder.over
        || (s.silentorder.level === level && s.silentorder.phase === 'dealing'), `level ${level} dealt`);
      check(`level ${level}: everyone holds ${level} cards`,
        players.every((p) => so(p).yourHand.length === level));
      const all = tableHands(players).map((m) => m.card);
      check(`level ${level}: all dealt cards are unique`, new Set(all).size === all.length);
      await readyAll(players);
      if (!(await playLevelClean(players))) break;
      // [TEST] a clean clear costs nothing and pays a life.
      await until(host, (s) => s.silentorder.over || s.silentorder.level === level + 1,
        `level ${level} cleared`);
      check(`level ${level}: a clean clear earns a life`, so(host).lives === startLives + level);
    }

    await untilAll(players, (s) => s.silentorder.over, 'run over');
    check('clearing the final level wins the run', so(host).won === true);
    // fx fan out over per-socket queues a beat behind the state broadcast.
    for (let i = 0; i < 20 && !host.fx.some((f) => f.kind === 'so-won'); i++) await sleep(100);
    check('so-won fx delivered', host.fx.some((f) => f.kind === 'so-won'));
    check('the win has an end quip', (so(host).endQuip || '').length > 0);

    // Points: per level, each player played `level` clean cards (+1 each) and the clear
    // (+3); the win adds +8. For six levels that is 21 + 18 + 8.
    await until(host, (s) => (s.leaderboard || []).length > 0, 'leaderboard present');
    const totals = players.map((p) => host.snap.leaderboard.find((e) => e.id === p.playerId)?.silentorder || 0);
    check('everyone earned the full clean-run score', totals.every((t) => t === 47), totals.join(','));
    await cleanup(players);
  }

  // ----------------------------------------------------------------
  // 2. Mistakes: burns, lost lives, no refills, and the loss ending.
  // ----------------------------------------------------------------
  async function testLoss() {
    const { players, host } = await makeRoom(2);
    await host.emit('so:start');
    await untilAll(players, (s) => s.silentorder?.phase === 'dealing', 'dealt');
    check('2 players get 12 levels', so(host).maxLevel === 12, String(so(host).maxLevel));

    let livesBefore = so(host).lives;
    for (let guard = 0; guard < 24 && !so(host).over; guard++) {
      await settle(players, `settled (guard ${guard})`);
      if (so(host).over) break;
      if (so(host).phase === 'dealing') { await readyAll(players); await settle(players, 'post-ready'); }
      if (so(host).over) break;

      const hands = tableHands(players);
      if (!hands.length) { await sleep(50); continue; }
      const globalLow = Math.min(...hands.map((m) => m.card));
      const holders = players.filter((p) => (so(p).yourHand || []).length);
      const wrong = holders.find((p) => so(p).yourHand[0] !== globalLow);

      if (wrong) {
        // A deliberate mistake: this card leaves lower ones still out there.
        const played = so(wrong).yourHand[0];
        const levelBefore = so(host).level;
        const expectBurn = hands.map((m) => m.card).filter((c) => c < played).sort((a, b) => a - b);
        const r = await wrong.emit('so:play');
        check('the wrong play is still a legal action', r.ok, r.error);
        await untilAll(players, (s) => s.silentorder.lives === livesBefore - 1, 'life lost');
        const m = so(host).lastMistake;
        // [TEST] a mistake burns EVERY held card lower than the played one.
        check('mistake names the culprit and card', m && m.by === wrong.playerId && m.card === played,
          JSON.stringify(m));
        check('every lower card burned', JSON.stringify(m?.burned) === JSON.stringify(expectBurn),
          `burned ${JSON.stringify(m?.burned)} expected ${JSON.stringify(expectBurn)}`);
        // The burn may also have emptied every hand, in which case the next level has
        // already dealt and wiped the discard pile — only assert it while it exists.
        if (so(host).level === levelBefore && !so(host).over) {
          check('burned cards land in the public discards',
            expectBurn.every((c) => so(host).discards.includes(c)));
        }
        // The mistake is followed straight away by a fresh deal of the same level, so
        // the fx can still be in flight when the snapshot has already caught up.
        for (let i = 0; i < 20 && !host.fx.some((f) => f.kind === 'so-mistake'); i++) await sleep(100);
        check('so-mistake fx delivered', host.fx.some((f) => f.kind === 'so-mistake'));
        livesBefore -= 1;
      } else {
        // Only correct plays remain (one player holds everything low): play one and go round again.
        const r = await holders[0].emit('so:play');
        check('forced correct play accepted', r.ok, r.error);
        await settle(players, 'after forced play');
      }

      // [TEST] lives never refill between levels: whatever the level says, lives only fall.
      check('lives never refill', so(host).lives <= livesBefore, `${so(host).lives} > ${livesBefore}`);
    }

    await untilAll(players, (s) => s.silentorder.over, 'run over');
    // [TEST] 0 lives = the run is over and lost.
    check('three mistakes lose the run', so(host).won === false && so(host).lives === 0,
      `won=${so(host).won} lives=${so(host).lives}`);
    for (let i = 0; i < 20 && !host.fx.some((f) => f.kind === 'so-lost'); i++) await sleep(100);
    check('so-lost fx delivered', host.fx.some((f) => f.kind === 'so-lost'));
    check('the loss has an end quip', (so(host).endQuip || '').length > 0);
    check('playing after the end is refused', !(await host.emit('so:play')).ok);

    // [TEST] host-only new run.
    check('non-host cannot start a new run', !(await players[1].emit('so:next')).ok);
    const again = await host.emit('so:next');
    check('host starts a new run', again.ok, again.error);
    await untilAll(players, (s) => s.silentorder.level === 1 && !s.silentorder.over, 'new run dealt');
    check('the new run starts fresh', so(host).lives === so(host).startLives && so(host).played === 0);
    await cleanup(players);
  }

  // ----------------------------------------------------------------
  // 3. Guards, the ready gate, and snapshot secrecy.
  // ----------------------------------------------------------------
  async function testGuards() {
    const { players, host } = await makeRoom(3);
    await host.emit('so:start');
    await untilAll(players, (s) => s.silentorder?.phase === 'dealing', 'dealt');

    // [TEST] so:play outside the playing phase is refused.
    const early = await players[1].emit('so:play');
    check('playing during the deal is refused', !early.ok, early.error);

    // [TEST] double so:ready is idempotent.
    check('first ready accepted', (await players[1].emit('so:ready')).ok);
    await until(host, (s) => s.silentorder.readyCount === 1, 'one ready counted');
    check('second ready accepted quietly', (await players[1].emit('so:ready')).ok);
    await sleep(120);
    check('double ready counts once', so(host).readyCount === 1, String(so(host).readyCount));

    await readyAll(players);
    await untilAll(players, (s) => s.silentorder.phase === 'playing', 'playing');
    check('everyone was cleared from the ready list', so(host).readyCount === 0);

    // Clear level 1 cleanly to reach hands worth leaking.
    check('level 1 cleared', await playLevelClean(players));
    await untilAll(players, (s) => s.silentorder.level === 2 && s.silentorder.phase === 'dealing', 'level 2 dealt');

    // [TEST] snapshot secrecy: nobody's snapshot contains another player's hand.
    for (const a of players) {
      const aHand = JSON.stringify(so(a).yourHand);
      for (const b of players) {
        if (a === b) continue;
        const json = JSON.stringify(so(b));
        check(`${b.name} never sees ${a.name}'s hand`, !json.includes(aHand), aHand);
        check(`${b.name} snapshot has no raw hands map`, !json.includes('"hands"'));
        check('hands are disjoint', so(b).yourHand.every((c) => !so(a).yourHand.includes(c)));
      }
    }
    check('counts say how many, never which', Object.values(so(host).counts).every((n) => n === 2));

    // [TEST] an empty hand cannot play. Empty one player's hand, then ask again.
    await readyAll(players);
    const plan = tableHands(players).sort((x, y) => x.card - y.card);
    const firstDone = plan.filter((m) => m.p === plan[0].p);
    // Play ascending until the first player in the plan has played both their cards.
    let playedSoFar = 0;
    for (const move of plan) {
      await move.p.emit('so:play');
      playedSoFar += 1;
      if (move === firstDone[firstDone.length - 1]) break;
    }
    // If that player's last card happened to close the level, the pile has already reset.
    await until(host, (s) => s.silentorder.played === playedSoFar || s.silentorder.level === 3,
      'plays landed');
    const empty = await firstDone[0].p.emit('so:play');
    check('an empty hand cannot play', !empty.ok, empty.error);
    check('no life was lost to clean plays', so(host).lives >= so(host).startLives);

    // Points sanity: a clean level 1 pays 1 for the card and 3 for the clear.
    const entry = host.snap.leaderboard.find((e) => e.id === host.playerId);
    check('clean level 1 paid out', (entry?.silentorder || 0) >= 4, String(entry?.silentorder));
    await cleanup(players);
  }

  // ----------------------------------------------------------------
  // 4. Disconnects keep cards on the table; departures release them.
  // ----------------------------------------------------------------
  async function testLeavers() {
    const { players, host, code } = await makeRoom(4);
    await host.emit('so:start');
    await untilAll(players, (s) => s.silentorder?.phase === 'dealing', 'dealt');
    await readyAll(players);

    // [TEST] a disconnected player's cards stay in play.
    const dropper = players[3];
    dropper.disconnect();
    const rest = players.slice(0, 3);
    await untilAll(rest, (s) => s.players.some((p) => p.id === dropper.playerId && !p.connected),
      'drop noticed');
    check('their seat stays in the order', so(host).order.includes(dropper.playerId));
    check('their card stays on the table', so(host).counts[dropper.playerId] === 1);
    check('the round is not stalled with 3 still here', host.snap.stalled === false);

    // They come back and the level can still be finished.
    const back = new Player(dropper.name, dropper.avatar);
    back.playerId = dropper.playerId;
    back.token = dropper.token;
    await back.connect();
    check('the dropper reconnects', (await back.join(code)).ok);
    const table = [...rest, back];
    await untilAll(table, (s) => s.players.every((p) => p.connected), 'all reconnected');
    await until(back, (s) => Boolean(s.silentorder?.yourHand?.length), 'their hand is back');

    // [TEST] a departure that empties the last hand completes the level with no life lost.
    // Play ascending until only the highest card is left, held by whoever it is; then that
    // player leaves and the level must complete for everyone else.
    const plan = tableHands(table).sort((a, b) => a.card - b.card);
    for (const move of plan.slice(0, -1)) {
      const r = await move.p.emit('so:play');
      check('ascending play accepted', r.ok, r.error);
    }
    const leaver = plan[plan.length - 1].p;
    const stay = table.filter((p) => p !== leaver);
    await leaver.emit('room:leave');
    await untilAll(stay, (s) => s.silentorder.level === 2, 'level completed by the departure');
    check('a departure that clears the level still earns the life', so(stay[0]).lives === so(stay[0]).startLives + 1);
    check('the leaver is out of the order', !so(stay[0]).order.includes(leaver.playerId));
    check('three players remain', so(stay[0]).order.length === 3);

    // Regression: the ready gate must open when the one unready player leaves mid-deal.
    const [r1, r2, r3] = stay;
    await r1.emit('so:ready');
    await r2.emit('so:ready');
    await sleep(120);
    check('gate still waits on the third player', so(r1).phase === 'dealing', so(r1).phase);
    await r3.emit('room:leave');
    await untilAll([r1, r2], (s) => s.silentorder.phase === 'playing' || s.silentorder.over,
      'gate opens when the unready player leaves');
    check('play began without the leaver', so(r1).phase === 'playing', so(r1).phase);
    check('the run is down to two players', so(r1).order.length === 2);
    await cleanup([...players, back]);
  }

  return [
    { name: 'silentorder: clean run to the win', fn: testWin },
    { name: 'silentorder: mistakes, burns and the loss', fn: testLoss },
    { name: 'silentorder: guards, ready gate and secrecy', fn: testGuards },
    { name: 'silentorder: disconnects and departures', fn: testLeavers },
  ];
}
