// The Island screen rendering.
import { h, shake, animOnce, waitingFor } from '../../core/ui.js';

export function renderIsland(snap, ctx) {
  const is = snap.island;
  const parts = [];
  switch (is.phase) {
    case 'setup': parts.push(setupPhase(is, ctx)); break;
    case 'playing': parts.push(
      starterBanner(is),
      gmSecret(is, ctx),
      judgePanel(is, ctx),
      packingList(is, ctx),
      turnStrip(is, ctx),
      attemptLog(is, ctx),
      actionBar(is, ctx),
    ); break;
    case 'reveal': parts.push(revealPhase(is, ctx)); break;
  }
  return h('div', { class: 'stack' }, parts);
}

// ---------- setup ----------

function setupPhase(is, ctx) {
  if (!ctx.isHost) {
    return h('div', { class: 'card', style: 'text-align:center' },
      h('span', { class: 'hero-emoji', style: 'font-size:56px' }, '🏝️'),
      h('h2', { class: 'subtitle', style: 'margin-top:10px' }, 'Preparing the boat…'),
      h('p', { class: 'hint', style: 'margin-top:8px' }, `${ctx.player(is.gmId || ctx.hostId).name} is setting up the secret pattern. Get your thinking cap on! 🧢`),
    );
  }

  const mode = is.mode;
  const parts = [
    h('h2', { class: 'subtitle' }, `🏝️ Round ${is.roundNum}. Pick your gamemaster`),
    h('div', { class: 'game-cards', style: 'margin-top:12px' },
      h('button', {
        class: `game-card ${mode === 'ai' ? 'selected-island' : ''}`,
        onClick: () => { if (mode !== 'ai' && is.aiAvailable) ctx.emit('is:start', { mode: 'ai' }); },
      },
        h('div', { class: 'gc-glow island' }),
        h('div', { class: 'gc-emoji' }, '🤖'),
        h('h3', {}, 'AI Gamemaster'),
        h('p', {}, 'The AI invents a fresh secret pattern and judges every item. So YOU get to play and guess too!'),
        !is.aiAvailable && h('div', { class: 'gc-meta' }, h('span', { class: 'badge warn' }, 'unavailable right now')),
      ),
      h('button', {
        class: `game-card ${mode === 'host' ? 'selected-island' : ''}`,
        onClick: () => { if (mode !== 'host') ctx.emit('is:start', { mode: 'host' }); },
      },
        h('div', { class: 'gc-glow island' }),
        h('div', { class: 'gc-emoji' }, '🧑‍⚖️'),
        h('h3', {}, 'You are the Gamemaster'),
        h('p', {}, 'You know the pattern and judge every attempt. Write your own, or draw a surprise pattern only you can see.'),
      ),
    ),
    h('hr', { class: 'divider' }),
  ];

  if (mode === 'ai') {
    const btn = h('button', {
      class: 'btn btn-island btn-lg btn-block',
      disabled: !is.aiAvailable,
      onClick: async (e) => {
        const b = e.currentTarget;
        b.disabled = true;
        b.replaceChildren(h('span', { class: 'spin-emoji' }, '🌀'), ' The AI is inventing a pattern…');
        const res = await ctx.emit('is:setupAI');
        if (!res.ok) {
          b.disabled = false;
          b.replaceChildren('🎲 Generate the secret pattern');
          shake(b);
        }
      },
    }, '🎲 Generate the secret pattern');
    parts.push(
      h('p', { class: 'hint', style: 'margin-bottom:12px' },
        is.aiAvailable
          ? 'The pattern stays secret from everyone, including you. First to crack it wins the most points!'
          : 'The AI Gamemaster is unavailable right now, switch to "You are the Gamemaster" and the game plays exactly the same.'),
      btn,
    );
  } else {
    const name = h('input', { class: 'input', type: 'text', maxlength: 80, placeholder: 'e.g. Things that can break', 'data-preserve': 'is-name' });
    const desc = h('textarea', { class: 'textarea', maxlength: 300, placeholder: 'Precise rule you\'ll judge by, e.g. "anything that can break, physically or figuratively (hearts, promises, records)"', 'data-preserve': 'is-desc' });
    const s1 = h('input', { class: 'input', type: 'text', maxlength: 40, placeholder: 'e.g. Heart', 'data-preserve': 'is-s1' });
    const s2 = h('input', { class: 'input', type: 'text', maxlength: 40, placeholder: 'e.g. Window', 'data-preserve': 'is-s2' });
    parts.push(
      h('div', { class: 'stack' },
        h('div', {}, h('label', { class: 'label' }, 'Pattern name (shown at reveal)'), name),
        h('div', {}, h('label', { class: 'label' }, 'Secret rule. Your judging guide'), desc),
        h('div', { style: 'display:grid; grid-template-columns:1fr 1fr; gap:10px' },
          h('div', {}, h('label', { class: 'label' }, 'Opening item 1'), s1),
          h('div', {}, h('label', { class: 'label' }, 'Opening item 2'), s2),
        ),
        h('button', {
          class: 'btn btn-island btn-lg btn-block',
          onClick: async (e) => {
            const res = await ctx.emit('is:setupHost', { name: name.value, description: desc.value, starters: [s1.value, s2.value] });
            if (!res.ok) shake(e.target);
          },
        }, '⛵ Open the island'),
        h('button', {
          class: 'btn btn-ghost btn-block',
          onClick: async (e) => {
            const res = await ctx.emit('is:setupHost', { surprise: true });
            if (!res.ok) shake(e.target);
          },
        }, '🎁 Surprise me, secret pattern only I can see'),
      ),
    );
  }
  return h('div', { class: 'card' }, parts);
}

