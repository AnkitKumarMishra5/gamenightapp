// Sleepless screen rendering. Receives the personalized room snapshot and a ctx with
// { emit, me, isHost, player(id) } from main.js.
//
// The whole screen is rebuilt on every snapshot, so everything that must happen exactly
// once — the card table choreography, the nightfall sound, the dawn reveal — is driven by
// snapshot fields compared against module-level "last seen" markers rather than by fx
// events. Markers key off dealId + round, so they survive other players' updates and a
// replay in the same room starts clean.
import { h, shake, animOnce, waitingFor, openModal, closeModal } from '../../core/ui.js';
import { cardTable, peekCard } from '../../core/cards.js';
import { playMeme } from '../../core/memes.js';
import { confettiRain } from '../../core/fx.js';

const ROLES = {
  prowler: {
    emoji: '🐾', word: 'Prowler',
    prompt: 'Choose who to visit.',
    blurb: 'Each night you visit someone, and they will not wake up. On big tables you hunt as a pack. Stay calm by day. Vote like everyone else.',
  },
  medic: {
    emoji: '🩺', word: 'Medic',
    prompt: 'Choose who to guard.',
    blurb: 'Each night you guard one door — yours counts too. If the Prowler comes knocking there, nobody dies.',
  },
  oracle: {
    emoji: '🔮', word: 'Oracle',
    prompt: 'Choose who to read.',
    blurb: 'Each night you read one player and learn, privately, whether they are the Prowler.',
  },
  sleeper: {
    emoji: '😴', word: 'Sleeper',
    prompt: 'Keep watch: whose door do you watch tonight?',
    blurb: 'Your weapon is where you point your eyes. Watch the door that gets attacked and you witness the scuffle — you privately learn someone who is NOT a Prowler. Watch a Prowler\'s door and their empty bed banks you an Instinct point, revealed only at the very end.',
  },
};

// ---------- module state ----------

// The card table is a long choreography and must never be rebuilt mid-deal. It is cached
// here and returned by reference while the deal key is unchanged; main.js skips replacing
// an identical root node, so the animation runs untouched. Status and the ready button
// are updated imperatively through the saved refs in mount.api.
let mount = { key: null, node: null, api: {} };

// One-shot markers for sounds and confetti, compared against snapshot fields.
const seen = { night: null, dawn: null, verdict: null, over: null, round: null };

// Local-only UI state: nothing here is committed until the server hears about it.
let pendingVote = null;      // picked but not yet confirmed (two-step, like Blend In)
let repicking = false;       // "change my night pick" is open
let revoting = false;        // "change my vote" is open

function roundKey(sl) { return `${sl.dealId}:${sl.round}`; }

// A new round (or a new deal) invalidates every choice the player was mid-way through.
function resetRoundState(sl) {
  if (seen.round === roundKey(sl)) return;
  seen.round = roundKey(sl);
  pendingVote = null;
  repicking = false;
  revoting = false;
}

// ---------- entry ----------

// The table holds pending timers and a ResizeObserver until its gn:teardown fires, so
// the cached node must be told its job is over before the cache lets go of it.
function dropMount() {
  mount.api?.table?.dispatchEvent(new Event('gn:teardown'));
  mount = { key: null, node: null, api: {} };
}

export function renderSleepless(snap, ctx) {
  const sl = snap.sleepless;
  if (sl.phase === 'dealing') return dealingPhase(sl, ctx);
  dropMount();                                  // the table's job is done for this deal
  resetRoundState(sl);
  playPhaseCues(sl);

  const parts = [hud(sl, ctx)];
  switch (sl.phase) {
    case 'night': parts.push(nightPhase(sl, ctx)); break;
    case 'day': parts.push(dawnBanner(sl, ctx), oracleNote(sl, ctx), voteBoard(sl, ctx)); break;
    case 'verdict': parts.push(verdictPhase(sl, ctx)); break;
    case 'gameOver': parts.push(gameOver(sl, ctx)); break;
  }

  const night = sl.phase === 'night';
  const prowlerWon = sl.phase === 'gameOver' && sl.winner?.side === 'prowler';
  return h('div', { class: `stack sl-wrap ${night ? 'sl-is-night' : ''}` },
    night && nightSky(sl),
    sl.phase === 'day' && h('div', {
      class: `sl-dawnfx ${animOnce(`sl-dawnfx:${sl.dealId}:${sl.dawn?.seq}`, 'sl-sweep')}`, 'aria-hidden': 'true',
    }),
    prowlerWon && h('div', { class: `sl-redveil ${animOnce(`sl-redveil:${sl.dealId}`, 'sl-veil-in')}`, 'aria-hidden': 'true' }),
    parts,
  );
}

