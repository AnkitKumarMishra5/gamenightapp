// Blend In screen rendering. Receives the personalized room snapshot and a ctx
// with { emit, me, isHost, player(id) } from main.js.
import { h, shake, animOnce, waitingFor, aiThinking, sceneHero, scoringDetails, endArt } from '../../core/ui.js';

const REACTIONS = ['😂', '🤔', '😱', '🧐', '🔥', '💀', '😭'];
// How long the reaction palette stays reachable after the pointer leaves it.
const REACTION_MENU_LINGER_MS = 2500;
// Which clue's palette is open, by clue id. Held outside the render because the whole
// board is rebuilt on every snapshot: without this, anyone else reacting or giving a clue
// re-created the element and the palette you were reaching for vanished.
const openDrawers = new Set();

const ROLE_LABEL = { insider: 'Insider', outsider: 'Outsider', blank: 'Blank' };
// Who the vote actually removed decides which reveal the room sees. Every role the
// dealer can assign has an entry, so there is no fallback to keep in step.
const OUT_ART = { insider: 'moments/out-insider', outsider: 'moments/out-outsider', blank: 'moments/out-blank' };
const ROLE_EMOJI = { insider: '😇', outsider: '🕵️', blank: '🃏' };

export function renderBlendIn(snap, ctx) {
  const bi = snap.blendin;
  const parts = [];

  // The words are dealt by the AI, which takes a beat. Everyone gets a screen for it
  // instead of the lobby freezing.
  if (bi.phase === 'dealing') return dealingPhase(bi);

  parts.push(statusStrip(bi, ctx));

  switch (bi.phase) {
    case 'reveal': parts.push(revealPhase(bi, ctx)); break;
    case 'describing': parts.push(playersStrip(bi, ctx), clueBoard(bi, ctx), describeBar(bi, ctx)); break;
    case 'discussion': parts.push(playersStrip(bi, ctx), clueBoard(bi, ctx), discussionBar(bi, ctx)); break;
    case 'voting':
    case 'runoff': parts.push(votePhase(bi, ctx), clueBoard(bi, ctx)); break;
    case 'blankGuess': parts.push(blankGuessPhase(bi, ctx), clueBoard(bi, ctx)); break;
    case 'roundResult': parts.push(roundResult(bi, ctx), clueBoard(bi, ctx)); break;
    case 'gameOver': parts.push(gameOver(bi, snap, ctx)); break;
  }

  if (bi.phase !== 'reveal' && bi.phase !== 'gameOver') parts.splice(1, 0, wordChipRow(bi, ctx));
  return h('div', { class: 'stack' }, parts);
}

// ---------- shared pieces ----------

const DIFFICULTY_EMOJI = { easy: '🌱', medium: '🎯', hard: '🔥', ultra: '💀' };

// A vote is the one irreversible move in the game, so it takes two taps: pick, then
// confirm. Held here rather than on the server because nothing is committed until the
// player says so. Cleared as soon as the vote lands or the phase moves on.
let pendingVote = null;

function dealingPhase(bi) {
  const level = bi.difficulty || 'medium';
  return h('div', { class: 'stack' },
    h('div', { class: 'card dealing-card' },
      aiThinking('Dealing tonight\'s words',
        `${DIFFICULTY_EMOJI[level] || '🎯'} ${level} difficulty. Nobody sees anything until every word is out.`,
        '🃏'),
    ),
  );
}

function statusStrip(bi, ctx) {
  const phaseLabel = {
    reveal: '👀 Check your word',
    describing: '💬 Describing',
    discussion: '🗣️ Discussion',
    voting: '🗳️ Voting',
    runoff: '⚖️ Tie-breaker vote',
    blankGuess: '🃏 The Blank is guessing…',
    roundResult: '📢 Round result',
    gameOver: '🏁 Game over',
  }[bi.phase] || bi.phase;
  const c = bi.config;
  return h('div', { class: 'status-strip' },
    h('div', { class: 'ss-label' }, `Round ${bi.round}`, h('span', { class: 'badge bi' }, phaseLabel)),
    h('div', { class: 'hint' }, `${c.insiders} 😇 · ${c.outsiders} 🕵️${c.blank ? ' · 1 🎩' : ''}`),
  );
}

