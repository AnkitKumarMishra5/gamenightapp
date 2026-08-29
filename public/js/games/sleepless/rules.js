// Easy-to-read rules for Sleepless, rendered inside the rules modal.
import { h } from '../../core/ui.js';

export function rulesNode() {
  return h('div', { class: 'rules-body' },
    h('p', {}, 'A night-and-day deduction game for 4–16 players. Everyone gets a secret role card. Up to 8 players one Prowler hunts alone; from 9 it is a pack of two, from 14 a pack of three, and the pack knows its own:'),
    h('ul', {},
      h('li', {}, h('b', {}, '🐾 Prowler'), ' — visits someone every night. They don\'t wake up.'),
      h('li', {}, h('b', {}, '🩺 Medic'), ' — guards one door every night, their own included. A guarded player can\'t be taken.'),
      h('li', {}, h('b', {}, '🔮 Oracle'), ' — reads one player every night and privately learns whether they are the Prowler.'),
      h('li', {}, h('b', {}, '😴 Sleepers'), ' — everyone else. Each night they keep watch on one door, and watching the right one pays: witness the attack and you privately learn someone who is NOT a Prowler; watch a Prowler\'s door and their empty bed banks you an Instinct point at the end.'),
    ),
    h('h4', {}, '🌙 At night'),
    h('p', {}, 'Everyone picks a player on the same screen — Prowlers choose a victim, the Medic a door to guard, the Oracle a face to read, and Sleepers a door to watch. Identical screens for every role, so nobody can be read by how long they take. The night ends when everyone has chosen.'),
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
