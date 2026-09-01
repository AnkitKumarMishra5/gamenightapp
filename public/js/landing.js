// Game Night — © 2026 Ankit Kumar Mishra. All rights reserved. See LICENSE.
//
// One aesthetic thesis: a night of cards among friends. Midnight felt, candlelight
// gold, cards in motion. This module renders the whole home screen into a single
// node and owns all of its motion: the hero's canvas of drifting gold motes and
// tumbling card backs, the fan of cards that deals itself away as you scroll, the
// section reveals, and the 3D tilt on the game shelf.
//
// Contract:
//   renderLanding(deps) -> HTMLElement    safe to call again on every re-render
//   destroyLanding()                      optional explicit teardown
//
// Identity lives in deps.prefs, rooms are created/joined through
// deps.onCreate/onJoin, invite links keep pre-filling through
// [data-preserve="home-code"] (main.js's applyPrefill), rules open via
// deps.showRules, and legal/feedback/install reuse main.js's own modals.

const CODE_LEN = 5;
const GOLD_HEX = '#d4af37';

// Game accents, matching the identities style.css gives each game. Gold is the
// fallback so a future game never renders unstyled.
const ACCENTS = {
  bi: '#f472b6',
  island: '#34d399',
  so: '#d4af37',
  ss: '#fbbf24',
  sl: '#818cf8',
};

const NUM_WORDS = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const numWord = (n) => NUM_WORDS[n] || String(n);
const capital = (s) => s.charAt(0).toUpperCase() + s.slice(1);

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const canHoverTilt = () => !reduceMotion() && matchMedia('(hover: hover) and (pointer: fine)').matches;

// ---------- state that must survive re-renders (SPA re-entry) ----------
// main.js re-renders the landing on every connect/disconnect, so anything the
// player opened (join panel, avatar tray) has to live here, not in the DOM.
const state = {
  joinOpen: false,
  trayOpen: false,
  avatar: null,          // committed pick; prefs.avatar is random-per-read when unset
  inviteCode: null,      // remembered after applyPrefill clears sessionStorage
  autoJoined: false,     // the one automatic join attempt an invite gets
  entered: false,        // the hero entrance plays once per session, not per render
  helloSent: false,
  revealed: new Set(),   // sections already revealed stay revealed across re-renders
  cleanups: [],          // observers / listeners / rafs for the current mount
};

function onCleanup(fn) { state.cleanups.push(fn); }

function cleanup() {
  for (const fn of state.cleanups.splice(0)) {
    try { fn(); } catch { /* teardown must never throw */ }
  }
}

export function destroyLanding() { cleanup(); }

