// Game Night — © 2026 Ankit Kumar Mishra. All rights reserved. See LICENSE.
// Deterministic rule engine for The Island.
//
// A large share of patterns, from the bank and from the AI alike, are pure spelling
// rules: "contains the letter Q", "exactly five letters", "no letter E". Those are
// decidable in code, exactly and every time. Asking a language model instead is how a
// round ends up rejecting QUEST for a pattern about the letter Q.
//
// So: whenever a rule can be decided here, it is, and the model is never consulted. The
// model keeps the rules code genuinely cannot settle, which are the ones about sound,
// meaning and category (rhymes, syllables, homophones, "things that can break").
//
// The parser is deliberately strict. Recognising a rule wrongly is far worse than not
// recognising it, because a wrong local verdict is confidently wrong with no way for a
// player to appeal. Anything unfamiliar returns null and falls through to the model.

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

// Matches a spoken list of single letters: "Q", "Q or Z", "Q, X, or Z", "A, E, I, O, U".
// Each letter must be followed by a word boundary, so the "o" of "or" is never mistaken
// for a letter in the list. That exact bug turned "contains Q, X or Z" into
// "contains Q, X or O", which then rejected ZEBRA.
const LETTER_LIST = '((?:[A-Za-z]\\b[\\s,]*(?:or\\s+|and\\s+)?)+)';

// Letters only, lower case. Multi-word items count as their letters joined, which is what
// every bank description says to do ("ignore spaces for multi-word items").
const letters = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '');

const countVowels = (w) => [...w].filter((c) => VOWELS.has(c)).length;

const NUMBER_WORDS = ['one', 'two', 'six', 'ten', 'nine'];
const LEFT_HAND_QWERTY = new Set([...'qwertasdfgzxcvb']);

const WORD_NUMBER = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};
const asNumber = (token) => {
  const t = String(token || '').toLowerCase();
  return WORD_NUMBER[t] ?? (/^\d+$/.test(t) ? Number(t) : null);
};

// Pull the letters out of a phrase like "Q, X, or Z" or "A-N-T" or "A, E, I, O, U".
function letterList(text) {
  const found = String(text || '').toUpperCase().match(/\b[A-Z]\b/g) || [];
  return [...new Set(found.map((c) => c.toLowerCase()))];
}

