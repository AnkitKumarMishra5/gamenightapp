// Game Night — © 2026 Ankit Kumar Mishra. All rights reserved. See LICENSE.
// The card table: a deck that shuffles convincingly, deals itself out, and leaves you a
// card you can pick up and turn over.
//
// Shared by every card game, because the dealing moment is the same ritual each time and
// it is the bit that makes a browser game feel like a table.
//
// It is drawn from the viewer's chair, not from above. Your own card sits large and face
// up at the near edge; everyone else is arranged around the far side, getting smaller the
// further away they sit. Seating is rotated per player, so the table reads the same way it
// would if you were actually sitting at it.
//
// Every card comes to rest square to the middle of the table. An earlier version landed
// them at scattered angles, which is what a hand-dealt round really looks like, but on a
// small screen it reads as sloppy rather than natural.
//
// LAYOUT. The stage is divided into bands that cannot collide: the deck and the far seats
// share the middle, far enough apart vertically that a landed card never lands on the
// deck, the viewer's own card owns the bottom, and the caption has its own row underneath
// rather than floating over the felt. The deck also fades out once the round is dealt,
// because by then it has nothing left to say.
//
// MOTION. The shuffle is three real motions rather than a spin: a riffle where the halves
// interleave, a cut where the top half travels under, and a square-up. That sequence is
// what the eye recognises as shuffling.
//
// HANDS are on screen the whole time: two working the deck through the shuffle, the right
// one carrying each card out to its seat, and one more that comes in over your own card
// whenever you pick it up or throw it. They are drawn (public/media/art/hand.svg) rather
// than set as emoji, because an emoji hand renders as flat cartoon colour on a shaded card
// and reads as a sticker stuck on top of the game.
//
// EVERY CARD FACES ITS OWN PLAYER. A card at a real table is squared to whoever it belongs
// to, so a card across the table is upright, one on your left lies almost sideways, and
// one at ten o'clock points up and to the left. Cards all sharing the screen's up-axis is
// the single thing that makes a round table look like a web page. The reveal is a true rotateY through edge-on —
// the front face is stored pre-mirrored so it reads the right way round once the card has
// turned the full 180 degrees.
//
// SOUND. The laugh runs over the shuffle, then stops dead as the deck squares up, the
// soundtrack ducks with it, and the deal lands in silence under a low serious swell. Each
// card gets a flick as it leaves the deck and a slap as it hits the felt.
//
// YOUR OWN CARD has one life cycle, not two, and it copies what a person actually does at
// a table: the card is dealt face down, it turns over so you can read it, and then it goes
// back face down, because leaving your card face up is how everyone else reads it too.
// After that it is yours to handle — hold it to look again, or drag it away to play it.
import { h } from './ui.js';
import { memes, playMeme } from './memes.js';
import { duckMusic } from './ambience.js';

export const SHUFFLE_MS = 2300;
const DECK_DEPTH = 14;         // cards drawn in the stack, enough to read as a real deck
// One card every DEAL_STEP_MS, and the dealing hand carries it for DEAL_FLIGHT_MS of that
// before letting go and going back for the next. The step has to stay comfortably longer
// than the flight, or the hand would need to be in two places at once.
const DEAL_STEP_MS = 330;
const DEAL_FLIGHT_MS = 300;
const FLIP_MS = 780;
const HUSH_MS = 1620;          // the laugh cuts out here, a beat before the deal
// The seat scale curve: NEAR_SCALE at the near edge falling to FAR_SCALE at the far one.
// MID_SCALE is what it gives at the middle of the table, where played cards end up.
// Everyone else is sitting further back than you are, so their cards run smaller across
// the board: the outermost seats at FAR_SCALE + SCALE_RANGE, the far seat at FAR_SCALE.
const FAR_SCALE = 0.36;
const SCALE_RANGE = 0.2;
// The far arc, in screen angles where 270 is twelve o'clock: eight o'clock round to four.
// The near quarter of the table is left clear, because that is where the viewer sits.
const ARC_FROM = 150;
const ARC_TO = 390;
const MID_SCALE = FAR_SCALE + SCALE_RANGE * 0.5;

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// Someone sitting at the table: a plain head over shoulders, facing the board, with their
// name outside them. Built from two CSS shapes rather than drawn, because a silhouette at
// this size only has to read as a person, and a circle on a rounded slab does that at
// every scale the table asks for.
//
// The figure is deliberately faceless. An avatar painted on a head that is turned away
// from you reads as a mask rather than as a person; the emoji belongs with the name, on
// the outside of the table where it can always be read the right way up.
function person(p, style = '') {
  return h('div', { class: 'ct-who', style, 'data-id': p.id || '' },
    h('div', { class: 'ct-arrow', 'aria-hidden': 'true' }),
    h('div', { class: 'ct-body' }, h('span', { class: 'ct-head' })),
    h('b', {}, h('span', { class: 'ct-emoji' }, p.avatar), p.name),
  );
}

