// Game Night — landing / home screen. © 2026 Ankit Kumar Mishra. All rights reserved.
//
// One aesthetic thesis: a night of cards among friends. Midnight felt, candlelight
// gold, cards in motion. This module renders the whole home screen into a single
// node and owns all of its motion: the hero's canvas of drifting gold motes and
// tumbling card backs, the fan of cards that deals itself away as you scroll, the
// section reveals, and the 3D tilt on the game shelf.
//
// Contract (see LANDING-WIRING.md at the repo root for the exact wiring):
//   renderLanding(deps) -> HTMLElement    safe to call again on every re-render
//   destroyLanding()                      optional explicit teardown
//
// Behaviour is identical to the old landing: identity lives in deps.prefs, rooms
// are created/joined through deps.onCreate/onJoin, invite links keep pre-filling
// through [data-preserve="home-code"] (main.js's applyPrefill), rules open via
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
    state.joinOpen = true;
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
    ),
    fan,
    cue,
  );

  // ---------- mini-nav (appears once the hero is behind you) ----------
  const nav = h('nav', { class: 'lp-nav', 'aria-label': 'Page sections' },
    navBtn(deps, 'lp-hero', 'Play'),
    navBtn(deps, 'lp-games', 'Games'),
    navBtn(deps, 'lp-how', 'How it works'),
    navBtn(deps, 'lp-table', 'The table'),
  );

  // ---------- the shelf: every registered game ----------
  const shelf = h('section', { class: 'lp-sec lp-games', id: 'lp-games', 'aria-label': 'The games' },
    sectionHead(h, "Tonight's lineup",
      `${capital(numWord(deps.GAMES.length))} games, one room.`,
      "Tap a card to see how it plays. One room runs them all, and the night's points follow you between games."),
    h('div', { class: 'lp-shelf' },
      deps.GAMES.map((g, i) => gameCard(deps, g, i)),
    ),
  );

  // ---------- how a night works ----------
  const how = h('section', { class: 'lp-sec lp-how', id: 'lp-how', 'aria-label': 'How a night works' },
    sectionHead(h, 'How a night works', 'Three moves and you are playing.', null),
    h('div', { class: 'lp-steps' },
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
      `${named} share one table: midnight felt, a deck that riffle-shuffles, cards dealt around to every seat. When you peek, yours lifts to your eye. All of it is drawn live by your browser, no video anywhere.`),
    tableau(h, cardBack),
    h('p', { class: 'lp-stage-note lp-reveal' }, 'A still of the table, sketched in the same ink the games use.'),
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

  // ---------- footer ----------
  const footer = h('footer', { class: 'lp-footer lp-reveal' },
    h('div', { class: 'lp-foot-brand' },
      h('span', { class: 'lp-foot-mark', 'aria-hidden': 'true' }, '🎭'),
      h('div', {},
        h('div', { class: 'lp-foot-name' }, deps.BRAND.short),
        h('div', { class: 'lp-foot-tagline' }, deps.BRAND.tagline),
      ),
    ),
    h('div', { class: 'lp-foot-install' }, deps.installRow()),
    h('div', { class: 'lp-foot-dev' },
      deps.devPhoto('sm', 24),
      h('span', {}, 'Built by ', h('b', {}, deps.DEV.name)),
      h('span', { class: 'lp-foot-devlinks' },
        h('a', { class: 'lp-foot-link', href: `mailto:${deps.DEV.email}` }, 'Email'),
        h('a', { class: 'lp-foot-link', href: deps.DEV.linkedin, target: '_blank', rel: 'noopener noreferrer' }, 'LinkedIn'),
        h('a', { class: 'lp-foot-link', href: deps.DEV.github, target: '_blank', rel: 'noopener noreferrer' }, 'GitHub'),
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
    hero, nav, shelf, how, table, trust, footer,
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
  const join = async (btn) => {
    if (!commitIdentity()) return;
    if (!deps.connected()) { deps.toast('Still connecting to the server. One moment.', 'error'); return; }
    const code = codeInput.value.trim().toUpperCase();
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
  codeInput.addEventListener('input', () => {
    const raw = codeInput.value;
    if (/^[A-Za-z0-9]{0,5}$/.test(raw)) { codeInput.value = raw.toUpperCase(); return; }
    acceptPastedText(raw, { autoJoin: false });
  });
  codeInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') join(joinBtn); });

  // ----- buttons and panel -----
  const createBtn = h('button', {
    class: 'lp-act lp-act-create', disabled: !deps.connected(),
    onClick: (e) => create(e.currentTarget),
  }, h('span', { class: 'lp-act-emoji', 'aria-hidden': 'true' }, '✨'), 'Create a room');

  const joinBtn = h('button', {
    class: 'lp-joingo', disabled: !deps.connected(),
    onClick: () => join(joinBtn),
  }, 'Join');

  const joinPanel = h('div', { class: 'lp-joinrow' },
    codeInput,
    joinBtn,
  );

  const joinToggle = h('button', {
    class: 'lp-act lp-act-join', 'aria-expanded': 'false',
    onClick: () => {
      state.joinOpen = !state.joinOpen;
      deps.sound.tap();
      syncJoin();
      if (state.joinOpen) setTimeout(() => codeInput.focus(), 60);
    },
  }, h('span', { class: 'lp-act-emoji', 'aria-hidden': 'true' }, '🎟️'), 'Join with a code');

  const syncJoin = () => {
    joinPanel.hidden = !state.joinOpen;
    joinToggle.classList.toggle('lp-active', state.joinOpen);
    joinToggle.setAttribute('aria-expanded', String(state.joinOpen));
  };
  syncJoin();

  nameInput.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (state.joinOpen && codeInput.value.trim().length === CODE_LEN) join(joinBtn);
    else create(createBtn);
  });

  return h('div', { class: `lp-console ${state.inviteCode ? 'lp-invited' : ''}` },
    state.inviteCode && h('div', { class: 'lp-invite' },
      h('span', { class: 'lp-invite-key', 'aria-hidden': 'true' }, '🔑'),
      h('div', {},
        h('div', { class: 'lp-invite-title' }, `You're invited to room ${state.inviteCode}`),
        h('div', { class: 'lp-invite-sub' }, 'Add a name and jump straight in.'),
      ),
    ),
    h('div', { class: 'lp-idrow' },
      avatarBtn,
      nameInput,
    ),
    tray,
    h('div', { class: 'lp-actions' }, createBtn, joinToggle),
    joinPanel,
    !deps.connected() && h('div', { class: 'lp-conn', role: 'status' },
      h('span', { class: 'lp-spin', 'aria-hidden': 'true' }, '📡'),
      'Connecting to the game server…',
    ),
  );
}

// ============================================================
// section pieces
// ============================================================
function sectionHead(h, eyebrow, title, sub) {
  return h('header', { class: 'lp-shead lp-reveal' },
    h('p', { class: 'lp-eyebrow' }, eyebrow),
    h('h2', { class: 'lp-h2' }, title),
    sub && h('p', { class: 'lp-ssub' }, sub),
  );
}

function navBtn(deps, target, label) {
  return deps.h('button', {
    class: 'lp-nav-btn',
    onClick: () => { deps.sound.tap(); scrollToSection(target); },
  }, label);
}

function scrollToSection(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' });
}

function gameCard(deps, g, i) {
  const { h } = deps;
  const accent = ACCENTS[g.accent] || GOLD_HEX;
  const card = h('button', {
    class: 'lp-gcard',
    style: `--a:${accent}`,
    onClick: () => { deps.sound.tap(); deps.showRules(g.id); },
  },
    h('span', { class: 'lp-gcard-glare', 'aria-hidden': 'true' }),
    h('span', { class: 'lp-gcard-pip lp-tl', 'aria-hidden': 'true' }, g.emoji),
    h('span', { class: 'lp-gcard-pip lp-br', 'aria-hidden': 'true' }, g.emoji),
    h('span', { class: 'lp-gcard-emoji', 'aria-hidden': 'true' }, g.emoji),
    h('span', { class: 'lp-gcard-title' }, g.title),
    h('span', { class: 'lp-gcard-tagline' }, g.tagline),
    h('span', { class: 'lp-gcard-meta' },
      (g.tags || []).map((t) => h('span', { class: 'lp-chip' }, t)),
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

  if (motes) {
    const onVis = () => {
      if (!canvas.isConnected) { document.removeEventListener('visibilitychange', onVis); return; }
      motes.setRunning(!document.hidden);
    };
    document.addEventListener('visibilitychange', onVis);
    onCleanup(() => document.removeEventListener('visibilitychange', onVis));
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
    card.style.setProperty('--gx', ((e.clientX - r.left) / r.width * 100).toFixed(1) + '%');
    card.style.setProperty('--gy', ((e.clientY - r.top) / r.height * 100).toFixed(1) + '%');
  });
  card.addEventListener('pointerleave', () => {
    card.style.setProperty('--tx', '0deg');
    card.style.setProperty('--ty', '0deg');
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
