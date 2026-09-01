// Swap or Stay screen rendering. The card table IS the board: it is mounted once per
// round and kept alive across every snapshot, because the deal, the swaps and the reveal
// are one continuous piece of theatre and rebuilding the DOM mid-scene would cut it dead.
// Everything that changes within a round — the turn arrow, the hearts, the control bar,
// the flying cards — is driven imperatively off snapshot deltas, so it all still works
// after a reconnect, where transient fx events would be long gone.
import { h, shake, waitingFor, sceneHero, scoringDetails, endArt } from '../../core/ui.js';
import { cardTable, setTurn, setDeckLabel, setDeckPickable } from '../../core/cards.js';
import { playMeme } from '../../core/memes.js';
import { confettiRain } from '../../core/fx.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// The cached table, keyed by game + round. main.js is guaranteed to skip replacing an
// identical root node, so returning the same element is what keeps the animations alive.
let mount = { key: null, node: null, api: null };

// The scoring rules ride the room snapshot; kept here so the deeply nested winner
// card can show them without threading snap through every update call.
let scoringRules = null;

export function renderSwapOrStay(snap, ctx) {
  const ss = snap.swaporstay;
  scoringRules = snap.scoringRules?.swaporstay || null;
  const key = `ss:${ss.startedAt}:${ss.round}`;
  if (mount.key !== key) buildRound(key, ss, ctx);
  updateRound(ss, ctx);
  return mount.node;
}

function faceOf(card) {
  return card.sentinel ? '🛡' : String(card.v);
}

// ---------- mounting a round ----------

function buildRound(key, ss, ctx) {
  // The old table may still be holding timers; let it clean up before it is dropped.
  mount.api?.table?.dispatchEvent(new Event('gn:teardown'));
  // And this module's own timers die with the old mount, so a throttled tab's leftover
  // reveal wave cannot play its gasps and booms over the next round's deal.
  if (mount.api) for (const id of mount.api.timers) clearTimeout(id);

  const api = {
    tableDone: false,
    afterDeal: [],                      // work parked until the deal choreography ends
    readySent: false,
    seenAction: ss.lastAction?.seq || 0, // actions from before this mount are old news
    revealDone: false,
    revealBusy: false,
    mountedRevealed: Boolean(ss.reveal), // a reconnect mid-result skips the wave
    lastTurnId: null,
    pending: null,                       // the two-step confirm: 'stay' | 'swap' | null
    sending: false,
    winDone: false,
    timers: new Set(),                   // raw timers owned by this mount; see later()
    entered: new Set(),                  // dock faces whose entrance has already played
    ss,
  };

  const youPlay = ss.order.includes(ctx.me.id);
  api.spectator = !youPlay;              // mounted from the bench, not eliminated mid-round
  api.playingIds = new Set(ss.order);    // who held a chair when this table was set
  const seats = ss.order.map((id) => {
    const p = ctx.player(id);
    return { id, name: p.name, avatar: p.avatar };
  });
  // An eliminated (or mid-game joining) viewer keeps a chair at the near edge, with a
  // card that never turns over. They are out, not gone: they still see the whole show
  // from their own seat rather than from behind somebody else's shoulders.
  if (!youPlay) seats.unshift({ id: ctx.me.id, name: ctx.me.name || 'You', avatar: ctx.me.avatar || '👤' });

  const dealer = ctx.player(ss.dealerId);
  const myFace = youPlay && ss.yourCard ? faceOf(ss.yourCard) : null;

  const table = cardTable({
    seats,
    myId: ctx.me.id,
    myFace,
    // No value in the label, on purpose: a swap can change the card under it mid-round,
    // and a caption that lies is worse than one that says less.
    myLabel: 'Yours. Keep it close 🤫',
    caption: `Round ${ss.round} · ${dealer.name} deals`,
    laugh: ss.round === 1,
    peekMs: 4000,
    holdHint: 'Hold to peek at your card',
    deckName: 'Deck',
    onDone: () => {
      api.tableDone = true;
      for (const fn of api.afterDeal.splice(0)) fn();
    },
  });
  if (!youPlay) table.classList.add('ss-spectator');

  api.table = table;
  api.status = h('div', { class: 'ss-status' });
  api.dock = h('div', { class: 'ss-dock' });
  api.log = h('ol', { class: 'ss-log' });

  mount.key = key;
  mount.api = api;
  mount.node = h('div', { class: 'ss-wrap stack' },
    table, reactionBar(ctx), api.status, api.dock,
    h('details', { class: 'card ss-logbox' },
      h('summary', {}, '📜 What happened this round'),
      api.log,
    ),
  );
}