// ============================================================
// render
// ============================================================
export function renderLanding(deps) {
  cleanup();
  const { h } = deps;
  const rm = reduceMotion();

  // Commit an avatar once so every read agrees (the prefs getter invents a new
  // random one on every call until something is stored).
  if (state.avatar == null) {
    state.avatar = deps.prefs.avatar;
    deps.prefs.avatar = state.avatar;
  }

  // An invite link parks its code in sessionStorage; main.js's applyPrefill will
  // write it into our code input right after this render. Remember it ourselves
  // so the banner survives the storage being cleared.
  const pending = sessionStorage.getItem('gn_prefill_code');
  if (pending) {
    state.inviteCode = pending;
    // The invite gets its own one-tap button; the code section stays folded away as
    // the "different room" path rather than opening a redundant row of boxes.
    state.joinOpen = false;
  }

  // ---------- shared card visual (midnight back / ivory front) ----------
  const cardBack = (extra = '') => h('span', { class: `lp-pcard lp-pc-back ${extra}`, 'aria-hidden': 'true' });

  // ---------- hero ----------
  const canvas = h('canvas', { class: 'lp-motes', 'aria-hidden': 'true' });

  // Five card backs fanned like a held hand, peeking up behind the console.
  // Each takes a game's accent for its centre pip when that game exists.
  const fan = h('div', { class: 'lp-fan', 'aria-hidden': 'true' },
    Array.from({ length: 5 }, (_, i) => h('div', {
      class: 'lp-fcard',
      style: `--i:${i - 2}; --fa:${deps.GAMES[i] ? (ACCENTS[deps.GAMES[i].accent] || GOLD_HEX) : GOLD_HEX}`,
    }, cardBack('lp-pc-fan'))),
  );

  const HEADLINE = 'Deal your friends in.';
  const h1 = h('h1', { class: 'lp-h1', 'aria-label': HEADLINE },
    HEADLINE.split(' ').map((word, i) => [
      h('span', { class: 'lp-w', style: `--wi:${i}`, 'aria-hidden': 'true' }, word),
      ' ',
    ]),
  );

  const console_ = buildConsole(deps);

  const cue = h('button', {
    class: 'lp-cue', 'aria-label': "Scroll down to tonight's lineup",
    onClick: () => scrollToSection('lp-games'),
  },
    h('span', { class: 'lp-cue-label' }, "tonight's lineup"),
    h('span', { class: 'lp-cue-chev', 'aria-hidden': 'true', html: svgChevron() }),
  );

  const hero = h('section', { class: 'lp-hero', id: 'lp-hero', 'aria-label': 'Start playing' },
    canvas,
    h('div', { class: 'lp-hero-glow', 'aria-hidden': 'true' }),
    h('div', { class: 'lp-hero-inner' },
      h('p', { class: 'lp-eyebrow' }, 'Free party games, in your browser'),
      h1,
      h('p', { class: 'lp-sub' },
        'Real-time party games for 2 to 16 friends. Make a room, share the code, and every phone becomes a seat at the table.'),
      console_,
      h('p', { class: 'lp-fine' }, 'Free. No account, nothing to install, no ads.'),
      // A quiet credit line: small, muted, and it just slides you to the footer card.
      h('button', {
        class: 'lp-devcue',
        onClick: () => { deps.sound.tap(); scrollToSection('lp-devcard'); },
      }, deps.devPhoto('sm', 20), 'Meet the developer'),
    ),
    fan,
    cue,
  );

  // ---------- mini-nav (appears once the hero is behind you) ----------
  const nav = h('nav', { class: 'lp-nav', 'aria-label': 'Page sections' },
    navBtn(deps, 'lp-hero', 'Play'),
    navBtn(deps, 'lp-games', 'Games'),
    navBtn(deps, 'lp-watch', 'Watch'),
    navBtn(deps, 'lp-how', 'How it works'),
    navBtn(deps, 'lp-table', 'The table'),
    h('span', { class: 'lp-nav-prog', 'aria-hidden': 'true' }),
  );

  // ---------- the shelf: every registered game ----------
  const shelf = h('section', { class: 'lp-sec lp-games', id: 'lp-games', 'aria-label': 'The games' },
    sectionHead(h, "Tonight's lineup",
      `${capital(numWord(deps.GAMES.length))} games, one room.`,
      "Tap a card to see how it plays. One room runs them all, and the night's points follow you between games."),
    headcount(deps),
    h('div', { class: 'lp-shelf' },
      deps.GAMES.map((g, i) => gameCard(deps, g, i)),
    ),
  );

  // ---------- watch a round: auto-playing mini-scenes with real friends ----------
  const watch = buildWatch(deps, rm, cardBack);

  // ---------- how a night works ----------
  const how = h('section', { class: 'lp-sec lp-how', id: 'lp-how', 'aria-label': 'How a night works' },
    sectionHead(h, 'How a night works', 'Three moves and you are playing.', null),
    h('div', { class: 'lp-steps' },
      h('div', { class: 'lp-steps-line', 'aria-hidden': 'true' }),
      step(h, 0, 'Make the room',
        'Pick a name and an avatar, press create. You get a five-letter code and a lobby of your own.',
        vignetteCode(h)),
      step(h, 1, 'Share the code',
        'Say it across the couch, text it across the world, or send the link. Friends join from any phone browser.',
        vignetteShare(h)),
      step(h, 2, 'Pick a game, play',
        'The host picks what to play. Rules pop up before every round, so nobody has to pretend they remember them.',
        vignetteDeal(h, cardBack)),
    ),
  );

  // ---------- the card table ----------
  const tableNames = deps.GAMES
    .filter((g) => g.accent === 'so' || g.accent === 'ss' || g.accent === 'sl')
    .map((g) => g.title);
  const named = tableNames.length >= 2
    ? `${tableNames.slice(0, -1).join(', ')} and ${tableNames[tableNames.length - 1]}`
    : 'Silent Order, Swap or Stay and Sleepless';

  const table = h('section', { class: 'lp-sec lp-table', id: 'lp-table', 'aria-label': 'The card table' },
    sectionHead(h, 'The card table', 'Cards with real weight.',
      `${tableNames.length || 3} card games, one real table between you. Cards are shuffled, dealt and held like the night you are missing.`),
    tableau(h, cardBack),
    h('p', { class: 'lp-stage-note lp-reveal' }, named),
  );

  // ---------- the honest part ----------
  const trust = h('section', { class: 'lp-sec lp-trust', id: 'lp-trust', 'aria-label': 'What it costs' },
    sectionHead(h, 'The honest part', 'What it costs: nothing.', null),
    h('div', { class: 'lp-trust-grid' },
      trustItem(h, 0, svgTicket(), 'Free, with no ads', 'And no purchases hiding anywhere either.'),
      trustItem(h, 1, svgUser(), 'No accounts', 'A name and an avatar is the whole sign-up.'),
      trustItem(h, 2, svgGlobe(), 'Nothing to install', 'Runs in the browser, and can sit on your home screen like an app.'),
      trustItem(h, 3, svgLock(), 'Private rooms', 'Only people with your code get in. The room is gone when the last player leaves.'),
      trustItem(h, 4, svgUsers(), '2 to 16 players', 'Same couch or three time zones apart, every phone is a seat.'),
      trustItem(h, 5, svgSpark(), 'An AI gamemaster', 'It referees Island Rules. A friend can take the job instead.'),
    ),
  );

  // ---------- finale: the opening deal, reprised at full weight ----------
  // The page closes on the beat it opened with: a fan of card backs blooms
  // open behind an oversized headline, and the button hands the player back
  // to the hero console with the name field focused.
  const finale = h('section', { class: 'lp-sec lp-cta', id: 'lp-cta', 'aria-label': 'Start a room now' },
    h('div', { class: 'lp-cta-inner lp-reveal' },
      h('div', { class: 'lp-xfan', 'aria-hidden': 'true' },
        Array.from({ length: 5 }, (_, i) => h('span', {
          class: 'lp-xfcard',
          style: `--i:${i - 2}; --fa:${deps.GAMES[i] ? (ACCENTS[deps.GAMES[i].accent] || GOLD_HEX) : GOLD_HEX}`,
        }, cardBack('lp-pc-x'))),
      ),
      h('p', { class: 'lp-eyebrow' }, 'Your move'),
      h('h2', { class: 'lp-cta-h' }, 'The table is set.'),
      h('p', { class: 'lp-cta-sub' }, 'A room takes ten seconds. The night takes care of itself.'),
      h('button', {
        class: 'lp-act lp-act-create lp-cta-btn',
        onClick: () => {
          deps.sound.tap();
          scrollToSection('lp-hero');
          // Hand focus to the console once the scroll has (mostly) settled.
          setTimeout(() => {
            const el = document.querySelector('.lp-name');
            if (el) el.focus({ preventScroll: true });
          }, reduceMotion() ? 80 : 650);
        },
      }, h('span', { class: 'lp-act-emoji', 'aria-hidden': 'true' }, '✨'), 'Deal your friends in'),
    ),
  );

  // ---------- footer ----------
  const footer = h('footer', { class: 'lp-footer lp-reveal' },
    // A faint gold-mote drift so the page ends the way it began (the hero
    // canvas's candlelight). Pure CSS, transform/opacity only, and it only
    // plays once the footer has revealed.
    h('div', { class: 'lp-foot-motes', 'aria-hidden': 'true' },
      Array.from({ length: 9 }, (_, i) => h('span', { class: 'lp-fmote', style: `--mi:${i}` })),
    ),
    h('div', { class: 'lp-foot-brand' },
      h('span', { class: 'lp-foot-markwrap', 'aria-hidden': 'true' },
        // A tiny reprise of the hero fan: three card backs bloom open behind
        // the brand mark when the footer reveals.
        h('span', { class: 'lp-fbloom' },
          Array.from({ length: 3 }, (_, i) => h('span', { class: 'lp-fbcard', style: `--bi:${i - 1}` })),
        ),
        h('img', { class: 'lp-foot-mark', src: '/icons/logo.svg', width: '40', height: '40', alt: '' }),
      ),
      h('div', {},
        h('div', { class: 'lp-foot-name' }, deps.BRAND.short),
        h('div', { class: 'lp-foot-by' }, 'by ', deps.DEV.name),
        h('div', { class: 'lp-foot-tagline' }, deps.BRAND.tagline),
      ),
    ),
    h('div', { class: 'lp-foot-install' }, deps.installRow()),
    // Same card as the About modal — photo beside the words on desktop, stacked on a
    // phone — in the landing's own gold-on-midnight palette rather than the app's.
    h('section', { class: 'lp-devcard', id: 'lp-devcard', 'aria-label': 'About the developer' },
      h('p', { class: 'lp-foot-devhead' }, 'Meet the developer'),
      h('div', { class: 'lp-devcard-body' },
        deps.devPhoto('md', 92),
        h('div', { class: 'lp-devcard-text' },
          h('p', { class: 'lp-devcard-name' }, deps.DEV.name),
          h('p', { class: 'lp-devcard-role' }, 'Creator & developer of Game Night'),
          h('blockquote', { class: 'lp-foot-quote' }, `\u201c${deps.ORIGIN_STORY}\u201d`),
          h('div', { class: 'lp-foot-devlinks' },
            h('a', { class: 'lp-devlink', href: `mailto:${deps.DEV.email}` }, deps.devIcons.mail(), 'Email'),
            h('a', { class: 'lp-devlink', href: deps.DEV.linkedin, target: '_blank', rel: 'noopener noreferrer' }, deps.devIcons.linkedin(), 'LinkedIn'),
            h('a', { class: 'lp-devlink', href: deps.DEV.github, target: '_blank', rel: 'noopener noreferrer' }, deps.devIcons.github(), 'GitHub'),
          ),
        ),
      ),
    ),
    h('p', { class: 'lp-foot-legal' },
      deps.COPYRIGHT, ' · ',
      h('button', { class: 'lp-foot-link', onClick: () => deps.showLegal('privacy') }, 'Privacy'),
      ' · ',
      h('button', { class: 'lp-foot-link', onClick: () => deps.showLegal('terms') }, 'Terms'),
      ' · ',
      h('button', { class: 'lp-foot-link', onClick: () => deps.showFeedback() }, 'Feedback'),
    ),
  );

  const root = h('div', { class: `lp-root ${state.entered ? '' : 'lp-enter'}` },
    hero, nav, shelf, watch, how, table, trust, finale, footer,
  );
  state.entered = true;

  wireMotion(root, { hero, nav, canvas, rm });
  return root;
}

