// Silent Order screen rendering. Receives the personalized room snapshot and a ctx with
// { emit, sound, rerender, me, isHost, hostId, player(id) } from main.js.
//
// The whole screen re-renders on every snapshot, but this game is one long piece of
// choreography — the deal, the pulse of the pile, cards flying in from around the table —
// and rebuilding that per snapshot would restart every animation mid-flight. So the two
// live screens (dealing and playing) are built once per level, cached at module level, and
// then updated imperatively from snapshot deltas. One-shot moments (a mistake, a level
// clear, the end of the run) are detected by comparing snapshot fields against markers
// kept here, never from fx events, so they survive reconnects and missed packets.
import { h, shake, animOnce, waitingFor, sceneFrame, sceneHero, scoringDetails, endArt } from '../../core/ui.js';
import { cardTable, cardTableDuration, flingCard } from '../../core/cards.js';
import { memes, playMeme } from '../../core/memes.js';
import { confettiBurst, confettiRain } from '../../core/fx.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// The cached screen: key identifies the run and level it was built for, api is the
// imperative updater fed by later snapshots. main.js skips replacing an identical root
// node, so returning the same node is what keeps the choreography alive.
let mount = { key: null, node: null, api: null };

// Everything the current mount left ticking: DOM-writing timers plus the card table's own
// choreography. Torn down whenever the mount is replaced, so a level (or a run) that ends
// mid-deal can't keep flicking cards and playing sounds over the next screen.
let mountTimers = [];
let liveTable = null;
const later = (fn, ms) => { const t = setTimeout(fn, ms); mountTimers.push(t); return t; };
function teardownMount() {
  mountTimers.forEach(clearTimeout);
  mountTimers = [];
  liveTable?.dispatchEvent(new Event('gn:teardown'));
  liveTable = null;
}

// "Last seen" markers for one-shot effects. Reset whenever a new run starts, and seeded
// from the snapshot itself so a reconnect mid-run never replays old drama.
let seen = {
  run: null, level: 0, mistakeId: 0, close: false, streak: 0, overSung: false, clearShown: 0,
};

function syncRun(so) {
  if (seen.run === so.startedAt) return;
  seen = {
    run: so.startedAt,
    level: so.level,
    mistakeId: so.lastMistake?.id || 0,
    close: false,
    streak: 0,
    overSung: so.over,
    clearShown: so.level,
  };
  teardownMount();
  mount = { key: null, node: null, api: null };
}

export function renderSilentOrder(snap, ctx) {
  const so = snap.silentorder;
  syncRun(so);
  if (so.phase === 'dealing') return dealingScreen(so, ctx);
  // 'cleared' is the level's curtain call: same table, last card still on the pile,
  // applause running, while the server holds the next deal back a beat.
  if (so.phase === 'playing' || so.phase === 'cleared') return playingScreen(so, ctx);
  return overScreen(so, snap, ctx);
}

// ---------- shared bits ----------

// A small card drawn face up. The real .ct-face is absolutely positioned inside whatever
// box it is given, which is exactly what these fixed-size minis provide.
function miniCard(face, cls = '') {
  return h('div', { class: `so-mini ${cls}` }, h('div', { class: 'ct-face front' }, String(face)));
}

// One candle per life. Lives are earned by clearing levels, so the row grows; a run
// with none left shows a single cold stub. Drawn from CSS shapes so the flame can
// actually gutter out instead of an emoji blinking off.
function candleRow(lives) {
  const shown = Math.max(1, lives);
  return h('div', { class: 'so-lives', role: 'img', 'aria-label': `${lives} lives left` },
    Array.from({ length: shown }, (_, i) => h('div', {
      class: `so-candle ${i < lives ? 'lit' : 'cold'}`,
    },
      h('span', { class: 'so-flame', 'aria-hidden': 'true' }),
      h('span', { class: 'so-wax', 'aria-hidden': 'true' }),
    )),
  );
}

// The presence strip: everyone at the table with a tiny card-back per card still in their
// hand, which is all anyone is allowed to know about it.
function playerChips(so, ctx) {
  return so.order.map((id) => {
    const p = ctx.player(id);
    const n = so.counts[id] ?? 0;
    const backs = Math.min(n, 8);
    return h('div', {
      class: ['so-chip', !p.connected && 'off', id === ctx.me.id && 'you'].filter(Boolean).join(' '),
      'data-id': id,
    },
      h('span', { class: 'so-chip-avatar' }, p.avatar),
      h('span', { class: 'so-chip-name' }, p.name),
      h('span', { class: 'so-chip-cards', 'aria-label': `${n} cards left` },
        n === 0
          ? h('i', { class: 'so-chip-done' }, '✓')
          : [
              Array.from({ length: backs }, () => h('i', { class: 'so-mini-back' })),
              n > backs && h('b', { class: 'so-chip-more' }, `×${n}`),
            ],
      ),
      !p.connected && h('span', { class: 'so-chip-off' }, '⚡'),
    );
  });
}

