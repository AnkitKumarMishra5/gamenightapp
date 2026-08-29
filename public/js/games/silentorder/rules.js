// Easy-to-read rules for Silent Order, rendered inside the rules modal.
import { h } from '../../core/ui.js';

export function rulesNode() {
  return h('div', { class: 'rules-body' },
    h('p', {}, 'A co-operative card game for 2–8 players. You are all on one team, sharing three lives, and there is one rule you must never break:'),
    h('div', { class: 'example' }, '🤫 Never say or signal your numbers. Read each other instead: the leaning-in, the hovering finger, the held breath. That IS the game.'),
    h('p', { class: 'hint' }, '🎥 Best played on a group call, so everyone can see the hesitation on everyone else\'s face.'),
    h('h4', {}, '🃏 The deal'),
    h('ul', {},
      h('li', {}, 'Each level deals everyone that many secret cards from 1 to 100: one card each on level 1, two on level 2, and so on.'),
      h('li', {}, 'The whole table must play every card onto one pile in rising order.'),
    ),
    h('h4', {}, '⏳ How you play'),
    h('ul', {},
      h('li', {}, 'There are no turns. Anyone can play at any moment, and you always play your lowest card.'),
      h('li', {}, 'The only skill is timing: a low card wants to go fast, a high card wants you to sit on your hands. Read the pauses.'),
      h('li', {}, h('b', {}, 'A mistake'), ': if your card lands while someone still holds a lower one, the team loses a life and every lower card burns face-up.'),
    ),
    h('h4', {}, '🕯️ Lives & levels'),
    h('ul', {},
      h('li', {}, 'When every hand is empty the level clears, and the next one deals a bigger hand.'),
      h('li', {}, 'Lives never refill. Lose all three and the run is over.'),
      h('li', {}, 'Clear the final level and the whole table wins together.'),
    ),
    h('h4', {}, '🏆 Points'),
    h('ul', {},
      h('li', {}, 'A card played with nothing lower still out there scores for you.'),
      h('li', {}, 'Clearing a level scores for everyone, and finishing the run scores big for the whole table.'),
    ),
    h('p', { class: 'hint' }, 'Fewer players means more levels, so a run lasts about the same either way. Silence, patience, and one shared heartbeat — that\'s the whole game.'),
  );
}
