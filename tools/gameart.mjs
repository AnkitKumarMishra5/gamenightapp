// Game Night — © 2026 Ankit Kumar Mishra. All rights reserved. See LICENSE.
// Prepares the per-game key art in source-assets/ for the shelf, the lobby and the
// rules sheet.
//
//   npm run gameart
//
// Each <game-id>.png becomes a 1200px-wide WebP (plus a JPEG fallback). The art is
// composited with a screen blend, so the pure black these are shot on drops out on its
// own — no cutout, and dark hair keeps its soft edge instead of being clipped.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'source-assets');
const OUT = path.join(ROOT, 'public', 'media', 'art');
const WIDTH = 1200;

// Source filename → the game id in the registry.
const ART = {
  // Per-game key art: the shelf, the lobby picker, the rules sheet.
  'blend-in': 'blendin',
  'island-rules': 'island',
  'silent-order': 'silentorder',
  'swap-or-stay': 'swaporstay',
  sleepless: 'sleepless',
  // Shared scenes, used by whichever screen needs them.
  'empty-lobby': 'lobby',
  'night-falls': 'night',
  'vote-out': 'vote',
  eliminated: 'eliminated',
  'room-code-invite': 'invite',
  'clue-given': 'clue',
  'pattern-cracked': 'cracked',
  shuffling: 'shuffling',
  'sentinel-block': 'sentinel',
  'room-fills-up': 'joined',
  'thinking-waiting': 'waiting',
  tie: 'tie',
  'last-two': 'lasttwo',
  reconnecting: 'reconnecting',
  // Sleepless dawns and verdicts — one motif, four outcomes.
  killed: 'dawn-killed',
  'attacked-but-safe': 'dawn-saved',
  'innocent-voted-out': 'out-innocent',
  'prowler-voted-out': 'out-prowler',
  // Blend In verdicts — the circle of light, three outcomes.
  'insider-voted-out': 'out-insider',
  'outsider-voted-out': 'out-outsider',
  'blank-voted-out': 'out-blank',
  'blank-guessing': 'blank-guess',
  // Silent Order lives.
  'life-lost': 'life-lost',
  'life-earned': 'life-earned',
  // The rest.
  'pattern-written': 'pattern-written',
  'swap-or-stay-reveal': 'ss-reveal',
  // Per-game ending art: every game's finale is its own moment, so there is no
  // shared fallback left to keep.
  'win-sleepless-village': 'win-sleepless-village',
  'win-sleepless-prowler': 'win-sleepless-prowler',
  'win-silentorder-held': 'win-silentorder-held',
  'win-silentorder-broke': 'win-silentorder-broke',
  'win-island-cracked': 'win-island-cracked',
  'win-blendin-insiders': 'win-blendin-insiders',
  'win-blendin-outsiders': 'win-blendin-outsiders',
  'win-blendin-blank': 'win-blendin-blank',
  'win-swaporstay-last': 'win-swaporstay-last',
  // Sleepless role cards — portrait faces for the dealt card, the reveals and the
  // end-of-game roster minis.
  prowler: 'role-prowler',
  medic: 'role-medic',
  sleeper: 'role-sleeper',
  // Island's core loop, and the rest.
  'island-item-accepted': 'item-yes',
  'island-item-rejected': 'item-no',
  'island-boat-re-read': 'audit',
  discussion: 'discussion',
  'swap-or-stay-losing-a-heart': 'heart-lost',
};

// Art is filed by what it is for, in source-assets/ and in public/media/art/ alike, so
// a folder listing reads like the game rather than like a dump.
const GROUP = {
  'audit': 'moments',
  'blank-guess': 'moments',
  'blendin': 'games',
  'clue': 'moments',
  'cracked': 'moments',
  'dawn-killed': 'moments',
  'dawn-saved': 'moments',
  'discussion': 'moments',
  'eliminated': 'moments',
  'heart-lost': 'moments',
  'invite': 'room',
  'island': 'games',
  'item-no': 'moments',
  'item-yes': 'moments',
  'joined': 'room',
  'lasttwo': 'moments',
  'life-earned': 'moments',
  'life-lost': 'moments',
  'lobby': 'room',
  'night': 'moments',
  'out-blank': 'moments',
  'out-innocent': 'moments',
  'out-insider': 'moments',
  'out-outsider': 'moments',
  'out-prowler': 'moments',
  'pattern-written': 'moments',
  'reconnecting': 'room',
  'role-medic': 'roles',
  'role-prowler': 'roles',
  'role-sleeper': 'roles',
  'sentinel': 'moments',
  'shuffling': 'moments',
  'silentorder': 'games',
  'sleepless': 'games',
  'ss-reveal': 'moments',
  'swaporstay': 'games',
  'tie': 'moments',
  'vote': 'moments',
  'waiting': 'room',
  'win-island-cracked': 'endings',
  'win-silentorder-broke': 'endings',
  'win-silentorder-held': 'endings',
  'win-sleepless-prowler': 'endings',
  'win-sleepless-village': 'endings',
  'win-swaporstay-last': 'endings',
  'win-blendin-insiders': 'endings',
  'win-blendin-outsiders': 'endings',
  'win-blendin-blank': 'endings',
};

const kb = (p) => `${(fs.statSync(p).size / 1024).toFixed(0)} KB`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let made = 0;

  for (const [stem, id] of Object.entries(ART)) {
    const group = GROUP[id] || 'moments';
    const src = ['.png', '.jpg', '.jpeg', '.webp']
      .flatMap((ext) => [path.join(SOURCE, group, stem + ext), path.join(SOURCE, stem + ext)])
      .find((p) => fs.existsSync(p));
    if (!src) {
      console.warn(`  · no ${stem}.png in source-assets/, skipping ${id}`);
      continue;
    }

    fs.mkdirSync(path.join(OUT, group), { recursive: true });
    const jpg = path.join(OUT, group, `${id}.jpg`);
    const webp = path.join(OUT, group, `${id}.webp`);
    const tmp = path.join(os.tmpdir(), `gn-art-${id}-${Date.now()}${path.extname(src)}`);
    fs.copyFileSync(src, tmp);
    await run('sips', ['-Z', String(WIDTH), tmp]);
    await run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '72', tmp, '--out', jpg]);
    try {
      await run('cwebp', ['-q', '76', '-m', '6', jpg, '-o', webp]);
    } catch {
      console.warn('  ! cwebp unavailable — JPEG only for this one');
    }
    fs.rmSync(tmp, { force: true });
    made += 1;
    console.log(`  ✓ ${path.basename(src)} → ${group}/${id} (${fs.existsSync(webp) ? kb(webp) : kb(jpg)})`);
  }

  console.log(`\n${made} game image${made === 1 ? '' : 's'} ready.`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
