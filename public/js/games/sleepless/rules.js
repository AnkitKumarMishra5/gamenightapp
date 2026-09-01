// Easy-to-read rules for Sleepless, rendered inside the rules modal.
import { h } from '../../core/ui.js';

export function rulesNode() {
  return h('div', { class: 'rules-body' },
    h('p', {}, 'A night-and-day deduction game for 4–16 players. Everyone gets a secret role card. Up to 8 players one Prowler hunts alone; from 9 it is a pack of two, from 14 a pack of three, and the pack knows its own:'),
    h('ul', {},
      h('li', {}, h('b', {}, '🥷 Prowler'), ' — answers the night sum like everyone else, and taps one name. That player doesn\'t wake up.'),
      h('li', {}, h('b', {}, '🩺 Medic'), ' — answers the night sum too, and taps one door to guard, their own included, but never the same door two nights in a row. A guarded player can\'t be taken.'),
      h('li', {}, h('b', {}, '😴 Sleepers'), ' — everyone else. No night power at all: they answer the sum and sleep. Their game is the daytime argument.'),
    ),
    h('h4', {}, '🌙 At night'),
    h('p', {}, 'Everyone is handed the same kind of sum, types the answer and taps “ready to sleep”. The Prowler and the Medic get one extra tap on a grid of names. Because every player is typing and tapping, nothing about a screen — speed, silence, hesitation — says which card someone holds. The night ends when the last answer is in.'),
    h('h4', {}, '🌅 At dawn'),
    h('ul', {},
      h('li', {}, 'If the Medic guarded the Prowler\'s target, everyone wakes up. The table only hears that someone was attacked and survived — never who.'),
      h('li', {}, 'Otherwise the victim doesn\'t wake up, and their role is revealed.'),
    ),
    h('h4', {}, '🗳️ By day'),
    h('p', {}, 'Talk it out, then everyone votes for a player or for Skip. Votes stay sealed until the last one is in — then the whole table sees who pointed at whom. A clear plurality is sent home and their role revealed. A tie, or Skip on top, means nobody goes.'),
    h('h4', {}, '🏆 Winning'),
    h('ul', {},
      h('li', {}, 'The village wins the moment the Prowler is voted out.'),
      h('li', {}, 'The Prowler wins when only two players are left standing.'),
    ),
    h('p', { class: 'hint' }, 'Dead players spectate: they see everything public and their own card, and nothing else until the final reveal. Points are settled at the end so the leaderboard never gives anyone away.'),
  );
}
