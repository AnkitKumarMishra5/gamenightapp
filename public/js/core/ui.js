// Tiny DOM toolkit: element builder, toasts, modals, input preservation across re-renders.

export function $(sel, root = document) { return root.querySelector(sel); }

// h('div', {class: 'card', onClick: fn, dataset: {...}}, child1, child2, ...)
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (k === 'html') el.innerHTML = v; // trusted, app-authored markup only
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    el.append(child.nodeType ? child : document.createTextNode(String(child)));
  }
  return el;
}

// ---------- toasts ----------
let toastSeq = 0;
export function toast(message, type = 'info', ms = 2600) {
  const root = $('#toasts');
  const el = h('div', { class: `toast ${type}` }, message);
  root.append(el);
  const id = ++toastSeq;
  el.dataset.id = id;
  while (root.children.length > 3) root.firstChild.remove();
  setTimeout(() => {
    el.classList.add('leaving');
    setTimeout(() => el.remove(), 260);
  }, ms);
}

// ---------- modal ----------
export function openModal(content, { dismissible = true } = {}) {
  closeModal();
  const backdrop = h('div', {
    class: 'modal-backdrop',
    onClick: (e) => { if (dismissible && e.target === backdrop) closeModal(); },
  }, h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true' }, content));
  $('#modal-root').append(backdrop);
  return backdrop;
}

export function closeModal() {
  $('#modal-root').replaceChildren();
}

// ---------- input preservation across full re-renders ----------
// Any input/textarea with data-preserve="key" keeps its value, focus and caret.
export function snapshotInputs(root) {
  const saved = {};
  for (const el of root.querySelectorAll('[data-preserve]')) {
    saved[el.dataset.preserve] = {
      value: el.value,
      focused: document.activeElement === el,
      selStart: el.selectionStart,
      selEnd: el.selectionEnd,
    };
  }
  return saved;
}

export function restoreInputs(root, saved) {
  for (const el of root.querySelectorAll('[data-preserve]')) {
    const s = saved[el.dataset.preserve];
    if (!s) continue;
    if (s.value && !el.value) el.value = s.value;
    if (s.focused) {
      el.focus({ preventScroll: true });
      try { el.setSelectionRange(s.selStart, s.selEnd); } catch { /* number inputs */ }
    }
  }
}

// Entrance animations should play once, not on every re-render. Callers ask whether
// a given key (player id, clue, attempt) is new and only then add the anim class.
const animated = new Set();
export function animOnce(key, cls = 'anim-pop') {
  if (animated.has(key)) return '';
  animated.add(key);
  return cls;
}

export function resetAnims(prefix = null) {
  if (!prefix) return animated.clear();
  for (const k of [...animated]) if (k.startsWith(prefix)) animated.delete(k);
}

export function shake(el) {
  if (!el) return;
  el.classList.remove('shake');
  void el.offsetWidth;
  el.classList.add('shake');
}

// ---------- scene art ----------
// The key art is shot on pure black, so a screen blend composites it with no cutout:
// black adds nothing and the lit subject keeps its soft edge. `place` picks how the
// copy is kept clear of it — a side scrim, or a band across the bottom.
export function sceneArt(name, place = 'side') {
  return h('picture', { class: `scene-art scene-${place}`, 'aria-hidden': 'true' },
    h('source', { srcset: `/media/games/${name}.webp`, type: 'image/webp' }),
    h('img', { src: `/media/games/${name}.jpg`, alt: '', loading: 'lazy', decoding: 'async' }),
  );
}

// The framed variant: the photograph gets its own window — a full-width strip with a
// feathered edge — instead of lying underneath the copy. For the screens where a
// background blend buries the image behind text and it reads as mud rather than art.
export function sceneFrame(name, cls = '') {
  return h('picture', { class: `scene-frame ${cls}`, 'aria-hidden': 'true' },
    h('source', { srcset: `/media/games/${name}.webp`, type: 'image/webp' }),
    h('img', { src: `/media/games/${name}.jpg`, alt: '', loading: 'lazy', decoding: 'async' }),
  );
}

// The hero treatment: the photograph fills its own stage, shown whole and at nearly
// full strength, and the copy sits ON it inside a directional fade — rising out of the
// foot of the image, or holding one side of it. This is the "moment" presentation:
// nothing is dimmed to a wash, the image is the scene and the words caption it.
//   align: 'bottom' (default) | 'left' | 'right'
//   size:  '' (default ~200px) | 'sm' (~130px) | 'tall' (~260px)
export function sceneHero(name, content, { align = 'bottom', size = '', cls = '' } = {}) {
  return h('div', { class: `scene-hero hero-${align}${size ? ` hero-${size}` : ''}${cls ? ` ${cls}` : ''}` },
    h('picture', { class: 'sh-pic', 'aria-hidden': 'true' },
      h('source', { srcset: `/media/games/${name}.webp`, type: 'image/webp' }),
      h('img', { src: `/media/games/${name}.jpg`, alt: '', loading: 'lazy', decoding: 'async' }),
    ),
    h('div', { class: 'sh-copy' }, content),
  );
}

// Shown to everyone who is not the room owner, in place of a control only the owner has.
// Without it a guest sits on a screen with nothing on it, waiting for something they
// cannot see is coming.
export function waitingFor(hostName, what) {
  return sceneHero('waiting',
    h('p', { class: 'waiting-note' }, `⏳ ${hostName || 'The room owner'} ${what}`),
    { cls: 'waiting-wrap' });
}

// One tap, one shared laugh, on any screen that mounts it: the emoji floats up on
// every phone in the room with its sound. Stateless — a laugh is not game state.
const ROOM_REACTIONS = ['😂', '😱', '🔥', '💀', '🤔', '🧐', '😭'];
export function roomReactionBar(ctx) {
  return h('div', { class: 'gn-reactbar' },
    ROOM_REACTIONS.map((e) => h('button', {
      class: 'gn-react-btn', 'aria-label': `react ${e}`,
      onClick: () => { ctx.sound.tap(); ctx.emit('room:react', { emoji: e }); },
    }, e)),
  );
}

// The game's scoring rules, folded under the final standings, so "why do I have
// 7 points?" is answered right where the question happens. Rules arrive from the
// server snapshot (core/scores.js), so the numbers can never drift from the truth.
export function scoringDetails(rules) {
  if (!rules?.length) return null;
  return h('details', { class: 'score-how' },
    h('summary', {}, '🧮 How these points were scored'),
    h('div', { class: 'score-rules' },
      rules.map(([icon, pts, text]) => h('div', { class: 'score-rule' },
        h('span', { class: 'sr-icon' }, icon),
        h('span', { class: 'sr-pts' }, pts),
        h('span', { class: 'sr-text' }, text),
      )),
    ),
  );
}

// A visible "the machine is working" state, used wherever the app is waiting on the AI.
// Built from transforms and opacity only so it stays smooth on a phone, and it collapses
// to a static badge under prefers-reduced-motion.
export function aiThinking(title, sub, emoji = '🤖') {
  return h('div', { class: 'ai-think', role: 'status', 'aria-live': 'polite' },
    h('div', { class: 'ai-core' },
      h('span', { class: 'ai-ring r1' }),
      h('span', { class: 'ai-ring r2' }),
      h('span', { class: 'ai-ring r3' }),
      h('span', { class: 'ai-scan' }),
      h('span', { class: 'ai-face' }, emoji),
    ),
    h('div', { class: 'ai-copy' },
      h('div', { class: 'ai-title' }, title,
        h('span', { class: 'ai-dots' },
          h('i', {}), h('i', {}), h('i', {}))),
      sub && h('div', { class: 'ai-sub' }, sub),
    ),
  );
}