// ============================================================
// hero console: identity + create / join, one integrated CTA
// ============================================================
function buildConsole(deps) {
  const { h } = deps;

  const nameInput = h('input', {
    class: 'lp-name', type: 'text', maxlength: 18, placeholder: 'Your name',
    value: deps.prefs.name, 'data-preserve': 'home-name',
    autocomplete: 'off', autocorrect: 'off', spellcheck: 'false',
    enterkeyhint: 'go', 'aria-label': 'Your name',
  });

  const codeInput = h('input', {
    // No maxlength: a pasted invite must reach the paste handler intact so the
    // code can be pulled out of the whole message.
    class: 'lp-code', type: 'text', placeholder: 'CODE',
    'data-preserve': 'home-code', autocomplete: 'off',
    autocapitalize: 'characters', autocorrect: 'off', spellcheck: 'false',
    enterkeyhint: 'go', 'aria-label': 'Room code',
  });

  // ----- identity -----
  const commitIdentity = () => {
    const v = nameInput.value.trim();
    if (!v) {
      deps.toast('Tell us your name first!', 'error');
      deps.shake(nameInput);
      nameInput.focus();
      return false;
    }
    const isNew = !deps.prefs.name;
    deps.prefs.name = v;
    deps.prefs.avatar = state.avatar;
    if (isNew && !state.helloSent && deps.sendHello) {
      state.helloSent = true;
      deps.sendHello();
    }
    return true;
  };

  const avatarBtn = h('button', {
    class: 'lp-avatar', 'aria-label': 'Pick your avatar', 'aria-expanded': 'false',
    onClick: () => { state.trayOpen = !state.trayOpen; deps.sound.tap(); syncTray(); },
  }, state.avatar);
  const tray = h('div', { class: 'lp-tray' });

  const syncTray = () => {
    avatarBtn.replaceChildren(state.avatar);
    avatarBtn.setAttribute('aria-expanded', String(state.trayOpen));
    tray.hidden = !state.trayOpen;
    tray.replaceChildren(...deps.AVATARS.map((a) => h('button', {
      class: `lp-avopt ${a === state.avatar ? 'lp-sel' : ''}`,
      'aria-label': `Use avatar ${a}`,
      onClick: () => {
        state.avatar = a;
        deps.prefs.avatar = a;
        state.trayOpen = false;
        deps.sound.tap();
        syncTray();
      },
    }, a)));
  };
  syncTray();

  // ----- create -----
  const create = async (btn) => {
    if (!commitIdentity()) return;
    if (!deps.connected()) { deps.toast('Still connecting to the server. One moment.', 'error'); return; }
    btn.disabled = true;
    const label = [...btn.childNodes];
    btn.replaceChildren(h('span', { class: 'lp-spin', 'aria-hidden': 'true' }, '🌀'), ' Setting your table…');
    const res = await deps.onCreate();
    if (res && res.ok) deps.sound.woosh();
    else { btn.disabled = false; btn.replaceChildren(...label); deps.shake(btn); }
  };

  // ----- join -----
  const join = async (btn, codeOverride) => {
    if (!commitIdentity()) return;
    if (!deps.connected()) { deps.toast('Still connecting to the server. One moment.', 'error'); return; }
    const code = String(codeOverride || codeInput.value).trim().toUpperCase();
    if (code.length !== CODE_LEN) {
      deps.toast(`Room codes are ${CODE_LEN} characters.`, 'error');
      deps.shake(codeInput);
      codeInput.focus();
      return;
    }
    if (btn) btn.disabled = true;
    const res = await deps.onJoin(code);
    if (res && res.ok) { deps.sound.woosh(); state.inviteCode = null; }
    else if (btn) { btn.disabled = false; deps.shake(codeInput); }
  };

  // Paste the code, the link, or the whole invite message: the code is found.
  const acceptPastedText = (text, { autoJoin }) => {
    const code = deps.extractRoomCode(text);
    if (!code) {
      codeInput.value = String(text || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
      return false;
    }
    codeInput.value = code;
    codeInput.classList.add('lp-full');
    codeInput.setSelectionRange(code.length, code.length);
    if (autoJoin) {
      deps.toast(`Found room code ${code}, joining… 🎟️`, 'success');
      join(null);
    }
    return true;
  };
  codeInput.addEventListener('paste', (e) => {
    const text = e.clipboardData && e.clipboardData.getData('text');
    if (!text) return;
    e.preventDefault();
    acceptPastedText(text, { autoJoin: true });
  });
  codeInput.addEventListener('drop', (e) => {
    const text = e.dataTransfer && e.dataTransfer.getData('text');
    if (!text) return;
    e.preventDefault();
    acceptPastedText(text, { autoJoin: true });
  });
  // Live formatting: uppercase as you type, and light up once a full code is in.
  const formatCode = () => {
    codeInput.classList.toggle('lp-full', codeInput.value.trim().length === CODE_LEN);
  };
  codeInput.addEventListener('input', () => {
    const raw = codeInput.value;
    if (/^[A-Za-z0-9]{0,5}$/.test(raw)) codeInput.value = raw.toUpperCase();
    else acceptPastedText(raw, { autoJoin: false });
    formatCode();
  });
  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(joinBtn); });

  // ----- buttons and panel -----
  // One primary action per screen. A plain visit leads with "Create a room" and keeps
  // joining behind an expandable section; an invite flips that — one gold button joins
  // the invited room outright, and the expandable section becomes the rare "different
  // code" path. The code entry always lives INSIDE the section that opens it, so the
  // row of letter boxes never floats around unexplained.
  const createBtn = h('button', {
    class: 'lp-act lp-act-create', disabled: !deps.connected(),
    onClick: (e) => create(e.currentTarget),
  }, h('span', { class: 'lp-act-emoji', 'aria-hidden': 'true' }, '✨'),
    state.inviteCode ? 'Create my own room instead' : 'Create a room');

  const joinBtn = h('button', {
    class: 'lp-joingo', disabled: !deps.connected(),
    onClick: () => join(joinBtn),
  }, 'Join');

  // The invited player's one-tap entrance: joins the invited room directly, by the
  // invite's own code, even if the boxes below were edited toward somewhere else.
  // A returning player with a saved name shouldn't have to tap anything: opening the
  // invite IS the intent. Join the moment the socket is up — once. If the room is full
  // or gone, the toast explains and the console stays for the manual path.
  const autoJoining = Boolean(state.inviteCode && deps.prefs.name && !state.autoJoined);

  const inviteGo = state.inviteCode ? h('button', {
    class: 'lp-act lp-invitego', disabled: !deps.connected(),
    onClick: (e) => join(e.currentTarget, state.inviteCode),
  }, h('span', { class: 'lp-act-emoji', 'aria-hidden': 'true' }, '🎟️'),
    autoJoining && deps.connected() ? `Joining room ${state.inviteCode}…` : `Join room ${state.inviteCode}`) : null;

  if (autoJoining && deps.connected()) {
    state.autoJoined = true;
    setTimeout(async () => {
      await join(inviteGo, state.inviteCode);
      // Still here and re-enabled means the join was refused: the button goes back to
      // being an ordinary button instead of claiming to be mid-join forever.
      if (inviteGo && !inviteGo.disabled && inviteGo.isConnected) {
        inviteGo.lastChild.textContent = `Join room ${state.inviteCode}`;
      }
    }, 120);
  }

  const joinPanel = h('div', { class: 'lp-joinpanel' },
    h('div', { class: 'lp-joinrow' }, codeInput, joinBtn),
    h('p', { class: 'lp-join-hint' },
      'Ask whoever created the room for their 5-character code, it\'s on their screen.'),
  );

  const joinToggle = h('button', {
    class: 'lp-act lp-act-toggle', 'aria-expanded': 'false',
    onClick: () => {
      state.joinOpen = !state.joinOpen;
      deps.sound.tap();
      syncJoin();
      if (state.joinOpen) setTimeout(() => codeInput.focus(), 60);
    },
  }, h('span', { class: 'lp-act-emoji', 'aria-hidden': 'true' }, state.inviteCode ? '🔤' : '🎟️'),
    state.inviteCode ? 'Join a different room' : 'Join with a code',
    h('span', { class: 'lp-act-chev', 'aria-hidden': 'true' }, '▾'));

  const joinBox = h('div', { class: 'lp-joinbox' }, joinToggle, joinPanel);

  const syncJoin = () => {
    joinPanel.hidden = !state.joinOpen;
    joinBox.classList.toggle('lp-open', state.joinOpen);
    joinToggle.setAttribute('aria-expanded', String(state.joinOpen));
  };
  syncJoin();

  nameInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (state.inviteCode && !state.joinOpen) join(inviteGo, state.inviteCode);
    else if (state.joinOpen && codeInput.value.trim().length === CODE_LEN) join(joinBtn);
    else create(createBtn);
  });

  return h('div', { class: `lp-console ${state.inviteCode ? 'lp-invited' : ''}` },
    state.inviteCode && h('div', { class: 'lp-invite' },
      h('span', { class: 'lp-invite-key', 'aria-hidden': 'true' }, '🔑'),
      h('div', {},
        h('div', { class: 'lp-invite-title' }, `You're invited to room ${state.inviteCode}`),
        h('div', { class: 'lp-invite-sub' },
          autoJoining ? `Jumping straight in as ${deps.prefs.name}…` : 'Add a name and jump straight in.'),
      ),
    ),
    h('div', { class: 'lp-idrow' },
      avatarBtn,
      nameInput,
    ),
    tray,
    h('div', { class: 'lp-actions' },
      state.inviteCode ? [inviteGo, joinBox, createBtn] : [createBtn, joinBox]),
    !deps.connected() && h('div', { class: 'lp-conn', role: 'status' },
      h('span', { class: 'lp-spin', 'aria-hidden': 'true' }, '📡'),
      'Connecting to the game server…',
    ),
  );
}