// Defer work until the cards are actually on the felt.
function whenDealt(api, fn) {
  if (api.tableDone) fn();
  else api.afterDeal.push(fn);
}

// Every raw timer that writes into the mounted table goes through here, so buildRound
// can cancel the lot when the round is torn down instead of letting a stale reveal
// fire into the next deal.
function later(api, fn, ms) {
  const id = setTimeout(() => { api.timers.delete(id); fn(); }, ms);
  api.timers.add(id);
}

// ---------- per-snapshot updates ----------

function updateRound(ss, ctx) {
  const api = mount.api;
  api.ss = ss;
  const table = api.table;
  const youPlay = ss.order.includes(ctx.me.id);

  syncLog(api, ss, ctx);
  setTurn(table, ss.phase === 'acting' ? ss.turnId : null);

  // Ready up once the deal has been watched. Under reduced motion the table reports
  // done immediately, so nobody sits waiting on an animation that never ran.
  if (ss.phase === 'dealing' && youPlay && !ss.youReady && !api.readySent) {
    api.readySent = true;
    whenDealt(api, () => {
      // A refused ready (a hiccup mid-reconnect) re-arms, so the table never waits
      // forever on a player whose button silently misfired.
      ctx.emit('ss:ready').then((res) => { if (!res?.ok) api.readySent = false; });
    });
  }

  // Your turn opens with a sting, exactly once per turn.
  if (ss.turnId !== api.lastTurnId) {
    api.lastTurnId = ss.turnId;
    api.pending = null;
    api.sending = false;
    if (ss.turnId === ctx.me.id) whenDealt(api, () => playMeme('suspense'));
  }

  // The glowing deck is the dealer's second button: tapping it is the same as tapping
  // "swap with the deck" in the control bar.
  const canDraw = ss.phase === 'acting' && ss.turnId === ctx.me.id && ss.dealerId === ctx.me.id;
  setDeckPickable(table, canDraw, canDraw ? () => tapChoice(api, ss, ctx, 'swap') : undefined);
  // How many cards remain is trivia nobody plays off, so the stock is just "the deck" —
  // and it speaks up only for the dealer, in the one moment it is theirs to tap.
  setDeckLabel(table, canDraw ? 'Deck · tap to draw' : 'Deck');

  // A swap may have handed the viewer a different card; the face has to tell the truth
  // the next time they peek.
  if (youPlay && ss.yourCard) {
    const me = seatOf(table, ctx.me.id);
    if (me && !me.seat.classList.contains('ss-shield')) me.front.textContent = faceOf(ss.yourCard);
  }

  // One-shot: somebody acted. seq marks what has already been animated, so a reconnect
  // never replays a stale swap and a burst of snapshots animates each action once.
  if (ss.lastAction && ss.lastAction.seq > api.seenAction) {
    const act = ss.lastAction;
    api.seenAction = act.seq;
    whenDealt(api, () => animateAction(api, act, ctx));
  }

  // One-shot: the reveal.
  if (ss.reveal && !api.revealDone) {
    api.revealDone = true;
    if (api.mountedRevealed) whenDealt(api, () => applyRevealInstant(api, ctx));
    else whenDealt(api, () => playReveal(api, ctx));
  }

  // While the reveal timeline is running it owns the hearts and the skulls, so the
  // losses land on the beat of the flip rather than a second before it.
  if (!api.revealBusy) {
    syncHearts(api, ss);
    syncDead(api, ss);
  }
  // Leavers are not part of the reveal's theatre, so their chairs empty out at once.
  syncLeft(api, ss);

  // Only a viewer who sat down as a spectator hears this. Somebody eliminated during
  // this very round drops out of ss.order on the reveal snapshot, and announcing it
  // then would talk over their own death scene — they get the line next deal instead.
  if (api.spectator && !api.outCaptioned) {
    api.outCaptioned = true;
    whenDealt(api, () => say(table, 'You are out, enjoy the show 🍿'));
  }

  updateStatus(api, ss, ctx);
  updateDock(api, ss, ctx);
}

