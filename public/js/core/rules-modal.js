// Tabbed "How to play" modal fed by the game registry.
import { h, openModal, closeModal } from './ui.js';
import { GAMES } from '../games/registry.js';

const ACCENT = { bi: '#f472b6', island: '#34d399', so: '#d4af37', ss: '#fbbf24', sl: '#818cf8' };

export function showRules(defaultTab = GAMES[0].id) {
  let active = defaultTab;
  const body = h('div', {});
  const banner = h('div', { class: 'rules-art', 'aria-hidden': 'true' });
  const tabs = h('div', { class: 'rules-tabs' });

  const rerender = () => {
    tabs.replaceChildren(...GAMES.map((g) =>
      h('button', {
        class: `rules-tab ${active === g.id ? 'active' : ''}`,
        onClick: () => { active = g.id; rerender(); },
      }, `${g.emoji} ${g.title}`),
    ));
    const game = GAMES.find((g) => g.id === active) || GAMES[0];
    // Screen-blended like the shelf cards: the art was shot on pure black, so it
    // needs no cutout and keeps its soft edges.
    banner.replaceChildren(game.art
      ? h('picture', {},
          h('source', { srcset: `${game.art}.webp`, type: 'image/webp' }),
          h('img', { src: `${game.art}.jpg`, alt: '', decoding: 'async' }))
      : '');
    banner.style.setProperty('--a', ACCENT[game.accent] || '#d4af37');
    body.replaceChildren(game.rules());
  };
  rerender();

  openModal(h('div', {},
    h('button', { class: 'icon-btn modal-close', onClick: closeModal, 'aria-label': 'Close' }, '✕'),
    h('div', { class: 'modal-title' }, '📖 How to play'),
    tabs,
    banner,
    body,
  ));
}