function wordCard(bi, { flipped = false } = {}) {
  const isBlankRole = bi.you?.isBlank;
  const card = h('div', { class: `word-card ${flipped ? 'flipped' : ''}` },
    h('div', { class: 'word-face front' },
      h('div', { class: 'wf-logo' }, '🎭'),
      h('div', { class: 'wf-tip' }, 'Tap to reveal your secret'),
    ),
    h('div', { class: `word-face back ${isBlankRole ? 'blank' : ''}` },
      isBlankRole
        ? [
            h('div', { class: 'wf-label' }, 'You are'),
            h('div', { class: 'wf-word' }, '🃏 Blank'),
            h('div', { class: 'wf-sub' }, 'No word for you! Listen closely, blend in, survive.'),
          ]
        : [
            h('div', { class: 'wf-label' }, 'Your secret word'),
            h('div', { class: 'wf-word' }, bi.you?.word || '…'),
            h('div', { class: 'wf-sub' }, 'You might be an insider. You might be an outsider. 🤫'),
          ],
    ),
  );
  card.addEventListener('click', () => card.classList.toggle('flipped'));
  return h('div', { class: 'word-card-wrap' }, card);
}

function wordChipRow(bi, ctx) {
  if (!bi.you) return null;
  const dead = bi.you && !bi.you.alive;
  return h('div', { style: 'display:flex; justify-content:center; gap:8px; flex-wrap:wrap;' },
    h('button', {
      class: 'btn btn-ghost btn-sm',
      onClick: () => import('../../core/ui.js').then(({ openModal, closeModal }) => {
        const m = openModal(h('div', {},
          h('div', { class: 'modal-title' }, '🤫 Your secret'),
          wordCard(bi, { flipped: true }),
          h('button', { class: 'btn btn-ghost btn-block', style: 'margin-top:12px', onClick: closeModal }, 'Hide'),
        ));
      }),
    }, bi.you.isBlank ? '🃏 Peek your role' : '🂠 Peek your word'),
    dead && h('span', { class: 'badge warn', style: 'align-self:center' }, '💀 Eliminated, spectating'),
  );
}

function playersStrip(bi, ctx, { selectable = null, selected = null, onSelect = null } = {}) {
  const tiles = bi.order.map((id, i) => {
    const p = ctx.player(id);
    const alive = bi.alive.includes(id);
    const isTurn = bi.currentTurn === id;
    const elim = bi.eliminated.find((e) => e.playerId === id);
    const canSelect = selectable && selectable.includes(id);
    const hasVoted = (bi.votedIds || []).includes(id);
    const tile = h('div', {
      'data-pid': id,
      class: [
        'player-tile',
        animOnce(`bi-tile:${id}`),
        !p.connected && 'offline',
        !alive && 'dead',
        isTurn && 'current-turn',
        id === ctx.me.id && 'you',
        canSelect && 'selectable',
        selected === id && 'vote-selected',
      ].filter(Boolean).join(' '),
      style: `animation-delay: ${i * 40}ms`,
      onClick: canSelect ? () => onSelect(id) : undefined,
    },
      p.isHost && h('span', { class: 'crown' }, '👑'),
      elim && h('span', { class: 'pt-mark', title: ROLE_LABEL[elim.role] }, ROLE_EMOJI[elim.role]),
      h('div', { class: 'pt-avatar' }, alive ? p.avatar : '💀'),
      h('div', { class: 'pt-name' }, p.name, id === ctx.me.id && h('span', { class: 'pt-you' }, ' (you)')),
      hasVoted && h('span', { class: 'pt-voted', title: 'Vote is in' }, '✓'),
      h('div', { class: 'pt-sub' },
        !p.connected ? h('span', { class: 'pt-offline' }, '⚡ disconnected')
          : isTurn ? 'speaking…'
          : hasVoted ? 'voted'
          : (alive ? '' : ROLE_LABEL[elim?.role] || 'out')),
    );
    return tile;
  });
  return h('div', { class: 'players-grid' }, tiles);
}

