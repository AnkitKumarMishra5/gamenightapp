// Tabbed "How to play" modal fed by the game registry.
import { h, openModal, closeModal } from './ui.js';
import { GAMES } from '../games/registry.js';

export function showRules(defaultTab = GAMES[0].id) {
  let active = defaultTab;
  const body = h('div', {});
  const tabs = h('div', { class: 'rules-tabs' });

  const rerender = () => {
    tabs.replaceChildren(...GAMES.map((g) =>
      h('button', {
        class: `rules-tab ${active === g.id ? 'active' : ''}`,
        onClick: () => { active = g.id; rerender(); },
      }, `${g.emoji} ${g.title}`),
    ));
    const game = GAMES.find((g) => g.id === active) || GAMES[0];
    body.replaceChildren(game.rules());
  };
  rerender();

  openModal(h('div', {},
    h('button', { class: 'icon-btn modal-close', onClick: closeModal, 'aria-label': 'Close' }, '✕'),
    h('div', { class: 'modal-title' }, '📖 How to play'),
    tabs,
    body,
  ));
}
