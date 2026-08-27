// Game Night — © 2026 Ankit Kumar Mishra. All rights reserved. See LICENSE.
// Checks that a deployed URL will actually produce a link preview.
//
//   npm run og:check -- https://your-app.onrender.com
//
// Crawlers are silent when something is wrong, so this reproduces what they do: fetch the
// page as a bot, read the tags, then fetch the image and check its type and size against
// the limits that actually bite (WhatsApp drops images near 300KB).
const UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

let pass = 0;
const problems = [];

function ok(label, detail = '') {
  pass++;
  console.log(`  ✓ ${label}${detail ? ` — ${detail}` : ''}`);
}
function bad(label, detail = '', fix = '') {
  problems.push({ label, detail, fix });
  console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
}
function warn(label, detail = '') {
  console.log(`  ! ${label}${detail ? ` — ${detail}` : ''}`);
}

const metaOf = (html, prop) => {
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${prop}["']`, 'i'),
    new RegExp(`<meta[^>]+name=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return m[1];
  }
  return null;
};

async function main() {
  const raw = process.argv[2];
  if (!raw) {
    console.error('Usage: npm run og:check -- <url>');
    console.error('       npm run og:check -- https://your-app.onrender.com');
    process.exit(1);
  }
  const url = raw.startsWith('http') ? raw : `https://${raw}`;
  const origin = new URL(url).origin;
  console.log(`\nChecking ${url}\n`);

  if (/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(origin)) {
    warn('This is a local address', 'no crawler on the internet can reach it, so a shared link will never preview');
  }

  // ---- 1. the page itself ----
  console.log('Page');
  let html;
  const started = Date.now();
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA }, redirect: 'follow' });
    const took = Date.now() - started;
    if (!res.ok) return bad('page responded', `HTTP ${res.status}`) ?? summary();
    html = await res.text();
    ok('page fetched as a crawler', `HTTP ${res.status} in ${took} ms`);
    if (took > 5000) {
      warn('slow response', `${took} ms — crawlers time out quickly; a sleeping free instance is a common cause`);
    }
    const headEnd = html.indexOf('</head>');
    if (headEnd > 300_000) bad('<head> is beyond 300KB into the document', 'crawlers stop reading before it');
    else ok('tags are early in the document');
  } catch (err) {
    bad('page could not be fetched', err.message, 'Is the site deployed and public?');
    return summary();
  }

  // ---- 2. the tags ----
  console.log('\nTags');
  const tags = {
    'og:title': metaOf(html, 'og:title'),
    'og:description': metaOf(html, 'og:description'),
    'og:image': metaOf(html, 'og:image'),
    'og:url': metaOf(html, 'og:url'),
    'og:type': metaOf(html, 'og:type'),
    'og:site_name': metaOf(html, 'og:site_name'),
    'twitter:card': metaOf(html, 'twitter:card'),
  };
  for (const [name, value] of Object.entries(tags)) {
    if (value) ok(name, value.length > 70 ? `${value.slice(0, 67)}…` : value);
    else bad(`${name} is missing`);
  }

  const devNamed = /Ankit Kumar Mishra/.test(html);
  if (devNamed) ok('developer name present in the page metadata');
  else warn('developer name not found in the metadata');
  if (/application\/ld\+json/.test(html)) ok('structured data (JSON-LD) present');
  else warn('no JSON-LD', 'optional, but it is how search engines attribute the author');

  // ---- 3. absolute URLs ----
  console.log('\nURLs');
  for (const key of ['og:image', 'og:url']) {
    const v = tags[key];
    if (!v) continue;
    if (/^https?:\/\//i.test(v)) {
      ok(`${key} is absolute`);
      if (v.includes('%ORIGIN%')) bad(`${key} still contains the %ORIGIN% placeholder`, v, 'The server is not substituting it — is it serving public/index.html statically?');
      if (v.includes('localhost')) bad(`${key} points at localhost`, v, 'Set PUBLIC_URL on the host, or check x-forwarded-host is passed through.');
      if (origin.startsWith('https://') && v.startsWith('http://')) {
        bad(`${key} is http:// on an https:// site`, v, 'Mixed content: crawlers often reject this.');
      }
    } else {
      bad(`${key} is relative`, v, 'Crawlers require absolute URLs.');
    }
  }

  // ---- 4. the image ----
  console.log('\nImage');
  if (tags['og:image']) {
    try {
      const res = await fetch(tags['og:image'], { headers: { 'User-Agent': UA } });
      if (!res.ok) {
        bad('image not reachable', `HTTP ${res.status}`, 'It must be publicly readable with no auth.');
      } else {
        const buf = Buffer.from(await res.arrayBuffer());
        const kb = buf.length / 1024;
        const type = res.headers.get('content-type') || 'unknown';
        ok('image reachable', `${type}, ${kb.toFixed(0)} KB`);

        if (/svg/i.test(type)) bad('image is SVG', type, 'WhatsApp ignores SVG entirely. Use JPEG or PNG.');
        else if (!/jpeg|jpg|png|webp/i.test(type)) warn('unusual image type', type);

        if (kb > 300) {
          bad('image is over ~300 KB', `${kb.toFixed(0)} KB`, 'WhatsApp silently drops previews at this size. Re-run `npm run brand` to emit the JPEG.');
        } else if (kb > 250) {
          warn('image is close to the 300 KB limit', `${kb.toFixed(0)} KB`);
        } else {
          ok('image size is comfortable for every platform');
        }

        // PNG/JPEG dimensions, read from the header.
        let w = null; let hgt = null;
        if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
          w = buf.readUInt32BE(16); hgt = buf.readUInt32BE(20);
        } else if (buf[0] === 0xff && buf[1] === 0xd8) {
          for (let i = 2; i < buf.length - 9;) {
            if (buf[i] !== 0xff) { i++; continue; }
            const marker = buf[i + 1];
            const len = buf.readUInt16BE(i + 2);
            if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
              hgt = buf.readUInt16BE(i + 5); w = buf.readUInt16BE(i + 7);
              break;
            }
            i += 2 + len;
          }
        }
        if (w && hgt) {
          ok('image dimensions', `${w}x${hgt}`);
          if (w < 300) bad('image is narrower than 300px', `${w}px`, 'Below the minimum every platform enforces.');
          const ratio = w / hgt;
          if (Math.abs(ratio - 1.91) > 0.25) warn('aspect ratio is not ~1.91:1', ratio.toFixed(2));
        }
      }
    } catch (err) {
      bad('image could not be fetched', err.message);
    }
  }

  summary();
}

function summary() {
  console.log(`\n${'='.repeat(60)}`);
  if (!problems.length) {
    console.log(`  ${pass} checks passed — this URL should preview correctly.`);
    console.log('\n  Platforms cache aggressively. If an old preview is stuck, re-scrape:');
    console.log('    Facebook/WhatsApp  https://developers.facebook.com/tools/debug/');
    console.log('    LinkedIn           https://www.linkedin.com/post-inspector/');
    console.log('    X / Twitter        https://cards-dev.twitter.com/validator');
  } else {
    console.log(`  ${pass} passed, ${problems.length} problem${problems.length > 1 ? 's' : ''}:\n`);
    for (const p of problems) {
      console.log(`  ✗ ${p.label}${p.detail ? ` — ${p.detail}` : ''}`);
      if (p.fix) console.log(`      fix: ${p.fix}`);
    }
  }
  console.log('='.repeat(60));
  process.exit(problems.length ? 1 : 0);
}

main().catch((err) => {
  console.error('\n✗', err.message);
  process.exit(1);
});
