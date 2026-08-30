// The Island screen rendering.
import { h, shake, animOnce, waitingFor, aiThinking, sceneArt } from '../../core/ui.js';

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
      actionBar(is, ctx),
      attemptLog(is, ctx),
      auditPanel(is, ctx),
    ); break;
    case 'reveal': parts.push(revealPhase(is, ctx)); break;
  }
  return h('div', { class: 'stack' }, parts);
}

// ---------- setup ----------

function setupPhase(is, ctx) {
  const meIsGm = is.mode === 'host' && is.gmId === ctx.me.id;
  if (!ctx.isHost && !meIsGm) {
    return h('div', { class: 'card', style: 'text-align:center' },
      h('span', { class: 'hero-emoji', style: 'font-size:56px' }, '🏝️'),
      h('h2', { class: 'subtitle', style: 'margin-top:10px' }, 'Preparing the boat…'),
      h('p', { class: 'hint', style: 'margin-top:8px' }, `${ctx.player(is.gmId || ctx.hostId).name} is setting up the secret pattern. Get your thinking cap on! 🧢`),
    );
  }
  // A non-host gamemaster skips the mode cards (that choice is the owner's) and goes
  // straight to writing the pattern.
  if (!ctx.isHost && meIsGm) {
    return h('div', { class: 'card' },
      h('h2', { class: 'subtitle' }, '🧑‍⚖️ You are the gamemaster this round'),
      patternForm(is, ctx),
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
        h('h3', {}, 'A human Gamemaster'),
        h('p', {}, 'The gamemaster knows the pattern and judges every attempt. You, or anyone at the table.'),
      ),
    ),
    // The judge's chair is the owner's to hand over: whoever has the best pattern in
    // mind runs the round, and everyone else plays.
    mode === 'host' && h('div', { class: 'setting-row', style: 'margin-top:12px' },
      h('div', {}, h('div', { class: 'sr-title' }, 'Who judges?'),
        h('div', { class: 'sr-sub' }, 'Re-deals the round with them in the chair')),
      h('select', {
        class: 'input', style: 'max-width:180px',
        onChange: (e) => ctx.emit('is:start', { mode: 'host', gmId: e.target.value }),
      }, (ctx.players ? ctx.players() : []).map((p) =>
        h('option', { value: p.id, selected: p.id === is.gmId ? '' : null }, `${p.avatar} ${p.name}`))),
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
        b.replaceChildren(h('span', { class: 'spin-emoji' }, '🤖'), ' Inventing a pattern…');
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
  } else if (is.gmId === ctx.me.id) {
    parts.push(patternForm(is, ctx));
  } else {
    parts.push(h('p', { class: 'hint', style: 'text-align:center' },
      `⏳ ${ctx.player(is.gmId).name} is writing the pattern…`));
  }
  return h('div', { class: 'card' }, parts);
}

// The gamemaster's pattern form. A surprise fills the fields instead of committing, so
// the judge can look it over, redraw, tweak it, or scrap it for their own idea; nothing
// reaches the table until they open the island.
function patternForm(is, ctx) {
  const name = h('input', { class: 'input', type: 'text', maxlength: 80, placeholder: 'e.g. Things that can break', 'data-preserve': 'is-name' });
  const desc = h('textarea', { class: 'textarea', maxlength: 300, placeholder: 'Precise rule you\'ll judge by, e.g. "anything that can break, physically or figuratively (hearts, promises, records)"', 'data-preserve': 'is-desc' });
  const s1 = h('input', { class: 'input', type: 'text', maxlength: 40, placeholder: 'e.g. Heart', 'data-preserve': 'is-s1' });
  const s2 = h('input', { class: 'input', type: 'text', maxlength: 40, placeholder: 'e.g. Window', 'data-preserve': 'is-s2' });
  const note = h('p', { class: 'hint', style: 'display:none; text-align:center' });
  return h('div', { class: 'stack' },
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
        const btn = e.currentTarget;
        const res = await ctx.emit('is:peekSurprise');
        if (!res.ok) { shake(btn); return; }
        name.value = res.draw.name;
        desc.value = res.draw.description;
        s1.value = res.draw.starters[0] || '';
        s2.value = res.draw.starters[1] || '';
        note.style.display = '';
        note.textContent = '🎁 Drawn from the bank, only you can see it. Open it, draw another, or edit it first.';
        btn.textContent = '🎁 Not this one, draw another';
      },
    }, '🎁 Surprise me, secret pattern only I can see'),
    note,
  );
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
      is.mode === 'ai'
        ? aiThinking('The judge is deliberating',
            attempt?.type === 'pattern'
              ? `${who.name} thinks they cracked it`
              : `Weighing “${attempt?.text || 'that'}” against the rule`)
        : aiThinking(`${ctx.player(is.gmId).name} is judging`, 'Waiting on a human for once', '🧑‍⚖️'),
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