// ============================================================
// watch a round — auto-playing mini-scenes of real gameplay.
// Copy stays honest to how the games actually play (lifted
// from the live game screens).
// ============================================================
function buildWatch(deps, rm, cardBack) {
  const { h } = deps;

  // A scene item that steps in on --di beats. Chips inside inherit --di.
  const ws = (di, cls, ...kids) => h('div', { class: `lp-ws ${cls}`, style: `--di:${di}` }, ...kids);

  const rxBar = (pairs) => h('span', { class: 'lp-ws-rx', 'aria-hidden': 'true' },
    pairs.map(([emoji, n], i) => h('span', { class: 'lp-ws-chip', style: `--rxi:${i}` },
      emoji, h('b', {}, String(n)))),
  );

  const clueRow = (di, avatar, name, you, clue, rx, suspect, word) =>
    ws(di, `lp-ws-clue ${suspect ? 'lp-sus' : ''}`,
      h('span', { class: 'lp-ws-av', 'aria-hidden': 'true' }, avatar),
      h('span', { class: 'lp-ws-body' },
        h('span', { class: 'lp-ws-name' }, name, you && h('i', { class: 'lp-ws-you' }, ' (you)'),
          word && h('span', { class: 'lp-ws-word' }, 'your word: ', h('b', {}, word)),
        ),
        h('span', { class: 'lp-ws-bubble' }, clue),
        rxBar(rx),
      ),
    );

  const verdict = (di, text) => ws(di, 'lp-ws-verdict', text);

  const blendIn = () => [
    ws(0, 'lp-ws-round', 'Round 1 · everyone clues their secret word'),
    clueRow(1, '🦊', 'Saaru', false, 'bitter', [['🤔', 2]]),
    clueRow(2, '🐼', 'Tushita', false, 'morning fuel', [['🔥', 3], ['😂', 1]]),
    clueRow(3, '🦉', 'Dinesh', false, 'leafy?', [['🧐', 2], ['😂', 3]], true),
    clueRow(4, '🐙', 'Ankit', true, 'espresso vibes', [['😂', 4]], false, 'Coffee'),
    verdict(5, '🗳️ Voted out: Dinesh. He had “Tea”, everyone else had “Coffee”. Classic Dinesh.'),
  ];

  const tile = (di, avatar, name, you, mark, sub, cls) =>
    ws(di, `lp-ws-tile ${cls || ''}`,
      mark && h('span', { class: 'lp-ws-mark', 'aria-hidden': 'true' }, mark),
      h('span', { class: 'lp-ws-tav', 'aria-hidden': 'true' }, avatar),
      h('span', { class: 'lp-ws-tname' }, name, you && h('i', { class: 'lp-ws-you' }, ' (you)')),
      h('span', { class: 'lp-ws-tsub' }, sub),
    );

  const packItem = (di, word, by, no) =>
    ws(di, `lp-ws-pack ${no ? 'lp-no' : ''}`,
      h('span', { class: 'lp-ws-pword' }, word),
      h('span', { class: 'lp-ws-pby' }, by),
    );

  const island = () => [
    ws(0, 'lp-ws-banner',
      '🏝️ “I\'m going to an island and I\'m bringing ',
      h('b', {}, 'Heart & Window'),
      ' …what else can come aboard?”'),
    h('div', { class: 'lp-ws-tiles' },
      tile(1, '🐙', 'Ankit', true, '🥇', 'cracked it! · 8 pts'),
      tile(2, '🦋', 'Ranjani', false, '', 'their turn…', 'lp-turn'),
      tile(3, '🦉', 'Dinesh', false, '', 'still thinking…'),
    ),
    h('div', { class: 'lp-ws-packs' },
      h('div', { class: 'lp-ws-pcol' },
        h('div', { class: 'lp-ws-phead' }, '✅ On the boat'),
        packItem(2, 'Heart', '🤖 AI'),
        packItem(3, 'Promise', '🐢 Trupti'),
        packItem(4, 'Record', '🦊 Saaru'),
      ),
      h('div', { class: 'lp-ws-pcol' },
        h('div', { class: 'lp-ws-phead' }, '🚫 Left behind'),
        packItem(4, 'Pillow', '💀 Dinesh', true),
      ),
    ),
    ws(5, 'lp-ws-attempt lp-ws-ok',
      h('span', { class: 'lp-ws-atv', 'aria-hidden': 'true' }, '✅'),
      h('span', {},
        h('span', { class: 'lp-ws-att' }, 'Ranjani asks: can “Mirror” come aboard?'),
        h('span', { class: 'lp-ws-atr' }, 'Aboard! Every yes is a clue to the secret rule.'),
      ),
    ),
    ws(6, 'lp-ws-attempt',
      h('span', { class: 'lp-ws-atv', 'aria-hidden': 'true' }, '🚫'),
      h('span', {},
        h('span', { class: 'lp-ws-att' }, 'Can I bring “Pillow”?'),
        h('span', { class: 'lp-ws-atr' }, 'The boat says no. Bold choice, Dinesh.'),
      ),
    ),
    verdict(7, '💡 Ankit: “things that can break!” Cracked it 🥇'),
  ];

  // Third mini-scene: the card table deals a trick to four named seats.
  const dealSeat = (di, name, you, face) =>
    ws(di, 'lp-ws-seat',
      h('span', { class: 'lp-ws-card' },
        face
          ? h('span', { class: 'lp-pcard lp-pc-front lp-ws-face' }, face)
          : cardBack('lp-ws-back'),
      ),
      h('span', { class: 'lp-ws-sname' }, name, you && h('i', { class: 'lp-ws-you' }, ' (you)')),
    );

  // A pile-value marker: the number the table has climbed to so far.
  const pileVal = (di, n, by) =>
    ws(di, 'lp-ws-pile',
      h('b', { class: 'lp-ws-pilen' }, n),
      h('span', { class: 'lp-ws-pileby' }, by),
    );

  const cardsScene = () => [
    ws(0, 'lp-ws-round', 'Silent Order · play every card lowest to highest · no talking, no turns'),
    h('div', { class: 'lp-ws-deal' },
      dealSeat(1, 'Saaru', false, '2'),
      dealSeat(1, 'Dinesh', false, '3'),
      dealSeat(1, 'Trupti', false, '4'),
      dealSeat(1, 'Ankit', true, '7'),
    ),
    ws(2, 'lp-ws-attempt lp-ws-ok',
      h('span', { class: 'lp-ws-atv', 'aria-hidden': 'true' }, '🃏'),
      h('span', {},
        h('span', { class: 'lp-ws-att' }, 'Saaru feels hers is the lowest and opens with her 2.'),
        h('span', { class: 'lp-ws-atr' }, 'Now the pile can only climb. Play too early and the level is lost.'),
      ),
    ),
    h('div', { class: 'lp-ws-pilerow', 'aria-label': 'The pile climbs' },
      pileVal(3, '2', 'Saaru'),
      pileVal(3.7, '3', 'Dinesh'),
      pileVal(5.6, '4', 'Trupti'),
      pileVal(6.2, '7', 'you'),
    ),
    ws(4.5, 'lp-ws-attempt',
      h('span', { class: 'lp-ws-atv', 'aria-hidden': 'true' }, '👀'),
      h('span', {},
        h('span', { class: 'lp-ws-att' }, 'Two cards left. Trupti and Ankit both reach for the pile…'),
        h('span', { class: 'lp-ws-atr' }, 'She reads the whole table\'s silence and slides her 4 a heartbeat before Ankit\'s 7. Flawless.'),
      ),
    ),
    verdict(7, '🕯️ Level cleared! Four cards, perfect order, not a word spoken.'),
  ];

  // Swap or Stay: one card each, a swap gets bounced by a Sentinel. Played for
  // laughs at nobody's expense.
  // The table itself: six seats plus the deck. The swaps are the real choreography:
  // the first seat's card (its value riding along as a chip) arcs into the next seat
  // and that card comes back, the low card travels on, then lunges at the Sentinel
  // holder and is bounced. Finally the last seat, with nobody left to swap with,
  // throws its card back and draws blind from the deck. Story text waits for motion.
  const ssSeat = (name, you, moveCls, chip) => h('span', { class: 'lp-ssseat' },
    h('span', { class: `lp-ssb ${moveCls || ''}`, 'aria-hidden': 'true' },
      chip && h('span', { class: 'lp-ssv' }, chip)),
    h('span', { class: 'lp-ws-sname' }, name, you && h('i', { class: 'lp-ws-you' }, ' (you)')),
  );
  const swapScene = () => [
    ws(0, 'lp-ws-round', 'Swap or Stay · one card each, swaps go around the table · lowest at the reveal loses a heart'),
    h('div', { class: 'lp-ssrow', style: '--di:0.8', 'aria-label': 'Cards swap around the table, the Sentinel blocks, and the last seat draws from the deck' },
      ssSeat('Ankit', true, 'lp-ssm-a', '2'), ssSeat('Saaru', false, 'lp-ssm-b', '58'), ssSeat('Ranjani', false, 'lp-ssm-c', '34'),
      ssSeat('Mrunali', false, '', '🛡️'), ssSeat('Dinesh', false, '', '41'), ssSeat('Trupti', false, 'lp-ssm-t', '3'),
      h('span', { class: 'lp-ssseat lp-ssdeckseat' },
        h('span', { class: 'lp-ssb lp-ssdeckbase', 'aria-hidden': 'true' }),
        h('span', { class: 'lp-ssb lp-ssdc', 'aria-hidden': 'true' }, h('span', { class: 'lp-ssv' }, '?')),
        h('span', { class: 'lp-ws-sname' }, 'Deck'),
      ),
      h('span', { class: 'lp-ssshield', 'aria-hidden': 'true' }, '🛡️'),
    ),
    // Everything below waits for the choreography (ends ~9.6s in).
    ws(15, 'lp-ws-attempt',
      h('span', { class: 'lp-ws-atv', 'aria-hidden': 'true' }, '🃏'),
      h('span', {},
        h('span', { class: 'lp-ws-att' }, 'Ankit had the option to stay or swap with Saaru. His number was 2, of course he swapped.'),
        h('span', { class: 'lp-ws-atr' }, 'Saaru peeks at what she got, gasps, and swaps it on to Ranjani.'),
      ),
    ),
    ws(15.9, 'lp-ws-rxline', rxBar([['😂', 4], ['😱', 1]])),
    ws(16.7, 'lp-ws-attempt',
      h('span', { class: 'lp-ws-atv', 'aria-hidden': 'true' }, '🛡️'),
      h('span', {},
        h('span', { class: 'lp-ws-att' }, 'Ranjani tries to pass it to Mrunali… BLOCKED!'),
        h('span', { class: 'lp-ws-atr' }, 'Mrunali holds a Sentinel 🛡️, the guard card that refuses every swap and never loses. Dinesh stays put.'),
      ),
    ),
    ws(17.6, 'lp-ws-rxline', rxBar([['😱', 3], ['😂', 2]])),
    ws(18.4, 'lp-ws-attempt lp-ws-ok',
      h('span', { class: 'lp-ws-atv', 'aria-hidden': 'true' }, '🎲'),
      h('span', {},
        h('span', { class: 'lp-ws-att' }, 'Trupti sits in the last seat, nobody left to swap with. Her rule: stay, or draw blind from the deck.'),
        h('span', { class: 'lp-ws-atr' }, 'Her 3 feels dangerously low, and she has no idea what the lowest card is. She throws it back and tries her luck.'),
      ),
    ),
    ws(19.3, 'lp-ws-rxline', rxBar([['😱', 4], ['😂', 1]])),
    ws(20.2, 'lp-ws-round', 'Cards up! Everyone reveals at once:'),
    h('div', { class: 'lp-ws-deal lp-ws-deal6' },
      dealSeat(20.8, 'Ankit', true, '58'),
      dealSeat(20.8, 'Saaru', false, '34'),
      dealSeat(20.8, 'Ranjani', false, '2'),
      dealSeat(20.8, 'Mrunali', false, '🛡️'),
      dealSeat(20.8, 'Dinesh', false, '41'),
      dealSeat(20.8, 'Trupti', false, '47'),
    ),
    verdict(22.6, '💔 Ranjani\'s 2 is the lowest card, she loses a heart. And Trupti\'s gamble paid off: the deck handed her a 47.'),
  ];

  // Sleepless: first the cast — every role explained — then the night/dawn/day
  // loop with all four points of view side by side, so a stranger watching
  // understands both who does what and how a round actually flows.
  const sleeplessScene = () => [
    ws(0, 'lp-ws-round', 'Sleepless · 6 players, three roles dealt in secret, here is what each one does'),
    h('div', { class: 'lp-ws-tiles' },
      tile(0.6, '🥷', 'Dinesh', false, '', h('span', {}, h('b', {}, 'Prowler · '), 'taps one name each night; that player never wakes')),
      tile(1.1, '🩺', 'Mrunali', false, '', h('span', {}, h('b', {}, 'Medic · '), 'taps one door to guard; a guarded kill fails, never the same door twice in a row')),
      tile(1.6, '😴', 'Ankit', true, '', h('span', {}, h('b', {}, 'Sleeper · '), 'everyone else, no night power at all. Their game is the daytime.')),
    ),
    ws(2.4, 'lp-ws-round', '🌙 Night 1 · 6 asleep · everyone answers the same sum and taps “ready to sleep”'),
    h('div', { class: 'lp-ws-tiles' },
      tile(2.8, '🧮', 'Everyone', false, '⌨️', '“7 × 6 + 4 = ?”, six phones, six people typing'),
      tile(3.2, '🥷', 'Dinesh', false, '🤫', 'answers 46… and quietly taps Tushita'),
      tile(3.6, '🩺', 'Mrunali', false, '🤫', 'answers 46… and quietly taps Ankit'),
    ),
    ws(4.4, 'lp-ws-banner', '🌙 Nobody can tell who did what. Every screen was busy, every thumb was moving, and the night only ends when the last answer lands.'),
    ws(5.1, 'lp-ws-banner', '🌅 Dawn 1: Tushita is dead, the guard was on the wrong door. Death reveals her card: she was a Sleeper. Nobody learned anything else in the night.'),
    ws(5.8, 'lp-ws-round', '☀️ Day 1 · 5 alive · argue, then vote, sealed until everyone has cast one'),
    clueRow(6.2, '🐢', 'Trupti', false, 'Dinesh answered in four seconds flat. Nobody is that fast AND innocent.', [['😂', 3]]),
    clueRow(6.7, '🥷', 'Dinesh', false, 'I am good at maths. That is the entire accusation? Really?', [['😂', 4]]),
    clueRow(7.2, '🦊', 'Saaru', false, 'Careful. Whoever we burn today, we lose one more tonight.', [['🧐', 3]]),
    ws(7.8, 'lp-ws-attempt lp-ws-ok',
      h('span', { class: 'lp-ws-atv', 'aria-hidden': 'true' }, '🗳️'),
      h('span', {},
        h('span', { class: 'lp-ws-att' }, 'Votes open all at once: no majority.'),
        h('span', { class: 'lp-ws-atr' }, 'Nobody is voted out. The village goes back to sleep uneasy.'),
      ),
    ),
    ws(8.4, 'lp-ws-round', '🌙 Night 2 · 5 asleep · a new sum, and the Medic must move'),
    h('div', { class: 'lp-ws-tiles' },
      tile(8.8, '🧮', 'Everyone', false, '⌨️', '“9 + 8 + 3 = ?”, five phones, five people typing'),
      tile(9.2, '🥷', 'Dinesh', false, '🤫', 'taps Saaru'),
      tile(9.6, '🩺', 'Mrunali', false, '🤫', 'taps Saaru, a different door from last night'),
    ),
    ws(10.4, 'lp-ws-banner', '🌅 Dawn 2: nobody died. Someone was attacked and survived, the table is never told who was hit, or who guarded. The Medic stays hidden.'),
    ws(11.0, 'lp-ws-round', '☀️ Day 2 · 5 alive · the argument gets sharper'),
    clueRow(11.4, '😴', 'Ankit', true, 'Two nights, one save. Somebody here is guarding well, and somebody is hunting. Neither will say so.', [['🧐', 3]]),
    clueRow(11.9, '🐢', 'Trupti', false, 'Dinesh has talked past every question so far. That is my vote.', [['😱', 2]]),
    ws(12.5, 'lp-ws-attempt lp-ws-ok',
      h('span', { class: 'lp-ws-atv', 'aria-hidden': 'true' }, '🗳️'),
      h('span', {},
        h('span', { class: 'lp-ws-att' }, 'Sealed votes, opened all at once…'),
        h('span', { class: 'lp-ws-atr' }, 'Four names point the same way. No proof, just a read.'),
      ),
    ),
    verdict(13.2, '🌅 Dinesh is voted out, his card flips: the Prowler, all along. The village guessed right, on nothing but the talking.'),
  ];

  const SCENES = [
    { name: 'Blend In', emoji: '🕵️', build: blendIn, cap: 'One of them got a different word. Watch the clues give it away.' },
    { name: 'Island Rules', emoji: '🏝️', build: island, cap: 'The boat has a secret rule. Guess items, read the pattern, crack it.' },
    { name: 'Silent Order', emoji: '🃏', build: cardsScene, cap: 'A cooperative trick: everyone must play in silence, in order.' },
    { name: 'Swap or Stay', emoji: '🔁', build: swapScene, cap: 'One card each. Swap it, keep it, or guard it, lowest card pays.' },
    { name: 'Sleepless', emoji: '🌙', build: sleeplessScene, cap: 'Social deduction after dark: someone prowls, the village votes.' },
  ];

  const title = h('span', { class: 'lp-watch-title' });
  // The picker: one emoji tab per game. Real buttons, so keyboard and screen
  // readers get them for free. Picking a tab pins that scene: it replays on a
  // loop so the reader can take their time, and the tour only resumes once the
  // frame scrolls out of view.
  const dots = h('span', { class: 'lp-watch-dots', role: 'group', 'aria-label': 'Choose a game preview' });
  const stage = h('div', { class: 'lp-watch-stage' });
  const cap = h('p', { class: 'lp-watch-cap' });
  const pinNote = h('span', { class: 'lp-watch-pin', 'aria-live': 'polite' });

  let idx = 0, timer = 0, running = false, pinned = false;
  const show = (i) => {
    idx = i % SCENES.length;
    const s = SCENES[idx];
    title.replaceChildren(`${s.emoji} ${s.name}`);
    cap.replaceChildren(s.cap);
    pinNote.replaceChildren(pinned ? '📌 holding this one, scroll on to resume the tour' : '');
    dots.replaceChildren(...SCENES.map((sc, d) =>
      h('button', {
        class: `lp-watch-tab ${d === idx ? 'lp-on' : ''}`,
        'aria-label': `Watch ${sc.name}`,
        'aria-pressed': String(d === idx),
        onClick: () => { deps.sound.tap(); pinned = true; show(d); },
      }, sc.emoji)));
    stage.replaceChildren(...s.build());
    const beats = stage.querySelectorAll('.lp-ws').length;
    if (timer) clearTimeout(timer);
    // Reduced motion shows the finished scene and just rotates slowly. A
    // pinned scene renders once and then holds still so it can be read;
    // the tour resumes only after the reader scrolls the frame away.
    if (pinned) return;
    timer = setTimeout(() => {
      if (running && !pinned) show(idx + 1);
    }, rm ? 9000 : 1400 + beats * 640 + 3400);
  };

  const frame = h('div', { class: `lp-watch-frame lp-reveal ${rm ? '' : 'lp-anim'}` },
    h('div', { class: 'lp-watch-head' },
      h('span', { class: 'lp-watch-live' }, h('span', { class: 'lp-watch-pulse', 'aria-hidden': 'true' }), 'live preview'),
      title,
      dots,
    ),
    stage,
    cap,
    pinNote,
  );

  // Play only while on screen (and restart the current scene when returning).
  const io = new IntersectionObserver((entries) => {
    const en = entries[entries.length - 1];
    const on = en.isIntersecting && !document.hidden;
    if (on && !running) { running = true; frame.classList.add('lp-run'); show(idx); }
    else if (!on && running) {
      running = false;
      pinned = false; // leaving the frame releases a held preview
      frame.classList.remove('lp-run');
      if (timer) { clearTimeout(timer); timer = 0; }
    }
  }, { threshold: 0.3 });
  io.observe(frame);
  onCleanup(() => { io.disconnect(); if (timer) { clearTimeout(timer); timer = 0; } running = false; });

  return h('section', { class: 'lp-sec lp-watch', id: 'lp-watch', 'aria-label': 'Watch a round' },
    sectionHead(h, 'Watch a round', 'See a round play itself.',
      'These are the real game screens with a real crew, clues, reactions and verdicts exactly as they land on your phones.'),
    frame,
  );
}