/**
 * Place every chair and card around the table.
 *
 * Runs once the stage has a size, because even spacing depends on the shape of the ellipse
 * and nothing knows that until layout has happened. Re-runs on resize for the same reason.
 *
 * @param {HTMLElement} table
 * @param {{chair:HTMLElement, seat:HTMLElement, j:number}[]} ringSeats
 */
function layoutSeats(table, ringSeats) {
  const stage = table.querySelector('.ct-stage');
  if (!stage || !ringSeats.length) return;
  const box = stage.getBoundingClientRect();
  if (!box.width || !box.height) return;
  const cs = getComputedStyle(table);
  const rx = (parseFloat(cs.getPropertyValue('--rx')) || 34) / 100;
  const ry = (parseFloat(cs.getPropertyValue('--ry')) || 15) / 100;

  const angles = spreadAround(ringSeats.length, {
    w: box.width, h: box.height, rx, ry,
  });

  ringSeats.forEach(({ chair, seat, j }) => {
    const a = angles[j];
    const xf = Math.cos(a);
    const yf = Math.sin(a);
    // Turn the card so its top edge points out at the player it belongs to. Solving
    // "rotate (0,-1) onto (xf, yf)" gives this; the seat opposite you comes out upright,
    // and the seats beside you come out lying nearly sideways, which is correct.
    const rot = (Math.atan2(xf, -yf) * 180) / Math.PI;
    // Depth: -1 is the far edge, +1 is near, and cards shrink with it.
    const scale = (FAR_SCALE + SCALE_RANGE * ((yf + 1) / 2)).toFixed(3);
    const z = Math.round((1 - yf) * 10);
    const place = `--xf:${xf.toFixed(3)}; --yf:${yf.toFixed(3)}; --s:${scale}; --z:${z};`;
    chair.setAttribute('style', place);
    seat.setAttribute('style', `${place} --rot:${rot.toFixed(1)}deg; --d:${(j + 1) * DEAL_STEP_MS}ms;`);
  });
}

/**
 * Where each player sits, spaced evenly *along the table edge* rather than evenly by angle.
 *
 * The table is a wide, flat ellipse, so equal steps in angle are not equal steps in
 * distance: they bunch players up near three and nine o'clock and leave gaps beside
 * twelve. Walking the arc and cutting it into equal lengths puts real space between every
 * chair, whatever the table is shaped like and however many people are at it.
 *
 * @param {number} count  how many players are on the far arc
 * @param {{w:number,h:number,rx:number,ry:number}} table  the ellipse, in px
 * @returns {number[]} angles in radians, in seating order
 */
function spreadAround(count, table) {
  if (count <= 0) return [];
  const mid = ((ARC_FROM + ARC_TO) / 2) * (Math.PI / 180);
  if (count === 1) return [mid];

  const a = table.rx * table.w;
  const b = table.ry * table.h;
  const STEPS = 720;
  const walk = [];
  let len = 0;
  let prev = null;
  for (let i = 0; i <= STEPS; i += 1) {
    const t = (ARC_FROM + (ARC_TO - ARC_FROM) * (i / STEPS)) * (Math.PI / 180);
    const pt = { t, x: Math.cos(t) * a, y: Math.sin(t) * b };
    if (prev) len += Math.hypot(pt.x - prev.x, pt.y - prev.y);
    walk.push({ t, s: len });
    prev = pt;
  }
  return Array.from({ length: count }, (_, j) => {
    const target = (j / (count - 1)) * len;
    const hit = walk.find((pt) => pt.s >= target) || walk[walk.length - 1];
    return hit.t;
  });
}

function card(front, back = true) {
  return h('div', { class: 'ct-card dealt' },
    h('div', { class: 'ct-face front' }, front ?? ''),
    back ? h('div', { class: 'ct-face back' }) : null,
  );
}

/**
 * Work out where each card starts from and send the dealing hand round after them.
 *
 * Both halves need the same measurement, taken from the live DOM before anything has
 * moved: the card's start offset is the deck's position expressed in the card's own
 * coordinates, and the hand's legs are the same vectors the other way up. Measuring is
 * what makes the hand actually arrive on the card rather than gesture near it.
 *
 * @param {HTMLElement} deck
 * @param {HTMLElement} hand   the dealing hand, moved by the Web Animations API because
 *                             every leg goes somewhere different and a keyframe rule
 *                             cannot take an argument
 * @param {HTMLElement[]} targets  the card elements, in the order they are dealt
 */