// ---------- playing ----------

function starterBanner(is) {
  const [a, b] = is.starters || ['?', '?'];
  return h('div', { class: 'starter-banner' },
    '🏝️ “I\'m going to an island and I\'m bringing',
    h('div', { class: 'sb-items' }, `${a} & ${b}`),
    '…what else can come aboard?”',
  );
}

function gmSecret(is, ctx) {
  if (!is.pattern || !is.youAreGamemaster) return null;
  return h('div', { class: 'gm-secret' },
    h('div', { class: 'gs-label' }, '🤫 Gamemaster only. The secret pattern'),
    h('div', {}, h('b', {}, is.pattern.name), ', ', is.pattern.description),
    is.gmHints && h('p', { class: 'hint', style: 'margin-top:6px' },
      `✅ fits: ${is.gmHints.examples.join(', ')} · ❌ doesn't: ${is.gmHints.nonExamples.join(', ')}`),
  );
}

function judgePanel(is, ctx) {
  const pj = is.pendingJudge;
  if (!pj) return null;
  const attempt = is.attempts.find((a) => a.id === pj.attemptId);
  const who = ctx.player(pj.playerId);

  if (!pj.youJudge) {
    return h('div', { class: 'card', style: 'text-align:center' },
      h('span', { class: 'spin-emoji', style: 'font-size:26px' }, is.mode === 'ai' ? '🤖' : '🧑‍⚖️'),
      h('p', { style: 'margin-top:8px; font-weight:700' },
        is.mode === 'ai' ? 'The AI judge is deliberating…' : `${ctx.player(is.gmId).name} is judging…`),
      attempt?.type === 'pattern' && h('p', { class: 'hint' }, `${who.name} thinks they cracked the pattern! 🤞`),
      ctx.isHost && is.mode === 'ai' && h('button', {
        class: 'btn btn-ghost btn-sm', style: 'margin-top:8px',
        onClick: () => ctx.emit('is:cancelPending'),
      }, '👑 Cancel stuck judgment'),
      !ctx.isHost && is.mode === 'ai'
        && waitingFor(ctx.player(ctx.hostId)?.name, 'can cancel this if the judge gets stuck.'),
    );
  }

  const isItem = attempt.type === 'item';
  return h('div', { class: 'card judge-panel' },
    h('h2', { class: 'subtitle' }, '🧑‍⚖️ Your call, Gamemaster!'),
    h('p', { style: 'margin-top:8px; font-size:16px' },
      h('b', {}, who.name), isItem ? ' asks: ' : ' guesses the pattern: ',
      h('span', { class: 'clue-bubble', style: 'margin-top:6px' }, isItem ? `Can I bring “${attempt.text}”?` : `“${attempt.text}”`)),
    h('div', { class: 'judge-buttons' },
      h('button', { class: 'btn btn-island', onClick: () => ctx.emit('is:judge', { attemptId: attempt.id, approve: true }) },
        isItem ? '✅ Yes, it fits' : '🏆 Correct. They got it!'),
      h('button', { class: 'btn btn-danger', onClick: () => ctx.emit('is:judge', { attemptId: attempt.id, approve: false }) },
        isItem ? '❌ No, it doesn\'t' : '❌ Not the pattern'),
    ),
  );
}

