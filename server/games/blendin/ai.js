// Game Night — © 2026 Ankit Kumar Mishra. All rights reserved. See LICENSE.
// Blend In's word dealer. The AI invents a fresh pair every game so a group that plays
// often never sees the same words twice, and the built-in bank of 130 pairs is the
// fallback whenever there is no API key or the model returns something unusable.
//
// Nothing a player types reaches this file. It only ever sends a difficulty and the list
// of words already used tonight, so there is no injection surface here.
import { chatJSON, MOCK, aiAvailable } from '../../lib/openai.js';
import { normalize, pick } from '../../lib/util.js';
import { WORD_PAIRS } from './wordPairs.js';

export const DIFFICULTIES = [
  {
    id: 'easy',
    label: 'Easy',
    emoji: '🌱',
    blurb: 'Same world, obviously different',
    example: 'Coffee / Tea',
    brief: 'Clearly related but plainly different things. A single honest clue usually gives '
      + 'the impostor away. Good for a first game or a mixed table.',
  },
  {
    id: 'medium',
    label: 'Medium',
    emoji: '🎯',
    blurb: 'Close cousins',
    example: 'Guitar / Violin',
    brief: 'Same category and shape, differing in a detail. Most clues fit both words, so '
      + 'it takes two or three rounds to narrow down.',
  },
  {
    id: 'hard',
    label: 'Hard',
    emoji: '🔥',
    blurb: 'Barely a gap',
    example: 'Jam / Jelly',
    brief: 'Almost the same thing, split by one property. Nearly every honest clue is true '
      + 'of both, and the impostor can coast for a long time.',
  },
  {
    id: 'ultra',
    label: 'Ultra',
    emoji: '💀',
    blurb: 'Near-synonyms',
    example: 'Ocean / Sea',
    brief: 'So close that even the insiders start doubting themselves. Expect wrong votes '
      + 'and long arguments. Only play this with people who enjoy suffering.',
  },
];

export const DIFFICULTY_IDS = DIFFICULTIES.map((d) => d.id);
export const isDifficulty = (v) => DIFFICULTY_IDS.includes(v);

const SYSTEM = `You invent word pairs for the party game "Blend In". Most players get word A, a hidden minority get word B. Everyone takes turns giving a one-word clue about their own word, and the group votes out whoever sounds wrong.

WHAT MAKES A PAIR WORK
1. Both words must be common, concrete, everyday English nouns that any adult can describe out loud. No proper nouns, no brands, no places, no abstractions.
2. They must OVERLAP enough that many honest clues are true of both. That overlap is the whole game.
3. They must DIFFER in at least one property a clue could eventually expose. A pair with no difference at all is unplayable.
4. They must not be the same word, a plural of each other, or one contained in the other.
5. Neither word may appear in the other's ordinary definition (do not pair "Bread" with "Toast", where saying the first is the obvious clue for the second).

DIFFICULTY, and this is the part that matters
- easy: same broad category, obviously different objects. Roughly half of natural clues separate them. Examples: Coffee / Tea, Dog / Cat, Beach / Mountain.
- medium: same category and same purpose, differing in form or detail. Most clues fit both. Examples: Guitar / Violin, Pizza / Burger, Bus / Train.
- hard: nearly the same thing, separated by one property such as texture, size, temperature or setting. Examples: Jam / Jelly, Hotel / Motel, Soup / Stew.
- ultra: near-synonyms an ordinary person would use interchangeably. Almost no clue separates them. Examples: Ocean / Sea, Hill / Mountain, Sofa / Couch.

Respond with JSON: {"a": "<word>", "b": "<word>", "category": "<two or three words>"}`;

const BAD_WORD = /[^A-Za-z' -]/;

// The model is confident and sometimes wrong, so every pair is checked before it reaches
// a table. A rejected pair costs one retry; a second failure falls back to the bank.
export function pairIsUsable(pair) {
  const a = String(pair?.a || '').trim();
  const b = String(pair?.b || '').trim();
  if (!a || !b) return 'missing a word';
  if (a.length > 22 || b.length > 22) return 'too long to be a common noun';
  if (BAD_WORD.test(a) || BAD_WORD.test(b)) return 'not plain words';
  if (a.split(' ').length > 2 || b.split(' ').length > 2) return 'more than two words';

  const na = normalize(a);
  const nb = normalize(b);
  if (na === nb) return 'the same word twice';
  if (na === `${nb}s` || nb === `${na}s`) return 'a plural of the same word';
  // One word inside the other makes the clue trivial ("Sun" / "Sunflower").
  if (na.includes(nb) || nb.includes(na)) return 'one word contains the other';
  return null;
}

function fromBank(difficulty, avoid = []) {
  const seen = new Set(avoid.map(normalize));
  const unused = (list) => list.filter((p) => !seen.has(normalize(p.a)) && !seen.has(normalize(p.b)));

  const tier = unused(WORD_PAIRS.filter((p) => p.difficulty === difficulty));
  // Ultra is the thinnest tier, so it borrows from hard once it runs dry rather than
  // dropping the table all the way back to easy.
  const nearby = difficulty === 'ultra' ? unused(WORD_PAIRS.filter((p) => p.difficulty === 'hard')) : [];
  const anything = unused(WORD_PAIRS);
  const chosen = pick(tier.length ? tier : (nearby.length ? nearby : (anything.length ? anything : WORD_PAIRS)));
  return { a: chosen.a, b: chosen.b, category: chosen.category, difficulty, source: 'bank' };
}

// A fresh pair for one game. Always resolves: the bank is the floor, so a game never
// fails to start because a model was slow or an API key was missing.
export async function generateWordPair(difficulty = 'medium', avoid = []) {
  const level = isDifficulty(difficulty) ? difficulty : 'medium';
  if (!aiAvailable() || MOCK) return fromBank(level, avoid);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await chatJSON({
        system: SYSTEM,
        user: `Difficulty: ${level}.\n`
          + `Already used tonight, pick something unrelated to these: ${avoid.slice(-24).join(', ') || 'nothing yet'}.\n`
          + 'Give one pair.',
        temperature: 1,
        maxTokens: 80,
      });
      const problem = pairIsUsable(result);
      if (problem) {
        console.warn(`[blendin ai] rejected "${result?.a}" / "${result?.b}": ${problem}`);
        continue;
      }
      const seen = new Set(avoid.map(normalize));
      if (seen.has(normalize(result.a)) || seen.has(normalize(result.b))) continue;
      return {
        a: String(result.a).trim(),
        b: String(result.b).trim(),
        category: String(result.category || '').slice(0, 30) || null,
        difficulty: level,
        source: 'ai',
      };
    } catch (err) {
      console.warn('[blendin ai]', err.message);
      break;
    }
  }
  return fromBank(level, avoid);
}