function dealFromDeck(deck, hand, targets) {
  const centre = (el) => {
    const b = el.getBoundingClientRect();
    return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  };
  const from = centre(deck);
  const legs = targets.map((el, i) => {
    const to = centre(el);
    const leg = { dx: to.x - from.x, dy: to.y - from.y };
    el.style.setProperty('--fx', `${(-leg.dx).toFixed(1)}px`);
    el.style.setProperty('--fy', `${(-leg.dy).toFixed(1)}px`);
    // Which way the card swings as it travels, so cards going left and right lean into
    // their own direction rather than all leaning the same way.
    el.style.setProperty('--lean', -leg.dx > 0 ? '1' : '-1');
    // On the slot rather than the card, so the card inherits it and the slot's contact
    // shadow can fade in on the same beat the card lands.
    el.parentElement?.style.setProperty('--d', `${i * DEAL_STEP_MS}ms`);
    return leg;
  });

  const total = legs.length * DEAL_STEP_MS + 260;
  const at = (ms) => Math.min(1, Math.max(0, ms / total));
  const pose = (dx, dy, rot, scale) => `translate(-50%, -50%)`
    + ` translate(${dx.toFixed(1)}px, ${dy.toFixed(1)}px) rotate(${rot.toFixed(1)}deg) scale(${scale})`;
  const home = pose(0, 0, -14, 0.95);

  const frames = [{ offset: 0, opacity: 0, transform: home }];
  legs.forEach((leg, k) => {
    const t = k * DEAL_STEP_MS;
    // Over the deck, card pinched.
    frames.push({ offset: at(t), opacity: 1, transform: home, easing: 'cubic-bezier(0.32, 0.02, 0.24, 1)' });
    // At the seat, card set down. The wrist turns toward wherever it reached.
    frames.push({
      offset: at(t + DEAL_FLIGHT_MS), opacity: 1,
      transform: pose(leg.dx, leg.dy, leg.dx * 0.05 + 2, 1),
      easing: 'cubic-bezier(0.4, 0, 0.3, 1)',
    });
    // A beat with the hand still there, so the card is seen to be placed, not dropped.
    frames.push({
      offset: at(t + DEAL_FLIGHT_MS + 55), opacity: 1,
      transform: pose(leg.dx, leg.dy * 0.93, leg.dx * 0.05 - 2, 0.96),
      easing: 'cubic-bezier(0.3, 0, 0.2, 1)',
    });
    frames.push({ offset: at(t + DEAL_STEP_MS - 10), opacity: 1, transform: home });
  });
  frames.push({ offset: 1, opacity: 0, transform: home });

  // Offsets must be non-decreasing, and rounding can break that on a short step.
  let last = 0;
  for (const f of frames) { f.offset = Math.max(last, f.offset); last = f.offset; }

  // fill:'none' on purpose. A filled animation keeps asserting its last keyframe forever
  // and outranks every stylesheet rule, so the hand could never be hidden again by CSS —
  // which is how it ended up hovering over an empty table holding nothing.
  try { hand.animate(frames, { duration: total, fill: 'none' }); } catch { /* no WAAPI */ }
}

/**
 * Where a played card lands: the middle of the table, at the size the table's perspective
 * gives something that far away. Measured rather than guessed, so it works at any stage
 * size, and the shrink is the same depth curve the seats are laid out on — a card in the
 * middle is further from you than your own seat, so it must arrive smaller.
 *
 * @param {HTMLElement} table
 * @param {HTMLElement} cardEl
 * @returns {{dx:number, dy:number, scale:number}}
 */
