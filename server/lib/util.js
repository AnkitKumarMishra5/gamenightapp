import crypto from 'node:crypto';

export function randomId(len = 16) {
  return crypto.randomBytes(len).toString('base64url').slice(0, len);
}

// Unambiguous alphabet: no O/0, I/1, etc.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function roomCode(len = 5) {
  let out = '';
  const bytes = crypto.randomBytes(len);
  for (let i = 0; i < len; i++) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

export function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pick(arr) {
  if (!arr || arr.length === 0) return undefined;
  return arr[crypto.randomInt(arr.length)];
}

// Normalize user text for comparisons: lowercase, trim, collapse spaces, strip accents & punctuation.
export function normalize(s) {
  return String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function levenshtein(a, b) {
  a = normalize(a); b = normalize(b);
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[n];
}

// Forgiving word match: exact after normalization, or 1 typo on words longer than 4 chars.
export function wordsMatch(a, b) {
  const na = normalize(a), nb = normalize(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (Math.min(na.length, nb.length) > 4) return levenshtein(na, nb) <= 1;
  return false;
}

export function cleanText(s, maxLen = 60) {
  return String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

// Error whose message is safe to show to the player.
export class GameError extends Error {
  constructor(message) {
    super(message);
    this.isGameError = true;
  }
}
