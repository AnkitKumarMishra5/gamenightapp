// Client-side game registry. To add a new game: create a folder with index.js
// (render function) + rules.js (rulesNode), then register it here.
import { renderBlendIn } from './blendin/index.js';
import { rulesNode as blendInRules } from './blendin/rules.js';
import { renderIsland } from './island/index.js';
import { rulesNode as islandRules } from './island/rules.js';
import { renderSilentOrder } from './silentorder/index.js';
import { rulesNode as silentOrderRules } from './silentorder/rules.js';
import { renderSwapOrStay } from './swaporstay/index.js';
import { rulesNode as swapOrStayRules } from './swaporstay/rules.js';
import { renderSleepless } from './sleepless/index.js';
import { rulesNode as sleeplessRules } from './sleepless/rules.js';

export const GAMES = [
  {
    id: 'blendin',
    art: '/media/art/games/blendin',
    title: 'Blend In',
    emoji: '🕵️',
    accent: 'bi',
    tagline: 'Everyone gets a secret word. Almost everyone. Spot the ones who blend in before they outlast you.',
    minPlayers: 5, maxPlayers: 16,
    tags: ['5–16 players', 'social deduction', '🎥 play on a group call'],
    render: renderBlendIn,
    rules: blendInRules,
    snapshotKey: 'blendin',
  },
  {
    id: 'island',
    art: '/media/art/games/island',
    title: 'Island Rules',
    emoji: '🏝️',
    accent: 'island',
    tagline: '"I\'m bringing a Heart and a Window…" Crack the secret pattern before your friends do.',
    minPlayers: 2, maxPlayers: 16,
    tags: ['2–16 players', 'brain teaser', 'AI gamemaster'],
    render: renderIsland,
    rules: islandRules,
    snapshotKey: 'island',
  },
  {
    id: 'silentorder',
    art: '/media/art/games/silentorder',
    title: 'Silent Order',
    emoji: '🕯️',
    accent: 'so',
    tagline: 'One team, one life to start, no talking. Play every card in rising order on nerve alone.',
    minPlayers: 2, maxPlayers: 8,
    tags: ['2–8 players', 'co-operative', '🎥 play on a group call'],
    render: renderSilentOrder,
    rules: silentOrderRules,
    snapshotKey: 'silentorder',
  },
  {
    id: 'swaporstay',
    art: '/media/art/games/swaporstay',
    title: 'Swap or Stay',
    emoji: '🃏',
    accent: 'ss',
    tagline: 'One card, one choice. Keep what you drew, or force a trade. The lowest card loses a heart.',
    minPlayers: 3, maxPlayers: 10,
    tags: ['3–10 players', 'push your luck', 'card table'],
    render: renderSwapOrStay,
    rules: swapOrStayRules,
    snapshotKey: 'swaporstay',
  },
  {
    id: 'sleepless',
    art: '/media/art/games/sleepless',
    title: 'Sleepless',
    emoji: '🌙',
    accent: 'sl',
    tagline: 'Prowlers hunt by night while everyone answers the same sum. No powers, no proof, just the argument.',
    minPlayers: 4, maxPlayers: 16,
    tags: ['4–16 players', 'social deduction', '🎥 play on a group call'],
    render: renderSleepless,
    rules: sleeplessRules,
    snapshotKey: 'sleepless',
  },
];

export function gameById(id) {
  return GAMES.find((g) => g.id === id) || null;
}
