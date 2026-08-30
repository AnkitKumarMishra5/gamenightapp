// Game Night — © 2026 Ankit Kumar Mishra. All rights reserved. See LICENSE.
// Prepares every backdrop in source-assets/ for the landing page.
//
//   npm run backdrop
//
// Each image becomes a 1920px-wide WebP (plus a JPEG fallback); videos are copied as-is.
// The originals are NOT served — dropping a file into source-assets/ does nothing until
// this runs. Output is numbered so the page can rotate through them.
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'source-assets');
const MEDIA = path.join(ROOT, 'public', 'media');
const WIDTH = 1920;

const IMAGE_RE = /\.(png|jpe?g|webp)$/i;
const VIDEO_RE = /\.(mp4|webm|mov)$/i;
// Only the friend photos are backdrops. Everything else in source-assets/ is game and
// scene art, handled by `npm run gameart`, and must never end up behind the landing page.
const BACKDROP_RE = /^friends-/i;

const kb = (p) => `${(fs.statSync(p).size / 1024).toFixed(0)} KB`;

async function main() {
  if (!fs.existsSync(SOURCE)) throw new Error(`No source-assets/ directory at ${SOURCE}`);
  fs.mkdirSync(MEDIA, { recursive: true });

  // Sorted by name so the rotation order is predictable and you can control it by
  // renaming (friends-1, friends-2, …).
  const files = fs.readdirSync(SOURCE)
    .filter((f) => BACKDROP_RE.test(f))
    .filter((f) => IMAGE_RE.test(f) || VIDEO_RE.test(f))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (!files.length) {
    console.error('No friends-*.{png,jpg,mp4} in source-assets/. Add some and run this again.');
    process.exit(1);
  }

  // Clear previously generated files so removing a source removes it from the rotation.
  for (const f of fs.readdirSync(MEDIA)) {
    if (/^(backdrop-\d+|bg|bg-people)\./.test(f)) fs.rmSync(path.join(MEDIA, f), { force: true });
  }

  const manifest = [];
  let index = 0;

  for (const file of files) {
    const src = path.join(SOURCE, file);
    index += 1;
    const stem = `backdrop-${index}`;

    if (VIDEO_RE.test(file)) {
      // No re-encode: ffmpeg is not a dependency here, and these are already small.
      const ext = path.extname(file).toLowerCase() === '.webm' ? '.webm' : '.mp4';
      const out = path.join(MEDIA, stem + ext);
      fs.copyFileSync(src, out);
      const size = fs.statSync(out).size;
      manifest.push({ kind: 'video', src: `/media/${stem}${ext}`, people: true });
      console.log(`  ✓ ${file} → ${stem}${ext} (${kb(out)})`);
      if (size > 5 * 1024 * 1024) {
        console.warn(`  ! ${stem}${ext} is ${(size / 1024 / 1024).toFixed(1)} MB — consider compressing it`);
      }
      continue;
    }

    const jpg = path.join(MEDIA, `${stem}.jpg`);
    const webp = path.join(MEDIA, `${stem}.webp`);
    const tmp = path.join(os.tmpdir(), `gn-backdrop-${Date.now()}-${index}${path.extname(file)}`);
    fs.copyFileSync(src, tmp);
    await run('sips', ['-Z', String(WIDTH), tmp]);
    await run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '68', tmp, '--out', jpg]);
    try {
      await run('cwebp', ['-q', '72', '-m', '6', jpg, '-o', webp]);
    } catch {
      console.warn('  ! cwebp unavailable — JPEG only for this one');
    }
    fs.rmSync(tmp, { force: true });

    manifest.push({
      kind: 'image',
      src: `/media/${stem}${fs.existsSync(webp) ? '.webp' : '.jpg'}`,
      fallback: `/media/${stem}.jpg`,
      people: true,
    });
    console.log(`  ✓ ${file} → ${stem} (${fs.existsSync(webp) ? kb(webp) : kb(jpg)})`);
  }

  fs.writeFileSync(path.join(MEDIA, 'backdrops.json'), JSON.stringify(manifest, null, 2));
  const total = manifest.length;
  console.log(`\n${total} backdrop${total === 1 ? '' : 's'} ready — the page rotates through them.`);
  console.log('Rename the sources (friends-1, friends-2, …) to change the order.');
}

main().catch((err) => {
  console.error('\n✗', err.message);
  process.exit(1);
});
