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
const OUT = path.join(ROOT, 'public', 'media', 'games');
const WIDTH = 1200;

// Source filename → the game id in the registry.
const ART = {
  'blend-in': 'blendin',
  'island-rules': 'island',
  'silent-order': 'silentorder',
  'swap-or-stay': 'swaporstay',
  sleepless: 'sleepless',
};

const kb = (p) => `${(fs.statSync(p).size / 1024).toFixed(0)} KB`;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  let made = 0;

  for (const [stem, id] of Object.entries(ART)) {
    const src = ['.png', '.jpg', '.jpeg', '.webp']
      .map((ext) => path.join(SOURCE, stem + ext))
      .find((p) => fs.existsSync(p));
    if (!src) {
      console.warn(`  · no ${stem}.png in source-assets/, skipping ${id}`);
      continue;
    }

    const jpg = path.join(OUT, `${id}.jpg`);
    const webp = path.join(OUT, `${id}.webp`);
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
    console.log(`  ✓ ${path.basename(src)} → games/${id} (${fs.existsSync(webp) ? kb(webp) : kb(jpg)})`);
  }

  console.log(`\n${made} game image${made === 1 ? '' : 's'} ready.`);
}

main().catch((err) => { console.error(err.message); process.exit(1); });