function pileTarget(table, cardEl, n = 0) {
  const stage = table.querySelector('.ct-stage');
  const seat = cardEl.closest('.ct-seat');
  const slot = cardEl.closest('.ct-slot');
  const mid = (parseFloat(getComputedStyle(table).getPropertyValue('--mid')) || 44) / 100;
  const mine = parseFloat(getComputedStyle(seat).getPropertyValue('--s')) || 0.95;
  const sr = stage.getBoundingClientRect();
  const seatBox = seat.getBoundingClientRect();

  // Taken from the layout box, not from any measured rect. When this runs the card is mid
  // drag and the slot is still easing back from being held up, so every rendered position
  // on screen is in motion; offsetLeft/offsetTop are untransformed and stand still.
  const restX = seatBox.left + slot.offsetLeft + slot.offsetWidth / 2;
  const restY = seatBox.top + slot.offsetTop + slot.offsetHeight / 2;

  // Cards land slightly off each other rather than in one exact stack. A real pile is
  // legible because every card shows a sliver of the one under it; a perfect stack looks
  // like a single card and hides how many have been played.
  // Each card lands a little further round a slow spiral than the one before, so the pile
  // fans as it grows and every card underneath still shows an edge. The golden angle is
  // used for the same reason a sunflower does: successive steps never line up, so no two
  // cards in the pile ever hide each other completely.
  const turn = n * 2.39996;
  const off = { x: Math.cos(turn) * (9 + n * 4.2), y: Math.sin(turn) * (7 + n * 3.1) };
  const spin = -16 + ((n * 47) % 42);

  // The card lives inside the slot, and the slot is both scaled down and turned to face
  // its own player. So a translate written on the card is read in a coordinate system that
  // is smaller than the screen's and rotated away from it: the screen vector has to be
  // divided back down and turned the other way, or a card thrown from the seat at ten
  // o'clock sails off towards ten o'clock instead of into the middle.
  const rot = (parseFloat(getComputedStyle(slot).getPropertyValue('--rot')) || 0) * (Math.PI / 180);
  const sx = ((sr.left + sr.width / 2) + off.x - restX) / mine;
  const sy = ((sr.top + sr.height * mid) + off.y - restY) / mine;
  return {
    // The card's own turn has to be undone too, so every card in the pile lies at the
    // angle the pile wants rather than at the angle its owner was sitting.
    spin: spin - (rot * 180) / Math.PI,
    dx: sx * Math.cos(-rot) - sy * Math.sin(-rot),
    dy: sx * Math.sin(-rot) + sy * Math.cos(-rot),
    // MID_SCALE is the ring's scale at depth zero, which is exactly the middle of the
    // table, so a card thrown there arrives at the size that distance calls for.
    scale: MID_SCALE / mine,
  };
}

/**
 * @param {object} opts
 * @param {{id:string,name:string,avatar:string}[]} opts.seats  table in turn order
 * @param {string} [opts.myId]      the viewer, pinned to the near edge
 * @param {string} [opts.myFace]    what the viewer's card reads once turned over
 * @param {string} [opts.myLabel]   what your own card is called while you are looking at it
 * @param {string} [opts.caption]   caption while shuffling
 * @param {boolean} [opts.laugh]    run the laugh over the shuffle (default true)
 * @param {number} [opts.peekMs]    how long your card stays face up before it goes back down
 * @param {string} [opts.holdHint]  caption once the card is yours to handle
 * @param {string} [opts.deckName]  what the parked stock is called
 * @param {() => void} [opts.onThrow] called when the player drags their card away to play it
 * @param {() => void} [opts.onDone]
 */