// ---------- one-shot sound cues ----------

function playPhaseCues(sl) {
  if (sl.phase === 'night' && seen.night !== roundKey(sl)) {
    seen.night = roundKey(sl);
    playMeme('nightfall');
    setTimeout(() => playMeme('crickets'), 2400);
  }
  // The night tightens as the last picks land: one heartbeat at three-quarters asleep,
  // so the room can feel the dawn coming before it breaks.
  if (sl.phase === 'night' && sl.submittedTotal > 2) {
    const tense = sl.submitted / sl.submittedTotal >= 0.75;
    const key = `${sl.dealId}:${sl.round}`;
    if (tense && seen.tense !== key) { seen.tense = key; playMeme('heartbeat'); }
  }
  if (sl.phase === 'day' && sl.dawn && seen.dawn !== `${sl.dealId}:${sl.dawn.seq}`) {
    seen.dawn = `${sl.dealId}:${sl.dawn.seq}`;
    playMeme('serious');
    if (sl.dawn.kind === 'death') {
      // A death morning sounds like one: the bell tolls, the room gasps, the news lands.
      setTimeout(() => playMeme('bellToll'), 500);
      setTimeout(() => playMeme('gasp'), 1400);
      setTimeout(() => playMeme('boom'), 2300);
    } else {
      // A safe morning sounds like a farmyard: the rooster gets there before the relief.
      setTimeout(() => playMeme('rooster'), 600);
      setTimeout(() => playMeme('aww'), 1500);
    }
  }
  if (sl.phase === 'verdict' && seen.verdict !== roundKey(sl)) {
    seen.verdict = roundKey(sl);
    if (sl.verdict?.outId) {
      playMeme('drumroll');
      setTimeout(() => playMeme('boom'), 1400);
    } else {
      playMeme('crickets');
    }
  }
  if (sl.phase === 'gameOver' && seen.over !== sl.dealId) {
    seen.over = sl.dealId;
    if (sl.winner?.side === 'village') {
      playMeme('winInsiders');
      setTimeout(() => playMeme('dhol'), 500);
      confettiRain(2600);
    } else {
      playMeme('winOutsiders');
      setTimeout(() => playMeme('evilLaugh'), 1200);
    }
  }
}

// ---------- shared pieces ----------

function hud(sl, ctx) {
  const phasePill = {
    night: `🌙 Night ${sl.round}`,
    day: `🌅 Day ${sl.round}`,
    verdict: `⚖️ Day ${sl.round}`,
    gameOver: '🏁 Game over',
  }[sl.phase] || '';
  const awake = sl.players.filter((p) => p.alive).length;
  const me = sl.you;
  return h('div', { class: 'sl-hud' },
    h('span', { class: 'sl-pill' }, phasePill),
    // The chip itself stays role-neutral — the emoji would out the holder to anyone
    // glancing at their screen. The modal behind it keeps the hold-to-peek.
    me && h('button', {
      class: 'sl-pill sl-rolechip', title: 'Peek your role',
      onClick: () => openRoleModal(sl, ctx),
    }, '🌘 your role'),
    h('span', { class: 'sl-pill' }, `❤️ ${awake} awake`),
    me && !me.alive && h('span', { class: 'sl-pill sl-dead-pill' }, '💀 spectating'),
  );
}

function openRoleModal(sl, ctx) {
  const r = ROLES[sl.you.role];
  openModal(h('div', { class: 'sl-role-modal' },
    h('div', { class: 'modal-title' }, '🤫 Between you and the night'),
    peekCard({ face: r.emoji, hint: 'Hold to look' }),
    h('p', { class: 'sl-role-word' }, `You are the ${r.word}`),
    h('p', { class: 'hint', style: 'text-align:center' }, r.blurb),
    oracleMemo(sl, ctx),
    witnessMemo(sl, ctx),
    h('button', { class: 'btn btn-ghost btn-block', style: 'margin-top:12px', onClick: closeModal }, 'Tuck it away'),
  ));
}