// ---------- dealing ----------

function dealingScreen(so, ctx) {
  const key = `so:deal:${so.startedAt}:${so.level}`;
  if (mount.key === key && mount.node) { mount.api?.(so, ctx); return mount.node; }
  teardownMount();

  // A mistake can be the very play that emptied the hands, so it arrives here riding on
  // the fresh deal. Sound it once — a lost life must never pass silently.
  const dealMistake = so.lastMistake && so.lastMistake.id !== seen.mistakeId ? so.lastMistake : null;
  if (dealMistake) { seen.mistakeId = dealMistake.id; playMeme('boom'); }

  // Arriving at a fresh deal after watching the previous level end is the level-clear
  // moment — celebrated here, once, because the server moves straight on to dealing.
  // A clear bought with a burned life gets the boom above instead of applause.
  const clearedLevel = so.level - 1;
  if (clearedLevel >= 1 && seen.clearShown < so.level) {
    seen.clearShown = so.level;
    if (seen.level === clearedLevel && !dealMistake) {
      playMeme('applause');
      confettiBurst({ count: 90 });
    }
  }
  seen.level = so.level;
  seen.close = false;
  seen.streak = 0;

  // A spectator is not in the seating, and the table would otherwise pin the first seat
  // to the near edge and call it "(you)". They get a quiet view of the deal instead.
  if (!so.youPlay) {
    const chipsRow = h('div', { class: 'so-players' }, playerChips(so, ctx));
    const node = h('div', { class: 'stack so-screen' },
      h('div', { class: 'so-topbar' },
        candleRow(so.lives),
        h('div', { class: 'so-level-pill' }, `Level ${so.level} of ${so.maxLevel}`),
      ),
      h('div', { class: 'card', style: 'text-align:center' },
        sceneFrame(dealMistake ? 'life-lost' : (clearedLevel >= 1 ? 'life-earned' : 'shuffling')),
        h('p', { class: 'so-quip', style: 'margin-top:10px' }, `Level ${so.level} is being dealt…`),
        h('p', { class: 'hint' }, 'You joined mid-run. You\'ll be dealt in next run!'),
      ),
      chipsRow,
    );
    mount = { key, node, api: (fresh, c) => chipsRow.replaceChildren(...playerChips(fresh, c)) };
    return node;
  }

  const presentCount = () => so.order.filter((id) => ctx.player(id).connected).length;

  const seats = so.order.map((id) => {
    const p = ctx.player(id);
    return { id, name: p.name, avatar: p.avatar };
  });

  // lastSo lets the timers below judge the freshest snapshot, not the one they closed over.
  let lastSo = so;
  let autoSent = false;
  const sendReady = async (el) => {
    if (lastSo.youReady || !lastSo.youPlay) return;
    const res = await ctx.emit('so:ready');
    if (!res.ok && el) shake(el);
  };

  const readyPill = h('div', { class: 'so-ready-pill' },
    `Ready ${so.readyCount}/${presentCount()}`);
  const readyBtn = h('button', {
    class: `btn btn-so so-ready-btn ${reduced() ? '' : 'so-hidden'}`,
    onClick: (e) => sendReady(e.currentTarget),
  }, "✋ I've seen my cards");

  const table = cardTable({
    seats,
    myId: ctx.me.id,
    myFace: so.yourHand.length ? String(so.yourHand[0]) : null,
    myLabel: 'Your lowest card',
    caption: `Shuffling level ${so.level}…`,
    deckName: `Level ${so.level}`,
    holdHint: 'Hold to look again',
    peekMs: 5000,
    onDone: () => {
      // Under reduced motion onDone fires instantly, before anyone has read a thing, so
      // the manual button carries the confirmation instead.
      if (!autoSent && !reduced()) { autoSent = true; sendReady(readyBtn); }
    },
  });
  liveTable = table;

  // The rest of the hand, fanned under the table once the deal has landed. Level one is
  // a single card and the table already told that story.
  const handFan = so.yourHand.length > 1
    ? h('div', { class: 'so-deal-hand so-hidden' },
        h('p', { class: 'so-deal-hand-label' }, `Your ${so.yourHand.length} cards, lowest first`),
        h('div', { class: 'so-fan' },
          so.yourHand.map((c, i, arr) => {
            const el = miniCard(c, i === 0 ? 'low' : '');
            el.style.setProperty('--fi', String(i - (arr.length - 1) / 2));
            return el;
          }),
        ),
      )
    : null;

  const chipsRow = h('div', { class: 'so-players' }, playerChips(so, ctx));

  const settleMs = reduced() ? 0 : cardTableDuration(seats.length);
  if (handFan) later(() => handFan.classList.remove('so-hidden'), settleMs + 300);
  // If auto-ready did not land (offline blip, spectator, anything), offer the button.
  later(() => {
    if (!lastSo.youReady && lastSo.youPlay) readyBtn.classList.remove('so-hidden');
  }, settleMs + 2200);

  const node = h('div', { class: 'stack so-screen' },
    h('div', { class: 'so-topbar' },
      candleRow(so.lives),
      h('div', { class: 'so-level-pill' }, `Level ${so.level} of ${so.maxLevel}`),
    ),
    so.level === 1 && so.startQuip && h('p', { class: 'so-quip' }, so.startQuip),
    // A level cleared without a burn is the only way to gain a life, so it gets the
    // taper catching a fresh wick — framed above the caption, not buried behind it.
    !dealMistake && clearedLevel >= 1 && h('div', { class: 'so-banner so-good so-moment' },
      sceneFrame('moments/life-earned', 'so-moment-art'),
      h('span', {}, `Level ${clearedLevel} cleared, a life earned. ${so.lives} now burning.`)),
    dealMistake && h('div', { class: 'so-banner so-bad so-moment' },
      sceneFrame('moments/life-lost', 'so-moment-art'),
      h('span', {}, `${dealMistake.by === ctx.me.id ? 'You' : ctx.player(dealMistake.by).name} played ${dealMistake.card}, ${dealMistake.burned.join(', ')} burned`)),
    table,
    handFan,
    h('div', { class: 'so-ready-row' },
      readyPill,
      so.youPlay
        ? readyBtn
        : h('p', { class: 'hint' }, 'You joined mid-run. You\'ll be dealt in next run!'),
    ),
    chipsRow,
  );

  mount = {
    key,
    node,
    api: (fresh, c) => {
      lastSo = fresh;
      readyPill.textContent = `Ready ${fresh.readyCount}/${fresh.order.filter((id) => c.player(id).connected).length}`;
      if (fresh.youReady) {
        readyBtn.disabled = true;
        readyBtn.textContent = '✅ Ready. Waiting for the table…';
        readyBtn.classList.remove('so-hidden');
      }
      chipsRow.replaceChildren(...playerChips(fresh, c));
    },
  };
  return node;
}