// The appeal to a higher power (which is the same power, reading more carefully).
function auditPanel(is, ctx) {
  if (is.mode !== 'ai' || is.phase !== 'playing') return null;
  const last = is.lastAudit;
  return h('div', { class: 'audit-box' },
    is.auditing && h('div', { class: 'card audit-note audit-working', style: 'padding:12px 14px; margin-bottom:8px' },
      h('span', { class: 'audit-spinner', 'aria-hidden': 'true' }),
      h('span', {},
        h('b', {}, '👁 The boat is re-reading the round… '),
        'Every call judged again from scratch, over and over, until two passes agree. This takes a moment, and nothing can be played until it is done.'),
    ),
    last && h('div', { class: `card audit-note ${last.fixed.length ? 'warn' : ''}`, style: 'padding:10px 14px; margin-bottom:8px' },
      h('b', {}, last.fixed.length ? '🐟 The boat stands corrected. ' : '👁 The boat re-checked itself. '),
      last.note,
      last.fixed.length
        ? h('span', { class: 'audit-moves' },
            (() => {
              const on = last.fixed.filter((f) => f.fits).map((f) => `"${f.text}"`);
              const off = last.fixed.filter((f) => !f.fits).map((f) => `"${f.text}"`);
              const parts = [];
              if (on.length) parts.push(`${on.join(' · ')} → moved aboard`);
              if (off.length) parts.push(`${off.join(' · ')} → moved off the boat`);
              return ` ${parts.join('. ')}.`;
            })())
        : null,
    ),
    // The appeal freezes the round for everybody, so it is the owner's to call.
    ctx.isHost
      ? h('button', {
          class: 'btn btn-ghost btn-sm btn-block',
          disabled: is.auditing || undefined,
          onClick: async (e) => {
            const btn = e.currentTarget;
            btn.disabled = true;
            btn.textContent = '🐟 The boat is re-reading everything…';
            const res = await ctx.emit('is:audit');
            btn.disabled = false;
            btn.textContent = '🐟 Something smells fishy. Boat, re-check yourself!';
            if (!res.ok) shake(btn);
          },
        }, '🐟 Something smells fishy. Boat, re-check yourself!')
      : null,
    ctx.isHost
      ? h('p', { class: 'hint', style: 'text-align:center; margin-top:4px' },
          'Re-reads every ruling of the round against the secret pattern, again and again, until it agrees with itself. Owns up to anything it got wrong.')
      : h('p', { class: 'hint', style: 'text-align:center; margin-top:4px' },
          '🐟 Think a call was wrong? The room owner can ask the boat to re-check the whole round.'),
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

  // While the boat re-reads the round the table waits: a call judged against a list
  // that is about to change would be judged twice.
  if (is.auditing) {
    return h('div', { class: 'action-bar' }, h('div', { class: 'card' },
      h('p', { class: 'hint', style: 'text-align:center; margin:0' },
        '👁 The boat is re-reading every call. Hold on a moment…')));
  }

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
        h('div', { class: 'turn-banner your-turn', style: 'margin:0 0 12px' }, '🎤 Your turn! One move: ask for an item OR guess the pattern.'),
        h('div', { class: 'inline-form' }, input, h('button', { class: 'btn btn-island', onClick: submit }, 'Ask')),
        h('p', { class: 'hint', style: 'text-align:center; margin:6px 0 2px' }, '— or —'),
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
  const ready = (is.hintsAvailable || 0) > 0;
  const gmRound = is.mode === 'host';
  const mine = gmRound ? is.gmId === ctx.me.id : ctx.isHost;

  if (!mine) {
    const who = gmRound ? 'The gamemaster' : 'The room owner';
    return ready
      ? h('p', { class: 'hint hint-countdown' }, `💡 A hint is unlocked. ${who} can give it if everyone agrees.`)
      : h('p', { class: 'hint hint-countdown' }, `💡 The next hint unlocks in ${is.turnsToNextHint} more turn${is.turnsToNextHint === 1 ? '' : 's'}.`);
  }
  if (!ready) {
    return h('p', { class: 'hint hint-countdown' },
      `💡 The next hint unlocks in ${is.turnsToNextHint} more turn${is.turnsToNextHint === 1 ? '' : 's'}.`);
  }

  // With an AI gamemaster the hint goes straight to the table. With a human one it is
  // the gamemaster's hint to write: the model can draft two words, but nothing reaches
  // the table until they approve it.
  if (!gmRound) {
    return h('button', {
      class: 'btn btn-ghost btn-sm btn-block hint-btn', style: 'margin-top:10px',
      onClick: async (e) => {
        const btn = e.currentTarget;
        btn.disabled = true;
        btn.textContent = '💡 Asking the boat…';
        const res = await ctx.emit('is:hint');
        if (!res.ok) { btn.disabled = false; shake(btn); }
      },
    }, '💡 Spend a hint for the table (ask everyone first!)');
  }

  return h('button', {
    class: 'btn btn-ghost btn-sm btn-block hint-btn', style: 'margin-top:10px',
    onClick: () => gmHintModal(ctx),
  }, '💡 Give the table a hint');
}

// The gamemaster's hint desk: type two words that fit the pattern, or have the model
// draft a pair and edit them before anyone else sees them.
async function gmHintModal(ctx) {
  const { openModal, closeModal } = await import('../../core/ui.js');
  const a = h('input', { class: 'input', maxlength: 40, placeholder: 'First word' });
  const b = h('input', { class: 'input', maxlength: 40, placeholder: 'Second word' });
  const note = h('p', { class: 'hint', style: 'margin-top:10px' });

  const draft = h('button', {
    class: 'btn btn-ghost btn-sm',
    onClick: async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true; btn.textContent = 'Drafting…';
      const res = await ctx.emit('is:hint');
      btn.disabled = false; btn.textContent = '🤖 Draft with AI';
      if (!res.ok || !res.items?.length) { note.textContent = res.error || 'No draft right now — write your own.'; return; }
      a.value = res.items[0] || '';
      b.value = res.items[1] || '';
      note.textContent = 'Draft only. Check both words really fit before you send them.';
    },
  }, '🤖 Draft with AI');

  openModal(h('div', {},
    h('div', { class: 'modal-title' }, '💡 Your hint to the table'),
    h('p', { class: 'hint', style: 'margin-bottom:12px' },
      'Two words that fit your pattern. Nothing is sent until you press give.'),
    h('div', { style: 'display:grid; gap:8px' }, a, b),
    h('div', { style: 'margin-top:10px' }, draft),
    note,
    h('div', { style: 'display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:14px' },
      h('button', { class: 'btn btn-ghost', onClick: closeModal }, 'Not yet'),
      h('button', {
        class: 'btn btn-island',
        onClick: async (e) => {
          const items = [a.value, b.value].map((t) => t.trim()).filter(Boolean);
          if (items.length < 2) { note.textContent = 'Two words, please.'; return; }
          const btn = e.currentTarget;
          btn.disabled = true;
          const res = await ctx.emit('is:hintGive', { items });
          if (res.ok) closeModal();
          else { btn.disabled = false; note.textContent = res.error || 'That did not go through.'; shake(btn); }
        },
      }, '💡 Give the hint'),
    ),
  ));
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
  return h('div', { class: 'card win-screen has-art' },
    sceneArt('win-together', 'band'),
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