export function cardTable({
  seats = [], myId, myFace, myLabel = 'Your card', caption, laugh = true,
  peekMs = 5000, holdHint = 'Hold to look · drag up to play', deckName = 'Deck',
  onThrow, onDone,
} = {}) {
  // Every card in the deck carries a real back face, the same one the dealt cards use.
  // Without the face element there is nothing to paint: .ct-card is only a box with a
  // border radius, which is why the deck was invisible and the shuffle could be heard
  // but not seen.
  const deck = h('div', { class: 'ct-deck', 'aria-hidden': 'true' },
    // --cut marks the top half: the cut phase needs a branch, and calc() has no
    // conditionals, so the branch has to arrive as a number.
    Array.from({ length: DECK_DEPTH }, (_, i) => h('div', {
      class: 'ct-card in-deck',
      style: `--i:${i}; --cut:${i > (DECK_DEPTH - 1) / 2 ? 1 : 0}`,
    }, h('div', { class: 'ct-face back' }))),
  );

  // Rotate the table so the viewer is first, then lay the rest out in turn order from
  // eight o'clock round to four.
  //
  // This is what makes every player's view agree with every other's. The person after you
  // in turn order is always the first seat on your left; the person before you is always
  // the last seat on your right. So if you can see someone on your left, they see you on
  // their right — and everyone at the table is describing the same seating, which is the
  // whole point of drawing it per player rather than from above.
  const meAt = Math.max(0, seats.findIndex((p) => p.id === myId));
  const rotated = seats.length ? [...seats.slice(meAt), ...seats.slice(0, meAt)] : [];
  const me = rotated[0];
  const others = rotated.slice(1);

  const ring = h('div', { class: 'ct-ring' });
  // Filled in deal order. The viewer's card leaves the deck first, then the table goes
  // round, and these are the very elements the deal is aimed from.
  const dealOrder = [];

  const ringSeats = [];
  others.forEach((p, j) => {
    const theirs = card('');
    dealOrder.push(theirs);
    const chair = person(p);
    const seat = h('div', { class: 'ct-seat' }, h('div', { class: 'ct-slot' }, theirs));
    // Positions are filled in by layoutSeats once the table has a size on screen: spacing
    // players evenly along the table edge needs to know the shape of that edge, and
    // nothing knows that until the stage has been laid out.
    ringSeats.push({ chair, seat, j });
    ring.append(chair, seat);
  });

  // The viewer's own seat is pinned to the near edge rather than placed on the arc, so it
  // is always exactly where their hand would be. It is also the only card on the table
  // they can touch, so it is the one that carries the gestures.
  const myCard = card(myFace ?? '?');
  // The hand lives inside the card rather than beside it, so the card's turn takes the
  // hand with it: fingers lie across the back while the card is face down, and the same
  // rotation that brings the face round puts them behind it. No second drawing and no
  // second animation to keep in step — the hand is simply attached to what it is holding.
  const myGrip = h('div', { class: 'ct-grip', 'aria-hidden': 'true' },
    h('img', { src: '/media/art/hand.svg', alt: '', width: '64', height: '80' }));

  if (me) { dealOrder.unshift(myCard); myCard.append(myGrip); }
  const mySeat = me ? h('div', {
    class: 'ct-seat mine',
    tabindex: myFace != null ? '0' : null,
    role: myFace != null ? 'button' : null,
  },
    h('div', { class: 'ct-slot' }, myCard),
  ) : null;
  // Your own chair sits on the same ring as everyone else's, at six o'clock.
  // Your own name, not just "you": at a table you are still whoever you signed in as, and
  // a player who has picked a name deserves to see it.
  const myChair = me
    ? person({ id: me.id, avatar: me.avatar, name: `${me.name} (you)` }, '--s:0.95;')
    : null;
  myChair?.classList.add('mine');

  const handImg = (cls) => h('div', { class: `ct-hand ${cls}`, 'aria-hidden': 'true' },
    h('img', { src: '/media/art/hand.svg', alt: '', width: '64', height: '80' }));
  const leftHand = handImg('h-left');
  const rightHand = handImg('h-right');

  // The stock keeps its own corner once the round is out, with a label, rather than being
  // shrunk into a crumb beside the table.
  // An unnamed stock stays unnamed: a caption under a pile nobody can touch reads as
  // a button and gets tapped.
  const deckLabel = h('div', { class: 'ct-stock', 'aria-hidden': 'true' }, deckName || '');
  const status = h('p', { class: 'ct-caption' }, caption || 'Shuffling…');

  const table = h('div', { class: `card-table shuffling ${reduced() ? 'still' : ''}` },
    h('div', { class: 'ct-stage' },
      h('div', { class: 'ct-felt', 'aria-hidden': 'true' }),
      ring,
      deck,
      leftHand,
      rightHand,
      deckLabel,
      mySeat,
      myChair,
    ),
    status,
  );

  if (reduced()) {
    requestAnimationFrame(() => layoutSeats(table, ringSeats));
    table.classList.remove('shuffling');
    table.classList.add('dealt', 'spent', 'laid', 'flipped');
    status.textContent = myLabel || 'Cards dealt.';
    onDone?.();
    return table;
  }

  // Lay the table out as soon as it has a size. rAF rather than an immediate call because
  // the element is still being assembled here and has not been measured by anyone yet.
  const relayout = () => layoutSeats(table, ringSeats);
  requestAnimationFrame(relayout);
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(relayout) : null;
  ro?.observe(table);

  const timers = [];
  const at = (ms, fn) => timers.push(setTimeout(fn, ms));

  let stopLaugh = () => {};
  memes.cardShuffle();
  if (laugh) stopLaugh = playMeme('laughTrack') || (() => {});

  // The hush. Everything cuts at once — the laugh, the soundtrack — and the low swell
  // comes up into the gap. That contrast is the whole effect.
  at(HUSH_MS, () => {
    stopLaugh(0.09);
    duckMusic(2600);
    memes.serious();
  });

  at(SHUFFLE_MS, () => {
    // Measure first: once .dealt is on, every card is mid-animation and its measured
    // position is no longer where it started from.
    dealFromDeck(deck, rightHand, dealOrder);
    // Phase classes rather than one growing pile of them: a hand is only ever on screen
    // while it has a deck or a card in it, and that is easiest to guarantee if exactly one
    // phase is true at a time.
    table.classList.remove('shuffling');
    table.classList.add('dealt', 'dealing');
    status.textContent = 'Dealing…';
    dealOrder.forEach((_, k) => {
      at(k * DEAL_STEP_MS, () => memes.cardFlick());
      at(k * DEAL_STEP_MS + DEAL_FLIGHT_MS - 40, () => memes.cardSlap());
    });
  });

  const dealtBy = SHUFFLE_MS + dealOrder.length * DEAL_STEP_MS + 200;
  // Once every card has landed the deck is clutter, so it goes.
  at(dealtBy - 200, () => table.classList.add('spent'));
  at(dealtBy, () => {
    // Every card is down. Hand the final pose over to plain CSS: a deal animation left
    // running with fill:both keeps asserting its last keyframe forever, and an animation
    // outranks any static rule, so nothing after this point could move a card again.
    table.classList.remove('dealing');
    table.classList.add('laid');
    if (myFace != null) {
      table.classList.add('flipped');
      memes.cardTurn();
      status.textContent = myLabel;
    } else {
      status.textContent = 'Cards are out.';
    }
  });

  if (myFace != null && mySeat) {
    let armed = false;
    const gestures = wireCardGestures(mySeat, myCard, {
      live: () => armed,
      grip: myGrip,
      onThrow: onThrow && (() => {
        // Once it is out in the middle it belongs to the table, not to you. Disarming the
        // gestures and dropping .live together means the card stops inviting a press at
        // the same moment it stops answering one.
        armed = false;
        table.dataset.pile = String(pileCount(table) + 1);
        mySeat.classList.remove('live', 'showing', 'armed');
        mySeat.removeAttribute('tabindex');
        status.textContent = 'Played.';
        const to = pileTarget(table, myCard, pileCount(table));
        // .played swaps the faces; the class goes on as the card passes edge-on, which is
        // the one moment in the flight when neither face is legible.
        at(190, () => mySeat.classList.add('played'));
        flingCard(myCard, { ...to, faceUp: true }).then(() => onThrow());
      }),
      onTurn: (on) => { status.textContent = on ? myLabel : holdHint; },
      // Say what letting go would do, while there is still time to change your mind.
      onDrag: (state) => {
        if (state === 'throw') status.textContent = 'Let go to play it';
        else if (state === 'keep') status.textContent = 'Let go to keep it · slide further to play';
        else if (!mySeat.classList.contains('played')) status.textContent = holdHint;
      },
    });

    // Hand over from the scripted reveal to the player's own hands. The keyframed turn
    // has ended on rotateY(-180deg), and .live.showing is that exact pose expressed as a
    // transition instead, so swapping one for the other does not move the card a pixel.
    at(dealtBy + FLIP_MS, () => {
      mySeat.classList.add('live', 'showing');
      table.classList.remove('flipped');
      armed = true;
    });

    // And then it goes back down, because a card left face up is a card everyone reads.
    at(dealtBy + FLIP_MS + peekMs, () => {
      if (gestures.isShowing()) return;      // they are looking at it right now
      mySeat.classList.remove('showing');
      memes.cardTurn();
      status.textContent = holdHint;
    });
  }

  at(dealtBy + FLIP_MS + 240, () => onDone?.());

  table.addEventListener('gn:teardown', () => {
    timers.forEach(clearTimeout);
    ro?.disconnect();
  });
  return table;
}