// ---------- playing ----------

function playingScreen(so, ctx) {
  const key = `so:play:${so.startedAt}:${so.level}`;
  if (mount.key === key && mount.node) { mount.api?.(so, ctx); return mount.node; }
  teardownMount();
  seen.level = so.level;

  // ----- static skeleton, built once per level -----
  const candles = candleRow(so.lives);
  const levelPill = h('div', { class: 'so-level-pill' }, `Level ${so.level} of ${so.maxLevel}`);
  const banner = h('div', { class: 'so-banner so-hidden', role: 'status' });

  const stackEl = h('div', { class: 'so-stack', 'aria-hidden': 'true' });
  const topBox = h('div', { class: 'so-card-box' },
    h('div', { class: `ct-face front so-top-face ${so.topCard ? '' : 'so-empty'}` },
      so.topCard ? String(so.topCard) : ', '),
  );
  const pileLabel = h('p', { class: 'so-pile-label' },
    so.played ? `${so.played} played` : 'Nothing played yet. Cards run 1 to 100.');
  const flights = h('div', { class: 'so-flights', 'aria-hidden': 'true' });
  const pile = h('div', { class: 'so-pile' }, stackEl, topBox, flights);

  const discardTitle = h('p', { class: 'so-discard-label' }, '🔥 Burned');
  const discardRow = h('div', { class: 'so-discard-row' });
  const discardWrap = h('div', { class: `so-discard ${so.discards.length ? '' : 'so-hidden'}` },
    discardTitle, discardRow);

  const chipsRow = h('div', { class: 'so-players' }, playerChips(so, ctx));
  const handRow = h('div', { class: 'so-fan so-my-fan' });
  const status = h('p', { class: 'so-status' });
  const handWrap = h('div', { class: 'so-hand' },
    so.youPlay
      ? [handRow, status]
      : h('p', { class: 'hint', style: 'text-align:center' }, 'You\'re watching this run. You\'ll be dealt in next run!'),
  );

  const root = h('div', { class: 'stack so-screen so-playing' },
    h('div', { class: 'so-topbar' }, candles, levelPill),
    banner,
    h('div', { class: 'so-centre' }, pile, pileLabel),
    discardWrap,
    chipsRow,
    handWrap,
  );

  // ----- imperative state the updater works against -----
  let prevPlayed = so.played;
  let prevLives = so.lives;
  let prevHandKey = null;   // null, not '': an empty hand joins to '' and must still paint once
  let inFlight = 0;      // my own throws already animating, so the snapshot doesn't re-fly them
  let bannerTimer = null;
  let armed = true;      // blocks a double tap from sending two plays

  const setCandleState = (lives) => {
    [...candles.children].forEach((c, i) => {
      const lit = i < lives;
      if (!lit && c.classList.contains('lit')) {
        // This candle is the one that just died: let it gutter rather than snap off.
        c.classList.remove('lit');
        c.classList.add('cold', 'guttering');
        later(() => c.classList.remove('guttering'), 1400);
      } else {
        c.classList.toggle('lit', lit);
        c.classList.toggle('cold', !lit);
      }
    });
  };

  const commitTop = (fresh) => {
    const face = topBox.firstElementChild;
    face.textContent = fresh.topCard ? String(fresh.topCard) : ', ';
    face.classList.toggle('so-empty', !fresh.topCard);
    pileLabel.textContent = fresh.played ? `${fresh.played} played` : 'Nothing played yet. Cards run 1 to 100.';
    // The depth stack behind the top card: one ghost per previous play, capped where the
    // eye stops counting anyway.
    const depth = Math.min(Math.max(fresh.played - 1, 0), 5);
    if (stackEl.childElementCount !== depth) {
      stackEl.replaceChildren(...Array.from({ length: depth }, (_, i) => {
        const g = h('div', { class: 'so-ghost' });
        g.style.setProperty('--gi', String(i));
        return g;
      }));
    }
  };

  const glint = () => {
    pile.classList.remove('so-glint');
    void pile.offsetWidth;
    pile.classList.add('so-glint');
  };

  const showBanner = (text, tone = 'bad') => {
    banner.textContent = text;
    banner.className = `so-banner so-${tone}`;
    clearTimeout(bannerTimer);
    bannerTimer = later(() => banner.classList.add('so-hidden'), 4200);
  };

  // A card flying across the table: cloned into the overlay so a snapshot re-render of the
  // hand or the chips can never delete it mid-air.
  const flyCard = (fromRect, face, toEl, scale = null) => {
    if (reduced() || !fromRect) { memes.cardSlap(); return Promise.resolve(); }
    const rootRect = pile.getBoundingClientRect();
    const flyer = h('div', { class: 'so-flyer' }, h('div', { class: 'ct-face front' }, String(face)));
    flyer.style.left = `${fromRect.left - rootRect.left}px`;
    flyer.style.top = `${fromRect.top - rootRect.top}px`;
    flyer.style.width = `${fromRect.width}px`;
    flyer.style.height = `${fromRect.height}px`;
    flights.append(flyer);
    const to = toEl.getBoundingClientRect();
    return flingCard(flyer, {
      dx: to.left + to.width / 2 - (fromRect.left + fromRect.width / 2),
      dy: to.top + to.height / 2 - (fromRect.top + fromRect.height / 2),
      spin: -14 + Math.random() * 28,
      ms: 460,
      // A card arriving on the pile grows to the pile's size; a card burning off it is
      // headed for the mini row, so the caller says how small it should land.
      scale: scale ?? to.width / Math.max(fromRect.width, 1),
    }).then(() => flyer.remove());
  };

  const renderDiscards = (fresh) => {
    discardWrap.classList.toggle('so-hidden', fresh.discards.length === 0);
    discardRow.replaceChildren(...fresh.discards.map((c) => miniCard(c, 'burned')));
  };

  const playMine = (cardEl, c) => {
    if (!armed) return;
    armed = false;
    inFlight += 1;
    const fromRect = cardEl.getBoundingClientRect();
    cardEl.classList.add('so-gone');
    c.emit('so:play').then((res) => {
      if (!res.ok) {
        inFlight = Math.max(0, inFlight - 1);
        armed = true;
        cardEl.classList.remove('so-gone');
        shake(handRow);
      }
    });
    flyCard(fromRect, cardEl.textContent.trim(), topBox).then(() => { armed = true; });
  };

  const renderHand = (fresh, c) => {
    if (!fresh.youPlay) return;
    const handKey = fresh.yourHand.join(',');
    if (handKey === prevHandKey) return;
    prevHandKey = handKey;
    if (!fresh.yourHand.length) {
      handRow.replaceChildren(h('p', { class: 'so-hand-empty' }, '🙌 Hand empty. Watch the table bring it home.'));
      return;
    }
    handRow.replaceChildren(...fresh.yourHand.map((card, i, arr) => {
      const el = miniCard(card, i === 0 ? 'low so-live' : 'held');
      el.style.setProperty('--fi', String(i - (arr.length - 1) / 2));
      if (i === 0) {
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        el.setAttribute('aria-label', `Play your ${card}`);
        el.addEventListener('click', () => playMine(el, c));
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); playMine(el, c); }
        });
      }
      return el;
    }));
  };

  const setStatus = (fresh) => {
    if (!fresh.youPlay) return;
    const low = fresh.yourHand[0];
    if (low == null) status.textContent = 'Nothing left to play. Deep breaths for the others.';
    else if (fresh.topCard && low <= fresh.topCard) status.textContent = 'Too late for that one, it will burn if anything higher lands.';
    else if (fresh.topCard && low - fresh.topCard <= 3) status.textContent = `Your ${low} is right on top of the pile. Now or never?`;
    else status.textContent = `Tap your lowest card to play it. Only play when you believe nothing lower is out there.`;
  };

  const doMistake = (fresh, c) => {
    const m = fresh.lastMistake;
    playMeme('boom');
    shake(root);
    const who = c.player(m.by);
    const name = m.by === c.me.id ? 'You' : who.name;
    showBanner(`${name} played ${m.card}, ${m.burned.join(', ')} burned`, 'bad');
    // The burned cards fly out of the pile and land in the discard row. On a level's
    // first burn that row is still display:none and would measure as (0,0), sending the
    // cards to the top-left corner — so unhide the box now and let the cards fill it.
    discardWrap.classList.remove('so-hidden');
    const from = topBox.getBoundingClientRect();
    m.burned.forEach((cardNo, i) => {
      later(() => flyCard(from, cardNo, discardRow, 0.45), i * 120);
    });
  };

  const update = (fresh, c) => {
    // Lives first, so the guttering candle plays under the boom rather than after it.
    if (fresh.lives !== prevLives) { setCandleState(fresh.lives); prevLives = fresh.lives; }

    const mid = fresh.lastMistake?.id || 0;
    const mistakeIsNew = mid !== 0 && mid !== seen.mistakeId;

    const grew = fresh.played - prevPlayed;
    if (grew > 0) {
      prevPlayed = fresh.played;
      const fromChip = (id) => chipsRow.querySelector(`.so-chip[data-id="${CSS.escape(id)}"]`);
      const fresh6 = fresh.pile.slice(-Math.min(grew, fresh.pile.length));
      let flew = false;
      let mineInFlight = false;
      for (const play of fresh6) {
        // My own throw is already mid-air from the tap; re-flying it would double it.
        if (play.by === c.me.id && inFlight > 0) { inFlight -= 1; mineInFlight = true; continue; }
        // Someone else's card pops onto the pile from their seat's direction.
        const chip = fromChip(play.by);
        flyCard(chip?.getBoundingClientRect() || null, play.card, topBox);
        flew = true;
      }
      if (!flew && !mineInFlight) memes.cardSlap();
      commitTop(fresh);
      if (!mistakeIsNew) {
        // Five clean plays in a row earn the table a quiet flourish.
        const before = seen.streak;
        seen.streak += grew;
        if (Math.floor(seen.streak / 5) > Math.floor(before / 5)) { playMeme('levelUp'); glint(); }
      }
    } else {
      commitTop(fresh);
    }

    if (mistakeIsNew) {
      seen.mistakeId = mid;
      seen.streak = 0;
      doMistake(fresh, c);
      later(() => renderDiscards(fresh), reduced() ? 0 : 620);
    } else {
      renderDiscards(fresh);
    }

    chipsRow.replaceChildren(...playerChips(fresh, c));
    renderHand(fresh, c);
    setStatus(fresh);

    // The heartbeat: once, at the moment your lowest card comes within three of the pile.
    const low = fresh.yourHand[0];
    const close = fresh.youPlay && low != null && fresh.topCard > 0
      && low > fresh.topCard && low - fresh.topCard <= 3;
    if (close && !seen.close) playMeme('heartbeat');
    seen.close = close;

    // The level just cleared: the last card is on the pile and stays there while the
    // server holds the deal back. Celebrate now — sound first, card still in view —
    // and mark it so the fresh deal doesn't applaud the same clear twice.
    if (fresh.phase === 'cleared' && seen.clearShown <= fresh.level) {
      seen.clearShown = fresh.level + 1;
      playMeme('applause');
      confettiBurst({ count: 90 });
      glint();
      showBanner(`✨ Level ${fresh.level} cleared, a life earned. Next level coming up…`, 'good');
    }
  };

  // First paint: everything drawn straight from the snapshot, no animations replayed.
  // That includes any mistake already riding on this snapshot — its lives and discards
  // are painted below, so mark it seen rather than letting the next snapshot replay it.
  seen.mistakeId = so.lastMistake?.id || seen.mistakeId;
  commitTop(so);
  renderDiscards(so);
  renderHand(so, ctx);
  setStatus(so);
  seen.close = Boolean(so.youPlay && so.yourHand[0] != null && so.topCard > 0
    && so.yourHand[0] > so.topCard && so.yourHand[0] - so.topCard <= 3);

  mount = { key, node: root, api: update };
  return root;
}