// ============================================================
// section pieces
// ============================================================
function sectionHead(h, eyebrow, title, sub) {
  // Each word of the title is its own tile so it can deal itself in like a
  // hand of letter cards when the section reveals. Screen readers get the
  // whole line via aria-label; the tiles are decoration.
  const words = String(title).split(' ');
  return h('header', { class: 'lp-shead lp-reveal' },
    h('p', { class: 'lp-eyebrow' }, eyebrow),
    h('h2', { class: 'lp-h2', 'aria-label': title },
      words.map((w, i) => [
        h('span', { class: 'lp-h2w', style: `--wi:${i}`, 'aria-hidden': 'true' }, w),
        i < words.length - 1 ? ' ' : '',
      ]),
    ),
    sub && h('p', { class: 'lp-ssub' }, sub),
  );
}

function navBtn(deps, target, label) {
  return deps.h('button', {
    class: 'lp-nav-btn',
    'data-lpt': target,
    onClick: () => { deps.sound.tap(); scrollToSection(target); },
  }, label);
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
}

// "We are N" — dial in tonight's headcount and the shelf answers which games fit.
function headcount(deps) {
  const { h } = deps;
  let n = 5;         // starts where every game fits…
  let touched = false; // …but nothing dims until the dial is actually used.
  const label = h('span', { class: 'lp-hc-n' }, '5');
  const note = h('span', { class: 'lp-hc-note' }, '');
  const apply = () => {
    label.textContent = String(n);
    const fits = deps.GAMES.filter((g) => n >= (g.minPlayers || 1) && n <= (g.maxPlayers || 99));
    note.textContent = !touched ? ''
      : fits.length === deps.GAMES.length ? 'Every game fits tonight.'
      : fits.length ? `${fits.length} of ${deps.GAMES.length} games fit tonight`
      : 'That is a lot of friends. Split into two rooms!';
    document.querySelectorAll('.lp-gcard').forEach((card, i) => {
      const g = deps.GAMES[i];
      const ok = !touched || (n >= (g.minPlayers || 1) && n <= (g.maxPlayers || 99));
      card.classList.toggle('lp-gc-dim', !ok);
    });
  };
  const step = (d) => { touched = true; n = Math.max(2, Math.min(16, n + d)); deps.sound.tick(); apply(); };
  // The shelf mounts after this control, so the first paint waits one frame.
  requestAnimationFrame(apply);
  return h('div', { class: 'lp-hc' },
    h('span', { class: 'lp-hc-label' }, 'We are'),
    h('button', { class: 'lp-hc-btn', 'aria-label': 'fewer players', onClick: () => step(-1) }, '−'),
    label,
    h('button', { class: 'lp-hc-btn', 'aria-label': 'more players', onClick: () => step(1) }, '+'),
    h('span', { class: 'lp-hc-label' }, 'players.'),
    note,
  );
}