// ---------- finding things on the table ----------

// Chairs and seats are parallel lists in the same DOM order (the viewer's own pair last),
// which is the same correspondence playToCentre relies on in cards.js.
// One tap, one shared laugh: reactions ride fx, never state, and land as a float over
// the reactor's chair on everyone's table.
const SS_REACTIONS = ['😂', '😱', '🔥', '💀', '🤔', '🧐', '😭'];
function reactionBar(ctx) {
  return h('div', { class: 'ss-reactbar' },
    SS_REACTIONS.map((e) => h('button', {
      class: 'ss-react-btn', 'aria-label': `react ${e}`,
      onClick: () => { ctx.sound.tap(); ctx.emit('ss:react', { emoji: e }); },
    }, e)),
  );
}

function seatOf(table, id) {
  const chairs = [...table.querySelectorAll('.ct-who')];
  const seats = [...table.querySelectorAll('.ct-seat')];
  const i = chairs.findIndex((c) => c.dataset.id === id);
  const seat = seats[i];
  if (i === -1 || !seat) return null;
  return {
    chair: chairs[i],
    seat,
    slot: seat.querySelector('.ct-slot'),
    card: seat.querySelector('.ct-card'),
    front: seat.querySelector('.ct-face.front'),
  };
}

function say(table, text) {
  const cap = table.querySelector('.ct-caption');
  if (cap) cap.textContent = text;
}

// ---------- card motion ----------