function clueBoard(bi, ctx) {
  if (!bi.clues.length) return null;
  const rounds = [...new Set(bi.clues.map((c) => c.round))].sort((a, b) => a - b);
  return h('div', { class: 'card' },
    h('h2', { class: 'subtitle' }, '📋 Clue board'),
    rounds.map((r) => h('div', { class: 'clue-round' },
      h('div', { class: 'clue-round-label' }, `Round ${r}`),
      bi.clues.filter((c) => c.round === r).map((c, i) => {
        const p = ctx.player(c.playerId);
        const dead = !bi.alive.includes(c.playerId);
        const animCls = animOnce(`bi-clue:${c.round}:${c.playerId}`, 'anim-slide');
        return h('div', { class: `clue-row ${dead ? 'dead-clue' : ''} ${animCls}`, style: `animation-delay:${i * 30}ms` },
          h('div', { class: 'cr-avatar' }, p.avatar),
          h('div', { class: 'cr-body' },
            h('div', { class: 'cr-name' }, p.name + (c.playerId === ctx.me.id ? ' (you)' : '')),
            h('div', { class: 'clue-bubble' }, c.skipped ? c.text : c.text),
            reactionBar(c, ctx),
          ),
        );
      }),
    )),
  );
}

// Tally of who reacted with what, plus the picker. Reacting is how a table heckles.
function reactionBar(clue, ctx) {
  const reactions = clue.reactions || {};
  const counts = {};
  for (const emoji of Object.values(reactions)) counts[emoji] = (counts[emoji] || 0) + 1;
  const mine = reactions[ctx.me.id];

  const chips = Object.entries(counts).map(([emoji, n]) => h('button', {
    class: `react-chip ${mine === emoji ? 'mine' : ''}`,
    title: 'React',
    onClick: () => sendReaction(clue, emoji, ctx),
  }, emoji, h('span', { class: 'rc-count' }, String(n))));

  // Hover alone was too fragile: there is a gap between the ＋ and the palette, and
  // crossing it closed the menu mid-reach. So the open state is held in JS, the palette
  // lingers after the pointer leaves, and a click pins it open.
  const isOpen = openDrawers.has(clue.id);
  const add = h('div', {
    class: `react-add ${isOpen ? 'open' : ''}`,
    dataset: { drawer: clue.id },
  },
    h('button', {
      class: 'react-trigger', title: 'Add a reaction',
      onClick: (e) => {
        e.stopPropagation();
        const pinning = !add.classList.contains('pinned');
        add.classList.toggle('pinned', pinning);
        add.classList.add('open');
        openDrawers.add(clue.id);
      },
    }, '＋'),
    h('div', { class: 'react-menu' },
      REACTIONS.map((emoji) => h('button', {
        class: `react-opt ${mine === emoji ? 'mine' : ''}`,
        onClick: () => {
        openDrawers.delete(clue.id);
        add.classList.remove('open', 'pinned');
        sendReaction(clue, emoji, ctx);
      },
      }, emoji)),
    ),
  );

  let closeTimer = null;
  const hold = () => {
    clearTimeout(closeTimer);
    openDrawers.add(clue.id);
    add.classList.add('open');
  };
  const release = () => {
    clearTimeout(closeTimer);
    if (add.classList.contains('pinned')) return;
    closeTimer = setTimeout(() => {
      openDrawers.delete(clue.id);
      // The node may have been replaced by a re-render, so close whichever one is live.
      document.querySelector(`.react-add[data-drawer="${clue.id}"]`)?.classList.remove('open');
    }, REACTION_MENU_LINGER_MS);
  };
  add.addEventListener('pointerenter', hold);
  add.addEventListener('pointerleave', release);
  add.addEventListener('focusin', hold);
  add.addEventListener('focusout', release);

  return h('div', { class: 'reaction-bar' }, chips, add);
}