/**
 * Let the player draw from the stock. The deck lights up with the same pulse your own card
 * uses, so "you may touch this" always looks the same wherever it appears on the table.
 *
 * @param {HTMLElement} table   the element cardTable returned
 * @param {boolean} on
 * @param {() => void} [onPick] called when the deck is clicked while lit
 */
/** How many cards are already in the middle, so the next one lands clear of them. */
function pileCount(table) {
  return Number(table.dataset.pile || 0);
}

/**
 * Play someone else's card into the middle: the same throw the viewer's own card makes,
 * so a round looks the same whoever played it.
 *
 * @param {HTMLElement} table
 * @param {string} id     whose card to play
 * @param {string} [face] what it turns out to be; omit to leave it face down
 * @returns {Promise<void>} resolves once it has landed
 */
export function playToCentre(table, id, face) {
  const chair = table?.querySelector(`.ct-who[data-id="${CSS.escape(id)}"]`);
  const seats = [...(table?.querySelectorAll('.ct-seat') || [])];
  const i = [...(table?.querySelectorAll('.ct-who') || [])].indexOf(chair);
  const seat = seats[i];
  const cardEl = seat?.querySelector('.ct-card');
  if (!cardEl || seat.classList.contains('played')) return Promise.resolve();

  if (face != null) {
    const front = cardEl.querySelector('.ct-face.front');
    if (front) front.textContent = face;
  }
  const n = pileCount(table);
  table.dataset.pile = String(n + 1);
  const to = pileTarget(table, cardEl, n);
  seat.classList.add('played');
  setTimeout(() => seat.classList.add('face-up'), 190);
  return flingCard(cardEl, { ...to, faceUp: face != null });
}

