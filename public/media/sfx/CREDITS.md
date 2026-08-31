# Sound effect credits

Two sources, and both allow commercial use in a project like this one. Neither requires
attribution; the credits below are provenance, not obligation.

A trailing `-N` marks a variant of the same sound. The app groups them by name and plays
one of them, so a sound rarely lands the same way twice. For reactions the choice is
seeded by the server, so every phone at the table hears the same clip at the same moment.

File extensions no longer track the source: clips with silent lead-ins or tails have been
trimmed (-40 dB relative threshold, short fades at the cuts) and re-encoded as AAC .m4a,
whatever format they arrived in. Provenance is as listed below, per sound.

## Pixabay

From [Pixabay](https://pixabay.com/sound-effects/) under the
[Pixabay Content License](https://pixabay.com/service/license-summary/): free for
commercial use, no attribution required. The licence does **not** permit re-offering them
as stock audio, so do not lift this folder into a sound library.

**Emoji reactions** — one pack per reaction, picked at random and heard by the whole room:

| Reaction | Files |
| --- | --- |
| 😂 laugh | `rxLaugh` ×9 — evil, high-pitch, male, mischievous, funny, hyena, "dat evil laugh", child, goofy (a 30-second laughing fit was retired) |
| 😱 shock | `rxShock` ×5 — wow, "what", "ehhh", "what are you doing", "oh my god" (the murmuring what-meme clip was retired) |
| 🔥 fire | `rxFire` ×4 — "perfect", "nailed it", child saying "awesome", a thug-life music sting (trimmed to 3s, moved over from 💀) |
| 🧐 doubt | `rxDoubt` ×3 — "that's a lie", bruh 2, an unprintable one |
| 💀 dead | `rxDead` ×2 — vine boom (by Fzst, Pixabay 162668), musical stab F# (by BRVHRTZ, Pixabay 224599) |
| 🤔 thinking | `rxThink` ×2 — two "hmm"s |
| 😭 crying | `rxCry` ×1 — baby crying (by DRAGON-STUDIO, Pixabay 463213; cut to 2.3s) |

**Everywhere else** — `laughTrack` ×6, `wow` ×3, `evilLaugh` ×2, `fail` ×2, `dun` ×2,
`ding` ×2, `aww` ×2, `bellToll` ×2, `clang` ×2, `rooster` ×2, `bonk` ×2, `buzzer` ×2,
`yeet` ×2, `winInsiders` ×2, `winOutsiders` ×2, `recordScratch` ×2, `sparkle` ×2,
`coin`, `kaching`.

`indian/` is a separate flavour pack (`dhol` ×2). To extend it, or retire it for a global
audience, add or remove files in that folder: ids come from filenames, `-N` suffixes are
variants, and `INDIAN_SFX` in `public/js/core/memes.js` is the only code that names it.

## Red Library

CC0 / public domain recordings from the Red Library sound-effect collection on the
Internet Archive, under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/):
<https://archive.org/details/Red_Library_Crowds_Applause> and sibling items. CC0 waives
all rights, so these can be used, modified and redistributed with no conditions.

| File | Source recording | Collection |
| --- | --- | --- |
| `applause.m4a` | Large Crowd Applauding | Crowds Applause |
| `cheer-2.m4a` | Small Crowd Cheering | Crowds Indoor 2 |
| `boo.m4a` | Large Crowd Booing and Cheering | Crowds Sports |
| `boo-2.m4a` | Chorus of Boos | Crowds Indoor 2 |
| `boo-3.m4a` | Up Close Boos | Crowds Indoor 2 |
| `boo-4.m4a` | Boos, Clapping and Whistling | Crowds Indoor 2 |
| `gasp.m4a` | Crowd Reaction | Crowds Indoor 1 |
| `gasp-2.m4a` | Small Crowd Gasps | Crowds Indoor 2 |
| `gasp-3.m4a` | Crowd Murmurs and Gasps in Courtroom | Crowds Indoor 2 |
| `gasp-4.m4a` | Excited Screams | Crowds Indoor 2 |
| `crickets.m4a` | Crisp Crickets | Animals Misc |
| `crickets-2.m4a` | Two Competing Crickets | Animals Misc |
| `crickets-3.m4a` | Wall of Crickets | Animals Misc |
| `crickets-4.m4a` | High Chirping Crickets | Animals Misc |
| `drumroll.m4a` | Snare Drum Roll | Music |
| `suspense.m4a` | Chinese Gong Crescendo | Music |
| `suspense-2.m4a` | Short Impact Sweeteners | Impacts |
| `suspense-3.m4a` | Fast Bongo Drum | Music |
| `boom.m4a` | Gong Hit | Music |
| `boom-2.m4a` | Booming Blast | Explosions |
| `boom-3.m4a` | Huge Explosion with Long Decay | Explosions |
| `boom-4.m4a` | Huge Drum or Fantasy Footsteps | Sci-Fi |
| `buzzer.m4a` | Apartment Buzzer | Bells, Horns & Whistles |
| `sadTrombone.m4a` | Slide Whistle | Bells, Horns & Whistles |
| `rimshot.m4a` | Snare Drum | Music |
| `airhorn.m4a` | Long Car Horn Blast | Bells, Horns & Whistles |
| `airhorn-2.m4a` | Old Car Ahooga Horn | Bells, Horns & Whistles |
| `airhorn-3.m4a` | Steam Whistle | Bells, Horns & Whistles |

A handful of spoken one-liners in this folder came from Pixabay rather than the archive,
under the same Pixabay licence as above: `boom-5` and `boom-6` (thuds), `gasp-5` and
`gasp-6`, `suspense-4` and `suspense-5`, `levelUp` and `levelUp-2`, `applause-2`,
`emotionalDamage-2`, `airhorn-4` (goofy car horn), `bruh` and `bruh-2`.

Every `.m4a` here was cut to its loudest window (or to its attack, for hits), normalised
to about −1 dBFS, faded at both edges and encoded to 64 kbps mono AAC. Files are fetched
lazily the first time a sound plays, and every recording is loudness-matched again at
playback so nothing blasts and nothing disappears.

Everything else in the app is synthesized in the browser by `public/js/core/memes.js` and
ships no audio at all.