// The Oracle's latest reading, kept behind the same private door as the role itself,
// so it can be checked again any time after the dawn card has scrolled away.
// What the watcher saw, pinned like the Oracle's reading: private, quiet, and exactly
// the kind of thing a day argument is built from.
function witnessMemo(sl, ctx) {
  if (!sl.witness) return null;
  const cleared = ctx.player(sl.witness.clearedId);
  return h('p', { class: 'sl-oracle-memo' },
    `🕯️ Night ${sl.witness.round}: you were watching that door. In the scuffle you saw `,
    h('b', {}, cleared.name), ' slip back into bed — they are NOT a Prowler.');
}

function oracleMemo(sl, ctx) {
  if (!sl.oracle) return null;
  const target = ctx.player(sl.oracle.targetId);
  return h('p', { class: 'sl-oracle-memo' },
    `🔮 Night ${sl.oracle.round}: `, h('b', {}, target.name),
    ` ${sl.oracle.isProwler ? 'is' : 'is not'} the Prowler 🐾`);
}

// The one player grid every phase shares. At night everyone sees the same grid doing the
// same thing, whatever their role, so screen time betrays nobody.
function grid(sl, ctx, { selectable = null, selected = null, onSelect = null, skipTile = false } = {}) {
  const tiles = sl.players.map((p, i) => {
    const info = ctx.player(p.id);
    const canSelect = selectable?.includes(p.id);
    return h('div', {
      class: [
        'player-tile', animOnce(`sl-tile:${sl.dealId}:${p.id}`),
        !p.connected && !p.left && 'offline',
        !p.alive && 'dead',
        p.id === ctx.me.id && 'you',
        canSelect && 'selectable',
        selected === p.id && 'vote-selected',
      ].filter(Boolean).join(' '),
      style: `animation-delay:${i * 40}ms`,
      onClick: canSelect ? () => onSelect(p.id) : undefined,
    },
      info.isHost && h('span', { class: 'crown' }, '👑'),
      h('div', { class: 'pt-avatar' }, p.alive ? info.avatar : (p.left ? '🚪' : '💀')),
      h('div', { class: 'pt-name' }, info.name, p.id === ctx.me.id && h('span', { class: 'pt-you' }, ' (you)')),
      h('div', { class: 'pt-sub' },
        p.left ? 'left the game'
          : !p.alive ? 'sleeping forever'
          : !p.connected ? h('span', { class: 'pt-offline' }, '⚡ disconnected')
          : ''),
    );
  });
  if (skipTile) {
    tiles.push(h('div', {
      class: `player-tile sl-skip-tile selectable ${selected === 'skip' ? 'vote-selected' : ''}`,
      onClick: () => onSelect('skip'),
    },
      h('div', { class: 'pt-avatar' }, '🤷'),
      h('div', { class: 'pt-name' }, 'Skip'),
      h('div', { class: 'pt-sub' }, 'nobody today'),
    ));
  }
  return h('div', { class: 'players-grid sl-grid' }, tiles);
}

// ---------- dealing ----------