function gameCard(deps, g, i) {
  const { h } = deps;
  const accent = ACCENTS[g.accent] || GOLD_HEX;
  const card = h('button', {
    class: 'lp-gcard',
    style: `--a:${accent}`,
    onClick: () => { deps.sound.tap(); deps.showRules(g.id); },
  },
    // The key art sits behind the copy, screen-blended so the black it was shot on
    // drops out and the lit figures rise straight off the card.
    g.art && h('picture', { class: 'lp-gcard-art', 'aria-hidden': 'true' },
      h('source', { srcset: `${g.art}.webp`, type: 'image/webp' }),
      h('img', { src: `${g.art}.jpg`, alt: '', loading: 'lazy', decoding: 'async' }),
    ),
    h('span', { class: 'lp-gcard-glare', 'aria-hidden': 'true' }),
    h('span', { class: 'lp-gcard-sweep', 'aria-hidden': 'true' }),
    h('span', { class: 'lp-gcard-pip lp-tl', 'aria-hidden': 'true' }, g.emoji),
    h('span', { class: 'lp-gcard-pip lp-br', 'aria-hidden': 'true' }, g.emoji),
    // Hover bloom: three tiny card backs fan open behind the emoji in this
    // game's accent. Decorative only; appears on fine-pointer hover/focus.
    h('span', { class: 'lp-gbloom', 'aria-hidden': 'true' },
      Array.from({ length: 3 }, (_, b) => h('span', { class: 'lp-gbcard', style: `--gi:${b - 1}` })),
    ),
    h('span', { class: 'lp-gcard-emoji', 'aria-hidden': 'true' }, g.emoji),
    h('span', { class: 'lp-gcard-title' }, g.title),
    h('span', { class: 'lp-gcard-tagline' }, g.tagline),
    h('span', { class: 'lp-gcard-meta' },
      (g.tags || []).map((t) => h('span', {
        class: 'lp-chip',
        title: t.startsWith('🎥') ? 'Best when everyone is together on a group call, faces visible.' : null,
      }, t)),
    ),
    h('span', { class: 'lp-gcard-cta' }, 'How to play', h('span', { class: 'lp-gcard-arrow', 'aria-hidden': 'true', html: svgArrow() })),
  );
  attachTilt(card);
  return deps.h('div', { class: 'lp-gslot lp-reveal', style: `--ri:${i}` }, card);
}

