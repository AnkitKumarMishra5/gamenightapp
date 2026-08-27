// Easy-to-read rules for Blend In, rendered inside the rules modal.
import { h } from '../../core/ui.js';

export function rulesNode() {
  return h('div', { class: 'rules-body' },
    h('p', {}, 'A social deduction word game for 5 to 16 players. Almost everyone gets the same secret word. A few people get a different one, and one may get nothing at all. Their job is to blend in.'),

    h('h4', {}, '🎭 The roles (kept secret!)'),
    h('ul', {},
      h('li', {}, h('b', {}, 'Insiders'), ': the majority. You all share the SAME secret word (say, "Coffee").'),
      h('li', {}, h('b', {}, 'Outsiders'), ': you get a slightly DIFFERENT word (say, "Tea"). The twist is that nobody is told which one they are. Everyone just sees a word.'),
      h('li', {}, h('b', {}, 'The Blank'), ': you get no word at all, and you know it. You have to bluff from whatever everyone else says.'),
    ),
    h('div', { class: 'example' }, '☕ Example: 4 players see "Coffee", 1 sees "Tea", and 1 sees nothing. Nobody knows which side they are on, so describe carefully.'),

    h('h4', {}, '🔁 Each round'),
    h('ul', {},
      h('li', {}, h('b', {}, '1. Describe'), ': on your turn, type ONE word or short phrase about your secret word. Never say the word itself, and never repeat an earlier clue. Too obvious hands it to the Blank; too vague makes YOU look suspicious.'),
      h('li', {}, h('b', {}, '2. Discuss'), ': talk it out. Who sounded off? The room owner starts the vote when everyone is ready. No timers.'),
      h('li', {}, h('b', {}, '3. Vote'), ': everyone votes to eliminate one player and their role is revealed. A tie triggers one revote between the tied players, and if that ties too, nobody leaves.'),
    ),

    h('h4', {}, '🃏 The Blank\'s one shot'),
    h('p', {}, 'If the Blank is voted out, they get a single chance to name the insiders\' word. Get it right and the outsiders win on the spot.'),

    h('h4', {}, '🏆 How to win'),
    h('ul', {},
      h('li', {}, h('b', {}, 'Insiders win'), ' when every outsider and the Blank has been eliminated.'),
      h('li', {}, h('b', {}, 'Outsiders win'), ' when they survive until only one insider is left, or when the Blank names the word.'),
    ),

    h('h4', {}, '🎚️ Word difficulty'),
    h('p', {}, 'The room owner picks how close the two words are. Easy is Coffee and Tea. Ultra is Ocean and Sea, where almost no honest clue separates them and everyone starts doubting themselves. A fresh pair is dealt every game.'),

    h('h4', {}, '⚙️ Room setup'),
    h('ul', {},
      h('li', {}, 'With exactly 5 players it is fixed: 3 insiders, 1 outsider and the Blank.'),
      h('li', {}, 'With 6 or more, the room owner sets how many outsiders there are and whether the Blank is in.'),
      h('li', {}, 'The Blank never gives the first clue of a round, since they would have nothing to go on.'),
    ),
  );
}