// ---------- over ----------

function overScreen(so, snap, ctx) {
  // The run may have ended mid-choreography (a partner leaving during the deal): make
  // sure the abandoned table and its timers go quiet before the curtain call.
  teardownMount();
  if (!seen.overSung) {
    seen.overSung = true;
    if (so.won) { playMeme('applause'); confettiRain(2600); }
    else playMeme('sadTrombone');
  }

  // Everyone's points for this game, straight from the room leaderboard.
  const rows = (snap.leaderboard || [])
    .filter((e) => so.order.includes(e.id) || (e.silentorder || 0) > 0)
    .sort((a, b) => (b.silentorder || 0) - (a.silentorder || 0));

  return h('div', { class: 'card win-screen so-over' },
    endArt(so.won ? 'endings/win-silentorder-held' : 'endings/win-silentorder-broke'),
    candleRow(so.won ? so.lives : 0),
    h('span', { class: 'ws-emoji' }, so.won ? '🏆' : '🌑'),
    h('h2', { class: so.won ? 'gradient-text' : '' },
      so.won ? 'The order held!' : 'The order broke'),
    h('p', { class: 'ws-reason' },
      so.won
        ? `All ${so.maxLevel} levels cleared with ${so.lives} ${so.lives === 1 ? 'life' : 'lives'} to spare.`
        : `The run ended on level ${so.level} of ${so.maxLevel}.`),
    so.endQuip && h('p', { class: 'ws-reason', style: 'font-weight:700' }, so.endQuip),
    rows.length > 0 && h('div', { class: 'role-list' },
      rows.map((e, i) => h('div', {
        // The screen is rebuilt every snapshot; the entrance cascade should not be. Keyed
        // by run so the next run's curtain call still slides in fresh.
        class: `lb-row ${animOnce(`so-lb:${so.startedAt}:${e.id}`, 'anim-slide')}`,
        style: `animation-delay:${i * 50}ms`,
      },
        h('span', {}, e.avatar),
        h('span', { class: 'lb-name' }, e.name, e.id === ctx.me.id ? ' (you)' : ''),
        h('span', { class: 'lb-pts' }, `${e.silentorder || 0} pts`),
      )),
    ),
    scoringDetails(snap.scoringRules?.silentorder),
    ctx.isHost
      ? h('div', { style: 'display:grid; gap:10px; margin-top:16px' },
          h('button', {
            class: 'btn btn-so btn-lg',
            onClick: async (e) => {
              const btn = e.currentTarget; // captured before the await nulls it
              const res = await ctx.emit('so:next');
              if (!res.ok) shake(btn);
            },
          }, '🔁 New run'),
          h('button', { class: 'btn btn-ghost', onClick: () => ctx.emit('room:backToLobby') }, '🏠 Back to lobby'),
        )
      : waitingFor(ctx.player(ctx.hostId)?.name, 'decides whether to run it back or head to the lobby.'),
  );
}
