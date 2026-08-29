// Swap or Stay test suites. Two layers, on purpose:
//
// Socket suites drive a real server with real clients, the way every game is actually
// played, and assert on what each client is shown. The deck is genuinely shuffled there,
// so those tests play blind and check invariants (the lowest revealed card lost a life,
// nobody was ever shown a card that was not theirs).
//
// Engine suites import the engine directly and hand-craft the cards. The deck holds one
// of every number, so a tie on the lowest card can never be forced through the shuffle —
// yet the tie rule, the mercy rule and the Sentinel block all have to be proven. Crafting
// the hands is the only honest way to reach those branches deterministically, and it is
// the same direct-import technique the main e2e suite already uses for the island rules.
export function suites(harness) {
  const { Player, check, sleep } = harness;

  // ---------- socket helpers ----------

  const untilSS = async (p, pred, label, ms = 5000) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms) {
      const ss = p.snap?.swaporstay;
      if (ss && pred(ss)) return true;
      await sleep(25);
    }
    check(`wait: ${label}`, false, `timed out (phase=${p.snap?.swaporstay?.phase})`);
    return false;
  };

  async function makeRoom(count) {
    const players = [];
    for (let i = 0; i < count; i++) {
      const p = new Player(`S${i + 1}`, ['🦊', '🐼', '🦁', '🐸', '🐙', '🦄'][i % 6]);
      await p.connect();
      players.push(p);
    }
    const res = await players[0].create();
    if (!res.ok) throw new Error('room create failed: ' + res.error);
    for (const p of players.slice(1)) {
      const r = await p.join(res.code);
      if (!r.ok) throw new Error('join failed: ' + r.error);
    }
    const t0 = Date.now();
    while (Date.now() - t0 < 4000 && players[0].snap?.players?.length !== count) await sleep(25);
    return { players, host: players[0], code: res.code };
  }

  async function cleanup(players) {
    for (const p of players) { try { p.disconnect(); } catch { /* already gone */ } }
    await sleep(60);
  }

  const byId = (players, id) => players.find((p) => p.playerId === id);

  async function readyAll(players, host) {
    const ss = host.snap.swaporstay;
    for (const p of players) {
      if (p.snap && ss.aliveIds.includes(p.playerId)) await p.emit('ss:ready');
    }
    await untilSS(host, (s) => s.phase !== 'dealing', 'deal gate opens');
  }

  // The reveal's public contract: the lowest non-Sentinel card lost exactly one life,
  // ties all lose together, Sentinels never lose, and the mercy rule spares a wipeout.
  function verifyReveal(ss, prevLives, label) {
    const numbers = ss.reveal.filter((r) => !r.sentinel);
    const low = numbers.length ? Math.min(...numbers.map((r) => r.v)) : null;
    const expected = (ss.spared || low === null)
      ? []
      : numbers.filter((r) => r.v === low).map((r) => r.id).sort();
    check(`${label}: losers are exactly the lowest card holders`,
      JSON.stringify([...ss.losers].sort()) === JSON.stringify(expected),
      `losers=${JSON.stringify(ss.losers)} expected=${JSON.stringify(expected)}`);
    check(`${label}: a Sentinel never loses`, ss.reveal.every((r) => !r.sentinel || !r.lostLife));
    for (const id of ss.losers) {
      check(`${label}: loser dropped exactly one life`,
        ss.lives[id] === (prevLives[id] ?? 3) - 1, `${prevLives[id]} -> ${ss.lives[id]}`);
    }
  }

  // ---------- engine (unit) helpers ----------

  function fakeRoom(n) {
    const players = new Map();
    for (let i = 1; i <= n; i++) {
      const id = `u${i}`;
      players.set(id, { id, name: `U${i}`, avatar: '🦊', connected: true, socketId: null, joinedAt: i });
    }
    return { code: 'UNIT1', hostId: 'u1', game: null, state: null, settings: {}, players };
  }

  // Overwrite one round with known cards. Reaching into state is deliberate here: the
  // deck has one of every number, so these positions cannot be produced by any shuffle.
  function craftRound(state, { order, dealerId, lives, hands, deck }) {
    state.order = [...order];
    state.lives = { ...lives };
    state.dealerId = dealerId;
    const alive = state.order.filter((id) => (state.lives[id] || 0) > 0);
    const di = alive.indexOf(dealerId);
    state.actingOrder = [...alive.slice(di + 1), ...alive.slice(0, di + 1)];
    state.turnIdx = 0;
    state.acted = [];
    state.ready = [];
    state.lastAction = null;
    state.reveal = null;
    state.losers = [];
    state.eliminatedThisRound = [];
    state.spared = false;
    state.hands = {};
    for (const [id, c] of Object.entries(hands)) state.hands[id] = { sentinel: false, ...c };
    if (deck) state.deck = deck.map((c) => ({ sentinel: false, ...c }));
    state.phase = 'acting';
  }

  function stayAll(engine, room) {
    const state = room.state;
    let guard = 20;
    while (state.phase === 'acting' && guard-- > 0) {
      engine.choice(room, state.actingOrder[state.turnIdx], { action: 'stay' });
    }
  }

  const throws = (fn) => {
    try { fn(); return null; } catch (err) { return err; }
  };

  // ============================================================
  // suites
  // ============================================================
  return [

    {
      name: 'swaporstay: full game to a winner',
      fn: async () => {
        const { players, host } = await makeRoom(4);
        const start = await host.emit('ss:start');
        check('host can start with 4', start.ok, start.error);
        await untilSS(host, (s) => s.phase === 'dealing', 'dealing');

        const ss0 = host.snap.swaporstay;
        check('everyone starts with 3 lives', Object.values(ss0.lives).every((l) => l === 3));
        check('4 seats at the table', ss0.order.length === 4);
        check('round one is dealt by the host', ss0.dealerId === host.playerId);
        check('the deal spends one card per player', ss0.deckLeft === 44 - 4, String(ss0.deckLeft));
        check('non-host cannot start', !(await players[1].emit('ss:start')).ok);

        let prevLives = { ...ss0.lives };
        let prevOrder = [...ss0.order];
        let prevDealer = ss0.dealerId;
        let sawTwoLeft = false;
        let done = false;

        for (let guard = 0; guard < 300 && !done; guard++) {
          const ss = host.snap.swaporstay;
          if (ss.phase === 'gameOver') { done = true; break; }

          if (ss.phase === 'dealing') {
            // A new round: the deal must have rotated clockwise among the living.
            if (ss.round > 1) {
              const from = prevOrder.indexOf(prevDealer);
              let expected = null;
              for (let s = 1; s <= prevOrder.length; s++) {
                const cand = prevOrder[(from + s) % prevOrder.length];
                if (ss.aliveIds.includes(cand)) { expected = cand; break; }
              }
              check(`round ${ss.round}: dealer rotated clockwise`, ss.dealerId === expected,
                `${prevDealer} -> ${ss.dealerId}, expected ${expected}`);
            }
            prevOrder = [...ss.order];
            prevDealer = ss.dealerId;
            prevLives = { ...ss.lives };
            await readyAll(players, host);
            continue;
          }

          if (ss.phase === 'acting') {
            const turnP = byId(players, ss.turnId);
            if (!turnP) { check('turn player is present', false, ss.turnId); break; }
            // The dealer must always be the last to act.
            if (ss.acted.length === ss.aliveIds.length - 1) {
              check(`round ${ss.round}: the dealer acts last`, ss.turnId === ss.dealerId);
            }
            await untilSS(turnP, (s) => s.turnId === turnP.playerId, 'turn reaches its player');
            // In the two-player endgame, exercise a real swap: the target must be the
            // only other player left.
            const endgameSwap = ss.aliveIds.length === 2 && ss.turnId !== ss.dealerId;
            if (ss.aliveIds.length === 2) sawTwoLeft = true;
            const res = await turnP.emit('ss:choice', { action: endgameSwap ? 'swap' : 'stay' });
            if (!res.ok) { check('choice accepted', false, res.error); break; }
            if (endgameSwap) {
              await untilSS(host, (s) => s.lastAction?.by === turnP.playerId || s.phase !== 'acting', 'swap lands');
              const act = host.snap.swaporstay.lastAction;
              const other = ss.aliveIds.find((id) => id !== turnP.playerId);
              check('endgame swap targets the only other player',
                act && ['swap', 'blocked'].includes(act.kind) && act.with === other,
                JSON.stringify(act));
            }
            await untilSS(host, (s) => s.acted.includes(turnP.playerId) || s.phase !== 'acting', 'action registered');
            continue;
          }

          if (ss.phase === 'result') {
            check(`round ${ss.round}: reveal covers every player who acted`,
              ss.reveal.length === ss.acted.length || ss.reveal.length === prevOrder.length,
              `${ss.reveal.length} revealed`);
            verifyReveal(ss, prevLives, `round ${ss.round}`);
            const next = await host.emit('ss:next');
            if (!next.ok) { check('host advances the round', false, next.error); break; }
            await untilSS(host, (s) => s.phase !== 'result', 'round advances');
            continue;
          }
        }

        const end = host.snap.swaporstay;
        check('the game reaches gameOver', end.phase === 'gameOver', end.phase);
        check('exactly one player is left standing', end.aliveIds.length === 1, JSON.stringify(end.aliveIds));
        check('the winner is the survivor', end.winnerId === end.aliveIds[0]);
        check('the reveal stays public at game over', Array.isArray(end.reveal) && end.reveal.length > 0);
        check('the table saw a two-player endgame on the way', sawTwoLeft);
        // The host's snapshot says gameOver the instant its own socket hears it; the other
        // five sockets drain their queues a beat later. Give delivery a moment before
        // asserting on it, or this check races real network scheduling.
        for (let i = 0; i < 20 && !players.every((p) => p.fx.some((f) => f.kind === 'ss-over')); i++) {
          await sleep(100);
        }
        check('ss-over fx reached every client',
          players.every((p) => p.fx.some((f) => f.kind === 'ss-over')));

        const board = host.snap.leaderboard || [];
        const winRow = board.find((e) => e.id === end.winnerId);
        check('the winner banked at least the game prize', Boolean(winRow) && winRow.total >= 6,
          String(winRow?.total));

        // One button, both jobs: from gameOver the same event starts a fresh game.
        check('a guest cannot restart', !(await players[1].emit('ss:next')).ok);
        const again = await host.emit('ss:next');
        check('host can run it back', again.ok, again.error);
        await untilSS(host, (s) => s.phase === 'dealing' && s.round === 1, 'new game dealt');
        check('lives reset for the new game',
          Object.values(host.snap.swaporstay.lives).every((l) => l === 3));

        await cleanup(players);
      },
    },

    {
      name: 'swaporstay: turn police and snapshot secrecy',
      fn: async () => {
        // Too small a table is turned away at the door.
        const tiny = await makeRoom(2);
        const refuse = await tiny.host.emit('ss:start');
        check('two players cannot start', !refuse.ok, refuse.error);
        await cleanup(tiny.players);

        const { players, host } = await makeRoom(4);
        await host.emit('ss:start');
        await untilSS(host, (s) => s.phase === 'dealing', 'dealing');

        // Acting before the cards are even looked at is refused.
        const early = await byId(players, host.snap.swaporstay.order[0]).emit('ss:choice', { action: 'stay' });
        check('choosing during the deal is refused', !early.ok, early.error);

        await readyAll(players, host);
        const ss = host.snap.swaporstay;
        check('acting begins with the player left of the dealer, not the dealer',
          ss.turnId !== ss.dealerId, ss.turnId);

        // Nobody but the turn player may act.
        const bystander = players.find((p) => p.playerId !== ss.turnId);
        check('out-of-turn choice refused', !(await bystander.emit('ss:choice', { action: 'stay' })).ok);
        const turnP = byId(players, ss.turnId);
        await untilSS(turnP, (s) => s.turnId === turnP.playerId, 'turn sync');
        check('a made-up action is refused', !(await turnP.emit('ss:choice', { action: 'flip' })).ok);
        check('ss:next mid-round is refused', !(await host.emit('ss:next')).ok);

        // Force one real swap so lastAction is live, then audit every client's snapshot.
        const res = await turnP.emit('ss:choice', { action: 'swap' });
        check('a legal swap is accepted', res.ok, res.error);
        await untilSS(host, (s) => Boolean(s.lastAction), 'the swap is public');

        for (const p of players) {
          const mine = p.snap.swaporstay;
          const raw = JSON.stringify(mine);
          check(`${p.name}: no hands object ever leaves the server`, !raw.includes('"hands"'));
          check(`${p.name}: no reveal before the flip`, mine.reveal === null);
          // The only card value in anyone's snapshot is their own card, exactly once.
          const values = raw.match(/"v":/g) || [];
          check(`${p.name}: sees exactly their own card and nobody else's`,
            values.length === (mine.yourCard ? 1 : 0), `${values.length} values visible`);
          check(`${p.name}: the public action carries no card value`,
            mine.lastAction && !('v' in mine.lastAction) && !('sentinel' in mine.lastAction),
            JSON.stringify(mine.lastAction));
        }

        await cleanup(players);
      },
    },

    {
      name: 'swaporstay: leavers pass the turn and the deal',
      fn: async () => {
        const { players, host } = await makeRoom(5);
        await host.emit('ss:start');
        await untilSS(host, (s) => s.phase === 'dealing', 'dealing');
        await readyAll(players, host);

        // The player on the clock walks out: their turn must simply never happen.
        let ss = host.snap.swaporstay;
        const leaver = byId(players, ss.turnId);
        await leaver.emit('room:leave');
        await untilSS(host, (s) => !s.order.includes(leaver.playerId), 'seat cleared');
        ss = host.snap.swaporstay;
        check('the round is still alive', ['acting', 'result'].includes(ss.phase), ss.phase);
        check('the turn moved past the leaver', ss.turnId !== leaver.playerId);
        check('four players remain', ss.aliveIds.length === 4, String(ss.aliveIds.length));

        // Play the round out, then let the new dealer leave mid-round.
        const stayThrough = async () => {
          for (let guard = 0; guard < 30; guard++) {
            const s = host.snap.swaporstay;
            if (s.phase !== 'acting') break;
            const tp = byId(players, s.turnId);
            if (!tp) break;
            await untilSS(tp, (x) => x.turnId === tp.playerId, 'turn sync');
            await tp.emit('ss:choice', { action: 'stay' });
            await untilSS(host, (x) => x.acted.includes(tp.playerId) || x.phase !== 'acting', 'acted');
          }
        };
        await stayThrough();
        await untilSS(host, (s) => ['result', 'gameOver'].includes(s.phase), 'round resolves');
        if (host.snap.swaporstay.phase !== 'result') { await cleanup(players); return; }

        await host.emit('ss:next');
        await untilSS(host, (s) => s.phase === 'dealing' && s.round === 2, 'round two dealt');
        await readyAll(players, host);
        ss = host.snap.swaporstay;
        const dealer = byId(players, ss.dealerId);
        check('round two has a non-host dealer to test with', ss.dealerId !== host.playerId);
        if (dealer && dealer !== host) {
          await dealer.emit('room:leave');
          await untilSS(host, (s) => !s.order.includes(dealer.playerId), 'dealer seat cleared');
          ss = host.snap.swaporstay;
          check('the deal passed to a living player',
            ss.dealerId !== dealer.playerId && ss.aliveIds.includes(ss.dealerId), ss.dealerId);
          await stayThrough();
          await untilSS(host, (s) => ['result', 'gameOver'].includes(s.phase), 'round completes without the dealer');
          check('the round completed without its dealer', true);
        }
        await cleanup(players);
      },
    },

    {
      name: 'swaporstay: a disconnected player never blocks the deal',
      fn: async () => {
        const { players, host } = await makeRoom(4);
        await host.emit('ss:start');
        await untilSS(host, (s) => s.phase === 'dealing', 'dealing');

        // A dropped connection keeps its seat but must not gate the ready check.
        const dropper = players[3];
        dropper.disconnect();
        await sleep(200);
        check('the seat is kept for a reconnect',
          host.snap.swaporstay.order.includes(dropper.playerId));

        for (const p of players.slice(0, 3)) await p.emit('ss:ready');
        await untilSS(host, (s) => s.phase === 'acting', 'game begins without the dropper');
        check('acting began without the disconnected player', host.snap.swaporstay.phase === 'acting');
        await cleanup(players);
      },
    },

    {
      name: 'swaporstay: engine — swaps, the Sentinel block, the dealer draw',
      fn: async () => {
        const engine = await import('../../server/games/swaporstay/engine.js');
        const room = fakeRoom(4);
        engine.startGame(room, 'u1');
        const state = room.state;

        craftRound(state, {
          order: ['u1', 'u2', 'u3', 'u4'],
          dealerId: 'u1',
          lives: { u1: 3, u2: 3, u3: 3, u4: 3 },
          hands: { u2: { v: 7 }, u3: { v: 99, sentinel: true }, u4: { v: 12 }, u1: { v: 20 } },
          deck: [{ v: 33 }, { v: 8 }, { v: 9 }, { v: 10 }, { v: 11 }],
        });
        check('acting order runs from the dealer\'s left with the dealer last',
          JSON.stringify(state.actingOrder) === JSON.stringify(['u2', 'u3', 'u4', 'u1']));

        // u2 swaps into u3's Sentinel: the trade bounces and everyone is told, valuelessly.
        engine.choice(room, 'u2', { action: 'swap' });
        check('the Sentinel blocks the swap',
          state.lastAction.kind === 'blocked' && state.lastAction.with === 'u3',
          JSON.stringify(state.lastAction));
        check('the blocked player keeps their card', state.hands.u2.v === 7);
        check('the Sentinel stays with its owner', state.hands.u3.sentinel === true);

        // u3 swaps with u4: a clean forced exchange.
        engine.choice(room, 'u3', { action: 'swap' });
        check('a swap exchanges the two cards',
          state.hands.u3.v === 12 && state.hands.u4.sentinel === true,
          JSON.stringify(state.lastAction));

        engine.choice(room, 'u4', { action: 'stay' });
        check('a stay is public but changes nothing', state.lastAction.kind === 'stay' && state.hands.u4.sentinel);

        // The dealer's swap is a draw: old card spent, top of the deck taken blind.
        // The dealer acts last, so this same call flips the whole table over.
        engine.choice(room, 'u1', { action: 'swap' });
        check('the dealer drew the top of the deck', state.reveal.find((r) => r.id === 'u1')?.v === 33);
        check('the draw was reported as a draw', state.lastAction.kind === 'draw');
        check('the dealer\'s old card went to the discard', state.discard.some((c) => c.v === 20));

        // The dealer acted last, so the reveal has already happened.
        check('the dealer\'s act closes the round', state.phase === 'result');
        check('the lowest card lost the life',
          state.losers.length === 1 && state.losers[0] === 'u2' && state.lives.u2 === 2,
          JSON.stringify(state.losers));
        check('the Sentinel holder was never at risk',
          state.reveal.find((r) => r.id === 'u4').lostLife === false);
      },
    },

    {
      name: 'swaporstay: engine — ties, the mercy rule, Sentinel immunity',
      fn: async () => {
        const engine = await import('../../server/games/swaporstay/engine.js');
        const room = fakeRoom(3);
        engine.startGame(room, 'u1');
        const state = room.state;
        const deck = [{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }];

        // A tie on the lowest card takes a life from everyone holding it.
        craftRound(state, {
          order: ['u1', 'u2', 'u3'], dealerId: 'u1',
          lives: { u1: 3, u2: 3, u3: 3 },
          hands: { u2: { v: 5 }, u3: { v: 5 }, u1: { v: 20 } }, deck,
        });
        stayAll(engine, room);
        check('both tied lows lose a life',
          JSON.stringify([...state.losers].sort()) === JSON.stringify(['u2', 'u3'])
          && state.lives.u2 === 2 && state.lives.u3 === 2 && state.lives.u1 === 3,
          JSON.stringify(state.losers));
        check('a tie is not a wipeout', state.spared === false && state.phase === 'result');

        // The mercy rule: a reveal that would empty the table costs nobody anything.
        craftRound(state, {
          order: ['u1', 'u2', 'u3'], dealerId: 'u1',
          lives: { u1: 1, u2: 1, u3: 1 },
          hands: { u2: { v: 5 }, u3: { v: 5 }, u1: { v: 5 } }, deck,
        });
        stayAll(engine, room);
        check('a total wipeout is laughed off',
          state.spared === true && state.losers.length === 0);
        check('nobody lost a life to the spared round',
          state.lives.u1 === 1 && state.lives.u2 === 1 && state.lives.u3 === 1);
        check('the spared round still ends normally', state.phase === 'result');

        // A Sentinel is never the loser, whatever else is on the table.
        craftRound(state, {
          order: ['u1', 'u2', 'u3'], dealerId: 'u1',
          lives: { u1: 3, u2: 3, u3: 3 },
          hands: { u2: { v: 99, sentinel: true }, u3: { v: 10 }, u1: { v: 12 } }, deck,
        });
        stayAll(engine, room);
        check('the lowest number loses, never the Sentinel',
          JSON.stringify(state.losers) === JSON.stringify(['u3']));

        // Every card a Sentinel: there is no lowest number, so there is no loser.
        craftRound(state, {
          order: ['u1', 'u2', 'u3'], dealerId: 'u1',
          lives: { u1: 3, u2: 3, u3: 3 },
          hands: {
            u1: { v: 99, sentinel: true },
            u2: { v: 99, sentinel: true },
            u3: { v: 99, sentinel: true },
          },
          deck,
        });
        stayAll(engine, room);
        check('an all-Sentinel table loses nobody',
          state.losers.length === 0 && state.spared === true
          && state.lives.u1 === 3 && state.lives.u2 === 3 && state.lives.u3 === 3);
      },
    },

    {
      name: 'swaporstay: engine — dead seats, the endgame, the reshuffle',
      fn: async () => {
        const engine = await import('../../server/games/swaporstay/engine.js');
        const room = fakeRoom(4);
        engine.startGame(room, 'u1');
        const state = room.state;
        const deck = [{ v: 1 }, { v: 2 }, { v: 3 }, { v: 4 }];

        // u2 is out of the game: a swap from u1 must sail straight past their seat.
        craftRound(state, {
          order: ['u1', 'u2', 'u3', 'u4'], dealerId: 'u4',
          lives: { u1: 3, u2: 0, u3: 3, u4: 3 },
          hands: { u1: { v: 10 }, u3: { v: 11 }, u4: { v: 12 } }, deck,
        });
        check('dead seats are skipped in the acting order', !state.actingOrder.includes('u2'));
        engine.choice(room, 'u1', { action: 'swap' });
        check('a swap skips the dead seat',
          state.lastAction.kind === 'swap' && state.lastAction.with === 'u3',
          JSON.stringify(state.lastAction));
        check('the skipped swap really traded the cards',
          state.hands.u1.v === 11 && state.hands.u3.v === 10);

        // The dead cannot play, and nobody can jump the queue.
        check('an eliminated player is refused',
          Boolean(throws(() => engine.choice(room, 'u2', { action: 'stay' }))));
        check('acting out of turn is refused',
          Boolean(throws(() => engine.choice(room, 'u4', { action: 'stay' }))));
        engine.choice(room, 'u3', { action: 'stay' });
        engine.choice(room, 'u4', { action: 'stay' });
        check('the crafted round resolved', state.phase === 'result');

        // Two players left: the swap target is always the other one, and the last life
        // taken ends the game with a crowned winner.
        craftRound(state, {
          order: ['u1', 'u2', 'u3', 'u4'], dealerId: 'u4',
          lives: { u1: 1, u2: 0, u3: 0, u4: 1 },
          hands: { u1: { v: 5 }, u4: { v: 30 } }, deck,
        });
        engine.choice(room, 'u1', { action: 'swap' });
        check('with two left, the swap target is the other player',
          state.lastAction.kind === 'swap' && state.lastAction.with === 'u4');
        // u1 swapped their 5 away, so the dealer is now holding the lowest card.
        engine.choice(room, 'u4', { action: 'stay' });
        check('taking the last life ends the game',
          state.phase === 'gameOver' && state.winnerId === 'u1',
          `${state.phase} winner=${state.winnerId}`);
        check('the winner banked the game prize',
          (room.scores?.get('u1')?.total || 0) >= 6, String(room.scores?.get('u1')?.total));

        // The reshuffle: when the stock cannot cover the next round, everything spent
        // is shuffled back in and the full 44 cards are accounted for again.
        const room2 = fakeRoom(4);
        engine.startGame(room2, 'u1');
        const s2 = room2.state;
        for (const id of [...s2.actingOrder]) engine.markReady(room2, id);
        check('the warm-up deal opened for acting', s2.phase === 'acting');
        stayAll(engine, room2);
        check('the warm-up round resolved', s2.phase === 'result');
        // Starve the stock without losing cards: the surplus moves to the discard,
        // exactly as spent cards do.
        s2.discard.push(...s2.deck.splice(2));
        check('the stock is too short for another round', s2.deck.length === 2);
        engine.next(room2, 'u1');
        const alive2 = s2.order.filter((id) => (s2.lives[id] || 0) > 0);
        check('the reshuffle rebuilt a full deck minus the new deal',
          s2.deck.length === 44 - alive2.length && s2.discard.length === 0,
          `deck=${s2.deck.length} discard=${s2.discard.length}`);
        check('everyone alive got a card after the reshuffle',
          alive2.every((id) => s2.hands[id]));
      },
    },
  ];
}