// Two-column at-a-glance board: what made it onto the boat vs what got rejected,
// each item tagged with who asked. The opening items sit in the allowed column.
function packingList(is, ctx) {
  const yes = is.attempts.filter((a) => a.type === 'item' && a.verdict === 'yes');
  const no = is.attempts.filter((a) => a.type === 'item' && a.verdict === 'no');
  const gmLabel = is.mode === 'ai' ? '🤖 AI' : `${ctx.player(is.gmId).avatar} ${ctx.player(is.gmId).name}`;

  const chip = (text, byLabel, i) => h('div', {
    class: `pack-item ${animOnce(`is-pack:${is.roundNum}:${text}`)}`,
    style: `animation-delay:${Math.min(i, 10) * 30}ms`,
  },
    h('span', { class: 'pack-word' }, text),
    h('span', { class: 'pack-by' }, byLabel),
  );

  return h('div', { class: 'card' },
    h('h2', { class: 'subtitle' }, '🧳 The packing list'),
    h('div', { class: 'packing-grid' },
      h('div', { class: 'pack-col allowed' },
        h('div', { class: 'pack-head' }, `✅ On the boat (${
    yes.length + (is.starters?.length || 0) + (is.hints || []).reduce((n, x) => n + x.items.length, 0)})`),
        (is.starters || []).map((s, i) => chip(s, gmLabel, i)),
        yes.map((a, i) => {
          const p = ctx.player(a.playerId);
          return chip(a.text, `${p.avatar} ${p.name}`, i + 2);
        }),
        (is.hints || []).flatMap((hint, hi) =>
          hint.items.map((text, i) => chip(text, '💡 hint', yes.length + hi * 2 + i))),
      ),
      h('div', { class: 'pack-col rejected' },
        h('div', { class: 'pack-head' }, `🚫 Left behind (${no.length})`),
        no.length
          ? no.map((a, i) => {
              const p = ctx.player(a.playerId);
              return chip(a.text, `${p.avatar} ${p.name}`, i);
            })
          : h('p', { class: 'hint', style: 'padding:6px 2px' }, 'Nothing rejected yet…'),
      ),
    ),
  );
}

function turnStrip(is, ctx) {
  return h('div', { class: 'players-grid' },
    is.order.map((id, i) => {
      const p = ctx.player(id);
      const solvedRank = is.solvedOrder.indexOf(id) + 1;
      const isTurn = is.currentTurn === id;
      return h('div', {
        class: ['player-tile', animOnce(`is-tile:${id}`), !p.connected && 'offline',
          (is.knockedOut || []).includes(id) && 'dead', isTurn && 'current-turn',
          id === ctx.me.id && 'you'].filter(Boolean).join(' '),
        style: `animation-delay:${i * 40}ms`,
      },
        p.isHost && h('span', { class: 'crown' }, '👑'),
        solvedRank > 0 && h('span', { class: 'pt-mark' }, ['🥇', '🥈', '🥉'][solvedRank - 1] || '🏅'),
        h('div', { class: 'pt-avatar' }, (is.knockedOut || []).includes(id) ? '💀' : p.avatar),
        h('div', { class: 'pt-name' }, p.name, id === ctx.me.id && h('span', { class: 'pt-you' }, ' (you)')),
        h('div', { class: 'pt-sub' },
          !p.connected ? h('span', { class: 'pt-offline' }, '⚡ disconnected')
            : (is.knockedOut || []).includes(id) ? 'out of guesses'
            : isTurn ? 'their turn…'
            : (solvedRank ? `cracked it! · ${is.scores[id] || 0} pts` : `${is.scores[id] || 0} pts`)),
      );
    }),
  );
}

function attemptLog(is, ctx) {
  if (!is.attempts.length) {
    return h('div', { class: 'card', style: 'text-align:center' },
      h('p', { class: 'hint' }, 'No attempts yet. The history of every ask will appear here. 📜'));
  }
  const rows = is.attempts.slice().reverse().map((a, i) => {
    const p = ctx.player(a.playerId);
    const isPattern = a.type === 'pattern';
    const icon = a.verdict === 'pending' ? '🌀'
      : a.verdict === 'yes' ? '✅'
      : a.verdict === 'no' ? '🚫'
      : a.verdict === 'correct' ? '🏆' : '❌';
    const text = isPattern
      ? (a.text ? `Pattern guess: “${a.text}”` : 'made a secret pattern guess…')
      : `Can I bring “${a.text}”?`;
    return h('div', {
      class: `attempt v-${a.verdict} ${a.verdict === 'pending' ? '' : animOnce(`is-att:${a.id}`, 'anim-slide')}`,
      style: `animation-delay:${Math.min(i, 8) * 20}ms`,
    },
      h('span', { class: 'at-verdict' }, icon),
      h('div', {},
        h('div', { class: 'at-text' }, text),
        a.remark && h('div', { class: 'at-remark' }, a.remark),
      ),
      h('span', { class: 'at-who' }, `${p.avatar} ${p.name}`),
    );
  });
  return h('div', { class: 'card' },
    h('h2', { class: 'subtitle' }, '📜 The story so far'),
    h('div', { class: 'attempt-log', style: 'margin-top:10px' }, rows),
  );
}