function sendReaction(clue, emoji, ctx) {
  ctx.emit('bi:react', { clueId: clue.id, emoji });
}

// ---------- phases ----------

function revealPhase(bi, ctx) {
  const readyTotal = bi.alive.length;
  return h('div', { class: 'card', style: 'text-align:center' },
    h('h2', { class: 'subtitle' }, bi.startQuip || 'Game on!'),
    h('p', { class: 'hint', style: 'margin:8px 0 4px' },
      `This game: ${bi.config.insiders} insiders, ${bi.config.outsiders} outsider${bi.config.outsiders > 1 ? 's' : ''}${bi.config.blank ? ' and the Blank' : ''}. Nobody is told which they are!`),
    wordCard(bi),
    bi.you?.alive
      ? h('button', {
          class: `btn ${bi.youReady ? 'btn-ghost' : 'btn-bi'} btn-lg btn-block`,
          disabled: bi.youReady,
          onClick: async (e) => {
            const res = await ctx.emit('bi:ready');
            if (!res.ok) shake(e.target);
          },
        }, bi.youReady ? `Waiting for others… (${bi.readyCount}/${readyTotal})` : "✅ I've seen my word")
      : h('p', { class: 'hint' }, 'You joined mid-game. You\'ll play in the next one!'),
    ctx.isHost && bi.readyCount < readyTotal && h('button', {
      class: 'btn btn-ghost btn-sm btn-block', style: 'margin-top:10px',
      onClick: () => ctx.emit('bi:forceDescribe'),
    }, `👑 Start anyway (${bi.readyCount}/${readyTotal} ready)`),
  );
}