function dealingPhase(sl, ctx) {
  const key = `deal:${sl.dealId}`;
  if (mount.key === key && mount.node) {
    updateDealing(sl);
    return mount.node;
  }
  dropMount();   // a stale table from another deal may still be holding timers

  const role = sl.you ? ROLES[sl.you.role] : null;
  const seats = sl.players.map((p) => {
    const info = ctx.player(p.id);
    return { id: p.id, name: info.name, avatar: info.avatar };
  });

  const api = { done: false, sl };
  const table = cardTable({
    seats,
    myId: ctx.me.id,
    myFace: role ? role.emoji : null,
    myLabel: role ? `You are the ${role.word}` : 'You joined mid-game',
    caption: sl.startQuip || 'Shuffling the roles…',
    peekMs: 6000,
    holdHint: 'Hold to check your role',
    deckName: 'Roles',
    onDone: () => { api.done = true; updateDealing(api.sl); },
  });

  const readyBtn = h('button', {
    class: 'btn sl-btn btn-lg btn-block',
    disabled: true,
    onClick: async (e) => {
      const btn = e.currentTarget;   // currentTarget is gone after the await
      const res = await ctx.emit('sl:ready');
      if (!res.ok) shake(btn);
    },
  }, 'Dealing…');
  const note = h('p', { class: 'hint sl-deal-note' },
    sl.you
      ? `One ${ROLES.prowler.emoji} Prowler walks tonight. One ${ROLES.medic.emoji} Medic and one ${ROLES.oracle.emoji} Oracle stand watch. Tell no one what you hold.`
      : 'The roles are already out — you\'ll join the next game.');

  mount = {
    key,
    api: Object.assign(api, { readyBtn, table }),
    node: h('div', { class: 'stack sl-wrap sl-deal' },
      table,
      h('div', { class: 'card sl-deal-card' }, note, sl.you ? readyBtn : null),
    ),
  };
  updateDealing(sl);
  return mount.node;
}

// Called on every snapshot while dealing, and once by the table's own onDone. It touches
// only text and disabled state, never the table, so the choreography is never disturbed.
function updateDealing(sl) {
  mount.api.sl = sl;
  const btn = mount.api.readyBtn;
  if (!btn) return;
  // The server starts the night when every alive CONNECTED player is ready, so the
  // denominator counts the same set — the label completes instead of jumping mid-count.
  const total = sl.players.filter((p) => p.alive && p.connected).length;
  if (sl.youReady) {
    btn.disabled = true;
    btn.textContent = `Waiting for the table… (${sl.readyCount}/${total})`;
  } else if (mount.api.done) {
    btn.disabled = false;
    btn.textContent = '🌙 I know my part';
  }
}

// ---------- night ----------

// The starfield is deterministic — positions come from the index, not Math.random — so a
// re-render mid-night redraws every star exactly where it was instead of reshuffling the
// sky each time someone settles in.
function nightSky(sl) {
  const stars = Array.from({ length: 16 }, (_, i) => h('span', {
    class: 'sl-star',
    style: `left:${(i * 37 + 11) % 100}%; top:${(i * 53 + 7) % 52}%; animation-delay:${(i % 5) * 0.7}s;`,
  }));
  return h('div', { class: 'sl-nightfx', 'aria-hidden': 'true' },
    h('div', { class: `sl-sky ${animOnce(`sl-moon:${roundKey(sl)}`, 'sl-moonrise')}` },
      stars,
      h('span', { class: 'sl-moon' }),
    ),
  );
}

function nightPhase(sl, ctx) {
  const me = sl.you;
  if (!me) {
    return h('div', { class: 'card sl-night-card' },
      h('p', { class: 'hint', style: 'text-align:center' }, 'The village sleeps. You\'ll join the next game.'));
  }
  if (!me.alive) {
    return h('div', { class: 'card sl-night-card' },
      h('h2', { class: 'subtitle', style: 'text-align:center' }, '🌙 The village sleeps'),
      h('p', { class: 'hint', style: 'text-align:center; margin-top:8px' },
        `You watch from somewhere quiet. ${sl.submitted}/${sl.submittedTotal} asleep.`),
      sleepDots(),
    );
  }

  if (me.alive && sl.youSubmitted && !repicking) {
    return h('div', { class: 'card sl-night-card' },
      h('h2', { class: 'subtitle', style: 'text-align:center' }, `You settle in… ${sl.submitted}/${sl.submittedTotal} asleep`),
      sleepDots(),
      h('button', {
        class: 'btn btn-ghost btn-sm btn-block', style: 'margin-top:12px',
        onClick: () => { repicking = true; ctx.sound.tap(); ctx.rerender(); },
      }, 'Change your pick'),
    );
  }

  const role = ROLES[me.role];
  // Everyone picks from the same grid. The Medic may pick their own door; nobody else may.
  const selectable = sl.players
    .filter((p) => p.alive && (me.role === 'medic' || p.id !== ctx.me.id))
    .map((p) => p.id);

  // On a big table the pack hunts together; each Prowler quietly sees who else is out
  // tonight. Nobody else's screen carries this line, so its presence is itself a secret.
  const allies = sl.you?.role === 'prowler' ? (sl.you.allies || []) : [];
  return h('div', { class: 'card sl-night-card' },
    h('h2', { class: 'subtitle', style: 'text-align:center' }, `🌙 ${role.prompt}`),
    allies.length > 0 && h('p', { class: 'hint sl-allies', style: 'text-align:center; margin:2px 0 0; color:var(--amber)' },
      `🐾 Hunting with ${allies.map((id) => ctx.player(id).name).join(' and ')}. The most-named door falls.`),
    h('p', { class: 'hint', style: 'text-align:center; margin:6px 0 12px' },
      `Everyone chooses someone tonight. ${sl.submitted}/${sl.submittedTotal} asleep so far.`),
    grid(sl, ctx, {
      selectable,
      selected: sl.yourPick,
      onSelect: async (id) => {
        const res = await ctx.emit('sl:night', { targetId: id });
        if (res.ok) { repicking = false; ctx.sound.pop(); } else ctx.sound.tap();
      },
    }),
  );
}

