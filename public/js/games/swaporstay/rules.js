// Easy-to-read rules for Swap or Stay, rendered inside the rules modal.
import { h } from '../../core/ui.js';

export function rulesNode() {
  return h('div', { class: 'rules-body' },
    h('p', {}, 'A push-your-luck card game for 3–10 players. Everyone starts with 3 hearts and gets one face-down card each round. When the cards go up, the lowest one costs its holder a heart.'),
    h('div', { class: 'example' }, '🂠 One card. One decision. Lowest loses.'),
    h('h4', {}, '🔁 On your turn'),
    h('ul', {},
      h('li', {}, h('b', {}, 'Stay'), ': keep your card and hope somebody else drew lower.'),
      h('li', {}, h('b', {}, 'Swap'), ': force a trade with the next player around the table. They cannot refuse, unless they are holding a Sentinel.'),
      h('li', {}, h('b', {}, 'The dealer goes last'), ' and swaps with the deck instead: their old card is tossed and the top of the deck replaces it, sight unseen.'),
    ),
    h('h4', {}, '🛡 Sentinels'),
    h('p', {}, 'Four Sentinels hide among the cards 1–40. A Sentinel is worth 99, so it never loses, and it blocks swaps: try to trade into one and it is flashed at the whole table while you keep exactly what you had.'),
    h('h4', {}, '💔 The reveal'),
    h('ul', {},
      h('li', {}, 'Everyone flips at once. The lowest number loses a heart; if the lowest is tied, everyone tied loses one.'),
      h('li', {}, 'If one reveal would wipe out every remaining player at once, the table laughs it off and nobody loses a thing.'),
      h('li', {}, 'Out of hearts? You are out, pull up a chair and heckle.'),
    ),
    h('h4', {}, '🏆 Winning'),
    h('p', {}, 'Last player with a heart wins the game. Points come from outliving each round, and a nice pile more for taking the whole table.'),
    h('p', { class: 'hint' }, 'The deal passes clockwise each round, so everybody gets a go at the deck. Watch who swaps and who smiles, the card you are handed is somebody else\'s problem now.'),
  );
}