function step(h, i, title, body, vignette) {
  return h('div', { class: 'lp-step lp-reveal', style: `--ri:${i}` },
    vignette,
    h('div', { class: 'lp-step-num', 'aria-hidden': 'true' }, String(i + 1)),
    h('h3', { class: 'lp-step-title' }, title),
    h('p', { class: 'lp-step-body' }, body),
  );
}

// P4RTY only uses characters that can appear in a real room code (no O/0, no I/1).
function vignetteCode(h) {
  return h('div', { class: 'lp-vg lp-vg-code', 'aria-hidden': 'true' },
    [...'P4RTY'].map((c, i) => h('span', { class: 'lp-ctile', style: `--ti:${i}` }, c)),
  );
}

function vignetteShare(h) {
  return h('div', { class: 'lp-vg lp-vg-share', 'aria-hidden': 'true' },
    h('span', { class: 'lp-vg-felt' }),
    h('span', { class: 'lp-vg-codechip' }, 'P4RTY'),
    h('span', { class: 'lp-phone lp-ph-a' }, h('span', { class: 'lp-phone-scr' })),
    h('span', { class: 'lp-phone lp-ph-b' }, h('span', { class: 'lp-phone-scr' })),
    h('span', { class: 'lp-phone lp-ph-c' }, h('span', { class: 'lp-phone-scr' })),
  );
}

function vignetteDeal(h, cardBack) {
  return h('div', { class: 'lp-vg lp-vg-deal', 'aria-hidden': 'true' },
    h('span', { class: 'lp-flip' },
      cardBack('lp-pc-flipback'),
      h('span', { class: 'lp-pcard lp-pc-front lp-pc-flipfront' }, '🎭'),
    ),
  );
}

// The mini tableau: felt, a deck in the middle, five cards dealt to the near arc.
// Static by design (the section copy says so); the deal-in plays once on reveal.
function tableau(h, cardBack) {
  const seats = [
    { x: -36, y: 4, r: -14, fx: 250, fy: -60 },
    { x: -19, y: 12, r: -7, fx: 130, fy: -95 },
    { x: 0, y: 15, r: 0, front: true, fx: 0, fy: -110 },
    { x: 19, y: 12, r: 7, fx: -130, fy: -95 },
    { x: 36, y: 4, r: 14, fx: -250, fy: -60 },
  ];
  return h('div', { class: 'lp-stage lp-reveal', 'aria-hidden': 'true' },
    h('div', { class: 'lp-felt' }),
    h('div', { class: 'lp-candle' }),
    h('div', { class: 'lp-deck' },
      cardBack('lp-deckcard lp-d1'),
      cardBack('lp-deckcard lp-d2'),
      cardBack('lp-deckcard lp-d3'),
    ),
    seats.map((s, i) => h('div', {
      class: `lp-seat ${s.front ? 'lp-seat-front' : ''}`,
      style: `--sx:${s.x}%; --sy:${s.y}%; --sr:${s.r}deg; --si:${i}; --fx:${s.fx}%; --fy:${s.fy}%`,
    },
      s.front
        ? h('span', { class: 'lp-pcard lp-pc-front lp-pc-seat' }, '🎭')
        : i === 4
          // The rightmost card is dealt face down, then turns over to reveal 42.
          ? h('span', { class: 'lp-fliphold lp-pc-seat' },
              h('span', { class: 'lp-tflip' },
                cardBack('lp-pc-tback'),
                h('span', { class: 'lp-pcard lp-pc-front lp-pc-tfront' }, h('b', { class: 'lp-42' }, '42')),
              ),
            )
          : cardBack('lp-pc-seat'),
    )),
  );
}

function trustItem(h, i, icon, title, body) {
  return h('div', { class: 'lp-trust-item lp-reveal', style: `--ri:${i}` },
    h('span', { class: 'lp-tico', 'aria-hidden': 'true', html: icon }),
    h('div', {},
      h('div', { class: 'lp-trust-title' }, title),
      h('div', { class: 'lp-trust-body' }, body),
    ),
  );
}

// ============================================================
// motion: reveals, scroll progress, canvas, parallax
// ============================================================
function wireMotion(root, { hero, nav, canvas, rm }) {
  // ----- section reveals -----
  const reveals = [...root.querySelectorAll('.lp-reveal')];
  reveals.forEach((el, i) => { el.dataset.lpk = `r${i}`; });
  if (rm) {
    for (const el of reveals) el.classList.add('lp-on');
  } else {
    const pendings = [];
    for (const el of reveals) {
      if (state.revealed.has(el.dataset.lpk)) el.classList.add('lp-on');
      else pendings.push(el);
    }
    if (pendings.length) {
      const io = new IntersectionObserver((entries) => {
        for (const en of entries) {
          if (!en.isIntersecting) continue;
          en.target.classList.add('lp-on');
          state.revealed.add(en.target.dataset.lpk);
          io.unobserve(en.target);
        }
      }, { rootMargin: '0px 0px -9% 0px', threshold: 0.12 });
      for (const el of pendings) io.observe(el);
      onCleanup(() => io.disconnect());
    }
  }

  // ----- finale fan: blooms every time it comes on screen -----
  const fin = root.querySelector('.lp-cta-inner');
  if (fin && !rm) {
    const bio = new IntersectionObserver((entries) => {
      const en = entries[entries.length - 1];
      fin.classList.toggle('lp-bloom', en.isIntersecting);
    }, { threshold: 0.35 });
    bio.observe(fin);
    onCleanup(() => bio.disconnect());
  }

  // ----- hero progress: the fan deals itself away; the mini-nav arrives -----
  // Cheap scroll choreography: an observer with many thresholds, transforms
  // smoothed by a CSS transition. No scroll listeners, no layout reads per frame.
  const motes = rm ? null : startMotes(canvas);
  if (motes) onCleanup(motes.stop);

  const thresholds = Array.from({ length: 41 }, (_, i) => i / 40);
  const pio = new IntersectionObserver((entries) => {
    const en = entries[entries.length - 1];
    const rect = en.boundingClientRect;
    const p = Math.min(1, Math.max(0, -rect.top / Math.max(1, rect.height * 0.72)));
    hero.style.setProperty('--dealp', p.toFixed(3));
    nav.classList.toggle('lp-show', p > 0.55);
    if (motes) motes.setRunning(en.isIntersecting && !document.hidden);
  }, { threshold: thresholds });
  pio.observe(hero);
  onCleanup(() => pio.disconnect());

  // ----- scroll-progress hairline in the mini-nav -----
  // A passive listener that only reads window.scrollY and writes one transform.
  // Document height is cached by a ResizeObserver, so no layout reads per frame.
  const prog = nav.querySelector('.lp-nav-prog');
  if (prog) {
    let span = 1;
    const sro = new ResizeObserver(() => {
      span = Math.max(1, root.scrollHeight - window.innerHeight);
    });
    sro.observe(root);
    let raf = 0;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const p = Math.min(1, Math.max(0, window.scrollY / span));
        prog.style.transform = `scaleX(${p.toFixed(4)})`;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    onCleanup(() => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
      sro.disconnect();
    });
  }

  // ----- scrollspy: the mini-nav underlines the section you are in -----
  // One observer over the five anchor sections; the most recently intersecting
  // one wins. Class toggles only, so nothing is measured.
  {
    const btns = [...nav.querySelectorAll('.lp-nav-btn')];
    const setCur = (id) => {
      for (const b of btns) b.classList.toggle('lp-cur', b.dataset.lpt === id);
    };
    const spy = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (en.isIntersecting) setCur(en.target.id);
      }
    }, { rootMargin: '-38% 0px -52% 0px' });
    for (const b of btns) {
      const sec = root.querySelector(`#${b.dataset.lpt}`);
      if (sec) spy.observe(sec);
    }
    onCleanup(() => spy.disconnect());
  }

  if (motes) {
    const onVis = () => {
      if (!canvas.isConnected) { document.removeEventListener('visibilitychange', onVis); return; }
      motes.setRunning(!document.hidden);
    };
    document.addEventListener('visibilitychange', onVis);
    onCleanup(() => document.removeEventListener('visibilitychange', onVis));
  }

  // ----- desktop candlelight: a soft glow trails the pointer -----
  // One fixed element moved by transform inside a rAF; the CSS transition on
  // transform gives it a candle-like lag. Fine pointers only, never under
  // reduced motion, and it disappears with the node on cleanup.
  if (canHoverTilt()) {
    const glow = document.createElement('div');
    glow.className = 'lp-glow';
    glow.setAttribute('aria-hidden', 'true');
    root.appendChild(glow);
    let graf = 0, gx = 0, gy = 0;
    const gmove = (e) => {
      gx = e.clientX; gy = e.clientY;
      if (graf) return;
      graf = requestAnimationFrame(() => {
        graf = 0;
        glow.style.transform = `translate3d(${gx}px, ${gy}px, 0)`;
        glow.classList.add('lp-glow-on');
      });
    };
    const gout = () => glow.classList.remove('lp-glow-on');
    window.addEventListener('pointermove', gmove, { passive: true });
    document.documentElement.addEventListener('pointerleave', gout);
    onCleanup(() => {
      if (graf) cancelAnimationFrame(graf);
      window.removeEventListener('pointermove', gmove);
      document.documentElement.removeEventListener('pointerleave', gout);
      glow.remove();
    });
  }

  // ----- ambient hero parallax: a couple of degrees, pointer only -----
  if (canHoverTilt()) {
    let raf = 0;
    const move = (e) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = hero.getBoundingClientRect();
        const dx = ((e.clientX - (r.left + r.width / 2)) / r.width) * 2;
        const dy = ((e.clientY - (r.top + r.height / 2)) / r.height) * 2;
        hero.style.setProperty('--hx', dx.toFixed(3));
        hero.style.setProperty('--hy', dy.toFixed(3));
      });
    };
    const leave = () => {
      hero.style.setProperty('--hx', '0');
      hero.style.setProperty('--hy', '0');
    };
    hero.addEventListener('pointermove', move);
    hero.addEventListener('pointerleave', leave);
    onCleanup(() => {
      if (raf) cancelAnimationFrame(raf);
      hero.removeEventListener('pointermove', move);
      hero.removeEventListener('pointerleave', leave);
    });
  }
}