function sleepDots() {
  return h('div', { class: 'sl-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'));
}

// ---------- day ----------

function dawnBanner(sl, ctx) {
  const d = sl.dawn;
  if (!d) return null;
  if (d.kind === 'death') {
    const p = ctx.player(d.victimId);
    const r = ROLES[d.role];
    return h('div', { class: `card sl-dawn-card ${animOnce(`sl-dawncard:${sl.dealId}:${d.seq}`, 'sl-rise')}` },
      h('div', { class: 'sl-dawn-head' }, '🌅 Dawn'),
      h('div', { class: `sl-flip ${animOnce(`sl-dawnflip:${sl.dealId}:${d.seq}`, 'sl-flipping')}` },
        h('div', { class: 'sl-flip-face sl-flip-front' }, p.avatar),
        h('div', { class: 'sl-flip-face sl-flip-back' }, r.emoji),
      ),
      h('p', { class: 'sl-dawn-line' },
        h('b', {}, p.name), ` did not wake up — they were the ${r.word} ${r.emoji}`),
    );
  }
  return h('div', { class: `card sl-dawn-card ${animOnce(`sl-dawncard:${sl.dealId}:${d.seq}`, 'sl-rise')}` },
    h('div', { class: 'sl-dawn-head' }, '🌅 Dawn'),
    h('div', { class: 'sl-saved-mark' }, '🛡️'),
    h('p', { class: 'sl-dawn-line' }, 'Everyone woke up. Someone was attacked in the night — and survived.'),
  );
}

// What the Oracle learned overnight. The snapshot only carries sl.oracle to the Oracle
// themself, so this card simply never exists on anyone else's screen.
function oracleNote(sl, ctx) {
  if (!sl.oracle || sl.oracle.round !== sl.round) return null;
  const target = ctx.player(sl.oracle.targetId);
  return h('div', { class: `card sl-oracle-note ${animOnce(`sl-oracle:${sl.dealId}:${sl.oracle.round}`, 'sl-rise')}` },
    h('div', { class: 'sl-dawn-head sl-oracle-head' }, '🔮 Your reading'),
    h('p', { class: 'sl-dawn-line' },
      'You read ', h('b', {}, `${target.avatar} ${target.name}`),
      `: they ${sl.oracle.isProwler ? 'are' : 'are not'} the Prowler 🐾`),
    h('p', { class: 'sl-confirm-warn' }, 'Only you can see this.'),
  );
}