// ---------------------------------------------------------------------------
// The recognisers, tried in order. First match wins, so the more specific
// phrasings come before the looser ones.
// ---------------------------------------------------------------------------
const RECOGNISERS = [
  // "contains no letter E", "must not contain the letter E", "without the letter E"
  {
    id: 'excludes-letters',
    match: (t) => t.match(new RegExp(`(?:contains? no|no letter|without (?:the )?letters?|must not contain|never contains?|free of)\\s+(?:the )?letters?\\s*${LETTER_LIST}`, 'i'))
      || t.match(/contains? no\s+([a-z])\b/i),
    build: (m) => {
      const set = letterList(m[1]);
      if (!set.length) return null;
      return (w) => set.every((c) => !w.includes(c));
    },
  },

  // "contains at least one of the letters Q, X or Z", "contains the letter Q anywhere"
  {
    id: 'contains-letters',
    match: (t) => t.match(new RegExp(`contains?(?:\\s+at least one of)?\\s+(?:the\\s+)?letters?\\s*${LETTER_LIST}`, 'i'))
      || t.match(new RegExp(`(?:has|includes?|features?)\\s+(?:the\\s+)?letters?\\s*${LETTER_LIST}`, 'i')),
    build: (m, t) => {
      const set = letterList(m[1]);
      if (!set.length) return null;
      // "at least one of" and a list joined by "or" mean any; an "and" list means all.
      const any = /at least one|any (?:one )?of|either/i.test(t) || /\bor\b/i.test(m[1]);
      return (w) => (any ? set.some((c) => w.includes(c)) : set.every((c) => w.includes(c)));
    },
  },

  // "contains the consecutive letters A-N-T", "contains ANT somewhere in its spelling"
  {
    id: 'contains-substring',
    match: (t) => t.match(/consecutive letters\s+([A-Za-z](?:\s*-\s*[A-Za-z]){1,})/),
    build: (m) => {
      const sub = m[1].toLowerCase().replace(/[^a-z]/g, '');
      if (sub.length < 2) return null;
      return (w) => w.includes(sub);
    },
  },

  // "contains a number word hidden inside it: ONE, TWO, SIX, TEN or NINE"
  {
    id: 'hidden-number-word',
    match: (t) => (/number word/i.test(t) && /consecutive letters/i.test(t) ? [t] : null),
    build: () => (w) => NUMBER_WORDS.some((n) => w.includes(n)),
  },

  // "begins and ends with the same letter"
  {
    id: 'bookend',
    match: (t) => (/(?:begins?|starts?) and ends? with the same letter/i.test(t) ? [t] : null),
    build: () => (w) => w.length >= 2 && w[0] === w[w.length - 1],
  },

  // "begins with the letter S", "starts with a T"
  {
    id: 'starts-with',
    match: (t) => t.match(/(?:begins?|starts?) with (?:the |a |an )?letter\s+([a-z])\b/i)
      || t.match(/(?:begins?|starts?) with (?:the |a |an )?([a-z])\b(?!\w)/i),
    build: (m) => {
      const c = m[1].toLowerCase();
      return (w) => w.startsWith(c);
    },
  },

  // "ends with the letter E"
  {
    id: 'ends-with',
    match: (t) => t.match(/ends? (?:in|with) (?:the |a |an )?letter\s+([a-z])\b/i)
      || t.match(/ends? (?:in|with) (?:the |a |an )?([a-z])\b(?!\w)/i),
    build: (m) => {
      const c = m[1].toLowerCase();
      return (w) => w.endsWith(c);
    },
  },

  // "contains the same letter twice in a row"
  {
    id: 'double-letter',
    match: (t) => (/same letter twice in a row|doubled? (?:adjacent )?letters?|two identical letters in a row/i.test(t) ? [t] : null),
    build: () => (w) => /(.)\1/.test(w),
  },

  // "some single letter appears at least three times"
  {
    id: 'triple-letter',
    match: (t) => t.match(/(?:letter appears?|appears?)\s+at least\s+(three|four|\d+)\s+times/i),
    build: (m) => {
      const n = asNumber(m[1]) ?? 3;
      return (w) => {
        const counts = {};
        for (const c of w) counts[c] = (counts[c] || 0) + 1;
        return Object.values(counts).some((k) => k >= n);
      };
    },
  },

  // "no letter appears more than once", "every letter is unique"
  {
    id: 'unique-letters',
    match: (t) => (/no letter appears more than once|every letter is unique|no repeated letters|letters are all different/i.test(t) ? [t] : null),
    build: () => (w) => new Set(w).size === w.length,
  },

  // "spelled with exactly five letters", "exactly 5 letters long"
  {
    id: 'exact-length',
    match: (t) => t.match(/exactly\s+(one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+letters/i),
    build: (m) => {
      const n = asNumber(m[1]);
      return n ? (w) => w.length === n : null;
    },
  },

  // "contains exactly one vowel letter", "exactly two vowels"
  {
    id: 'exact-vowels',
    match: (t) => t.match(/exactly\s+(one|two|three|four|five|\d+)\s+vowels?/i),
    build: (m) => {
      const n = asNumber(m[1]);
      return n === null ? null : (w) => countVowels(w) === n;
    },
  },

  // "more vowel letters than consonant letters"
  {
    id: 'vowel-heavy',
    match: (t) => (/more vowels?(?: letters?)? than consonants?/i.test(t) ? [t] : null),
    build: () => (w) => countVowels(w) > w.length - countVowels(w),
  },

  // "uses only letters found in the word ISLAND"
  {
    id: 'letter-subset',
    match: (t) => t.match(/only (?:the )?letters (?:found |present )?in (?:the word )?([A-Z]{3,})/)
      || t.match(/uses only letters from (?:the word )?([A-Z]{3,})/),
    build: (m) => {
      const allowed = new Set(m[1].toLowerCase());
      return (w) => w.length > 0 && [...w].every((c) => allowed.has(c));
    },
  },

  // "typed entirely with the left hand on a QWERTY keyboard"
  {
    id: 'left-hand-qwerty',
    match: (t) => (/left hand on a qwerty|typed entirely with the left hand/i.test(t) ? [t] : null),
    build: () => (w) => w.length > 0 && [...w].every((c) => LEFT_HAND_QWERTY.has(c)),
  },

  // "is a palindrome"
  {
    id: 'palindrome',
    match: (t) => (/palindrome|same forwards and backwards/i.test(t) ? [t] : null),
    build: () => (w) => w.length >= 3 && w === [...w].reverse().join(''),
  },

  // "each letter is the same as or later in the alphabet than the one before"
  {
    id: 'alphabetical',
    match: (t) => (/later in the alphabet than the letter before|letters are in alphabetical order/i.test(t) ? [t] : null),
    build: () => (w) => {
      for (let i = 1; i < w.length; i += 1) if (w[i] < w[i - 1]) return false;
      return w.length > 0;
    },
  },

  // "strictly alternates consonant, vowel, consonant, vowel"
  {
    id: 'alternating',
    match: (t) => (/alternates? consonant,? vowel|strictly alternates/i.test(t) ? [t] : null),
    build: () => (w) => {
      if (w.length < 2) return false;
      for (let i = 1; i < w.length; i += 1) {
        if (VOWELS.has(w[i]) === VOWELS.has(w[i - 1])) return false;
      }
      return true;
    },
  },
];

// A rule that depends on what came before cannot be judged from the item alone, so it
// must never be intercepted here even though it is spelling-based.
const STATEFUL = /chain rule|than the previous|most recently accepted|previous accepted item/i;

// Sound, meaning and category rules stay with the model. Listed explicitly because some
// of them mention letters in passing and would otherwise trip a recogniser.
const NOT_MECHANICAL = /pronounc|spoken aloud|syllab|rhym|homophone|silent|sound|hidden animal|anagram|beheadab|by ear|real english word|is alive|edible/i;

/**
 * Returns a decider for this pattern, or null when it needs the model.
 * @returns {{ id: string, test: (item: string) => boolean } | null}
 */
export function mechanicalRule(pattern) {
  const text = `${pattern?.name || ''}. ${pattern?.description || ''}`;
  if (!text.trim()) return null;
  if (STATEFUL.test(text) || NOT_MECHANICAL.test(text)) return null;

  for (const r of RECOGNISERS) {
    const m = r.match(text);
    if (!m) continue;
    const fn = r.build(m, text);
    if (typeof fn !== 'function') continue;
    return {
      id: r.id,
      test: (item) => {
        const w = letters(item);
        if (!w) return false;
        try { return Boolean(fn(w)); } catch { return false; }
      },
    };
  }
  return null;
}