function describeBar(bi, ctx) {
  const current = bi.currentTurn;
  const isMe = current === ctx.me.id;
  const p = current ? ctx.player(current) : null;

  if (isMe) {
    const input = h('input', {
      class: 'input', type: 'text', maxlength: 30, placeholder: 'One word about your word…',
      'data-preserve': 'bi-clue', autocomplete: 'off', enterkeyhint: 'send',
    });
    const submit = async () => {
      const res = await ctx.emit('bi:clue', { text: input.value });
      if (!res.ok) { shake(input); input.focus(); } else input.value = '';
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    return h('div', { class: 'action-bar' },
      h('div', { class: 'card' },
        h('div', { class: 'turn-banner your-turn', style: 'margin:0 0 12px' }, '🎤 Your turn, describe your word!'),
        h('div', { class: 'inline-form' },
          input,
          h('button', { class: 'btn btn-bi', onClick: submit }, 'Say it'),
        ),
        h('p', { class: 'hint', style: 'margin-top:8px' }, 'Don\'t say the word itself, don\'t repeat old clues.'),
        skipToVoteButton(bi, ctx),
      ),
    );
  }
  return h('div', { class: 'action-bar' },
    h('div', { class: 'card' },
      sceneHero('moments/clue',
        h('div', { class: 'sh-title' }, p ? `🎤 ${p.avatar} ${p.name} is thinking of a clue…` : '…'),
        { size: 'sm', cls: 'hero-bleed' }),
      ctx.isHost && p && !p.connected && h('button', {
        class: 'btn btn-ghost btn-sm btn-block', style: 'margin-top:10px',
        onClick: () => ctx.emit('bi:skipTurn'),
      }, `👑 Skip ${p.name}'s turn (disconnected)`),
      skipToVoteButton(bi, ctx),
    ),
  );
}

// Offered during describing so a table that talks out loud can jump straight to the vote.
function skipToVoteButton(bi, ctx) {
  if (!ctx.isHost) return null;
  const remaining = bi.queue.length - bi.clues.filter((c) => c.round === bi.round).length;
  return h('button', {
    class: 'btn btn-ghost btn-sm btn-block', style: 'margin-top:10px',
    onClick: () => ctx.emit('bi:startVote', { force: true }),
  }, remaining > 0 ? `👑 Skip to voting (${remaining} still to speak)` : '👑 Skip to voting');
}

function discussionBar(bi, ctx) {
  return h('div', { class: 'action-bar' },
    h('div', { class: 'card', style: 'text-align:center' },
      sceneHero('moments/discussion',
        h('div', { class: 'sh-title' }, '🗣️ Everyone has spoken, discuss! Who sounds suspicious?'),
        { size: 'sm', cls: 'hero-bleed' }),
      ctx.isHost
        ? h('button', { class: 'btn btn-bi btn-lg btn-block', onClick: () => ctx.emit('bi:startVote') }, '🗳️ Start the vote')
        : h('p', { class: 'hint' }, 'The room owner starts the vote when you\'re ready.'),
    ),
  );
}

function votePhase(bi, ctx) {
  const isRunoff = bi.phase === 'runoff';
  const canVote = bi.you?.alive && !bi.youVoted;
  const candidates = isRunoff ? bi.runoffCandidates : bi.alive;
  const selectable = canVote ? candidates.filter((id) => id !== ctx.me.id) : null;
  const pct = bi.votersNeeded ? Math.round((bi.votesCast / bi.votersNeeded) * 100) : 0;

  // Once the vote is cast, or if it is no longer ours to cast, drop any pending pick.
  if (!canVote) pendingVote = null;
  if (pendingVote && !selectable?.includes(pendingVote)) pendingVote = null;

  const target = pendingVote ? ctx.player(pendingVote) : null;

  return h('div', { class: 'card' },
    sceneHero('moments/vote', [
      h('h2', { class: 'subtitle' },
        isRunoff ? '⚖️ Tie-breaker! Vote between the tied players' : '🗳️ Who is the impostor?'),
      isRunoff && h('p', { class: 'hint', style: 'color:var(--amber); margin:4px 0 0' },
        '⚠️ Last chance: if this vote ties again, the outsiders win on the spot.'),
      h('p', { class: 'hint', style: 'margin:4px 0 0' },
        bi.you?.alive
          ? (bi.youVoted ? `Vote locked in ✅ (${bi.votesCast}/${bi.votersNeeded})`
            : pendingVote ? 'Confirm below, or pick someone else.'
            : 'Tap a player to vote them out. Votes are anonymous.')
          : 'You\'re spectating this vote.'),
    ], { cls: 'hero-bleed' }),
    playersStrip(bi, ctx, {
      selectable,
      selected: pendingVote || bi.yourVote,
      onSelect: (id) => {
        // First tap only picks. Nothing reaches the server until it is confirmed.
        pendingVote = pendingVote === id ? null : id;
        ctx.sound.tap();
        ctx.rerender();
      },
    }),
    target && h('div', { class: 'vote-confirm' },
      h('p', { class: 'vc-ask' }, 'Vote out ', h('b', {}, `${target.avatar} ${target.name}`), '?'),
      h('p', { class: 'vc-warn' }, 'This cannot be taken back.'),
      h('div', { class: 'vc-actions' },
        h('button', {
          class: 'btn btn-ghost', onClick: () => { pendingVote = null; ctx.sound.tap(); ctx.rerender(); },
        }, 'Cancel'),
        h('button', {
          class: 'btn btn-bi btn-lg',
          onClick: async (e) => {
            const id = pendingVote;
            e.currentTarget.disabled = true;
            const res = await ctx.emit('bi:vote', { targetId: id });
            if (res.ok) { pendingVote = null; ctx.sound.pop(); } else { e.currentTarget.disabled = false; shake(e.currentTarget); }
          },
        }, '🗳️ Lock it in'),
      ),
    ),
    h('div', { class: 'vote-progress' }, h('div', { class: 'vp-fill', style: `width:${pct}%` })),
    h('p', { class: 'hint', style: 'text-align:center; margin-top:8px' }, `${bi.votesCast} of ${bi.votersNeeded} votes are in`),
  );
}

function blankGuessPhase(bi, ctx) {
  const blankP = ctx.player(bi.pendingBlankId);
  if (bi.pendingBlankId === ctx.me.id) {
    const input = h('input', {
      class: 'input', type: 'text', maxlength: 40, placeholder: 'The insiders\' secret word is…',
      'data-preserve': 'white-guess', autocomplete: 'off', enterkeyhint: 'send',
    });
    const submit = async () => {
      const res = await ctx.emit('bi:blankGuess', { text: input.value });
      if (!res.ok) shake(input);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
    return h('div', { class: 'card', style: 'text-align:center' },
      sceneHero('moments/blank-guess', [
        h('span', { class: 'rp-avatar' }, '🎩'),
        h('h2', { class: 'subtitle', style: 'margin-top:6px' }, 'Caught! One shot left.'),
        h('p', { class: 'hint', style: 'margin:4px 0 0' }, 'One last power move: guess the insiders\' word to steal the win!'),
      ], { size: 'tall', cls: 'hero-bleed' }),
      h('div', { class: 'inline-form' }, input, h('button', { class: 'btn btn-bi', onClick: submit }, 'Guess!')),
    );
  }
  return h('div', { class: 'card', style: 'text-align:center' },
    sceneHero('moments/blank-guess', [
      h('span', { class: 'rp-avatar' }, blankP.avatar),
      h('div', {}, h('b', {}, blankP.name), ' was… ', h('span', { class: 'rp-role blank' }, '🃏 the Blank')),
      h('p', { class: 'rp-quip', style: 'margin-top:6px' }, 'Hold your breath. The Blank gets one guess at the secret word. 😱'),
    ], { size: 'tall', cls: 'hero-bleed' }),
    ctx.isHost
      ? h('button', {
          class: 'btn btn-ghost btn-sm', style: 'margin-top:10px',
          onClick: () => ctx.emit('bi:skipBlankGuess'),
        }, '👑 Skip the guess')
      : waitingFor(ctx.player(ctx.hostId)?.name, 'can skip the guess if it drags on.'),
  );
}

// The elimination reveal — who went, and what they turned out to be. Shared by the
// round-result screen and by game over, because the vote that ENDS the game skips
// roundResult entirely (the server goes straight to gameOver) and that reveal is the
// whole payoff of the round.
function revealHero(bi, ctx) {
  const r = bi.lastResult;
  if (!r || r.type === 'none') {
    return sceneHero('moments/tie', [
      h('span', { class: 'rp-avatar' }, '🤷'),
      h('h2', { class: 'subtitle', style: 'margin-top:6px' }, 'Nobody was eliminated!'),
      h('p', { class: 'rp-quip', style: 'margin-top:4px' }, r?.quip || 'The vote tied twice, suspicion carries to the next round.'),
    ], { size: 'tall', cls: 'hero-bleed reveal-pop' });
  }
  {
    const p = ctx.player(r.playerId);
    return sceneHero(OUT_ART[r.role], [
      h('span', { class: 'rp-avatar' }, p.avatar),
      h('div', { style: 'font-weight:800; font-size:19px; margin-top:6px' }, `${p.name} ${r.quip || 'is out!'}`),
      h('div', {}, h('span', { class: `rp-role ${r.role}` }, `${ROLE_EMOJI[r.role]} ${ROLE_LABEL[r.role]}`)),
      // The wrong guess is often a near-miss on the insider word, so only the Blank
      // sees what was actually said — otherwise the surviving outsiders get it free.
      r.blankGuess && h('p', { class: 'rp-quip' },
        r.blankGuess.guesserId === ctx.me.id
          ? `You guessed “${r.blankGuess.text}”, ${r.blankGuess.correct ? 'CORRECT!' : 'wrong.'}`
          : `The Blank took their shot, ${r.blankGuess.correct ? 'and nailed it!' : 'and missed. The word stays secret.'}`),
      r.tally && voteTally(r.tally, bi, ctx),
    ], { size: 'tall', cls: 'hero-bleed reveal-pop' });
  }
}

function roundResult(bi, ctx) {
  return h('div', { class: 'card', style: 'text-align:center' },
    revealHero(bi, ctx),
    ctx.isHost
      ? h('button', { class: 'btn btn-bi btn-lg btn-block', style: 'margin-top:14px', onClick: () => ctx.emit('bi:nextRound') }, `▶️ Start round ${bi.round + 1}`)
      : h('p', { class: 'hint', style: 'margin-top:12px' }, 'Waiting for the room owner to start the next round…'),
  );
}

function voteTally(tallyMap, bi, ctx) {
  const entries = Object.entries(tallyMap).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return null;
  return h('div', { style: 'margin-top:12px; display:flex; gap:6px; flex-wrap:wrap; justify-content:center' },
    entries.map(([id, n]) => {
      const p = ctx.player(id);
      return h('span', { class: 'badge' }, `${p.avatar} ${p.name}: ${n}`);
    }),
  );
}

function gameOver(bi, snap, ctx) {
  const civWin = bi.winner === 'insiders';
  const myRole = bi.reveal.roles[ctx.me.id];
  const iWon = myRole && ((civWin && myRole === 'insider') || (!civWin && myRole !== 'insider'));
  // The elimination that won the game never gets its own screen — the server goes
  // straight from the vote to gameOver — so it is staged here ahead of the winner. The
  // round stamp keeps a stale result (a game ended by a double tie, or by everyone
  // leaving) from being replayed as if it were the final beat.
  const endedOnVote = bi.lastResult?.round === bi.round;

  return [
    endedOnVote && h('div', { class: 'card bi-final-reveal', style: 'text-align:center' },
      h('h2', { class: 'subtitle' }, '⚖️ The final vote'),
      revealHero(bi, ctx),
    ),
    h('div', { class: `card win-screen ${endedOnVote ? 'bi-after-reveal' : ''}` },
    endArt(civWin ? 'endings/win-blendin-insiders' : 'endings/win-blendin-outsiders'),
    h('span', { class: 'ws-emoji' }, civWin ? '😇' : '🕵️'),
    h('h2', { class: civWin ? '' : 'gradient-text' }, civWin ? 'Insiders win!' : 'Outsiders win!'),
    h('p', { class: 'ws-reason' }, bi.winReason),
    h('p', { class: 'ws-reason', style: 'font-weight:700' }, bi.endQuip),
    myRole && h('p', { style: 'margin-top:10px; font-size:15px' },
      `You were ${ROLE_EMOJI[myRole]} ${ROLE_LABEL[myRole]}, ${iWon ? 'you won! 🎉' : 'better luck next time!'}`),
    h('div', { class: 'role-list' },
      bi.order.map((id, i) => {
        const p = ctx.player(id);
        const role = bi.reveal.roles[id];
        const word = role === 'blank' ? null
          : role === 'outsider' ? bi.reveal.outsiderWord : bi.reveal.insiderWord;
        const pts = (snap.leaderboard || []).find((e) => e.id === id)?.total;
        return h('div', { class: `role-line bi-reveal-row ${animOnce(`bi-role:${id}`, 'anim-slide')}`, style: `animation-delay:${i * 50}ms` },
          h('span', { class: 'rl-av' }, p.avatar),
          h('span', { class: 'rl-main' },
            h('span', { class: 'rl-name' }, p.name),
            h('span', { class: 'rl-word' }, word ? ['their word: ', h('b', {}, word)] : 'no word at all'),
          ),
          h('span', { class: 'rl-tail' },
            h('span', { class: `rl-role ${role}` }, `${ROLE_EMOJI[role]} ${ROLE_LABEL[role]}`),
            pts != null && h('span', { class: 'rl-pts' }, `${pts} pts`),
          ),
        );
      }),
    ),
    scoringDetails(snap.scoringRules?.blendin),
    ctx.isHost
      ? h('div', { style: 'display:grid; gap:10px; margin-top:16px' },
          h('button', { class: 'btn btn-bi btn-lg', onClick: () => ctx.emit('bi:playAgain') }, '🔁 Play again (new words)'),
          h('button', { class: 'btn btn-ghost', onClick: () => ctx.emit('room:backToLobby') }, '🏠 Back to lobby'),
        )
      : waitingFor(ctx.player(ctx.hostId)?.name, 'decides whether to run it back or head to the lobby.'),
    ),
  ];
}