/**
 * What the parked stock says under it — the game's own wording, and its count if it keeps
 * one. Games that deal a fixed round can leave it alone.
 *
 * @param {HTMLElement} table
 * @param {string} text
 */
export function setDeckLabel(table, text) {
  const el = table?.querySelector('.ct-stock');
  if (el) el.textContent = text;
}

export function setDeckPickable(table, on, onPick) {
  const deck = table?.querySelector('.ct-deck');
  if (!deck) return;
  deck.classList.toggle('pickable', Boolean(on));
  deck.onclick = on && onPick ? () => { memes.cardFlick(); onPick(); } : null;
}

/**
 * Point at whoever is to act. The arrow sits outside their chair so it never covers a card,
 * and the player it belongs to gets it too: everyone sees the same pointer over the same
 * person, and the one whose turn it is sees it over themselves.
 *
 * @param {HTMLElement} table  the element cardTable returned
 * @param {string|null} id     the player to act, or null for nobody
 */
export function setTurn(table, id) {
  for (const chair of table?.querySelectorAll('.ct-who') || []) {
    chair.classList.toggle('turn', Boolean(id) && chair.dataset.id === id);
  }
}

/** How long the whole sequence takes, so a caller can schedule what comes next. */
export function cardTableDuration(seatCount, flips = true) {
  if (reduced()) return 0;
  return SHUFFLE_MS + seatCount * DEAL_STEP_MS + 200 + (flips ? FLIP_MS + 240 : 240);
}

/**
 * Give a face-down card the two gestures a person uses on a real card, sharing one press
 * so they never fight each other: hold it still and it turns over while you look, move it
 * and it becomes a card you are throwing.
 *
 * Which gesture you meant is decided by distance, not by a timer: past DRAG_SLOP the press
 * stops being a peek and becomes a drag, and a peek already under way is put back down.
 * That is the same rule a phone uses to tell a tap from a scroll, and it means the player
 * never has to know there were two gestures.
 *
 * @param {HTMLElement} host   the element that owns the .showing / .dragging classes
 * @param {HTMLElement} cardEl the card being moved
 * @param {object} opts
 * @param {() => boolean} opts.live      whether the gestures are armed yet
 * @param {(seen:boolean) => void} [opts.onPeek]
 * @param {() => void} [opts.onThrow]    omit to make the card un-throwable
 * @param {() => void} [opts.onTurn]     called on every turn, for the caption
 * @param {(state:'lift'|'keep'|'throw'|null) => void} [opts.onDrag]  what a release would
 *        do right now, so the caller can say so before the player commits to it
 */
function wireCardGestures(host, cardEl, {
  live, grip, onPeek, onThrow, onTurn, onDrag,
} = {}) {
  const DRAG_SLOP = 22;        // px before a press stops being a peek
  const THROW_AT = 78;         // px of travel that commits the throw
  let showing = false;
  let start = null;
  let dragging = false;

  const show = (on) => {
    if (on === showing || !live()) return;
    showing = on;
    host.classList.toggle('showing', on);
    if (!reduced()) memes.cardTurn();
    onTurn?.(on);
    onPeek?.(on);
  };

  const endDrag = (commit) => {
    if (!dragging) return;
    dragging = false;
    host.classList.remove('dragging');
    if (commit && onThrow) {
      // The hand lets go and stays behind while the card goes on without it.
      if (grip) {
        grip.style.transform = '';
        grip.animate([
          { transform: 'translate(0, -20px) rotate(-6deg)', opacity: 1 },
          { transform: 'translate(0, -54px) rotate(-14deg)', opacity: 0 },
        ], { duration: 320, easing: 'cubic-bezier(0.3, 0.8, 0.3, 1)', fill: 'both' });
      }
      onThrow();
    } else {
      cardEl.style.transform = '';
      if (grip) grip.style.transform = '';
      memes.cardSlap();
    }
  };

  host.addEventListener('pointerdown', (e) => {
    if (!live()) return;
    e.preventDefault();
    start = { x: e.clientX, y: e.clientY, id: e.pointerId };
    try { host.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    show(true);
  });

  host.addEventListener('pointermove', (e) => {
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (!dragging && Math.hypot(dx, dy) > DRAG_SLOP) {
      if (!onThrow) return;              // nothing to drag it into
      dragging = true;
      show(false);                       // a card in motion goes face down
      host.classList.add('dragging');
    }
    if (dragging) {
      const lift = Math.min(1, Math.hypot(dx, dy) / THROW_AT);
      const move = `translate(${dx}px, ${dy}px) rotate(${(dx * 0.08).toFixed(1)}deg)`;
      cardEl.style.transform = `${move} scale(${(1 + lift * 0.1).toFixed(3)})`;
      const throwing = -dy > THROW_AT;
      host.classList.toggle('armed', throwing);
      onDrag?.(throwing ? 'throw' : 'keep');
    }
  });

  const release = (e) => {
    if (!start) return;
    const dy = (e?.clientY ?? 0) - start.y;
    const committed = dragging && -dy > THROW_AT;
    host.classList.remove('armed');
    endDrag(committed);
    show(false);
    onDrag?.(null);
    start = null;
  };
  ['pointerup', 'pointercancel'].forEach((ev) => host.addEventListener(ev, release));
  // A pointer released off the card still has to put it down.
  addEventListener('pointerup', (e) => { if (start) release(e); });

  // Keyboard: hold space or enter to look, which is the peek without the drag.
  host.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); show(true); }
  });
  host.addEventListener('keyup', () => show(false));
  host.addEventListener('blur', () => show(false));

  return { isShowing: () => showing };
}