function actionBar(is, ctx) {
  const parts = [];
  const myTurn = is.currentTurn === ctx.me.id;

  if (is.youAreGamemaster) {
    parts.push(h('p', { class: 'hint', style: 'text-align:center; margin:0' },
      '🧑‍⚖️ You\'re the judge, answers appear here when players make their move.'));
  } else if (!is.youPlay) {
    parts.push(h('p', { class: 'hint', style: 'text-align:center; margin:0' }, 'You joined mid-round. You\'ll board the boat next round! ⛵'));
  } else if (is.youKnockedOut) {
    parts.push(
      h('div', { class: 'turn-banner', style: 'margin:0' }, '💀 You used all three pattern guesses, out for this round'),
      h('p', { class: 'hint', style: 'text-align:center; margin-top:8px' }, 'Watch the rest unfold; you\'re back in next round.'),
    );
  } else if (myTurn) {
    if (is.youSolved) {
      const input = h('input', { class: 'input', type: 'text', maxlength: 40, placeholder: 'Drop a hint item that FITS…', 'data-preserve': 'is-item', autocomplete: 'off', enterkeyhint: 'send' });
      const submit = async () => {
        const res = await ctx.emit('is:item', { text: input.value });
        if (!res.ok) shake(input); else input.value = '';
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      parts.push(
        h('div', { class: 'turn-banner your-turn', style: 'margin:0 0 12px' }, `🎤 Your turn! You cracked it (#${is.yourRank}), help the others with a hint`),
        h('div', { class: 'inline-form' }, input, h('button', { class: 'btn btn-island', onClick: submit }, 'Ask')),
        h('button', { class: 'btn btn-ghost btn-sm btn-block', style: 'margin-top:8px', onClick: () => ctx.emit('is:pass') }, '⏭️ Pass'),
      );
    } else {
      const input = h('input', { class: 'input', type: 'text', maxlength: 40, placeholder: 'Can I bring a…', 'data-preserve': 'is-item', autocomplete: 'off', enterkeyhint: 'send' });
      const submit = async () => {
        const res = await ctx.emit('is:item', { text: input.value });
        if (!res.ok) shake(input); else input.value = '';
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') submit(); });
      parts.push(
        h('div', { class: 'turn-banner your-turn', style: 'margin:0 0 12px' }, '🎤 Your turn, ask for an item, or guess the pattern!'),
        h('div', { class: 'inline-form' }, input, h('button', { class: 'btn btn-island', onClick: submit }, 'Ask')),
        h('button', {
          class: 'btn btn-ghost btn-sm btn-block', style: 'margin-top:8px',
          onClick: () => patternGuessModal(ctx, is),
        }, `💡 I think I know the pattern! (${is.yourGuessesLeft} of ${is.maxGuesses} left)`),
      );
    }
  } else {
    const p = is.currentTurn ? ctx.player(is.currentTurn) : null;
    parts.push(h('div', { class: 'turn-banner', style: 'margin:0' },
      p ? `🎤 ${p.avatar} ${p.name} is up…` : '⏳ Waiting…'));
  }

  const hintBtn = hintButton(is, ctx);
  if (hintBtn) parts.push(hintBtn);

  if (ctx.isHost) {
    parts.push(h('button', {
      class: 'btn btn-ghost btn-sm btn-block', style: 'margin-top:10px',
      onClick: () => ctx.emit('is:end'),
    }, '👑 End round & reveal the pattern'));
  } else {
    parts.push(waitingFor(ctx.player(ctx.hostId)?.name, 'can end the round and reveal the pattern.'));
  }
  return h('div', { class: 'action-bar' }, h('div', { class: 'card' }, parts));
}

// The boat gives away two more items each time the table completes a full lap. Anyone can
// spend a hint, not just whoever is up, because a stuck round is everybody's problem.
function hintButton(is, ctx) {
  if (is.youAreGamemaster || !is.youPlay) return null;
  const ready = (is.hintsAvailable || 0) > 0;
  const taken = (is.hints || []).length;

  if (!ready) {
    const left = is.turnsToNextHint || 0;
    return h('p', { class: 'hint hint-countdown' },
      taken
        ? `💡 Next hint after ${left} more turn${left === 1 ? '' : 's'}.`
        : `💡 A hint unlocks once everyone has had a turn. ${left} to go.`);
  }

  return h('button', {
    class: 'btn btn-ghost btn-sm btn-block hint-btn', style: 'margin-top:10px',
    onClick: async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      btn.textContent = '💡 Asking the boat…';
      const res = await ctx.emit('is:hint');
      if (!res.ok) { btn.disabled = false; shake(btn); }
    },
  }, `💡 Ask for a hint (2 more items)${is.hintsAvailable > 1 ? ` · ${is.hintsAvailable} saved up` : ''}`);
}

async function patternGuessModal(ctx, is) {
  const { openModal, closeModal } = await import('../../core/ui.js');
  const left = is?.yourGuessesLeft ?? 3;
  const input = h('textarea', { class: 'textarea', maxlength: 200, placeholder: 'Describe the rule in your own words, e.g. "things that can break"' });
  openModal(h('div', {},
    h('div', { class: 'modal-title' }, '💡 Guess the pattern'),
    h('p', { class: `hint ${left === 1 ? 'danger-hint' : ''}`, style: 'margin-bottom:12px' },
      left === 1
        ? '⚠️ This is your LAST guess. Get it wrong and you are out for the round.'
        : `Your guess stays hidden from other players. You have ${left} of ${is?.maxGuesses ?? 3} guesses left. Use all three and you are out for the round.`),
    input,
    h('div', { style: 'display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px' },
      h('button', { class: 'btn btn-ghost', onClick: closeModal }, 'Not yet'),
      h('button', {
        class: 'btn btn-island',
        onClick: async (e) => {
          const res = await ctx.emit('is:pattern', { text: input.value });
          if (!res.ok) shake(input); else closeModal();
        },
      }, 'Lock it in!'),
    ),
  ));
  input.focus();
}

// ---------- reveal ----------

function revealPhase(is, ctx) {
  const ranking = [...is.order].sort((a, b) => (is.scores[b] || 0) - (is.scores[a] || 0));
  return h('div', { class: 'card win-screen' },
    h('span', { class: 'ws-emoji' }, '🏝️'),
    h('h2', { class: 'gradient-text' },
      is.endedBy === 'all-solved' ? 'Everyone cracked it!' : (is.endedBy === 'gm-left' ? 'The gamemaster left!' : 'Round over!')),
    is.endedBy === 'gm-left' && h('p', { class: 'ws-reason' }, 'They took the secret with them. So here it is.'),
    is.pattern && h('div', { class: 'example', style: 'margin-top:12px; text-align:left' },
      h('b', {}, `The pattern was: ${is.pattern.name}`),
      h('p', { style: 'margin-top:4px' }, is.pattern.description),
    ),
    h('div', { class: 'role-list' },
      ranking.map((id, i) => {
        const p = ctx.player(id);
        const rank = is.solvedOrder.indexOf(id) + 1;
        // Medals belong to players who actually scored — never to "still guessing".
        const scored = (is.scores[id] || 0) > 0;
        return h('div', {
          class: `lb-row ${i === 0 && scored ? 'first' : ''} ${animOnce(`is-lb:${is.roundNum}:${id}`, 'anim-slide')}`,
          style: `animation-delay:${i * 60}ms`,
        },
          h('span', { class: 'lb-rank' }, scored ? (['🥇', '🥈', '🥉'][i] || `${i + 1}.`) : '—'),
          h('span', {}, p.avatar),
          h('span', { class: 'lb-name' }, p.name,
            rank ? h('span', { class: 'hint' }, `  · solved #${rank} this round`)
              : (is.knockedOut || []).includes(id) ? h('span', { class: 'hint' }, '  · out of guesses 💀')
              : h('span', { class: 'hint' }, '  · still guessing')),
          h('span', { class: 'lb-pts' }, `${is.scores[id] || 0} pts`),
        );
      }),
    ),
    ctx.isHost
      ? h('div', { style: 'display:grid; gap:10px; margin-top:16px' },
          h('button', { class: 'btn btn-island btn-lg', onClick: () => ctx.emit('is:newRound', { mode: is.mode }) }, '🔁 New round, new pattern'),
          h('button', { class: 'btn btn-ghost', onClick: () => ctx.emit('room:backToLobby') }, '🏠 Back to lobby'),
        )
      : waitingFor(ctx.player(ctx.hostId)?.name, 'decides whether to deal a new pattern or head to the lobby.'),
  );
}
