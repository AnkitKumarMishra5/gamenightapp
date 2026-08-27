// Client-side game registry. To add a new game: create a folder with index.js
// (render function) + rules.js (rulesNode), then register it here.
import { renderBlendIn } from './blendin/index.js';
import { rulesNode as blendInRules } from './blendin/rules.js';
import { renderIsland } from './island/index.js';
import { rulesNode as islandRules } from './island/rules.js';

export const GAMES = [
  {
    id: 'blendin',
    title: 'Blend In',
    emoji: '🕵️',
    accent: 'bi',
    tagline: 'Everyone gets a secret word. Almost everyone. Spot the ones who blend in before they outlast you.',
    tags: ['5–16 players', 'social deduction', 'bluffing'],
    render: renderBlendIn,
    rules: blendInRules,
    snapshotKey: 'blendin',
  },
  {
    id: 'island',
    title: 'The Island',
    emoji: '🏝️',
    accent: 'island',
    tagline: '"I\'m bringing a Heart and a Window…" Crack the secret pattern before your friends do.',
    tags: ['2+ players', 'brain teaser', 'AI gamemaster'],
    render: renderIsland,
    rules: islandRules,
    snapshotKey: 'island',
  },
];

export function gameById(id) {
  return GAMES.find((g) => g.id === id) || null;
}