function voteBoard(sl, ctx) {
  const me = sl.you;
  const alive = me?.alive;
  const canVote = alive && (!sl.youVoted || revoting);

  // Anything picked but no longer pickable is dropped, so a stale confirm can never fire.
  if (!canVote) pendingVote = null;
  const selectable = canVote
    ? [...sl.players.filter((p) => p.alive && p.id !== ctx.me.id).map((p) => p.id), 'skip']
    : null;
  if (pendingVote && !selectable?.includes(pendingVote)) pendingVote = null;

  const target = pendingVote && pendingVote !== 'skip' ? ctx.player(pendingVote) : null;
  const pct = sl.votersTotal ? Math.round((sl.voteCount / sl.votersTotal) * 100) : 0;

  return h('div', { class: 'card' },
    h('h2', { class: 'subtitle', style: 'text-align:center' }, '🗳️ Who doesn\'t sleep at night?'),
    h('p', { class: 'hint', style: 'text-align:center; margin:6px 0 14px' },
      !alive ? 'You\'re spectating this vote.'
        : sl.youVoted && !revoting ? `Vote locked in ✅ (${sl.voteCount}/${sl.votersTotal})`
        : pendingVote ? 'Confirm below, or pick someone else.'
        : 'Tap a player, or Skip. Votes stay sealed until everyone has cast one.'),
    grid(sl, ctx, {
      selectable,
      selected: pendingVote,
      skipTile: Boolean(canVote),
      onSelect: (id) => {
        // First tap only picks. Nothing reaches the server until it is confirmed — and
        // the heartbeat under the confirm box says exactly how reversible this isn't.
        pendingVote = pendingVote === id ? null : id;
        if (pendingVote) playMeme('heartbeat'); else ctx.sound.tap();
        ctx.rerender();
      },
    }),
    pendingVote && h('div', { class: 'sl-confirm' },
      h('p', { class: 'sl-confirm-ask' },
        pendingVote === 'skip' ? 'Vote to skip today?' : ['Vote out ', h('b', {}, `${target.avatar} ${target.name}`), '?']),
      h('p', { class: 'sl-confirm-warn' }, 'Everyone will see who you voted for once all votes are in.'),
      h('div', { class: 'sl-confirm-actions' },
        h('button', {
          class: 'btn btn-ghost',
          onClick: () => { pendingVote = null; ctx.sound.tap(); ctx.rerender(); },
        }, 'Cancel'),
        h('button', {
          class: 'btn sl-btn btn-lg',
          onClick: async (e) => {
            const id = pendingVote;
            const btn = e.currentTarget;   // currentTarget is gone after the await
            btn.disabled = true;
            const res = await ctx.emit('sl:vote', { targetId: id });
            if (res.ok) { pendingVote = null; revoting = false; ctx.sound.pop(); }
            else { btn.disabled = false; shake(btn); }
          },
        }, '🗳️ Lock it in'),
      ),
    ),
    alive && sl.youVoted && !revoting && h('button', {
      class: 'btn btn-ghost btn-sm btn-block', style: 'margin-top:10px',
      onClick: () => { revoting = true; ctx.sound.tap(); ctx.rerender(); },
    }, 'Change your vote'),
    h('div', { class: 'sl-progress' }, h('div', { class: 'sl-progress-fill', style: `width:${pct}%` })),
    h('p', { class: 'hint', style: 'text-align:center; margin-top:8px' }, `${sl.voteCount} of ${sl.votersTotal} votes are in`),
  );
}

// ---------- verdict ----------

function verdictPhase(sl, ctx) {
  const v = sl.verdict;
  const out = v?.outId ? ctx.player(v.outId) : null;
  const role = v?.role ? ROLES[v.role] : null;

  const headline = out
    ? h('div', { class: `sl-verdict-hero ${animOnce(`sl-verdict:${roundKey(sl)}`, 'sl-rise')}` },
        h('div', { class: `sl-flip ${animOnce(`sl-verdictflip:${roundKey(sl)}`, 'sl-flipping')}` },
          h('div', { class: 'sl-flip-face sl-flip-front' }, out.avatar),
          h('div', { class: 'sl-flip-face sl-flip-back' }, role.emoji),
        ),
        h('p', { class: 'sl-dawn-line' },
          h('b', {}, out.name), ` was sent to bed early — they were the ${role.word} ${role.emoji}`),
      )
    : h('div', { class: `sl-verdict-hero ${animOnce(`sl-verdict:${roundKey(sl)}`, 'sl-rise')}` },
        h('div', { class: 'sl-saved-mark' }, '🤝'),
        h('p', { class: 'sl-dawn-line' }, 'The village couldn\'t agree. Nobody was sent home.'),
      );

  return h('div', { class: 'card' },
    h('h2', { class: 'subtitle', style: 'text-align:center' }, '⚖️ The votes are in'),
    headline,
    voteRevealList(sl, ctx),
    ctx.isHost
      ? h('button', {
          class: 'btn sl-btn btn-lg btn-block', style: 'margin-top:14px',
          onClick: () => ctx.emit('sl:next'),
        }, `🌙 Night ${sl.round + 1} falls`)
      : waitingFor(ctx.player(ctx.hostId)?.name, 'sends the village back to bed.'),
  );
}