// Turn a seat's card face up in place. The transform is committed as inline style before
// the animation is asked for (the flingCard rule): an animation can be cut short in a
// background tab, and which way a card faces must never depend on one finishing.
function flipUp(s, face) {
  if (!s) return;
  s.front.textContent = face;
  s.seat.classList.add('ss-up');
  s.card.style.transform = 'rotateY(180deg)';
  if (!reduced() && s.card.animate) {
    s.card.animate(
      [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(180deg)' }],
      { duration: 420, easing: 'cubic-bezier(0.36, 0.06, 0.22, 1)' },
    );
  }
}

function flipDown(api, s, restoreFace) {
  if (!s) return;
  s.seat.classList.remove('ss-up');
  s.card.style.transform = '';
  if (!reduced() && s.card.animate) {
    s.card.animate(
      [{ transform: 'rotateY(180deg)' }, { transform: 'rotateY(0deg)' }],
      { duration: 420, easing: 'cubic-bezier(0.36, 0.06, 0.22, 1)' },
    );
  }
  // The face text is wiped only once the card is safely back over it.
  later(api, () => {
    if (!s.seat.classList.contains('ss-up')) s.front.textContent = restoreFace;
  }, 440);
}

// A stand-in card that flies between two points on the stage. The real cards live inside
// slots that are scaled and turned to face their owners, so moving one across the table
// means unpicking two coordinate systems; a ghost in plain stage coordinates skips all
// of that, and because every back looks the same, nobody can tell.
function ghostFly(api, fromEl, toEl, { lift = -46, spin = 12, ms = 520, delay = 0 } = {}) {
  const stage = api.table.querySelector('.ct-stage');
  if (!stage || !fromEl || !toEl) return Promise.resolve();
  const sr = stage.getBoundingClientRect();
  const a = fromEl.getBoundingClientRect();
  const b = toEl.getBoundingClientRect();
  if (reduced()) return Promise.resolve();

  const ghost = h('div', { class: 'ss-ghost', 'aria-hidden': 'true' },
    h('div', { class: 'ct-card' }, h('div', { class: 'ct-face back' })));
  ghost.style.cssText = `left:${(a.left - sr.left).toFixed(1)}px; top:${(a.top - sr.top).toFixed(1)}px;`
    + `width:${a.width.toFixed(1)}px; height:${a.height.toFixed(1)}px;`;
  stage.append(ghost);

  const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
  const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
  const grow = (b.width / Math.max(a.width, 1)).toFixed(3);
  try {
    ghost.animate([
      { transform: 'translate(0, 0) rotate(0deg)' },
      {
        transform: `translate(${(dx * 0.5).toFixed(1)}px, ${(dy * 0.5 + lift).toFixed(1)}px)`
          + ` rotate(${spin}deg) scale(1.12)`,
        offset: 0.5,
        easing: 'cubic-bezier(0.3, 0.7, 0.4, 1)',
      },
      { transform: `translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(0deg) scale(${grow})` },
    ], { duration: ms, delay, easing: 'cubic-bezier(0.34, 0.1, 0.3, 1)', fill: 'both' });
  } catch { /* no WAAPI: the timer below still resolves */ }

  // Resolved on a timer, not the animation: a backgrounded tab never paints, and a game
  // must not wait forever on a card that will land the instant the tab is looked at.
  // Registered like the rest, so a torn-down round leaves its landings unresolved.
  return new Promise((done) => later(api, () => { ghost.remove(); done(); }, ms + delay + 30));
}

// ---------- animating other people's moves ----------

function animateAction(api, act, ctx) {
  const table = api.table;
  const name = (id) => {
    const p = ctx.player(id);
    return id === ctx.me.id ? `${p.name} (you)` : p.name;
  };
  const by = seatOf(table, act.by);

  if (act.kind === 'stay') {
    say(table, `${name(act.by)} stays put 😌`);
    playMeme('cardSlap');
    // A little press on the card: the sound of somebody patting what they are keeping.
    if (by && !reduced() && by.card.animate) {
      by.card.animate(
        [{ transform: 'translateY(0)' }, { transform: 'translateY(-7px)' }, { transform: 'translateY(0)' }],
        { duration: 280, easing: 'ease-out' },
      );
    }
    return;
  }

  if (act.kind === 'blocked') {
    say(table, `${name(act.with)} has a Sentinel, swap DENIED! 🛡`);
    const target = seatOf(table, act.with);
    if (!target) return;
    // A block is the game's biggest single moment, so it gets the full treatment: the
    // shield slams into the middle of the screen, the metal rings, the table flinches.
    playMeme('clang');
    setTimeout(() => playMeme('dun'), 320);
    const slam = h('div', { class: 'ss-slam', 'aria-hidden': 'true' },
      h('picture', { class: 'ss-slam-art' },
        h('source', { srcset: '/media/art/sentinel.webp', type: 'image/webp' }),
        h('img', { src: '/media/art/sentinel.jpg', alt: '' })),
      h('span', { class: 'ss-slam-shield' }, '🛡️'),
      h('span', { class: 'ss-slam-text' }, 'DENIED'),
    );
    table.append(slam);
    table.classList.add('ss-quake');
    later(api, () => { slam.remove(); table.classList.remove('ss-quake'); }, 1600);
    target.seat.classList.add('ss-shield');
    flipUp(target, '🛡');
    later(api, () => {
      target.seat.classList.remove('ss-shield');
      // If the reveal started in the meantime, the table owns every card face now and
      // this one must stay up rather than be flipped back over the result.
      if (api.revealDone) return;
      // The blocked seat is holding a Sentinel by definition, so if that seat is the
      // viewer's the face they see afterwards is still theirs to know.
      flipDown(api, target, act.with === ctx.me.id && api.ss.yourCard ? faceOf(api.ss.yourCard) : '');
    }, 1200);
    return;
  }

  if (act.kind === 'swap') {
    const target = seatOf(table, act.with);
    say(table, `${name(act.by)} swaps with ${name(act.with)} ⇄`);
    if (!by || !target) return;
    playMeme('cardFlick');
    by.card.style.visibility = 'hidden';
    target.card.style.visibility = 'hidden';
    // Two backs crossing mid-air. They land on each other's seats — which, to the eye,
    // is exactly where the untouched real cards are already sitting.
    ghostFly(api, by.slot, target.slot, { lift: -54, spin: 10 })
      .then(() => { target.card.style.visibility = ''; playMeme('cardSlap'); });
    ghostFly(api, target.slot, by.slot, { lift: -32, spin: -10, delay: 70 })
      .then(() => { by.card.style.visibility = ''; playMeme('cardSlap'); });
    if (act.by === ctx.me.id || act.with === ctx.me.id) showMyNewCard(api, ctx);
    return;
  }

  if (act.kind === 'draw') {
    const deckEl = table.querySelector('.ct-deck');
    say(table, `${name(act.by)} trades with the deck 🎴`);
    if (!by || !deckEl) return;
    playMeme('cardFlick');
    // The old card slides away to the stock face down, and the top of the deck flies in.
    by.card.style.visibility = 'hidden';
    ghostFly(api, by.slot, deckEl, { lift: 6, spin: -8, ms: 420 });
    ghostFly(api, deckEl, by.slot, { lift: -42, spin: 14, ms: 520, delay: 250 })
      .then(() => { by.card.style.visibility = ''; playMeme('cardSlap'); });
    if (act.by === ctx.me.id) showMyNewCard(api, ctx);
  }
}

// A card that lands in your hand is yours to see. It turns over for a moment once the
// swap has finished flying, then goes back face down like every other card on the felt.
function showMyNewCard(api, ctx) {
  later(api, () => {
    // The reveal may have started while the cards were in the air; it owns every face
    // from that point and must not be flipped back down underneath it.
    if (api.revealDone) return;
    const mine = seatOf(api.table, ctx.me.id);
    const card = api.ss?.yourCard;
    if (!mine || card == null) return;
    say(api.table, 'Your new card 👀');
    flipUp(mine, faceOf(card));
    later(api, () => { if (!api.revealDone) flipDown(api, mine, faceOf(card)); }, 2200);
  }, 700);
}

// ---------- the reveal ----------

function playReveal(api, ctx) {
  const ss = api.ss;
  const table = api.table;
  api.revealBusy = true;
  updateDock(api, ss, ctx);
  say(table, 'Everyone, cards up!');

  const stagger = 90;
  ss.reveal.forEach((r, i) => {
    later(api, () => {
      flipUp(seatOf(table, r.id), r.sentinel ? '🛡' : String(r.v));
      playMeme('cardTurn');
    }, i * stagger);
  });

  const waveMs = ss.reveal.length * stagger + 460;
  later(api, () => {
    // api.ss may have moved on beneath the timers; the reveal itself is frozen data.
    if (ss.spared) {
      playMeme('laughTrack');
      say(table, ss.roundQuip || 'Nobody loses. Free round!');
      finishReveal(api, ctx, 1000);
      return;
    }
    playMeme('gasp');
    for (const id of ss.losers) seatOf(table, id)?.seat.classList.add('ss-loser');
    later(api, () => {
      playMeme('boom');
      syncHearts(api, api.ss);
      syncDead(api, api.ss);
      if (ss.eliminated.length) later(api, () => playMeme('sadTrombone'), 480);
      finishReveal(api, ctx, 900);
    }, 620);
  }, waveMs);
}

function finishReveal(api, ctx, delay) {
  later(api, () => {
    api.revealBusy = false;
    syncHearts(api, api.ss);
    syncDead(api, api.ss);
    maybeCelebrate(api);
    updateStatus(api, api.ss, ctx);
    updateDock(api, api.ss, ctx);
  }, delay);
}

// A reconnect that lands in the middle of a result: everything is simply already turned
// over, because replaying two minutes of theatre at whoever refreshed helps nobody.
function applyRevealInstant(api, ctx) {
  const ss = api.ss;
  for (const r of ss.reveal) {
    const s = seatOf(api.table, r.id);
    if (!s) continue;
    s.front.textContent = r.sentinel ? '🛡' : String(r.v);
    s.seat.classList.add('ss-up');
    s.card.style.transform = 'rotateY(180deg)';
    if (!ss.spared && ss.losers.includes(r.id)) s.seat.classList.add('ss-loser');
  }
  syncHearts(api, ss);
  syncDead(api, ss);
  api.winDone = true;   // no confetti for a screen that was merely refreshed
  updateDock(api, ss, ctx);
}

function maybeCelebrate(api) {
  if (api.ss.phase !== 'gameOver' || api.winDone) return;
  api.winDone = true;
  playMeme('winInsiders');
  later(api, () => playMeme('dhol'), 500);
  confettiRain(2600);
}

// The round read back as a list: who kept, who forced a swap, who was refused, and who
// went to the deck. Card values are never in it — only the moves.
function syncLog(api, ss, ctx) {
  // Latest beat on top: the question the log answers is "what just happened?",
  // and nobody should scroll past round one to find out.
  const entries = (ss.log || []).slice().reverse();
  if (api.log.childElementCount === entries.length) return;
  const name = (id) => (id ? ctx.player(id).name : 'someone');
  api.log.replaceChildren(...entries.map((e) => {
    const who = name(e.by);
    const text = e.kind === 'stay' ? `${who} kept their card.`
      : e.kind === 'draw' ? `${who} had nobody left to swap with, so they drew from the deck.`
      : e.kind === 'blocked' ? `${who} tried to swap with ${name(e.with)}, blocked by a Sentinel 🛡️.`
      : `${who} swapped with ${name(e.with)}.`;
    return h('li', { class: `ss-log-row ss-log-${e.kind}` },
      h('span', { class: 'ss-log-round' }, `R${e.round}`),
      h('span', {}, text),
    );
  }));
}

// ---------- hearts and skulls ----------

// Heart pips live inside each chair's name tag, so they are always upright and readable
// wherever the chair is around the table. Updated in place: a pip that goes out cracks.
function syncHearts(api, ss) {
  for (const chair of api.table.querySelectorAll('.ct-who')) {
    const id = chair.dataset.id;
    if (!id || !(id in ss.lives)) continue;
    const lives = ss.lives[id] || 0;
    let el = chair.querySelector('.ss-lives');
    if (!el) {
      el = h('span', { class: 'ss-lives', 'aria-hidden': 'true' });
      for (let k = 0; k < (ss.startLives || 3); k++) el.append(h('i', { class: 'ss-pip on' }, '♥'));
      // Beside the name tag, not inside it: the name may ellipsis, the hearts may not.
      chair.append(el);
    }
    [...el.children].forEach((pip, k) => {
      const on = k < lives;
      const was = pip.classList.contains('on');
      pip.classList.toggle('on', on);
      if (was && !on) {
        // Restart the crack animation even if this pip has cracked in a former game.
        pip.classList.remove('ss-crack');
        void pip.offsetWidth;
        pip.classList.add('ss-crack');
      }
    });
  }
}

function syncDead(api, ss) {
  for (const chair of api.table.querySelectorAll('.ct-who')) {
    const id = chair.dataset.id;
    if (!id) continue;
    chair.classList.toggle('ss-dead', id in ss.lives && (ss.lives[id] || 0) <= 0);
  }
}

// A player who leaves mid-round vanishes from lives entirely (the dead keep a zero),
// so a mounted chair with no lives entry belongs to somebody who walked. Their chair
// and card grey out rather than sit there looking like they still expect a turn.
function syncLeft(api, ss) {
  const chairs = [...api.table.querySelectorAll('.ct-who')];
  const seats = [...api.table.querySelectorAll('.ct-seat')];
  chairs.forEach((chair, i) => {
    const id = chair.dataset.id;
    if (!id || !api.playingIds.has(id)) return;
    const left = !(id in ss.lives);
    chair.classList.toggle('ss-left', left);
    seats[i]?.classList.toggle('ss-left', left);
  });
}

// ---------- status strip ----------

function updateStatus(api, ss, ctx) {
  const dealer = ctx.player(ss.dealerId);
  const label = {
    dealing: `🂠 Peek at your card (${ss.readyCount}/${ss.aliveIds.length} ready)`,
    acting: `🎯 ${ss.acted.length}/${ss.aliveIds.length} have chosen`,
    result: ss.spared ? '😅 Everyone spared!' : '💔 The reveal',
    gameOver: '🏁 Game over',
  }[ss.phase] || '';
  api.status.replaceChildren(
    h('span', { class: 'ss-round' }, `Round ${ss.round}`),
    h('span', { class: 'ss-dealer' }, `🎴 ${dealer.avatar} ${dealer.name} deals`),
    h('span', { class: 'ss-phase' }, label),
  );
}

// ---------- the control dock ----------

// One-shot entrances: the dock is rebuilt on every snapshot, but the class that runs
// each face's rise (and the trophy drop) is granted only on its first appearance in
// this mount. The mount key carries the deal id, so a fresh round animates fresh.
function enterOnce(api, el, tag) {
  if (!api.entered.has(tag)) {
    api.entered.add(tag);
    el.classList.add('ss-enter');
  }
  return el;
}

function updateDock(api, ss, ctx) {
  // While the reveal is playing out, the dock holds its breath with everyone else.
  if (api.revealBusy) {
    api.dock.replaceChildren(sceneHero('moments/ss-reveal',
      h('p', { class: 'ss-note' }, '👀 Cards up…'), { size: 'sm' }));
    return;
  }
  const youPlay = ss.aliveIds.includes(ctx.me.id);
  let content = null;

  const lastTwo = ss.aliveIds.length === 2;
  if (ss.phase === 'dealing') {
    content = sceneHero(lastTwo ? 'moments/lasttwo' : 'moments/shuffling', youPlay
      ? h('p', { class: 'ss-note' }, ss.youReady
          ? `Waiting for the table… (${ss.readyCount}/${ss.aliveIds.length})`
          : 'The cards are going out. Sneak a look at yours!')
      : h('p', { class: 'ss-note' }, 'You are out, enjoy the show 🍿'), { size: 'sm' });
  } else if (ss.phase === 'acting') {
    if (!youPlay) {
      content = h('p', { class: 'ss-note' }, 'You are out, enjoy the show 🍿');
    } else if (ss.turnId === ctx.me.id) {
      content = enterOnce(api, choiceBar(api, ss, ctx), `choice:${ss.turnId}`);
    } else {
      const p = ctx.player(ss.turnId);
      content = h('p', { class: 'ss-note' }, `⏳ ${p.avatar} ${p.name} is deciding…`);
    }
  } else if (ss.phase === 'result') {
    content = enterOnce(api, resultCard(api, ss, ctx), 'result');
  } else if (ss.phase === 'gameOver') {
    content = enterOnce(api, winnerCard(ss, ctx), 'winner');
  }

  api.dock.replaceChildren(...[content].flat().filter(Boolean));
}

// One tap picks, the second commits. A choice here cannot be taken back, so nothing
// reaches the server until the same button is pressed twice.
function tapChoice(api, ss, ctx, action) {
  if (api.sending || ss.turnId !== ctx.me.id) return;
  if (api.pending === action) {
    sendChoice(api, ss, ctx, action);
  } else {
    api.pending = action;
    playMeme('heartbeat');
    updateDock(api, ss, ctx);
  }
}

async function sendChoice(api, ss, ctx, action) {
  api.sending = true;
  updateDock(api, ss, ctx);
  const res = await ctx.emit('ss:choice', { action });
  if (!res.ok) {
    api.sending = false;
    api.pending = null;
    updateDock(api, api.ss, ctx);
    shake(api.dock);
  }
  // On success the next snapshot moves the turn along and redraws the dock itself.
}

function choiceBar(api, ss, ctx) {
  const isDealer = ss.dealerId === ctx.me.id;
  const i = ss.order.indexOf(ctx.me.id);
  const targetId = ss.order[(i + 1) % ss.order.length];
  const target = ctx.player(targetId);

  const btn = (action, idleLabel, armedLabel, cls) => h('button', {
    class: `btn btn-lg ss-btn ${cls} ${api.pending === action ? 'ss-armed' : ''}`,
    disabled: api.sending,
    onClick: () => tapChoice(api, ss, ctx, action),
  }, api.pending === action ? armedLabel : idleLabel);

  return h('div', { class: 'ss-choice card' },
    h('div', { class: 'ss-choice-title' }, '🎯 Your call!'),
    h('div', { class: 'ss-choice-row' },
      btn('stay', '🪑 Stay', '🪑 Tap again, keep it', 'ss-stay'),
      isDealer
        ? btn('swap', '🎴 Draw from the deck', '🎴 Tap again, no take-backs', 'ss-swap')
        : btn('swap', `⇄ Swap with ${target.name}`, '⇄ Tap again, no take-backs', 'ss-swap'),
    ),
    h('p', { class: 'ss-choice-hint' },
      api.sending ? 'Locking it in…'
        : isDealer ? "Dealer's privilege: you trade with the deck, not a player."
        : 'Lowest card at the reveal loses a heart. Sentinels block swaps.'),
  );
}

function resultCard(api, ss, ctx) {
  const names = (ids) => ids.map((id) => ctx.player(id).name).join(', ');
  let verdict;
  if (ss.spared) verdict = ss.roundQuip || 'Nobody loses this round!';
  else if (ss.eliminated.length) verdict = `${names(ss.eliminated)} ${ss.eliminated.length > 1 ? 'are' : 'is'} out! ${ss.roundQuip || ''}`;
  else if (ss.losers.length) verdict = `${names(ss.losers)} lose${ss.losers.length > 1 ? '' : 's'} a heart 💔 ${ss.roundQuip || ''}`;
  else verdict = ss.roundQuip || '';

  return h('div', { class: 'ss-result card' },
    // Somebody just lost a heart: the verdict — who pays, by name — sits ON the
    // withdrawing-hand image, in its fade, the same hero language as everywhere else.
    ss.spared
      ? h('p', { class: 'ss-verdict' }, verdict)
      : sceneHero('moments/heart-lost',
          h('p', { class: 'ss-verdict', style: 'margin:0' }, verdict),
          { cls: 'hero-bleed' }),
    ctx.isHost
      ? h('button', {
          class: 'btn btn-lg btn-block ss-btn ss-next',
          onClick: async (e) => {
            // currentTarget is nulled once dispatch ends, so keep the button in hand.
            const btn = e.currentTarget;
            btn.disabled = true;
            const res = await ctx.emit('ss:next');
            if (!res.ok) { btn.disabled = false; shake(btn); }
          },
        }, '▶️ Next round')
      : waitingFor(ctx.player(ctx.hostId)?.name, 'deals the next round.'),
  );
}

function winnerCard(ss, ctx) {
  const winner = ss.winnerId ? ctx.player(ss.winnerId) : null;
  return h('div', { class: 'ss-winner card' },
    // The one ending screen in the app that had no art at all: the last hand still
    // holding a card, with everyone else's seat abandoned around it.
    endArt('endings/win-swaporstay-last'),
    h('span', { class: 'ss-win-emoji' }, '🏆'),
    h('h2', { class: 'ss-win-title' },
      winner ? `${winner.avatar} ${winner.name} wins!` : 'Nobody survived the deck!'),
    winner && ss.winnerId === ctx.me.id && h('p', { class: 'ss-win-you' }, 'That is you. Take the bow! 🎉'),
    h('p', { class: 'ss-win-quip' }, ss.endQuip),
    scoringDetails(scoringRules),
    ctx.isHost
      ? h('div', { class: 'ss-win-actions' },
          h('button', {
            class: 'btn btn-lg ss-btn ss-next',
            onClick: async (e) => {
              // currentTarget is nulled once dispatch ends, so keep the button in hand.
              const btn = e.currentTarget;
              btn.disabled = true;
              const res = await ctx.emit('ss:next');
              if (!res.ok) { btn.disabled = false; shake(btn); }
            },
          }, '🔁 Play again'),
          h('button', { class: 'btn btn-ghost', onClick: () => ctx.emit('room:backToLobby') }, '🏠 Back to lobby'),
        )
      : waitingFor(ctx.player(ctx.hostId)?.name, 'decides whether to run it back or head to the lobby.'),
  );
}
