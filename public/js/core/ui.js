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

// Shown to everyone who is not the room owner, in place of a control only the owner has.
// Without it a guest sits on a screen with nothing on it, waiting for something they
// cannot see is coming.
export function waitingFor(hostName, what) {
  return h('p', { class: 'waiting-note' }, `⏳ ${hostName || 'The room owner'} ${what}`);
}