// Who pointed at whom, out in the open. This list is the argument the next night feeds on.
function voteRevealList(sl, ctx) {
  if (!sl.votes) return null;
  const rows = Object.entries(sl.votes).map(([voterId, targetId], i) => {
    const voter = ctx.player(voterId);
    const target = targetId === 'skip' ? null : ctx.player(targetId);
    return h('div', {
      class: `sl-vote-row ${animOnce(`sl-voterow:${roundKey(sl)}:${voterId}`, 'anim-slide')}`,
      style: `animation-delay:${i * 50}ms`,
    },
      h('span', { class: 'sl-vr-who' }, `${voter.avatar} ${voter.name}`),
      h('span', { class: 'sl-vr-arrow' }, '→'),
      h('span', { class: 'sl-vr-target' }, target ? `${target.avatar} ${target.name}` : '🤷 skipped'),
    );
  });
  return h('div', { class: 'sl-vote-reveal' }, rows);
}

// ---------- game over ----------

function gameOver(sl, ctx) {
  const villageWon = sl.winner?.side === 'village';
  const myRole = sl.winner?.roles?.[ctx.me.id];
  const iWon = myRole && (villageWon ? myRole !== 'prowler' : myRole === 'prowler');

  return h('div', { class: 'card win-screen sl-over' },
    h('span', { class: 'ws-emoji' }, villageWon ? '🌅' : '🐾'),
    h('h2', { class: villageWon ? '' : 'gradient-text' },
      villageWon ? 'The village wins!' : 'The Prowler wins!'),
    h('p', { class: 'ws-reason' },
      villageWon
        ? 'The Prowler is out. Everyone finally gets some sleep.'
        : 'Too few left standing. The nights belong to the Prowler now.'),
    h('p', { class: 'ws-reason', style: 'font-weight:700' }, sl.endQuip),
    myRole && h('p', { style: 'margin-top:10px; font-size:15px' },
      `You were the ${ROLES[myRole].emoji} ${ROLES[myRole].word}, ${iWon ? 'you won! 🎉' : 'better luck next night!'}`),
    h('div', { class: 'role-list' },
      sl.players.map((p, i) => {
        const info = ctx.player(p.id);
        const role = sl.winner?.roles?.[p.id];
        return h('div', {
          class: `role-line ${animOnce(`sl-role:${sl.dealId}:${p.id}`, 'anim-slide')}`,
          style: `animation-delay:${i * 50}ms`,
        },
          h('span', {}, info.avatar),
          h('span', { class: 'rl-name' }, info.name, p.left ? ' (left)' : (!p.alive ? ' 💀' : '')),
          role && h('span', { class: `sl-role-tag sl-role-${role}` }, `${ROLES[role].emoji} ${ROLES[role].word}`),
          // The one secret with no owner to protect any more: whose gut kept scoring.
          (sl.winner?.instinct?.[p.id] || 0) > 0 && h('span', { class: 'sl-instinct' },
            `🫀 gut ×${sl.winner.instinct[p.id]}`),
        );
      }),
    ),
    ctx.isHost
      ? h('div', { style: 'display:grid; gap:10px; margin-top:16px' },
          h('button', { class: 'btn sl-btn btn-lg', onClick: () => ctx.emit('sl:next') }, '🔁 Play again (new roles)'),
          h('button', { class: 'btn btn-ghost', onClick: () => ctx.emit('room:backToLobby') }, '🏠 Back to lobby'),
        )
      : waitingFor(ctx.player(ctx.hostId)?.name, 'decides whether to run it back or head to the lobby.'),
  );
}
