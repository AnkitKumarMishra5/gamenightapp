// Easy-to-read rules for Island Rules, rendered inside the rules modal.
import { h } from '../../core/ui.js';

export function rulesNode() {
  return h('div', { class: 'rules-body' },
    h('p', {}, 'A "crack the secret rule" party game for 2+ guessers. The gamemaster (the AI, or the room owner) knows a hidden pattern and opens with:'),
    h('div', { class: 'example' }, '🏝️ "I\'m going to an island and I\'m bringing a Heart and a Window."'),
    h('p', {}, 'Those two items secretly fit a hidden pattern. Here, things that can break. Your job: figure out the pattern!'),
    h('h4', {}, '🔁 On your turn'),
    h('ul', {},
      h('li', {}, h('b', {}, 'Ask to bring something'), ': "Can I bring a Mirror?" You\'ll hear YES if it fits the pattern, NO if it doesn\'t. Every answer is a clue for everyone.'),
      h('li', {}, h('b', {}, 'Or guess the pattern'), ': say the rule in your own words. The judge is smart about wording: "stuff you can break" counts for "things that can break". A wrong guess just costs your turn.'),
    ),
    h('h4', {}, '🤫 After you crack it'),
    h('p', {}, 'Your guess stays hidden from other players, and you keep playing. But now you ask for items that FIT, dropping hints for everyone else. Never say the rule out loud!'),
    h('h4', {}, '🏆 Scoring & ending'),
    h('ul', {},
      h('li', {}, 'Solve it earlier = more points (1st place gets the most). Points add up across rounds.'),
      h('li', {}, 'The round ends when everyone has cracked the pattern, or when the room owner ends it. The pattern is then revealed with the leaderboard.'),
    ),
    h('h4', {}, '🎲 Patterns can be anything'),
    h('ul', {},
      h('li', {}, 'About meaning: things that can break, things that float, things with teeth…'),
      h('li', {}, 'About spelling: double letters (sp🅾️🅾️n), starts & ends with the same letter…'),
      h('li', {}, 'About sound: rhymes with a body part, exactly two syllables…'),
      h('li', {}, 'Sneaky wordplay: words that pair with "fire", palindromes, hidden numbers (b-ONE)…'),
    ),
    h('p', { class: 'hint' }, 'Gamemaster modes: when the AI Gamemaster is available it invents a fresh pattern and judges every attempt. So even the room owner gets to play. Otherwise the room owner judges, using their own pattern or a surprise one from the built-in bank of 60.'),
  );
}