/**
 * A standalone card that behaves the same way, for a game that wants one card on its own
 * rather than a whole table: a role card, or a card held between rounds.
 *
 * @param {object} opts
 * @param {string} opts.face          what is on the card
 * @param {string} [opts.hidden]      an extra mark on the back, if the game wants one
 * @param {string} [opts.hint]        caption under the card
 * @param {(seen:boolean) => void} [opts.onPeek]
 */
export function peekCard({ face, hidden = '', hint = 'Hold to look', onPeek } = {}) {
  const inner = h('div', { class: 'ct-card' },
    h('div', { class: 'ct-face front' }, face),
    h('div', { class: 'ct-face back' }, hidden ? h('span', { class: 'pk-mark' }, hidden) : null),
  );
  const label = h('span', { class: 'pk-hint' }, hint);

  const btn = h('button', {
    class: 'peek-card live', type: 'button',
    'aria-label': `${hint}. Your card.`,
  }, h('div', { class: 'ct-slot' }, inner), label);

  wireCardGestures(btn, inner, {
    live: () => true,
    onPeek,
    onTurn: (on) => { label.textContent = on ? face : hint; },
  });

  return btn;
}

/**
 * Throw a card onto the table: it leaves along an arc with some spin on it and slaps
 * down where it lands. Resolves once it has landed, so a caller can wait before redrawing.
 *
 * @param {HTMLElement} el   the card element to throw
 * @param {{dx?:number, dy?:number, spin?:number, ms?:number}} [to]
 */
export function flingCard(el, {
  dx = 0, dy = -150, spin = -22, ms = 560, scale = 0.86, faceUp = false,
} = {}) {
  const from = el.style.transform || 'translate(0px, 0px) rotate(0deg) scale(1)';
  // Turning over on the way is what playing a card looks like: it leaves your hand face
  // down and lands face up, and the turn happens in the air rather than on the felt.
  const turn = faceUp ? ' rotateY(180deg)' : '';
  const final = `translate(${dx.toFixed(0)}px, ${dy.toFixed(0)}px)`
    + ` rotate(${spin.toFixed(1)}deg) scale(${scale.toFixed(3)})${turn}`;
  // The resting place is committed before the animation is asked for, not after it
  // finishes. An animation can be cut short, or never run at all, and where a played card
  // ends up is not something that may depend on whether its animation completed.
  el.style.transform = final;

  if (reduced() || !el?.animate) { memes.cardSlap(); return Promise.resolve(); }
  memes.cardFlick();
  const anim = el.animate([
    { offset: 0, transform: from },
    {
      offset: 0.36,
      transform: `translate(${(dx * 0.36).toFixed(0)}px, ${(dy * 0.36 - 24).toFixed(0)}px)`
        + ` rotate(${(spin * 0.45).toFixed(1)}deg) scale(${(scale + (1 - scale) * 0.8).toFixed(3)})`
        + (faceUp ? ' rotateY(80deg)' : ''),
      easing: 'cubic-bezier(0.25, 0.9, 0.35, 1)',
    },
    { offset: 1, transform: final },
  ], { duration: ms, easing: 'cubic-bezier(0.3, 0.7, 0.3, 1)' });
  void anim;

  // Resolved on a timer rather than on the animation. An animation only advances while the
  // page is being painted, so awaiting anim.finished in a backgrounded tab never returns —
  // and a game that waits for a card to land before dealing the next one would stop dead.
  // The card's resting transform is already committed above, so the timer is only pacing.
  return new Promise((done) => setTimeout(() => { memes.cardSlap(); done(); }, ms));
}
