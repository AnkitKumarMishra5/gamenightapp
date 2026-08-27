// Blend In screen rendering. Receives the personalized room snapshot and a ctx
// with { emit, me, isHost, player(id) } from main.js.
import { h, shake, animOnce, waitingFor, aiThinking } from '../../core/ui.js';
import { memes, REACTION_SOUNDS } from '../../core/memes.js';

const REACTIONS = ['😂', '🤔', '😱', '🧐', '🔥', '💀'];

const ROLE_LABEL = { insider: 'Insider', outsider: 'Outsider', blank: 'Blank' };
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
    const tile = h('div', {
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
      h('div', { class: 'pt-sub' },
        !p.connected ? h('span', { class: 'pt-offline' }, '⚡ disconnected')
          : isTurn ? 'speaking…'
          : (alive ? '' : ROLE_LABEL[elim?.role] || 'out')),
    );
    return tile;
  });
  return h('div', { class: 'players-grid' }, tiles);
}

function clueBoard(bi, ctx) {
  if (!bi.clues.length) return null;
  const rounds = [...new Set(bi.clues.map((c) => c.round))].sort((a, b) => b - a);
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

  return h('div', { class: 'reaction-bar' },
    chips,
    h('div', { class: 'react-add' },
      h('button', { class: 'react-trigger', title: 'Add a reaction' }, '＋'),
      h('div', { class: 'react-menu' },
        REACTIONS.map((emoji) => h('button', {
          class: `react-opt ${mine === emoji ? 'mine' : ''}`,
          onClick: () => sendReaction(clue, emoji, ctx),
        }, emoji)),
      ),
    ),
  );
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
      h('div', { class: 'turn-banner', style: 'margin:0' }, p ? `🎤 ${p.avatar} ${p.name} is thinking of a clue…` : '…'),
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
      h('div', { class: 'turn-banner', style: 'margin:0 0 10px' }, '🗣️ Everyone has spoken, discuss! Who sounds suspicious?'),
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

  return h('div', { class: 'card' },
    h('h2', { class: 'subtitle', style: 'text-align:center' },
      isRunoff ? '⚖️ Tie-breaker! Vote between the tied players' : '🗳️ Who is the impostor?'),
    h('p', { class: 'hint', style: 'text-align:center; margin:6px 0 14px' },
      bi.you?.alive
        ? (bi.youVoted ? `Vote locked in ✅ (${bi.votesCast}/${bi.votersNeeded})` : 'Tap a player to vote them out. Votes are anonymous.')
        : 'You\'re spectating this vote.'),
    playersStrip(bi, ctx, {
      selectable,
      selected: bi.yourVote,
      onSelect: async (id) => {
        const res = await ctx.emit('bi:vote', { targetId: id });
        if (res.ok) ctx.sound.tap();
      },
    }),
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
      h('div', { class: 'reveal-pop' },
        h('span', { class: 'rp-avatar' }, '🎩'),
        h('h2', { class: 'subtitle', style: 'margin-top:10px' }, 'Caught! One shot left.'),
        h('p', { class: 'hint', style: 'margin:8px 0 14px' }, 'One last power move: guess the insiders\' word to steal the win!'),
      ),
      h('div', { class: 'inline-form' }, input, h('button', { class: 'btn btn-bi', onClick: submit }, 'Guess!')),
    );
  }
  return h('div', { class: 'card', style: 'text-align:center' },
    h('div', { class: 'reveal-pop' },
      h('span', { class: 'rp-avatar' }, blankP.avatar),
      h('div', {}, h('b', {}, blankP.name), ' was… ', h('span', { class: 'rp-role blank' }, '🃏 the Blank')),
      h('p', { class: 'rp-quip' }, 'Hold your breath. The Blank gets one guess at the secret word. 😱'),
    ),
    ctx.isHost
      ? h('button', {
          class: 'btn btn-ghost btn-sm', style: 'margin-top:10px',
          onClick: () => ctx.emit('bi:skipBlankGuess'),
        }, '👑 Skip the guess')
      : waitingFor(ctx.player(ctx.hostId)?.name, 'can skip the guess if it drags on.'),
  );
}

function roundResult(bi, ctx) {
  const r = bi.lastResult;
  let content;
  if (!r || r.type === 'none') {
    content = h('div', { class: 'reveal-pop' },
      h('span', { class: 'rp-avatar' }, '🤷'),
      h('h2', { class: 'subtitle', style: 'margin-top:8px' }, 'Nobody was eliminated!'),
      h('p', { class: 'rp-quip' }, r?.quip || 'The vote tied twice, suspicion carries to the next round.'),
    );
  } else {
    const p = ctx.player(r.playerId);
    content = h('div', { class: 'reveal-pop' },
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
    );
  }
  return h('div', { class: 'card', style: 'text-align:center' },
    content,
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

  return h('div', { class: 'card win-screen' },
    h('span', { class: 'ws-emoji' }, civWin ? '😇' : '🕵️'),
    h('h2', { class: civWin ? '' : 'gradient-text' }, civWin ? 'Insiders win!' : 'Outsiders win!'),
    h('p', { class: 'ws-reason' }, bi.winReason),
    h('p', { class: 'ws-reason', style: 'font-weight:700' }, bi.endQuip),
    myRole && h('p', { style: 'margin-top:10px; font-size:15px' },
      `You were ${ROLE_EMOJI[myRole]} ${ROLE_LABEL[myRole]}, ${iWon ? 'you won! 🎉' : 'better luck next time!'}`),
    h('div', { class: 'example', style: 'margin-top:14px' },
      `The insiders' word was `, h('b', {}, bi.reveal.insiderWord),
      ` · the blendin word was `, h('b', {}, bi.reveal.outsiderWord)),
    h('div', { class: 'role-list' },
      bi.order.map((id, i) => {
        const p = ctx.player(id);
        const role = bi.reveal.roles[id];
        return h('div', { class: `role-line ${animOnce(`bi-role:${id}`, 'anim-slide')}`, style: `animation-delay:${i * 50}ms` },
          h('span', {}, p.avatar),
          h('span', { class: 'rl-name' }, p.name),
          h('span', { class: `rl-role ${role}` }, `${ROLE_EMOJI[role]} ${ROLE_LABEL[role]}`),
        );
      }),
    ),
    ctx.isHost
      ? h('div', { style: 'display:grid; gap:10px; margin-top:16px' },
          h('button', { class: 'btn btn-bi btn-lg', onClick: () => ctx.emit('bi:playAgain') }, '🔁 Play again (new words)'),
          h('button', { class: 'btn btn-ghost', onClick: () => ctx.emit('room:backToLobby') }, '🏠 Back to lobby'),
        )
      : waitingFor(ctx.player(ctx.hostId)?.name, 'decides whether to run it back or head to the lobby.'),
  );
}
