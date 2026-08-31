// Renders every brand asset from a single source of truth, so the logo is pixel-identical
// across the favicon, the installed-app icons and the link-preview card.
//
//   source: public/icons/logo.svg           -> favicons + icon-180/192/512 + maskable
//   source: source-assets/ankitkumarmishra.{jpg,png,...} -> icons/author-48/96/192.png (author avatar)
//   source: tools/og-preview.html           -> icons/og-image.jpg (1200x630, <300KB)
//
// Run: npm run brand   (needs the local server running and Google Chrome installed;
// the generated PNGs are committed, so deploys never need Chrome.)
import { execFile } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public', 'icons');
const PORT = process.env.PORT || 3456;
const ORIGIN = `http://localhost:${PORT}`;

const CHROME_CANDIDATES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

function findChrome() {
  const fromEnv = process.env.CHROME_PATH;
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;
  const found = CHROME_CANDIDATES.find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error('Chrome not found. Install Google Chrome or set CHROME_PATH=/path/to/chrome');
  }
  return found;
}

async function shoot(chrome, { html, url, width, height, out, transparent }) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'gn-brand-'));
  const target = url || `file://${path.join(tmpDir, 'page.html')}`;
  if (html) fs.writeFileSync(path.join(tmpDir, 'page.html'), html);

  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--window-size=${width},${height}`,
    `--screenshot=${out}`,
    ...(transparent ? ['--default-background-color=00000000'] : []),
    target,
  ];
  await run(chrome, args, { timeout: 60_000 });
  fs.rmSync(tmpDir, { recursive: true, force: true });
  const { size } = fs.statSync(out);
  console.log(`  ✓ ${path.basename(out)} (${width}x${height}, ${(size / 1024).toFixed(1)} KB)`);
}

// The logo is a rounded badge already, so "any" icons render it edge to edge while
// maskable icons sit inside the 80% safe zone Android crops to.
function logoPage(size, { maskable }) {
  const pad = maskable ? Math.round(size * 0.12) : 0;
  const inner = size - pad * 2;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden}
    body{display:flex;align-items:center;justify-content:center;
      ${maskable ? 'background:#11152b;' : 'background:transparent;'}}
    img{width:${inner}px;height:${inner}px;display:block}
  </style></head><body><img src="${ORIGIN}/icons/logo.svg"></body></html>`;
}

// The author photo ships at 960x960 / 1.3 MB, which is absurd for a 40px avatar, so
// derive small square crops the UI can actually afford to load.
function avatarPage(size, srcPath) {
  // Read straight off disk: the original lives outside public/ so it is never served.
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;width:${size}px;height:${size}px;overflow:hidden;background:transparent}
    img{width:${size}px;height:${size}px;object-fit:cover;display:block}
  </style></head><body><img src="file://${srcPath}"></body></html>`;
}

async function main() {
  const chrome = findChrome();
  console.log(`Chrome: ${chrome}`);

  // Fail early with a clear message rather than emitting blank artwork.
  try {
    const res = await fetch(`${ORIGIN}/icons/logo.svg`);
    if (!res.ok) throw new Error(String(res.status));
  } catch {
    throw new Error(`Cannot reach ${ORIGIN}. Start the server first: npm start`);
  }

  fs.mkdirSync(OUT, { recursive: true });

  console.log('App icons:');
  for (const [name, size, maskable] of [
    ['favicon-16.png', 16, false],
    ['favicon-32.png', 32, false],
    ['favicon-48.png', 48, false],
    ['icon-192.png', 192, false],
    ['icon-512.png', 512, false],
    ['icon-180.png', 180, true],            // apple-touch looks best opaque
    ['icon-maskable-512.png', 512, true],
  ]) {
    await shoot(chrome, {
      html: logoPage(size, { maskable }),
      width: size, height: size,
      out: path.join(OUT, name),
      transparent: !maskable,
    });
  }

  // Skipped silently if the source photo isn't there, so the script still works for
  // anyone who clones the repo without it. Any common image format will do — the photo
  // gets re-rendered into the PNG icons regardless.
  const authorSrc = ['.jpg', '.jpeg', '.png', '.webp']
    .map((ext) => path.join(ROOT, 'source-assets', `ankitkumarmishra${ext}`))
    .find((p) => fs.existsSync(p));
  if (authorSrc) {
    console.log('Author avatar:');
    for (const [name, size] of [['author-48.png', 48], ['author-96.png', 96], ['author-192.png', 192]]) {
      await shoot(chrome, {
        html: avatarPage(size, authorSrc),
        width: size, height: size,
        out: path.join(OUT, name),
        transparent: false,
      });
    }
  } else {
    console.log('Author avatar: skipped (no source-assets/ankitkumarmishra image found)');
  }

  console.log('Link preview:');
  // Chrome only screenshots PNG, but a 1200x630 PNG lands around 300KB and WhatsApp
  // silently drops previews near that size — so convert to JPEG and ship that.
  const ogPng = path.join(OUT, 'og-image.png');
  const ogJpg = path.join(OUT, 'og-image.jpg');
  // The card lives in tools/, not public/, so the deployed app has no stray page in it.
  // A <base> tag points its relative asset URLs back at the running dev server.
  const ogHtml = fs.readFileSync(path.join(ROOT, 'tools', 'og-preview.html'), 'utf8')
    .replace('<head>', `<head><base href="${ORIGIN}/">`);
  await shoot(chrome, {
    html: ogHtml,
    width: 1200, height: 630,
    out: ogPng,
    transparent: false,
  });
  await run('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '78', ogPng, '--out', ogJpg]);
  fs.rmSync(ogPng, { force: true });
  const ogKb = fs.statSync(ogJpg).size / 1024;
  console.log(`  ✓ og-image.jpg (1200x630, ${ogKb.toFixed(0)} KB)`);
  if (ogKb > 280) {
    console.warn(`  ! ${ogKb.toFixed(0)} KB is close to WhatsApp's ~300 KB cut-off — lower formatOptions.`);
  }

  console.log('\nDone. Commit the PNGs so hosting never needs Chrome.');
}

main().catch((err) => {
  console.error('\n✗', err.message);
  process.exit(1);
});