// 3D tilt + glare for a shelf card. Listeners live on the card itself, so they
// vanish with the node; nothing to unregister.
function attachTilt(card) {
  if (!canHoverTilt()) return;
  card.addEventListener('pointermove', (e) => {
    const r = card.getBoundingClientRect();
    const dx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
    const dy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
    card.style.setProperty('--tx', (dy * -4).toFixed(2) + 'deg');
    card.style.setProperty('--ty', (dx * 5).toFixed(2) + 'deg');
    // Magnetic pull: the card leans a few px toward the cursor. Fine pointers only.
    card.style.setProperty('--mvx', (dx * 4).toFixed(2) + 'px');
    card.style.setProperty('--mvy', (dy * 3).toFixed(2) + 'px');
    card.style.setProperty('--gx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
    card.style.setProperty('--gy', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
  });
  card.addEventListener('pointerleave', () => {
    card.style.setProperty('--tx', '0deg');
    card.style.setProperty('--ty', '0deg');
    card.style.setProperty('--mvx', '0px');
    card.style.setProperty('--mvy', '0px');
  });
}

// ============================================================
// the hero canvas: candlelight motes and tumbling card backs
// ============================================================
// Deliberately quiet. A few dozen gold specks drifting upward with a slow
// twinkle, and a handful of tiny card backs falling like the end of a shuffle.
// Pauses when the hero is off screen or the tab is hidden; never runs at all
// under prefers-reduced-motion (the CSS glow stands in).
function startMotes(canvas) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  let w = 0, ht = 0, dpr = 1;
  let motes = [], cards = [];
  let raf = 0, running = false, last = 0, stopped = false;

  const rand = (a, b) => a + Math.random() * (b - a);

  function seed() {
    const area = w * ht;
    const nMotes = Math.round(Math.min(80, Math.max(26, area / 26000)));
    const nCards = Math.round(Math.min(7, Math.max(3, area / 260000)));
    motes = Array.from({ length: nMotes }, () => ({
      x: rand(0, w), y: rand(0, ht),
      r: rand(0.6, 1.9),
      vy: rand(5, 13),
      sway: rand(6, 22), swayF: rand(0.12, 0.4), phase: rand(0, Math.PI * 2),
      a: rand(0.1, 0.42), twF: rand(0.3, 1.1),
      ivory: Math.random() < 0.28,
    }));
    cards = Array.from({ length: nCards }, () => ({
      x: rand(0, w), y: rand(0, ht),
      wd: rand(11, 19),
      vx: rand(-6, 6), vy: rand(7, 15),
      rot: rand(0, Math.PI * 2), vr: rand(-0.5, 0.5),
      a: rand(0.05, 0.13),
    }));
  }

  function size() {
    const box = canvas.parentElement;
    if (!box) return;
    const rct = box.getBoundingClientRect();
    if (!rct.width || !rct.height) return;
    w = rct.width; ht = rct.height;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(ht * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seed();
  }

  function roundRect(x, y, wd, hgt, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + wd, y, x + wd, y + hgt, r);
    ctx.arcTo(x + wd, y + hgt, x, y + hgt, r);
    ctx.arcTo(x, y + hgt, x, y, r);
    ctx.arcTo(x, y, x + wd, y, r);
    ctx.closePath();
  }

  function frame(now) {
    raf = 0;
    if (stopped || !canvas.isConnected) { stop(); return; }
    if (!running) return;
    const dt = Math.min(0.06, (now - last) / 1000) || 0.016;
    last = now;
    const t = now / 1000;
    ctx.clearRect(0, 0, w, ht);

    for (const c of cards) {
      c.x += c.vx * dt; c.y += c.vy * dt; c.rot += c.vr * dt;
      if (c.y > ht + 30) { c.y = -30; c.x = rand(0, w); }
      if (c.x > w + 30) c.x = -30;
      if (c.x < -30) c.x = w + 30;
      const hgt = c.wd * 1.4;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      ctx.globalAlpha = c.a;
      ctx.fillStyle = '#1a2150';
      roundRect(-c.wd / 2, -hgt / 2, c.wd, hgt, 2.5);
      ctx.fill();
      ctx.globalAlpha = c.a * 2.2;
      ctx.strokeStyle = 'rgba(212,175,55,0.8)';
      ctx.lineWidth = 0.75;
      ctx.stroke();
      ctx.restore();
    }

    for (const m of motes) {
      m.y -= m.vy * dt;
      if (m.y < -6) { m.y = ht + 6; m.x = rand(0, w); }
      const x = m.x + Math.sin(t * m.swayF * Math.PI * 2 + m.phase) * m.sway;
      const tw = 0.55 + 0.45 * Math.sin(t * m.twF * Math.PI * 2 + m.phase);
      ctx.globalAlpha = m.a * tw;
      ctx.fillStyle = m.ivory ? '#efe9d6' : '#d4af37';
      ctx.beginPath();
      ctx.arc(x, m.y, m.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    raf = requestAnimationFrame(frame);
  }

  function setRunning(on) {
    if (stopped) return;
    if (on && !running) {
      running = true;
      last = performance.now();
      if (!raf) raf = requestAnimationFrame(frame);
    } else if (!on && running) {
      running = false;
      if (raf) { cancelAnimationFrame(raf); raf = 0; }
    }
  }

  function stop() {
    stopped = true;
    running = false;
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
    ro.disconnect();
  }

  const ro = new ResizeObserver(() => { if (!stopped) size(); });
  ro.observe(canvas.parentElement || canvas);
  size();
  setRunning(!document.hidden);

  return { setRunning, stop };
}

// ============================================================
// inline icons (stroke inherits currentColor)
// ============================================================
function svgChevron() {
  return '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m5 9 7 7 7-7"/></svg>';
}
function svgArrow() {
  return '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h15"/><path d="m13 6 6 6-6 6"/></svg>';
}
function svgTicket() {
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9V7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v2a3 3 0 0 0 0 6v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-2a3 3 0 0 0 0-6Z"/><path d="M13 5v2M13 11v2M13 17v2"/></svg>';
}
function svgUser() {
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6"/></svg>';
}
function svgGlobe() {
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.9 5.6 3.9 9S14.5 18.4 12 21c-2.5-2.6-3.9-5.6-3.9-9S9.5 5.6 12 3Z"/></svg>';
}
function svgLock() {
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/></svg>';
}
function svgUsers() {
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 19.5c0-3 2.9-5 6.5-5s6.5 2 6.5 5"/><path d="M16 5.6a3.5 3.5 0 0 1 0 5.8M18.5 14.9c1.8.8 3 2.3 3 4.1"/></svg>';
}
function svgSpark() {
  return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4Z"/><path d="M19 17l.8 2.2L22 20l-2.2.8L19 23l-.8-2.2L16 20l2.2-.8Z"/></svg>';
}
